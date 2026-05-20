# Konveyor for SDS

> Campaign doctrine for the SDS WebGPU, optimization, and native-shipping push.
> Read this at the start of every Konveyor run after `AGENTS.md`,
> `NEXT_SESSION.md`, and the active handoff.

This document is the campaign charter. It defines the destination, the gates,
and the disciplines that hold across the run. The active autonomous handoff is
[`konveyor-autonomous-run.md`](konveyor-autonomous-run.md). If a task brief tries
to weaken this doctrine, stop and reconcile the brief first. If reality proves
this doctrine wrong, update this document and `DECISIONS.md` before changing
code around the new assumption.

## Autonomous branch mode

The full migration campaign originally ran on `exp/konveyor-webgpu-migration`.
PR #52 has since merged the progressive WebGPU packet to `main`. Cycle 38 work
continues from the current checkout unless a scoped branch is created for a
follow-up. The tree-impostor packet, desktop sheep/grass repair, discrete
grass proof, tree-placement readability patch, and first-principles visual spike
alignment are now evidence, not a mobile-readiness claim. Numbered cycle
plans are evidence and checkpoints, not stopping points. Agents should keep
moving until the full objective is reached or a documented hard stop is hit. Use
[`konveyor-autonomous-run.md`](konveyor-autonomous-run.md) as the control
surface for the next autonomous pass. The dated completion audit is
[`konveyor-completion-audit-2026-05-16.md`](konveyor-completion-audit-2026-05-16.md);
it is historical for the Cycle 37/PR #52 packet and now includes post-audit
notes for the Android mobile-readiness baseline and Cycle 38 tree packet.
The browser/device research spike for the mobile path is
[`archive/research/browser-device-performance-spike-2026-05-16.md`](archive/research/browser-device-performance-spike-2026-05-16.md);
it is now root-cause context behind the later mobile-readiness implementation
rather than current performance truth.
For any release that carries the Cycle 38 tree/mobile-readiness work, use
[`konveyor-release-decision-checklist.md`](konveyor-release-decision-checklist.md)
for the deploy, post-deploy canary, telemetry readout, and default-policy
review sequence.

## Current repo baseline

As of 2026-05-16, Matt approved the branch to request WebGPU by default on the
web route. The policy is progressive: unsupported browsers or failed WebGPU
device requests fall back to WebGL, `?renderer=webgl` remains a forced escape
hatch, and the settings UI exposes an experimental WebGPU toggle backed by
`localStorage`.

- The client now has both the WebGL renderer path and the production WebGPU
  request path. `js/SceneManager.js` still creates the WebGL fallback/forced
  renderer through `js/rendering/sceneRendererSetup.js`, while the WebGPU route
  injects async renderer options through the Konveyor production boot seam. The
  setup seam records guarded WebGL capability, context-loss, shadow,
  pixel-ratio, and tonemapping posture on `SceneManager.rendererSetup`, and
  proof runs may inject an explicit renderer factory without changing the normal
  call site. The opt-in proof artifact
  `cycle36-validation/runtime/scene-manager-webgpu-renderer-proof.json`
  verifies installed Chrome can instantiate `SceneManager` with an injected
  `WebGPURenderer`, initialize that async renderer through
  `SceneManager.whenRendererReady()`, render through `SceneManager.render()`
  using the async WebGPU render path, route production `Atmosphere` sky/cloud/fog,
  `SunBillboard`, `TerrainBuilder.createTerrain()`, and
  `AnimeWater.createAnimeWater()`, plus representative `PortalEffect`,
  `CorralZapEffectPool`, tree/rock GLB material replacement/native instancing,
  `GrassSystem`, `OptimizedSheepSystem`, and `createKilnImpostorMaterial()`
  construction through the diagnostic-installed
  `window.__sdsKonveyor*MaterialFactories` WebGPU factory supply on the
  `SceneManager` scene, render a nonblank
  320x180 proof frame with a visible compact
  tree/rock/sheep/Kiln/terrain/water/grass/effects slice, and keep the default
  production boot untouched. The proof uses WebGPU-module
  ambient/directional lights only
  because this diagnostic path mixes the vendored WebGPU Three module with the
  default production Three module; production `SceneManager` lights remain
  present and unchanged.
- A guarded production boot scout now exists at
  `cycle36-validation/runtime/production-webgpu-boot-scout.json`. It loads the
  built production preview at
  `?renderer=webgpu&diagnostic=1&konveyorProductionBootScout=1&testNoCanvas=1&konveyorProductionSceneBody=1&konveyorNativeInstancing=1&konveyorProductionLoopScout=1&konveyorProductionRafScout=1&scene=field`,
  bypasses the diagnostic scene boot, constructs the normal
  `SheepDogSimulation` shell with injected WebGPU `SceneManager` options, waits
  through `SceneManager.whenRendererReady()`, installs the centralized WebGPU
  factory globals, runs the normal Home Field scene-body init once, and drives
  a guarded 12-frame WebGPU scene-loop scout plus a bounded 12-frame
  `requestAnimationFrame` scout. It records a ready WebGPU renderer with
  `rendererSetup.rendererMode: "non-webgl"`, `renderStatus.mode: "async"`,
  WebGPU material application for terrain, grass blade, atmosphere/cloud, and
  sheep, plus a nonblank canvas screenshot. This is guarded scene-body evidence
  only: `testNoCanvas=1` intentionally blocks the normal gameplay start path,
  while the rAF scout proves browser frame timestamps can drive the shared frame
  body. The controlled loop scout records
  12 async WebGPU frames through `SheepDogSimulation.runFrame(deltaTime)`,
  `performanceFrameCount: 12`, grass time advancing from 0 to 0.2,
  `sharedFrameStep: true`, no frame errors, no console/page errors, a
  first-frame warmup of 2595.6 ms, and later proof frames between 9.2 and
  21.3 ms. The bounded rAF scout records 12 more async WebGPU frames with
  `scheduler: "requestAnimationFrame"`, `performanceFrameCount: 24`, grass time
  advancing from 0.2 to 0.3347, monotonic timestamps, no frame errors, no
  console/page errors, and per-frame render elapsed samples between 7.4 and
  13.1 ms; this is not yet a perf threshold gate. The current proof uses guarded
  native production instancing instead of suppression: 2,002 Home Field trees
  render through 4 native
  `THREE.InstancedMesh` groups, 334 rocks render through 3 native
  `THREE.InstancedMesh` groups, and `suppressedWebglOnlyObjects` is empty.
  Plain non-diagnostic `?renderer=webgpu` now uses the proven production route.
  This proof predates the later approved progressive WebGPU default switch, so
  treat its default-URL note as historical.
- A guarded gameplay-start scout now exists at
  `cycle36-validation/runtime/production-webgpu-gameplay-scout.json`. It uses
  the same diagnostic production WebGPU boot route but runs without
  `testNoCanvas=1`, lets the normal `SheepDogSimulation` constructor call
  `init()` and `animate()`, autostarts solo Classic play, advances the normal
  animation loop from `performanceFrameCount` 6 to 68, records a 60-frame
  normal-loop timing sample (`avgMs: 11.64`, `p95Ms: 14.9`,
  `p99Ms/maxMs: 53.6` from an initial warmup spike), advances grass time from
  4.0586 to 4.8102,
  creates the player dog plus 200 sheep, records async WebGPU render status with
  no init/console/page errors, and captures a nonblank gameplay canvas
  screenshot. This proves the guarded production WebGPU route can enter normal
  solo gameplay, but it is still diagnostic-gated scout evidence, not a perf
  threshold gate or default WebGPU production enablement.
  The same scout now has scene-matrix coverage for all shipped scenes:
  `production-webgpu-gameplay-scout.json` (Home Field),
  `production-webgpu-gameplay-scout-rolling-hills.json`, and
  `production-webgpu-gameplay-scout-open-country.json` all report `ok: true`,
  no console/page errors, normal animation-loop advancement, and nonblank
  gameplay canvases. Open Country records
  `nativeRockInstancing.emptyPlacement: true`, which is the valid zero-rock
  island placement case after water/corral filtering.
