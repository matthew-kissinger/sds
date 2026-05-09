# Cycle 22 — stylized tree implementation research

> Compiled 2026-05-05 by a research agent during the Cycle 21 close pivot. 6-game survey: Tiny Glade, Sable, A Short Hike, Lil Gator Game, Among Trees, Townscaper. Cycle 22's autonomous agent should read this BEFORE Phase A to anchor the implementation choices.

## Headline finding

**Zero of the 6 reference indie games use impostors.** Sable, A Short Hike, Lil Gator, Among Trees, Townscaper — all single-mesh-no-LOD or 2-tier mesh LOD. Tiny Glade ray-marches volumetric SDFs (architecture-level technique, not portable). The "halo / detached-shadow / sampling-glint / color-mismatch" failure modes Cycle 21 was fighting are problems **none of them have because none of them ship impostors**.

At stylized poly counts (under ~1500 tris per tree LOD0, a few hundred per LOD1), an instanced mesh is *cheaper than the impostor* once you factor the bake pipeline + atlas streaming + parallax/lighting matching + the eternal "why doesn't impostor match LOD0" maintenance tax.

## Per-game implementation summary

### Sable (Shedworks, 2021) — Unity URP

**Closest reference for SDS.** Same camera-pitch range (overhead glide cam included), same flat-shaded aesthetic, same need for visual hold from 26° follow up to overhead cinema.

- **Tree handling:** Single low-poly mesh per tree. **No LOD chain at all.** Kythreotis (creative director, GDC 2022 talk) explicitly says they leaned on art-driven simplification, not tech-driven LOD.
- **Outline fade:** Inverted-hull pass (stretch normals, flip culling — anime cel idiom). Outlines have a per-vertex `fadeOpacity` driven by camera distance so they melt out into mid-range. **This single trick is what makes Sable's distance-pop invisible.**
- **Fog (load-bearing):** Per-biome customizable. Linear fog on near-mid, denser exponential further out, **two-color (near/far)** so it warms toward the horizon and cools in the foreground. Atmospheric perspective in shader code, not a post-process.

**Shader pseudocode:**
```glsl
float fogFactor = saturate((dist - fogStart) / (fogEnd - fogStart));
vec3 fogCol = mix(fogNearColor, fogFarColor, fogFactor);
finalColor = mix(albedo, fogCol, fogFactor);
outlineAlpha *= 1.0 - smoothstep(outlineFadeStart, outlineFadeEnd, dist);
```

Translates cleanly to Three.js: `FogExp2` + `onBeforeCompile` to inject near/far gradient in `fog_fragment` chunk. Inverted-hull outline as a second draw with `side: BackSide`.

### Among Trees (FJRD Interactive, 2020) — Unity built-in

- **Leaf shader** (well-documented on 80lv / halisavakis): 3 perpendicular textured planes per branch end forming a volumetric leaf-puff. Per-quad sine wind, UV-panned noise for jitter, fake SSS via view-light alignment, no back-face cull.
- **Distance:** Same shader at all distances. LOD groups swap in lower-cluster-count meshes. **No impostors.**
- **Custom 3-color image-effect fog** (near color, far color, density curve) drives atmospheric perspective without per-shader work.

### Tiny Glade (Pounce Light, 2024) — custom Rust + Vulkan

- **Trees:** Ray-marched volumetric SDF. NOT geometry, NOT billboards. Low-frequency 3D-noise-modulated SDF sphere field with soft falloff and density-based alpha. Shadows are computed in the same march (which is why they always look attached).
- **Why this isn't your answer:** The architecture *is* the look. Writing an SDF tree fragment shader in Three.js is feasible but you'd be writing Tiny Glade's renderer to get Tiny Glade's trees. Out of scope.

### A Short Hike, Lil Gator Game

Sub-200-tri to ~1500-tri low-poly meshes, single LOD, baked vertex-color shading, vertex-shader sine wind. Linear fog. **No impostors.** Lil Gator explicitly inspired by A Short Hike per dev interview.

### Townscaper (Stålberg, 2020)

Trees aren't a feature here. Not a useful forest-scale reference.

## Consensus pattern (one line)

**Single low-poly mesh (or two-tier meshLOD), drawn instanced, killed by aggressive exponential fog tuned per-scene, with a flat-shaded or toon material. No impostors. Outlines and fog do the heavy lifting that LOD chains do in AAA.**

## Three.js code recipe (50 lines, zero impostor pipeline)

