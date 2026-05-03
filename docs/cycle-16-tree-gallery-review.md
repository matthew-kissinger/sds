# Cycle 16 — tree gallery review

> Recorded 2026-05-03 alongside the Phase 1+2 commit `763a86b`. Companion to [`cycle-16-tree-research.md`](cycle-16-tree-research.md). This doc lists every baked candidate, the autonomous picks I made, and the one-command swap path for any pick you'd rather use.

## TL;DR — autonomous picks

| Slot | Pick | Tris | KB (post-draco) | Role |
| --- | --- | --- | --- | --- |
| `tree1.glb` | `aspen_medium_single` | 4,392 | 224.8 | slim vertical pasture silhouette |
| `tree2.glb` | `oak_medium_single` | 18,772 | 660.4 | broad canopy anchor |
| `pine.glb` | `pine_medium_single` | 1,216 | 206.3 | conifer evergreen |
| `tree1_lod1.glb` | `aspen_medium_single_lod1` | 1,672 | 148.4 | aspen mid-distance |
| `tree2_lod1.glb` | `oak_medium_single_lod1` | 2,314 | 197.2 | oak mid-distance |
| `pine_lod1.glb` | `pine_medium_single_lod1` | 444 | 186.1 | pine mid-distance |

Total committed: **6 GLBs / 1.59 MB** (under the 4 MB ceiling).

These picks live in [`tools/asset-gallery/picks.json`](../tools/asset-gallery/picks.json) — re-run `node tools/asset-gen/integrate.mjs --compress` after editing it to swap any pick.

## How to review

```bash
# Bake-and-verify (already done; staging is gitignored so re-run if cleaning)
npm run bake-trees                  # writes 36 GLBs to staging (~9min, all 36)
npm run bake-trees -- --set=lod0    # just the 24 LOD0 candidates
npm run bake-trees -- --set=lod1    # just the 12 LOD1 candidates

# Browse + pick
npm run gallery                                                # all subfolders
npm run gallery -- --dir=tools/asset-gallery/staging/trees     # LOD0 only
npm run gallery -- --dir=tools/asset-gallery/staging/trees-lod1  # LOD1 only

# Rewire picks → committed assets (rebuilds tree1/tree2/pine + their _lod1 siblings)
node tools/asset-gen/integrate.mjs --compress
npm test -- tests/tree-assets.spec.js
```

The gallery's `★` save writes `picks.json` without `canonicalName` overrides. If your picks need explicit slot routing (i.e., you pick a tall species for the small-vertical slot), open `picks.json` post-save and add `"canonicalName": "tree1.glb"` etc. per pick. integrate.mjs honors the override; without it, falls back to bbox-height-ascending sort.

## Per-variant tris + KB

Pre-draco GLB sizes from staging (post-draco values are typically 30-50% smaller).

### LOD0 candidates — Double billboard (4 tris/leaf, fuller canopy)

| Recipe | Tris | KB pre-draco |
| --- | ---: | ---: |
| `ash_small_double` | 6,444 | 511 |
| `ash_medium_double` | 29,572 | 2,046 |
| `ash_large_double` | 34,756 | 2,401 |
| `aspen_small_double` | 6,444 | 506 |
| `aspen_medium_double` | 7,740 | 594 |
| `aspen_large_double` | 9,036 | 683 |
| `oak_small_double` | 29,572 | 2,080 |
| `oak_medium_double` | 34,756 | 2,434 |
| `oak_large_double` | 39,940 | 2,788 |
| `pine_small_double` | 1,720 | 276 |
| `pine_medium_double` | 2,056 | 299 |
| `pine_large_double` | 2,392 | 322 |

### LOD0 candidates — Single billboard (2 tris/leaf, ~50% lighter)

