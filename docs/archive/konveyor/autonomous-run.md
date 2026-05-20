# Konveyor Autonomous Run

> Active handoff for the SDS WebGPU, optimization, and native shipping campaign.
> This is not a normal numbered cycle. It started as the branch-level operating
> brief for `exp/konveyor-webgpu-migration`; after PR #52, it is the current
> campaign handoff for post-merge WebGPU/mobile work.

## Branch

Historical Konveyor work happened on:

```bash
git switch exp/konveyor-webgpu-migration
```

PR #52 has since merged the progressive WebGPU packet to `main`. Continue Cycle
38 from the current checkout unless a scoped follow-up branch is created, and do
not restart from the stale experimental branch unless the user explicitly asks
to inspect that historical line.

## Objective

Carry SDS from its current WebGL-first implementation toward the destination in
[`konveyor-sds.md`](konveyor-sds.md): WebGPU-first rendering, recovered
performance headroom, and a native packaging path for desktop and mobile, while
preserving game feel, visual identity, deterministic multiplayer, and the
single git tree.

This run should continue autonomously through ordinary blockers. Do not stop
because a phase boundary was reached. Do not stop because a prior cycle plan
ended. Stop only for the hard stops below or when the campaign objective is
actually complete.

## Current proof packet

Cycle 36 completed the foundation pass and is now evidence, not the active
control surface:

- [`cycle-36-plan.md`](cycle-36-plan.md) records the foundation closeout.
- [`archive/research/cycle-36-konveyor-runtime-proof.md`](archive/research/cycle-36-konveyor-runtime-proof.md)
  records current runtime and native-shell facts.
- [`archive/research/konveyor-webgpu-native-best-practices-2026-05-15.md`](archive/research/konveyor-webgpu-native-best-practices-2026-05-15.md)
  aligns current Three WebGPU/TSL, browser WebGPU, Tauri, WebView2, Electron,
  Capacitor, and WebKit facts with the active SDS migration shape.
- [`archive/research/native-release-oss-options-spike-2026-05-16.md`](archive/research/native-release-oss-options-spike-2026-05-16.md)
  broadens the native release path beyond Electron/Tauri into pinned Chromium,
  platform WebViews, mobile shells, PWA/TWA wrappers, Steamworks integrations,
  and true-native rewrite candidates without approving dependencies or store
  prep.
- [`archive/research/perf-extensibility-rust-oss-spike-2026-05-16.md`](archive/research/perf-extensibility-rust-oss-spike-2026-05-16.md)
  records the performance, memory, worker, WebGPU-compute, and Rust/WASM option
  space while keeping `shared/**` deterministic changes behind explicit
  authorization.
- [`archive/research/browser-device-performance-spike-2026-05-16.md`](archive/research/browser-device-performance-spike-2026-05-16.md)
  records the browser/device/WebGPU/mobile best-practice spike, including why
  Android WebGPU must be tested on a secure localhost origin through ADB reverse
  and why one phone proof is not broad mobile certification.
- [`archive/research/cycle-36-webgpu-hero-blocker.md`](archive/research/cycle-36-webgpu-hero-blocker.md)
  records why Rolling Hills production rendering should not be the first
  WebGPU boot target.
- [`../tools/probe-webgpu-runtime.mjs`](../tools/probe-webgpu-runtime.mjs)
  probes browser WebGPU adapter/device creation.
- [`../tools/validation/golden/`](../tools/validation/golden/) now contains
  the initial 12-cell deterministic Konveyor screenshot goldens. The harness
  captures through `probeRender=1`, `cinematic=1`, `visualGolden=1`, and
  fail-closed deterministic Konveyor rock placement, then enforces
  normalized-luma SSIM >= 0.95.
- [`../progress.md`](../progress.md) records the completed foundation steps.
- Commit `2f9b846` stabilized the foundation/native-readiness packet on this
  branch while leaving unrelated `.agents/skills/*` folders uncommitted.
- Cycle 37 is now complete evidence, not the active control surface. The final
  packet is `../cycle36-validation/runtime/cycle37-final-webgpu-request.json`
  plus screenshots in `../cycle36-validation/runtime/cycle37-final-webgpu-request/`,
  final perf at
  `../cycle36-validation/runtime/cycle37-final-webgpu-perf.json`, native
  preflight at `../cycle36-validation/native/preflight.json`, and docs at
  [`native-packaging-proof-0.md`](native-packaging-proof-0.md) plus
  [`native-store-steam-readiness-checklist.md`](native-store-steam-readiness-checklist.md).
  It formalized `AtmosphereFrame.v1`, enlarged the WebGPU sun, improved
  sky/cloud/fog horizon tuning, and preserved the then-current WebGL default
  plus deploy/default-renderer/store gates. Matt later approved a progressive
  WebGPU default while keeping WebGL rollback paths. The post-cycle default
  proof is
  `../cycle36-validation/runtime/progressive-webgpu-default-request-proof.json`,
  with perf at
  `../cycle36-validation/runtime/progressive-webgpu-default-perf-proof.json`
  and settings UI proof at
  `../cycle36-validation/runtime/progressive-webgpu-settings-toggle.png`.
- The post-Cycle 37 mobile-readiness pass added the first connected Android
  WebGPU proof and the runtime budget layer needed for mobile policy. The proof
  artifact is
  `../cycle37-validation/runtime/android-webgpu-rolling-hills-final-2026-05-16.json`.
  Device `R5CX4028VGJ` ran Android Chrome through secure localhost with
  `adb reverse tcp:3000 tcp:3000`; WebGPU was available, Rolling Hills
  follow-close full-scene WebGPU held `p95=16.733 ms` and `p99=16.871 ms`, and
  the run reported `drawCalls=37`, `avgEstimatedTriangles=753920`, and no page
  or console errors. This is a valid high-mobile baseline, not full
  scene/device certification.
- The mobile-readiness implementation also added custom WebGPU cost estimates,
  the `QualityGovernor`, Android ADB/CDP perf tooling, mobile WebGPU tree/rock
  culling, committed Kiln impostor sidecar use for the mobile tree path, shared
  branch/leaf wind controls, dog-through-tree leaf occluder controls,
  deep-blue shoreline/glint water controls, grass interaction for dog plus
  nearest sheep, and tiered terrain fidelity policy.
- Cycle 38 follow-up evidence shows the mobile path is still not ready. The dog
  sprint harness now drives a line route across the island
  (`netDisplacement=148.477`, `straightness=0.974`), but the current connected
  phone proof still records sprint-start spikes up to `66.7 ms`. The Android
  runner now keeps one game page target, but Open Country still misses
  high-mobile budgets. Current artifacts under `../cycle38-validation/runtime/`
  report follow-close around `p95=50.1 ms` / `p99=50.1 ms` and
  horizon/terrain-seam around `p95=50.0 ms` / `p99=50.1 ms`. Terrain
  seams/bands, grass-displacement readability, and proper view-dependent
  octahedral impostors remain active blockers.
- A later full connected-Android pose matrix is now recorded at
  `../cycle38-validation/runtime/android-webgpu-cycle38-poses.json`: 15
  full-scene rows, nonblank screenshots for every row, all rows red for
  high-mobile budget, and 12 rows red for mid-mobile budget. The WebGPU
  impostor lab proof is also executable at `npm run probe:webgpu-impostor-lab`
  and records dynamic tile controls plus lat/lon and octahedral selector
  variation, but it is a diagnostic lab only.
- The Cycle 38 tree-impostor branch packet now has an explicit
  `?konveyorNativeTreeImpostors=1` route that keeps near native LOD0, uses a
  branch-preserving native LOD1 mid tier, and switches far trees to
  lat/lon-hemi Kiln impostor quads with per-instance tile offsets and weights.
  Desktop installed-Chrome proof is green, Android proof is screenshot-valid
  but budget-red, and this is still not true octahedral impostor readiness.
- The accepted tree-placement readability patch fixes a separate layout issue:
  deterministic tree candidates still come from the existing nested scene
  zones, but final placement now applies cross-zone canopy spacing and tighter
  scale jitter floors. Evidence:
  `../cycle38-validation/runtime/tree-placement-spacing-diagnostics.json`
  reports zero canopy-overlap pairs in Field, Rolling Hills, and Open Country;
  desktop installed-Chrome WebGPU screenshots are in
  `../cycle38-validation/runtime/desktop-webgpu-tree-placement-after.json`.
