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
meadow-quad, cloud-plane, and sky/fog formulas are now ported inside the
diagnostic island only. The rock-rim fresnel formula is also ported as a
diagnostic `MeshStandardNodeMaterial` island driven by the CPU sky/fog sun
color packet. A diagnostic tree-leaf island now covers wind displacement,
alpha-hash posture, and a local occluder fade proxy. A diagnostic anime-water
island now covers production palette handoff, shoreline color bands, foam,
ripples, sun glint, fog-color input, and a non-filtered `DataTexture` sample
loaded from the real Rolling Hills heightfield. The same texture now drives a
diagnostic terrain-heightfield material for height-based ground color and fog
input. A diagnostic grass-blade island now covers the production grass default
color gradient, analytic wind/gust/flutter displacement, alpha-hash posture,
sun/fog inputs, and explicit deferral markers for interaction bending and
distance fade. A diagnostic sheep-wool island now covers the production sheep
toon/wool color contract, procedural wool noise displacement, rim/SSS lighting
terms, and sky/fog handoff while recording `instanceData`,
`instanceAnimation`, and `vertexId` as deferred production instancing inputs.
A diagnostic Kiln impostor island now fetches the committed `tree1` sidecar and
albedo/normal atlases, samples one atlas tile in a WebGPU node material, and
uses the normal aux layer for a single-tile sun relight keyed to the sky/fog
packet. It still records tile blend, depth aux use, parallax, depth discard,
and production LOD wiring as deferred. Production grass, sheep, Kiln impostors,
water, and terrain wiring remain deferred until scene binding and screenshot
proof cover the shipped island scenes. GLB
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
WebGPU material factories. The diagnostic now also samples Rolling Hills tree
placements from `shared/TreePlacement.generateTrees` and renders eight
adapter-backed tree GLB samples as a production-placement preview; the default
WebGL load still uses the current `onBeforeCompile` patches. A follow-up
diagnostic island renders the same samples through WebGPU `THREE.InstancedMesh`
groups for trunks and leaves, proving LOD0 native Three instancing without
pulling production `InstancedMesh2` into the WebGPU namespace. That path now
goes through `js/world/konveyorNativeInstancingAdapter.js`. A rock transform
diagnostic now renders fixed `RockPlacement`-shaped samples for all three rock
GLBs through the same native instancing seam; it deliberately does not extract
or claim seeded production rock generation. Do not start production wiring with
terrain, grass, water, sheep, or Kiln impostors.

## Active ShaderMaterial Surfaces

