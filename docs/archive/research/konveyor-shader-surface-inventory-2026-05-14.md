# Konveyor Shader Surface Inventory

Captured 2026-05-14 on `exp/konveyor-webgpu-migration` after the diagnostic
WebGPU island landed.

## Summary

SDS cannot move a production scene to WebGPU by swapping renderer construction.
The current WebGL renderer path depends on ten active custom shader surfaces
plus three patch chains that mutate Three's generated GLSL through
`onBeforeCompile`.

The safest first production-adjacent island was `SunBillboard`: it is small,
cosmetic, has no scene data dependency, and maps cleanly to a
`MeshBasicNodeMaterial`/TSL expression. The sun billboard, portal ring,
cloud-plane, and sky/fog formulas are now ported inside the diagnostic island,
the sky/fog and cloud-plane node-material candidates now live in reusable
atmosphere modules, and the meadow-quad island now uses the production grass
default colors,
far-ring UV hash scale, and CPU sky/fog packet. Sun, portal, and transient
corral effects now have a production-facing effect material adapter behind
`?renderer=webgpu&konveyorEffects=1` plus explicit factories. The real
`SunBillboard`, `PortalEffect` ring/pad/particle materials, and
`CorralZapEffect` bolt/particle materials now use that shared fail-closed
seam.
Production `SunBillboard` is also scene-coupled and lazy-loaded, and
`GrassSystem` is now loaded by the async grass creation paths. The default
WebGL sun/grass behavior remains intact while the critical `main` bundle has
headroom for later seams (`mainKB=553`, `threeKB=603`,
`webgpuDiagnostic=42 KB`, `konveyorMaterialAdapter=3 KB`,
`GrassSystem=35 KB`, `AnimeWater=9 KB`, `PortalEffect=5 KB`,
`CorralZapEffect=5 KB`) without regenerating the
refactor-baseline bundle ratchet.
A production-facing sky-dome atmosphere seam now exists: `Atmosphere` can
forward an explicit `skyFactory` to `HosekWilkieSky`, and the adapter keeps
that factory behind `?renderer=webgpu&konveyorAtmosphere=1` plus an explicit
sky factory. `HosekWilkieSky` now also calls that same fail-closed adapter
directly when no override factory is supplied. The reusable WebGPU sky/fog
node-material candidate now lives in
`js/atmosphere/konveyorSkyNodeMaterial.js` and can be shared by the diagnostic
backdrop and an explicit `HosekWilkieSky` factory. The default
`ShaderMaterial` path and CPU LUT authority remain untouched when no factory is
supplied.
The same production-facing atmosphere adapter now reaches `CloudLayer` behind
`?renderer=webgpu&konveyorAtmosphere=1` plus an explicit cloud factory, with
update controls for coverage, edge fade, time, feature scale, sun color, and
wind state. `js/atmosphere/konveyorCloudNodeMaterial.js` now owns the
reusable WebGPU cloud-layer node-material candidate shared by the diagnostic
cloud plane and an explicit `CloudLayer` factory. The default cloud
`ShaderMaterial` path remains untouched. Coverage, edge fade, feature scale,
time, wind, sun direction, and sun color now flow into the node material through
factory controls. Diagnostic sky-preset screenshots, renderless scene
fog/horizon proof, and scene-bound diagnostic WebGPU screenshots now exist,
while full production-scene WebGPU screenshots and default production wiring
remain deferred.
The far-ring meadow quad now has a production-facing grass material adapter
behind `?renderer=webgpu&konveyorGrass=1` plus an explicit meadow factory.
Default WebGL still uses the existing `MeshLambertMaterial` procedural tint
path, with the `USE_UV` shader define assigned on the material instance before
compile. The reusable WebGPU meadow-quad node-material candidate now lives in
`js/world/konveyorMeadowQuadNodeMaterial.js`, and the grass adapter spec proves
the flagged production seam can route through that candidate. The same grass
adapter now covers grass-blade material creation behind an explicit
`createGrassBladeMaterial` factory with optional controls for interactor, time,
fog, wind, and sun-direction updates. The reusable WebGPU grass-blade
node-material candidate now lives in
`js/world/konveyorGrassBladeNodeMaterial.js`, and the adapter spec proves the
flagged production seam can route through it. Default WebGL still uses the
existing grass `ShaderMaterial`.
Anime water now has a production-facing water material adapter behind
`?renderer=webgpu&konveyorWater=1` plus an explicit factory. The seam can
delegate time/sun updates to factory controls, and the reusable
heightfield-backed WebGPU anime-water node-material candidate now lives in
`js/water/konveyorAnimeWaterNodeMaterial.js`; the adapter spec proves the
flagged production seam can route through it. Default WebGL still uses the
existing `ShaderMaterial` uniforms and heightfield texture path.
Terrain ground now has a production-facing material adapter behind
`?renderer=webgpu&konveyorTerrain=1` plus an explicit factory. The seam carries
terrain size, segment count, heightfield metadata, lazy height-texture
creation, color constants, procedural noise constants, fog, side, and
polygon-offset posture to the factory. The reusable heightfield-backed WebGPU
terrain node-material candidate now lives in
`js/world/konveyorTerrainNodeMaterial.js`, and the adapter spec proves the
flagged production seam can route through it. Default WebGL still uses the
existing terrain `ShaderMaterial`.
Optimized sheep now has a production-facing material adapter behind
`?renderer=webgpu&konveyorSheep=1` plus an explicit factory. The seam carries
shader sources, uniforms, sheep color/lighting/wool/fog inputs, material flags,
merged geometry metadata, and the required instance-attribute names to the
factory. The reusable WebGPU sheep-wool node-material candidate now lives in
`js/konveyorSheepNodeMaterial.js`, and the adapter spec proves the flagged
production seam can route through it; default WebGL still uses the existing
instanced sheep `ShaderMaterial`.
Kiln impostors now have a production-facing material adapter behind
`?renderer=webgpu&konveyorImpostors=1` plus an explicit factory. The seam
carries atlas textures, sidecar layout/origin data, shader sources, lighting,
fog, material flags, and tunables to the factory, and `setImpostorTint()` can
delegate sun/ambient updates to factory controls. The reusable WebGPU Kiln
impostor node-material candidate now lives in
`js/konveyorKilnImpostorNodeMaterial.js`, and the adapter spec proves the
flagged production seam can route through it. Default WebGL still uses the
existing atlas-sampled impostor `ShaderMaterial` plus uniform tint updates.
The rock-rim fresnel formula is also ported as a
diagnostic `MeshStandardNodeMaterial` island driven by the CPU sky/fog sun
color packet. A diagnostic tree-leaf island now covers wind displacement,
alpha-hash posture, and a local occluder fade proxy. The reusable WebGPU
rock-rim, tree branch, and tree leaf node-material candidates now live in
`js/world/konveyorRockRimNodeMaterial.js`,
`js/world/konveyorTreeBranchNodeMaterial.js`, and
`js/world/konveyorTreeLeafNodeMaterial.js`, and the material adapter spec proves
the flagged production seam can route rock traversal plus `branches` and
`leaves` through them while default WebGL tree wind, occluder, and rock rim
patching remain untouched. A diagnostic anime-water
island now covers production palette handoff, shoreline color bands, foam,
ripples, sun glint, fog-color input, and a non-filtered `DataTexture` sample
loaded from the real Rolling Hills heightfield. The same texture now drives a
diagnostic terrain-heightfield material for height-based ground color and fog
input. A diagnostic grass-blade island now covers the production grass default
color gradient, analytic wind/gust/flutter displacement, alpha-hash posture,
sun/fog inputs, and a smooth WebGPU opacity proxy tied to production
`grassFadeStart`/`grassFadeEnd`; production stochastic blade dither,
interaction bending, instancing, and compute experiments remain deferred. A
diagnostic sheep-wool island now covers the production sheep
toon/wool color contract, procedural wool noise displacement, rim/SSS lighting
terms, and sky/fog handoff while recording `instanceData`,
`instanceAnimation`, and `vertexId` as deferred production instancing inputs.
`cycle36-validation/runtime/sky-fog-preset-matrix.json` now records a
renderless CPU sky/fog packet for every shipped sky preset, which completes the
analytic preset-color evidence needed before any production sky/fog WebGPU
wiring. `cycle36-validation/runtime/sky-preset-screenshots/manifest.json`
now records Chrome WebGPU diagnostic screenshots for all five shipped sky
presets with no console or page errors.
`cycle36-validation/runtime/scene-fog-horizon-proof.json` now records
renderless `Atmosphere` evidence for Field, Rolling Hills, and Open Country:
the scene registry resolves the intended preset, keeps linear fog near/far, and
derives fog color from the Hosek-Wilkie horizon while cloud coverage remains
preset-driven.
`cycle36-validation/runtime/scene-sky-screenshots/manifest.json` now records
installed-Chrome diagnostic WebGPU screenshots for Field, Rolling Hills, and
Open Country through `?renderer=webgpu&diagnostic=1&konveyorScene=...`; each
scene binds the expected scene sky preset and linear fog range with no console
or page errors.
A diagnostic Kiln impostor island now fetches the committed `tree1` sidecar and
albedo/normal atlases, derives a diagnostic view tile triad from the sidecar
azimuth/elevation rows, blends those tiles with premultiplied alpha in the
diagnostic TSL path, uses the normal aux layer for a sun relight keyed to the
sky/fog packet, and samples the RGBADepthPacking aux atlas as a subtle
diagnostic shading proxy. Its tile inset math now uses numeric tile-scale
constants, which removed the WebGPU shader-module error found during the
sky-preset screenshot capture. It still keeps per-frame production tile selection,
parallax, depth discard, and production LOD wiring deferred.
Production scene-level grass, sheep, Kiln
impostors, water, and terrain wiring remain deferred until scene binding and
screenshot proof cover the shipped island scenes. GLB
material ownership proof now shows that tree LOD0/LOD1
assets have stable `branches` and `leaves`
materials, while rock assets currently expose runtime-default primitive
materials and cannot be migrated by material name. The diagnostic island now
also includes a WebGPU material-replacement proof that exercises tree
replacement by `branches`/`leaves` names and rock replacement by mesh traversal
without touching the default WebGL path. A follow-up browser runtime proof now
fetches all seven shipped tree and rock GLBs inside the diagnostic path and
applies the same replacement strategy to their real primitive/material
contracts. A rendered-clone diagnostic island now also loads all seven shipped
tree and rock GLBs with the production GLTF/Draco/Meshopt path and renders them
with WebGPU node-material replacements. A production-side tree/rock replacement
adapter now exists behind `?renderer=webgpu&konveyorMaterials=1` and explicit
WebGPU material factories. `TerrainBuilder.loadModels()` now calls the adapter
after the default WebGL tree/rock patch chain, so the shipped cached GLB roots
can be replaced only under the explicit flag/factory contract; the default
WebGL load still uses the current `onBeforeCompile` patches. The diagnostic now
also samples Rolling Hills tree placements from `shared/TreePlacement.generateTrees`
and renders eight adapter-backed tree GLB samples as a production-placement
preview. A follow-up
diagnostic island renders the same samples through WebGPU `THREE.InstancedMesh`
groups for trunks and leaves, proving LOD0 native Three instancing without
pulling production `InstancedMesh2` into the WebGPU namespace. That path now
goes through `js/world/konveyorNativeInstancingAdapter.js`. A rock transform
diagnostic now uses production-side `js/world/rockPlacementPlan.js` with an
injected seeded RNG, records generated scene-zone rock samples for all three
rock GLBs, and renders them through the same native instancing seam. Production
`RockPlacement` still leaves the default route on `Math.random()`, but the
production-side opt-in route `?renderer=webgpu&konveyorRocks=1` now uses
`mulberry32(sceneSeed + Rock)` and records a stable scene proof in
`cycle36-validation/runtime/rock-placement-flag-proof.json`. Shared obstacle
state remains unwired. `cycle36-validation/runtime/production-flag-fallback-proof.json`
now records Field, Rolling Hills, and Open Country with `renderer=webgpu` plus
all current Konveyor material and placement flags but without `diagnostic=1`;
all three scenes stay effective WebGL with
`fallbackReason: "diagnostic-flag-required"`, the rock-placement route applies,
and material adapters fail closed with
`missing-factories`. Do not start production wiring with
terrain, grass, water, sheep, or Kiln impostors.

