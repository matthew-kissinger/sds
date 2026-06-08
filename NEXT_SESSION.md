# Next Session - Cycle 82 feel-and-media-live (scaffold - needs Goal + phases)

> **Updated:** 2026-06-08
> **For:** Cycle 82 `feel-and-media-live`. Plan: [`docs/cycle-82-plan.md`](docs/cycle-82-plan.md) - SCAFFOLD ONLY (Goal + phases not yet filled). Built after Cycle 81 SHIPPED the flagship WebGPU lift.
> **Pickup priority:** The 7-cycle WebGPU pin saga is DONE - the flagship lifted live on desktop WebGPU (Cycle 81). The next cycle is an open choice; the standing deferred thread is the player-visible `feel-and-media-live` work. Fill in the Goal + phases at `/cycle-start`, or repoint to a different direction.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-82-plan.md`](docs/cycle-82-plan.md) (fill it in) -> [`DECISIONS.md`](DECISIONS.md) (the Cycle 81 lift decision). Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 81 (`webgpu-flagship-ship`) is CLOSED + SHIPPED LIVE (2026-06-08).** The newsheepdogland WebGL pin is lifted on desktop WebGPU; mobile keeps it. Commit `7c8e74c`, deploy run 27161107853 green, live site healthy.

- GPU compute-cull collapses the flagship's grass + trees to 8 InstancedMeshes (grass index-remap pixel-identical, trees data-compaction material-agnostic); cold load 506 ms on the 3070 (under WebGL's 548 ms), 0 errors, 144 fps. Production-path hard-stop-1 gate passed across 6 runs.
- Tier-gated by a shared `isMobileClient()`: desktop loads WebGPU (with the Hosek sky + water that were dark on the WebGL fallback), mobile keeps WebGL byte-identical. The scene def keeps `renderer:'webgl'`.
- Mobile: the connected tablet (Galaxy Tab S9 FE, Mali-G68) has no `navigator.gpu`, so mobile is WebGL regardless; the pin is retained for any future WebGPU-capable mobile.

Validation: `npm test` 1135 pass / 8 skip; `npm run build` clean; bundle baseline 591 KB.

## What To Pick Up Next

**Cycle 82 is a SCAFFOLD.** Fill in `docs/cycle-82-plan.md`'s Goal + phases, then `/cycle-start`. The WebGPU-pin epic is closed, so the next direction is a real choice:

- The standing deferred `feel-and-media-live` thread: survival-feel retune, two-dog co-op playtest, entrance hero blessing (player-visible, taste/paired).
- OR mobile WebGPU validation if a WebGPU-capable mobile device comes on hand (this cycle's tablet had none).
- OR a different direction Matt names.

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
