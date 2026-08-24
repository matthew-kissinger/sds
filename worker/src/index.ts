// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Main worker router: HTTP API + WS upgrade routing to RoomDO.
// Contracts come from docs/archive/c-retry/contract.md and docs/archive/c-retry/authority.md.

import { RoomDO } from './RoomDO';
import { LobbyDO } from './LobbyDO';
import { signJwt, verifyJwt, signTicket, verifyTicket } from './jwt';
import { log, errStr } from './log';
import {
  registerPlayer,
  renamePlayer,
  getPlayer,
  submitScore,
  getLeaderboard,
  getAllLeaderboards,
  isValidGameMode,
  isDailyMode,
  validateDailySubmission,
  AuthError,
  ValidationError,
  NotFoundError,
  type GameMode,
} from './d1';
// Score partitions include the v3 clean-room field without adding it to the
// version 2 simulation scene registry.
import { isKnownScoreScene } from './scorePartitions';
// Cycle 86 Phase 2: /api/event prop caps + always-valid-JSON encoding. Kept
// in their own module: the Workers runtime treats every export of THIS entry
// module as a handler, and an exported const number fails startup.
import {
  truncateRawString,
  encodePropsJson,
  EVENT_STRING_PROP_CAP,
  EVENT_STACK_PROP_CAP,
  EVENT_PROPS_JSON_CAP,
} from './eventProps';

export { RoomDO, LobbyDO };

