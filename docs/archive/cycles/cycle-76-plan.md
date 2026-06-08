# Cycle 76 - webgpu-tree-build-cost

> Drafted 2026-06-08 after Cycle 75 closed. Authored at `/cycle-start` 2026-06-08 (Matt: "for webgpu tree build cost and complete and deploy after completing cycle 76"). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Mode: autonomous, measure-first.** Matt authorized completing + deploying this cycle autonomously. The hard stop on tree visual quality (below) is NOT waived: any fix that would degrade the flagship's tree look stops and surfaces to Matt. A quality-preserving cost cut (sharing/merging pipelines, precompile, suppressing redundant work) is autonomous; a cheaper-but-uglier tree is not.

## Outcome (2026-06-08): root cause found + fix validated (84s -> 16s), but pin STAYS

Run autonomously (Matt: "for webgpu tree build cost and complete and deploy after completing cycle 76"). Measure-first; the spike led to a re-scope of the honest result (the Cycle 72/75 pattern), here with the deepest finding of the 5-cycle WebGPU arc.

- **P1 (DONE) found the real root cause and corrected BOTH prior cycles.** The ~76-84s cold load is ~950 DISTINCT DXIL shaders from stock Three r184 instancing: each small per-chunk `InstancedMesh` (under 1024 instances) bakes its instance count into a `var<uniform> array<mat4x4,N>` shader, so every chunk compiles a unique program. The dominant cost is the **~745 GRASS chunks**, not trees (~205) - Cycle 75's "tree build" was mis-attributed (grass pipelines compile lazily during the tree-build window). Cycle 74's "shared compile" was also wrong (there is no shared pipeline). Evidence: three `tools/webgpu-*-cycle76.mjs` probes + `cycle76-validation/README.md`.
- **P2 (DONE) validated a fix: storage-buffer instancing.** `instanceMatrix.isStorageInstancedBufferAttribute = true` (gated to node materials) routes Three to a runtime-sized `var<storage> array<mat4x4>` (no baked count, device-independent), cutting the cold load **84s -> 16s** at 80-89fps, visuals + culling unchanged.
- **P3 (DECIDED) pin STAYS; fix NOT shipped.** A safe lift needs the nsl WebGPU path clean; it is not: (1) a PRE-EXISTING swap-disposal race (`Buffer used in submit while destroyed`, 5x on the unmodified path - not caused by the fix) and (2) an intermittent `NodeBuilder: ShaderMaterial not compatible` with the fix. Both block a crash-clean lift (hard stop 1). The flag could not even ship dormant: it would be active on the small non-pinned WebGPU scenes that do not need it, carrying the intermittent error. So `js/` + `shared/` revert to byte-identical; prod unchanged. The fix direction + the two blockers are scoped for a PAIRED next cycle (see `cycle76-validation/README.md` + DECISIONS.md).

## Goal

Cycle 75 measured that a first newsheepdogland WebGPU load is dominated by a ~76s "Creating trees" build step (building ~400 native tree node-material InstancedMeshes via `js/world/TreePlacement.js#createNativeTreeInstancedMeshes`), that the cost is GPU pipeline-compile work (suppressing the partial renders moved it to one `compileAsync`, it did not remove it), and that it does NOT cache across builds on Dawn (nsl built twice: 76.4s, 75.4s). WebGL builds the whole scene in ~2.2s. This ~35x WebGPU tree-build penalty is the sole blocker keeping the newsheepdogland WebGL pin in place. This cycle cuts that cost enough that newsheepdogland loads within budget on WebGPU, which lets the pin lift and unblocks the flagship's WebGPU Hosek sky + water (the Cycle 73 marketing payoff). The user-visible before/after, IF the fix lands within budget: newsheepdogland renders on WebGPU with its real dusk sky and reflective sea instead of the WebGL fallback (dark dome + dark sea). If the measurement shows the cost cannot be cut without degrading tree quality, the honest outcome is the pin stays and the fix is scoped for a paired cycle - same spike-re-scope discipline as Cycles 72/75.

## Open questions to resolve before writing the fix (Phase 1 answers these)

