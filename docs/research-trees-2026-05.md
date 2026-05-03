# Tree Rendering Research — May 2026

> Research dossier for Cycle 14 Phase 3 (tree replacement). Compiled 2026-05-02. Cold-start agents picking up tree work: read this first, then the recommended-path section, then visit the cited reference repos before writing code.

## Problem statement (from Matt, 2026-05-02)

Current trees are low-poly stylized GLBs (`tree1`, `tree2`, `pine`) with billboard impostors past 250m. Goal: replace with assets/techniques that read as more cinematic — Studio Ghibli / cozy-game feel — without tanking perf on RTX 3070 desktop or mid-tier mobile. 1000+ sheep boids run simultaneously; trees can't get expensive.

## Free/CC0 stylized tree GLB libraries

- **[Quaternius — Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html)** (CC0, FBX/OBJ/glTF). 60+ assets w/ trees, normal maps, seamless textures. Best single source for Ghibli-ish low-poly. Mirror: [poly.pizza/bundle/Ultimate-Stylized-Nature-Pack](https://poly.pizza/bundle/Ultimate-Stylized-Nature-Pack-zyIyYd9yGr)
- **[Quaternius — Stylized Tree Pack](https://quaternius.com/packs/stylizedtree.html)** (CC0, "Animal Crossing" feel).
- **[Quaternius — 150+ LowPoly Nature Models](https://quaternius.itch.io/150-lowpoly-nature-models)** (CC0). Drop-in replacements for current low-poly trees.
- **[Kenney — Nature Kit](https://kenney.nl/assets/nature-kit)** (CC0, 330 OBJ models — convert to GLB).
- **[Poly Pizza](https://poly.pizza/search/tree)** aggregator (CC0/CC-BY filterable, GLB direct download).

## Leaf shader techniques (Ghibli/Genshin direction)

The dominant 2024-2026 approach is **camera-stretched billboard quads with UV-driven vertex displacement** (not pure billboards, not full geo). Each leaf cluster is a small mesh of quads, UVs `[0,1]` are remapped to `[-1,1]` and used in the vertex shader to push corners outward in view space — gives "fluffy" silhouette from any angle without per-leaf billboarding cost. Uses `MeshStandardMaterial` + `alphaTest` (no blending = no sort cost).

Reference implementations:

- **[douges.dev "Fluffy Trees"](https://douges.dev/blog/threejs-trees-1)** — Three.js / R3F implementation w/ CustomShaderMaterial. **Directly translatable to our stack.**
- **[adcimon/stylized-foliage](https://github.com/adcimon/stylized-foliage)** — open-source quad-billboard foliage shader w/ ramp + alpha textures.
- **[Codrops "Fractals to Forests" (Jan 2025)](https://tympanus.net/codrops/2025/01/27/fractals-to-forests-creating-realistic-3d-trees-with-three-js/)** — covers cross-quad leaves (two perpendicular quads per cluster), the standard Genshin/BotW trick.

Genshin's **"fake SSS"** = a second light ramp on the shadow side; cheap and very stylized. Avoid actual SSS.

## GPU-driven instancing libraries

- **[`@three.ez/instanced-mesh` v0.3.11](https://www.npmjs.com/package/@three.ez/instanced-mesh)** ([repo](https://github.com/agargaro/instanced-mesh)) — drop-in InstancedMesh replacement w/ per-instance frustum culling, BVH raycasting, sorting, LOD, visibility. Exactly what our forest needs; **LOD support means we can register the existing 3-quad impostor as the far LOD on the same instanced mesh** (kills the 250m hand-off seam, reuses kdbush colliders).
- **[Three.js BatchedMesh](https://threejs.org/docs/pages/BatchedMesh.html)** (core, r150+) — better when there are many *different* geometries sharing one material. For 2-3 tree models per scene, InstancedMesh-per-model still wins.
- **[`@three.ez/batched-mesh-extensions`](https://www.npmjs.com/package/@three.ez/batched-mesh-extensions)** if going BatchedMesh route.

## Procedural tree generation

- **[EZ-Tree v1.1.0](https://eztree.dev)** ([`@dgreenheck/ez-tree`, MIT](https://github.com/dgreenheck/ez-tree)) — Three.js-native, GLB export, dozens of parameters. Run once at build-time, ship the GLBs.
- **[proctree.js + Don McCurdy's glTF wrapper](https://gltf-trees.donmccurdy.com/)** (older, still works).
- **[FloraSynth](https://discourse.threejs.org/t/florasynth-procedural-tree-generator/58740)** — free web tool, GLB export.

For our stylized target, EZ-Tree's output is more "realistic-procedural" than Ghibli. **Recommend Quaternius GLBs + custom leaf shader over procedural.**

## Wind on leaves (standard pattern)

Used in EZ-Tree, douges, Codrops — port to our shader:

```glsl
float wo = 6.28 * simplex3(worldPos / uWindScale);
vec3 sway = uv.y * uWindStrength * (
  0.5*sin(uTime*uFreq + wo) +
  0.3*sin(2.0*uTime*uFreq + 1.3*wo) +
  0.2*sin(5.0*uTime*uFreq + 1.5*wo));
```

Key tricks:
- Weight by `uv.y` (or vertex color R) so trunk stays still, leaves move most.
- Combine 2-3 sine octaves for organic motion.
- Offset in *world space* so wind direction is camera-stable.
- **Vertex colors painted in Blender give per-tree weight masks for free** — paint trunk red=0, leaves red=1.

Reference: [renanbomtempo/polygon-wind](https://github.com/RenanBomtempo/polygon-wind) — Unity, shader directly portable.

## Recommended path for SDS

1. **Swap GLBs** → Quaternius Stylized Tree Pack (CC0, no attribution). Pick 3-4 hero trees that fit the cozy-game feel.
2. **Replace `InstancedMesh` calls** in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) with `@three.ez/instanced-mesh`; **register existing 3-quad impostor as LOD1** on the same instance pool — kills the 250m hand-off seam, reuses kdbush colliders.
3. **Author leaves as cross-quads in Blender**, paint trunk-vs-leaf weight into vertex color R.
4. **Add wind shader** above to the leaf material via `onBeforeCompile` patch. ~30 lines of GLSL, ~zero per-frame CPU.
5. **Optional: fake SSS** rim-on-shadow-side ramp for Ghibli pop.

## Mobile budget check

2 InstancedMesh draws (trunk + leaves) per tree species × 3 species = **6 draws total** for hundreds of trees. RTX 3070 will not notice. Mid-tier mobile should also be fine — the cost is in geometry density, not draw calls, and Quaternius models are budgeted accordingly.

## All sources

- [Quaternius Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html)
- [Quaternius Stylized Tree Pack](https://quaternius.com/packs/stylizedtree.html)
- [Quaternius 150+ LowPoly Nature](https://quaternius.itch.io/150-lowpoly-nature-models)
- [Kenney Nature Kit](https://kenney.nl/assets/nature-kit)
- [Poly Pizza](https://poly.pizza/search/tree)
- [@three.ez/instanced-mesh on npm](https://www.npmjs.com/package/@three.ez/instanced-mesh)
- [agargaro/instanced-mesh GitHub](https://github.com/agargaro/instanced-mesh)
- [Three.js BatchedMesh docs](https://threejs.org/docs/pages/BatchedMesh.html)
- [adcimon/stylized-foliage](https://github.com/adcimon/stylized-foliage)
- [douges.dev Fluffy Trees pt 1](https://douges.dev/blog/threejs-trees-1)
- [Codrops: Fractals to Forests (Jan 2025)](https://tympanus.net/codrops/2025/01/27/fractals-to-forests-creating-realistic-3d-trees-with-three-js/)
- [EZ-Tree on GitHub](https://github.com/dgreenheck/ez-tree)
- [glTF Procedural Trees (proctree.js)](https://gltf-trees.donmccurdy.com/)
- [FloraSynth thread](https://discourse.threejs.org/t/florasynth-procedural-tree-generator/58740)
- [polygon-wind shader (Unity, portable)](https://github.com/RenanBomtempo/polygon-wind)
- [80.lv Ghibli Stylized Shader UE5](https://80.lv/articles/ghibli-style-stylized-shader-made-in-unreal-engine-5)
