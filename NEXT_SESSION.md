# Next Session - Cycle 62 `wolf-predator-mode` (scaffold, not authored)

> **Updated:** 2026-06-05
> **For:** Cycle 62 `wolf-predator-mode`. Plan: [`docs/cycle-62-plan.md`](docs/cycle-62-plan.md) (SCAFFOLD - header + a seeded Goal/open-questions only; phases not written).
> **Pickup priority:** Confirm the Cycle 62 direction with Matt, then fill in the plan's Goal + Phases before `/cycle-start`. The slug is a starting point: the wolf predator mode is the most teed-up direction (Cycle 61 shipped the wolf asset and the deterministic bark for exactly this), but the second mode edition and a tablet perf pass are also live candidates.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-62-plan.md`](docs/cycle-62-plan.md) -> the touched module's source once the plan names it.

## Where It Stands

**Cycle 61 `pastoral-finish-and-bark-wolf` closed 2026-06-05 and deployed via the close commit.** Plan archived at [`docs/archive/cycles/cycle-61-plan.md`](docs/archive/cycles/cycle-61-plan.md); full closeout in [`docs/BACKLOG.md`](docs/BACKLOG.md). Three of Matt's notes shipped in one cycle, built across three parallel tracks:

- **Pastoral finish (P1-P2):** retired the lingering Cycle 25 skeleton shimmer from the in-session scene-swap cover ([`js/components/ui/SceneSwapOverlay.tsx`](js/components/ui/SceneSwapOverlay.tsx), now pastoral glass; `.sds-skel` deleted) and restyled the remaining old-palette containers (Sandbox/Fence/Shape/2-player/Settings) + both victory overlays in [`js/boot/completionOverlay.js`](js/boot/completionOverlay.js) to the pastoral language, zero behavior change.
- **Bark verb (P3-P5):** a real player bark that drives sheep forward in the dog's facing, deterministic so it works in every solo mode AND multiplayer. New [`shared/BarkImpulse.js`](shared/BarkImpulse.js) (pure, trig-free, dot-product cone + distance falloff); bound to Space / gamepad RB / a mobile button; cooldown-gated; the no-bark sim-baseline stays byte-identical; an additive optional `bark` wire edge the DO applies authoritatively (no version bump). 17 new tests.
- **Wolf asset (P6):** the Quaternius CC0 wolf integrated as a render-only drop-in ([`js/Wolf.js`](js/Wolf.js) + a `?wolf=1` harness + [`docs/wolf-asset.md`](docs/wolf-asset.md)), wired into no mode - a ready asset for the predator mode.

**Validation:** `npm test` 1000 pass / 7 skip; build clean (ratchet main 555 -> 558 KiB, three 603 -> 604 KiB); worker tsc + eslint shared clean; sim-baseline + refactor-baseline goldens (terrain/scatter) unchanged. Browser smoke confirmed the bark stack end-to-end on Rolling Hills (a probe sheep driven to vz=4, the cooldown gating the second bark), the pastoral entrance with no skeleton, and the wolf harness animating.

## What to pick up next

**Cycle 62 is a scaffold - it needs a Goal + Phases before `/cycle-start`.** The seeded direction is the **wolf predator mode**: turn the Cycle 61 wolf asset into a playable antagonist (a deterministic `shared/WolfAI.js` that prowls/chases/scatters the flock, with the dog's existing bark event repelling it). The four seeded open questions (which mode, the win/lose stake, the AI shape, the wire/authority) are in the plan. Confirm with Matt whether this is the right next cycle (vs the second mode edition or a tablet perf pass), then author the phases.

**Reserved for Matt from Cycle 61 (paired, not a phase):** the bark feel constants in `DEFAULT_BARK_CONFIG` (range 12m, cone 50 deg, strength 6, cooldown 2.5s) and whether to add a small radial-startle component are a tunable strawman for a taste pass. The live prod end-to-end (a solo bark + an MP-room bark on the deployed build) verifies automatically.

## Open carryover (Matt review + deferred)

- **Wolf predator mode** (teed up - the Cycle 62 seeded direction; the wolf + bark were built for it).
- **Bark feel finalize** (Matt's taste on the bark constants) + optional radial-startle.
- **The second mode edition** - still deferred (the original post-Counting-Sheep idea).
- **Tablet draw-call perf** - the Tab S9 FE is draw-call-bound on Rolling Hills (~20k draws, 37 fps at 200 sheep); a candidate `tablet-perf-pass`.
- **Controller nav for the deferred surfaces** (settings, leaderboard, editors, MP lobby/rooms) + a 2D row-aware entrance focus order - see [`docs/cycle-60-controller-parity.md`](docs/cycle-60-controller-parity.md).
- **Counting naming + curve-feel** (Cycle 59/60 strawman) - Matt's standing taste call.
- **Sheep-to-sheep hard-body collision** (deferred from Cycle 56): its own future cycle.
- **Minor housekeeping (not blocking):** `/api/rename` parses the JSON body before the auth check (no-body POST returns 500 not 400, cosmetic). CI `actions/upload-artifact@v5` runs on Node 20; GitHub forces Node 24 on 2026-06-16.

## Working Contract

- The deterministic-sim discipline applies to any `shared/` change ([`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md)): name files, migration story, consumer updates in the same commit, regenerate sim-baseline goldens only with recorded acceptance.
- One phase in flight at a time. Mark the cycle plan checkbox as soon as a phase is done. Don't auto-pick up the next phase.
- Don't auto-bump the version. Player-visible releases stay explicit.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-62-plan.md`](docs/cycle-62-plan.md) (`wolf-predator-mode`, scaffold) |
| Latest closed cycle | [`docs/archive/cycles/cycle-61-plan.md`](docs/archive/cycles/cycle-61-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Wolf asset + predator design intent | [`docs/wolf-asset.md`](docs/wolf-asset.md) |
| Controller parity | [`docs/cycle-60-controller-parity.md`](docs/cycle-60-controller-parity.md) |
| Deterministic-sim rules | [`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
