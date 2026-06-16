# Cycle 105 — golden-determinism-and-launch-prep

> Drafted 2026-06-16 after Cycle 104 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

**STUB — needs `/cycle-start` authoring. Do not start phases until the Goal paragraph and EARS acceptance are filled in with Matt.**

Cycle 104 closed the impostor render path (Home Field now gets far-tree impostors via the `consolidatedTrees` SceneDef flag; the `brightness=6` magic retired to `LEAF_SUN_INTENSITY × IMPOSTOR_CANOPY_RESIDUAL`; field / rolling-hills / open-country signed off on-device) and bounded Newsheepdogland with a diagnosis + EARS re-enable bar ([`nsl-burndown.md`](nsl-burndown.md)). This cycle's theme slid from the original 104 stub: **golden determinism** (the deterministic fixed-dt sim-step affordance that restores the dropped follow-cell goldens) and **launch prep** (the paired launch session). Write the one-paragraph user-visible goal at `/cycle-start`.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing to a technique.
- **Pick the simplest thing that meets the budget** rather than the most impressive.

## Open questions to resolve before writing code

(Author at `/cycle-start`. Seed candidates from the Cycle 104 carryover:)

1. **Q1: Deterministic sim-step affordance — shape?** A `__sdsCinema.stepSimulation(ticks)` that runs a fixed tick count then freezes, so the follow-camera goldens settle reproducibly (today the follow framing is wall-clock-dependent, so the golden gate is classic-only / 6 cells). Author lean: a fixed-dt stepper gated behind the cinematic harness, no change to the live `shared/` tick.
2. **Q2: Launch-prep scope this cycle — full launch, or staged?** NSL-as-default-world is gated on the [`nsl-burndown.md`](nsl-burndown.md) re-enable bar clearing (an NSL fix pass, possibly its own cycle first). Version bump + itch/devlog/social (Matt's voice) + S24+ device pass are the paired-track items. Author lean: stage it — golden determinism is autonomous; the launch session is paired and may wait on the NSL burn-down.

## Architecture / shared changes

(Author at `/cycle-start`. The sim-step affordance, if it touches `shared/`, needs the deterministic-sim migration story — see [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md).)

## Phase shape rules

A cycle has **≤ 8 phases**, each **fully autonomous** or **fully paired** (never mixed within a phase), single sharp goal, ≤ 4 hours. The launch session is a paired track; golden determinism is autonomous.

## Acceptance criteria — EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/). Each line grep-testable.

## Phase 1 — <name> (~Xhr)

(Stub. Author at `/cycle-start`.)

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.

## Dependencies

(Author at `/cycle-start`.)

## Frozen files (cycle-specific additions)

- (None yet. A `shared/`-touching sim-step affordance would need fence authorization here.)

## Hard stops

Durable hard stops apply on every cycle — see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions authored at `/cycle-start`.

## What NOT to do during this cycle

- **Don't re-enable NSL in the entrance** until the [`nsl-burndown.md`](nsl-burndown.md) re-enable bar holds on-device (all criteria, same change restores `comingSoon` + `SCENE_ORDER` + the skipped E2E).
- **Don't regenerate sim-baseline goldens** to make a deterministic-stepper test pass — read the diff, record intent (see [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md)).

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] (Cycle-specific qualitative criteria — author at `/cycle-start`.)

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) — pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items (Cycle 104 carryover seeds this plan)
- [`docs/nsl-burndown.md`](nsl-burndown.md) — NSL re-enable bar (gates the launch-as-default item)
- [`docs/archive/cycles/`](archive/cycles/) — past cycle plans
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
