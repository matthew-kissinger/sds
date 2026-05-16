# WebGPU Octahedral Impostor Spike - 2026-05-16

## Scope

This spike answers the current tree-impostor regression question for SDS:

- Are the WebGPU mobile trees actually proper octahedral impostors?
- What do current browser, Three.js, and engine references imply for a correct
  WebGPU implementation?
- What should SDS build next without regenerating trees at runtime?

The short answer: **no, SDS WebGPU mobile is not currently running a production
octahedral impostor path.** The WebGPU node material is a diagnostic/fixed-tile
Kiln atlas sampler. It does not implement per-camera tile selection, camera
facing projection, parallax/depth discard, or the WebGL Kiln grounding/pivot
contract. It should stay out of production mobile unless explicitly enabled for
debugging.

## Current SDS Truth

- `docs/tree-pipeline.md` correctly says tree assets and impostor atlases are
  author-time artifacts. `npm run bake-tree-impostors` writes albedo, normal,
  depth, and sidecar JSON outputs under `assets/models/trees/`. Runtime tree
  generation is not part of the production contract.
- The committed sidecars are **4x4 lat/lon hemi-y Kiln atlases**, not true
  octahedral atlases. `tree1.imposter.json` and `tree2.imposter.json` both say
  `"layout": "latlon"`, `"axis": "hemi-y"`, `tilesX: 4`, `tilesY: 4`, and
  2048x2048 atlases.
- The WebGL Kiln material has the mature behavior: world-up locked camera-facing
  billboard projection, atlas tile selection, barycentric blend, normal
  relighting, depth/parallax hooks, alpha posture, and bake-center anchoring.
- The WebGPU candidate at `js/konveyorKilnImpostorNodeMaterial.js` samples three
  fixed tiles and weights passed by `js/konveyorImpostorNodeMaterialFactories.js`.
  The defaults are always `[[0,0], [1,0], [0,1]]` with `[0.45, 0.35, 0.2]`.
  There is no camera-to-instance view vector, no shader tile-pick, no dynamic
  blend weights, no WebGPU billboard vertex projection, and no production
  parallax/depth-discard parity.
- `docs/konveyor-sds.md` already records this as deferred: per-frame production
  tile selection, parallax, depth discard, production LOD wiring, and LOD0 color
  parity were not closed.
- The Android screenshot failure is consistent with this: flat-looking,
  poorly-oriented, ground-misaligned mobile trees are expected if a fixed atlas
  tile sampler is forced into production.

Cycle 38 has already moved the production WebGPU mobile path away from the broken
impostor by requiring `?konveyorNativeTreeImpostors=1` before using it and by
using chunked native `THREE.InstancedMesh` LOD1 trees as the stopgap. That is the
right containment until a real view-dependent impostor port exists.

After the connected-phone Cycle 38 follow-up, this remains true. Open Country
runtime probes now show chunked native LOD1 trees, frustum-cullable chunk bounds,
and grounding samples where `placementY == groundY`. The visible "flat/sunk tree"
issue is therefore not closed by a placement-Y fix; it needs the real
view-dependent impostor/LOD representation and a screenshot gate.

## External Findings

### 2026 Browser Baseline

- MDN still marks WebGPU as limited availability and secure-context only. SDS's
  connected-phone workflow should keep using `adb reverse tcp:3000 tcp:3000`
  with `http://127.0.0.1:3000` because localhost is a secure origin, while LAN
  HTTP is not a reliable WebGPU test path.
- Chrome enabled WebGPU by default on Android 12+ Qualcomm/ARM devices in Chrome
  121, but Chrome's own note says wider Android coverage depends on further
  hardware testing and optimization. One Galaxy proof is useful evidence, not an
  all-mobile claim.
- Chrome 146 adds WebGPU compatibility mode on OpenGL ES 3.1 by requesting
  `featureLevel: "compatibility"`. This matters for low/older Android reach, but
  it is a stricter/lower feature target, not permission to ship the same shader
  and asset budgets everywhere.
