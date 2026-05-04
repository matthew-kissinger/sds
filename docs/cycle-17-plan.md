# Cycle 17 — bundle-slim

> Drafted 2026-05-04 after Cycle 16 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

One paragraph. What's this cycle for? What's the **user-visible** difference between "before" and "after"? If you can't write this paragraph clearly, the cycle isn't ready to start.

> Starting hint (delete after first /cycle-start fills this in properly): the Cycle 16 production build flagged `main-ChqZvyrU.js 817 KB / 241 KB gzip` with a Vite chunk-size warning. That single bundle is the dominant cold-start cost on mobile (the CI E2E test had to bump `actionTimeout: 10s → 30s` to absorb it on Cycle 15). The cycle goal is presumably: split `main.js` so first-paint downloads ~half of what it does today, with the rest dynamic-imported on demand. User-visible difference: meaningfully faster cold-start on mobile + slower devices, lower bounce on the landing page.

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

## Phase 1 — <name> (~Xhr)

**Independently testable.** <Why this phase comes first.>

1. **Step.** Description + [`file path`](path).
2. **Step.** Description.

**Acceptance:** <concrete checks — tests pass, manual verify shape, etc.>

## Phase 2 — <name> (~Xhr)

**Depends on:** <Phase 1 / nothing / etc.>

1. ...

**Acceptance:** ...

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

Surface to the user, do not proceed:

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure that you don't understand — don't regenerate fixtures, escalate.
3. Visual regression on a previously-passing scene — fix or revert before adding new scope.
4. Frametime regression > 5% on `perf-check` (now push-gating per Cycle 16) — diagnose before adding new scope.
5. (Cycle-specific additions.)

## What NOT to do during this cycle

(Cycle-specific list — things that look like next-cycle scope creep, refactors that should wait, ideas that have been decided against.)

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] All phases shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] `perf-check` CI job green vs the committed Linux baseline.
- [ ] Live on sheepdogsim.com via GH Actions.
- [ ] (Cycle-specific qualitative criteria — e.g. "Cold-start TTI on 4G mid-tier mobile under N seconds.")

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items (incl. Cycle 16 carryover entry: Phase 6 hero cards + v1.1.0)
- [`docs/archive/cycles/cycle-16-plan.md`](archive/cycles/cycle-16-plan.md) — prior cycle plan (tree foliage LOD chain + perf harness)
- [`docs/archive/cycles/`](archive/cycles/) — older cycle plans