## Active ShaderMaterial Surfaces

| Order | Surface | File | Current role | WebGPU risk | Migration shape | Gate |
|---:|---|---|---|---|---|---|
| 1 | Sun disc billboard | `js/effects/SunBillboard.js` | Additive quad aligned to the atmosphere sun direction; lazy-loaded as a scene-coupled production chunk. | Low. Fragment is radial alpha/color math only. | TSL node material with `uv()`, `smoothstep`, additive blending, and opacity node. Production-facing material creation routes through the shared `?renderer=webgpu&konveyorEffects=1` adapter plus explicit factories; default WebGL still uses the existing `ShaderMaterial` after the scene-coupled dynamic import. | Diagnostic island screenshot/probe, then default smoke. |
| 2 | Portal ring | `js/effects/PortalEffect.js` | Open Country corral portal ring pulse and color phase. | Low-medium. Small shader, but user-visible objective feedback. | TSL node material or WebGPU-only diagnostic replica before wiring to the real portal. Production-facing ring, pad, and particle material creation can now route through the same effect adapter with explicit factories; default WebGL still uses the existing ring `ShaderMaterial`, pad `MeshBasicMaterial`, and particle `PointsMaterial`. | Open Country objective visual screenshot plus completion smoke. |
| 3 | Cloud layer | `js/atmosphere/CloudLayer.js`, `js/atmosphere/cloudShader.glsl.js` | Transparent moving sky-plane clouds. | Medium. Transparency, forceSinglePass, horizon edge fade, and time/sun uniforms. | Diagnostic cloud-plane TSL material now covers value-noise/fbm mask, sun tint, coverage, footprint fade, and time input, and the reusable WebGPU cloud-layer node-material candidate now lives outside the diagnostic file. Production-facing material creation can route through the shared `?renderer=webgpu&konveyorAtmosphere=1` adapter with explicit factories and update controls; the extracted node factory now consumes coverage, edge fade, feature scale, time, wind, sun direction, and sun color through node uniforms; default WebGL still uses the existing `ShaderMaterial`. Diagnostic sky-preset screenshots, renderless scene fog/horizon proof, and scene-bound diagnostic WebGPU screenshots now exist; full production-scene WebGPU screenshots and default production wiring remain deferred before WebGPU cloud coverage is claimed. | 12-cell screenshot matrix once goldens exist, plus atmosphere specs. |
| 4 | Hosek-Wilkie sky | `js/atmosphere/HosekWilkieSky.js`, `js/atmosphere/skyShader.glsl.js` | Analytic sky dome and horizon color source for scene fog. | High. It anchors scene fog color and Safari precision fixes. | Diagnostic sky/fog TSL prototype now exposes a CPU horizon/sun/fog packet. `Atmosphere` can forward an explicit sky factory to `HosekWilkieSky`, and `HosekWilkieSky` directly routes through `?renderer=webgpu&konveyorAtmosphere=1` when explicit factories are present. The reusable WebGPU sky/fog node-material candidate now lives outside the diagnostic file. Diagnostic preset screenshots, fog-consumer proof, renderless scene fog/horizon proof, and scene-bound diagnostic WebGPU screenshots now exist, but production default wiring remains deferred before WebGPU sky coverage is claimed. | Atmosphere specs, visual cells across sun presets, mobile/Safari canary. |
| 5 | Anime water | `js/water/AnimeWater.js` | Shoreline foam, heightfield-driven foam, ripples, sun glint, fog. | High. Samples a generated heightfield `DataTexture` and drives a visible scene focal point. | Diagnostic TSL island now covers production palette, shoreline bands, foam, ripples, sun glint, fog input, and a non-filtered `RedFormat`/`FloatType` sample loaded from `public/terrain/rolling-hills.bin`. Production-facing material creation can now route through `?renderer=webgpu&konveyorWater=1` with an explicit factory and update controls. The reusable heightfield-backed WebGPU anime-water node-material candidate now lives in `js/water/konveyorAnimeWaterNodeMaterial.js`, and the adapter spec proves the flagged production seam can route through it; default WebGL still uses the existing `ShaderMaterial`. Scene-bound Rolling Hills/Open Country screenshots remain required before replacing WebGL water. | Water shoreline specs, Rolling Hills/Open Country screenshots, latency. |
| 6 | Terrain ground | `js/TerrainBuilder.js` | Heightfield-displaced terrain with procedural ground color and Three fog chunks. | High. It is the base surface of every production scene and uses fog chunks. | Diagnostic terrain-heightfield TSL island now samples the real Rolling Hills heightfield texture for height-based ground color and fog input. Production-facing material creation can now route through `?renderer=webgpu&konveyorTerrain=1` with an explicit factory and lazy height-texture creation. The reusable heightfield-backed WebGPU terrain node-material candidate now lives in `js/world/konveyorTerrainNodeMaterial.js`, and the adapter spec proves the flagged production seam can route through it; default WebGL still uses the existing terrain `ShaderMaterial`. Scene-bound Rolling Hills/Open Country screenshots remain required before replacing WebGL terrain. | Refactor-baseline terrain hash untouched, screenshots, perf. |
| 7 | Grass blades | `js/GrassSystem.js`, `js/shaders/grass/*.glsl` | Instanced blade geometry, wind, interaction, LOD fade, fake SSS, manual fog. | Very high. It owns interaction feel and high-count perf. | Diagnostic grass-blade TSL material now covers production default gradient colors, analytic wind/gust/flutter displacement, alpha hash, sky/fog handoff, and a smooth opacity proxy using `grassFadeStart`/`grassFadeEnd`. Production-facing material creation can now route through `?renderer=webgpu&konveyorGrass=1` with an explicit blade factory and update controls. The reusable WebGPU grass-blade node-material candidate now lives in `js/world/konveyorGrassBladeNodeMaterial.js`, and the adapter spec proves the flagged production seam can route through it with production blade geometry, wind, color, lighting, fade, and material posture inputs; default WebGL still uses the existing grass `ShaderMaterial`. Production stochastic blade dither, production instancing, compute/trample experiments, and scene-level WebGPU grass parity remain deferred. | Perf, latency, visual, mobile profile, interaction smoke. |
| 8 | Sheep instancing | `js/OptimizedSheep.js`, `js/shaders/sheep/*.glsl` | Instanced sheep geometry, animation attributes, vertex colors, manual fog. | Very high. It touches core gameplay scale and animation feel. | Diagnostic sheep-wool TSL material now covers toon/wool colors, procedural wool displacement, rim/SSS terms, and sky/fog handoff. Production-facing material creation can now route through `?renderer=webgpu&konveyorSheep=1` with an explicit sheep factory and update controls. The reusable WebGPU sheep-wool node-material candidate now lives in `js/konveyorSheepNodeMaterial.js`, and the adapter spec proves the flagged production seam can route through it with sheep color, lighting, wool, fog, material, and merged-geometry metadata; default WebGL still uses the existing instanced sheep `ShaderMaterial`. Production instancing parity, `instanceData`/`instanceAnimation`/`vertexId` parity, full vertex-color part parity, terrain grounding, multiplayer-safe visual parity, and high-count animation remain deferred. | Sim fixtures unchanged, smoke, perf high-count modes. |
| 9 | Kiln tree impostors | `js/kiln-impostor-material.js` | Atlas-sampled tree impostors with relighting, alpha hash, fog, parallax/depth scaffolding. | Very high. It is asset-pipeline coupled and must match LOD0 color. | Diagnostic one-species TSL island now fetches the `tree1` sidecar plus albedo/normal/depth atlases, derives a diagnostic view tile triad from sidecar angles, blends three atlas tiles with premultiplied alpha, relights from the normal aux layer, and samples the depth aux layer as a diagnostic shading proxy. Production-facing material creation can now route through `?renderer=webgpu&konveyorImpostors=1` with an explicit impostor factory and tint controls. The reusable WebGPU Kiln impostor node-material candidate now lives in `js/konveyorKilnImpostorNodeMaterial.js`, and the adapter spec proves the flagged production seam can route through it with atlas textures, sidecar layout, lighting, fog, tunables, and material posture; default WebGL still uses the existing impostor `ShaderMaterial`. Per-frame production tile selection, parallax, depth discard, production LOD, and LOD color matching remain deferred. | LOD color-match artifacts, tree visibility, perf, screenshots. |
| 10 | Procedural mountains | `js/ProceduralMountains.js`, `js/shaders/proceduralMountainsShader.js` | Inactive standalone horizon ring. `TerrainBuilder.addMountains()` returns no meshes and no longer imports this class. | Low as a blocker, but misleading as migration scope. | Do not port now. Delete or re-scope when a real horizon ring is approved. | None until reactivated. |

