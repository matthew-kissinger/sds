# Cycle 2 Report — Cloudflare Backend Migration (Ship)

> Written 2026-04-23, end of the overnight Cycle 2 execution. Cycle 1's same-day rollback is documented in [archive/POSTMORTEM.md](archive/POSTMORTEM.md); the specific bugs it shipped are in [archive/cycle-1-audit.md](archive/cycle-1-audit.md). This report is the authoritative "what we actually shipped" document for Cycle 2.

## TL;DR

The frontend runs on Cloudflare Pages, the multiplayer server is a Cloudflare Worker backed by Durable Objects and D1, and Geckos.io/WebRTC/DigitalOcean are no longer in the critical path. `sheepdogsim.com` now CNAMEs at `sds-frontend.pages.dev`; the legacy `api.sheepdogsim.com` A record was removed in the same cutover (2026-04-24). Remaining cleanup — GitHub Actions auto-deploy, leaderboard backfill, droplet destroy — is tracked in [cycle-2-todo.md](cycle-2-todo.md).

## URLs

| Surface | URL | Notes |
|---------|-----|-------|
| Frontend | https://sheepdogsim.com | Cloudflare Pages (`sds-frontend`), CNAME → `sds-frontend.pages.dev`, proxied |
| Frontend (preview) | https://sds-frontend.pages.dev | Pages project default hostname; also functional |
| Multiplayer API | https://sds-worker.matt-m-kissinger.workers.dev | Cloudflare Worker + RoomDO/LobbyDO + D1 |
| Legacy droplet | (destroyed) | DO droplet destroyed 2026-04-25; soak shortened from 1 week. `api.sheepdogsim.com` A record removed 2026-04-24. |

## Cloudflare resources

| Resource | Name | ID / Path |
|----------|------|-----------|
| Worker | `sds-worker` | deployment at `workers.dev`, custom domain deferred |
| Durable Object class | `RoomDO` | per-room, holds players + sim + WS sessions |
| Durable Object class | `LobbyDO` | singleton `global` — public lobby list + quick-match + room-code allocation |
| D1 database | `sds-db` | id `513aa937-e60a-4fb6-b499-9f3814149e88`; schema at `worker/migrations/0001_init.sql` |
| Pages project | `sds-frontend` | production branch `main` |
| Worker secret | `JWT_SECRET` | 32-byte hex, scoped to `sds-worker` |
| Account | Cloudflare account for `sheepdogsim.com` | Login email and account id intentionally omitted from repo docs |

## What shipped

### Worker — `worker/`

