# Cycle 77 - webgpu-nsl-pin-lift

> Drafted 2026-06-08 after Cycle 76 closed. Authored + run autonomously (Matt: "complete and deploy autonomously"). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Outcome (2026-06-08): pin STAYS (5th cycle); the storage fix was over-credited; real blocker is the pipeline COUNT

Measure-first re-scope (the Cycle 72/74/75/76 pattern). The two Cycle 76 blockers are tractable - the swap-disposal race has a validated one-line fix (skip the keep-alive render on WebGPU: `bufferDestroyed` 22 -> 0), and the NodeBuilder ShaderMaterial error did not reproduce (0 across ~10 loads; the scene walk shows 0 ShaderMaterial instanced meshes). But the deeper measurement overturns Cycle 76's headline: the TOTAL cold WebGPU compile is **~80s, not ~16s**. Cycle 76's "84s -> 16s storage win" measured time-to-renderable (the rendererReady wall), not the total compile - the keep-alive render makes the scene look ready at ~16s while ~60-80s of pipeline compilation continues underneath (`compileAsyncMs` 62-81s; Cycle 76's own Dawn-boundary probe: 86.6s / 968 pipelines). The storage fix does NOT collapse the ~950 per-chunk pipeline count, so it does not bring the load within budget; the COUNT, not per-pipeline cost, is the driver. Hard stop 1's within-budget gate is unmet -> pin stays. No `js/` or `shared/` change ships (prod byte-identical; committed change is docs + one probe tool). The real fix is a count-collapse (one shared pipeline across chunks: the device-dependent attribute path behind a uniform-limit probe, or a shared instance buffer / batching) - paired/deeper, touches grass+tree instancing (hard stop 2). Full writeup + the two validated one-liners: `cycle77-validation/README.md`. DECISIONS.md Cycle 77 entry.

## Goal

Cycle 76 proved the ~76-84s newsheepdogland cold WebGPU load is ~950 distinct DXIL shaders from stock Three r184 per-chunk uniform-array instancing (grass-dominant), and that a one-line storage-buffer instancing fix (`instanceMatrix.isStorageInstancedBufferAttribute = true`, gated to node materials) cuts it to ~16s device-independently, visuals + culling unchanged. Two blockers kept the pin: (1) a PRE-EXISTING swap-disposal race (`Buffer used in submit while destroyed`, 5x on the unmodified path), and (2) an intermittent `NodeBuilder: ShaderMaterial not compatible` with the fix. This cycle resolves both, re-applies the storage fix, verifies a crash-clean, error-free, within-budget cold load on the RTX 3070, then lifts the pin (remove `renderer: 'webgl'` from `shared/scenes/newsheepdogland.js`) - which unblocks the flagship's WebGPU Hosek sky + water (the Cycle 73 marketing payoff). Hard stop 1 gates the lift: if either blocker proves intractable in budget, the honest fallback is a spike-re-scope (pin stays, blockers' state documented + handed to the next cycle), close + deploy docs. Either outcome ships safely - the pin only lifts on a verified-clean gate.

## Open questions - resolved (author leans adopted; autonomous run)

1. **Q1: Is the `Buffer used in submit while destroyed` race fixable in the nsl WebGPU teardown, or is it upstream in three.webgpu?** Lean adopted: it is a scene-swap disposal ordering issue (a buffer disposed while a render command referencing it is still in flight). Investigate the swap/dispose path against the WebGPU backend frame lifecycle; fix the ordering (defer dispose past the in-flight frame / flush the queue before teardown) rather than patching three.
2. **Q2: Which mesh is transiently a `ShaderMaterial` during a swap?** Lean adopted: tighten the gate so the storage flag is only ever set on a settled konveyor node material (`isNodeMaterial === true && !isShaderMaterial`), or move the flag set to after material assignment settles.
3. **Q3: Is ~16s "within budget" to lift the pin, or is a count-collapse needed first?** Lean adopted: ~16s crash-free + error-free is a defensible lift. The pin's purpose was the CRASH (Cycle 71 TDR), not the load time; a deeper count-collapse toward WebGL's ~2.2s is optional polish, not a lift gate.

## Phase shape rules

A cycle has <= 8 phases, each fully autonomous OR fully paired, single sharp goal, <= 4 hours. This entire cycle runs AUTONOMOUS per Matt's directive; hard stop 1 gates the only player-facing change (the pin lift).

## Phase 1 - Reproduce + characterize both blockers on the 3070 (~1hr)

**Independently testable.** Re-establish the Cycle 76 probe baseline before changing anything, so the before/after is honest. Instrument the swap teardown to capture which buffer is destroyed-while-in-flight and which mesh is the transient ShaderMaterial.

**Acceptance (EARS):**

- When Phase 1 runs the unmodified nsl WebGPU cold load on the 3070, then the probe shall report the `Buffer used in submit while destroyed` occurrence count (baseline confirmation).
- When Phase 1 runs the storage-fix variant, then the probe shall capture the call context of the `NodeBuilder: ShaderMaterial not compatible` error (which mesh, which swap phase).

## Phase 2 - Resolve the swap-disposal race (~3hr)

**Independently testable.** The pre-existing `Buffer used in submit while destroyed` blocks a clean lift regardless of the compile fix. Find the dispose-ordering issue in the scene-swap teardown against the WebGPU backend frame lifecycle.

**Acceptance (EARS):**

- When Phase 2 ships and a cold nsl WebGPU load + swap runs on the 3070, then the probe shall log zero `Buffer used in submit while destroyed` errors across >= 5 runs.
- If the race is upstream in three.webgpu and not fixable in our swap code within budget, then Phase 2 shall document the exact upstream cause and the cycle shall fall back to spike-re-scope (pin stays).

