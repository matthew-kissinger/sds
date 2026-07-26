# Next Session - Cycle 121, worn ground

> **Updated:** 2026-07-26
> **For:** Cycle 121
> **Pickup priority:** Phase 1, the zone-list unification, because it closes a live gap: Rolling Hills' new pasture and Newsheepdogland's homestead currently have grass growing inside them. Read "What the trace found" at the top of the plan first; this cycle is smaller than the roadmap implies.

## Current State

Cycle 120 (`lighting`) closed 2026-07-26, the fourth cycle closed that day after 117, 118 and 119. Plans archived in [`docs/archive/cycles/`](docs/archive/cycles/); close entries with full detail sit at the top of [`docs/BACKLOG.md`](docs/BACKLOG.md).

**The sun now tells the truth about what time it is.** D25's measured 3.456-at-every-hour was never a light that failed to update: `1.1 * Math.PI` is 3.45575, and it was a light nothing was ever wired to update. Intensity, colour and direction all track the sky now, on a rig whose constructor throws if handed a light that is not in the scene it is meant to light.

**Phase 3 is deferred and it is Matt's call.** See "One decision waiting" below.

## The active cycle

[`docs/cycle-121-plan.md`](docs/cycle-121-plan.md). Three phases.

**This cycle extends machinery that already exists; it does not build any.** Cycle 115 Phase 4 shipped the worn gate approach as a term in the terrain colour graph, driven by live uniforms and shaped by [`js/world/groundShading.js`](js/world/groundShading.js) so the WebGL twin and the WebGPU node material cannot describe different ground. The uniforms were made live rather than baked deliberately, so a later cycle could drive the wear without a material rebuild. **This is that later cycle.**

**The defect the roadmap does not mention:** [`js/TerrainBuilder.js`](js/TerrainBuilder.js):1270-1288 registers the pen-interior grass exclusion keyed on `sceneDef.pasture`, and only Home Field declares `pasture`. Rolling Hills declares `pen` (Cycle 117) and Newsheepdogland declares `pen: {center, radius}`, so **neither gets a grass exclusion at all**. The island pasture that every ranked solo run drives into has grass growing inside it. Confirm both in a browser before fixing; two code paths agreeing on a grep is not the same as looking.

**Two systems describe the same ground and do not know about each other.** Grass removal is a rect list on `GrassSystem`; terrain wear is the uniform-driven approach term. Nothing connects them, so grass thins over a 4 m band around a rect the terrain does not shade, and the terrain shades a corridor the grass does not thin against. That disconnect is the flat-painted-plane defect. One zone list feeding both is the fix, not two tuned effects that overlap.

**Do not widen `EXCLUSION_FALLOFF_M` as the first move.** Cycle 114 measured and reasoned about that 4 m band. The transition reads as a knife edge because the grass fades correctly onto ground that does not change. Shade the ground first, then judge the falloff against ground that has somewhere to fade to.

## What binds this cycle

- **No `shared/` edit and no `shared/scenes/types.js` edit.** This is render-path only. Phase 1 reads `shared/PenBarrier.js`'s two-form normalisation as a **precedent to copy**, never to import from or modify: it is fence-frozen deterministic-sim code.
- **No scene-ID branches in render code.** Gate on resolved zone data, never on a scene name.
- **No decomposition of `GrassSystem.js`.** Cohesive by design, locked in `DECISIONS.md`.
- **The two render paths keep one shared shape.** A term in the node graph and not in the GLSL twin is a defect regardless of how it looks.
- **No ratchet bump.** Cycle 119 freed the headroom for this cycle and Cycle 122, not for either to spend. `main` has 20,700 B and `other` 74,596 B, but `ui` is at 120 B, `client` 442 B, `vendor` 606 B, `webgpuDiagnostic` 848 B and `App` 1,116 B.

## One decision waiting, and it is Matt's

