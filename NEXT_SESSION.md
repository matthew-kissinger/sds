# Next Session - Cycle 79 nsl-lift-or-pivot (stub - needs the fork decided)

> **Updated:** 2026-06-08
> **For:** Cycle 79 `nsl-lift-or-pivot`. Plan: [`docs/cycle-79-plan.md`](docs/cycle-79-plan.md) (a STUB - pick the fork with Matt, then fill Goal + Phases).
> **Pickup priority:** Cycle 78 PROVED the newsheepdogland WebGPU pipeline-count collapse (the attribute path collapses 1034 -> 16 distinct shaders, cutting main-thread blocking from 76s to ~10s) but a residual ~9s synchronous build block - the forced grass-instance padding - keeps the cold load out of budget, so the pin stayed a 6th cycle. The clean lift is now ONE concrete paired step (a no-padding grass-chunk-size collapse + a perf validation, then re-apply the Cycle 77 race fix + lift). After 6 measure-first cycles on this pin with no player-visible change, the genuine fork is: (A) finish the lift, or (B) pivot to the deferred player-visible `feel-and-media-live` thread. Decide with Matt, then `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-79-plan.md`](docs/cycle-79-plan.md) -> the touched module source. Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 78 (`webgpu-nsl-count-collapse`) is CLOSED (2026-06-08).** Run autonomously (Matt: "complete cycle 78 autonomously and deploy then report back"), measure-first, Path B. No `js/` / `shared/` change; sim-baselines byte-identical; prod byte-identical.

- **Root cause nailed (corrects Cycle 76 + the cycle's own first hypothesis).** Each per-chunk WebGPU shader is distinct because of the instancing uniform buffer's NAME (`NodeBuffer_<nodeId>`, unique per `THREE.InstancedMesh`), not just the baked instance count. A uniform-`instanceMatrix`-capacity fix (count-only) did NOT collapse anything (1034 -> 1035 distinct WGSL, measured).
- **The attribute path collapses it.** Padding capacity past `maxUniformBufferBindingSize/64` (=1024 on the 3070) forces Three's vertex-attribute instancing path (layout-bound names, one shared shader): cold nsl distinct WGSL 1034 -> 294 (grass) -> 16 (grass+tree); WGSL bytes 16.2 MB -> 0.23 MB; main-thread blocking 76s -> ~10s (a 7.6x cut; the off run reproduces the pin's original 38s+31s freeze).
- **Pin STAYS.** A residual ~9s synchronous build block remains (present with only 16 pipelines, so not compile; it tracks the forced ~3.3x grass padding + per-mesh WebGPU resource creation). WebGL builds the same scene with a 491 ms worst block, stable in 3.8s. Hard stop 1's within-budget gate is unmet (a 9s freeze on the scene 100% of players load still risks TDR). Two probes committed (`tools/webgpu-count-collapse-probe-cycle78.mjs`, `tools/webgpu-budget-compare-cycle78.mjs`); evidence in `cycle78-validation/README.md` + [`DECISIONS.md`](DECISIONS.md).

Validation: `npm test` 1135 pass / 8 skip; `npm run lint` clean; `npm run build` clean. Bundle ratchet 600.54 / 618.78 kB == Cycle 76 baseline.

## What To Pick Up Next

Cycle 79 is a STUB. Decide the fork with Matt (do not do both), then `/cycle-start`:

1. **Path A - finish the lift (no-padding grass-chunk-size collapse, PAIRED):** raise newsheepdogland's grass `chunkSize` + `clumpsPerChunk` together (holding total density) so grass naturally exceeds 1024 instances/chunk -> the attribute path is taken with ZERO padding AND the chunk count drops (fewer per-mesh GPU buffers = smaller build block). Validate the culling-granularity-vs-draw-call frame-time tradeoff on the 3070 (hard stop 2 - flagship grass tuning), re-apply the Cycle 77 skip-render race fix, verify within-budget + crash-clean + error-free across >= 5 runs, then lift the pin. The collapse mechanism is proven; only the no-padding tuning + perf check remain. Evidence + the two probes: `cycle78-validation/README.md`.
2. **Path B - pivot to `feel-and-media-live` (player-visible, PAIRED, Matt's hands):** survival feel LIVE retune, two-dog co-op fun playtest, entrance hero FINAL blessing. After 6 measure-first cycles on the pin with no player-visible change, the player-facing thread that has been waiting. A legitimate place to step.

## Open Carryover (deferred)

- The Cycle 79 fork above (A finish-the-lift / B pivot).
- Prior open carryover: tablet draw-call perf.

## Working Contract

- No `shared/` sim change unless the cycle explicitly scopes one with the four-piece migration story; sim-baselines stay byte-identical otherwise.
- Don't remove the newsheepdogland WebGL pin unless a within-budget AND crash-clean AND error-free WebGPU cold load is verified on the RTX 3070 across >= 5 runs. Cycle 78 proved the pipeline collapse (1034 -> 16) but found a residual ~9s build block (the forced padding) that is the remaining wall; the no-padding bigger-chunk form clears it. The Cycle 72-78 hard stop carries forward.
- Don't re-apply the storage fix (Cycle 76/77 refuted) or the uniform-capacity-only fix (Cycle 78 refuted) expecting a collapse - only the attribute path collapses the count. Don't ship the PADDED attribute-path collapse (it trades 70s compile for a ~9s build block).
- Don't degrade grass/tree visual quality or lose per-chunk culling without Matt's sign-off (the coarser-chunk tradeoff is exactly this call). Don't decompose `GrassSystem` / `OptimizedSheep`. No version bump without Matt's call.
- Agent-launched Vite must set `SDS_SUPPRESS_BROWSER_OPEN=1`; close every Playwright page/browser and stop the dev server after a probe.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan (stub) | [`docs/cycle-79-plan.md`](docs/cycle-79-plan.md) |
| The proven attribute-path collapse + the residual ~9s build block + the budget table | `cycle78-validation/README.md` |
| The pipeline-count + budget probes | `tools/webgpu-count-collapse-probe-cycle78.mjs` + `tools/webgpu-budget-compare-cycle78.mjs` |
| The per-chunk InstancedMesh sites (collapse target) | [`js/GrassSystem.js`](js/GrassSystem.js) (`createChunk`) + [`js/world/TreePlacement.js`](js/world/TreePlacement.js) (`createNativeTreeInstancedMeshes`) |
| Three's uniform-vs-attribute instancing decision | `node_modules/three/src/nodes/accessors/InstanceNode.js` (`uniformBufferSize <= getUniformBufferLimit()`) |
| The swap-disposal race fix (re-apply on lift) | [`js/main.js`](js/main.js) `runFrame()` `_sceneRebuilding` branch (Cycle 77) |
| The WebGL pin (and why it stays) | [`shared/scenes/newsheepdogland.js`](shared/scenes/newsheepdogland.js) (`renderer: 'webgl'`) + [`DECISIONS.md`](DECISIONS.md) Cycle 78 entry |
| Latest closed cycle | [`docs/archive/cycles/cycle-78-plan.md`](docs/archive/cycles/cycle-78-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
