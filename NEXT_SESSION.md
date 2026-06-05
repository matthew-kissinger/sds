# Next Session - Cycle 60 `playtest-and-controller` (shipped + deployed, pending playtest)

> **Updated:** 2026-06-05
> **For:** Cycle 60 `playtest-and-controller`. Plan: [`docs/cycle-60-plan.md`](docs/cycle-60-plan.md) (all 8 phases shipped - see the "Build status" section).
> **Pickup priority:** Playtest on prod (sheepdogsim.com) with a controller and the tablet, capture notes, finalize the Counting naming + curve feel (P7), then run `/cycle-close`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-60-plan.md`](docs/cycle-60-plan.md) -> the touched module's source once the plan names it.

## Where It Stands

**Cycle 59 `counting-sheep` closed 2026-06-05 and is live in prod.** Plan archived at [`docs/archive/cycles/cycle-59-plan.md`](docs/archive/cycles/cycle-59-plan.md); full closeout in [`docs/BACKLOG.md`](docs/BACKLOG.md). Shipped Counting Sheep, the first new edition beside the solo path: a round-based solo mode where the flock grows each round and the running tally is the score (Incremental +1/round, Exponential doubles/round, both clamped to 5000) on Home Field + Rolling Hills. Re-deploy run `27028992402` (commit `3b1bc21`) is GREEN. A post-close e2e hotfix renamed the standard entrance mode-family `Classic` -> `Solo` (id `classic` -> `solo` in `worlds.ts`) to clear a Playwright strict-mode collision with the `Classic <count>` difficulty rung, and hardened the 4 e2e difficulty selectors to `/Classic\s+\d/i`. One Cycle 59 item is still open: a manual in-browser live-leaderboard-write smoke (the SQL is proven by the worker harness) - it folds into Cycle 60 Phase 7.

**Cycle 60 `playtest-and-controller` shipped end-to-end and deployed to prod (2026-06-05).** All 8 phases landed; the formal `/cycle-close` waits on Matt's playtest sign-off. The headline finding: gamepad GAMEPLAY already existed (`js/GamepadManager.js` drives the dog, sprint, camera, and Start-pause), but the React menus had zero focus model, so a controller could not operate a single menu. The cycle adds one additive primitive - `useMenuNavigation` over `js/input/menuNav.js` + `js/input/menuGamepad.js` - that roves native focus with the d-pad / stick / arrow keys (A or Enter activates, B / Escape backs out); every existing mouse/touch path is untouched and the amber ring only shows on the first directional input. Also shipped: a `?stats=1` dependency-free perf chip, a private-LAN service-worker fix (no stale tablet builds), Y/X/Select in-game gamepad buttons (camera / bank / note), and an opt-in in-game playtest note capture (`?notes=1`) that saves notes with session context. Controller-complete on the core loop (entrance, pause, completion, in-game); settings/leaderboard/editors/MP are deferred to mouse/touch (`docs/cycle-60-controller-parity.md`). Client-only: no shared/, Worker, D1, SceneDef, or wire change.

## What to pick up next

**Matt's playtest, then close.** Play on prod with a controller and on the tablet:
- Drive the whole loop from the pad (entrance -> Play -> pause -> bank -> completion -> Play Again) and confirm focus + the amber ring feel right.
- On the tablet, append `?stats=1` (perf chip) and use the N key / Select / the right-edge tab to capture notes; export as JSON. Tablet how-to: [`docs/playtest-tablet.md`](docs/playtest-tablet.md).
- Finalize P7 (paired): the family/curve names and the curve-feel constants in `js/gamestate/countingMode.js`, plus the live Incremental-on-Home-Field leaderboard write.

After sign-off, run `/cycle-close` (archive the plan, append BACKLOG, scaffold Cycle 61, rewrite this file). If the playtest surfaces fixes, fold them in first.

## Open carryover (Matt review + deferred)

- **Cycle 59 reserved items** (now Cycle 60 Phase 7, paired): finalize the family/curve naming (Solo / Counting Sheep / Objective, Incremental / Exponential, "Bank and finish"), tune the curve constants in `js/gamestate/countingMode.js`, run the live Incremental-on-Home-Field leaderboard smoke, and capture the tablet perf baseline.
- **Second mode edition** - deferred again to a future cycle (the original "two new game modes" framing narrowed to one in Cycle 59). The Time Attack / Trials idea is one candidate.
- **Sheep-to-sheep hard-body collision** (deferred from Cycle 56): its own future cycle (needs jitter tuning + a spatial grid for 5,000-sheep perf).
- **Dog-to-sheep collision feel** (Cycle 56) and **grass footprint feel** (Cycle 55) remain Matt's in-browser review items.
- **Pastoral container restyle** (candidate near-term cycle): the setup/editor screens (Sandbox, Fence, Local-2P, Settings) and the non-React fallback victory overlays are still on the old palette (~13 stateful containers, the explicitly-paused restyle program).
- **Minor housekeeping (not blocking):** `/api/rename` parses the JSON body before the auth check, so a no-body POST returns 500 instead of 400 (cosmetic, no auth bypass). CI `actions/upload-artifact@v5` runs on Node 20; GitHub forces Node 24 on 2026-06-16.

## Working Contract

- The deterministic-sim discipline applies to any `shared/` change ([`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md)): name files, migration story, consumer updates in the same commit, regenerate sim-baseline goldens only with recorded acceptance. Cycle 60 is client-only except the one bounded `COUNTING_HARD_CEILING` case in Phase 7.
- One phase in flight at a time. Mark the cycle plan checkbox as soon as a phase is done. Don't auto-pick up the next phase.
- Don't auto-bump the version. Player-visible releases stay explicit.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-60-plan.md`](docs/cycle-60-plan.md) (`playtest-and-controller`, shipped + deployed) |
| Latest closed cycle | [`docs/archive/cycles/cycle-59-plan.md`](docs/archive/cycles/cycle-59-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Deterministic-sim rules | [`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md) |
| Scene-as-data contract | [`.claude/rules/scene-and-render.md`](.claude/rules/scene-and-render.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
