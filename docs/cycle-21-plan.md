# Cycle 21 — tree-impostor-pixel-match-and-foliage-polish

> Drafted 2026-05-04 after Matt's "bake all recommendations into the next cycle and take everything else out" directive following the 6-agent research compilation in [`cycle-21-tree-impostor-research.md`](cycle-21-tree-impostor-research.md). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom, then the research doc, then [`cycle-20-impostor-color-handoff.md`](cycle-20-impostor-color-handoff.md) for the Cycle 20 Phase 2 v1 ship-state context. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Distant trees should look indistinguishable from LOD0 trees at any camera mode, distance, time of day, and atmosphere preset — closing the visible color/hue gap and the texture-sampling glint that Matt flagged at the end of Cycle 20. Layered on top: the slim-and-sparse Aspen (`tree1`) gets a fuller silhouette, and tree placement opens up so groves don't read as canopy-overlap clumps. After this cycle ships, Cycle 19.5 carryover impostor-quality items #1, #2 (partial), #3, #4 are all closed — the standalone "impostor quality" risk drops off the standing-risk list.

User-visible difference: chase-cam classic at max-zoom in Open Country at golden hour will show distant trees that hold their leaf hue and brightness through the swap to LOD2, with no glint at high pitch and no clumpy canopy-overlap in the woods zones. The Aspen reads as a small full-leaved tree instead of a tall broomstick.

## Why this cycle exists (and supersedes Cycle 20)

Cycle 20 Phase 0+1+2 v1 shipped the Pixel Forge / Kiln impostor pipeline — atlas + sidecar bake, new shader, per-fragment relighting via baked normals. **Phases 3-5 of Cycle 20 (per-scene matrix, perf, ship) never ran** because Phase 2 v1's smoke test surfaced the visual gap that the original plan didn't anticipate: even with correct geometry and per-fragment relighting, impostor pixels read warmer / dimmer / glintier than LOD0 from any non-trivial camera angle. The handoff doc [`cycle-20-impostor-color-handoff.md`](cycle-20-impostor-color-handoff.md) captures every diagnosis and dead-end from the v1 → v5 polish attempts at the end of that session.

Cycle 21 absorbs Cycle 20's Phase 3-5 acceptance gates AND adds the structural fixes the research surfaced: a measurement sandbox (so we tune to evidence not vibes), a per-(scene × ToD) calibration LUT (cheap perceptual win), per-tile padded mipmaps (kill the glint without re-introducing cross-tile bleed), Schlick fresnel rim (close the warm-bias hue gap), and a hybrid trunk-mesh option (mask any residual canopy drift with a pixel-perfect trunk anchor). User-facing tree-recipe + placement polish ride along since they're a few hours' work and Matt asked for them in the same breath.

**Cycle 20 closes here.** Its Phase 3-5 success criteria carry into Cycle 21's Phase 5. Don't try to keep Cycle 20 open in parallel.

## How to read this plan

This doc fixes the *shape* of the work. Implementation choices are open within each phase.

Each phase has two halves:
- **Build** — what to write or change.
- **Optical validation** — what imagery / measurement to capture and what to look for. **A phase is not done until its validation artifacts are saved + reviewed.** Save under `cycle21-validation/<phase>/`.

Phase 0 (quick wins) is independently shippable in one ~3-hour pass. Phases 1-5 form the structural arc and are mostly serial. Phase 6 is the optional escalation if Phase 4 still shows dE > 5.

## Open questions to resolve before writing code

