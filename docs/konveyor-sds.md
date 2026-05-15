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

The full migration campaign runs on `exp/konveyor-webgpu-migration`. In that
mode, numbered cycle plans are evidence and checkpoints, not stopping points.
Agents should keep moving until the full objective is reached or a documented
hard stop is hit. Use [`konveyor-autonomous-run.md`](konveyor-autonomous-run.md)
as the control surface for the next autonomous pass.

## Current repo baseline

As of 2026-05-15, SDS is not a WebGPU project yet.

- The client renderer is WebGL-only: `js/SceneManager.js` constructs
  `THREE.WebGLRenderer` directly.
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
  repo has no committed screenshot goldens, so the visual gate is blocked until
  an explicit baseline-capture decision is made.
- The latency tool enforces desktop p99 <= 33 ms and has a mobile-profile path
  enforcing p99 <= 50 ms.
- There is no Tauri, Electron, or Capacitor shell dependency in `package.json`,
  but the repo now has native build-target plumbing: `BUILD_TARGET=native`,
  `SDS_WORKER_BASE`, `js/runtimeConfig.js`, and `npm run native:check`.
- There is a diagnostic-only WebGPU/TSL boot path at
  `?renderer=webgpu&diagnostic=1`. It is not a production renderer. It loads
  copied Three WebGPU/Core browser modules after the query flag and leaves the
  normal WebGL bundle path as default. The boot contract records
  `window.__sdsRendererMode`: `?renderer=webgpu` without `diagnostic=1` remains
  effective WebGL with `fallbackReason: "diagnostic-flag-required"`. Current
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
  existing grass `ShaderMaterial`. Production stochastic blade dither,
  production instancing, compute/trample experiments, and scene-level WebGPU
  grass parity remain deferred. A sheep-wool diagnostic material covers
  production toon/wool color, procedural wool displacement, rim/SSS lighting
  terms, and sky/fog handoff. A production-facing `OptimizedSheep` material
  seam now exists behind `?renderer=webgpu&konveyorSheep=1` plus an explicit
  `createSheepMaterial` factory and optional update controls for time/fog
  state, while default WebGL keeps the existing sheep `ShaderMaterial`.
  Production sheep instancing parity, animation-attribute parity, terrain
  grounding, multiplayer-safe visual parity, and high-count perf remain
  deferred. A one-species Kiln impostor diagnostic material fetches the
  committed `tree1` sidecar plus albedo/normal/depth atlases, derives a
  diagnostic view tile triad from sidecar angles, blends three atlas tiles with
  premultiplied alpha/fog in a WebGPU node material, relights from the normal
  aux layer, and samples the depth aux atlas as a diagnostic shading proxy. A
  numeric tile-scale fix in that diagnostic node material removes the invalid
  WebGPU shader-module error found during sky-preset capture.
  A production-facing Kiln impostor material seam now exists behind
  `?renderer=webgpu&konveyorImpostors=1` plus an explicit impostor factory and
  optional tint controls, while default WebGL keeps the existing
  `ShaderMaterial`. Per-frame production tile selection, parallax, depth
  discard, production LOD wiring, and LOD0 color parity remain deferred.
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
  captured, the renderless scene fog/horizon contract is pinned, and
  scene-bound diagnostic WebGPU screenshots now exist; full production-scene
  WebGPU screenshots and default production wiring remain deferred. A
  production-facing anime-water material adapter now exists behind
  `?renderer=webgpu&konveyorWater=1` plus an explicit water factory. It can
  hand water update ownership to factory controls, while default WebGL still
  uses the existing `ShaderMaterial` uniforms for time, sun direction,
  shoreline foam, heightfield foam, ripples, sparkles, and fog. A
  production-facing terrain-ground material adapter now exists behind
  `?renderer=webgpu&konveyorTerrain=1` plus an explicit terrain factory. It
  passes terrain size, segment count, heightfield metadata, color constants,
  noise constants, fog, side, and polygon-offset posture to the factory while
  default WebGL still uses the existing terrain `ShaderMaterial`. A
  production-facing `OptimizedSheep` material adapter now exists behind
  `?renderer=webgpu&konveyorSheep=1` plus an explicit sheep factory. It can
  hand time/fog update ownership to factory controls, while default WebGL
  still uses the existing instanced sheep `ShaderMaterial`. A production-facing
  Kiln impostor material adapter now exists behind
  `?renderer=webgpu&konveyorImpostors=1` plus an explicit impostor factory. It
  can hand sun/ambient tint ownership to factory controls, while default WebGL
  still uses the existing atlas-sampled impostor `ShaderMaterial`. A
  production-facing sun/portal/transient effect material adapter now exists
  behind `?renderer=webgpu&konveyorEffects=1` plus explicit WebGPU factories.
  `SunBillboard`, `PortalEffect` ring/pad/particle materials, and
  `CorralZapEffect` bolt/particle materials now route through that shared
  fail-closed seam. Without the flag and factories, those effects still
  construct their existing WebGL `ShaderMaterial`, `MeshBasicMaterial`,
  `LineBasicMaterial`, and `PointsMaterial` paths. Production
  `SunBillboard` is now a scene-coupled
  lazy chunk, and `GrassSystem` is now loaded by the async grass creation
  paths instead of the default entry chunk. Together they preserve the default
  WebGL sun/grass behavior while recovering main bundle headroom
  (`mainKB=553`, `threeKB=603`, `webgpuDiagnostic=42 KB`,
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
  shipped rock GLBs through native `THREE.InstancedMesh`; production
  `RockPlacement` still passes `Math.random()`, and shared obstacle wiring
  remains unchanged.
  A production-facing far-ring meadow material adapter now exists behind
  `?renderer=webgpu&konveyorGrass=1` plus an explicit meadow factory; default
  WebGL still uses the existing `MeshLambertMaterial` and procedural tint
  injection, with the `USE_UV` shader define assigned on the material instance.
  A production-facing sheep material adapter now exists behind
  `?renderer=webgpu&konveyorSheep=1` plus an explicit sheep factory; default
  WebGL still uses the existing optimized sheep shader and instancing path.
  A production-facing material adapter now exists behind
  `?renderer=webgpu&konveyorMaterials=1` plus explicit WebGPU material
  factories, and `TerrainBuilder.loadModels()` now invokes it after the default
  tree-wind and rock-rim WebGL patch chain. Cached production tree/rock GLB
  roots can be replaced only when the flag and factories are present; the
  default WebGL patch path remains unchanged otherwise.
- The deterministic `shared/` boundary is unchanged. Konveyor is a rendering,
  packaging, and performance campaign unless a cycle explicitly authorizes a
  shared-sim change.

Start every Konveyor run by refreshing this baseline. Do not assume a stale
number, remote deploy state, browser feature, or package capability is still
true.

## Current external-doc alignment

As of 2026-05-15, current upstream docs support the SDS direction rather than
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
  That matches the repo's explicit probe artifacts and the decision to keep
  WebGL default until production evidence exists.

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
cell in the 12-cell smoke matrix present and at SSIM >= 0.95. A Konveyor cycle
may change that rule only by editing the tool and documenting the new threshold
in the active handoff or `DECISIONS.md`.

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
surfaces. WebGL stays default. The current path is a diagnostic WebGPU/TSL boot
with one material system migrated at a time.

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

Use Cloudflare Web Analytics and current browser support data to choose between
a WebGL fallback and a WebGPU-required gate for `sheepdogsim.com`. Then prepare
Steam and mobile release surfaces from the proven builds.

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

Use this goal when starting an autonomous Konveyor session:

```text
/goal On branch exp/konveyor-webgpu-migration, continue the SDS Konveyor autonomous campaign from docs/konveyor-autonomous-run.md and docs/konveyor-sds.md until the full objective is reached or a documented hard stop is hit. Treat docs/cycle-36-plan.md as completed foundation evidence, not the active stopping point. First stabilize and commit the foundation/native-readiness packet on the experimental branch while excluding unrelated .agents/skills folders and verifying npm test, npm run lint, npm run build, and npm run native:check. Then build a minimal WebGPU/TSL diagnostic boot path instead of forcing Rolling Hills through WebGPU, inventory and migrate shader/material systems incrementally, keep WebGL default and all WebGPU work flag-gated, preserve deterministic shared sim and multiplayer contracts, run the relevant perf/latency/visual/test/build/native gates before claiming progress, and keep moving through optimization, native packaging proof, and web fallback decisions without stopping at cycle boundaries.
```
