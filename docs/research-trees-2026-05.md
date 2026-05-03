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

> **Updated 2026-05-03 after a fresh research pass.** Original recommendation was Quaternius MegaKit GLBs. The pivot to EZ-Tree below is driven by three things that landed after the dossier first shipped: (a) [EZ-Tree v1.1.0](https://github.com/dgreenheck/ez-tree) (Jan 2026) is now an actively-maintained MIT NPM library with cross-quad leaves + built-in wind shader baked in; (b) Quaternius MegaKit's 60–70% free / 30–40% Patreon-gated split is friction we don't need; (c) procedural at build time gives per-tree-type tunability (gnarliness, branch angles, leaf size) without committing to a fixed authored silhouette. **For rocks, Quaternius remains the right call** — see [`research-rocks-and-scatter-2026-05.md`](research-rocks-and-scatter-2026-05.md). For details on the Dec-2025 [Procedural Instanced Forest](https://discourse.threejs.org/t/procedural-instanced-forest-high-performance-real-trees/88610) (the WebGPU/TSL alternative), see "Frontier alternatives" below — that's a Cycle 15+ candidate.

1. **Add EZ-Tree as a dev dependency** → `bun add -D @dgreenheck/ez-tree`. MIT. Cross-quad leaves + recursive procedural branching + built-in shader-based wind already implemented.
2. **Author `tools/bake-trees.mjs`** that generates 4–5 GLBs at build time using tuned EZ-Tree parameters: 2–3 broadleaf variants (replacing tree1, tree2), 1–2 conifer (replacing pine). Output to `assets/models/trees/`. Re-runnable so style adjustments don't require remembering one-off tweaks. Run before `npm run compress-glbs` so the existing GLB compression pipeline picks them up.
3. **Update `modelPaths.trees` paths** in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) to the new GLB filenames. Verify `userData.modelBaseYOffset` lands the GLB pivot on terrain.
4. **Replace `InstancedMesh` calls** with `@three.ez/instanced-mesh`; **register existing 3-quad impostor as LOD1** on the same instance pool — kills the 250m hand-off seam, reuses kdbush colliders.
5. **Leaf-wind shader** ✅ already shipped Cycle 14 Phase 3 partial — the `onBeforeCompile` patch on `_patchTreeWindMaterial` walks every child material, so EZ-Tree's output picks up the wind automatically the moment the new GLBs land. No extra shader code needed.
6. **Optional: fake-SSS rim-on-shadow-side ramp** for Ghibli pop. Would also be applied via `onBeforeCompile` on the leaf material, mirroring Phase 2's grass back-light.

## Why not Quaternius MegaKit (the original recommendation)?

Quaternius is hand-crafted Ghibli-leaning CC0 — visually very strong. The reasons to prefer EZ-Tree for trees specifically:

- **Patreon split.** "60–70% free in Standard, 30–40% in Pro/Source" means the free trees might not include the exact silhouettes we want. Picking the right hero trees risks bumping into paywalled assets.
- **No per-instance variation.** With Quaternius we ship N static silhouettes; every tree of type "tree1" looks identical. EZ-Tree generates a *family* per type by varying the seed, then we pick the best 1–2 within that family per type.
- **Re-bakability.** A future "make trees more gnarly" or "drop pine variant" decision is a parameter tweak + re-run, not a re-download + re-cherry-pick.
- **No external download in the repo's reproducibility chain.** Anyone cloning a fresh checkout can run `npm i && npm run bake-trees` and reproduce the trees. Quaternius assets would need to be committed (potentially large) or external-fetched at build (fragile).

For **rocks**, none of those arguments hold — chunky authored rock silhouettes are what makes them read as obstacles, hand-authoring beats procedural icosahedron+noise here, and Quaternius MegaKit's 27 free rocks plus shared atlas with mushrooms/sticks for the Phase 4 ScatterSystem make it a single coherent source.

## Frontier alternatives (Cycle 15+ candidates)