- WebGPU adapter/device features and limits are the right startup signal for
  tiering, but WebGPU docs are clear that apps should request only the limits
  and optional features they actually need. SDS should classify from adapter
  features/limits, viewport/DPR, memory/concurrency, renderer strings, and
  measured frame history instead of asking for every optional capability.
- WebGPU's browser validation model rewards fewer command submissions and fewer
  repeated state changes. The tree path should reduce both triangles and draw
  calls; replacing geometry with impostors while leaving hundreds of chunked
  draws is only a partial win.

### WebGPU and Three.js

- Three's `WebGPURenderer` is explicitly a WebGPU-first renderer with WebGL 2
  backend fallback. This matches SDS's desired progressive WebGPU default with a
  WebGL escape hatch.
- Three TSL exposes `cameraPosition`, `positionWorld`, `positionLocal`,
  `positionNode`, `Discard`, `If`, `Switch`, storage/attribute nodes, and a
  `billboarding()` helper. That is enough to build a correct WebGPU impostor,
  but `billboarding()` alone only solves flat-mesh orientation. It does not solve
  multi-view tile selection, atlas blend, depth/parallax, alpha discard, or
  tree-origin grounding.
- The WebGPU-native direction for very large instance sets is compute culling
  plus indirect draw, potentially wrapped with render bundles once the draw
  command shape is stable. This is a follow-on optimization for SDS; it does not
  replace the need for the correct impostor representation.
- Current Three ecosystem packages show the two halves of the problem but not a
  drop-in answer: `@three.ez/instanced-mesh` has mature per-instance culling/LOD
  ideas for WebGL-style instancing, and `@three-blocks/core` documents WebGPU
  compute instance culling with indirect draw, but neither ports SDS's Kiln
  atlas contract by itself.

### Engine and Tool Patterns

- Unreal's current Impostor Baker docs treat impostors as author-time baked
  assets with full/upper hemisphere/traditional billboard modes, selectable frame
  grids, color/normal/scalar/depth capture, batch generation, and parallax
  modes. This strongly matches SDS's author-time policy.
- Unity's `BillboardAsset` docs are a useful lower-bound contract: billboards are
  LOD replacements for distant meshes, use pre-rendered images, often use several
  directions, and SpeedTree billboards include normal textures for lighting.
  Plain billboards are not equivalent to octahedral impostors.
- The Godot Octahedral Impostors implementation is the best readable open-source
  reference found in this spike. Its shader computes camera-to-pivot direction,
  octahedral full/hemi mapping, grid floor/fract, three-frame blend weights,
  sprite projection, depth-assisted UV reprojection, normal blending, alpha
  dither/cutoff, and optional shadow mesh baking.
- Unity's 2026 Asset Transformer SDK now has an `OctahedralImpostor` data type
  with transform/radius plus diffuse, normal, depth, metallic, AO, and roughness
  map slots. The useful signal is not that SDS should use Unity tooling; it is
  that modern pipelines still treat octahedral impostors as authored/baked data
  with multiple auxiliary maps, not as runtime-generated trees.
- Amplify Impostors' manual is a good production caution: octahedral impostors
  are an extension of LOD, not a replacement for close/mid geometry, and they
  can show ghosting/parallax artifacts when used too close. SDS should keep LOD1
  geometry for near/mid trees and only enable impostors past a proved transition
  distance.
- Ryan Brucks' ShaderBits article and `ictusbrucks/ImpostorBaker` remain the
  historical source lineage for UE-style octahedral impostors. The public repo is
  sparse, but its plugin manifest confirms the intent: generating impostors for
  distant static-mesh LODs.
- `@three.ez/instanced-mesh` is credible for WebGL-style instance culling, BVH,
  sorting, per-instance uniforms, and LOD. It is not a drop-in WebGPU impostor
  solution for SDS because SDS's WebGPU production path needs native Three
  WebGPU-compatible materials and renderer behavior.
- `agargaro/octahedral-impostor` exists but is not an acceptable production
  dependency today. Its README is effectively a stub, npm lookup for
  `@three.ez/octahedron-imposter` returned 404, and the package metadata shows
  `0.0.1` with `test: "echo todo add tests"`.
