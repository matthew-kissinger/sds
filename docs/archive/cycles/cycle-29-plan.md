# Cycle 29 — gamestate-decomp

> Drafted 2026-05-09 after Cycle 28 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Decompose [`js/GameState.js`](../js/GameState.js) (1,313 LOC at cycle open) to ≤ 800 LOC by extracting six cohesive sub-modules into a new `js/gamestate/` package, under a refactor-baseline characterization harness captured before any extraction. Mode dispatch — currently a chain of `if (this.gameMode === 'competitive')` branches scattered across `setGameMode` / `getGate` / `getPasture` / `updateUI` / `updatePlayerScore` — becomes a single `MODE_CAPABILITIES` table consulted by name, so adding a new mode is a one-row table edit instead of four call-site edits. No user-visible change: behavior is locked by goldens before the B-stream, and asserted identical after each extraction. The carryover from Cycle 28 was zero, so this cycle is a clean run; the user-visible payoff lands the cycle after this one when a new mode is wanted.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point; pick the simplest thing that meets the budget and keeps refactor-baseline goldens flat.

Each agent picking up a phase should:

- **Re-read [`tests/refactor-baseline/`](../tests/refactor-baseline/)** — Cycle 28 B0's harness pattern is the template.
- **Run `npm test -- refactor-baseline` after every B-stream commit** before moving on. Fixture drift is the canary.
- **Pick the simplest extraction that hits the LOC delta** — pure functions in a sibling module, not a class hierarchy. GameState stays a thin orchestrator.

## Open questions to resolve before writing code

All author-resolved at scaffold time. Questions retained as a sanity check; if a phase agent disagrees, surface to user before deviating.

1. **Q1: Where do the sub-modules live?** Author lean (resolved): `js/gamestate/` as a sibling-namespace package. None of this code is sim-deterministic; placing it in `shared/` would imply Worker consumption that doesn't exist and create a fence-violation surface for the next refactor. Sub-modules: `modes.js`, `polygonSpawn.js`, `winConditions.js`, `objective.js`, `completion.js`, `sandboxStart.js`.
2. **Q2: Win-condition extraction — duplicate `shared/GameStateValidation.checkCompetitiveCompletion` or wrap it?** Author lean (resolved): wrap. The pure version already exists in shared; `js/gamestate/winConditions.js` becomes a thin wrapper that binds it to the local `GameState.playerScores` shape. Avoids creating a divergence surface between the client-only resolver and the (deliberately read-only) shared sim core.
3. **Q3: Any frozen-file edits required?** Author lean (resolved): no. `shared/GameStateValidation.js` is consumed by reference only. The cycle's `## Frozen files` section is empty; the durable fence list applies unchanged.

## Architecture / shared changes

New package: [`js/gamestate/`](../js/gamestate/) with sub-modules.

```
js/
├── GameState.js          ← thin orchestrator (target ≤ 800 LOC)
└── gamestate/
    ├── modes.js          ← MODE_CAPABILITIES + sheep-count + leaderboard tables (B1)
    ├── polygonSpawn.js   ← calculatePolygonSpawnConfig + helpers (B2)
    ├── winConditions.js  ← resolveWinCondition wrapper over shared/GameStateValidation (B3)
    ├── objective.js      ← createObjective / refreshObjective / tickObjective (B4)
    ├── completion.js     ← React-delegate stubs + submitScoreToLeaderboard (B5)
    └── sandboxStart.js   ← applySandboxConfig (B6)
```

GameState.js retains its **public API exactly**: constructor, `startGame`, `startSandboxGame`, `getGate`, `setBoundary`, `setObjective`, `updateSheepBehaviors`, `checkCompletion`, etc. Public callers ([`main.js`](../js/main.js), [`MultiplayerState.js`](../js/MultiplayerState.js), [`components/App.js`](../js/components/App.js), [`components/hooks/useGameState.js`](../js/components/hooks/useGameState.js), [`GameBridge.js`](../js/GameBridge.js), [`boot/initNetwork.js`](../js/boot/initNetwork.js), [`AudioManager.js`](../js/AudioManager.js)) see no API change.

## Phase shape rules

A cycle has **≤ 8 phases**. This cycle has 8: A0, B1, B2, B3, B4, B5, B6, C1. If you find yourself drafting a 9th, the work is two cycles, not one.

Each phase is **fully autonomous** (no paired-track work in this cycle).

A phase has a **single sharp goal** (one new file, one extraction, one decision codified) and **≤ 4 hours** of work.

## EARS notation conventions

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/) so the lines are testable by construction:

- **Event-driven**: `When [trigger], the [system] shall [response].`
- **State-driven**: `While [precondition], the [system] shall [response].`
- **Unwanted-event**: `If [unwanted], then the [system] shall [response].`

