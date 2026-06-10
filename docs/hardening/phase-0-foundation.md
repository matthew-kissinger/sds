# Phase 0 - Foundation & Safety Net

> **Rationale:** Nothing else is safe to do until static checking,
> observability, and the determinism bug-fix landing zone exist. These are
> mostly independent, so the DAG is wide and shallow.

## DAG

```
P0-LINT ─┐
P0-TYPE ─┼─→ (phase gate)
P0-CI   ─┘     (P0-CI depends on LINT+TYPE)
P0-OBS ──── (independent)
P0-CRASH ── (independent)
P0-DETBUG ─→ P0-DETTEST
```

---

## [P0-LINT] Extend ESLint to js/ and gate it

- **Owner hint:** infra agent
- **Status:** done
- **Deps:** none
- **Files:** `eslint.config.js`, `.github/workflows/deploy.yml`
- **Risk:** low. Start with a permissive ruleset; do not block on style churn.

Acceptance:

- [x] When a PR introduces an unused import or `js/` boundary violation, then CI shall fail.
- [x] When `npm run lint` runs, then it shall cover `js/**` and `shared/**`.

---

## [P0-TYPE] Add a tsc --noEmit typecheck job

- **Owner hint:** infra agent
- **Status:** done
- **Deps:** none
- **Files:** `tsconfig.json` (incremental checkJs via per-file `// @ts-check` or directory opt-in), new CI job
- **Risk:** medium. Do not flip global `checkJs: true` in one shot; opt-in boot/input/game-loop files first.

Acceptance:

- [x] When CI runs, then a typecheck job shall execute against `.ts` files and any `@ts-check` `.js` files and fail on type errors.

---

## [P0-CI] Wire lint + typecheck as required gates before deploy

- **Owner hint:** infra agent
- **Status:** done
- **Deps:** P0-LINT, P0-TYPE
- **Files:** `.github/workflows/deploy.yml`

Acceptance:

- [x] When either lint or typecheck fails, then the Pages/Worker deploy jobs shall not run. (Lint + typecheck run as steps in the `test` job; `pages` and `worker` gate on `needs.test.result == 'success'`, so a lint or typecheck failure fails `test` and the deploys never run.)

---

## [P0-OBS] Structured logging + metrics in the Worker

- **Owner hint:** backend agent
- **Status:** done (commit `bfbd171`)
- **Deps:** none
- **Files:** `worker/src/RoomDO.ts`, `worker/src/index.ts`, `worker/src/d1.ts`, `worker/wrangler.toml`
- **Risk:** low. Replace ad-hoc console.log emoji lines; keep it cheap (no per-tick logging).

Acceptance:

- [x] When a 429, score_error, DO eviction, or host migration occurs, then the Worker shall emit a structured JSON log line with `{level, event, roomCode?, ts}`. (`worker/src/log.ts`; rate_limit_429, score_error, do_evicted_midgame, player_evicted, host_migration and ~25 more events)
- [x] When tick duration exceeds 16ms, then a `tick_overrun` metric shall be emitted. (GameSim `_recordTickHealth`; dual intra-tick + inter-tick measurement, rate-limited to one line per 5s per room with suppressed count)

---

## [P0-CRASH] Client crash reporting

- **Owner hint:** frontend agent
- **Status:** done (commit `5b8e3de`)
- **Deps:** none
- **Files:** `js/components/App.js:136-208` (ErrorBoundary), `js/telemetry.js`
- **Risk:** low.

Acceptance:

- [x] When the React ErrorBoundary catches an error, then it shall POST `{message, stack, build, ua}` to an error beacon endpoint before showing the reload UI. (`reportCrash()` rides `/api/event` as `client_error`; gated, capped, never throws; 5 tests in `tests/crash-beacon.spec.ts`. Known limit: the Worker stores only the first 256 chars of the stack; widening the worker-side cap is noted for a later worker touch.)

---

## [P0-DETBUG] Fix competitive winner tie-break determinism [FENCE: shared/]

- **Owner hint:** sim agent
- **Status:** done (commit `e420ee6`; covered by `tests/gamestate-validation.spec.js` per [P0-DETTEST])
- **Deps:** none
- **Files:** `shared/GameStateValidation.js:860-949` *(location as captured at spec time; after the P3-GSV-SPLIT module split the tie-break lives at `shared/CompetitiveMode.js:104/118`, with `GameStateValidation.js` as a re-export shim - upkeep E4)*
- **Risk:** medium. This is a sim-core change; regenerate any affected sim-baseline fixture in the same PR with the decision recorded here.
- **Fence:** `shared/GameStateValidation.js` is fence-frozen. Migration story required in this block before implementation; human sign-off before merge. This task is the ONLY sim-baseline regeneration authorized in this program.

Migration story (filled):