- The current plain non-diagnostic production WebGPU request proof exists
  at `cycle36-validation/runtime/production-webgpu-request-proof.json`
  (captured 2026-05-16T01:49:53.535Z on installed Chrome). It first confirms
  the default URL stays `effective: "webgl"` with no fallback, proves a
  simulated browser without `navigator.gpu` falls back to WebGL with
  `fallbackReason: "webgpu-unavailable"`, proves a browser with
  `navigator.gpu` but failing `requestDevice()` falls back to WebGL with
  `fallbackReason: "webgpu-device-request-failed"`, then runs Field, Rolling
  Hills, and Open Country at plain
  `?renderer=webgpu&autostart=1&mode=classic`, reports
  `effective: "webgpu-production"` with no fallback and successful device
  preflight, uses the shared Konveyor runtime-mode gate to apply terrain,
  grass, sheep, water, tree/rock, and native tree/rock instancing without
  per-subsystem URL flags, captures nonblank screenshots, and records no
  console/page errors.
  `konveyorProduction=1` remains compatible but is no longer required for an
  explicit WebGPU renderer request.
- The explicit production WebGPU route now has a post-warmup perf threshold
  proof at `cycle36-validation/runtime/production-webgpu-perf-proof.json`
  (captured 2026-05-16T01:50:50.393Z on installed Chrome). The proof warms
  each shipped scene, resets the perf harness rolling metrics, samples 8000 ms,
  and gates the route against the local desktop budget of average <= 22 ms,
  p95 <= 30 ms, and at least 240 samples. Current captures pass for Field
  (`avgFrameTime=6.956 ms`, `p95=7.067 ms`), Rolling Hills
  (`avgFrameTime=6.944 ms`, `p95=6.952 ms`), and Open Country
  (`avgFrameTime=6.944 ms`, `p95=6.952 ms`) while still requiring
  `effective: "webgpu-production"`, WebGPU renderer identity, no fallback, and
  clean console/page state.
- Cycle 37 closed the follow-up atmosphere and perf packet for Rolling Hills
  and Open Country. The accepted final proof is
  `cycle36-validation/runtime/cycle37-final-webgpu-request.json` with
  screenshots in `cycle36-validation/runtime/cycle37-final-webgpu-request/`,
  and `cycle36-validation/runtime/cycle37-final-webgpu-perf.json` passes the
  local desktop budget: Rolling Hills `avgFrameTime=6.993 ms`,
  `p95FrameTime=7.29 ms`, `sampleCount=1144`; Open Country
  `avgFrameTime=6.944 ms`, `p95FrameTime=6.958 ms`, `sampleCount=1151`.
  This packet formalized `AtmosphereFrame.v1`, made broad sky glow and
  readable sun-disc ownership explicit, enlarged the WebGPU sun, reduced the
  bland/grey sky read, and preserved WebGL fallback behavior. At Cycle 37
  closeout WebGL was still the default; the later approved release-policy pass
  moved default requests to WebGPU.
- The post-Cycle 37 mobile-readiness pass added a first connected Android
  WebGPU proof at
  `cycle37-validation/runtime/android-webgpu-rolling-hills-final-2026-05-16.json`.
  Device `R5CX4028VGJ` ran Android Chrome through secure localhost with
  `adb reverse tcp:3000 tcp:3000`; WebGPU was available, and Rolling Hills
  follow-close full-scene WebGPU passed the high-mobile target with
  `p95=16.733 ms`, `p99=16.871 ms`, `drawCalls=37`, and
  `avgEstimatedTriangles=753920`. This pass also added custom WebGPU cost
  reports, `QualityGovernor`, Android ADB/CDP tooling, mobile WebGPU tree/rock
  culling, committed Kiln impostor sidecar use for the mobile tree path, shared
  branch/leaf wind controls, dog-through-tree leaf occluder controls, deep-blue
  shoreline/glint water controls, grass interaction for dog plus nearest sheep,
  and tiered terrain fidelity policy. The proof is a baseline, not full
  mobile certification. Cycle 38 owns the scene/camera/system matrix, visual
  screenshot gates, and over-budget asset rebakes.
- Cycle 38 follow-up on the connected phone confirms the mobile path is still
  incomplete. The dog sprint harness now runs a line route across the island
  and no longer circles, but the current phone proof still records sprint-start
  spikes up to `66.7 ms`. The Android runner now cleans up to one game page
  target. Open Country still misses high-mobile budgets: current artifacts
  under `cycle38-validation/runtime/` report follow-close around
  `p95=50.1 ms` / `p99=50.1 ms` and horizon/terrain-seam around
  `p95=50.0 ms` / `p99=50.1 ms`. Terrain bands/lines remain visible, grass
  displacement is wired but not yet visually obvious enough, and proper WebGPU
  view-dependent octahedral impostors are still a future work package. Current
  mobile trees are chunked native LOD1 containment plus lab-only tile-selection
  groundwork, not production octahedral impostors.
- Cycle 38 now also has the first full connected-Android pose matrix:
  `cycle38-validation/runtime/android-webgpu-cycle38-poses.json`. It captured
  15 Field/Rolling Hills/Open Country pose rows with nonblank screenshots, but
  all rows fail the high-mobile budget and 12 fail the mid-mobile budget. Field
  is currently the draw-call outlier (`732-748` draw calls). The first
  executable impostor lab proof exists at
  `cycle38-validation/runtime/webgpu-impostor-lab-proof.json`; it proves dynamic
  tile controls and selector variation in the diagnostic scene, while still
  marking impostors as not production-ready.
- The Cycle 38 tree-impostor release packet adds the explicit
  `?konveyorNativeTreeImpostors=1` route: near native LOD0, mid
  branch-preserving native LOD1, and far lat/lon-hemi Kiln impostor quads with
  per-instance camera-driven tile offsets/weights. This fixes the detached
  middle LOD read and the black/no-texture WebGPU impostor tint bug, but it is
  still opt-in while Android remains over budget and true octahedral sidecars
  are unbaked.
- The Cycle 38 tree-placement readability patch fixes the separate placement
  complaint: nested near/mid/far/horizon candidate zones still seed the
  deterministic layout, but final placement now rejects cross-zone canopy
  overlaps and tightens scale jitter floors. Current evidence is
  `cycle38-validation/runtime/tree-placement-spacing-diagnostics.json`, which
  reports zero canopy-overlap pairs for Field, Rolling Hills, and Open Country.
  Desktop WebGPU tree-occluded screenshots are recorded at
  `cycle38-validation/runtime/desktop-webgpu-tree-placement-after.json`.
- The later Cycle 38 desktop visual recovery pass repairs the production WebGPU
  grass, sheep, wool, and sun/atmosphere proof surface. The current grass proof
  is `desktop-webgpu-grass-interaction-evidence.json`: it freezes wind/sim,
  disables contact shadowing, isolates dog and sheep contact, and writes
  off/on/diff/overlay triptychs with dog changed `0.961%` and sheep changed
  `0.992%`. The grass shader records
  `coordinateSource="instanceWorldOffset-instanced-attribute"`,
  `overlapMode="dominant-contact-capped-vector"`, and `maxDisplacement=0.95`
  to prevent dense-agent contact from summing into warped blades.
- `desktop-webgpu-visual-recovery-proof.json` records installed-Chrome WebGPU
  evidence for bounded sun discs across Field/Rolling Hills/Open Country,
  fixed-phase sheep captures with constrained leg motion and body-only wool,
  Open Country shoreline/glint, and tree-occluded regression rows. This is
  desktop evidence only; phone validation was deferred because the phone was
  not connected.
- The first-principles visual repair contract is
  `docs/archive/research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md`.
  It is now implemented for the desktop proof surface. Matt's older WebGL
  screenshot remains the art-direction reference for specific cues: parted
  blade silhouettes, warm structured sun halo, sun-aligned water reflection,
  and sheep wool silhouette breakup.
- The first real multiplayer WebGPU proof now exists at
  `cycle36-validation/runtime/production-webgpu-mp-proof.json` (captured
  2026-05-16T01:42:30.718Z on installed Chrome against local Vite + Wrangler).
  It drives host and guest through a worker-backed cooperative room without
  `testNoCanvas`, starts gameplay, captures both canvases, and requires both
  clients to report `effective: "webgpu-production"`, connected two-player
  in-game state, room scene `field`, nonblank screenshots, and clean
  console/page state. This closed the MP-only scene-sync gap where the host
  could create a field room while still rendering the boot scene, and it made
  production WebGPU state refresh after in-process scene rebuilds.