interface Env {
  ROOM_DO: DurableObjectNamespace;
  LOBBY_DO: DurableObjectNamespace;
  DB: D1Database;
  JWT_SECRET: string;
  // Cycle 35 Phase 2: optional admin secret for /api/score-errors readout.
  // When unbound, the route 404s (no admin surface exposed).
  SCORE_ADMIN_SECRET?: string;
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

// P-SEC-4 (g): front-door rate limiter. A best-effort per-isolate token bucket
// keyed by the client IP (cf-connecting-ip). Cloudflare keeps isolates warm and
// pins a given client to a colo, so the overwhelming majority of one IP's
// requests hit the same isolate — enough to blunt a register/event/room-create
// flood without standing up a per-request DO round-trip on the hot path (which
// the multiplayer contract warns against). It is intentionally NOT a global
// counter: a determined distributed flood needs Cloudflare's edge WAF, not app
// code. Buckets refill continuously at REFILL_PER_SEC up to BUCKET_CAPACITY.
// The cap is generous: a real client makes a handful of these calls per session
// (register once, create/join a room, poll leaderboards), nowhere near 60/min.
const RATE_BUCKET_CAPACITY = 60;       // burst allowance per IP
const RATE_REFILL_PER_SEC = 1;         // sustained 60/min steady-state
const RATE_BUCKET_MAX_ENTRIES = 10_000; // cap the map so it can't grow unbounded
interface TokenBucket { tokens: number; last: number; }
const rateBuckets = new Map<string, TokenBucket>();

// P-SEC-5: per-persistent_id score-submission limiter. The front-door limiter
// above is IP-keyed and the /api/score route is intentionally NOT in its list
// (score POSTs are authenticated, low-frequency, and we want the limit pinned
// to the identity, not the colo). A legitimate client posts one score at the
// end of a run — a handful per session at most — so a tight bucket blunts a
// script replaying a forged time hundreds of times under one stolen token.
const SCORE_BUCKET_CAPACITY = 10;       // burst allowance per persistent_id
const SCORE_REFILL_PER_SEC = 0.2;       // sustained 12/min steady-state
const scoreBuckets = new Map<string, TokenBucket>();

// P-SEC-5: modes the public POST /api/score must never accept. 'competitive'
// and 'timed' are multiplayer outcomes written ONLY by RoomDO.onSubmitScores
// after a DO-validated match; a client posting them is forging a result.
const PUBLIC_SCORE_FORBIDDEN_MODES: ReadonlySet<string> = new Set(['competitive', 'timed']);

// Shared token-bucket arithmetic. Refills `bucket` continuously since its last
// touch (capped at `capacity`), consumes one token if available, and returns
// whether the call is allowed. Mutates `bucket` in place.
function consumeToken(
  bucket: TokenBucket,
  now: number,
  capacity: number,
  refillPerSec: number,
): boolean {
  const elapsedSec = (now - bucket.last) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
  bucket.last = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

// Opportunistic eviction so a key-spoofing flood can't grow `map` without
// bound: when oversized, drop fully-refilled (idle) buckets.
function evictIdleBuckets(
  map: Map<string, TokenBucket>,
  now: number,
  capacity: number,
  refillPerSec: number,
  maxEntries: number,
): void {
  if (map.size <= maxEntries) return;
  for (const [k, b] of map) {
    const refilled = Math.min(capacity, b.tokens + ((now - b.last) / 1000) * refillPerSec);
    if (refilled >= capacity) map.delete(k);
    if (map.size <= maxEntries) break;
  }
}

// Returns true if the request is allowed, false if the IP is over budget. A
// missing IP (local dev, internal call) is always allowed — we never want to
// hard-fail a request we can't attribute. Consumes one token on success.
function frontDoorAllowed(ip: string | null): boolean {
  if (!ip) return true;
  const now = Date.now();
  evictIdleBuckets(rateBuckets, now, RATE_BUCKET_CAPACITY, RATE_REFILL_PER_SEC, RATE_BUCKET_MAX_ENTRIES);
  let b = rateBuckets.get(ip);
  if (!b) {
    b = { tokens: RATE_BUCKET_CAPACITY, last: now };
    rateBuckets.set(ip, b);
  }
  return consumeToken(b, now, RATE_BUCKET_CAPACITY, RATE_REFILL_PER_SEC);
}

// P-SEC-5: returns true if this persistent_id may submit another score now,
// false if it has exhausted its bucket. A missing pid never reaches here (the
// route requires a verified token before calling this). Consumes one token on
// success.
function scoreSubmitAllowed(persistentId: string): boolean {
  const now = Date.now();
  evictIdleBuckets(scoreBuckets, now, SCORE_BUCKET_CAPACITY, SCORE_REFILL_PER_SEC, RATE_BUCKET_MAX_ENTRIES);
  let b = scoreBuckets.get(persistentId);
  if (!b) {
    b = { tokens: SCORE_BUCKET_CAPACITY, last: now };
    scoreBuckets.set(persistentId, b);
  }
  return consumeToken(b, now, SCORE_BUCKET_CAPACITY, SCORE_REFILL_PER_SEC);
}

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

// Cycle 69 P1: defensive request-body reader. A bare `await request.json()`
// THROWS on an absent body, empty body, or malformed JSON; before this, that
// throw fell through to the outer catch and returned a server `500` for what is
// really a client error (the documented /api/rename no-body 500). Returning `{}`
// instead lets each route's normal field guards (`?.` / `?? default`) produce the
// correct `400` (missing field) or `401` (missing token) downstream. Mirrors the
// pattern /api/event already used inline; centralized here so every POST route
// shares it (memory: no patchwork). Never throws.
export async function readJsonObject(request: Request): Promise<any> {
  try {
    return (await request.json()) ?? {};
  } catch {
    return {};
  }
}

function lobbyStub(env: Env): DurableObjectStub {
  const id = env.LOBBY_DO.idFromName('global');
  return env.LOBBY_DO.get(id);
}

function roomStub(env: Env, roomCode: string): DurableObjectStub {
  const id = env.ROOM_DO.idFromName(roomCode.toUpperCase());
  return env.ROOM_DO.get(id);
}

// P-SEC-4 (e): release a previously-claimed room slot on the singleton lobby.
// Best-effort; a swallowed failure only means a slot lingers until the lobby's
// stale sweep reclaims it.
async function releaseRoomClaim(env: Env, roomCode: string): Promise<void> {
  try {
    await lobbyStub(env).fetch(
      new Request('https://do/release-room', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomCode }),
      }),
    );
  } catch {
    /* best-effort */
  }
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

