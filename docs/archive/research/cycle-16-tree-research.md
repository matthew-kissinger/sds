# Cycle 16 — tree foliage research + decision brief

> Recorded 2026-05-03 ahead of Phase 1 implementation. Pairs with [`cycle-16-plan.md`](cycle-16-plan.md). Written so a future cycle (or a fresh agent) can re-evaluate without re-doing the research.

## TL;DR — chosen path

**A + B + E** from the cycle plan, with the existing 3-quad cross-billboard kept and migrated from world-space-distance into a proper per-instance `addLOD` entry. No new dependencies, no aesthetic shift. PIF and octahedral impostors stay on the long-tail list.

| Lever | Decision | Why |
| --- | --- | --- |
| Recipe re-tune | `leaves.billboard: 'Single'` for LOD0; lower `leaves.count` 40-72 → 24-36; larger `leaves.size` to compensate | Single = 2 tris/leaf vs Double = 4 tris/leaf. Combined with lower count, ~75% leaf-tris reduction at LOD0. Bake also produces a **Double** sibling per recipe so the gallery can A/B the visual tradeoff. |
| Bark tints | Tighten species range → 0x6e4f30 / 0x7a5a3a / 0x6a4630 / 0x4a3525 (Q1 author lean: tighten to 0x60-0x70 family). | Cycle 15 review flagged the wider 0x4a-0x9a range as too contrasting. Tightening keeps species differentiation but lands them in one brown family. |
| Asymmetric canopy | Re-roll seeds per recipe until each species lands a balanced silhouette. Don't bump `branch.children` (that compounds tris cost). | Q2 author lean. Re-roll is free; bumping children is a perf regression. |
| LOD1 (mid-distance) | Bake a parallel set into `staging/trees-lod1/` with `leaves.count` halved + `Single` + 1 fewer branch level. Wired via `addLOD(lod1Geo, sameMat, ~80m)`. | Continuous geometry path; same wind shader works unchanged because the leaf material is shared from the GLB cache. |
| LOD2 (far) | Re-use existing `_buildFarTreeBillboards` 3-quad cross-billboard. Migrate from world-distance split to `addLOD(billboardGeo, billboardMat, ~120m)`. | The bake code is already shipping; cross-billboard 3 planes at 0/60/120° handles any view angle within ~30°. Migrating to addLOD makes it per-instance per-frame instead of a one-time scene-load decision. |
| New deps | None. | Existing `@three.ez/instanced-mesh` already provides `addLOD`. |

## Techniques surveyed

Each row scored against (1) visual quality at SDS's typical play distances 5-200m, (2) implementation complexity, (3) integration cost in the existing repo, (4) downstream perf impact, (5) whether it preserves the cozy/stylized aesthetic SDS has settled on.

### A. Recipe re-tune (lower leaf cost upfront)

- **Pros:** Free perf win — no runtime code changes. Compounds with every other lever. Gallery-reviewable. Reversible.
- **Cons:** Single-billboard leaves read as flat from grazing camera angles (sheep-cam particularly). Lower count needs `leaves.size` bump to keep canopies dense, which can produce the "leaf-cluster pillows" look if pushed too hard.
- **SDS fit:** ★★★★★ — must-do.

### B. `InstancedMesh2.addLOD` chain ✅ chosen

- **Pros:** First-class API in `@three.ez/instanced-mesh` (already a dep). Per-instance per-frame distance test. Hysteresis configurable. Drop-in for both trunk and leaves InstancedMesh2s. Same camera bookkeeping as the existing per-instance frustum culling so no extra CPU pass.
- **Cons:** Need to author + load the LOD1 GLB chain (one extra file per tree species). LOD1 still uses the same shared material (good — the leaf-wind shader patch survives), but the trunk + leaves geometries are split across LOD0 and LOD1 GLBs, so the loader needs to wire both.
- **SDS fit:** ★★★★★ — the foundation. Wires LOD0/LOD1/LOD2 cleanly.

### C. Vertex-shader leaf cull (PIF trick)

- **Mechanic:** In the leaves' vertex shader, if `cameraDistance > X`, set `gl_Position = vec4(0,0,0,1)` so the GPU degenerates the triangle and skips the fragment. Costs zero geometry work.
- **Pros:** Works on top of an existing material via `onBeforeCompile`. PIF demoed it at 2,800 trees, 60fps.
- **Cons:** **Becomes redundant once `addLOD` is wired** — the LOD2 billboard already replaces the leaf mesh entirely. Adding both is duplicated work + two sources of "where did the leaves go?" if either misfires.
- **SDS fit:** ★★ — skip in favor of B+E.

