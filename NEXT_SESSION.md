# Next Session - Cycle 61 `pastoral-container-restyle` (scaffolded stub)

> **Updated:** 2026-06-05
> **For:** Cycle 61 `pastoral-container-restyle`. Plan: [`docs/cycle-61-plan.md`](docs/cycle-61-plan.md) (stub - Goal + Phases unwritten).
> **Pickup priority:** Confirm the container scope/order with Matt, author the Cycle 61 plan, then run `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-61-plan.md`](docs/cycle-61-plan.md) -> the touched module's source once the plan names it.

## Where It Stands

**Cycle 60 `playtest-and-controller` closed 2026-06-05 and is live in prod.** Plan archived at [`docs/archive/cycles/cycle-60-plan.md`](docs/archive/cycles/cycle-60-plan.md); full closeout in [`docs/BACKLOG.md`](docs/BACKLOG.md). Made the whole loop drivable from a controller (one additive `useMenuNavigation` primitive roves native focus across the entrance, pause, and completion; Y/X/Select in-game buttons) and stood up a tablet testing baseline (a dependency-free `?stats=1` perf chip, a private-LAN service-worker fix, and an opt-in in-game playtest note capture). Client-only: no shared/, Worker, D1, SceneDef, or wire change. Deployed green (CI run `27032616554`, commit `aaee108`) and confirmed on the real Tab S9 FE; Matt confirmed the controller loop, the live note capture, and the live leaderboard write in a prod playtest.

**Cycle 61 is a scaffolded stub.** The chosen focus is the paused Pastoral UI program: the setup and editor containers (Sandbox setup, Fence editor, Shape editor, 2-player local setup, Settings) plus the non-React fallback victory overlays are still on the old tech palette while the entrance, HUD, pause, and completion are pastoral. The next step is the design conversation: confirm which of the ~13 stateful containers to restyle and in what order, then author the plan.

## What to pick up next

Cycle 61 plan is scaffolded; needs Goal + Phases filled in after the scope conversation (Q1: which containers, in what order; Q2: convert or retire the non-React fallback overlay). Run `/cycle-start` once the plan is authored.

## Open carryover (Matt review + deferred)

- **Counting naming + curve-feel** (from Cycle 59/60): the family/curve names and the curve constants in `js/gamestate/countingMode.js` are a tunable strawman, Matt's standing taste call. Not a blocker.
- **Tablet draw-call perf** (surfaced by the Cycle 60 baseline): the Tab S9 FE is draw-call-bound on Rolling Hills (~20k draw calls, 37 fps at 200 sheep). A candidate for a dedicated perf pass (`tablet-perf-pass`).
- **Controller nav for the deferred surfaces** (settings, leaderboard, sandbox/fence/shape editors, MP lobby/rooms) and a 2D row-aware entrance focus order - see [`docs/cycle-60-controller-parity.md`](docs/cycle-60-controller-parity.md).
- **A second mode edition** - still deferred (the original post-Counting-Sheep idea).
- **Sheep-to-sheep hard-body collision** (deferred from Cycle 56): its own future cycle (needs jitter tuning + a spatial grid for 5,000-sheep perf).
- **Minor housekeeping (not blocking):** `/api/rename` parses the JSON body before the auth check, so a no-body POST returns 500 instead of 400 (cosmetic, no auth bypass). CI `actions/upload-artifact@v5` runs on Node 20; GitHub forces Node 24 on 2026-06-16.

## Working Contract

- The deterministic-sim discipline applies to any `shared/` change ([`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md)): name files, migration story, consumer updates in the same commit, regenerate sim-baseline goldens only with recorded acceptance.
- One phase in flight at a time. Mark the cycle plan checkbox as soon as a phase is done. Don't auto-pick up the next phase.
- Don't auto-bump the version. Player-visible releases stay explicit.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-61-plan.md`](docs/cycle-61-plan.md) (`pastoral-container-restyle`, stub) |
| Latest closed cycle | [`docs/archive/cycles/cycle-60-plan.md`](docs/archive/cycles/cycle-60-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Controller parity | [`docs/cycle-60-controller-parity.md`](docs/cycle-60-controller-parity.md) |
| Tablet playtest how-to | [`docs/playtest-tablet.md`](docs/playtest-tablet.md) |
| Deterministic-sim rules | [`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
