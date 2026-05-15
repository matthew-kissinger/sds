# Konveyor Autonomous Run

> Active handoff for the experimental SDS WebGPU, optimization, and native
> shipping campaign. This is not a normal numbered cycle. It is the branch-level
> operating brief for autonomous work on `exp/konveyor-webgpu-migration`.

## Branch

Work on:

```bash
git switch exp/konveyor-webgpu-migration
```

Do not run the full Konveyor campaign on `main`. Keep `main` available for
ordinary site fixes, releases, and paired production work.

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
- [`archive/research/cycle-36-webgpu-hero-blocker.md`](archive/research/cycle-36-webgpu-hero-blocker.md)
  records why Rolling Hills production rendering should not be the first
  WebGPU boot target.
- [`../tools/probe-webgpu-runtime.mjs`](../tools/probe-webgpu-runtime.mjs)
  probes browser WebGPU adapter/device creation.
- [`../progress.md`](../progress.md) records the completed foundation steps.
- Commit `2f9b846` stabilized the foundation/native-readiness packet on this
  branch while leaving unrelated `.agents/skills/*` folders uncommitted.

The important conclusion: installed Chrome 148 can create a WebGPU device on
the current Windows machine, but Playwright's bundled Chromium 147 exposes
WebGPU and fails `requestDevice()`. Device creation is the gate.

Native-readiness now has a code seam:

- `BUILD_TARGET=native npm run build` builds with relative asset paths and
  service-worker registration disabled.
- `SDS_WORKER_BASE=<origin>` can override the live worker origin at build time.
- `js/runtimeConfig.js` owns Worker HTTP origin, Worker WebSocket origin, and
  telemetry enablement.
- `npm run native:check` builds the native target and verifies the generated
  bundle with `tools/native-preflight.mjs`.

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
  records the current fail-closed renderer contract: `?renderer=webgpu`
  without `diagnostic=1` reports `effective: "webgl"` and
  `fallbackReason: "diagnostic-flag-required"`.
- [`archive/research/konveyor-shader-surface-inventory-2026-05-14.md`](archive/research/konveyor-shader-surface-inventory-2026-05-14.md)
  ranks the current GLSL and `onBeforeCompile` migration surface. The sun
  billboard, portal ring, cloud-plane, sky/fog, and anime-water formulas are
  now ported inside the diagnostic island. The meadow-quad diagnostic now uses
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
- The diagnostic now records `diagnostic-rock-instancing-preview`: fixed rock
  transform samples generated by a diagnostic-only seeded mirror of
  `js/world/RockPlacement.js` formation rules are rendered from the shipped rock
  GLBs through native WebGPU `THREE.InstancedMesh` groups. This is a
  renderer/material/transform proof only; it does not change production
  `Math.random()` rock placement, does not wire `shared/SceneObstacles`, and
  does not import production `InstancedMesh2`.
- A production-facing tree/rock material adapter now exists behind
  `?renderer=webgpu&konveyorMaterials=1` and explicit WebGPU material factories.
  It reuses the proved tree material-name and rock traversal strategies against
  cached production GLB roots, but leaves the default WebGL `onBeforeCompile`
  patch path untouched when the flag or factories are absent.
- A production-facing sun/portal effect material adapter now exists behind
  `?renderer=webgpu&konveyorEffects=1` and explicit WebGPU effect factories. It
  routes the already-proved diagnostic sun billboard and portal ring node
  materials through the same fail-closed pattern while leaving default WebGL
  `ShaderMaterial` creation untouched.
- [`archive/research/konveyor-atmosphere-ownership-2026-05-14.md`](archive/research/konveyor-atmosphere-ownership-2026-05-14.md)
  pins sky, fog, sun-color, and cloud ownership before cloud/sky WebGPU work.
  The sky/fog packet now lives in `js/atmosphere/skyFogSamplePacket.js` and
  samples a renderless `HosekWilkieSky({ createRenderable: false })`, so the
  diagnostic path keeps CPU-visible horizon/sun/fog truth without allocating an
  extra sky dome or making the WebGPU sky shader the authority.
- [`../cycle36-validation/runtime/webgpu-diagnostic-islands-chrome.png`](../cycle36-validation/runtime/webgpu-diagnostic-islands-chrome.png)
  is a Chrome 148 screenshot artifact for the diagnostic material islands.