1. **Q1: Aspen re-tune vs. swap to Ash Medium?** Author lean: **re-tune**. Bump `leaves.count` 30→42 + `branch.children[0]` 8→10 in [`tools/bake-trees.mjs`](../tools/bake-trees.mjs). Aspen's vertical-filler role is irreplaceable without collapsing 3 species → 2; tris cost is +35% (well under the 4 MB cap). Escalate to Ash swap (Phase 0.5) if the re-tuned Aspen still reads weak in Phase 0's smoke screenshot.
2. **Q2: Sandbox v2 architecture — standalone HTML, `?debug=lod-sandbox` mode, or Vitest+Playwright?** Author lean: **standalone HTML at [`tools/lod-sandbox-v2.html`](../tools/lod-sandbox-v2.html)**. Lowest friction (no game-loop ticking), reuses SDS modules via direct import, can batch-render synchronously, no driver-variation flakiness from headless WebGL.
3. **Q3: Calibration LUT scope — per `(scene, ToD)` only, or also per `(distance, pitch)`?** Author lean: **per `(scene, ToD)` only** for v1. Distance and pitch are already shader-handled (mips + spherical billboard); LUT exists to absorb residual irradiance mismatch between the impostor's foliage recipe and Three's full PBR pipeline, which is camera-pose-independent. If Phase 2 measurement shows distance-dependent residual, escalate to a 2D LUT in Phase 6.
4. **Q4: Per-tile mip approach — `DataArrayTexture` (16 separate texture layers) or padded-atlas + manual `textureLod`?** Author lean: **padded atlas**. DataArrayTexture is cleaner (no padding math) but requires re-baking each tile as a separate output AND a sidecar schema break AND shader rewrite for `texture(samplerArray, ...)`. Padded atlas adds N=16-32px tile borders to Pixel Forge's existing single-PNG output, keeps the sidecar shape, and the shader change is just a UV inset per mip level. Halen et al. HPG 2022 validates the padded-atlas approach. Escalate to DataArrayTexture in Phase 6 if padding alone has visible mip-level seams.
5. **Q5: When to escalate to `MeshStandardMaterial.onBeforeCompile` extension (Fix B from research)?** Author lean: **only if Phase 5's per-scene matrix shows mean dE2000 > 5 with LUT + fresnel + padded mips active**. The custom shader is faster, less brittle to Three updates, and the foliage-specific recipe (half-Lambert + hemi) is genuinely better-suited for distant foliage than full PBR. Phase 6 covers this escalation.
6. **Q6: Hybrid trunk-mesh band — full LOD2 distance band, or only the closest 50m of LOD2 (100-150m)?** Author lean: **closest 50m only**. Trunk geometry is cheap (~50 tris × N instances) but at 200m+ the trunk is sub-pixel and adds nothing perceptually. Tunable via a second `addLOD` distance.

These should all be resolved in Phase 0 / Phase 1 review pass before Phase 2 commits to the LUT contract.

## Architecture / shared changes

This cycle adds two new uniforms to `js/kiln-impostor-material.js` and one optional GLB sibling per tree:

- **`uMatchBoost: vec3`** — per-(scene, ToD) chromatic correction, set per-frame in `setImpostorTint()` from a JSON LUT loaded at scene init. Default `vec3(1.0)` (no-op when LUT misses).
- **`uFresnelStrength: float`** — Schlick fresnel rim contribution (0..0.15 typical). Set globally; not per-scene.
- **(Optional Phase 4)** `assets/models/trees/<name>.trunk.glb` — trunk-only sibling for the hybrid LOD2 closest band. Same vertex format as LOD0 GLB so it can share the existing wind shader patch.

The Pixel Forge bake gets one new flag (`--tile-padding 16` or similar — exact name TBD when Phase 3 builds it). The sidecar JSON adds an optional `tilePadding` field; old sidecars without it are read as `tilePadding: 0` for back-compat with shipped atlases.

## Phase 0 — Quick wins (recipe + placement + fresnel) (~3hr)

**Independently shippable.** This phase is the immediate visible improvement Matt asked for; it doesn't depend on the sandbox or any new infrastructure. Ship as one commit; Matt reviews; proceed to Phase 1 only after Phase 0's smoke screenshots look right.

### Build

1. **Re-tune Aspen recipe.** [`tools/bake-trees.mjs`](../tools/bake-trees.mjs) — bump `LEAF_COUNTS.aspen` 30 → 42 and `LOD0_BRANCH_DEFAULT.children[0]` 8 → 10 (or per-recipe override if `LOD0_BRANCH_DEFAULT` is shared). Re-bake:
   ```
   rm assets/_originals/models/trees/*.glb
   npm run bake-trees
   npm run compress-glbs
   npm run bake-tree-impostors
   ```
   The `_originals/` rm is mandatory (compress-glbs cache trap, Cycle 14 finding). Verify total committed GLB size still under 4 MB ceiling.

