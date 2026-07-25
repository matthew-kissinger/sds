# Cycle 114 - grounding-pass

> Authored 2026-07-25 from a seven-agent reconnaissance pass over the six subject areas in the roadmap's Cycle 114 section. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Props stop sitting **on** the world and start sitting **in** it. Today the Home Field pen and the farmhouse each stand on a bald rectangle with a knife edge where the grass stops, the fence is a row of identical posts at identical heights, the farmhouse reads as one tan mass, and the dog floats over a field that never acknowledges it. Every one of those is a shader or a placement value, not a model. After this cycle a player walking from the spawn to the pen sees grass thin out toward the fence instead of stopping dead, posts that lean and vary, a house whose roof is not its walls, and a dog with weight under it. Per D11 no new geometry ships here at all. That is the point: this is the pass that establishes what the Cycle 115 kit actually has to be.

## What the reconnaissance changed

Three of the roadmap's six bullets did not survive contact with the code. Recording the corrections here rather than quietly working around them.

**1. The farmhouse is not one flat material.** `assets/models/Farm house.glb` holds **55 role-named meshes** (`Mesh_RoofA`, `Mesh_GableFront_0..8`, `Mesh_Body_Wall*`, `Mesh_Porch*`, `Mesh_Chimney*`, `Mesh_Door*`, `Mesh_WFrame*`, `Mesh_Rail*`, `Mesh_Lantern*`, plus a `ShadowProxy`) sharing **one** material, `PaletteMaterial001`, which carries both a base-colour and a metallic-roughness texture. It is a palette-atlas kit-bash. The review's observation was right about the look and wrong about the cause. So the roof/wall/trim split needs no new geometry and no re-model: it is a per-mesh material assignment by name prefix. That makes Phase 4 both cheaper and more clearly D11-legal than the roadmap assumed.

**2. The low-frequency ground albedo already ships.** `js/world/webgpuTerrainNodeMaterial.js:25-48` runs hash value-noise in three octave pairs, rotated 43 degrees so no two share a lattice axis, at world frequencies 0.012 and 0.026 (roughly 83m and 38m wavelength) down to 0.15. `js/TerrainBuilder.js` has shipped the same on the WebGL path for years. Cycle 91 Phase 7.5 put it there, replacing a sine-sum that read as a grid.

What is missing is that the **grass does not read it**. Both grass paths use `sin(worldX * 0.2) * cos(worldZ * 0.15) * 0.5 + 0.5`, a regular plaid at roughly 31m by 42m, applied at 0.08 red, 0.05 green, 0.03 blue. A varied ground under a plaid-varied grass layer is precisely why grass reads as static laid over a surface rather than as the surface. Phase 2 is therefore "make grass read the field the terrain already has", not "add a field".

**3. The horizon rim is not a geometry defect, and the remaining half is smaller and different.** Cycle 112 Phase 6 fixed the colour, re-baselined all six golden cells and proved the fix with an A/B pair. The geometric rim at the terrain plane's edge stopped being visible when the colours converged, exactly as the roadmap predicted. There is no skirt phase to write.

There **is** a leftover, and it is not what the roadmap describes. `js/world/webgpuTerrainNodeMaterial.js:94` composites its own second fog on top of `scene.fog`, from a `terrain.fogColor` resolved once at material creation. `.claude/rules/scene-and-render.md` forbids exactly this ("Don't introduce per-material fog uniforms... Custom fog drifts from the sky"). Two honest qualifications before anyone treats this as urgent:

- The colour is **correct at boot**. `withSkyFogMaterialOptions` in [`../js/webgpuNodeMaterialFactorySuite.js`](../js/webgpuNodeMaterialFactorySuite.js) threads the live `skyFog.fogColor` in, and `js/rendering/productionWebGpuBoot.js:99` builds the suite that way. The dusk-brown `[0.2933, 0.1629, 0.1348]` at `webgpuTerrainNodeMaterialFactories.js:9` is a last-resort fallback, not what production uses.
- It is **frozen**, with no live update path, so it only drifts under a moving sun. Newsheepdogland's day/night cycle is the only place that happens, and NSL is entrance-gated per D19.

So it is a genuine rule violation with low visible urgency. Phase 6 fixes it and says so plainly rather than selling it as a horizon fix. The WebGL terrain path is already correct: `js/TerrainBuilder.js` builds with `fog: true` and `#include <fog_pars_fragment>`, the standard chunk that reads `scene.fog`.

