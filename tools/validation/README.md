# tools/validation

> Cycle 25 Phase A. Durable validation harness used by every polish-cycle phase.

## Tools

| Tool | Purpose | npm script |
|---|---|---|
| `lod-compare.mjs` | LOD0/LOD1/LOD2 silhouette IoU + dE2000 + luma-delta at fixed camera offsets. JSON output. | `npm run validation:lod` |
| `screenshot-golden.mjs` | Playwright matrix → SSIM diff vs `tools/validation/golden/`. Three modes: `--capture`, `--diff`, `--baseline`. | `npm run validation:screenshots` |
| `input-latency.mjs` | Synthesised keypress → next-paint timestamp delta. Targets: < 33ms desktop, < 50ms phone. | `npm run validation:latency` |
| `frame-time-histogram.mjs` | 600-frame ring-buffer drain → p50/p95/p99/p99.9 histogram. Target: p99 ≤ 33ms desktop. | `npm run validation:perf` |

`npm run validation:all` runs all four sequentially.

## Run order

All tools assume `npm run dev` (Vite :3000) is already running. They
don't auto-start the server because Phase A baselines need to be
captured against a known-cold dev process so subsequent runs are
comparable.

```
npm run dev          # in another terminal
npm run validation:lod
npm run validation:screenshots -- --baseline   # first run only
npm run validation:screenshots -- --diff       # subsequent runs
npm run validation:latency
npm run validation:perf
```

## Phase A baseline

Phase A captures + commits to `cycle25-validation/phaseA/baseline/`.
Goldens (`tools/validation/golden/`) are gated on Matt's review — the
autonomous run does NOT auto-commit them.

## Adding cells / tests

Each tool exposes its matrix as a top-of-file array constant. Adding
a new (scene, ToD, camera, zoom) combination is one line. Cells are
independent — no inter-cell coupling.

## Why these specific metrics

- **IoU** (intersection-over-union of silhouette alpha) captures shape
  divergence at the LOD seam — the cycle thesis is LOD1's silhouette
  drifts from LOD0 because alpha-tested foliage cards can't lose
  detail without losing silhouette.
- **dE2000 / dE76** (Lab colour distance) captures the warm-bias /
  fog-grey washing that `AtmosphericDesatPatch` was hiding.
- **Luma delta** isolates lighting regressions from chromatic ones.
- **SSIM** (single-window luma-only) gives cheap "did this regress"
  on the big screenshot matrix without per-pixel review.
- **p99 frame time** is the budget gate that determines whether a
  shader change ships or rolls back.

Adequate for "did this regress." Not perceptually-tuned.
