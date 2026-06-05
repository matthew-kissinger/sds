# Next Session - Cycle 59 `new-game-modes` (scaffolded stub)

> **Updated:** 2026-06-05
> **For:** Cycle 59 `new-game-modes` (slug is a placeholder). Plan: [`docs/cycle-59-plan.md`](docs/cycle-59-plan.md) (stub - Goal + Phases unwritten).
> **Pickup priority:** Align with Matt on what the two new game modes are (solo or MP, ranked or unranked, how each surfaces in the entrance), then author the plan and run `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-59-plan.md`](docs/cycle-59-plan.md) -> the touched module's source once the plan names it.

## Where It Stands

**Cycle 58 `solo-on-ramp` closed 2026-06-05.** Plan archived at [`docs/archive/cycles/cycle-58-plan.md`](docs/archive/cycles/cycle-58-plan.md); full closeout in [`docs/BACKLOG.md`](docs/BACKLOG.md). It made solo runs approachable on the two islands and fast to start everywhere (per-biome difficulty ladders, Just Play 30 to 3 sheep), fixed the off-by-one solo completion, switched the solo leaderboard to count-as-identity `(scene, sheep_count)` proven byte-identical for existing rows, and added two friction-free naming touchpoints. No D1 migration, no wire change, no version bump. Shipped + deployed all 8 phases; Matt confirmed the ladder feel in-browser. A pre-close CI fix (`9892173`) also repaired the nightly macOS Safari smoke, which had driven the removed pre-Cycle-51 start-screen buttons since the entrance rework.

**Cycle 59 is a scaffolded stub.** The count-as-identity leaderboard partition from Cycle 58 was built specifically so a new mode drops in without a schema change. The next step is the design conversation: pick the two modes, then author the plan.

## What to pick up next

Cycle 59 plan is scaffolded; needs Goal + Phases filled in after the mode-alignment. Run `/cycle-start` once the plan is authored.

## Open carryover (Matt review + deferred)

- **Two new game modes** are Cycle 59's whole scope. Decide them with Matt before authoring.
- **Sheep-to-sheep hard-body collision** (deferred from Cycle 56): its own future cycle (needs jitter tuning + a spatial grid for 5,000-sheep perf).
- **Cycle 57 carryover:** live in-browser paused-run smoke (logic proven by `score-flow.spec.ts`); optional ownership check of `ids 2/7/8/14` ("Player") vs the incident `persistent_id`.
- **Dog-to-sheep collision feel** (Cycle 56) and **grass footprint feel** (Cycle 55) remain Matt's in-browser review items.
- **Pastoral container restyle** (candidate near-term cycle). The win/end screen + HUD sheep glyph were pastoralized at the Cycle 58 close (`dae8c31`), but the setup/editor screens (Sandbox, Fence, Local-2P, Settings) and the non-React fallback victory overlays are still on the old palette. This is the explicitly-paused container-restyle program (~13 stateful containers); slot it as its own cycle if the full pastoral sweep is wanted.
- **Minor housekeeping (not blocking):** `/api/rename` parses the JSON body before the auth check, so a no-body POST returns 500 instead of 400 (cosmetic, no auth bypass). CI `actions/upload-artifact@v5` runs on Node 20; GitHub forces Node 24 on 2026-06-16.

## Working Contract

- The deterministic-sim discipline applies to any `shared/` change ([`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md)): name files, migration story, consumer updates in the same commit, regenerate sim-baseline goldens only with recorded acceptance.
- One phase in flight at a time. Mark the cycle plan checkbox as soon as a phase is done. Don't auto-pick up the next phase.
- Don't auto-bump the version. Player-visible releases stay explicit.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-59-plan.md`](docs/cycle-59-plan.md) (`new-game-modes`, stub) |
| Latest closed cycle | [`docs/archive/cycles/cycle-58-plan.md`](docs/archive/cycles/cycle-58-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Deterministic-sim rules | [`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md) |
| Scene-as-data contract | [`.claude/rules/scene-and-render.md`](.claude/rules/scene-and-render.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