## How to read this plan

This doc fixes the *shape* of the changes (where new code slots in, acceptance criteria), not every implementation choice. Where it names a technique, treat it as the researched starting point, not a mandate. Each agent picking up a phase should measure on the actual target (RTX 3070 desktop, mid-tier mobile) before committing, and pick the simplest thing that reads correctly rather than the most impressive.

**The dual-path rule governs this whole cycle.** Nearly every render system here has a WebGL implementation and a WebGPU node-material twin, and production boots WebGPU. A phase that lands on one path only is a half-fix and fails its own acceptance. Each phase below names both files. Where a phase is deliberately single-path, it says why.

## Open questions resolved before writing code

1. **Q1: does the grass exclusion falloff belong in the scatter or in the shader?** **Scatter.** `js/GrassSystem.js:1965` `isExcluded(x, z)` is a CPU boolean called at scatter time from line 1654, inside a loop that already **oversamples** (`clumpCount * 1.5`) and filters. A probability-based keep drops straight into that existing reject with no new per-fragment cost and no shader change on either path. A shader-side discard would pay per-fragment forever for a decision that is static per instance.

2. **Q2: does the exclusion falloff distance belong on the `SceneDef`?** **No, a module constant.** `.claude/rules/scene-and-render.md` says scene-specific knobs live on the `SceneDef` rather than as branches in `TerrainBuilder` or `GrassSystem`, and that rule is about **branching on scene id**, which this does not do. A single falloff width applied uniformly to every exclusion zone is a property of the effect, not of a scene. This also keeps [`../shared/scenes/types.js`](../shared/scenes/types.js), a fence-frozen file, untouched. Revisit only if a scene demonstrably needs a different band.

3. **Q3: should the dog's ground contact live in the grass shader, the terrain shader, or a decal?** **Both shaders, no decal.** `js/GrassSystem.js:1073` already computes `vShadow` from the oriented rounded-rectangle interaction SDF and applies it at line 1225, so the grass hook exists and costs nothing new. But grass alone is not enough: the pen and the farmhouse yard are the exact places the dog crosses bare ground, and a contact shadow that vanishes on bald patches is worse than none. The terrain needs the matching term. A projected decal mesh was considered and rejected: it adds a draw call and a sorting problem for an effect two existing shaders can express.

4. **Q4: is there a geometric horizon skirt phase?** **No.** See "What the reconnaissance changed", point 3. The slot goes to the terrain fog liveness fix and to a real seam gate, which discharges an open carryover item instead of inventing work.

## Architecture / shared changes

One new shared idea, introduced in Phase 2 and reused in Phase 5.

**The ground field.** Terrain and grass must agree about where the ground is lighter, darker and browner. Today they each invent their own variation and disagree. Phase 2 extracts the terrain's existing noise formulation into a single documented description that both grass paths reproduce at the same world frequencies and the same rotation, so a blade standing on a darker patch is itself darker. This follows the project's own precedent: [`../js/world/foliageLightingRig.js`](../js/world/foliageLightingRig.js) is the single foliage-lighting authority, and the heightfield is the single source of truth for ground height. This is the same move for ground colour.

It is a **convention plus a shared constant set**, not a new runtime module. The four shaders involved (WebGL grass vertex desktop, WebGL grass vertex mobile, WebGPU grass blade node, and the two terrain paths) cannot import a common GLSL/TSL function without a codegen layer this cycle does not want to build. What they can share is the constants and an exactly specified formula, pinned by a test that fails if any path's numbers drift from the others.

## Phase 1 - Grass stops at a soft edge (~2hr)

**Independently testable. Depends on nothing.** Highest visual payoff for the least risk, and it is the defect the front-end review named first.

Today `isExcluded(x, z)` returns a hard boolean, so each zone sits inside a knife-edge rectangle of bare ground.

**The pen's rectangle is also the wrong size, and it is hardcoded.** The farmhouse yard is declared on the scene (`shared/scenes/field.js:74-77`, an 80m by 80m rect at `x[140,220] z[120,200]`), but the pen is not: [`../js/TerrainBuilder.js`](../js/TerrainBuilder.js):1165 calls `addExclusionZone(-35, 35, 98, 138)` with literal numbers, while the scene declares `pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 }`. So a 60m by 28m fence stands inside a 70m by 40m bald patch: grass stops 5m outside each side fence, 2m in front of the gate line and 10m behind the back fence. Even with a perfect falloff, a hardcoded rect that does not match its own fence will still read wrong.

