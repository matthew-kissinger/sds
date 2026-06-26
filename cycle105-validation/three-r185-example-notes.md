# Three r185 Example Adoption Notes

> Cycle 105 Phase 3 evidence. Branch: `codex/three-r185-upgrade`.

## Scope

- Upstream clone inspected: `examples/three-r185`
- Upstream tag inspected: `r185`
- Delta basis: `git -C examples/three-r185 diff --name-status r184..r185 -- examples`
- SDS rule: `examples/three-r185/` is research-only. SDS runtime source must not import from it.

## Adoption Matrix

| Upstream path | r185 pattern | Classification | SDS / Kiln decision |
| --- | --- | --- | --- |
| `examples/jsm/generators/TreeGenerator.js` | Deterministic seed-driven branch skeleton, tapered tube sweep, root flare, gnarl, golden-angle child distribution, no texture dependency. It emits branch geometry only. | `adapt in Kiln` | Use as a reference for Kiln tree-source candidates and SDS tree recipe principles, not as SDS runtime code. SDS production trees stay author-time GLBs with gallery review, compression, and impostor sidecars. If used, it needs a foliage/canopy stage and SDS material naming before candidate GLBs are compared. |
| `examples/jsm/generators/ForestGenerator.js` | Half-million cheap instanced canopy blobs in one draw call with altitude/slope/density masks and stochastic distance culling. | `reference only` | Useful for far-background forest massing, but not a replacement for SDS GLB trees or octahedral impostors. The blob silhouette is too generic for the current tree-quality complaint, and it would bypass the current source-GLB and impostor validation path. |
| `examples/jsm/generators/TerrainGenerator.js` | Baked height grid with deterministic seeded noise, optional thermal erosion, bilinear `sampleHeight`, `sampleSlope`, and textureless TSL altitude/slope material. | `reference only` | SDS terrain is tied to existing scene heightfields and shared placement contracts. Borrow the material idea for future WebGPU terrain shading or Kiln preview surfaces only after a scoped terrain-visual phase; do not replace SDS terrain generation in this cycle. |
| `examples/webgpu_generator_city.html` and `examples/jsm/generators/CityGenerator.js` | Seeded lot/block layout, generated sidewalks, one shared building material with shader-side palette hashing, procedural road markings. | `adapt in Kiln` | Good source material for Kiln's text-to-3D custom palettes and controlled building/city asset generation. It is not SDS runtime work because SDS is pastoral and has no city sim surface. The useful idea is parameterized authoring plus palette/material reuse, then export to GLB. |
| `examples/webgpu_generator_building.html` and `examples/jsm/generators/city/SkyscraperGenerator.js` | Single generated mesh per building, exposed seed/height/footprint/setback/window knobs, material palette helpers, disposal/rebuild loop. | `adapt in Kiln` | Use as a Kiln reference for game-ready building generation: stable seed, low material count, explicit knobs, and one rebuilt GLB candidate at a time. Do not add this dependency to SDS runtime. |
| `examples/jsm/generators/city/SidewalkGenerator.js` | Instanced/merged sidewalk slabs and curb bands from block placements, with procedural concrete/granite node materials. | `adapt in Kiln` | Useful for Kiln modular kit principles: generated modules should have stable dimensions, material reuse, and repeatable placement transforms. For SDS fence work, apply the same kit discipline to posts/rails/gate pieces rather than importing sidewalk code. |
| `examples/webgpu_lights_clustered.html` | Demo installs `renderer.lighting = new ClusteredLighting()` and drives many point lights through a clustered Forward+ path. | `defer` | SDS currently relies on ambient/directional/day-loop lighting and does not have many dynamic point lights. Clustered lighting is a future option for a night-town, farm-lantern, or Kiln preview scene with many local lights, but it should not enter the r185 dependency patch or asset rebake. |
| `examples/jsm/lighting/ClusteredLighting.js` | Replacement for removed tiled lighting; wraps a custom `ClusteredLightsNode` with max-light, tile-size, z-slice, and per-cluster light caps. | `defer` | Treat as the migration target if SDS ever needs many WebGPU point lights. No current SDS source imports `TiledLighting` or `TiledLightsNode`, so there is no immediate switch to make. |
| `examples/jsm/tsl/lighting/ClusteredLightsNode.js` | CPU-side light packing plus GPU compute cluster assignment; point lights without shadows go through clustered shading, other lights stay in the material light list. | `reference only` | Keep as a technical reference for future WebGPU lighting experiments. It adds compute, textures, and per-frame camera/light bookkeeping that SDS does not need for current scenes. |
| `examples/jsm/libs/meshopt_simplifier.module.js` | Browser-side meshoptimizer simplification/reorder WASM wrapper. | `adopt` | SDS already uses the npm `meshoptimizer` package in `tools/bake-tree-lod1.mjs`, `tools/bake-mobile-tree-budgets.mjs`, and GLB compression. Keep using the npm package, but apply the same simplification discipline to fence/tree/Kiln candidates before runtime integration. |
| `examples/jsm/libs/meshopt_clusterizer.module.js` | Meshlet/cluster bounds and clusterization support from meshoptimizer. | `defer` | Interesting for future WebGPU meshlet or occlusion work, but SDS has no meshlet renderer path. Not justified for fence/tree rebakes until a profiler points to mesh submission or culling that current instancing/impostors cannot solve. |
| `examples/jsm/utils/GeometryCompressionUtils.js` | Attribute packing utilities for normals, positions, and UVs. | `reference only` | SDS's GLB path already uses glTF Transform, Draco, Meshopt, and KTX2 where appropriate. Do not add custom attribute packing unless a specific asset budget cannot be met through the existing GLB tooling. |
| `examples/misc_exporter_gltf.html` | GLTFExporter path documents compressed texture/mesh export and Meshopt decoder setup. | `reference only` | Confirms SDS's loader/export posture: GLTFLoader needs Meshopt and Draco decoder setup for compressed assets. Current SDS already configures both in `TerrainBuilder.configureGLTFLoader()`. |
| `examples/webgpu_postprocessing_ssr_denoise.html` | WebGPU SSR pipeline with MRT color/depth/normal/velocity, temporal reprojection, recurrent denoise, and optional compare outputs. | `defer` | Too heavy for the current pastoral runtime and mobile budget. Useful only for a future water/reflection lab after SDS has a concrete reflective-surface need and a capture/perf gate. |
| `examples/jsm/tsl/display/TemporalReprojectNode.js` | History reprojection driven by depth, normals, velocity, variance clipping, and disocclusion handling. | `reference only` | Good architecture reference for any future temporal WebGPU effect, but not an upgrade target now. SDS should not add MRT velocity/history buffers to solve current tree/fence asset quality work. |
| `examples/jsm/tsl/display/RecurrentDenoiseNode.js` | Spatial + temporal denoise with depth/normal/roughness edge stopping and optional SSR ray-length or AO alpha interpretation. | `reference only` | Keep as a denoise reference. Current SDS visual issues are asset/source quality and tree LOD consistency, not noisy ray-traced effects. |
| `examples/jsm/tsl/display/SSRNode.js` | SSR node now supports history input for multi-bounce/reprojected reflections and integrates with denoise pipeline. | `defer` | Defer until a water/reflection cycle explicitly wants SSR. SDS's current sun/water work should keep using simpler, measured visual principles before adding SSR history feedback. |
| `examples/jsm/geometries/LoftGeometry.js` and `examples/webgpu_geometry_loft.html` | Profile-along-path geometry useful for rails, tubes, and swept architectural details. | `reference only` | Relevant to Kiln/fence authoring as a modeling principle for rails and posts, but SDS should rebake fence GLBs through the asset pipeline rather than generate fence geometry at runtime. |