- The current Three.js ecosystem does have public octahedral-impostor forest
  experiments, including a 2025 Three forum demo that combines simplified mesh
  LODs with octahedral impostors for far trees. Treat these as useful reference
  patterns, not a production dependency or proof that SDS's existing sidecars are
  already correct.

## Recommendation

### Immediate Production Policy

Keep WebGPU as the intended mobile default, but **do not use the current WebGPU
Kiln impostor as the mobile tree renderer**. It is a diagnostic material, not a
production view-dependent impostor. Use the current chunked native LOD1 path for
mobile while budgets are measured and while a proper impostor port is built.

This is preferable to shipping sunk or fixed-facing impostor trees. A slightly
more expensive LOD1 tree that is grounded, culled, and visually stable is better
than a cheap impostor that breaks the scene.

### Proper WebGPU Impostor Path

Build SDS's own WebGPU impostor port from the existing Kiln/WebGL contract rather
than adopting a young package.

Required pieces:

1. **Bake contract audit**
   - Decide whether to keep 4x4 lat/lon hemi-y for now or rebake true
     octahedral atlases.
   - Re-bake sidecars after any accepted tree GLB/LOD asset changes.
   - Add sidecar fields for layout version, base pivot/ground offset, bbox
     center, world size, atlas dimensions, auxiliary layers, and source asset
     hash/tri count.

2. **WebGPU shader/material prototype**
   - Use TSL plus `wgslFn` only where TSL becomes too awkward.
   - Compute camera-to-instance or camera-to-tree-origin direction.
   - Convert direction to sidecar layout coordinates.
   - Compute floor/fract, choose the three neighboring frames, and blend with
     barycentric weights.
   - Project the quad in vertex space using world-up-locked camera-facing logic.
   - Sample albedo, normal, and depth. Implement alpha dither/discard and
     parallax/depth-discard parity before production.

3. **Production integration**
   - Group by tree type and atlas material.
   - Use chunk bounds for culling. Do not set `frustumCulled = false` globally.
   - Keep per-instance transforms grounded from the same placement height used by
     geometry LODs.
   - Crossfade or hysteresis-switch between LOD1 and impostor to avoid pop.
   - Keep dog-through-tree readability compatible with the impostor/far LOD
     transition.

4. **Mobile acceptance gates**
   - Android screenshots from yaw/pitch/camera-distance matrices prove frame
     selection changes with camera motion.
   - Terrain-grounding probe samples tree bases against visible mesh height.
   - Perf reports include draw calls, estimated triangles, visible counts, and
     quality state for full scene and trees-only isolation.

### Possible SDS-Specific Improvement

Use a **hybrid trunk geometry plus impostor canopy** for broad trees if pure
impostors keep reading as sunk or flat. Keep a cheap LOD1 trunk/major-branch mesh
grounded on terrain, then draw only the canopy volume as a view-dependent
impostor. This costs more than a single quad but fixes the most visible grounding
and "tree in the ground" failure while still removing most leaf triangles.

This is likely a better SDS fit than pure impostors because the dog/camera often
gets near trees on rolling terrain, and the trunk is the visual anchor that tells
the player whether placement is correct.

### Implementation Shape For SDS

The production path should be built in this order:

1. **Lab scene first**: one tree type, one atlas, one instanced impostor quad,
   camera orbit harness, and debug readout of selected tiles/weights. This keeps
   shader correctness independent from scene culling and quality governance.
2. **Sidecar v2**: record layout (`latlon-hemi-y` or `octa-hemi`), frame count,
   atlas dimensions, base pivot, bbox center/radius, source GLB hash, LOD
   triangle counts, and map inventory. Do not accept a sidecar that lacks depth
   or normal maps for production tree impostors.
3. **WebGPU material**: port the WebGL Kiln contract before changing the bake
   format. Implement dynamic camera-to-instance tile selection, three-frame
   blend, world-up-locked billboard projection, normal relighting, alpha
   dither/discard, depth/parallax hooks, and terrain-grounded pivot handling.
