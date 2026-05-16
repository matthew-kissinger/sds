# tools/validation

> Cycle 25 Phase A. Durable validation harness used by every polish-cycle phase.

## Tools

| Tool | Purpose | npm script |
|---|---|---|
| `lod-compare.mjs` | LOD0/LOD1/LOD2 silhouette IoU + dE2000 + luma-delta at fixed camera offsets. JSON output. | `npm run validation:lod` |
| `screenshot-golden.mjs` | Deterministic Playwright canvas matrix -> normalized-luma SSIM diff vs `tools/validation/golden/`. Three modes: `--capture`, `--diff`, `--baseline`. | `npm run validation:screenshots` |
| `input-latency.mjs` | Synthesised keypress → next-paint timestamp delta. Enforces p99 <= 33ms desktop by default; `--profile=mobile` enforces p99 <= 50ms against the mobile browser profile. | `npm run validation:latency`, `npm run validation:latency:mobile` |
| `frame-time-histogram.mjs` | 600-frame ring-buffer drain → p50/p95/p99/p99.9 histogram. Target: p99 ≤ 33ms desktop. | `npm run validation:perf` |

`npm run validation:all` runs all four sequentially.

Konveyor WebGPU parity uses
`node tools/konveyor-production-gameplay-parity-proof.mjs --enforce-default-parity`
against a built production preview on `127.0.0.1:4173`. That proof records
full-frame SSIM as advisory and gates default-readiness on runtime/capture plus
semantic sky, horizon, and ground regions.

Explicit production WebGPU request proof uses
`node tools/konveyor-production-webgpu-request-proof.mjs` against the same built
preview. It validates that default URLs still use WebGL and that plain
`?renderer=webgpu` fails closed to WebGL when `navigator.gpu` is unavailable
and enters the production WebGPU route across the shipped scenes when WebGPU is
available. The proof defaults to the installed Chrome channel because bundled
Playwright Chromium can expose `navigator.gpu` while failing device creation on
the local Windows Dawn/DXIL path.

Explicit production WebGPU perf proof uses
`node tools/konveyor-production-webgpu-perf-proof.mjs` against the same built
preview. It warms each shipped scene, resets `window.__perfHarness`, samples an
8000 ms steady-state window, and gates average <= 22 ms, p95 <= 30 ms, and at
least 240 samples for plain `?renderer=webgpu`. It uses the same installed
Chrome default as the request proof.

On Windows, Playwright's `chromium` and `mp` projects pass
`--use-angle=d3d11 --enable-gpu` so browser perf probes use the D3D11 GPU path.
If `oc-perf` collapses to only a few samples with multi-second frame times,
treat that as a browser launch/hardware path problem before blaming game code.

## Run order

All tools assume `npm run dev` (Vite :3000) is already running. They
don't auto-start the server because Phase A baselines need to be
captured against a known-cold dev process so subsequent runs are
comparable. Automation should set `SDS_SUPPRESS_BROWSER_OPEN=1` when starting
Vite so the human-friendly `server.open` setting does not create real browser
tabs during validation.

```
npm run dev          # in another terminal; set SDS_SUPPRESS_BROWSER_OPEN=1 for automation
npm run validation:lod
npm run validation:screenshots -- --baseline   # only when intentionally accepting a new baseline
npm run validation:screenshots -- --diff       # subsequent runs
npm run validation:latency
npm run validation:latency:mobile
npm run validation:perf
```

## Phase A baseline

Konveyor now commits the 12-cell smoke-matrix goldens under
`tools/validation/golden/`. The harness captures full 1280x720 canvas PNGs
through the same cinematic/probe surfaces used by other browser evidence:
`probeRender=1`, `cinematic=1`, `visualGolden=1`, and fail-closed deterministic
Konveyor rock placement. The diff stores fresh captures and `diff-summary.json`
under `cycle25-validation/phaseA/screenshots/`.

Do not run `--baseline` as a shortcut. Use it only when the visual change is
intentional and recorded in the active handoff, `DECISIONS.md`, or a cycle plan.

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
- **SSIM** (single-window normalized-luma) gives cheap "did this regress"
  on the screenshot matrix without per-pixel review. Captures stay 1280x720,
  but comparison is normalized to 320x180 to avoid full-resolution grass and
  alpha-hash shimmer dominating scene-level regressions.
- **p99 frame time** is the budget gate that determines whether a
  shader change ships or rolls back.

Adequate for "did this regress." Not perceptually-tuned.
