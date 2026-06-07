# Cycle 71 - feel-and-media-live

> Drafted 2026-06-07 after Cycle 70 (`survival-feel-and-media`) closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **This is a STUB.** Fill in the Goal + Phases (or run `/cycle-start` to orient) before writing code. This is the **paired / Matt's-hands track** that Cycles 67-70 kept advancing-then-deferring: the autonomous prep is done (Cycle 70 shipped the grass far-ring, the feel audit, and a current hero candidate), so what remains needs Matt at the keyboard or his explicit OK. Candidate scope from the Cycle 70 carryover (in [`BACKLOG.md`](BACKLOG.md)):
> - **Survival feel LIVE tuning** (paired taste) - the Cycle 70 P2 audit (`cycle70-validation/survival-feel/audit.md`) is the numbers-backed starting point. Live-tune `shared/survival/tuning.js` across a real wolf night, lever order in the audit. Any value change keeps the 10 sim-baselines byte-identical and carries no wire change.
> - **Two-client co-op fun playtest** (paired) - the wire path is proven (Cycle 68 P3); the "is it fun" judgment is Matt's.
> - **Entrance hero FINAL beauty shot** (media) - dial `tools/hero-capture.mjs` (CAM/TARGET/SUN_T) live in a real browser to `cycle68-validation/hero/manifest.md`. Cycle 70 P3 shipped the current candidate (`cycle70-validation/hero/`) with the far-ring active; a real browser clears the headless sun-dome artifact.
> - **`multiplayer.md` doc correction** (BLOCKED - needs Matt's explicit OK) - the Cycle 68 P1 remote-migration lines are wrong; the agent-config guardrail blocks Claude editing a `.claude/rules/*.md` file autonomously. Matt applies the staged text or grants the edit.
> - Alternative autonomous option if Matt wants a non-paired cycle: **tablet draw-call perf** (prior carryover) - would need its own measure-first spike.

## Goal

One paragraph. What's this cycle for? What's the user-visible difference between "before" and "after"? If you can't write this paragraph clearly, the cycle isn't ready to start.

## Open questions to resolve before writing code

1. **Q1: <Question>?** Author lean: <answer>.

## Phase 1 - <name> (~Xhr)

**Independently testable.** <Why this phase comes first.>

1. **Step.** Description.

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.

## Dependencies

```
Phase 1 -> Phase 2 -> ...
```

## Frozen files (cycle-specific additions)

- **`shared/survival/tuning.js`** - if the live feel pass changes values, the 10 sim-baselines must stay byte-identical (survival is off the sheep tick) and the survival specs must stay green. No wire change without the four-piece migration story + a `PROTOCOL_VERSION` bump.
- **`.claude/rules/multiplayer.md`** - needs Matt's explicit OK before any edit (agent-config guardrail).

## Hard stops

Durable stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. (Cycle-specific addition.)

## What NOT to do during this cycle

(Cycle-specific list.)

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items (Cycle 70 carryover)
- [`docs/archive/cycles/cycle-70-plan.md`](archive/cycles/cycle-70-plan.md) - the cycle just closed
- [`cycle70-validation/survival-feel/audit.md`](../cycle70-validation/survival-feel/audit.md) - the feel-pass starting numbers
- [`cycle68-validation/hero/manifest.md`](../cycle68-validation/hero/manifest.md) - the hero-shot manifest
