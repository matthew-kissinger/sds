# Cycle 79 — webgpu-everywhere

> Drafted 2026-06-08 (scaffolded from the Cycle 78 fork decision). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Fork resolved.** Cycle 78's carried-in A/B fork (finish-the-lift vs pivot-to-player-facing) is decided: Matt chose WebGPU-everywhere ("we need webgpu working for all things"). This cycle finishes the lift via mesh-count consolidation, measure-first.
>
> **P1 SPIKE COMPLETE (2026-06-08) - see `## P1 spike outcome` below.** The mechanism is proven and reaches WebGL budget, but the original `InstancedMesh2` premise is refuted (WebGL-only) and chunk-coarsening alone cannot hit budget at full quality (the tree impostor LOD is the wall). The clean lift needs GPU per-instance culling. Pin stays. A Path 1/2/3 fork is open for Matt before the next architecture lands.

## Goal

The newsheepdogland flagship is the lone scene pinned to WebGL because its grass and trees are built as ~1,158 per-chunk `THREE.InstancedMesh` objects, and on the WebGPU node path each one emits its own pipeline (unique `NodeBuffer_<nodeId>` uniform-buffer name) and its own GPU resource set. That is ~1,034 distinct pipelines (76s of compile) plus a per-mesh resource-creation build block. Cycle 78 proved a padding hack collapses the pipeline count to 16 but leaves a residual ~9s build block, so the pin stayed. This cycle removes the root cause instead of the symptom: consolidate the per-chunk grass and trees onto GPU-culled single-mesh instancing (`InstancedMesh2` from `@three.ez/instanced-mesh`, already a project instancing dependency), so each material is one pipeline and one resource set, with per-instance frustum culling and LOD done on the mesh itself. The user-visible payoff: newsheepdogland loads on WebGPU within budget, the WebGL pin lifts, and the WebGPU-only Hosek-Wilkie sky and water reflections (dark on the WebGL fallback) turn on for the flagship. Measure-first: Phase 1 proves the consolidation clears the budget on the RTX 3070 before Phases 2-3 do the full port.

## P1 spike outcome (2026-06-08) - mechanism proven, trees are the wall, pin stays

Full evidence + the per-config table: `cycle79-validation/README.md`. Probe (committed):
`tools/webgpu-grass-consolidation-probe-cycle79.mjs`. All `js/` + `shared/` edits reverted
byte-identical; prod unchanged; 1135 tests pass; lint clean.