### D. `InstancedMesh2.onFrustumEnter` distance cull

- **Mechanic:** Per-instance callback returning `false` for instances outside a max-distance ring.
- **Pros:** Hard cap on visible-tree count without LOD authoring.
- **Cons:** Pops in/out at the threshold (no fade or geometry transition). Already covered by per-instance frustum culling for the off-screen case; the in-frustum-but-distant case is what `addLOD` handles cleanly.
- **SDS fit:** ★★ — `addLOD` strictly better.

### E. 3-quad cross-billboard impostor ✅ chosen (existing code, migrated)

- **Mechanic:** 6-vertex per quad × 3 quads at 0/60/120° around Y axis = 18 verts / 6 tris per impostor instance. Texture baked once at scene load via `_bakeTreeImpostor`'s offscreen ortho render.
- **Pros:** Already shipping in `_buildFarTreeBillboards`. Tested. ~99% leaf-tris reduction at far distance. Three quads handle any view angle within ~30° of one quad's normal — no edge-on disappear.
- **Cons:** No view-dependent shading (impostor is one fixed-light bake). No octahedral interpolation, so silhouette doesn't morph as camera arcs around the tree (acceptable for SDS — sheepdog isn't orbiting trees).
- **Migration:** Move from `farByType` world-distance split into `mesh.addLOD(crossBillboardGeo, billboardMat, 120)` so the swap is per-instance per-frame.

### F. Octahedral impostors (Brucks technique, agargaro/octahedral-impostor)

- **Mechanic:** Bake the tree from 8 (or more) angles into an atlas (~256² × 16 sprites = ~5-8 KB/tree). Vertex shader picks the 3 nearest sprites to camera direction and blends.
- **Pros:** Better view-dependent silhouette than cross-billboard. Industry standard for AAA forests (UE5 ships this baked into the engine).
- **Cons:** New runtime dep (`@three.ez/octahedral-impostor`). Atlas memory cost (~8 KB × 3 species × N variants = manageable but non-zero). Vertex-shader sampling adds shader complexity. Visible "popping" between sprite blends if angular resolution insufficient. Existing 3-quad cross is *good enough* for the play distances SDS hits.
- **SDS fit:** ★★ — defer. Long-tail upgrade if the cross-billboard's lack of view-dependent shading reads wrong on the OC horizon strip.

### G. Procedural Instanced Forest (red-reddington)

- **Mechanic:** L-system instanced on bark cylinders + leaf quads. Vertex-shader leaf cull at distance + bark color shift to mask LOD transitions. Custom WGSL/TSL port for WebGPU.
- **Pros:** 2,800 trees in 8 draw calls @ 60fps mid-range desktop. MIT licensed. Aggressive optimization.
- **Cons:** Different aesthetic — leaves are abstract green tufts vs SDS's leaf-textured cards. Different pipeline (no GLB intermediate). Different procedural authoring (CodePen-only at the moment, no published npm). The cycle plan explicitly says don't swap unless `addLOD` demonstrably misses the perf budget. PIF stays on the long-tail list.
- **SDS fit:** ★ — long-tail.

### H. WebGPU / TSL port

