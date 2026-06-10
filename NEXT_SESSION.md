# Next Session - Cycle 88 closed; Cycle 89 scaffolded, needs a goal

> **Updated:** 2026-06-10
> **For:** Cycle 89 (`docs/cycle-89-plan.md`, empty scaffold - Matt names the
> goal, then `/cycle-start`).
> **Pickup priority:** (1) S24+ device pass (one phone session settles the
> Cycle 85/86/87 carryover AND confirms Cycle 88's low-tier impostor island -
> checklist below), (2) Matt posts or defers `docs/launch/`, (3) scope
> Cycle 89 (candidates below) and `/cycle-start`.

## Cold-Start Orientation

Read in order: this file -> [`docs/BACKLOG.md`](docs/BACKLOG.md) (Cycle 88
close entry at the top, with 85/86/87 below it, all 2026-06-10) ->
[`docs/archive/cycles/cycle-88-plan.md`](docs/archive/cycles/cycle-88-plan.md)
if the loading work needs context.

## Where It Stands

**Cycle 88 (impostor-first scene loading) shipped and closed 2026-06-10,
same day it started.** All 5 phases: the first playable frame on
Newsheepdogland now shows island-wide tree coverage as static kiln-atlas
impostors built inside the load transition (1,800 trees / 8 meshes; one
synchronous ~0.4s scatter chunk + 6ms build); streamed waves reuse the cold scatter
cache and upgrade zones impostor -> LOD0 (1,800/1,800 retired, qualityIndex
0); arming is signal-based (`QualityGovernor.onWarmupComplete` + 10s
fallback); low tier keeps a sparse impostor island forever; every scene
declares all-cold vs streamed in `tests/scene-loading-stages.spec.js`.
Commits `02c08d7` + `ef22fa2` + `abff471` (deliberate bundle ratchet bump:
main 609 / other 548 KiB) + `3a82f4a` + `e168143` (two CI fixes: impostor
build detached with no fetch timeout; scatter in one synchronous chunk -
per-wave yields starved ~0.5s of CPU into ~100s on SwiftShader). Evidence
in `cycle88-validation/` (local, gitignored): first-frame + steady-state
screenshots, production probe JSONs, SwiftShader stall repro.

## Carryover (recorded in BACKLOG)

- **S24+ device pass** - one phone session now settles FOUR things:
  1. Settings: renderer status row reads `webgpu-production`.
  2. Play Newsheepdogland 2-3 minutes: WebGPU holds, no overlay overlaps
     the touch controls.
  3. NEW (Cycle 88): the island shows impostor tree coverage island-wide
     from the first frame (`window.__sdsFoliageColdCoverage` has
     `trees > 0`, `error: null`; if the phone classifies low tier it reads
     `mode: 'sparse'` and no LOD0 waves stream).
  4. Check D1 afterwards for `webgpu_frame_budget_floor` events (expected
     telemetry, not failure).
- **Launch posting** from `docs/launch/` (drafts ready, Matt's voice).
- Q4 staging provisioning (optional, three operator steps).

## Cycle 89 candidates (standing items, Matt picks)

- vite 8 / Rolldown migration (needs its own cycle; conflicts recorded in
  the upkeep Phase C table).
- main.js boot-seam extraction (code-quality audit proposal #1; paired).
- HeightFogPatch activate-or-delete (audit proposal #2).
- Coastline-aware meadow quads (Cycle 87 P4 stretch, not taken).
- Worker log re-tail during live MP traffic.

## Working Contract

- No `shared/` deterministic-core edits; sim-baselines stay byte-identical.
- Matt publishes every player-facing artifact.
- Agent-launched Vite/Playwright sets `SDS_SUPPRESS_BROWSER_OPEN=1`;
  close every probe page/listener after use.
- CI e2e runs with `--grep-invert='@local-only'`; hardware-dependent
  assertions carry the `@local-only` tag.
- Loading-stage contract: new scenes declare all-cold vs streamed in
  `tests/scene-loading-stages.spec.js` (completeness guard enforces).

## Reference Table

| Area | Source of truth |
|---|---|
| Next cycle plan (scaffold) | [`docs/cycle-89-plan.md`](docs/cycle-89-plan.md) |
| Closed cycles | [`docs/BACKLOG.md`](docs/BACKLOG.md) + [`docs/archive/cycles/`](docs/archive/cycles/) |
| Launch drafts (Matt to post) | [`docs/launch/`](docs/launch/) |
| Loading-stage rules | `.claude/rules/scene-and-render.md` "Scene loading stages" |
| Cold coverage diag | `window.__sdsFoliageColdCoverage` (browser console) |
| Streaming diag | `window.__sdsFoliageStreaming` (browser console) |
| Renderer diagnostics | Settings panel, under the WebGPU toggle |
| Release log | [`CHANGELOG.md`](CHANGELOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
