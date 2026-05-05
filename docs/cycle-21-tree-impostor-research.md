# Cycle 21 — Tree Impostor Research Compilation

> Compiled 2026-05-04 from 6 parallel research agents dispatched after Matt flagged the Cycle 20 v1 impostor visual gap and asked for a "research deeply with a clock of agents" pass with novel solutions across architecture levels. This doc preserves the agent findings as the evidence base for the [`cycle-21-plan.md`](cycle-21-plan.md) phase decisions. If the plan looks unmotivated, the answer is here.

## Inputs

User asks (verbatim):
1. Remove the tall tree with few branches — "it is ugly"
2. Better tree distribution — "less close together"
3. **Main objective**: impostor leaf + branch pixels = LOD0 pixels at any camera mode + distance. Research deeply, novel solutions at any architecture level.

## Agents dispatched (parallel)

| # | Subagent | Question |
|---|---|---|
| 1 | Explore | Identify the "tall ugly tree" + propose recipe fix |
| 2 | Explore | Audit `shared/TreePlacement.js` distribution + propose less-clumpy diff |
| 3 | Explore | Diagnose impostor-vs-LOD0 color mismatch root cause + propose shader fixes |
| 4 | Explore | Distance/sampling fidelity research — kill the glint without re-introducing cross-tile bleed |
| 5 | general-purpose | Novel impostor architectures (NeRF, splats, hybrid mesh, RiLoD, etc.) — go beyond standard octahedral |
| 6 | Explore | Design sandbox v2 per the Cycle 20 handoff doc's measurement requirement |

## Convergent finding (most important)

**The same fix — per-(scene, ToD) calibration LUT + per-mip pre-filtered radiance via padded atlas — was independently nominated as the top-of-table recommendation by both Agent 4 (sampling) and Agent 5 (architectures), and it slots cleanly into Agent 6's sandbox v2 design.** This is the single highest-leverage path forward and forms the spine of Cycle 21 Phases 1-3.

## Agent 1 — Tree species identification

**Target:** `tree1.glb` (Aspen Medium).

**Evidence cited:**
- [`docs/tree-pipeline.md:37-39`](tree-pipeline.md): "tree1.glb = Aspen Medium, seed 7 — Slim vertical silhouette"
- [`docs/cycle-16-tree-gallery-review.md:114-118`](cycle-16-tree-gallery-review.md): "aspen's natural slim vertical silhouette" + "aspen leaves can read as too small at sheep-cam"
- [`tools/bake-trees.mjs`](../tools/bake-trees.mjs):
  - Preset: `'Aspen Medium'`, seed 23 (note: doc says seed=7 — **discrepancy flagged** for doc fix)
  - Bark tint: `0x7a5a3a`
  - Leaf count LOD0: 30 (vs Oak 36)
  - Branch children LOD0: `{0: 8, 1: 5, 2: 3}` (shared default, Pine has overrides)

**Three options proposed:**

A. **DELETE tree1 entirely.** Touches `bake-trees.mjs`, `tree-pipeline.md`, `GameAssetLoader.js`, `TreePlacement.js` biome system, `tests/tree-assets.spec.js`, `bake-tree-impostors.mjs`, `tools/asset-gallery/picks.json`. Tradeoff: loses the "vertical pasture filler" role; collapses 3 species → 2.

B. **RE-TUNE.** Bump `leaves.count` 30 → 42 and `branch.children[0]` 8 → 10. ~+35% tris (still well under 4 MB ceiling). Reversible via gallery pick system.

C. **REPLACE with Ash Medium** (already in `SPECIES_TO_PRESET`). Ash is denser canopy. Tradeoff: ~4× tris (4,392 → 16,180). Requires rebuilding the "small slim tree" slot.

**Agent 1 recommendation:** Option B (re-tune). Aspen's silhouette role is intentional and irreplaceable; the visual issue is leaf-density undercut, not a structural flaw.

## Agent 2 — Placement distribution audit

**Current params** in [`shared/TreePlacement.js`](../shared/TreePlacement.js):

