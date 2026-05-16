# Next Session - Konveyor Autonomous Run

> **Updated:** 2026-05-16 after guarded WebGPU gameplay parity proof,
> Rolling Hills terrain/sheep scene-swap fixes, the explicit production WebGPU
> request route, and the completion audit on the experimental branch.
> **For:** `exp/konveyor-webgpu-migration`.
> **Pickup priority:** continue the full SDS Konveyor campaign from
> [`docs/konveyor-autonomous-run.md`](docs/konveyor-autonomous-run.md). Do not
> stop at numbered cycle boundaries. Treat Cycle 36 as completed foundation
> evidence, not the active stopping point.

Cold-start orientation: read [`AGENTS.md`](AGENTS.md), then [`CLAUDE.md`](CLAUDE.md), then this file, then [`docs/konveyor-autonomous-run.md`](docs/konveyor-autonomous-run.md), then [`docs/konveyor-sds.md`](docs/konveyor-sds.md), then the completion audit [`docs/konveyor-completion-audit-2026-05-16.md`](docs/konveyor-completion-audit-2026-05-16.md), then the completed foundation plan [`docs/cycle-36-plan.md`](docs/cycle-36-plan.md). Cycle 35's closed plan is archived at [`docs/archive/cycles/cycle-35-plan.md`](docs/archive/cycles/cycle-35-plan.md).

## Cycle 35 Outcome

