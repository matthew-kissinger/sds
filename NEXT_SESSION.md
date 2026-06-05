# Next Session - Cycle 58 `solo-on-ramp`

> **Updated:** 2026-06-04
> **For:** Cycle 58 `solo-on-ramp` (IMPLEMENTED + DEPLOYED, not formally closed). Plan: [`docs/cycle-58-plan.md`](docs/cycle-58-plan.md).
> **Pickup priority:** Feel the per-biome ladder counts in-browser (they are a tunable strawman), then run `/cycle-close` to archive the plan, append BACKLOG, scaffold Cycle 59 (the 2 new game modes), and rewrite this file.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-58-plan.md`](docs/cycle-58-plan.md) (fully authored) -> the touched module's source.

## Where It Stands

**Cycle 57 `playthrough-repair` closed 2026-06-04.** Plan archived at [`docs/archive/cycles/cycle-57-plan.md`](docs/archive/cycles/cycle-57-plan.md); full closeout in [`docs/BACKLOG.md`](docs/BACKLOG.md). It repaired the end-of-run loop (paused-run leaderboard hiding, menu-return overlay/freeze, username view/set, submit feedback) and shipped + deployed 8/8 phases. Worker live, prod board clean, incident run id=16 restored.

**Cycle 58 `solo-on-ramp` is implemented and deployed (all 8 phases, one autonomous pass 2026-06-04).** Per-biome difficulty ladders (small fast tiers on the two islands, Home Field's four ranked anchors unchanged), Just Play dropped from 30 to 3 sheep, the off-by-one completion fixed, the leaderboard partition switched to `(scene, count)` (proven byte-identical for existing rows), and two friction-free naming touchpoints (post-score offer + inline entrance editor). No D1 migration, no wire change. The 2 new game modes are deferred to Cycle 59.

Validation at ship: `npm test` 934 pass / 0 fail / 7 skipped, `npm run build` clean (main 550 KiB), worker `tsc` clean, `eslint shared/` clean, sim-baseline byte-identical. The per-phase shipped notes live in the plan's [Progress](docs/cycle-58-plan.md) section.

**What is left before `/cycle-close`:** (1) feel the ladder counts in-browser (they are a tunable strawman; dial per biome if a tier reads wrong); (2) walk the plan's Success criteria with the user and run `/cycle-close`. The cycle is live on sheepdogsim.com but the Success-criteria checkboxes are intentionally left unchecked for the close ritual.

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
