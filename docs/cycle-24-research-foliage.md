# Cycle 24 — Foliage rendering research (2026-05)

> Compiled 2026-05-05 after Cycle 23 close. Scope: state-of-the-art for large-scale foliage rendering targeting Three.js / browser, evaluated against the SDS stack (meshopt LOD0/1, kiln 4×4 lat-lon impostor LOD2, GrassSystem chunked clumps + Cycle 23 T4 procedural-meadow quad, occluder fade, per-uniform interactor array capped at 220).

## TL;DR for Cycle 24+ planning

1. **Don't rewrite the kiln stack yet.** It works; the right next step is *swap the lookup* (3-tile barycentric → already shipped) and *add padded-mip pre-filtering* if/when distance shimmer surfaces. The 2025-era "drop-in better" alternative for a Three.js codebase is **agargaro's `octahedral-impostor`** (Aug 2025), which already integrates with `@three.ez/instanced-mesh` and uses hemi-octahedral mapping — *not* lat-lon. Octahedral parametrization gives ~2× effective angular resolution vs lat-lon for the same tile count by avoiding pole oversampling. Worth a sandbox spike, *not* a forklift.
2. **RiLoD (EGSR 2025) is academically the new SOTA, but not browser-tractable in 2026.** Worth knowing about; not worth shipping.
3. **Grass render-texture trample is worth a Cycle 24 spike** — but only as a complementary layer to the existing uniform array, not a replacement. AC Shadows + Ghost of Yōtei both confirmed it as the AAA pattern.
4. **Procedural-noise meadow-quad (T4) is the right call for now.** WebP would beat it visually only at >300m view distances on hero shots; perf-wise, the noise bake is free.
5. **"Camera-to-dog occluder fade"** is **camera-occluder dither fade** in literature — well-established UE/Unity idiom (2018+). No Sekiro/Ghost academic paper. Refinements available: per-fragment instead of per-object, soft falloff, normal-aware dither — all of which we already do or are trivial extensions.

## Three deep-read items (priority ordered)

1. **agargaro/octahedral-impostor (GitHub, Aug 2025) + the `@three.ez/instanced-mesh` r3 release (Mar 2025).** Same author stack, mid-2025 ecosystem refresh. Demo: 200k trees on 3072×3072 terrain, integrated BVH frustum cull, hemi-octahedral with `useHemiOctahedron: true`. https://github.com/agargaro/octahedral-impostor + https://octahedral-impostor.vercel.app + https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735
2. **RiLoD: Reshadable Impostors with Level-of-Detail (Wu et al., EGSR 2025, CGF 70183).** The academic SOTA: stores compact geometric+material info from a few reference views, supports relighting under dynamic lights and *material edits* at runtime, smooth LOD transitions. Memory and compute cost not browser-tractable in 2026, but worth knowing about for the WebGPU inflection in 2-3 years. https://cuteloong.github.io/assets/files/rilod25.pdf
3. **Ghost of Yōtei tech deep dive (PlayStation Blog, Oct 2025).** GPU-compute-driven culling: 1M instances → ~60k drawn. **"Cut buffer"** for grass interaction (weapon sweeps render into a buffer; grass samples it to spawn particles + flatten). **Tessellation displacement buffer** for snow trampling — same render-texture pattern that applies to grass interaction. https://blog.playstation.com/2025/10/23/ghost-of-yotei-tech-deep-dive/
4. **(Bonus) AC Shadows GDC 2025 — Atmos system.** Each tree/bush/clump has its own skeleton + stiffness; foliage driven by fluid-sim wind. We can't afford skeletons per-tree at our scale, but the *direction-coherence* lesson is the same one Cycle 14 already encoded (world-space scrolling wind texture). https://advances.realtimerendering.com/s2025/content/Advances%202025%20-%20Raytracing%20the%20world%20of%20Assassin's%20Creed%20Shadows.pdf
5. **(Bonus) Codrops "False Earth" (Apr 2026) + the Nov 2025 forum post on multi-player interactive grass.** Both are WebGL/WebGPU references for trample-via-render-texture at 1M+ blades.

## Concrete techniques for Cycle 24+