Each line is **grep-testable**. The [`/cycle-close`](../.claude/commands/cycle-close.md) reconciliation hook walks every Acceptance line and tries to grep its predicate against shipped commits + test output.

## Phase A0 — refactor-baseline mode-dispatch goldens (~3hr)

**Independently testable.** Captures pre-refactor behavior of `startGame` / `startSandboxGame` / `checkCompletion` / `checkSandboxCompletion` / `checkCompetitiveCompletion` / `setObjective` so every B-stream extraction is bit-exact characterized.

1. Add [`tests/refactor-baseline/gamestate-mode-dispatch.spec.ts`](../tests/refactor-baseline/) mirroring the Cycle 28 B0 harness pattern.
2. Vitest mocks for [`OptimizedSheep`](../js/OptimizedSheep.js), [`GameBridge`](../js/GameBridge.js), and other Three.js-pulling deps so GameState constructs cleanly in Node.
3. For every `(mode, singlePlayerMode)` combo across `mode ∈ {solo, multiplayer, competitive, timed}` × `singlePlayerMode ∈ {practice, classic, extreme, insane, chaos}`, call `startGame(mode, …, singlePlayerMode)` and snapshot `{ gameMode, singlePlayerMode, totalSheep, useExtremeBoids, params }`.
4. For `setObjective(def)` with three representative defs (null, OC-style multi-stage, custom hold-required), capture `{ stage, requiredSheep, holdRequired }` against varying `totalSheep`.
5. For competitive completion: seed `playerScores` at boundary values (winThreshold-1 / winThreshold / totalSheep), capture `{ isComplete, winType, winner }` for 2p / 3p / 4p.
6. For sandbox completion: feed `winCondition ∈ {none, all, percentage}` × `winPercentage ∈ {50, 100}` × representative `sheepRetired/totalSheep` boundary cases, capture `isComplete`.
7. Commit fixture [`tests/refactor-baseline/__fixtures__/gamestate-mode-dispatch.json`](../tests/refactor-baseline/__fixtures__/).

**Acceptance (EARS):**

- When Phase A0 ships, then `tests/refactor-baseline/gamestate-mode-dispatch.spec.ts` shall exist.
- When `npm test -- refactor-baseline` runs, vitest shall report all assertions passing against the committed fixture.
- When the harness re-runs against unmodified GameState, then `gamestate-mode-dispatch.json` shall not drift.

## Phase B1 — data-driven mode capability table (~2hr)

**Depends on:** A0.

Convert mode dispatch from inline branches to a `MODE_CAPABILITIES` table consumed by `getGate` / `getPasture` / `getGateForSheepBehavior` / `getPastureForSheepBehavior` / `updateUI` / `updatePlayerScore` / `getPlayerScore`. Single edit-point for "what does mode X do."

1. Create [`js/gamestate/modes.js`](../js/gamestate/modes.js) exporting:
   - `SOLO_MODE_SHEEP_COUNT` (currently inline in `startGame`)
   - `SOLO_MODE_TO_LEADERBOARD` (currently a static class property on GameState)
   - `EXTREME_BOID_MODES` (set of singlePlayerMode strings that enable extreme boid path)
   - `MODE_CAPABILITIES`: `{[gameMode]: { tracksPlayerScores, usesCompetitiveGates, submitsToLeaderboard, uiVariant }}`.
2. Update GameState.js to import + consume.
3. Replace `if (this.gameMode === 'competitive' && this.competitiveGates.length > 0)` patterns with capability-table reads. Same for `competitive || timed` disjunctions.
4. Re-run refactor-baseline. Fixture must not drift.

**Acceptance (EARS):**

- When Phase B1 ships, then `js/gamestate/modes.js` shall exist and export `MODE_CAPABILITIES`.
- When `grep -c "this.gameMode === 'competitive'" js/GameState.js` runs, the count shall drop by ≥ 4 from cycle open.
- When `npm test -- refactor-baseline` runs, the gamestate-mode-dispatch fixture shall not drift.

## Phase B2 — extract polygon-spawn helpers (~2hr)

**Depends on:** A0.

Extract `calculatePolygonSpawnConfig`, `pointToSegmentDistance`, `isPointInPolygon` into a pure-function module. ~120 LOC out.

1. Create [`js/gamestate/polygonSpawn.js`](../js/gamestate/polygonSpawn.js) exporting `calculatePolygonSpawnConfig({ borderPoints, bounds, gate })`, `pointToSegmentDistance`, `isPointInPolygon`.
2. Update `GameState.js`'s `createSheepFlock` and `startSandboxGame` to call the imported pure functions (passing `this.borderPoints` / `this.bounds` / `this.gate` as args).
3. Re-run refactor-baseline.

**Acceptance (EARS):**