1. **Q1: Is the 76s many near-duplicate pipelines, or a few catastrophically-expensive shaders?** Author lean: unknown until measured. `createNativeTreeInstancedMeshes` builds one `THREE.InstancedMesh` per (tree type x spatial chunk x meshDef). Materials are shared from the GLB cache, but the impostor geometry is created fresh per chunk, and the chunk count on a 3.2km^2 island at chunkSize 160 may be large. If the GPU boundary shows hundreds of distinct pipeline compiles, the fix is to cut the distinct-pipeline count (quality-preserving). If it shows a handful of multi-second compiles, the fix is compile cost (simplify or precompile). Phase 1 decides with numbers.
2. **Q2: Why do the tree pipelines not cache across builds on Dawn?** Author lean: the Three.js WebGPU backend assigns a pipeline cache key from the material + geometry; if a rebuild creates new material/geometry objects (new impostor geometry per chunk; possibly new node-material instances), the cache key changes and Dawn re-compiles. Phase 1 captures shader-module identity across two builds to confirm.
3. **Q3: Does suppressing the per-frame render during `_sceneRebuilding` help once combined with a pipeline-count cut?** Cycle 75 found suppression alone just moves the cost to `compileAsync`. Only relevant if Phase 2 cuts the count first. Decide after Phase 1.

## Phase shape rules

A cycle has <= 8 phases, each fully autonomous OR fully paired, single sharp goal, <= 4 hours. Phase 1 is a measure-first spike (per `feedback_spike_risky_primitives`): the fix representation (cut count vs cut compile vs precompile) must be founded on numbers before authoring the fix phases. Phases 2+ are refined in this doc once Phase 1 reports.

## Phase 1 - measurement spike: where do the 76s go? (~2hr) [autonomous]

**Independently testable.** This comes first because the fix shape is unknown: the same 76s could be hundreds of cheap pipelines or a few expensive ones, and the fixes are opposite. No fix code is written until this reports.

Build `tools/webgpu-tree-pipeline-probe-cycle76.mjs`: a headed-GPU probe (system Chrome + d3d11, the Cycle 74/75 recipe) that wraps `GPUDevice.createShaderModule` + `createRenderPipeline` + `createRenderPipelineAsync` (and the compute variants) via `addInitScript`, counting calls, timing each, and fingerprinting the WGSL, scoped to the newsheepdogland "Creating trees" window (hook `_reportLoadStep`). It reports: distinct-pipeline count, total + max per-pipeline compile time, shader-module count + distinct-WGSL count, and whether shader modules repeat across two consecutive nsl builds (the cache question). Needs the WebGL pin temporarily lifted (restore byte-identical after).

**Acceptance (EARS):**

- When Phase 1 runs, then `tools/webgpu-tree-pipeline-probe-cycle76.mjs` shall report the distinct-pipeline count and the total pipeline-compile time for the newsheepdogland tree build on the RTX 3070, written to `cycle76-validation/`.
- When Phase 1 completes, then `cycle76-validation/README.md` shall state whether the 76s is dominated by pipeline COUNT or per-pipeline COST, with the numbers that decide it.
- If the spike temporarily lifts the newsheepdogland WebGL pin, then `git diff -- shared/scenes/newsheepdogland.js` shall show no change after the spike (restored byte-identical).

## Phase 2 - the fix (shape decided by Phase 1) (~3hr) [autonomous if quality-preserving]

**Refined after Phase 1.** Placeholder until the spike reports. Expected shapes:

- **If pipeline COUNT dominates:** share one material/geometry-layout across the per-chunk InstancedMeshes of a given (tree type, LOD) so Three emits one pipeline per LOD instead of one per chunk; or coarsen `chunkSize` so there are fewer chunks. Both are quality-preserving (same instances, same materials, same positions; only the draw-group granularity changes - a culling tradeoff, not a visual one). Verify frustum culling still holds.
- **If per-pipeline COST dominates:** evaluate precompiling the tree node-material pipelines at build time / caching the WGSL, or reducing node-material complexity. A node-material simplification that changes the tree look STOPS and surfaces to Matt (hard stop 2).

**Acceptance (EARS):** authored after Phase 1.

## Phase 3 - verify cold load within budget + pin decision (~1.5hr) [autonomous]