- The later desktop visual recovery pass repairs the production WebGPU
  grass/sheep/wool/sun proof surface. The current grass artifact,
  `../cycle38-validation/runtime/desktop-webgpu-grass-interaction-evidence.json`,
  freezes wind/sim, disables contact shadowing, isolates dog and sheep contact,
  and writes off/on/diff/overlay triptychs. It records
  `proofMode="shadow-disabled-geometry-deformation"`,
  `overlapMode="dominant-contact-capped-vector"`, `maxDisplacement=0.95`,
  dog changed `0.961%`, and sheep changed `0.992%`.
- `../cycle38-validation/runtime/desktop-webgpu-visual-recovery-proof.json`
  records installed-Chrome WebGPU evidence for bounded sun discs across Field,
  Rolling Hills, and Open Country; fixed-phase sheep captures with constrained
  leg motion and body-only wool; Open Country shoreline/glint; and tree-occluded
  regression rows. Phone proof remains deferred because the phone was not
  connected.
- The current grass/sheep/wool/sun repair contract is
  [`archive/research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md`](archive/research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md).
  The desktop proof surface now implements it. Matt's older WebGL screenshot is
  still the art-direction reference for parted blade silhouettes, warm
  structured sun halo, sun-aligned water reflection, and wool silhouette
  breakup.

The desktop browser conclusion: installed Chrome 148 can create a WebGPU device
on the current Windows machine, but Playwright's bundled Chromium 147 exposes
WebGPU and fails `requestDevice()`. Device creation is the gate. The Android
conclusion: Chrome WebGPU works on the connected phone when tested through
secure localhost, but the full scene/camera/device matrix is still Cycle 38
work.

Native-readiness now has a code seam:

- `BUILD_TARGET=native npm run build` builds with relative asset paths and
  service-worker registration disabled.
- `SDS_WORKER_BASE=<origin>` can override the live worker origin at build time.
- `js/runtimeConfig.js` owns Worker HTTP origin, Worker WebSocket origin, and
  telemetry enablement.
- `npm run native:check` builds the native target and verifies the generated
  bundle with `tools/native-preflight.mjs`. The preflight also checks both
  HTML entrypoints for relative `./assets/...` URLs and rejects root-relative
  `/assets/...` URLs for native shell packaging.

WebGPU now has a diagnostic island, not a production renderer:

- `?renderer=webgpu&diagnostic=1` boots a minimal WebGPU/TSL scene.
- The diagnostic path loads copied Three WebGPU/Core browser modules only after
  the query flag is present, so the default WebGL bundle and `three` chunk stay
  inside existing refactor-baseline ratchets.
- [`../cycle36-validation/runtime/webgpu-diagnostic-chrome.json`](../cycle36-validation/runtime/webgpu-diagnostic-chrome.json)
  records installed Chrome 148 rendering diagnostic frames through WebGPU.
- [`../cycle36-validation/runtime/webgl-default-chrome.json`](../cycle36-validation/runtime/webgl-default-chrome.json)
  records the default production-preview URL with `diagnostic: null`.
- [`../cycle36-validation/runtime/webgpu-request-fallback-chrome.json`](../cycle36-validation/runtime/webgpu-request-fallback-chrome.json)
  is the archived pre-production-route plain-request fallback artifact. It has
  been superseded by
  [`../cycle36-validation/runtime/production-webgpu-request-proof.json`](../cycle36-validation/runtime/production-webgpu-request-proof.json),
  where plain `?renderer=webgpu` enters `effective: "webgpu-production"` and
  the default URL remains `effective: "webgl"`.
- [`archive/research/konveyor-shader-surface-inventory-2026-05-14.md`](archive/research/konveyor-shader-surface-inventory-2026-05-14.md)
  ranks the current GLSL and `onBeforeCompile` migration surface. The sun
  billboard, portal ring, cloud-plane, sky/fog, and anime-water formulas are
  now ported inside the diagnostic island. The sky/fog and cloud-plane
  node-material candidates now also live in reusable atmosphere modules. The
  meadow-quad diagnostic now uses
  production default grass colors, the far-ring UV hash scale, and CPU sky/fog
  input. A terrain-heightfield diagnostic
  island now samples the real Rolling Hills heightfield texture for
  height-based ground color and fog input. The rock-rim fresnel formula is
  also ported as the first `onBeforeCompile` replacement island, and a
  diagnostic tree-leaf island now covers wind displacement, alpha-hash posture,
  and occluder fade inputs without touching production GLBs. A diagnostic
  `glb-material-replacement` island now proves tree material-name replacement
  and rock traversal replacement in isolation.
- [`../cycle36-validation/runtime/material-ownership.json`](../cycle36-validation/runtime/material-ownership.json)
  records GLB material ownership for production-adjacent tree and rock work.
  Tree LOD0/LOD1 assets have stable `branches` and `leaves` material names;
  rock GLBs currently require asset-class or mesh-traversal replacement because
  their primitives resolve through runtime-default material ownership.
- [`../cycle36-validation/runtime/material-replacement-proof.json`](../cycle36-validation/runtime/material-replacement-proof.json)
  applies those replacement strategies to primitive clones from the shipped
  compressed GLBs: tree LOD0/LOD1 replacements resolve by material name and rock
  replacements resolve by traversal.
- [`../cycle36-validation/runtime/webgpu-diagnostic-chrome.json`](../cycle36-validation/runtime/webgpu-diagnostic-chrome.json)
  now also records `runtime-glb-material-proof`: the browser diagnostic fetches
  all seven shipped tree and rock GLBs, parses their primitive/material
  contracts, and proves 8 tree and 3 rock replacements through the expected
  strategies.
- The same diagnostic artifact now records `runtime-glb-rendered-clones`: the
  browser loads all seven shipped tree and rock GLBs through the production
  GLTF/Draco/Meshopt loader stack, renders them in the WebGPU scene with node
  material replacements through the production-side Konveyor adapter, and
  reports `runtimeGlbPreview.ok: true`. The loader modules are served through
  the diagnostic static vendor path so the default `main` bundle stays inside
  the refactor-baseline ratchet.
- The diagnostic also records `production-placement-preview`: Rolling Hills
  scene data is sampled through `shared/TreePlacement.generateTrees`, and eight
  adapter-backed tree GLB samples are rendered in the WebGPU scene. This is a
  tree-placement proof only; it does not boot the production renderer, does not
  instantiate `TerrainBuilder`, and does not change WebGL.
- The diagnostic now records `production-instanced-tree-preview`: the same
  Rolling Hills samples are rendered as four WebGPU `THREE.InstancedMesh`
  groups, one trunk and one leaves group per tree type. This proves the current
  production placement matrices and WebGPU node materials can survive a native
  Three instancing path. It is LOD0-only and explicitly does not import
  `@three.ez/instanced-mesh`/`InstancedMesh2` into the WebGPU diagnostic.
- The native tree-instancing proof now runs through
  `js/world/konveyorNativeInstancingAdapter.js`, a renderer-specific adapter seam
  that can feed WebGPU `THREE.InstancedMesh` groups without importing
  `InstancedMesh2`.
- The diagnostic now records `diagnostic-rock-instancing-preview`: rock
  transform samples generated by production-side `js/world/rockPlacementPlan.js`
  with an injected seeded RNG are rendered from the shipped rock GLBs through
  native WebGPU `THREE.InstancedMesh` groups. Shared obstacle wiring is
  unchanged, and the diagnostic does not import production `InstancedMesh2`.
- [`../cycle36-validation/runtime/rock-placement-flag-proof.json`](../cycle36-validation/runtime/rock-placement-flag-proof.json)
  records the production rock-placement plan through
  `?renderer=webgpu&konveyorRocks=1` using `mulberry32(sceneSeed + Rock)`.
  Field and Rolling Hills produce stable rock/obstacle placements, while Open
  Country records a stable zero-rock outcome for the current scene zones. The
  default route still uses client `Math.random()` because the flag is off.
- [`../cycle36-validation/runtime/production-flag-fallback-proof.json`](../cycle36-validation/runtime/production-flag-fallback-proof.json)
  records Field, Rolling Hills, and Open Country production scenes with
  every current Konveyor material/placement flag enabled while omitting
  `renderer=webgpu`. The boot stays on WebGL with no fallback reason, and the
  material/placement adapters remain flag-disabled. This keeps subsystem flags
  from changing the default renderer by themselves.
  The proof now also captures non-diagnostic production canvas screenshots in
  [`../cycle36-validation/runtime/production-flag-fallback-screenshots/`](../cycle36-validation/runtime/production-flag-fallback-screenshots/)
  and verifies each screenshot is nonblank before accepting the default-route
  policy contract. Plain `?renderer=webgpu` is validated separately by the
  production WebGPU request proof.
