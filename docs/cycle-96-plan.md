# Cycle 96 — visual-queue-and-polish

> Drafted 2026-06-14 after Cycle 95 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Scaffold stub.** This plan needs its Goal + Phases filled in. There is an authored candidate: [`cycle-93-plan.md`](cycle-93-plan.md) (the queued `visual-queue-and-polish` queue-drain: paired visual review, golden re-capture, three r185, NSL jitter rail at the 120-140 floor, rock re-bake w/ collider parity, KTX2, launch). At `/cycle-start`, decide whether to fold that draft into this Cycle 96 plan or renumber it. The "93" number was authored ahead and skipped (94 and 95 ran first), so it is not a live cycle number.

## Goal

One paragraph. What's this cycle for? What's the **user-visible** difference between "before" and "after"? If you can't write this paragraph clearly, the cycle isn't ready to start.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing to a technique.
- **Pick the simplest thing that meets the budget** rather than the most impressive.

## Open questions to resolve before writing code

1. **Q1: <Question>?** Author lean: <answer>.
2. **Q2: <Question>?** Author lean: <answer>.

## Architecture / shared changes

(If the cycle introduces a primitive or schema change shared across phases, describe it here. Otherwise delete this section.)

## Phase shape rules

A cycle has **≤ 8 phases**. Each phase is either fully autonomous or fully paired (no mixed mode). A phase has a single sharp goal and ≤ 4 hours of work.

## Acceptance criteria — EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/): `When [trigger], the [system] shall [response].` Each line should be grep-testable.

## Phase 1 — <name> (~Xhr)

**Independently testable.** <Why this phase comes first.>

1. **Step.** Description + [`file path`](path).

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.

## Dependencies

```
Phase 1 → Phase 2 + Phase 3 (parallel) → Phase 4 (optional)
```

## Frozen files (cycle-specific additions)

- (Cycle-specific additions, if any. Often empty — the durable fence is enough.)

## Hard stops

Durable hard stops apply on every cycle — see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific:

1. (Cycle-specific addition.)

## What NOT to do during this cycle

(Cycle-specific list — scope creep, refactors that should wait, ideas decided against.)

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] (Cycle-specific qualitative criteria.)

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) — pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/cycle-93-plan.md`](cycle-93-plan.md) — authored candidate content for this cycle
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
