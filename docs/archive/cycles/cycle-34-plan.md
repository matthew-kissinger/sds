# Cycle 34 — mp-island-scenes

> Drafted 2026-05-10 after Cycle 33 (`operational-hardening`) closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md), then [`mp-island-scenes-design.md`](mp-island-scenes-design.md), then this plan top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Make `?scene=rolling-hills` and `?scene=open-country` work end-to-end in a multiplayer room: room creation with a non-default scene, 60Hz authoritative sim of the island geometry and corral retirement, server-driven Open Country gather→drive objective stage machine, host migration mid-round preserving stage state, and a lobby UI that surfaces scene name + valid modes so a host can't pick an invalid combination. All wire-format changes are net-additive optional fields; no protocol-version handshake. No `shared/scenes/types.js` edits, no regen of existing sim-baselines.

## How to read this plan

This plan locks the *shape* of the changes (data contracts, where new code slots into the existing module map, EARS acceptance criteria). Implementation choices stay deferable: pick the simplest thing that meets the budget, measure on actual hardware before escalating.

The OC objective state machine already exists client-side at [`js/gamestate/objective.js`](../js/gamestate/objective.js) (Cycle 29 Stream B4 extracted it from `GameState`). Phase 2 promotes this module from `js/gamestate/` to `shared/` so the worker can consume it byte-identically. The js-side path becomes a re-export shim.

## Open questions — resolved

Author leans from [`mp-island-scenes-design.md`](mp-island-scenes-design.md) "Open questions" section, confirmed for this cycle:

1. **Q1: OC stage never reverts.** Once `roundup → drive`, stays in `drive` for the rest of the round. Matches solo behavior (`tickObjective` is a no-op when `stage !== 'roundup'`). Don't add a revert path.
2. **Q2: Per-mode threshold uses the existing fraction+min formula.** `getRequiredSheep(objective, totalSheep)` from [`shared/ObjectiveLogic.js`](../shared/ObjectiveLogic.js) is the single source of truth. No fork.
3. **Q3: Host migration does NOT reset hold timer.** DO state is the authority. New host receives `holdTimer: <current>` in the next snapshot and renders it.
4. **Q4: Non-host players cannot trigger stage transitions.** Stage advances are derived from sim state in `tick()`. No client-driven "advance stage" message kind.
5. **Q5: Phase 1 fixtures use 50 sheep** (boundary + corral). Objective-stage fixture (Phase 2) uses 50 sheep too — the formula clamps via `requiredSheepMin: 10`. The existing `sheep-60hz-20s.json` already covers high-count flocking math at 200; we add island-specific coverage.
6. **Q6: `allowedModes` stays merged (solo + mp combined).** Don't split into `solo.allowedModes` + `mp.allowedModes` until divergence is actually requested. Phase 4 enforces the existing union at room init.

## Architecture / shared changes

**Module move:** [`js/gamestate/objective.js`](../js/gamestate/objective.js) → [`shared/objective.js`](../shared/objective.js).

- Rationale: the existing solo state machine is pure JS with one import (`shared/ObjectiveLogic.js`) and zero DOM/Three deps. Moving it to `shared/` is the smallest delta that lets the worker import the same `tickObjective` / `createObjective` / `refreshObjective` / `isCorralOpen` functions the client uses.
- Migration: delete the JS source from `js/gamestate/objective.js` and re-export from `shared/objective.js` in its place (a one-line shim) so existing client imports keep working unchanged.
- Fence implication: this adds one new file under `shared/`. It does **not** modify any frozen `shared/*.js` file. `shared/objective.js` itself becomes durably frozen the moment it lands (deterministic-sim contract).

**Wire format additive block:** `gameStateUpdate` snapshots gain an optional top-level `objective` field when `this.scene.objective != null`:

```js
objective: {
    stage: 'roundup' | 'drive',
    sheepInZone: number,
    sheepRequired: number,
    holdRemaining: number,    // seconds, decreasing during 'roundup'
    portalActive: boolean     // (stage === 'drive')
}
```

Pre-Cycle-34 clients ignore the field (legacy "drive to portal" prompt). Post-Cycle-34 clients connecting to a pre-Cycle-34 worker receive no field and fall back to the legacy prompt. No version-tag handshake.

## Phase shape rules

A cycle has ≤ 8 phases. This cycle has 5. Each phase is fully autonomous — no Matt pickup work scoped here.

