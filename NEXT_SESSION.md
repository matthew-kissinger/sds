# Next Session - Cycle 81 webgpu-flagship-ship (ship the proven lift, tier-gated)

> **Updated:** 2026-06-08
> **For:** Cycle 81 `webgpu-flagship-ship`. Plan: [`docs/cycle-81-plan.md`](docs/cycle-81-plan.md). Built on Cycle 80, which SOLVED the pin blocker (proof: [`docs/archive/cycles/cycle-80-plan.md`](docs/archive/cycles/cycle-80-plan.md) `## Outcome` + `cycle80-validation/README.md`).
> **Pickup priority:** Turn Cycle 80's proof into the live flagship. GPU compute-driven per-instance culling cold-loads newsheepdogland on WebGPU in 581 ms (at WebGL's 548 ms bar) at full quality, 8 meshes, 144 fps, 0 errors - the 7-cycle blocker is solved. This cycle rebuilds the compute-cull as clean un-flag-gated production code, tier-gates the WebGL pin (desktop loads WebGPU, mobile keeps WebGL byte-identical), turns on the WebGPU-only Hosek sky + water, and validates mobile on a real device. Start at Phase 1 (rebuild as production code).

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-81-plan.md`](docs/cycle-81-plan.md) -> `cycle80-validation/README.md` (the proof + the EXACT scoped edits) -> the touched module source. Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 80 (`webgpu-flagship-lift`) is CLOSED (2026-06-08). The pin blocker is SOLVED on WebGPU at full quality.** Autonomous, measure-first. No `js/` / `shared/` change ships; prod byte-identical. Full evidence: `cycle80-validation/README.md` + the BACKLOG entry.

- **The primitive works on r184 (Q2 GO):** TSL `renderer.compute()` frustum-cull + one `drawIndexedIndirect` drives a node material. `IndirectStorageBufferAttribute` + `geometry.setIndirect()` + `atomicAdd` compaction slot + `StorageInstancedBufferAttribute`-as-`instanceMatrix` (InstanceNode storage path). No fallback primitive needed.
- **Grass 744 -> 1 mesh pixel-identical** (index-remap into the konveyor blade material, transform fold = T*R*S). **Trees 410 -> 4 meshes material-agnostic** (data-compaction storage `instanceMatrix`; the default WebGPU tree path is lod0-only, so the Cycle 79 impostor-LOD wall does not apply).
- **Cold load 52,796 ms -> 581 ms** (driver-cache-cleared cold), 6-run gate: 552-581 ms x4, ~840 ms warm-spike x2 (sub-1s), 0 errors / 0 crashes, 144 fps, 8 total meshes, 27 render + 10 compute pipelines, WGSL 16.3 -> 0.29 MB. Cycle 77 race fix already in place.

Validation: `npm test` 1135 pass / 8 skip; `npm run build` clean; bundle == baseline.

## What To Pick Up Next

**Execute Cycle 81 per [`docs/cycle-81-plan.md`](docs/cycle-81-plan.md).** The mechanism is proven; this is productionization + the reviewed live flip. Phase ladder: `1 (rebuild compute-cull as clean un-flag-gated prod code) -> 2 (tier-gate the boot + swap pin guards: desktop lifts, mobile keeps WebGL) -> 3 (re-run the >=5-run gate on the PRODUCTION boot path, not spike flags) -> 4 (turn on the Hosek sky + water + hero) -> 5 (mobile WebGPU real-device check) -> 6 (regression guard wired)`. The exact scoped edits are in `cycle80-validation/README.md` ("The scoped lift").

Why Cycle 80 stopped short of the flip: it is a player-visible flagship release on a new GPU render path (reviewed by the rules + the plan), needs the boot tier-gate, and mobile WebGPU is unvalidated. Cycle 80 reverted the spike implementation byte-identical (the bundle-size guard rejected the dormant +2.9 kB; the debug-flag spike was always going to be rewritten as production code).

What did NOT work (don't retry): `InstancedMesh2` (WebGL-only), chunk-coarsening to true budget (breaks the tree impostor LOD), the Cycle 78 padded attribute path, the storage / uniform-capacity fixes (Cycles 76-78 refuted). The answer is GPU compute per-instance culling (proven).

## Open Carryover (deferred)

- The Cycle 81 lift itself (rebuild prod + tier-gate + gate on prod path + beauty).
- Mobile WebGPU validation (Cycle 81 Phase 5; needs a real device, Matt's hands).
- The deferred player-visible `feel-and-media-live` thread (survival-feel retune, two-dog co-op playtest, entrance hero blessing).
- Prior open carryover: tablet draw-call perf.

## Working Contract

- No `shared/` sim change unless the cycle explicitly scopes one with the four-piece migration story; sim-baselines stay byte-identical. Editing the boot/swap pin guards is render-path, not sim.
- Don't lift (or tier-lift) the desktop pin unless the PRODUCTION-path cold load is within budget across >= 5 runs on the 3070, 0 `bufferDestroyed`, 0 `NodeBuilder`, 0 crashes (hard stop 1). Don't lift the MOBILE pin until the Phase 5 real-device check passes.
- Don't degrade grass/tree visual quality or lose per-instance frustum culling (hard stop 2). Grass stays pixel-identical; trees stay lod0. Don't decompose `GrassSystem` / `OptimizedSheep`. No version bump without Matt's call.
- Mind the bundle-size baseline guard (`tests/refactor-baseline/baseline.spec.ts`): the production compute-cull will grow main; bump the recorded baseline in the same commit with the reason.
- Agent-launched Vite must set `SDS_SUPPRESS_BROWSER_OPEN=1`; close every Playwright page/browser and stop the dev server after a probe.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-81-plan.md`](docs/cycle-81-plan.md) |
| The Cycle 80 proof (mechanism, numbers, the EXACT scoped lift edits) | `cycle80-validation/README.md` |
| The probe / regression guard | `tools/webgpu-grass-compute-cull-probe-cycle80.mjs` |
| TSL compute / `renderer.compute()` / `instancedArray` patterns | `C:\Users\Mattm\.claude\skills\webgpu-threejs-tsl\docs\compute-shaders.md` |
| Grass + tree consolidation sites | [`js/GrassSystem.js`](js/GrassSystem.js) (`createGrassMaterial`/`generateChunks`/`createChunk`/`update`) + [`js/world/TreePlacement.js`](js/world/TreePlacement.js) (`createNativeTreeInstancedMeshes`) + [`js/world/konveyorGrassBladeNodeMaterial.js`](js/world/konveyorGrassBladeNodeMaterial.js) |
| THREE storage-instanceMatrix + indirect | `node_modules/three/src/nodes/accessors/InstanceNode.js` (`isStorageMatrix`) + `node_modules/three/src/renderers/common/IndirectStorageBufferAttribute.js` |
| The pin tier-gate sites | [`js/main.js`](js/main.js) boot gate (~3392) + swap guard (~938); sync mobile-UA mirror in `js/components/hooks/usePlatform.js` |
| The swap-disposal race fix (already in place) | [`js/main.js`](js/main.js) `runFrame()` `_sceneRebuilding` branch (Cycle 77) |
| The WebGL pin (keep; tier-gate in the guards) | [`shared/scenes/newsheepdogland.js`](shared/scenes/newsheepdogland.js) (`renderer: 'webgl'`) |
| WebGPU-only beauty (turn on at lift) | `js/atmosphere/HosekWilkieSky.js`, water reflections (dark on the WebGL fallback - Cycle 73) |
| Latest closed cycle | [`docs/archive/cycles/cycle-80-plan.md`](docs/archive/cycles/cycle-80-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