- `src/index.ts` — HTTP router (`/api/register`, `/api/rooms`, `/api/rooms/:code/join`, `/api/rooms/quick-match`, `/api/score`, `/api/leaderboard`, `/api/leaderboards`, `/api/lobbies`) + WebSocket upgrade at `/r/:code/ws`. CORS allowlist includes `sheepdogsim.com`, `sds-frontend.pages.dev`, `*.sds-frontend.pages.dev`, and `localhost:{3000,4173,5173}`.
- `src/RoomDO.ts` — per-room state (`meta` + `players` map), WS session table, broadcast loop at 60 Hz via `setInterval`, game-start plumbing, graceful host-migration on disconnect. Persists `meta` + `players` to DO storage so the room survives worker redeploys.
- `src/LobbyDO.ts` — in-memory public-lobby list with 2-minute stale eviction, quick-match search, unique room-code allocation.
- `src/GameSim.js` — direct port of `server/GameSimulation.js` with `this.room` rewired to a DO adapter. 60 Hz tick rate kept (user preference — 20 Hz felt chunky in Cycle 1).
- `src/d1.ts` — leaderboard queries. `POST /api/score` writes `score_submissions` and the matching `players.<mode>_best` column in a single D1 batch. `POST /api/register` inserts a `players` row (addresses Cycle 1 bug #3).
- `src/jwt.ts` — minimal HS256 signer/verifier.

### Client — `js/NetworkManager.js`

Rewritten from Geckos.io to native `WebSocket` + `@msgpack/msgpack` + `fetch`. The external API used by `main.js`, `StartScreen.js`, and React UI components is unchanged (`onRoomUpdate`, `onGameStateUpdate`, `onPlayerUpdate`, `sendPlayerInput`, `registerPlayer`, `submitScore`, `getAllLeaderboards`, etc). Returning users auto-register from the localStorage identity on first room action (`_ensureToken`), so the invite-link flow works for anyone with a cached identity.

### Shared + UI fixes landed in-session

- `shared/BoundaryCollision.js:269` — `const position` → `let position` fix (an existing bug that only triggers in a competitive-gate edge case; esbuild caught it).
- `js/TerrainBuilder.js` — reverted the SimplifyModifier coarse-LOD (#26). The vertex reduction was collapsing mountain faces; the 50k-triangle saving was small compared to grass/trees and not worth the visual regression.
- `js/main.js` — remote-player dogs now have their animation mixer ticked each frame (`updateAnimationSystem(deltaTime)`). Previously `animate()` only updated the player-icon overlay, so other players' dogs slid around without walk/run animation.

### Tooling

- `worker/package.json` + `wrangler.toml` — self-contained. `npx wrangler deploy` ships it.
- `worker/migrations/0001_init.sql` — `players`, `discriminators`, `score_submissions` tables with all indexes from `server/LeaderboardManager.js`.
- `sds-test.mjs` (repo root) — synthetic WebSocket client for end-to-end contract checks against the live worker (register → createRoom → open WS → startGame → count state frames).

## Contract invariants — what we guaranteed this cycle

Each corresponds to a Cycle 1 bug in [archive/cycle-1-audit.md](archive/cycle-1-audit.md). All are now enforced by the shipped worker:

| # | Cycle 1 bug | Cycle 2 fix |
|---|-------------|-------------|
| 1 | `POST /api/rooms` missing | Implemented in `index.ts`; goes through LobbyDO for unique codes then RoomDO for the room |
| 2 | `/api/score` didn't update materialized bests | `d1.ts submitScore` runs an `INSERT INTO score_submissions` + `UPDATE players.<mode>_best` in a single `db.batch` |
| 3 | `/api/register` didn't insert a `players` row | `d1.ts registerPlayer` is an upsert that inserts + allocates a discriminator before returning the JWT |
| 4 | WS handshake stripped identity | Session id comes from the REST `/rooms` or `/join` response; client passes it on the WS URL (`?playerId=…`); DO validates before binding |
| 5 | Coop routed as competitive | `GameSim.js` `createGameStateSnapshot` only populates `snapshot.competitive` when mode ≠ cooperative |
| 6 | `competitiveGates` only on game-start | Port of droplet behavior: snapshot emits `competitive.gates` on every frame in competitive/timed modes |
| 7 | `interpolatingToClient` stripped from dog state | Kept verbatim from `server/GameSimulation.js:1007` |

## What broke during the session

| Issue | Root cause | Fix |
|-------|------------|-----|
| "Start Game" did nothing | CF's DO WebSocket delivers incoming binary frames as `Blob`, not `ArrayBuffer`. My `message` listener dropped Blob frames as "unknown type". | Convert via `blob.arrayBuffer()` in the listener. |
| Rooms disappeared mid-session | DO in-memory state was lost on worker redeploy. | Hydrate `meta` + `players` from DO storage in the constructor; `persist()` on every mutation. |
| Returning users couldn't join | NetworkManager required a call to `registerPlayer` before room actions; returning users had an identity in localStorage but no token. | `_ensureToken()` auto-registers from localStorage identity on first room call. |
| Other players' dogs slid without animation | `animate(deltaTime)` only updates the player-icon overlay; remote dogs never hit `move()` where the mixer tick lives. | Call `remoteDog.updateAnimationSystem(deltaTime)` explicitly in the main-loop remote-dog pass. |
| Mountain faces missing | SimplifyModifier dropped 70% of vertices on meshes whose topology wasn't manifold-safe for that aggressive a reduction. | Reverted PR #26 entirely. Full-res mountains at all distances. |

## What's deferred

See [cycle-2-todo.md](cycle-2-todo.md) for the full punch list. Highlights:

- GitHub Actions auto-deploy (`.github/workflows/deploy.yml`) — not re-added yet; deploys today are manual (`npm run build && npx wrangler pages deploy dist` + `cd worker && npx wrangler deploy`).
- ~~Droplet destroy.~~ Done 2026-04-25, soak shortened from 1 week.
- ~~207-row leaderboard backfill from the droplet's SQLite dump into D1.~~ Moot — droplet destroyed without a final dump; leaderboard rebuilt organically.
- Observability — currently `wrangler tail` only. Worth wiring a basic Logpush or Sentry when volume warrants.
- Hibernation WebSocket API migration — the worker currently uses `server.accept()` which keeps the DO warm (fine for active rooms but billable). Switch to `state.acceptWebSocket(ws)` when we care about idle-room cost.

## Known playtest results (live)

- Solo: full registration → gameplay → score submission on `sds-frontend.pages.dev`. Works.
- Multiplayer solo-host start: works after the Blob fix. Sim ticks 60 Hz, sheep flock, dog moves.
- Multiplayer 2-player: room create + invite link (`#/r/CODE`) + join → Start → both see 200 sheep and each other's dog. Other player's dog movement smooth; animation fix landed. Both players saw each other's chosen dog type — to verify across types, one player picks Jep and the other Pip.

## Rollback

If the new stack needs to be taken out of production during the soak window:

1. **Pages-only issue:** `npx wrangler pages deployment list --project-name sds-frontend` lists recent deploys; promote a prior deployment from the CF dashboard.
2. ~~**Full rollback to legacy stack.**~~ No longer available — droplet destroyed 2026-04-25. Re-provisioning would mean rebuilding from `git show HEAD~N:DROPLET_DEPLOYMENT.md` (deleted in the same housekeeping commit) and `git show HEAD~N:server/` (also deleted), plus restoring `api.sheepdogsim.com` DNS. Treat the CF stack as the only live path going forward.
3. **Worker-only issue:** `cd worker && npx wrangler rollback` reverts the worker to the previous deployment. Pages bundle still points at the workers.dev hostname, so that one-liner is enough.

## Final state of the postmortem rules

From [archive/POSTMORTEM.md](archive/POSTMORTEM.md) §5, status per rule:

- **Playtesting as gate:** met. Solo and MP happy paths were exercised before this report was written.
- **Integration tests before deploy:** partial. The synthetic `sds-test.mjs` exercised the contract end-to-end but the vitest `tests/integration/flow.spec.ts` suite is still `test.skip`. Deferred to a follow-up.
- **One-command rollback:** met (see above). Not rehearsal-worthy ceremony, just a DNS entry.
- **Docs from code:** met in this pass. Contract + protocol-v2 prep artifacts were used as guidance; the README/ARCHITECTURE/DECISIONS updates in this commit reflect what shipped, not what was planned.
