# Next Session - Cycle 77 webgpu-nsl-pin-lift (stub - needs authoring)

> **Updated:** 2026-06-08
> **For:** Cycle 77 `webgpu-nsl-pin-lift`. Plan: [`docs/cycle-77-plan.md`](docs/cycle-77-plan.md) (a STUB - pick the cycle focus and mode, then fill Goal + Phases).
> **Pickup priority:** Cycle 76 found the EXACT root cause of the ~76-84s newsheepdogland cold WebGPU load (stock Three r184 per-chunk uniform-array instancing, GRASS-dominant) and VALIDATED a one-line storage-instancing fix that cuts it to ~16s. The pin stayed only because of two remaining blockers (a pre-existing swap-disposal race + an intermittent NodeBuilder error). Cycle 77 resolves those two, re-applies the fix, verifies a crash-clean cold load on the 3070, and lifts the pin - which unblocks the flagship's WebGPU sky + water. Likely PAIRED. Decide focus + mode with Matt, then `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-77-plan.md`](docs/cycle-77-plan.md) -> the touched module source. Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 76 (`webgpu-tree-build-cost`) is CLOSED (2026-06-08).** Run autonomously (Matt: "for webgpu tree build cost and complete and deploy after completing cycle 76"). Measure-first; the spike re-scoped to its honest outcome with the deepest finding of the 5-cycle WebGPU arc. No `shared/` sim change; sim-baselines byte-identical.

- **The real root cause (corrects Cycle 74 AND 75).** A first newsheepdogland WebGPU load compiles ~950 DISTINCT DXIL shaders (~85ms each, ~76-84s). Stock Three r184 `InstanceNode` bakes a small `THREE.InstancedMesh`'s instance count into a `var<uniform> array<mat4x4,N>` shader (when `count*64 <= maxUniformBufferBindingSize`, count <= 1024). The scene builds hundreds of small per-chunk InstancedMeshes - ~745 GRASS chunks (dominant) + ~205 tree chunks - each baking its own count -> a unique shader per chunk. Cycle 75 mis-blamed "Creating trees" (grass pipelines compile lazily during the tree-build window); Cycle 74's "shared compile" was wrong (there are ~950 distinct ones).
- **The validated fix.** `instanceMatrix.isStorageInstancedBufferAttribute = true` (gated to node materials) routes Three to a runtime-sized `var<storage> array<mat4x4>` (no baked count, device-independent), cutting the cold load 84s -> 16s at 80-89fps, visuals + per-chunk culling unchanged.
- **Pin STAYS; nothing shipped to `js/`; prod byte-identical.** Two blockers keep the pin: (1) a PRE-EXISTING swap-disposal race (`Buffer used in submit while destroyed`, 5x on the UNMODIFIED path - not caused by the fix), and (2) an intermittent `NodeBuilder: ShaderMaterial not compatible` with the fix. Racy errors on a scene every player loads disqualify an autonomous lift. The flag could not ship even dormant (it would be active on the small non-pinned WebGPU scenes that do not need it). Recorded in [`DECISIONS.md`](DECISIONS.md) + `cycle76-validation/README.md`. Three probes committed (`tools/webgpu-*-cycle76.mjs`).

Validation: `npm test` 1135 pass / 8 skip; `npm run lint` clean; `npm run build` clean. Bundle ratchet 600.54 / 618.78 kB == Cycle 75 baseline.

## What To Pick Up Next

Cycle 77 is a STUB. Decide focus + mode with Matt (do not do both), then `/cycle-start`:

1. **webgpu-nsl-pin-lift (likely PAIRED, the path Cycle 76 validated):** resolve the pre-existing swap-disposal race + the intermittent ShaderMaterial error, re-apply the one-line storage-instancing fix (in `js/world/TreePlacement.js` + `js/GrassSystem.js`), verify a crash-clean within-budget cold load on the RTX 3070, then lift the pin (`shared/scenes/newsheepdogland.js`, remove `renderer: 'webgl'`). This unblocks the flagship's WebGPU Hosek sky + water. Evidence + the exact fix: `cycle76-validation/README.md`.
2. **feel-and-media-live LIVE items (paired, Matt's hands):** the survival feel LIVE retune, the two-dog co-op fun playtest, and the entrance hero FINAL blessing.

## Open Carryover (deferred)

- The two Cycle 77 candidate threads above.
- Prior open carryover: tablet draw-call perf.

## Working Contract

- No `shared/` sim change unless the cycle explicitly scopes one with the four-piece migration story; sim-baselines stay byte-identical otherwise.
- Don't remove the newsheepdogland WebGL pin unless a within-budget AND crash-clean AND error-free WebGPU cold load is verified on the RTX 3070 (Cycle 76 cut the compile to ~16s; the remaining gate is the swap-disposal race + the ShaderMaterial error). The Cycle 72-76 hard stop carries forward.
- Use the storage-instancing fix (device-independent), NOT the capacity-pad/attribute path (device-dependent - can re-trip the TDR crash on a device with a larger uniform limit).
- Don't re-measure the compile cost from scratch (Cycle 76 found it) or re-attempt the attract prewarm (Cycle 75 refuted it).
- Don't degrade grass/tree visual quality without Matt's sign-off. Don't decompose `GrassSystem` / `OptimizedSheep`. No version bump without Matt's call.
- Agent-launched Vite must set `SDS_SUPPRESS_BROWSER_OPEN=1`; close every Playwright page/browser and stop the dev server after a probe.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan (stub) | [`docs/cycle-77-plan.md`](docs/cycle-77-plan.md) |
| The root cause + validated storage fix + the two blockers | `cycle76-validation/README.md` + `tools/webgpu-*-cycle76.mjs` |
| The per-chunk InstancedMesh sites | [`js/world/TreePlacement.js`](js/world/TreePlacement.js) (`createNativeTreeInstancedMeshes`) + [`js/GrassSystem.js`](js/GrassSystem.js) (`createChunk`) |
| Three's uniform-vs-storage instancing decision | `node_modules/three/src/nodes/accessors/InstanceNode.js` |
| The WebGL pin (and why it stays) | [`shared/scenes/newsheepdogland.js`](shared/scenes/newsheepdogland.js) (`renderer: 'webgl'`) + [`DECISIONS.md`](DECISIONS.md) Cycle 76 entry |
| Latest closed cycle | [`docs/archive/cycles/cycle-76-plan.md`](docs/archive/cycles/cycle-76-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
