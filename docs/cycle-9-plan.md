# Cycle 9 — playtest-and-polish

> Drafted 2026-04-26 after Cycle 8 (`mode-matrix`: modes × sheep counts × scenes × leaderboards) closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

One paragraph. What's this cycle for? What's the **user-visible** difference between "before" and "after"? If you can't write this paragraph clearly, the cycle isn't ready to start.

**Starter context (fill in or replace):** Cycle 8 shipped a large code surface — sheep-count matrix, partitioned leaderboards, sandbox on island scenes, MP scope expansion, follow-camera triangulation polish — but most of its acceptance criteria are *playtest-confirmed*, not test-confirmed. Cycle 9 is the verification + tuning pass. Walk the deferred Cycle 8 carryover items, measure MP bandwidth at 500/1000 sheep (Q4), tune the new follow-camera Phase 6 fixes if needed, and address whatever the playtest surfaces. Pull in small Cycle 7 carry-over polish items only if Cycle 9 has spare cycles after verification.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code. The ecosystem evolves; what was "the" solution last cycle may not be optimal now.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing to a technique. Use `PerformanceMonitor` and the per-system triangle breakdown.
- **Pick the simplest thing that meets the budget** rather than the most impressive. If the simple version reads correctly, ship it; escalate only on demonstrated need.

## Open questions to resolve before writing code

(Prefix with **Q1**, **Q2**, ... so phases can refer to them.)

1. **Q1: Cycle 8 playtest verdict on each acceptance item.** Walk the Cycle 8 carryover list (below) end-to-end. Mark each item green / yellow / red.
2. **Q2: MP bandwidth at 500/1000 sheep.** Measure WS+MessagePack throughput on a representative consumer connection. If bandwidth holds at 1000, lift the cap to 3000. If it doesn't, document the cap and consider delta compression.

## Cycle 8 carry-over (deferred from `mode-matrix` close)

These were code-complete at Cycle 8 close but needed live playtest to confirm. Cycle 9 Phase 1 is to verify each:

- Insane / Chaos modes spawn the right sheep count on Field, RH, and OC (cluster-aware spawn + density-driven radius scaling).
- Insane and Chaos leaderboards are populated cleanly and no longer pollute soloClassic.
- Per-(mode × scene × sheepCount) partition filters return the right rows in the leaderboard UI.
- Sandbox launches cleanly on Rolling Hills and Open Country, including the cross-scene reload UX.
- MP rooms can pick non-200 sheep counts up to the Cycle 8 cap of 1000.
- Cycle 6 + 7 playtest carryover items 1-6 (camera triangulation matrix on RH Follow under stamina-out + tree contact, OC gather→drive verb at 40/2.0, frametime budget on OC).
- Phase 6 follow-camera triangulation polish reads smooth on RH Follow under stamina-out + tree contact (no clipping on ascent, no camera lurch on tree graze, no facing-flip when dog stops).
- No frametime regression on RTX 3070 desktop or mobile target.

## Phase 1 — Cycle 8 acceptance walkthrough (~1hr)

**Independently testable.** Verifies what shipped in Cycle 8 actually works in users' hands.

(Drive the carryover list above. For each item, document green / yellow / red and any observed defects.)

**Acceptance:** explicit verdict on each carryover item.

## Phase 2 — MP bandwidth measurement + tune (~2hr)

**Depends on:** Phase 1.

(Q2 — measure 500-sheep and 1000-sheep MP rooms on a representative consumer connection. PerformanceMonitor + WS bandwidth telemetry. Decide whether to raise the cap, hold at 1000, or lower.)

**Acceptance:** documented bandwidth + sim cost numbers + the chosen cap.

## Phase 3 — Tune from Phase 1 findings (TBD)

**Depends on:** Phase 1.

(Numbers to potentially tune based on Phase 1 feel: density-scaled spawn radius, follow-camera Phase 6 ridge sample / floor smoothing, OC objective requiredSheep / holdRequired.)

**Acceptance:** TBD per the tuning that lands.

## Dependencies

```
Phase 1 (verification) → Phase 2 (bandwidth) → Phase 3 (tuning) [optional]
```

## Frozen files (cycle-specific additions)

- `tests/sim-baseline/` — DO NOT regenerate fixtures.
- `worker/migrations/` — append-only.

## Hard stops

Surface to the user, do not proceed:

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure that you don't understand — don't regenerate fixtures, escalate.
3. Visual regression on a previously-passing scene — fix or revert before adding new scope.
4. Phase 2 bandwidth measurement showing the wire is overloaded at 200 (the existing baseline) — that's a Cycle 8 regression and should be diagnosed before any cap change.

## What NOT to do during this cycle

- Don't add new scenes. Three is still the right number.
- Don't reopen multiplayer architecture.
- Don't touch `shared/MovementPhysics.js` `updateMovement` to insert obstacle logic.
- Don't merge `canStartSprint` and `canContinueSprint`.
- Don't regenerate `tests/sim-baseline/` fixtures.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] All phases shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] Live on sheepdogsim.com via GH Actions.
- [ ] All Cycle 8 carryover items verified or explicitly deferred.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-8-plan.md`](archive/cycles/cycle-8-plan.md) — prior cycle (Cycle 8 mode-matrix)
- [`docs/archive/cycles/`](archive/cycles/) — past cycle plans
