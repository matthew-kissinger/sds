# Next Session - Cycle 122, N pastures

> **Updated:** 2026-07-26
> **For:** Cycle 122
> **Pickup priority:** Phase 1, the migration story, because `multiplayer.md` requires it in writing before any code and this is the only cycle in the program that can desync a live room. Read "What the trace found" at the top of the plan first, corrections included - three of its findings changed after a second pass and one of them inverts Phase 3.

## Current State

Cycle 121 (`worn ground`) closed 2026-07-26, the fifth cycle closed in two days after 117, 118, 119 and 120. Plans archived in [`docs/archive/cycles/`](docs/archive/cycles/); close entries with full detail sit at the top of [`docs/BACKLOG.md`](docs/BACKLOG.md).

**The ground under the grass is ground now.** One zone list, two readers, taken by reference rather than kept equal by convention. Two island pen interiors that had no grass exclusion at all now have one, and a live defect nobody had noticed (every mode start rebuilding the exclusion list from Home Field's default rect, on every scene) is closed.

**One decision from Cycle 120 is still deferred and still Matt's**, now unblocked in sequence rather than in fact: Home Field's evening waits on Cycle 123's grass lighting, per D33.

## The active cycle

[`docs/cycle-122-plan.md`](docs/cycle-122-plan.md). Four phases. **The last of the program and by far the riskiest.**

**This is the only cycle in 112-123 that touches the deterministic sim.** Everything else has been render-path or docs. `shared/` runs byte-identically on the Worker and every connected client, and a client on the old layout joining a room on the new one is exactly the case [`.claude/rules/multiplayer.md`](.claude/rules/multiplayer.md) demands a written migration story for. **Read that rule and [`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md) in full before touching anything.**

## What the de-risking pass already established

Run read-only on 2026-07-26 and committed in `dfdaf394`, so you do not have to rediscover it:

- **The plan's original mechanism does not exist.** `bounds` is the legacy rect-only field and only Home Field declares it. Islands carry `boundary: {kind:'island', center, radius}`. So `bounds: this.scene.bounds` at [`worker/src/GameSim.js`](worker/src/GameSim.js):340 is `undefined` on every island, and `createCompetitiveGameState` falls back to its own hardcoded `+-100` - Home Field's rect - which then becomes `gameState.bounds` and drives the competitive sheep clamp. **Two stacked hardcodes.** Fixing the layout table alone leaves island competitive herding inside an invisible 200 m square.
- **The cardinal-ring derivation is proven**, not proposed: gate at distance R, pasture R+2 to R+30 at half-width 30, reproduces all three shipped tables with `Object.is` on every leaf. No trig needed; for N <= 4 every bearing is cardinal, so write it sign-and-axis.
- **And that same rule puts every island pasture in the sea.** [`shared/BoundaryCollision.js`](shared/BoundaryCollision.js):391-398 is a hard radial clamp at `radius - margin`, so a sheep cannot physically reach a pasture at `R+2`. Home Field escapes only because it is a rect with gate passage plus an extended `+-35 m` retirement clamp; islands have no carve-out. **Placement is kind-aware, not just measurement.** Cycle 117's pen sits at about 0.64R, inside, and that is the shipped precedent.
- **`worker/src/GameSim.js`:29-30 imports both layout functions and calls neither.** Dead imports; deleting them is that consumer's whole migration.
- **The fixture's root location is deliberate**, documented at `competitive.spec.ts`:23. Widen the fence glob; do not move the file.
- Island competitive is genuinely reachable ([`worker/src/RoomDO.ts`](worker/src/RoomDO.ts):463 validates and stores a client-supplied `sceneId`), so Phases 3 and 4 are not speculative.

## What binds this cycle

- **No code before Phase 1's migration story is written.** Four pieces, per `multiplayer.md`. A contract change without them is a fence violation.
- **Home Field bit-identical through Phase 2**, and `competitive.json` byte-identical. The fixture is genuinely downstream of the function being changed (`harness.js`:506 delegates to the real factory), so this is a real test, not a formality.
- **An island pasture outside the radial clamp is unreachable, not merely ugly.** The round cannot complete, which is worse than the broken-as-before baseline D23 protects. Distance-check every pasture corner against the radius.
- **No blanket fixture regenerate.** Read the diff.
- **No ratchet bump.** `main` headroom is 16,886 B after Cycle 121, `other` 74,512 B, and `ui` is at 120 B.

## Carryover worth knowing before you start

- **Rolling Hills' pasture reads as a black hole**, and the Cycle 121 zone is correct there (pen ground luma 30.9, brighter than the meadow's 27.7). It is Cycle 120's two findings made visible: grass reads no scene lights, and the island terrain albedo floor. A high-sun control ruled out time of day. **Cycle 123 owns it.**
- **The golden matrix covers no pen at close range and no Newsheepdogland**, so three surfaces Cycle 121 changed are unguarded by the standing gate. `tools/validation/worn-ground-probe.mjs` is the framing that covers them.
- **Attribute golden deltas by block, not by score.** The harness replaces `Math.random` globally with one seeded stream and `js/OptimizedSheep.js` draws from it 32 times for the flock layout. Cycle 121 also confirmed a subtler version: a chunk with no zone in it re-scatters entirely because a neighbouring chunk consumed a different number of draws.
- **Decide what a baseline is evidence of before touching it.** 118, 120 and 121 re-baselined because the look was the deliverable; 119 deliberately did not, because standing baselines were its proof.
- Home Field's farmhouse yard is an 80x80 m axis-aligned rect and wants a radial falloff. Rolling Hills still has no gate approach fan (Cycle 115's deferral).

## What comes after

- **Cycle 123, grass reads the light** ([plan](docs/cycle-123-plan.md)). The last one, created by D33. Its premise was corrected by the same de-risking pass: grass **does** take a live per-frame sun direction on both paths; what it does not take is intensity, colour or ambient, so the direction rotates all day and the brightness never changes. Phase 1 widens the existing setter rather than inventing a second. Hard stop 1 has a provable form - normalise the term to exactly 1.0 at the reference preset and noon cannot move by construction. Phase 3 then closes D25 with Home Field's evening.

## Reference

| What | Where |
|---|---|
| Active cycle plan | [`docs/cycle-122-plan.md`](docs/cycle-122-plan.md) |
| Remaining plan | [123](docs/cycle-123-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Deterministic-sim contract | [`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md) |
| Worker / DO contract | [`.claude/rules/multiplayer.md`](.claude/rules/multiplayer.md) |
| Shared ground shape | [`js/world/groundShading.js`](js/world/groundShading.js) |
| Scene lighting authority | [`js/world/sceneLightingRig.js`](js/world/sceneLightingRig.js) |
| Golden harness | `npm run validation:screenshots -- --diff`, then `--baseline` |
| Worn-ground probe | `tools/validation/worn-ground-probe.mjs` |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Program shape | [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md) |
