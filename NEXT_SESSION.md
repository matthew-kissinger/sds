# Next Session - Cycle 82 feel-and-media-live (Phase 1 + 2 flagship-stability SHIPPED + committed, pending deploy)

> **Updated:** 2026-06-08
> **For:** Cycle 82 `feel-and-media-live`. Plan: [`docs/cycle-82-plan.md`](docs/cycle-82-plan.md). Phase 1 + 2 (flagship-stability fixes) are code-complete, verified live on the 3070, and committed; Phase 3+ (`feel-and-media-live`) is the open thread.
> **Pickup priority:** Phase 1 (house-in-water + QualityGovernor WebGPU/WebGL split + transient quality-floor + grass warmup) and Phase 2 (newsheepdogland grass was fully invisible on WebGPU, a distance-fade shader bug, now fixed) are test-green, verified live on desktop WebGPU, and committed to `main` locally. Next is the deploy call, then the Phase 4 production steady-state profile and the Phase 3 feel-and-media-live work.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-82-plan.md`](docs/cycle-82-plan.md) (fill it in) -> [`DECISIONS.md`](DECISIONS.md) (the Cycle 81 lift decision). Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 81 (`webgpu-flagship-ship`) is CLOSED + SHIPPED LIVE (2026-06-08).** The newsheepdogland WebGL pin is lifted on desktop WebGPU; mobile keeps it. Commit `7c8e74c`, deploy run 27161107853 green, live site healthy.

- GPU compute-cull collapses the flagship's grass + trees to 8 InstancedMeshes (grass index-remap pixel-identical, trees data-compaction material-agnostic); cold load 506 ms on the 3070 (under WebGL's 548 ms), 0 errors, 144 fps. Production-path hard-stop-1 gate passed across 6 runs.
- Tier-gated by a shared `isMobileClient()`: desktop loads WebGPU (with the Hosek sky + water that were dark on the WebGL fallback), mobile keeps WebGL byte-identical. The scene def keeps `renderer:'webgl'`.
- Mobile: the connected tablet (Galaxy Tab S9 FE, Mali-G68) has no `navigator.gpu`, so mobile is WebGL regardless; the pin is retained for any future WebGPU-capable mobile.

Validation: `npm test` 1135 pass / 8 skip; `npm run build` clean; bundle baseline 591 KB.

## What To Pick Up Next

**Cycle 82 Phase 1 + Phase 2 (flagship-stability) are SHIPPED + verified live + committed, pending deploy.** Four live newsheepdogland regressions are fixed: Phase 1 (house-in-water, the WebGPU/WebGL load split, the transient quality-floor + grass thinning) and Phase 2 (grass fully invisible on WebGPU - the blade distance-fade keyed off the world origin instead of the camera, so the ~1.2km-out play area fell entirely past `grassFadeEnd`; fixed by using `positionView`/`positionWorld` like every sibling konveyor material). See [`docs/cycle-82-plan.md`](docs/cycle-82-plan.md) Phases 1-2 for root causes, fixes, and live proof. `npm test` 1142 pass / 8 skip (exit 0); `npm run build` clean within the 591/604 KB bundle baseline.

Next:

- Deploy. Phases 1-2 are committed to `main` locally but not pushed; production still runs the old code until pushed (a push to `main` triggers the GH Actions deploy). Get Matt's go-ahead first.
- Phase 4 (measure-first): production-build, foreground, >=5-run steady-state p95/p99 on the 3070 to confirm the flagship sustains qualityIndex 0 (resolves Q1).
- Phase 3 `feel-and-media-live`: survival-feel retune, two-dog co-op playtest, entrance hero blessing (player-visible, taste/paired).
- OR mobile WebGPU validation if a WebGPU-capable mobile device comes on hand (this cycle's tablet had none).

## Open Carryover (deferred)

- Mobile WebGPU validation on a WebGPU-capable device (Cycle 81's tablet exposed no `navigator.gpu`).
- The deferred player-visible `feel-and-media-live` thread (survival-feel retune, two-dog co-op playtest, entrance hero blessing).
- Prior open carryover: tablet draw-call perf.

## Working Contract

- No `shared/` sim change unless the cycle scopes one with the four-piece migration story; sim-baselines stay byte-identical.
- The flagship now renders on WebGPU on desktop (the compute-cull path). Don't regress the mesh consolidation: the guard `tools/webgpu-flagship-lift-gate-cycle81.mjs` (`GUARD=1`) asserts <= 30 render pipelines + <= 12 InstancedMeshes. Grass stays pixel-identical, trees lod0. Don't decompose `GrassSystem` / `OptimizedSheep`.
- Mobile keeps the WebGL pin until a real WebGPU-capable mobile device validates a within-budget flagship cold-load.
- Agent-launched Vite must set `SDS_SUPPRESS_BROWSER_OPEN=1`; close every Playwright page/browser and stop the dev server (and remove any `adb forward`/`adb reverse`) after a probe.
- No version bump without Matt's call. Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-82-plan.md`](docs/cycle-82-plan.md) (scaffold) |
| The Cycle 81 lift (mechanism, numbers, exact edits) | `cycle81-validation/README.md` + [`DECISIONS.md`](DECISIONS.md) Cycle 81 entry |
| The compute-cull modules | [`js/world/grassComputeCull.js`](js/world/grassComputeCull.js), [`js/world/treeComputeCull.js`](js/world/treeComputeCull.js), [`js/world/konveyorWebGpuModules.js`](js/world/konveyorWebGpuModules.js) |
| The tier-gate | [`js/utils/isMobileClient.js`](js/utils/isMobileClient.js) + [`js/main.js`](js/main.js) boot gate + swap guard + [`js/SceneManager.js`](js/SceneManager.js) |
| The regression guard / gate probe | `tools/webgpu-flagship-lift-gate-cycle81.mjs` |
| Latest closed cycle | [`docs/archive/cycles/cycle-81-plan.md`](docs/archive/cycles/cycle-81-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
