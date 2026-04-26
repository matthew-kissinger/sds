# Cycle 8 — playtest-sweep

> Drafted 2026-04-25 after Cycle 7 (camera + sky/water + OC outer-ring + multi-stage objective) closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

One paragraph. What's this cycle for? What's the **user-visible** difference between "before" and "after"? If you can't write this paragraph clearly, the cycle isn't ready to start.

**Starter context (fill in or replace):** Cycle 7 shipped camera fixes, sky/water polish, OC outer-ring rendering, and the OC multi-stage objective. The natural next cycle is a playtest sweep — verify everything reads right with the live deploy in users' hands, tune the round-up thresholds (40/2.0) up or down based on feel, and clear the Cycle 6 carry-over list (items 1-6 from the prior NEXT_SESSION). May also pull in small visual debt: octahedral tree impostors, the resize-behavior bug, MP joiner renderer sync. Decide scope after the first playtest pass.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code. The ecosystem evolves; what was "the" solution last cycle may not be optimal now.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing to a technique. Use `PerformanceMonitor` and the per-system triangle breakdown.
- **Pick the simplest thing that meets the budget** rather than the most impressive. If the simple version reads correctly, ship it; escalate only on demonstrated need.

## Open questions to resolve before writing code

(Prefix with **Q1**, **Q2**, ... so phases can refer to them.)

1. **Q1: Does the OC gather→drive at 40 sheep / 2.0 sec feel right after live-deploy playtest?** If too easy, raise. If still unachievable, drop further or reduce zone radius.
2. **Q2: Frametime budget on OC after FAR_LOD_DIST=400 + densityRange=0.92.** Open PerformanceMonitor on OC; check ≤ 0.4ms desktop / ≤ 1.5ms mobile per-tick obstacle query; check total frame budget.
3. **Q3: Are octahedral impostors worth the effort, or is the current billboard LOD acceptable now that the threshold is 400m?**

These don't block scaffolding (Phase 1) but should be resolved before scene-specific or content-specific phases.

## Architecture / shared changes

(If the cycle introduces a primitive or schema change shared across phases, describe it here. Otherwise delete this section.)

## Phase 1 — Live-deploy playtest sweep (~1hr)

**Independently testable.** Validates Cycle 7 in users' hands.

1. **Run the camera triangulation matrix** from the prior NEXT_SESSION on Rolling Hills. Stamina-out + tree contact in Follow.
2. **Drive the OC gather→drive loop** end-to-end. 40 sheep / 2.0s; portal opens; retirement works.
3. **Walk OC outer ring** and verify grass + mesh trees extend to the shore.
4. **Pitch up at the sky** in Follow on all three scenes; confirm no horizontal seam.
5. **Open PerformanceMonitor** (P key) on OC; verify per-tick obstacle-query ≤ 0.4ms desktop.
6. **Walk Cycle 6 carry-over items 1-6** (de facto verified during Cycle 7 playtest but explicit pass needed).

**Acceptance:** all checks pass or any failures captured as carry-over to Phase 2 / Phase 3.

## Phase 2 — Tuning pass (TBD hours, sized by Phase 1 findings)

**Depends on:** Phase 1.

Numbers to potentially tune based on Phase 1 feel:

- OC `objective.requiredSheep` and `holdRequired` ([shared/scenes/open-country.js](../shared/scenes/open-country.js))
- OC `flocking.perception` (currently 9; raise if flocks fragment, drop if they over-cluster)
- `DOG_OBSTACLE_STRENGTH` ([js/Sheepdog.js](../js/Sheepdog.js)) if dog avoidance feels too soft or too aggressive
- `FOLLOW_SPEEDNORM_TAU` / `FOLLOW_POS_K_MAX` ([js/CameraController.js](../js/CameraController.js)) if camera feels under- or over-damped
- `densityRange` per scene if grass coverage reads off

**Acceptance:** TBD per the tuning that lands.

## Phase 3 — Selected polish item (~3hr, optional)

**Depends on:** Phase 1 and Phase 2.

Pick zero or one of the open polish items:

- **Octahedral tree impostors v2** — replacing flat-billboard LOD past `FAR_LOD_DIST` with proper view-dependent octahedral impostors.
- **MP joiner renderer sync** — joiners on a different `?scene=` than the room currently see correct sim but mismatched visuals.
- **Resize-behavior audit** — camera/HUD don't always reseat correctly after a window resize.
- **Camera-relative tree LOD** — make `FAR_LOD_DIST` per-frame so smaller LOD distances become useful.

Pick after Phase 1 reveals which one playtest most wants.

**Acceptance:** depends on item picked.

## Dependencies

```
Phase 1 → Phase 2 (tuning derived from Phase 1) → Phase 3 (optional polish)
```

## Frozen files (cycle-specific additions)

These files require explicit task-brief authorization to modify within this cycle. The durable fence list is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md); add cycle-specific freezes here only if the work pattern requires extra discipline.

- None at draft time.

## Hard stops

Surface to the user, do not proceed:

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure that you don't understand — don't regenerate fixtures, escalate.
3. Visual regression on a previously-passing scene — fix or revert before adding new scope.
4. Frametime budget regression on OC after Phase 2/3 changes.

## What NOT to do during this cycle

- Don't add new scenes. Three is still the right number.
- Don't reopen multiplayer architecture.
- Don't touch `shared/MovementPhysics.js` `updateMovement` to insert obstacle logic.
- Don't merge `canStartSprint` and `canContinueSprint` (Cycle 7 split — preserves the exhaustion lock).
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed.
- Don't broaden Phase 3's polish list beyond the 4 starter items without explicit user agreement — this cycle is a sweep, not a refactor.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] All phases shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] Live on sheepdogsim.com via GH Actions.
- [ ] Camera triangulation matrix all-smooth on RH Follow (Cycle 7 carry-over).
- [ ] OC gather→drive verb feels right after tune.
- [ ] No frametime regression on RTX 3070 desktop or mobile target.
- [ ] All six Cycle 6 carry-over playtest items confirmed.
- [ ] Selected Phase 3 polish item shipped or explicitly deferred.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-7-plan.md`](archive/cycles/cycle-7-plan.md) — prior cycle (Cycle 7)
- [`docs/archive/cycles/`](archive/cycles/) — past cycle plans
