# Cycle 22 Phase E — BatchedMesh migration research (Cycle 23+ candidate)

**Document Status:** Research report | **Date:** 2026-05-05 | **Scope:** Three.js r184 | **Author note:** Matt / future cycle agent — decide in Cycle 23+ whether to migrate SDS tree rendering from `@three.ez/instanced-mesh` (InstancedMesh2) to BatchedMesh, or defer.

---

## Executive Summary

SDS currently uses `@three.ez/instanced-mesh@0.3.15` (InstancedMesh2) for per-instance LOD rendering of 200–500 trees across two species (tree1, tree2; pine removed in Cycle 22 Phase A). Investigation reveals **BatchedMesh is not a drop-in replacement for our use case**: while Three.js r184 ships BatchedMesh with multi-geometry batching, native per-instance LOD support is **absent from core**. Workaround libraries exist (`@three.ez/batched-mesh-extensions`) but impose constraints (LODs must share vertex arrays, pending future enhancement) and add a transitive dependency.

**Recommendation: Defer migration to Cycle 24+.** InstancedMesh2 remains the superior choice for 200–500 mixed-LOD instances at our scale. Revisit if:

- Three.js core adds first-class BatchedMesh LOD support (no timeline announced as of r184).
- We exceed ~1M instances and profiling shows InstancedMesh2 dominates frame budget.
- We need dynamic multi-material rendering of the same geometry batch (unplanned feature).

---

## 1. Three.js r184 BatchedMesh API Surface

### Overview

BatchedMesh (introduced r113, evolved through r184) is a specialized mesh class for batching multiple geometries under a single material and render call. It uses `multiDraw*` WebGL extensions to minimize draw calls — useful when rendering many *different* geometries; less relevant when rendering identical geometry with varying transforms.

### Core API Methods (r184)

- **`addGeometry(BufferGeometry, visibleStart?, visibleEnd?)`** — Add a geometry by reference. Returns a geometry ID. No per-geometry transform; transforms are per-instance only.
- **`addInstance(geometryId)`** — Create an instance of a geometry by ID. Returns an instance ID (index into instance buffer).
- **`setMatrixAt(instanceId, matrix)`** — Update the transform matrix for a single instance (post-creation only).
- **`getMatrixAt(instanceId, target?)`** — Read instance transform back.
- **`setColorAt(instanceId, color)`** / **`getColorAt(instanceId, target?)`** — Per-instance color (fixed in r184; previously threw if colors unset).
- **`deleteGeometry(geometryId)`** — Remove a geometry and all instances referencing it.
- **`deleteInstance(instanceId)`** — Remove a single instance.
- **`repack()`** — Compact internal buffers after deletions; frees wasted index/vertex space.
- **`computeBoundingBox()` / `computeBoundingSphere()`** — Compute spatial bounds (required for frustum culling; not automatic).
- **`computeBVH()`** — Build a BVH structure for raycasting acceleration.

### Properties

- **`perObjectFrustumCulled`** (default `true`) — Per-instance frustum culling via index buffer manipulation.
- **`sortObjects`** (default `false`) — Sort instances front-to-back / back-to-front to reduce overdraw.
- **`maxGeometryCount`, `maxVertexCount`, `maxIndexCount`** — Pre-allocated capacity; `repack()` cannot exceed these.

### Raycasting & Shadows

- Raycasting works via BVH (`computeBVH()` first).
- Shadow casting supported; `castShadow` / `receiveShadow` apply globally to the entire batch.
- **Critical gap:** No per-instance shadow rendering control. Our Cycle 21 Phase 5 fix (LOD0 shadows only via `LODinfo.shadowRender`) has no native BatchedMesh equivalent — would require custom shader/pass override.

### Constraints vs InstancedMesh

- **Single material per batch** — no per-instance material override.
- **No built-in visibility toggle per instance** — workaround is to delete/re-add (expensive O(n)).
- **No LOD system** — each instance is pegged to a single geometry; switching geometries per-instance requires deletion + re-add.
- **API stability:** No breaking changes documented r170 → r184.

---

## 2. LOD Parity Gap: Does BatchedMesh Have Per-Instance LOD?

