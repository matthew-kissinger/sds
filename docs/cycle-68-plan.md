# Cycle 68 - survival-polish

> Drafted 2026-06-07 after Cycle 67 (`coop-survival`) closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **This is a STUB.** Cycle 67 shipped co-op survival end-to-end. The Goal + Phases below are placeholders - fill them in (or run `/cycle-start` to orient) before writing code. Candidate scope from the Cycle 67 carryover (in [`BACKLOG.md`](BACKLOG.md)):
> - **Deploy does not apply remote D1 migrations** (autonomous infra fix) - add a gated remote-migration step to `deploy.yml`, or fold the manual `wrangler d1 execute --remote` step into the cycle-close checklist, and correct the stale `multiplayer.md` "CI does this on deploy" line. Cycle 67 hit a prod break from this.
> - **Two-client live co-op playtest + the survival feel pass** (Matt's paired-track taste pass) - the named tunables (wolf counts/speeds, kill radius, bark range, +5 growth, 33% loss, maxFlock 200).
> - **Reconnect persistence of the multi-day run** (deferred Q5 - currently GameSim-memory only).
> - **Whole-island grass rearch** (density/LOD perf spike) + a **real Newsheepdogland entrance hero capture** (media pass).

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

- (Cycle-specific additions, if any. Often empty - the durable fence is enough.)

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
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items (Cycle 67 carryover)
- [`docs/archive/cycles/cycle-67-plan.md`](archive/cycles/cycle-67-plan.md) - the co-op survival cycle just closed
