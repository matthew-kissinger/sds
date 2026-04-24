# C-Retry Verification Protocol

> **SCALED BACK 2026-04-24.** The full protocol below was written for a multi-track soak window. The pragmatic equivalent for this side project is: after CF deploy, (1) load sheepdogsim.com in a fresh incognito window and play a solo game to completion, (2) open a second window, create a coop room, complete a 60-second game, (3) confirm the leaderboard entry appears, (4) `curl` the `/api/leaderboard` endpoint and check it responds. If all four pass, ship is good. If not, fix and redeploy. See `NEXT_SESSION.md` Phase 5. The full protocol below is retained as reference for anyone who wants a deeper checklist.
>
> Original prep brief follows:
>
> The gate Cycle 1 did not have. Every sub-agent executing a C-retry or F-retry track must run this checklist before declaring the track done. The parent session must re-run it before accepting the sub-agent's report. If any item is `No`, the track is not done.

Source-of-truth references (other Unit artifacts in this batch):
- Contract: `docs/c-retry/contract.md` (Unit 1)
- Rollback: `docs/c-retry/rollback.md` (Unit 3)
- Playwright harness: `tests/playwright/` and `docs/c-retry/playtest-harness.md` (Unit 8)
- Integration tests: `tests/integration/` (Unit 9)

## 1. What counts as "done"

Quoting `POSTMORTEM.md` section 5.1 verbatim:

> A track is **not done** until:
> - The user path it enables works in a real browser, end-to-end, verified by an agent.
> - For multiplayer paths, verification requires two browser sessions in parallel.
> - For leaderboard writes, the test must submit a score and then read the leaderboard back through the same path the game uses.
> - The agent's report must include screenshots or console logs from the actual browser session, not just curl outputs.

"Done" is user-observable behavior - sheepdog moves, sheep retire, leaderboard updates - not plumbing. Curl against `/api/lobbies` is not evidence. `npm test` green is not evidence. Only the browser path counts.

## 2. Contract round-trip checklist

Before any deploy, for every endpoint added or changed:

- [ ] Endpoint is listed in `docs/c-retry/contract.md`. If not, update contract.md first.
- [ ] For each server endpoint (`worker/src/index.ts`, `worker/src/RoomDO.ts`): `grep -rn "<path-or-type>" js/` returns at least one caller. Zero = dead code or missing client call.
- [ ] For each client call site (`fetch` or `ws.send` in `js/NetworkManager.js`): a matching server handler exists. If missing, halt - this is the Cycle 1 `POST /api/rooms` 404 pattern.
- [ ] For each client message type `{ t: '...' }`: a `case` exists in the server handler, no `default: break` swallowing unknowns.
- [ ] For each server broadcast type: the client has a dispatch branch consuming every field it reads downstream.
- [ ] Every field in `docs/c-retry/contract.md` appears in both server encoder and client decoder. Grep both sides.

Log the grep commands and their output in the sign-off.

## 3. Integration test checklist

Run against `wrangler dev` locally before any production call. Test at `tests/integration/two-client-flow.test.ts` (Unit 9).

- [ ] `wrangler dev` running locally, pointing at the local D1 binding.
- [ ] `npm run test:integration` executes the two-client Vitest flow.
- [ ] Flow green: register A, register B, A creates room, B joins by code, A starts, both clients receive `start`, A sends input, both see matching `state` tick, sheep-retired counter advances, game completes, `GET /api/leaderboard?mode=cooperative` returns both players with their earned scores.
- [ ] Log saved to `tests/integration/logs/<track>-<timestamp>.log` and linked in the sign-off.

A passing unit suite is not a substitute. Cycle 1 had 47 passing unit tests and zero integration coverage.

## 4. Two-browser playtest checklist

Use the Playwright harness at `tests/playwright/two-browser.spec.ts` (Unit 8). If Playwright is not available in the session, use `Claude_in_Chrome` or `Claude_Preview` MCPs. If neither is installed, halt and ask - do not proceed blind (POSTMORTEM 5.9).

