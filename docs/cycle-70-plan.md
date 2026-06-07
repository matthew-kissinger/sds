# Cycle 70 - survival-feel-and-media

> Drafted 2026-06-07 after Cycle 69 (`grass-far-ring-and-api-hardening`) closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **This is a STUB.** Fill in the Goal + Phases (or run `/cycle-start` to orient) before writing code. This is the **Matt's-hands / paired track** that Cycles 67-69 kept deferring: taste, real-device, and media work that needs Matt's eye, plus one guardrail-blocked doc edit. Candidate scope from the Cycle 69 carryover (in [`BACKLOG.md`](BACKLOG.md)):
> - **Survival feel pass** (paired taste track) - live-tune `shared/survival/tuning.js` (wolf counts/speeds, kill radius, bark range, +5 growth, 33% loss) across a real wolf night; the two-client co-op fun playtest. Any value change must keep the 9 sheep sim-baselines byte-identical and carries no wire change.
> - **Entrance hero FINAL shot** (media pass) - dial `tools/hero-capture.mjs` (CAM/TARGET/SUN_T) live to the `cycle68-validation/hero/manifest.md` framing.
> - **Grass far-ring Option A** (the Cycle 69 P2 viable-but-deferred win) - enable the existing meadow-quad LOD for coastline far chunks behind a SceneDef opt-in (37.6% grass-triangle cut, coast/relief-safe, parity with RH/OC). It is a VISUAL change to the hero-capture scene, so bundle it with the media pass and judge it with Matt's eye. Recipe in `cycle69-validation/grass/far-ring-spike.json`.
> - **`multiplayer.md` doc correction** (BLOCKED - needs Matt's explicit OK) - the Cycle 68 P1 remote-migration lines are wrong; the agent-config guardrail blocks Claude editing a `.claude/rules/*.md` file autonomously. Matt applies the staged text or grants the edit.

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

- **`shared/scenes/types.js`** - if the grass far-ring Option A ships, it adds an optional `grass.farRing` field (the cheap additive fence case). Name it here with the migration story before touching it.
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
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items (Cycle 69 carryover)
- [`docs/archive/cycles/cycle-69-plan.md`](archive/cycles/cycle-69-plan.md) - the cycle just closed
- [`cycle68-validation/hero/manifest.md`](../cycle68-validation/hero/manifest.md) - the hero-shot manifest