1. **Derive the pen zone from the scene** rather than from the literal. The Cycle 7 comment above that line explains why the call is guarded on `sceneDef.pasture`; the numbers themselves were never migrated. Use the declared `pasture` rect. This is a behaviour change to grass placement on Home Field and it will move the goldens, which Phase 8 handles.
2. **Add a keep-probability function** beside `isExcluded` in [`../js/GrassSystem.js`](../js/GrassSystem.js). For each zone compute the signed distance from `(x, z)` to the zone's edge (for `type: 'rect'`, the standard axis-aligned box SDF; for `type: 'rotated'`, the same after the existing inverse rotation at lines 1998-2010, which already transforms the point into the zone's local frame). Inside the zone the keep probability is 0; from the edge outward it rises over a falloff band via smoothstep. Take the minimum keep across all zones so overlapping zones compose.
3. **Keep `isExcluded` as the hard test** and have it delegate, so the shoreline cull at lines 1990-1993 and any other caller keep their current exact behaviour. Only the scatter path consumes the probability.
4. **Consume it at scatter.** [`../js/GrassSystem.js`](../js/GrassSystem.js) line 1654 becomes a probabilistic reject against `this.random()`. Note this consumes randoms in a different pattern than today, which will move the golden frames. That is expected, not a regression, and Phase 8 re-baselines with the reason recorded.
5. **Taper height as well as density** near the edge, using the existing per-blade `heightScale` at line 645. Density alone thins to a speckle; a height taper makes the thinning read as grass being worn down rather than as missing instances.
6. **Name the falloff width once** as a module constant with a comment explaining the number, per Q2.

**Acceptance (EARS):**

- When Phase 1 ships, then the Home Field pen's grass exclusion shall be derived from the scene's declared `pasture` rect rather than from literal numbers in `js/TerrainBuilder.js`.
- When Phase 1 ships, then `js/GrassSystem.js` shall expose a keep-probability function that returns 0 inside an exclusion zone, 1 beyond the falloff band, and a monotonically increasing value between.
- When a grass clump is scattered within the falloff band of an exclusion zone, then its keep probability shall be strictly between 0 and 1.
- While an exclusion zone is rotated, the falloff band shall follow the rotated edge rather than an axis-aligned bounding box.
- When two exclusion zones overlap, then the keep probability shall be the minimum of the two rather than their product.
- When `npm test` runs, then a new spec shall pin the keep-probability curve at the zone edge, mid-band and beyond the band.

## Phase 2 - Grass reads the ground it stands on (~3hr)

**Depends on nothing. Can run in parallel with Phase 1 only if the two agents coordinate on `js/GrassSystem.js`; otherwise serialise.** In practice Phases 1, 2 and 5 all touch that file, so one agent owns the grass cluster.

The roadmap asks for lower blade contrast, per-clump hue variation, and a low-frequency ground albedo. The third already exists (see "What the reconnaissance changed"). The real work is the first two, plus making grass agree with the ground.

