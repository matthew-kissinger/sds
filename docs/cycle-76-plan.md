# Cycle 76 - webgpu-tree-build-cost

> Drafted 2026-06-08 after Cycle 75 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **This is a STUB.** Fill in Goal + Phases at `/cycle-start`. The slug `webgpu-tree-build-cost` is the now-primary carryover (Cycle 75 precisely scoped it). The still-deferred `feel-and-media-live` LIVE taste items are the other thread. This one is likely PAIRED (it touches the flagship's trees and deep render internals); decide mode with Matt before writing code.

## Goal

One paragraph. What is this cycle for? What is the **user-visible** difference between "before" and "after"? The carried-in primary thread:

- **webgpu-tree-build-cost (likely paired):** Cycle 75 measured that a first newsheepdogland WebGPU load is dominated by a ~76s "Creating trees" build step (building ~400 native tree node-material InstancedMeshes, LOD0 + kiln impostor, in `js/world/TreePlacement.js#placeTrees`), and that this cost is per-build and does NOT cache across builds on Dawn (newsheepdogland built twice: 76.4s, 75.4s). WebGL builds the whole scene in ~2.2s. This ~35x WebGPU tree-build penalty is the real and only blocker keeping the newsheepdogland WebGL pin in place (the attract prewarm could not help, since the cost is not a warmable shared-pipeline compile - Cycle 75 refuted that). This cycle: cut the WebGPU tree-build cost enough that newsheepdogland loads within budget on WebGPU, which lifts the pin and unblocks the flagship's WebGPU Hosek sky + water (the Cycle 73 marketing payoff). Evidence base: `cycle75-validation/README.md` + the three `tools/webgpu-*-cycle75.mjs` probes + DECISIONS.md Cycle 75 entry.
- **feel-and-media-live (paired, Matt's hands):** the LIVE taste items carried since Cycle 73 - the survival feel LIVE retune, the two-dog co-op fun playtest, and the entrance hero FINAL blessing.

## Open questions to resolve before writing code

1. **Q1: Why do the tree node-material pipelines not cache across builds on Dawn?** Author lean: the Three.js WebGPU backend creates new shader modules per material instance each build, and Dawn keys its pipeline cache by module identity, so a rebuild cache-misses. Confirm by inspecting the konveyor tree node-material creation in `placeTrees` and whether stable/shared modules let Dawn hit. If stable modules cache, a prewarm becomes viable again AND the second-pick cost drops.
2. **Q2: Is the win in fewer pipelines or in cheaper compilation?** Author lean: measure the distinct-pipeline count for newsheepdogland's trees first (how many unique node-material + geometry-layout combinations across the ~400 InstancedMesh chunks). If it is a large number of near-duplicate pipelines, sharing materials across chunks cuts the count. If it is a few expensive pipelines, the lever is compile cost, not count. Spike with numbers before committing.
3. **Q3: Should the per-frame render during `_sceneRebuilding` be suppressed for heavy WebGPU builds?** Cycle 75 found suppressing it collapses the build step but moves the cost to one `compileAsync` (no net win alone). It only helps combined with a working cache (Q1). Decide together.

## Phase shape rules

A cycle has **<= 8 phases**, each fully autonomous OR fully paired (no mixed mode within a phase). Single sharp goal, <= 4 hours each. Note: a measure-first spike (per `feedback_spike_risky_primitives`) should be Phase 1 here - the representation choice (fewer pipelines vs cheaper compile vs caching fix) must be founded on numbers before authoring the fix phases.

## Phase 1 - <name> (~Xhr)

**Independently testable.** <Why this phase comes first.>

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.

## Dependencies

```
Phase 1 -> Phase 2 -> ...
```

## Frozen files (cycle-specific additions)

- The konveyor tree node-material system + `js/world/TreePlacement.js` are deliberate render design (see `.claude/rules/scene-and-render.md` + DECISIONS.md). A change here needs an explicit migration story in this plan and likely Matt's review (the trees are the flagship's visual centerpiece).
- A pin lift edits only `shared/scenes/newsheepdogland.js` (remove `renderer: 'webgl'`); `prewarmShaders` already exists.

## Hard stops

Durable hard stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. Do not remove the newsheepdogland WebGL pin unless a within-budget WebGPU cold LOAD (build + compile, not just the compile tail) is verified on the RTX 3070. Cycle 75 showed the build, not the compile, is the wall - so the gate is the full first-pick wall time, measured per-step.
2. Do not degrade the flagship's tree visual quality to cut compile cost without Matt's explicit sign-off. The trees are the scene's centerpiece; cheaper-but-uglier is a taste call, not an autonomous one.
3. Do not touch `shared/` sim files. Render-path cycle; sim-baselines stay byte-identical.

## What NOT to do during this cycle

- Don't re-attempt the attract prewarm as a way to lift the pin - Cycle 75 refuted it (the cost is per-build, not warmable).
- Don't apply a survival feel retune autonomously (the other deferred thread; Matt's hands).

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items (Cycle 75 carryover)
- [`docs/archive/cycles/cycle-75-plan.md`](archive/cycles/cycle-75-plan.md) - the cycle that scoped this
- `cycle75-validation/README.md` - the tree-build measurement + the reframe
- `js/world/TreePlacement.js` - `placeTrees`, the ~76s build step
- `.claude/rules/scene-and-render.md` - far-tree impostor + node-material design rules
