# Cycle 1 Postmortem - Cloudflare Backend Migration Rollback

> **Status update:** Cycle 2 shipped the migration successfully — see [../cycle-2-report.md](../cycle-2-report.md). This postmortem is now a record of what went wrong in Cycle 1 and the process rules that carried forward. The specific failures listed below were all addressed in Cycle 2; the process lessons (playtest as gate, integration tests, one-command rollback, docs-from-code) remain in force.

> Written 2026-04-23 after a same-day full rollback of the DigitalOcean -> Cloudflare Workers/DO/D1/Pages migration. See [cycle-1-audit.md](cycle-1-audit.md) for the specific technical failures identified by an Opus 4.7 audit after the fact. This file is about **why** the failures shipped - process, not code - so the next attempt does not repeat them.

## 1. What was attempted

Over a single session, a Sonnet 4.6 agent executed tracks A-F and C1-C4 of `AGENT_PLAN.md` end-to-end:

- Tracks A, B1-B2, D1-D3, E1-E2: foundations, lobby UX, sandbox polish, 2P local fixes. These completed without visible issues and remain in the codebase.
- Tracks C1-C4, F: backend migration from Geckos.io/DigitalOcean/SQLite to Cloudflare Workers + Durable Objects + D1 + Pages, plus CI for Pages deploys.

The migration tracks were delegated to multiple sub-agents running in parallel. At the end of the session, the agent declared C4 "cutover complete" and DNS was pointed at CF Pages. A subsequent audit found the cutover was launch-blocking: the primary happy path was non-functional.

## 2. User-visible impact

Service was rolled back within the hour. No users are known to have hit the broken DO backend in production. The droplet backend was still running and all DNS changes were reversed:

- `sheepdogsim.com` CNAME -> back to `matthew-kissinger.github.io`
- CF Pages `sds-frontend` project -> deleted
- CF Worker `sds-worker` -> deleted
- CF D1 database `sds-db` -> deleted
- Agent-scoped API token -> revoked
- GitHub repo secrets `CF_API_TOKEN` and `CF_ACCOUNT_ID` -> removed

## 3. What actually broke (summary - full detail in cycle-1-audit.md)

Seven launch-blocking bugs in production code at cutover time:

1. `POST /api/rooms` and `POST /api/rooms/:code/join` endpoints did not exist in the worker. Client calls them; every Create Room / Quick Match hits a 404.
2. `POST /api/score` inserted into `score_submissions` but never updated the `players` materialized bests that `GET /api/leaderboard` reads from. Leaderboard frozen.
3. `POST /api/register` issued JWTs without ever inserting a row into `players`. New users invisible forever.
4. WebSocket upgrade at `/r/:code/ws` accepted no query parameters; the REST-layer `playerId` was thrown away on every connection, producing fresh anonymous identities. Reconnects create strangers.
5. Client adapter routed cooperative games as if they were competitive because the server always ships `playerScores`. Coop HUD would read zero sheep retired for the whole match.
6. `competitiveGates` were only sent once in `GameStartMsg` and dropped by the adapter; gate objects never render in competitive or timed modes on the DO path.
7. `DogState` stripped `interpolatingToClient`; client reconciliation fought the server on every stop -> visible rubber-banding.

Additionally: 60Hz -> 20Hz tick rate change made per-tick rotation/interp steps 3x larger, with no playtest to check perceptible effect. "One DNS flip rollback" was not true - the `VITE_USE_DO_BACKEND` flag was build-baked into the JS bundle.

## 4. Why it shipped - process failures

### 4.1 "Done" was declared on plumbing, not gameplay

The agent marked C4 complete after verifying:
- `curl /api/lobbies` returns `[]`
- `curl /api/register` returns a JWT
- `curl /api/leaderboard` returns real migrated data
- HTTP 200 on the root domain
- The shipped JS bundle contained `/api/register` and `ArrayBuffer` handling

None of those tests exercise the actual room creation flow, score submission, or gameplay. The agent explicitly said "I have NOT done this" about playtesting - only *after* the user asked. That admission should have been the gate on declaring the track done.

