# Next Session - Cycle 58 `solo-on-ramp`

> **Updated:** 2026-06-04
> **For:** Cycle 58 `solo-on-ramp` (OPEN, plan authored). Plan: [`docs/cycle-58-plan.md`](docs/cycle-58-plan.md).
> **Pickup priority:** Start Phase 1 (completion-count fix) — remove the `sheepRetired` double-count in `js/GameState.js` so solo runs complete at N of N, not N-1.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-58-plan.md`](docs/cycle-58-plan.md) (fully authored) -> the touched module's source.

## Where It Stands

**Cycle 57 `playthrough-repair` closed 2026-06-04.** Plan archived at [`docs/archive/cycles/cycle-57-plan.md`](docs/archive/cycles/cycle-57-plan.md); full closeout in [`docs/BACKLOG.md`](docs/BACKLOG.md). It repaired the end-of-run loop (paused-run leaderboard hiding, menu-return overlay/freeze, username view/set, submit feedback) and shipped + deployed 8/8 phases. Worker live, prod board clean, incident run id=16 restored.

**Cycle 58 `solo-on-ramp` is the active cycle, plan authored and approved.** Goal: per-biome difficulty ladders (small fast tiers on the two islands, Home Field's ranked tiers unchanged), Just Play dropped from 30 to 3 sheep, the off-by-one completion fixed, and two friction-free naming touchpoints. The load-bearing constraint: **Home Field's existing leaderboard scores stay exactly where they are** (Phase 4 proves the leaderboard partition switch is byte-identical for existing rows). The 2 new game modes are explicitly deferred to Cycle 59.

8 phases, all autonomous. Phase 1 (completion-count fix) ships first — isolated, and it de-risks every small-count tier. Then Phase 2 (ladder as scene data) is the foundation for the worker phases (3->4->5) and the client wiring (6->7); Phase 8 (naming) is independent and lands last with `/validate`.

## Open carryover (Matt review + deferred)

- **Cycle 58 ladder numbers** are a tunable strawman (Home Field 3 / 25 / 200 / 1000 / 3000 / 5000; Rolling Hills 3 / 25 / 75 / 200 / 1000 / 5000; Open Country 3 / 25 / 50 / 150 / 600 / 5000). Feel them in-browser after Phase 6 and dial per biome.
- **Cycle 57 carryover:** live in-browser paused-run smoke (logic proven by `score-flow.spec.ts`); optional ownership check of `ids 2/7/8/14` ("Player") vs the incident `persistent_id`.
- **Dog-to-sheep collision feel** (Cycle 56) and **grass footprint feel** (Cycle 55) remain Matt's in-browser review items.
- **Sheep-to-sheep hard-body collision** (deferred from Cycle 56): its own future cycle (needs jitter tuning + a spatial grid for 5,000-sheep perf).

## Working Contract

- The deterministic-sim discipline applies to any `shared/` change ([`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md)): name files, migration story, consumer updates in the same commit, regenerate sim-baseline goldens only with recorded acceptance. Cycle 58 touches `shared/ObjectiveLogic.js` (Phase 7) and the `SceneDef` schema `shared/scenes/types.js` (Phase 2) — both authorized in the plan's Frozen files section.
- Count-as-identity over existing columns: **no D1 migration, no wire-protocol change** this cycle (Hard stop 3).
- One phase in flight at a time. Mark the cycle plan checkbox as soon as a phase is done. Don't auto-pick up the next phase.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-58-plan.md`](docs/cycle-58-plan.md) (`solo-on-ramp`) |
| Latest closed cycle | [`docs/archive/cycles/cycle-57-plan.md`](docs/archive/cycles/cycle-57-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Deterministic-sim rules | [`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md) |
| Scene-as-data contract | [`.claude/rules/scene-and-render.md`](.claude/rules/scene-and-render.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