```js
// 1. Fog. Exponential squared, color-shifted toward sky horizon.
scene.fog = new THREE.FogExp2(0xb8c8d6, 0.012);  // density tunable per scene
scene.background = new THREE.Color(0xcfd8df);    // matches fog far-color

// 2. Material. MeshLambertMaterial with flatShading is the consensus pick:
//    - lit (unlike Basic), per-vertex (unlike Standard) so cheap and stylized
//    - flatShading produces the faceted Townscaper/Tiny Glade silhouettes
const trunkMat = new THREE.MeshLambertMaterial({
  color: 0x6b4a2b, flatShading: true,
});
const leafMat = new THREE.MeshLambertMaterial({
  color: 0x4d6b3a,
  flatShading: true,
  // Sable-style two-color fog + distance desat injected via shader chunks:
  onBeforeCompile: (s) => {
    s.uniforms.uFogNear = { value: new THREE.Color(0xa8b896) };
    s.uniforms.uFogFar  = { value: new THREE.Color(0xb8c8d6) };
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>',
        '#include <common>\nuniform vec3 uFogNear; uniform vec3 uFogFar;')
      .replace('#include <fog_fragment>', `
        #ifdef USE_FOG
          float fogFactor = 1.0 - exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);
          vec3 fogCol = mix(uFogNear, uFogFar, smoothstep(0.0, 0.6, fogFactor));
          // distance desaturation — atmospheric perspective in 3 lines
          float lum = dot(gl_FragColor.rgb, vec3(0.299,0.587,0.114));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(lum), fogFactor*0.35);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, fogFactor);
        #endif`);
  }
});

// 3. Geometry — single LOD0 mesh (under 1.5k tris) per species, instanced.
//    Optional Tier 2 mesh at ~300 tris swapped in beyond ~80m via simple
//    distance check; no cross-fade needed if fog density is tuned so trees
//    fade to within 5% of fog color before LOD swap.
const trees = new THREE.InstancedMesh(treeGeom, leafMat, count);
trees.castShadow = true;     // cast at all distances — cheaper than fading
trees.receiveShadow = false; // leaf-on-leaf shadow rarely worth it stylistically

// 4. Sun light shadow camera tightened (the cinema-overhead camera is the
//    bug-magnet — keep shadow far ≤120m so off-screen distant trees don't
//    cast garbage shadows even if their mesh is in the LOD2 band).
sun.shadow.camera.far = 120;
sun.shadow.mapSize.set(2048, 2048);
```

## Implications for Cycle 22 plan revision

The current `docs/cycle-22-plan.md` already targets meshopt-baked LOD1 (Phase A) + alphaHash crossfade (Phase B) + atmospheric desat (Phase C) + grass perf (Phase D). Research validates all four as correct direction. Two refinements the autonomous agent should consider:

1. **Phase C should adopt Sable's two-color fog gradient pattern**, not just luma desaturation. Add `uFogNear` and `uFogFar` uniforms to scene preset bindings; the desat patch then mixes:
   - First toward grayscale (atmospheric saturation falloff)
   - Then toward the position-interpolated `mix(uFogNear, uFogFar, smoothstep(0, 0.6, fogFactor))`
   
   This is qualitatively different from a single-color fog — gives the warmer-foreground / cooler-distance effect that reads as depth.

2. **Phase A's LOD swap distance can be aggressive** (LOD1 swap at 80m, impostor swap at 200m as planned) **but if Phase C's fog is tuned to fade trees to within 5% of fog color by ~150m, the impostor tier may be unnecessary entirely**. Flag this for Phase F verification: if v1.3.0 ships with sufficient fog, Cycle 23 can delete the kiln-impostor pipeline outright. The autonomous agent should NOT delete it in Cycle 22 — that's a separate scope decision — but should verify whether the LOD2 impostor tier is even visible after Phase C lands.

3. **Sun shadow camera frustum tightening** is a free win. `sun.shadow.camera.far = 120` (currently default ~1000?) reduces shadow map cost and keeps off-screen distant trees out of the shadow render entirely. Adds as a Phase A or D side-effect — single line in `js/SceneManager.js` or wherever the directional light is configured.

## Sources

- Rendering Tiny Glades With Entirely Too Much Ray Marching (GPC 2024) — youtube.com/watch?v=jusWW2pPnA0
- How Shedworks crafts Sable with a modular design approach (Unity)
- The Art of Sable: Imperfection, Limitation and Worldbuilding (GDC Vault 2022)
- Crafting A Tiny Open World: A Short Hike Postmortem (GDC 2020)
- Stylized Nature: Vegetation, Animation, Shaders (80.lv) — Among Trees breakdown
- My take on shaders: Stylized tree leaves — Harry Alisavakis
- Creating fluffy trees with Three.js — douges.dev
- Three.js Fog Hacks — Sneha Belkhale
- A forest of octahedral impostors (three.js forum, counter-position)
