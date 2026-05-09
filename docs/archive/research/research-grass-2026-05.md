# Grass Rendering Research — May 2026

> Research dossier for Cycle 14 Phase 2 (grass modernization). Compiled 2026-05-02 from a focused web survey. Cold-start agents picking up grass work: read this first, then the recommended-path section, then look at the cited reference repos before writing code.

## Problem statement (from Matt, 2026-05-02)

Current grass system in [`js/GrassSystem.js`](../js/GrassSystem.js) (1241 lines) renders InstancedMesh blade clumps with vertex-shader simplex noise wind. Wind reads as **jittery / not zen** — feels like an indie tech demo rather than a cinematic AAA browser game. Want smoother, more cinematic grass that holds together as a "field" rather than per-blade noise.

## Root cause of jitter

Single-octave high-amplitude noise sampled per-vertex per-frame. The 2024-2026 AAA stack (Ghost of Tsushima, False Earth) layers **three separate signals at different spatial/temporal scales** and applies them to different parts of the blade.

## The modern wind playbook

1. **Low-frequency sway** (~0.1-0.3 Hz, large wavelength) — bends the whole blade body.
2. **High-frequency flutter** (~2-4 Hz, small wavelength) — only the tip, low amplitude.
3. **Gust envelope** — a separate slow scrolling noise (or ridged/Worley) that **modulates the amplitude** of the other two, so the field "breathes" in waves instead of shaking uniformly. **This envelope is the single biggest "zen" lever**; treat it as a 0..1 mask scrolling across world-space at ~1-3 m/s in the wind direction.
4. Apply each signal to **Bézier control points** (cubic spine, t=0 root → t=1 tip), not flat vertex offsets. Push mid-points gently, tip aggressively, weighted by t² so the base stays anchored. Bezier-bending preserves blade length and avoids the rubber-band stretch that reads as cheap.
5. Sample wind from a **scrolling 2D Perlin/Simplex texture in world space** (Sucker Punch's GoT approach) so all blades and other foliage agree on direction — coherence across the field is what makes it cinematic vs noisy.

## Force-feedback / interactor pattern

Don't push blades sideways only — that reads as sliding. The AAA pattern:

1. Compute outward push vector `(bladePos.xz − interactor.xz)`, falloff `smoothstep(radius, 0, dist)`.
2. Weight by **t²** along the blade so the tip moves more than the base.
3. Add a **downward flatten** component (`pushY = −falloff * 0.6`) so blades compress under the sheep, not just splay.
4. Recovery: store last-touched-time per blade (or sample a "trample render-texture" written by interactors), use `smoothstep(0, recoveryTime, now − touched)` to ease back. **Critically damped spring** (`x += v*dt; v += (−k*x − c*v)*dt` with `c = 2*sqrt(k)`) is the curve that reads "zen" — no overshoot oscillation.
5. With ~1500 boids, write interactors into a small RGBA float texture (e.g. 64×64) instead of looping a uniform array — the current per-frame loop in `js/GrassSystem.js` doesn't scale.

## Color & lighting playbook

- **Tip gradient:** `mix(baseColor, tipColor, t)` where tipColor is ~30% brighter and slightly desaturated/yellower. Single biggest readability win.
- **Fake SSS:** `wrap = saturate(dot(N, L) * 0.5 + 0.5)` plus a **back-lit term** `pow(saturate(dot(V, −L)), 4) * tipColor * sssStrength` — gives the rim-lit halo that sells "thin translucent organic" at sunrise/sunset (matches the og-rh-sunset hero composition).
- **Curved shading normal across blade width** (False Earth): bend the normal across horizontal UV to fake a midrib without geometry. Removes the "flat polygon" tell.
- **AO from clump density:** darken the base by clump density / occlusion baked at spawn time. Blades feel rooted instead of floating.
- **View-dependent thickening:** scale blade width by `1 + (1 − abs(dot(V, bladeNormal))) * k` so edge-on blades don't vanish — the classic "grass disappears at the horizon" bug.

## GPU-driven / TSL alternatives

- **False Earth** (Codrops, Apr 2026) — the current reference for WebGPU grass: 1M+ blades, TSL compute shaders, indirect drawing, GPU culling via atomic-append into `visibleIndicesBuffer`. Repo: [github.com/momentchan/false-earth](https://github.com/momentchan/false-earth). Worth studying even if we stay on WebGL2 — the Bezier+gust math ports cleanly to a GLSL vertex shader.
- **Three.js TSL** ([wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)) compiles the same shader to WGSL+GLSL, so the migration path is incremental.
- **Codrops "Fluffiest Grass" (Feb 2025)** — pure WebGL2 InstancedMesh, 1M blades, frustum culling. Closest to current architecture: [tympanus.net/codrops/2025/02/04/...](https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/)

## Recommended path for SDS

The highest-ROI single change is replacing per-vertex simplex with a **world-space scrolling wind texture (or analytic gust envelope) modulating two octaves** applied along a Bezier spine. That alone moves grass from "noisy" to "cinematic" without changing the InstancedMesh architecture in [`js/GrassSystem.js`](../js/GrassSystem.js).

Order of operations for Cycle 14:

1. **Replace wind math** — drop simplex-per-vertex; add 2 octaves of sin/cos in world space + a Worley/ridged gust envelope. Keep current InstancedMesh + vertex shader; only the math changes.
2. **Switch to Bezier blade spine** — 4 control points, t² weighting on amplitude, fix base.
3. **Migrate interactor uniforms → render texture** — 64×64 float RGBA, write from CPU once per frame; sample in vertex shader. Removes the per-frame uniform loop bottleneck.
4. **Add critically-damped recovery** for trampling.
5. **Add fake-SSS back-lit term** for sunset hero readability.

## Reference repos to fork/study

- **`momentchan/false-earth`** — WebGPU/TSL, the most modern reference. Bezier + gust envelope + compute-driven interaction.
- **`2Retr0/GodotGrass`** — Ghost of Tsushima-inspired, per-blade GPU grass. Shader math is portable; read `grass.gdshader` for the wind/SSS structure.
- **GDC 2021 Wohllaib talk** ([gdcvault 1027033](https://gdcvault.com/play/1027033/Advanced-Graphics-Summit-Procedural-Grass)) — the canonical reference for tile-based GPU grass + wind-texture coherence; worth the 50 minutes.
- **Codrops "Fluffiest Grass" (2025)** — closest live WebGL2 codebase to ours; good A/B target.

## All sources

- [GDC Vault — Procedural Grass in Ghost of Tsushima (Wohllaib)](https://gdcvault.com/play/1027033/Advanced-Graphics-Summit-Procedural-Grass)
- [YouTube — Procedural Grass in Ghost of Tsushima](https://www.youtube.com/watch?v=Ibe1JBF5i5Y)
- [Codrops — False Earth: From WebGL Limits to a WebGPU-Driven World (Apr 2026)](https://tympanus.net/codrops/2026/04/21/false-earth-from-webgl-limits-to-a-webgpu-driven-world/)
- [GitHub — momentchan/false-earth](https://github.com/momentchan/false-earth)
- [Codrops — How to Make The Fluffiest Grass With Three.js (Feb 2025)](https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/)
- [Three.js forum — Interactive Grass with Multi-Player Physics and Wind (Nov 2025)](https://discourse.threejs.org/t/interactive-grass-with-multi-player-physics-and-wind-fps-friendly-and-suitable-for-games/87994)
- [GitHub — 2Retr0/GodotGrass (Ghost of Tsushima-inspired)](https://github.com/2Retr0/GodotGrass)
- [GitHub — harlan0103/Grass-Rendering-in-Modern-Game-Engine](https://github.com/harlan0103/Grass-Rendering-in-Modern-Game-Engine)
- [Haoran Liang — Grass Rendering in Game Engine (writeup)](https://haoranliang.com/grass-rendering)
- [Three.js Shading Language (TSL) wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- [Maxime Heckel — Field Guide to TSL and WebGPU](https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/)
- [Harry Alisavakis — Grass Shader Part II (interaction)](https://halisavakis.com/my-take-on-shaders-grass-shader-part-ii/)
- [NedMakesGames — Foliage Shader in URP Shader Graph (SSS/translucency)](https://nedmakesgames.medium.com/creating-a-foliage-shader-in-unity-urp-shader-graph-5854bf8dc4c2)
- [GPU Gems Ch.7 — Rendering Countless Blades of Waving Grass (NVIDIA)](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-7-rendering-countless-blades-waving-grass)
- [World of Zero — Simulating Grass Physics and Trampling in Compute Shaders](https://worldofzero.com/videos/simulating-grass-physics-and-trampling-in-compute-shaders/)
- [al-ro Grass Project (instanced two-sine baseline)](https://al-ro.github.io/projects/grass/)
