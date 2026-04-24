# Next session — Cloudflare migration (overnight)

> **Cycle 2 completed 2026-04-23.** See [docs/cycle-2-report.md](docs/cycle-2-report.md) for what shipped and [docs/cycle-2-todo.md](docs/cycle-2-todo.md) for what's left. The rest of this file is retained as historical context for the brief that drove Cycle 2; do not re-execute.

**Start here.** This is the single entry point for the agent executing Cycle 2. Read this top to bottom before doing anything else. All other C-retry docs are reference material; this one is the plan.

## Mission

Migrate SDS from the Geckos.io + DigitalOcean droplet backend to Cloudflare Workers + Durable Objects + D1 + Pages. Ship direct to production tonight. Iterate on bugs as they surface.

## Policy calibration

This is a solo side project with no active user base to protect. The POSTMORTEM's 7-day-soak, separate-staging-subdomain, mandatory-gate ceremony was crisis-mode overkill and has been retired. The right approach is **ship to prod, find bugs there, fix them, move on**. Leave the DigitalOcean droplet running in parallel for ~3-7 days as an instant fallback, then destroy it when you are satisfied.

The Cycle 1 postmortem is still worth reading for *what to not repeat* (`docs/cycle-1-audit.md` enumerates 7 launch-blocking bugs with file:line evidence). It is no longer worth reading for *how much ceremony to apply* — that part is superseded by this document.

## Access and credentials

- **CF credentials** live in `~/.config/mk-agent/env` (600 perms). Source it with `source ~/.config/mk-agent/env`. The PowerShell profile on Windows autoloads it; Git Bash loads it from `.bashrc`.
  - `CLOUDFLARE_ACCOUNT_ID=56adffd40534f7fe110fc661a40bbf53`
  - `CLOUDFLARE_API_TOKEN` - the token on disk may have been revoked in the Cycle 1 rollback. If `npx wrangler whoami` fails, create a new project-scoped token at <https://dash.cloudflare.com/profile/api-tokens> using the "Edit Cloudflare Workers" template (add D1 Edit + Pages Edit + Zone DNS Edit permissions). Rotate into `~/.config/mk-agent/env` and keep the old one working until swap.
- **Account**: matt.m.kissinger@gmail.com. Zone: `sheepdogsim.com` (Free plan).
- **Wrangler**: `npx wrangler@latest` (>= 4.84 expected; pin if needed).
- **Node**: 22+ required.
- **gh CLI** is authed as matthew-kissinger; can push, merge, and manage repo secrets.
- **Droplet**: `api.sheepdogsim.com` at `147.182.185.185` is still up. Leave it alone until you have a healthy CF deploy. After that, destroy via DigitalOcean dashboard (it is a one-off droplet, not managed by Terraform).

## What is already in the repo

All the raw material for the migration is on `main` as of commit `62430fa`:

- `docs/c-retry/contract.md` — every HTTP endpoint the client calls, with request/response shapes and the client `file:line` that consumes each field. Your worker must match this exactly. Update it if you change anything, same commit.
- `docs/c-retry/protocol-v2.md` — the WebSocket wire format (MessagePack). Same rule: code is authoritative; keep the doc byte-current.
- `docs/c-retry/authority.md` — resolves three cross-unit contradictions surfaced during prep. Read first when contract and protocol-v2 disagree.
- `docs/c-retry/cf-recreate.md` — idempotent wrangler + dashboard steps to recreate every CF resource. Use this for Phase 1 below.
- `docs/c-retry/b2-audit.md` — which Track B2 lobby UX handlers depend on DO-only server behavior. Wire up those cases in RoomDO.
- `docs/cycle-1-audit.md` — the 7 launch-blocking bugs Cycle 1 shipped. Your implementation must not repeat them. Consider writing an integration test for each.
- `tests/integration/` — Vitest + msgpack + ws two-client harness. 7 flow steps marked `test.skip` — unskip one at a time as each worker feature lands.
- `tests/sim-baseline/` — deterministic 60 Hz sim traces from the droplet. If you later decide to drop to 20 Hz in RoomDO to save DO CPU, compare against these. **User preference: stay at 60 Hz on the server** unless there's a clear reason otherwise (20 Hz felt chunky in Cycle 1).
- `tests/e2e/smoke.spec.ts` — Playwright smoke. Run it against the deployed site when you are done.
- `js/NetworkManager.js` + `js/main.js` — already have client-side velocity extrapolation, adaptive jitter buffer (100-150 ms), and dog `interpolatingToClient` blend (merged earlier today, PR #27). Your worker needs to honor the wire contract these features expect (ship `vx`/`vz` on sheep, `interpolatingToClient` on dog state).

## What to do

### Phase 1 - Verify / recreate CF resources

```bash
source ~/.config/mk-agent/env
cd ~/X/games-3d/sds
npx wrangler whoami                  # should print matt.m.kissinger@gmail.com
npx wrangler d1 list                 # is sds-db there?
npx wrangler pages project list      # is sds-frontend there?
npx wrangler deployments list --name sds-worker 2>/dev/null || echo "no worker"
```

The user noted "resources might already be setup" — check first, recreate only what's missing. For anything missing, follow `docs/c-retry/cf-recreate.md` sections 3.1-3.4 step by step. Set `CF_API_TOKEN` and `CF_ACCOUNT_ID` as GitHub repo secrets via `gh secret set`.

### Phase 2 - Build the worker

Create `worker/` at repo root:

```
worker/
  src/
    index.ts              # Router: HTTP endpoints + WS upgrade
    RoomDO.ts             # Port of server/GameSimulation.js (60 Hz, authoritative)
    LobbyDO.ts            # Public-lobby list + quick-match matchmaking
    types.ts              # Protocol v2 message types (msgpack)
    d1.ts                 # Leaderboard + players + rooms queries
  migrations/
    0001_init.sql         # D1 schema
  wrangler.toml
  package.json
  tsconfig.json
```

**Key implementation notes:**

- Port `server/GameSimulation.js` into `RoomDO.ts`. Keep 60 Hz tick. Use `setAlarm` to drive the loop. Shared sim code lives in `shared/` — reuse `FlockingAlgorithms.js`, `BoundaryCollision.js`, `GameStateValidation.js`, `MovementPhysics.js`, `Vector2D.js` (may need conversion to TS or a thin `.d.ts`).
- **State frame must include** (POSTMORTEM gates — Cycle 1 shipped without these and broke):
  - `interpolatingToClient` on every dog state (see `server/GameSimulation.js:1007` for source semantics)
  - `vx`, `vz` on every sheep (already shipped in current server at `GameSimulation.js:1001-1002` — match exactly)
  - `sheepRetired` in cooperative mode
  - `competitiveGates` on *every* state message, not only on game-start
- HTTP endpoints per `contract.md` — match exactly, response shapes match the client consumer at the file:line noted:
  - `POST /api/register` - creates/updates a player row
  - `POST /api/score` - updates the player's materialized best
  - `GET /api/leaderboard` - paginated
  - `GET /api/lobbies` - public lobby list
  - `POST /api/rooms` - creates a new room (**Cycle 1 shipped without this endpoint; don't**)
  - `POST /api/rooms/:code/join` - joins an existing room
- WebSocket upgrade on `/ws` with MessagePack framing, hello handshake per `authority.md`, ping/pong via Cloudflare's auto-response (do not send `\x01ping` manually).
- D1 schema for `players` (identity, best_time, best_count) and `scores` (audit trail). Update `/api/score` to actually write both tables — Cycle 1's bug was it wrote scores but never updated `players.best_*`.

**Test locally:**

```bash
cd worker
npx wrangler dev
# In another shell:
cd ..
npx vitest run tests/integration --ws-url ws://localhost:8787/ws
```

Unskip `tests/integration/flow.spec.ts` steps as you land each feature. All 7 should pass before you deploy.

### Phase 3 - Client swap

Edit `js/NetworkManager.js`:

- Replace `@geckos.io/client` import with native `WebSocket` + `@msgpack/msgpack` (already a prod dep for Unit 9's harness; add it if not yet).
- Point at the worker's WS URL (use the `sds-worker.workers.dev` URL or the `api.sheepdogsim.com` custom route once bound).
- Keep every client-side improvement already on main: velocity extrapolation (`handleMultiplayerGameState`), adaptive jitter buffer (`recordPacketArrival`), dog blend (`updateOtherPlayer`), frame-rate-independent camera.
- Remove `@geckos.io/client` from `package.json` dependencies after the swap compiles. Don't delete `server/` from disk yet — leave it as a rollback path for 3-7 days.

**Test locally**: `npm run dev`, point at `wrangler dev` worker, play solo and a quick coop game with two tabs.

### Phase 4 - Deploy

```bash
# Worker
cd worker
npx wrangler deploy

# Pages
cd ..
npm run build
npx wrangler pages deploy dist --project-name=sds-frontend --branch=main
```

Bind the custom domain to Pages (`sheepdogsim.com` → `sds-frontend`). Either leave the API on `sds-worker.workers.dev` (simpler) or add a route `api.sheepdogsim.com/*` → `sds-worker` (matches the droplet's old URL and keeps any cached DNS working).

Then:

- Restore `.github/workflows/deploy.yml` pointing at CF Pages (see `docs/c-retry/cf-recreate.md` section 4 for the workflow content; drop the staging variant).
- Add `CF_API_TOKEN`, `CF_ACCOUNT_ID` repo secrets if not already set.

### Phase 5 - Verify live, iterate, cleanup

- Open <https://sheepdogsim.com> in a fresh browser (clear cache). Play a full solo game. Confirm the leaderboard entry appears.
- Open two browser windows. Create a coop room in A, join from B via public lobby list. Play 60 seconds. Watch for rubberband (the client extrapolation should mask normal jitter).
- Run `npx playwright test`.
- Hit the worker endpoints with `curl`:
  - `curl https://<worker-url>/api/leaderboard`
  - `curl -X POST https://<worker-url>/api/register -d '{"handle":"test"}' -H 'content-type: application/json'`
- Fix whatever breaks. Commit each fix separately with a clear message.
- When you are confident it's stable:
  - Update `README.md` "Current project status" section — write it from the shipped code, not from plan.
  - Append an entry to `DECISIONS.md` with the cutover date, the rough architecture diagram you actually shipped, and anything you ended up changing vs. the contract docs.
  - Leave the droplet running — do not destroy it tonight. Revisit after a few days.

## Things to skip (explicit)

- **Staging subdomain** - not needed for a side project. Ship to prod.
- **7-day soak** - retired. Play the game for ten minutes after deploy; if it works, you are done. If it breaks, fix it.
- **Blocking on the full integration test suite** - run it, but do not hold up deploy if 1-2 tests are flaky in a way you can't reproduce. Commit what works.
- **Mandatory rollback rehearsal** - rollback is `git revert <cutover-commit> && git push`, or change a DNS record. That is not rehearsal-worthy ceremony.
- **Contract/protocol-v2 re-grep rituals** - *do* keep those docs in sync when you change something, but do it inline with the code change. No separate "docs-from-code pass" PR.

## Don't-repeat-these-bugs cheat sheet (from `docs/cycle-1-audit.md`)

| # | Bug | Fix (must do) |
|---|-----|--------------|
| 1 | `POST /api/rooms` missing from worker | Implement. Verified by integration test. |
| 2 | `/api/score` doesn't update `players.best_*` | Write to both tables in the same D1 transaction. |
| 3 | `/api/register` doesn't insert row | Upsert pattern; `ON CONFLICT (id) DO UPDATE`. |
| 4 | WS handshake strips identity | Include `playerId` in the hello message per `authority.md`. |
| 5 | Coop routed as competitive | Check mode in LobbyDO before dispatching to RoomDO. |
| 6 | `competitiveGates` only sent on game-start | Include on every state frame in competitive/timed modes. |
| 7 | `interpolatingToClient` stripped from dog state | Port `server/GameSimulation.js:1007` verbatim into RoomDO. |

## If the session ends mid-work

Commit whatever is working. Push. Leave a short `docs/cycle-2-status.md` noting what shipped, what is deferred, and what to do next. The droplet is still up; the site is not broken.

## Final report

When Phase 5 is complete, write `docs/cycle-2-report.md` with:

- What shipped (URLs, commit SHAs)
- What broke and got fixed
- What you deferred
- Known issues / follow-up PRs
- Time to destroy the droplet (pick a date)

And update this `NEXT_SESSION.md` to say "Cycle 2 complete on YYYY-MM-DD, see `docs/cycle-2-report.md`" so the next session doesn't try to redo it.