4. **Production culling**: group by tree type and material, then tile/chunk by
   terrain cell. Use CPU chunk culling first because it is debuggable in Three.
   Only move to compute culling/indirect draw after the representation passes
   screenshots.
5. **LOD integration**: near LOD1 geometry, far impostor, hysteresis or dithered
   transition, and a debug flag to force each tier. Do not re-enable production
   impostors by default until the Android matrix passes visual and frame gates.

If the lat/lon Kiln atlas is retained for the first WebGPU port, name it
accurately as `latlon-hemi impostor`, not `octahedral impostor`. If SDS wants the
Fortnite/Ryan Brucks style result, the next bake must be a real full/hemi
octahedral frame lattice with matching runtime mapping.

## Rejected Paths

- **Single billboard or fixed tile**: this is the current failure mode.
- **Runtime tree generation**: violates the SDS author-time asset contract.
- **Importing `agargaro/octahedral-impostor` now**: repo/package maturity is not
  enough for production WebGPU mobile.
- **Full LOD0 trees on mobile**: misses the geometry budget in Open Country.
- **Neural/gaussian tree impostors**: too much sorting/blending/bake complexity
  for this problem and not aligned with the current asset pipeline.
- **GPU-driven indirect draw rewrite first**: useful later, but not the root
  visual bug. Fix representation and culling first.

## Next Work Package

2026-05-16 follow-up: Cycle 38 added lab groundwork only. The new renderless
tile selector covers lat/lon-hemi and octahedral frame coordinates, and the
WebGPU Kiln node material can accept dynamic tile-weight uniforms. This does not
make production trees octahedral impostors. Production still needs per-instance
camera-driven selection, world-up-locked projection, depth/parallax behavior,
terrain-grounded pivots, and LOD integration before impostors can replace
chunked LOD1 on mobile.

Second follow-up: the groundwork is now executable. `npm run
probe:webgpu-impostor-lab` runs installed Chrome against the WebGPU diagnostic,
applies 12 lat/lon-hemi orbit selections to the node material, records a
parallel octahedral selector matrix, and writes
`cycle38-validation/runtime/webgpu-impostor-lab-proof.json` plus screenshots in
`cycle38-validation/screenshots/webgpu-impostor-lab/`. The proof is green, but
it intentionally reports `productionReady=false`; it proves tile-selection
plumbing, not production gameplay impostors.

Third follow-up: the explicit production route now uses a three-tier hybrid
instead of all-distance impostors or all-distance LOD1. With
`?konveyorNativeTreeImpostors=1`, near trees stay as LOD0 geometry, mid trees
use branch-preserving LOD1 geometry, and far trees use lat/lon-hemi Kiln
impostor quads with per-instance camera-driven tile offsets/weights and
world-up billboard matrix sync. This is production-integrated tree impostor
plumbing, but it is still not true octahedral impostoring because the committed
sidecars remain 4x4 lat/lon hemi-y and shader-side projection/depth/parallax
parity is still incomplete.

The visual fixes are specific:

- The black/no-texture impostor read was a WebGPU relighting/tint floor bug, not
  missing atlas data. The Kiln node material now keeps foliage albedo visible in
  shadow through an evergreen lighting floor and ambient tint clamp.
- The rejected middle LOD read came from over-sparse leaf simplification. The
  mobile tree budget bake now preserves more branches in LOD1 and avoids writing
  simplified intermediates back into `_originals`. Current evidence is
  `cycle38-validation/assets/mobile-tree-budget-bake.json`.
- Sibling repo review supported a hybrid tree representation. TIJ vegetation
  notes favor close mesh LODs or trunk/branch geometry plus impostor canopy when
  pure impostors read poorly, and Pixel Forge vegetation notes reinforce
  base-color/normal impostor sidecars with runtime relighting.

Current proof:

- Desktop installed-Chrome WebGPU:
  `cycle38-validation/runtime/desktop-webgpu-tree-impostors-three-tier-matrix.json`
  passed with nonblank screenshots in
  `cycle38-validation/screenshots/desktop-webgpu-tree-impostors-three-tier-matrix/`.
