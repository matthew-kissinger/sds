# The water, before

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

## The shipped tuning, recorded next to the pixels

The node material has no `.uniforms` bag, so the report captures the values directly: `webgpu-node-anime-water`, a 4000m plane at 64 segments at y=-0.05, `colorScale` 0.58, `foamScale` 0.62, `sparkleScale` 0.76, `minDepthT` 0.82, `glintMode` `masked-flat-normal-broad-sun-path-plus-ripple-v4`, `glintGain` 0.32, `rippleGlintGain` 0.42, `fogStrength` 0.025, `sunSpecularIntensity` 0.6, `rippleLightScale` 0.1, plus the live sun direction, sun colour and sparkle strength per session.
