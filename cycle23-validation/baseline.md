# Cycle 23 baseline (cycle-23-base = 75a0792 = v1.3.0)

Captured 2026-05-05.

## Test
- vitest: 179 passed (+ 7 skipped)
- duration: ~1.2s

## Build
- main bundle: 825.62 kB / 246.99 KB gzip
- three chunk: 617.77 kB / 157.32 KB gzip
- build time: ~4.3s

## perf-baseline (committed, captured 2026-05-04)
- field-extreme: avgFrameTime 3807ms, triangles 4,516,262, draw calls 1003 (note: SwiftShader headless, ~4s/frame is normal for tests/perf-baseline runs; not real-world FPS)
- All other configs: TIMEOUT (committed baseline has been unstable since mid-Cycle 22)

## Cycle 22 acceptance reference
- field-extreme tri count was -26.7% vs cycle-21 (per cycle-22 plan close).

## Cycle 23 targets per plan
- Phase A1 perf:check field-extreme within ±5% of v1.3.0 baseline
- Phase D OC-Extreme tri count drops ≥ 40% vs v1.3.0
- Phase F build delta < +20KB cumulative

Note: full perf:check requires a live `npm run dev` server. We will rely on
build-size + tri-count assertions where the harness fails to run.
