# Three r185 release audit

> Cycle 105 Phase 1/2 evidence. Branch: `codex/three-r185-upgrade`.

## Release state

- Upstream migration guide: https://github.com/mrdoob/three.js/wiki/Migration-Guide#184--185
- `npm view three version`: `0.185.0`
- `npm view @types/three version`: `0.184.1`
- SDS pre-upgrade dependency: `three: ^0.184.0`
- SDS pre-upgrade type dependency: `@types/three: ^0.184.1`
- Local upstream clone: `examples/three-r185`
- Local clone tag: `r185`
- Local clone commit: `6c3f7f5 2026-06-25 r185`

`@types/three` remains pinned at `^0.184.1` because npm latest is still `0.184.1`; there is no r185-compatible DefinitelyTyped package to install yet. The project is vanilla JS, so the runtime dependency is the authoritative upgrade surface.

## r185 migration scan

| Surface | SDS files | Classification | Decision |
| --- | --- | --- | --- |
| TSL `positionLocal` in `material.positionNode` | `js/world/webgpuTreeLeafNodeMaterial.js`, `js/world/webgpuTreeBranchNodeMaterial.js`, `js/world/webgpuGrassBladeNodeMaterial.js`, `js/webgpuSheepNodeMaterial.js` | `patch` | Geometry-local masks now read `positionGeometry`; transformed bases keep `positionLocal` where SDS relies on native instancing. Compute-culled grass still folds its own transform from geometry-local input. |
| WebGPU premultiplied alpha / clear color | `js/rendering/productionWebGpuBoot.js`, `js/rendering/sceneRendererSetup.js`, `js/SceneManager.js`, `js/world/TreePlacement.js` | `verify` | Production WebGPU and production WebGL renderers are created with `alpha: false`, and `SceneManager` installs an opaque sky background. `TreePlacement` uses transparent clear only for a render-target tree bake, not the app canvas. |
| `Object3D.updateWorldMatrix()` honoring `matrixWorldNeedsUpdate` | `js/Wolf.js`, `js/atmosphere/HosekWilkieSky.js` | `verify` | The only `updateWorldMatrix()` call is a load-time wolf skeleton measurement and is not paired with `matrixAutoUpdate = false`. The only `matrixAutoUpdate` hit sets it to `true`. No patch needed. |
| `DRACOLoader.setDecoderConfig()` deprecation | `js/TerrainBuilder.js`, `js/Wolf.js`, `js/diagnostics/webgpuRuntimeGlbPreview.js`, `tools/inspect-glb-three.mjs`, HTML diagnostics | `not affected` | SDS uses `setDecoderPath()` and `setDRACOLoader()` only. No `setDecoderConfig()` hit exists. |
| Removed `TiledLighting` / `TiledLightsNode` | live source, tests, tools | `not affected` | No import or identifier hit exists. |
| Removed `SSAAPassNode.clearColor` / `clearAlpha` | live source, tests, tools | `not affected` | No `SSAAPassNode`, `clearColor`, or `clearAlpha` postprocessing use exists outside renderer clear-color calls. |
| Removed `AnamorphicNode` | live source, tests, tools | `not affected` | No import or identifier hit exists. |
| TSL `directionToColor()` / `colorToDirection()` rename | live source, tests, tools | `not affected` | No import or identifier hit exists. |
| `DRACOExporter.parse()` to `parseAsync()` | live source, tests, tools | `not affected` | No `DRACOExporter` hit exists. |
| `KTX2Loader.detectSupport()` renderer assumptions | `js/rendering/ktx2Loader.js`, `tests/ktx2-loader.spec.js` | `patch` | r185's loader assumes either WebGPU `hasFeature()` or WebGL `renderer.extensions`. SDS now skips KTX2 init for renderer-shaped test doubles or pre-support-detection renderers instead of warning through an exception path. |

## Dependency result

- `package.json`: `three: ^0.185.0`
- `package-lock.json`: `node_modules/three.version: 0.185.0`
- `package.json`: `@types/three: ^0.184.1`
- `package-lock.json`: `node_modules/@types/three.version: 0.184.1`

## Shadow override churn verdict

The Cycle 92 instance-level fix in `js/rendering/shadowOverrideMaterialFix.js` remains shipped. r185 did not require changing the fix for build/test compatibility. The full `--heapProfile=1` same-window NSL attribution run is not part of this isolated dependency patch; until that profile is run, the conservative verdict is that the fix remains necessary.

## Bundle-size verdict

r185 changes `DRACOLoader` to define default decoder URLs with `new URL(..., import.meta.url)` at module scope. A plain r185 build emitted unused `draco_decoder.js` and `draco_wasm_wrapper.js` assets even though SDS always calls `setDecoderPath()` with the Google-hosted decoder path before decoding. `vite.config.js` now rewrites those unused default URLs to external strings during build so Vite does not emit the unused decoder fallback assets.

After that mitigation, the remaining production build growth is accepted as the r185 dependency cost:

- `threeKB`: `605` -> `614`
- `chunkBudgetsKiB.three`: `606` -> `615`
- `chunkBudgetsKiB.other`: `619` -> `676`

Only `tests/refactor-baseline/__fixtures__/bundle-sizes.json` is updated for this measured r185 dist-size change. Terrain/scatter refactor fixtures, sim-baseline fixtures, `shared/`, and live assets remain unchanged.

## Verification log

- Pass: `npm test -- tests/webgpu-material-adapter.spec.js tests/webgpu-grass-material-adapter.spec.js tests/webgpu-sheep-node-material.spec.js tests/shadow-override-material-fix.spec.js`
- Pass: `npm test -- tests/ktx2-loader.spec.js tests/scene-renderer-setup.spec.js`
- Pass: `npm test -- tests/refactor-baseline/baseline.spec.ts`
- Pass: `npm run lint`
- Pass: `npm test`
- Pass: `npm run build`
- Pass: `npm run typecheck`
- Timeout: `npm run test:e2e` exceeded the local 300s command window during the full multi-browser/multiplayer matrix; leftover Playwright/Vite/Wrangler processes were stopped by explicit PID cleanup.
- Pass: `npx playwright test tests/e2e/smoke.spec.ts --project=chromium --reporter=list` (2 passed / 1 skipped)
- Pass: `git diff --check`
- Pass: `rg -n "examples/three-r185|three-r185" js package.json package-lock.json vite.config.js` returned no runtime import or dependency hit
- Pass: `git diff --name-only -- shared tests/sim-baseline assets examples` returned no changed files
- Intentional: `tests/refactor-baseline/__fixtures__/bundle-sizes.json` changed only for the recorded r185 bundle-size verdict
