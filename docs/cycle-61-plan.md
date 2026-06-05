# Cycle 61 - pastoral-container-restyle

> Drafted 2026-06-05 after Cycle 60 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/). **This is a scaffolded stub** - fill in the Goal and Phases, then run `/cycle-start`.

## Goal

One paragraph. What's this cycle for? What's the **user-visible** difference between "before" and "after"? If you can't write this paragraph clearly, the cycle isn't ready to start.

(Starting point: the paused Pastoral UI program. The setup and editor containers - Sandbox setup, Fence editor, Shape editor, 2-player local setup, Settings - plus the non-React fallback victory overlays are still on the old tech palette while the entrance, HUD, pause, and completion surfaces are pastoral. This cycle restyles the ~13 stateful containers onto the pastoral design language, container by container, with zero behavior change. Confirm scope and ordering with Matt before authoring.)

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing to a technique.
- **Pick the simplest thing that meets the budget** rather than the most impressive.

## Open questions to resolve before writing code

(Prefix with **Q1**, **Q2**, ... so phases can refer to them.)

1. **Q1: Which containers, in what order?** Author lean: the most-seen first (Settings, Sandbox setup), then the editors, then the fallback overlays.
2. **Q2: Is the non-React fallback victory overlay worth converting, or should it be retired?** Author lean: TBD with Matt.

## Phase shape rules

A cycle has **<= 8 phases**, each with a single sharp goal and EARS-format acceptance. A phase is either fully autonomous or fully paired (no mixed mode within a phase).

## Acceptance criteria - EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/):

- **Event-driven**: `When [trigger], the [system] shall [response].`
- **State-driven**: `While [precondition], the [system] shall [response].`
- **Unwanted-event**: `If [unwanted], then the [system] shall [response].`

Each line should be **grep-testable**.

## Phase 1 - <name> (~Xhr)

**Independently testable.** <Why this phase comes first.>

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.

## Frozen files (cycle-specific additions)

The durable fence list is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md); add cycle-specific freezes here only if the work pattern requires extra discipline.

## Hard stops

Durable hard stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Add cycle-specific stops below.

## What NOT to do during this cycle

(Cycle-specific list - scope creep, refactors that should wait, ideas decided against.)

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, the sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] (Cycle-specific qualitative criteria.)

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items
- [`docs/archive/cycles/cycle-60-plan.md`](archive/cycles/cycle-60-plan.md) - controller + playtest tooling (prior cycle)
- [EARS notation](https://kiro.dev/docs/specs/) - testable acceptance lines
