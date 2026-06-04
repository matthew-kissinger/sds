# Knip report (2026-05)

> **Caveat.** An earlier audit of this mixed `.js` / `.ts` / `.tsx` / `.mjs` codebase found roughly **zero true orphans**, so treat every line below as a *candidate* and confirm it manually before deleting anything. Knip was run with **no config file**, so it only sees the entry points it can infer. It does not know about the wrangler `main`, the service-worker registration, the `.claude` hooks, or the many `tools/*.mjs` scripts wired to `package.json` run-scripts and CI. Spot-checks (below) confirmed several "unused" files are in fact live. **Delete nothing on the strength of this report alone.**

## How it was run

- Command: `npx knip` (ephemeral fetch, exit code `1` = findings present, the normal "issues found" exit).
- Knip version: **6.15.0**.
- Config: **none present** (no `knip.json` / `knip.config.*`). Knip emitted a configuration hint asking for one.
- Knip was **not** added as a dependency; `package.json` and `package-lock.json` were left untouched.

## Headline counts

| Category | Count |
|---|---|
| Unused files | 63 |
| Unused devDependencies | 4 |
| Unlisted dependencies | 23 (entries; 3 distinct packages) |
| Unlisted binaries | 2 (entries; 1 distinct binary) |
| Unused exports | 120 |
| Unused exported types | 19 |
| Configuration hints | 1 |

## Spot-check (why the caveat holds)

Four flagged "unused files" were checked and are all reachable via entry points knip could not infer without config:

- `worker/src/index.ts` -> declared as `main = "src/index.ts"` in `worker/wrangler.toml` (Durable Object / Worker entry).
- `sw.js` -> registered via `navigator.serviceWorker` in `index.html`.
- `js/gallery/Gallery.tsx` -> mounted directly by `tests/ui/Gallery.smoke.spec.tsx` as the internal UI review surface.
- `.claude/hooks/check-acceptance.mjs` -> wired as a `Stop` hook command in `.claude/settings.json`.

A knip config that registers these entry-point globs (worker, extra HTML entries, `tools/**`, `.claude/hooks/**`, service worker) would collapse a large share of the 63-file list. That config work is out of scope for this report (report-only).

## Unused files (63)

Grouped by area. Many are known-live; categories noted inline.

### Tooling / probes / proofs under `tools/` (40)

These are standalone scripts. Some are wired to `package.json` scripts or CI; the rest are one-off validation/probe scripts kept as historical artifacts. Knip flags them because nothing *imports* them; they are invoked as scripts, not imported. Confirm against `package.json` scripts before touching.

- `tools/capture-webgpu-scene-sky.mjs`
- `tools/capture-webgpu-sky-presets.mjs`
- `tools/content-capture.mjs`
- `tools/cycle38-phase2-pc-captures.mjs`
- `tools/desktop-probe-v2.mjs`
- `tools/grass-interaction-visual-proof.mjs`
- `tools/inspect-glb-three.mjs`
- `tools/inspect-glb.mjs`
- `tools/konveyor-material-island-visual-proof.mjs`
- `tools/konveyor-material-ownership.mjs`
- `tools/konveyor-material-replacement-proof.mjs`
- `tools/konveyor-production-atmosphere-parity-proof.mjs`
- `tools/konveyor-production-atmosphere-proof.mjs`
- `tools/konveyor-production-effect-proof.mjs`
- `tools/konveyor-production-flag-fallback-proof.mjs`
- `tools/konveyor-production-grass-proof.mjs`
- `tools/konveyor-production-sheep-proof.mjs`
- `tools/konveyor-production-terrain-proof.mjs`
- `tools/konveyor-production-tree-rock-proof.mjs`
- `tools/konveyor-production-water-proof.mjs`
- `tools/konveyor-production-webgpu-mp-proof.mjs`
- `tools/konveyor-production-webgpu-perf-proof.mjs`
- `tools/konveyor-production-webgpu-request-proof.mjs`
- `tools/konveyor-rock-placement-flag-proof.mjs`
- `tools/konveyor-scene-fog-horizon-proof.mjs`
- `tools/konveyor-scene-manager-webgpu-proof.mjs`
- `tools/konveyor-scene-sky-visual-proof.mjs`
- `tools/konveyor-sky-fog-matrix.mjs`
- `tools/konveyor-sky-lut-profile.mjs`
- `tools/konveyor-tree-refresh-baseline.mjs`
- `tools/merge-fence-kit.mjs`
- `tools/mobile-probe.mjs`
- `tools/playtest-screenshots.mjs`
- `tools/portrait-hud-probe.mjs`
- `tools/probe.mjs`
- `tools/q2-orbital-sim.mjs`
- `tools/quality-governor-hysteresis-proof.mjs`
- `tools/sds-test.mjs`
- `tools/webgpu-visual-recovery-proof.mjs`