- **Pros:** Compute-shader leaf placement, indirect drawing for cluster culling, port targets exist (PIF has one, EZ-Tree's leaf-wind GLSL ports cleanly to TSL nodes).
- **Cons:** Browser-support story still uneven enough that we'd ship a WebGL fallback anyway. The Cycle 16 plan says "still deferred." Right call — the whole renderer migrates, not just trees.
- **SDS fit:** ★★ — own-cycle scope.

## Open questions — resolutions

1. **Q1 — Bark color contrast strategy.** Resolved: **(a) tighten range** to a brown family (per-recipe in 0x4a-0x7a band, but cluster the mediums 0x6a-0x7a). Concrete tints below.
2. **Q2 — Asymmetric canopy fix.** Resolved: **(b) re-roll seeds.** New seeds picked per recipe and locked. Verified via gallery preview before integrate.
3. **Q3 — LOD strategy.** Resolved: **A + B + E** (recipe re-tune + `addLOD` chain + cross-billboard). Skip C, D, F, G as documented above.
4. **Q4 — Flora rebuild scope.** Resolved: **tune-first.** Bump `oversampleFraction` 0.05 → 0.10 and mushroom `targetHeight` 0.30 → 0.50. Defer full rebuild.

## Concrete numbers — what gets baked

LOD0 + LOD1 chain per recipe (12 recipes). LOD2 is the runtime-baked cross-billboard.

| Recipe | LOD0 leaves count × billboard | LOD1 leaves count × billboard | LOD0 branch.children | LOD1 branch.children | Estimated LOD0 tris (leaves only) |
| --- | --- | --- | --- | --- | --- |
| Ash S/M/L | 24 / 30 / 36 × Double | 12 / 15 / 18 × Single | {0:8, 1:5, 2:3} | {0:6, 1:4, 2:0} | ~5.7k / ~7.2k / ~8.6k |
| Aspen S/M/L | 24 / 30 / 36 × Double | 12 / 15 / 18 × Single | {0:8, 1:5, 2:3} | {0:6, 1:4, 2:0} | ~5.7k / ~7.2k / ~8.6k |
| Oak S/M/L | 30 / 36 / 42 × Double | 15 / 18 / 21 × Single | {0:8, 1:5, 2:3} | {0:6, 1:4, 2:0} | ~7.2k / ~8.6k / ~10.0k |
| Pine S/M/L | 24 / 30 / 36 × Double | 12 / 15 / 18 × Single | {0:14, 1:6, 2:3} | {0:10, 1:4, 2:0} | ~6.0k / ~7.5k / ~9.0k |

(Compare to current shipped: ~23k leaf tris/tree at `count: 48 × Double × {0:8, 1:5, 2:3}`. LOD0 cuts ~60-70%; LOD1 cuts another ~75% from LOD0; LOD2 cuts to ~6 tris.)

The gallery also bakes a **Single-leaf sibling** of each LOD0 recipe for A/B review — that's an additional 12 GLBs in `staging/trees/`. Total LOD0 candidates in gallery: 24 (12 Double + 12 Single). LOD1: 12 in `staging/trees-lod1/`.

## Hysteresis values

- LOD0 → LOD1 swap at **80m** camera distance, hysteresis **±10m**.
- LOD1 → LOD2 swap at **150m** camera distance, hysteresis **±15m** (pulled out from the cycle plan's 120m to absorb camera bobble in the chase view; can re-tune in Phase 4 if perf forces tighter).

## What we're explicitly NOT doing this cycle

- Octahedral impostors (sticking with 3-quad cross — see E vs F above).
- PIF swap (different aesthetic, against cycle plan NOT-DO).
- WebGPU/TSL port (own cycle).
- Vertex-shader leaf cull (subsumed by `addLOD`).
- Per-instance dynamic count culling via `onFrustumEnter` (already covered by `perObjectFrustumCulled`).

## References

- [Procedural Instanced Forest (red-reddington, Dec 2025)](https://discourse.threejs.org/t/procedural-instanced-forest-high-performance-real-trees/88610) — MIT, WebGPU port, 2,800 trees in 8 draws. Long-tail.
- [InstancedMesh LOD - 1 million instances (agargaro, 2024)](https://discourse.threejs.org/t/instancedmesh-lod-1-million-instances/70748) — `addLOD` API demo with sphere LODs. Confirms the API surface used by Phase 1.
- [A forest of octahedral impostors (agargaro)](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735) — 200k trees, octahedral atlas. Reference for the Phase F path if cross-billboard ever proves insufficient.
- [Octahedral Impostors — Ryan Brucks / shaderbits](https://shaderbits.com/blog/octahedral-impostors) — original UE technique writeup.
- [@three.ez/instanced-mesh — addLOD docs](https://github.com/agargaro/instanced-mesh) — API the LOD wiring uses.
- [EZ-Tree README — leaf billboard modes](https://github.com/dgreenheck/ez-tree) — Single = 2 tris/leaf, Double = 4 tris/leaf.
- [Codrops — Fractals to Forests (2025)](https://tympanus.net/codrops/2025/01/27/fractals-to-forests-creating-realistic-3d-trees-with-three-js/) — the EZ-Tree author's writeup. Background; no new techniques surfaced.
