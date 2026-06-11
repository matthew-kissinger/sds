# Next Session - Cycle 90 closed; Cycle 91 scaffolded (nsl-budget-headroom)

> **Updated:** 2026-06-11
> **For:** Cycle 91 (`docs/cycle-91-plan.md`, scaffold with slug `nsl-budget-headroom` - Matt confirms the goal, then `/cycle-start`).
> **Pickup priority:** (1) Matt feel-checks Newsheepdogland on the live site (shadows, brighter ground, shore water, longer daylight, 72 FPS locked at full quality), (2) fill the Cycle 91 Goal + Phases (NSL budget headroom is the proposed scope; candidates below), (3) standing carryover (S24+ pass, golden re-capture after Matt approves the new NSL look, launch posting).

## Cold-Start Orientation

Read in order: this file -> [`docs/BACKLOG.md`](docs/BACKLOG.md) (Cycle 90 close entry at the top) -> [`docs/archive/cycles/cycle-90-plan.md`](docs/archive/cycles/cycle-90-plan.md) (gate table + Phase 8 status are the story) -> `DECISIONS.md` 2026-06-11 Cycle 90 entry.

## Where It Stands

**Cycle 90 (nsl-runtime-perf) shipped and closed 2026-06-11, one day after scoping.** Two halves:

1. **Perf:** NSL's 36 FPS quality-floor crawl was 220 `queue.submit()` calls per frame - Cycle 87's per-wave streaming had fanned the tree compute-cull out to 108 controllers, and each `renderer.compute()` is its own command encoder + submit in the three.js WebGPU backend. `TerrainBuilder._driveComputeCull` now batches every controller into ONE `renderer.compute(array)` call: 36 -> 144.9 median at full quality, zero visual change (SSIM differential + heatmaps). Durable rule of thumb: never call `renderer.compute()` per-controller in a per-frame loop.
2. **Visuals (Matt's mid-cycle directive):** WebGPU scenes had no shadows at all (the lighting-bridge directional never carried a shadow camera; NSL's world origin is open water so even an attached origin-pinned frustum could never land on the island). NSL now gets a 1024px +-70m dog-following, texel-snapped shadow frustum (day-loop-gated; grass never casts; small grassed scenes keep shadows off after a global config measured field at 48 FPS). Plus: lifted NSL ground palette (optional `TerrainDef.colors`), shallow-water band on coastline scenes (`minDepthT` 0.45), and a t=0.60 keyframe that holds daylight through the day phase.

**Shipped numbers:** NSL driven survival 72.5 FPS median locked at full quality with shadows (was 36 at the floor, no shadows). Field rail 144.9 median / 137.5 1%-low / 1 hitch per 30s. Commits `77c0337` + `ddb9b40`.

**The Experimental (WIP) pill stays on NSL.** With shadows on, NSL sits right at the 6.94ms 143Hz budget: 1%-low 45-47 misses the >= 55 bar and one probe run flapped across the vsync edge. Removing the pill is Cycle 91's close condition.

## Cycle 91 proposed scope: NSL budget headroom

Get NSL safely under the 6.94ms budget with shadows on, then remove the pill on data:

- The shadow depth pass is the cost: the consolidated compute-cull tree meshes draw their full camera-culled instance set into the shadow map every frame. Per-instance shadow culling (a second compacted set against the light frustum) is the direct lever.
- Alternative shapes: shadow-update cadence tied to dog movement, smaller casters set, or the TSL instancedArray impostor selection from the Cycle 89 R&D spike.
- Re-run `npm run perf:jitter -- --scene=newsheepdogland --mode=survival --waitFoliage=1` after each change; the probe needs no changes.
- Decide whether 72-locked or unlocked-143-with-flapping is the better feel (Matt's call after playing).

## Carryover (recorded in BACKLOG)

- **Matt feel-check** of the new NSL look (surveys in `cycle90-validation/visual-survey/before3` vs `after-final`).
- **S24+ device pass** - now also confirms mobile keeps shadows off and the mobile tree-cull path.
- **Screenshot golden re-capture** - goldens stale since 2026-05-16, and Phase 8 intentionally changed NSL's look; re-capture only after Matt approves the new visuals.
- **Launch posting** from `docs/launch/` (drafts ready, Matt's voice).
- Q4 staging provisioning (optional).

## Working Contract

- No `shared/` deterministic-core edits; sim-baselines stay byte-identical. (`shared/scenes/*` data/schema additions follow the cheap-case protocol with a migration story.)
- Matt publishes every player-facing artifact.
- Agent-launched Vite/Playwright sets `SDS_SUPPRESS_BROWSER_OPEN=1`; close every probe page/listener after use.
- Perf probes drive input; idle-camera numbers must not gate.
- `renderer.compute()` is a `queue.submit()` - batch compute passes into one call per frame.
- CI e2e runs with `--grep-invert='@local-only'`. NSL e2e specs arm the world via the carousel before every Play.

## Reference Table

| Area | Source of truth |
|---|---|
| Next cycle plan (scaffold) | [`docs/cycle-91-plan.md`](docs/cycle-91-plan.md) |
| Jitter probe + rail | `tools/cycle89-jitter-probe.mjs`, `npm run perf:jitter [-- --check]` |
| Cycle 90 evidence | `cycle90-validation/` (local, gitignored) + `DECISIONS.md` 2026-06-11 entry |
| Closed cycles | [`docs/BACKLOG.md`](docs/BACKLOG.md) + [`docs/archive/cycles/`](docs/archive/cycles/) |
| Launch drafts (Matt to post) | [`docs/launch/`](docs/launch/) |
| Release log | [`CHANGELOG.md`](CHANGELOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
