# Next Session - Cycle 89 closed; Cycle 90 scaffolded (nsl-runtime-perf)

> **Updated:** 2026-06-10
> **For:** Cycle 90 (`docs/cycle-90-plan.md`, scaffold with slug `nsl-runtime-perf` - Matt confirms the goal, then `/cycle-start`).
> **Pickup priority:** (1) Fill the Cycle 90 Goal + Phases (NSL runtime perf is the proposed scope; candidates below), (2) Matt plays Home Field / Rolling Hills to feel-check the Cycle 89 stutter fix on the PC, (3) standing carryover (S24+ pass, golden re-capture, launch posting).

## Cold-Start Orientation

Read in order: this file -> [`docs/BACKLOG.md`](docs/BACKLOG.md) (Cycle 89 close entry at the top) -> [`docs/archive/cycles/cycle-89-plan.md`](docs/archive/cycles/cycle-89-plan.md) ("Mid-cycle reshape" section is the story) -> `DECISIONS.md` 2026-06-10 Cycle 89 entry.

## Where It Stands

**Cycle 89 (frame stability) shipped and closed 2026-06-10, same day it was scoped.** The small-scene stutter was WebGPU render-list churn: frustum-culled tree chunks re-entering the render list re-trigger GPU-process pipeline/bind-group setup (three.js #33685). Desktop tree chunks are now pinned (`js/world/TreePlacement.js`); driven probe shows worst frame 159.6 -> 20.9ms and 1%-low 20.3 -> 70+ FPS with zero visual change. The entrance defaults to Rolling Hills with Newsheepdogland marked Experimental (WIP). New durable rail: `npm run perf:jitter -- --check` (driven field/practice vs `cycle89-validation/jitter-budgets.json`, RTX-3070-local). Commits `a63e0a9`/`78ad541`/`20aefdc`/`c010f41`/`3afb100`/`f45c585`; final Deploy run `27315742590` green.

**Methodological rule that outlives the cycle:** perf probes must DRIVE the dog (move, weave, sprint, zoom). Idle capture understated the complaint 5x and missed the deep stalls entirely. The jitter probe drives by default.

## Cycle 90 proposed scope: NSL runtime perf

The original complaint that opened Cycle 89 ("NSL lags while moving around") is still open. Starting points:

- Rerun the driven jitter probe on Newsheepdogland (`npm run perf:jitter -- --scene=newsheepdogland --mode=survival`); the tool needs no changes.
- NSL trees ride the consolidated compute-cull path (coastline + WebGPU), not the per-chunk path Cycle 89 fixed - its churn profile is unmeasured.
- Evaluate the render-list-pin question for rocks/structures (trees-off still showed a small residual).
- Spike candidate from the R&D pass: TSL instancedArray + compute for impostor tile selection (kills the per-frame CPU rewrite; dgreenheck `webgpu-threejs-tsl` skill pattern).
- Goal at close: remove the Experimental (WIP) pill and restore NSL as a confident default candidate.

## Carryover (recorded in BACKLOG)

- **S24+ device pass** - settles Cycle 85/86/87 items, the Cycle 88 low-tier impostor island, and (new) confirms mobile tree culling unchanged after Cycle 89's desktop-only pin.
- **Screenshot golden re-capture** - goldens stale since 2026-05-16, fail 12/12 on clean main (mean SSIM 0.33). Re-capture only after Matt verifies current visuals look right.
- **Launch posting** from `docs/launch/` (drafts ready, Matt's voice).
- Q4 staging provisioning (optional).

## Working Contract

- No `shared/` deterministic-core edits; sim-baselines stay byte-identical.
- Matt publishes every player-facing artifact.
- Agent-launched Vite/Playwright sets `SDS_SUPPRESS_BROWSER_OPEN=1`; close every probe page/listener after use.
- Perf probes drive input; idle-camera numbers must not gate.
- CI e2e runs with `--grep-invert='@local-only'`. NSL e2e specs arm the world via the carousel before every Play (entrance resets to the Rolling Hills default on menu return).

## Reference Table

| Area | Source of truth |
|---|---|
| Next cycle plan (scaffold) | [`docs/cycle-90-plan.md`](docs/cycle-90-plan.md) |
| Jitter probe + rail | `tools/cycle89-jitter-probe.mjs`, `npm run perf:jitter [-- --check]` |
| Cycle 89 evidence | `cycle89-validation/` (local, gitignored) + `DECISIONS.md` 2026-06-10 entry |
| Closed cycles | [`docs/BACKLOG.md`](docs/BACKLOG.md) + [`docs/archive/cycles/`](docs/archive/cycles/) |
| Launch drafts (Matt to post) | [`docs/launch/`](docs/launch/) |
| Release log | [`CHANGELOG.md`](CHANGELOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