## Active onBeforeCompile Patch Chains

| Patch | File | Mutated material | Why it matters | WebGPU migration note |
|---|---|---|---|---|
| Tree wind plus occluder fade | `js/world/shaderPatches.js`, `js/shaders/OccluderFadePatch.js` | Tree GLB leaf `MeshStandardMaterial` instances. | Adds wind sway, alpha hash, and camera-to-dog dither fade. | Diagnostic leaf TSL material now proves wind, alpha-hash posture, and occluder fade inputs. The reusable WebGPU tree branch and leaf node-material candidates now live in `js/world/konveyorTreeBranchNodeMaterial.js` and `js/world/konveyorTreeLeafNodeMaterial.js`, and the material adapter spec proves the flagged production seam can route `branches` and `leaves` through them. Default WebGL still uses the existing `onBeforeCompile` tree wind and occluder patch path. |
| Rock rim light | `js/world/shaderPatches.js` | Rock GLB materials. | Adds stylized fresnel rim keyed to atmosphere sun color. | Formula now exists as a reusable `MeshStandardNodeMaterial` factory in `js/world/konveyorRockRimNodeMaterial.js`, and the material adapter spec proves the flagged production seam can route rock traversal through it. Default WebGL still uses the existing rock-rim `onBeforeCompile` patch path. |
| Meadow quad tint | `js/GrassSystem.js`, `js/world/konveyorMeadowQuadNodeMaterial.js` | Far-ring `MeshLambertMaterial`. | Replaces flat distant grass with UV-noise color variance. | Formula now exists as a reusable `MeshLambertNodeMaterial` factory using production default grass colors, the same 5-cell UV hash scale, and CPU sky/fog input. Production-facing material creation can now route through `?renderer=webgpu&konveyorGrass=1` with an explicit factory; default WebGL still uses the existing `MeshLambertMaterial` procedural tint path. Far-ring scene screenshots remain deferred. |

