# SDS asset gallery + bake-and-pick pipeline

> Cycle 15 Phase 1. The pipeline for generating, browsing, and integrating GLB asset variations (rocks, trees, eventually flora) into the SDS asset pool. The primitive-based bake is the primary path; turnkey 3D AI services (Meshy) are an optional escape hatch.

## TL;DR

```bash
# 1. Bake all variations into staging (16 rocks + 12 trees, ~30s total).
npm run bake-rocks                 # → tools/asset-gallery/staging/rocks/   (~16 GLBs)
npm run bake-trees                 # → tools/asset-gallery/staging/trees/   (~12 GLBs)

# 2. View + pick the best (browser opens; ★ to pick, s to save)
npm run gallery                    # default scans tools/asset-gallery/staging/ recursively

# 3. Wire picks into committed assets (sorts picks by bbox height, renames
#    to rock1/rock2/rock3 + tree1/tree2/pine, copies to assets/models/)
node tools/asset-gen/integrate.mjs --compress
```

The whole loop — bake variations, review in gallery, pick, integrate — is byte-stable across machines because every recipe is seeded.

## The four tools

### `tools/bake-rocks.mjs` — primitive rock bake (16 recipes)

Reads recipes from [`tools/bake-rocks/recipes.mjs`](../bake-rocks/recipes.mjs). Each is an IcosahedronGeometry seed + 3D simplex displacement + non-uniform scale + AO-baked vertex colors → GLB. The 16 recipes span small pebbles → tall jagged spires, with diverse colors and silhouettes.

```bash
npm run bake-rocks                                           # → staging/rocks/
npm run bake-rocks -- --out=assets/models/rocks              # bypass gallery, write directly to committed
```

**Adding a recipe:** edit `recipes.mjs`, append a new entry. The bake script bakes ALL recipes; the gallery review picks 3.

**Knobs:** `radius`, `displacementAmp`, `noise.{freq1,freq2,weight2}`, `scale.{x,y,z}`, `color`, `targetHeight`. The recipes file documents what each does.

### `tools/bake-trees.mjs` — EZ-Tree bake (12 presets)

Reads recipes inline from `bake-trees.mjs`. Drives `@dgreenheck/ez-tree` with all 12 presets (Ash/Aspen/Oak/Pine × S/M/L) and SDS-specific tweaks (untextured flat-shaded brown bark, halved branch tessellation, denser leaves).

```bash
npm run bake-trees                                           # → staging/trees/
npm run bake-trees -- --out=assets/models/trees              # write directly to committed
```

Recipe shape: `{ name, preset, seed, normalizeHeight, tweaks }`. The recipe helper at the top of `bake-trees.mjs` makes adding species/scale variants a one-liner. After integrate.mjs renames picks to `tree1.glb / tree2.glb / pine.glb`.

### `tools/asset-gallery.mjs` — visual GLB picker

Browser-based gallery. Recursively scans the directory and shows a thumbnail grid, large orbit-controlled preview on the right. ★ or `space` to toggle a pick, `s` to save. Per-card stats: triangle count, bounding box, materials, file size. Category filter dropdown when GLBs are organized into subfolders (rocks/trees/flora).

```bash
npm run gallery                                          # default: tools/asset-gallery/staging/
npm run gallery -- --dir=tools/asset-gallery/staging/rocks   # one category at a time
npm run gallery -- --dir=assets/models/trees                  # browse the committed pool
npm run gallery -- --port=4321                                # custom port
```

**Keyboard:** `←/→` navigate · `space` toggle pick · `s` save picks. Picks save to `tools/asset-gallery/picks.json`.

### `tools/asset-gen/integrate.mjs` — picks → committed assets

Reads picks.json, sorts by bbox height, renames to canonical loader names (rock1/2/3 by ascending size; tree1/tree2/pine the same way), copies into `assets/models/<category>/`. Prints a summary + suggested `PROP_VARIANTS` patches for any flora picks.

```bash
node tools/asset-gen/integrate.mjs               # copy + rename picks
node tools/asset-gen/integrate.mjs --compress    # also draco-compress after copy
node tools/asset-gen/integrate.mjs --dry-run     # show what would be copied
```

**Important:** the loader at [`js/TerrainBuilder.js`](../../js/TerrainBuilder.js) reads `rock1.glb / rock2.glb / rock3.glb` by literal path, and [`js/GameAssetLoader.js`](../../js/GameAssetLoader.js) reads `tree1.glb / tree2.glb / pine.glb` the same way. The integrate script renames picks to those names so the loader keeps working unchanged. If picks > slots, the extras keep their descriptive names — you'd need to widen the loader array manually.

## Optional escape hatch: turnkey 3D AI (Meshy)

If the primitive bakes' output ceilings out and you want AI-generated meshes:

```bash
export MESHY_API_KEY=$(grep ^MESHY_API_KEY= ~/.config/mk-agent/env | cut -d= -f2)
npm run gen:meshy -- --set=rocks --count=8     # text-to-GLB via Meshy API
```

`tools/asset-gen/meshy.mjs` is a kept-in-tree bridge for that path; prompt sets at `tools/asset-gen/prompts/`. Outputs land in `tools/asset-gallery/staging/<category>/` alongside the primitive-bake GLBs, so the gallery + integrate flow handles them identically.

This isn't the primary path. Matt's note: prefer extending the in-repo bakes (recipes we own end-to-end) over external paid 3D AI services. Use Meshy when the primitive recipes really can't get there.

## Why this layout

- **Bake → review → pick → integrate** is one consistent loop regardless of source. Drop GLBs from anywhere into `tools/asset-gallery/staging/<category>/` and the gallery + integrate scripts work the same.
- **Gallery is visual-first.** The 5-second loop of "thumbnail → orbit-inspect → pick or skip" beats reading filenames + bbox stats every time.
- **Picks file is a human contract.** `picks.json` is plain JSON; you can edit by hand, diff it, commit it for reproducibility.
- **Recipes are committed code.** Every variant is reproducible from `(EZ-Tree version, seed)` for trees or `(simplex-noise, seed, knobs)` for rocks. No drift across machines.
- **Loader-name canonicalization is explicit.** `integrate.mjs` renames picks to `rock1/2/3` + `tree1/tree2/pine` so the runtime loader doesn't care which variant you picked.

## Things to remember

- `tools/asset-gallery/staging/` is gitignored. Stage runs are not committed — only the picked + integrated assets at `assets/models/...` are.
- `picks.json` is committed when present (it documents pick decisions). Re-run `integrate.mjs` whenever the picks file changes.
- The `compress-glbs` cache at `assets/_originals/` may need invalidation when re-baking trees (`rm assets/_originals/models/trees/*.glb` first). Documented in [`docs/tree-pipeline.md`](../../docs/tree-pipeline.md).
- ScatterSystem variant weights must sum to ~100 across the array. Flora picks need their `targetHeight` and `weight` hand-tuned per integrate.mjs's printed diff.
- Tree-asset additions also require updating `tests/tree-assets.spec.js` `TREE_FILES` (the spec pins the loader contract).

## See also

- [`docs/tree-pipeline.md`](../../docs/tree-pipeline.md) — the seed→GLB tree pipeline contract
- [`tools/bake-rocks/recipes.mjs`](../bake-rocks/recipes.mjs) — the 16 rock recipes
- [`tools/bake-trees.mjs`](../bake-trees.mjs) — the 12 EZ-Tree recipes (inline)
- [`js/ScatterSystem.js`](../../js/ScatterSystem.js) — runtime that consumes scatter GLBs
- [`js/TerrainBuilder.js`](../../js/TerrainBuilder.js) — runtime rock + tree placement
