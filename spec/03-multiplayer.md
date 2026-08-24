# 03 - Multiplayer backend

## Version 3.0 solo-times slice

Version 3.0 reuses only the existing SDS identity and score REST endpoints. It
does not import the old client network layer, add rooms, open WebSockets, deploy
Durable Objects or restore any multiplayer UI.

- `app/src/scores/` owns one API client, one small store and one controller.
- Registration starts behind the title with `nameType: random`. The server mints
  `persistentId`, `authSecret`, JWT and friendly display name. Only
  `persistentId`, `authSecret` and the returned profile persist locally.
- The title says `Running as <name>` with an inline Edit action. Play never
  awaits registration, rename or any backend request.
- Completion posts `soloClassic` seconds with
  `{ sceneId: 'field-v3', sheepCount }`, then reads
  `mode=solo&scene=field-v3&sheepCount=N` for 25, 75 or 200.
- A 401 refreshes the JWT by re-registering with the device secret. Invalid
  credentials discard that identity and ask the server for a fresh random one.
- Offline failures retain the local completion and personal best. There is no
  queue, retry toast, account prompt or analytics event.

The SDS Worker change is score-only: a Worker-local partition helper recognizes
`field-v3` and exactly 25, 75 and 200. It does not modify shared version 2 scene
definitions or mix version 2 rows into the new boards.

## Deferred multiplayer research

The remainder of this document preserves the researched future architecture.
None of its rooms, WebSockets, Durable Objects, netcode or lobby acceptance lines
belong in the version 3.0 client or deployment.

A future multiplayer implementation requires a new Cloudflare Worker, new
Durable Objects and a new D1 database with migrations starting at 0001. The
retained production score Worker remains isolated. No score or room data
migrates into the future service.

## Architecture (lifted shape)

- **Worker router** (`worker/src/index.ts`): REST handshake + WS ticket gate. The DO is reachable ONLY through the router, which derives identity from a verified JWT. This trust chain is an architectural invariant; state it in code comments. It breaks silently if DO routes are ever exposed directly.
- **RoomDO**: one per room. Authoritative 60 Hz sim (imports `sim/step`), MessagePack WS, keyframe/delta broadcast, reconnect grace, host migration.
- **LobbyDO**: singleton. Public room list, room-code allocation with collision retry, per-identity room caps, lazy stale sweep + alarm sweep. Quick-match with one mode is a one-line scan (waiting + not full).
- **D1**: identity + one leaderboard table.
- Standard WebSockets, not the Hibernation API. Recorded decision: the in-memory session model (sessions, rate windows, send health) is the proven pattern and idle-room cost is negligible at this scale. Adopt hibernation from day one or not at all. The researched v1 chooses not at all.

## Auth (lift nearly verbatim from sds `worker/src/jwt.ts` + index.ts)

Server-minted `persistent_id` bound to a device-held `auth_secret` (trust on first use; a returning client re-proves with both). 24 h HS256 JWT signed with a Workers secret. WS upgrades carry a short-lived (120 s) admission ticket binding (persistent_id, sessionId, roomCode) on the query string; the upgrade is a lookup, not a credential handshake. ~115 lines, zero dependencies, solves real attacks. Do not redesign it.

## Wire protocol v1 (MessagePack over WS)

Lift the sds v3 delta design (measured 43-100% egress savings; every correctness case documented in `sds/docs/hardening/delta-protocol-design.md`), rebadged as herd protocol v1. One version constant. A version mismatch at join is a clean refusal. There are NO protocol cohorts, soft-degrade paths, or absent-means-legacy conventions (sds failure mode: dual broadcast paths maintained forever for clients that no longer existed).

**Frames:** `gameStateDelta` carries only sheep whose quantized (0.01) wire record changed since the previous broadcast frame, keyed by array index, full record per changed sheep. Tick-stamped full `gameStateUpdate` keyframes every 60 ticks, on game start, on socket bind, and on client `requestKeyframe` (2/s server cap, 500 ms client cooldown). Degenerate rule: past 85% changed, send a keyframe. Duplicate-tick empty deltas preserve jitter cadence. Unicast keyframes are basis-aligned. Invariants that must survive any simplification: each cohortless buffer encodes at most once per interval, and the delta basis always advances with the broadcast frame.