2. **Apply tree placement diff.** [`shared/TreePlacement.js`](../shared/TreePlacement.js):
   - Line 43: `WOODS_INSIDE_FACTOR = 0.85` → `0.92` (less inside-woods densification).
   - Line 281: `0.7 + rng() * 0.6` → `0.80 + rng() * 0.40` (tighter scale jitter, fewer towering-vs-tiny outliers).
   These are deterministic Poisson params, sim-baseline byte-equality preserved.

3. **Add Schlick fresnel rim** to [`js/kiln-impostor-material.js`](../js/kiln-impostor-material.js) fragment shader. Inside `main()`, after the `reflected` computation around line 414, add:
   ```glsl
   float dotNV = max(dot(N_obj, -normalize(vViewDirObj)), 0.0);
   float fresnel = pow(1.0 - dotNV, 5.0) * uFresnelStrength;
   reflected += fresnel * uSunColor;
   ```
   Add `uFresnelStrength` uniform (default `0.04` per MeshStandard's metalness=0 implicit Schlick). Wire through to `createKilnImpostorMaterial`.

4. **Doc fix.** [`docs/tree-pipeline.md`](tree-pipeline.md) — the table at line 37 lists `tree1.glb` seed=7, but [`tools/bake-trees.mjs`](../tools/bake-trees.mjs) actually uses seed=23. Update the doc to match the source. (Caught by the Cycle 21 research agent.)

### Optical validation — Phase 0 smoke

1. Capture three scene screenshots: Field eye-level, Rolling Hills overhead-island, Open Country woods-zone close-up. Save as `cycle21-validation/phase0/{field,rh,oc}-baseline.png`.
2. Visually verify: (a) Aspen reads fuller, (b) OC woods less clumpy, (c) impostor trees show subtle cool-ish rim on the lit-side at any distance (proves fresnel landed).
3. `npm test` — 186/186 vitest pass (sim-baseline byte equality must hold).
4. `npm run build` — production build clean (delta should be < +5 KB for fresnel addition).

**Acceptance:** Three smoke screenshots saved, tests + build green, Matt eyeball-confirms the visible improvement on at least 2 of 3 scenes. If Aspen still reads weak, escalate to Phase 0.5 (Ash swap — bump `SPECIES_TO_PRESET['tree1']` to `'Ash Medium'` and re-bake; ~1hr extra).

## Phase 1 — Sandbox v2 + first measurement (~1 day)

**Depends on:** Phase 0 (so the baseline measurements include the fresnel + recipe changes — don't measure twice).

### Build

1. **Standalone harness** at [`tools/lod-sandbox-v2.html`](../tools/lod-sandbox-v2.html). Imports SDS modules directly via Vite's dev server; no game state, no input, no physics. Layout: 3-pane canvas (LOD0 / impostor / pixel-diff heatmap) + control panel.

2. **Real atmosphere driver.** Import `Atmosphere` from [`js/atmosphere/Atmosphere.js`](../js/atmosphere/Atmosphere.js); preset dropdown matches the in-game presets (`noon`, `dusk`, `dawn`, `golden-hour`, `overcast`). Real fog, real `getSunDirection()`, real `setTimeOfDay(t)`.

3. **Camera modes match the game.** Classic offset `(0, distance, -distance)` (45° pitch), Follow `(0, 11, -22)` (26° pitch), Cinema `(0, 60, -30)` (~70° pitch). Drive via direct `THREE.PerspectiveCamera.position.set` + `lookAt` — no need to reuse `CameraController`.

4. **Force LOD mechanism.** Add a `__forceImpostorLevel` flag to `kiln-impostor-material.js` (or a sandbox-only material `defines` toggle) that bypasses the `addLOD` distance-based pick. Sandbox renders the same instance once as LOD0 and once as forced-LOD2.

5. **Measurement protocol per cell.** Per-tree, sample a 5×5 grid centered on the canopy bbox-projection. `readPixels` linear RGB, mean across 25 samples. Compute dE2000 (CIE2000), dRGB per channel, dLuma (Rec601). Aggregate (mean / max / variance) across all visible trees in the cell.

6. **Output JSON schema** per cell:
   ```json
   {
     "cell": { "scene": "open-country", "preset": "golden-hour", "distance": 150, "cameraMode": "classic", "species": "tree1" },
     "trees": [ { "lod0": {"r":0.45,"g":0.38,"b":0.22}, "impostor": {...}, "dE2000": 1.8, "dLuma": -2.1 } ],
     "aggregate": { "meanDE2000": 2.1, "maxDE2000": 4.2, "meanDLuma": -1.5 }
   }
   ```
   Saved to `cycle21-validation/phase1/sandbox-baseline.json`.

7. **Smoke matrix runner.** Button: "Run smoke (12 cells)". Iterates 1 scene × 1 camera × 4 distances × 3 species (ToD = each scene's default), writes the JSON, displays a summary table. Per-cell capture <2s on RTX 3070.

### Optical validation — Phase 1 baseline

1. Run the smoke matrix end-to-end. Save baseline JSON.
2. Save 12 visual-diff screenshots (one per cell) to `cycle21-validation/phase1/cell-{NN}.png`.
3. Document the headline numbers in `cycle21-validation/phase1/BASELINE.md`: per-scene mean dE2000, max dE2000, dominant residual hue (positive R/G/B suggests warm, negative suggests cool).

**Acceptance:** Sandbox runs end-to-end without errors. 12 cells captured. BASELINE.md committed. The numbers are now the calibration target for Phase 2.

## Phase 2 — Calibration LUT (~2 days)

**Depends on:** Phase 1.

### Build

1. **Full matrix runner.** Extend the sandbox to iterate 3 scenes × 3 camera modes × 4 distances × 3 species × 4 ToD presets — collapse to ~80 cells via the agent-recommended axis-pair pruning (species independent of camera; pick one camera per species per cell). Output `cycle21-validation/phase2/sandbox-full.json`.

2. **LUT generator.** Tiny Node script `tools/generate-impostor-lut.mjs` reads `sandbox-full.json`, groups by `(scene, preset)`, computes the median `boost = lod0_meanRGB / impostor_meanRGB` per channel across all distances+cameras+species. Output:
   ```json
   {
     "version": 1,
     "lut": [
       { "scene": "open-country", "preset": "golden-hour", "boost": [0.98, 1.02, 1.05] },
       { "scene": "field",        "preset": "noon",         "boost": [1.00, 0.98, 0.96] }
     ]
   }
   ```
   Save to `assets/impostor-calibration-lut.json`. Committed alongside atlases.

3. **Runtime LUT loader.** [`js/main.js`](../js/main.js) or `GameAssetLoader.js` — fetch the LUT JSON at scene init; expose to `TerrainBuilder`.

4. **`uMatchBoost` uniform.** Add to [`js/kiln-impostor-material.js`](../js/kiln-impostor-material.js) (default `vec3(1.0)`). Multiply into final `reflected` color (after fresnel, before tonemapping). [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) `setImpostorTint()` looks up the current `(scene, preset)` and writes the boost.

5. **Re-measure.** Run the full matrix again post-LUT. Save as `cycle21-validation/phase2/sandbox-post-lut.json`.

### Optical validation — Phase 2 LUT close-out

1. Per-cell delta: pre-LUT vs post-LUT mean dE2000. Target: median dE2000 across all cells drops by ≥ 50%.
2. Headline target: post-LUT mean dE2000 < 5 across ≥ 80% of cells.
3. If any cell still shows dE2000 > 8 post-LUT, document in `cycle21-validation/phase2/RESIDUAL.md` — those are candidates for Phase 3 (sampling) or Phase 6 (structural shader).

**Acceptance:** LUT JSON shipped. `setImpostorTint` writes `uMatchBoost` per frame. Mean dE2000 across all 80 cells < 5. Visual confirmation from the 3-pane diff: pixel-diff heatmap is uniformly green (low) for ≥ 80% of cells.

## Phase 3 — Padded-atlas mipmaps (~1.5 wk)

**Depends on:** Phase 1 (sandbox to validate). Independent of Phase 2 (LUT is irradiance-side; mips are sampling-side).

### Build

1. **Pixel Forge bake extension.** Add `--tile-padding <N>` flag to `pixelforge kiln bake-imposter` (or replicate the padding logic in [`tools/bake-tree-impostors.mjs`](../tools/bake-tree-impostors.mjs) post-bake if upstream change is too costly). N = 16 covers 4 mip levels (level 0: 16, level 1: 8, level 2: 4, level 3: 2) without bleed. Each tile becomes 528×528 in a 2112×2112 atlas (vs current 512×512 in 2048×2048).

2. **Bake the padding** by sampling the tile content's edge pixel and replicating outward (clamp-to-edge style). Pixel Forge already has access to per-tile rendered content pre-composite — extend the composite step.

3. **Sidecar update.** Add `tilePadding: 16` and `paddedTileSize: 528` to the JSON. Bump sidecar `version` to `2`. Loader handles both v1 (no padding) and v2.

4. **Re-bake all 3 trees.** `npm run bake-tree-impostors`. New atlases land in `assets/models/trees/` — git diff will show ~10% size increase per atlas (acceptable).

5. **Shader update** in [`js/kiln-impostor-material.js`](../js/kiln-impostor-material.js):
   - Re-enable mipmaps on the loaded atlas: `tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;`
   - `atlasUvForTile()` UV math uses the *content* sub-rect inside the padded tile: content occupies `[padding/paddedTileSize, 1 - padding/paddedTileSize]` of each tile cell.
   - Manual `textureLod` is NOT needed for v1 — auto-mips with the padding are sufficient. Reserve `textureLod` for v2 if seam artifacts surface.
   - Increase `anisotropy` back to 16 (was 8 as the no-mips compromise) — with mips and padding, anisotropy can do its job without crossing tiles.

### Optical validation — Phase 3 sampling close-out

1. **Glint sweep.** Sandbox runs Open Country at golden-hour, classic camera, distance ramp 100m → 250m in 10m increments. Capture 16 frames per camera-pitch (5°, 25°, 45°, 65°). Save to `cycle21-validation/phase3/glint-sweep/`.
2. **Per-frame variance metric.** For each frame pair (frame N vs frame N+1), compute per-tree-pixel max-RGB-delta. Glint = high inter-frame variance at low motion. Pre-Phase-3 baseline (from Cycle 20 v5 captures) vs post-Phase-3 — target ≥ 70% glint reduction.
3. **Re-run Phase 2 sandbox matrix.** Mean dE2000 should not regress (LUT was tuned to no-mip baseline; with mips, the LUT may slightly over-correct — re-run the LUT generator if median dE2000 went up).

**Acceptance:** Mipmaps re-enabled with no cross-tile bleed visible in the inspector or glint sweep. Inter-frame variance drops ≥ 70%. Mean dE2000 stays under 5.

## Phase 4 — Hybrid trunk-mesh closest band (~1 wk)

**Depends on:** Phase 3 (don't compose with broken sampling).

### Build

1. **Bake trunk-only LOD2 GLB.** Extend [`tools/bake-trees.mjs`](../tools/bake-trees.mjs) — for each recipe, after the LOD0 + LOD1 bake, run the EZ-Tree generator with `leaves.count = 0` (or a `trunkOnly` config flag) and export as `assets/models/trees/<name>.trunk.glb`. ~50-200 tris per trunk.

2. **LOD chain extension** in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) `createTrees`. Currently: LOD0 → cross-billboard fallback / kiln impostor at 100m. New: LOD0 → (trunk-mesh + impostor-canopy) at 100m → impostor-only at 150m → ... fade out at fog distance.

3. **Trunk uses LOD0 MeshStandardMaterial** (the one from the GLB chain). Same wind shader patch via `_patchTreeWindMaterial`. Same fog. Pixel-perfect parity with LOD0's trunk.

4. **Impostor canopy at the closest band needs trunk-region alpha-suppression** so the canopy impostor doesn't double-draw over the trunk mesh. Two options:
   - (a) Bake a second impostor variant (`canopy-only`) with trunk masked at bake time. Cleanest.
   - (b) Runtime alpha-discard: shader masks fragments below trunk-top Y in object space. Author lean: **(a)** — re-bake is ~5min, runtime is hot path.

5. **Loader contract.** [`js/GameAssetLoader.js`](../js/GameAssetLoader.js) — add the 3 trunk GLBs as deferred assets (load post-menu like `tree2`/`pine`).

### Optical validation — Phase 4 hybrid close-out

1. **LOD-boundary dolly.** Camera dollies from `z=110m → 90m` over 20 frames at 1m intervals. Save as `cycle21-validation/phase4/lod-boundary-{090..110}.png`. Trunk position pop ≤ 1 px (LOD0 trunk → LOD2 trunk is the same mesh, same material — should be invisible). Canopy color step at the boundary should be smaller than pre-Phase-4.
2. **Per-scene matrix re-capture.** Run Phase 2's sandbox at 100m and 110m specifically (the boundary band). Post-Phase-4 mean dE2000 in this band should drop further from Phase 3's level.

**Acceptance:** Trunk pixels at LOD swap match LOD0 to ≤ 1 px position pop and ≤ dE2000=2 color delta. Canopy still impostor; canopy alpha-mask above trunk-top region prevents double-draw. Total trunk-mesh tris in scene ≤ 200 trees × 100 tris = 20K (negligible).

## Phase 5 — Per-scene verification + perf + ship (~1 day)

**Depends on:** Phases 0-4 all green with optical artifacts in `cycle21-validation/`.

### Build (verification, not new code)

1. **Per-scene matrix.** 12 captures: 3 scenes × 4 sun positions at fixed cinematic poses (reuse the Cycle 20 plan's matrix, which never ran). Save under `cycle21-validation/phase5/<scene>-<sun>.png`. Side-by-side with `v1.1.0`-deployed equivalents (capture once via Playwright MCP). Manual sign-off scene by scene.
2. **Perf delta.** `npm run perf:check` — must stay within ±5%. Capture before/after for OC-Extreme + Chaos-5000 on RTX 3070 via `__perfHarness`. Save as `cycle21-validation/phase5/perf.json`. Threshold: p50 frame time delta ≤ 5%; GPU memory delta ≤ +20 MB.
3. **Sim-baseline byte equality.** `npm test` — 186+/186+ pass. Sim baselines stay byte-identical (visual cycle, no sim impact). HARD STOP if they drift.
4. **`scene-swap-stability` E2E.** `npm run test:e2e -- scene-swap-stability` — local-only, must pass.
5. **CHANGELOG entry.** Player-facing: "Distant trees now match close-up trees in color and lighting at every angle and time of day. Aspen trees are fuller; tree groves are less crowded."
6. **BACKLOG update.** Close Cycle 19.5 carryover items #1, #2 (partial), #3, #4. Note Cycle 20 absorbed-into-21 in the cycle history.
7. **Tag `v1.2.0`.** First minor bump since v1.1.0. `npm version 1.2.0` (root + worker), commit, push. Site auto-deploys.

**Acceptance:** All 12 per-scene captures reviewed; ≥ 8 of 12 visibly better than v1.1.0, none worse. Perf within ±5%. Sim-baseline byte-identical. v1.2.0 live on sheepdogsim.com.

## Phase 6 — Structural escalation (OPTIONAL, deferred to post-cycle if needed)

**Depends on:** Phase 5 measurements.

If Phase 5's per-scene matrix shows mean dE2000 > 5 on any cell post-LUT-post-mips-post-trunk, the cheap fixes have plateaued. Escalation options (do NOT do all):

1. **`MeshStandardMaterial.onBeforeCompile` extension.** Replace the custom `ShaderMaterial` with a patched `MeshStandardMaterial` — inject only the impostor atlas tap + per-fragment normal. Inherits Three's full PBR pipeline (GGX, IBL if env map present, full chunk lighting). Brittle to Three updates; ~50 LOC.

2. **RiLoD-style geometry-image impostor** (Wu et al. CGF/EGSR 2025, [rilod25.pdf](https://cuteloong.github.io/assets/files/rilod25.pdf)). Bake position + normal + albedo + material as image channels; fragment shader runs the *same* LOD0 BRDF code path. Guarantees C parity by construction. ~3 weeks.

3. **2D LUT** (per `(scene, ToD, distance)`). Adds a third dimension to the calibration table. Trades file size for residual.

Phase 6 is **a separate cycle** if needed. Don't try to land it in Cycle 21.

## Optical validation matrix (summary)

| Phase | Layer | Type | Proves |
|---|---|---|---|
| 0 | Smoke screenshot × 3 scenes | Visual | Aspen + placement + fresnel land |
| 1 | Sandbox baseline (12 cells) | Numerical (dE2000, dRGB, dLuma) | Pre-LUT measurement target |
| 2 | Sandbox full matrix (80 cells) post-LUT | Numerical | Mean dE2000 < 5 in 80% of cells |
| 3 | Glint sweep (16 frames × 4 pitches) | Inter-frame variance | ≥ 70% glint reduction |
| 4 | LOD boundary dolly (20 frames) | Visual + position pop measure | Trunk pop ≤ 1 px |
| 5 | Per-scene cinematic poses (12) + perf (2) | Visual + frame-time JSON | No scene worse than v1.1.0; perf ±5% |

**Cycle is not done until all 6 phases have saved artifacts and recorded outcomes.**

## Dependencies

```
Phase 0 (quick wins) → Phase 1 (sandbox) → Phase 2 (LUT) ───┐
                                          │                 │
                                          └→ Phase 3 (mips) ┴→ Phase 4 (trunk) → Phase 5 (ship)
```

Phase 2 and Phase 3 can run in parallel after Phase 1 (LUT is irradiance, mips are sampling — orthogonal). Phase 4 depends on Phase 3 (don't compose with broken sampling).

## Frozen files (cycle-specific additions)

- `assets/_originals/models/trees/*.glb` — re-baked in Phase 0; no further edits in this cycle.
- `shared/terrain/Heightfield.js` — heightfield amplitude bug remains deferred to a future cycle. Do not touch.
- `js/GrassSystem.js` — grass-Y clamp at `> 50` stays as-is until heightfield fix lands. Do not adjust.

## Hard stops

Surface to the user, do not proceed:

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. **Sim-baseline drift.** Hard stop — visual cycle cannot affect sim.
3. **Phase 0 smoke screenshots show regression** vs `v1.1.0` (Aspen looks worse, OC empty, fresnel introduces oversaturation). Revert and redesign.
4. **Phase 2 LUT generator can't close mean dE2000 < 8.** Don't ship the LUT — diagnose at root (likely a tonemap or color-space bug in the sandbox, not the shader).
5. **Phase 3 mipmap re-enable shows cross-tile bleed.** Padding sized wrong; redesign rather than patch with `textureLod` workarounds.
6. **Phase 5 per-scene capture shows any scene visibly worse than v1.1.0.** Hard stop, don't tag v1.2.0.
7. Frame time regression > 5% on `perf-check`.

## What NOT to do during this cycle

- **Don't fix the heightfield amplitude bug.** Tempting, scoped-out per Matt's "push back other objectives". Stays in BACKLOG carryover.
- **Don't ship the deferred cinematic videos.** Same — depends on heightfield decision and cinema runner timeout fix.
- **Don't fix the cinema runner `page.screenshot` font-wait timeout.** Workaround (Playwright MCP) is fine for Phase 5 captures.
- **Don't add the LOD2↔LOD0 stochastic-alpha cross-fade** (Cycle 19.5 carryover #3). Phase 4's hybrid trunk-mesh approach addresses #3 differently — by anchoring trunk pixels exactly, the canopy impostor's swap moment is perceptually masked. If Phase 4 lands and #3 still feels visible, escalate to a future cycle.
- **Don't escalate to neural impostors / NeRF / Gaussian splatting.** Research surfaced these as 2026-mature but inappropriate cost/risk. Tracked in research doc.
- **Don't port Pixel Forge to hemi-octahedral encoding** (Cycle 20 plan note). Still upstream Pixel Forge work; out of scope.
- **Don't touch EZ-Tree recipes for tree2 / pine.** Only tree1 (Aspen) re-tunes this cycle.
- **Don't add a fourth tree species.** Three is the right number per `NEXT_SESSION.md` "What NOT to do".
- **Don't introduce a new clamp or fallback to mask issues.** Fix at root or document + escalate.

## Success criteria (cycle close)

`/cycle-close` reads this section. Don't pre-check.

- [ ] Phase 0 — Aspen re-tuned, placement diff applied, fresnel rim landed. 3 smoke screenshots saved. Matt confirms ≥ 2 of 3 visibly improved.
- [ ] Phase 1 — Sandbox v2 standalone HTML committed. Smoke matrix runs end-to-end. BASELINE.md saved with per-scene dE2000 numbers.
- [ ] Phase 2 — `assets/impostor-calibration-lut.json` committed. `uMatchBoost` uniform wired. Full matrix shows mean dE2000 < 5 on ≥ 80% of cells.
- [ ] Phase 3 — Padded-atlas re-bake landed. Mipmaps re-enabled. Glint sweep shows ≥ 70% inter-frame variance reduction.
- [ ] Phase 4 — Trunk-only GLBs baked + loaded. LOD-boundary dolly shows trunk pop ≤ 1 px. Canopy mask working.
- [ ] Phase 5 — 12 per-scene captures reviewed; none worse than v1.1.0. Perf within ±5%. Sim-baseline byte-identical. v1.2.0 tagged + live.
- [ ] All vitest specs pass (186+/186+).
- [ ] Production build clean.
- [ ] perf-check CI green.
- [ ] CHANGELOG.md updated, BACKLOG.md updated (closes Cycle 19.5 carryover #1, #2 partial, #3, #4; absorbs Cycle 20 Phase 3-5).

## References

- [`docs/cycle-21-tree-impostor-research.md`](cycle-21-tree-impostor-research.md) — the 6-agent research compilation that produced this plan.
- [`docs/cycle-20-impostor-color-handoff.md`](cycle-20-impostor-color-handoff.md) — Cycle 20 v1-v5 polish session findings, dead-ends, and sandbox v1 critique.
- [`docs/cycle-20-plan.md`](cycle-20-plan.md) — Cycle 20 plan; Phases 0-2v1 completed, Phases 3-5 absorbed into Cycle 21 Phase 5.
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template.
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files.
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items (heightfield amplitude, cinematic videos remain deferred post-Cycle-21).
- [`docs/tree-pipeline.md`](tree-pipeline.md) — tree bake + impostor pipeline contract.
- **Phase 6 escalation references** (do NOT touch this cycle):
  - Wu et al., "Reshadable Impostors with Level-of-Detail" — CGF/EGSR 2025, [rilod25.pdf](https://cuteloong.github.io/assets/files/rilod25.pdf).
  - Halen et al., "Image-Based Rendering of Complex Scenes" — HPG 2022, validates padded-atlas mip approach.
  - Wyman 2017 JCGT, hashed alpha — for future LOD2↔LOD0 stochastic cross-fade if hybrid trunk approach insufficient.
- **Files this cycle touches** (planning reference, not exhaustive):
  - `tools/bake-trees.mjs` — Aspen recipe re-tune (Phase 0)
  - `tools/bake-tree-impostors.mjs` — tile-padding flag (Phase 3)
  - `tools/lod-sandbox-v2.html` — NEW (Phase 1)
  - `tools/generate-impostor-lut.mjs` — NEW (Phase 2)
  - `shared/TreePlacement.js` — placement diff (Phase 0)
  - `js/kiln-impostor-material.js` — fresnel + uMatchBoost + mip re-enable (Phases 0, 2, 3)
  - `js/TerrainBuilder.js` — `setImpostorTint` LUT lookup, hybrid LOD chain (Phases 2, 4)
  - `js/main.js` — LUT load wiring (Phase 2)
  - `js/GameAssetLoader.js` — trunk GLB deferred load (Phase 4)
  - `assets/models/trees/*.imposter.{png,normal.png,depth.png,json}` — re-bake with padding (Phase 3)
  - `assets/models/trees/*.glb` + `*_lod1.glb` — re-bake from re-tuned Aspen recipe (Phase 0)
  - `assets/models/trees/*.trunk.glb` — NEW (Phase 4)
  - `assets/impostor-calibration-lut.json` — NEW (Phase 2)
  - `docs/tree-pipeline.md` — seed + Phase 3/4 documentation updates
  - `CHANGELOG.md` — Phase 5 player-facing entry
  - `package.json` — version bump to 1.2.0 (Phase 5)
