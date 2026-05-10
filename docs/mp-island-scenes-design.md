# MP Island Scenes — Design Doc (Cycle 33 → primes Cycle 34)

> Drafted 2026-05-10 during Cycle 33 Phase 5. This is a **design** doc, not implementation. It scopes the work for "Rolling Hills and Open Country playable in multiplayer rooms" so Cycle 34 can start on architecture instead of design.

## Goal

Make `?scene=rolling-hills` and `?scene=open-country` work end-to-end in a multiplayer room: from room creation with a non-default scene, through 60Hz authoritative sim of the island geometry and corral/portal mechanics, through host migration mid-round, to a clean leaderboard submission tagged with the right scene id.

Today, RoomDO already accepts `sceneId` at room init and persists it. `GameSim.js` already calls `loadScene(room.sceneId)` and consumes `scene.boundary`, `scene.corral`, and `scene.flocking`. **The basics work.** What's missing is the multi-stage objective state for Open Country (the `objective.roundupZone` "gather → drive → portal" mechanic), explicit confirmation that the heightfield-modulated boid behavior is identical between worker and client, and sim-baseline coverage that catches MP desyncs on the island scenes before they ship.

## Non-goals (out of scope for the cycle this doc primes)

- **Custom modes per island** — cooperative-only on RH/OC remains. RH already declares `allowedModes: ['cooperative', 'competitive', 'timed']` in its scene def, but the worker has never been validated for competitive-on-island. OC declares `['cooperative', 'timed']` only. Stay in the cooperative lane this cycle.
- **Host-set difficulty / sheep counts** — RoomDO already has `ALLOWED_SHEEP_COUNTS` (200/250/500/1000/3000/5000) and the host picks at room creation. Same allow-list applies on RH/OC; no new control surface.
- **Scene voting in the lobby** — the room-creator's choice is locked. No voting UI.
- **Spectator on islands** — spectator mode is its own deferred item.
- **Replay / recording** — out of scope; only the live-room sim path is exercised.

## What works today (verified read of current code)

