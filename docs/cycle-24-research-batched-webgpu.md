# Cycle 24 — BatchedMesh + WebGPU/TSL re-scoping research

**Document Status:** Research report | **Date:** 2026-05-05 | **Scope:** Three.js r184 baseline, web survey through May 2026 | **Author:** Cycle 24 scoping agent (research subagent) | **Supersedes for date check:** [`cycle-22-batchedmesh-research.md`](cycle-22-batchedmesh-research.md)

## TL;DR

Nothing structural has shifted since Cycle 22 closed. Three.js core is still on **r184** per the npm registry and threejs.org banner — the "r190+ in 2026" claims surfacing in some 2026 blog posts conflate WebGPU readiness with version numbering. **BatchedMesh per-instance LOD is unchanged**: still no native support, and `@three.ez/batched-mesh-extensions` (latest published v0.0.11, ~Oct 2025) still requires LOD geometries to share the same vertex array — which still rules out our `@gltf-transform` meshopt simplify pipeline. WebGPU/TSL crossed the iOS-Safari threshold (Safari 26, Sept 2025), so the "broad device support" objection has materially weakened, but TSL foliage shaders are not yet a clear net win for our scene complexity.

**Recommendation: Cycle 24 should NOT spend a phase on BatchedMesh migration or a wholesale WebGPU/TSL pivot.** Stay on InstancedMesh2 + meshopt LOD + kiln impostor + meadow-quad. There IS a small, defensible WebGPU spike (1 phase, behind a feature flag) if the cycle has slack — see Recommendation section.

---

## 1. BatchedMesh per-instance LOD — status as of May 2026

### Three.js core