| Technique | Effort | Value for SDS | Verdict |
|---|---|---|---|
| **Swap kiln lat-lon → agargaro hemi-octahedral** | M (1 cycle phase, sandbox + integration) | ~2× tile efficiency at same atlas size; same LOD3 stack | **Spike-worthy** — but only after confirming Cycle 23 v1.4 visual is shipped clean |
| **Add padded-mip pre-filtering to existing kiln atlas** | S (bake-script change only) | Kills distance shimmer without a runtime change | **Yes** — schedule when shimmer surfaces |
| **Grass render-texture trample (64×64 RGBA float)** | M (1 phase) | Removes 220-cap; complements existing uniform path | **Spike-worthy** for Cycle 24 — see open question below |
| **WebGPU/TSL grass migration (False Earth pattern)** | XL (2-3 cycles) | 1M+ blades, GPU-driven cull | **Defer** — InstancedMesh + clumping at our scene scale isn't the bottleneck |
| **RiLoD impostor replacement** | XXL (research project) | Relightable, material-editable LOD2 | **Defer** — not browser-tractable in 2026 |
| **EZ-Tree v1.1 trellis system** | S (re-bake) | Better structural variety in baked GLBs | Optional — only if Matt wants new tree silhouettes |
| **Per-tree skeleton + stiffness (AC Shadows pattern)** | XL | Way over budget at 200-500 trees × runtime sim | **Skip** |
| **GPU compute frustum cull** | L | Already have BVH; gains marginal at our N | **Skip** at current scale |

## Should the kiln stack be rewritten to a 2025-era technique?

**No, not in Cycle 24.** Reasons:

- The kiln pipeline is *already* on the same architectural tier as agargaro's library (custom impostor atlas + ShaderMaterial + InstancedMesh2). The delta is parametrization (lat-lon vs hemi-octahedral) and pre-filter strategy.
- Cycle 21 already added the 3-tile barycentric blend, half-Lambert wrap + hemi ambient + Schlick fresnel — those are the high-ROI shader pieces and they ported cleanly onto our existing tile lookup.
- Octahedral would add a sandbox cycle of bake-vs-bake A/B work to validate the swap is a clear win at our angle distribution (we render Classic at ~45° pitch + cinematic overhead — the lat-lon stack was tuned for those). Defer until we have a specific complaint that the pitch-tilt/atmospheric-desat path doesn't address.
- RiLoD-class techniques are not WebGL2-friendly (they assume compute + atomic-append + multiple G-buffer-style targets). Wait for WebGPU inflection.

**Action:** *Spike* (not adopt) octahedral-impostor in Cycle 24+ as a measurement-only branch. Compare apples-to-apples atlas size vs perceived distance fidelity at our 200m LOD2 cutoff. Decision goes in `docs/cycle-25-impostor-decision.md`.

## "Camera-to-dog occluder fade" — academic name and refinements

**Name in literature:** *camera-occluder dither fade* (or *foliage camera fade* in UE marketplace parlance). The technique is well-documented since at least 2018 (Mirza Beig "Camera Dither Fade"; UE marketplace "Fade Camera Occluders" 4.26+; Unity HDRP "dither opaque fade"). Final Fantasy XV is the canonical AAA case study cited for *not* having it (the game became famous for camera-vs-foliage frustration). UE5 ships a native version as a Material Function.

**No Sekiro / Ghost / BotW academic paper** specifically — these games use proprietary variants of the same idiom (FromSoftware uses an aggressive *full-mesh* dither; Sucker Punch uses per-vertex distance-from-camera fade; Nintendo BotW uses a hard cull at near-camera depth combined with depth-pre-pass).

**Refinements worth knowing:**

- **Soft falloff in capsule space** — instead of hash-discard at fixed `peakDiscard`, ramp `peakDiscard` smoothly with `smoothstep(radius*0.7, radius, dist)`. We already do something similar; current implementation is fine.
- **Normal-aware dither** — bias discard rate by `dot(N, viewDir)` so leaves seen edge-on dither faster than face-on. Cheap, ~2 lines in the shader.
- **Frame-coherent hash** — current hash is per-pixel-per-frame, which gives the visual sparkle. Some games (Death Stranding) use a *temporal-stable* hash (Halton/blue-noise sampled with a frame-locked seed) so the dither pattern is steadier. Plays better with TAA but we don't run TAA, so the current sparkle is fine.
- **Occluder-only path** (the right idiom name) **vs full screen-space depth peeling** (Hitman) — we're on the right idiom for our scope.

**Verdict:** the implementation is sound. Optional one-line refinement: add `dot(N, viewDir)` modulation to the discard threshold for slightly cleaner edge-on leaf fade. Not a Cycle 24 must-fix.

## Open question — render-texture trample: spike for Cycle 24?

**Recommendation: yes, scope as a 1-phase spike, but ship as *complement* not replacement.**

- The 220-cap is fine *today* (1500 sheep boids spatially partitioned to ≤220 nearest = the visual horizon). It will bite if MP scaling pushes >220 dynamic interactors near a chunk.
- The Cycle 22 grass-research doc (`docs/research-grass-2026-05.md`) already nominated 64×64 RGBA float render-texture as the modern path. Ghost of Yōtei (Oct 2025) and AC Shadows (Mar 2025) confirm this is now the AAA standard for grass+snow trample.
- Cost: ~1 phase. Architecture: CPU writes interactor positions+velocities into a 64×64 RGBA texture once per frame; vertex shader samples it via worldPos→UV, applies displacement + flatten + recovery. No GPU compute required (works in WebGL2).
- **Risk:** the hard-stop on `GrassSystem` clamps from Cycle 19 still applies — any new uniform / texture path needs to coexist with the existing per-tier preset.
- **Suggested phased rollout:** ship texture path *behind a feature flag*, A/B-test against current uniform array on the 4-tier matrix, measure perf delta, then switch default if win is unambiguous.