1. **Lower blade contrast.** Home Field's ramp runs `base #5a7a3e` to `mid #8aa860` to `tip #c4d68c` over `vHeight` with a break at 0.4 ([`../js/GrassSystem.js`](../js/GrassSystem.js):1207-1211), a luminance span of roughly 0.42 to 0.81. Compress it toward the mid. Change the scene-def colours in [`../shared/scenes/field.js`](../shared/scenes/field.js) and the peer scenes rather than the shader, so the ramp shape stays and each scene keeps its own identity.
2. **Replace the plaid with the terrain's field.** `vColorVariation` at `js/GrassSystem.js:1070` and `js/world/webgpuGrassBladeNodeMaterial.js:164` is `sin(x * 0.2) * cos(z * 0.15) * 0.5 + 0.5`, a regular interference pattern. Replace with the same hash value-noise the terrain uses at the same low frequencies and the same 43-degree rotation, so a blade standing on a browner patch of ground is itself browner. Reproduce the formula exactly on both paths.
3. **Give the hue offset spatial coherence.** The current per-blade offset is `hash11(gl_InstanceID)` on the WebGL path and a world-position hash on the WebGPU path, both at amplitude 0.04, which reads as noise rather than as clumping. Quantise the input to roughly clump scale so neighbouring blades share a hue, then keep a much smaller per-blade term on top for break-up.
4. **Do all three on every grass path.** [`../js/GrassSystem.js`](../js/GrassSystem.js) has a desktop vertex shader (around line 909), a mobile vertex shader (around line 1083) and a shared fragment shader (around line 1186). [`../js/world/webgpuGrassBladeNodeMaterial.js`](../js/world/webgpuGrassBladeNodeMaterial.js) is the WebGPU twin. Check [`../js/world/webgpuMeadowQuadNodeMaterial.js`](../js/world/webgpuMeadowQuadNodeMaterial.js) for the same terms.
5. **Deal with the shadow copies.** There is a fourth and fifth copy of these shaders that is easy to miss. `js/shaders/grass/{desktop-vertex,mobile-vertex,fragment}.glsl` are fetched at [`../js/GrassSystem.js`](../js/GrassSystem.js):143-145, and the comment at lines 726-731 says the inline shaders are the source of truth while the files "mirror these and are kept as a backup load path". They are already stale (last touched 2026-06-03 and 2026-06-04) and they are fetched at every scene load and then discarded, since `createGrassMaterial` always picks the inline variant. Either update them in lockstep or delete them and the fetch. Deleting is the better answer, because a mirror nobody renders is a mirror nobody keeps correct, but confirm nothing else consumes `loadShaderWithReplacements` for grass before removing it.
6. **Pin the agreement with a test**, per the Architecture section: a spec that extracts the noise constants from each path and fails if they diverge.

**Acceptance (EARS):**

- When Phase 2 ships, then no grass shader on either path shall compute colour variation from a product of `sin` and `cos` of world position.
- When Phase 2 ships, then the grass colour-variation frequencies and rotation constant shall equal the terrain's, verified by a spec that reads both files.
- While a blade stands on a patch the terrain shades browner, the blade shall shade browner in the same direction.
- When Phase 2 ships, then the per-scene grass base-to-tip luminance span shall be narrower than at cycle start, recorded as a before and after number in the phase notes.
- When the hue offset is sampled at two points within one clump radius, then the two values shall differ by less than they do across clumps.
- If `js/shaders/grass/*.glsl` still exist after Phase 2, then they shall carry the same colour-variation terms as the inline shaders; otherwise they and their fetch shall be gone.

## Phase 3 - Fence posts stop being a picket line (~2hr)

**Depends on nothing. Fully parallel with the grass cluster: it touches only [`../js/FencePresets.js`](../js/FencePresets.js).**

Posts are placed at exactly even spacing, at one height, with `rotation.y` set only to a fixed `Math.PI / 2` for the run axis ([`../js/FencePresets.js`](../js/FencePresets.js):202-213 for the GLB path, 263-277 for the procedural fallback).

1. **Confirm the fence is visual-only before jittering it.** Check whether any post transform feeds collision or the shared boundary. If a post's position or height is read by anything the Worker sim or `shared/BoundaryCollision.js` sees, **stop and surface**: that is a sim change and this cycle does not have authorization for one. Expected answer is that the fence is decorative and boundaries come from `bounds`, but verify rather than assume.
2. **Jitter rotation and height per instance**, seeded so the fence is identical on every load and identical between clients. Use the repo's existing seeded PRNG (`mulberry32` seeded off a stable string, the pattern at `js/GrassSystem.js:71-85`), keyed on the post index and the run, never `Math.random()`.
3. **Add a small lean**, a degree or two of `rotation.x` and `rotation.z`. A post that is only rotated about its own axis reads as unchanged, because a cylinder is rotationally symmetric. This is the change that actually shows.
4. **Do not break the rails.** Rails are positioned between adjacent posts (lines 216-250) and one path interpolates them to follow terrain. Height jitter must move the post's top without moving the rail attachment heights, or the rails will detach visibly. Verify on a long run, not a short one.
5. **Apply to both the GLB path and the procedural fallback**, so a machine without the kit sees the same fence shape.

**Acceptance (EARS):**

- When Phase 3 ships, then adjacent fence posts shall differ in height and in yaw.
- When the same scene is loaded twice, then every post's transform shall be identical between the two loads.
- If any fence post transform is read by collision or by `shared/`, then the phase shall stop and surface rather than jitter it.
- While a fence run crosses uneven terrain, the rails shall remain visually attached to both of their posts.
- When `npm test` runs, then a spec shall assert the jitter is seeded and reproducible.