**Re-measure the cold WebGPU load** (build + compile, per-step) on the RTX 3070 after the fix. The gate is the full first-pick wall time, not the compile tail (Cycle 75's lesson). Budget target: newsheepdogland cold WebGPU load within ~3x the other WebGPU scenes (the light scenes build in ~5s), i.e. on the order of WebGL's seconds, not 76s.

**Acceptance (EARS):**

- If the post-fix newsheepdogland cold WebGPU load is within budget on the RTX 3070 AND tree visuals are unchanged, then the `renderer: 'webgl'` pin shall be removed from `shared/scenes/newsheepdogland.js` and the lift verified by a cold load that does not crash and renders the WebGPU sky + water.
- If the post-fix cold load is still over budget, then the pin shall stay and `cycle76-validation/README.md` shall record the residual cost and the scoped next step.
- When Phase 3 completes, then `DECISIONS.md` shall record the pin decision (lifted or stays) with the measured numbers.

## Phase 4 - validate + close + deploy (~1hr) [autonomous]

**Acceptance (EARS):**

- When Phase 4 runs `/validate`, then `npm test`, `npm run build`, and `npm run lint` shall all pass and the bundle ratchet shall hold.
- When Phase 4 closes the cycle, then the plan shall be archived, `BACKLOG.md` appended, cycle 77 scaffolded, and `NEXT_SESSION.md` + memory refreshed.
- When the close commit lands on `main`, then sheepdogsim.com deploy shall succeed via GH Actions.

## Dependencies

```
Phase 1 (measure) -> Phase 2 (fix) -> Phase 3 (verify + pin) -> Phase 4 (close + deploy)
```

Strictly sequential. Phase 2's shape is gated on Phase 1's numbers; Phase 3's pin decision is gated on Phase 2's result.

## Frozen files (cycle-specific additions)

- The konveyor tree node-material system + `js/world/TreePlacement.js` are deliberate render design (see `.claude/rules/scene-and-render.md` + DECISIONS.md). A change here needs an explicit migration story in this plan and respects hard stop 2 (no visual-quality degradation without Matt's sign-off). A pipeline-count cut that preserves the rendered result (same materials, same instances) is within the autonomous envelope; a node-material rewrite that changes the look is not.
- A pin lift edits only `shared/scenes/newsheepdogland.js` (remove `renderer: 'webgl'`); `prewarmShaders` already exists and stays.

## Hard stops

Durable hard stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. Do not remove the newsheepdogland WebGL pin unless a within-budget WebGPU cold LOAD (build + compile, not just the compile tail) is verified on the RTX 3070. Cycle 75 showed the build, not the compile, is the wall - so the gate is the full first-pick wall time, measured per-step.
2. Do not degrade the flagship's tree visual quality to cut compile cost without Matt's explicit sign-off. The trees are the scene's centerpiece; cheaper-but-uglier is a taste call, not an autonomous one. A quality-preserving cost cut is autonomous; a look change is not.
3. Do not touch `shared/` sim files. Render-path cycle; sim-baselines stay byte-identical.
4. Restore any temp measurement edit (pin lift, debug flags) byte-identical before close; prod stays byte-identical unless Phase 3 lifts the pin as a deliberate shipped change.

## What NOT to do during this cycle

- Don't re-attempt the attract prewarm as a way to lift the pin - Cycle 75 refuted it (the cost is per-build, not warmable).
- Don't apply a survival feel retune autonomously (the other deferred thread; Matt's hands).
- Don't decompose `GrassSystem` / `OptimizedSheep`. No version bump without Matt's call.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When Phase 1 completes, the spike shall have reported whether the 76s is pipeline COUNT or per-pipeline COST, with numbers, in `cycle76-validation/README.md`.
- [ ] When Phase 3 completes, the pin decision (lifted or stays) shall be recorded in `DECISIONS.md` with the measured post-fix cold-load numbers.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] If the newsheepdogland pin is lifted, then a cold WebGPU load shall be verified crash-free within budget on the RTX 3070 before the close commit (hard stop 1).

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/archive/cycles/cycle-75-plan.md`](archive/cycles/cycle-75-plan.md) - the cycle that scoped this
- `cycle75-validation/README.md` - the tree-build measurement + the reframe
- `js/world/TreePlacement.js` - `createNativeTreeInstancedMeshes` (the native WebGPU path) + `placeTrees`
- `.claude/rules/scene-and-render.md` - far-tree impostor + node-material design rules