- When Phase B2 ships, then `js/gamestate/polygonSpawn.js` shall exist.
- When `wc -l js/GameState.js` runs, LOC shall drop by ≥ 100 from B1's value.
- When `npm test` runs, all vitest specs shall pass.

## Phase B3 — extract win-condition resolver (~2hr)

**Depends on:** A0, B1.

Extract `checkCompletion`, `checkSandboxCompletion`, `checkCompetitiveCompletion` into a resolver wrapper that delegates the competitive case to [`shared/GameStateValidation.checkCompetitiveCompletion`](../shared/GameStateValidation.js) (already implements identical logic).

1. Create [`js/gamestate/winConditions.js`](../js/gamestate/winConditions.js) with `resolveWinCondition(state)` dispatching on `state.gameMode`.
2. Update GameState methods to be 1-line delegates.
3. Re-run refactor-baseline.

**Acceptance (EARS):**

- When Phase B3 ships, then `js/gamestate/winConditions.js` shall exist.
- When `wc -l js/GameState.js` runs, LOC shall drop by ≥ 50 from B2's value.
- When `npm test` runs, all vitest specs shall pass.

## Phase B4 — extract objective state machine (~2hr)

**Depends on:** A0.

Extract `setObjective` + `_refreshObjective` + the inline objective-tick block from `updateSheepBehaviors`. ~70 LOC out.

1. Create [`js/gamestate/objective.js`](../js/gamestate/objective.js) with `createObjective(def, totalSheep)`, `refreshObjective(objective, def, totalSheep)`, `tickObjective(objective, sheep, deltaTime, dispatchEvent)`, `corralOpen(objective)`. Pure functions returning new state where appropriate.
2. Update GameState methods to delegate; the tick block in `updateSheepBehaviors` becomes a single `tickObjective(...)` call.
3. Re-run refactor-baseline.

**Acceptance (EARS):**

- When Phase B4 ships, then `js/gamestate/objective.js` shall exist.
- When `wc -l js/GameState.js` runs, LOC shall drop by ≥ 50 from B3's value.
- When the objective-stage `roundup` → `drive` transition runs in the refactor-baseline harness, behavior shall match pre-extraction.
- When `npm test` runs, all vitest specs shall pass.

## Phase B5 — extract completion-UI + leaderboard submit (~2hr)

**Depends on:** A0, B1.

The completion-UI methods (`updateCooperativeUI`, `updateCompetitiveUI`, `updateTimedUI`, `showCompletionMessage`, `showCooperativeCompletionMessage`, `showCompetitiveCompletionMessage`, `formatTime`) are mostly thin React-delegating stubs, plus `submitScoreToLeaderboard` which is the real work. Move all of it.

1. Create [`js/gamestate/completion.js`](../js/gamestate/completion.js) with the React-delegate stubs (kept for backward compat) and `submitScoreToLeaderboard(state, score, gameMode)`.
2. Replace GameState methods with thin delegates.
3. Re-run refactor-baseline.

**Acceptance (EARS):**

- When Phase B5 ships, then `js/gamestate/completion.js` shall exist.
- When `wc -l js/GameState.js` runs, LOC shall drop by ≥ 100 from B4's value.
- When `npm test` runs, all vitest specs shall pass.

## Phase B6 — extract startSandboxGame (~3hr)

**Depends on:** A0, B1, B2.

`startSandboxGame` (~150 LOC) is the largest single method. Extract its body to [`js/gamestate/sandboxStart.js`](../js/gamestate/sandboxStart.js) so GameState's `startSandboxGame` becomes a delegate that mutates `this`.

