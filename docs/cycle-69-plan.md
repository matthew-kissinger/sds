# Cycle 69 - survival-feel-and-media

> Drafted 2026-06-07 after Cycle 68 (`survival-polish`) closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **This is a STUB.** Cycle 68 hardened co-op survival (deploy remote migrations, centralized tunables, a live two-client proof, DO-storage run persistence) and ran a grass spike (NO-GO on a whole-island rearch). Fill in the Goal + Phases (or run `/cycle-start` to orient) before writing code. Candidate scope from the Cycle 68 carryover (in [`BACKLOG.md`](BACKLOG.md)):
> - **`multiplayer.md` doc correction** (small, autonomous-able once Matt grants the rules-file edit) - the staged text fixes the now-wrong remote-migration lines.
> - **Survival feel-pass** (Matt's paired taste track) - the live value tuning of `shared/survival/tuning.js` (wolf counts/speeds, kill radius, bark range, +5 growth, 33% loss) judged across a real wolf night, plus the two-client co-op fun playtest.
> - **Entrance hero FINAL shot** (Matt's media pass) - dial `tools/hero-capture.mjs` (CAM/TARGET/SUN_T) live to the `cycle68-validation/hero/manifest.md` framing.
> - **Coastline far-ring meadow-quad grass** (a targeted LOD for coastline scenes, NOT a GrassSystem decomposition; would also trim the current 829 draw calls) - spike first, per the P5 numbers.

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
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items (Cycle 68 carryover)
- [`docs/archive/cycles/cycle-68-plan.md`](archive/cycles/cycle-68-plan.md) - the survival-polish cycle just closed
