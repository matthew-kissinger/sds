# Cycle 79 — nsl-lift-or-pivot

> Drafted 2026-06-08 after Cycle 78 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **This is a STUB.** Fill in Goal + Phases at `/cycle-start`. Cycle 78 PROVED the newsheepdogland WebGPU pipeline-count collapse (the attribute path: 1034 -> 16 distinct shaders, main-thread blocking 76s -> ~10s) but left a residual ~9s synchronous build block (the forced grass-instance padding) that keeps the load out of budget, so the pin stayed a 6th cycle. **Decide the fork with Matt before writing code** - after 6 measure-first cycles on this pin with no player-visible change, the honest options genuinely include stepping off it.

## Goal

One paragraph. The user-visible before/after. The carried-in fork (pick ONE with Matt at `/cycle-start`):

- **Path A - finish the lift (no-padding grass-chunk-size collapse):** Cycle 78 showed the attribute-path collapse works but its FORCED PADDING (grass real ~315/chunk padded past 1024) costs a ~9s build block. The no-padding form: raise newsheepdogland's grass `chunkSize` + `clumpsPerChunk` together (holding total density) so grass naturally exceeds 1024 instances/chunk -> the attribute path is taken with zero padding AND the chunk COUNT drops (fewer per-mesh GPU buffers = smaller build block). Validate the culling-granularity-vs-draw-call frame-time tradeoff on the 3070 (hard stop 2 - this is flagship grass tuning), re-apply the Cycle 77 skip-render race fix, verify a within-budget + crash-clean + error-free cold load across >= 5 runs, then lift the pin (`shared/scenes/newsheepdogland.js`). This is real paired engineering on the flagship's grass. Evidence: `cycle78-validation/README.md`.
- **Path B - pivot to `feel-and-media-live` (player-visible, paired):** survival feel LIVE retune, two-dog co-op fun playtest, entrance hero FINAL blessing. After 6 cycles on the pin with no player-visible change, this is the player-facing thread that has been waiting the whole time. Matt's hands + taste.

## Open questions to resolve before writing code

1. **Q1: Path A or Path B?** Author lean: genuinely Matt's call. Path A is now a SINGLE concrete step (the collapse mechanism is proven; only the no-padding grass-chunk tuning + a perf validation remain), so the lift is closer than it has ever been. But 6 cycles of no player-visible change is a real cost, and Path B is player-facing. No autonomous lean - decide with Matt.
2. **Q2 (Path A): how big a chunk?** Grass real ~315/chunk today; need > 1024/chunk natural for the attribute path with no padding. That is ~3.3x more grass/chunk -> ~1.8x larger `chunkSize` (area scales with size^2) at the same density, or raise `clumpsPerChunk` with `chunkSize`. Spike the frame-time cost of the coarser cull granularity (more grass drawn partially off-screen) BEFORE committing - the whole reason the scene is chunked is per-chunk culling.
3. **Q3 (Path A): does the residual block fully clear?** The ~9s block is padding + per-mesh WebGPU resource creation. Fewer chunks cuts both. Confirm the budget probe shows a worst long-task near WebGL's 491 ms before lifting (hard stop 1).

## Phase shape rules

A cycle has ≤ 8 phases, each fully autonomous OR fully paired, single sharp goal, ≤ 4 hours. Path A is flagship grass tuning + a real-device perf call = paired. Path B is taste/playtest = paired.

## Phase 1 — <name> (~Xhr)

**Independently testable.** <Why this phase comes first.>

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.

## Dependencies

```
Phase 1 → Phase 2 → ...
```

## Frozen files (cycle-specific additions)

- `shared/scenes/newsheepdogland.js` — Path A tunes `grass.chunkSize`/`clumpsPerChunk` and (on a met hard stop 1) removes `renderer: 'webgl'`. Authorized ONLY with a within-budget + crash-clean + error-free cold load verified on the 3070 across >= 5 runs.
- `js/GrassSystem.js` — Path A's no-padding collapse changes the grass chunk sizing. GrassSystem is frozen-cohesive (scene-and-render rules); keep the look identical and per-chunk culling intact (hard stop 2).
- `js/main.js` `runFrame()` — re-apply the validated Cycle 77 skip-render race fix in the `_sceneRebuilding` branch on the lift.

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific:

1. Do not remove the newsheepdogland WebGL pin unless a within-budget AND crash-clean AND error-free WebGPU cold load is verified on the RTX 3070 across >= 5 runs (worst main-thread long-task near WebGL's ~491 ms, no `Buffer used while destroyed`, no `NodeBuilder` error). Cycle 78 proved the pipeline collapse; the residual ~9s build block is the remaining wall.
2. Do not degrade grass/tree visual quality or lose per-chunk frustum culling to cut the build block without Matt's explicit sign-off. The coarser-chunk tradeoff is exactly this kind of call.
3. Do not touch `shared/` sim files (render-path cycle; sim-baselines stay byte-identical - editing a scene def's `grass`/`renderer` fields is scene-data, not sim).

## What NOT to do during this cycle

- Don't re-apply the storage fix or the uniform-capacity-only fix (both refuted; the per-mesh buffer NAME is the driver, only the attribute path collapses it).
- Don't ship the PADDED attribute-path collapse (Cycle 78) - it trades 70s of compile for a ~9s padding/build block. The no-padding (bigger-chunk) form is the point of Path A.
- Don't re-measure the compile from scratch (Cycle 78 found it: the count collapses via the attribute path; the residual is a build block, not compile).

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] If the newsheepdogland pin is lifted, then a crash-clean, error-free, within-budget WebGPU cold load shall be verified on the RTX 3070 across >= 5 runs before the close commit (hard stop 1).

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/archive/cycles/cycle-78-plan.md`](archive/cycles/cycle-78-plan.md) — the cycle that proved the attribute-path collapse + found the residual build block
- `cycle78-validation/README.md` — the root cause, the proven collapse, the budget table, the no-padding next step
- `tools/webgpu-count-collapse-probe-cycle78.mjs` + `tools/webgpu-budget-compare-cycle78.mjs` — the probes
- `node_modules/three/src/nodes/accessors/InstanceNode.js` — the uniform-vs-attribute instancing decision
