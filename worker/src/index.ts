// Main worker router: HTTP API + WS upgrade routing to RoomDO.
// Contracts come from docs/archive/c-retry/contract.md and docs/archive/c-retry/authority.md.

import { RoomDO } from './RoomDO';
import { LobbyDO } from './LobbyDO';
import { signJwt, verifyJwt } from './jwt';
import {
  registerPlayer,
  getPlayer,
  submitScore,
  getLeaderboard,
  getAllLeaderboards,
  type GameMode,
} from './d1';

export { RoomDO, LobbyDO };

interface Env {
  ROOM_DO: DurableObjectNamespace;
  LOBBY_DO: DurableObjectNamespace;
  DB: D1Database;
  JWT_SECRET: string;
}

const ALLOWED_ORIGINS = new Set([
  'https://sheepdogsim.com',
  'https://www.sheepdogsim.com',
  'https://sds-frontend.pages.dev',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin &&
    (ALLOWED_ORIGINS.has(origin) ||
      origin.endsWith('.sds-frontend.pages.dev') ||
      origin.endsWith('.sheepdogsim.pages.dev'))
      ? origin
      : '*';
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

function err(message: string, status = 400, extra: Record<string, string> = {}): Response {
  return json({ error: message }, status, extra);
}

function lobbyStub(env: Env): DurableObjectStub {
  const id = env.LOBBY_DO.idFromName('global');
  return env.LOBBY_DO.get(id);
}

function roomStub(env: Env, roomCode: string): DurableObjectStub {
  const id = env.ROOM_DO.idFromName(roomCode.toUpperCase());
  return env.ROOM_DO.get(id);
}

async function extractToken(request: Request, env: Env, body: any): Promise<any | null> {
  const auth = request.headers.get('Authorization');
  const token = (auth?.startsWith('Bearer ') ? auth.slice(7) : body?.token) ?? null;
  if (!token) return null;
  return verifyJwt(token, env.JWT_SECRET);
}

function makeSessionId(): string {
  // 16 hex chars — ephemeral per-WS session id. Not to be confused with persistent_id.
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin);

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // --- WebSocket upgrade on /r/:code/ws ---
    const wsMatch = path.match(/^\/r\/([A-Z0-9]{3,8})\/ws$/i);
    if (wsMatch) {
      const code = wsMatch[1].toUpperCase();
      const stub = roomStub(env, code);
      // Forward with original URL so DO sees query params.
      const doUrl = new URL(url);
      doUrl.pathname = '/ws';
      return stub.fetch(new Request(doUrl.toString(), request));
    }

    // --- HTTP API ---
    try {
      if (path === '/api/register' && method === 'POST') {
        const body = await request.json<any>();
        const { persistent_id, persistentId, display_name, displayName, name_type, nameType } = body || {};
        const pid = persistent_id ?? persistentId;
        const name = display_name ?? displayName ?? 'Player';
        const nt = (name_type ?? nameType ?? 'custom') as 'custom' | 'random' | 'anonymous';
        if (!pid || typeof pid !== 'string') return err('missing persistent_id', 400, cors);

        const player = await registerPlayer(env.DB, pid, name, nt);
        const token = await signJwt({ persistent_id: pid }, env.JWT_SECRET, 86400);

        return json(
          {
            token,
            playerProfile: {
              persistent_id: player.persistent_id,
              persistentId: player.persistent_id,
              displayName: player.display_name,
              fullName: player.full_name,
              discriminator: player.discriminator,
            },
          },
          200,
          cors,
        );
      }

      if (path === '/api/lobbies' && method === 'GET') {
        const res = await lobbyStub(env).fetch(new Request('https://do/list'));
        const data = await res.json<{ lobbies: any[] }>();
        return json({ lobbies: data.lobbies || [] }, 200, cors);
      }

      if (path === '/api/rooms' && method === 'POST') {
        const body = await request.json<any>();
        const payload = await extractToken(request, env, body);
        if (!payload) return err('missing or invalid token', 401, cors);
        const pid = payload.persistent_id;
        const profile = await getPlayer(env.DB, pid);
        if (!profile) return err('player not found', 404, cors);

        const playerName = body.playerName || profile.display_name || 'Host';
        const dogType = body.dogType || 'jep';
        const roomSettings = body.roomSettings || {};

        // Allocate a unique code via LobbyDO.
        const codeRes = await lobbyStub(env).fetch(
          new Request('https://do/allocate-code', { method: 'POST', body: '{}' }),
        );
        const { roomCode } = await codeRes.json<{ roomCode: string }>();

        const sessionId = makeSessionId();
        const initRes = await roomStub(env, roomCode).fetch(
          new Request('https://do/init', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              roomCode,
              hostId: sessionId,
              hostName: playerName,
              hostDogType: dogType,
              hostPersistentId: pid,
              hostDisplayName: profile.display_name,
              roomSettings,
            }),
          }),
        );

        if (!initRes.ok) {
          const body = await initRes.text();
          return err(body || 'room init failed', initRes.status, cors);
        }

        const initBody = await initRes.json<any>();
        // Register with lobby if public.
        if (initBody.room?.isPublic) {
          await lobbyStub(env).fetch(
            new Request('https://do/register', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                roomCode: initBody.roomCode,
                hostName: playerName,
                gameMode: initBody.room.gameMode,
                // Cycle 8 Phase 5: surface scene + sheep count to lobby browsers.
                sceneId: initBody.room.sceneId,
                sheepCount: initBody.room.sheepCount,
                playerCount: initBody.room.playerCount,
                maxPlayers: initBody.room.maxPlayers,
                state: initBody.room.state,
                isPublic: true,
                updatedAt: Date.now(),
              }),
            }),
          );
        }

        return json({ ...initBody, sessionId }, 200, cors);
      }

      const joinMatch = path.match(/^\/api\/rooms\/([A-Z0-9]{3,8})\/join$/i);
      if (joinMatch && method === 'POST') {
        const code = joinMatch[1].toUpperCase();
        const body = await request.json<any>();
        const payload = await extractToken(request, env, body);
        if (!payload) return err('missing or invalid token', 401, cors);
        const pid = payload.persistent_id;
        const profile = await getPlayer(env.DB, pid);
        if (!profile) return err('player not found', 404, cors);

        const sessionId = makeSessionId();
        const joinRes = await roomStub(env, code).fetch(
          new Request('https://do/join', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              playerId: sessionId,
              playerName: body.playerName || profile.display_name || 'Player',
              dogType: body.dogType || 'jep',
              persistentId: pid,
              displayName: profile.display_name,
            }),
          }),
        );
        if (!joinRes.ok) {
          const text = await joinRes.text();
          return err(text || 'join failed', joinRes.status, cors);
        }
        const joinBody = await joinRes.json<any>();
        if (joinBody.room?.isPublic) {
          await lobbyStub(env).fetch(
            new Request('https://do/update', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                roomCode: joinBody.room.roomCode,
                hostName: joinBody.room.players.find((p: any) => p.isHost)?.name || 'Host',
                gameMode: joinBody.room.gameMode,
                sceneId: joinBody.room.sceneId,
                sheepCount: joinBody.room.sheepCount,
                playerCount: joinBody.room.playerCount,
                maxPlayers: joinBody.room.maxPlayers,
                state: joinBody.room.state,
                isPublic: true,
                updatedAt: Date.now(),
              }),
            }),
          );
        }

        return json({ ...joinBody, sessionId }, 200, cors);
      }

      if (path === '/api/rooms/quick-match' && method === 'POST') {
        const body = await request.json<any>();
        const payload = await extractToken(request, env, body);
        if (!payload) return err('missing or invalid token', 401, cors);
        const pid = payload.persistent_id;
        const profile = await getPlayer(env.DB, pid);
        if (!profile) return err('player not found', 404, cors);
        const gameMode = body.gameMode || 'cooperative';

        const matchRes = await lobbyStub(env).fetch(
          new Request('https://do/quick-match', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ gameMode }),
          }),
        );
        const { match } = await matchRes.json<any>();

        if (match) {
          // Join that room via the internal join flow.
          const sessionId = makeSessionId();
          const joinRes = await roomStub(env, match.roomCode).fetch(
            new Request('https://do/join', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                playerId: sessionId,
                playerName: body.playerName || profile.display_name || 'Player',
                dogType: body.dogType || 'jep',
                persistentId: pid,
                displayName: profile.display_name,
              }),
            }),
          );
          if (joinRes.ok) {
            const joinBody = await joinRes.json<any>();
            await lobbyStub(env).fetch(
              new Request('https://do/update', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  roomCode: joinBody.room.roomCode,
                  hostName: joinBody.room.players.find((p: any) => p.isHost)?.name || 'Host',
                  gameMode: joinBody.room.gameMode,
                  playerCount: joinBody.room.playerCount,
                  maxPlayers: joinBody.room.maxPlayers,
                  state: joinBody.room.state,
                  isPublic: true,
                  updatedAt: Date.now(),
                }),
              }),
            );
            return json({ ...joinBody, sessionId, isQuickMatch: true }, 200, cors);
          }
        }

        // No match or join failed — create a new public room.
        const codeRes = await lobbyStub(env).fetch(
          new Request('https://do/allocate-code', { method: 'POST', body: '{}' }),
        );
        const { roomCode } = await codeRes.json<{ roomCode: string }>();
        const sessionId = makeSessionId();
        const initRes = await roomStub(env, roomCode).fetch(
          new Request('https://do/init', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              roomCode,
              hostId: sessionId,
              hostName: body.playerName || profile.display_name || 'Host',
              hostDogType: body.dogType || 'jep',
              hostPersistentId: pid,
              hostDisplayName: profile.display_name,
              roomSettings: { maxPlayers: 4, isPublic: true, gameMode, name: 'Quick Match Game' },
            }),
          }),
        );
        if (!initRes.ok) return err('quick-match init failed', 500, cors);
        const initBody = await initRes.json<any>();
        await lobbyStub(env).fetch(
          new Request('https://do/register', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              roomCode: initBody.roomCode,
              hostName: body.playerName || profile.display_name || 'Host',
              gameMode: initBody.room.gameMode,
              sceneId: initBody.room.sceneId,
              sheepCount: initBody.room.sheepCount,
              playerCount: initBody.room.playerCount,
              maxPlayers: initBody.room.maxPlayers,
              state: initBody.room.state,
              isPublic: true,
              updatedAt: Date.now(),
            }),
          }),
        );
        return json({ ...initBody, sessionId, isQuickMatch: true }, 200, cors);
      }

      if (path === '/api/score' && method === 'POST') {
        const body = await request.json<any>();
        const payload = await extractToken(request, env, body);
        if (!payload) return err('missing or invalid token', 401, cors);
        const pid = payload.persistent_id;
        const gameMode = body.gameMode as GameMode;
        const score = Number(body.score);
        if (!gameMode || Number.isNaN(score)) return err('missing gameMode or score', 400, cors);
        const result = await submitScore(env.DB, pid, gameMode, score, body.additionalData || {});
        return json(
          {
            success: true,
            updated: result.updated,
            isNewRecord: result.isNewRecord,
            playerProfile: result.player,
          },
          200,
          cors,
        );
      }

      if (path === '/api/leaderboard' && method === 'GET') {
        const mode = (url.searchParams.get('mode') || 'cooperative') as GameMode;
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 10));
        // Cycle 8 Phase 3: optional partition filters.
        const sceneId = url.searchParams.get('scene') || undefined;
        const sheepCountRaw = url.searchParams.get('sheepCount');
        const sheepCount = sheepCountRaw ? Number(sheepCountRaw) : undefined;
        const entries = await getLeaderboard(env.DB, mode, limit, {
          sceneId,
          sheepCount: Number.isFinite(sheepCount) && (sheepCount as number) > 0 ? sheepCount : undefined,
        });
        return json({ entries }, 200, cors);
      }

      if (path === '/api/leaderboards' && method === 'GET') {
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 10));
        const sceneId = url.searchParams.get('scene') || undefined;
        const sheepCountRaw = url.searchParams.get('sheepCount');
        const sheepCount = sheepCountRaw ? Number(sheepCountRaw) : undefined;
        const leaderboards = await getAllLeaderboards(env.DB, limit, {
          sceneId,
          sheepCount: Number.isFinite(sheepCount) && (sheepCount as number) > 0 ? sheepCount : undefined,
        });
        return json({ leaderboards }, 200, cors);
      }

      // Cycle 11 Phase 5: lightweight client telemetry. Anonymous events
      // welcome (game_completed, mode_selected, scene_swapped); persistent_id
      // recorded when token present so we can deduplicate users without
      // gating the route on auth. Body is best-effort — failures are
      // swallowed client-side so analytics never affects gameplay UX.
      if (path === '/api/event' && method === 'POST') {
        let body: any = {};
        try { body = await request.json(); } catch {}
        const name = String(body?.name ?? '').slice(0, 64);
        if (!name) return err('event name required', 400, cors);
        const propsRaw = body?.props && typeof body.props === 'object' ? body.props : {};
        // Strip props to JSON-able primitives only; cap payload size.
        const safeProps: Record<string, string | number | boolean> = {};
        for (const k of Object.keys(propsRaw).slice(0, 16)) {
          const v = propsRaw[k];
          if (typeof v === 'string') safeProps[k] = v.slice(0, 256);
          else if (typeof v === 'number' && Number.isFinite(v)) safeProps[k] = v;
          else if (typeof v === 'boolean') safeProps[k] = v;
        }
        const propsJson = JSON.stringify(safeProps).slice(0, 2048);
        // Optional auth — present token => recognized player.
        let pid: string | null = null;
        const auth = request.headers.get('authorization') || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : (body?.token || null);
        if (token) {
          try {
            const claims = await verifyJwt(token, env.JWT_SECRET);
            pid = (claims?.sub as string) || null;
          } catch { /* invalid token: stay anonymous */ }
        }
        try {
          await env.DB.prepare(
            'INSERT INTO events (name, props, player_id) VALUES (?, ?, ?)'
          ).bind(name, propsJson, pid).run();
        } catch (e: any) {
          // Don't crash — events table may not exist yet on first deploy.
          console.warn('[event] insert failed:', e?.message);
        }
        return json({ ok: true }, 200, cors);
      }

      if (path === '/' || path === '/healthz') {
        return json({ ok: true, worker: 'sds-worker' }, 200, cors);
      }

      return err('not found', 404, cors);
    } catch (e: any) {
      console.error('worker error:', e?.stack || e);
      return err(e?.message || 'internal error', 500, cors);
    }
  },
};