## Phase 4 - The farmhouse gets a roof, walls and trim (~2hr)

**Depends on nothing. Fully parallel with Phases 1, 2, 3 and 5.**

The GLB already separates the meshes by role; only the material is shared. Assign by name prefix at load.

1. **Group the 55 meshes by role.** Roof: `Mesh_RoofA`, `Mesh_GableFront_*`, `Mesh_PorchRoof`. Trim: `Mesh_WFrame*`, `Mesh_WGrid*`, `Mesh_DoorFrame*`, `Mesh_DoorPlank*`, `Mesh_DoorHandle`, `Mesh_Rail*`, `Mesh_Slat*`, `Mesh_PorchColumn*`, `Mesh_PorchSupport*`. Wall: `Mesh_Body_Wall*`, `Mesh_StoneBase`, `Mesh_Chimney*`. Leave `ShadowProxy` alone. Put the mapping in one named table with a comment, not inline string tests scattered through a loop.
2. **Derive three materials from the loaded one** rather than replacing it. Clone `PaletteMaterial001` three times and vary tint and roughness per group, so the atlas keeps working and the model still reads as one object lit one way. Replacing the atlas with flat colours would lose the texture detail that is already there.
3. **Keep it to three groups.** The temptation is a material per role. Three is what the roadmap asks for and three is what reads at gameplay distance.
4. **Find where the model is instantiated** ([`../js/TerrainBuilder.js`](../js/TerrainBuilder.js) loads it from the `buildings` list around line 429) and check whether anything already overrides the material. If code is flattening the atlas to a single colour, that alone explains the review's observation and is the first thing to fix.
5. **Check the WebGPU material adapter path.** [`../js/world/materialReplacement.js`](../js/world/materialReplacement.js) and [`../js/world/webgpuMaterialAdapter.js`](../js/world/webgpuMaterialAdapter.js) convert stock materials to node materials. Three materials must survive that conversion as three.

**Acceptance (EARS):**

- When the farmhouse finishes loading, then its meshes shall reference exactly three distinct materials, not one.
- When Phase 4 ships, then the roof group, the wall group and the trim group shall each be defined by one named table rather than by inline name tests.
- While the WebGPU path is active, the farmhouse shall still present three distinct materials after node-material adaptation.
- If the split would require editing the GLB, then the phase shall stop and surface, because D11 forbids new geometry this cycle.
- When `npm test` runs, then a spec shall assert the role table covers every mesh name in the shipped GLB, so a re-export that renames a mesh fails loudly.

## Phase 5 - The dog has weight (~3hr)

**Depends on Phase 2** (it reuses the ground-field agreement and edits the same shaders). Run after Phase 2 lands.

The dog reads as pasted onto the field at every camera distance. It needs contact darkening under it.

1. **Extend the grass term.** `js/GrassSystem.js:1073` computes `vShadow = 1.0 - clamp(length(totalPush) * 0.15, 0.0, 0.2)`, which darkens where blades are **pushed**, not where the dog **is**. Push magnitude is the wrong driver: it peaks at the body's edge and can fall off directly underneath. Add a proximity term from the same oriented rounded-rectangle SDF the interaction already evaluates, so the darkest point is under the dog's centre.
2. **Give the terrain the matching term.** Grass-only contact vanishes exactly where the dog crosses the pen and the farmhouse yard, which are bald by design. Add the same falloff to the terrain colour on both paths: [`../js/TerrainBuilder.js`](../js/TerrainBuilder.js) and [`../js/world/webgpuTerrainNodeMaterial.js`](../js/world/webgpuTerrainNodeMaterial.js). The terrain needs the dog's world position and facing as a uniform it does not currently carry.
3. **Match the two falloffs.** If grass and terrain darken over different radii, the shadow will visibly change shape as the dog crosses the grass line, which is worse than no shadow. Share the constants.
4. **Dog only, not sheep.** A 5,000-instance version is a different problem with a different budget, and `.claude/rules/scene-and-render.md` forbids decomposing `OptimizedSheep`. Out of scope, and say so.
5. **Check it against the real shadow.** If shadow mapping is already casting a dog shadow on desktop, this is a close-range grounding term underneath it, not a replacement. Tune so the two do not stack into a black blob at noon.

