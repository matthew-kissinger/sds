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
- **Status:** pending
- **Deps:** none
- **Files:** `eslint.config.js`, `.github/workflows/deploy.yml`
- **Risk:** low. Start with a permissive ruleset; do not block on style churn.

Acceptance:

- [ ] When a PR introduces an unused import or `js/` boundary violation, then CI shall fail.
- [ ] When `npm run lint` runs, then it shall cover `js/**` and `shared/**`.

---

## [P0-TYPE] Add a tsc --noEmit typecheck job

- **Owner hint:** infra agent
- **Status:** pending
- **Deps:** none
- **Files:** `tsconfig.json` (incremental checkJs via per-file `// @ts-check` or directory opt-in), new CI job
- **Risk:** medium. Do not flip global `checkJs: true` in one shot; opt-in boot/input/game-loop files first.

Acceptance:

- [ ] When CI runs, then a typecheck job shall execute against `.ts` files and any `@ts-check` `.js` files and fail on type errors.

---

## [P0-CI] Wire lint + typecheck as required gates before deploy

- **Owner hint:** infra agent
- **Status:** pending
- **Deps:** P0-LINT, P0-TYPE
- **Files:** `.github/workflows/deploy.yml`

Acceptance:

- [ ] When either lint or typecheck fails, then the Pages/Worker deploy jobs shall not run.

---

## [P0-OBS] Structured logging + metrics in the Worker

- **Owner hint:** backend agent
- **Status:** pending
- **Deps:** none
- **Files:** `worker/src/RoomDO.ts`, `worker/src/index.ts`, `worker/src/d1.ts`, `worker/wrangler.toml`
- **Risk:** low. Replace ad-hoc console.log emoji lines; keep it cheap (no per-tick logging).

Acceptance:

- [ ] When a 429, score_error, DO eviction, or host migration occurs, then the Worker shall emit a structured JSON log line with `{level, event, roomCode?, ts}`.
- [ ] When tick duration exceeds 16ms, then a `tick_overrun` metric shall be emitted.

---

## [P0-CRASH] Client crash reporting

- **Owner hint:** frontend agent
- **Status:** pending
- **Deps:** none
- **Files:** `js/components/App.js:136-208` (ErrorBoundary), `js/telemetry.js`
- **Risk:** low.

Acceptance:

- [ ] When the React ErrorBoundary catches an error, then it shall POST `{message, stack, build, ua}` to an error beacon endpoint before showing the reload UI.

---

## [P0-DETBUG] Fix competitive winner tie-break determinism [FENCE: shared/]

- **Owner hint:** sim agent
- **Status:** pending
- **Deps:** none
- **Files:** `shared/GameStateValidation.js:860-949`
- **Risk:** medium. This is a sim-core change; regenerate any affected sim-baseline fixture in the same PR with the decision recorded here.
- **Fence:** `shared/GameStateValidation.js` is fence-frozen. Migration story required in this block before implementation; human sign-off before merge. This task is the ONLY sim-baseline regeneration authorized in this program.

Migration story (filled):

- File: `shared/GameStateValidation.js`, `checkCompetitiveCompletion` only. Two call sites of `Object.keys(playerScores).find(...)` (2-player race branch and 3-4 player highest-score branch) gain `.sort()` before `.find()`, plus a comment. No signature, shape, or threshold change.
- Why: winner selection on tied max scores depended on object key insertion order. Player ids are non-integer string keys, so JS preserves insertion order, and that order is not guaranteed identical between the Worker DO's live `playerScores` object (built in join order) and a client's reconstructed copy (rebuilt from snapshot/delta decode). Equal scores could therefore name different winners on the two sides. Sorted keys make the tie-break stable: equal scores resolve to the lexicographically lowest playerId.
- Alternative considered: a deterministic secondary key such as join timestamp or seat index. Rejected: it would require threading extra state through the function signature (a wire-adjacent change), while a lexicographic playerId sort is self-contained, order-independent, and already available on both sides.
- Consumer updates: none needed. The Worker (`worker/src/GameSim.js` imports `checkCompetitiveCompletion` from `shared/`, called at ~line 1120) and the client (`js/gamestate/winConditions.js` `resolveCompetitiveCompletion` delegates to the same shared function) both pick up the fix from this one edit. `tests/refactor-baseline/gamestate-harness.js` tie snapshots (`2p@100-100`, `3p@30-30-30`, `4p@50-50-50-50`) use ids `p1..pN` inserted in ascending order, so the sorted tie-break selects the same winner and the snapshots are unchanged.
- In-flight MP sessions affected? (old client + new DO during deploy window): bounded, cosmetic. The DO is authoritative; the winner it broadcasts in the completion message is what every client displays and what persists to the leaderboard. An old client whose local prediction tie-breaks differently could at most flash a mispredicted winner for the frames between local completion detection and the DO's authoritative completion broadcast, then reconcile. No persistent divergence, no score corruption. Note the new behavior is identical to the old whenever scores are not tied, and identical even on ties whenever the lexicographically lowest max-scorer was also first-inserted (the common case for join-ordered ids).

Acceptance:

- [ ] When two players have equal scores at completion, then the winner shall be selected by a stable sorted-playerId tie-break identical on Worker and client.
- [ ] When `checkCompetitiveCompletion` runs twice on reconstructed playerScores objects, then it shall return identical results.
- [ ] If a sim-baseline fixture changes, then the regeneration decision shall be recorded in this block and ship in the same PR.

---

## [P0-DETTEST] Competitive coverage: unit tests + sim-baseline fixture

- **Owner hint:** sim agent
- **Status:** pending
- **Deps:** P0-DETBUG
- **Files:** new `tests/gamestate-validation.spec.js`, new `tests/sim-baseline/competitive.json` + spec entry

Acceptance:

- [ ] When `GameStateValidation.js` functions run under seeded RNG, then unit tests shall assert determinism for `getRequiredSheep`, `updateSheepRetirements`, `checkCompetitiveCompletion`.
- [ ] When a 2-player competitive race is simulated, then a sim-baseline fixture shall pin the trace.

---

## Gate

- [ ] `npm test` green
- [ ] `npm run build` green
- [ ] CI blocks on lint + typecheck
- [ ] Worker emits structured logs
- [ ] Client reports crashes
- [ ] The known determinism bug is fixed and covered

Gate result: (record date, commit, and evidence here)
