# OC overhead — LOD0 vs impostor side-by-side

> 2026-05-04. Forced overhead pose at `(0, 220, 0.001) → lookAt(0,0,0)` in OC at default ToD. Same camera position for both shots; only LOD distance threshold changed.

| File | What | LOD chain |
| --- | --- | --- |
| [`lod-compare-impostor.jpeg`](lod-compare-impostor.jpeg) | Production state | LOD0 → kiln impostor at 100m camera distance |
| [`lod-compare-lod0.jpeg`](lod-compare-lod0.jpeg) | All-LOD0 forced | Walked `scene.traverse` and set every InstancedMesh2 LOD2 distance to `Infinity` so LOD0 wins everywhere |

## What the comparison shows

**Visible gap:** Far-rim trees in the impostor render look notably more washed-out, lower-saturation, with sparkle/glint artifacts vs the same trees rendered as LOD0. Foreground trees (camera distance < 100m, both shots are LOD0) look identical — confirming the gap is impostor-specific, not a different scene state.

**Specific differences:**
- Saturation: LOD0 yellow/orange foliage reads vivid; impostor reads muted, slightly grey-shifted.
- Detail: LOD0 shows individual leaf clusters with shadow modeling; impostor shows a softer "blob" silhouette.
- Glint: at the angled rim of the island where impostors face the camera obliquely, bright single-pixel sparkles flicker — texture undersampling at 5-15 screen-pixel projection of the 512px tile.
- Trunk: LOD0 shows visible trunk geometry; LOD2 has trunk replaced by the cross-billboard or kiln impostor flat plane.

## What this validates

This is the structural visible gap Cycle 21 phases 2-4 target:
- **Phase 2 (LUT)** closes the saturation/hue mismatch via per-(scene, ToD) `uMatchBoost` boost vector tuned from sandbox measurements.
- **Phase 3 (padded mips)** kills the rim-glint by re-enabling mipmaps with N=16-32px tile padding so the box-mip generator can't bleed across tile boundaries.
- **Phase 4 (hybrid trunk)** restores trunk-pixel parity at the closest impostor band (100-150m) so the LOD0→LOD2 swap is anchored to real geometry, not a flat plane.

## Note on Phase 0's own contribution

Phase 0 (Aspen recipe + placement + fresnel + doc fix) is recipe/placement/lighting only — none of it addresses sampling. The fresnel rim is visible on the lit-side canopy edges of the impostor render but doesn't close the saturation gap or eliminate the glint. That's expected — Phase 0 is the Aspen/placement quick-win layer; the structural impostor parity work lives in Phases 1-4.