- A production-facing tree/rock material adapter now exists behind
  `?renderer=webgpu&konveyorMaterials=1` and explicit WebGPU material factories.
  `TerrainBuilder.loadModels()` now invokes it after the default WebGL
  tree-wind and rock-rim patch chain, reusing the proved tree material-name and
  rock traversal strategies against cached production GLB roots. It still
  leaves the default WebGL `onBeforeCompile` patch path untouched when the flag
  or factories are absent. The reusable WebGPU rock-rim, tree-branch, and
  tree-leaf node-material candidates now live in
  `js/world/konveyorRockRimNodeMaterial.js`,
  `js/world/konveyorTreeBranchNodeMaterial.js`, and
  `js/world/konveyorTreeLeafNodeMaterial.js`, and the material adapter spec
  proves the flagged production seam can route rock traversal plus `branches`
  and `leaves` through them while default WebGL tree wind, occluder, and rock
  rim patching remain untouched.
- A production-facing far-ring meadow material adapter now exists behind
  `?renderer=webgpu&konveyorGrass=1` and an explicit meadow material factory.
  It covers `GrassSystem.createMeadowQuadMaterial`, and the reusable WebGPU
  meadow-quad node-material candidate now lives in
  `js/world/konveyorMeadowQuadNodeMaterial.js`. The grass adapter spec proves
  the flagged production seam can route through that reusable candidate; blade
  grass material creation now also has a production-facing seam behind the same
  flag with an explicit `createGrassBladeMaterial` factory and optional controls
  for time, fog, camera, wind, sun direction, and interactor updates. The
  reusable WebGPU grass-blade node-material candidate now lives in
  `js/world/konveyorGrassBladeNodeMaterial.js`, and the grass adapter spec
  proves the flagged production seam can route through it with production blade
  geometry, wind, color, lighting, fade, and material posture inputs. Production
  stochastic blade dither, production instancing, compute/trample experiments,
  and scene-level WebGPU grass parity remain deferred. The default meadow
  material still uses
  `MeshLambertMaterial` plus procedural tint injection, with the required
  `USE_UV` define assigned on the material instance before shader compile.
- A production-facing anime-water material adapter now exists behind
  `?renderer=webgpu&konveyorWater=1` and an explicit water material factory.
  It covers only `AnimeWater.createAnimeWaterMaterial` and lets a supplied
  factory own material update controls. The reusable heightfield-backed
  WebGPU anime-water node-material candidate now lives in
  `js/water/konveyorAnimeWaterNodeMaterial.js`, and the water adapter spec
  proves the flagged production seam can route through it. Default WebGL water
  still uses the existing `ShaderMaterial` uniforms for time, sun direction,
  shoreline foam, heightfield foam, ripples, sparkles, and fog. The WebGPU
  diagnostic now also instantiates the real `AnimeWater.createAnimeWater()`
  wrapper through that same flag/factory path and records a heightfield-backed
  production constructor proof for all shipped diagnostic scene captures.
- A production-facing terrain-ground material adapter now exists behind
  `?renderer=webgpu&konveyorTerrain=1` and an explicit terrain material
  factory. It covers only `TerrainBuilder.createTerrain()` material creation
  and passes the current terrain size, segment count, heightfield metadata,
  lazy height-texture creation, terrain colors, procedural-noise constants,
  fog, side, and polygon-offset contract to the factory. The reusable
  heightfield-backed WebGPU terrain node-material candidate now lives in
  `js/world/konveyorTerrainNodeMaterial.js`, and the terrain adapter spec
  proves the flagged production seam can route through it. Default WebGL
  terrain still uses the existing `ShaderMaterial` with Three fog chunks. The
  WebGPU diagnostic now also instantiates the real
  `TerrainBuilder.createTerrain()` path through that same flag/factory seam and
  records a heightfield-backed production constructor proof for all shipped
  diagnostic scene captures.
- A production-facing `OptimizedSheep` material adapter now exists behind
  `?renderer=webgpu&konveyorSheep=1` and an explicit sheep material factory.
  It covers only `OptimizedSheepSystem.createOptimizedMaterial()` material
  creation and lets a supplied factory own time/fog update controls. The
  reusable WebGPU sheep-wool node-material candidate now lives in
  `js/konveyorSheepNodeMaterial.js`, and the adapter spec proves the flagged
  production seam can route through it with sheep color, lighting, wool, fog,
  material, and merged-geometry metadata. Default WebGL sheep still uses the
  existing custom `ShaderMaterial` on the production `InstancedMesh`;
  production instancing parity, animation attributes, full vertex-color part
  parity, terrain grounding, multiplayer-safe visual parity, and high-count
  perf remain deferred.
- A production-facing Kiln impostor material adapter now exists behind
  `?renderer=webgpu&konveyorImpostors=1` and an explicit impostor factory. It
  covers only `createKilnImpostorMaterial()` material creation and lets a
  supplied factory own the sun/ambient tint update from `setImpostorTint()`.
  The reusable WebGPU Kiln impostor node-material candidate now lives in
  `js/konveyorKilnImpostorNodeMaterial.js`, and the adapter spec proves the
  flagged production seam can route through it with atlas textures, sidecar
  layout, lighting, fog, tunables, and material posture. Default WebGL
  impostors still use the existing atlas-sampled `ShaderMaterial`. The injected
  `SceneManager` proof now creates real Kiln impostor geometry plus the
  committed `tree1` albedo/normal/depth atlas set through that same factory seam
  and verifies `konveyor-node-kiln-impostor` in installed Chrome. Production
  per-frame tile selection, parallax, depth discard, production LOD wiring, and
  LOD0 color parity remain deferred.
- A production-facing sun/portal/transient effect material adapter now exists
  behind `?renderer=webgpu&konveyorEffects=1` and explicit WebGPU effect
  factories. The reusable WebGPU sun billboard, portal ring/pad/particle, and
  corral zap bolt/particle node-material candidates now live in
  `js/effects/konveyorSunNodeMaterial.js`,
  `js/effects/konveyorPortalNodeMaterial.js`, and
  `js/effects/konveyorZapNodeMaterial.js`, and the effect adapter spec proves
  the flagged production seam can route through them. The real production
  `SunBillboard`, `PortalEffect`, and `CorralZapEffectPool` constructors are now
  covered inside the WebGPU diagnostic renderer by
  `window.__sdsG.productionEffectAdapter` and
  `cycle36-validation/runtime/production-effect-adapter-proof.json`; default
  WebGL `ShaderMaterial`, `MeshBasicMaterial`, `LineBasicMaterial`, and
  `PointsMaterial` creation remains untouched.
- Reusable WebGPU factory-supply helpers now exist without importing
  `three/webgpu` into the default production bundle. Tree/rock, effects,
  grass, water, terrain, sheep, and Kiln impostor factory glue live in
  dedicated `konveyor*NodeMaterialFactories.js` modules that accept an
  already-loaded WebGPU/TSL module object. `js/konveyorNodeMaterialFactorySuite.js`
  now assembles those helpers plus atmosphere and sheep-part factories from the
  supplied module object; the suite does not statically import `three/webgpu`.
  It also exposes a renderless map from the grouped suite to the existing
  production global factory names. The diagnostic boot now installs that map on
  `window.__sdsKonveyor*MaterialFactories`, and the injected `SceneManager`
  proof consumes that window-global supply while default boot still installs no
  WebGPU factories. `tests/konveyor-factory-suite-production-smoke.spec.js` now proves
  that the real production constructors for sky, clouds, sun, portal, corral
  zap, grass, terrain, water, sheep, and Kiln impostors can consume that
  suite-backed global map only when their explicit Konveyor flags are present.
  The diagnostic harness now consumes that suite instead of owning the material
  mapping inline, records a `factorySuite` summary in
  `cycle36-validation/runtime/webgpu-diagnostic-chrome.json` for scene-bound
  diagnostic boot, and records `factorySupply.mode: "window-global"` in
  `cycle36-validation/runtime/scene-manager-webgpu-renderer-proof.json`, while
  the fail-closed adapter flags still require explicit factories.
- The production `SunBillboard` implementation is now lazy-loaded as a
  scene-coupled chunk before normal scene body construction and scene swaps.
  This preserves the default WebGL sun disc while recovering main-bundle
  headroom for later production seams.