- **`RoomDO` (worker/src/RoomDO.ts)** validates `sceneId` against `listScenes()` at init and persists it. `getSerializableState()` includes `sceneId` in every `roomUpdated` broadcast. The wire protocol already carries the scene id from worker to all clients.
- **`GameSimulation` (worker/src/GameSim.js:52)** calls `loadScene(room.sceneId || DEFAULT_SCENE_ID)` and reads `this.scene.boundary`, `this.scene.corral`, `this.scene.flocking`, `this.scene.sheepSpawn`. The boid `perceptionRadius` override that `open-country.js` declares is wired via `{...(this.scene.flocking || {})}` at `GameSim.js:101`.
- **Boundary collision (`shared/BoundaryCollision.js:62`)** dispatches on `boundary.kind === 'island'` and runs the radial avoidance path. Both worker and client run this same code (it's in `shared/`). Sheep cannot leave the island under MP today, the same way they can't under solo.
- **Corral retirement (`shared/GameStateValidation.js`)** `updateSheepCorralRetirements` is called at `GameSim.js:619` when `gameState.corral` is set. Rolling Hills has `scene.corral = { center: { x: 110, z: 60 }, radius: 8 }`; the worker already retires sheep into it under MP.
- **Heightfield is rendered, but not consumed by the sim.** The boid sim is 2D (`Vector2D` x/z, no y). `Heightfield.sample()` is for terrain rendering and entity Y-clamp on the client; sheep flocking and dog movement physics are flat. So heightfield divergence between worker and client cannot desync the sim — there's nothing in the sim path that reads it.

## What's missing today (verified gaps)

### 1. Open Country's multi-stage objective is not in the worker sim

OC's scene def declares:

```js
objective: {
    roundupZone: { x: 0, z: 50, radius: 30 },
    requiredSheepFraction: 0.40,
    requiredSheepMin: 10,
    holdRequired: 2.0
}
```

Solo mode runs the "gather a fraction of the flock into the round-up zone for 2.0 seconds before the portal accepts retirement" mechanic. **The worker `GameSim.js` does not read `scene.objective` anywhere** (grep `objective` in the file returns zero matches outside the `objective.scene-id` reference in scene def comments). In MP today, OC plays as plain corral retirement: any sheep that wanders within `scene.corral.radius = 9` of `(0, 295)` retires immediately. The "stage 1: hold 80 sheep in the round-up zone" gate does not exist server-side.

This is the **largest implementation gap** and the load-bearing reason for a cycle.

### 2. No sim-baseline coverage for island scenes

`tests/sim-baseline/__fixtures__/` contains four 60Hz fixtures:

- `sheep-60hz-20s.json`
- `dog-rotation-60hz.json`
- `reconcile-interp-60hz.json`
- `stamina-curve-60hz.json`

All four were captured against the default field scene (rect bounds + gate + pasture). None exercise `boundary.kind === 'island'`, none exercise corral retirement, and none cover the OC objective state machine. A worker change to `BoundaryCollision.calculateIslandAvoidance` could pass the existing baselines while desyncing RH/OC clients mid-game.

### 3. Wire format does not carry objective stage state

`createGameStateSnapshot()` (`GameSim.js:996`) sends per-sheep `{ id, x, z, vx, vz, state, facing, hasPassedGate, isRetiring, [assignedGate], [targetX, targetZ] }`. There is no field for "current objective stage", "sheep-in-roundup-zone count", "hold timer remaining", or "portal accepting retirement (boolean)". The OC mechanic needs all four.

### 4. Host migration does not snapshot objective stage state

`handlePlayerLeave()` (`RoomDO.ts:578`) reassigns `meta.hostId` to the next player and broadcasts `hostChanged`, but it does not touch `simulation` state. For corral mode that's fine (sim state lives in the DO already). For an objective-stage state machine, the same thing holds — **as long as the stage state lives in the DO, not the host's client predictor**. This rules out a "client computes stage transitions, server confirms" architecture; the DO owns the stage timer.

### 5. Mode validation does not honour `allowedModes`

`RoomDO.ts:177` only validates `['cooperative', 'competitive', 'timed']`. It does not cross-check `scene.allowedModes`. A host could create an OC room in `competitive` mode today even though OC declares `allowedModes: ['cooperative', 'timed']`; the worker would happily start a competitive sim that's never been tuned for the island.

## Proposed scope for the next cycle

### Phase 1 — Sim-baseline coverage for island boundaries (~1.5hr)

Add three new 60Hz fixtures to `tests/sim-baseline/__fixtures__/`:

- `island-boundary-rh-60hz.json` — 20s trace of one dog + 50 sheep inside Rolling Hills' island boundary. Captures `calculateIslandAvoidance` at the shoreline.
- `corral-retirement-rh-60hz.json` — 20s trace of one dog driving 30 sheep into RH's corral at `(110, 60)`. Captures `updateSheepCorralRetirements`.
- `island-boundary-oc-60hz.json` — 20s trace inside OC's larger island. Captures the bigger-radius avoidance + the OC `flocking.perceptionRadius: 9` override.

Use the existing `harness.js` mulberry32 seeded approach. Acceptance: `npm test` runs all four existing baselines plus the three new ones, all passing.

### Phase 2 — OC objective state machine in the worker (~3hr)

Add a stage state machine to `GameSim.js`, gated on `this.scene.objective != null`:

```
stage: 'gather' → 'driving' → 'portal'
stageStartedAt: <ms>
sheepInRoundupZone: <int> (recomputed per tick)
holdTimerRemaining: <seconds>
portalAcceptingRetirement: <bool>
```

State transitions:

- `gather → driving` when `sheepInRoundupZone >= getRequiredSheep(objective, totalSheep)` for `holdRequired` seconds.
- `driving → portal` is implicit; the portal flips to "accepting" when stage is `driving` and the fraction is still met (or the threshold can drop, TBD in Q-list below).
- `portal → end` when all sheep retired or game-completion condition.

This module already exists in solo (`shared/ObjectiveLogic.getRequiredSheep`); the cycle ports the per-tick state machine into `shared/` and wires it into both worker and solo client (replacing whatever solo-side state owns this today). Sim-baseline fixture: `oc-objective-stage-60hz.json`.

### Phase 3 — Wire format additions for objective stage (~1.5hr)

Extend `createGameStateSnapshot()` to include an optional `objective` block when `this.scene.objective != null`:

```js
objective: {
    stage: 'gather' | 'driving' | 'portal',
    sheepInZone: <int>,
    sheepRequired: <int>,
    holdRemaining: <number>,    // seconds, decreasing during 'gather'
    portalActive: <bool>
}
```

Migration story: the field is **optional**. Clients on the old protocol joining an OC room receive a snapshot with no `objective` field; their UI shows the legacy "drive to portal" prompt instead of stage-aware HUD. New clients joining a Field room get no `objective` field either (Field has no `scene.objective`). Backwards-compatible by construction.

`@msgpack/msgpack` handles missing keys natively. No DO migration needed. No version-tag handshake needed; the field is purely additive.

### Phase 4 — `allowedModes` enforcement at room init (~30min)

In `RoomDO.initRoom()`, after `loadScene(sceneId)`, check `scene.allowedModes.includes(gameMode)`. If not, return `400` with a clear error. Defensive but cheap.

### Phase 5 — Lobby UI surfaces scene name and allowed modes (~1hr)

The room list and lobby UI already shows `meta.sceneId`. Surface `scene.name` ("Sheep Dog Island", "Open Country") and `scene.allowedModes` so the host's mode dropdown only offers valid options. Pure client-side.

(Phases 1–5 fit a Cycle-34 plan with one phase of slack for cycle close. If sim-baseline regen surprises drop a fifth fixture, push Phase 5 to BACKLOG.)

## Sim-baseline regeneration plan

This cycle's design phases **add** baselines for paths that have no coverage. They do not regenerate existing baselines. The three (or four, with `oc-objective-stage-60hz.json`) new fixtures are net-additive: any future change to the island avoidance, corral retirement, or objective-stage code will diff against them.

Acceptance line phrasing for the cycle that does this:

> When Phase 1 ships, then `tests/sim-baseline/__fixtures__/island-boundary-rh-60hz.json` shall exist and `npm test` shall pass.

If a phase **modifies** an existing baseline, the cycle plan must explicitly say so in its Acceptance section per [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md):

> When Phase X ships, then `tests/sim-baseline/__fixtures__/sheep-60hz-20s.json` shall be regenerated; the diff from the prior fixture is expected because <reason>.

This cycle's design **does not** regenerate existing baselines.

## Scene-def MP-awareness

No new fields on `SceneDef` are required. The three already-shipped fields cover everything:

- `boundary` (rect or island) — already MP-aware via `BoundaryCollision`.
- `corral` — already consumed in `GameSim.js`.
- `objective` — declared on OC but unused server-side; Phase 2 fixes this.

Soft fence on `shared/scenes/types.js`: adding any new optional field for MP-only behavior should default sensibly so existing scenes work unchanged. No additions are needed for this cycle.

## Host migration semantics for objective state

Because the stage state machine lives in the DO (not the host's client predictor), host migration is a **no-op for objective state**. The DO continues running `tick()` regardless of which client is flagged `isHost`. The new host's client receives the next `gameStateUpdate` with the current `objective` block and renders it; no replay or rollback.

The only host-specific responsibility is the `startGame` message (`RoomDO.ts:412`). Once started, the host has no special simulation role.

This is a **deliberate property of the design**, not a coincidence. If we ever push stage logic into the client predictor for latency reasons, host migration becomes much harder.

## Wire format migration story (for in-flight sessions)

Phases 1–4 above add **only optional fields** to existing message kinds. No new message kinds. No removed fields. No rename. A pre-cycle-34 client connecting to a post-cycle-34 worker:

- Receives `gameStateUpdate` with an `objective` field it ignores. Behavior degrades to "no stage HUD, plain portal-retirement prompt." Sheep still flock correctly because the per-sheep block is unchanged.
- Joins OC rooms without rejection — the worker doesn't gate on client version.

A post-cycle-34 client connecting to a pre-cycle-34 worker:

- Receives `gameStateUpdate` without an `objective` field. The stage HUD reads `null` and falls back to the legacy "drive to portal" prompt.

Both directions are safe. **No version-tag handshake is needed**, which preserves the [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) "identity rides the WebSocket URL, no post-upgrade hello" property.

## Open questions for the cycle that uses this doc

- **Q1: Does the OC stage state ever revert?** If sheep are driven into the round-up zone and then the dog accidentally chases them back out, does the stage drop from `driving` back to `gather`? **Author lean:** no — once the threshold-hold is met, the portal stays open. Reverting punishes momentum and the portal is far enough that the player has earned the close-out. This matches what the solo mechanic does today (verify in `js/`).
- **Q2: Does the OC threshold scale per-mode the same way solo does?** Per `ObjectiveLogic.getRequiredSheep`: Classic 200→80, Extreme 1000→400, Insane 3000→1200, Chaos 5000→2000. **Author lean:** yes, identical formula. Pure function, no need to fork.
- **Q3: Does host migration mid-`gather` reset the hold timer?** **Author lean:** no — DO state is the authority and survives host swap. The new host sees `holdRemaining: 1.3s` and renders that.
- **Q4: Can a non-host player trigger any objective-stage transition?** **Author lean:** no — transitions are server-driven from sim state. Players have no "advance stage" action.
- **Q5: Should Phase 1 fixtures use realistic mode sheep counts (200) or smaller for speed (50)?** **Author lean:** 50 for the boundary/corral fixtures (fast capture, low harness churn); the objective-stage fixture is OK at 50 because the formula clamps to `requiredSheepMin: 10`. Real 200/1000-sheep behavior is covered by the existing `sheep-60hz-20s.json` (which doesn't exercise the island path but does exercise the flocking math at scale).
- **Q6: Should we add `mp:true` to OC's `allowedModes` semantics?** Today `allowedModes` is solo-mode-list + multiplayer-mode-list combined. Phase 4 above only enforces the union; a future cycle could split into `solo.allowedModes` + `mp.allowedModes` if RH/OC ever diverge. **Author lean:** keep them merged for now; revisit only when divergence is requested.

## What this cycle should NOT do (drift guards)

- **Don't refactor the boid sim.** The sim is byte-stable; introducing `objective` is additive, not modifying. Existing baselines must continue to pass.
- **Don't move objective state into the client predictor.** It must stay DO-authoritative for host-migration safety.
- **Don't gate clients on a protocol version.** All additions are optional fields.
- **Don't add scene voting or spectator UI.** Out of scope.
- **Don't bump `package.json` version.** No player-visible delta until Phase 5 lobby UI ships and the host can actually pick OC reliably.
- **Don't touch `shared/scenes/types.js`.** No new fields are needed; existing scene defs already declare everything.
- **Don't regenerate existing sim-baselines.** Net-additive only. If a regression in `island-boundary-rh-60hz.json` shows up after the cycle starts, that's the emergency-stop case from [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md).

## Suggested Cycle 34 phase shape

```
Phase 1 — Sim-baseline coverage for islands (~1.5hr)
Phase 2 — OC objective state machine in shared/ + worker (~3hr)
Phase 3 — Wire format additions for objective stage (~1.5hr)
Phase 4 — allowedModes enforcement at room init (~30min)
Phase 5 — Lobby UI surfaces scene + allowed modes (~1hr)
```

Total ~7.5hr engineering work. Five phases is comfortably under the ≤ 8 phase rule. Phases 2 + 3 must ship in the same PR (wire format follows the state machine they describe). Phases 1, 4, 5 are independent.

## References

- [`shared/scenes/rolling-hills.js`](../shared/scenes/rolling-hills.js) — RH scene def.
- [`shared/scenes/open-country.js`](../shared/scenes/open-country.js) — OC scene def, declares the unused-by-worker `objective`.
- [`shared/ObjectiveLogic.js`](../shared/ObjectiveLogic.js) — `getRequiredSheep` formula, already shipped.
- [`shared/BoundaryCollision.js`](../shared/BoundaryCollision.js) — `kind === 'island'` dispatch.
- [`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts) — DO state, scene validation, host migration.
- [`worker/src/GameSim.js`](../worker/src/GameSim.js) — authoritative sim, `loadScene` consumer.
- [`tests/sim-baseline/harness.js`](../tests/sim-baseline/harness.js) — fixture-capture harness.
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — fence list (`shared/`, sim-baselines, wire format).
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — sim-baseline drift, MP desync stop conditions.
- [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) — deterministic-sim contract.
- [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) — DO contract, wire format discipline.
