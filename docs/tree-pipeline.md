# Tree Pipeline

> Cycle 15 Phase 4 — pin the contract. Trees are 100% seed → build-time GLBs; nothing in the runtime generates a tree from scratch.

## Workflow

```
tools/bake-trees.mjs           ← author-time recipes (seeds + EZ-Tree presets + tweaks)
        │
        │  npm run bake-trees   (Playwright Chromium harness, GLTFExporter)
        ▼
assets/models/trees/*.glb       ← committed deterministic bytes
        │
        │  scripts/compress-glbs.mjs   (gltfpack draco compression)
        ▼
assets/_originals/models/trees/  ← uncompressed originals (backup cache)
        │
        ▼
js/GameAssetLoader.js           ← preloads tree1.glb (critical) + tree2.glb / pine.glb (deferred)
        │
        ▼
js/TerrainBuilder.js            ← clones via SkeletonUtils, instances per shared/TreePlacement.js
```

The runtime never generates a tree from scratch. All variation comes from the seed → bake pipeline.

## Recipes

Three recipes, one GLB each, all in `tools/bake-trees.mjs`:

| File | Preset | Seed | Visual role |
| --- | --- | --- | --- |
| `tree1.glb` | Aspen Medium | 7 | Slim vertical silhouette — pasture scenes |
| `tree2.glb` | Oak Medium | 13 | Broad canopy anchor — Field + RH |
| `pine.glb` | Pine Medium | 21 | Conifer evergreen — Open Country horizons |

All three share `STYLIZED_BARK` (untextured + flat-shaded brown bark, halved branch tessellation, leaf count tuned for a fuller silhouette than EZ-Tree's defaults). Per-recipe `bark.tint` and `branch.children` overrides differentiate the species.

The bake is byte-stable: same `(EZ-Tree version, recipe seed)` produces identical GLB bytes. Recipes are committed; outputs are committed.

## Re-baking

```bash
rm assets/_originals/models/trees/*.glb   # invalidate compress-glbs backup cache
npm run bake-trees                         # writes assets/models/trees/*.glb
npm run compress-glbs                      # gltfpack draco re-compression
```

The `_originals/` rm is REQUIRED. `scripts/compress-glbs.mjs` reads from the backup cache; without removing the originals, the compress step replays the previous bake's bytes regardless of what `bake-trees` just wrote. (See commit `39f44fb` for the underlying bug.)

After re-baking:

```bash
npm test -- tests/tree-assets.spec.js      # verify all 3 GLBs exist + non-empty + < 3 MB total
```

## Loader contract

`js/GameAssetLoader.js` splits the three trees by load priority:

- `assets/models/trees/tree1.glb` — **critical**. Loaded before scene init.
- `assets/models/trees/tree2.glb` — **deferred**. Loaded via `requestIdleCallback` after the menu mounts.
- `assets/models/trees/pine.glb` — **deferred**. Same path as tree2.

If you add a fourth recipe in `bake-trees.mjs`, also add it to either `defineCriticalAssets()` or `defineDeferredAssets()` in `GameAssetLoader.js`, AND add it to `TREE_FILES` in `tests/tree-assets.spec.js`. Total committed GLB size must stay under 3 MB; if you need more, raise the ceiling deliberately rather than letting it drift.

## InstancedMesh2 quaternion gotcha

When wrapping these GLBs into `InstancedMesh2` instances (the codepath in `TerrainBuilder` post-Cycle-14), the entity API requires `quaternion`, NOT Euler `rotation`. `addInstances((entity, i) => { ... })` callbacks must do `entity.quaternion.setFromAxisAngle(...)` or `entity.quaternion.copy(...)`. Setting `entity.rotation.y = ...` is silently dropped. Documented in cycle-14 hotfix `a41f9a6`.

## GLB shared-material trap

When cloning a GLB asset via `SkeletonUtils.clone()` for placement, the clone shares its materials with the cache. Disposing the clone's materials wipes them on every other instance still in the scene. Tag with `userData.sharedFromGlbCache = true` and rely on remove-from-scene only — never traverse-and-dispose. The shader patch via `onBeforeCompile` (the leaf-wind animation) attaches to the SHARED material once and is correct for all instances.

## What NOT to do

- Don't generate a fourth tree at runtime via EZ-Tree directly. The deterministic seed contract requires the bake to be the single source of truth.
- Don't edit GLB files by hand. Re-author the recipe and re-bake.
- Don't bypass the `_originals/` rm step on re-bake. The compress-glbs cache will silently replay stale bytes.
- Don't add a recipe without also updating `GameAssetLoader.js` AND `tests/tree-assets.spec.js`.
- Don't gate tree placement on runtime randomness; use seeded `mulberry32(seed)` from `shared/Random.js` so client + Worker compute identical positions.
