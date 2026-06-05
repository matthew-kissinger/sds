# Cycle 59 — counting-sheep

> Drafted 2026-06-05 after Cycle 58 closed. Authored 2026-06-05 from the approved design pass. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Ship **Counting Sheep**, the first new solo edition: a round-based mode where you herd ever-larger batches and the running tally climbs (the bedtime pun is the point). It reuses the entire herding loop and changes only *when sheep appear* and *what ends the run*. Two ranked curve variants (**Incremental**: per-round batch n; **Exponential**: per-round batch 2^(n-1)) ship on **Home Field** and **Rolling Hills**. The run never auto-completes; the player presses **bank and finish** to log a score (total sheep counted) and see a summary. While here, generalize the entrance's single solo ladder into **mode families** (Classic, Counting Sheep, Objective) and relabel Open Country as its own Objective family. Before: solo means "pen all N, get a time," one implicit ladder per world. After: a player can pick a Counting Sheep family on the two pastoral biomes, herd an endless rising count, and bank to a per-curve leaderboard.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), not every implementation choice. The design was validated against the live code by an exploration + planning pass; file:line anchors below are starting points, confirmed at authoring time but worth re-checking before editing.

## Open questions to resolve before writing code

All resolved in the alignment pass (2026-06-05):

1. **Q1: Curves?** Resolved: incremental `batch(n) = n`; exponential `batch(n) = 2^(n-1)`. Tunable constants; final feel is a paired close-note.
2. **Q2: How does a run end?** Resolved: player-driven via "bank and finish." Score = total sheep counted. Hard ceiling 5000 (the proven capacity); past it no further batch spawns.
3. **Q3: Leaderboard?** Resolved: new `game_mode` keys beside the Cycle 58 solo path, ranked descending by counted, partition `(scene, curve)`, no D1 migration.
4. **Q4: Biomes?** Resolved: Home Field + Rolling Hills (both objective-free). Open Country excluded from Counting Sheep and recategorized as its own Objective family.

## Architecture / shared changes

- **Solo is client-side.** Solo runs entirely on the client (Worker DO authority is multiplayer-only), so the round controller is a plain client module, not a `shared/` deterministic one. No sim-baseline regeneration, no desync risk. Verified: `tests/sim-baseline` reconstructs movement from `shared/` primitives and never imports `OptimizedSheep.js` / `GameState.js`, so the engine change cannot move it. The fixtures to keep green are `tests/refactor-baseline` (bundle byte size) and `tests/completion-count.spec.js` (retirement tally).
- **Canonical mode-id constants** `counting-incremental` / `counting-exponential` live in one module imported by both client and worker (P1), so no later phase forces a rename ripple.
- **Capacity split.** `OptimizedSheepSystem` gains a per-run `maxCapacity` (threaded through the existing `opts` arg) distinct from a growing `activeCount`. `this.sheep` stays length `activeCount` (instances appended from a pre-created pool), so every `sheep.length` consumer stays correct for free. `instancedMesh.count = activeCount` limits the draw; sentinel `state = -1` marks not-yet-spawned. Standard modes default `maxCapacity` to the exact count and are byte-identical.
- **Capability dispatch.** Counting registers in `MODE_CAPABILITIES` (`js/gamestate/modes.js`); win-check, HUD, and submit gate on capability flags, never `if (mode === 'counting-...')`.
- **Leaderboard sits beside the solo path.** Solo boards key `solo:<count>`, partition `(scene, count)`, rank time ascending. Counting is opposite on every axis (count is the score, unbounded, descending, no fixed count tier), so it gets its own `game_mode` values and read branch. Counted goes in the existing `score` column; `sheep_count` unused; no `counting_*_best` materialized column; no D1 migration.
- **Taxonomy single source.** An optional `SceneDef` field (fence-authorized, optional-with-default, the Cycle 58 `soloLadder` pattern) declares each scene's mode families; the entrance and the worker board list both read it.

## Phase 1 — Round controller, curves, mode-id constants, capabilities (~3hr)

**Independently testable.** The dependency root: the two curve functions, round state, the shared id constants, and capability registration. Pure logic, unit-tested, no engine or UI coupling.