**Acceptance (EARS):**

- When the dog stands still on grass, then the ground directly beneath it shall be darker than the ground one body-length away.
- When the dog stands still on a bald exclusion patch, then the terrain shall darken beneath it by the same falloff the grass uses.
- While the dog crosses the boundary between grass and bare ground, the contact darkening shall not visibly change radius.
- When Phase 5 ships, then the contact falloff radius shall be defined once and read by both the grass and the terrain paths.
- If the contact term is applied to sheep, then the phase has exceeded its scope and shall stop.

## Phase 6 - The WebGPU terrain stops carrying its own fog (~2hr)

**Depends on nothing. Parallel with everything.** Small, and it discharges a real rule violation.

Scope this honestly: the colour is already correct at boot, so this is not a visible fix on the three static-sun scenes. It matters on Newsheepdogland's day/night cycle, and NSL is entrance-gated per D19. It ships because the rule is the rule and the fix is cheap, not because a player will notice.

1. **Read the rule first.** `.claude/rules/scene-and-render.md`: "Don't introduce per-material fog uniforms for new render passes if you can use `scene.fog`. Custom fog drifts from the sky."
2. **Prefer deletion to a live update path.** `MeshLambertNodeMaterial` participates in Three's own fog. If removing the hand-rolled `distantFog` and `horizonFog` blend at [`../js/world/webgpuTerrainNodeMaterial.js`](../js/world/webgpuTerrainNodeMaterial.js):69-94 leaves the terrain correctly fogged by `scene.fog`, delete it. Capture before and after at noon and at dusk to confirm the look holds.
3. **If deletion changes the look**, keep the shaping but drive the colour from a live uniform updated by [`../js/atmosphere/Atmosphere.js`](../js/atmosphere/Atmosphere.js) alongside `scene.fog`, so the two cannot diverge. Record why deletion was not viable.
4. **Verify on Newsheepdogland specifically**, since it is the only scene with a moving sun and therefore the only place the bug is observable. `?scene=newsheepdogland` still works even though the entrance gates it.
5. **Do not touch the sky, `scene.fog`, or `paintedHorizon.js`.** Cycle 112 Phase 6 settled those and its A/B evidence is in `cycle112-validation/`.

**Acceptance (EARS):**

- When Phase 6 ships, then the WebGPU terrain material shall not composite a fog colour that was frozen at material creation.
- While Newsheepdogland's sun moves through a full day, the terrain's fogged distance shall track the sky rather than hold a boot-time colour.
- When Phase 6 ships, then noon and dusk captures shall show the near and mid field unchanged, with any delta confined to the far band.
- If removing the hand-rolled fog changes the look on a static-sun scene, then the phase shall keep the shaping, drive the colour live, and record why.

## Phase 7 - A horizon-seam gate that actually gates (~3hr)

**Depends on nothing. Parallel with everything.** Discharges carryover item 4 from Cycle 113.

[`../tools/validation/horizon-seam.mjs`](../tools/validation/horizon-seam.mjs) ships as an A/B reporting tool that **always exits 0**, because its band detector scored Rolling Hills *worse* after Cycle 112 fixed the seam: with the seam gone it locked onto unrelated terrain features. Cycle 112 deliberately refused to tune the threshold until it went green, on the grounds that fitting the test to the answer proves nothing. That was right, and it left a real gate unbuilt.

1. **Give the detector the horizon line.** The current detector hunts for a bright band anywhere in the frame. The horizon's screen-space y is computable from the camera pose (the ray at zero pitch, projected), so the detector can sample a narrow window around a known line instead of searching. That is the whole fix.
2. **Measure the delta across the line**, not the absolute brightness of a band. A seam is a discontinuity between the pixels just above and just below the horizon. Absolute brightness is a scene property; the step across the line is the defect.
3. **Validate the detector against known-good and known-bad inputs** before trusting it. Cycle 112 left both in `cycle112-validation/horizon-seam/`: before images with the seam and after images without. A detector that does not score the before worse than the after is not a detector, and this phase fails.
4. **Make it exit non-zero** past a stated threshold, and add it to `validation:all` in [`../package.json`](../package.json), which does not currently include it.
5. **Heed the two traps Cycle 112 recorded.** In-page WebGL canvas readback returns blank without `preserveDrawingBuffer`, giving an all-zero profile that reads exactly like a pass. Use `page.screenshot()` and decode. And the cinema harness gives a horizon-facing camera with an unlit sky, so fog samples near zero and the capture is useless for a colour comparison. Use the lit gameplay entry.