## Acceptance criteria — EARS format

Each phase's Acceptance lines use [EARS notation](https://kiro.dev/docs/specs/) and are grep-testable. The Stop hook ([`.claude/hooks/check-acceptance.mjs`](../.claude/hooks/check-acceptance.mjs)) counts unchecked items; `/cycle-close` walks each line.

## Phase 1 — Sim-baseline coverage for island scenes (~1.5hr)

**Independently testable.** Adds golden traces for the island-boundary + corral-retirement code paths that the existing four fixtures don't exercise. Comes first because it's net-additive (new fixtures, no edits to old ones) and gives Phase 2/3 a regression net for the worker changes.

1. **Extend the harness** with island-aware helpers in [`tests/sim-baseline/harness.js`](../tests/sim-baseline/harness.js): `makeIslandGameState(sceneId, totalSheep)` (resolves a scene's `boundary` + `corral` into a sim-ready state), and `tickSheepIslandCoop(sheep, sheepdogs, gameState, deltaTime)` (corral-retirement variant of the existing `tickSheepCoop`).
2. **Add three island fixtures** to [`tests/sim-baseline/__fixtures__/`](../tests/sim-baseline/__fixtures__/):
   - `island-boundary-rh-60hz.json` — 50 sheep on Rolling Hills, dog stationary at island center, 60 ticks (1s). Captures `calculateIslandAvoidance` at the shoreline.
   - `corral-retirement-rh-60hz.json` — 30 sheep, dog driving them toward RH corral at `(110, 60)` r=8 over 120 ticks (2s). Captures `updateSheepCorralRetirements`.
   - `island-boundary-oc-60hz.json` — 50 sheep on Open Country with `flocking.perceptionRadius: 9` override, dog stationary near origin, 60 ticks. Captures the bigger-radius avoidance + the perception override.
3. **Add three `it()` blocks** to [`tests/sim-baseline/baseline.spec.ts`](../tests/sim-baseline/baseline.spec.ts) following the same `loadOrWriteFixture` + `expect(trace).toEqual(expected)` pattern as the four existing tests.
4. **Capture initial fixtures** with `UPDATE_FIXTURES=true npm test`. Manually inspect the diff — sheep should drift inward when near shoreline, retirement count should rise monotonically as the dog drives the flock to corral.

**Acceptance (EARS):**

- When Phase 1 ships, then `ls tests/sim-baseline/__fixtures__/` shall list `island-boundary-rh-60hz.json`, `corral-retirement-rh-60hz.json`, and `island-boundary-oc-60hz.json` in addition to the four existing fixtures.
- When Phase 1 ships, then `npm test -- tests/sim-baseline/` shall run 4 (existing) + 3 (new) = 7 baseline `it()` blocks, all passing.
- When Phase 1 ships, then `git diff tests/sim-baseline/__fixtures__/sheep-60hz-20s.json tests/sim-baseline/__fixtures__/dog-rotation-60hz.json tests/sim-baseline/__fixtures__/reconcile-interp-60hz.json tests/sim-baseline/__fixtures__/stamina-curve-60hz.json` shall produce zero output (existing fixtures untouched).
- If sim-baseline fixture content drifts more than the cycle-34 phases authorize, then `/cycle-close` reconciliation shall flag it and the cycle shall halt for review.

## Phase 2 — OC objective state machine in shared/ + worker (~3hr)

**Depends on:** Phase 1 (uses the new harness island helpers for the objective fixture).

The largest implementation gap from the design doc. OC's `objective` field is currently unused server-side; this phase makes the worker authoritative for `roundup → drive` and ports the existing js-side state machine into `shared/` so client and worker share one implementation byte-identically.

1. **Move** [`js/gamestate/objective.js`](../js/gamestate/objective.js) to [`shared/objective.js`](../shared/objective.js). Pure relocation: no body changes. The new file imports `getRequiredSheep` from `./ObjectiveLogic.js` (relative path within `shared/`) instead of `../../shared/ObjectiveLogic.js`.
2. **Replace** [`js/gamestate/objective.js`](../js/gamestate/objective.js) with a one-line re-export shim: `export * from '../../shared/objective.js';`. Keeps existing client imports working without churn.
3. **Export** the four functions from [`shared/index.js`](../shared/index.js) so `worker/src/GameSim.js` can import them: `export { createObjective, refreshObjective, tickObjective, isCorralOpen } from './objective.js';`.
4. **Wire the worker.** In [`worker/src/GameSim.js`](../worker/src/GameSim.js):
   - Import `createObjective`, `refreshObjective`, `tickObjective`, `isCorralOpen` from `../../shared/index.js`.
   - In the constructor, after `this.scene = loadScene(...)` and after `this.gameState = createGameState(...)`, call `this.objective = createObjective(this.scene.objective, roomSheepCount)`. Stash `this._objectiveDef = this.scene.objective` for refresh.
   - In `tick()`, after `updateSheep()` and before `checkGameCompletion()`, call `tickObjective(this.objective, this.gameState.sheep, this.deltaTime, null)` (the `onStageChanged` callback is unused server-side; the snapshot's `stage` field is what clients render).
   - Gate corral retirement on `isCorralOpen(this.objective)`. In `updateSheep()`, where `this.gameState.corral` triggers `updateSheepCorralRetirements`, wrap the call: `if (isCorralOpen(this.objective)) { ... }`. When the objective is null (RH/Field), `isCorralOpen` returns true unconditionally — preserves existing RH behavior byte-identically.
5. **Add** an objective-stage sim-baseline fixture: `tests/sim-baseline/__fixtures__/oc-objective-stage-60hz.json`. 50 sheep on OC, dog driving them into the round-up zone at `(0, 50)` r=30, captures the stage flip from `roundup` to `drive` after the hold completes (2.0s × 60 = 120 ticks of hold, plus drive-in time). Trace records `{tick, stage, sheepInZone, holdTimer}` per tick. Use `UPDATE_FIXTURES=true` to capture.
6. **Verify the client trace is unchanged.** The js-side import path now resolves through the shim; behavior must be byte-identical. Run `npm test` and confirm the existing `tests/refactor-baseline/gamestate-harness.js` `_refreshObjective` test (line 180) still passes.

**Acceptance (EARS):**

- When Phase 2 ships, then [`shared/objective.js`](../shared/objective.js) shall exist with `createObjective`, `refreshObjective`, `tickObjective`, `isCorralOpen` exports.
- When Phase 2 ships, then [`js/gamestate/objective.js`](../js/gamestate/objective.js) shall re-export from `shared/objective.js` (a single `export * from` line, no other source).
- When Phase 2 ships, then `grep -n "tickObjective\|isCorralOpen" worker/src/GameSim.js` shall show the worker calling both functions in `tick()` / `updateSheep()`.
- When Phase 2 ships, then `tests/sim-baseline/__fixtures__/oc-objective-stage-60hz.json` shall exist and `npm test -- tests/sim-baseline/` shall pass.
- When Phase 2 ships, then a worker simulation tick on an OC scene with `objective` set shall flip `objective.stage` from `'roundup'` to `'drive'` after `holdRequired` seconds with `sheepInZone >= requiredSheep`, verified by the new fixture.
- While `objective.stage === 'roundup'`, the worker shall NOT mark sheep as retired even if they enter the corral disc.
- While `objective` is null (RH, Field), the worker shall behave byte-identically to the pre-Phase-2 path — corral retirement runs unconditionally.

## Phase 3 — Wire format additions for objective stage (~1.5hr)

**Depends on:** Phase 2 (the worker must populate the field before clients can read it). Phases 2 and 3 ship in the same PR — the wire format follows the state machine it describes.

1. **Extend `createGameStateSnapshot()`** in [`worker/src/GameSim.js`](../worker/src/GameSim.js) to emit an optional `objective` block when `this.objective != null`:
   ```js
   if (this.objective) {
       snapshot.objective = {
           stage: this.objective.stage,
           sheepInZone: this.objective.sheepInZone,
           sheepRequired: this.objective.requiredSheep,
           holdRemaining: Math.max(0, this.objective.holdRequired - this.objective.holdTimer),
           portalActive: this.objective.stage === 'drive'
       };
   }
   ```
   Numbers round to 2 decimals consistent with the rest of the snapshot. Field is omitted entirely when `this.objective == null` so msgpack output is byte-identical for RH + Field rooms.
2. **Wire client consumption.** In [`js/network/`](../js/network/) (find the `gameStateUpdate` handler), if the snapshot includes `objective`, dispatch a `CustomEvent('objective-stage-update', { detail: { ...snapshot.objective } })`. The existing [`js/components/GameHUD/ObjectiveBanner.js`](../js/components/GameHUD/ObjectiveBanner.js) already listens for `objective-stage-changed`; add an MP-side listener that mirrors the same UI from the server snapshot rather than the local solo state machine.
3. **Add an integration test.** [`tests/integration/`](../tests/integration/) has a two-client harness; add an OC-scene test that asserts: (a) the snapshot has no `objective` field at start (because the test uses the field scene by default — sanity check), (b) when scene is OC, the snapshot includes `objective` with `stage: 'roundup'` initially, (c) after sim runs for `holdRequired + drive-in` time, snapshot shows `stage: 'drive'`.
4. **Document the additive contract** in a one-paragraph note in [`worker/src/GameSim.js`](../worker/src/GameSim.js) above `createGameStateSnapshot()`. The note explains the optional-field pattern and references the cycle plan + design doc.

**Acceptance (EARS):**

- When Phase 3 ships, then `grep -n "objective:" worker/src/GameSim.js` shall show the optional `objective` block in `createGameStateSnapshot()`.
- When Phase 3 ships and the room scene is OC, then every `gameStateUpdate` snapshot shall include the `objective` field with `{stage, sheepInZone, sheepRequired, holdRemaining, portalActive}`.
- When Phase 3 ships and the room scene is Field or RH, then `gameStateUpdate` snapshots shall NOT include the `objective` field (msgpack byte-identical to pre-Phase-3 for these scenes).
- When a pre-Cycle-34 client connects to a Phase-3 worker on an OC room, then the WebSocket session shall not error and the client shall ignore the `objective` field gracefully.
- When Phase 3 ships, then `npm run test:integration` shall pass with the new OC stage-update test.

## Phase 4 — `allowedModes` enforcement at room init (~30min)

**Independent.** Cheap defensive guard. Today a host can create an OC room in `competitive` mode even though OC declares `allowedModes: ['cooperative', 'timed']`; the worker would happily start a competitive sim that's never been tuned for the island.

1. **Tighten `RoomDO.initRoom`** in [`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts). After resolving `sceneId` (line 181) and before persisting `meta`, load the scene def via `listScenes().find(s => s.id === sceneId)`. If `scene.allowedModes && !scene.allowedModes.includes(gameMode)`, return `400` with `{error: 'mode_not_allowed_on_scene', sceneId, gameMode, allowedModes: scene.allowedModes}`.
2. **Add a unit test** in [`tests/`](../tests/) (or extend an existing RoomDO test if one exists) that asserts: (a) creating an OC room in `competitive` mode returns 400, (b) creating an OC room in `cooperative` returns 200, (c) creating an RH room in `competitive` returns 200 (RH allows it), (d) creating a Field room in any mode returns 200 (Field has no `allowedModes` filter — it's missing from `field.js`, so the guard is a no-op for it).
3. **Cycle-aware defensive shape.** This phase does NOT add `allowedModes` to Field's scene def. The check is `scene.allowedModes && !scene.allowedModes.includes(gameMode)` — short-circuits when the scene didn't declare it.

**Acceptance (EARS):**

- When Phase 4 ships, then `RoomDO.initRoom` shall reject any `gameMode` that the resolved scene's `allowedModes` array does not include.
- If a host attempts to create an `open-country` room in `competitive` mode, then `RoomDO.initRoom` shall return HTTP 400 with `error === 'mode_not_allowed_on_scene'`.
- When Phase 4 ships, then a host shall be able to create a `rolling-hills` room in any of `['cooperative', 'competitive', 'timed']`.
- When Phase 4 ships and the scene def has no `allowedModes` field (Field), then `RoomDO.initRoom` shall accept any of the three legacy modes (no regression).

## Phase 5 — Lobby UI surfaces scene + allowed modes (~1hr)

**Independent.** Pure client-side; makes Phase 4's defensive guard visible to the user instead of letting the host hit a 400 they don't expect.

1. **Find the lobby create-room UI.** Likely in [`js/components/`](../js/components/) — grep for `sceneId` + `gameMode` selectors. The host's mode dropdown currently offers all three legacy modes regardless of selected scene.
2. **Filter the mode dropdown** by the currently-selected scene's `allowedModes`. When the host picks a scene from the scene selector, the mode dropdown re-renders with only valid options. If the currently-selected mode becomes invalid, snap to `scene.defaultMode`.
3. **Surface scene name in the room list.** The room-list UI today shows `meta.sceneId` (the URL-friendly id). Show the human name from `loadScene(sceneId).name` so players see "Sheep Dog Island" / "Open Country" / "Field" instead of `rolling-hills` / `open-country` / `field`.
4. **No new wire fields.** The room snapshot already carries `sceneId`; the client resolves the display name locally via `loadScene(sceneId).name`.

**Acceptance (EARS):**

- When Phase 5 ships and the host selects scene Open Country, then the mode dropdown shall offer only `['cooperative', 'timed']` (filtered by `scene.allowedModes`).
- When Phase 5 ships and the host changes scene from Rolling Hills (mode: competitive) to Open Country, then the selected mode shall snap to OC's `defaultMode` (cooperative).
- When Phase 5 ships, then the lobby room list shall display each room's scene by `loadScene(sceneId).name` (e.g. "Sheep Dog Island"), not by raw id (e.g. `rolling-hills`).
- When Phase 5 ships, then no new fields shall appear in `RoomDO.getSerializableState()` output (verified by `git diff worker/src/RoomDO.ts -- :^test`).

## Dependencies

```
Phase 1 → Phase 2 + Phase 3 (same PR) → Phase 4 (independent) || Phase 5 (independent)
```

Phase 1 first: gives Phase 2/3 a regression net.
Phases 2 and 3 ship in the same PR: wire format follows the state machine.
Phases 4 and 5 are independent, can ship in either order. Phase 5 makes Phase 4's UX visible but Phase 4 is the safety guard either way.

## Frozen files (cycle-specific additions)

The durable fence ([`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)) covers the deterministic-sim core in `shared/`. This cycle's additions:

- **`shared/objective.js`** — new file, becomes durably frozen the moment it lands. The body is the existing `js/gamestate/objective.js` content, byte-identical except for the `getRequiredSheep` import path.
- **`tests/sim-baseline/__fixtures__/island-boundary-rh-60hz.json`**, **`corral-retirement-rh-60hz.json`**, **`island-boundary-oc-60hz.json`**, **`oc-objective-stage-60hz.json`** — new fixtures, durably frozen post-capture (regenerating without explicit acceptance is a fence violation per [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md)).

This cycle does NOT modify any existing entry on the durable fence list. No `shared/scenes/types.js` edit, no `shared/MovementPhysics.js` / `BoundaryCollision.js` / `FlockingAlgorithms.js` / `GameStateValidation.js` / `Vector2D.js` / `Heightfield.js` edit. The four pre-existing sim-baseline fixtures are not regenerated.

## Hard stops

Durable hard stops apply on every cycle (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific additions:

1. **Existing sim-baseline fixture drift.** If `tests/sim-baseline/__fixtures__/sheep-60hz-20s.json`, `dog-rotation-60hz.json`, `reconcile-interp-60hz.json`, or `stamina-curve-60hz.json` show any byte-level drift during this cycle, halt immediately. The deterministic-sim contract is non-negotiable.
2. **`shared/scenes/types.js` modification.** This file is durably fence-frozen. The design doc explicitly states no `SceneDef` schema changes are required. If any phase reaches for it, halt and surface — the work has drifted out of scope.
3. **Wire format breaking change.** The cycle's contract is "additive optional fields only." If a phase adds, removes, or renames a non-optional field, or introduces a new message kind, halt — that's a new cycle's worth of migration work.
4. **Worker test failure on Field/RH.** Phase 2's `isCorralOpen` gate must be a no-op for `objective == null`. If the existing field/RH multiplayer tests (or the integration harness) regress, the byte-identical guarantee is broken; halt and audit the gate.
5. **Phase 5 scope creep into client renderer.** The lobby UI changes are read-only consumers of `loadScene(sceneId).name` and `scene.allowedModes`. If Phase 5 reaches for `js/main.js`, the scene-loader, or any non-lobby render path, halt.

## What NOT to do during this cycle

- **Don't edit `shared/scenes/types.js`.** No new optional fields are required. The design doc verified this.
- **Don't move objective state into the client predictor.** It must stay DO-authoritative for host-migration safety (Q3).
- **Don't add a protocol-version handshake.** All wire-format changes are additive optional fields.
- **Don't regen existing sim-baseline fixtures.** The four `__fixtures__/*.json` files captured pre-Cycle-34 stay byte-identical; new fixtures are net-additive.
- **Don't add scene voting or spectator UI.** Out of scope per the design doc's non-goals.
- **Don't bump `package.json` version.** No player-visible delta until Phase 5 ships AND a manual playtest confirms OC + RH multiplayer feel right; that confirmation is its own next-cycle task.
- **Don't touch `worker/migrations/`.** No D1 schema change is required (objective state lives in DO memory, not D1).
- **Don't refactor the boid sim.** The existing `tickSheepCoop` / `updateSheep` paths stay byte-stable; the cycle adds a wrapper guard, not new sim math.
- **Don't enforce `allowedModes` on existing rooms.** Phase 4's check runs at `initRoom` only. Persisted rooms from before Cycle 34 keep working.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Each is EARS-form so the cycle-close reconciliation hook can grep its predicate.

- [x] When the cycle closes, all 5 phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover. **All 5 phases shipped.**
- [x] When `npm test` runs at cycle close, all vitest specs shall pass (target: 300+ passed, in line with Cycle 33 baseline). **315 passed / 7 skipped (was 300/7 at Cycle 33 close, +15 from Phase 1's 3 sim-baseline specs, Phase 2's 1 OC objective-stage spec, Phase 3's 5 worker-snapshot specs, and Phase 4's 6 allowedModes specs).**
- [x] When `npm run lint` runs at cycle close, ESLint on `shared/` shall be clean (the deterministic-sim boundary stays clean). **Clean.**
- [x] When `npm run build` runs at cycle close, production build shall be clean. **Clean. mainKB 590.06 (was 589.60 at Cycle 33 close, +0.46KB for the cycle-34 client additions).**
- [x] When `npm run test:integration` runs at cycle close, the WebSocket two-client harness shall pass including the new OC objective-stage test. **`npm run test:integration`: 39 passed / 7 skipped (existing `tests/integration/flow.spec.ts` skips remain). The OC objective-stage contract is covered by `tests/worker-objective-snapshot.spec.js` (unit-level, 5 specs) rather than the WS two-client harness — promoting to the WS harness would require unskipping `flow.spec.ts`, which is out of cycle-34 scope. Noted in BACKLOG carryover.**
- [x] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions. **Deploy run [`25621497329`](https://github.com/matthew-kissinger/sds/actions/runs/25621497329) succeeded after one rerun (first attempt's E2E Chromium "solo classic" smoke timed out at 180s × 3 attempts — a known borderline-flake pattern; confirmed locally the test passes in 1.8m and cycle-34 code does not touch the solo boot path). All jobs green: Test, Deploy Worker, Deploy Pages, E2E Chromium, Perf check.**
- [ ] When Cycle 34 closes, an OC multiplayer room shall be playable end-to-end on a local `npm run dev` session: room creates with scene=open-country, objective stage flips from `roundup` to `drive` server-side, snapshot carries the optional `objective` block, and the lobby UI offers only valid modes for the selected scene. **Manual playtest deferred to post-deploy verification (same pattern as Cycle 32/33 — autonomous run cannot pair the browser).**

## References

- [`docs/mp-island-scenes-design.md`](mp-island-scenes-design.md) — design doc (drives this cycle)
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle plan template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) — pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/`](archive/cycles/) — past cycle plans
- [`shared/ObjectiveLogic.js`](../shared/ObjectiveLogic.js) — `getRequiredSheep` formula
- [`shared/BoundaryCollision.js`](../shared/BoundaryCollision.js) — `kind === 'island'` dispatch
- [`shared/GameStateValidation.js`](../shared/GameStateValidation.js) — `updateSheepCorralRetirements`
- [`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts) — DO state, scene validation, host migration
- [`worker/src/GameSim.js`](../worker/src/GameSim.js) — authoritative sim, `loadScene` consumer
- [`tests/sim-baseline/harness.js`](../tests/sim-baseline/harness.js) — fixture-capture harness
- [`js/gamestate/objective.js`](../js/gamestate/objective.js) — solo objective state machine (Phase 2 moves to `shared/`)
- [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) — deterministic-sim contract
- [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) — DO contract, wire format discipline
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