## Phase 3 - Re-apply storage fix + resolve the NodeBuilder error (~2hr)

**Independently testable.** Re-apply the gated storage flag in `TreePlacement.js` + `GrassSystem.js`, then eliminate the intermittent `NodeBuilder: ShaderMaterial not compatible` by tightening the gate or fixing material-assignment ordering.

**Acceptance (EARS):**

- When Phase 3 ships, then `js/world/TreePlacement.js` and `js/GrassSystem.js` shall set `isStorageInstancedBufferAttribute = true` only on settled node materials.
- When Phase 3 runs >= 5 cold nsl WebGPU loads on the 3070, then the probe shall log zero `NodeBuilder` errors.
- When Phase 3 ships, then the cold nsl WebGPU load shall remain within budget (~16s, the storage-fix floor) and FPS shall hold >= 60 after load.

## Phase 4 - Hard-stop gate verification on the 3070 (~1hr)

**Independently testable, measure-first.** The hard-stop gate: a within-budget AND crash-clean AND error-free cold load, verified repeatedly (the errors are racy, so one clean run is insufficient).

**Acceptance (EARS):**

- When Phase 4 runs >= 5 cold nsl WebGPU loads on the 3070, then every run shall be crash-clean, log zero `Buffer used while destroyed` and zero `NodeBuilder` errors, and complete within ~16s.
- If any run fails the gate, then the pin shall NOT lift and the cycle shall spike-re-scope.

## Phase 5 - Lift-or-rescope decision + ship the render change (~1hr)

**Independently testable.** Gated on Phase 4. If the gate passes: lift the pin and confirm the flagship's WebGPU sky + water render and the grass/trees are visually unchanged. If not: revert to byte-identical, document the blockers' residual state.

**Acceptance (EARS):**

- If Phase 4's gate passed, then `shared/scenes/newsheepdogland.js` shall remove `renderer: 'webgl'` and a 3070 screenshot shall confirm the Hosek sky + water present and grass/trees unchanged.
- If Phase 4's gate failed, then `js/` + `shared/` shall be byte-identical to the Cycle 76 baseline and the residual blocker state shall be documented in `cycle77-validation/README.md`.

## Phase 6 - Close + deploy (~0.5hr)

**Acceptance (EARS):**

- When Phase 6 runs `/validate`, then `npm test` + `npm run build` + `npm run lint` shall pass.
- When the close commit lands on `main`, then sheepdogsim.com deploy shall succeed via GH Actions.

## Dependencies

```
Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5 -> Phase 6
```

The race fix (P2) and the storage fix (P3) both touch the swap path and must both be clean for the P4 gate; sequential keeps the gate honest.

## Frozen files (cycle-specific additions)

- `shared/scenes/newsheepdogland.js` - the pin lift removes `renderer: 'webgl'`; authorized ONLY if the Phase 4 gate (hard stop 1) is met.
- `js/world/TreePlacement.js` + `js/GrassSystem.js` - the storage flag re-application; both are deliberate render design (scene-and-render rules). GrassSystem is frozen-cohesive: a one-line instance-buffer flag is not decomposition, but respect the rule.
- The scene-swap/dispose path (`js/main.js` + scene manager) - the race fix; a teardown-ordering change, not a wire/sim change.

## Hard stops

Durable hard stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. Do not remove the newsheepdogland WebGL pin unless a within-budget AND crash-clean AND error-free WebGPU cold load is verified on the RTX 3070 (build + compile per-step, no `Buffer used while destroyed`, no `NodeBuilder` error, across >= 5 runs). Cycle 76 cut the compile to ~16s; the remaining gate is the two errors.
2. Do not degrade grass or tree visual quality to cut compile cost without Matt's explicit sign-off. The storage fix is visually identical by construction (same matrices); any deeper count-collapse must preserve the look.
3. Do not touch `shared/` sim files. Render-path cycle; sim-baselines stay byte-identical. (The pin lives in a scene def, not a sim file - editing `renderer:` is a scene-data change, not a sim change.)

## What NOT to do during this cycle

- Don't re-attempt the attract prewarm (Cycle 75 refuted it) or re-measure the compile cost from scratch (Cycle 76 found it: grass-dominant per-chunk uniform-array instancing).
- Don't apply a survival feel retune autonomously (the other deferred thread; Matt's hands).
- Don't use the device-dependent attribute-path (capacity-pad) fix to lift the pin - Cycle 76 showed it can re-trip the TDR crash on a device with a larger uniform limit. Storage is the device-independent path.
- Don't lift the pin on a single clean run. The errors are racy; the gate is >= 5 clean cold loads.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] If the newsheepdogland pin is lifted, then a crash-clean, error-free, within-budget WebGPU cold load shall be verified on the RTX 3070 across >= 5 runs before the close commit (hard stop 1).
- [ ] If the pin is NOT lifted, then `js/` + `shared/` shall be byte-identical to the Cycle 76 baseline and the residual blocker state documented.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/archive/cycles/cycle-76-plan.md`](archive/cycles/cycle-76-plan.md) - the cycle that found the root cause + validated the fix
- `cycle76-validation/README.md` - the root cause, the validated storage fix (the exact one-liner), and the two blockers
- `js/world/TreePlacement.js` (`createNativeTreeInstancedMeshes`) + `js/GrassSystem.js` (`createChunk`) - the per-chunk InstancedMesh sites
- `node_modules/three/src/nodes/accessors/InstanceNode.js` - the uniform-vs-storage instancing decision
