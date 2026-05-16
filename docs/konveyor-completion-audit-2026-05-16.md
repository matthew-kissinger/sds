# Konveyor Completion Audit - 2026-05-16

Original branch: `exp/konveyor-webgpu-migration`

Post-audit update: PR [#52](https://github.com/matthew-kissinger/sds/pull/52)
has since merged to `main`; local `main` is currently at `ea34753`
(`ci(konveyor): make linux perf check manual`) before the uncommitted
mobile-readiness work. Treat the PR/draft state below as historical audit
context, not current branch truth.

Core implementation packet: Cycle 37 plus the post-cycle progressive WebGPU
default/toggle pass, followed by the later connected-Android WebGPU
mobile-readiness pass.

## Objective Restatement

Complete the SDS Konveyor autonomous campaign by finishing the WebGPU migration
that originally ran on `exp/konveyor-webgpu-migration` and has since merged its
progressive-default packet to `main`, moving to a progressive WebGPU default
only after documented gates pass, preserving WebGL fallback/escape hatches,
preserving deterministic sim and multiplayer contracts, proving native/runtime
assumptions, and continuing until either the campaign is complete or a
documented hard stop is reached.

## Prompt-to-Artifact Checklist

| Requirement | Evidence inspected | Status |
|---|---|---|
| Work happened on the intended Konveyor branch before merge, and current follow-up work starts from `main`. | Historical audit state was `exp/konveyor-webgpu-migration...origin/exp/konveyor-webgpu-migration` with draft PR #52. Post-audit update: PR #52 merged and current local `main` is at `ea34753` before uncommitted mobile-readiness work. | Pass |
| Progressive WebGPU default with WebGL fallback. | `progressive-webgpu-default-request-proof.json` records default URL `requested: "webgpu"` and `effective: "webgpu-production"`, stored `sds-settings.experimentalWebGpu=false` staying WebGL, forced `?renderer=webgl` staying WebGL, unsupported API fallback, simulated device-failure fallback, and nonblank Field/Rolling Hills/Open Country screenshots. `progressive-webgpu-settings-toggle.png` verifies the settings label/experimental copy in the UI. | Pass |
| Explicit WebGPU request enters the production WebGPU route on supported desktop hardware. | `production-webgpu-request-proof.json` records Field, Rolling Hills, and Open Country with `effective: "webgpu-production"`, device preflight `ok: true`, `rendererIsWebGpu: true`, nonblank screenshots, zero console/page errors, and scene-body material/native-instancing checks passing. | Pass |
| Unsupported WebGPU or failed device creation fails closed to WebGL. | `production-webgpu-request-proof.json` records the no-`navigator.gpu` case as `fallbackReason: "webgpu-unavailable"` and simulated request-device failure as `fallbackReason: "webgpu-device-request-failed"`, both `effective: "webgl"`. | Pass |
| Migrate production rendering incrementally rather than a broad shader rewrite. | `docs/konveyor-autonomous-run.md`, `docs/konveyor-sds.md`, `js/rendering/konveyorRuntimeMode.js`, `js/rendering/konveyorProductionWebGpuBoot.js`, and the material adapter tests show staged adapter/factory routes for atmosphere, effects, tree/rock, grass, water, terrain, sheep, and impostors. | Pass |
| Measure WebGPU parity before claiming readiness. | `cycle36-validation/runtime/production-gameplay-parity-proof.json` records `ok: true`, `defaultReady: true`, and all three scenes passing semantic capture/runtime checks. Full-frame SSIM remains advisory due renderer-structural foliage/grass differences. | Pass |
| Gate explicit production WebGPU route on frame-time budget. | `progressive-webgpu-default-perf-proof.json` records Field `avg=7.197 ms`, `p95=7.943 ms`, Rolling Hills `avg=6.945 ms`, `p95=6.958 ms`, and Open Country `avg=6.944 ms`, `p95=6.953 ms`, all above 1110 samples and below the 22 ms avg / 30 ms p95 budget. | Pass |
| Preserve multiplayer contracts. | `cycle36-validation/runtime/production-webgpu-mp-proof.json` records host and guest both `effective: "webgpu-production"`, room scene `field`, `roomState: "in-game"`, two connected players, nonblank canvases, and zero captured errors. `npx playwright test tests/e2e/mp/in-game-state.spec.ts --project=mp --reporter=list` now also covers Open Country cooperative room scene identity through host/guest join and start-game. `npm test` passed after the MP helper and telemetry-readout changes. | Pass |
| Preserve deterministic shared sim boundary. | No `shared/**` files are changed in the current PR branch. Latest `npm test` passed with 449 passing and 7 skipped specs. | Pass |
| Prove native/runtime assumptions. | `npm run native:check` passed and refreshed `cycle36-validation/native/preflight.json` at `2026-05-16T01:51:18.143Z`. Current PR head also passes `npm run build` with `main=578.53 KB`, `three=617.77 KB`, and the known chunk-size/static-dynamic-import warnings only. Request proof verifies desktop WebGPU adapter/device preflight before booting production WebGPU. | Pass |
| Cover the Rolling Hills terrain/camera/sheep bug from review. | `production-gameplay-parity-proof.json` records Rolling Hills camera `aboveSurface: 12`, sheep `matrixSurfaceAbsMax: 0`, and `belowWaterMatrices: 0`; `tests/optimized-sheep-heightfield.spec.js` covers heightfield-aware sheep placement. | Pass |
| Prevent validation tabs/listeners from contaminating perf and benchmark evidence. | `AGENTS.md`, `.claude/rules/scene-and-render.md`, `tools/validation/README.md`, `vite.config.js`, and `playwright.config.ts` document and enforce `SDS_SUPPRESS_BROWSER_OPEN=1` for automation. Post-proof scans found no local 3000/4173/8787/5400 listeners or matching browser/dev-server processes. | Pass |
| Refresh Apple water canary evidence. | `IOS_WATER_BASE_URL=https://sheepdogsim.com npm run test:ios-water` passed on BrowserStack iPhone 15 Pro Max / iOS 17 Safari at 2026-05-16T01:57Z with sample average `[29, 42, 20]` and `nearFoamWhite: false`. | Partial - live baseline only |
| Decide whether `sheepdogsim.com` should switch default renderer. | Matt approved moving fast with low traffic. The branch now uses progressive WebGPU by default, preserves forced `?renderer=webgl`, and exposes an experimental settings toggle. Post-deploy telemetry still needs review after traffic exists. | Approved, pending deploy |
| Run post-deploy canary for this branch. | `NEXT_SESSION.md` records that the BrowserStack canary must be rerun after a deploy carrying this branch. No deploy has occurred for draft PR #52/current branch head. | Missing |
| Complete paired Open Country multiplayer playtest. | `NEXT_SESSION.md` records this as a Matt-at-keyboard carryover. The automated MP e2e now proves Open Country room scene identity through start-game, `tests/worker-objective-snapshot.spec.js` proves the authoritative worker tick advances `roundup -> drive` and keeps corral retirement closed until `drive`, and `tests/e2e/scene-swap-stability.spec.ts` now proves the OC objective-stage event opens the portal target and hides the round-up decal in a real browser scene. It still does not drive sheep through the objective in a live two-client browser. | Missing/manual |
| Avoid unauthorized production deployment or public release decision. | `docs/konveyor-autonomous-run.md` hard-stops on production deployment and public release decisions without explicit user request. Historical audit state did not deploy the draft branch. Post-audit deployment and any future mobile-readiness deploy require their own proof/canary/telemetry readout. | Pass |

## Audit Result

The WebGPU migration packet is implementation-ready on the experimental branch:
the explicit production WebGPU route, fallback behavior, three-scene parity,
frame-time budget, native preflight, Rolling Hills terrain placement fix,
multiplayer proof, and validation hygiene are covered by concrete artifacts.

Post-audit visual review changed the next action before any release/default
decision. The explicit WebGPU route received the first visual-polish pass
recorded in
[`konveyor-visual-polish-qa-2026-05-16.md`](konveyor-visual-polish-qa-2026-05-16.md):
ground black/palette artifacts, sky/cloud cutoff, missing or unreadable sun,
bland water, detached leaf wind, and non-interactive grass were addressed as a
design-led WebGPU pass, not strict WebGL parity. Matt later approved a
progressive production-default renderer change for this low-traffic release
path. Keep the WebGPU default paired with WebGL fallback, forced
`?renderer=webgl`, and the experimental settings toggle. Current refresh
evidence:
`cycle36-validation/runtime/progressive-webgpu-default-request-proof.json`,
`cycle36-validation/runtime/progressive-webgpu-default-perf-proof.json`,
`cycle36-validation/runtime/progressive-webgpu-settings-toggle.png`, and the
Cycle 37 final WebGPU screenshots/perf artifacts.

Post-audit mobile-readiness work added the first connected Android Chrome
WebGPU proof and the runtime cost/governor layer. The current proof artifact is
`cycle37-validation/runtime/android-webgpu-rolling-hills-final-2026-05-16.json`:
device `R5CX4028VGJ`, secure localhost through ADB reverse, Rolling Hills
follow-close full scene, `p95=16.733 ms`, `p99=16.871 ms`, `drawCalls=37`,
`avgEstimatedTriangles=753920`, and no page/console errors. This upgrades the
audit packet with a real-device baseline but does not close full mobile
readiness; that remains the Cycle 38 matrix and visual-gate work.

Cycle 38 follow-up has now proved that the remaining work is real, not
paperwork. The Android runner and dog sprint route were hardened, but Open
Country connected-phone artifacts still miss high-mobile frame budgets:
follow-close is around `p95=33.4 ms` / `p99=50.1 ms`, and
horizon/terrain-seam is around `p95=66.8 ms` / `p99=66.9 ms`. The terrain seam
is reduced but still visible, grass interaction is wired but not visually
accepted, and the current mobile tree path is chunked LOD1 containment rather
than proper view-dependent octahedral impostors.

The campaign is still not complete as full mobile production readiness. The
remaining work after the merged Cycle 37 packet and the uncommitted
mobile-readiness pass is:

1. Continue the Cycle 38 scene/camera/system perf matrix on Android and desktop
   from the latest Open Country failure artifacts.
2. Add visual screenshot gates for dog-through-tree readability, coherent tree
   wind, shoreline/glint water, grass interaction, and terrain seam quality.
3. Build the proper WebGPU impostor lab before production: view-dependent tile
   selection, depth/parallax, alpha discard/dither, terrain-grounded pivot, and
   LOD transition screenshots. Current mobile LOD1 trees are not the final
   octahedral impostor solution.
4. Rebuild over-budget author-time tree/rock assets with LOD and impostor
   sidecars, starting with the broad-canopy `tree2` budget outlier.
5. Wire the remaining `QualityGovernor` knobs and prove hysteresis/fallback
   behavior under sustained over-budget windows.
6. Rerun iOS Safari water/WebGPU canaries and renderer telemetry review after a
   deploy carrying the new mobile-readiness work.
7. Complete the paired Open Country multiplayer playtest.

Do not treat the store/native gates as closed. The Open Country paired playtest
and any paid store/signing/Steamworks work remain manual and explicitly gated.