### 4.2 Sub-agent summaries were trusted as verification

Four sub-agents ran in parallel during the migration (C1, C2, C3, F, plus B2). Each returned a self-report summary. Those summaries were taken as truth. Nobody cross-read the finished artifacts against the client expectations. A single read of `NetworkManager.js` next to `worker/src/index.ts` would have surfaced the missing `/api/rooms` endpoint immediately - it took Opus ~3 minutes in the audit.

### 4.3 No integration test of two clients in one loop

Every track had unit tests (47 passing Vitest cases at the end). None of them exercised the full client -> worker -> DO -> client path with real MessagePack and real WebSocket. The tests that did exist ran simulated inputs against the sim class in isolation, which cannot catch protocol mismatches, adapter shape errors, or missing endpoints.

### 4.4 Aggressive pacing

The user's framing was "we are finishing it tonight." The agent executed at that pace without pushing back: zero slack was left for verification, zero time-budget for end-to-end tests, and no moment was reserved to open an actual browser before flipping the flag. "Finish tonight" was interpreted as "ship tonight."

### 4.5 Misrepresented rollback

The agent claimed rollback was "one DNS flip." It wasn't - the flag was build-baked, the Pages project had to be re-deployed, and the DNS record update was a second step. The user reasonably trusted this in authorizing the cutover; in fact the rollback took ~15 minutes and spanned ~10 CF API calls.

### 4.6 Docs written to describe the intent, not the code

The ARCHITECTURE.md rewrite claimed `/api/score` "writes submission + materialized bests." The code didn't do the second half. Docs were drafted by reading the plan, not by reading the implementation. If they had been written by reading the code, the missing implementations would have been visible.

## 5. Signal for the next cycle - do these, not the above

These are rules for whichever agent picks up the retry. They override default behavior and should not be re-litigated.

### 5.1 Define "done" in user-observable terms

A track is **not done** until:

- The user path it enables works in a real browser, end-to-end, verified by an agent.
- For multiplayer paths, verification requires two browser sessions in parallel (use the `Claude_Preview` MCP or Playwright with two contexts - whichever is available in the session; if neither is, pause and ask).
- For leaderboard writes, the test must submit a score and then read the leaderboard back through the same path the game uses.
- The agent's report must include screenshots or console logs from the actual browser session, not just curl outputs.

If the agent "can't playtest" because of missing tools, that is a blocker - it is not an excuse to ship. Install Playwright, the CC Preview MCP, or another real browser driver before declaring C-track work done. "Measure, don't assume" applies here more than anywhere.

### 5.2 Read the other side of every contract

For every new server endpoint, read every client call site that hits it **by file:line** before declaring the endpoint done. `grep` is free. Do the same in reverse for every client function that talks to the server.

A concrete pre-merge checklist for the backend migration retry:

- [ ] For every `fetch()` and `ws` URL in `NetworkManager.js`, there is a matching server handler.
- [ ] For every server response shape, the client decoder or adapter consumes every field the client reads from.
- [ ] For every client message type the server receives, there is a `case` in the server handler (not a `default: break`).
- [ ] For every server broadcast type the client receives, there is a client dispatch branch that consumes it.

### 5.3 Write an integration test that runs two clients

Before the first deploy, there must be a test (`wrangler dev` + two `ws` clients, or Vitest with a harness) that:
1. Registers two players.
2. Creates a room as player A.
3. Joins as player B.
4. Host starts a game.
5. Both players receive the initial state.
6. Player A sends an input; both players see the state update.
7. Game completes; leaderboard is queried; both players appear.

This test must pass locally before any production API call is made.

### 5.4 Sub-agent outputs are proposals, not truth

When a sub-agent reports "Track X complete, all tests passing," treat that as a proposal to merge. Before marking the track done in `AGENT_PLAN.md`:

- Re-read the actual test file to verify claimed coverage.
- Run the test yourself in the parent session.
- Spot-check one or two critical files for the claim made about them.
- If the sub-agent shipped user-visible code, run it in a browser (see 5.1).

### 5.5 Rollback must be a one-command operation