- Production renderer setup has been extracted from `SceneManager` into
  `js/rendering/sceneRendererSetup.js`. The seam keeps the default production
  renderer on `THREE.WebGLRenderer`, but guarded WebGL capability logging,
  context-loss handlers, shadow/pixel-ratio setup, and tonemapping selection
  are now test-covered and summarized on `SceneManager.rendererSetup`.
  `SceneManager` also accepts an explicit renderer/configure factory for proof
  runs without changing normal gameplay construction. This is a
  renderer-boundary migration step. Plain `?renderer=webgpu` now has its own
  production-route proof. This was captured before the later approved
  progressive WebGPU default switch, so treat the default-URL note in this
  historical scout as superseded by the current release-policy proof.
  [`../cycle36-validation/runtime/scene-manager-webgpu-renderer-proof.json`](../cycle36-validation/runtime/scene-manager-webgpu-renderer-proof.json)
  now records installed Chrome running `?renderer=webgpu&diagnostic=1&konveyorSceneManagerProof=1`,
  injecting a real `WebGPURenderer` into `SceneManager`, initializing it through
  `SceneManager.whenRendererReady()`, rendering through `SceneManager.render()`
  with the async WebGPU render path, routing production
  `Atmosphere` sky/cloud/fog constructors, production `SunBillboard`,
  production `TerrainBuilder.createTerrain()`, and production
  `AnimeWater.createAnimeWater()`, plus representative production
  `PortalEffect`, `CorralZapEffectPool`, tree/rock GLB
  material-replacement/native-instancing, `GrassSystem`, and
  `OptimizedSheepSystem` construction plus a Kiln impostor material/geometry
  slice through the diagnostic-installed
  `window.__sdsKonveyor*MaterialFactories` WebGPU supply on the `SceneManager`
  scene, and
  saving a nonblank 320x180 proof screenshot with a visible compact
  tree/rock/sheep/Kiln/terrain/water/grass/effects slice. The
  proof adds
  WebGPU-module ambient/directional lights only in the diagnostic harness
  because the injected renderer comes from the vendored WebGPU Three module;
  default production `SceneManager` lights remain present and unchanged.
- A guarded production boot scout now exists without enabling default WebGPU
  gameplay. `js/rendering/konveyorProductionWebGpuBoot.js` creates the injected
  WebGPU `SceneManager` options, and
  [`../cycle36-validation/runtime/production-webgpu-boot-scout.json`](../cycle36-validation/runtime/production-webgpu-boot-scout.json)
  records installed Chrome loading the built production preview at
  `?renderer=webgpu&diagnostic=1&konveyorProductionBootScout=1&testNoCanvas=1&konveyorProductionSceneBody=1&konveyorNativeInstancing=1&konveyorProductionLoopScout=1&konveyorProductionRafScout=1&scene=field`.
  The proof bypasses the diagnostic scene boot (`diagnosticBoot: false`),
  constructs the normal `SheepDogSimulation` shell with injected WebGPU
  `SceneManager` options, waits through `SceneManager.whenRendererReady()`,
  installs the centralized WebGPU factory globals, runs the normal Home Field
  scene-body init once, runs a guarded 12-frame WebGPU scene-loop scout plus a
  bounded 12-frame `requestAnimationFrame` scout, captures a nonblank canvas
  screenshot, and verifies WebGPU material application for terrain, grass blade,
  atmosphere/cloud, and sheep. This is a guarded scene-loop scout, not gameplay
  parity: `testNoCanvas=1` intentionally avoids the normal gameplay start path.
  The
  current proof records `frameCount: 12`, `performanceFrameCount: 12`, grass
  time advancing from 0 to 0.2, `sharedFrameStep: true` through
  `SheepDogSimulation.runFrame(deltaTime)`, no frame errors, no console/page
  errors, a first-frame warmup of 2595.6 ms, and later proof frames between 9.2
  and 21.3 ms. The rAF scout then records `scheduler: "requestAnimationFrame"`,
  `performanceFrameCount: 24`, grass time advancing from 0.2 to 0.3347,
  monotonic timestamps, no frame/console/page errors, and per-frame render
  elapsed samples between 7.4 and 13.1 ms; it is not yet a perf threshold gate.
  The current proof also enables `konveyorNativeInstancing=1`, so production
  tree placement renders 2,002 Home Field trees through 4 native
  `THREE.InstancedMesh` groups, rock placement renders 334 rocks through 3
  native `THREE.InstancedMesh` groups, and `suppressedWebglOnlyObjects` is
  empty. Plain non-diagnostic `?renderer=webgpu` now uses the proven
  production route. This historical proof predates the later progressive
  WebGPU default switch.
- A guarded production gameplay-start scout now exists at
  [`../cycle36-validation/runtime/production-webgpu-gameplay-scout.json`](../cycle36-validation/runtime/production-webgpu-gameplay-scout.json).
  It uses the same diagnostic production WebGPU route but omits
  `testNoCanvas=1`, lets normal `SheepDogSimulation` constructor initialization
  and `animate()` run, autostarts solo Classic play, advances the normal
  animation loop from `performanceFrameCount` 6 to 68, records a 60-frame
  normal-loop timing sample (`avgMs: 11.64`, `p95Ms: 14.9`,
  `p99Ms/maxMs: 53.6` from an initial warmup spike), advances grass time from
  4.0586 to 4.8102,
  creates the player dog plus 200 sheep, records async WebGPU render status with
  no init/console/page errors, and captures a nonblank gameplay canvas
  screenshot. This moves the scout from synthetic frame-driving into normal solo
  gameplay startup, but remains diagnostic-gated evidence, not a perf threshold
  gate or default WebGPU production enablement.
  The guarded gameplay-start proof now covers all shipped scenes: Home Field,
  Rolling Hills, and Open Country artifacts all report `ok: true`, no
  console/page errors, normal animation-loop advancement, and nonblank gameplay
  screenshots. Open Country is a zero-rock placement scene under the current
  seeded island filter; its artifact records
  `nativeRockInstancing.emptyPlacement: true` rather than treating the lack of
  native rock meshes as a renderer failure.
- The current plain non-diagnostic production WebGPU request proof exists at
  [`../cycle36-validation/runtime/production-webgpu-request-proof.json`](../cycle36-validation/runtime/production-webgpu-request-proof.json),
  captured 2026-05-16T01:49:53.535Z on installed Chrome. The manifest first
  confirms the default URL stays `effective: "webgl"` with no fallback, a
  simulated browser without `navigator.gpu` fails closed to WebGL with
  `fallbackReason: "webgpu-unavailable"`, and a browser with `navigator.gpu`
  but failing `requestDevice()` falls back to WebGL with
  `fallbackReason: "webgpu-device-request-failed"`. Field, Rolling Hills, and
  Open Country then all run at plain
  `?renderer=webgpu&autostart=1&mode=classic`,
  report `effective: "webgpu-production"` with no fallback and successful
  device preflight, use the centralized WebGPU factory suite, route tree/rock
  placement through native `THREE.InstancedMesh`, apply
  terrain/grass/sheep/water/tree-rock materials, capture nonblank screenshots,
  and record no console/page errors.
  `konveyorProduction=1` remains compatible but is no longer required for an
  explicit WebGPU renderer request.
- The explicit production WebGPU route now has a post-warmup perf threshold
  proof at
  [`../cycle36-validation/runtime/production-webgpu-perf-proof.json`](../cycle36-validation/runtime/production-webgpu-perf-proof.json),
  captured 2026-05-16T01:50:50.393Z on installed Chrome. The proof warms each
  scene for 5000 ms, resets `window.__perfHarness`, samples 8000 ms, and
  enforces average <= 22 ms, p95 <= 30 ms, and at least 240 samples. Field
  passed at `avgFrameTime=6.956 ms`, `p95=7.067 ms`; Rolling Hills passed at
  `avgFrameTime=6.944 ms`, `p95=6.952 ms`; Open Country passed at
  `avgFrameTime=6.944 ms`, `p95=6.952 ms`. This is the current measured
  frame-time gate for the non-diagnostic production WebGPU request route.