| Param | Line | Value | Visual role |
|---|---|---|---|
| `ZONES[0..3]` | 29-34 | minDist 25-40m / maxDist 40-70m / scale 15-30 | Concentric distance rings |
| `WOODS_INSIDE_FACTOR` | 43 | 0.85 | Inside-woods densification (Cycle 20 relax from 0.60) |
| `WOODS_OUTSIDE_FACTOR` | 44 | 1.5 | Outside-woods sparsification |
| `scaleVariation` | 281 | 0.7 + rng()*0.6 (range 0.7-1.3) | Per-tree scale jitter |
| `getBiome()` | 75-85 | sine waves, distance-of-center | Type mix only, not spacing |

**Scene differences:**
- Field: no `woodsZones` → uniform Poisson
- Rolling Hills: no `woodsZones` → uniform Poisson, island-bounded
- Open Country: **3 woodsZones** at `(±150, ±170, 30)`, radius 65-80 — only scene that exploits biasing

The user's "less close together" complaint most likely targets Open Country (the only woods-heavy scene).

**Levers proposed:**

| Lever | Change | Outcome | Tree Δ | Sim risk |
|---|---|---|---|---|
| Increase zone minDist | 25→28, 30→34, etc. | Sparser globally | -15-25% | None |
| Raise WOODS_INSIDE_FACTOR | 0.85 → 0.92 | Less inside-woods density | -8-12% in OC only | None |
| Tighten scale variation | 0.7-1.3 → 0.85-1.15 | Fewer outliers | None | None |
| Drop nearField zone | Remove from ZONES | Skip 25m spacing | -20-30% | None |
| Per-zone scale down | 15→13, 20→18 | Smaller trees, less crowding | None | None |

**Agent 2 recommendation:** `WOODS_INSIDE_FACTOR` 0.85 → 0.92 + `scaleVariation` 0.7-1.3 → 0.80-1.20. Targets OC specifically; Field + RH unaffected. ~3-5% fewer trees in OC, zero sim risk, both deterministic Poisson params.

## Agent 3 — Impostor color match shader root cause

**Diagnosis:** Primarily lighting-model gap (a), with color-space pipeline ordering (c) as secondary compounding factor.

**LOD0 leaves** = `MeshStandardMaterial` (roughness=1, metalness=0, map sRGB) at [`TerrainBuilder.js:212-215`](../js/TerrainBuilder.js). Routes through Three's full PBR: direct Lambert/π + Schlick fresnel + GGX lobe, indirect ambient + hemi + IBL, tonemap, sRGB encode.

**Impostor** at [`kiln-impostor-material.js:363-414`](../js/kiln-impostor-material.js) implements only:
```glsl
reflected = (directIrradiance + indirectIrradiance) * (albedo * RECIPROCAL_PI) + albedo * uSubsurfaceLift;
```
Half-Lambert wrap × sun + hemispheric ambient. No specular, no fresnel, no IBL.

**Ingredient mapping:**

| LOD0 ingredient | Impostor counterpart | Match? |
|---|---|---|
| direct diffuse (Lambert/π) | half-Lambert wrap × sun /π | ~80% |
| direct specular (GGX + Schlick) | NONE | **0% — dominant gap** |
| indirect diffuse (light probe / hemi) | uAmbientColor + uGroundBounceColor hemi | ~85% |
| indirect specular (env map / IBL) | NONE | 0% |
| normal map | per-tile baked normal + 3-tile blend | ~60% (8-bit quantized) |
| tone-mapping + sRGB | toneMapped:true via shader chunks | ~95% |
| fog | fog_pars + fog_fragment chunks | 100% |
| shadow receive | NONE | 0% (likely n/a — no shadowMap on outdoor foliage) |

**Three fixes proposed:**

A. **Schlick fresnel rim** (~10 LOC, 30 min). Adds the missing cool-edge tint MeshStandard implicitly produces at metalness=0.
```glsl
float dotNV = max(dot(N_obj, -vViewDirObj), 0.0);
float fresnel = pow(1.0 - dotNV, 5.0) * 0.08;
reflected += fresnel * uSunColor;
```
Expected delta: closes ~15-20 dE units, fixes warm-bias hue.

B. **Extend MeshStandardMaterial via onBeforeCompile** (~50 LOC + brittleness). Replace custom shader; inject only atlas tap + per-fragment normal. Inherits Three's full PBR pipeline.
Expected delta: closes to dE < 5 across all distances/pitches.