### Native Support: No

Three.js r184 BatchedMesh **does not ship with built-in per-instance LOD.** An instance is statically bound to a single geometry ID; there is no distance-based geometry swapping in core.

### Community Workarounds

#### Option A: THREE.LOD Parent (Not Viable at Scale)

Wrap multiple BatchedMeshes in `THREE.LOD` containers, each LOD level = a separate BatchedMesh. **Problem:** 500 instances × 3 LODs = 1500 instances spread across 3 batches. Loses the single-draw-call advantage. Frustum culling works per-batch, not per-instance.

#### Option B: Manual Per-Instance Distance Checks (Brittle)

Compute camera distance per instance per frame, manually `deleteInstance()` + `addInstance()` to swap geometry IDs. **Problem:** O(n) per frame, deletes trigger `repack()`, very expensive. Suitable only for < 20 dynamic instances.

#### Option C: `@three.ez/batched-mesh-extensions` (Partial Solution)

A community library extending BatchedMesh with LOD support:

```javascript
const batchedMesh = new BatchedMesh(...);
batchedMesh.addLOD(geometryId, distance);  // LODs share the same vertex array
```

**Limitations as of 2025/2026:**

- All LODs for a given instance must share the **same vertex layout** (vertex count, attribute stride). This rules out our Cycle 22 Phase A meshopt simplify pipeline — `tree1` LOD0 has 10390 verts and LOD1 has 5503 verts, so they cannot live in the same vertex array.
- Per-future enhancement: "this limitation will improve in the future" — no timeline given.
- Adds another community-maintained dependency on top of `@three.ez/instanced-mesh`.
- LOD switch is per-geometry-id, not per-instance.

#### Option D: `MultiDrawInstanced` Rendering (Experimental)

Three.js GitHub issue #31935 (September 2025) proposes re-adding `multiDraw*Instanced` support to BatchedMesh, which would allow instanced rendering *within* a batch. Performance gain: ~1.5–2× on discrete GPUs vs multi-draw on integrated. **Status:** Under discussion; not shipped in r184. Browser support varies (Chrome has it, Firefox lacks `WEBGL_multi_draw` entirely, requiring fallback).

---

## 3. `WEBGL_multi_draw` Extension Status

`WEBGL_multi_draw` (and the newer, draft `WEBGL_multi_draw_instanced`) are Khronos WebGL extensions that allow multiple primitives to be rendered in a single API call.

**Browser Support (2026):**

- **Chrome:** Supported.
- **Safari:** Supported.
- **Firefox:** `WEBGL_multi_draw` not supported; Three.js falls back to single-draw loops, eliminating the batching benefit.
- **Mobile / WebGL 2:** Available but driver-dependent.

### Performance Implication for SDS

At 200–500 instances across 2–3 LOD geometries (4–6 distinct geometries total post-pine-removal), the reduction from ~1500 draw calls → ~6 is dramatic. *However*, on modern hardware (RTX 3070), CPU-side draw-call overhead is low; GPU-bound terrain + impostor + grass rendering dominates frame budget far more than draw call count. Measured gains likely under 2-3ms unless we're already at 144Hz frame budget cap.

---

## 4. Comparison: BatchedMesh vs InstancedMesh2

### When InstancedMesh2 Wins (Our Case)

| Criterion | InstancedMesh2 | BatchedMesh + Extensions |
|---|---|---|
| **Per-instance LOD** | Native, arbitrary geometry simplification | Partial (requires shared vertex arrays — blocks meshopt simplify pipeline) |
| **Instance count (200–500)** | Optimized; single draw call per LOD level | Single draw call, but multiDraw overhead can exceed instanced on small counts |
| **Frustum culling** | Per-instance via BVH (built-in) | Per-instance via index buffer (built-in) |
| **Raycasting** | Fast BVH + per-instance custom data | Fast BVH (`computeBVH()` required) |
| **Per-instance visibility toggle** | Native `setVisibilityAt()` | Workaround: delete/re-add (expensive) |
| **Shadow LOD control** | `LODinfo.shadowRender` (our Cycle 21 fix) | No native hook; requires shader overrides |
| **Transitive dependencies** | `@three.ez/instanced-mesh@0.3.15` (well-maintained) | `@three.ez/batched-mesh-extensions` (younger, less proven) |