## Next autonomous direction

The next agent should not try to boot Rolling Hills through WebGPU wholesale.
The diagnostic island exists; the honest next step is to inventory and migrate
one material system at a time.

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
   and sky/fog handoff while explicitly deferring production `OptimizedSheep`
   instancing, animation attributes, terrain grounding, and high-count perf.
   The Kiln
   impostor diagnostic island now fetches the committed `tree1` sidecar plus
   albedo/normal/depth atlases, derives a diagnostic view tile triad from
   sidecar angles, blends three atlas tiles with premultiplied alpha/fog in a
   WebGPU node material, relights from the normal aux layer, and samples the
   depth aux atlas as a diagnostic shading proxy. Per-frame production tile
   selection, parallax, depth discard, production LOD wiring, and LOD0 color
   parity remain deferred. The rock-rim
   TSL prototype covers the smallest `onBeforeCompile`
   replacement formula, and the tree-leaf TSL prototype covers wind,
   alpha-hash posture, and occluder fade inputs. GLB material ownership proof
   and a diagnostic replacement proof now exist, plus a GLB primitive-clone
   proof, browser runtime fetch proof, and rendered production-GLB clone proof
   against all shipped compressed tree/rock assets. The feature-flagged
   production adapter seam now exists. The first tree-placement diagnostic
   proof now samples Rolling Hills production scene data through the shared
   tree placement generator, renders adapter-backed WebGPU tree GLB samples,
   and proves a LOD0-only WebGPU `THREE.InstancedMesh` path for the same
   samples through a production-facing adapter seam. Rock placement now has a
   diagnostic scene-zone generation and transform/instancing proof for all
   three rock GLBs, but production rock generation still uses client
   `Math.random()` and remains a separate extraction decision. Package
   inspection shows
   `@three.ez/instanced-mesh` has WebGL-specific hooks, so the conservative
   current decision is to keep `InstancedMesh2` on the WebGL path and continue
   the WebGPU route with native `THREE.InstancedMesh` until a measured reason
   says otherwise. The sun/portal effect material adapter is now the
   lowest-risk production-adjacent seam available, but it is still flag-gated
   and factory supplied; next move to a smaller shader/material island or the
   measured rock-generation extraction before touching production boot.
2. **Keep measurement attached to every change.** Run the relevant perf,
   latency, screenshot, test, lint, and build gates before claiming progress.
3. **Treat EZ-Tree refresh as a measured tree phase, not a side edit.** The
   repo already resolves `@dgreenheck/ez-tree` 1.1.0, which is still the
   current npm latest as of 2026-05-15. Upstream `main` has unreleased
   tree-generation changes around softer leaf normals, corrected growth force,
   stratified child branch/leaf placement, and externalized texture assets
   ([changelog](https://github.com/dgreenheck/ez-tree/blob/main/CHANGELOG.md)).
   Evaluate those before Phase 2/4 tree rebakes, but only accept regenerated
   GLBs with named visual and perf artifacts.
4. **Advance through the Konveyor phase outline.** Keep moving from cosmetic
   shader compatibility to trees, grass, sheep/high-count rendering, compute
   experiments, native packaging, and web fallback/release decisions as
   evidence allows.

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

- WebGL stays the default until the campaign records a fallback decision.
- WebGPU work stays feature-flagged or diagnostic until gates pass.
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

Use this exact goal for the next autonomous run:

```text
/goal On branch exp/konveyor-webgpu-migration, continue the SDS Konveyor autonomous campaign from docs/konveyor-autonomous-run.md and docs/konveyor-sds.md until the full objective is reached or a documented hard stop is hit. Treat docs/cycle-36-plan.md as completed foundation evidence, not the active stopping point. First stabilize and commit the foundation/native-readiness packet on the experimental branch while excluding unrelated .agents/skills folders and verifying npm test, npm run lint, npm run build, and npm run native:check. Then build a minimal WebGPU/TSL diagnostic boot path instead of forcing Rolling Hills through WebGPU, inventory and migrate shader/material systems incrementally, keep WebGL default and all WebGPU work flag-gated, preserve deterministic shared sim and multiplayer contracts, run the relevant perf/latency/visual/test/build/native gates before claiming progress, and keep moving through optimization, native packaging proof, and web fallback decisions without stopping at cycle boundaries.
```
