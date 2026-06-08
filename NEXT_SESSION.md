# Next Session - Cycle 72 webgpu-first (stub - needs authoring)

> **Updated:** 2026-06-08
> **For:** Cycle 72 `webgpu-first`. Plan: [`docs/cycle-72-plan.md`](docs/cycle-72-plan.md) (a STUB - Goal sketched from Matt's direction; finalize Phases).
> **Pickup priority:** Cycle 71 (the newsheepdogland load-crash fix + real hero) is CLOSED + deployed + LIVE. Cycle 72 is **WebGPU-first**: make the heaviest scene actually viable on WebGPU so the Cycle 71 WebGL pin comes off and every scene defaults to WebGPU when available, and retract the inert grass far-ring. Polish toward packaging/marketing. Finalize the plan, then `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-72-plan.md`](docs/cycle-72-plan.md) -> the touched module source. Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 71 (`newsheepdogland-load-fix-and-hero`) is CLOSED + deployed (2026-06-08).** The flagship survival scene crashed on load in the browser. Root cause (measured on the RTX 3070, `cycle71-validation/webgpu-crash/findings.md`, gitignored): cold WebGPU pipeline compilation - on the default WebGPU renderer the heaviest scene's first cold load compiles its node-material pipelines (D3D12 WGSL->DXIL) synchronously on the main thread ~43s, tripping Windows GPU TDR and wedging the tab. WebGL cold-loads it in 2.2s with correct lighting.

Shipped (commit `3b91f5b`, deploy run `27108889618` green):

- **The fix:** new optional `SceneDef.renderer:'webgl'` + a boot guard and a `swapScene` guard in [`js/main.js`](js/main.js) that route newsheepdogland to WebGL before any WebGPU cold compile. Verified on the 3070; `field` and every other scene keep WebGPU. Render-only, sim-baselines byte-identical.
- **Real hero:** [`assets/scenes/entrance/newsheepdogland.webp`](assets/scenes/entrance/newsheepdogland.webp) is now a real 1920x1080 dusk capture (214 KB), replacing the 7.5 KB gradient.

Validation: `npm test` 1135 pass; `npm run lint` clean; `npm run build` clean (main 585.6 KiB).

## What To Pick Up Next

Cycle 72 is **WebGPU-first** (Matt's direction: "I would like to be WebGPU first... make it so all scenes default to webgpu if available. also look into retracting the inert grass far ring... polish, closer to packaging and official marketing"). Finalize [`docs/cycle-72-plan.md`](docs/cycle-72-plan.md), then `/cycle-start`. Candidate scope (measure-first):

1. **Kill the WebGPU cold-compile freeze.** Spike where the ~43s cold block lands on the RTX 3070 and whether `renderer.compileAsync` moves it off the main thread (pre-compile during the load screen). Risky-primitive spike before touching the konveyor path.
2. **Fix the WebGPU node-lighting on newsheepdogland** ("Light node not found" every frame).
3. **Remove the WebGL pin -> WebGPU-first everywhere.** Once 1+2 verify the heavy scene on WebGPU within budget, drop `renderer:'webgl'` from `newsheepdogland.js` (keep the `SceneDef.renderer` mechanism as a fallback).
4. **Retract the inert far-ring** (Matt's lean). `grass.farRing` is gated behind `meadowQuadEnabled` = false on every tier, so the Cycle 70 "37.6% cut, LIVE" never ran. Remove the dead config + `GrassSystem` branch + `GrassFarRingDef` schema field, correct the record. Render-only.

## Open Carryover (deferred)

- The four Cycle 72 candidates above.
- **`feel-and-media-live` paired track** (bumped again by the WebGPU-first reframe): survival feel LIVE tuning, two-client co-op fun playtest, entrance hero FINAL beauty-shot dial-in, the `multiplayer.md` doc correction (still needs Matt's OK).
- Prior open carryover: tablet draw-call perf.

## Working Contract

- Cycle 72 is render/renderer-only: no `shared/` sim change; the 10 survival sim-baselines + every sim-baseline stay byte-identical. Don't ship the pin removal (P4) before the cold-compile fix (P2) is verified on the real GPU - that regression is the live crash again.
- Don't decompose `GrassSystem` / `OptimizedSheep`. The far-ring retraction removes an additive gated path, not a decomposition. No version bump without Matt's call.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan (stub) | [`docs/cycle-72-plan.md`](docs/cycle-72-plan.md) |
| Cold-compile root-cause evidence | `cycle71-validation/webgpu-crash/findings.md` (gitignored) |
| The WebGL pin to remove | [`shared/scenes/newsheepdogland.js`](shared/scenes/newsheepdogland.js) (`renderer:'webgl'`) + [`js/main.js`](js/main.js) guards |
| WebGPU production boot | [`js/rendering/konveyorProductionWebGpuBoot.js`](js/rendering/konveyorProductionWebGpuBoot.js) |
| Inert far-ring | [`js/GrassSystem.js`](js/GrassSystem.js) (`_farRing`) + [`shared/scenes/types.js`](shared/scenes/types.js) (`GrassFarRingDef`) + [`js/HardwareTier.js`](js/HardwareTier.js) (`meadowQuadEnabled`) |
| Latest closed cycle | [`docs/archive/cycles/cycle-71-plan.md`](docs/archive/cycles/cycle-71-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
