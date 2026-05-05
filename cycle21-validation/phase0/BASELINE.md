# Cycle 21 Phase 0 — quick wins smoke validation

> 2026-05-04. Phase 0 = independently-shippable quick wins: Aspen recipe re-tune, tree placement diff, Schlick fresnel rim, tree-pipeline.md doc fix. Captured by Playwright MCP at classic-cam zoom=150 on each scene's default ToD preset.

## Captures

| File | Scene | Camera | What it shows |
| --- | --- | --- | --- |
| [`field-baseline.jpeg`](field-baseline.jpeg) | Field (noon-ish) | classic z=150 | Pasture surrounded by tree groves; fence + sheep + farmhouse. Aspen LOD0 in foreground. |
| [`rh-baseline.jpeg`](rh-baseline.jpeg) | Rolling Hills (sunset) | classic z=150 | Overhead island with woods coverage; warm sun on lit-side of canopies. Fresnel rim present on impostors. |
| [`oc-baseline.jpeg`](oc-baseline.jpeg) | Open Country (dusk) | classic z=150 | Woods zone around open meadow; sheep gather ring centered. Tree spacing visibly opened up. |

## Visible improvements vs Cycle 20 v5 baseline (15-aniso8-maxzoom-classic)

1. **Aspen reads fuller** — `field-baseline.jpeg` foreground shows leaf-coverage on the slim aspens, not the prior "broomstick" silhouette. Bake confirms tree1.glb went 3744 → 5880 tris (+57%) from `LEAF_COUNTS.aspen[0]` 24→34 + `LOD0_BRANCH_ASPEN.children[0]` 8→10.
2. **OC woods less clumpy** — `oc-baseline.jpeg` shows the woods ring around the meadow with visible gaps between groves; no canopy-blob-clumps. Driven by `WOODS_INSIDE_FACTOR` 0.85→0.92 (1/0.92² ≈ 1.18× density vs 1/0.85² ≈ 1.38×) and `scaleVariation` 0.7-1.3 → 0.80-1.20 (fewer towering-vs-tiny outliers).
3. **Fresnel rim** — subtle warm-edge highlight on impostor canopies on the sun-lit side, most visible in the RH overhead at sunset. Confirms `uFresnelStrength=0.04` shipped (probe via `__sdsImpostorProbe.kilnMaterial.uniforms.uFresnelStrength.value`).

## Tests + build

- `npm test` → 186 passed / 7 skipped (193 total). One spec relaxed: `tree-placement.spec.js` woods-density threshold 1.3× → 1.05× to match the new `WOODS_INSIDE_FACTOR=0.92` design intent (still guards against zero-bias regression).
- `npm run build` → 819.29 KB main / 244.83 KB gzip (+1 KB over Cycle 20 v2-v5 commit `848f0e7` for fresnel addition; well under Phase 0's <5 KB target).
- Tree atlas re-bake successful for all 3 species (16 hemi-y, 4×4 2048×2048).

## What Phase 0 does NOT close

The Phase 0 changes are tonal/cosmetic — they don't address the structural impostor-vs-LOD0 sampling and color-match gap that motivated Phases 1-5. The fresnel rim closes some of the warm-bias hue gap but Cycle 20 v5's underlying sampling glint and dE2000 mean-distance gap remain. Phase 1's sandbox v2 + Phase 2's calibration LUT are the next layer.

## Acceptance check

- [x] 3 smoke screenshots saved
- [x] Tests + build green
- [x] At least 2 of 3 scenes show visible improvement (per plan: Field foreground Aspen + OC woods spacing both clearly improved; RH already looked good but fresnel adds rim)
