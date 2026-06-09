# Next Session - Post v2.2.3 live, no active cycle

> **Updated:** 2026-06-09
> **For:** Post-Cycle 82 handoff. Latest closed cycle: Cycle 82 `feel-and-media-live`, archived at [`docs/archive/cycles/cycle-82-plan.md`](docs/archive/cycles/cycle-82-plan.md).
> **Pickup priority:** Start the next cycle from Matt's next target. Production proof for `v2.2.3` is complete.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/BACKLOG.md`](docs/BACKLOG.md) -> [`DECISIONS.md`](DECISIONS.md). There is no active cycle plan at this snapshot; create/scaffold the next one only after Matt gives the next direction.

## Where It Stands

**Cycle 82 (`feel-and-media-live`) is CLOSED + SHIPPED LIVE (2026-06-09).** It stabilized the desktop WebGPU Newsheepdogland flagship, then shipped the `v2.2.3` player-visible feel/media release.

- Release tag: `v2.2.3` at commit `dc1855e` (`feat(newsheepdogland): ship survival feel and entrance hero v2.2.3`).
- Follow-up CI fix: `8b0936e` (`test(e2e): align mobile visibility with flagship entrance`) keeps the mobile asset visibility helper aligned with the new flagship entrance default.
- Deploy proof: GH Actions Deploy run `27180799572` green on `main` (`Test`, `E2E (Chromium)`, `Migrate D1`, `Deploy Worker`, `Deploy Pages` all succeeded).
- Live Pages proof: `https://sheepdogsim.com/?proof=8b0936e` returned 200, root metadata includes Newsheepdogland preload/copy and four-biome copy, live main bundle is `/assets/main-CLV5WhDs.js` with Newsheepdogland scene data plus `lossThreshold:.45`, `killCooldown:1.6`, and `secondsPerDay:360`.
- Live hero asset proof: `https://sheepdogsim.com/assets/scenes/entrance/newsheepdogland.webp` returned 200, `image/webp`, 254,128 bytes, sha256 `2b80c17e0ac95b20554944eb6a9c85c0eb220cd0a7d8a428215fbed857dab5f3`.
- Live Worker proof: `https://sds-worker.matt-m-kissinger.workers.dev/healthz` returned 200 with `{"ok":true,"worker":"sds-worker"}`.

What shipped:

- Phase 1: fixed the Newsheepdogland homestead-in-water regression and stopped transient desktop WebGPU quality misses from writing a sticky WebGL fallback.
- Phase 2: fixed fully invisible WebGPU grass on far-from-origin scenes by measuring grass fade from `positionView` instead of world-origin distance.
- Phase 3: retuned survival feel (360 s day, +6 daily growth, 45% loss threshold, 1.6 s wolf kill cooldown), validated two-dog survival co-op, and made Newsheepdogland the entrance default with a fresh WebGPU homestead/pen/grass capture.
- Phase 4: measured the production build on the RTX 3070 at full quality: 5/5 runs, `webgpu-production`, no fallback, no console/page errors, `qualityIndex 0`, WebGPU grass compute-cull active, worst p95 7.0 ms, worst p99 7.1 ms.

Validation before release:

- `npm test` exit 0.
- `npm run lint` exit 0.
- `npm run build` exit 0.
- `npx playwright test --project=chromium --grep-invert='@local-only' --reporter=line --workers=1` exit 0 locally after the CI helper fix.
- Production steady-state, entrance hero, grass visibility, and two-client co-op proof artifacts live under gitignored `cycle82-validation/` / `cycle68-validation/` paths.

## Open Carryover

- Mobile WebGPU validation remains blocked on a real WebGPU-capable mobile device. The connected Galaxy Tab S9 FE exposed no `navigator.gpu`; mobile remains WebGL-pinned for the flagship.
- Prior open carryover: tablet draw-call perf.

## Working Contract

- No `shared/` sim change unless the next active cycle scopes it and records acceptance; sim-baselines stay byte-identical unless a future cycle explicitly accepts a golden change.
- The flagship renders on desktop WebGPU through the compute-cull path. Do not regress the mesh consolidation: `tools/webgpu-flagship-lift-gate-cycle81.mjs` (`GUARD=1`) asserts <= 30 render pipelines + <= 12 InstancedMeshes.
- Mobile keeps the WebGL pin until a real WebGPU-capable mobile device validates a within-budget flagship cold-load.
- Agent-launched Vite must set `SDS_SUPPRESS_BROWSER_OPEN=1`; close every Playwright page/browser and stop dev/preview listeners after a probe.

## Reference Table

| Area | Source of truth |
|---|---|
| Latest closed cycle | [`docs/archive/cycles/cycle-82-plan.md`](docs/archive/cycles/cycle-82-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| The Cycle 81 lift decision | [`DECISIONS.md`](DECISIONS.md) Cycle 81 entry |
| The compute-cull modules | [`js/world/grassComputeCull.js`](js/world/grassComputeCull.js), [`js/world/treeComputeCull.js`](js/world/treeComputeCull.js), [`js/world/konveyorWebGpuModules.js`](js/world/konveyorWebGpuModules.js) |
| The tier-gate | [`js/utils/isMobileClient.js`](js/utils/isMobileClient.js) + [`js/main.js`](js/main.js) boot gate + swap guard + [`js/SceneManager.js`](js/SceneManager.js) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
