# Next Session - Cycle 80 webgpu-flagship-lift (decided Path 1; re-confirm at /cycle-start, then execute)

> **Updated:** 2026-06-08
> **For:** Cycle 80 `webgpu-flagship-lift`. Plan: [`docs/cycle-80-plan.md`](docs/cycle-80-plan.md). Built on the Cycle 79 P1 spike (record: [`docs/archive/cycles/cycle-79-plan.md`](docs/archive/cycles/cycle-79-plan.md) `## P1 spike outcome` + `cycle79-validation/README.md`).
> **Pickup priority:** Lift the newsheepdogland WebGL pin so the flagship loads on WebGPU within a hardware-portable budget, then turn on the WebGPU-only Hosek-Wilkie sky + water. Cycle 79 proved mesh-count consolidation reaches WebGL budget (581 ms at 57 meshes) but the tree impostor LOD caps chunk-coarsening at ~1.9 s (weak-GPU TDR risk). Q1 is DECIDED: **Path 1 - GPU compute-driven per-instance culling + LOD** (one grass mesh + one mesh per tree-type-LOD, budget mesh count at full quality on all hardware), with **Path 2 tier-gated chunk-coarsening** as the sanctioned faster interim. Re-confirm at `/cycle-start` (Matt may ship Path 2 first), then start at Phase 1 (the compute primitive spike).

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-80-plan.md`](docs/cycle-80-plan.md) -> `cycle79-validation/README.md` (the evidence) -> the touched module source. Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 79 (`webgpu-everywhere`) P1 spike is CLOSED (2026-06-08).** Autonomous, measure-first. No `js/` / `shared/` change; prod byte-identical. Full evidence: `cycle79-validation/README.md` + the BACKLOG entry.

- **`InstancedMesh2` is refuted for WebGPU** (WebGL-only lib). The lever is mesh count on the stock-`THREE.InstancedMesh` node path, material-agnostic. nsl is coastline (no far-ring meadow LOD) = 744 grass + 413 tree per-chunk meshes.
- **Consolidation reaches budget.** Coarsening chunks (hold density, zero padding) cut the cold worst long-task 52,796 ms -> 581 ms at 57 meshes (WebGL is 548 ms), 144 fps, 0 errors. The block is GPU resource-creation, ~8 ms/mesh (`~= 108 + 8.3 x meshCount`); budget needs ~55 meshes.
- **The wall is the tree impostor LOD.** Grass coarsens fps-free to ~30 meshes; trees are quality-safe only to ~123 meshes (~1.9 s) because the per-chunk near/impostor LOD swap breaks at coarser chunks. Decoupling mesh count from per-instance cull/LOD = GPU compute culling (Path 1). Pin STAYS until budget is met at full quality (1.9 s on a 3070 is TDR risk on weak GPUs).

Validation: `npm test` 1135 pass / 8 skip; `npm run build` clean. Bundle 600.54 / 618.78 kB == baseline.

## What To Pick Up Next

**Re-confirm Q1, then execute Cycle 80 per [`docs/cycle-80-plan.md`](docs/cycle-80-plan.md).** Decided direction: Path 1 (compute-culling). Phase ladder: `1 (compute primitive spike, go/no-go) -> 2 (grass one-mesh + GPU cull/LOD) -> 3 (trees consolidated + per-instance hybrid LOD) -> 4 (race fix + hard-stop-1 gate, >=5 cold runs) -> 5 (lift + Hosek sky/water + hero) -> 6 (pipeline-count regression guard) -> 7 (mobile validation)`. Phase 1 is the spike-risky-primitive-first step: prove TSL `renderer.compute()` frustum-cull + indirect draw drives the konveyor grass NodeMaterial on r184 BEFORE the full port. Alternative: ship the Path 2 tier-gated interim (track A1 -> A2 -> 4 -> 5) first for a faster visible win on med/high GPUs.

What did NOT work (don't retry): `InstancedMesh2` (WebGL-only), chunk-coarsening to true budget (breaks the tree impostor LOD), the Cycle 78 padded attribute path (~9s block), the storage / uniform-capacity fixes (Cycles 76-78 refuted).

## Open Carryover (deferred)

- The Cycle 80 lift itself (Path 1 build, or Path 2 interim).
- Mobile WebGPU validation (Cycle 80 Phase 7; needs a real device, Matt's hands).
- The deferred player-visible `feel-and-media-live` thread (survival-feel retune, two-dog co-op playtest, entrance hero blessing).
- Prior open carryover: tablet draw-call perf.

## Working Contract

- No `shared/` sim change unless the cycle explicitly scopes one with the four-piece migration story; sim-baselines stay byte-identical. Editing newsheepdogland's `renderer`/`grass` fields is scene-data, not sim.
- Don't remove (or tier-lift) the newsheepdogland WebGL pin unless a within-budget AND crash-clean AND error-free WebGPU cold load is verified on the RTX 3070 across >= 5 runs (worst long-task near WebGL's ~548 ms). Hard stop 1, carried from Cycles 72-79.
- Don't reach for `InstancedMesh2` (WebGL-only) or coarsen tree chunks past ~scale 2 to chase budget (breaks the impostor LOD). Use per-instance GPU cull/LOD (Path 1).
- Don't degrade grass/tree visual quality or lose per-instance frustum culling without Matt's sign-off (hard stop 2). Don't decompose `GrassSystem` / `OptimizedSheep`. No version bump without Matt's call.
- Agent-launched Vite must set `SDS_SUPPRESS_BROWSER_OPEN=1`; close every Playwright page/browser and stop the dev server after a probe.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-80-plan.md`](docs/cycle-80-plan.md) |
| The Cycle 79 spike evidence (mesh-count lever, 8 ms/mesh, the tree-impostor wall, per-config table) | `cycle79-validation/README.md` |
| The consolidation probe (reuse for Phase 1) | `tools/webgpu-grass-consolidation-probe-cycle79.mjs` |
| TSL compute / `renderer.compute()` / `instancedArray` patterns (Path 1) | `C:\Users\Mattm\.claude\skills\webgpu-threejs-tsl\docs\compute-shaders.md` |
| The grass + native-tree mesh sites (consolidation targets) | [`js/GrassSystem.js`](js/GrassSystem.js) (`createChunk`/`generateChunks`/`applyLOD`) + [`js/world/TreePlacement.js`](js/world/TreePlacement.js) (`createNativeTreeInstancedMeshes`) |
| Three's uniform-vs-attribute instancing decision | `node_modules/three/src/nodes/accessors/InstanceNode.js` |
| The swap-disposal race fix (re-apply in Phase 4) | [`js/main.js`](js/main.js) `runFrame()` `_sceneRebuilding` branch (Cycle 77) |
| The WebGL pin (lift target) | [`shared/scenes/newsheepdogland.js`](shared/scenes/newsheepdogland.js) (`renderer: 'webgl'`) |
| WebGPU-only beauty (turn on at lift) | `js/atmosphere/HosekWilkieSky.js`, water reflections (dark on the WebGL fallback - Cycle 73) |
| Latest closed cycle | [`docs/archive/cycles/cycle-79-plan.md`](docs/archive/cycles/cycle-79-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