1. Create `js/gamestate/sandboxStart.js` exporting `applySandboxConfig(state, sandboxConfig)` that takes a state-like object and applies the changes (delegating polygon-spawn to B2's module).
2. GameState.startSandboxGame becomes 10–20 lines of orchestration.
3. Re-run refactor-baseline.

**Acceptance (EARS):**

- When Phase B6 ships, then `js/gamestate/sandboxStart.js` shall exist.
- When `wc -l js/GameState.js` runs at cycle close, the count shall be ≤ 800.
- When `npm test` runs, all vitest specs shall pass.
- When `npm run build` runs, production build shall be clean.

## Phase C1 — MultiplayerState ↔ GameState integration spec (~2hr)

**Depends on:** B1–B6.

Lock the contract between [`MultiplayerState.gameMode`](../js/MultiplayerState.js) (one of: `cooperative` / `racing` / `timed`) and `GameState.gameMode` (one of: `solo` / `multiplayer` / `competitive` / `timed` / `sandbox`) via integration tests. The cross-vocabulary mapping (multiplayer↔cooperative, competitive↔racing) is currently a tribal-knowledge fact buried in the worker and the React HUD; this spec surfaces it so a future contributor doesn't reintroduce dialect drift.

1. Add [`tests/integration/gamestate-mp-contract.spec.ts`](../tests/integration/).
2. Test cases: 2p-local solo (`gameMode='solo'` with `sheepdog2` set), MP cooperative (`gameMode='multiplayer'`, `MultiplayerState.gameMode='cooperative'`), competitive 2p / 3p / 4p (`initializeCompetitiveMode`, scores up to threshold, completion result), timed (`gameMode='timed'`, no completion via competitive logic).
3. Document the vocab mapping in a top-of-file comment + verify it via the spec.

**Acceptance (EARS):**

- When Phase C1 ships, then `tests/integration/gamestate-mp-contract.spec.ts` shall exist and pass.
- When `npm test -- gamestate-mp-contract` runs, vitest shall report all assertions passing.

## Dependencies

```
A0 → B1 + B2 (parallel) → B3 + B4 + B5 (parallel) → B6 → C1
```

A0 must land first (the goldens guard everything after). B1 (capability table) is a prerequisite for B3 and B5 (they consume the table). B2 (polygon-spawn) is independent of B1, but B6 (sandbox-start) imports it. C1 is the cycle-close validation.

In autonomous execution, phases ship serially per commit so each commit's reconciliation hook output stays clean.

## Frozen files (cycle-specific additions)

None. [`shared/GameStateValidation.js`](../shared/GameStateValidation.js) is consumed by import only — not modified. The durable [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) applies unchanged.

## Hard stops

Durable hard stops apply on every cycle — see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-29-specific additions:

1. **Refactor-baseline `gamestate-mode-dispatch.json` drift mid-extraction.** If a B-stream extraction makes the fixture drift, stop, read the diff, and surface — don't regenerate as a shortcut to make tests pass.
2. **MultiplayerState contract change without paired update.** Cycle 29 isn't authorized to touch the wire protocol or `MultiplayerState`'s public methods. If a B-stream extraction would require changing what `MultiplayerState` passes in, stop and surface.
3. **GameState public API change.** Phases extract internals but preserve the public surface. If a phase wants to change `startGame`'s signature or remove a method, stop and surface — that's next-cycle scope.

## What NOT to do during this cycle

- **Don't expand to Worker-side decomposition.** Cycle 29 is client-side only. The worker has its own `gameState` shape inside the DO; that's a separate decomposition for a future cycle.
- **Don't merge `js/gamestate/` into `shared/`.** None of these sub-modules is sim-deterministic; making them shared/ implies Worker consumption that doesn't exist and would invite future divergence.
- **Don't refactor `OptimizedSheep` or `GrassSystem`** — they're cohesive-by-design (see [`DECISIONS.md`](../DECISIONS.md)).
- **Don't change GameState's public API.** [`main.js`](../js/main.js), [`App.js`](../js/components/App.js), [`useGameState.js`](../js/components/hooks/useGameState.js), [`MultiplayerState.js`](../js/MultiplayerState.js), [`GameBridge.js`](../js/GameBridge.js), [`AudioManager.js`](../js/AudioManager.js), [`boot/initNetwork.js`](../js/boot/initNetwork.js) are consumers — preserve their import signatures.
- **Don't introduce TypeScript files in `js/gamestate/`.** Keep parity with the rest of `js/` (.js + JSDoc).
- **Don't auto-bump versions.** No player-visible change ships in Cycle 29.

## Success criteria (cycle close)

[`/cycle-close`](../.claude/commands/cycle-close.md) reads this section and asks the user to confirm each item. Each item is grep-testable so the reconciliation hook can verify.

- [x] When the cycle closes, all 8 phases shall be shipped or explicitly deferred to next cycle's [`BACKLOG.md`](BACKLOG.md) carryover. (8/8 shipped: A0/B1/B2/B3/B4/B5/B6/C1.)
- [x] When `wc -l js/GameState.js` runs at cycle close, count shall be ≤ 800. (745, 55-LOC headroom.)
- [x] When `npm test` runs at cycle close, all vitest specs shall pass. (290 / 297; +13 net specs from gamestate-mode-dispatch and gamestate-mp-contract.)
- [x] When `npm run build` runs at cycle close, production build shall be clean. (4.06s; main 575 KiB ≤ 576 fixture, three 603 KiB ≤ 603 fixture.)
- [x] When `npx eslint shared/` runs at cycle close, zero errors. (Exit 0.)
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions. (Pending push — the autonomous run committed locally; Matt to push manually so production deploy is human-gated.)

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle-plan template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) — pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/`](archive/cycles/) — past cycle plans
- [`tests/refactor-baseline/README.md`](../tests/refactor-baseline/README.md) — Cycle 28 B0 harness pattern
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