### When BatchedMesh Would Win

| Criterion | InstancedMesh2 | BatchedMesh |
|---|---|---|
| **Instance count (1M+)** | Bottlenecks on instance buffer updates | Handles larger counts more gracefully with multiDraw |
| **Geometry diversity** | Best: one geometry per InstancedMesh; 2–3 manageable | Single draw call for many different geometries |
| **Per-instance shader uniforms** | Upcoming feature | Native in batched-mesh-extensions |
| **Multi-material same geometry** | Not planned | Planned in three.js core (no timeline) |

### Verdict

InstancedMesh2 is purpose-built for our scenario. BatchedMesh is designed for "many different geometries, same material, large counts." We have 2 species × 3 LODs = 6 unique geometries — the sweet spot for InstancedMesh2, not BatchedMesh.

---

## 5. Migration Cost Estimate

### Files Affected

- **`js/TerrainBuilder.js`** `loadModels` + `createTrees` — ~150–200 lines.
- Wherever the kiln impostor billboard is wired into the LOD chain — currently via `im.addLOD(billboardGeo, billboardMat, 200)`. Would need a parallel-path through batched-mesh-extensions' `addLOD`.
- Tree obstacle bundle in `main.js` — depends on `treeInstances` shape, may need rework if instance ID semantics change.

### Code Sketch

**Current (InstancedMesh2):**

```javascript
const im = new InstancedMesh2(geometry, material, { capacity: 500, createEntities: false });
im.addLOD(lod1Geo, lod1Mat, 80);     // works with different vertex counts
im.addLOD(billboardGeo, billboardMat, 200);
im.addInstances(500, (obj, i) => {
  obj.position.copy(...);
  obj.quaternion.setFromEuler(...);
  obj.scale.copy(...);
});
im.computeBVH({ margin: 0 });
im.LODinfo.shadowRender = { levels: [{ distance: 0, hysteresis: 0, object: im }], count: [0] };
```

**Hypothetical (BatchedMesh + Extensions):**

```javascript
const bm = new BatchedMesh(500, totalVertexCount, totalIndexCount, material);
const geoId0 = bm.addGeometry(geometry);
const geoId1 = bm.addGeometry(lod1Geo);     // FAILS — different vertex count
// const geoId2 = bm.addGeometry(billboardGeo);  // FAILS — different vertex count
// extensions:
bm.addLOD(geoId0, 80);
bm.addLOD(geoId1, 200);

trees.forEach((tree, i) => {
  const id = bm.addInstance(geoId0);
  bm.setMatrixAt(id, new THREE.Matrix4().compose(tree.pos, tree.quat, tree.scale));
});
bm.computeBVH();
// Shadow LOD0-only: no native hook — requires custom override.
```

### Gotchas

1. **Vertex array mismatch** is the showstopper. Cycle 22 Phase A's meshopt simplify produces LOD1 with a different vertex count to LOD0. Migrating to BatchedMesh would require either (a) waiting for the batched-mesh-extensions library to drop the shared-vertex-array constraint, or (b) abandoning meshopt simplify in favour of a vertex-count-preserving LOD strategy (e.g. material-only LOD swaps), defeating most of Phase A's perf benefit.
2. **Instance ID vs Tree Index:** BatchedMesh returns instance IDs; if we track trees by index and later need to delete/re-add, we lose the mapping.
3. **Shadow control:** No `LODinfo.shadowRender` equivalent. The Cycle 21 fix would need a custom shadow-pass material variant.
4. **Visibility control:** No per-instance toggle. Tree culling in physics checks would need to iterate and delete instances.
5. **Dependency swap:** Migrate from `@three.ez/instanced-mesh` to `@three.ez/batched-mesh-extensions` — both are by the same maintainer (agargaro), but extensions library is younger.

### Effort Estimate