**Cycle 120 Phase 3, Home Field's evening.** It needs `dayNight` on `shared/scenes/field.js`. `DEFAULT_SCENE_ID` is now `field`, so enabling a day loop there moves **the entrance backdrop** as well as the leaderboard scene. Suggested conservative values: `{ enabled: true, secondsPerDay: 3600, initialT: 0.5 }` holds the familiar noon for about six minutes and brings the lamp up around twelve.

**The payoff is already verified in a browser:** the dusk lamp fires off the live material, `emissiveIntensity` 0 at noon to 0.2696 at golden hour to 2.2 at night (`cycle120-validation/browser/lamp-zoom__night.png`). Cycle 115's ramp works and has simply never had a sundown arrive in play.

**But it is blocked by a real finding, not just by taste.** Grass is `MeshBasicNodeMaterial` taking baked indirect only, so it **does not read the scene lights at all**. Now that the light is honest, night is a self-lit grass field over near-black ground: grass to terrain goes 10.8:1 to **204:1** on Rolling Hills. Giving Home Field an evening without fixing that would ship a glowing pasture at midnight on the default scene. **Fix the grass lighting first, then take Phase 3.** That is probably its own cycle.

## Carryover worth knowing before you start

- **The golden harness's flock is not attributable.** It replaces `Math.random` globally with one seeded stream and `js/OptimizedSheep.js` draws from it 32 times for the flock layout. **Attribute golden deltas by block, not by score.** Cycle 118 and Cycle 120 both used the same method: mean absolute luma over the region of interest versus everything else, with an unaffected cell setting the noise floor.
- **Decide what a baseline is evidence of before touching it.** Cycle 118 and 120 re-baselined because the look was the deliverable. Cycle 119 deliberately did not, because its claim was that the pixels had not moved and standing baselines were the proof. This cycle changes ground inside three zones, so the delta should be confined to them and **a moved cell outside the treated zones is a finding**.
- From Cycle 120: the island terrain albedo (a 4.2x floor spread across four biomes under an identical sun, so not lighting); Newsheepdogland low-sun shadows now variable where they used to be constant; Home Field noon about 12 percent brighter.
- From Cycle 118: foam keyed on metres of seabed rather than horizontal distance; vertical streaking in mid-water at grazing angles; the WebGL twin's raw-output tone mismatch; `js/water/AnimeWater.js` is now a misnomer.
- From Cycle 117: a cue dead zone on Rolling Hills' northern approach; the gate assembly's 0.4 m cross-slope; the `competitive.json` fence-glob gap, reconciled in Cycle 122 Phase 1.
- From Cycle 119: `__sdsCinema.freeFly()` and its 20,875-byte OrbitControls chunk, and whether the three live dev surfaces belong on the deployed site. Both still open, both Matt's.

## What comes after

- **Cycle 122, N pastures** ([plan](docs/cycle-122-plan.md)). The last of the program and the riskiest: `shared/CompetitiveLayout.js` hardcodes Home Field coordinates regardless of scene, and making it scene-aware is deterministic-sim work that moves `tests/sim-baseline/competitive.json` and touches live multiplayer rooms. **Its Phase 1 writes the four `multiplayer.md` migration pieces before any code**, and also reconciles the fence glob, which currently reads `tests/sim-baseline/__fixtures__/*.json` and so misses `competitive.json` while `shared-sim.md` plainly covers it.

## Reference

| What | Where |
|---|---|
| Active cycle plan | [`docs/cycle-121-plan.md`](docs/cycle-121-plan.md) |
| Remaining plan | [122](docs/cycle-122-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Shared ground shape | [`js/world/groundShading.js`](js/world/groundShading.js) |
| Scene lighting authority | [`js/world/sceneLightingRig.js`](js/world/sceneLightingRig.js) |
| Golden harness | `npm run validation:screenshots -- --diff`, then `--baseline` |
| Time-of-day probe | `tools/validation/lighting-time-of-day.mjs` |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Program shape | [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md) |