- Latest published: **r184** (npm `three@0.184.0`, threejs.org banner). Searches returning "r190" reference future-dated blog posts (utsubo.com, threejsroadmap.com) that appear to use 2026 as a marketing year, not a release version.
- Recent BatchedMesh-touching PRs in r183/r184 are housekeeping: per-instance opacity (#32725), wireframe support (#32948), `getColorAt` defensive fix (#33079), unused-param cleanup on `optimize()`. **No `addGeometryLOD` or per-instance LOD primitive has landed in core, and no roadmap issue announces one.**
- Issue #27203 (geometry/transform sharing across BatchedMeshes) and #27930 (geometry groups + multi-material) are the closest architectural moves; both are still open and orthogonal to LOD.

### `@three.ez/batched-mesh-extensions`

- Latest npm: **v0.0.11**, last published ~Oct 2025 (≈7 months stale as of today).
- README (master, fetched today) still reads: *"Currently, only LODs that share the same geometry vertex array can be added. This will improve in the future."*
- The forum showcase thread ([discourse #82449](https://discourse.threejs.org/t/batchedmesh-lod/82449)) is from May 2025 and has no follow-up posts removing the constraint.
- Per-instance uniforms remain WebGLRenderer-only (per README); WebGPURenderer compatibility is partial.

### Compatibility with our pipeline — unchanged

Our `tools/lod-bake.mjs` flow runs `@gltf-transform` `simplify({ ratio: 0.5, error: 0.05, lockBorder: false })` — meshopt produces LOD1 with **half the vertex count** of LOD0. That is the precise scenario `addGeometryLOD` rejects today. To make BatchedMesh work for SDS we'd have to either (a) constrain LOD1 to vertex-preserving simplification (defeats the point — meshopt's win is vertex reduction), (b) wait for the upstream fix, or (c) author a custom multi-batch swap layer (≥1 cycle of work, would re-implement what InstancedMesh2 already gives us).

### Verdict on BatchedMesh

**No movement worth re-scoping for.** Cycle 22's "defer to Cycle 24+" call holds. Re-evaluate when either (i) `batched-mesh-extensions` ships heterogeneous-vertex LOD, or (ii) Three.js core lands a `BatchedMesh.addGeometryLOD` primitive. Watch the [batched-mesh-extensions repo](https://github.com/agargaro/batched-mesh-extensions) — set a calendar check for Q4 2026.

---

## 2. WebGPU / TSL state for our use case

### What changed since Cycle 22 wrote it off

- **Safari 26** (Sept 2025, iOS 26 + macOS) shipped WebGPU enabled by default. This is the big one — Cycle 22's "broad device support including iOS Safari" objection is now mostly moot for current OS users. Older iOS (≤25) still falls back to WebGL2.
- Three.js `WebGPURenderer` has been the default-import path since r171 (zero-config). TSL ships node-graph materials that compile to both WGSL and GLSL, so a single material can target either backend.
- Codrops "False Earth" (Apr 2026) demonstrates **1M+ grass blades via compute shaders + indirect draw + storage buffers in TSL** — a credible existence proof that compute-driven foliage is now achievable in stock Three.js.

### What still cuts against migrating

- **Our scale doesn't need it.** SDS draws 200–500 trees + grass tiers; we are nowhere near the regimes (1M+ instances, GPU-driven culling) where WebGPU's compute pipeline is decisive. InstancedMesh2 + meshopt-LOD already delivers the frame budget on the RTX 3070 baseline.
- **TSL foliage shaders are not free to port.** Our wind/sway/AO foliage shader is hand-tuned GLSL across `materials/foliage*.ts`. Rewriting in TSL is a multi-day exercise and the win at our triangle counts is marginal.
- **Fallback complexity.** `WebGPURenderer` falls back to WebGL2 automatically, but post-processing pipelines, shadow paths, and any custom `onBeforeCompile` hooks need parallel testing on both backends. That is real cycle cost for a small studio.
- **iOS coverage is still partial.** Safari 26 is current, but a non-trivial slice of phones run iOS 25 or earlier through 2026; CanIUse shows WebGPU at ~85% global as of mid-2026, not 95%+. We'd need the WebGL2 fallback path live and tested anyway, so we don't get to delete code.

### Verdict on WebGPU/TSL

**Net-net mildly positive but not a Cycle 24 priority.** A scoped *spike* (single phase, behind a `?renderer=webgpu` flag, no removal of WebGL path) is reasonable if Cycle 24 has slack. A full migration is at least a 1-cycle commitment with no clear performance dividend at our scene complexity.

---

## 3. Foliage techniques worth reading if we do a foliage-perf cycle

These are the highest-signal 2025–2026 references for our exact problem (browser, mid-scale forests + grass meadows):

1. **["False Earth: From WebGL Limits to a WebGPU-Driven World"](https://tympanus.net/codrops/2026/04/21/false-earth-from-webgpu-driven-world/) — Codrops, Apr 2026.** End-to-end TSL + compute shader walkthrough for procedural terrain + 1M grass blades + VAT-animated flowers, all browser. The closest spiritual neighbor to what SDS could become if we went all-in on WebGPU. Use as the reference architecture for any compute-driven grass spike.
2. **["Grass Rendering Series Part 4 — LOD Tricks for Infinite Plains" by hexaquo (Godot, 2025)](https://hexaquo.at/pages/grass-rendering-series-part-4-level-of-detail-tricks-for-infinite-plains-of-grass-in-godot/).** Engine-agnostic; describes the exact tier transition we already use (high-LOD → fade zone → impostor plane → fade-out) with concrete tuning numbers (5/10/20 unit bands, smoothstep, -3.0 mip bias). Validates our meadow-quad approach and offers two specific upgrades worth backporting: world-space texture sampling for chunk consistency and `dot(VIEW, NORMAL)` viewing-angle compensation on the impostor plane.
3. **["A forest of octahedral impostors"](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735) + ["Procedural Instanced Forest"](https://discourse.threejs.org/t/procedural-instanced-forest-high-performance-real-trees/88610) — Three.js forum showcases (2025–2026).** Two community implementations of the InstancedMesh2 + BVH + octahedral-impostor stack rendering 200k trees in browser. Direct prior art for our kiln-impostor tier and a sanity check that we are on the right architecture.

Optional fourth, if we explore mesh-shader-style approaches: GPUOpen's [Procedural grass rendering with mesh shaders](https://gpuopen.com/learn/mesh_shaders/mesh_shaders-procedural_grass_rendering/) — relevant only after a WebGPU migration, since WebGPU does not yet expose mesh shaders.

SIGGRAPH 2025 *Advances in Real-Time Rendering* program does NOT include a vegetation talk; the relevant 2025 vegetation paper (Raad, *Real-time procedural resurfacing using GPU mesh shader*, CGF 2025) is mesh-shader-only, not portable.

---

## 4. Concrete recommendation for Cycle 24

**Cycle 24 has limited new scope around BatchedMesh, WebGPU, or new foliage research.** Stick with the existing toolkit:

- meshopt LOD0/LOD1 via `tools/lod-bake.mjs`
- `@three.ez/instanced-mesh` (InstancedMesh2) for tree rendering
- kiln-baked octahedral impostor for the far tier
- meadow-quad-tier for grass falloff (Cycle 22 Phase D)

**Cycle 24 picks from the existing Path A–E menu.** None of the technology shifts surveyed here unlock a phase Matt couldn't already do.

**One small optional add:** if Cycle 24 has a free phase (e.g., Path A finishes early), a worthwhile, low-risk spike is:

> **Phase X — WebGPU renderer feature-flag spike (~3hr).** Add `?renderer=webgpu` URL flag that swaps `WebGLRenderer` for `WebGPURenderer` on supported browsers. Verify scene boots, foliage shaders compile (TSL fallback or `MeshStandardNodeMaterial` wrapping), and FPS does not regress on the RTX 3070 baseline. **Do not migrate any shader to TSL.** Outcome: a green/red signal on whether Cycle 25+ should pursue a real migration. Failure mode is just "feature flag stays off" — zero user-facing risk.

If that's still too speculative, defer it. The boring answer (Path A — MP audit + Playwright harness) remains the highest expected-value Cycle 24.

---

## 5. Re-check criteria

Re-open this question when ANY of the following land:

- `@three.ez/batched-mesh-extensions` releases heterogeneous-vertex LOD (watch [GitHub releases](https://github.com/agargaro/batched-mesh-extensions/releases)).
- Three.js core PR adds `BatchedMesh.addGeometryLOD` or equivalent (search [mrdoob/three.js issues](https://github.com/mrdoob/three.js/issues?q=is%3Aissue+BatchedMesh+LOD)).
- We hit a profiled frame-budget wall on InstancedMesh2 at production tree count (Currently no signal of this — Cycle 22 closed in budget on the RTX 3070).
- iOS Safari WebGPU adoption crosses ~95% of our actual user base (revisit when caniuse hits 95%+ globally; today ~85%).
- A SIGGRAPH 2026 *Advances in Real-Time Rendering* talk lands on browser-scale foliage. (Conf is Aug 2026 — set calendar check.)

---

## Sources

- [Three.js Releases (GitHub)](https://github.com/mrdoob/three.js/releases)
- [`three` on npm — current 0.184.0](https://www.npmjs.com/package/three)
- [`@three.ez/batched-mesh-extensions` on npm](https://www.npmjs.com/package/@three.ez/batched-mesh-extensions)
- [batched-mesh-extensions README (master)](https://github.com/agargaro/batched-mesh-extensions/blob/master/README.md)
- [`@three.ez/instanced-mesh` (InstancedMesh2) repo](https://github.com/agargaro/instanced-mesh)
- [BatchedMesh LOD showcase thread, May 2025](https://discourse.threejs.org/t/batchedmesh-lod/82449)
- [BatchedMesh proposal issue #22376](https://github.com/mrdoob/three.js/issues/22376)
- [BatchedMesh shared geometry/transforms #27203](https://github.com/mrdoob/three.js/issues/27203)
- [BatchedMesh geometry groups + multi-material #27930](https://github.com/mrdoob/three.js/issues/27930)
- [WebGPU support is now in major browsers — web.dev, 2025](https://web.dev/blog/webgpu-supported-major-browsers)
- [WebKit / Safari 26 WebGPU shipping notes](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/)
- [Codrops — False Earth (WebGPU procedural planet, Apr 2026)](https://tympanus.net/codrops/2026/04/21/false-earth-from-webgpu-driven-world/)
- [Maxime Heckel — Field Guide to TSL and WebGPU](https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/)
- [hexaquo — Grass Rendering Part 4: LOD Tricks](https://hexaquo.at/pages/grass-rendering-series-part-4-level-of-detail-tricks-for-infinite-plains-of-grass-in-godot/)
- [A forest of octahedral impostors — Three.js forum](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735)
- [Procedural Instanced Forest — Three.js forum](https://discourse.threejs.org/t/procedural-instanced-forest-high-performance-real-trees/88610)
- [GPUOpen — Procedural grass with mesh shaders](https://gpuopen.com/learn/mesh_shaders/mesh_shaders-procedural_grass_rendering/)
- [SIGGRAPH 2025 Advances in Real-Time Rendering program](https://advances.realtimerendering.com/s2025/index.html)