Steps:
- [ ] Two browser contexts opened against the staging URL (not production).
- [ ] Each context registers with a distinct `persistent_id`.
- [ ] Context A creates a public room; context B sees it in the lobby list within 3 seconds.
- [ ] Both join; host (A) starts a cooperative classic match.
- [ ] Both contexts render the same sheep positions within interpolation tolerance (visual compare or snapshot diff).
- [ ] Both see the sheep-retired counter advance as sheep pass the gate.
- [ ] Game completes; leaderboard view shows both players.
- [ ] Screenshots saved for each context at: lobby, match start, mid-game, end-of-match, leaderboard visible. Store under `docs/c-retry/evidence/<track>/<timestamp>/`.
- [ ] Browser console logs captured for both contexts, saved alongside screenshots.

## 5. Leaderboard write-read round-trip

This directly catches the Cycle 1 bug where `/api/score` inserted into `score_submissions` and never updated the `players` materialized bests (`docs/cycle-1-audit.md` item 2).

- [ ] Play a full game to completion in the playtest from section 4.
- [ ] Note the persistent_id and expected score.
- [ ] `curl 'https://<staging-host>/api/leaderboard?mode=<mode>&limit=50'` within 30 seconds of completion.
- [ ] The new score is present in the response. If not, the materialized-best update is missing - do not ship.
- [ ] Repeat for a second mode to confirm the write path generalizes, not just one switch case.

## 6. Parent-session spot-check

When a sub-agent reports a track done, the parent session (POSTMORTEM 5.4) must:

1. `git log -1 --stat <branch>` - confirm the claimed files actually changed.
2. Open the test file the sub-agent claims proves the behavior; read it end to end.
3. Re-run the test in the parent session: `npm run test:integration -- <path>` and paste output into the track's sign-off.
4. Spot-check two critical files by grep: for C-retry that is typically `js/NetworkManager.js` and `worker/src/RoomDO.ts` or `worker/src/index.ts`. Confirm the change the sub-agent described is actually on those lines.
5. If the track ships user-visible code, repeat section 4 in the parent session - do not accept the sub-agent's screenshots as the only evidence.

A sub-agent report is a proposal, not truth.

## 7. Rollback rehearsal

Reference `docs/c-retry/rollback.md` (Unit 3). Before any production deploy:

- [ ] The rollback command sequence is documented in `docs/c-retry/rollback.md` and fits in one command (or a single short script).
- [ ] The sequence has been exercised against staging in the same session: deploy a change, run rollback, confirm staging returns to the prior state.
- [ ] The commands are pasted into the deploy PR description so the human can read them before authorizing.
- [ ] No step says "rebuild and redeploy" (Cycle 1 failure mode - the build-baked `VITE_USE_DO_BACKEND` flag).

## 8. Docs-from-code review

Per POSTMORTEM 5.7, every doc written during a track must be verified by reading the implemented code, not the plan.

- [ ] For each claim in `README.md`, `ARCHITECTURE.md`, or new doc about an endpoint or message: `grep -n "<claim-subject>" worker/src/ js/` and confirm the code matches.
- [ ] For each SQL schema claim: `grep -n "<column-or-table>" worker/migrations/` and confirm the column exists and is written by the relevant handler.
- [ ] If the code diverges from the plan, the doc follows the code and the divergence is noted in the commit message.

## 9. Sign-off template

Every retry track ends with this block, committed under `docs/c-retry/sign-off/<track>-<date>.md`:

```
# Track <id> sign-off

Agent: <model / session id>
Date: <YYYY-MM-DD>
Commit: <sha>

## Section 2 - Contract round-trip
- [ ] Every endpoint has a client caller (grep log: <path>)
- [ ] Every client call has a server handler (grep log: <path>)

## Section 3 - Integration tests
- [ ] Two-client Vitest flow passes (log: <path>)

## Section 4 - Two-browser playtest
- [ ] Two contexts, cooperative classic completes
- Evidence: <path to screenshots + console logs>

## Section 5 - Leaderboard write-read
- [ ] Score appears in /api/leaderboard within 30s (curl log: <path>)

## Section 6 - Parent spot-check
- [ ] Parent re-ran tests (log: <path>)
- [ ] Parent spot-checked files: <list>

## Section 7 - Rollback
- [ ] Commands in docs/c-retry/rollback.md, rehearsed on staging (log: <path>)

## Section 8 - Docs-from-code
- [ ] README/ARCHITECTURE claims verified against code (grep log: <path>)

## Blockers / explicit No
<If any item is No, describe the blocker and escalate. Do not ship.>
```

An explicit `No` is allowed and expected when a track cannot meet a gate. It becomes the blocker escalation, not a quiet ship.