## GLB Material Ownership Evidence

Captured artifact:
`cycle36-validation/runtime/material-ownership.json`

Replacement proof artifact:
`cycle36-validation/runtime/material-replacement-proof.json`

Runtime diagnostic proof artifact:
`cycle36-validation/runtime/webgpu-diagnostic-chrome.json`

Rendered clone screenshot artifact:
`cycle36-validation/runtime/webgpu-diagnostic-islands-chrome.png`

The ownership proof scans the shipped GLBs instead of trusting runtime
comments:

- Tree LOD0 and LOD1 assets each expose two named materials: `branches` and
  `leaves`.
- `leaves` is consistently `MASK` alpha with `doubleSided: true`, so tree
  WebGPU replacement can target the material name while preserving LOD parity.
- `branches` is consistently opaque and single-sided, so bark replacement can
  stay separate from the leaf wind/alpha/occluder path.
- Rock GLB primitives resolve through a runtime-default material target, so the
  rock-rim migration must replace by rock asset class or mesh traversal rather
  than by authored material name.
- The WebGPU diagnostic `glb-material-replacement` island proves those two
  replacement strategies in isolation: tree replacement by material name and
  rock replacement by traversal.
- The material-replacement proof applies the same strategies to primitive
  clones produced from the shipped compressed GLBs: all four tree LOD0/LOD1
  files resolve `branches` and `leaves`, and all three rock files replace by
  traversal from runtime-default material ownership.
