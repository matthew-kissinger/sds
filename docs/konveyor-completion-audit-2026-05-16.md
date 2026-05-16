# Konveyor Completion Audit - 2026-05-16

Branch: `exp/konveyor-webgpu-migration`

Commit audited: `b77eac4c4c785b01ef824eaaf60d7d7ff462d439`

## Objective Restatement

Complete the SDS Konveyor autonomous campaign by finishing the WebGPU migration
on `exp/konveyor-webgpu-migration`, while keeping WebGL as the default until
documented gates pass, migrating production rendering through measured parity,
preserving deterministic sim and multiplayer contracts, proving native/runtime
assumptions, and continuing until either the campaign is complete or a
documented hard stop is reached.

## Prompt-to-Artifact Checklist

| Requirement | Evidence inspected | Status |
|---|---|---|
| Work happens on `exp/konveyor-webgpu-migration`. | `git status --short --branch` reports `exp/konveyor-webgpu-migration...origin/exp/konveyor-webgpu-migration`; current commit is `b77eac4c4c785b01ef824eaaf60d7d7ff462d439`. | Pass |
| Keep WebGL default until documented gates pass. | `cycle36-validation/runtime/production-webgpu-request-proof.json` records default URL `effective: "webgl"`, `fallbackReason: null`, `defaultNotProductionWebGpu: true`. `index.html` still defaults `window.__SDS_RENDERER_MODE` to `webgl`. | Pass |
| Explicit WebGPU request enters the production WebGPU route on supported desktop hardware. | `production-webgpu-request-proof.json` records Field, Rolling Hills, and Open Country with `effective: "webgpu-production"`, device preflight `ok: true`, `rendererIsWebGpu: true`, nonblank screenshots, zero console/page errors, and scene-body material/native-instancing checks passing. | Pass |
| Unsupported WebGPU or failed device creation fails closed to WebGL. | `production-webgpu-request-proof.json` records the no-`navigator.gpu` case as `fallbackReason: "webgpu-unavailable"` and simulated request-device failure as `fallbackReason: "webgpu-device-request-failed"`, both `effective: "webgl"`. | Pass |
| Migrate production rendering incrementally rather than a broad shader rewrite. | `docs/konveyor-autonomous-run.md`, `docs/konveyor-sds.md`, `js/rendering/konveyorRuntimeMode.js`, `js/rendering/konveyorProductionWebGpuBoot.js`, and the material adapter tests show staged adapter/factory routes for atmosphere, effects, tree/rock, grass, water, terrain, sheep, and impostors. | Pass |
| Measure WebGPU parity before claiming readiness. | `cycle36-validation/runtime/production-gameplay-parity-proof.json` records `ok: true`, `defaultReady: true`, and all three scenes passing semantic capture/runtime checks. Full-frame SSIM remains advisory due renderer-structural foliage/grass differences. | Pass |
| Gate explicit production WebGPU route on frame-time budget. | `cycle36-validation/runtime/production-webgpu-perf-proof.json` records Field `avg=6.956 ms`, `p95=7.067 ms`, Rolling Hills `avg=6.944 ms`, `p95=6.952 ms`, and Open Country `avg=6.944 ms`, `p95=6.952 ms`, all above 1150 samples and below the 22 ms avg / 30 ms p95 budget. | Pass |
| Preserve multiplayer contracts. | `cycle36-validation/runtime/production-webgpu-mp-proof.json` records host and guest both `effective: "webgpu-production"`, room scene `field`, `roomState: "in-game"`, two connected players, nonblank canvases, and zero captured errors. `npm test` passed after the MP helper changes. | Pass |
| Preserve deterministic shared sim boundary. | No `shared/**` files are changed in commit `b77eac4`. `npm test` passed with 442 passing and 7 skipped specs. | Pass |
| Prove native/runtime assumptions. | `npm run native:check` passed and refreshed `cycle36-validation/native/preflight.json` at `2026-05-16T01:51:18.143Z`. Request proof also verifies desktop WebGPU adapter/device preflight before booting production WebGPU. | Pass |
| Cover the Rolling Hills terrain/camera/sheep bug from review. | `production-gameplay-parity-proof.json` records Rolling Hills camera `aboveSurface: 12`, sheep `matrixSurfaceAbsMax: 0`, and `belowWaterMatrices: 0`; `tests/optimized-sheep-heightfield.spec.js` covers heightfield-aware sheep placement. | Pass |
| Prevent validation tabs/listeners from contaminating perf and benchmark evidence. | `AGENTS.md`, `.claude/rules/scene-and-render.md`, `tools/validation/README.md`, `vite.config.js`, and `playwright.config.ts` document and enforce `SDS_SUPPRESS_BROWSER_OPEN=1` for automation. Post-proof scans found no local 3000/4173/8787/5400 listeners or matching browser/dev-server processes. | Pass |
| Refresh Apple water canary evidence. | `IOS_WATER_BASE_URL=https://sheepdogsim.com npm run test:ios-water` passed on BrowserStack iPhone 15 Pro Max / iOS 17 Safari at 2026-05-16T01:57Z with sample average `[29, 42, 20]` and `nearFoamWhite: false`. | Partial - live baseline only |
| Decide whether `sheepdogsim.com` should switch default renderer. | `docs/konveyor-sds.md` requires live telemetry and a fallback/default policy decision before changing the web default. `renderer_mode_resolved` telemetry is implemented but not deployed or observed from live traffic. | Missing |
| Run post-deploy canary for this branch. | `NEXT_SESSION.md` records that the BrowserStack canary must be rerun after a deploy carrying this branch. No deploy has occurred for commit `b77eac4`. | Missing |
| Complete paired Open Country multiplayer playtest. | `NEXT_SESSION.md` records this as a Matt-at-keyboard carryover. It cannot be completed autonomously. | Missing/manual |
| Avoid unauthorized production deployment or public release decision. | `docs/konveyor-autonomous-run.md` hard-stops on production deployment and public release decisions without explicit user request. This branch was pushed to `origin/exp/konveyor-webgpu-migration`; no production deploy was triggered because `.github/workflows/deploy.yml` only deploys on `main`. | Pass |

## Audit Result

The WebGPU migration packet is implementation-ready on the experimental branch:
the explicit production WebGPU route, fallback behavior, three-scene parity,
frame-time budget, native preflight, Rolling Hills terrain placement fix,
multiplayer proof, and validation hygiene are covered by concrete artifacts.

The campaign is not complete as a production rollout. The remaining work crosses
documented hard-stop or manual boundaries:

1. Production deploy or merge to `main` requires an explicit user request.
2. The iOS Safari water canary must be rerun after that deploy; the current
   BrowserStack result only covers the already-live site.
3. Default renderer policy still needs deployed `renderer_mode_resolved`
   telemetry or an explicit release decision before moving beyond WebGL default.
4. The paired Open Country multiplayer playtest remains human-gated.

Do not mark the thread goal complete from the current branch state. The correct
next step is an explicit user decision: keep this branch as a review packet,
open a PR, merge/deploy it, or continue with more pre-release hardening while
WebGL remains default.