1. **New module** [`js/gamestate/countingMode.js`](../js/gamestate/countingMode.js): pure `incrementalBatch(n)`, `exponentialBatch(n)`, a round-state factory (`round`, `cumulative`), and the 5000 clamp.
2. **Id constants** in a small shared module both client and worker import.
3. **Register** both modes in [`js/gamestate/modes.js`](../js/gamestate/modes.js) `MODE_CAPABILITIES`.

**Acceptance (EARS):**

- When the incremental curve is asked for round n, then `countingMode` shall return a batch size of n.
- When the exponential curve is asked for round n, then `countingMode` shall return a batch size of 2^(n-1).
- When a curve's cumulative would exceed 5000, then the batch shall be clamped so cumulative lands at exactly 5000 and no further batch is produced.
- While counting modes are registered, `getModeCapabilities` shall report `submitsToLeaderboard: true` and a round-based UI variant for both.

## Phase 2 — Sheep capacity: pre-size and incremental activation (~4hr)

**Depends on:** P1 (mode ids for the gating decision).

1. Split `capacity` from `activeCount` in [`js/OptimizedSheep.js`](../js/OptimizedSheep.js); thread `maxCapacity` through the existing `opts` (5th arg) so all current call sites and `optimized-sheep-heightfield.spec.js` are untouched.
2. Factor spawn-position logic out of `initializeSheepData` into a helper reused by a new `activateSheepBatch(k)`.
3. Loop bounds and `instancedMesh.count` follow `activeCount`; sentinel `state = -1` for inactive; one `continue` guard in the update loop. Gate the ceiling-sizing in [`js/GameState.js`](../js/GameState.js) `createSheepFlock` on the counting mode.

**Acceptance (EARS):**

- When `OptimizedSheepSystem` is constructed without `maxCapacity`, then capacity and active count shall both equal `sheepCount`.
- While counting mode is inactive, the InstancedMesh, both instance attributes, and the spawn RNG order shall be byte-identical to the pre-cycle build (refactor-baseline and completion-count fixtures stay green).
- When counting mode builds the flock, then capacity shall be 5000 and the per-frame update and draw shall iterate only the active count.
- When `activateSheepBatch(k)` runs, then k inactive instances shall become active at fresh spawn positions and `instancedMesh.count` shall rise by k with no buffer reallocation.

## Phase 3 — Loop integration, win-check bypass, HUD readout (~3.5hr)

**Depends on:** P1, P2.

1. Wire the round controller into the per-frame update ([`js/GameState.js`](../js/GameState.js)): detect `sheepRetired >= activeCount`, advance the round, `activateSheepBatch`, emit a round-advanced event.
2. Bypass `checkCompletion()` for counting ([`js/main.js`](../js/main.js) win-check seam ~2288).
3. Add `round` and `counted` to the single `gameData` source ([`js/components/hooks/useGameState.js`](../js/components/hooks/useGameState.js); `counted` is the submitted score) and render one shared "Round N, counted M" readout in both [`SheepCounter.tsx`](../js/components/GameHUD/SheepCounter.tsx) and [`MobileHUD.tsx`](../js/components/GameHUD/MobileHUD.tsx).

**Acceptance (EARS):**

- When the current batch is fully penned and the cap is not reached, then the system shall activate the next batch and shall not show the completion overlay.
- While counting mode is active, `checkCompletion()` shall return false so the run never auto-ends.
- When a counting round advances, then `gameData.round` and `gameData.counted` shall update and render in both HUD layouts from the shared readout.
- While a standard mode is active, the win-check and HUD shall behave byte-identically to today.

## Phase 4 — Player-banked end: bank affordance, submit, summary, restart (~3.5hr)

**Depends on:** P1, P3.

1. `bankCountingScore()` on the game instance ([`js/main.js`](../js/main.js)): stop timer, submit counted total, show summary. Reuse the existing submit path ([`js/gamestate/completion.js`](../js/gamestate/completion.js) → `window.submitGameScore`).
2. An always-visible HUD bank control plus a pause-menu entry ([`js/components/GameHUD/PauseMenu.tsx`](../js/components/GameHUD/PauseMenu.tsx)).
3. A `counting` branch in [`CompletionScreen.tsx`](../js/components/GameHUD/CompletionScreen.tsx) `getContent()`; a restart reset that clears the round controller + counted tally and re-pre-sizes the flock (`restartSameMode`).

