# The water, before

> **Corrected 2026-07-25 by a follow-up reconnaissance pass.** Four claims below did not hold up when read against the code. The corrections are recorded at the bottom under "What this file got wrong" and are carried into [`../docs/cycle-118-plan.md`](../docs/cycle-118-plan.md). The frames, the measurements and the tuning record are all sound; two of the diagnoses are not. Read the correction before acting on the "Mirror-flat shading" bullet or the determinism paragraph.

> Captured 2026-07-25 on the production WebGPU path. Harness: [`tools/validation/water-look.mjs`](../tools/validation/water-look.mjs), run with `npm run validation:water`. 24 frames in [`water-before/`](water-before/), machine report in [`water-before/water-before-report.json`](water-before/water-before-report.json).

Cycle 118 rewrites the water. This is the baseline it will be judged against, and it had to land before any rewrite code existed or it would be worthless.

## What was captured

Three scenes (every scene whose `boundary.kind` is `island` or `coastline`, derived at runtime rather than assumed: Rolling Hills, Open Country, Newsheepdogland), at noon and dusk, four poses each.

Poses are derived at runtime, not hardcoded: march outward from a land anchor on 36 headings until `surfaceY` drops below the water plane, bisect to 0.25m, then take the **median** crossing across the ring so the shot lands on representative coast rather than a spit or a bay. The shoreline tangent comes from the two neighbouring crossings.

All six sessions reported `engine=webgpu-production`, zero failures, zero console errors. That is hard stop 1 of the cycle and it held: `assertWebGpuEngaged` throws before any frame is written, and `productionWebGpu.ok` only becomes true after 11 gates including `renderer.isWebGPURenderer === true`, so it transitively proves the real renderer object rather than a flag.

## What the frames show

`open-country__noon__shore-out` is the clearest single frame and it confirms every premise of D-W at once:

- **Cobalt, not pastoral.** A deep saturated navy sitting against warm desaturated grass. It does not belong to the same world as the rest of the game.
- **Vertical white smears.** The cel ripple quantisation reads as drips running down the surface, not as ripples across it.
- **A flat white foam band**, wide and completely untextured.
- **Mirror-flat shading**, which is the visible consequence of the structural finding: the vertex shader applies zero displacement and `N` is a hardcoded up-vector that is never perturbed, so both specular terms evaluate against a perfect plane.

## Two findings the plan did not have

**1. The water has its own horizon seam.** Between the blue sky and the blue water there is a hard tan band running the full frame width. This is the same defect class Cycle 112 Phase 6 fixed for the terrain, and it is still live for water: the node path mixes toward a `fogColor` captured once at boot from the scene's static sky preset. Phase 4 already plans to fix that; this is the evidence that it is not a theoretical concern.

**2. The terrain skirt comes back above the waterline out to sea.** `TerrainBuilder`'s falloff takes the mesh to Y=0 while the water plane sits at Y=-0.05, so past a bounded radius a seaward camera sees a flat green plane occluding the ocean. Measured from the shoreline crossing outward: **Rolling Hills 130m, Open Country 190m, Newsheepdogland 430m.** The harness now clamps every seaward camera inside the heightfield footprint and records the full skirt probe. Any change that moves the water Y, alters the horizon treatment, or extends the water plane has to know this boundary exists.

## Two constraints on how these frames may be used

**They are not byte-deterministic.** `js/main.js:2992` updates the water uniforms outside the `cinema.paused` guard, driven by `performance.now()`, so `uTime` keeps advancing while the sim is frozen and ripple and glint phase differ run to run. This set is reference material for a human eye. **Do not wire it into an SSIM golden gate** without a fixed-dt water clock first.

**One framing defect to fix before the after-run.** `rolling-hills__{noon,dusk}__shore-out` are not shore shots: 0% land, 0% foam, pure open sea. The cause is in the pose maths rather than luck - Rolling Hills' crossing sits on a steep coast, so the camera lands at y=14.7m against a target 150m out at y=0.55, and the ~5 degree downward pitch drops the shoreline out of frame. Open Country and Newsheepdogland have flatter coasts and the same maths works. So for the default entrance world, two of four frames are duplicates and near-shore water is covered only by `shore-along`. Fix the pitch before capturing the after, or the comparison is thinner than it looks for the scene most players see first.

## What this file got wrong

Recorded here rather than edited away, because the frames are still the evidence and the reasoning is worth being able to retrace.

**1. "Mirror-flat shading" names the wrong cause, and it is wrong about the path production runs.** The claim above is that "the vertex shader applies zero displacement and `N` is a hardcoded up-vector that is never perturbed, so both specular terms evaluate against a perfect plane". Zero vertex displacement is correct on both paths. The hardcoded normal is correct for the **WebGL twin** (`js/water/AnimeWater.js:188`) and **false for the WebGPU node material, which is what production renders**: `js/water/webgpuAnimeWaterNodeMaterial.js:76-92` builds a three-rotation slope field and a real `rippleNormal`. It photographs as flat because the slope scale is `0.055`, a maximum tilt of about 3.1 degrees, and because the *broad* sun-path term at `:93-94` uses a flat up-vector, is not gated by the normal at all, and dominates the shipped weighting at `:112`. The defect is amplitude and term weighting, not a missing normal.

**2. The determinism paragraph names the wrong clock.** `js/main.js:2993` genuinely does update the water outside the `cinema.paused` guard using `performance.now()`. But on the production path that `timeSec` is **discarded**: `AnimeWater.js:384-393` routes to the node controls and `webgpuAnimeWaterNodeMaterial.js:157-169` has no `timeSec` branch. The animation clock is TSL `time`, which resolves to `frame.time`, the renderer's own, advanced on every `renderer.render()`. Fixing only `main.js` would change nothing. The conclusion stands and is in fact stronger: do not wire an SSIM gate to these frames.

**3. `sunSpecularIntensity: 0.6` is recorded correctly but is not the tuned value.** `js/atmosphere/skyFogPresetTuning.js:164` and `:261` specify `0.48` for both water presets, and it is dead: `webgpuWaterNodeMaterialFactories.js:37` resolves `context.sunSpecularIntensity` first and `AnimeWater.js:341` always supplies `0.6`. The knob cannot be turned.

**4. The palette count in D30 undercounts.** Not this file's claim, but it belongs with these: there are five palette definition sites, not four, and the fifth is `colorTint` in `skyFogPresetTuning.js:161/258` - a per-channel multiplier of about `[0.21, 0.39, 1.44]`. That blue multiplier is what turns the authored deep blue into the cobalt these frames show.

Everything else verified as written: the engine claim, the boot-frozen `fogColor`, the skirt mechanism and its three distances, the shipped tuning values, the `boundary.kind` derivation, and the Rolling Hills `shore-out` framing defect.

## The shipped tuning, recorded next to the pixels

The node material has no `.uniforms` bag, so the report captures the values directly: `webgpu-node-anime-water`, a 4000m plane at 64 segments at y=-0.05, `colorScale` 0.58, `foamScale` 0.62, `sparkleScale` 0.76, `minDepthT` 0.82, `glintMode` `masked-flat-normal-broad-sun-path-plus-ripple-v4`, `glintGain` 0.32, `rippleGlintGain` 0.42, `fogStrength` 0.025, `sunSpecularIntensity` 0.6, `rippleLightScale` 0.1, plus the live sun direction, sun colour and sparkle strength per session.
