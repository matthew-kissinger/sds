# Cycle 63 - wolf-predator-mode

> Drafted 2026-06-06 after Cycle 62 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Status: SCAFFOLD.** Confirm direction with Matt and fill in phases before `/cycle-start`. This restores the wolf-predator direction that Cycle 62 intentionally paused so sheep collision could ship first.

## Goal

(Draft - confirm with Matt.) Turn the Cycle 61 wolf asset into a playable antagonist. Cycle 61 left a ready drop-in: [`js/Wolf.js`](../js/Wolf.js) loads and animates the Quaternius CC0 wolf, and deterministic [`shared/BarkImpulse.js`](../shared/BarkImpulse.js) already drives sheep. This cycle would add a deterministic wolf that prowls, chases, and scatters the flock, and wire the dog's bark to repel it.

Before: the wolf is asset-only, reachable only via the `?wolf=1` harness. After: at least one mode spawns a wolf that pressures the flock, the dog's bark is a real counter, and the herding loop gains a predator-versus-shepherd dynamic.

## Open questions to resolve before writing code

1. **Q1: Which mode gets a wolf?** Author lean: a new opt-in edition rather than retrofitting Just Play or the solo ladder.
2. **Q2: What is the wolf's stake?** Author lean: the wolf scatters or steals sheep; bark repels it on cooldown. Avoid instant-fail pressure unless Matt wants a harder arcade mode.
3. **Q3: Wolf AI shape.** Author lean: deterministic `shared/WolfAI.js` state machine: prowl -> stalk -> chase -> flee-from-bark.
4. **Q4: Wire and authority.** Author lean: server-authoritative in multiplayer, client-side in solo, additive wolf snapshot field, no protocol break for old clients.

## Phase shape rules

A cycle has <= 8 phases. Each phase needs one sharp goal and EARS-format acceptance. A phase is either fully autonomous or fully paired.

## Phase 1 - <name> (~Xhr)

**Depends on:** direction confirmation.

1. ...

**Acceptance (EARS):**

- When Phase 1 ships, then the named system shall meet the acceptance behavior.

## Dependencies

```
Direction confirmation -> phase authoring -> implementation
```

## Frozen files

The durable fence is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). Expected touches, if this direction is confirmed:

- `shared/WolfAI.js` - new deterministic wolf behavior module.
- `shared/index.js` - export new shared module.
- Worker/client snapshot consumers - additive wolf state only.
- `tests/sim-baseline/__fixtures__/*.json` - regenerate only with recorded intentional behavior changes.

Do not touch frozen shared cores without explicit phase authorization.

## Hard stops

1. Do not add nondeterministic wolf behavior to `shared/`.
2. Do not introduce a wire-format break for in-flight multiplayer clients.
3. Do not regenerate sim-baseline fixtures merely to make tests pass.
4. Stop if the wolf turns the base herding loop into unavoidable failure rather than tactical pressure.

## Success criteria (cycle close)

- [ ] When `npm test` runs, all specs shall pass.
- [ ] When `npm run lint` runs, shared lint shall pass for any shared touches.
- [ ] When `npm run build` runs, the production build shall be clean.
- [ ] When the cycle closes, the wolf behavior shall be documented in `BACKLOG.md` or explicitly deferred.

## References

- [`docs/archive/cycles/cycle-61-plan.md`](archive/cycles/cycle-61-plan.md) - wolf asset and bark cycle
- [`docs/wolf-asset.md`](wolf-asset.md) - wolf source, license, rig mapping, and predator design intent
- [`docs/archive/cycles/cycle-62-plan.md`](archive/cycles/cycle-62-plan.md) - collision cycle redirected from this scaffold
- [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) - deterministic-sim discipline
- [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) - wire-protocol change contract