**Acceptance (EARS):**

- When the player activates bank and finish, then `bankCountingScore()` shall stop the timer, submit the counted total, and show the counting summary.
- When the counting summary renders, then it shall show the round reached, the total counted, and the leaderboard result.
- When the player chooses play again, then the round controller, counted tally, and flock shall reset to round 1.
- While counting mode is active, the bank affordance shall be reachable from both an always-visible HUD control and the pause menu, on desktop and mobile.

## Phase 5 — Worker leaderboard (no migration) (~3.5hr)

**Depends on:** P1 (mode ids).

1. Add the two `GameMode` keys in [`worker/src/d1.ts`](../worker/src/d1.ts); validate counted as integer [0, 5000]; `modeSheepCountOk` skips the count allow-list for counting; `getLeaderboard` partitions `(game_mode, scene_id)` ignoring sheep_count and orders descending; `getAllLeaderboards` emits the counting boards.
2. Soft `score_anomalies` signal when elapsed time is implausibly short for the counted total (Cycle 57 soft-signal style; never hard-rejects). Verify counting is not in `PUBLIC_SCORE_FORBIDDEN_MODES` ([`worker/src/index.ts`](../worker/src/index.ts), no change expected).
3. Real-SQLite harness specs ([`tests/worker/helpers/d1-sqlite.ts`](../tests/worker/helpers/d1-sqlite.ts)).

**Acceptance (EARS):**

- When a counting score is submitted, then the worker shall validate it as an integer in [0, 5000] and store it in the existing score column with no D1 migration.
- When the counting leaderboard is read, then rows shall partition by `(game_mode, scene_id)` ignoring sheep_count and order by counted descending.
- If a counting submission's elapsed time is implausibly short for its counted total, then the worker shall attach a soft `score_anomalies` signal and not reject.
- When any existing solo or non-solo board is read, then its membership and ordering shall be unchanged.

## Phase 6 — Client leaderboard surface and submit wiring (~3hr)

**Depends on:** P4, P5.

1. [`leaderboardModesForScene`](../js/components/Multiplayer/GlobalLeaderboard.tsx) appends the two counting boards for scenes carrying the Counting Sheep family; the tab is fixed-count (no sheep dropdown); the board renders the counted total as the hero stat ranked highest first.
2. Map the curve to the right `counting-*` mode in the submit path ([`js/gamestate/completion.js`](../js/gamestate/completion.js)).

**Acceptance (EARS):**

- When a biome with the counting family is viewed in the leaderboard, then it shall show one board per curve with no sheep-count dropdown.
- When a counting run is banked, then the submit path shall post the counted total under the matching counting mode with sceneId and pausedMs.
- When a counting board renders, then it shall display the counted total ranked highest first.

## Phase 7 — Entrance mode-family reorg, all three worlds (~4hr)

**Depends on:** P1, P6.

1. Generalize to mode families: `ModeFamily { id, name, rungs }` in [`worlds.ts`](../js/components/entrance/worlds.ts), family state + `sds.last-family` persistence in [`useBootFlow.ts`](../js/components/entrance/useBootFlow.ts), a family selector in [`Entrance.tsx`](../js/components/entrance/Entrance.tsx) reusing the existing rung chip styling.
2. Home Field and Rolling Hills carry [Classic, Counting Sheep]; Open Country carries its own [Objective] family (relabel of its existing ladder, no gameplay change). A single-family world renders the family as a label, not a tab. The optional family field on the SceneDef ([`shared/scenes/types.js`](../shared/scenes/types.js) + the three scene files) is the single source.
3. Player-facing family/curve strings in [`js/locales/en/index.js`](../js/locales/en/index.js).

**Acceptance (EARS):**