## Procedural-noise meadow-quad (T4) — right call?

**Yes, for now.** Breakdown points:

- **Visually breaks** when (a) the camera lingers at an oblique angle on a far chunk for >2s — repeating noise patterns get noticeable, (b) the scene has strong sun/shadow contrast that bakes into a pre-baked WebP would carry but a noise-only quad cannot, (c) view distance >300m where players see *many* meadow-quad chunks in a single frame and tile-repetition becomes a Moiré.
- **Performance-wise** it never breaks down — it's already a single PlaneGeometry per chunk; pre-baked WebP would *add* texture sampling cost without a perf win.
- **When to switch to baked WebP:** if/when a future scene has a >500m horizon (current max is 760m island, but the player rarely lingers at the outer ring). Until then, procedural is the right call.

## EZ-Tree v1.1 (Jan 2026) summary

- New: **trellis system with force-attraction for branch growth** + numeric-control editing.
- No new LOD/impostor/animation/leaf-shape APIs.
- Verdict: optional re-bake if Matt wants more structural variety in the silhouette. Not a Cycle 24 driver.

## InstancedMesh2 r3 (Mar 2025) summary

- Significant API changes; simplified uniform management.
- Same author shipped `octahedral-impostor` (Aug 2025) and `batched-mesh-extensions`.
- Our codebase pinned to `@three.ez/instanced-mesh@0.3.15` (per Cycle 22 BatchedMesh research). r3 upgrade is a separate spike — not blocking.

## Sources

- [agargaro/octahedral-impostor (GitHub, Aug 2025)](https://github.com/agargaro/octahedral-impostor)
- [Three.js forum — A forest of octahedral impostors (Aug 2025)](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735)
- [@three.ez/instanced-mesh (npm)](https://www.npmjs.com/package/@three.ez/instanced-mesh)
- [RiLoD — Reshadable Impostors w/ LOD (Wu et al., EGSR 2025)](https://cuteloong.github.io/assets/files/rilod25.pdf) · [CGF DOI 10.1111/cgf.70183](https://onlinelibrary.wiley.com/doi/10.1111/cgf.70183)
- [Ghost of Yōtei tech deep dive (PlayStation Blog, Oct 2025)](https://blog.playstation.com/2025/10/23/ghost-of-yotei-tech-deep-dive/)
- [AC Shadows ray tracing — SIGGRAPH 2025](https://advances.realtimerendering.com/s2025/content/Advances%202025%20-%20Raytracing%20the%20world%20of%20Assassin's%20Creed%20Shadows.pdf) · [80.lv breakdown](https://80.lv/articles/gdc-2025-talk-rendering-assassin-s-creed-shadows)
- [Tiago Sousa — Fast as Hell: idTech 8 GI, SIGGRAPH 2025](https://advances.realtimerendering.com/s2025/content/SOUSA_SIGGRAPH_2025_Final.pdf) (DOOM TDA — GI, not foliage, but worth a read for the broader real-time stack)
- [Codrops — False Earth (Apr 2026)](https://tympanus.net/codrops/2026/04/21/false-earth-from-webgl-limits-to-a-webgpu-driven-world/) · [GitHub momentchan/false-earth](https://github.com/momentchan/false-earth)
- [Codrops — Fluffiest Grass (Feb 2025)](https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/)
- [Three.js forum — Interactive Grass Multi-Player (Nov 2025)](https://discourse.threejs.org/t/interactive-grass-with-multi-player-physics-and-wind-fps-friendly-and-suitable-for-games/87994)
- [GDC Vault — Procedural Grass in Ghost of Tsushima (Wohllaib)](https://gdcvault.com/play/1027033/Advanced-Graphics-Summit-Procedural-Grass)
- [EZ-Tree v1.1.0 release (Jan 2026)](https://github.com/dgreenheck/ez-tree/releases) · [npm](https://www.npmjs.com/package/@dgreenheck/ez-tree)
- [Mirza Beig — Camera Dither Fade tutorial](http://www.mirzabeig.com/tutorials/camera-dither-fade/)
- [UE marketplace — Fade Camera Occluders (4.26+)](https://www.fab.com/listings/897d4a71-fb59-4661-8fcd-c7f6f835cab6)
- [World of Zero — Trampling in Compute Shaders](https://worldofzero.com/videos/simulating-grass-physics-and-trampling-in-compute-shaders/)