- The WebGPU runtime diagnostic now fetches the same seven shipped GLBs in the
  browser under `?renderer=webgpu&diagnostic=1` and records
  `runtimeGlbReplacement.summary.ok: true`, with 8 tree materials and 3 rock
  materials replaced through the expected strategies.
- The rendered-clone island now loads the same seven GLBs through `GLTFLoader`,
  `DRACOLoader`, and `MeshoptDecoder`, routes them through the production-side
  Konveyor material adapter, and records `runtimeGlbPreview.ok: true` with
  bounded clone dimensions in the Chrome diagnostic artifact. These loader
  modules are copied to the diagnostic static vendor path and imported by URL to
  avoid exporting them from the default `main` chunk.
- `production-placement-preview` samples Rolling Hills seed 1 through
  `shared/TreePlacement.generateTrees`, records 147 generated trees, and
  renders eight adapter-backed tree GLB samples in the WebGPU diagnostic. Rock
  exclusions are intentionally empty in this proof because shared obstacle
  wiring remains separate from the current pure rock placement extraction.
- `production-instanced-tree-preview` consumes the same eight samples and
  renders four WebGPU `THREE.InstancedMesh` groups: trunk and leaves for each
  tree type. It records 16 instance matrices across the four groups and keeps
  the status of production `InstancedMesh2` explicit: not imported in the
  WebGPU diagnostic, LOD0-only, no BVH/LOD/impostor migration claimed.
