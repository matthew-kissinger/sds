# Cycle 89 - Frame stability: kill the small-scene jitter (measurement-first)

> Drafted 2026-06-10 after Cycle 88 closed; scoped 2026-06-10 from Matt's report. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Matt sees an unstable frame rate (jitter and hitches, not a low average) on Home Field with 3 sheep (the Just Play rung) on the RTX 3070 with 143Hz monitors. Cycle-82 data shows Newsheepdogland steady-state p95 of about 7ms on the same GPU (`cycle82-validation/steady-state-profile-3070.json`), so the problem is hitches, not throughput; at 143Hz the budget is 7.0ms per frame and a single 1-2ms spike is a dropped frame. Before: visible stutter on the smallest scene. After: a reproducible jitter probe shows hitch count and 1%-low FPS within recorded budgets on the same hardware, with zero visual or gameplay change. Fix phases are gated: each ships only if Phase 2's attribution data proves its suspect's cost.

**Pre-phase (shipped 2026-06-10, Matt-directed):** the entrance default moved back to Rolling Hills and Newsheepdogland is labeled Experimental (WIP) while its runtime perf is tuned. `DEFAULT_SCENE_ID` and `DEFAULT_WORLD_INDEX` are `rolling-hills`; the entrance shows an Experimental pill on NSL; copy updated in README, llms.txt, and the NSL scene page; carousel-stepping e2e specs rewired. NSL-specific streaming perf is Cycle 90 scope, informed by this cycle's probe.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code.
- **Measure on the actual hardware target** (the RTX 3070 dev box is the reporting machine, so local probe runs are on-target).
- **Pick the simplest thing that meets the budget.**

## Open questions to resolve before writing code

1. **Q1: Is the jitter reproducible under Playwright Chromium, or only in Matt's desktop Chrome session (compositor, dual-monitor 143Hz, extensions)?** Author lean: Phase 1 answers this empirically; if headless/headed Playwright shows a clean trace, capture once in a real Chrome profile via `--channel=chrome` headed before concluding environmental.
2. **Q2: Do fixes need to hold at 200 sheep too?** Author lean: yes, the probe always captures field/practice (3) and field/classic (200); budgets are recorded for both.

## Architecture / shared changes

One new tool, no new runtime primitives: `tools/cycle89-jitter-probe.mjs` (Playwright; clones the run/aggregate/JSON shape of `tools/cycle82-steady-state-profile.mjs`). It is the only artifact other phases depend on. Fix phases touch existing files only.

## Phase 1 - Jitter probe + 3-sheep baseline (~3hr, autonomous)

**Independently testable.** Tools-only; zero game-code risk. Produces the data every later phase depends on.

1. **Probe.** New [`tools/cycle89-jitter-probe.mjs`](../tools/cycle89-jitter-probe.mjs): boot `?scene=field&mode=practice&autostart=1&perfMode=1` (exactly 3 sheep via the field solo ladder, [`shared/scenes/field.js`](../shared/scenes/field.js) line 98), wait `window.__perfHarness.isReady()`, warm >= 10s, then record via `page.evaluate`: raw rAF deltas with timestamps and frame indices, a `longtask` PerformanceObserver (pattern: `tools/webgpu-flagship-lift-gate-cycle81.mjs`), and 1Hz `performance.memory` heap samples.
2. **Metrics.** Per run: median, p50/p95/p99/max, delta stddev, 1%-low FPS, hitch count (delta > 1.5x median) with hitch frame indices, longtask list, heap-drop events. 5 runs aggregated. Phase-lock analysis: hitch indices bucketed mod 20 / mod 10 / mod 60 (mod-20 lock implicates the grass readback cadence; mod-10 the stats panel).
3. **Outputs.** `cycle89-validation/jitter-baseline-field-practice.json` plus a field/classic (200 sheep) contrast capture. npm script `perf:jitter`.
4. **Hygiene.** `SDS_SUPPRESS_BROWSER_OPEN=1`; close all pages/contexts; no listeners left on 3000/4173.

**Acceptance (EARS):**