// P-SEC-2: mint the WS admission ticket that binds the just-authenticated
// persistent_id to the room + session the REST handler allocated. The client
// rides it on the /ws upgrade URL; the upgrade router verifies it before
// forwarding. Short TTL — it's consumed at the immediately-following upgrade.
function makeWsTicket(env: Env, persistentId: string, sessionId: string, roomCode: string): Promise<string> {
  return signTicket({ persistent_id: persistentId, sessionId, roomCode }, env.JWT_SECRET);
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
      // P-SEC-2: the upgrade must carry the WS admission ticket minted by the
      // REST create/join handler. A browser WebSocket can't set an Authorization
      // header, so the ticket rides the query string. We verify signature +
      // expiry + that it was minted for this exact (room, session) BEFORE
      // forwarding to the DO, then hand the DO the verified persistent_id via an
      // internal header so it never has to re-derive identity from a bare id.
      const sessionId = url.searchParams.get('playerId');
      const ticket = url.searchParams.get('ticket');
      if (!sessionId) return err('missing playerId', 401, cors);
      if (!ticket) return err('missing ticket', 401, cors);
      const claims = await verifyTicket(ticket, env.JWT_SECRET, { roomCode: code, sessionId });
      if (!claims) return err('invalid ticket', 401, cors);

      const stub = roomStub(env, code);
      // Forward with original URL so DO sees query params, plus the verified
      // persistent_id on an internal header the client can't forge (the DO is
      // only reachable through this Worker).
      const doUrl = new URL(url);
      doUrl.pathname = '/ws';
      const fwd = new Request(doUrl.toString(), request);
      fwd.headers.set('X-Auth-Persistent-Id', claims.persistent_id);
      return stub.fetch(fwd);
    }

    // P-SEC-4 (g): front-door rate limit on the public mutation + heavy-read
    // endpoints. Applied AFTER the WS upgrade (which has its own per-connection
    // limiter) and the OPTIONS preflight, but before any route work or D1 hit,
    // so a flood is rejected at the cheapest point. Scoped to the abuse-prone
    // routes: register (account creation), event (telemetry firehose), rooms*
    // (room creation / join / quick-match — each spins up DO work), and
    // leaderboards (the heavy GROUP-BY read). Healthz + the admin readout are
    // intentionally exempt. Returns 429 with a Retry-After hint.
    const rateLimited =
      path === '/api/register' ||
      path === '/api/rename' ||
      path === '/api/event' ||
      path === '/api/leaderboard' ||
      path === '/api/leaderboards' ||
      path.startsWith('/api/rooms');
    if (rateLimited) {
      const clientIp = request.headers.get('cf-connecting-ip');
      if (!frontDoorAllowed(clientIp)) {
        log.warn('rate_limit_429', { scope: 'front_door', path, ip: clientIp ?? undefined });
        return err('rate limit exceeded', 429, { ...cors, 'retry-after': '1' });
      }
    }

    // --- HTTP API ---
    try {
      if (path === '/api/register' && method === 'POST') {
        const body = await readJsonObject(request);
        const { persistent_id, persistentId, display_name, displayName, name_type, nameType, auth_secret, authSecret } = body || {};
        const name = display_name ?? displayName ?? 'Player';
        const nt = (name_type ?? nameType ?? 'custom') as 'custom' | 'random' | 'anonymous';

        // P-SEC-1: a returning client proves its identity with persistent_id +
        // auth_secret. A NEW client sends no persistent_id - we mint it
        // server-side via crypto.randomUUID and IGNORE any client-supplied
        // value, so an attacker can no longer choose another player's id.
        const claimedId = persistent_id ?? persistentId;
        const providedSecret = (auth_secret ?? authSecret ?? null) as string | null;
        const isReturning = typeof claimedId === 'string' && claimedId.length > 0;
        const pid = isReturning ? (claimedId as string) : crypto.randomUUID();

        let result;
        try {
          result = await registerPlayer(env.DB, pid, name, nt, isReturning ? providedSecret : null);
        } catch (e) {
          // A leaked persistent_id without the matching secret lands here.
          if (e instanceof AuthError) return err('auth required', 401, cors);
          throw e;
        }
        const { player, authSecret: issuedSecret } = result;
        const token = await signJwt({ persistent_id: player.persistent_id }, env.JWT_SECRET, 86400);

        return json(
          {
            token,
            // P-SEC-1: present only when freshly issued (new row or TOFU bind).
            // The client persists it; on a matching re-register it is omitted.
            ...(issuedSecret ? { authSecret: issuedSecret } : {}),
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

      // Cycle 57: authenticated display-name change. The persistent_id is
      // taken from the verified token, never the body, so a leaked id cannot
      // rename another player. Name is validated server-side (the client gate
      // was removed in Cycle 51). 400 with a machine code on a bad name.
      if (path === '/api/rename' && method === 'POST') {
        const body = await readJsonObject(request);
        const payload = await extractToken(request, env, body);
        if (!payload) return err('missing or invalid token', 401, cors);
        const pid = payload.persistent_id;
        const requested = body.display_name ?? body.displayName ?? '';
        try {
          const player = await renamePlayer(env.DB, pid, requested);
          return json(
            {
              success: true,
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
        } catch (e) {
          if (e instanceof ValidationError) return err(e.code, 400, cors);
          if (e instanceof NotFoundError) return err('player not found', 404, cors);
          throw e;
        }
      }

      if (path === '/api/lobbies' && method === 'GET') {
        const res = await lobbyStub(env).fetch(new Request('https://do/list'));
        const data = await res.json<{ lobbies: any[] }>();
        return json({ lobbies: data.lobbies || [] }, 200, cors);
      }

      if (path === '/api/rooms' && method === 'POST') {
        const body = await readJsonObject(request);
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

        // P-SEC-4 (e): charge this room against the host's per-pid concurrent-
        // room cap BEFORE spinning up the DO. A 429 here means the identity
        // already holds the max open rooms — refuse the create rather than leak
        // another live DO.
        const claimRes = await lobbyStub(env).fetch(
          new Request('https://do/claim-room', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ persistentId: pid, roomCode }),
          }),
        );
        if (!claimRes.ok) {
          log.warn('rate_limit_429', { scope: 'room_cap', path, persistentId: pid, roomCode });
          return err('too many open rooms for this player', 429, cors);
        }

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
              // P2-DELTA: forward the host's protocol version so the DO can
              // place this session in the right broadcast cohort. The join
              // handler already forwarded it (Cycle 67 P5); the create path
              // dropped it until now.
              hostProtocolVersion: body.protocolVersion,
              roomSettings,
            }),
          }),
        );

        if (!initRes.ok) {
          // P-SEC-4 (e): init failed after we charged the claim — release it so
          // the failed create doesn't permanently consume one of the host's
          // concurrent-room slots.
          await releaseRoomClaim(env, roomCode);
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

        const wsTicket = await makeWsTicket(env, pid, sessionId, roomCode);
        return json({ ...initBody, sessionId, wsTicket }, 200, cors);
      }

      const joinMatch = path.match(/^\/api\/rooms\/([A-Z0-9]{3,8})\/join$/i);
      if (joinMatch && method === 'POST') {
        const code = joinMatch[1].toUpperCase();
        const body = await readJsonObject(request);
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
              // Cycle 67 P5: forward the client protocol version so the DO can
              // refuse a too-old client from a survival room.
              protocolVersion: body.protocolVersion,
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

        const wsTicket = await makeWsTicket(env, pid, sessionId, code);
        return json({ ...joinBody, sessionId, wsTicket }, 200, cors);
      }

      if (path === '/api/rooms/quick-match' && method === 'POST') {
        const body = await readJsonObject(request);
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
                // P2-DELTA: forward for the broadcast cohort split (absent =>
                // legacy full frames; today's quick-match client sends none).
                protocolVersion: body.protocolVersion,
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
            const wsTicket = await makeWsTicket(env, pid, sessionId, match.roomCode);
            return json({ ...joinBody, sessionId, wsTicket, isQuickMatch: true }, 200, cors);
          }
        }

        // No match or join failed — create a new public room.
        const codeRes = await lobbyStub(env).fetch(
          new Request('https://do/allocate-code', { method: 'POST', body: '{}' }),
        );
        const { roomCode } = await codeRes.json<{ roomCode: string }>();
        // P-SEC-4 (e): charge the per-pid concurrent-room cap before init.
        const qmClaimRes = await lobbyStub(env).fetch(
          new Request('https://do/claim-room', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ persistentId: pid, roomCode }),
          }),
        );
        if (!qmClaimRes.ok) {
          log.warn('rate_limit_429', { scope: 'room_cap', path, persistentId: pid, roomCode });
          return err('too many open rooms for this player', 429, cors);
        }
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
              // P2-DELTA: forward for the broadcast cohort split (absent =>
              // legacy full frames; today's quick-match client sends none).
              hostProtocolVersion: body.protocolVersion,
              roomSettings: { maxPlayers: 4, isPublic: true, gameMode, name: 'Quick Match Game' },
            }),
          }),
        );
        if (!initRes.ok) {
          await releaseRoomClaim(env, roomCode);
          return err('quick-match init failed', 500, cors);
        }
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
        const wsTicket = await makeWsTicket(env, pid, sessionId, roomCode);
        return json({ ...initBody, sessionId, wsTicket, isQuickMatch: true }, 200, cors);
      }

      if (path === '/api/score' && method === 'POST') {
        const body = await readJsonObject(request);
        const payload = await extractToken(request, env, body);
        if (!payload) return err('missing or invalid token', 401, cors);
        const pid = payload.persistent_id;
        const gameMode = body.gameMode as GameMode;
        const score = Number(body.score);
        if (!gameMode || Number.isNaN(score)) return err('missing gameMode or score', 400, cors);

        // P-SEC-5: 'competitive' and 'timed' are MULTIPLAYER outcomes. The only
        // legitimate writer of those rows is RoomDO.onSubmitScores, after the
        // authoritative DO has validated the match. A client posting them on
        // the public route is forging a multiplayer result, so refuse them
        // here outright (the DO path calls submitScore() directly, never this
        // HTTP route, so this does not affect real MP score writes).
        if (PUBLIC_SCORE_FORBIDDEN_MODES.has(gameMode)) {
          return err('mode not accepted on public score endpoint', 403, cors);
        }

        // P-SEC-5: per-identity submission rate limit. Pinned to persistent_id
        // (not IP) since the route is authenticated; blunts a script replaying
        // a forged time under one token. 429 with a Retry-After hint.
        if (!scoreSubmitAllowed(pid)) {
          log.warn('rate_limit_429', { scope: 'score_submit', path, persistentId: pid });
          return err('score submission rate limit exceeded', 429, { ...cors, 'retry-after': '5' });
        }

        // P-SEC-5: daily-* date + sheep-count authority. Reject a forged
        // partition (stale/future date) or a sheep count that doesn't match
        // the seed for that date with a clean 400 at the boundary. submitScore
        // re-checks this server-side as a backstop (and logs to score_errors),
        // but the boundary check gives the truthful status code rather than
        // surfacing as a 500. The effective sheep count mirrors d1's default
        // (additionalData.sheepCount, else 200 for the daily window).
        if (isDailyMode(gameMode)) {
          const ad = body.additionalData || {};
          const claimedSheep = Number.isInteger(ad.sheepCount) ? (ad.sheepCount as number) : 200;
          const daily = validateDailySubmission(gameMode, claimedSheep, Date.now());
          if (!daily.ok) return err(daily.reason || 'invalid daily submission', 400, cors);
        }

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
        // Cycle 12 Phase 6: validate mode at the boundary. Previously an
        // unknown mode flowed into the SQL builder and surfaced as a 500
        // D1_ERROR; now we 400 cleanly.
        const modeRaw = url.searchParams.get('mode') || 'cooperative';
        // Cycle 58: 'solo' is the (scene, count) aggregate read pseudo-mode. It
        // partitions on sheepCount, not a difficulty slug, so it is valid here
        // even though it is not a storable GameMode.
        if (modeRaw !== 'solo' && !isValidGameMode(modeRaw)) return err('invalid mode', 400, cors);
        const mode = modeRaw as GameMode | 'solo';
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 10));
        // Cycle 35 Phase 4: scene is required. Field's 56s soloClassic record
        // and Sheep Dog Island's 600s run are different games; the cross-scene
        // mash-up never composed. Missing or unknown scene returns 400.
        const sceneId = url.searchParams.get('scene');
        if (!sceneId) return err('scene_required', 400, cors);
        if (!isKnownScoreScene(sceneId)) return err('unknown_scene', 400, cors);
        const sheepCountRaw = url.searchParams.get('sheepCount');
        const sheepCount = sheepCountRaw ? Number(sheepCountRaw) : undefined;
        // Cycle 67 P7: survival co-op boards partition by party_size.
        const partySizeRaw = url.searchParams.get('partySize');
        const partySize = partySizeRaw ? Number(partySizeRaw) : undefined;
        const entries = await getLeaderboard(env.DB, mode, limit, {
          sceneId,
          sheepCount: Number.isFinite(sheepCount) && (sheepCount as number) > 0 ? sheepCount : undefined,
          partySize: Number.isFinite(partySize) && (partySize as number) > 0 ? partySize : undefined,
        });
        return json({ entries }, 200, cors);
      }

      if (path === '/api/leaderboards' && method === 'GET') {
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 10));
        const sceneId = url.searchParams.get('scene');
        if (!sceneId) return err('scene_required', 400, cors);
        if (!isKnownScoreScene(sceneId)) return err('unknown_scene', 400, cors);
        const sheepCountRaw = url.searchParams.get('sheepCount');
        const sheepCount = sheepCountRaw ? Number(sheepCountRaw) : undefined;
        const leaderboards = await getAllLeaderboards(env.DB, limit, {
          sceneId,
          sheepCount: Number.isFinite(sheepCount) && (sheepCount as number) > 0 ? sheepCount : undefined,
        });
        return json({ leaderboards }, 200, cors);
      }

      // Cycle 35 Phase 2: admin read of recent score_errors. Gated on
      // SCORE_ADMIN_SECRET so external callers see 404 (not 403) when
      // the secret isn't bound. Same shape as a CLI session, just over
      // HTTP for quick checks without dropping into wrangler d1.
      if (path === '/api/score-errors' && method === 'GET') {
        if (!env.SCORE_ADMIN_SECRET) return err('not found', 404, cors);
        const auth = request.headers.get('authorization') || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
        if (token !== env.SCORE_ADMIN_SECRET) return err('not found', 404, cors);
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
        const { results } = await env.DB.prepare(
          'SELECT id, persistent_id, claimed_mode, claimed_score, claimed_sheep_count, claimed_scene_id, reason, submitted_at FROM score_errors ORDER BY submitted_at DESC LIMIT ?'
        ).bind(limit).all();
        return json({ errors: results || [] }, 200, cors);
      }

      // Cycle 11 Phase 5: lightweight client telemetry. Anonymous events
      // welcome (game_completed, mode_selected, scene_swapped); persistent_id
      // recorded when token present so we can deduplicate users without
      // gating the route on auth. Body is best-effort — failures are
      // swallowed client-side so analytics never affects gameplay UX.
      if (path === '/api/event' && method === 'POST') {
        const body = await readJsonObject(request);
        const name = String(body?.name ?? '').slice(0, 64);
        if (!name) return err('event name required', 400, cors);
        const propsRaw = body?.props && typeof body.props === 'object' ? body.props : {};
        // Strip props to JSON-able primitives only; cap each value on the
        // RAW string (never the encoded JSON), with a wider cap for crash
        // stacks (P0-CRASH sends ~4 KB) than for ordinary string props.
        const safeProps: Record<string, string | number | boolean> = {};
        for (const k of Object.keys(propsRaw).slice(0, 16)) {
          const v = propsRaw[k];
          if (typeof v === 'string') {
            safeProps[k] = truncateRawString(v, k === 'stack' ? EVENT_STACK_PROP_CAP : EVENT_STRING_PROP_CAP);
          }
          else if (typeof v === 'number' && Number.isFinite(v)) safeProps[k] = v;
          else if (typeof v === 'boolean') safeProps[k] = v;
        }
        const propsJson = encodePropsJson(safeProps, EVENT_PROPS_JSON_CAP);
        // Optional auth — present token => recognized player.
        let pid: string | null = null;
        const auth = request.headers.get('authorization') || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : (body?.token || null);
        if (token) {
          try {
            const claims = await verifyJwt(token, env.JWT_SECRET);
            // The JWT carries persistent_id (see signJwt + every other consumer);
            // reading claims.sub here left 100% of authenticated events null.
            pid = (claims?.persistent_id as string) || null;
          } catch { /* invalid token: stay anonymous */ }
        }
        try {
          await env.DB.prepare(
            'INSERT INTO events (name, props, player_id) VALUES (?, ?, ?)'
          ).bind(name, propsJson, pid).run();
        } catch (e: any) {
          // Don't crash. The events table may not exist yet on first deploy.
          log.warn('event_insert_failed', { error: errStr(e) });
        }
        return json({ ok: true }, 200, cors);
      }

      if (path === '/' || path === '/healthz') {
        return json({ ok: true, worker: 'sds-worker' }, 200, cors);
      }

      return err('not found', 404, cors);
    } catch (e: any) {
      log.error('worker_error', { path, error: errStr(e) });
      return err(e?.message || 'internal error', 500, cors);
    }
  },
};