- `js/world/konveyorNativeInstancingAdapter.js` owns the native instancing seam
  used by that diagnostic. Package inspection found WebGL-specific
  `@three.ez/instanced-mesh` surfaces (`WebGLRenderer`,
  `WebGL2RenderingContext`, `WebGLProperties`), so the current WebGPU route is
  native `THREE.InstancedMesh` rather than direct `InstancedMesh2` reuse.
- `diagnostic-rock-instancing-preview` records transform samples generated from
  scene zones by `js/world/rockPlacementPlan.js` with an injected seeded RNG,
  covers all three shipped rock GLBs, renders them through native WebGPU
  `THREE.InstancedMesh`, and reports the obstacle fields as recorded-only.
  Production `RockPlacement` now has a separate deterministic RNG route behind
  `?renderer=webgpu&konveyorRocks=1`; default production still uses client
  `Math.random()`, and shared obstacle wiring remains separate work.
- `cycle36-validation/runtime/production-flag-fallback-proof.json` records the
  current production fail-closed contract: `renderer=webgpu` plus all Konveyor
  material/placement flags still boots effective WebGL unless `diagnostic=1`,
  the rock placement flag applies deterministic RNG, and material adapters stay
  off without explicit factories.
- The production-side adapter in `js/world/konveyorMaterialAdapter.js` reuses
  the same tree-name and rock-traversal replacement rules for cached GLB roots.
  It only activates when `renderer=webgpu&konveyorMaterials=1` is present and
  WebGPU material factories are explicitly supplied; otherwise production
  materials stay untouched. The reusable WebGPU rock-rim, tree branch, and
  tree leaf node-material candidates now live in
  `js/world/konveyorRockRimNodeMaterial.js`,
  `js/world/konveyorTreeBranchNodeMaterial.js`, and
  `js/world/konveyorTreeLeafNodeMaterial.js`, and the adapter seam spec proves
  the flagged rock, `branches`, and `leaves` factories can route through them
  while default WebGL tree wind, occluder, and rock rim patching stay untouched.