- Connected Android:
  `cycle38-validation/runtime/android-webgpu-tree-impostors-three-tier-tight-matrix.json`
  captured nonblank screenshots but is budget-red. Three full-scene rows fail
  the mid-mobile budget, with Open Country horizon/terrain-seam at
  `p95=100.0 ms` and `p99=133.5 ms`.

1. Add a spec that fails if WebGPU mobile selects `mobile-impostor-native` without
   a production dynamic-tile WebGPU material.
2. DONE: add a one-tree WebGPU impostor lab scene or probe that orbits the
   camera and records tile indices/weights per pose.
3. Port the WebGL Kiln view-direction tile selection into WebGPU in isolation.
4. Re-bake or validate sidecars after the current mobile tree budget GLBs settle.
5. Run Android WebGPU screenshots for follow-close, classic-max, tree-occluded,
   and horizon/terrain-seam poses before re-enabling impostors in production.
6. Keep Open Country on native LOD1 until the lab proves view-dependent tile
   selection, terrain grounding, and transition quality on the connected phone.

## Source Links

- [MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [MDN GPU.requestAdapter](https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter)
- [Chrome for Developers - WebGPU on Android in Chrome 121](https://developer.chrome.com/blog/new-in-webgpu-121)
- [Chrome for Developers - WebGPU compatibility mode in Chrome 146](https://developer.chrome.com/blog/new-in-webgpu-146)
- [Android Developers - Getting started with WebGPU](https://developer.android.com/develop/ui/views/graphics/webgpu/getting-started)
- [WebGPU optional features and limits](https://webgpufundamentals.org/webgpu/lessons/webgpu-limits-and-features.html)
- [WebGPU explainer](https://gpuweb.github.io/gpuweb/explainer/)
- [Three.js WebGPURenderer docs](https://threejs.org/docs/pages/WebGPURenderer.html)
- [Three.js TSL docs](https://threejs.org/docs/pages/TSL.html)
- [WebGPU render bundle best practices](https://toji.dev/webgpu-best-practices/render-bundles.html)
- [WebGPU indirect draw best practices](https://toji.dev/webgpu-best-practices/indirect-draws.html)
- [Khronos EXT_mesh_gpu_instancing](https://wallabyway.github.io/Khronos-glTF-repo-GHPages-test/extensions/2.0/Vendor/EXT_mesh_gpu_instancing/)
- [Unreal Engine Impostor Baker Plugin docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/impostor-baker-plugin-in-unreal-engine)
- [Unity BillboardAsset docs](https://docs.unity3d.com/2023.2/Documentation/ScriptReference/BillboardAsset.html)
- [Unity BillboardRenderer docs](https://docs.unity3d.com/2023.2/Documentation/Manual/class-BillboardRenderer.html)
- [Unity Asset Transformer SDK OctahedralImpostor](https://docs.unity.com/en-us/asset-transformer-sdk/2026.1/api/csharp/algo_octahedralimpostor)
- [SpeedTree billboards documentation](https://docs.speedtree.com/doku.php?id=compiler_billboards)
- [Amplify Impostors manual](https://wiki.amplify.pt/index.php?title=Unity_Products%3AAmplify_Impostors%2FManual)
- [Godot Octahedral Impostors](https://github.com/wojtekpil/Godot-Octahedral-Impostors)
- [Three.js forum - A forest of octahedral impostors](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735)
- [Ryan Brucks ShaderBits Octahedral Impostors](https://shaderbits.com/blog/octahedral-impostors)
- [ictusbrucks/ImpostorBaker](https://github.com/ictusbrucks/ImpostorBaker)
- [agargaro/instanced-mesh](https://github.com/agargaro/instanced-mesh)
- [agargaro/octahedral-impostor](https://github.com/agargaro/octahedral-impostor)
- [Three.js Blocks ComputeInstanceCulling](https://www.threejs-blocks.com/docs/ComputeInstanceCulling)