- The first real two-client multiplayer WebGPU proof now exists at
  [`../cycle36-validation/runtime/production-webgpu-mp-proof.json`](../cycle36-validation/runtime/production-webgpu-mp-proof.json),
  captured 2026-05-16T01:42:30.718Z on installed Chrome against local Vite +
  Wrangler. It drives host and guest through a worker-backed cooperative room
  without `testNoCanvas`, starts gameplay, captures both canvases, and requires
  both clients to report production WebGPU, connected two-player in-game state,
  room scene `field`, nonblank screenshots, and clean console/page state. This
  proof fixed host scene sync before lobby monitoring and refreshed production
  WebGPU state after in-process scene rebuilds.
- The public-site iOS Safari water baseline was refreshed with
  `IOS_WATER_BASE_URL=https://sheepdogsim.com npm run test:ios-water` at
  2026-05-16T01:57Z. BrowserStack iPhone 15 Pro Max / iOS 17 Safari passed with
  sample average `[29, 42, 20]` and `nearFoamWhite: false`. This is live-site
  baseline evidence, not proof of the unpublished branch, so it must be rerun
  after any deploy carrying the Konveyor packet.
- Production boot now emits `renderer_mode_resolved` through the existing
  worker telemetry route. The payload is intentionally low-cardinality:
  requested/effective renderer, fallback reason, WebGPU API availability,
  production WebGPU success, device-preflight success, and scene id. Use this
  with Cloudflare Web Analytics before changing the default web renderer
  policy.
- The current default-ready WebGL-vs-WebGPU production gameplay parity artifact
  is
  [`../cycle36-validation/runtime/production-gameplay-parity-proof.json`](../cycle36-validation/runtime/production-gameplay-parity-proof.json),
  captured 2026-05-16T00:12:39.618Z. Field, Rolling Hills, and Open Country all
  report `captureOk: true`, semantic regional default-ready checks passing, no
  console/page errors, and `defaultReady: true`. Full-frame SSIM remains
  advisory because foliage and grass alpha hashing are structurally different
  across WebGL and WebGPU. The same artifact records the Rolling Hills terrain
  fix: camera `aboveSurface: 12`, sheep `matrixSurfaceAbsMax: 0`, and
  `belowWaterMatrices: 0`. The scene-swap e2e now passes after the frame-clock
  rebuild reset and 0.05s client delta cap, so fresh Open Country flocks stay
  in bounds after active swaps. This is a default-ready proof for the guarded
  route; explicit production request enablement is now covered separately by
  `production-webgpu-request-proof.json`.
- `GrassSystem` is now loaded only by the async production grass creation
  paths in `TerrainBuilder` and sandbox rebuilds. This restored the
  refactor-baseline bundle gate after the water seam without regenerating the
  bundle-size fixture. Current production build evidence: `mainKB=576.09`,
  `threeKB=617.77`, `webgpuDiagnostic=81.83 KB`,
  `konveyorProductionWebGpuBoot=1.98 KB`,
  `konveyorProductionBootScoutRecorder=13.27 KB`,
  `konveyorNodeMaterialFactorySuite=29.15 KB`,
  `konveyorMaterialAdapter=3 KB`, `GrassSystem=35 KB`, `AnimeWater=9 KB`,
  `PortalEffect=5 KB`, `CorralZapEffect=5 KB`.
- Automated Vite dev validation should start with `SDS_SUPPRESS_BROWSER_OPEN=1`.
  The repo still keeps `server.open` for human local development, but browser
  probes must not leave real Chrome tabs or local listeners behind because those
  contaminate WebGL/WebGPU profiling and screenshot comparisons.
- A production-facing sky-dome atmosphere material seam now exists:
  `Atmosphere` can forward an explicit `skyFactory` to `HosekWilkieSky`, and
  `js/atmosphere/konveyorAtmosphereMaterialAdapter.js` keeps that factory
  behind `?renderer=webgpu&konveyorAtmosphere=1`. `HosekWilkieSky` now also
  calls that same fail-closed adapter directly when no override factory is
  supplied. `js/atmosphere/konveyorSkyNodeMaterial.js` now owns the reusable
  WebGPU sky/fog node-material candidate that the diagnostic backdrop and an
  explicit `HosekWilkieSky` sky factory can share. The default path still
  creates the existing WebGL `ShaderMaterial`, and the CPU LUT plus sky/fog
  packet remain the authority for fog, sun color, cloud, water, grass, rock,
  tree, and impostor consumers.
- The same production-facing atmosphere adapter now reaches `CloudLayer`.
  `Atmosphere` can forward an explicit `cloudFactory`, and the real cloud
  layer can route coverage, edge fade, time, feature scale, sun color, and
  wind state through factory controls while keeping the default WebGL
  `ShaderMaterial` path untouched when the flag or factories are absent.
  `js/atmosphere/konveyorCloudNodeMaterial.js` now owns the reusable WebGPU
  cloud-layer node-material candidate that the diagnostic cloud plane and an
  explicit `CloudLayer` factory can share, with coverage, edge fade, feature
  scale, time, wind, sun direction, and sun color driven through node uniform
  controls. Diagnostic sky-preset screenshots now exist; scene-level
  fog/horizon proof now exists; scene-bound diagnostic WebGPU screenshots now
  exist. Default production wiring remains deferred.
- `tests/webgpu-diagnostic.spec.js` now pins the diagnostic fog-consumer
  contract: rock rim, meadow, anime water, terrain, grass, sheep, and Kiln
  diagnostic states all consume the same CPU-visible sky/fog packet. This is
  not a scene-level screenshot parity claim.
- [`archive/research/konveyor-atmosphere-ownership-2026-05-14.md`](archive/research/konveyor-atmosphere-ownership-2026-05-14.md)
  pins sky, fog, sun-color, and cloud ownership before cloud/sky WebGPU work.
  The sky/fog packet now lives in `js/atmosphere/skyFogSamplePacket.js` and
  samples a renderless `HosekWilkieSky({ createRenderable: false })`, so the
  diagnostic path keeps CPU-visible horizon/sun/fog truth without allocating an
  extra sky dome or making the WebGPU sky shader the authority.
- [`../cycle36-validation/runtime/sky-fog-preset-matrix.json`](../cycle36-validation/runtime/sky-fog-preset-matrix.json)
  records renderless CPU sky/fog packets for all five shipped sky presets.
  This covers analytic preset-color parity.
- [`../cycle36-validation/runtime/sky-preset-screenshots/manifest.json`](../cycle36-validation/runtime/sky-preset-screenshots/manifest.json)
  records Chrome WebGPU diagnostic screenshots for all five shipped sky
  presets. The capture used `?renderer=webgpu&diagnostic=1&konveyorSkyPreset=...`,
  reached `effective=webgpu-diagnostic` for every preset, and recorded no
  console or page errors. This is diagnostic visual evidence only; production
  scene wiring remains a separate gate.
- [`../cycle36-validation/runtime/scene-fog-horizon-proof.json`](../cycle36-validation/runtime/scene-fog-horizon-proof.json)
  records a renderless `Atmosphere` proof across the three shipped
  `shared/scenes` definitions. It confirms each scene resolves its intended sky
  preset, preserves its linear fog near/far values, drives fog color from the
  Hosek-Wilkie horizon, and carries preset cloud coverage into both the sky and
  cloud layer.
- [`../cycle36-validation/runtime/scene-sky-screenshots/manifest.json`](../cycle36-validation/runtime/scene-sky-screenshots/manifest.json)
  records installed-Chrome diagnostic WebGPU screenshots for Field, Rolling
  Hills, and Open Country using
  `?renderer=webgpu&diagnostic=1&konveyorScene=...`. Each scene reached
  `effective=webgpu-diagnostic`, bound the expected shipped scene sky preset
  and linear fog range, included the full diagnostic material-island list, and
  recorded no console or page errors. This is scene-bound diagnostic evidence;
  full production-scene WebGPU renderer parity remains a separate gate.
- [`../cycle36-validation/runtime/scene-sky-visual-proof.json`](../cycle36-validation/runtime/scene-sky-visual-proof.json)
  samples the refreshed installed-Chrome scene screenshots with `sharp`. It
  checks the screenshot scene set against the shipped scene registry, matches
  captured sky/fog CPU packets to the renderless `Atmosphere` proof, verifies
  stable scene-background pixels, confirms the cloud band is visually distinct
  from the background, and confirms Rolling Hills remains darker than the
  daytime scenes.
