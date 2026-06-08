# Cycle 74 - webgpu-compile-reduction

> Drafted 2026-06-08 after Cycle 73 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **This is a STUB.** Fill in Goal + Phases at `/cycle-start`. The slug `webgpu-compile-reduction` is the now-primary carryover; the still-deferred `feel-and-media-live` LIVE taste items are the other thread. Pick the actual cycle focus with Matt before writing code.

## Goal

One paragraph. What is this cycle for? What is the **user-visible** difference between "before" and "after"? Candidate threads carried into this cycle (decide which is the cycle, do not do both):

- **webgpu-compile-reduction (autonomous spike):** cut the ~83-95s cold WebGPU pipeline compile on Newsheepdogland so the Cycle 71 WebGL pin can finally come off. Cycle 73 raised the stakes: the pin does not just cost a slow first load, it **gates the flagship's beauty media** (the `HosekWilkieSkyDome` konveyor node-material sky and the water shader are WebGPU-only, so on the WebGL pin they render dark/speckled - the hero + cinematic can only be captured as tight pale-sky land framings). Lifting the pin unblocks both load-time AND marketing media. Approaches measured-but-not-yet-built: simplify the heavy grass/terrain/water shaders, or warm the Dawn pipeline cache at build time for the native build. Hard stop carries forward: do not remove the pin until a within-budget WebGPU cold compile is verified on the RTX 3070.
- **feel-and-media-live (paired, Matt's hands):** the LIVE taste items Cycle 73 could not do without Matt at the keyboard - the survival feel LIVE retune (off the reaffirmed Cycle 70/73 lever order), the two-dog co-op fun playtest, and the entrance hero FINAL blessing (pick from the Cycle 73 candidate set, or re-shoot once WebGPU lands).

## Open questions to resolve before writing code

1. **Q1: <Question>?** Author lean: <answer>.

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

- (Often empty - the durable fence in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) is enough.)

## Hard stops

Durable hard stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. Do not remove the Newsheepdogland WebGL pin unless a within-budget WebGPU cold compile is actually verified on the RTX 3070 (the Cycle 72/73 hard stop carries forward; removing it is the live-crash class again).

## What NOT to do during this cycle

- Don't apply a survival feel retune autonomously (taste; Matt's live wolf night).

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
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items (Cycle 73 carryover)
- [`docs/archive/cycles/cycle-73-plan.md`](archive/cycles/cycle-73-plan.md) - the cycle just closed
- `cycle72-validation/webgpu-cold-compile/` - the WebGPU cold-compile evidence base
- `cycle73-validation/README.md` - the media WebGPU-gating finding