Before deploying any production-affecting change, the agent writes (and the user reads) the exact rollback command sequence and pastes it into a comment on the PR / commit. If rollback takes more than one command, the deploy is not ready. Examples of acceptable rollback:

- `wrangler route delete <id>` (single API call)
- `git revert <sha> && git push` (if the change was a frontend-only flag flip **and** the agent has already tested that the previous bundle still works)

Examples of unacceptable rollback:

- Rebuild and redeploy required (flag is build-baked)
- Multiple DNS edits required
- "Remove this, then add that, then wait for propagation"

### 5.6 Pacing is an input, not a hard constraint

When the user says "we are finishing it tonight," the agent's job is to deliver what's actually finishable tonight - not to declare things finished. If the scope is not shippable to production in the available time, the agent says so at the start and scopes the session to what *is* shippable (e.g., land C1 + C2 tonight, let integration tests bake, defer C4 to a session that has time to actually playtest).

### 5.7 Write docs from the code, not from the plan

When updating README.md / ARCHITECTURE.md after a change, the agent reads the actual implemented code and describes what it does. If the code diverges from the plan, the docs follow the code, and the divergence is flagged in the commit message. Do not write docs by reading the design doc.

### 5.8 Keep the "known good" fallback available

For the backend migration retry: keep the droplet running, keep the Geckos path in `NetworkManager.js`, and keep `VITE_USE_DO_BACKEND=false` as the production default until the migration has run for >=7 days in a staging environment that real users (or the user + a second browser) have exercised. Track G only runs after that soak period.

### 5.9 Explicit install of required tools at the top of the session

The first thing an agent should do when opening a multiplayer/gameplay-test-required track is verify the tools for that work are present in the session. If MCP browser tooling (Preview, Playwright, Claude_in_Chrome) isn't available for the workspace, install it or stop and ask. This cycle shipped without any browser-automation MCP active; the agent never realized it was flying blind.

## 6. What is still real work from this cycle

Preserved in the codebase and not part of the rollback:

- Track A bug fixes (disconnect guard, QuickMatch pre-leave, clientPosition bound, score bounds, SW cache bust, dep cleanup).
- Track B1 design doc at `docs/multiplayer-ux.md`.
- Track B2 lobby UX implementation (`PublicLobbyList.js`, mode cycling, host migration events, invite URLs). Note: some of this references DO-backend-only server events that are no longer wired; verify against the Geckos server before assuming it works.
- Track D1/D2/D3 sandbox diagnosis + share URLs + punch-list fixes.
- Track E1/E2 2P local investigation + execution (ShiftLeft fix, versus scoring, camera padding).

Artifacts removed in the rollback:

- `worker/` directory (entire CF Workers project)
- `.github/workflows/deploy.yml` (CF Pages deploy)
- `.github/workflows/build-itchio.yml` (was wired into the CF deploy flow)
- `.env.production`
- `public/_redirects`, `public/_headers` (CF Pages-specific)
- `@msgpack/msgpack` dependency
- `worker/migrate.sql` and `worker/gen-migrate.js`
- DO-path code in `NetworkManager.js` (reverted to pre-C3 state)
- README.md and ARCHITECTURE.md rewrites (reverted to pre-cycle state)

Cloudflare resources deleted:

- Worker `sds-worker` (with all bound routes)
- D1 database `sds-db` (207 migrated rows lost, but the droplet is still authoritative)
- Pages project `sds-frontend`
- Agent API token `claude-agent-sds`

## 7. For the next agent - what to read before starting

1. This file (POSTMORTEM.md).
2. `docs/cycle-1-audit.md` - the specific technical failures, with file:line references.
3. `AGENT_PLAN.md` Section 2 (locked decisions) - those are still in force.
4. `AGENT_PLAN.md` Section 7 Track C1-C4 and F as **REVERTED** - do not assume prior work is reusable without re-reading it.
5. `DECISIONS.md` - appended 2026-04-23 rollback note.
6. The current state of `js/NetworkManager.js` and `server/index.js` - they're the Geckos path, still in production.

Then, before writing any code: answer in your own words how you will playtest. If you cannot answer it concretely, do not start.
