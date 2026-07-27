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
assets/_originals/models/trees/*.glb   ← uncompressed originals (backup cache; LOD2 impostor bake source)
        │
        ├─────────────────────────────────────────────┐
        ▼                                             ▼
TerrainBuilder.loadModels()            tools/bake-tree-impostors.mjs (Cycle 20)
        │                                             │  (calls Pixel Forge / Kiln CLI)
        │                                             ▼
        │                          assets/models/trees/<name>.imposter.{png,normal.png,depth.png,json}
        │                                             │
        ▼                                             ▼
TerrainBuilder tree LOD chain  ←  Cycle-20 LOD2: kiln-impostor-material reads sidecar + samples atlases
```

The runtime never generates a tree from scratch. All variation comes from the seed → bake pipeline. The Cycle-20 impostor atlases are also seed → bake-time and pinned by `tests/imposter-sidecar.spec.js`.

## Recipes

The active shipped tree set has two canonical GLBs. `tools/bake-trees.mjs`
can still bake the broader candidate matrix, but production integration is
controlled by `tools/asset-gallery/picks.json`.

| File | Preset | Seed | Visual role |
| --- | --- | --- | --- |
| `tree1.glb` | Aspen Small | 11 | Slim vertical silhouette — pasture scenes |
| `tree2.glb` | Oak Medium | 17 | Broad canopy anchor — Field + RH |

> **Source of truth** for the canonical tree mapping is [`tools/asset-gallery/picks.json`](../tools/asset-gallery/picks.json). The seeds above match `tools/bake-trees.mjs` `SEEDS[species][scaleIdx]` for the scale chosen in picks. Cycle 21 Phase 0 corrected this table — prior entries listed Aspen Medium / seed 7 (and similar drift on the other two), which never matched the source.

The active tree recipes share `STYLIZED_BARK` (untextured + flat-shaded brown
bark, halved branch tessellation, leaf count tuned for a fuller silhouette than
EZ-Tree's defaults). Per-recipe `bark.tint` and `branch.children` overrides
differentiate the species.

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
npm test -- tests/tree-assets.spec.js      # verify active LOD0/LOD1 GLBs exist, are non-empty, and fit the size ceiling
node tools/konveyor-tree-refresh-baseline.mjs --refresh-upstream
```

The `--refresh-upstream` flag records live npm and GitHub changelog evidence in
the Konveyor baseline. If network is unavailable, run the tool without the flag
and treat the upstream fields as the last static observation, not current truth.

## Marketing recapture prep

Before the next screenshot/video capture pass, update tree assets as an intentional visual change rather than treating capture framing as the only problem:

1. Check the current `@dgreenheck/ez-tree` release and adopt the latest acceptable update.
2. Capture the current asset contract with `node tools/konveyor-tree-refresh-baseline.mjs --refresh-upstream`; the committed Konveyor packet lives at [`cycle36-validation/runtime/tree-refresh-baseline.json`](../cycle36-validation/runtime/tree-refresh-baseline.json).
3. Re-bake GLBs through the normal cache-invalidation flow above.
4. Re-run impostor baking if the GLB silhouette, canopy density, trunk profile, or material output changes.
5. Review Sheep Dog Island and Open Country from the main gameplay/capture cameras and verify trees do not read as too close together. No pair should visually merge into a single blob, hide the dog/sheep action, or block the hero camera path.
6. If spacing changes are needed, make them in the deterministic placement path and verify with `npm test -- tests/tree-placement.spec.js` plus a browser screenshot review.

As of the 2026-05-15 live refresh, SDS already resolves the npm latest
`@dgreenheck/ez-tree` 1.1.0. Upstream `main` has unreleased tree-output
candidates for softer leaf normals, corrected growth force, and stratified
branch/leaf placement. Do not chase unreleased `main` by hand in production
assets; either wait for a package release or create a deliberate, commit-pinned
candidate bake with gallery, material, impostor, visual, perf, and native gates.

## Loader contract

`js/TerrainBuilder.js` is the single runtime owner for active tree GLBs. Its
`loadModels()` promise is also used by the entrance idle prefetch, so prefetch
and scene construction share the same loader/cache rather than fetching a
second catalog:

- `assets/models/trees/tree1.glb` - primary production species.
- `assets/models/trees/tree2.glb` - secondary production species.

If you add another production tree slot in `bake-trees.mjs`, also add it to
`TerrainBuilder.loadModels()`, add it to `TREE_FILES` in
`tests/tree-assets.spec.js`, and add it to the `TREES` list in
`tests/imposter-sidecar.spec.js` when it has an impostor. Total committed GLB
size must stay under the test ceiling; if you need more, raise the ceiling
deliberately rather than letting it drift.

## InstancedMesh2 quaternion gotcha

When wrapping these GLBs into `InstancedMesh2` instances (the codepath in `TerrainBuilder` post-Cycle-14), the entity API requires `quaternion`, NOT Euler `rotation`. `addInstances((entity, i) => { ... })` callbacks must do `entity.quaternion.setFromAxisAngle(...)` or `entity.quaternion.copy(...)`. Setting `entity.rotation.y = ...` is silently dropped. Documented in cycle-14 hotfix `a41f9a6`.

## GLB shared-material trap

When cloning a GLB asset via `SkeletonUtils.clone()` for placement, the clone shares its materials with the cache. Disposing the clone's materials wipes them on every other instance still in the scene. Tag with `userData.sharedFromGlbCache = true` and rely on remove-from-scene only — never traverse-and-dispose. The shader patch via `onBeforeCompile` (the leaf-wind animation) attaches to the SHARED material once and is correct for all instances.

## Cycle 20 — Pixel Forge / Kiln impostor bake

LOD2 atlases are generated by `npm run bake-tree-impostors` (Cycle 20 Phase 1).
The script shells out to the local Pixel Forge `kiln bake-imposter` CLI for
each active tree and writes four artifacts per tree under `assets/models/trees/`:

- `<name>.imposter.png` — albedo atlas (4×4 lat/lon hemi-y, 2048×2048, baseColor unlit)
- `<name>.imposter.normal.png` — capture-view-space normal aux atlas (Phase 2 relighting)
- `<name>.imposter.depth.png` — depth aux atlas (Phase 2 parallax + depth-discard ghost suppression)
- `<name>.imposter.json` — Kiln sidecar (azimuths, elevations, worldSize, yOffset, ...)

### One-time install

Pixel Forge is checked out as a local sibling of this repo at `../pixel-forge`. From there:

```bash
cd ../pixel-forge
bun install
```

`tools/bake-tree-impostors.mjs` invokes `node_modules/.bin/tsx` (Node) directly to run the CLI source — see "Windows install gotcha" below.

### Re-baking impostors

```bash
npm run bake-tree-impostors    # writes 8 files (2 trees × 4 artifacts)
npm test -- tests/imposter-sidecar.spec.js   # verify schema contract
```

The bake reads from `assets/_originals/models/trees/*.glb` (the pre-Draco-compressed sources), so the GLB re-bake's `_originals/` rm gotcha applies here too — re-bake GLBs first, then re-bake impostors.

### Windows install gotcha — bun + Playwright + impostor bake

`bun run` of the Pixel Forge CLI hangs on Playwright's CDP-pipe handshake on Windows: the Chromium subprocess spawns successfully (you'll see `<launched> pid=NNN` in the log) but the launch never completes within 180s. Workaround: `tools/bake-tree-impostors.mjs` invokes the CLI through the Pixel Forge checkout's `node_modules/.bin/tsx` (Node-based) rather than `bun run`. This is automatic — no per-machine config required — but if you ever invoke `pixelforge` directly from a shell you'll hit the same issue. Use `npx tsx ../pixel-forge/packages/cli/src/index.ts kiln bake-imposter ...` instead.

### Q2 verdict — 16 hemi-y locked

Cycle 20 Phase 0 ran a 2D barycentric simulation of the runtime shader and corroborated against shipping AAA precedent (Ghost of Tsushima 4×4 + parallax, Horizon FW 3×3 + parallax). 16 hemi-y atlases produce visually-smooth orbits with proper barycentric blend (max/median ratio ≈ 1.02). Saves ~15 MB committed atlas data vs 32 hemi-y. Reasoning + research citations in `cycle20-validation/phase0/AUDIT.md`. Reserve the right to escalate to 32 if Phase 2 Layer F shows a step parallax can't close.

## What NOT to do

- Don't generate another production tree at runtime via EZ-Tree directly. The deterministic seed contract requires the bake to be the single source of truth.
- Don't edit GLB files by hand. Re-author the recipe and re-bake.
- Don't bypass the `_originals/` rm step on re-bake. The compress-glbs cache will silently replay stale bytes.
- Don't add a recipe without also updating `TerrainBuilder.loadModels()` AND `tests/tree-assets.spec.js`.
- Don't gate tree placement on runtime randomness; use seeded `mulberry32(seed)` from `shared/Random.js` so client + Worker compute identical positions.
- Don't bake impostors from `assets/models/trees/*.glb` (the Draco-compressed runtime path). Pixel Forge's harness has no `DRACOLoader` and will error. Always bake from `assets/_originals/models/trees/*.glb`.
- Don't invoke Pixel Forge via `bun run` on Windows — Playwright CDP handshake hangs. Use the bake script (`npm run bake-tree-impostors`) which routes through Node + tsx.
- Don't add another production tree without also adding it to `TREES` in `tools/bake-tree-impostors.mjs` AND the `TREES` list in `tests/imposter-sidecar.spec.js`.
