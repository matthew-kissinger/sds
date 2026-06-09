# Next Session - Cycle 82 feel-and-media-live (v2.2.3 release-ready, deploy proof pending)

> **Updated:** 2026-06-09
> **For:** Cycle 82 `feel-and-media-live`. Plan: [`docs/cycle-82-plan.md`](docs/cycle-82-plan.md). Phase 1 + 2 (flagship-stability fixes) are committed locally on `main`; Phase 3 + 4 (survival feel, two-dog co-op, entrance hero, 3070 steady-state proof) are locally validated and packaged as the `v2.2.3` release.
> **Pickup priority:** Push `main` + tag `v2.2.3`, watch GH Actions deploy, then prove the live Pages bundle and direct Worker health before calling the release live.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-82-plan.md`](docs/cycle-82-plan.md) -> [`DECISIONS.md`](DECISIONS.md) (the Cycle 81 lift decision). Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 81 (`webgpu-flagship-ship`) is CLOSED + SHIPPED LIVE (2026-06-08).** The newsheepdogland WebGL pin is lifted on desktop WebGPU; mobile keeps it. Commit `7c8e74c`, deploy run 27161107853 green, live site healthy.

- GPU compute-cull collapses the flagship's grass + trees to 8 InstancedMeshes (grass index-remap pixel-identical, trees data-compaction material-agnostic); cold load 506 ms on the 3070 (under WebGL's 548 ms), 0 errors, 144 fps. Production-path hard-stop-1 gate passed across 6 runs.
- Tier-gated by a shared `isMobileClient()`: desktop loads WebGPU (with the Hosek sky + water that were dark on the WebGL fallback), mobile keeps WebGL byte-identical. The scene def keeps `renderer:'webgl'`.
- Mobile: the connected tablet (Galaxy Tab S9 FE, Mali-G68) has no `navigator.gpu`, so mobile is WebGL regardless; the pin is retained for any future WebGPU-capable mobile.

Validation: `npm test` 1135 pass / 8 skip; `npm run build` clean at the Cycle 81 bundle baseline.

## What To Pick Up Next

**Cycle 82 Phase 1 + Phase 2 (flagship-stability) are committed locally, pending deploy.** Four live newsheepdogland regressions are fixed: Phase 1 (house-in-water, the WebGPU/WebGL load split, the transient quality-floor + grass thinning) and Phase 2 (grass fully invisible on WebGPU - the blade distance-fade keyed off the world origin instead of the camera, so the ~1.2km-out play area fell entirely past `grassFadeEnd`; fixed by using `positionView`/`positionWorld` like every sibling konveyor material). See [`docs/cycle-82-plan.md`](docs/cycle-82-plan.md) Phases 1-2 for root causes, fixes, and live proof.

**Cycle 82 Phase 3 + Phase 4 are code-complete, locally validated, and packaged for `v2.2.3`.**

- Production-build 3070 profile: `tools/cycle82-steady-state-profile.mjs` passed 5/5 foreground runs against local preview, `qualityIndex 0`, `webgpu-production`, no fallback, no errors, worst p95 7.0 ms, worst p99 7.1 ms. Artifact: `cycle82-validation/steady-state-profile-3070.json`.
- Survival feel: Newsheepdogland day length is 360 s, first night from initial `t=0.28` is about 187 s, daily growth is +6, loss threshold is 45%, and wolf kill cooldown is 1.6 s.
- Two-dog co-op: live local Wrangler proof passed with `COOP_SURVIVAL_LIVE=1 INTEGRATION_WORKER_URL=http://127.0.0.1:8787 npx vitest run tests\integration\coop-survival.spec.ts`; proof artifact `cycle68-validation/coop/two-client-proof.json`.
- Entrance hero: root entrance defaults to Newsheepdogland, preloads the new homestead/pen/grass WebGPU capture, updates baseline SEO/OG/Twitter copy, and passes desktop/mobile proof. Artifacts: `cycle82-validation/entrance-proof/proof.json`, `desktop.png`, `mobile.png`.
- Current validation after the final UI edit: `npm test` exit 0; `npm run build` exit 0; `git diff --check` exit 0. Current bundle reality is main 605.49 KB and three 618.78 KB, so old 591/604 KB notes are historical checkpoint values, not the current bundle.

Next:

- Push `main` and tag `v2.2.3`; production still runs the old code until the push-triggered GH Actions deploy completes.
- After deploy, prove both `https://sheepdogsim.com/` and the direct Worker health endpoint before calling the cycle live.

## Open Carryover (deferred)

- Mobile WebGPU validation on a WebGPU-capable device (Cycle 81's tablet exposed no `navigator.gpu`).
- Prior open carryover: tablet draw-call perf.

## Working Contract

- No `shared/` sim change unless the cycle scopes one with the four-piece migration story; sim-baselines stay byte-identical.
- The flagship now renders on WebGPU on desktop (the compute-cull path). Don't regress the mesh consolidation: the guard `tools/webgpu-flagship-lift-gate-cycle81.mjs` (`GUARD=1`) asserts <= 30 render pipelines + <= 12 InstancedMeshes. Grass stays pixel-identical, trees lod0. Don't decompose `GrassSystem` / `OptimizedSheep`.
- Mobile keeps the WebGL pin until a real WebGPU-capable mobile device validates a within-budget flagship cold-load.
- Agent-launched Vite must set `SDS_SUPPRESS_BROWSER_OPEN=1`; close every Playwright page/browser and stop the dev server (and remove any `adb forward`/`adb reverse`) after a probe.
- No version bump without Matt's call. Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-82-plan.md`](docs/cycle-82-plan.md) |
| The Cycle 81 lift (mechanism, numbers, exact edits) | `cycle81-validation/README.md` + [`DECISIONS.md`](DECISIONS.md) Cycle 81 entry |
| The compute-cull modules | [`js/world/grassComputeCull.js`](js/world/grassComputeCull.js), [`js/world/treeComputeCull.js`](js/world/treeComputeCull.js), [`js/world/konveyorWebGpuModules.js`](js/world/konveyorWebGpuModules.js) |
| The tier-gate | [`js/utils/isMobileClient.js`](js/utils/isMobileClient.js) + [`js/main.js`](js/main.js) boot gate + swap guard + [`js/SceneManager.js`](js/SceneManager.js) |
| The regression guard / gate probe | `tools/webgpu-flagship-lift-gate-cycle81.mjs` |
| Latest closed cycle | [`docs/archive/cycles/cycle-81-plan.md`](docs/archive/cycles/cycle-81-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
