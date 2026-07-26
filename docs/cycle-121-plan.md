# Cycle 121 - worn ground

> Authored 2026-07-26 from a read-only trace of the grass exclusion and terrain shading paths. **The cycle is smaller than the roadmap entry implies and it has one defect the entry does not mention.** Read "What the trace found" before the phases. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom.

## Goal

Ground where grass has been removed stops reading as a flat painted plane and starts reading as ground that has been walked on. D26 and D27 are deliberately one cycle because the pen interior, the farmhouse yard and the gate approach are the same surface with three names, and treating them separately is how they drifted apart in the first place. Along the way, the two pen interiors that currently get no treatment at all get one.

## What the trace found

**1. The mechanism already exists and is already shared. This cycle extends it, it does not build it.**

Cycle 115 Phase 4 built the worn approach to the pen gate as a term in the terrain colour graph, driven by uniforms and shaped by a single shared authority:

- [`js/world/groundShading.js`](../js/world/groundShading.js) exports `GROUND_APPROACH`, `GROUND_APPROACH_GLSL` and `buildGroundApproachWearNode`, so the WebGL twin and the WebGPU node material cannot describe different ground.
- [`js/world/webgpuTerrainNodeMaterial.js`](../js/world/webgpuTerrainNodeMaterial.js):69-98 applies it, combining with the natural `dirtMask` by **MAX rather than sum**, so a natural dirt patch landing on the approach agrees with it instead of stacking into a mud slick.
- The uniforms are live rather than baked literals, deliberately, so a later cycle can drive the wear without a material rebuild. **This cycle is that later cycle.**

The comment at `:60-69` is worth reading before designing anything: the term deliberately stays in the graph on gateless scenes rather than being branched out, because branching per scene "would buy a rounding error and cost the two render paths their one common shape". Respect that. Add terms to the shared shape; do not add scene branches.

**2. There are two separate systems describing the same ground, and they do not know about each other.**

Grass removal is a rect list on [`js/GrassSystem.js`](../js/GrassSystem.js) (`addExclusionZone`, `exclusionKeepProbability`, `EXCLUSION_FALLOFF_M = 4.0`, `EXCLUSION_EDGE_HEIGHT_MIN = 0.45`). Terrain wear is the uniform-driven approach term above. Nothing connects them: grass thins over a 4 m band around a rect that the terrain does not shade, and the terrain shades an approach corridor that the grass does not thin against. **That disconnect is the flat-painted-plane defect.** The fix is one zone list feeding both, not two tuned effects that happen to overlap.

**3. The defect the roadmap does not mention: two pen interiors get no exclusion at all.**

[`js/TerrainBuilder.js`](../js/TerrainBuilder.js):1270-1288 registers the pen-interior exclusion keyed on `sceneDef.pasture`. Only Home Field declares `pasture`.

- **Rolling Hills** declares `pen` (nested, Cycle 117 P2, [`shared/scenes/rolling-hills.js`](../shared/scenes/rolling-hills.js):54-58). It gets **no grass exclusion**, so grass grows inside the island pasture that Cycle 117 just built and it is the destination every ranked solo run drives into.
- **Newsheepdogland's homestead pen** declares `pen: {center, radius}`. Same key, same result, no exclusion. Sparse island grass has probably hidden it.

The `farmHouse` zone (`:1236-1244`) and the sandbox zones are unaffected. Confirm both gaps in a browser before fixing; two code paths agreeing on a grep is not the same as looking at it.

**4. Cycle 114's falloff is correct and is not the thing to change.** `EXCLUSION_FALLOFF_M = 4.0` with a height taper to `0.45` was measured and reasoned about at the time (about two dog-lengths, wide enough to read as worn, narrow enough that the pen still reads as a pen). The roadmap says the transition "still reads as the knife edge the cycle set out to remove", and the trace suggests why: the grass fades correctly onto ground that does not change, so the eye reads the grass boundary as the edge. **Do not widen the falloff as the first move.** Shade the ground first, then judge the falloff against ground that has somewhere to fade to.

## Phase 1 - One zone list, two consumers (~4hr)

The structural fix, no look change beyond the two missing exclusions.

1. Resolve the worn-ground zones once, from scene data, in one place. Both the grass thinning and the terrain shading read that list.
2. **Close the `pasture`-versus-`pen` gap.** Whatever the resolution is, it accepts both the `pasture` rect Home Field declares and the `pen` forms Rolling Hills and Newsheepdogland declare (rect and `{center, radius}`). [`shared/PenBarrier.js`](../shared/PenBarrier.js) already normalises exactly these two forms and is the precedent for the shape, but it is fence-frozen deterministic-sim code: **read it, do not import render concerns into it, and do not modify it.**
3. Keep the derive-rather-than-hardcode discipline at `js/TerrainBuilder.js:1256-1269`. The pen's declared rect is not where its fence actually stands, and that two-metre offset is a real correction that must survive the refactor.

**Acceptance (EARS):** When Phase 1 ships, then Rolling Hills' pasture interior and Newsheepdogland's homestead pen shall each carry a grass exclusion. When a scene declares `pasture` or `pen` in any supported form, then the same resolved zone shall drive both the grass thinning and the terrain shading, and a spec shall fail if the two disagree. When Phase 1 ships, then `shared/PenBarrier.js` shall be unmodified.

## Phase 2 - The ground under the grass (~4hr)

The look work, authored against Phase 1's zone list, on both paths through `groundShading.js`.