- Rewriting `createTrees` + LOD wiring: 4–6 hours (includes vertex array parity investigation).
- Re-baking LOD1 with vertex-count parity (or finding workaround): 2–4 hours.
- Fixing shadow LOD: 2–3 hours (custom pass or shader variant).
- Testing & validation (per-instance frustum, raycast, impostor quality): 3–4 hours.
- **Total: ~11–17 hours, equivalent to 1.5–2 dev days** with risk buffer.

---

## 6. Recommendation: Defer Migration

### Primary Reasons

1. **No native per-instance LOD in Three.js r184.** The core feature we depend on requires a third-party extension library with a vertex-array constraint that conflicts with Cycle 22's meshopt simplify pipeline.
2. **InstancedMesh2 is already optimized for our scale.** At 200–500 instances, we're not hitting the 1M+ threshold where BatchedMesh's multi-draw advantage emerges.
3. **Our implementation is battle-tested.** Cycle 21 closed with frustum culling, raycasting, and shadow LOD parity verified.
4. **Unresolved Three.js core roadmap.** GitHub issues #27930 and #31935 indicate the core team *may* add better BatchedMesh LOD and multi-material support, but no timeline. Waiting 1–2 releases is safer than building on a third-party workaround.

### Revisit If

- **Profiling shows InstancedMesh2 is a bottleneck.** Log frame times in Cycle 23–24; if instance updates dominate and LOD switching is frequent, investigate.
- **Three.js r186+ announces first-class BatchedMesh LOD.** Monitor releases.
- **We need dynamic multi-material same-geometry rendering.** Planned in BatchedMesh core; if shipped, revisit.
- **Instance count scales to 1M+.** Unlikely for SDS scope.

### Timeline

- **Cycle 22–23:** No action. Stay on InstancedMesh2.
- **Cycle 24+:** If profiling or core features justify it, open a new spike to prototype BatchedMesh + batched-mesh-extensions with synthetic 500-tree LOD chains, measure FPS delta, and present findings.

---

## 7. Sources & References

- **Three.js r184 Release Notes** (2024-04): https://github.com/mrdoob/three.js/releases/tag/r184
- **Three.js BatchedMesh API Docs** (r184): https://threejs.org/docs/pages/api/en/objects/BatchedMesh.html
- **GitHub Issue #22376 — BatchedMesh Proposal:** https://github.com/mrdoob/three.js/issues/22376
- **GitHub Issue #31935 — MultiDraw\*Instanced Support** (2025-09): https://github.com/mrdoob/three.js/issues/31935
- **GitHub Issue #27930 — Geometry Groups & Multi-Material** (pending): https://github.com/mrdoob/three.js/issues/27930
- **`@three.ez/batched-mesh-extensions`:** https://github.com/agargaro/batched-mesh-extensions
- **`@three.ez/instanced-mesh`:** https://github.com/agargaro/instanced-mesh
- **Three.js Forum — InstancedMesh vs BatchedMesh** (2025): https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221
- **MDN — `WEBGL_multi_draw` Extension:** https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_multi_draw
- **Khronos WebGL Extension Registry:** https://registry.khronos.org/webgl/extensions/

---

## Appendix: Test Harness for Future Validation (Cycle 24+)

If we re-evaluate, this synthetic benchmark measures parity:

```javascript
// 500 trees, 3 LODs, measure FPS + frustum cull accuracy
const trees = Array(500).fill(0).map((_, i) => ({
  pos: new THREE.Vector3(Math.random() * 100 - 50, 0, Math.random() * 100 - 50),
  species: i % 2,
  lodAt: (distance) => distance < 80 ? 0 : distance < 200 ? 1 : 2,
}));

// InstancedMesh2 path
const im2Tree1 = new InstancedMesh2(geo.lod0, mat, { capacity: 250 });
im2Tree1.addLOD(geo.lod1, mat, 80);
im2Tree1.addLOD(geo.lod2, mat, 200);
// ... setup 250 instances

// BatchedMesh path
const bmTree1 = new BatchedMesh(250, vertexCount, indexCount, mat);
const gid0 = bmTree1.addGeometry(geo.lod0);
// ... only succeeds if all LOD geometries share vertex layout

console.time('frame');
renderer.render(scene, camera);
console.timeEnd('frame');
```