| Recipe | Tris | KB pre-draco |
| --- | ---: | ---: |
| `ash_small_single` | 3,744 | 326 |
| `ash_medium_single` | 16,180 | 1,131 |
| `ash_large_single` | 18,772 | 1,308 |
| `aspen_small_single` | 3,744 | 321 |
| **`aspen_medium_single`** ★ tree1 | **4,392** | **365** |
| `aspen_large_single` | 5,040 | 410 |
| `oak_small_single` | 16,180 | 1,164 |
| **`oak_medium_single`** ★ tree2 | **18,772** | **1,341** |
| `oak_large_single` | 21,364 | 1,519 |
| `pine_small_single` | 1,048 | 230 |
| **`pine_medium_single`** ★ pine | **1,216** | **241** |
| `pine_large_single` | 1,384 | 253 |

### LOD1 chain — always Single, halved leaf count, level-2 children dropped

| Recipe | Tris | KB pre-draco |
| --- | ---: | ---: |
| `ash_small_single_lod1` | 1,462 | 188 |
| `ash_medium_single_lod1` | 2,104 | 219 |
| `ash_large_single_lod1` | 2,314 | 233 |
| `aspen_small_single_lod1` | 1,462 | 183 |
| **`aspen_medium_single_lod1`** ★ tree1_lod1 | **1,672** | **197** |
| `aspen_large_single_lod1` | 1,882 | 212 |
| `oak_small_single_lod1` | 2,104 | 252 |
| **`oak_medium_single_lod1`** ★ tree2_lod1 | **2,314** | **266** |
| `oak_large_single_lod1` | 2,524 | 281 |
| `pine_small_single_lod1` | 384 | 193 |
| **`pine_medium_single_lod1`** ★ pine_lod1 | **444** | **198** |
| `pine_large_single_lod1` | 504 | 207 |

## Pros / cons by approach

### Single vs Double billboard (LOD0)

**Single (★ chosen):**
- Pro: ~50% leaf-tris cut. Net: oak_medium drops 34,756 → 18,772 tris (−46%).
- Pro: lower draw-call cost on shadow + main pass (smaller index buffer).
- Con: leaves read flat from grazing camera angles (sheep-cam particularly when looking up at canopy). Compensated by `leaves.size` × 1.3 in the bake recipe to keep silhouette dense.
- Con: less convincing as the camera arcs around a tree (no perpendicular plane to catch the light from the side).

**Double:**
- Pro: leaves catch light from any angle. Reads 3D from sheep-cam.
- Con: 2× leaf-tris. With 50-100 trees per scene visible, that's an extra 1-3M tris per frame.
- Con: Cycle 15 baseline used Double + count: 48; tris budget pre-LOD-chain was already at the limit. Single is what the LOD chain *needs* to fit the perf budget.

**Verdict for SDS:** Single LOD0 + the LOD chain absorbing far-distance cost = the right combination. Double would need to drop to count: 16-20 to match Single's tris, which produces visibly sparse canopies.

### Species choices for the 3 slots

**tree1 (slim pasture) — Aspen Medium ★ chosen:**
- Pro: aspen's natural slim vertical silhouette matches the role.
- Pro: low tris (4,392) for the species that gets the most placements (slim trees scatter densely).
- Con: aspen leaves can read as too small at sheep-cam if scaled down too aggressively. ✓ Current scale ranges keep it fine.
- **Alternative:** ash_small_single (3,744 tris) — even lighter, slimmer. Less iconic silhouette though.