- [`../cycle36-validation/runtime/production-atmosphere-parity-proof.json`](../cycle36-validation/runtime/production-atmosphere-parity-proof.json)
  captures real production WebGL scene screenshots for Field, Rolling Hills,
  and Open Country and compares them against the scene-bound diagnostic WebGPU
  atmosphere screenshots. The proof checks production WebGL renderer identity,
  default `HosekWilkieSky`/`CloudLayer` shader-material ownership, matching
  shipped sky preset, linear fog near/far, fog color, cloud coverage, clean
  console/page state, nonblank screenshots, and upper-sky normalized RGB
  chroma against the diagnostic WebGPU capture. This is atmosphere
  production-scene parity evidence for the shared sky/fog contract; it is not a
  WebGPU production renderer boot claim.
- [`../cycle36-validation/runtime/material-island-visual-proof.json`](../cycle36-validation/runtime/material-island-visual-proof.json)
  samples the same installed-Chrome scene screenshots with `sharp`. It verifies
  Field, Rolling Hills, and Open Country all reached the required diagnostic
  material-island list and checks visible color signatures for sun, cloud,
  meadow, anime water, terrain heightfield, grass blade, sheep wool, tree
  foliage, Kiln impostor, and rock-rim islands. This is still a diagnostic
  material-island gate, not production WebGPU scene parity.
- [`../cycle36-validation/runtime/production-tree-rock-adapter-proof.json`](../cycle36-validation/runtime/production-tree-rock-adapter-proof.json)
  verifies that the same scene-bound diagnostic WebGPU captures load all seven
  shipped tree and rock GLBs through the production GLTF/Draco/Meshopt path,
  route LOD0/LOD1 tree material-name replacement and rock traversal replacement
  through the explicit WebGPU node-material factories, and keep the native
  `THREE.InstancedMesh` tree/rock preview path covered without importing
  `InstancedMesh2`. This is production tree/rock material-adapter proof inside
  the diagnostic renderer; full production WebGPU tree/rock scene parity and
  measured tree-heavy optimization remain separate gates.
- [`../cycle36-validation/runtime/production-atmosphere-adapter-proof.json`](../cycle36-validation/runtime/production-atmosphere-adapter-proof.json)
  verifies that the same scene-bound diagnostic WebGPU captures instantiate the
  real production `Atmosphere`, `HosekWilkieSky`, and `CloudLayer` constructors
  with explicit WebGPU node-material factories for all shipped scenes. Sky and
  cloud materials route through the `?renderer=webgpu&konveyorAtmosphere=1`
  factory path, shipped linear fog near/far values are preserved, and fog color
  still matches the CPU-visible sky/fog packet. This is production atmosphere
  constructor proof inside the diagnostic renderer, not default production
  WebGPU boot.
- [`../cycle36-validation/runtime/production-effect-adapter-proof.json`](../cycle36-validation/runtime/production-effect-adapter-proof.json)
  verifies that the same scene-bound diagnostic WebGPU captures instantiate
  real production `SunBillboard`, `PortalEffect`, and `CorralZapEffectPool`
  constructors with explicit WebGPU node-material factories for all shipped
  diagnostic scenes. The proof records node material names and live controls
  for the sun billboard, portal ring, portal pad, portal particles, corral zap
  bolt, and corral zap particles under `?renderer=webgpu&konveyorEffects=1`.
  This is production effect constructor proof inside the diagnostic renderer;
  gameplay timing, camera-framed portal parity, and default production WebGPU
  boot remain separate gates.
- [`../cycle36-validation/runtime/production-water-adapter-proof.json`](../cycle36-validation/runtime/production-water-adapter-proof.json)
  verifies that the same scene-bound diagnostic WebGPU captures instantiate the
  real production `AnimeWater.createAnimeWater()` wrapper with explicit WebGPU
  node-material factories for all shipped diagnostic scenes. The proof records
  `konveyor-node-anime-water`, the `?renderer=webgpu&konveyorWater=1` factory
  summary, a production `PlaneGeometry` mesh, and the Rolling Hills
  heightfield-backed `Float32Array`/`DataTexture` contract. This is production
  water constructor proof inside the diagnostic renderer; scene-specific
  production WebGPU water parity remains a separate gate.
- [`../cycle36-validation/runtime/production-terrain-adapter-proof.json`](../cycle36-validation/runtime/production-terrain-adapter-proof.json)
  verifies that the same scene-bound diagnostic WebGPU captures instantiate the
  real production `TerrainBuilder.createTerrain()` path with explicit WebGPU
  node-material factories for all shipped diagnostic scenes. The proof records
  `konveyor-node-terrain-heightfield`, the
  `?renderer=webgpu&konveyorTerrain=1` factory summary, a production mobile
  `PlaneGeometry` terrain mesh with `66049` vertices, the bound heightfield
  mesh grid, and the Rolling Hills heightfield-backed
  `Float32Array`/`DataTexture` contract. This is production terrain constructor
  proof inside the diagnostic renderer; scene-specific production WebGPU
  terrain parity remains a separate gate.
- [`../cycle36-validation/runtime/production-grass-adapter-proof.json`](../cycle36-validation/runtime/production-grass-adapter-proof.json)
  verifies that the same scene-bound diagnostic WebGPU captures instantiate
  real production `GrassSystem` grass-blade and meadow material creation plus a
  representative production `InstancedMesh` grass chunk with explicit WebGPU
  node-material factories for all shipped diagnostic scenes. The proof records
  `konveyor-node-grass-blade`, `konveyor-node-meadow-quad`, the
  `?renderer=webgpu&konveyorGrass=1` factory summaries, `28` clump-geometry
  vertices, `12` representative clump instances, the baked heightfield mesh
  grid, and the Rolling Hills heightfield-backed `Float32Array`/`DataTexture`
  contract. This is production grass constructor proof inside the diagnostic
  renderer; full production grass-field generation and scene parity remain
  separate gates.
- [`../cycle36-validation/runtime/production-sheep-adapter-proof.json`](../cycle36-validation/runtime/production-sheep-adapter-proof.json)
  verifies that the same scene-bound diagnostic WebGPU captures instantiate
  real production `OptimizedSheepSystem` merged geometry, material creation,
  instance attributes, and a representative 3-sheep `InstancedMesh` with
  explicit WebGPU node-material factories for all shipped diagnostic scenes.
  The proof records `konveyor-node-sheep-wool`, the
  `?renderer=webgpu&konveyorSheep=1` factory summary, `547` merged-geometry
  vertices, `544` triangles, `color`/`vertexId`/`instanceData`/
  `instanceAnimation` attributes, and initialized sheep data. This is
  production sheep constructor proof inside the diagnostic renderer; terrain
  grounding, multiplayer-safe scene parity, and high-count perf remain separate
  gates.
- [`../cycle36-validation/runtime/sky-lut-profile.json`](../cycle36-validation/runtime/sky-lut-profile.json)
  profiles the same renderless Hosek-Wilkie CPU LUT for the five required
  presets. Current local evidence keeps the CPU-visible LUT as the atmosphere
  contract surface rather than a measured bottleneck; a GPU LUT remains a
  production-profile-driven candidate, not a default assumption.
- [`../cycle36-validation/runtime/tree-refresh-baseline.json`](../cycle36-validation/runtime/tree-refresh-baseline.json)
  records the current tree-refresh input contract before any EZ-Tree rebake:
  active `tree1`/`tree2` picks, compressed/original GLB bytes, Kiln impostor
  sidecar and atlas bytes, material-name replacement proof, and the current
  upstream EZ-Tree candidate status. The baseline can now refresh live npm and
  GitHub changelog evidence with
  `node tools/konveyor-tree-refresh-baseline.mjs --refresh-upstream`.
- [`../cycle36-validation/runtime/webgpu-diagnostic-islands-chrome.png`](../cycle36-validation/runtime/webgpu-diagnostic-islands-chrome.png)
  is a Chrome 148 screenshot artifact for the diagnostic material islands.

## Next autonomous direction

Cycle 37 and the first Android WebGPU mobile-readiness pass are complete. Cycle
38 is active/incomplete. Start with [`../NEXT_SESSION.md`](../NEXT_SESSION.md),
then review
[`cycle-38-plan.md`](cycle-38-plan.md), [`cycle-37-plan.md`](cycle-37-plan.md),
[`native-packaging-proof-0.md`](native-packaging-proof-0.md), and
[`native-store-steam-readiness-checklist.md`](native-store-steam-readiness-checklist.md).
The next implementation step is to continue the Cycle 38 mobile matrix, visual
acceptance gates, asset-budget rebake, and governor-knob wiring from the latest
connected-phone findings. Do not rerun the Cycle 37 phases or treat the
one-phone Rolling Hills proof as full mobile certification.

