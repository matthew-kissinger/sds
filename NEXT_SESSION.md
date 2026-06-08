# Next Session - Cycle 73 feel-and-media-live (stub - needs authoring)

> **Updated:** 2026-06-08
> **For:** Cycle 73 `feel-and-media-live`. Plan: [`docs/cycle-73-plan.md`](docs/cycle-73-plan.md) (a STUB - pick the cycle focus, then fill Goal + Phases).
> **Pickup priority:** Cycle 72 (`webgpu-first`) is CLOSED + deployed. Two live threads carried in - the long-deferred `feel-and-media-live` paired track, and the WebGPU compile-reduction spike (the only path to lifting the last WebGL pin). Decide which is Cycle 73 with Matt, then `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-73-plan.md`](docs/cycle-73-plan.md) -> the touched module source. Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 72 (`webgpu-first`) is CLOSED + deployed (2026-06-08).** It set out to make every scene WebGPU-first and remove the Cycle 71 WebGL pin. A measure-first P1 spike (RTX 3070, system Chrome) re-scoped it, and Matt confirmed the new direction:

- **The pin stays.** A render-loop-gated `renderer.compileAsync` pre-warm stops the crash (the heaviest scene survives on WebGPU, no freeze, no TDR), but the cold D3D12 compile is intrinsically ~83-95s (only 28 unique materials across 1,617 meshes, so not dedup-able; warm reload ~4s). A ~90s first-load is worse than the fast 2s WebGL load, so newsheepdogland keeps `renderer:'webgl'`. Every other scene already defaults to WebGPU. Recorded in [`DECISIONS.md`](DECISIONS.md).
- **The WebGPU node-lighting warning is fixed.** SceneManager's WebGL-`three` lights could not bind into the `three.webgpu` node graph ("Light node not found" every frame, contributing nothing); they are no longer added on the WebGPU path. Zero render change (verified on rolling-hills: 0 warnings, scene lit); WebGL keeps the full 3-light rig.
- **The inert Cycle 70 far-ring is retracted.** `grass.farRing` config, the `GrassSystem` coastline branch, and the `GrassFarRingDef` schema field are removed (it was dead behind `meadowQuadEnabled` = false on every tier; the "37.6% cut, LIVE" claim is corrected). The older Cycle 23 meadow-quad LOD stays.

Render-only: sim-baselines byte-identical. Validation: `npm test` 1135 pass; `npm run lint` clean; `npm run build` clean (bundle ratchet `mainKB` 585 -> 586, a stale-fixture correction proven via a `git stash` build, not a regression).

## What To Pick Up Next

Cycle 73 is a STUB. Decide the focus with Matt (do not do both), then `/cycle-start`:

1. **feel-and-media-live (paired, Matt's hands):** survival feel LIVE tuning (off the Cycle 70 P2 audit), a two-client co-op fun playtest, the entrance hero FINAL beauty shot, and the `multiplayer.md` doc correction (still needs Matt's OK). The packaging/marketing-polish thread Matt has named since Cycle 70.
2. **webgpu compile-reduction (autonomous spike):** cut the ~90s cold WebGPU pipeline compile on newsheepdogland so the pin can finally come off. Simplify the heavy grass/terrain/water shaders, or warm the Dawn pipeline cache at build time for the native build. Measured spike; high effort, uncertain payoff. Evidence base: `cycle72-validation/webgpu-cold-compile/`.

## Open Carryover (deferred)

- The two Cycle 73 candidate threads above.
- Prior open carryover: tablet draw-call perf.

## Working Contract

- No `shared/` sim change unless the cycle explicitly scopes one with the four-piece migration story; the 10 survival sim-baselines + every sim-baseline stay byte-identical otherwise.
- Don't remove the newsheepdogland WebGL pin unless a within-budget WebGPU cold compile is actually verified on the RTX 3070 (the Cycle 72 hard stop carries forward - removing it is the live-crash class again).
- Don't decompose `GrassSystem` / `OptimizedSheep`. No version bump without Matt's call.
- Agent-launched Vite must set `SDS_SUPPRESS_BROWSER_OPEN=1`; close every Playwright page/browser and stop the dev server after a probe.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan (stub) | [`docs/cycle-73-plan.md`](docs/cycle-73-plan.md) |
| WebGPU cold-compile evidence | `cycle72-validation/webgpu-cold-compile/` (gitignored) |
| The WebGL pin (and why it stays) | [`shared/scenes/newsheepdogland.js`](shared/scenes/newsheepdogland.js) (`renderer:'webgl'`) + [`DECISIONS.md`](DECISIONS.md) Cycle 72 entry |
| WebGPU lighting fix | [`js/SceneManager.js`](js/SceneManager.js) (`setupLighting`) |
| Latest closed cycle | [`docs/archive/cycles/cycle-72-plan.md`](docs/archive/cycles/cycle-72-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
