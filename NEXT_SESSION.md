# Next Session - Cycle 117, island-pasture

> **Updated:** 2026-07-25
> **For:** Cycle 117
> **Pickup priority:** Phase 1 is a pure `shared/` generalisation that cannot regress anything, so start there. But read the leaderboard section first, because one decision in this cycle is Matt's and not an agent's.

## Current State

Cycle 116 (`gate-legibility`) closed 2026-07-25. Plan archived in [`docs/archive/cycles/`](docs/archive/cycles/); the close entry with full detail sits at the top of [`docs/BACKLOG.md`](docs/BACKLOG.md).

The game now tells you where the sheep go. A warm column stands over the destination from across the island, a ground arc draws at the mouth inside 85 metres, the arc brightens as the flock funnels in, and each crossing gives one pulse. One module, one descriptor, four states, all four scenes.

**The browser probe finally ran**, and it is now a repeatable tool at [`tools/validation/homestead-probe.mjs`](tools/validation/homestead-probe.mjs) rather than a one-off. It confirmed seven claims from Cycles 114 and 115, found six defects, and verified Cycle 116's own visual acceptance by eye. Full record: [`cycle116-validation/PROBE_FINDINGS.md`](cycle116-validation/PROBE_FINDINGS.md).

Cycle 118's before-capture also landed early, because it is worthless once rewrite code exists. 24 frames on proven WebGPU via [`tools/validation/water-look.mjs`](tools/validation/water-look.mjs), findings in [`cycle118-validation/WATER_BEFORE.md`](cycle118-validation/WATER_BEFORE.md).

## The active cycle

[`docs/cycle-117-plan.md`](docs/cycle-117-plan.md). Eight phases. It was rewritten after a four-agent read-only spike and is materially smaller than the first draft, because the spike answered the gating question with measurements rather than argument.

**The gating question is answered.** A bare pasture rect on Rolling Hills holds nothing: driving the real `shared/` sim, 60 sheep started inside and 60 leaked; 60 pushed at a wall and 57 got in. The same run with `shared/survival/pen.js`'s `PenContainment` placed verbatim at Rolling Hills coordinates held 60/60, admitted 0/60 at the wall, and took 34/40 driven through the gate. Cost to generalise it to a rect is roughly 8 lines in one constructor.

**Two findings shrink the cycle.** The gate-predicate fix the draft planned is not needed at all, because the recommended design detects entry by box-inside test rather than by passage-zone crossing. And only one of eleven sim-baseline fixtures moves: `island-boundary-rh-60hz.json` was proven byte-identical with the corral removed by replaying the spec's exact construction both ways.

**One design constraint carries the whole multiplayer risk.** Do not add a top-level `gate:` to `shared/scenes/rolling-hills.js`. `createGameState` derives `gameState.gate` from `scene.gate`, and a non-null gate switches on Worker gate-attraction the island has never had. Declare the gate nested inside the pasture descriptor, where `createGameState` does not read it.

## What needs Matt, not an agent

**D12's premise for resetting the Sheep Dog Island leaderboard is false.** A read-only query against remote D1 (not the public API, which hard-excludes anomaly-flagged rows and so could never have seen this) found that `id=16` is a genuine 12.6-minute human playthrough, the Cycle 57 incident run, un-flagged by hand in production. It reads `Dev#0002` only because its owner used the rename endpoint that shipped in the same cycle. Cycle 58 put the 200-sheep rung on Rolling Hills specifically to keep that row comparable, and the rationale is still live in the scene def. `id=23` belongs to `Pakrohk#0001`, an outside player.

D12's own escape clause covers this: archive as all-time instead. **Archiving and resetting are different work and the choice is yours.** Phase 7 exports the rows and stops. Nothing has been deleted or modified.

Two smaller calls, both upstream of code:

- **Rolling Hills competitive and timed.** The scene advertises both, but `shared/CompetitiveLayout.js` hardcodes Home Field geometry regardless of scene. Keep a corral for competitive, drop the island to cooperative-only, or ship N pastures. Must be settled before the corral delete lands, since the delete removes the fallback. Phase 2 assumes cooperative-only and says so in the diff.
- **Findability.** The flag pillar and the zap are the island's "find it from the far shore" affordance. Cycle 116's column replaces them in principle. The probe showed the flag is a handful of pixels at play distance, so the column is probably an upgrade, but confirm it in Phase 6 rather than assume it.

## Carryover worth knowing before you start

Eight items are recorded in the Cycle 116 close entry. The two that touch this cycle:

- **The floating white diamond over the gate** is still shipping and now competes with the column. Rolling Hills gets the same treatment in Phase 5, so decide the diamond's fate there rather than twice.
- **The column reads thin and pale at 190m.** Rolling Hills is where that matters most, since it is the scene that sells itself on distance. Phase 6 is the place to tune it.

## Reference

| What | Where |
|---|---|
| Active cycle plan | [`docs/cycle-117-plan.md`](docs/cycle-117-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Browser probe harness | [`tools/validation/homestead-probe.mjs`](tools/validation/homestead-probe.mjs) |
| Water before-capture | [`tools/validation/water-look.mjs`](tools/validation/water-look.mjs), `npm run validation:water` |
| Deterministic-sim contract | [`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