- The current public-site iOS Safari water baseline was refreshed with
  `IOS_WATER_BASE_URL=https://sheepdogsim.com npm run test:ios-water` at
  2026-05-16T01:57Z. BrowserStack iPhone 15 Pro Max / iOS 17 Safari passed with
  water sample average `[29, 42, 20]` and `nearFoamWhite: false`. This proves
  the current live WebGL baseline only; rerun it after a deploy carrying this
  branch.
- The first guarded WebGL-vs-WebGPU production gameplay parity proof now exists
  at `cycle36-validation/runtime/production-gameplay-parity-proof.json`
  (captured 2026-05-16T00:12:39.618Z). It compares Field, Rolling Hills, and
  Open Country under production WebGL and the diagnostic-gated production
  WebGPU route. The artifact is `ok: true` and `defaultReady: true` because
  capture/runtime gates plus semantic regional checks pass for upper sky,
  horizon, ground chroma, and ground luma. Full-frame SSIM is still recorded as
  advisory only; alpha-hashed foliage/grass produce renderer-structural
  differences that should not block default-readiness by themselves.
- Rolling Hills terrain/camera/sheep placement is now part of the proof
  contract. The current parity artifact records camera `aboveSurface: 12` and
  sheep `matrixSurfaceAbsMax: 0`, `belowWaterMatrices: 0`, `waterY: -0.05`.
  `OptimizedSheepSystem` now receives the scene heightfield before first matrix
  placement and uses the terrain surface for reset, update, force-update, and
  corral ascent transforms. In-process scene rebuilds also reset the frame
  clock and cap client `deltaTime` to 0.05s so a rebuild stall or resumed tab
  cannot throw a fresh flock to an island boundary.
- Browser-probe hygiene is part of the migration contract. Automated Vite dev
  validation should set `SDS_SUPPRESS_BROWSER_OPEN=1` so the human-friendly
  `server.open` setting does not create real Chrome tabs during tests, and every
  probe must close Playwright contexts/browsers plus local dev/preview listeners
  before recording perf, screenshot, or benchmark evidence.
- The prior repo decision deferred a full WebGPU/TSL migration. Cycle 24 kept
  `@three.ez/instanced-mesh`, meshopt LODs, Kiln impostors, and meadow quads,
  with only a possible future `?renderer=webgpu` spike. This charter supersedes
  that deferral as campaign direction, but it does not imply any renderer code
  has shipped.
- The tree pipeline is already optimized for the current WebGL stack: EZ-Tree
  build-time GLBs, meshopt compression, InstancedMesh2 per-instance LOD, and
  Kiln impostor sidecars.
- The current tree-refresh baseline is captured at
  `cycle36-validation/runtime/tree-refresh-baseline.json`: active `tree1` and
  `tree2` picks, runtime/original GLB bytes, Kiln impostor sidecar and atlas
  contracts, material replacement evidence, and the current EZ-Tree upstream
  candidate status before any asset rebake. The baseline tool can refresh live
  npm and GitHub changelog evidence with
  `node tools/konveyor-tree-refresh-baseline.mjs --refresh-upstream`.
- Cycle 36 repaired the perf harness. `tests/perf-baseline/baseline.json`
  currently records all six default configs with `ok: true` and 900 samples
  each on the local Windows RTX 3070 workstation.
- The screenshot validation tool enforces per-cell SSIM >= 0.95 across its
  12-cell smoke matrix and fails if any expected golden is missing. The current
  repo commits the 12 initial Konveyor goldens in `tools/validation/golden/`.
  The harness captures deterministic canvas frames with `probeRender=1`,
  `cinematic=1`, `visualGolden=1`, and the fail-closed Konveyor rock placement
  route, then compares normalized 320x180 luma SSIM against the 0.95 threshold.
- The latency tool enforces desktop p99 <= 33 ms and has a mobile-profile path
  enforcing p99 <= 50 ms.
- There is no Tauri, Electron, or Capacitor shell dependency in `package.json`,
  but the repo now has native build-target plumbing: `BUILD_TARGET=native`,
  `SDS_WORKER_BASE`, `js/runtimeConfig.js`, and `npm run native:check`.