C. **Bake the LIT result instead of baseColor** (architectural regression). Loses runtime relighting. Only useful as diagnostic.

**Agent 3 recommendation:** Ship A immediately. If post-A dE < 5, done. Else escalate to B. Never C for production.

## Agent 4 — Distance/sampling fidelity

**Problem statement:** 512px tiles in 2048×2048 atlas downsampled to 5-15 screen pixels → glint without mips, cross-tile bleed with mips. Half-texel UV clamp + aniso=8 is a current-best compromise, not a fix.

**8 candidate solutions evaluated:**

| # | Solution | Quality | Complexity | Rank |
|---|---|---|---|---|
| 1 | DataArrayTexture per-tile mips | Excellent | High (16 separate textures, sidecar break, shader rewrite) | **1** |
| 2 | Edge-padded atlas + textureLod | Very Good | Medium (bake param, UV adjust, ~30 LOC shader) | **2** |
| 3 | Smaller tiles (256px) + more angles | Good | Low (one CLI flag) | 5 |
| 4 | SAT (summed-area table) per tile | Good | Medium (bake change + 8 LOC) | 6 |
| 5 | Stochastic 4-tap supersampling | Fair (masks not fixes) | Very Low | 8 |
| 6 | Crossfade to low-poly LOD1 mesh | Excellent (geometric) | High (bake LOD1 mesh per tree) | 3 |
| 7 | textureGrad with tile-boundary awareness | Good | Medium | 7 |
| 8 | Half-res render target + TAA-style upscale | Fair | Medium-High | 4 |

**Agent 4 recommendation:** Pair #1 (DataArrayTexture) + #3 (smaller tiles). Or — for less disruptive path — #2 (padded atlas) + #6 (LOD1 mesh).

**Cycle 21 takes Agent 4's #2 (padded atlas) for Phase 3** because it's less disruptive (single-PNG bake stays, sidecar back-compat), Halen et al. HPG 2022 validates it at production quality, and it composes with Phase 4's hybrid trunk-mesh (which is Agent 5's #1 architecture, similar to Agent 4's #6).

## Agent 5 — Novel impostor architectures

10 architectures evaluated. C = solves color mismatch, S = solves sampling artifacts.