- When a world declares more than one family, then the entrance shall render a family selector above the rungs reusing the existing chip component.
- When a world declares a single family, then its rung selection and commit shall be byte-identical to today (no Open Country or Classic-only regression).
- When Home Field or Rolling Hills is armed, then the entrance shall offer a Classic family and a Counting Sheep family (Incremental / Exponential).
- When Open Country is armed, then it shall present its own Objective family and its existing ladder and leaderboard shall be unchanged.
- When a family or curve is chosen, then the selection shall persist across reloads.
- While new player-facing strings are added, then none shall contain an em-dash, an exclamation mark, or an emoji.

## Phase 8 — Validation, smoke, prose, docs, close prep (~2.5hr)

**Depends on:** P1-P7.

1. Full `npm test` + `npm run build`; an end-to-end browser smoke of a counting run (preview MCP, desktop + 390x844); prose hygiene on all new strings.
2. Decision-log + doc updates.

**Acceptance (EARS):**

- When `npm test` and `npm run build` run, then both shall pass with no new failures.
- When a counting run is smoke-tested in the browser, then a batch shall advance on full-pen, the bank affordance shall submit, and the summary shall show the counted total.
- When the cycle closes, then `DECISIONS.md` shall record the mode-family taxonomy and the no-migration counting leaderboard.

## Dependencies

```
P1 → P2 → P3 → P4 → P6 → P7 → P8
P1 → P5 → P6
```

P1 is the root (mode ids + curves + capabilities). P2 and P5 can run in parallel after P1 (engine vs worker). P3 needs P2; P4 needs P3; P6 needs P4 + P5; P7 needs P6; P8 last.

## Frozen files (cycle-specific additions)

- **[`shared/scenes/types.js`](../shared/scenes/types.js)** (SceneDef schema, durable fence): add an optional mode-family field with a default. Migration story: absent = today's single implicit family (Classic for Home Field / Rolling Hills, Objective for Open Country); consumers updated in-cycle are the entrance (P7) and the worker board list (P5/P6). Same cheap-case as Cycle 58's `soloLadder`. Authorized for P5 and P7.
- **[`js/OptimizedSheep.js`](../js/OptimizedSheep.js)** (cycle-specific freeze; not on the durable fence): additive `capacity`/`activeCount` split + `activateSheepBatch`. Migration story: `maxCapacity` defaults to `sheepCount`, threaded through the existing `opts` arg, so standard modes are structurally and numerically identical and all current call sites/tests are untouched. Authorized for P2.

## Hard stops

Durable hard stops apply on every cycle — see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. **Standard-mode sheep drift.** If any change moves the refactor-baseline or completion-count fixtures for a standard run, stop. Ceiling-sizing and activation are counting-only.
2. **Leaderboard schema creep.** If any phase wants a D1 migration, a new `score_submissions` column, or a `counting_*_best` PlayerRow column, stop. Counting reads live from `score_submissions`.
3. **Existing-board regression.** If the counting read path changes the membership or ordering of any existing `solo:<count>` or non-solo board, stop. It must be purely additive.
4. **Bundle-size regression.** Surface the byte delta before any ratchet bump; the React additions are the likely culprit.
5. **Sim/MP boundary.** Counting is solo and client-side. If any phase reaches into `shared/` sim core or the Worker DO tick, stop and surface.

## What NOT to do during this cycle

- No D1 migration. No new `score_submissions` column. No `counting_*_best` materialized column.
- No standard-mode sheep behavior change. The capacity split is gated and defaults to today's behavior.
- No second locale (English only).
- No multiplayer Counting Sheep (that moves the controller into `shared/` under determinism discipline; a later cycle).
- No persistent local personal-best readout yet (ship the summary's just-counted total; PB display is a later cycle).
- No version bump. No marketing/devlog post. Final curve naming and feel are a paired close-note, not an autonomous edit.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean (bundle within ratchet, or a recorded bump).
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When a Counting Sheep run is played on Home Field and Rolling Hills, both curves shall advance rounds on full-pen and bank a counted score.
- [ ] When a counting score is banked, it shall appear on the matching per-curve leaderboard ranked highest first, with no existing board regressed and no D1 migration applied.
- [ ] When the entrance is opened, Home Field and Rolling Hills shall offer a Counting Sheep family and Open Country shall present its own Objective family, with single-family worlds unchanged.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) — pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