**Acceptance (EARS):**

- When the seam detector runs against Cycle 112's before images, then it shall score them worse than the after images from the same scene and camera.
- When the seam detector runs on the current build, then it shall exit non-zero if the step across the horizon line exceeds the stated threshold.
- When Phase 7 ships, then `npm run validation:all` shall include the seam gate.
- If the detector cannot separate Cycle 112's before and after images, then the phase shall report failure rather than lower the threshold until it passes.

## Phase 8 - Gate, re-baseline, docs, close (~2hr)

**Depends on Phases 1 through 7.**

1. **Full gate.** `npm run lint`, `npm test`, `npm run typecheck`, `npm run build`.
2. **Re-baseline the goldens deliberately, not blind.** Phases 1, 2 and 5 all change what the ground looks like, so every golden frame moves. Cycle 112 set the standard: isolate the delta, confirm it is confined to where the change should show, then re-baseline. Do not run `--capture` and call it verified. Note that `validation:all` currently runs the golden harness with `--capture` rather than `--diff`, which is how it went eight cycles without anyone noticing it was failing. Run `--diff` explicitly and read the numbers.
3. **Browser probe on all four scenes**, both render paths where they differ. Per `.claude/rules/scene-and-render.md`, close every Playwright page, context and browser, stop any dev listener started for the probe, and set `SDS_SUPPRESS_BROWSER_OPEN=1`.
4. **Update the roadmap.** [`front-door-roadmap.md`](front-door-roadmap.md)'s Cycle 114 section still lists the horizon skirt and the ground albedo as open. Correct both, and record what Phase 4 found about the farmhouse so Cycle 115 does not re-derive it.
5. **Correct the roadmap's Cycle 115 entry, which describes work that largely already shipped.** A separate four-agent reality check established this, and leaving it uncorrected would cost the next cycle a rebuild of working assets. Already shipped: the distinct hung gate (`Gate_Assembly-v1.0.0.glb`, 8 meshes, 3 materials, slant-capped posts, iron hinges, two leaves on pivots, loaded at `js/FencePresets.js:113-127`); the farmhouse as a modular kit-bash, near-verbatim to the roadmap's wording; the trough and both hay bales, placed across four scenes by `js/world/homesteadPlayfieldProps.js`. **The farmhouse checkpoint already fired and already resolved to external**, recorded in `cycle105-validation/homestead-playfield-pack-report.md`, so Cycle 115 must not re-author it. Genuinely missing: `tools/bake-fence.mjs` and any authoring source for the fence kit at all (it exists only as an opaque GLB, so weathering, sag and chamfer cannot be tuned without rebuilding); the gate's leaf rig on Home Field, which renders frozen in its baked-open pose because only Newsheepdogland calls `_buildAuthoredGateDoor`; the dirt approach; and the dusk lamp, for which there is currently no `PointLight` or `SpotLight` anywhere in `js/`. Also note the yard sits at `x 156-188, z 132-153` around the farmhouse at `(180, 160)`, while Home Field's gate is at `(0, 100)`, so there is no yard on the gate approach to lay a dirt path across.

**Acceptance (EARS):**

- When Phase 8 ships, then `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` shall all pass.
- When the goldens are re-baselined, then the delta shall be shown to be confined to the ground and the props this cycle touched, with the numbers recorded.
- When Phase 8 ships, then the roadmap's Cycle 114 section shall no longer list the ground albedo or the horizon skirt as open work.
- When the close commit lands on `main`, then the sheepdogsim.com deploy shall succeed via GitHub Actions.

## Dependencies

```
Phase 3 (fence)      ─┐
Phase 4 (farmhouse)  ─┤
Phase 6 (terrain fog)─┼─→ Phase 8 (gate, docs, close)
Phase 7 (seam gate)  ─┤
                      │
Phase 1 (falloff)  ─→ Phase 2 (ground field) ─→ Phase 5 (dog contact)
```

Phases 3, 4, 6 and 7 are mutually disjoint in the files they touch and run fully in parallel.

Phases 1, 2 and 5 all edit [`../js/GrassSystem.js`](../js/GrassSystem.js), and 2 and 5 both edit the terrain pair. **One agent owns that chain**; splitting it across parallel agents produces conflicting edits to the same shader strings. Phase 5 depends on Phase 2's ground-field constants existing.

