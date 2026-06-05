# Next Session - Cycle 61 `pastoral-finish-and-bark-wolf` (authored, not started)

> **Updated:** 2026-06-05
> **For:** Cycle 61 `pastoral-finish-and-bark-wolf`. Plan: [`docs/cycle-61-plan.md`](docs/cycle-61-plan.md) (authored - 7 phases, Goal + Acceptance written).
> **Pickup priority:** All open questions resolved (bark pushes SHEEP, deterministic/all-modes, cooldown-gated; wolf is ASSET-ONLY; Q1 bindings = Space + gamepad RB + mobile; Q4 = restyle both completion overlays in `js/boot/completionOverlay.js` to pastoral, keep the React-fallback safety net). Ready to run `/cycle-start` and pick up Phase 1.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-61-plan.md`](docs/cycle-61-plan.md) -> the touched module's source once the plan names it.

## Where It Stands

**Cycle 60 `playtest-and-controller` closed 2026-06-05 and is live in prod.** Plan archived at [`docs/archive/cycles/cycle-60-plan.md`](docs/archive/cycles/cycle-60-plan.md); full closeout in [`docs/BACKLOG.md`](docs/BACKLOG.md). Made the whole loop drivable from a controller (one additive `useMenuNavigation` primitive roves native focus across the entrance, pause, and completion; Y/X/Select in-game buttons) and stood up a tablet testing baseline (a dependency-free `?stats=1` perf chip, a private-LAN service-worker fix, and an opt-in in-game playtest note capture). Client-only: no shared/, Worker, D1, SceneDef, or wire change. Deployed green (CI run `27032616554`, commit `aaee108`) and confirmed on the real Tab S9 FE; Matt confirmed the controller loop, the live note capture, and the live leaderboard write in a prod playtest.

**Cycle 61 is authored (2026-06-05, reframed after alignment).** Matt folded three notes into one cycle: (1) the lingering skeleton loader, (2) a real bark mechanic, (3) a wolf. Decisions confirmed in conversation: **bark pushes SHEEP** (the herding verb, a forward directional drive in the dog's facing) and is **deterministic** so it works in every solo mode AND multiplayer; the **wolf is ASSET-ONLY** this cycle (Quaternius CC0, integrated + documented as a ready drop-in for a future predator mode, NOT wired into any current mode - no wolf AI, no wolf in the sim, no wolf on the wire). The same bark event is designed to also repel a wolf later (documented future intent, not code). 7 phases: P1 retire the skeleton, P2 restyle the remaining stateful containers (zero behavior change), P3-P5 bark command -> deterministic sheep impulse (`shared/BarkImpulse.js`) -> wire, P6 wolf asset integration + `docs/wolf-asset.md`, P7 bark tuning across modes + close. Only bark touches the fences (new `shared/BarkImpulse.js`, additive call sites in the 3 sheep-tick consumers, an additive optional `bark` wire edge, sim-baseline regen that keeps no-bark fixtures byte-identical). The wolf touches no fence.

## What to pick up next

The plan is authored with all open questions resolved - ready for `/cycle-start`. Q1 bark bindings = Space + gamepad RB + mobile button; Q4 = restyle both victory overlays in `js/boot/completionOverlay.js` to pastoral in P2 (the `showLocalCompletionOverlay` 2-player screen is the live one, not a fallback; keep the React-fallback safety net); Q3 (no wolf in any mode) + Q5 (bark-repel = future intent) resolved. The UI track (P1-P2), the bark track (P3-P5), and the wolf asset (P6) are all independent and can run in parallel. Start with Phase 1 (retire the skeleton loader) - smallest, unblocks the pastoral-cover consistency.

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
| Active cycle | [`docs/cycle-61-plan.md`](docs/cycle-61-plan.md) (`pastoral-finish-and-bark-wolf`, authored) |
| Latest closed cycle | [`docs/archive/cycles/cycle-60-plan.md`](docs/archive/cycles/cycle-60-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Controller parity | [`docs/cycle-60-controller-parity.md`](docs/cycle-60-controller-parity.md) |
| Tablet playtest how-to | [`docs/playtest-tablet.md`](docs/playtest-tablet.md) |
| Deterministic-sim rules | [`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