The older material-island sequence below is historical context for how the
current WebGPU route was built. Use it for orientation, not as the next pickup
order after Cycle 37 or the mobile-readiness proof.

Recommended order:

1. **Pick the next smallest production-adjacent material island.** The sky/fog
   diagnostic prototype now preserves a renderless CPU-accessible
   horizon/sun/fog packet, and the anime-water diagnostic island now covers
   the production palette, shoreline bands, foam, ripples, sun glint,
   fog-color inputs, and a non-filtered float texture loaded from the real
   Rolling Hills heightfield. The terrain-heightfield diagnostic island reuses
   that texture for height-based ground color and fog input while deferring
   production scene replacement. The meadow-quad diagnostic now records the
   production far-ring default colors, UV hash scale, and CPU sky/fog input
   while leaving production far-ring wiring and scene screenshots deferred. The
   grass-blade diagnostic island now covers
   production default gradient colors, analytic wind/gust/flutter displacement,
   alpha-hash posture, sky/fog handoff, and a smooth opacity proxy driven by
   production `grassFadeStart`/`grassFadeEnd` while explicitly deferring
   production stochastic blade dither, interaction bending, production
   instancing, and compute experiments. The sheep-wool diagnostic island now
   covers toon/wool color, procedural wool displacement, rim/SSS lighting terms,
   and sky/fog handoff. Production `OptimizedSheep` material creation now has a
   flag-gated explicit factory seam, but production instancing parity,
   animation attributes, terrain grounding, multiplayer-safe visual parity, and
   high-count perf remain deferred.
   The Kiln
   impostor diagnostic island now fetches the committed `tree1` sidecar plus
   albedo/normal/depth atlases, derives a diagnostic view tile triad from
   sidecar angles, blends three atlas tiles with premultiplied alpha/fog in a
   WebGPU node material, relights from the normal aux layer, and samples the
   depth aux atlas as a diagnostic shading proxy. Production Kiln material
   creation now has a flag-gated explicit factory seam with tint controls, but
   per-frame production tile selection, parallax, depth discard, production LOD
   wiring, and LOD0 color parity remain deferred. The diagnostic WebGPU Kiln
   material now uses numeric atlas tile-scale constants for tile inset math; the
   sky-preset screenshot matrix confirmed no WebGPU shader-module console errors.
   The rock-rim
   TSL prototype covers the smallest `onBeforeCompile`
   replacement formula, and the tree-leaf TSL prototype covers wind,
   alpha-hash posture, and occluder fade inputs. GLB material ownership proof
   and a diagnostic replacement proof now exist, plus a GLB primitive-clone
   proof, browser runtime fetch proof, and rendered production-GLB clone proof
   against all shipped compressed tree/rock assets. The feature-flagged
   production adapter seam now exists, and the reusable rock-rim and tree
   branch/leaf node-material candidates are now extracted and
   adapter-spec-covered for flagged rock traversal plus `branches`/`leaves`
   replacement. The first tree-placement diagnostic
   proof now samples Rolling Hills production scene data through the shared
   tree placement generator, renders adapter-backed WebGPU tree GLB samples,
   and proves a LOD0-only WebGPU `THREE.InstancedMesh` path for the same
   samples through a production-facing adapter seam. Rock placement now has a
   production-side pure placement plan, a seeded diagnostic scene-zone
   generation proof, transform/instancing proof for all three rock GLBs, and a
   production-side deterministic RNG route behind
   `?renderer=webgpu&konveyorRocks=1`; default production still uses client
   `Math.random()` while the flag is off, and shared obstacle wiring remains
   separate. Package
   inspection shows
   `@three.ez/instanced-mesh` has WebGL-specific hooks, so the conservative
   current decision is to keep `InstancedMesh2` on the WebGL path and continue
   the WebGPU route with native `THREE.InstancedMesh` until a measured reason
   says otherwise. The sun/portal/transient effect material adapter, sky-dome
   atmosphere material seam, far-ring meadow material seam, grass-blade
   material seam, anime-water material seam, terrain-ground material seam,
   sheep material seam, and Kiln impostor material seam are now
   production-facing hooks, but all are still flag-gated and factory supplied.
   The atmosphere seam now reaches the
   `Atmosphere` orchestrator through an explicit `skyFactory` and reaches
   `HosekWilkieSky` directly through the same fail-closed adapter; the same
   adapter now reaches production `CloudLayer` through an explicit
   `cloudFactory` or the direct fail-closed flag/factory path. The sky/fog and
   cloud-layer node materials are now extracted into reusable WebGPU factory
   candidates, and the cloud-layer candidate now consumes live `CloudLayer`
   state through node uniform controls. Diagnostic fog consumers are pinned by
   `tests/webgpu-diagnostic.spec.js`; diagnostic preset screenshots, renderless
   scene fog/horizon proof, scene-bound diagnostic WebGPU screenshots, and a
   material-island screenshot sampler are now captured, while full
   production-scene WebGPU screenshots and default production wiring remain
   deferred.
   Production
   `SunBillboard` itself is now
   scene-coupled and lazy-loaded, which creates bundle room for the next seam
   without changing default WebGL behavior. The far-ring meadow path now has a
   production-facing factory seam but no production WebGPU scene wiring claim.
   The water path now has a production-facing factory/update-control seam and
   diagnostic scene-bound screenshot visibility, but production-scene
   Rolling Hills/Open Country parity remains deferred. The terrain path now has
   a production-facing material factory seam and diagnostic scene-bound
   screenshot visibility, but production-scene Rolling Hills/Open Country
   terrain parity remains deferred. The
   sheep path now has a production-facing material factory seam, but high-count
   animation, terrain-grounded visual parity, and multiplayer-safe scene proof
   remain deferred. The Kiln path now has a production-facing material factory
   seam, but per-frame tile selection, LOD wiring, and LOD0 color parity remain
   deferred.
   The reusable WebGPU factory-suite proof now exists and the scene-bound
   Rolling Hills diagnostic boot records the suite's eight factory groups and
   eighteen current factories. The material-island visual proof now samples
   Field, Rolling Hills, and Open Country diagnostic screenshots for visible
   water, terrain, grass, sheep, tree, rock, impostor, meadow, sun, and cloud
   signatures, and constructor proofs now cover production `Atmosphere`,
   tree/rock material adapter, `SunBillboard`, `PortalEffect`,
   `CorralZapEffectPool`, `AnimeWater`,
   `TerrainBuilder.createTerrain()`, and representative `GrassSystem`
   material/chunk construction plus `OptimizedSheepSystem`
   merged-geometry/instancing construction inside the diagnostic renderer. The
   next production-adjacent move was to keep plain `?renderer=webgpu`
   fail-closed while adding an explicit production gate; that intermediate
   route existed behind `konveyorProduction=1` and has now graduated to the
   plain WebGPU request path.
   The production renderer setup seam is now explicit and test-covered, and the
   first opt-in `SceneManager` injection proof now renders production
   `Atmosphere` sky/cloud/fog, `SunBillboard`,
   `TerrainBuilder.createTerrain()`, `AnimeWater.createAnimeWater()`, and
   representative `PortalEffect`, `CorralZapEffectPool`, tree/rock GLB
   material-replacement/native-instancing, `GrassSystem`, and
   `OptimizedSheepSystem` construction plus a representative Kiln impostor
   material/geometry slice as WebGPU node-material islands inside the injected
   `SceneManager` scene in installed Chrome. That proof now consumes the
   diagnostic-installed production global factory names instead of
   proof-local factory arguments, initializes the renderer through
   `SceneManager.whenRendererReady()`, and renders through
   `SceneManager.render()` with `renderStatus.mode="async"`. The guarded
   production boot scout now proves that the normal `main.js` path can pass an
   injected WebGPU renderer into `SheepDogSimulation`, install the centralized
   factory globals, run Home Field scene-body init once, and render a nonblank
   WebGPU canvas under
   `?renderer=webgpu&diagnostic=1&konveyorProductionBootScout=1&testNoCanvas=1&konveyorProductionSceneBody=1`.
   The latest proof adds `konveyorNativeInstancing=1` and
   `konveyorProductionLoopScout=1`, replaces the guarded tree/rock scene-body
   route with native `THREE.InstancedMesh`, renders 2,002 Home Field trees plus
   334 rocks, records no suppressed `InstancedMesh2` objects, and advances a
   controlled 12-frame async WebGPU scene-loop scout through
   `SheepDogSimulation.runFrame(deltaTime)` with grass time moving from 0 to
   0.2, then a bounded 12-frame `requestAnimationFrame` scout with grass time
   moving from 0.2 to 0.3347 and no frame, console, or page errors. The guarded
   production gameplay-start scout now also proves the route can run without
   `testNoCanvas=1`, autostart solo Classic play, create the dog plus 200 sheep,
   and advance the normal `animate()` loop from `performanceFrameCount` 6 to
   68 while recording a 60-frame normal-loop timing sample (`avgMs: 11.64`,
   `p95Ms: 14.9`, `p99Ms/maxMs: 53.6` from an initial warmup spike) with no
   init, console, or page errors. The scene-matrix extension now proves the
   same guarded gameplay-start path across Home Field, Rolling Hills, and Open
   Country; Open Country's no-rock placement is accepted through
   `nativeRockInstancing.emptyPlacement: true`. The explicit production request
   proof now covers plain `?renderer=webgpu`, and the post-warmup perf proof
   gates that plain route against the local desktop budget. The next
   renderer-level move is the broader browser/native fallback policy and
   default enablement decision.
   The sky path now has diagnostic preset screenshot parity, renderless scene
   fog/horizon proof, scene-bound diagnostic WebGPU screenshots, and production
   WebGL scene atmosphere chroma/fog parity against those diagnostic captures,
   but still needs true production-scene WebGPU screenshot parity before any
   default production boot claim; next move to a
   smaller shader/material island or the measured rock-generation extraction
   before touching production boot.