- File: `shared/GameStateValidation.js`, `checkCompetitiveCompletion` only. Two call sites of `Object.keys(playerScores).find(...)` (2-player race branch and 3-4 player highest-score branch) gain `.sort()` before `.find()`, plus a comment. No signature, shape, or threshold change.
- Why: winner selection on tied max scores depended on object key insertion order. Player ids are non-integer string keys, so JS preserves insertion order, and that order is not guaranteed identical between the Worker DO's live `playerScores` object (built in join order) and a client's reconstructed copy (rebuilt from snapshot/delta decode). Equal scores could therefore name different winners on the two sides. Sorted keys make the tie-break stable: equal scores resolve to the lexicographically lowest playerId.
- Alternative considered: a deterministic secondary key such as join timestamp or seat index. Rejected: it would require threading extra state through the function signature (a wire-adjacent change), while a lexicographic playerId sort is self-contained, order-independent, and already available on both sides.
- Consumer updates: none needed. The Worker (`worker/src/GameSim.js` imports `checkCompetitiveCompletion` from `shared/`, called at ~line 1120; post-split the call sits at ~line 1382 - upkeep E4) and the client (`js/gamestate/winConditions.js` `resolveCompetitiveCompletion` delegates to the same shared function) both pick up the fix from this one edit. `tests/refactor-baseline/gamestate-harness.js` tie snapshots (`2p@100-100`, `3p@30-30-30`, `4p@50-50-50-50`) use ids `p1..pN` inserted in ascending order, so the sorted tie-break selects the same winner and the snapshots are unchanged.
- In-flight MP sessions affected? (old client + new DO during deploy window): bounded, cosmetic. The DO is authoritative; the winner it broadcasts in the completion message is what every client displays and what persists to the leaderboard. An old client whose local prediction tie-breaks differently could at most flash a mispredicted winner for the frames between local completion detection and the DO's authoritative completion broadcast, then reconcile. No persistent divergence, no score corruption. Note the new behavior is identical to the old whenever scores are not tied, and identical even on ties whenever the lexicographically lowest max-scorer was also first-inserted (the common case for join-ordered ids).

Acceptance:

- [x] When two players have equal scores at completion, then the winner shall be selected by a stable sorted-playerId tie-break identical on Worker and client. (Pinned by the insertion-order and lexicographic tie-break tests in `tests/gamestate-validation.spec.js`.)
- [x] When `checkCompetitiveCompletion` runs twice on reconstructed playerScores objects, then it shall return identical results. (Pinned by the repeated-call and snapshot-reconstruction tests in `tests/gamestate-validation.spec.js`.)
- [x] If a sim-baseline fixture changes, then the regeneration decision shall be recorded in this block and ship in the same PR. (No pre-existing fixture changed: the sorted tie-break is identical for join-ordered `p1..pN` ids, so all committed traces stayed byte-identical. The only new fixture is the net-additive `tests/sim-baseline/competitive.json` added under [P0-DETTEST].)

---

## [P0-DETTEST] Competitive coverage: unit tests + sim-baseline fixture

- **Owner hint:** sim agent
- **Status:** done
- **Deps:** P0-DETBUG
- **Files:** new `tests/gamestate-validation.spec.js`, new `tests/sim-baseline/competitive.json` + spec entry (`tests/sim-baseline/competitive.spec.ts`, generator additions in `tests/sim-baseline/harness.js`)

Acceptance:

- [x] When `GameStateValidation.js` functions run under seeded RNG, then unit tests shall assert determinism for `getRequiredSheep`, `updateSheepRetirements`, `checkCompetitiveCompletion`. (`tests/gamestate-validation.spec.js`: 13 tests, seeded mulberry32 for retirements, insertion-order + lexicographic tie-break pins for completion.)
- [x] When a 2-player competitive race is simulated, then a sim-baseline fixture shall pin the trace. (`tests/sim-baseline/competitive.json`: 35-tick trace, seed `0x12345678`, generated by `tickSheepCompetitive` in the harness; includes retirements at both gates and an `alpha` race completion at tick 34. Generated, not hand-written; regenerate with `UPDATE_FIXTURES=true npx vitest run tests/sim-baseline/competitive.spec.ts`. The harness-level scope note: like `tickSheepCoop`, the gate-attraction steer is out of harness scope; the trace pins the shared/ competitive primitives, not a byte-for-byte Worker replica.)

---

## Gate

- [x] `npm test` green
- [x] `npm run build` green
- [x] CI blocks on lint + typecheck
- [x] Worker emits structured logs
- [x] Client reports crashes
- [x] The known determinism bug is fixed and covered

Gate result: PASSED 2026-06-09. npm test 1178 passed / 8 skipped (baseline
1159 + 19 new), npm run lint clean, npm run typecheck clean, npm run build
green, wrangler dry-run bundle builds. All 5 pre-existing sim-baseline
fixtures byte-identical; new competitive fixture added. Commits: e420ee6
(P0-DETBUG), bfbd171 (P0-OBS), 5b8e3de (P0-CRASH), 94a3d05 (P0-LINT +
P0-TYPE), plus P0-CI and P0-DETTEST commits following. FENCE note: e420ee6
touches shared/GameStateValidation.js under the program's standing
autonomous directive; migration story recorded above, flagged for Matt's
review.