### Worker source (3): KNOWN LIVE

Flagged only because knip did not read `worker/wrangler.toml`. These are the Worker/DO entry and its imports.

- `worker/src/index.ts` (confirmed: wrangler `main`)
- `worker/src/jwt.ts`
- `worker/src/LobbyDO.ts`

### Client `index.js` barrels and component entries (8)

Barrel/`index` files and entry modules; some are HTML-entry or barrel re-exports knip cannot trace without config.

- `js/components/GameHUD/index.js`
- `js/components/hooks/index.js`
- `js/components/Multiplayer/index.js`
- `js/components/shared/index.js`
- `js/components/StartScreen/index.js`
- `js/gallery/Gallery.tsx` (confirmed: jsdom smoke-test entry)
- `shared/terrain/index.js`
- `js/capture/mediabunny-recorder.js`

### Client modules / shaders / utils (6)

Possible genuine orphans or dynamically-referenced modules. Verify each by grep before any deletion.

- `js/ProceduralMountains.js`
- `js/shaders/HeightFogPatch.js`
- `js/shaders/proceduralMountainsShader.js`
- `js/skeleton-loader.js`
- `js/utils/Logger.js`
- `shared/test.js`

### Service worker / config / hooks / skill assets (6)

Entry points or asset templates outside knip's default graph.

- `sw.js` (confirmed: registered in `index.html`)
- `playwright.browserstack.config.ts` (referenced by `playwright.browserstack.config` usage / BrowserStack run path)
- `.claude/hooks/check-acceptance.mjs` (confirmed: `Stop` hook in `.claude/settings.json`)
- `.claude/hooks/cycle-close-reconcile.mjs` (invoked by the cycle-close ritual)
- `.agents/skills/remotion-best-practices/rules/assets/charts-bar-chart.tsx` (skill asset template)
- `.agents/skills/remotion-best-practices/rules/assets/text-animations-typewriter.tsx` (skill asset template)
- `.agents/skills/remotion-best-practices/rules/assets/text-animations-word-highlight.tsx` (skill asset template)

## Unused devDependencies (4)

Each is plausibly used by a script that knip can't trace (e.g. via `npm run bake-*` or CI). Confirm against `package.json` scripts and `tools/` before removing.

- `@dgreenheck/ez-tree` (`package.json:77`). Used by the EZ-Tree foliage bake (`tools/bake-trees.mjs`); likely a false positive.
- `@gltf-transform/cli` (`package.json:78`). GLB compression CLI; check `compress-glbs` / build pipeline.
- `browserstack-node-sdk` (`package.json:91`). BrowserStack runner (`browserstack.yml`, `test:ios-water`).
- `mediabunny` (`package.json:96`). Paired with `js/capture/mediabunny-recorder.js` (itself flagged unused); confirm whether the capture path is still wired.

## Unlisted dependencies (23 entries, 3 distinct packages)

These are `import`ed but not declared in `package.json`. They resolve today because they are transitive deps (or hoisted), but knip flags them as undeclared direct deps. Worth a manual decision: either add as explicit devDeps or accept the transitive resolution.

- **`playwright`** (16 sites): `tools/android-webgpu-perf.mjs`, `tools/bake-rocks.mjs`, `tools/bake-trees.mjs`, `tools/cinematic/run.mjs`, `tools/cycle41-art-lock.mjs`, `tools/cycle42-material-lock.mjs`, `tools/cycle42-octahedral-proof.mjs`, `tools/dog-sprint-camera-harness.mjs`, `tools/perf-harness.mjs`, `tools/probe-webgpu-runtime.mjs`, `tools/validation/frame-time-histogram.mjs`, `tools/validation/input-latency.mjs`, `tools/validation/lod-compare.mjs`, `tools/validation/screenshot-golden.mjs`, `tools/webgpu-impostor-lab-proof.mjs`. (`@playwright/test` is declared; bare `playwright` is not.)
- **`draco3dgltf`** (4 sites): `scripts/compress-glbs.mjs`, `tests/tree-assets.spec.js`, `tools/bake-mobile-tree-budgets.mjs`, `tools/bake-tree-lod1.mjs`.
- **`meshoptimizer`** (4 sites): `scripts/compress-glbs.mjs`, `tests/tree-assets.spec.js`, `tools/bake-mobile-tree-budgets.mjs`, `tools/bake-tree-lod1.mjs`.

