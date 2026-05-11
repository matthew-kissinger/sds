# Cycle 36 — TBD

> Scaffolded 2026-05-11 at Cycle 35 close. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

TBD. Cycle 36 has not been scoped yet. Candidate threads carried over from Cycle 35 (see [`BACKLOG.md`](BACKLOG.md) Recently Completed → Cycle 35 → Carryover) and the longer-tail backlog. Pick at scope time, then rewrite this section as one paragraph of "what's different between before and after."

## How to read this plan

Once the goal is defined, this doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, EARS acceptance), **not the implementation choices**.

## Open questions to resolve before writing code

TBD at scope.

## Architecture / shared changes

TBD at scope. Likely no shared/scenes/types.js change; likely no sim-baseline regeneration.

## Phase shape rules

≤ 8 phases. Fully autonomous **or** fully paired per phase — no mixed mode. Each phase has a single sharp goal, ≤ 4 hours, EARS acceptance lines.

## Phase 1 — TBD (~Xhr)

TBD at scope.

**Acceptance (EARS):**

- TBD.

## Dependencies

TBD.

## Frozen files (cycle-specific additions)

No cycle-specific additions yet. Durable fence in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) applies.

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-36-specific additions TBD at scope.

## What NOT to do during this cycle

TBD at scope. The standard "don't regenerate sim-baseline without a deliberate cycle phase, don't auto-bump versions, don't auto-post devlog" rules apply.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run lint` runs at cycle close, `eslint shared/` shall be clean.
- [ ] When `npm run build` runs at cycle close, production build shall be clean and `mainKB` shall not regress by more than 5KB vs Cycle 35's 590.33.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — template this plan was generated from
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) — pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-35-plan.md`](archive/cycles/cycle-35-plan.md) — prior cycle for context