- **[Procedural Instanced Forest](https://discourse.threejs.org/t/procedural-instanced-forest-high-performance-real-trees/88610)** (red-reddington, Dec 2025) — L-system branching + 2 draw calls (bark cylinders + leaf quads) + vertex-shader LOD culling. Hits 2,800 trees in 8 draw calls at 60fps on mid-range desktop. WebGPU/TSL port already done. MIT. Demos on CodePen + integration in [pmmathias/birdybird](https://github.com/pmmathias/birdybird). The future-forward play once SDS does the WebGPU spike. Skipping for Cycle 14 because (a) it's a forum post + demos rather than a polished library — extraction work isn't trivial, and (b) the L-system look skews stylized-natural rather than Ghibli-cozy. Worth re-evaluating alongside the WebGPU migration.

## Mobile budget check

2 InstancedMesh draws (trunk + leaves) per tree species × 3 species = **6 draws total** for hundreds of trees. RTX 3070 will not notice. Mid-tier mobile should also be fine — the cost is in geometry density, not draw calls, and Quaternius models are budgeted accordingly.

## Decision history

- **2026-05-02 (initial):** Recommended Quaternius MegaKit + `@three.ez/instanced-mesh` LOD pool + `onBeforeCompile` leaf wind.
- **2026-05-03 (revised):** Pivoted trees to EZ-Tree v1.1.0 build-time generator after a follow-up research pass surfaced Quaternius's Patreon-gated split, EZ-Tree's MIT NPM availability with cross-quad leaves + wind already implemented, and the reproducibility win of procedural-at-build-time. Rocks stay on Quaternius. Conversation context: see Cycle 14 partial-close session notes.

## All sources

- [EZ-Tree on GitHub](https://github.com/dgreenheck/ez-tree) ⭐ **chosen for trees**
- [@dgreenheck/ez-tree on npm](https://www.npmjs.com/package/@dgreenheck/ez-tree)
- [Procedural Instanced Forest (three.js forum, Dec 2025)](https://discourse.threejs.org/t/procedural-instanced-forest-high-performance-real-trees/88610) — frontier Cycle 15+ candidate
- [pmmathias/birdybird](https://github.com/pmmathias/birdybird) — Procedural Instanced Forest integration
- [Codrops: Fractals to Forests (Jan 2025)](https://tympanus.net/codrops/2025/01/27/fractals-to-forests-creating-realistic-3d-trees-with-three-js/) — EZ-Tree technique writeup
- [Quaternius Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html) — alternative considered, kept for Phase 4 rocks
- [Quaternius Stylized Tree Pack](https://quaternius.com/packs/stylizedtree.html)
- [Quaternius 150+ LowPoly Nature](https://quaternius.itch.io/150-lowpoly-nature-models)
- [Kenney Nature Kit](https://kenney.nl/assets/nature-kit)
- [Poly Pizza](https://poly.pizza/search/tree)
- [@three.ez/instanced-mesh on npm](https://www.npmjs.com/package/@three.ez/instanced-mesh)
- [agargaro/instanced-mesh GitHub](https://github.com/agargaro/instanced-mesh)
- [Three.js BatchedMesh docs](https://threejs.org/docs/pages/BatchedMesh.html)
- [adcimon/stylized-foliage](https://github.com/adcimon/stylized-foliage)
- [douges.dev Fluffy Trees pt 1](https://douges.dev/blog/threejs-trees-1)
- [craftzdog/ghibli-style-shader](https://github.com/craftzdog/ghibli-style-shader)
- [glTF Procedural Trees (proctree.js)](https://gltf-trees.donmccurdy.com/)
- [FloraSynth thread](https://discourse.threejs.org/t/florasynth-procedural-tree-generator/58740)
- [polygon-wind shader (Unity, portable)](https://github.com/RenanBomtempo/polygon-wind)
- [80.lv Ghibli Stylized Shader UE5](https://80.lv/articles/ghibli-style-stylized-shader-made-in-unreal-engine-5)
