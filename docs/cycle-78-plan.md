# Cycle 78 — webgpu-nsl-count-collapse

> Drafted 2026-06-08 after Cycle 77 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **This is a STUB.** Fill in Goal + Phases at `/cycle-start`. Cycle 77 proved the newsheepdogland cold WebGPU load is ~80s of pipeline compilation dominated by the COUNT (~950 distinct per-chunk shaders), not per-pipeline cost, and that the storage fix does NOT collapse that count. It is **likely PAIRED** (flagship grass + tree instancing, a Three WebGPU backend interaction, and a flagship-UX risk call). **Decide the fork with Matt before writing code** - this is the 5th cycle on this pin; the honest options include pivoting off it.

## Goal

One paragraph. The user-visible before/after. The carried-in fork (pick ONE with Matt at `/cycle-start`):

- **Path B - count-collapse, then a clean lift (the real fix):** make all per-chunk grass + tree InstancedMeshes share ONE render pipeline so Dawn compiles ~6 shaders, not ~950, bringing the cold WebGPU load toward WebGL's ~2.2s. Two candidate mechanisms: (1) the device-dependent attribute-path instancing (count > `maxUniformBufferBindingSize/64`) gated behind a runtime device-limit probe so it cannot re-trip the Cycle 71 TDR crash on a device with a larger uniform limit; (2) a shared instance buffer / manual batching across chunks. Must preserve the per-chunk culling and the exact visuals (hard stop 2). Then re-apply the validated skip-render race fix and lift the pin (`shared/scenes/newsheepdogland.js`, remove `renderer: 'webgl'`). Evidence: `cycle77-validation/README.md`.
- **Path A - race-tolerant lift (cheaper, riskier):** ship ONLY the validated skip-render race fix is the wrong framing here (it shifts the compile into a ~81s blank load). The actual Path A is to keep the keep-alive render (scene interactive at ~16s at ~91fps), accept the `Buffer used in submit while destroyed` validation warnings (no crash observed), and lift. This is a risk call on undefined-behavior-on-some-drivers for the scene 100% of players load - Matt's call, not autonomous.
- **Pivot - the deferred `feel-and-media-live` LIVE items (paired, Matt's hands):** survival feel LIVE retune, two-dog co-op fun playtest, entrance hero FINAL blessing. After 5 measure-first cycles on the pin with no player-visible change, this is a legitimate place to step.

## Open questions to resolve before writing code

1. **Q1: Path A, B, or pivot?** Author lean: Path B is the only clean lift, but it is real paired engineering on frozen-cohesive instancing; if the count-collapse looks expensive, Path A (accept the race) or the pivot may be the better use of a cycle. Decide with Matt.
2. **Q2 (Path B): attribute-path-behind-a-device-probe, or shared-instance-buffer/batching?** Author lean: the shared instance buffer is device-independent and the safer target; the attribute path is simpler but device-dependent (the Cycle 76 hazard). Spike both cheaply (`tools/`) and pick with numbers before authoring phases.
3. **Q3 (Path B): does collapsing to a shared buffer preserve per-chunk frustum culling?** Author lean: per-chunk culling is the whole reason the scene is chunked; a shared pipeline must not lose it. This is the load-bearing design constraint.

## Phase shape rules

A cycle has ≤ 8 phases, each fully autonomous OR fully paired, single sharp goal, ≤ 4 hours. This cycle's render-internals + flagship work is likely paired; scope accordingly.

## Phase 1 — <name> (~Xhr)

**Independently testable.** <Why this phase comes first.>

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.

## Dependencies

```
Phase 1 → Phase 2 → ...
```

## Frozen files (cycle-specific additions)

- `shared/scenes/newsheepdogland.js` — the pin lift removes `renderer: 'webgl'`; authorized ONLY if a within-budget + crash-clean + error-free cold load is verified on the 3070 (hard stop 1).
- `js/world/TreePlacement.js` + `js/GrassSystem.js` — the count-collapse touches per-chunk instancing. GrassSystem is frozen-cohesive (scene-and-render rules); a count-collapse is a real design change, not decomposition, but respect the rule and keep the look identical (hard stop 2).
- `js/main.js` `runFrame()` — the validated skip-render race fix lives in the `_sceneRebuilding` branch.

## Hard stops

Durable hard stops apply on every cycle — see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. Do not remove the newsheepdogland WebGL pin unless a within-budget AND crash-clean AND error-free WebGPU cold load is verified on the RTX 3070 (the COUNT-collapsed compile is genuinely fast, no `Buffer used while destroyed`, no `NodeBuilder` error, across ≥ 5 runs). Cycle 77 proved the ~80s compile is the real wall; the storage fix alone does not clear it.
2. Do not degrade grass or tree visual quality, or lose per-chunk frustum culling, to cut compile cost without Matt's explicit sign-off.
3. Do not touch `shared/` sim files. Render-path cycle; sim-baselines stay byte-identical (editing a scene def's `renderer:` field is scene-data, not sim).

## What NOT to do during this cycle

- Don't re-apply the storage fix expecting it to fix the budget — Cycle 77 proved it does not collapse the count.
- Don't use the device-dependent attribute path WITHOUT a runtime `maxUniformBufferBindingSize` probe — Cycle 76 showed it can re-trip the TDR crash on a device with a larger uniform limit.
- Don't re-measure the compile cost from scratch (Cycle 77 found it: ~80s, count-dominated) or re-attempt the attract prewarm (Cycle 75 refuted it).

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] If the newsheepdogland pin is lifted, then a crash-clean, error-free, within-budget WebGPU cold load shall be verified on the RTX 3070 across ≥ 5 runs before the close commit (hard stop 1).

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/archive/cycles/cycle-77-plan.md`](archive/cycles/cycle-77-plan.md) — the cycle that found the ~80s count-dominated compile + the validated race fix
- `cycle77-validation/README.md` — the correction, the two validated one-liners (race fix + storage flag), and the lift fork
- `js/world/TreePlacement.js` (`createNativeTreeInstancedMeshes`) + `js/GrassSystem.js` (`createChunk`) — the per-chunk InstancedMesh sites
- `node_modules/three/src/nodes/accessors/InstanceNode.js` — the uniform-vs-storage-vs-attribute instancing decision
