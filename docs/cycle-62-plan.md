# Cycle 62 — wolf-predator-mode

> Drafted 2026-06-05 after Cycle 61 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Status: SCAFFOLD.** Header + a seeded Goal/open-questions only. Confirm direction with Matt and fill in the phases before running `/cycle-start`. The slug is a starting point, not a commitment - the wolf predator mode is the most teed-up direction (Cycle 61 shipped the wolf asset and the deterministic bark for exactly this), but the second mode edition and a tablet perf pass are also live carryover candidates.

## Goal

(Draft - confirm with Matt.) Turn the Cycle 61 wolf asset into a playable antagonist. Cycle 61 left a ready drop-in: [`js/Wolf.js`](../js/Wolf.js) loads + animates the Quaternius CC0 wolf, and the deterministic [`shared/BarkImpulse.js`](../shared/BarkImpulse.js) already drives sheep. This cycle would add a deterministic wolf that prowls, chases, and scatters the flock, and wire the dog's bark to repel it (the design intent recorded in [`wolf-asset.md`](wolf-asset.md)). Before: the wolf is asset-only, reachable only via the `?wolf=1` harness. After: at least one mode spawns a wolf that pressures the flock, the dog's bark is a real counter, and the herding loop gains a predator-versus-shepherd dynamic. The deterministic-sim discipline applies in full (a new `shared/WolfAI.js`, an additive wolf wire field, sim-baseline regeneration with recorded acceptance) - the same fence contract the bark followed in Cycle 61.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile, Tab S9 FE) before committing to a technique.
- **Pick the simplest thing that meets the budget** rather than the most impressive.

## Open questions to resolve before writing code

(Prefix with **Q1**, **Q2**, ... so phases can refer to them. Seeded from the Cycle 61 wolf-asset design intent - refine with Matt.)

1. **Q1: Which mode(s) get a wolf, and is it a new edition or an option on an existing mode?** Author lean: a new mode/edition rather than retrofitting Just Play or the solo ladder, so the predator pressure is opt-in.
2. **Q2: What is the wolf's win/lose stake?** Author lean: the wolf scatters/steals sheep (reduces the penned/counted total or fails the run if it reaches the flock), the bark repels it on a cooldown - a tactical tension, not instant death.
3. **Q3: Wolf AI shape.** Author lean: a deterministic `shared/WolfAI.js` (state machine: prowl -> stalk -> chase -> flee-from-bark) using the same trig-free vector discipline as `BarkImpulse.js`; the bark event from Cycle 61 P4 feeds the flee state.
4. **Q4: Wire + authority.** The wolf is server-authoritative in MP (like the sheep): a new additive wolf field in the snapshot, the DO ticks `WolfAI`, clients render. Single-player runs it client-side against the same module. Carry the full four-piece wire-change migration story (`multiplayer.md`).

These don't block scaffolding but should be resolved before the AI/wire phases.

## Architecture / shared changes

(Fill in once direction is confirmed. Expected: a new deterministic `shared/WolfAI.js` exported from `shared/index.js`; an additive wolf field on the snapshot + an optional wolf-spawn flag; sim-baseline regeneration with recorded acceptance. The wolf-repel reuses the Cycle 61 bark event unchanged.)

## Phase shape rules

A cycle has **<= 8 phases**, each with a single sharp goal and EARS-format acceptance. A phase is either fully autonomous or fully paired (no mixed mode within a phase).

## Acceptance criteria — EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/):

- **Event-driven**: `When [trigger], the [system] shall [response].`
- **State-driven**: `While [precondition], the [system] shall [response].`
- **Unwanted-event**: `If [unwanted], then the [system] shall [response].`

## Phase 1 — <name> (~Xhr)

**Independently testable.** <Why this phase comes first.>

1. **Step.** Description + [`file path`](path).

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.

## Phase 2 — <name> (~Xhr)

**Depends on:** <Phase 1 / nothing / etc.>

1. ...

**Acceptance (EARS):** ...

## Dependencies

```
Phase 1 -> Phase 2 + Phase 3 (parallel) -> Phase 4
```

## Frozen files (cycle-specific additions)

The durable fence is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). Expected cycle touches (name them per-phase with a migration story): `shared/index.js` (barrel), the wire/snapshot shape, `tests/sim-baseline/__fixtures__/*.json` (regenerate with recorded acceptance).

## Hard stops

Durable hard stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. (Cycle-specific addition.)

## What NOT to do during this cycle

(Cycle-specific list.)

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, the sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] (Cycle-specific qualitative criteria.)

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/wolf-asset.md`](wolf-asset.md) - the Cycle 61 wolf asset + the predator-mode design intent this cycle builds on
- [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) - deterministic-sim discipline (the wolf AI phases)
- [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) - wire-protocol change contract (the wolf wire field)
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items
- [`docs/archive/cycles/cycle-61-plan.md`](archive/cycles/cycle-61-plan.md) - pastoral finish + bark + wolf asset (prior cycle)
- [EARS notation](https://kiro.dev/docs/specs/) - testable acceptance lines
