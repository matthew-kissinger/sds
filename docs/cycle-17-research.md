# Cycle 17 — Open-question resolutions

> 2026-05-04. Code-evidence pass before Phase 1 starts. Cross-references the
> [cycle-17-plan.md](cycle-17-plan.md) Open-questions section. Each Q lists
> what the plan posited, what the code actually shows, and the chosen path.

## Q1 — Octahedral impostor pipeline

**Plan posited:** Pixel Forge ships a Kiln subcommand `pixelforge kiln bake-imposter ./tree.glb --out ./tree.png --angles 16` per [`pixel-forge/docs/kiln-vision.md`](file:///C:/Users/Mattm/X/games-3d/pixel-forge/docs/kiln-vision.md).

**What the code shows:**

- The `kiln-vision.md` doc never mentions a `bake-imposter` CLI. The plan's reference is wrong on that detail.
- However, Pixel Forge **does** ship a real `bakeImposter()` API at [`pixel-forge/packages/core/src/kiln/imposter/bake.ts`](file:///C:/Users/Mattm/X/games-3d/pixel-forge/packages/core/src/kiln/imposter/bake.ts) — Playwright + Three.js 0.184 octahedral / lat-lon atlas baker. Surface:
  ```ts
  import { kiln } from '@pixel-forge/core';
  const { atlas, aux, meta } = await kiln.bakeImposter(glbBuffer, {
    angles: 16, axis: 'hemi-y', tileSize: 512, auxLayers: ['depth'],
    colorLayer: 'baseColor',
  });
  ```
- It's TypeScript in a sibling repo (`C:/Users/Mattm/X/games-3d/pixel-forge`), not on npm. Integration options: (i) `bun add file:../pixel-forge/packages/core`, (ii) write a small adapter script that runs inside `pixel-forge/` and emits the atlas + sidecar to `sds/assets/`.
- The CLI lives at [`pixel-forge/packages/cli/src/commands/kiln.ts`](file:///C:/Users/Mattm/X/games-3d/pixel-forge/packages/cli/src/commands/kiln.ts) — exposes `list-primitives`, `validate`, `inspect`, `refactor`. No `bake-imposter` subcommand. We could add one, but the programmatic API is the simpler integration.

**Decision:** Keep the cross-billboard impostor as the primary far-LOD tier. **Defer Pixel Forge octahedral integration** to a future cycle — Phase 5's primary goal becomes (a) per-instance frustum-cull sync investigation and (b) a LOD2.5 mid-tier (smaller leaves, same trunk geom). Phase 5 acceptance gets relaxed: we either ship the cull-sync fix + LOD2.5 tier OR document why neither was needed. Octahedral is a different cycle's work given the integration friction.

**Why this defer is OK:** the user's stated regression is "trees / rocks / flora invisible at distance on mobile classic camera" — that's about cull/visibility behavior, not LOD impostor quality. Better impostors at 250m+ don't fix invisible trees at 80m.

## Q2 — Mobile asset invisibility root cause

**Plan posited three suspects:** (a) impostor texture race (`getRenderer()` null at `createTrees()` time), (b) `InstancedMesh2.perObjectFrustumCulled` over-cull from cross-billboard bounds, (c) degenerate trunk LOD2 geom pulls bounds toward origin.

**Code evidence:**

- **(a) Race-condition graceful fallback exists.** [`TerrainBuilder.js:1148-1153`](../js/TerrainBuilder.js) — `_bakeTreeImpostor(lod0Model, renderer)` returns `null` if `renderer` is missing. `billboardGeo` and `billboardMat` are then both null. `addLOD(billboardGeo, billboardMat, 150)` is gated on the truthiness check, so trees that miss the impostor degrade to LOD0+LOD1 only. They wouldn't disappear, just ship without the 150m cross-billboard tier. **Not the root cause.**
- **(b) Cross-billboard rotation-invariance.** The [`_createCrossBillboardGeometry`](../js/TerrainBuilder.js) at line 1332 generates 3 planes at 0°/60°/120° — symmetric in XZ. Per-instance rotated bounds match within ±15% of unrotated bounds. **Possible but mild contributor.**
- **(c) `_lod2EmptyGeo` is degenerate at origin.** [`TerrainBuilder.js:1124-1130`](../js/TerrainBuilder.js) — three co-located verts at `(0,0,0)`. When InstancedMesh2 computes per-instance bounds for cull, the trunk's LOD2 entry has zero bounds. **However** — InstancedMesh2 uses the LOD0 geometry's bounds for the parent BVH and only swaps geometry at draw time. So the degenerate LOD2 shouldn't affect the per-instance BVH. **Plausible but needs profiling.**
- **Strong fourth hypothesis (not in plan):** **mobile classic-camera at wide zoom positions the camera 60-80m from the action**. The LOD distances `addLOD(lod1Geo, mat, 80)` and `addLOD(billboardGeo, mat, 150)` are CAMERA-distance thresholds. On mobile zoomed-out classic, even the closest trees may be > 80m from the camera, so they all swap to LOD1 immediately, and trees past 150m swap to the cross-billboard. If the cross-billboard texture failed to bake (renderer=null path), those trees become invisible-at-distance because no LOD2 ever fired. **This is the single-most-plausible mechanism for the user-visible "invisible at distance" symptom.**

**Decision:** Phase 1 builds the mobile-probe harness FIRST, captures `getSceneManager()?.getRenderer()` value at `createTrees()` call time + the `_bakeImpostorCache` Map contents post-init, then proves which hypothesis is correct. The most likely fix is **belt-and-suspenders**: if `renderer` is null at first call, retry the bake on first `update()` call (before any tree could possibly be at LOD2 distance). Combined with re-tuning the LOD distances for mobile (LOD0→LOD1 at 100m vs 80m to give some headroom on the wide-zoom camera).

**Tactical for the harness:** new URL param `?probeRender=1` logs to `__sds.probe`:
- `getSceneManager().getRenderer()` truthy at createTrees
- Per-tree-type: did `_bakeTreeImpostor` succeed? (record `impostor` truthy)
- Per-frame: how many trees are at LOD2 vs LOD1 vs LOD0
- `__sdsRenderer.info.render.triangles` snapshot

## Q3 — White-bark tree origin

**Plan posited:** (a) recipe `bark.tint` not applied; (b) impostor lighting washout (ambient 0.55 + dirLight 0.85 = 1.4× white).

**Code evidence:**

- [`tools/bake-trees.mjs:55-60`](../tools/bake-trees.mjs) — `BARK_TINTS` per species/scale all in `0x4a-0x8c` brown family. Lowest `0x4a3525` is RGB(74, 53, 37) — definitively brown, not anything close to white.
- [`TerrainBuilder.js:1249-1253`](../js/TerrainBuilder.js) — `_bakeTreeImpostor` lighting:
  ```js
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
  ```
  Combined 1.4× white. Brown bark `0x6e4f30` (RGB ~0.43, 0.31, 0.19) lit at 1.4× = ~RGB(0.60, 0.43, 0.27) → tan/beige, **not white**. So lighting alone isn't enough to produce a fully-white silhouette.
- The user's description — "tall and skinny, few branches, white bark" — could match the **single-billboard pine** bake at LOD1. EZ-Tree's default leaves material may inherit a white emission if `bark.tint` propagation was buggy for one specific recipe.

**Decision:** Phase 2 reproduces visually FIRST via a new `tools/probe-glbs.mjs` that loads each of the 6 committed tree GLBs side-by-side at uniform lighting, captures a screenshot grid. Identify the offender, then trace back. Likely fixes are belt-and-suspenders:
1. Drop impostor lighting to ambient `0.20` + dirLight `0.50` (cuts the cream-cast).
2. Swap impostor bake background to a neutral mid-grey (`0x404040`) instead of transparent so alpha-cutoff doesn't bias toward over-bright pixels.
3. Re-bake any tree GLB that fails the brown-family check.

**Don't pre-commit to a fix.** The "tall and skinny, few branches" silhouette description is consistent with both pine_small_single_lod1 (a thin pine LOD1 reading edge-on) and the `_lod2EmptyGeo` degenerate trunk + leaf-only cross-billboard at far distance. Visual reproduction in Phase 2 will isolate.

## Q4 — Open Country objective scaling formula

**Plan posited:** Three formulas. Lean: (a) `Math.max(10, Math.floor(totalSheep * 0.40))`. Plan called the schema field `CorralDef.requiredSheepFraction`.

**Code evidence:**

- **The field lives on `ObjectiveDef`, not `CorralDef`.** [`shared/scenes/open-country.js:107`](../shared/scenes/open-country.js) — `requiredSheep: 40` is inside the `objective: { ... }` block. [`shared/scenes/types.js:138-142`](../shared/scenes/types.js) — `@typedef {Object} ObjectiveDef` declares `requiredSheep`.
- **Consumers identified via grep:**
  - [`shared/scenes/open-country.js:107`](../shared/scenes/open-country.js) — sole writer.
  - [`shared/scenes/types.js:140`](../shared/scenes/types.js) — typedef.
  - [`js/GameState.js:48`](../js/GameState.js) — JSDoc snapshot of objective shape.
  - [`js/GameState.js:409`](../js/GameState.js) — `if (count >= this.objective.requiredSheep)` — gate-zone hold check.
  - [`js/GameState.js:693`](../js/GameState.js) — `requiredSheep: objective.requiredSheep` — copies into snapshot.
  - [`js/components/GameHUD/ObjectiveBanner.js:36`](../js/components/GameHUD/ObjectiveBanner.js) — `required: obj.requiredSheep | 0` (HUD).
  - **No `worker/` consumers** beyond bundled scene-def copies (worker/.wrangler/tmp/dev-*/index.js — auto-regenerated at build).
- **No `shared/GameStateValidation.js` consumer.** The plan listed it as fence-authorized for Phase 6, but it doesn't actually consume `requiredSheep`. **Fence change for `GameStateValidation.js` is not needed.**
- The OC objective's existing comment at [`open-country.js:101-103`](../shared/scenes/open-country.js) says "≥40 sheep (20% of 200)". The user's stated preference is "if 200 then 80, scale for all the other amounts" → **40%, not 20%**. Phase 6 is both a scaling change AND a gameplay rebalance.

**Decision:**

- **Schema:** add `ObjectiveDef.requiredSheepFraction: number` (default `0.40`) + `ObjectiveDef.requiredSheepMin: number` (default `10`). Keep `requiredSheep` as opt-out for legacy / non-scaling scenes.
- **Helper:** add to `shared/index.js` (or as `shared/ObjectiveLogic.js`):
  ```js
  export function getRequiredSheep(objective, totalSheep) {
    if (objective.requiredSheep != null) return objective.requiredSheep;
    const frac = objective.requiredSheepFraction ?? 0.40;
    const min = objective.requiredSheepMin ?? 10;
    return Math.max(min, Math.floor(totalSheep * frac));
  }
  ```
- **Consumer migration:** [`js/GameState.js:409`](../js/GameState.js) and [`js/GameState.js:693`](../js/GameState.js) and [`js/components/GameHUD/ObjectiveBanner.js:36`](../js/components/GameHUD/ObjectiveBanner.js) — route through the helper, passing `gameState.totalSheep` (or equivalent).
- **OC scene:** [`shared/scenes/open-country.js:107`](../shared/scenes/open-country.js) — drop the `requiredSheep: 40` line; rely on the 0.40 default. Keep `holdRequired: 2.0`.
- **No fence change needed for `shared/GameStateValidation.js`.** Update Phase 6's frozen-files note in the plan accordingly.
- **Sim-baseline:** unchanged (the formula doesn't enter per-tick state — it's read at game start as `objective.requiredSheep` snapshot).

## Q5 — Grass-stretch root cause

**Plan posited:** Shader-patch leakage via shared-material trap — `_patchTreeWindMaterial` accidentally patches grass material.

**Code evidence:**

- `_patchTreeWindMaterial` is invoked from exactly two places:
  1. [`TerrainBuilder.js:632-647`](../js/TerrainBuilder.js) `_setupTreeWind()` — iterates `this.models.trees` only. Grass material is created in [`GrassSystem.js`](../js/GrassSystem.js) and is never added to `this.models.trees`. **Path closed.**
  2. [`TerrainBuilder.js:1012`](../js/TerrainBuilder.js) `patchFloraWind: (mat, minY, maxY) => this._patchTreeWindMaterial(mat, minY, maxY)` — exposed to ScatterSystem for flora (mushrooms / clovers / flowers). Grass is in GrassSystem, not ScatterSystem. **Path closed.**
- The `_patchedTreeMaterials` WeakSet guard at [`TerrainBuilder.js:556-557`](../js/TerrainBuilder.js) is correct — the patch is idempotent.
- **Grass material cannot be reached by `_patchTreeWindMaterial` via current code paths.** The shader-leak hypothesis is **dis-proven by inspection.**

**What else could cause "skyward grass blades near trees"?**

- [`GrassSystem.js:911-916`](../js/GrassSystem.js) — `meshSampleY` returns base Y; the defensive clamp at line 916 (`!Number.isFinite(baseY) || baseY > 50 || baseY < -10` → `baseY = 0`) covers the NaN path. But it only clamps to **0**, not to "stay near terrain". A blade clamped to y=0 looks "in the ground" or "floating", not "skyward".
- [`GrassSystem.js:920-926`](../js/GrassSystem.js) — `dummy.scale.setScalar(scale)` — bounded by `(0.7 + Math.random() * 0.6) * distanceScale` with `distanceScale ≥ 0.5`. **Cannot produce a 100×-tall blade.**
- **Strongest remaining hypothesis: vertex-shader anomaly in the grass blade vertex shader.** The shader applies wind + interaction displacement per-vertex. If any per-vertex displacement involves NaN-propagating math (e.g. divide-by-zero in interactor distance calculation, or trig of an Inf input), one or more vertices spike to clip-space Infinity, which the GPU rasterizes as "vertex pulled to vanishing point" — the visual signature is exactly a "blade-to-the-sky" line.
- **Trigger near trees:** trees are NOT registered as interactors (only player/dog + sheep). So the displacement source isn't proximity. **More likely:** the heightfield sampler hits a discontinuity near tree placements (trees occupy a hand-placed local Y dip per the `meshSampleY` triangle interpolation), producing a brief NaN that propagates through subsequent per-instance interpolation in the shader.

**Decision:** Phase 3 reproduces FIRST, then fixes. Approach:
1. Add `?probeGrass=1` URL param in [`GrassSystem.js`](../js/GrassSystem.js) — captures per-blade post-vertex-shader Y values via a small `Float32` readback to detect Y > 5m above-terrain blades. Logs world-position of first 100 anomalies per scene.
2. Reproduce on OC near woods clusters (where the symptom is) + on Field/RH (control).
3. If the anomaly correlates with a heightfield sample-anomaly: defensive clamp the per-vertex shader output instead of (only) the JS placement.
4. If no shader-side anomaly shows up: revisit hypothesis space.

**OC grass extent:** independent fix per the plan's Phase 3 step 2. [`GrassSystem.js`](../js/GrassSystem.js) `densityRange: 0.92` with `worldSize: 420` desktop = ~387m generation extent. OC `boundary.radius: 380` + `boundary.falloff: 70` = 450m total bounds. **Grass already extends to ~387m — past the 380m island radius — but only to 387m.** The user's "OC grass only in middle of island, not extending to edge" is likely about the **density falloff** (line 889): density drops as `(1 - dist / (worldSize * densityRange))`. At dist=380m on OC (densityRange=0.92), density factor is `1 - 380/386 ≈ 0.016` — almost zero. So grass **generates** out to 387m but **density-falls-off** to near-zero past ~250m. Fix: change the density-falloff formula on island scenes so the falloff radius matches `boundary.radius - 8` rather than `worldSize * densityRange`. Mobile worldSize is `220`, way smaller than OC's 380m island — that's an additional mobile-side problem.

## Q6 — Bundle slim strategy

**Plan posited:** (a) manual chunks, (b) dynamic-import deferred React panels, (c) PWA precache. Lean: (b).

**Code evidence:** Deferred to Phase 7 — same author-lean. No code reading needed at this stage; the rollup-plugin-visualizer pass in Phase 7 step 1 will identify whether dynamic imports alone close the gap or whether (a) is also needed for three.js + react split.

**Decision:** Phase 7 starts with (b). If `main.js` doesn't drop below 500 KB raw / 150 KB gzip, escalate to (a). PWA precache (c) deferred indefinitely — adds operational complexity for marginal first-paint win when (a)+(b) likely close the gap.

---

## Plan corrections to apply

1. **Q1** — Pixel Forge `pixelforge kiln bake-imposter` CLI does not exist. Real surface is `kiln.bakeImposter()` programmatic API. Phase 5 octahedral evaluation deferred; Phase 5 scope narrows to (a) cull-sync investigation + (b) LOD2.5 mid-tier.
2. **Q4** — Schema field lives on `ObjectiveDef`, not `CorralDef`. Add `ObjectiveDef.requiredSheepFraction` + `ObjectiveDef.requiredSheepMin`. **`shared/GameStateValidation.js` is NOT a consumer** — fence change unneeded.
3. **Q5** — Shader-leak hypothesis dis-proven by inspection. Phase 3 step 1 pivots from "audit `_patchTreeWindMaterial` for leak" to "instrument grass vertex shader for NaN-spike detection."
4. **Phase 3 step 2 (OC grass extent)** — root cause is density falloff formula (line 889 of GrassSystem.js), not generation radius. Fix lands on the falloff formula for island scenes.