| Order | Surface | File | Current role | WebGPU risk | Migration shape | Gate |
|---:|---|---|---|---|---|---|
| 1 | Sun disc billboard | `js/effects/SunBillboard.js` | Additive quad aligned to the atmosphere sun direction. | Low. Fragment is radial alpha/color math only. | TSL node material with `uv()`, `smoothstep`, additive blending, and opacity node. | Diagnostic island screenshot/probe, then default smoke. |
| 2 | Portal ring | `js/effects/PortalEffect.js` | Open Country corral portal ring pulse and color phase. | Low-medium. Small shader, but user-visible objective feedback. | TSL node material or WebGPU-only diagnostic replica before wiring to the real portal. | Open Country objective visual screenshot plus completion smoke. |
| 3 | Cloud layer | `js/atmosphere/CloudLayer.js`, `js/atmosphere/cloudShader.glsl.js` | Transparent moving sky-plane clouds. | Medium. Transparency, forceSinglePass, horizon edge fade, and time/sun uniforms. | Diagnostic cloud-plane TSL material now covers value-noise/fbm mask, sun tint, coverage, footprint fade, and time input. Production wiring still needs sky preset screenshots and fog/horizon integration. | 12-cell screenshot matrix once goldens exist, plus atmosphere specs. |
| 4 | Hosek-Wilkie sky | `js/atmosphere/HosekWilkieSky.js`, `js/atmosphere/skyShader.glsl.js` | Analytic sky dome and horizon color source for scene fog. | High. It anchors scene fog color and Safari precision fixes. | Diagnostic sky/fog TSL prototype now exposes a CPU horizon/sun/fog packet; production wiring still needs analytic parity and preset screenshots. | Atmosphere specs, visual cells across sun presets, mobile/Safari canary. |
| 5 | Anime water | `js/water/AnimeWater.js` | Shoreline foam, heightfield-driven foam, ripples, sun glint, fog. | High. Samples a generated heightfield `DataTexture` and drives a visible scene focal point. | Diagnostic TSL island now covers production palette, shoreline bands, foam, ripples, sun glint, fog input, and a non-filtered `RedFormat`/`FloatType` sample loaded from `public/terrain/rolling-hills.bin`. Production wiring still needs scene-bound Rolling Hills/Open Country screenshots before replacing WebGL water. | Water shoreline specs, Rolling Hills/Open Country screenshots, latency. |
| 6 | Terrain ground | `js/TerrainBuilder.js` | Heightfield-displaced terrain with procedural ground color and Three fog chunks. | High. It is the base surface of every production scene and uses fog chunks. | Diagnostic terrain-heightfield TSL island now samples the real Rolling Hills heightfield texture for height-based ground color and fog input. Production terrain remains WebGL. | Refactor-baseline terrain hash untouched, screenshots, perf. |
| 7 | Grass blades | `js/GrassSystem.js`, `js/shaders/grass/*.glsl` | Instanced blade geometry, wind, interaction, LOD fade, fake SSS, manual fog. | Very high. It owns interaction feel and high-count perf. | Diagnostic grass-blade TSL material now covers production default gradient colors, analytic wind/gust/flutter displacement, alpha hash, and sky/fog handoff. Interaction bending, distance fade, production instancing, and compute/trample experiments remain deferred. | Perf, latency, visual, mobile profile, interaction smoke. |
| 8 | Sheep instancing | `js/OptimizedSheep.js`, `js/shaders/sheep/*.glsl` | Instanced sheep geometry, animation attributes, vertex colors, manual fog. | Very high. It touches core gameplay scale and animation feel. | Diagnostic sheep-wool TSL material now covers toon/wool colors, procedural wool displacement, rim/SSS terms, and sky/fog handoff. Production `InstancedMesh`, `instanceData`, `instanceAnimation`, `vertexId`, terrain grounding, and high-count animation remain deferred. | Sim fixtures unchanged, smoke, perf high-count modes. |
| 9 | Kiln tree impostors | `js/kiln-impostor-material.js` | Atlas-sampled tree impostors with relighting, alpha hash, fog, parallax/depth scaffolding. | Very high. It is asset-pipeline coupled and must match LOD0 color. | Diagnostic one-species TSL island now fetches the `tree1` sidecar plus albedo/normal atlases, samples one tile with alpha/fog, and relights it from the normal aux layer. Barycentric tile blend, depth aux use, parallax, depth discard, production LOD, and LOD color matching remain deferred. | LOD color-match artifacts, tree visibility, perf, screenshots. |
| 10 | Procedural mountains | `js/ProceduralMountains.js`, `js/shaders/proceduralMountainsShader.js` | Inactive standalone horizon ring. `TerrainBuilder.addMountains()` returns no meshes. | Low as a blocker, but misleading as migration scope. | Do not port now. Delete or re-scope when a real horizon ring is approved. | None until reactivated. |

## Active onBeforeCompile Patch Chains

