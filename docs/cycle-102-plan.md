# Cycle 102 - impostor-ktx2-and-polish

> Drafted 2026-06-15 after Cycle 101 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/). **This plan is a stub** - author the Goal + Phases at `/cycle-start`.

## Goal

One paragraph. What's this cycle for? What's the **user-visible** difference between "before" and "after"?

Seed (from the Cycle 101 carryover, refine at `/cycle-start`): the Cycle 101 octahedral far-impostor atlas ships as lossless `.png`; KTX2 wire-encoding it was deferred from Phase 4 so the UASTC transcode would not be conflated with the new material as an unvalidated variable. This cycle realizes that wire win (extend `tools/encode-impostors-ktx2.mjs` past `LIVE_LAYOUT`, make `MAPS` aux-layer-aware for albedo + normal, extend the dist `.png` dedup into the octahedral subdir), folds in any far-impostor polish surfaced during the paired review, and runs the carried-over GPU-bound Cycle 101 validation (the settled SSIM A/B + the warm jitter rails on NSL + Rolling Hills + Open Country - runbook in `cycle101-validation/phase6-validation-notes.md`). The octahedral selector fold-seam note (54/64 round-trip, off-by-one at the steep-down seam) is the one thing to confirm in the paired A/B.

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

A cycle has **≤ 8 phases**, each fully autonomous or fully paired (no mixed mode), each a single sharp goal of ≤ 4 hours.

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
Phase 1 → Phase 2 → ...
```

## Frozen files (cycle-specific additions)

- The impostor atlas, sidecar, and `assets/objects.manifest.json` are not fence-frozen (the encode is the authorized change). `tests/refactor-baseline/__fixtures__/bundle-sizes.json` (fence-frozen) - bump only with a recorded decision if the encode shifts a JS chunk.

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
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items (Cycle 101 carryover seeds this cycle)
- [`cycle101-validation/phase6-validation-notes.md`] - the GPU-bound validation runbook carried into this cycle