- **`InstancedMesh2` is refuted for WebGPU** (v0.3.15 is WebGL-only: `WebGLRenderer` ctor, `onBeforeCompile` + GLSL chunks, `GLInstancedBufferAttribute`, zero WebGPU refs). The project's konveyor adapter already falls back to stock `THREE.InstancedMesh` on WebGPU. The lever is **mesh count**, material-agnostic.
- **Consolidation works and reaches budget.** Coarsening grass + tree chunks (holding density) cut the cold worst main-thread long-task from **52,796 ms (1062 pipelines, 16.3 MB WGSL) to 581 ms at 57 meshes (45 pipelines, 0.37 MB)** - dead even with WebGL's 548 ms, 144 fps, stable faster than WebGL, 0 crashes / 0 errors. No padding (Cycle 78's residual block is gone).
- **The worst block is GPU resource-creation, ~8 ms/mesh, not compile.** `worst ms ~= 108 + 8.3 x meshCount`. Budget (~550 ms) needs ~55 total meshes.
- **The tree impostor LOD is the binding wall.** Grass coarsens fps-free to ~30 meshes. Trees are quality-safe only to ~scale 2 (320 m, mobile's granularity) = ~123 meshes = ~1.9 s; the per-chunk near/impostor LOD swap breaks at the coarseness budget would require (960 m chunks). Full tree consolidation (~20 meshes) hits budget but loses per-chunk culling AND the hybrid LOD - both inherently per-chunk.
- **Pin stays.** Best full-quality config (grass3 + tree2) is ~1.9 s on the 3070, which is ~3-4 s on a weak/integrated GPU = real TDR risk. The conservative "near WebGL" gate is correct (hardware-portable); 1.9-s-on-a-3070 is not. Hard stop 1 unmet at quality.

### The fork for Matt (decide before the next architecture lands)

1. **Path 1 (recommended, the optimal): GPU compute-driven per-instance culling + LOD.** TSL `instancedArray`/`storage` + `renderer.compute()` frustum-cull into a compacted buffer + one indirect draw per material. One grass mesh + one mesh per tree-type-LOD (budget mesh count) with FINE per-instance cull + LOD (full quality). The WebGPU-native equivalent of what `InstancedMesh2` does on WebGL; future-proofs grass too. A real, multi-day build touching cohesive GrassSystem + the tree hybrid runtime - wants the go-ahead before it lands.
2. **Path 2 (accept-and-lift): ship grass + tree-scale-2 consolidation (~1.6-1.9 s on the 3070), accept the weak-GPU TDR risk, lift now.** Fast, but compromises the conservative safety bar - a product/risk call that is Matt's.
3. **Path 3: keep the pin, revisit later.** 7th cycle, no player-visible change.

Phases 1-6 below are the pre-spike plan, retained for reference. **The forward plan carrying all of these recommendations (the 3-path fork + the compute-culling build phases + the Path 2 tier-gated interim + the supporting phases) is now [`docs/cycle-80-plan.md`](cycle-80-plan.md).** Decide Q1 there with Matt, then `/cycle-close` Cycle 79 + `/cycle-start` Cycle 80.

## Open questions to resolve before writing code

1. **Q1 (spike): does `InstancedMesh2` clear the budget?** Hypothesis: one consolidated grass mesh + per-tree-type consolidated trees give one pipeline each, no padding, GPU per-instance culling, and a worst main-thread long-task near WebGL's 491 ms (not Cycle 78's residual ~9s). Phase 1 measures this behind a flag and is a hard go/no-go. If it fails the gate, reassess (BatchedMesh, or compute-cull + indirect draw) with Matt before committing to the port.
2. **Q2: does `InstancedMesh2` wrap the custom grass node material + per-instance culling?** GrassSystem uses a custom node material (per-blade wind, the oriented-rounded-rect interaction SDF, stochastic density-LOD dither). The spike must confirm IM2's per-instance frustum/LOD path coexists with that material on WebGPU and the look stays pixel-identical (hard stop 2).
3. **Q3: grass alone, or grass + trees?** Cycle 78: collapsing grass alone cut compile ~86s -> ~16s; trees added only ~0.6s of compile but are 413 separate resource sets feeding the build block. Confirm in Phase 1 whether grass-alone clears the budget or whether the tree consolidation (Phase 3) is required to get under it.
4. **Q4: per-chunk culling parity.** Today each grass chunk is frustum-culled as a unit (`frustumCulled = false` + manual per-chunk cull + density-LOD count steps). IM2 replaces that with per-instance GPU culling. Confirm frame time at flagship grass density is at least as good as the per-chunk path (hard stop 2 - this is the flagship's grass).

## Phase shape rules

A cycle has <= 8 phases, each fully autonomous OR fully paired, single sharp goal, <= 4 hours. Phases 2-5 are flagship grass/tree tuning + a real-device perf and taste call = paired. Phases 1 (a throwaway measurement spike) and 6 (a regression probe) are autonomous; their go/no-go and look sign-off happen at the phase boundary with Matt, not mid-phase.

## Phase 1 — InstancedMesh2 grass spike (AUTONOMOUS, ~3hr)

**Independently testable.** The whole cycle hinges on one primitive (GPU-culled consolidated instancing). Spike it behind a flag and pick the path with numbers before porting (the "spike risky primitives first" discipline). Build one `InstancedMesh2` grass field for newsheepdogland behind a runtime flag, wired to the existing grass node material. Measure on the 3070, cold, vs the 745-chunk baseline: distinct WebGPU pipelines, worst main-thread long-task, time-to-stable-fps, steady-state frame time. Reuse the Cycle 78 probes (`tools/webgpu-count-collapse-probe-cycle78.mjs`, `tools/webgpu-budget-compare-cycle78.mjs`).

**Acceptance (EARS):**

- When the IM2 grass flag is on, then the cold-load distinct WebGPU pipeline count for grass shall be 1 (not ~745).
- When the budget probe runs the IM2 grass path cold on the 3070, then the worst main-thread long-task shall be reported against WebGL's 491 ms baseline as a go/no-go number.
- When the spike completes, then a one-paragraph go/no-go verdict (and, if no-go, the next primitive to try) shall be written to `cycle79-validation/README.md`.
- While the IM2 flag is on, the grass shall render pixel-identical to the per-chunk path (side-by-side capture in `cycle79-validation/`).

## Phase 2 — Port GrassSystem onto consolidated GPU-culled instancing (PAIRED, ~4hr)

**Gated on Phase 1 go.** Replace GrassSystem's per-chunk `THREE.InstancedMesh` creation with the consolidated `InstancedMesh2` path proven in Phase 1, keeping GrassSystem one cohesive system (not decomposed - scene-and-render rule). Preserve per-blade wind, the interaction SDF, and density-LOD; move per-chunk frustum culling to IM2 per-instance culling. Hold the look pixel-identical (hard stop 2).

**Acceptance (EARS):**

- When Phase 2 ships, then newsheepdogland grass shall be built as consolidated GPU-culled instancing with no per-chunk `THREE.InstancedMesh`.
- When grass renders after the port, then wind, interaction flattening, and distance density-LOD shall match the pre-port look (side-by-side capture).
- While the camera moves across the flagship, then grass outside the frustum shall be culled per-instance with frame time at least as good as the per-chunk baseline at flagship density.
- When `npm test` runs, then all vitest specs shall pass (no sim-baseline change - grass is render-only).

## Phase 3 — Consolidate the native trees (PAIRED, ~3hr)

**Gated on Q3.** If Phase 1 shows grass-alone does not clear the budget (the 413 tree meshes feed the build block), consolidate the konveyor native-instancing tree path (`TreePlacement.createNativeTreeInstancedMeshes`) onto the same GPU-culled instancing, one mesh per tree type. Preserve the impostor/LOD crossfade and the per-tree far-impostor (distance-from-origin) decision.

**Acceptance (EARS):**

- When Phase 3 ships, then the native tree path shall build one consolidated GPU-culled mesh per tree type, not one `THREE.InstancedMesh` per chunk.
- When trees render after the port, then the LOD0/impostor crossfade and far-tree billboard look shall match the pre-port capture.
- If Phase 1 showed grass-alone clears the budget, then Phase 3 may be deferred to BACKLOG carryover with that measurement recorded.

## Phase 4 — Re-apply the race fix + hard-stop-1 gate on the 3070 (PAIRED, ~2hr)

**Gated on Phases 2-3.** Re-apply the validated Cycle 77 skip-render swap-disposal race fix in `js/main.js` `runFrame()`'s `_sceneRebuilding` branch. Run the cold-load budget gate on the 3070 across >= 5 runs.

**Acceptance (EARS):**

- When a scene swap into newsheepdogland runs on WebGPU, then the keep-alive render shall be skipped while `_sceneRebuilding` (no `Buffer used while destroyed`).
- When newsheepdogland cold-loads on WebGPU across >= 5 runs on the 3070, then the worst main-thread long-task shall be within budget (near WebGL's ~491 ms), with 0 `bufferDestroyed` and 0 `NodeBuilder` errors (hard stop 1).
- If any of the >= 5 runs exceeds budget or errors, then the pin shall stay and the cycle shall report the failing number (do not lift on a partial pass).

## Phase 5 — Lift the pin + turn on the WebGPU beauty (PAIRED, ~2hr)

**Gated on Phase 4 pass.** Remove `renderer: 'webgl'` from `shared/scenes/newsheepdogland.js`. Confirm the WebGPU-only Hosek-Wilkie sky + water render correctly on the flagship (Cycle 73 found them dark on the WebGL fallback). Capture the flagship hero. Mobile WebGPU check is flagged for Matt's hands (separate, not gating).

**Acceptance (EARS):**

- When Phase 5 ships and hard stop 1 passed, then `shared/scenes/newsheepdogland.js` shall not pin `renderer: 'webgl'`.
- When newsheepdogland loads on WebGPU, then the Hosek-Wilkie sky and water reflections shall render (not dark), confirmed by capture in `cycle79-validation/`.
- When the lift lands, then a flagship hero capture shall be saved to `cycle79-validation/`.

## Phase 6 — Pipeline-count regression guard (AUTONOMOUS, ~1.5hr)

Add a probe/test that fails if any scene cold-loads more than a threshold of WebGPU pipelines, so the many-small-meshes regression cannot silently return.

**Acceptance (EARS):**

- When the regression guard runs against newsheepdogland post-lift, then it shall assert the distinct-pipeline count is below a recorded threshold and fail if exceeded.
- When `npm test` runs, then the guard shall be wired in (or documented as a manual probe in `cycle79-validation/` if it cannot run headless).

## Dependencies

```
Phase 1 (spike, go/no-go)
  -> Phase 2 (grass port)
  -> Phase 3 (tree consolidation, gated on Q3)
  -> Phase 4 (race fix + gate)
  -> Phase 5 (lift + beauty)
Phase 6 (regression guard) can land any time after Phase 1.
```

## Frozen files (cycle-specific additions)

- `js/GrassSystem.js` — Phase 2 swaps per-chunk `THREE.InstancedMesh` for consolidated GPU-culled instancing. GrassSystem stays one cohesive system (not decomposed - scene-and-render rule); keep the look pixel-identical and culling intact (hard stop 2). Migration: the per-chunk cull + density-LOD move to IM2 per-instance culling; consumers are GrassSystem-internal (no external API change to `generateChunks`/`applyLOD` callers beyond what stays behind the class).
- `js/world/TreePlacement.js` — Phase 3 consolidates `createNativeTreeInstancedMeshes` onto one GPU-culled mesh per tree type. Migration: preserve the impostor/LOD crossfade + far-impostor (distance-from-origin) decision; consumer is the scene tree-placement caller.
- `shared/scenes/newsheepdogland.js` — Phase 5 removes `renderer: 'webgl'`. Authorized ONLY on a met hard stop 1 (within-budget + crash-clean + error-free cold load on the 3070 across >= 5 runs). Scene-data edit, not a sim change.
- `js/main.js` `runFrame()` — Phase 4 re-applies the validated Cycle 77 skip-render race fix in the `_sceneRebuilding` branch.

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific (carried from Cycles 72-78):

1. Do not remove the newsheepdogland WebGL pin unless a within-budget AND crash-clean AND error-free WebGPU cold load is verified on the RTX 3070 across >= 5 runs (worst main-thread long-task near WebGL's ~491 ms, 0 `Buffer used while destroyed`, 0 `NodeBuilder` errors).
2. Do not degrade grass/tree visual quality or lose per-instance frustum culling to clear the budget without Matt's explicit sign-off. The per-chunk -> per-instance culling swap is exactly this kind of call; validate frame time at flagship density.
3. Do not touch `shared/` sim files (render-path cycle; sim-baselines stay byte-identical - editing a scene def's `renderer` field is scene-data, not sim).

## What NOT to do during this cycle

- Don't ship the Cycle 78 padded attribute-path collapse - it trades 70s of compile for a ~9s padding/build block. Consolidated GPU-culled instancing avoids both.
- Don't re-apply the storage fix or the uniform-capacity-only fix (both refuted; the per-mesh buffer NAME is the driver).
- Don't decompose `GrassSystem` or `OptimizedSheep` (scene-and-render rule). The port swaps the instancing primitive inside GrassSystem; it stays one cohesive system.
- Don't start Phase 2 before Phase 1's go/no-go number is in hand. If Phase 1 is a no-go, stop and reassess the primitive with Matt.
- Don't auto-bump the version or post a devlog. Player-visible release is Matt's call.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] If the newsheepdogland pin is lifted, then a crash-clean, error-free, within-budget WebGPU cold load shall be verified on the RTX 3070 across >= 5 runs before the close commit (hard stop 1).
- [ ] If the pin is lifted, then the WebGPU-only Hosek-Wilkie sky + water shall be confirmed rendering on the flagship (not dark).

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/archive/cycles/cycle-78-plan.md`](archive/cycles/cycle-78-plan.md) — proved the attribute-path collapse + found the residual build block
- `cycle78-validation/README.md` — root cause (per-mesh uniform-buffer name), the budget table, the consolidation next step
- `tools/webgpu-count-collapse-probe-cycle78.mjs` + `tools/webgpu-budget-compare-cycle78.mjs` — the probes (reuse for Phase 1)
- `node_modules/three/src/nodes/accessors/InstanceNode.js` — the uniform-vs-attribute instancing decision
- `@three.ez/instanced-mesh` — the GPU-culled instancing primitive (already a project dependency; used in `js/world/TreePlacement.js`, `RockPlacement.js`, `konveyorNativeInstancingAdapter.js`)
