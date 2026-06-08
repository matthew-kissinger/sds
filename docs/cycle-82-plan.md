# Cycle 82 — feel-and-media-live

> Drafted 2026-06-08 after Cycle 81 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **SCAFFOLD ONLY.** The 7-cycle WebGPU-pin epic closed with Cycle 81 (the flagship lifted live on desktop WebGPU). The next direction is an open choice - fill in the Goal + phases below at `/cycle-start`. The slug `feel-and-media-live` reflects the standing deferred player-visible thread; repoint it if Matt names a different direction.

## Goal

TODO (fill in at `/cycle-start`). One paragraph. What's the **user-visible** difference between "before" and "after"? Candidates from the carryover: the deferred `feel-and-media-live` thread (survival-feel retune, two-dog co-op playtest, entrance hero blessing), or mobile WebGPU validation once a WebGPU-capable mobile device is on hand.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

## Open questions to resolve before writing code

(Prefix with **Q1**, **Q2**, ...)

1. **Q1: <Question>?** Author lean: <answer>.

## Phase 1 — <name> (~Xhr)

**Independently testable.** <Why this phase comes first.>

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.

## Dependencies

```
Phase 1 → ...
```

## Frozen files (cycle-specific additions)

- (Cycle-specific additions, if any. Often empty — the durable fence is enough.)

## Hard stops

Durable hard stops apply on every cycle — see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. (Cycle-specific addition.)

## What NOT to do during this cycle

- Don't regress the Cycle 81 flagship WebGPU lift (mesh consolidation, pixel-identical grass, lod0 trees). The guard `tools/webgpu-flagship-lift-gate-cycle81.mjs` (`GUARD=1`) asserts the counts.
- Don't lift the mobile WebGL pin without a real WebGPU-capable mobile device + a within-budget flagship cold-load.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-81-plan.md`](archive/cycles/cycle-81-plan.md) — the WebGPU flagship lift (latest close)