**tree2 (broad canopy) — Oak Medium ★ chosen:**
- Pro: oak silhouette is the most "anchor tree" of the four species. Reads as a focal point in pasture scenes.
- Pro: dense canopy hides the underlying branch structure (which can read sparse on Cycle 15's recipe).
- Con: heaviest of the picks at 18,772 tris. Acceptable because oaks are sparse (<10 per scene typically).
- **Alternatives:** ash_medium_single (16,180 tris, similar dense canopy but more vertical proportions), or oak_large_single (21,364 tris, heavier silhouette for hero placement).

**pine (conifer) — Pine Medium ★ chosen:**
- Pro: pine_medium reads as a balanced conifer — not too skinny, not over-dense.
- Pro: extremely cheap at 1,216 tris (12-tris-per-foliage-cluster economy of conifer fronds).
- Con: silhouette is more bushy than the iconic narrow-conifer some scenes might want. pine_large_single (1,384 tris) is taller and sharper.
- **Alternatives:** pine_small_single (1,048 tris, more youthful sapling look) or pine_large_single (1,384 tris, more iconic mature conifer for OC horizon).

### LOD1 sibling sizing

The autonomous picks pair each LOD0 with its same-size LOD1 sibling. This keeps proportions consistent across the LOD swap so distant trees don't "shrink" or "grow" when the camera crosses the 80m threshold. **Don't pick mismatched sizes** (e.g. aspen_medium LOD0 with aspen_small LOD1) — visible pop.

### LOD1 quality vs perf

Each LOD1 entry is roughly 25-30% the LOD0 tris. The trunk geometry stays similar (only level-2 child branches drop, not trunk tessellation), so the silhouette holds. Only the leaf density drops noticeably — which is fine because LOD1 only renders 80m+ where leaves are sub-pixel anyway.

If perf shows LOD1 still too expensive on mobile, the next lever is dropping `leaves.count` further on the LOD1 recipes (currently 12-21; could go to 8-12). One-line change in `tools/bake-trees.mjs`:

```js
const baseLeafCount = LEAF_COUNTS[species][scaleIdx];
const leafCount = tier === 'lod1' ? Math.round(baseLeafCount * 0.5) : baseLeafCount;
//                                                              ^^^ → 0.33 for more aggressive LOD1
```

## Swap path — re-running with different picks

```bash
# 1. Edit tools/asset-gallery/picks.json to add/change picks. Each pick needs:
#    {
#      "path": "tools/asset-gallery/staging/trees/<recipe>.glb",
#      "canonicalName": "tree1.glb"  // or tree2.glb / pine.glb / tree1_lod1.glb / etc.
#    }
#    Other fields (name, tris, bbox) are informational only.

# 2. Re-run integrate (overwrites assets/models/trees/*.glb):
rm -f assets/_originals/models/trees/*.glb   # invalidate compress cache
node tools/asset-gen/integrate.mjs --compress

# 3. Verify:
npm test -- tests/tree-assets.spec.js
npm run dev   # visual check via :3000
```

The runtime side is unchanged — `js/TerrainBuilder.js` always reads `tree1/tree2/pine` + `_lod1` siblings, so swap any pick freely without code changes.

## What I'd suggest reviewing in person

The autonomous picks are reasonable defaults grounded in tris budget + species fit. The places where Matt's eye matters most:

1. **Aspen vs Ash for tree1:** ash_medium_single (16,180 tris) might read better than aspen_medium_single (4,392 tris) for "broad pasture tree" if you want more canopy presence in the slim slot. The aspen pick is conservative for tris budget.
2. **Pine size:** pine_large_single might be the stronger conifer silhouette for OC horizon, even though pine_medium_single is what's currently picked. ~170 tris difference is negligible.
3. **Bark color coherence:** The tightened range (0x4a-0x8c brown family per Q1 resolution) reads coherent in the inspect-glb tris view; needs a real visual pass to confirm no species reads as out-of-place.
4. **LOD0 → LOD1 pop at 80m:** The hysteresis is ±10m, but for some camera tracking patterns (e.g. chasing a sheep through a tree line) the swap may show. If popping is visible, raise the LOD1 distance to 100m and lower LOD2 to 180m — both are one-line changes in `js/TerrainBuilder.js` (`addLOD(lod1Geo, mat, 80)` and `addLOD(billboardGeo, mat, 150)`).

None of these block Phase 3-6 — they're polish iterations the swap path supports cleanly.