## Recommendations

1. Keep the r185 dependency upgrade separate from asset rebakes. The new examples are not runtime imports for SDS.
2. For trees, improve source GLBs first. Use the r185 tree/forest examples as design references for deterministic variation, root/trunk silhouette, density masks, and far-mass readability, then run the existing SDS tree pipeline: gallery review, GLB metrics, compression, impostor rebake if the silhouette changes, and `tests/imposter-sidecar.spec.js`.
3. For Kiln, convert the city/building examples into authoring principles: stable seeds, constrained palette/material reuse, explicit parameter knobs, single-candidate rebuild loops, and GLB output with runtime budgets.
4. For fence, borrow the kit discipline from the city/sidewalk/building examples: stable dimensions, pivots, names, material reuse, and generated variants that are inspected before integration. Do not generate fences at runtime.
5. For meshopt, continue using the existing npm `meshoptimizer` and glTF Transform pipeline. Add fence/tree candidate reports that show triangle counts before and after simplification instead of importing Three's example meshopt WASM wrappers.
6. For clustered lighting and denoise, defer runtime adoption. They are valuable references, but SDS does not currently have the many-point-light or noisy-reflection problem they solve.

## Next Gated Work

- Phase 4 should inspect `assets/models/Fence_Kit-v1.0.0.glb` and define the Kiln fence budgets before any candidate bake.
- Phase 7 should compare tree source candidates against current GLB metrics and screenshots before touching the impostor baker.
- Any future clustered-lighting or SSR/denoise work needs a separate visual/perf phase with a concrete scene need.

## Verification

- `rg -n "examples/three-r185|three-r185" js package.json package-lock.json` shall return no runtime import or dependency hit.
- No `shared/`, `tests/sim-baseline`, or `tests/refactor-baseline` files are changed by this memo.