| Patch | File | Mutated material | Why it matters | WebGPU migration note |
|---|---|---|---|---|
| Tree wind plus occluder fade | `js/world/shaderPatches.js`, `js/shaders/OccluderFadePatch.js` | Tree GLB leaf `MeshStandardMaterial` instances. | Adds wind sway, alpha hash, and camera-to-dog dither fade. | Diagnostic leaf TSL material now proves wind, alpha-hash posture, and occluder fade inputs. Production replacement still needs GLB material ownership or a normalization pass. Cannot carry `onBeforeCompile` into WebGPU. |
| Rock rim light | `js/world/shaderPatches.js` | Rock GLB materials. | Adds stylized fresnel rim keyed to atmosphere sun color. | Formula now exists in the diagnostic TSL harness as `MeshStandardNodeMaterial`; production wiring still needs GLB material ownership and replacement strategy for the current patch chain. |
| Meadow quad tint | `js/GrassSystem.js` | Far-ring `MeshLambertMaterial`. | Replaces flat distant grass with UV-noise color variance. | Formula now exists in the diagnostic TSL harness as `MeshLambertNodeMaterial`. Production wiring still needs fog and far-ring screenshots. |

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
  exclusions are intentionally empty in this proof because production rock
  placement still uses client `Math.random()` and should be handled as a
  separate placement/instancing decision.
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
- `diagnostic-rock-instancing-preview` records fixed transform samples shaped
  like `js/world/RockPlacement.js` instance data, covers all three shipped rock
  GLBs, renders them through native WebGPU `THREE.InstancedMesh`, and reports
  the obstacle fields as recorded-only. Production rock placement still uses
  client `Math.random()`, so seeded generation and shared obstacle wiring
  remain separate work.
- The production-side adapter in `js/world/konveyorMaterialAdapter.js` reuses
  the same tree-name and rock-traversal replacement rules for cached GLB roots.
  It only activates when `renderer=webgpu&konveyorMaterials=1` is present and
  WebGPU material factories are explicitly supplied; otherwise production
  materials stay untouched.

## Dormant Or Supporting Surfaces

- `js/shaders/HeightFogPatch.js` has no active JS consumers. It is a future
  aerial-perspective foundation, not a current WebGPU blocker.
- `js/shaders/grass/*.glsl` and `js/shaders/sheep/*.glsl` mirror or supply the
  active grass/sheep shaders. Treat the runtime classes as the source of truth
  and use the external files as parity fixtures when porting.
- `tools/bake-trees/bake.html` strips EZ-Tree runtime `onBeforeCompile`
  callbacks before export. That is asset-pipeline hygiene, not a runtime
  WebGPU surface.

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
   production-facing adapter seam. Rock placement now has a diagnostic
   transform/instancing proof, but not a seeded production generator. Keep
   production `InstancedMesh2` on the WebGL path for now; move to another
   smaller material island or the measured rock-generation extraction while
   keeping current WebGL `onBeforeCompile` patches as default.
2. Keep sky/fog production wiring behind parity evidence for analytic colors,
   preset screenshots, and fog consumers.
3. Keep water production wiring deferred until the diagnostic heightfield
   `DataTexture` proof is expanded beyond Rolling Hills, then backed by
   Rolling Hills/Open Country scene screenshots.
4. Defer production terrain, production blade grass, production sheep
   instancing, and production Kiln impostors until the diagnostic islands have
   proved scene binding, bundle posture, and visual gates. The grass-blade
   island is shader-contract evidence only; it does not yet prove production
   instancing, entity interaction, LOD fade, or high-count grass performance.
   The sheep-wool island is likewise material evidence only; it does not yet
   prove production `OptimizedSheep` instancing, animation attributes, terrain
   grounding, multiplayer-safe visual parity, or high-count perf. The Kiln
   island proves sidecar/atlas fetch, WebGPU texture sampling, and single-tile
   normal-aux relighting only; it does not yet prove barycentric tile blending,
   depth aux use, parallax, depth-discard ghost suppression, production LOD
   wiring, or color parity against LOD0.

## Acceptance For The Next Code Island

- WebGL remains the default URL behavior.
- WebGPU remains under `?renderer=webgpu&diagnostic=1`.
- No `shared/**`, sim-baseline, worker migration, or D1 changes.
- `npm run build`, `npm test`, `npm run lint`, `npm run native:check`, and the
  diagnostic Chrome probe pass.
- The default production-preview probe still records `diagnostic: null`.
