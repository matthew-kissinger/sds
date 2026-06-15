# Cycle 103 - golden-harness-rebaseline

> Drafted 2026-06-15 after Cycle 102 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/). **This plan is a stub** - author the Goal + Phases at `/cycle-start`.

## Goal

One paragraph. What's this cycle for? What's the **user-visible** difference between "before" and "after"?

Seed (from the standing carryover, refine at `/cycle-start`): the golden suite (`tools/validation/golden/`) is stale. It diffs near-zero SSIM against the current capture environment (Cycle 91 reframed the follow camera, Cycles 92/101 changed the impostors), so it no longer reproduces and cannot gate a render change. Cycles 99 and 101 both had to fall back to seeded same-build A/Bs because the committed goldens add a confound rather than a signal. This cycle makes the harness a trustworthy render gate again: re-baseline the 12-cell suite under the canonical capture environment (or gate the capture on a deterministic scene-settled signal so a single headless frame is reproducible), add NSL to the matrix if its streamed foliage can be settled deterministically, and fold in the paired impostor validation carried from Cycles 101-102 (the octahedral ktx2-vs-png SSIM A/B, the impostor-vs-LOD0 A/B on NSL + Rolling Hills + Open Country, and the warm jitter rails) - so the impostor work finally gets its settled visual gate on Matt's WebGPU box. There is no player-visible change; this is test-infra trust.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing to a technique.
- **Pick the simplest thing that meets the budget** rather than the most impressive.

## Open questions to resolve before writing code

1. **Q1: <Question>?** Author lean: <answer>.
2. **Q2: <Question>?** Author lean: <answer>.

## Phase shape rules

A cycle has **<= 8 phases**, each fully autonomous or fully paired (no mixed mode), each a single sharp goal of <= 4 hours.

## Acceptance criteria - EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/):

- **Event-driven**: `When [trigger], the [system] shall [response].`
- **State-driven**: `While [precondition], the [system] shall [response].`
- **Unwanted-event**: `If [unwanted], then the [system] shall [response].`

## Phase 1 - <name> (~Xhr)

**Independently testable.** <Why this phase comes first.>

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.

## Dependencies

```
Phase 1 -> Phase 2 -> ...
```

## Frozen files (cycle-specific additions)

- (Cycle-specific additions, if any. The golden captures + manifest under `tools/validation/golden/` are the authorized change; `tests/refactor-baseline/__fixtures__/*` and the sim-baseline fixtures stay fence-frozen unless a recorded decision says otherwise.)

## Hard stops

Durable hard stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. (Cycle-specific addition.)

## What NOT to do during this cycle

(Cycle-specific list.)

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items (Cycle 102 carryover seeds this cycle)
- [`cycle101-validation/phase6-validation-notes.md`] - the GPU-bound impostor validation runbook carried into this cycle