## Frozen files (cycle-specific additions)

None. This is deliberate and worth stating.

The durable fence list in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) covers [`../shared/scenes/types.js`](../shared/scenes/types.js), the `shared/` sim cores and the sim-baseline fixtures. **This cycle touches none of them**, which is what Q2 was really deciding: defaulting the exclusion falloff to a module constant instead of a `SceneDef` field keeps the schema untouched and needs no authorization.

If a phase finds itself wanting a `SceneDef` field, that is a signal to stop and surface, not to add one quietly.

## Hard stops

Durable stops apply, see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. **Any new geometry.** D11 is the whole premise. If a grounding fix seems to need a new model, a new mesh, or an edit to a GLB, stop and surface. That is Cycle 115.
2. **Any fence post transform read by collision or `shared/`.** Phase 3 step 1 checks for this. If it is true, jittering posts is a sim change without authorization. Stop.
3. **Any single-path render change.** Production boots WebGPU. A phase that lands only on the WebGL path has shipped nothing to most players, and the reverse leaves the fallback broken. Both, or an explicit written reason.
4. **Blind golden re-baselining.** Phases 1, 2 and 5 move every golden frame. Isolate the delta and confirm it is confined to what changed, the way Cycle 112 did, before rewriting a baseline.
5. **A seam threshold tuned until it passes.** Phase 7 fails honestly if its detector cannot separate Cycle 112's before and after images. Cycle 112 already refused this once; do not undo that.

## What NOT to do during this cycle

- **Do not build the fence kit, the five-bar gate, or the farmhouse kit-bash.** Cycle 115, per D11. Phase 4 assigns materials to meshes that already exist and stops there.
- **Do not touch the gate cue.** The light column, chevron, lantern and threshold arc are Cycle 116 and depend on Cycle 115's posts.
- **Do not change the Rolling Hills corral.** Cycle 117 owns it, and it is a sim change with its own fixture story.
- **Do not touch the water.** Cycle 118.
- **Do not re-litigate the horizon colour fix.** Cycle 112 Phase 6 settled it with measurements and an A/B pair. Phase 6 here fixes a different, smaller thing.
- **Do not decompose `GrassSystem.js` or `OptimizedSheep.js`.** Both are large-and-cohesive by design, recorded in [`../DECISIONS.md`](../DECISIONS.md).
- **Do not add a contact shadow to the sheep.** Phase 5 step 4.
- **Do not bump the version.** D20 rolls continuously.
- **Do not ungate Newsheepdogland**, even though Phase 6 tests against it. D19 holds until the front door ships.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run lint` and `npm run typecheck` run at cycle close, both shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When a grass clump is scattered within the falloff band of an exclusion zone, then its keep probability shall be strictly between 0 and 1.
- [ ] When Phase 2 ships, then no grass shader on either path shall compute colour variation from a product of `sin` and `cos` of world position.
- [ ] When the same scene is loaded twice, then every fence post's transform shall be identical between the two loads.
- [ ] When the farmhouse finishes loading, then its meshes shall reference exactly three distinct materials, not one.
- [ ] When the dog stands still on a bald exclusion patch, then the terrain shall darken beneath it by the same falloff the grass uses.
- [ ] When Phase 6 ships, then the WebGPU terrain material shall not composite a fog colour that was frozen at material creation.
- [ ] When the seam detector runs against Cycle 112's before images, then it shall score them worse than the after images from the same scene and camera.
- [ ] When the goldens are re-baselined, then the delta shall be shown to be confined to the ground and the props this cycle touched.
- [ ] When the cycle closes, then no new geometry shall have shipped, per D11.

## References

- [`front-door-roadmap.md`](front-door-roadmap.md) - where this cycle sits in the seven-cycle program
- [`../DECISIONS.md`](../DECISIONS.md) - the 21-decision register, "Front door alignment". D9 (stylised painterly), D11 (grounding before geometry), D19 (NSL gated), D20 (roll continuously)
- [`../.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - grass discipline, heightfield single source of truth, the fog rule Phase 6 enforces
- [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files, none of which this cycle touches
- [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`archive/cycles/cycle-112-plan.md`](archive/cycles/cycle-112-plan.md) - Phase 6's horizon colour fix, its A/B evidence, and the two capture traps
- [`BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items
