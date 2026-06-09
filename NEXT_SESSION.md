# Next Session - Post v2.2.5 mobile WebGPU hotfix

> **Updated:** 2026-06-09
> **For:** Post-Cycle 84 handoff. Latest closed cycle: Cycle 84 `mobile-webgpu-primary-hotfix`, archived at [`docs/archive/cycles/cycle-84-plan.md`](docs/archive/cycles/cycle-84-plan.md).
> **Pickup priority:** Verify the live deploy on Matt's actual phone, then start the next cycle from Matt's next target.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/BACKLOG.md`](docs/BACKLOG.md) -> [`DECISIONS.md`](DECISIONS.md). There is no active cycle plan at this snapshot; create/scaffold the next one only after Matt gives the next direction.

## Where It Stands

**Cycle 84 (`mobile-webgpu-primary-hotfix`) is CLOSED and prepared as `v2.2.5` (2026-06-09).** It responds to Matt's browser report: on mobile/browser, first Play refreshed into WebGL and the second Play spawned the dog in the water.

What changed:

- Newsheepdogland no longer declares `renderer:'webgl'`.
- The mobile boot/swap guards that rewrote WebGPU sessions to `?renderer=webgl&fallbackReason=scene-pinned-webgl` are removed.
- Explicit `?renderer=webgl` remains the fallback escape hatch.
- Mobile coastline terrain now uses a 3200 m mesh instead of the 720 m inner-grid + skirt split, so the Newsheepdogland homestead spawn is inside the visual mesh.
- Mobile WebGPU Newsheepdogland uses the consolidated grass/tree compute-cull path.

Validation before release:

- Targeted WebGPU scene, grass, terrain, and render-cost tests passed.
- `npm test` passed, including sim-baselines unchanged.
- `npm run lint` passed.
- `npm run build` passed; local `main-*.js` stayed inside the 592 KB bundle ratchet at 606,683 bytes.
- Mobile-emulated Chrome proof from the normal entrance with one Play click passed: `webgpu-production`, no `renderer=webgl`, no `fallbackReason`, terrain budget `size=3200`, `splitSkirt=false`, grass compute-cull true, 4 tree compute-cull controllers, sheepdog y `3.4006`, and terrain surface y `3.4006`.
- Chromium Playwright subset passed: `npx playwright test --project=chromium tests/e2e/smoke.spec.ts tests/e2e/mobile-asset-visibility.spec.ts` (5 passed).

Known validation caveat:

- Full local `npm run test:e2e` was attempted but exceeded a 3-minute command timeout before useful output. The focused Chromium browser gate above was used for this hotfix.

## Open Carryover

- Run the mobile WebGPU proof on Matt's actual phone after the live deploy. The local proof used Chrome Pixel 7 emulation on the development machine.
- Prior tablet draw-call/perf work remains open where real-device measurements show budget pressure.
- Full cross-browser e2e selectors/WebKit smoke still need the maintenance pass documented during Cycle 83.

## Working Contract

- No `shared/` sim change unless the next active cycle scopes it and records acceptance; sim-baselines stay byte-identical unless a future cycle explicitly accepts a golden change.
- Do not reintroduce the Newsheepdogland mobile WebGL pin. WebGPU is primary/default on capable browsers; explicit `?renderer=webgl` remains the fallback.
- Keep the flagship mesh consolidation intact: Newsheepdogland WebGPU should stay at grass compute-cull true and tree compute-cull controllers active on the production path.
- Agent-launched Vite must set `SDS_SUPPRESS_BROWSER_OPEN=1`; close every Playwright page/browser and stop dev/preview listeners after a probe.

## Reference Table

| Area | Source of truth |
|---|---|
| Latest closed cycle | [`docs/archive/cycles/cycle-84-plan.md`](docs/archive/cycles/cycle-84-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Mobile WebGPU hotfix files | [`js/main.js`](js/main.js), [`js/TerrainBuilder.js`](js/TerrainBuilder.js), [`shared/scenes/newsheepdogland.js`](shared/scenes/newsheepdogland.js) |
| Compute-cull modules | [`js/world/grassComputeCull.js`](js/world/grassComputeCull.js), [`js/world/treeComputeCull.js`](js/world/treeComputeCull.js), [`js/world/konveyorWebGpuModules.js`](js/world/konveyorWebGpuModules.js) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
