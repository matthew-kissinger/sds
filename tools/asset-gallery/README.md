# SDS asset gallery + AI generation pipeline

> Cycle 15 Phase 1. Pipeline for generating, browsing, and integrating GLB asset variations (rocks, trees, scatter flora) into the SDS asset pool. Replaces the procedural icosa+simplex rock bake with a curated AI-driven flow.

## TL;DR

```bash
# 1. Generate variations (Meshy AI; needs MESHY_API_KEY in env)
npm run gen:meshy -- --set=rocks --count=10

# 2. View + pick the best (opens browser)
npm run gallery -- --dir=tools/asset-gallery/staging/rocks

# 3. Wire picks into committed assets
node tools/asset-gen/integrate.mjs --compress
```

## The three tools

### `tools/asset-gallery.mjs` — visual GLB picker

Browser-based gallery. Renders thumbnails for every GLB in a directory, large orbit-controlled preview on the right, click ★ or hit `space` to toggle a pick. `s` saves picks to `tools/asset-gallery/picks.json`.

```bash
npm run gallery                              # default: tools/asset-gallery/staging/
npm run gallery -- --dir=assets/models/rocks  # browse the committed pool instead
npm run gallery -- --port=4321                # custom port
```

Keyboard: `←/→` navigate · `space` toggle pick · `s` save picks. The viewer shows triangle count, bounding box, material count, and file size for each GLB so you can flag oversized assets before they ship.

### `tools/asset-gen/meshy.mjs` — Meshy AI text-to-GLB batch

Reads a prompt set from `tools/asset-gen/prompts/<set>.json`, runs each prompt through Meshy's `preview → refine` flow (AI-Studio-managed two-stage pipeline), downloads the resulting GLBs into `tools/asset-gallery/staging/<subdir>/`.

```bash
npm run gen:meshy -- --set=rocks --count=8        # 8 rock variations
npm run gen:meshy -- --set=trees                  # all 12 tree prompts
npm run gen:meshy -- --set=flora --skip-refine    # preview only (faster, untextured)
npm run gen:meshy -- --set=rocks --dry-run        # preview the request bodies
```

**Required env:** `MESHY_API_KEY` (workspace key from app.meshy.ai → API). Stored in `~/.config/mk-agent/env`; load with:

```bash
export MESHY_API_KEY=$(grep ^MESHY_API_KEY= ~/.config/mk-agent/env | cut -d= -f2)
```

**Cost:** Meshy refine takes ~60-90s and consumes ~5-10 credits per task at the time of writing. The dry-run mode lets you batch-tune prompts without burning credits.

**Prompt sets:** `prompts/rocks.json`, `prompts/trees.json`, `prompts/flora.json`. Each defines `stylePrefix`, `polycount` ceiling, and a `prompts[]` array. Edit these directly to add new variations or tune the style direction.

### `tools/asset-gen/integrate.mjs` — picks → committed assets

Reads `picks.json`, copies the picked GLBs into the canonical asset locations (`assets/models/rocks/`, `assets/models/scatter/`, etc.), then prints suggested PROP_VARIANTS / loader patches.

```bash
node tools/asset-gen/integrate.mjs               # copy picks
node tools/asset-gen/integrate.mjs --compress    # also draco-compress after copy
node tools/asset-gen/integrate.mjs --dry-run     # show what would be copied
```

The script stops short of editing `js/ScatterSystem.js` automatically — variant weights and per-prop `targetHeight` need a human eye, and a printed diff is faster to review than a silent rewrite.

## Optional: image-to-3D path

Meshy also supports image-to-3D (more controlled output than text-to-3D — you generate a concept image first, then convert). The pipeline is:

1. Generate concept image(s) via your tool of choice — Pixel Forge 3D (Imagen + Gemini Flash), Midjourney, ChatGPT image gen, etc. The web Pixel Forge harness ([dev.to writeup](https://dev.to/ha3k/ai-3d-asset-generator-3280)) generates 10 concept variations per prompt; useful when you want to iterate visually before committing to mesh generation.
2. Drop the PNGs into a folder.
3. POST each image to Meshy's `/openapi/v1/image-to-3d` endpoint (similar shape to text-to-3D, with `image_url` instead of `prompt`).

Not yet wired into `meshy.mjs` — the text-to-3D flow is enough for the first round of Phase 1 picks. If we hit a quality ceiling, add image-to-3D as a `meshy-image.mjs` sibling.

## Why this layout

- **Gallery is visual-first.** The 5-second loop of "look at thumbnail → orbit-inspect → pick or skip" beats reading filenames and bbox stats every time. The gallery shows tris + bbox + materials so you can flag oversized assets without dropping into Blender.
- **Picks file is a human contract.** `picks.json` is plain JSON; you can edit it by hand, diff it, commit it for reproducibility. The integration script reads it and prints a diff for review.
- **Two-stage Meshy flow is documented.** Preview is fast + untextured; refine adds PBR. `--skip-refine` is for batch prompt-tuning when you don't care about textures yet.
- **Prompt sets are JSON, not code.** Easy to fork a set, add a category, or hand-edit prompts without touching the generator code.

## Things to remember

- `tools/asset-gallery/staging/` is gitignored. Generation runs are not committed — only the picked + integrated assets at `assets/models/...` are.
- `picks.json` IS committed (it documents the pick decisions). Re-run integrate.mjs whenever the picks file changes.
- The `compress-glbs` cache in `assets/_originals/` may need invalidation when re-baking (same trap as the tree pipeline — see `docs/tree-pipeline.md` § Re-baking).
- ScatterSystem variant weights must sum to ~100 across the array. If you add 4 picks, drop 4 weights elsewhere or rebalance proportionally.
- Tree-asset additions also require updating `tests/tree-assets.spec.js` `TREE_FILES` (the spec pins the loader contract).

## See also

- [`docs/tree-pipeline.md`](../../docs/tree-pipeline.md) — the seed→GLB tree bake (separate path, EZ-Tree based)
- [`tools/bake-trees.mjs`](../bake-trees.mjs) — programmatic tree bake (no AI)
- [`tools/bake-rocks.mjs`](../bake-rocks.mjs) — procedural icosa+simplex rock bake (Cycle 14 Phase 4 — superseded by this AI pipeline for new rocks, but still useful for parametric variation)
- [`js/ScatterSystem.js`](../../js/ScatterSystem.js) — runtime that consumes scatter GLBs