- There is a diagnostic WebGPU/TSL boot path at
  `?renderer=webgpu&diagnostic=1`. It is not a production renderer. It loads
  copied Three WebGPU/Core browser modules after the query flag and leaves the
  normal WebGL bundle path as default. The separate plain
  `?renderer=webgpu` production route is now covered by
  `cycle36-validation/runtime/production-webgpu-request-proof.json`; default
  URLs still report effective WebGL. Current
  diagnostic islands cover the sun
  billboard, portal ring, cloud plane, and a renderless sky/fog
  CPU sample packet from `js/atmosphere/skyFogSamplePacket.js`. The meadow
  quad diagnostic now uses production default grass colors, the far-ring UV
  hash scale, and the same CPU sky/fog input. The diagnostic also covers the
  rock-rim fresnel formula, a tree-leaf wind/alpha/occluder proxy, and a
  diagnostic anime-water material covering palette, shoreline bands, foam,
  ripples, sun glint, fog input, and a non-filtered float texture loaded from
  the real Rolling Hills heightfield. A terrain-heightfield diagnostic material
  reuses that texture for height-based ground color and fog input. A
  grass-blade diagnostic material covers the production default gradient colors,
  analytic wind/gust/flutter displacement, alpha-hash posture, and sky/fog
  handoff plus a smooth opacity proxy driven by production
  `grassFadeStart`/`grassFadeEnd`. A production-facing grass-blade material
  adapter now exists behind `?renderer=webgpu&konveyorGrass=1` plus an
  explicit blade factory and optional update controls for time, fog, camera,
  wind, sun direction, and interactor state, while default WebGL keeps the
  existing grass `ShaderMaterial`. The reusable WebGPU grass-blade
  node-material candidate now lives in
  `js/world/konveyorGrassBladeNodeMaterial.js`, and the adapter spec proves
  the flagged production seam can route through it with production blade
  geometry, wind, color, lighting, fade, and material posture inputs. The
  WebGPU diagnostic now also instantiates real `GrassSystem` grass-blade and
  meadow material creation plus a representative production `InstancedMesh`
  chunk through that same explicit factory path. Production stochastic blade
  dither, full production grass generation, compute/trample experiments, and
  scene-level WebGPU grass parity remain deferred. A
  sheep-wool diagnostic material covers production toon/wool color, procedural
  wool displacement, rim/SSS lighting
  terms, and sky/fog handoff. A production-facing `OptimizedSheep` material
  seam now exists behind `?renderer=webgpu&konveyorSheep=1` plus an explicit
  `createSheepMaterial` factory and optional update controls for time/fog
  state. The reusable WebGPU sheep-wool node-material candidate now lives in
  `js/konveyorSheepNodeMaterial.js`, and the adapter spec proves the flagged
  production seam can route through it with sheep color, lighting, wool, fog,
  material, and merged-geometry metadata. The WebGPU diagnostic now also
  instantiates real `OptimizedSheepSystem` merged geometry, vertex-color
  attributes, animation instance attributes, and a representative 3-sheep
  `InstancedMesh` through that same explicit factory path, while default WebGL
  keeps the existing sheep `ShaderMaterial`. High-count production sheep
  parity, terrain grounding, multiplayer-safe visual parity, and high-count
  perf remain deferred. A
  one-species Kiln impostor diagnostic material fetches the
  committed `tree1` sidecar plus albedo/normal/depth atlases, derives a
  diagnostic view tile triad from sidecar angles, blends three atlas tiles with
  premultiplied alpha/fog in a WebGPU node material, relights from the normal
  aux layer, and samples the depth aux atlas as a diagnostic shading proxy. A
  numeric tile-scale fix in that diagnostic node material removes the invalid
  WebGPU shader-module error found during sky-preset capture.
  A production-facing Kiln impostor material seam now exists behind
  `?renderer=webgpu&konveyorImpostors=1` plus an explicit impostor factory and
  optional tint controls. The reusable WebGPU Kiln impostor node-material
  candidate now lives in `js/konveyorKilnImpostorNodeMaterial.js`, and the
  adapter spec proves the flagged production seam can route through it with
  atlas textures, sidecar layout, lighting, fog, tunables, and material
  posture, while default WebGL keeps the existing `ShaderMaterial`. The
  injected-`SceneManager` proof now creates real Kiln impostor geometry plus
  the committed `tree1` albedo/normal/depth atlas set through that same factory
  seam and verifies `konveyor-node-kiln-impostor` in installed Chrome. Per-frame
  production tile selection, parallax, depth discard, production LOD wiring,
  and LOD0 color parity remain deferred.
  Production Rolling
  Hills/Open Country replacement remains deferred before terrain/grass/sheep/Kiln
  wiring. `cycle36-validation/runtime/sky-fog-preset-matrix.json` now records
  renderless CPU sky/fog packets for all five shipped sky presets as analytic
  preset-color parity evidence, and
  `cycle36-validation/runtime/sky-lut-profile.json` records the current
  renderless Hosek-Wilkie CPU LUT cost. Current local evidence keeps that LUT
  as the CPU-visible atmosphere contract, not a measured bottleneck; a GPU LUT
  remains a production-profile-driven candidate.
  `cycle36-validation/runtime/sky-preset-screenshots/manifest.json` now
  records Chrome WebGPU diagnostic screenshots for all five shipped sky
  presets using `?renderer=webgpu&diagnostic=1&konveyorSkyPreset=...`. Each
  capture reached `effective=webgpu-diagnostic` with no console or page
  errors.
  `cycle36-validation/runtime/scene-fog-horizon-proof.json` now records a
  renderless `Atmosphere` proof for Field, Rolling Hills, and Open Country:
  each scene resolves its intended sky preset, preserves linear fog near/far,
  drives fog color from the Hosek-Wilkie horizon, and carries preset cloud
  coverage into both sky and cloud layer.
  `cycle36-validation/runtime/scene-sky-screenshots/manifest.json` now records
  installed-Chrome diagnostic WebGPU screenshots for Field, Rolling Hills, and
  Open Country using `?renderer=webgpu&diagnostic=1&konveyorScene=...`; each
  scene reached `effective=webgpu-diagnostic`, bound the expected shipped scene
  sky/fog values, and recorded no console or page errors.
  `cycle36-validation/runtime/scene-sky-visual-proof.json` now samples those
  screenshots, verifies the captured scene set against the shipped scene
  registry, matches each screenshot's sky/fog packet to the renderless
  `Atmosphere` proof, checks stable scene-background pixels, confirms visible
  cloud-band pixels, and confirms Rolling Hills stays visually darker than the
  daytime scenes.
  `cycle36-validation/runtime/production-atmosphere-parity-proof.json` now
  captures real production WebGL scene screenshots for the same three scenes
  and compares their atmosphere contract against the diagnostic WebGPU
  screenshots. It proves production still uses default `HosekWilkieSky` and
  `CloudLayer` shader materials, matches the shipped sky preset, linear fog
  near/far, fog color, and cloud coverage, keeps clean console/page state, and
  keeps upper-sky normalized RGB chroma within the diagnostic WebGPU capture
  tolerance. This is production-scene atmosphere parity evidence for the shared
  sky/fog contract, not a production WebGPU renderer boot claim.
  `cycle36-validation/runtime/material-island-visual-proof.json` now samples
  the same installed-Chrome scene screenshots, verifies the required diagnostic
  material-island list per scene, and checks visible color signatures for sun,
  cloud, meadow, anime water, terrain heightfield, grass blade, sheep wool,
  tree foliage, Kiln impostor, and rock-rim islands. This is diagnostic
  material-island visibility, not production WebGPU renderer parity.
  `cycle36-validation/runtime/production-atmosphere-adapter-proof.json` now
  verifies the real production `Atmosphere`, `HosekWilkieSky`, and `CloudLayer`
  constructors inside the WebGPU diagnostic scene for Field, Rolling Hills, and
  Open Country. Each scene routes sky and cloud materials through the explicit
  `?renderer=webgpu&konveyorAtmosphere=1` factory path, preserves the shipped
  linear fog near/far values, matches the CPU-visible sky/fog packet, and
  renders cleanly in installed Chrome. This is production atmosphere constructor
  proof, not default production WebGPU boot.
  `cycle36-validation/runtime/production-water-adapter-proof.json` now verifies
  the real production `AnimeWater.createAnimeWater()` wrapper inside the same
  WebGPU diagnostic scene for Field, Rolling Hills, and Open Country. Each
  scene routes water material creation through the explicit
  `?renderer=webgpu&konveyorWater=1` factory path, binds the Rolling Hills
  heightfield-backed `Float32Array`/`DataTexture` packet, confirms the
  `konveyor-node-anime-water` node material, and records a clean installed
  Chrome diagnostic render. This is production water constructor proof inside
  the diagnostic renderer; scene-specific production water parity remains
  deferred.
  `cycle36-validation/runtime/production-terrain-adapter-proof.json` now
  verifies the real production `TerrainBuilder.createTerrain()` path inside
  the same WebGPU diagnostic scene for Field, Rolling Hills, and Open Country.
  Each scene routes terrain material creation through the explicit
  `?renderer=webgpu&konveyorTerrain=1` factory path, binds the Rolling Hills
  heightfield-backed `Float32Array`/`DataTexture` packet, bakes the production
  mobile terrain mesh grid (`66049` vertices), confirms the
  `konveyor-node-terrain-heightfield` node material, and records a clean
  installed Chrome diagnostic render. This is production terrain constructor
  proof inside the diagnostic renderer; scene-specific production terrain
  parity remains deferred.
  `cycle36-validation/runtime/production-grass-adapter-proof.json` now verifies
  real production `GrassSystem` material and representative chunk construction
  inside the same WebGPU diagnostic scene for Field, Rolling Hills, and Open
  Country. Each scene routes grass blade and meadow material creation through
  the explicit `?renderer=webgpu&konveyorGrass=1` factory path, binds the
  Rolling Hills heightfield-backed `Float32Array`/`DataTexture` packet with a
  baked visual mesh grid (`66049` samples), confirms the
  `konveyor-node-grass-blade` and `konveyor-node-meadow-quad` node materials,
  and records a small production `InstancedMesh` chunk (`12` clumps, `28`
  vertices) in a clean installed Chrome diagnostic render. This is
  diagnostic-renderer constructor evidence, not full production grass field
  parity.
  `cycle36-validation/runtime/production-sheep-adapter-proof.json` now
  verifies real production `OptimizedSheepSystem` constructor behavior inside
  the same WebGPU diagnostic scene for Field, Rolling Hills, and Open Country.
  Each scene routes the optimized sheep material through the explicit
  `?renderer=webgpu&konveyorSheep=1` factory path, confirms the
  `konveyor-node-sheep-wool` node material, records the merged production
  sheep geometry (`547` vertices, `544` triangles), preserves `color`,
  `vertexId`, `instanceData`, and `instanceAnimation` attributes, and renders a
  representative 3-sheep production `InstancedMesh` in installed Chrome. This
  is diagnostic-renderer constructor evidence, not high-count production sheep
  parity.
  `tests/webgpu-diagnostic.spec.js` pins the diagnostic fog-consumer contract
  across rock rim, meadow, anime water, terrain, grass, sheep, and Kiln states;
  full production-scene WebGPU visual parity remains a separate gate. A
  production-facing sky-dome atmosphere material seam now exists: `Atmosphere`
  can forward an explicit `skyFactory` to `HosekWilkieSky`, and the Konveyor
  adapter keeps that factory behind `?renderer=webgpu&konveyorAtmosphere=1`
  plus an explicit WebGPU sky factory. Default `HosekWilkieSky` still creates
  the existing WebGL `ShaderMaterial`, and the CPU LUT plus sky/fog packet stay
  authoritative.
  `js/atmosphere/konveyorSkyNodeMaterial.js` now owns the reusable WebGPU
  sky/fog node-material candidate used by the diagnostic backdrop and by an
  explicit `HosekWilkieSky` factory under the same fail-closed flag.
  The same atmosphere adapter now reaches production `CloudLayer`: `Atmosphere`
  can forward an explicit `cloudFactory`, and cloud coverage, edge fade, time,
  feature scale, sun color, and wind state can flow through adapter controls
  while the default WebGL `ShaderMaterial` path remains unchanged.
  `js/atmosphere/konveyorCloudNodeMaterial.js` now owns the reusable WebGPU
  cloud-layer node-material candidate used by the diagnostic cloud plane and by
  an explicit `CloudLayer` factory under the same fail-closed flag, with
  coverage, edge fade, feature scale, time, wind, sun direction, and sun color
  driven through node uniform controls. Diagnostic sky-preset screenshots are
  captured, the renderless scene fog/horizon contract is pinned,
  scene-bound diagnostic WebGPU screenshots plus material-island visual samples
  now exist, and production WebGL scene atmosphere chroma/fog parity is
  artifact-backed; true production-scene WebGPU screenshots and default
  production wiring remain deferred. A
  production-facing anime-water material adapter now exists behind
  `?renderer=webgpu&konveyorWater=1` plus an explicit water factory. It can
  hand water update ownership to factory controls, and the reusable
  heightfield-backed WebGPU anime-water node-material candidate now lives in
  `js/water/konveyorAnimeWaterNodeMaterial.js`; the adapter spec proves the
  flagged production seam can route through it. Default WebGL still uses the
  existing `ShaderMaterial` uniforms for time, sun direction, shoreline foam,
  heightfield foam, ripples, sparkles, and fog. The WebGPU diagnostic now also
  instantiates the real `AnimeWater` wrapper with that factory path and verifies
  the heightfield-backed production constructor proof in
  `cycle36-validation/runtime/production-water-adapter-proof.json`. A
  production-facing terrain-ground material adapter now exists behind
  `?renderer=webgpu&konveyorTerrain=1` plus an explicit terrain factory. It
  passes terrain size, segment count, heightfield metadata, lazy height-texture
  creation, color constants, noise constants, fog, side, and polygon-offset
  posture to the factory. The reusable heightfield-backed WebGPU terrain
  node-material candidate now lives in `js/world/konveyorTerrainNodeMaterial.js`,
  and the adapter spec proves the flagged production seam can route through it.
  Default WebGL still uses the existing terrain `ShaderMaterial`. The WebGPU
  diagnostic now also instantiates the real `TerrainBuilder.createTerrain()`
  path with that factory seam and verifies the heightfield-backed production
  constructor proof in
  `cycle36-validation/runtime/production-terrain-adapter-proof.json`. The same
  diagnostic now instantiates real `GrassSystem` grass-blade and meadow material
  creation plus a representative production `InstancedMesh` chunk through
  `?renderer=webgpu&konveyorGrass=1`, with proof recorded in
  `cycle36-validation/runtime/production-grass-adapter-proof.json`. It also
  instantiates real `OptimizedSheepSystem` merged geometry and a 3-sheep
  production `InstancedMesh` through `?renderer=webgpu&konveyorSheep=1`, with
  proof recorded in
  `cycle36-validation/runtime/production-sheep-adapter-proof.json`. A
  representative Kiln impostor material/geometry slice is now also covered by
  `cycle36-validation/runtime/scene-manager-webgpu-renderer-proof.json`: it
  loads the committed `tree1` sidecar plus albedo/normal/depth atlases, routes
  `createKilnImpostorMaterial()` through
  `?renderer=webgpu&konveyorImpostors=1`, confirms the
  `konveyor-node-kiln-impostor` node material, verifies the 4x4 / 2048 atlas
  layout and depth aux layer, and renders inside the injected `SceneManager`
  scene. This is still diagnostic-renderer constructor evidence, not production
  LOD-chain wiring. A production-facing `OptimizedSheep` material adapter now
  exists behind
  `?renderer=webgpu&konveyorSheep=1` plus an explicit sheep factory. It can
  hand time/fog update ownership to factory controls. The reusable WebGPU
  sheep-wool node-material candidate now lives in
  `js/konveyorSheepNodeMaterial.js`, and the adapter spec proves the flagged
  production seam can route through it, while default WebGL still uses the
  existing instanced sheep `ShaderMaterial`. A production-facing
  Kiln impostor material adapter now exists behind
  `?renderer=webgpu&konveyorImpostors=1` plus an explicit impostor factory. It
  can hand sun/ambient tint ownership to factory controls. The reusable WebGPU
  Kiln impostor node-material candidate now lives in
  `js/konveyorKilnImpostorNodeMaterial.js`, and the adapter spec proves the
  flagged production seam can route through it, while default WebGL still uses
  the existing atlas-sampled impostor `ShaderMaterial`. A
  production-facing sun/portal/transient effect material adapter now exists
  behind `?renderer=webgpu&konveyorEffects=1` plus explicit WebGPU factories.
  The reusable WebGPU sun billboard, portal ring/pad/particle, and corral zap
  bolt/particle node-material candidates now live in
  `js/effects/konveyorSunNodeMaterial.js`,
  `js/effects/konveyorPortalNodeMaterial.js`, and
  `js/effects/konveyorZapNodeMaterial.js`, and the effect adapter spec proves
  the flagged production seam can route through them.
  `SunBillboard`, `PortalEffect`, and `CorralZapEffectPool` now have
  diagnostic-renderer production constructor proof in
  `cycle36-validation/runtime/production-effect-adapter-proof.json`. Without
  the flag and factories, those effects still construct their existing WebGL
  `ShaderMaterial`, `MeshBasicMaterial`, `LineBasicMaterial`, and
  `PointsMaterial` paths. The WebGPU factory supply
  for tree/rock, effects, grass, water, terrain, sheep, and Kiln impostors is
  now reusable through dedicated `konveyor*NodeMaterialFactories.js` helpers.
  Each helper accepts an already-loaded WebGPU/TSL module object, so none of
  them statically import `three/webgpu` into the default production graph.
  `js/konveyorNodeMaterialFactorySuite.js` now assembles those helpers plus
  atmosphere and sheep-part factories from a supplied module object, and
  `tests/konveyor-node-material-factory-suite.spec.js` proves the grouped
  factory surface without requiring the suite itself to import `three/webgpu`.
  The suite also maps those groups to the existing production global factory
  names and a test proves the current adapters can consume that map only when
  their explicit `renderer=webgpu&konveyor*=1` flags are present. A production
  constructor smoke spec now proves the same suite-backed globals reach
  `HosekWilkieSky`, `CloudLayer`, `SunBillboard`, `PortalEffect`,
  `CorralZapEffectPool`, `GrassSystem`,
  `TerrainBuilder`, `AnimeWater`, `OptimizedSheepSystem`, and Kiln impostor
  material creation without changing default WebGL startup.
  The diagnostic harness now consumes the suite for its material proofs instead
  of carrying local factory glue, installs the grouped suite onto the
  production global factory names, and the injected `SceneManager` proof now
  requires `factorySupply.mode: "window-global"` before accepting the rendered
  proof frame. The same proof now requires
  `SceneManager.getRenderStatus().rendererReady === true` and
  `mode === "async"` after rendering through the production
  `SceneManager.render()` method, proving the render loop seam can initialize
  and drive an injected WebGPU renderer without overlapping async frames.
  `cycle36-validation/runtime/webgpu-diagnostic-chrome.json` records the
  suite's eight groups and eighteen current factories during a Rolling Hills
  scene-bound diagnostic WebGPU boot.
  Production
  `SunBillboard` is now a scene-coupled
  lazy chunk, and `GrassSystem` is now loaded by the async grass creation
  paths instead of the default entry chunk. Together they preserve the default
  WebGL sun/grass behavior while recovering main bundle headroom
  (`mainKB=576.09`, `threeKB=617.77`, `webgpuDiagnostic=81.83 KB`,
  `konveyorProductionWebGpuBoot=1.98 KB`,
  `konveyorProductionBootScoutRecorder=13.27 KB`,
  `konveyorNodeMaterialFactorySuite=29.15 KB`,
  `konveyorMaterialAdapter=3 KB`, `GrassSystem=35 KB`,
  `AnimeWater=9 KB`, `PortalEffect=5 KB`, `CorralZapEffect=5 KB`) for later
  production seams without regenerating the refactor-baseline bundle ratchet. A
  diagnostic material-replacement island proves tree replacement by
  `branches`/`leaves` material names and rock replacement by traversal. GLB
  material ownership proof now shows that tree LOD0/LOD1 assets can be addressed
  by stable material names, while rocks require replacement by asset class or
  mesh traversal rather than material name. A follow-up primitive-clone proof
  applies those strategies to the shipped compressed GLBs, and the browser
  diagnostic now fetches all seven shipped tree and rock GLBs to prove the same
  primitive/material replacement contracts. The diagnostic also renders all
  seven GLBs with WebGPU node-material replacements through the production
  GLTF/Draco/Meshopt loader path and production-side material adapter without
  changing production runtime wiring. A production tree-placement preview now
  samples Rolling Hills scene data through `shared/TreePlacement.generateTrees`
  and renders eight adapter-backed tree GLB samples in the WebGPU diagnostic;
  it does not instantiate production `TerrainBuilder` or change production
  WebGL startup. A second diagnostic island renders those samples through
  WebGPU `THREE.InstancedMesh` groups for trunks and leaves, proving LOD0
  instancing compatibility without importing production `InstancedMesh2`. That
  proof now runs through a production-facing Konveyor instancing adapter seam;
  package inspection keeps `InstancedMesh2` classified as WebGL-path until a
  specific compatibility proof says otherwise. A diagnostic rock-instancing
  preview now renders scene-zone samples generated by the production-side pure
  `js/world/rockPlacementPlan.js` with an injected seeded RNG for all three
  shipped rock GLBs through native `THREE.InstancedMesh`.
  `cycle36-validation/runtime/rock-placement-flag-proof.json` now records the
  production rock-placement plan through `?renderer=webgpu&konveyorRocks=1`
  using `mulberry32(sceneSeed + Rock)`: Field and Rolling Hills produce stable
  rock/obstacle placements, Open Country records a stable zero-rock outcome for
  the current scene zones, and default production still uses `Math.random()`
  while the flag is off.
  `cycle36-validation/runtime/production-flag-fallback-proof.json` records
  Field, Rolling Hills, and Open Country production scenes with every current
  Konveyor material/placement flag enabled while omitting `renderer=webgpu`.
  All three scenes remain effective WebGL with no fallback reason, and the
  material/placement adapters stay flag-disabled. The proof now captures
  non-diagnostic production canvas screenshots in
  `cycle36-validation/runtime/production-flag-fallback-screenshots/` and checks
  each is nonblank before accepting the default-route policy contract. Plain
  `?renderer=webgpu` is validated separately by
  `production-webgpu-request-proof.json`.
  A production-facing far-ring meadow material adapter now exists behind
  `?renderer=webgpu&konveyorGrass=1` plus an explicit meadow factory; default
  WebGL still uses the existing `MeshLambertMaterial` and procedural tint
  injection, with the `USE_UV` shader define assigned on the material instance.
  The reusable meadow-quad WebGPU node-material candidate now lives in
  `js/world/konveyorMeadowQuadNodeMaterial.js` instead of only inside the
  diagnostic harness, and `tests/konveyor-grass-material-adapter.spec.js`
  proves the flagged production seam can route through it. The reusable
  grass-blade WebGPU node-material candidate now lives in
  `js/world/konveyorGrassBladeNodeMaterial.js`, and the same spec proves the
  flagged blade factory seam can route through it while default WebGL keeps the
  existing grass `ShaderMaterial`.
  A production-facing sheep material adapter now exists behind
  `?renderer=webgpu&konveyorSheep=1` plus an explicit sheep factory; default
  WebGL still uses the existing optimized sheep shader and instancing path. The
  reusable sheep-wool WebGPU node-material candidate now lives in
  `js/konveyorSheepNodeMaterial.js`, and the adapter spec proves the flagged
  factory seam can route through it while full instancing and vertex-color part
  parity remain deferred.
  A production-facing material adapter now exists behind
  `?renderer=webgpu&konveyorMaterials=1` plus explicit WebGPU material
  factories, and `TerrainBuilder.loadModels()` now invokes it after the default
  tree-wind and rock-rim WebGL patch chain. Cached production tree/rock GLB
  roots can be replaced only when the flag and factories are present; the
  default WebGL patch path remains unchanged otherwise. The reusable WebGPU
  rock-rim, tree branch, and tree leaf node-material candidates now live in
  `js/world/konveyorRockRimNodeMaterial.js`,
  `js/world/konveyorTreeBranchNodeMaterial.js`, and
  `js/world/konveyorTreeLeafNodeMaterial.js`, and the material adapter spec
  proves the flagged production seam can route rock traversal plus `branches`
  and `leaves` through them while default WebGL tree wind, occluder, and rock
  rim patching remain untouched. The scene-bound diagnostic manifest now also
  exposes `window.__sdsG.productionTreeRockAdapter`, and
  `cycle36-validation/runtime/production-tree-rock-adapter-proof.json` verifies
  all seven shipped tree/rock GLBs, node-material replacement counts,
  production tree-placement samples, and native `THREE.InstancedMesh` tree/rock
  preview coverage without changing default WebGL startup.
