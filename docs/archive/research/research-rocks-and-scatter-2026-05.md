# Rocks + Ground Scatter Research — May 2026

> Research dossier for Cycle 14 Phase 4 (rocks + scatter scenery). Compiled 2026-05-02. Cold-start agents picking up scatter work: read this first, then the recommended-path section.

## Problem statement (from Matt, 2026-05-02 + BACKLOG carry-forward)

Current rocks are stylized low-poly GLBs with manual cluster placement; flagged as "awkward" in playtest backlogs. BACKLOG already drafts "bespoke pixel-forge rock assets" as a deferred Q3 task — author wants 2-3 purpose-made rock GLBs at "obstacle-readable" sizes. Beyond that, the broader goal is **ground scatter**: pebbles, sticks, mushrooms, wildflowers, clover patches — the AAA "alive meadow" trick that lifts the polish toward AAA-browser-game feel.

## Free CC0 stylized rock + scatter packs (Ghibli/cozy fit)

- **[Quaternius — Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html)** (CC0). 110+ models including **27 hand-crafted rocks** plus trees/flowers/mushrooms/grass. Explicitly pitched as "Ghibli-inspired." Best single match for SDS. 60-70% of the kit is free; remainder is Patreon. Mirror: [quaternius.itch.io/stylized-nature-megakit](https://quaternius.itch.io/stylized-nature-megakit).
- **[Ultimate Stylized Nature Pack on Poly Pizza](https://poly.pizza/bundle/Ultimate-Stylized-Nature-Pack-zyIyYd9yGr)** (CC0 bundle, glTF). Larger superset, browseable per-model — useful for cherry-picking 2-3 hero rocks without taking the whole kit.
- **[Kenney — Nature Kit](https://kenney.nl/assets/nature-kit)** (CC0, OBJ + glTF via converter). 330 untextured/material-only rocks/trees/terrain — chunkier "Lego" silhouette, great for obstacle-readable rocks.
- **[Kay Lousberg — KayKit Forest Nature Pack](https://kaylousberg.itch.io/kaykit-forest)** (CC0, glTF). 1,588 models on a single gradient atlas (one texture, one draw-call-friendly material) — rocks, mushrooms, sticks, flowers all share the atlas. **Perfect for InstancedMesh scatter.**
- **[Poly Pizza](https://poly.pizza/)** as a meta-source for individual CC0 rocks if we want bespoke silhouettes without a full pack.

> Note: I could not find a "Pixel Forge" rock pack matching the BACKLOG note — likely a planned commission, not an existing CC0 pack.

## Procedural rock generation

No "RockGen.js" exists as a maintained library. Standard recipe in Three.js:

1. Start from `IcosahedronGeometry(radius, 2-3)` (rounder than box).
2. Displace each vertex along its normal by 3D simplex/Perlin noise (octaves 3, persistence 0.5, lacunarity 2.0).
3. Optional second pass: low-frequency, high-amplitude noise for asymmetric chunkiness; high-frequency low-amp for surface grit.
4. `geometry.computeVertexNormals()` for smooth, or `toNonIndexed()` + flat normals for facet look.

References:
- [Discourse: procedural rock generation](https://discourse.threejs.org/t/procedural-rock-generation/6107) — runnable rock-from-icosahedron code.
- [Clicktorelease: vertex-displacement-by-noise GLSL walkthrough](https://www.clicktorelease.com/blog/vertex-displacement-noise-3d-webgl-glsl-three-js/) — canonical write-up.
- [IceCreamYou/THREE.Terrain](https://github.com/IceCreamYou/THREE.Terrain) — noise primitives (Cosine, Diamond-Square, Perlin, Simplex, Worley) reusable for rock displacement.

For SDS, **generate 6-8 rock variants offline at build time** (export as GLBs), not per-frame — keeps collision/heightfield logic deterministic.

## Ground scatter pattern

The AAA technique is a two-layer system:
- **Gameplay obstacles** (current ~30 rocks)
- **Detail layer** (hundreds-to-thousands of non-collidable instances)

Pipeline:

1. **Sampling:** [`kchapelier/poisson-disk-sampling`](https://www.npmjs.com/package/poisson-disk-sampling) (npm, arbitrary-dim, ~40 LoC to integrate) for even distribution without clusters.
2. **Surface placement:** Three.js [`MeshSurfaceSampler`](https://threejs.org/docs/#examples/en/math/MeshSurfaceSampler) to project samples onto the terrain heightfield, with a weight function (e.g. grass-density texture) to bias toward meadows. Codrops walkthrough: [Surface Sampling in Three.js](https://tympanus.net/codrops/2021/08/31/surface-sampling-in-three-js/).
3. **Rendering:** one `InstancedMesh` per prop type (pebble, stick, mushroom, clover-tuft, dandelion). Reference: [webgl_instancing_scatter example](https://threejs.org/examples/webgl_instancing_scatter.html).

**Density rule of thumb** that reads as "alive" without noise: ~0.3-0.8 detail props per square meter in walkable areas, weighted ~70% pebbles/sticks (visual noise), ~20% small flora, ~10% "punctuation" (mushroom clusters, distinct flowers). Use Poisson radius ~0.4m so things never overlap. Cull beyond ~40m radius from camera.

## Shader detail for low-poly rocks

Three techniques stack for the "carved chunky" feel:

- **Normal smoothing toggle:** load GLBs with `geometry.computeVertexNormals()` for smooth, or set `material.flatShading = true` for facet — mix per rock type. ([forum discussion](https://discourse.threejs.org/t/how-to-set-flatshading-or-smooth-to-material-load-object-with-gltfloader/5207))
- **Fresnel rim light:** `pow(1.0 - dot(viewDir, normal), 2.0)` added to base color, tinted with sun color. Brightens silhouettes against grass — **the single biggest "AAA tell" for stylized rocks.** ([Three.js Roadmap tutorial](https://threejsroadmap.com/blog/rim-lighting-shader), [Frontend Masters reference](https://frontendmasters.com/courses/webgl-shaders/rim-lighting/))
- **Faux-AO via vertex color or world-Y darkening:** bake a darker tint into the bottom 30% of the rock in the GLB (vertex colors), or do it in-shader via `mix(rockColor, shadowColor, smoothstep(0.3, 0.0, worldY - rockBaseY))`. Sells the "buried in ground" read.
- **Toon ramp:** [Maya Ndljk's Three.js toon shader port](https://www.maya-ndljk.com/blog/threejs-basic-toon-shader) is the reference.

## Wildflower system

**Don't extend GrassSystem** — the timing/wind/LOD coupling will hurt. Use a sibling `ScatterSystem` keyed by prop type:

- Reuse the Poisson sample buffer that places pebbles; tag ~5-10% of points as "flower slots."
- Per slot, pick a flower variant from a small palette (3-4 GLBs — yellow dandelion, white clover patch, purple thistle, red poppy).
- One `InstancedMesh` per variant with shared low-poly geometry. Subtle wind sway in vertex shader (same `sin(time + worldPos.x)` trick as grass, lower amplitude).
- **"Yellow patches" effect:** on a subset of Poisson points, oversample 5-8 dandelions in a 1.5m radius — gives the eye anchor clusters Ghibli meadows lean on.

## Reference implementations to study

- **[fromtheghost/ghibli-grass](https://github.com/fromtheghost/ghibli-grass)** — small, readable Three.js demo with scattering + wind shader exactly in SDS's aesthetic. Live: [ghibli-grass.vercel.app](https://ghibli-grass.vercel.app/).
- **[craftzdog/ghibli-style-shader](https://github.com/craftzdog/ghibli-style-shader)** — Ghibli-styled lighting/material example for Three.js. Best reference for the rim-light + toon-ramp combo on rocks.
- **[Codrops "Fluffiest Grass with Three.js" (Feb 2025)](https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/)** — modern article covering MeshSurfaceSampler + InstancedMesh + wind, with full source.
- **[Smyth Design "BotW-style grass in Three.js"](https://smythdesign.com/blog/stylized-grass-webgl/)** — write-up with shader code for a stylized cozy-meadow look that pairs naturally with a scatter layer.

## Recommended path for SDS

1. **Pull 4-6 rocks** from Quaternius Stylized Nature MegaKit as drop-in replacements for current GLBs (CC0, attribution-free, glTF native — fits cluster placement code in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) with zero loader changes).
2. **Add `js/ScatterSystem.js`** mirroring the GrassSystem instancing pattern; feed it a Poisson sample on the heightfield, render 4-5 prop variants via `InstancedMesh`. Cap at ~2k instances total.
3. **Add 12 lines of rim-light + base-darken** to the existing rock material (or wrap with `onBeforeCompile`) — biggest visual lift for the smallest diff.
4. **Defer custom procedural rock GLBs** to a future cycle as already planned; the MegaKit gets us 80% of the polish lift now.

## All sources

- [Quaternius Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html)
- [Quaternius MegaKit on itch.io](https://quaternius.itch.io/stylized-nature-megakit)
- [Ultimate Stylized Nature Pack on Poly Pizza](https://poly.pizza/bundle/Ultimate-Stylized-Nature-Pack-zyIyYd9yGr)
- [Kenney Nature Kit](https://kenney.nl/assets/nature-kit)
- [KayKit Forest Nature Pack](https://kaylousberg.itch.io/kaykit-forest)
- [Three.js forum: procedural rock generation](https://discourse.threejs.org/t/procedural-rock-generation/6107)
- [Clicktorelease: vertex displacement noise GLSL](https://www.clicktorelease.com/blog/vertex-displacement-noise-3d-webgl-glsl-three-js/)
- [IceCreamYou/THREE.Terrain](https://github.com/IceCreamYou/THREE.Terrain)
- [poisson-disk-sampling on npm](https://www.npmjs.com/package/poisson-disk-sampling)
- [Three.js MeshSurfaceSampler example](https://threejs.org/examples/webgl_instancing_scatter.html)
- [Codrops: Surface Sampling in Three.js](https://tympanus.net/codrops/2021/08/31/surface-sampling-in-three-js/)
- [Maya Ndljk: Three.js toon shader](https://www.maya-ndljk.com/blog/threejs-basic-toon-shader)
- [Three.js Roadmap: rim lighting shader](https://threejsroadmap.com/blog/rim-lighting-shader)
- [Frontend Masters: Rim Lighting in WebGL](https://frontendmasters.com/courses/webgl-shaders/rim-lighting/)
- [Three.js forum: flatShading vs smooth on GLTFLoader](https://discourse.threejs.org/t/how-to-set-flatshading-or-smooth-to-material-load-object-with-gltfloader/5207)
- [Three.js forum: Fluffy Tree anime-style](https://discourse.threejs.org/t/fluffy-tree-anime-style/86626)
- [fromtheghost/ghibli-grass](https://github.com/fromtheghost/ghibli-grass)
- [craftzdog/ghibli-style-shader](https://github.com/craftzdog/ghibli-style-shader)
- [Codrops: Fluffiest Grass with Three.js (2025)](https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/)
- [Smyth Design: BotW-style grass in Three.js](https://smythdesign.com/blog/stylized-grass-webgl/)