- The production-side adapter in `js/effects/konveyorEffectMaterialAdapter.js`
  covers sun billboard and portal ring material creation. It only activates
  when `renderer=webgpu&konveyorEffects=1` is present and explicit effect
  factories are supplied; otherwise the existing WebGL `ShaderMaterial` paths
  stay untouched. Both production effect classes now call this adapter directly.
- The production-side adapter in `js/world/konveyorGrassMaterialAdapter.js`
  covers far-ring meadow quad and grass-blade material creation. It activates
  when `renderer=webgpu&konveyorGrass=1` is present and the matching explicit
  factory is supplied; the reusable WebGPU grass-blade node-material candidate
  is now covered by the adapter seam spec. Otherwise the existing WebGL
  `MeshLambertMaterial` meadow path and grass `ShaderMaterial` path stay
  untouched.
- The production-side adapter in `js/water/konveyorWaterMaterialAdapter.js`
  covers anime-water material creation only. It activates when
  `renderer=webgpu&konveyorWater=1` is present and a water factory is supplied;
  the reusable heightfield-backed WebGPU anime-water node-material candidate
  now lives in `js/water/konveyorAnimeWaterNodeMaterial.js` and is covered by
  the adapter seam spec. Otherwise the existing WebGL `ShaderMaterial` plus
  uniform update path stays untouched.
- The production-side adapter in `js/world/konveyorTerrainMaterialAdapter.js`
  covers terrain-ground material creation only. It activates when
  `renderer=webgpu&konveyorTerrain=1` is present and a terrain factory is
  supplied; `TerrainBuilder` now exposes lazy height-texture creation to the
  factory, and the reusable WebGPU terrain node-material candidate is covered
  by the adapter seam spec. Otherwise the existing terrain `ShaderMaterial`
  plus Three fog chunks stay untouched.
- The production-side adapter in `js/konveyorSheepMaterialAdapter.js` covers
  optimized sheep material creation only. It activates when
  `renderer=webgpu&konveyorSheep=1` is present and a sheep factory is supplied;
  the reusable WebGPU sheep-wool node-material candidate is now covered by the
  adapter seam spec. Otherwise the existing sheep `ShaderMaterial` plus
  time/fog uniform update path stays untouched.
- The production-side adapter in `js/konveyorImpostorMaterialAdapter.js` covers
  Kiln impostor material creation only. It activates when
  `renderer=webgpu&konveyorImpostors=1` is present and an impostor factory is
  supplied; the reusable WebGPU Kiln impostor node-material candidate is now
  covered by the adapter seam spec. Otherwise the existing impostor
  `ShaderMaterial` plus tint uniform update path stays untouched.
- `SunBillboard` itself is now loaded through a scene-coupled dynamic import.
  The default WebGL effect remains present before normal scene body construction
  and after scene swaps, while the build emits a separate sun-billboard chunk
  and keeps the current default bundle at `mainKB=553` / `threeKB=603`, with
  the tree/rock material adapter emitted as a separate 3 KB lazy chunk.
- `GrassSystem` is now a separate async chunk loaded from production grass
  creation paths. This recovered the bundle budget after the water seam and
  left the committed refactor-baseline fixture unchanged.

## Dormant Or Supporting Surfaces

- `js/shaders/HeightFogPatch.js` has no active JS consumers. It is a future
  aerial-perspective foundation, not a current WebGPU blocker.
