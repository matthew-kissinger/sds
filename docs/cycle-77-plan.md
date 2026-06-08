# Cycle 77 - webgpu-nsl-pin-lift

> Drafted 2026-06-08 after Cycle 76 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **This is a STUB.** Fill in Goal + Phases at `/cycle-start`. The primary carryover is the now-validated path to lifting the newsheepdogland WebGL pin (Cycle 76 found the exact root cause and a working fix). It is **likely PAIRED**: it touches the flagship's grass + trees and a Three WebGPU backend swap-lifecycle race. Decide mode with Matt before writing code. The still-deferred `feel-and-media-live` LIVE taste items are the other thread.

## Goal

One paragraph. The user-visible before/after. The carried-in primary thread:

- **webgpu-nsl-pin-lift (likely paired, the path Cycle 76 validated):** Cycle 76 proved the ~76-84s newsheepdogland cold WebGPU load is ~950 distinct DXIL shaders from stock Three r184 per-chunk uniform-array instancing (GRASS-dominant: ~745 grass chunks + ~205 tree chunks, each baking its instance count into the WGSL), and that a one-line storage-buffer instancing fix (`instanceMatrix.isStorageInstancedBufferAttribute = true`, gated to node materials) cuts it to ~16s device-independently, visuals + culling unchanged. Two blockers kept the pin in place: (1) a PRE-EXISTING swap-disposal race (`Buffer used in submit while destroyed`, 5x on the unmodified path) and (2) an intermittent `NodeBuilder: ShaderMaterial not compatible` with the fix. This cycle: resolve both, re-apply the storage fix, verify a crash-clean within-budget cold load on the RTX 3070, then lift the pin (remove `renderer: 'webgl'` from `shared/scenes/newsheepdogland.js`) - which unblocks the flagship's WebGPU Hosek sky + water (the Cycle 73 marketing payoff). Evidence base: `cycle76-validation/README.md` + the three `tools/webgpu-*-cycle76.mjs` probes + DECISIONS.md Cycle 76 entry. If a blocker proves intractable in budget, the honest fallback is the same spike-re-scope (pin stays, blocker scoped) - but Cycle 76 already de-risked the compile cost, so the remaining work is the two errors, not the ~76s.
- **feel-and-media-live (paired, Matt's hands):** the LIVE taste items carried since Cycle 73 - the survival feel LIVE retune, the two-dog co-op fun playtest, and the entrance hero FINAL blessing.

## Open questions to resolve before writing code

1. **Q1: Is the `Buffer used in submit while destroyed` race fixable in the nsl WebGPU teardown, or is it upstream in three.webgpu?** Author lean: it is a scene-swap disposal ordering issue (a buffer disposed while a render command referencing it is still in flight). Investigate the swap/dispose path in `js/main.js` + `SceneManager` against the WebGPU backend's frame lifecycle. Confirm it does not crash (Cycle 76 saw 80fps through it) before deciding whether it must be fixed for the lift or can be tolerated (it is "undefined behavior on some drivers", so probably must be fixed).
2. **Q2: Which mesh is transiently a `ShaderMaterial` during a swap (the intermittent NodeBuilder error with the storage flag)?** Author lean: tighten the gate or fix the material-assignment ordering so the storage flag is only ever set on a settled node material. Reproduce with `tools/webgpu-storagefix-verify-cycle76.mjs` (it appeared in ~1 of 2 runs).
3. **Q3: Is ~16s "within budget" to lift the pin, or is a count-collapse needed first?** Author lean: ~16s crash-free + error-free is a defensible lift (the pin's purpose is the crash, not the load time); a deeper count-collapse (shared instance buffer / batching, or the attribute path behind a device-limit probe) toward WebGL's ~2.2s is optional polish, not a lift gate. Decide with Matt.

## Phase shape rules

A cycle has <= 8 phases, each fully autonomous OR fully paired, single sharp goal, <= 4 hours. This cycle's render-internals + flagship work is likely paired; scope accordingly.

## Phase 1 - <name> (~Xhr)

**Independently testable.** <Why this phase comes first.>

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.

## Dependencies

```
Phase 1 -> Phase 2 -> ...
```

## Frozen files (cycle-specific additions)

- `shared/scenes/newsheepdogland.js` - the pin lift removes `renderer: 'webgl'`; needs the within-budget + crash-clean gate met first (hard stop 1).
- `js/world/TreePlacement.js` + `js/GrassSystem.js` - the storage flag re-application; both are deliberate render design (scene-and-render rules). GrassSystem is frozen-cohesive: a one-line instance-buffer flag is not decomposition, but respect the rule.

## Hard stops

Durable hard stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. Do not remove the newsheepdogland WebGL pin unless a within-budget AND crash-clean AND error-free WebGPU cold load is verified on the RTX 3070 (build + compile per-step, no `Buffer used while destroyed`, no `NodeBuilder` error). Cycle 76 cut the compile to ~16s; the remaining gate is the two errors.
2. Do not degrade grass or tree visual quality to cut compile cost without Matt's explicit sign-off. The storage fix is visually identical by construction (same matrices); any deeper count-collapse must preserve the look.
3. Do not touch `shared/` sim files. Render-path cycle; sim-baselines stay byte-identical.

## What NOT to do during this cycle

- Don't re-attempt the attract prewarm (Cycle 75 refuted it) or re-measure the compile cost from scratch (Cycle 76 found it: grass-dominant per-chunk uniform-array instancing).
- Don't apply a survival feel retune autonomously (the other deferred thread; Matt's hands).
- Don't use the device-dependent attribute-path (capacity-pad) fix to lift the pin - Cycle 76 showed it can re-trip the TDR crash on a device with a larger uniform limit. Storage is the device-independent path.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] If the newsheepdogland pin is lifted, then a crash-clean, error-free, within-budget WebGPU cold load shall be verified on the RTX 3070 before the close commit (hard stop 1).

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/archive/cycles/cycle-76-plan.md`](archive/cycles/cycle-76-plan.md) - the cycle that found the root cause + validated the fix
- `cycle76-validation/README.md` - the root cause, the validated storage fix (the exact one-liner), and the two blockers
- `js/world/TreePlacement.js` (`createNativeTreeInstancedMeshes`) + `js/GrassSystem.js` (`createChunk`) - the per-chunk InstancedMesh sites
- `node_modules/three/src/nodes/accessors/InstanceNode.js` - the uniform-vs-storage instancing decision