| # | Architecture | Solves | Cost | SOTA shipped |
|---|---|---|---|---|
| 1 | Hybrid mesh-impostor (trunk mesh + canopy impostor) | C ~70% (perceptual) | 1 wk | UE4 Effect LOD, Horizon FW, SpeedTree |
| 2 | Lit-bake + per-frame chromatic correction | C 100% under reference | 3 days | Crysis-era, Genshin, Fortnite mobile |
| 3 | Neural impostors / NeRF-style trees | C+S | 6-10 wk + research risk | None in browser games (NVIDIA RTX-only) |
| 4 | 3D Gaussian Splatting LOD per tree | C+S | 4-6 wk | Spark 2.0 (2026), Cesium 3D Tiles 2026 |
| 5 | RiLoD geometry-image impostor (Wu CGF/EGSR 2025) | C 100% (shared BRDF) | 3 wk | Academic 2025, no game shipped yet |
| 6 | Mesh shaders / Nanite-style cluster culling | C+S trivial (it's LOD0) | 8-12 wk | UE5 Nanite native; **WebGPU not Chrome 2026** |
| 7 | Programmatic SDF + analytic foliage shader | S only | 4 wk per species | Demos only, no AAA real-time |
| 8 | Stochastic-alpha LOD cross-fade (Wyman 2017) | Perceptual hide only | 1-2 wk if TAA exists | Horizon FW (Lindquist DD 2023) |
| 9 | Per-impostor 3×3 affine color-correction LUT | C 100% under measured presets | 1 wk | Halo Infinite, Fortnite (per-region tints) |
| 10 | Texture-array per-mip pre-filtered radiance (Halen HPG 2022) | S 100% | 1.5 wk | Light-field rendering papers |

**Agent 5 top-3 for SDS constraints (browser, WebGL2, RTX 3070 dev / mid-mobile prod, 200-1000 trees, must compose with Pixel Forge):**

1. **#9 + #10** (calibration LUT + per-mip pre-filtered radiance). ~2.5 wk. Closes both C and S in existing pipeline. Zero architecture risk. Sandbox v2 is critical path.
2. **#1** (hybrid trunk-mesh + impostor canopy). +1 wk. Anchors perception; covers any residual canopy drift.
3. **#5** (RiLoD shared-BRDF) for a future cycle. Principled fix. 3 wk.

**Avoid:** #3, #6, #7. **Defer:** #4 (Gaussian splatting — tempting and 2026-mature, but throws away kiln pipeline; revisit only if #1+#2+#5 plateau).

**Cycle 21 takes Agent 5's #9 + #10 + #1 as Phases 2 + 3 + 4.** Defers #5 (RiLoD) to Phase 6 escalation if Phase 5 measurement shows residual.

## Agent 6 — Sandbox v2 design

**Architecture decision:** Standalone HTML at [`tools/lod-sandbox-v2.html`](../tools/lod-sandbox-v2.html). Lowest friction, isolated from game loop, batch-renderable, no driver-variation flakiness.

**Test matrix:**
- Smoke (12 cells): 1 scene × 1 camera × 4 distances × 3 species, ToD fixed
- Full (~80 cells after pruning): 3 scenes × 4 distances × 3 species × 4 ToD, with cameras handled separately for visual diff only

**Per-cell measurement protocol:**
1. Render LOD0 reference (no impostor)
2. Render impostor (force LOD2)
3. Sample 5×5 grid centered on each visible tree's canopy bbox-projection. `readPixels` linear RGB, mean across 25 samples.
4. Compute dE2000 (CIE2000), dRGB per channel, dLuma (Rec601)
5. Aggregate (mean / max / variance) per cell

**Output JSON schema:**
```json
{
  "cell": { "scene": "open-country", "preset": "golden-hour", "distance": 150, "cameraMode": "classic", "species": "tree1" },
  "trees": [ { "lod0": {"r":0.45,"g":0.38,"b":0.22}, "impostor": {...}, "dE2000": 1.8, "dLuma": -2.1 } ],
  "aggregate": { "meanDE2000": 2.1, "maxDE2000": 4.2, "meanDLuma": -1.5 }
}
```

**Calibration LUT generator:** Group by `(scene, preset)`, compute median per-channel boost across all distances+cameras+species, ship as JSON. Runtime adds `uMatchBoost` uniform set per-frame in `setImpostorTint()`.

**Visual diff renderer:** 3-pane (LOD0 / impostor / pixel-diff heatmap) for human-eyeball verification of small-but-visible deltas.

**Implementation sequencing:**
- Hour 1: standalone scaffold, real Atmosphere, basic single-pixel sampler
- Hour 4: 5×5 grid, dE2000 calc, JSON dump, visual diff heatmap
- Hour 8+: batch full matrix, LUT generator, write to `cycle21-validation/`

**Connection to existing infra:**
- Reuses `window.__sds.atmosphereRef` and `terrainBuilderRef` from [`js/main.js`](../js/main.js):327-330
- LOD forcing via material `defines` flag added to `kiln-impostor-material.js`
- Per-frame tint via direct `TerrainBuilder.setImpostorTint()` call

**Cycle 21 takes Agent 6's design verbatim as Phase 1.**

## Cross-agent recommendation matrix → Cycle 21 phase mapping

| Recommendation | From agent(s) | Cycle 21 phase |
|---|---|---|
| Aspen re-tune (leaves 30→42, branches 8→10) | 1 | Phase 0 |
| Placement diff (WOODS_INSIDE_FACTOR 0.92, scaleVariation 0.80-1.20) | 2 | Phase 0 |
| Schlick fresnel rim (~10 LOC) | 3 | Phase 0 |
| Doc fix: tree-pipeline.md seed=7 → seed=23 | 1 (caught discrepancy) | Phase 0 |
| Sandbox v2 standalone HTML, 5×5 grid, dE2000 | 6 | Phase 1 |
| Per-(scene, ToD) calibration LUT, uMatchBoost uniform | 5 (#9), 6 (LUT generator) | Phase 2 |
| Padded-atlas mipmaps + manual textureLod | 4 (#2), 5 (#10) | Phase 3 |
| Hybrid trunk-mesh + impostor-canopy at closest LOD2 band | 5 (#1) | Phase 4 |
| Per-scene matrix + perf + ship | (Cycle 20 Phase 3-5) | Phase 5 |
| MeshStandardMaterial onBeforeCompile extension | 3 (B) | Phase 6 (escalation only) |
| RiLoD shared-BRDF impostor | 5 (#5) | Phase 6 (escalation only) |

## Deliberately rejected (with reasoning)

- **DataArrayTexture per-tile mips** (Agent 4 #1) — cleaner but disruptive; padded atlas (Agent 4 #2) is the same Halen 2022 result with less churn.
- **Smaller tiles + more angles** (Agent 4 #3) — additive to padded mips; not strictly needed if mips work.
- **Stochastic supersampling** (Agent 4 #5) — masks not fixes; dishonest.
- **Neural impostors / NeRF** (Agent 5 #3) — RTX-only inference, no browser game has shipped this.
- **3D Gaussian splatting** (Agent 5 #4) — mature in 2026 (Spark 2.0, Cesium) but throws away the Pixel Forge investment, adds a second renderer, and the C+S problem is solvable in the existing pipeline. Revisit only if Phases 2-4 plateau.
- **Mesh shaders / Nanite** (Agent 5 #6) — WebGPU mesh shaders not shipping in Chrome 2026 ([gpuweb#3015](https://github.com/gpuweb/gpuweb/issues/3015)).
- **SDF + analytic foliage** (Agent 5 #7) — wrong tool: solves S not C; can't match LOD0 by definition.
- **Stochastic alpha cross-fade alone** (Agent 5 #8) — perceptual hide only; Phase 4's hybrid trunk-mesh approach addresses the same pain (Cycle 19.5 carryover #3) more honestly.
- **Bake the LIT result** (Agent 3 C) — loses runtime relighting; non-starter for production.

## Open questions Matt did NOT answer (defaults applied to Cycle 21 plan)

1. **Aspen re-tune vs. Ash swap?** Defaulted to re-tune (Phase 0); Ash swap is Phase 0.5 fallback if re-tune insufficient.
2. **Sandbox priority?** Defaulted to "build it" (Phase 1) — the handoff doc explicitly required it before more tuning.
3. **Tree count target — Open Country only or all scenes?** Defaulted to all scenes (the placement diff touches global params anyway).
4. **Doc discrepancy fix?** Defaulted to fix in Phase 0 (1-line edit).

If any of these defaults are wrong, edit the cycle-21 plan before Phase 0 starts.

## Sources cited (Agent 5 web research)

- [Reshadable Impostors with Level-of-Detail (Wu et al., CGF / EGSR 2025)](https://onlinelibrary.wiley.com/doi/10.1111/cgf.70183)
- [Reshadable Impostors PDF (rilod25.pdf)](https://cuteloong.github.io/assets/files/rilod25.pdf)
- [Spark 2.0 — streaming 3DGS in WebGL2 (World Labs, 2026)](https://www.worldlabs.ai/blog/spark-2.0)
- [Cesium 3D Tiles + Gaussian Splatting LOD (April 2026)](https://cesium.com/blog/2026/04/27/3d-gaussian-splats-lod/)
- [WebGPU Mesh Shader support tracking issue #3015](https://github.com/gpuweb/gpuweb/issues/3015)
- [Hashed Alpha Testing — Wyman & McGuire 2017](https://casual-effects.com/research/Wyman2017Hashed/Wyman2017Hashed.pdf)
- [SpeedTree UE Impostor / Billboard docs](https://docs9.speedtree.com/modeler/doku.php?id=impue4)
- [HPG 2022 program (Halen et al. light-field rendering)](https://www.highperformancegraphics.org/2022/program/)
- [Imatest Color Correction Matrix (CCM)](https://www.imatest.com/docs/colormatrix/)
- [NVIDIA Real-Time Neural Appearance Models (2023)](https://research.nvidia.com/publication/2023-05_real-time-neural-appearance-models)
