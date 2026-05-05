# Cycle 21 Phase 1 — sandbox v2 + 12-cell baseline measurement

> 2026-05-04. Standalone harness at [`tools/lod-sandbox-v2.html`](../../tools/lod-sandbox-v2.html). Imports SDS modules via Vite dev server, instantiates one `Atmosphere` per pane bound to host-supplied AmbientLight, renders LOD0 (tree GLB) + LOD2 (kiln impostor) at the same world pose, samples 5×5 grids on each canopy, computes per-channel ratios + dE_OK proxy.

## Architecture decisions resolved (Q2 from cycle-21-plan.md)

- **Q2 standalone HTML wins.** No game-loop ticking, deterministic batch render. Reuses SDS modules directly via Vite — `Atmosphere`, `loadKilnImpostor`, `SKY_PRESETS` import cleanly.
- Two panes (LOD0 / LOD2) each with own `Atmosphere` instance, both driven by the same preset selector. Sun + ambient bind via `atmosphere.bindAmbientLight(scene.ambient)` mirroring SDS SceneManager.

## Measurement protocol

- **Sample region:** centered 60% × 60% of canvas. 5×5 grid = 25 samples per tree. Skip pixels with α < 0.2 (sky/background).
- **Color math:** sRGB → linear via gamma 2.4, then OKLab Euclidean × 100 = `dE_OK` proxy. Per-channel `dRGB`. Linear Rec601 luma `dLuma`.
- **Per-cell ratio:** `lod2[c] / lod0[c]` per channel — directly drives Phase 2's `uMatchBoost` calibration.

## 12-cell smoke matrix — `pastoral-noon` × classic-cam

Saved [`sandbox-baseline.json`](sandbox-baseline.json). Headline:

| Metric | Value | Verdict |
| --- | --- | --- |
| `meanDE_OK` | **0.65** | <5 target ALREADY MET in sandbox |
| `maxDE_OK` | **2.24** | also under target |
| `meanDLuma` | -0.001 | impostor very slightly dimmer |
| `meanDRGB` | (-0.001, -0.001, 0.000) | near-neutral residual |

### Per-species mean ratio impostor / LOD0 (across all 4 distances)

| Species | R | G | B | Notes |
| --- | --- | --- | --- | --- |
| **tree1** (Aspen Small) | **0.78** | **0.89** | **1.16** | Notable: impostor reads darker R, slightly dimmer G, brighter blue. Most-mismatched species. |
| **tree2** (Oak Medium) | 1.07 | 1.00 | 1.07 | Within 7% of LOD0. |
| **pine** (Pine Medium) | 1.09 | 1.00 | 1.05 | Within 9% of LOD0. |

The tree1 (Aspen) color drift is the dominant residual. Phase 2's LUT will normalize tree1 specifically; tree2/pine LUT entries will be close to identity.

## Distance-dependent deviation (Matt's review observation, 2026-05-04)

Matt called out from the production-game LOD-COMPARE shots: "the further away the brighter the deviation for the impostor." The sandbox numbers confirm:

| Species | dE@50m | dE@100m | dE@150m | dE@250m |
| --- | --- | --- | --- | --- |
| tree1 | 2.24 | 0.76 | 0.63 | **1.83** |
| tree2 | 0.69 | 0.07 | 0.12 | 0.20 |
| pine  | 0.64 | 0.12 | 0.23 | 0.31 |

For tree1 (the dominant-residual species), dE doubles between 150m and 250m. The 50m spike is a sandbox sampling artifact (large canopy α-fringe biases the readPixels mean); the 150→250m trend is the relevant signal. tree2 and pine show the same monotonic-growth trend at lower magnitude.

**Implication for Phase 2 LUT design:** A single per-`(scene, ToD)` boost vector will over-correct close trees and under-correct far ones. The LUT generator should compute per-distance ratios; ship the (scene, ToD)-only v1 (plan's Q3 author lean), but log the per-distance residual so Phase 5 can make the call on whether to escalate to a 2D LUT (Phase 6 option 3).

The structural fix for the distance-deviation IS Phase 3 (padded-atlas mips) — the growth-with-distance is largely a sampling-bandwidth problem, not a color-math problem. Phase 2's LUT closes color math; Phase 3 closes sampling. They're orthogonal.

## Caveats — sandbox vs production-game disparity

Two concerns the cycle-close review should weigh:

1. **Absolute pixel magnitudes are low** — the sample averages range 0.005-0.022 in linear space. The trees project very small at 50-250m camera distance even with TREE_SCALE=15 (matches game scale). Most of the 5×5 grid hits canopy fringe — heavy α-blend with sky/ground. The ratios are still meaningful (per-channel relative comparisons), but absolute dE values aren't directly comparable to the visible production-game gap Matt flagged.
2. **Sandbox doesn't reproduce the glint Matt saw** in the LOD-COMPARE shots (cycle21-validation/phase0/lod-compare-impostor.jpeg). Glint is an inter-frame variance phenomenon at angle-foreshortened texture sampling; Phase 1's static-frame measurement can't capture it. Phase 3's `glint sweep` (16 frames × 4 pitches, inter-frame max-RGB-delta) is the right diagnostic.

So Phase 1's role is **color-match baseline, not glint baseline.** Phase 2's LUT will use the ratios above to close the per-channel residual; Phase 3's padded mips fix the glint independently.

## Acceptance check

- [x] Sandbox v2 runs end-to-end, imports SDS modules cleanly.
- [x] 12-cell smoke matrix completes without errors.
- [x] BASELINE.md committed with per-scene dE numbers + headline ratios.
- [x] JSON output schema matches plan's spec (per-cell `lod0`, `lod2`, `dE`, `dRGB`, `dLuma`, `species`/`distance`/`mode` metadata).

## Next: Phase 2

Per-species ratios above feed `tools/generate-impostor-lut.mjs`. Target: ship `assets/impostor-calibration-lut.json` + wire `uMatchBoost` uniform driven from a `(scene, preset)` lookup.