2. **Keep measurement attached to every change.** Run the relevant perf,
   latency, screenshot, test, lint, and build gates before claiming progress.
   The current atmosphere packet now has both preset parity evidence and a
   CPU LUT timing artifact; do not replace it with a GPU LUT unless production
   profiling shows cost or parity drift.
3. **Treat EZ-Tree refresh as a measured tree phase, not a side edit.** The
   repo already resolves `@dgreenheck/ez-tree` 1.1.0, which is still the
   current npm latest as of the 2026-05-15 live refresh. Upstream `main` has
   unreleased tree-generation candidates around softer leaf normals, corrected
   growth force, and stratified child branch/leaf placement
   ([npm](https://www.npmjs.com/package/@dgreenheck/ez-tree),
   [changelog](https://github.com/dgreenheck/ez-tree/blob/main/CHANGELOG.md)).
   The baseline packet now captures the current shipped tree contract before
   any rebake and records the live upstream evidence source. Evaluate upstream
   output before Phase 2/4 tree replacement, but only accept regenerated GLBs
   with named visual and perf artifacts.
4. **Advance through the Konveyor phase outline.** Keep moving from cosmetic
   shader compatibility to trees, grass, sheep/high-count rendering, compute
   experiments, native packaging, and web fallback/release decisions as
   evidence allows.
5. **Keep the external-doc alignment current.** Current Three docs support the
   TSL/node-material island approach; MDN keeps adapter/device creation as the
   WebGPU proof gate; Chrome, GPUWeb, and WebKit support data show broad but
   still platform-variable WebGPU availability; and native-shell docs keep
   runtime variability as the packaging risk. Refresh those facts before
   choosing Tauri, Electron, Capacitor, default web renderer policy, a GPU LUT,
   a tree rebake, or a compute path.
6. **Current visual-polish and mobile-readiness status.** The first design-led
   WebGPU polish pass from
   `docs/konveyor-visual-polish-qa-2026-05-16.md` is implemented and Cycle 37
   closed its perf and sun/sky follow-up. The latest Cycle 37 packet is
   `cycle36-validation/runtime/cycle37-final-webgpu-request.json`, screenshots
   live in `cycle36-validation/runtime/cycle37-final-webgpu-request/`, and perf
   proof is `cycle36-validation/runtime/cycle37-final-webgpu-perf.json`.
   Matt later approved a progressive WebGPU default with WebGL fallback, forced
   `?renderer=webgl`, and an experimental settings toggle. The later
   mobile-readiness pass added connected Android proof at
   `cycle37-validation/runtime/android-webgpu-rolling-hills-final-2026-05-16.json`
   with Rolling Hills follow-close WebGPU at `p95=16.733 ms` and
   `p99=16.871 ms`. Continue with `docs/cycle-38-plan.md`; do not restart Cycle
   37, do not treat one Android pose as full mobile certification, and do not
   reframe the work as strict WebGL parity. Store/signing/native-shell decisions
   still require explicit approval.

## Hard stops

Stop and surface only when one of these happens:

- A change requires a frozen file in `docs/INTERFACE_FENCE.md` without explicit
  authorization.
- `tests/sim-baseline/__fixtures__` drift unexpectedly.
- The validation or perf harness is broken and cannot be routed around.
- A required native or WebGPU platform claim contradicts current official docs
  or local probe results.
- The work requires paid-store submission, production deployment, credential
  rotation, destructive D1 changes, or a public release decision.
- The campaign objective is actually complete.

Everything else is normal engineering work. Record the blocker, choose the next
safe route, and keep moving.

## Non-negotiables

- WebGPU is now the progressive default request on supported browsers; WebGL
  fallback, forced `?renderer=webgl`, and the experimental setting remain the
  rollback paths.
- New WebGPU work still needs proof before it widens the release surface.
- Native build-target plumbing may advance without choosing Tauri, Electron, or
  Capacitor. Shell dependencies still require a scoped proof step.
- No `shared/**` deterministic sim changes without explicit operator
  authorization.
- No sim-baseline or screenshot-golden regeneration as a shortcut.
- No render-backend abstraction layer for hypothetical engines.
- No broad shader rewrite hidden behind "boot the hero scene."
- No Steam, App Store, Google Play, or production deploy action without an
  explicit user request.

## Fresh-agent goal

Use this exact goal for the next session:

```text
/goal On the current SDS checkout, continue after the completed Cycle 37 packet, approved progressive WebGPU default, first connected-Android WebGPU mobile-readiness proof, tree-placement readability patch, implemented desktop first-principles visual recovery, and the 2026-05-20 connected-phone spot-check that proved the desktop visual contracts (grass interactor coordinate/overlap mode, sheep lower-leg-weighted gait + body-only wool, water ripple-normal-sun-camera-v2 glint, SunBillboard) carry on Android with 0 console/page errors but high-mobile budgets remain red and the water grid/alignment lines reproduce on phone. Read NEXT_SESSION.md including the Autonomous Completion Brief, docs/cycle-38-plan.md, docs/archive/research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md, docs/cycle-37-plan.md, docs/konveyor-autonomous-run.md, and docs/konveyor-sds.md. Do not rerun Cycle 37 or treat the one-phone Rolling Hills proof as full mobile certification. Preserve the current desktop proof surface: shadow-disabled grass deformation, fixed-phase sheep leg/body-only wool captures, and bounded sun/atmosphere proof. The 2026-05-20 phone-reconnect artifact is cycle38-validation/runtime/android-webgpu-phone-reconnect-spotcheck.json with screenshots under cycle38-validation/screenshots/android-webgpu-phone-reconnect-spotcheck/. Next autonomous work: fix water grid/alignment lines (root cause likely UV tiling or ripple/normal sampling), prove sun glint sync to camera and sun direction, close Open Country terrain seams, ship true octahedral sidecar v2 with WebGPU shader-side projection/depth parity and rebake tree2 inside its current budget, prove QualityGovernor hysteresis windows, and pass the Android matrix at ?konveyorNativeTreeImpostors=1 against mid-mobile budget (high-mobile is bonus). Phase 6 carryovers (OC paired 2-client playtest, post-deploy iOS canary, renderer telemetry readout) require Matt or a deploy and are carryovers by definition. Preserve WebGL fallback, forced ?renderer=webgl, the experimental settings toggle, and existing migration gates. Create a scoped working branch (e.g. cycle-38-work) before committing if branch isolation is desired. Do not touch shared/**, sim-baseline goldens, worker migrations, package.json#version, CHANGELOG.md player-line entries, paid-store submission, signing, Steam/App Store/Google Play, production deploy, or native-shell dependencies without explicit approval.
```

When Matt opens the session with "run cycle 38 autonomously" or equivalent,
follow the Autonomous Completion Brief in
[`../NEXT_SESSION.md`](../NEXT_SESSION.md) end-to-end without check-ins
between phases. Pause only on the hard stops listed there or in
[`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Surface the close summary, the
list of Phase 5 + 6 carryovers, and the explicit push/deploy ask before
pushing anything.
