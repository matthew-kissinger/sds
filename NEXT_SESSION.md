# Next Session - Cycle 60 `next-mode-edition` (scaffolded stub)

> **Updated:** 2026-06-05
> **For:** Cycle 60 `next-mode-edition` (slug is a placeholder). Plan: [`docs/cycle-60-plan.md`](docs/cycle-60-plan.md) (stub - Goal + Phases unwritten).
> **Pickup priority:** Decide the second mode edition with Matt (solo or MP, ranked or unranked, how it surfaces in the entrance family selector), then author the plan and run `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-60-plan.md`](docs/cycle-60-plan.md) -> the touched module's source once the plan names it.

## Where It Stands

**Cycle 59 `counting-sheep` closed 2026-06-05.** Plan archived at [`docs/archive/cycles/cycle-59-plan.md`](docs/archive/cycles/cycle-59-plan.md); full closeout in [`docs/BACKLOG.md`](docs/BACKLOG.md). Shipped the first new edition beside the solo path: Counting Sheep, a round-based solo mode where the flock grows each round and the running tally is the score. Two ranked curves (Incremental = +1 each round, Exponential = doubles each round, both clamped to the 5000 ceiling) on the two objective-free biomes (Home Field, Rolling Hills); Open Country excluded as a two-stage objective. It reuses the whole herding loop and changes only when sheep appear and what ends the run. No D1 migration, no wire change, no version bump. All 8 phases shipped; built end-to-end with commits held until close (Matt's cadence). Browser smoke green (a live Exponential run on Rolling Hills advanced rounds to 127 active and banked 63). The mode-family taxonomy lives in code (`familiesForWorld` + the shared `COUNTING_SCENE_IDS`), not a `SceneDef` field - a deliberate scope reduction that avoided touching the frozen scene schema.

**Cycle 60 is a scaffolded stub.** The Counting Sheep edition proved the pattern (a new mode family slots into `familiesForWorld`, a round controller stays client-side so the deterministic-sim tax is zero, the leaderboard reads live from `score_submissions` under new game_mode strings with no migration). The next edition can follow the same shape. The next step is the design conversation: pick the second edition, then author the plan.

## What to pick up next

Cycle 60 plan is scaffolded; needs Goal + Phases filled in after the mode-alignment. Run `/cycle-start` once the plan is authored.

## Open carryover (Matt review + deferred)

- **A second mode edition** is Cycle 60's whole scope (the original "two new game modes" framing narrowed to one edition in Cycle 59; "the next after" is now). Decide it with Matt before authoring. The shelved Time Attack / Trials idea is one candidate.
- **Counting Sheep live verification (post-deploy).** The close commit deploys automatically; after it, confirm the live prod end-to-end (the deploy itself, an Incremental-on-Home-Field live run, and the live leaderboard write client->worker->D1->board). The logic is fully proven by `tests/worker/counting-leaderboard.spec.ts` + `tests/counting-loop.spec.js`; this is the live cross-product check.
- **Counting Sheep naming + curve-feel** are a tunable strawman (Classic / Counting Sheep / Objective family names, Incremental / Exponential, "Bank and finish", the curve constants), reserved for Matt's in-browser voice/taste pass like the Cycle 58 ladder counts.
- **Optional `SceneDef.modeFamilies` field** - not needed (the shared constant suffices); revisit only if a scene needs a richer per-scene family structure.
- **Sheep-to-sheep hard-body collision** (deferred from Cycle 56): its own future cycle (needs jitter tuning + a spatial grid for 5,000-sheep perf).
- **Dog-to-sheep collision feel** (Cycle 56) and **grass footprint feel** (Cycle 55) remain Matt's in-browser review items.
- **Pastoral container restyle** (candidate near-term cycle). The setup/editor screens (Sandbox, Fence, Local-2P, Settings) and the non-React fallback victory overlays are still on the old palette. This is the explicitly-paused container-restyle program (~13 stateful containers); slot it as its own cycle if the full pastoral sweep is wanted.
- **Minor housekeeping (not blocking):** `/api/rename` parses the JSON body before the auth check, so a no-body POST returns 500 instead of 400 (cosmetic, no auth bypass). CI `actions/upload-artifact@v5` runs on Node 20; GitHub forces Node 24 on 2026-06-16.

## Working Contract

- The deterministic-sim discipline applies to any `shared/` change ([`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md)): name files, migration story, consumer updates in the same commit, regenerate sim-baseline goldens only with recorded acceptance.
- One phase in flight at a time. Mark the cycle plan checkbox as soon as a phase is done. Don't auto-pick up the next phase.
- Don't auto-bump the version. Player-visible releases stay explicit.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-60-plan.md`](docs/cycle-60-plan.md) (`next-mode-edition`, stub) |
| Latest closed cycle | [`docs/archive/cycles/cycle-59-plan.md`](docs/archive/cycles/cycle-59-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Deterministic-sim rules | [`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md) |
| Scene-as-data contract | [`.claude/rules/scene-and-render.md`](.claude/rules/scene-and-render.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
