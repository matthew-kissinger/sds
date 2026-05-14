# Cycle 36 WebGPU Hero-Scene Blocker

Captured 2026-05-14 for Cycle 36 Phase 4.

## Question

Can Cycle 36 open the smallest `?renderer=webgpu&scene=rolling-hills` hero path
after the perf and runtime gates are repaired?

## Result

No. The smallest honest Rolling Hills WebGPU path requires a broad shader port,
which is a Cycle 36 hard stop.

## Evidence

Current default renderer construction is still direct WebGL:

- `js/SceneManager.js` constructs `THREE.WebGLRenderer`.

Rolling Hills and default scene rendering depend on custom GLSL shader surfaces:

- `js/TerrainBuilder.js` uses `THREE.ShaderMaterial` for terrain.
- `js/GrassSystem.js` uses `THREE.ShaderMaterial` for grass and
  `onBeforeCompile` for meadow material patching.
- `js/water/AnimeWater.js` uses `THREE.ShaderMaterial` for water.
- `js/atmosphere/HosekWilkieSky.js` uses `THREE.ShaderMaterial` for sky.
- `js/atmosphere/CloudLayer.js` uses `THREE.ShaderMaterial` for clouds.
- `js/effects/SunBillboard.js` uses `THREE.ShaderMaterial`.
- `js/kiln-impostor-material.js` uses custom `THREE.ShaderMaterial` impostor
  shading.
- `js/OptimizedSheep.js` uses `THREE.ShaderMaterial`.
- `js/world/shaderPatches.js`, `js/shaders/HeightFogPatch.js`, and
  `js/shaders/OccluderFadePatch.js` patch materials through `onBeforeCompile`.

Three's WebGPU path is available in the package, but the official migration
surface points away from existing GLSL `ShaderMaterial`/`onBeforeCompile`
patches and toward WebGPU-compatible node/TSL material work. Porting terrain,
grass, water, sky, clouds, impostors, sheep, and shader patches is exactly the
kind of broad renderer rewrite Cycle 36 forbids.

## Decision

Do not add a WebGPU renderer boot path in Cycle 36. WebGL stays default, and no
renderer imports or boot code are changed for Phase 4.

The next WebGPU cycle should start with a deliberately tiny TSL material island
or a throwaway diagnostic scene, not Rolling Hills production rendering.