## Unlisted binaries (2 entries, 1 distinct binary)

- **`wrangler`**. Invoked in `.github/workflows/deploy.yml` and in `package.json` scripts via `npx wrangler`. Resolves through `npx`; knip flags it because it is not a declared bin. Expected.

## Unused exports (120)

Knip cannot see exports consumed only through barrels, dynamic access, tests, or the sim's public surface. The `shared/index.js` and `js/components/ui/index.ts` clusters are barrel re-exports (public API surface) and are near-certainly false positives. Several `shared/` exports are part of the deterministic-sim public contract and must not be removed without a sim-fence review.

### `shared/` deterministic-sim surface: DO NOT DELETE without sim-fence review

- `shared/BoundaryCollision.js`: `getDistanceToNearestBoundary`, `generateRandomPositionInBounds`
- `shared/FlockingAlgorithms.js`: `calculateSeparation`, `calculateAlignment`, `calculateCohesion`, `calculateSeek`
- `shared/GameStateValidation.js`: `validateGameState`, `calculateGameProgress`, `generateCompetitiveBalancedSpawns`, `calculateBalancedSpawnClusters`, `resetGameState`, `calculateHerdingEffectiveness`, `validateCompetitiveGameState`
- `shared/MovementPhysics.js`: `interpolatePosition`, `interpolateRotation`
- `shared/Random.js`: `withSeededRandom`
- `shared/index.js` (barrel re-exports, very likely false positives): `listScenes`, `refreshObjective`, `getRequiredSheep`, `calculateSeparation`, `calculateAlignment`, `calculateCohesion`, `calculateSeek`, `interpolatePosition`, `interpolateRotation`, `calculateBoundaryAvoidance`, `isWithinArea`, `getDistanceToNearestBoundary`, `generateRandomPositionInBounds`, `validateGameState`, `calculateGameProgress`, `generateCompetitiveBalancedSpawns`, `calculateBalancedSpawnClusters`, `resetGameState`, `calculateHerdingEffectiveness`, `validateCompetitiveGameState`, `createBoundaryConfig`, `resolveBoundary`

### Client atmosphere / rendering / shaders

- `js/atmosphere/Atmosphere.js`: `FOG_DENSITY_MULTIPLIERS`, `FOG_DARKEN_MULTIPLIERS`, `CLOUD_COVERAGE_TARGETS`, `sunDirectionFromPreset`
- `js/atmosphere/index.js`: `DEFAULT_SKY_FOG_SAMPLE_PRESET`, `FOG_DARKEN_MULTIPLIERS`, `hosekWilkieFragmentShader`, `hosekWilkieVertexShader`, `cloudFragmentShader`, `cloudVertexShader`
- `js/atmosphere/konveyorCloudNodeMaterial.js`: `createKonveyorCloudLayerNodeMaterialResult`
- `js/rendering/konveyorProductionWebGpuBoot.js`: `createKonveyorProductionWebGpuSceneManagerOptions`, `installKonveyorProductionWebGpuLightingBridge`
- `js/rendering/konveyorRuntimeMode.js`: `getWindowSearch`
- `js/shaders/ShaderLoader.js`: `loadShaders`, `preloadShaders`, `clearShaderCache`, `default`
- `js/GrassSystem.js`: `preloadGrassShaders`
- `js/OptimizedSheep.js`: `preloadSheepShaders`, `OptimizedSheepInstance` (class)
- `js/TerrainBuilder.js`: `getSharedDracoLoader`
- `js/diagnostics/glProbe.js`: `reportRenderTarget`, `reportShader`
- `js/diagnostics/webgpuProductionPlacementPlan.js`: `PRODUCTION_PLACEMENT_PREVIEW_SCENE_ID`
- `js/diagnostics/webgpuRockPlacementPlan.js`: `DIAGNOSTIC_ROCK_PLACEMENT_SCENE_ID`
- `js/perf/RenderCostReport.js`: `systemBreakdownToObject`
- `js/world/rockPlacementPlan.js`: `createRockFormation`, `createRockPlacementZones`
- `js/impostors/impostorOrbitLab.js`: `getDefaultImpostorOrbitPoses`

