// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Main worker router: the identity and score REST API.
//
// The version 2 multiplayer Durable Objects (RoomDO, LobbyDO), their
// simulation and the /r/:code/ws upgrade were removed in Release 1; the
// deleted_classes migration in wrangler.toml retires the classes. Rooms return
// as a separate realtime Worker under spec/03-multiplayer.md, with the v2 code
// in git history as reference.

import { signJwt, verifyJwt } from './jwt';
import { log, errStr } from './log';
import {
  registerPlayer,
  renamePlayer,
  getPlayer,
  submitScore,
  getLeaderboard,
  getAllLeaderboards,
  getPlayerScores,
  getPlayerScoreStandings,
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

interface Env {
  // The built client in ../dist. wrangler.toml runs this script first only for
  // /api/*, so every other path is answered by the asset layer before the
  // script is invoked; ASSETS is the fallback should the script ever see one.
  ASSETS: Fetcher;
  DB: D1Database;
  JWT_SECRET: string;
  // Cycle 35 Phase 2: optional admin secret for /api/score-errors readout.
  // When unbound, the route 404s (no admin surface exposed).
  SCORE_ADMIN_SECRET?: string;
}

// P-SEC-4 (g): front-door rate limiter. A best-effort per-isolate token bucket
// keyed by the client IP (cf-connecting-ip). Cloudflare keeps isolates warm and
// pins a given client to a colo, so the overwhelming majority of one IP's
// requests hit the same isolate — enough to blunt a register/event/room-create
// flood without standing up a per-request DO round-trip on the hot path (which
// the multiplayer contract warns against). It is intentionally NOT a global
// counter: a determined distributed flood needs Cloudflare's edge WAF, not app
// code. Buckets refill continuously at REFILL_PER_SEC up to BUCKET_CAPACITY.
// The cap is generous: a real client makes a handful of these calls per session
// (register once, poll leaderboards), nowhere near 60/min.
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
// and 'timed' are multiplayer outcomes. Their only writer was the retired v2
// RoomDO after a DO-validated match, so no route writes them now; a client
// posting them is forging a result.
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

// The game now calls this API same-origin. These headers remain for the
// callers that are still cross-origin: every client built before Release 1,
// which has sds-worker.matt-m-kissinger.workers.dev baked in - an open tab, the
// Pages deployment that answers sheepdogsim.com again if the route is deleted
// for a rollback, and the immutable v2 deployment on sds-frontend.pages.dev -
// plus local probes that build with VITE_SCORE_API_BASE.
//
// The old per-origin allow-list answered '*' for any origin it did not name,
// so it never restricted anything. Identity is a bearer token, never a cookie,
// and '*' forbids credentialed requests, so a fixed '*' is the same access
// with nothing to maintain. Delete it once nothing calls the workers.dev host.
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization',
  'access-control-max-age': '86400',
};

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

async function extractToken(request: Request, env: Env, body: any): Promise<any | null> {
  const auth = request.headers.get('Authorization');
  const token = (auth?.startsWith('Bearer ') ? auth.slice(7) : body?.token) ?? null;
  if (!token) return null;
  return verifyJwt(token, env.JWT_SECRET);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Only /api/* is the API. Anything else is the game's static surface.
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

    const cors = CORS_HEADERS;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // P-SEC-4 (g): front-door rate limit on the public mutation + heavy-read
    // endpoints. Applied after the OPTIONS preflight but before any route work
    // or D1 hit, so a flood is rejected at the cheapest point. Scoped to the
    // abuse-prone routes: register (account creation), rename, event (telemetry
    // firehose), and the leaderboard and my-scores reads. Healthz + the admin readout are
    // intentionally exempt. Returns 429 with a Retry-After hint.
    const rateLimited =
      path === '/api/register' ||
      path === '/api/rename' ||
      path === '/api/event' ||
      path === '/api/leaderboard' ||
      path === '/api/leaderboards' ||
      path === '/api/my-scores';
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

      if (path === '/api/score' && method === 'POST') {
        const body = await readJsonObject(request);
        const payload = await extractToken(request, env, body);
        if (!payload) return err('missing or invalid token', 401, cors);
        const pid = payload.persistent_id;
        const gameMode = body.gameMode as GameMode;
        const score = Number(body.score);
        if (!gameMode || Number.isNaN(score)) return err('missing gameMode or score', 400, cors);

        // P-SEC-5: 'competitive' and 'timed' are MULTIPLAYER outcomes, only
        // ever written by an authoritative room after it validated the match.
        // A client posting them on the public route is forging a result.
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

      if (path === '/api/my-scores' && method === 'GET') {
        // A player's own runs. The leaderboard aggregates to one row per
        // player, so a slower second run is recorded and then summarised out
        // of the display; players read that as the run not having counted.
        // Every submission has always been its own row - this is the missing
        // read, not a new write, and there is no schema change behind it.
        //
        // Authenticated, and deliberately: this returns one player's whole
        // record, and the persistent id comes from the verified token rather
        // than from a query parameter, so the endpoint cannot be pointed at
        // somebody else by editing a URL.
        const payload = await extractToken(request, env, null);
        if (!payload) return err('missing or invalid token', 401, cors);
        const scene = url.searchParams.get('scene') || '';
        if (!isKnownScoreScene(scene)) return err('unknown scene', 400, cors);
        const entries = await getPlayerScores(env.DB, payload.persistent_id, scene);
        // Each run also carries where it would sit on that count public board.
        // A rank the player cannot place against a field size is just a
        // number, so the two travel together or not at all.
        const standings = await getPlayerScoreStandings(env.DB, scene, entries);
        const placed = new Map(standings.map((s) => [`${s.sheepCount}:${s.score}`, s]));
        return json({
          entries: entries.map((entry) => {
            const standing = placed.get(`${entry.sheepCount}:${entry.score}`);
            return standing
              ? { ...entry, boardRank: standing.rank, boardPlayers: standing.players }
              : entry;
          }),
        }, 200, cors);
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

      // Under /api so that it can only ever be answered by this script. The
      // asset layer answers every other unmatched path with index.html and a
      // 200, so a health check anywhere else would pass with the API down.
      if (path === '/api/healthz' && method === 'GET') {
        return json({ ok: true, worker: 'sds-worker' }, 200, cors);
      }

      return err('not found', 404, cors);
    } catch (e: any) {
      log.error('worker_error', { path, error: errStr(e) });
      return err(e?.message || 'internal error', 500, cors);
    }
  },
};