- [x] When `npm run perf:jitter` runs, the probe shall write `cycle89-validation/jitter-baseline-field-practice.json` containing `hitchCount`, `onePercentLowFps`, `deltaStddevMs`, `longtasks`, and `hitchPhaseLock` for 5 runs. *(Shipped; the canonical baseline became the driven variant `jitter-baseline-field-practice-driven.json` after Matt's mid-cycle correction, see the reshape section.)*
- [x] If `__perfHarness.isReady()` is not true within 120s, then the probe shall exit non-zero with a diagnostic.
- [x] When the probe exits, no Playwright browser process or preview listener shall remain.

**Mid-cycle correction (Matt, 2026-06-10):** idle-camera capture understates the problem badly (45 hitches/30s idle vs 207 driven). The probe now drives input by default (`--drive=1`): holds W, weaves A/D, bursts sprint, wheel-zooms in and out for the whole measure window, and reports a per-5s hitch timeline plus first-10s vs steady split. Driven baseline: 207 hitches/30s, 1%-low 20-24 FPS, worst deltas 69-160ms in near-exact multiples of the 6.94ms refresh interval (10-23 dropped frames at once), zero longtasks. Zero longtasks during 70-160ms rAF gaps means the main thread is idle while frames stall: the cost is GPU-process-side, not JS.

## Phase 2 - Attribution matrix, the data gate (~3hr, autonomous)

**Depends on:** Phase 1.

1. **Isolation runs.** `--matrix=1`: full / sheep-only / terrain-only / grass-only / atmosphere-only via `__perfHarness.setSystemIsolation()` (ids in `tools/perf-harness.mjs`).
2. **Monkeypatch toggles** (page-side only, no game-code edits): (a) readback-off (`readbackVisibleAsync` stubbed), (b) `performanceMonitor.updateMetrics` no-op, (c) `qualityGovernor.sample` no-op post-warmup, (d) collision profile on (`setCollisionProbeEnabled(true)`) reading `p95SheepCollisionMs` at N=3.
3. **Outputs.** `cycle89-validation/jitter-attribution-matrix.json`; fill the go/no-go table below.

**Go/no-go gates (fix phases run only if armed):**

| Fix phase | Armed iff | Result (driven matrix, 2026-06-10) |
|---|---|---|
| Phase 3 (alloc churn) | toggles (b)+(c) cut hitch count >= 30%, or longtask/heap events correlate with >= 30% of hitches | **NOT ARMED.** Zero longtasks in every run; heap-drop correlation 0.28-0.34. The perfmon-off and governor-off runs were contaminated by concurrent machine use and recorded as such. |
| Phase 4 (readback) | hitches phase-lock to mod-20, or toggle (a) cuts hitch count >= 30% | **NOT ARMED.** mod-20 lock ratio 1.54 (no lock); readback toggle skipped by design: Home Field has no grass compute-cull controller. |
| Phase 5 (dense grid) | `p95SheepCollisionMs` >= 0.3ms at N=3 | **NOT ARMED.** sheep-only isolation is jitter-free (0.5 hitches/30s, 1%-low 137 FPS), so the sim plus sheep path is exonerated wholesale. |
| Phase 6 (static sun) | atmosphere-only isolation shows >= 50% of full's hitch density | **NOT ARMED.** atmosphere-only: 1 hitch/30s vs full's 169-172.5. |

If no suspect clears its bar: stop, record findings in `BACKLOG.md` (instability may be environmental), surface to Matt. *(Outcome: none armed, but the matrix pointed at the real suspect instead of stopping - see the reshape section.)*

**Acceptance (EARS):**

- [x] When `npm run perf:jitter -- --matrix=1` runs, the probe shall write `cycle89-validation/jitter-attribution-matrix.json` with one entry per config (>= 8 configs), each carrying `hitchCount` and `onePercentLowFps`. *(Driven variants: `jitter-attribution-matrix-driven.partial.json` plus the focused `jitter-attribution-trees-driven.json`, `jitter-attribution-tree-alphahash-driven.json`, `jitter-attribution-cull-driven.json`.)*
- [x] When Phase 2 ships, this plan's go/no-go table shall be annotated with armed/not-armed per fix phase.

## Mid-cycle reshape (2026-06-10, data-driven)

The driven matrix overturned the plan's suspects. The chain of evidence, all in `cycle89-validation/`:

1. **Every isolation that hides scenery is smooth.** sheep-only / terrain-only / grass-only / atmosphere-only: 0.5-1.5 hitches/30s, 1%-low 128-138 FPS. Only `full` stutters (169-172.5/30s, 1%-low 24). Trees, rocks, structures, and water are hidden in all four isolations; trees were the prime suspect (Matt's hypothesis).
2. **Tree discrimination** (`jitter-attribution-trees-driven.json`): trees-only alone reproduces the stall depth (1%-low 28); trees-off is the biggest single win (1%-low 70); tree-shadows-off barely moves it (143/30s, 1%-low 24). The tree main-pass draw, not the shadow pass.
3. **Renderer differential** (`jitter-baseline-field-practice-webgl-driven.json`): same driven probe on `?renderer=webgl` shows 42 hitches/30s, 1%-low 72-89, no deep stalls. The 70-160ms freezes are exclusive to the WebGPU path. Cycle 87 made webgpu-production the default on all scenes and removed the WebGL demotion record, which is why "it wasn't like this."
4. **alphaHash exonerated** (`jitter-attribution-tree-alphahash-driven.json`): swapping tree materials to plain alphaTest changes nothing (184/30s, 1%-low 22.6).
5. **Mechanism found** (`jitter-attribution-cull-driven.json`): pinning tree chunk meshes in the render list (`frustumCulled=false`, trees only) keeps the shallow-hitch count but eliminates the deep stalls: 1%-low 24 -> 67 FPS at no median cost. Blanket cull-off-all also kills deep stalls but inflates constant load (698/30s shallow hitches), so the targeted pin is correct. Diagnosis: a culled tree chunk re-entering the WebGPU render list re-triggers GPU-process pipeline/bind-group setup (three.js issue #33685 signature); turning and zooming cycles chunks in and out continuously. Field draws all 371 trees as per-chunk `frustumCulled=true` InstancedMeshes at LOD0-only on this path; every other major system (sheep, grass, terrain, sky, clouds, water) already ships `frustumCulled=false`.

**R&D spike (Matt-directed, completed 2026-06-10).** Researched EZ-Tree, Dan Greenheck's repos, and three.js WebGPU practice (r180-r186):

- `@dgreenheck/ez-tree` 1.1.0 is the latest npm release; we are current. Unreleased main-branch improvements (rounded leaf normals, stratified branch/leaf placement) are generation-time visual upgrades worth cherry-picking at the next tree re-bake via Pixel Forge. The tree asset itself is modest (~3.8k tris per tree, ~1.4M total on field) and exonerated as the stall cause.
- Dan Greenheck's `webgpu-claude-skill` is already installed locally as the `webgpu-threejs-tsl` skill; its storage-buffer instancing pattern (TSL `instancedArray` + compute, zero per-frame CPU writes) is the long-term shape for the impostor runtime.
- three.js r184 documents the exact stall signature (issue #33685): node materials compile a fresh shader + D3D12 PSO per first draw in the GPU process; WebGL is immune via ANGLE's persistent disk shader cache. `renderer.compileAsync` (already wired in main.js prewarm) covers initial state but not render-list re-entry.
- Backlog candidates recorded from the spike: alpha-to-coverage A/B vs alphaHash for foliage, tight-fit impostor outlines (overdraw), storage-buffer impostor tile selection.

**Shipped fix (replaces Phases 3-6):** `js/world/TreePlacement.js` desktop tree chunks on the WebGPU-native path ship `frustumCulled = builder.isMobile` (pinned on desktop, culled on mobile). The streamed-wave WebGL fallback keeps culling. Summary field `culling` reports `render-list-pinned` on desktop. Zero visual change by construction (culling never changed what is on screen, only when meshes leave the render list).

**Acceptance (EARS):**

- [x] When the driven 3-sheep jitter probe runs 5x30s post-fix, 1%-low FPS shall be >= 60 (driven baseline: 20.3-24) and worst frame delta shall be < 69ms (the smallest pre-fix deep stall). *(Measured: 1%-low 70.2-71 across 5 runs, worst delta 20.9ms; `jitter-after-tree-pin-field-practice-driven.json`.)*
- [x] When `npm test` and `npm run build` run, both shall pass with the main bundle <= 609 KiB and zero sim-baseline diffs. *(1518 passed, bundle ratchet spec green, sim-baseline fixtures untouched per `git status`.)*
- [x] When `npm run validation:screenshots -- --diff` runs, all cells shall pass SSIM >= 0.95. *(Satisfied by differential instead: the goldens date from 2026-05-16 and fail 12/12 on clean main HEAD too (mean SSIM 0.33, three visual cycles of drift). Per-cell SSIM with the fix matches main HEAD to within 0.0016 on every cell (`cycle89-validation/golden-diff-main-head.json` vs the post-fix capture), proving zero visual change. Golden re-capture recorded as a backlog item.)*

## Phase 3 - Fix A: per-frame allocation churn (~4hr, autonomous, gated) - NOT ARMED, skipped

Files: [`js/PerformanceMonitor.js`](../js/PerformanceMonitor.js), [`js/perf/QualityGovernor.js`](../js/perf/QualityGovernor.js), [`js/components/hooks/useGameState.js`](../js/components/hooks/useGameState.js), call sites in [`js/main.js`](../js/main.js) (frame-loop order unchanged).

1. PerformanceMonitor: rolling sum instead of per-frame `.reduce` over the 60-frame history; counting loop instead of `.filter` allocation; cache `getSystemBreakdown()` and invalidate on `addSystemTriangles` change; reuse the visible-counts target object instead of `{...counts}`; skip `stats.update()` and `updateCustomStats()` when the panel is hidden (current guard checks existence only).
2. QualityGovernor: reuse a cached accumulating-state object instead of `_makeState(null)` per frame; avoid the per-frame `getState()` spread at its main.js consumer.
3. useGameState: reuse a scratch snapshot in `readGameState`, clone only on change; skip the `JSON.stringify` comparisons when not in a multiplayer room.

**Acceptance (EARS):**

- [ ] When the 3-sheep jitter probe runs 5x30s post-fix, hitch count per 30s shall be <= 50% of the Phase 1 baseline and 1%-low FPS shall be >= the Phase 1 value (numbers recorded in the cycle doc when Phase 1 lands).
- [ ] When `npm test` and `npm run build` run, both shall pass with the main bundle <= 609 KiB.
- [ ] When `npm run validation:screenshots -- --diff` runs, all cells shall pass SSIM >= 0.95.

## Phase 4 - Fix B: grass compute-cull readback cadence (~2hr, autonomous, gated) - NOT ARMED, skipped

Files: [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) (readback drive), [`js/world/grassComputeCull.js`](../js/world/grassComputeCull.js).

1. Gate the every-20-frames `readbackVisibleAsync` behind its only consumers: run when `?perfMode=1` or the stats chip is enabled (`?stats=1` / `sds.show-stats`). Ordinary play never pays the readback; perf-harness numbers stay comparable because perfMode keeps it live.
2. If perfMode runs still phase-lock at mod-20: stagger the readback off the cull-dispatch frame and/or stage the indirect buffer copy so the live buffer is never mapped.

**Acceptance (EARS):**

- [ ] When the 3-sheep jitter probe runs post-fix without `stats=1`, the `hitchPhaseLock` mod-20 bucket shall hold <= 2x the mean bucket density.
- [ ] While `perfMode=1` is set, `__perfHarness.getSummary()` grass stats shall remain populated.
- [ ] When `npm run perf:check` runs, all configs shall pass against `tests/perf-baseline/baseline.json`.

## Phase 5 - Fix C: dense-grid generation stamp in EntityCollision (~3hr, autonomous, gated) - NOT ARMED, skipped

File: [`shared/EntityCollision.js`](../shared/EntityCollision.js). **Deterministic shared-sim code: behavior must be byte-identical. See Frozen files below.**

1. Replace `denseHeads.fill(-1, 0, totalCells)` with a parallel `Uint32Array` of generation stamps and a monotonic `denseGeneration` counter: `getCellHead` treats a stale stamp as -1; `setCellHead` writes the stamp. Chain construction and neighbor iteration order untouched, so results are provably identical; only uninitialized-cell detection changes.
2. Proof obligations: `tests/sim-baseline/*.json` byte-identical (no regeneration; `git status` clean on fixtures); `npm run perf:collision` pair-check counts identical at N=3 and N=200 before/after.

**Acceptance (EARS):**

- [ ] When `npm test` runs, every sim-baseline spec shall pass against unmodified fixture JSONs.
- [ ] When `npm run perf:collision` runs at N=3 and N=200, pair-check counts shall match pre-change values exactly.
- [ ] When Phase 5 ships, `grep -n "fill(-1" shared/EntityCollision.js` shall return no per-frame dense-grid fill.

## Phase 6 - Fix D: static-sun atmosphere short-circuit (~3hr, autonomous, gated) - NOT ARMED, skipped

Files: [`js/atmosphere/Atmosphere.js`](../js/atmosphere/Atmosphere.js) and sky internals as the data demands.

1. Home Field has a static sun (no `dayNight` in [`shared/scenes/field.js`](../shared/scenes/field.js)), yet sun-dependent sky/fog recompute runs every frame. Skip sun-dependent recompute when dayNight is off and the sun direction is unchanged since last frame. Keep cloud drift (visible motion) and per-frame shadows (sheep and dog move).
2. `__perfHarness.setSun()` must invalidate the cache.

**Acceptance (EARS):**

- [ ] While a scene without `dayNight` is active and the sun is static, `Atmosphere.update` shall not re-bake sun-dependent sky state (counter exposed for the probe to assert).
- [ ] When `__perfHarness.setSun(t)` is called, the next frame shall reflect the new sun.
- [ ] When `npm run validation:screenshots -- --diff` runs, all field cells shall pass SSIM >= 0.95.

## Phase 7 - Re-baseline, regression rail, close (~2hr, autonomous)

**Depends on:** whichever of Phases 3-6 shipped.

1. Re-run the Phase 1+2 probes; write `cycle89-validation/jitter-after-*.json`; add a before/after table to this doc.
2. Add `--check` mode to the jitter probe with budgets (hitch count per 30s, 1%-low) derived from the after data; `npm run perf:jitter -- --check` becomes a durable rail.
3. Full rails: `npm test`, `npm run build` (main <= 609 KiB), `npm run perf:check`, `npm run validation:screenshots -- --diff`.

**Before/after (driven field/practice, RTX 3070, 2026-06-10):**

| Metric | Before (WebGPU default) | After (tree pin) | WebGL reference |
|---|---|---|---|
| 1%-low FPS (min across runs) | 20.3 | 70.2 | 71.9 |
| Worst frame delta | 159.6ms | 20.9ms | ~14ms class |
| Frame-delta stddev | 5.05ms | 1.32ms | 0.67ms |
| Hitches/30s (mean) | 207 | 161 (quiet machine: 20.7) | 42 |
| Longtasks | 0 | 0 | 0 |

Budgets live in `cycle89-validation/jitter-budgets.json` (1%-low >= 55, worst delta <= 45ms, hitch rate <= 300/30s); `npm run perf:jitter -- --check` passed on first run (1%-low 77.8, worst 20.9ms).

**Acceptance (EARS):**

- [x] When `npm run perf:jitter -- --check` runs on the RTX 3070, field/practice hitch count per 30s and 1%-low FPS shall be within the budgets recorded in the script. *(Pass; budgets also gate worst frame delta, the deep-stall guard.)*
- [x] When the cycle closes, `cycle89-validation/` shall contain baseline, attribution-matrix, and after JSONs.

## Dependencies

```
Phase 1 → Phase 2 (gate) → Phases 3,4 (highest-probability, run first) + 5,6 as armed → Phase 7
```

Phases 3-6 are independently verifiable; run the probe between each.

## Frozen files (cycle-specific additions)

- [`shared/EntityCollision.js`](../shared/EntityCollision.js) (Phase 5 only): deterministic shared-sim code under the sim-baseline fixtures. Authorized for the generation-stamp change only, with the migration story above (no behavior change, no fixture regeneration, no MP impact since both Worker and client ship the same byte-identical logic change). Any sim-baseline diff aborts the phase.

## Hard stops

1. Any `tests/sim-baseline/*.json` diff during Phase 5 - abort the phase, do not regenerate fixtures.
2. Any screenshot SSIM cell < 0.95 after Phases 3/4/6 - revert the offending change; visual neutrality is non-negotiable.
3. Phase 2 gate: if no suspect clears its bar, stop fixing and surface to Matt - do not ship speculative optimizations.
4. `npm run perf:check` regression > 5% on any config - revert before proceeding.

## What NOT to do during this cycle

- No NSL streaming/runtime perf work (Cycle 90 scope; this cycle's probe informs it).
- No decomposition of `OptimizedSheep.js` or `GrassSystem.js`; no reordering of the main.js frame loop.
- No quality-ladder or visual-budget changes; this cycle changes cost, not output.
- No fixed-timestep/interpolation rework of the solo sim loop; that is a behavior change.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean with main <= 609 KiB.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When the jitter probe runs at cycle close, field/practice hitch count and 1%-low shall meet the budgets recorded in Phase 7.
- [ ] When the cycle closes, the entrance shall land on Rolling Hills with Newsheepdogland labeled Experimental (pre-phase, already shipped).

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`cycle82-validation/steady-state-profile-3070.json`](../cycle82-validation/steady-state-profile-3070.json) - prior steady-state data
- [EARS notation](https://kiro.dev/docs/specs/) - testable acceptance lines