- The deterministic `shared/` boundary is unchanged. Konveyor is a rendering,
  packaging, and performance campaign unless a cycle explicitly authorizes a
  shared-sim change.

Start every Konveyor run by refreshing this baseline. Do not assume a stale
number, remote deploy state, browser feature, or package capability is still
true.

## Current external-doc alignment

As of 2026-05-16, current upstream docs support the SDS direction rather than
contradicting it:

- Three's WebGPU guide says `WebGPURenderer` can use WebGPU and fall back to a
  WebGL2 backend, but `ShaderMaterial`, `RawShaderMaterial`, and
  `onBeforeCompile()` customizations must be ported to node materials and TSL
  before they are WebGPU-compatible
  ([Three WebGPURenderer guide](https://threejs.org/manual/en/webgpurenderer)).
  That matches the current material-island strategy.
- Three's TSL docs position TSL as renderer-agnostic shader logic that can emit
  WGSL or GLSL and stay modular/tree-shakable
  ([Three TSL specification](https://threejs.org/docs/TSL.html)). That matches
  SDS's isolated node-material factories and fail-closed flags.
- MDN still marks WebGPU as limited availability and secure-context-only, with
  explicit `navigator.gpu.requestAdapter()` / `adapter.requestDevice()` checks
  required before claiming support
  ([MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API),
  [MDN requestAdapter](https://developer.mozilla.org/docs/Web/API/GPU/requestAdapter)).
  That matches the repo's explicit device preflight, probe artifacts, and the
  decision to keep default URLs WebGL until the release policy is backed by
  analytics and cross-browser/WebView proof.
- Chrome's current WebGPU overview and the GPUWeb implementation-status table
  show WebGPU broadly shipped but still uneven by platform/browser version,
  especially across Firefox, Linux, Android GPU families, and WebView-style
  shells
  ([Chrome WebGPU overview](https://developer.chrome.com/docs/web-platform/webgpu/overview),
  [GPUWeb implementation status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)).
  That supports the current `?renderer=webgpu` production route plus WebGL
  fallback, not a blind WebGPU-required web default.
- WebKit lists WebGPU among Safari 26 features, which makes iOS/macOS WebGPU
  plausible, but SDS still needs real Safari/WKWebView proof before claiming
  Apple mobile default-readiness
  ([WebKit Safari 26.0 features](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)).
- Production clients now emit a low-cardinality `renderer_mode_resolved`
  telemetry event after boot. The event records requested/effective renderer,
  fallback reason, WebGPU API presence, production-route success, device
  preflight success, and scene id, so Phase 9 can compare real SDS traffic
  against the upstream support tables without fingerprinting users.
- After a deploy carrying this branch, run
  `npm run konveyor:renderer-telemetry -- --days=7` to summarize the remote D1
  `renderer_mode_resolved` rows before changing the web default policy.
- The current best-practices alignment packet is
  [`archive/research/konveyor-webgpu-native-best-practices-2026-05-15.md`](archive/research/konveyor-webgpu-native-best-practices-2026-05-15.md).
  It keeps the next work pointed at explicit TSL/node-material factories,
  device-level runtime probes, native shell proof by platform, CPU-visible
  atmosphere ownership until a measured GPU LUT is justified, measured EZ-Tree
  asset refreshes, and isolated compute experiments.
- The native release option space is broadened in
  [`archive/research/native-release-oss-options-spike-2026-05-16.md`](archive/research/native-release-oss-options-spike-2026-05-16.md).
  Treat the primary decision as pinned Chromium runtime versus platform WebView
  runtime versus mobile/PWA wrapper versus true-native rewrite. Do not add shell
  dependencies, Steamworks integration, or store prep without an explicit proof
  scope.
- The performance, extensibility, memory, and Rust/WASM option space is recorded
  in
  [`archive/research/perf-extensibility-rust-oss-spike-2026-05-16.md`](archive/research/perf-extensibility-rust-oss-spike-2026-05-16.md).
  Prefer profiler-backed JS allocation fixes, worker offload, offline
  Rust/WASM tools, and visual-only WebGPU compute before considering a
  deterministic `shared/**` rewrite.
- The focused sun/sky atmosphere path was scoped in
  [`archive/research/sun-sky-atmosphere-perf-spike-2026-05-16.md`](archive/research/sun-sky-atmosphere-perf-spike-2026-05-16.md).
  Cycle 37 implemented that path for the current WebGPU production route:
  `AtmosphereFrame.v1`, explicit `SunBillboard` readable-disc ownership,
  coherent sky/cloud/fog horizon tuning, final screenshots, and isolated perf
  proof now exist. Future atmosphere work should extend from those artifacts,
  not restart the packet.
- The current grass/sheep/wool/sun review is aligned in
  [`archive/research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md`](archive/research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md).
  The desktop proof surface now satisfies that contract with shadow-disabled
  grass geometry evidence, fixed-phase sheep leg/wool captures, and bounded
  sun/atmosphere screenshots. Future visual work should use those artifacts as
  the baseline rather than the older contested darkening-only grass proof.

## Objective

Migrate SDS from WebGL2-first rendering to WebGPU-first rendering where WebGPU
is the primary surface, recover performance headroom across the actual device
matrix, and package the same git tree for web, desktop, and mobile delivery.

The destination is one codebase, one scene system, one deterministic sim, and
multiple delivery surfaces:

- Web at `sheepdogsim.com`.
- Desktop through a native shell suitable for Steam.
- Mobile through native app shells for iOS and Android.

The campaign is not only a renderer swap. It is the forcing function to fix the
measurement loop, retire avoidable GPU and CPU bottlenecks, prove native runtime
assumptions, and keep game feel intact while the rendering surface changes.

## Non-goals

- Do not add new visual-fidelity goals as part of the migration. Atmosphere,
  water, postprocessing, terrain mood, and sheepdog game feel hold their current
  visual contract unless a cycle explicitly scopes a visual change.
- Do not build a generic render-backend abstraction. WebGPU is the target
  surface. WebGL compatibility is a transition or fallback decision, not a
  reason to genericize the engine.
- Do not rewrite the engine architecture. React UI with `createElement`,
  vanilla Three.js scene code, GameBridge, the worker rooms model, and the
  deterministic shared sim remain the shape.
- Do not treat native packaging as a side quest. Native runtime proof affects
  renderer assumptions, worker URLs, service workers, storage, fullscreen,
  input, WebSocket behavior, and app-store constraints.
- Do not regenerate baselines to hide regressions.

## Runtime truth

Native runtime claims must be proven, not inferred.

- Tauri 2 uses platform WebViews: WebView2 on Windows, WebKit on macOS, and
  WebKitGTK on Linux. It does not bundle one pinned Chromium runtime across all
  desktop platforms.
- WebView2 on Windows can use Evergreen or Fixed Version distribution. Fixed
  Version is a Windows packaging decision, not a cross-platform Tauri guarantee.
- Electron bundles Chromium and is the safer desktop fallback if SDS needs a
  single pinned browser engine across Windows, macOS, and Linux.
- Capacitor uses WKWebView on iOS and Android WebView or Chrome-backed WebView
  on Android. It does not independently pin WKWebView; the iOS floor is an OS
  floor.
- Safari 26 includes WebGPU, so an iOS 26+ target is plausible, but SDS still
  needs a real WKWebView proof before calling mobile WebGPU guaranteed.

References:

- Tauri WebView versions: https://v2.tauri.app/reference/webview-versions/
- WebView2 distribution modes:
  https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
- Capacitor iOS: https://capacitorjs.com/docs/ios
- Capacitor Android: https://capacitorjs.com/docs/android
- WebKit Safari 26 WebGPU:
  https://webkit.org/blog/17333/webkit-features-in-safari-26-0/

## Campaign gates

Every Konveyor run must preserve these gates unless the active handoff
explicitly records a narrower research-only scope.

### Measurement gate

If a phase is making performance claims, the harness must produce usable
numbers first. A usable perf result has all configured scenes completing,
stable sample counts, p50/p95/p99 frame timing, draw calls, triangle counts,
and active-sheep counts. A timeout-heavy baseline is a blocker, not a baseline.

### Visual gate

The current repo gate is `npm run validation:screenshots -- --diff`, with every
cell in the 12-cell smoke matrix present and at normalized-luma SSIM >= 0.95. A
Konveyor cycle may change that rule only by editing the tool and documenting
the new threshold or comparison contract in the active handoff or `DECISIONS.md`.

Asset-regeneration phases may accept specific visual deltas, but acceptance
must name the cell, attach artifacts, and explain the intended change. Silent
golden rewrites are not acceptable.

### Latency gate

Game feel is a first-class budget:

- Desktop input-to-paint p99 <= 33 ms.
- Mobile input-to-paint p99 <= 50 ms.

`npm run validation:latency` enforces the desktop side. `npm run
validation:latency:mobile` enforces the mobile-profile side. Real-device
mobile proof is still a higher confidence gate for native-mobile release work.

### Determinism gate

Multiplayer determinism is non-negotiable. `tests/sim-baseline/__fixtures__`
are the committed 60 Hz traces. Regeneration uses
`UPDATE_FIXTURES=true npm test -- tests/sim-baseline/baseline.spec.ts` only
after the active handoff records explicit operator acceptance.

Any unexpected sim-baseline diff is a hard stop.

### Native proof gate

Native packaging is not proven until SDS boots end-to-end in the selected
desktop shell and mobile shells, uses WebGPU where claimed, connects to the
live multiplayer worker, preserves fullscreen/input/audio behavior, and passes
the visual, latency, and determinism gates appropriate to that target.

## Operating doctrine

### Bench before code

No optimization phase starts from intuition. The first campaign task is to make
measurement reliable. After that, each performance change must show before and
after numbers on the target scene and target hardware tier.

### One metric per phase

Each phase names one keep-or-discard metric before implementation. Examples:

- Foundation phases: all required surfaces boot and all gates pass.
- Asset visual phases: every required SSIM cell passes or has explicit accepted
  artifact deltas.
- Perf phases: p99 frame time, median FPS, or a repo-defined composite. Do not
  refer to an external `perf_score` until SDS defines it locally.
- Native phases: target shell boots, WebGPU proof passes, worker connection
  succeeds, and gates pass.
- Native-prep phases: `npm run native:check` passes and records the generated
  bundle's worker/service-worker posture plus relative asset URL posture for
  both HTML entrypoints.

### Repo methodology applies

Konveyor still uses SDS's discipline: EARS-style acceptance, durable fence
rules, documented evidence, and explicit validation. The experimental
autonomous branch does not stop at numbered cycle boundaries, but it must keep
the same quality bar.

### Frozen files stay frozen

`docs/INTERFACE_FENCE.md` applies in full. In particular, do not touch
`shared/**` deterministic modules to support a renderer migration unless the
active handoff names the file, explains the deterministic impact, and records
operator authorization.

### Incremental, flag-gated, reversible

No big-bang renderer rewrite. WebGPU starts behind `?renderer=webgpu`, and
WebGL remains the default until Phase 8 makes a documented fallback decision.
Tree, grass, sheep, and compute experiments remain feature-flagged until their
gates pass.

### Stop conditions

Stop and surface if any of these occurs:

- A proposed change requires a frozen file not authorized by the active cycle.
- Sim-baseline output differs unexpectedly.
- The perf, screenshot, or latency harness is broken in a way that blocks the
  phase's acceptance.
- Native runtime proof contradicts a packaging assumption in this document.
- The campaign objective is actually complete.

Normal implementation blockers are not stop conditions. Route around them,
record the decision, and continue inside the active scope.

### Game feel is sacred

Camera response, input-to-paint timing, dog command response, animation timing,
sprint feel, corral zap, and multiplayer prediction are part of the product.
A renderer migration that makes the game feel worse has failed even if FPS
improves.

## Phase outline

Phase boundaries can change as evidence accumulates. Do not skip the foundation
work because later phases are more interesting.

### Phase 0 - Measurement and platform proof

Repair `tools/perf-harness.mjs` and `tests/perf-baseline/baseline.json` until
all six local configs complete with usable samples. Reconcile screenshot and
latency thresholds with the actual tools. Prove WebGPU availability in the
browser and in candidate native shells before choosing Tauri, Electron,
Capacitor, or a hybrid path. Define worker URL and service-worker assumptions
for native packaging.

Exit: the repo can measure itself, the native runtime assumptions are recorded
in `DECISIONS.md`, and the first WebGPU renderer spike has a verified entry
condition.

### Phase 1 - WebGPU diagnostic renderer and material islands

Add `?renderer=webgpu` as a flag-gated path, but do not force a production hero
scene through WebGPU until the shader/material inventory proves the required
surfaces. This phase was written before the progressive WebGPU default was
approved. The current release policy defaults the request to WebGPU on
supported browsers while preserving WebGL fallback and forced `?renderer=webgl`.
The original path was a diagnostic WebGPU/TSL boot with one material system
migrated at a time.

Exit: the diagnostic path proves the required production-adjacent material
contracts, fails closed on unsupported devices, and preserves default WebGL
behavior through the current visual, latency, test, lint, and build gates.

### Phase 2 - Tree asset refresh and visual baseline

Check the current `@dgreenheck/ez-tree` release, re-bake only if there is a
clear output or performance reason, and re-run GLB compression plus Kiln
impostor bakes when silhouettes or materials change.

As of the 2026-05-15 live refresh, npm latest for `@dgreenheck/ez-tree` is still
1.1.0 and SDS already resolves that version. Upstream `main` has unreleased
tree-refresh candidates for softer leaf normals, corrected growth force, and
stratified branch/leaf placement
([npm](https://www.npmjs.com/package/@dgreenheck/ez-tree),
[changelog](https://github.com/dgreenheck/ez-tree/blob/main/CHANGELOG.md)).
That is serious WebGPU/native-target input, but it is not a reason to replace
shipped trees by side edit. It must run through the asset-gallery pick flow, GLB
compression, Kiln impostor rebake where needed, material-ownership proof,
visual review, and perf/latency gates before replacing shipped trees. Use
`node tools/konveyor-tree-refresh-baseline.mjs --refresh-upstream` before and
after candidate rebakes when network is available so accepted tree deltas
compare against the same evidence surface.

After the mobile-readiness pass, tree refresh is also an explicit budget task:
`tree1` LOD0 target <= `4k` triangles, broad canopy LOD0 target <= `8k`
triangles, LOD1 <= `25%` of LOD0, and far impostor sidecars are mandatory.
`tree2` remains accepted as the current legacy broad-canopy production asset,
but it is above the target budget and should be the first author-time rebake in
Cycle 38. Runtime tree generation is not an accepted path for production.

Exit: every accepted tree delta is artifact-backed, and tree goldens are updated
only for named, intentional differences.

### Phase 3 - Cosmetic shader WebGPU compatibility

Inventory atmosphere, water, sun billboard, portal, mountains, meadow, grass,
tree, sheep, and impostor shaders. Port low-risk cosmetic shaders first to
learn the TSL/WebGPU constraints without touching the highest-risk performance
systems.

Exit: named shaders render on both active backends or have documented deferrals.

### Phase 4 - Tree rendering optimization

Optimize the tree path with evidence. Candidate work includes TSL tree shader
work, better impostor parameterization, multi-species batching, alpha transition
cleanup, or staying on the current Kiln/InstancedMesh2 stack if measurement
says that is still the right call.

For the WebGPU/mobile route, LOD0-only native instancing is no longer an
acceptable production strategy. The current mobile path uses committed Kiln
impostor sidecars and WebGPU-safe tree/rock culling as a stopgap toward the
proper asset budget. Cycle 38 should close the author-time LOD/impostor asset
contract and keep rocks at <= `500` triangles each unless an explicit exception
is recorded.

Exit: tree-heavy scenes recover the target p99 frame budget on the measured
mobile and desktop tiers without visual regressions.

### Phase 5 - Grass optimization

Optimize grass only after tree costs are understood. Candidate work includes
TSL grass shaders, GPU chunk culling, per-blade LOD, or narrower WebGL-side
fixes if profiling points there.

Exit: dense-grass scenes hit their p99 budgets and mobile-low keeps a stable
simple path.

### Phase 6 - Sheep and high-count rendering

Port or optimize `OptimizedSheep` only with before and after evidence. Preserve
leg and head animation, selection readability, command feedback, and existing
mode rules.

Exit: high-count solo modes improve without multiplayer contract changes.

### Phase 7 - Experimental compute mode

If WebGPU compute is justified, implement it as single-player experimental
content. It must be multiplayer-disabled, leaderboard-excluded, and isolated
from `shared/` deterministic simulation unless a later cycle deliberately
creates a new shared contract.

Exit: the experiment refuses to activate in multiplayer, refuses leaderboard
submission, and has clear performance artifacts.

### Phase 8 - Native packaging

Build the selected desktop and mobile shells. Do not assume the runtime proof
from Phase 0 is enough; verify against built artifacts. Wire worker URLs,
service-worker behavior, asset loading, storage, fullscreen, input, audio,
updates, and crash reporting deliberately.

Exit: native builds run end-to-end on the target OS matrix, use WebGPU where
claimed, connect to live multiplayer, and pass gates.

### Phase 9 - Web fallback decision and release prep

Use Cloudflare Web Analytics and current browser support data to choose whether
`sheepdogsim.com` should stay WebGL-default, move to progressive WebGPU-first
with WebGL fallback, or use a WebGPU-required gate. Then prepare Steam and
mobile release surfaces from the proven builds.

Exit: fallback decision recorded in `DECISIONS.md`, code reflects it, and the
release path is ready for external users.

## Start-of-run checklist

1. Read `AGENTS.md`, `NEXT_SESSION.md`, this document, and
   `docs/konveyor-autonomous-run.md`.
2. Refresh current WebGPU, Tauri, Electron, Capacitor, iOS, Android, and
   Three.js facts from official docs.
3. Run `git status --short --branch` and identify unrelated local changes.
4. Run or repair the measurement gate before making performance claims.
5. Confirm whether the active task is autonomous or paired.
6. Do not touch `shared/**` or sim fixtures without explicit handoff scope.

## Fresh-agent goal

Use this goal after Cycle 37 and the first Android WebGPU mobile-readiness
proof, including the later Cycle 38 connected-phone findings:

```text
/goal On the current SDS checkout, continue Cycle 38 after the completed Cycle 37 packet, approved progressive WebGPU default, first connected-Android WebGPU mobile-readiness proof, later Open Country connected-phone findings, tree-placement readability patch, and implemented desktop first-principles visual recovery. Read NEXT_SESSION.md, docs/cycle-38-plan.md, docs/archive/research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md, docs/cycle-37-plan.md, docs/konveyor-autonomous-run.md, and docs/konveyor-sds.md. Do not rerun Cycle 37 or treat the one-phone Rolling Hills proof as full mobile certification. Preserve the current desktop proof surface: shadow-disabled grass deformation, fixed-phase sheep leg/body-only wool captures, and bounded sun/atmosphere proof. Continue the WebGPU mobile scene/camera/system matrix, close visual screenshot gates for terrain seams, tree grounding/readability, water grid/glint, and dog-through-tree readability, rebuild over-budget author-time tree/rock assets with real LOD/impostor sidecars, and wire the remaining QualityGovernor knobs. Treat current native LOD1 mobile trees as containment only; implement proper view-dependent WebGPU octahedral impostors in a lab before production. Preserve WebGL fallback, forced ?renderer=webgl, the experimental settings toggle, and existing migration gates. Create a scoped working branch before committing if branch isolation is desired. Do not touch shared/**, sim-baseline goldens, worker migrations, paid-store submission, signing, Steam/App Store/Google Play, production deploy, or native-shell dependencies without explicit approval.
```
