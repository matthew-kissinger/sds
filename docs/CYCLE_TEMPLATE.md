# Cycle {{number}} — {{slug}}

> Drafted YYYY-MM-DD after Cycle {{N-1}} closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

One paragraph. What's this cycle for? What's the **user-visible** difference between "before" and "after"? If you can't write this paragraph clearly, the cycle isn't ready to start.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code. The ecosystem evolves; what was "the" solution last cycle may not be optimal now.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing to a technique. Use `PerformanceMonitor` and the per-system triangle breakdown.
- **Pick the simplest thing that meets the budget** rather than the most impressive. If the simple version reads correctly, ship it; escalate only on demonstrated need.

## Open questions to resolve before writing code

(Prefix with **Q1**, **Q2**, ... so phases can refer to them.)

1. **Q1: <Question>?** Author lean: <answer>.
2. **Q2: <Question>?** Author lean: <answer>.

These don't block scaffolding (Phase 1) but should be resolved before scene-specific or content-specific phases.

## Architecture / shared changes

(If the cycle introduces a primitive or schema change shared across phases, describe it here. Otherwise delete this section.)

## Phase shape rules

A cycle has **≤ 8 phases**. If you find yourself drafting a 9th, the work is two cycles, not one.

Each phase is either **fully autonomous** (the agent ships without Matt's pairing) or **fully paired** (Matt's hands on the keyboard for it). **Don't mix modes within a phase** — "I'll do steps 1–3 autonomously and pause for Matt at step 4" produces stale handoffs and partial commits. "Matt pickup" work (taste, real-device, design, marketing voice) scopes as a paired-track cycle, not appended to an autonomous cycle.

A phase has a **single sharp goal** (one new file, one extraction, one decision codified) and **≤ 4 hours** of work. Larger means split.

## Acceptance criteria — EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/) so the lines are testable by construction:

- **Event-driven**: `When [trigger], the [system] shall [response].`
- **State-driven**: `While [precondition], the [system] shall [response].`
- **Unwanted-event**: `If [unwanted], then the [system] shall [response].`

Each line should be **grep-testable** — the response should be something a script can verify (`wc -l`, `grep`, `npm test`, a build artifact's existence). The `/cycle-close` reconciliation hook walks every Acceptance line and tries to grep its predicate against shipped commits + test output.

Example: `When Stream B1 ships, then `wc -l js/main.js` shall return ≤ 2,200.`

## Phase 1 — <name> (~Xhr)

**Independently testable.** <Why this phase comes first.>

1. **Step.** Description + [`file path`](path).
2. **Step.** Description.

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.
- While `<precondition>`, the `<system>` shall `<response>`.

## Phase 2 — <name> (~Xhr)

**Depends on:** <Phase 1 / nothing / etc.>

1. ...

**Acceptance (EARS):** ...

## Phase N — Polish (optional, ~Xhr)

Nice-to-haves once Phases 1..N-1 land. Skip any that don't move the needle in playtest.

## Dependencies

Prose ordering. Mostly serial, occasional parallelism:

```
Phase 1 → Phase 1.5 → Phase 2 + Phase 3 (parallel) → Phase 4 (optional)
```

When two phases can run in parallel, say so. When one depends on another's specific output, say what.

## Frozen files (cycle-specific additions)

These files require explicit task-brief authorization to modify within this cycle. The durable fence list is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md); add cycle-specific freezes here only if the work pattern requires extra discipline.

- (Cycle-specific additions, if any. Often empty — the durable fence is enough.)

## Hard stops

Durable hard stops apply on every cycle — see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). The list below adds **cycle-specific** stops that aren't covered by the durable list:

1. (Cycle-specific addition — e.g. "Phase A beacon shows zero pageviews after 1hr — pull the hook.")
2. (Cycle-specific addition.)

## What NOT to do during this cycle

(Cycle-specific list — things that look like next-cycle scope creep, refactors that should wait, ideas that have been decided against.)

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check. Each item should be EARS-form so the cycle-close reconciliation hook can grep its predicate against shipped commits + test output.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] (Cycle-specific qualitative criteria — e.g. "When Cycle 5 closes, Rolling Hills shall feel meaningfully different from Field per playtest.")

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) — pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/`](archive/cycles/) — past cycle plans
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