1. Extend the shared shape so a worn zone shades the terrain, not just thins the grass. Reuse the approach term's MAX-combine against the natural dirt mask; the reasoning that made MAX right there makes it right here.
2. **The three surfaces get one treatment**, which is the whole point of D26 and D27 being one cycle. Pen interior, farmhouse yard and gate approach differ in shape and intensity, never in material.
3. Only now, with ground that has somewhere to fade to, judge whether `EXCLUSION_FALLOFF_M` still reads as a knife edge. If it does, change it with the before and after recorded. If it does not, say so and leave it.

**Acceptance (EARS):** When Phase 2 ships, then a worn zone shall shade the terrain beneath it on both render paths, expressed once in `js/world/groundShading.js`. When the shared shape changes, then both paths shall change with it and a spec shall fail if only one does. When Phase 2 ships, then any change to `EXCLUSION_FALLOFF_M` shall be recorded here with the before and after, or the constant shall be stated as deliberately unchanged.

## Phase 3 - The browser probe and the goldens (~2hr)

1. Capture Home Field's pen and farmhouse yard, Rolling Hills' pasture and gate approach, and Newsheepdogland's homestead, on the production WebGPU path. `assertWebGpuEngaged` is not optional.
2. `npm run validation:screenshots -- --diff`, read the delta, re-baseline only after. Home Field's pen and yard are in frame on the existing cells, so the delta is expected there and **unexpected anywhere else** - an unexplained cell is a finding.
3. **Read the golden-harness caveat in `BACKLOG.md` before attributing anything.** The harness replaces `Math.random` globally with one seeded stream shared across async render systems, and `js/OptimizedSheep.js` draws from it 32 times for the flock's visual layout. A flock that moves is not necessarily this cycle's doing. Attribute by block, not by score.

**Acceptance (EARS):** When Phase 3 ships, then all three treated surfaces shall have been viewed in a browser on a genuine WebGPU session. When the goldens are re-baselined, then the delta shall have been read with `--diff` first and any cell outside the treated zones shall be explained.

## Frozen files

- **[`shared/PenBarrier.js`](../shared/PenBarrier.js)** and everything else under `shared/` is **NOT authorised**. This cycle is render-path only. Phase 1 reads `PenBarrier`'s normalisation as a precedent and copies the shape; it does not import from it in a way that pulls render concerns across the boundary, and it does not edit it.
- **[`shared/scenes/types.js`](../shared/scenes/types.js)** is **NOT authorised**. If Phase 1 finds it genuinely needs a new SceneDef field, stop and surface rather than self-authorising: Cycle 114 faced the same question and deliberately chose a module constant over a SceneDef field, and that reasoning is recorded at `js/GrassSystem.js:36-42`.
- **[`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](../tests/refactor-baseline/__fixtures__/bundle-sizes.json)** is **NOT authorised.**

## Hard stops

1. **No scene-ID branches in render code.** [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md). Gate on resolved zone data, never on a scene name.
2. **No decomposition of `GrassSystem.js`.** Cohesive by design, locked in `DECISIONS.md`.
3. **The two render paths keep one shared shape.** A term that exists in the node graph and not in the GLSL twin, or vice versa, is a defect regardless of how it looks.
4. **No `shared/` edit.** If the cycle appears to need one, it has drifted.
5. **Do not widen the grass falloff before shading the ground.** Phase 2 item 3 is ordered that way on purpose.

## Explicitly out of scope

- **New ground textures or a splat map.** This is a shading cycle, not an asset cycle. If the shared noise-based shape cannot carry the look, that is a finding and a future cycle, not a mid-cycle pivot.
- **The bake-time heightmap double-multiply.** `scripts/bake-heightmap.mjs:202` writes metres and `Heightfield.sample` multiplies by `peakHeight` again. Real, recorded in Cycle 118's plan, load-bearing for the current look, and needs its own cycle.
- **Grass wind, density LOD and the mobile shader.** All three are protected by `.claude/rules/scene-and-render.md` and none of them is what reads as a painted plane.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's [`BACKLOG.md`](BACKLOG.md) carryover.
- [ ] When `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` run at cycle close, all four shall pass.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When Phase 1 ships, then Rolling Hills' pasture and Newsheepdogland's homestead pen shall each carry a grass exclusion.
- [ ] When a scene declares a pen in any supported form, then one resolved zone shall drive both grass thinning and terrain shading, pinned by a spec.
- [ ] When Phase 2 ships, then a worn zone shall shade the terrain on both render paths from one definition in `js/world/groundShading.js`.
- [ ] When the cycle closes, then `EXCLUSION_FALLOFF_M` shall be recorded as changed with before and after, or as deliberately unchanged.
- [ ] When the cycle closes, then `shared/` shall be unmodified.
- [ ] When the cycle closes, then `bundle-sizes.json` shall be unmodified.
- [ ] When Phase 3 ships, then all three treated surfaces shall have been viewed in a browser.
- [ ] When the goldens are re-baselined, then any moved cell outside the treated zones shall be explained.

## References

- [`front-door-roadmap.md`](front-door-roadmap.md) - the Cycle 121 entry this plan sharpens
- [`../DECISIONS.md`](../DECISIONS.md) - D26, D27
- [`archive/cycles/cycle-114-plan.md`](archive/cycles/cycle-114-plan.md) - the exclusion falloff, and why it is a module constant rather than a SceneDef field
- [`archive/cycles/cycle-115-plan.md`](archive/cycles/cycle-115-plan.md) - the gate approach wear this cycle extends
- [`../.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - scene-knobs rule, grass discipline, no-decompose