**Delta frame shape:** `v, tick, baseTick, timestamp, sheepPenned, totalSheep, gameCompleted, changed[], sheepdogs[]` (dogs ride full every frame; 2-4 players is trivial bytes). No conditional blocks.

**Message surface (the whole game):**
- Inbound: `playerInput {direction, sprint, bark?, inputSequence, timestamp, clientPosition}`, `startGame`, `leaveRoom`, `ping`, `requestKeyframe`.
- Outbound: `roomUpdated`, `playerJoined`, `playerLeft`, `hostChanged`, `gameStarted`, `gameStateUpdate`, `gameStateDelta`, `gameComplete`, `pong`, `roomError`.
- REST: `POST /api/register`, `POST /api/rooms`, `POST /api/rooms/:code/join`, `GET /api/lobbies`, `POST /api/score`, `GET /api/leaderboard`, plus the WS upgrade.

Input validation at ingress (lift verbatim): direction is two finite numbers, sequence is a finite integer, and bark is validated + rate-limited server-side (a NaN direction poisons the authoritative dog and desyncs everyone). Newest-wins input queue capped at 8.

Wire changes after v1 ship under the sds fence rule: name the change, the migration story, every consumer, and an acceptance line, in the same PR. With no legacy cohorts the migration story is "bump version; old clients refuse cleanly at join."

## Room lifecycle (lift verbatim)

- DO storage hydrate/persist with backfill (survives DO eviction mid-game).
- 15 s reconnect grace in-game; lobby disconnects evict immediately.
- Rejoin by persistent_id reclaims the stale session slot, exempt from room-full.
- Host authority pinned to hostPersistentId (identity, not sessionId): reclaim-first migration, then oldest-by-joinedAt.
- Eviction routes through the normal disconnect/grace path.
- Idle-room alarm (60 s create-and-abandon teardown).

## DoS hardening (lift constants verbatim; they are measured)

Bounded msgpack decoder (maxStr/maxArray/maxMap) + 8 KB pre-decode byte cap + explicit depth walk. Per-connection fixed window 600 msg/s (drop, then 4x close). Backpressure: skip sends over 256 KB bufferedAmount, evict after ~4 s of consecutive unhealthy intervals (close 1013). Front-door IP token buckets. LobbyDO bounded maps + prune alarm. The 25/75/200 sheep sizes sit far below every constant's sizing basis (version 2 measured 200-sheep keyframes at ~20.8 KB), so nothing needs re-measurement. CORS: hard-refuse unknown origins.

## Future multiplayer leaderboard replacement

One table: best completion time keyed by (persistent_id, flockSize), monotonic best-time upsert, plus display name. Solo (client-local, CPU deterministic backend only) and co-op both submit. Anti-cheat is one duration floor per flock size; no anomaly matrix, no daily partitions, no party-size axes (sds failure mode: a 1,313-line mode x scene x count x partySize x date validation matrix and 11 migrations repairing each other). GPU-backend and modified-count local games never submit.

## Client netcode

`app/src/net/` is a plain TS module. It reconstructs deltas (baseTick match-or-discard, awaiting-keyframe latch, fresh immutable sheep records per apply) and hands full snapshots to the sim/store layer; downstream consumers never see deltas. Port the ~100-line reconstruction block from `sds/js/NetworkManager.js` (lines ~596-701) and the adaptive 100/150 ms jitter-buffer interpolation, replacing the JSON.parse(JSON.stringify) clone with preallocated buffers. 60 Hz frames never touch React state. sds's `tests/delta-client-reconstruction.spec.ts` ports as the acceptance harness.

## Forbidden in worker/

- Mode flags, scene registries, scene-partitioned anything. The worker knows one game.
- The sim mutating room settings (sds's completion handler rotated public-room modes).
- UA sniffing as a capability check.
- Server-side silent mutation of host-chosen settings.
- Mode-specific persistence fields on RoomDO; if sim state must checkpoint, it is one opaque blob hook.
- Test-only WS message types in production builds.
