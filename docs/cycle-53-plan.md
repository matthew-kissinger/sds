# Cycle 53 - security-hardening

> Drafted 2026-06-03 after Cycle 52 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

> **SCAFFOLD STUB - Goal + Phases not yet authored.** Fill these in at `/cycle-start`. Candidate scope below. The slug is a recommendation, not a lock: confirm or revise the focus before authoring.

## Goal

One paragraph. What's this cycle for? What's the **user-visible** (or operator-visible) difference between "before" and "after"? If you can't write this paragraph clearly, the cycle isn't ready to start.

**Candidate scope (recommended - confirm/revise before starting):** close the live CRITICAL backend auth hole and start working the security/perf/coverage audit roadmap.

- **P-SEC-1: `/api/register` auth fix (CRITICAL).** The audit (2026-05-31) found `/api/register` mints a valid JWT for any client-supplied id, so any client can forge identity. A drafted P-SEC-1 plan exists. This is a live production vulnerability and the strongest reason to make this the next cycle. See [`docs/audit-roadmap-2026-05.md`](audit-roadmap-2026-05.md) and the security-audit memory.
- **Roadmap follow-ons.** The audit is a 14-phase Cycles 51+ program; pick the next 1-2 phases (e.g. token lifetime, rate limiting) that pair cleanly with the auth fix.

**Alternatives Matt may prefer instead (the pastoral/render programs are still queued):**

- **`pastoral-assets`** - the Pixel Forge bespoke-asset program (dog-portrait avatars, in-world props). The genuine first job for the `../pixel-forge` raster/3D pipeline. See the Cycle 51 closeout notes.
- **`object-impostor-B`** - per-instance impostor variation + rocks/structures, the second half of the object-driven impostor program ([`docs/object-impostor-cycle-plan.md`](object-impostor-cycle-plan.md)).

(A security fix and a wire/Worker change touch the deterministic boundary and the append-only migration contract: read [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) and [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) before authoring those phases.)

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code. The ecosystem evolves; what was "the" solution last cycle may not be optimal now.
- **Measure on the actual target** (RTX 3070 desktop, mid-tier mobile, the Worker's CPU budget) before committing to a technique.
- **Pick the simplest thing that meets the budget** rather than the most impressive. If the simple version is correct, ship it; escalate only on demonstrated need.

## Open questions to resolve before writing code

(Prefix with **Q1**, **Q2**, ... so phases can refer to them.)

1. **Q1: <Question>?** Author lean: <answer>.
2. **Q2: <Question>?** Author lean: <answer>.

These don't block scaffolding (Phase 1) but should be resolved before the security-sensitive phases.

## Architecture / shared changes

(If the cycle introduces a primitive or schema change shared across phases, describe it here. Otherwise delete this section. A token-format or migration change is append-only: new migration file, never an edit to an applied one.)

## Phase shape rules

A cycle has **≤ 8 phases**. If you find yourself drafting a 9th, the work is two cycles, not one.

Each phase is either **fully autonomous** (the agent ships without Matt's pairing) or **fully paired** (Matt's hands on the keyboard for it). **Don't mix modes within a phase.** A security phase that needs Matt to rotate a secret or run a remote wrangler migration is paired.

A phase has a **single sharp goal** (one new file, one extraction, one decision codified) and **≤ 4 hours** of work. Larger means split.

## Acceptance criteria - EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/) so the lines are testable by construction:

- **Event-driven**: `When [trigger], the [system] shall [response].`
- **State-driven**: `While [precondition], the [system] shall [response].`
- **Unwanted-event**: `If [unwanted], then the [system] shall [response].`

Each line should be **grep-testable**. The `/cycle-close` reconciliation hook walks every Acceptance line and tries to grep its predicate against shipped commits + test output.

## Phase 1 - <name> (~Xhr)

**Independently testable.** <Why this phase comes first.>

1. **Step.** Description + [`file path`](path).
2. **Step.** Description.

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.
- If `<unwanted>`, then the `<system>` shall `<response>`.

## Phase 2 - <name> (~Xhr)

**Depends on:** <Phase 1 / nothing / etc.>

1. ...

**Acceptance (EARS):** ...

## Dependencies

Prose ordering. Mostly serial, occasional parallelism:

```
Phase 1 -> Phase 2 + Phase 3 (parallel) -> Phase 4 (optional)
```

When two phases can run in parallel, say so. When one depends on another's specific output, say what.

## Frozen files (cycle-specific additions)

These files require explicit task-brief authorization to modify within this cycle. The durable fence list is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md); add cycle-specific freezes here only if the work pattern requires extra discipline.

- (Cycle-specific additions, if any. A wire-protocol or migration change names the file here with a migration story per `.claude/rules/multiplayer.md`.)

## Hard stops

Durable hard stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). The list below adds **cycle-specific** stops that aren't covered by the durable list:

1. (Cycle-specific addition. e.g. a security change must not weaken an existing check to make a test pass.)
2. (Cycle-specific addition.)

## What NOT to do during this cycle

(Cycle-specific list. Things that look like next-cycle scope creep, refactors that should wait, ideas that have been decided against.)

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check. Each item should be EARS-form so the cycle-close reconciliation hook can grep its predicate.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] (Cycle-specific qualitative criteria.)

## References

- [`docs/audit-roadmap-2026-05.md`](audit-roadmap-2026-05.md) - the security/perf/coverage audit roadmap (candidate scope source)
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the cycle template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) - Worker / DO / migration contract
- [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) - deterministic-sim boundary
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) - pickup-state contract
- [EARS notation](https://kiro.dev/docs/specs/) - testable acceptance lines