Closed 2026-05-11, no version bump. Eight autonomous phases shipped. The original plan had seven phases; two more (HudLayout slot orchestrator + meadow shader compile fix) absorbed mid-cycle during a Matt review pass. Tests 304 pass / 7 skipped, build clean, lint clean, mainKB 590.33 (+0.27 vs Cycle 34's 590.06). Full per-phase summary in [`docs/BACKLOG.md`](docs/BACKLOG.md) Recently Completed → Cycle 35.

The cycle delivered:

1. **Completion observability** end-to-end. Telemetry route fix in [`js/telemetry.js`](js/telemetry.js) (Pages → Worker URL), a new append-only `score_errors` D1 table that captures every `submitScore` throw before propagating, and a client-side `score_submission_failed` emit when `nm.submitScore` rejects. The next regression shows up as data instead of silence.
2. **Leaderboard as `(scene × mode)` identity.** `/api/leaderboard` and `/api/leaderboards` now require a scene; missing returns 400 `{error: 'scene_required'}`. Dropped the cross-scene fast path on `players.*` and the `isNaturalPartition` fallback. Leaderboard UI restructured scene-first; persists last-scene in `localStorage`.
3. **Shoreline foam tracks the visible waterline.** `AnimeWater` accepts a heightfield, samples it as an R32F DataTexture, and computes foam from `|terrain_y - waterY|`. Falls back to the boundary band when no heightfield (Field has no water anyway).
4. **HudLayout (mid-cycle Phase 8).** Slot-based orchestrator deletes the prior pattern of per-component `position: fixed` with hand-tuned offsets. CameraModeIndicator alone lost ~40 lines of compensating positioning code.
5. **Meadow shader compile fix (mid-cycle Phase 9).** Long-standing `vUv` undeclared error on every island scene boot. Fix: `defines: { USE_UV: '' }` on the MeshLambertMaterial.

## Pickup Priority

Work on `exp/konveyor-webgpu-migration`. Continue from
[`docs/konveyor-autonomous-run.md`](docs/konveyor-autonomous-run.md): create a
minimal WebGPU/TSL diagnostic boot path, inventory shader/material migration
surfaces, migrate incrementally, keep WebGL default, and keep moving through
optimization and native proof until a real hard stop.

The branch now has native-readiness code before a shell dependency:
`BUILD_TARGET=native`, `SDS_WORKER_BASE`, `js/runtimeConfig.js`, and
`npm run native:check`. Use that path for native-shaped perf/profiling work
without committing to Tauri, Electron, or Capacitor yet.

Cycle 36 foundation evidence is complete. The perf harness has been repaired
and `tests/perf-baseline/baseline.json` now has all six default configs passing
with 900 samples each. Desktop and mobile-profile latency gates are executable.
Screenshot diff enforcement now has committed 12-cell goldens and a deterministic
capture contract; `npm run validation:screenshots -- --diff` has passed on
2026-05-15 with no missing cells; the current refreshed mean SSIM is
0.9945007926542798. Automation starts for Vite dev validation should set
`SDS_SUPPRESS_BROWSER_OPEN=1` so `server.open` does not create real Chrome tabs
during probes. Runtime proof is recorded at
[`docs/archive/research/cycle-36-konveyor-runtime-proof.md`](docs/archive/research/cycle-36-konveyor-runtime-proof.md),
and the Rolling Hills WebGPU spike is blocked by broad GLSL shader surface at
[`docs/archive/research/cycle-36-webgpu-hero-blocker.md`](docs/archive/research/cycle-36-webgpu-hero-blocker.md).
Post-foundation production renderer setup now lives in
[`js/rendering/sceneRendererSetup.js`](js/rendering/sceneRendererSetup.js):
`SceneManager` still creates a WebGL renderer, but its WebGL capability probes,
context handlers, shadow/pixel-ratio setup, and tonemapping choice are explicit
and test-covered. It can also consume an explicit renderer/configure factory for
proof runs. Treat that as a renderer-boundary seam for the next narrow
scene-bound WebGPU proof, not as a production WebGPU boot claim. The first
opt-in proof now exists at
[`cycle36-validation/runtime/scene-manager-webgpu-renderer-proof.json`](cycle36-validation/runtime/scene-manager-webgpu-renderer-proof.json):
installed Chrome injects a real `WebGPURenderer` into `SceneManager`,
  initializes it through `SceneManager.whenRendererReady()`, renders
  the proof frame through `SceneManager.render()` using the async WebGPU render
  path, routes production `Atmosphere` sky/cloud/fog, `SunBillboard`,
  `TerrainBuilder.createTerrain()`, `AnimeWater.createAnimeWater()`, and a
  representative `PortalEffect`, `CorralZapEffectPool`, tree/rock GLB
  material-replacement/native-instancing, `GrassSystem`, `OptimizedSheepSystem`,
  and Kiln impostor slice through the diagnostic-installed
  `window.__sdsKonveyor*MaterialFactories` WebGPU supply on that
  `SceneManager` scene, and
  captures a nonblank 320x180 screenshot with a visible compact
  tree/rock/sheep/Kiln/terrain/water/grass/effects slice while normal
  production boot remains unchanged. The proof adds
WebGPU-module
ambient/directional lights only inside the diagnostic harness because the
vendored WebGPU Three module does not share light objects with default
production Three; normal `SceneManager` lighting remains present and untouched.
Newer production boot scout evidence now exists at
[`cycle36-validation/runtime/production-webgpu-boot-scout.json`](cycle36-validation/runtime/production-webgpu-boot-scout.json):
installed Chrome loads the built production preview at
`?renderer=webgpu&diagnostic=1&konveyorProductionBootScout=1&testNoCanvas=1&konveyorProductionSceneBody=1&konveyorNativeInstancing=1&konveyorProductionLoopScout=1&konveyorProductionRafScout=1&scene=field`,
bypasses the diagnostic scene boot (`diagnosticBoot: false`), constructs the
normal `SheepDogSimulation` shell with injected WebGPU `SceneManager` options,
waits through `SceneManager.whenRendererReady()`, installs the existing WebGPU
factory globals, runs the normal Home Field scene-body init once, and drives a
guarded 12-frame WebGPU scene-loop scout plus a bounded 12-frame
`requestAnimationFrame` scout. The artifact records
`rendererIsWebGpu: true`,
`rendererSetup.rendererMode: "non-webgl"`, `renderStatus.mode: "async"`,
terrain/grass/sheep WebGPU material application, and a nonblank canvas
screenshot. Treat this as guarded scene-loop evidence only: `testNoCanvas=1`
still prevents the normal gameplay start path, while the rAF scout proves the
shared frame body can run from browser frame timestamps. The current loop proof
records
`frameCount: 12`, `performanceFrameCount: 12`, grass time advancing from 0 to
0.2, `sharedFrameStep: true` through `SheepDogSimulation.runFrame(deltaTime)`,
no frame errors, no console/page errors, first-frame WebGPU warmup at
2595.6 ms, and later proof frames between 9.2 and 21.3 ms. The rAF scout then
records `frameCount: 12`, `scheduler: "requestAnimationFrame"`,
`performanceFrameCount: 24`, grass time advancing from 0.2 to 0.3347, monotonic
timestamps, no frame/console/page errors, and per-frame render elapsed samples
between 7.4 and 13.1 ms; it is not yet a perf threshold gate. The latest proof
no longer suppresses
`InstancedMesh2`: under the guarded `konveyorNativeInstancing=1` route,
production tree placement renders 2,002 Home Field trees through 4 native
`THREE.InstancedMesh` groups, rock placement renders 334 rocks through 3 native
`THREE.InstancedMesh` groups, and `suppressedWebglOnlyObjects` is empty.
Additional guarded gameplay-start evidence now exists at
[`cycle36-validation/runtime/production-webgpu-gameplay-scout.json`](cycle36-validation/runtime/production-webgpu-gameplay-scout.json):
the same production scout route runs without `testNoCanvas=1`, uses normal
constructor `init()` plus `animate()`, autostarts solo Classic play, advances the
normal animation loop from `performanceFrameCount` 6 to 68, records a
60-frame normal-loop timing sample (`avgMs: 11.64`, `p95Ms: 14.9`,
`p99Ms/maxMs: 53.6` from an initial warmup spike), advances grass time from
4.0586 to 4.8102, creates a dog plus 200 sheep, records async WebGPU render
status with no init/console/page errors, and captures a nonblank gameplay
canvas screenshot. This is still diagnostic-gated scout evidence, not default
WebGPU production enablement or a perf threshold pass. Plain non-diagnostic
`?renderer=webgpu` now has a separate production-route proof; default URLs
still remain WebGL.

The guarded gameplay-start scout now covers all shipped scenes. Home Field is
[`cycle36-validation/runtime/production-webgpu-gameplay-scout.json`](cycle36-validation/runtime/production-webgpu-gameplay-scout.json),
Rolling Hills is
[`cycle36-validation/runtime/production-webgpu-gameplay-scout-rolling-hills.json`](cycle36-validation/runtime/production-webgpu-gameplay-scout-rolling-hills.json),
and Open Country is
[`cycle36-validation/runtime/production-webgpu-gameplay-scout-open-country.json`](cycle36-validation/runtime/production-webgpu-gameplay-scout-open-country.json).
Open Country records `nativeRockInstancing.emptyPlacement: true`; that is a
valid zero-rock placement after island water/corral filtering, not a WebGPU
failure. All three scene artifacts are `ok: true`, have no console/page errors,
and capture nonblank gameplay canvases.

The current default-ready parity artifact is
[`cycle36-validation/runtime/production-gameplay-parity-proof.json`](cycle36-validation/runtime/production-gameplay-parity-proof.json),
captured 2026-05-16T00:12:39.618Z. It compares production WebGL against the
guarded production WebGPU route for Field, Rolling Hills, and Open Country.
`ok: true` and `defaultReady: true` now mean the runtime/capture gates plus
semantic regional color/luma gates pass; full-frame SSIM remains advisory
because alpha-hashed foliage and grass are structurally different across the
two renderers.

The current plain non-diagnostic production WebGPU request proof is
[`cycle36-validation/runtime/production-webgpu-request-proof.json`](cycle36-validation/runtime/production-webgpu-request-proof.json),
captured 2026-05-16T01:49:53.535Z on installed Chrome. It confirms the default
URL remains `effective: "webgl"` with no fallback, proves a simulated browser
without `navigator.gpu` fails closed to WebGL with
`fallbackReason: "webgpu-unavailable"`, proves a browser with `navigator.gpu`
but a failing `requestDevice()` falls back to WebGL with
`fallbackReason: "webgpu-device-request-failed"`, then runs Field, Rolling
Hills, and Open Country at plain
`?renderer=webgpu&autostart=1&mode=classic`, reports
`effective: "webgpu-production"` with no fallback and successful device
preflight, applies the centralized WebGPU factory suite, routes tree/rock
placement through native `THREE.InstancedMesh`, applies
terrain/grass/sheep/water/tree-rock materials, captures nonblank screenshots,
and records no console/page errors.
`konveyorProduction=1` remains compatible but is no longer required for an
explicit WebGPU renderer request.

The explicit production WebGPU route now also has a post-warmup perf threshold
proof at
[`cycle36-validation/runtime/production-webgpu-perf-proof.json`](cycle36-validation/runtime/production-webgpu-perf-proof.json),
captured 2026-05-16T01:50:50.393Z on installed Chrome. The tool warms each
scene for 5000 ms, resets `window.__perfHarness`, samples 8000 ms, and enforces
the same local desktop frame-time budget used by the Open Country WebGL perf
e2e: average <= 22 ms, p95 <= 30 ms, and at least 240 samples. Current results:
Field `avgFrameTime=6.956 ms`, `p95=7.067 ms`; Rolling Hills
`avgFrameTime=6.944 ms`, `p95=6.952 ms`; Open Country
`avgFrameTime=6.944 ms`, `p95=6.952 ms`. The proof also requires
`effective: "webgpu-production"`, no fallback, WebGPU renderer identity, clean
console/page state, and matching scene identity.

The first real two-client multiplayer WebGPU proof is
[`cycle36-validation/runtime/production-webgpu-mp-proof.json`](cycle36-validation/runtime/production-webgpu-mp-proof.json),
captured 2026-05-16T01:42:30.718Z on installed Chrome against local Vite +
Wrangler. It drives host and guest through a worker-backed cooperative room,
starts gameplay without `testNoCanvas`, captures both rendered canvases, and
requires both clients to report `effective: "webgpu-production"`,
`sceneId: "field"`, `roomState: "in-game"`, connected two-player room state,
nonblank screenshots, and clean console/page state. This proof exposed and fixed
two MP-only gaps: host scene sync now awaits the selected room scene before lobby
monitoring, and production WebGPU state is refreshed after in-process scene
rebuilds so swap-backed proofs no longer describe the boot scene.

The current public-site iOS Safari water baseline is also green, but it is not
evidence for this unpublished branch. `IOS_WATER_BASE_URL=https://sheepdogsim.com
npm run test:ios-water` passed on BrowserStack iPhone 15 Pro Max / iOS 17 Safari
at 2026-05-16T01:57Z. The attached sample averaged `[29, 42, 20]` and reported
`nearFoamWhite: false` against the foam-white failure color `[234, 246, 255]`.
Rerun this after any deploy that carries the WebGPU packet.

Rolling Hills terrain placement is fixed in current proof: the camera sample is
`y=43.134`, `surfaceY=31.134`, `aboveSurface=12`, and sheep placement reports
`matrixSurfaceAbsMax=0` plus `belowWaterMatrices=0`. The runtime fix keeps
`OptimizedSheepSystem` heightfield-aware from first construction through reset,
update, force-update, and corral ascent paths. The scene-swap fix also caps
client frame `deltaTime` at 0.05s and resets `lastTime` after in-process scene
rebuilds so a rebuild stall cannot fling a fresh flock to an island boundary.
`npx playwright test tests/e2e/scene-swap-stability.spec.ts --project=chromium`
passed after this change, including Field -> Rolling Hills -> Open Country
heightfield refresh and OC sheep in-bounds checks.
Chromium `oc-perf` now launches through the Windows D3D11 GPU path via
`playwright.config.ts`; the repaired perf run produced 480 samples with
`avgFrameTime=16.6657 ms` and `p95=16.6867 ms`.

Keep two carryovers visible:

1. **Phase 7 carryover from Cycle 35: paired OC MP playtest.** Matt at the keyboard, two browser tabs, host an OC cooperative room, drive sheep into the round-up zone at (0, 50), confirm `roundup → drive` flips server-side at hold=2.0s and the portal at z=295 opens. Cannot run autonomously.
2. **iOS Safari foam canary post-deploy.** `npm run test:ios-water` against `https://sheepdogsim.com/` after the latest deploy lands. The current public site passed at 2026-05-16T01:57Z, but that does not cover this unpublished branch. Hard-stop gate from Cycle 32. If `nearFoamWhite: true`, revert Phase 6 and re-open as a paired investigation.

**Closed 2026-05-12:** D1 telemetry-route verification. Remote query confirmed `mode_selected` landed 2026-05-11 23:34:45 (after the 18:53 deploy), so the route fix is working end-to-end. `score_errors` table clean (0 entries). No `game_completed` yet, but that's traffic (3 GSC clicks in the same period), not a route bug.

**Closed 2026-05-13:** leaderboard solo-tab correction and content-campaign alignment. `GlobalLeaderboard` now shows solo modes for every concrete scene while multiplayer tabs still follow `scene.allowedModes`. The May 2026 Discord/devlog/capture docs live at [`docs/content-campaign-2026-05.md`](docs/content-campaign-2026-05.md), [`docs/capture-pipeline-spike-2026-05.md`](docs/capture-pipeline-spike-2026-05.md), and [`assets/marketing/content/2026-05-update/discord-threejs-update.md`](assets/marketing/content/2026-05-update/discord-threejs-update.md). Current Discord attachment image: [`assets/marketing/og/og-rh-sunset.webp`](assets/marketing/og/og-rh-sunset.webp). Generated MP4s are review-only; next capture pass should wait for the optimization/EZ-Tree/tree-spacing prep in [`docs/tree-pipeline.md`](docs/tree-pipeline.md).

## Backlog Deferred Behind Konveyor

The prior candidate list remains valid backlog, but it is not the active
autonomous branch objective unless Matt explicitly redirects away from
Konveyor:

1. **OC objective HUD polish.** MP-specific copy or per-player progress indicators on the ObjectiveBanner. Decide after the Phase 7 playtest.
2. **Promote `worker-objective-snapshot.spec.js` into the WS two-client harness.** Requires unskipping `tests/integration/flow.spec.ts`.
3. **Mountains: real horizon ring** as height-displaced skirt that the play-area heightfield blends into.
4. **Bespoke pixel-forge rocks**, **octahedral impostors v2**, **cross-module polygon-spawn dedup**, **build-time `displacedHeights` bake**, **inline `_groundY`** — long-tail polish.
5. **Drop `players.solo_*_best` materialized columns** if a future cycle wants the destructive migration (deferred Q1 in Cycle 35).
6. **Delete legacy `updateGrassLOD` + `updateTreeLOD`** in [`TerrainBuilder.js`](js/TerrainBuilder.js).
7. **Cycle 33 carryovers** still open: local-tunnel BrowserStack canary on Ubuntu (manual `gh workflow run browserstack-ios-water.yml` with empty `base_url`); Node 20 GHA deprecation annotation re-check on next Deploy run.

## Frozen Files (durable fence)

Durable fence applies in full ([`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md)). No cycle-36-specific freezes yet.

## Operational Notes

- **Cloudflare creds**: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in `~/.config/mk-agent/env` (loaded via `set -a && source ~/.config/mk-agent/env && set +a` before any `wrangler d1` command). The current token has scopes `Zone Settings:Edit`, `D1:Read`, `Workers Scripts:Read`. For Web Analytics / RUM lifecycle operations the API tokens are unreliable; use the dashboard cookie session (Claude in Chrome) instead.
- **D1 queries**: use `npx wrangler d1 execute sds-db --remote --command "..." --json` for read-only inspection. Database id `513aa937-e60a-4fb6-b499-9f3814149e88`. Direct API: `POST https://api.cloudflare.com/client/v4/accounts/{acct}/d1/database/{db}/query` with `{sql: "..."}` body.
- **D1 schema snapshot**: 6 applied migrations (0001-0006). `score_errors` table is the newest, added in Cycle 35 Phase 2.
- **Zone settings live state (as of 2026-05-12):** `min_tls_version=1.2`, `always_use_https=on`, `0rtt=on`, `http3=on`, `tls_1_3=zrt`, `brotli=on`, `early_hints=on`, `automatic_https_rewrites=on`, `always_online=on`, `development_mode=off`, Crawler Hints (Beta)=on, IndexNow=on (last two dashboard-only).
- **Cloudflare Web Analytics:** one site only (token `b5895c76...`, host filter `(sds-frontend.pages.dev|sheepdogsim.com)$`). The stale auto-install ruleset from 2025-07-06 was deleted 2026-05-12.

## Reference Table

| Area | Source of truth |
|---|---|
| Active autonomous brief | [`docs/konveyor-autonomous-run.md`](docs/konveyor-autonomous-run.md) |
| Foundation evidence | [`docs/cycle-36-plan.md`](docs/cycle-36-plan.md) |
| Konveyor campaign doctrine | [`docs/konveyor-sds.md`](docs/konveyor-sds.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-35-plan.md`](docs/archive/cycles/cycle-35-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Security advisory acceptance log | [`docs/security-acceptance.md`](docs/security-acceptance.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |

## Running Locally

```bash
npm run dev
npm test
npm run lint
npm run build
npm run test:e2e -- --project=chromium --grep-invert @local-only
npm run test:ios-water
npm run test:integration
```

Useful URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl`, `?cinematic=1`, `?ui=off`, `?sun=0.5`, `?perfMode=1`, `?tier=low|med|high`, `?tonemap=aces|neutral|linear|none`.

D1 inspection:

```bash
set -a && source ~/.config/mk-agent/env && set +a
npx wrangler d1 execute sds-db --remote --command "SELECT COUNT(*) FROM score_submissions;" --json
npx wrangler d1 execute sds-db --remote --command "SELECT * FROM score_errors ORDER BY submitted_at DESC LIMIT 10;" --json
npx wrangler d1 execute sds-db --remote --command "SELECT name, COUNT(*) FROM events GROUP BY name;" --json
```
