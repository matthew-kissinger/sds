# Cycle 75 - webgpu-attract-prewarm

> Drafted 2026-06-08 after Cycle 74 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **This is a STUB.** Fill in Goal + Phases at `/cycle-start`. The slug `webgpu-attract-prewarm` is the now-primary carryover (Cycle 74 made it data-founded); the still-deferred `feel-and-media-live` LIVE taste items are the other thread. Pick the actual cycle focus with Matt before writing code.

## Goal

One paragraph. What is this cycle for? What is the **user-visible** difference between "before" and "after"? Candidate threads carried into this cycle (decide which is the cycle, do not do both):

- **webgpu-attract-prewarm (autonomous, the path to lifting the pin):** Cycle 74 shipped the `compileAsync` prewarm mechanism (`SceneDef.prewarmShaders`, dormant behind the newsheepdogland WebGL pin) and measured the real WebGPU ship path on the RTX 3070. The decisive finding: the ~38s cold compile is SHARED konveyor-pipeline compilation, not a newsheepdogland tax. Once the GPU device has compiled those pipelines (from any WebGPU scene), an in-session swap to newsheepdogland is ~0.4s. The attract/menu renders only the zen field, which does not touch those pipelines, so a player who picks newsheepdogland first pays the full ~38s. This cycle: build a background prewarm that compiles the shared konveyor pipelines during the attract/menu idle window (renderer is live, no heavy scene built), so the first real scene pick is fast - including newsheepdogland - which lets the WebGL pin come off and unblocks the flagship's WebGPU Hosek sky + water (the Cycle 73 marketing payoff). The risk is attract-mode UX: building/compiling off-screen without janking the menu or bleeding visually. Hard stop carries forward: do not remove the pin until a within-budget cold path is verified on the RTX 3070 (now: verify that the attract prewarm makes a first newsheepdogland pick load within budget). Evidence base: `cycle74-validation/README.md` + `tools/webgpu-prewarm-probe-cycle74.mjs` + DECISIONS.md Cycle 74 entry.
- **feel-and-media-live (paired, Matt's hands):** the LIVE taste items carried since Cycle 73 - the survival feel LIVE retune (off the reaffirmed Cycle 70/73 lever order), the two-dog co-op fun playtest, and the entrance hero FINAL blessing (pick from the Cycle 73 candidate set, or re-shoot once WebGPU lands).

## Open questions to resolve before writing code

1. **Q1: What does the attract prewarm compile against?** Author lean: the cleanest guaranteed-match path is to warm the shared pipelines via the real build path; the throwaway-detached-build vs speculative-real-build tradeoff is the first thing to spike (does a detached/dummy-geometry compile produce pipeline keys that the real load actually hits, or does it need the real scene graph). Measure before committing.
2. **Q2: How is jank avoided during a ~38s background compile while the menu is up?** Author lean: `compileAsync` is Dawn's off-main-thread path, so the menu should stay smooth, but this needs an actual observed-FPS check during the prewarm, not an assumption.

## Phase shape rules

A cycle has **<= 8 phases**, each fully autonomous OR fully paired (no mixed mode within a phase). Single sharp goal, <= 4 hours each.

## Phase 1 - <name> (~Xhr)

**Independently testable.** <Why this phase comes first.>

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.

## Dependencies

```
Phase 1 -> Phase 2 -> ...
```

## Frozen files (cycle-specific additions)

- (Often empty - the durable fence in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) is enough. Note: `SceneDef.prewarmShaders` already exists from Cycle 74, so a pin-lift only edits `shared/scenes/newsheepdogland.js` to remove `renderer: 'webgl'`.)

## Hard stops

Durable hard stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. Do not remove the newsheepdogland WebGL pin unless a within-budget WebGPU cold path is actually verified on the RTX 3070 (the Cycle 72/73/74 hard stop carries forward; removing it is the live-crash class again). With the attract prewarm, the gate becomes: a first newsheepdogland pick (prewarm complete) loads within budget, AND a first pick before the prewarm completes is still crash-free under P1's honest 'Optimizing shaders' bar.
2. Do not touch `shared/` sim files. This is a render-path cycle; the sim-baselines stay byte-identical.

## What NOT to do during this cycle

- Don't apply a survival feel retune autonomously (taste; Matt's live wolf night - the other deferred thread).
- Don't simplify the grass/terrain/water/sky shaders to cut compile cost. That degrades the flagship's beauty and is a separate, deliberate decision. The attract prewarm hides the cost rather than cutting it.

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
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items (Cycle 74 carryover)
- [`docs/archive/cycles/cycle-74-plan.md`](archive/cycles/cycle-74-plan.md) - the cycle just closed
- `cycle74-validation/README.md` - the prewarm measurement + the shared-pipeline reframe
- `tools/webgpu-prewarm-probe-cycle74.mjs` - the headed-GPU measurement harness (reuse for the within-budget verification)