- `js/shaders/grass/*.glsl` and `js/shaders/sheep/*.glsl` mirror or supply the
  active grass/sheep shaders. Treat the runtime classes as the source of truth
  and use the external files as parity fixtures when porting.
- `tools/bake-trees/bake.html` strips EZ-Tree runtime `onBeforeCompile`
  callbacks before export. That is asset-pipeline hygiene, not a runtime
  WebGPU surface.
- `js/ProceduralMountains.js` is still dormant and is no longer imported by
  `TerrainBuilder`; removing that import is scope cleanup, not bundle-headroom
  evidence.

## Recommended Migration Order

1. Use the captured GLB ownership proof before production tree or rock wiring:
   tree replacements may target `leaves` and `branches` by material name across
   LOD0/LOD1; rock replacements must use rock asset class or mesh traversal.
   The diagnostic replacement island, GLB primitive-clone proof, and browser
   runtime GLB fetch proof cover both strategies. The rendered-clone island now
   proves all shipped tree and rock variants can load and render with WebGPU
   node-material replacements. The feature-flagged production adapter now
   exists, and the first tree-placement proof samples real Rolling Hills scene
   data through the shared tree placement generator. The WebGPU diagnostic now
   also proves a LOD0-only `THREE.InstancedMesh` tree path through the
   production-facing adapter seam. Rock placement now has a production-side
   pure placement plan, a seeded diagnostic scene-zone generation proof, and
   transform/instancing proof, but not a production seeded generator or shared
   obstacle wiring. Keep
   production `InstancedMesh2` on the WebGL path for now; move to another
   smaller material island while
   keeping current WebGL `onBeforeCompile` patches as default. The meadow-quad
   diagnostic records production default grass colors and CPU sky/fog input,
   and its production material creation path now has a flag-gated adapter seam,
   but it is not yet a production scene WebGPU boot.
2. Keep sky/fog production wiring behind full production-scene WebGPU
   screenshots. The renderless preset-color matrix, diagnostic preset
   screenshots, renderless scene fog/horizon proof, and scene-bound diagnostic
   WebGPU screenshots now exist for all shipped scene/preset definitions, and
   `tests/webgpu-diagnostic.spec.js` pins the diagnostic fog-consumer contract
   across rock rim, meadow, water, terrain, grass, sheep, and Kiln states. The
   production-facing sky-dome
   factory seam now reaches `Atmosphere` and `HosekWilkieSky`, and the reusable
   sky/fog node-material candidate now lives outside the diagnostic harness.
   The same atmosphere seam now reaches production `CloudLayer` with update
   controls, and the reusable cloud-layer node-material candidate now also lives
   outside the diagnostic harness with live node uniform controls for CloudLayer
   state. Both paths are still factory supplied and do not replace the default
   WebGL sky or cloud material by themselves.
3. Keep water production wiring deferred until the diagnostic heightfield
   `DataTexture` proof is expanded beyond Rolling Hills, then backed by
   Rolling Hills/Open Country scene screenshots. The production-facing water
   adapter seam exists now, but it is not scene-level WebGPU water parity.
4. Defer production terrain, production blade grass, production sheep
   scene wiring, and production Kiln impostors until the diagnostic islands have
   proved scene binding, bundle posture, and visual gates. The grass-blade
   island is shader-contract evidence only; it does not yet prove production
   instancing, entity interaction, production stochastic LOD dither, or
   high-count grass performance. The sheep-wool island and material factory
   seam are likewise material evidence only; they do not yet prove production
   `OptimizedSheep` instancing parity, animation attributes, terrain grounding,
   multiplayer-safe visual parity, or high-count perf. The Kiln island and
   material factory seam prove sidecar/atlas handoff, WebGPU texture sampling,
   normal-aux relighting, sidecar-derived diagnostic tile selection, three-tile
   premultiplied blending, a diagnostic RGBADepthPacking sample, and tint
   update delegation only; they do not yet prove per-frame production tile
   selection, parallax, depth-discard ghost suppression, production LOD wiring,
   or color parity against LOD0.

## Acceptance For The Next Code Island

- WebGL remains the default URL behavior.
- WebGPU remains under `?renderer=webgpu&diagnostic=1`.
- No `shared/**`, sim-baseline, worker migration, or D1 changes.
- `npm run build`, `npm test`, `npm run lint`, `npm run native:check`, and the
  diagnostic Chrome probe pass.
- The default production-preview probe still records `diagnostic: null`.