### Client game logic / bridge / config

- `js/ExtremeBoidSystem.js`: `ExtremeBoidSystem` (class)
- `js/FenceCollisionSystem.js`: `FenceCollisionSystem` (class)
- `js/FieldConfig.js`: `ENVIRONMENT_DEFAULTS`
- `js/GameBridge.js`: `isGameActive`, `isCurrentHost`, `leaveRoom`, `createRoom`, `joinRoom`, `quickMatch`
- `js/gamestate/completion.js`: `processCompetitiveCompletion`
- `js/gamestate/modes.js`: `EXTREME_BOID_SOLO_MODES`
- `js/cinematic.js`: `isCinematicMode`, `isUiHidden`, `getRequestedSun`, `makeCameraPath`
- `js/i18n.js`: `default`

### React components / hooks / UI barrel

- `js/components/hooks/usePlatform.js`: `useOrientation`, `useIsCompact`, `useIsLandscapeMobile`, `useIsVeryCompact`, `useResponsiveValue`, `useResponsiveStyle`
- `js/components/shared/playerIdentity.js`: `submitGameScore`
- `js/components/shared/settings.js`: `KEY_DISPLAY_NAMES`, `getKeyBindings`, `updateKeyBinding`
- `js/components/StartScreen/pointerTourState.js`: `__TEST_ONLY__`
- `js/components/ui/index.ts` (barrel; very likely false positives): `Panel`, `PanelTitle`, `Button`, `BackButton`, `Surface`, `useReducedMotion`, `MenuOption`, `MenuOptionGrid`, `SceneSwapOverlay`

### Tests / worker (consumed by test runner or DO, often false positives)

- `tests/e2e/mp/_helpers.ts`: `withMpContext`
- `tests/refactor-baseline/gamestate-harness.js`: `installBrowserShims`
- `tests/refactor-baseline/harness.js`: `fnv1a32`, `loadHeightfieldFromDisk`, `hashHeightfieldGrid`, `hashScatterPositions`
- `tests/sim-baseline/harness.js`: `mulberry32`, `makeSheep`, `SHEEP_CONFIG`, `DOG_CONFIG`
- `worker/src/d1.ts`: `generateRandomName`, `registerPlayer`, `getPlayer`, `scoreColumn`, `formatScore`, `getAllLeaderboards`

## Unused exported types (19)

TypeScript types/interfaces with no detected consumer. The `js/components/ui/index.ts` cluster is a barrel public API surface (likely false positives). Confirm each is genuinely unreferenced before removal.

- `js/components/StartScreen/SceneGlyph.tsx`: `SceneGlyphId` (type)
- `js/components/ui/Badge.tsx`: `BadgeTone` (type)
- `js/components/ui/Button.tsx`: `ButtonVariant` (type), `ButtonSize` (type)
- `js/components/ui/Panel.tsx`: `PanelSize` (type)
- `js/components/ui/index.ts` (barrel): `PanelProps`, `PanelTitleProps`, `PanelSize`, `ButtonProps`, `BackButtonProps`, `ButtonVariant`, `ButtonSize`, `SurfaceProps`, `CardProps`, `BadgeProps`, `BadgeTone`, `IconButtonProps`
- `worker/src/d1.ts`: `PlayerRow` (interface), `SceneId` (type)

## Configuration hints (1)

- Root: knip suggests creating a `knip.json`, then adding entry globs / refining project files to clear the 63-file false-positive list (worker entry, HTML entries, `tools/**` scripts, `.claude/hooks/**`, service worker). Authoring that config is a separate task and is **not** done here.

## Bottom line

Every candidate above needs manual confirmation. Given the prior ~0-orphan audit and the spot-checks proving several flagged files are live entry points, the actionable next step is **authoring a knip config** that teaches it this repo's non-standard entry points, not deleting any of the listed files, exports, or dependencies. Nothing was deleted and no manifest was edited in producing this report.
