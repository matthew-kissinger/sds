# Cycle 73 — feel-and-media-live

> Drafted 2026-06-08 after Cycle 72 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **This is a STUB.** Fill in Goal + Phases at `/cycle-start`. The slug `feel-and-media-live` is the long-deferred paired track (bumped through Cycles 70, 71, 72); the other live thread is the WebGPU compile-reduction spike (see BACKLOG carryover). Pick the actual cycle focus with Matt before writing code.

## Goal

One paragraph. What's this cycle for? What's the **user-visible** difference between "before" and "after"? Candidate threads carried into this cycle (decide which is the cycle, do not do both):

- **feel-and-media-live (paired):** survival feel LIVE tuning (off the Cycle 70 P2 audit), a two-client co-op fun playtest, the entrance hero FINAL beauty shot, and the `multiplayer.md` doc correction (needs Matt's OK). Matt's-hands / taste work.
- **webgpu compile-reduction (autonomous spike):** cut the ~90s cold WebGPU pipeline compile on newsheepdogland so the Cycle 71 WebGL pin can finally come off (simplify the heavy grass/terrain/water shaders, or warm the Dawn pipeline cache at build time for the native build). Measured spike; high effort, uncertain payoff.

## Open questions to resolve before writing code

1. **Q1: <Question>?** Author lean: <answer>.

## Phase shape rules

A cycle has **≤ 8 phases**, each fully autonomous OR fully paired (no mixed mode within a phase). Single sharp goal, ≤ 4 hours each.

## Phase 1 — <name> (~Xhr)

**Independently testable.** <Why this phase comes first.>

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.

## Dependencies

```
Phase 1 → Phase 2 → ...
```

## Frozen files (cycle-specific additions)

- (Often empty — the durable fence in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) is enough. `multiplayer.md` correction, if taken, needs explicit Matt authorization.)

## Hard stops

Durable hard stops apply on every cycle — see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. (Cycle-specific addition.)

## What NOT to do during this cycle

- Don't remove the newsheepdogland WebGL pin unless the compile-reduction thread actually lands a within-budget WebGPU cold compile, verified on the RTX 3070 (the Cycle 72 hard stop carries forward).

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items (Cycle 72 carryover)
- [`docs/archive/cycles/cycle-72-plan.md`](archive/cycles/cycle-72-plan.md) — the cycle just closed
