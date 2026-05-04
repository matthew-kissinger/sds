# Next Session — Cycle 16 Phases 1-5 closed; Phase 6 (hero cards + v1.1.0) awaits keyboard session

> Updated 2026-05-04 (cycle-16 close pending Phase 6). **Active plan: [`docs/cycle-16-plan.md`](docs/cycle-16-plan.md).** Companion docs: [`docs/cycle-16-tree-research.md`](docs/cycle-16-tree-research.md) (decision brief), [`docs/cycle-16-tree-gallery-review.md`](docs/cycle-16-tree-gallery-review.md) (per-variant pros/cons + how to swap), [`docs/cycle-16-phase-6-prep.md`](docs/cycle-16-phase-6-prep.md) (hero cards + v1.1.0 keyboard workflow). Live on [sheepdogsim.com](https://sheepdogsim.com). All deploy + e2e + perf-check jobs green.

## Where the project stands (cycle 16 close pending Phase 6)

Cycle 16 ran autonomous through Phases 1-5 in one pass. Phase 6 (hero cards + v1.1.0 tag) needs Matt at the keyboard for `__sdsCinema.freeFly()` posing. Two follow-up bugs Matt flagged during gallery review (mobile bottom-bar overlap + auto-refresh-back-to-home) are also fixed in this pass.

Headlines from autonomous Cycle 16 pass:

- **Research spike + decision brief ✅.** [`docs/cycle-16-tree-research.md`](docs/cycle-16-tree-research.md) surveys 8 techniques (A-H from EZ-Tree recipe re-tune through PIF and WebGPU port) and pins **A+B+E** as the chosen path: recipe re-tune at LOD0 + `InstancedMesh2.addLOD` chain + existing 3-quad cross-billboard. Octahedral impostors + PIF deferred to long-tail (different aesthetic / different pipeline).
- **Phase 1+2 ✅.** Per-instance LOD chain wired in [`js/TerrainBuilder.js`](js/TerrainBuilder.js): LOD0 (full mesh, 0-80m) → LOD1 (reduced canopy, 80-150m) → LOD2 (cross-billboard impostor, 150m+). Trunk's LOD2 is a degenerate 3-vert geom since the cross-billboard texture already shows the trunk silhouette. **Retired** the Cycle 14 world-distance-from-origin split (`FAR_LOD_DIST=400m`, set once at scene load) — the chase camera moving through the scene now smoothly upgrades trees per-instance per-frame instead.
  - Recipe re-tune: `leaves.billboard='single'` (caught a casing bug — EZ-Tree expects lowercase strings; capital-case was silently ignored), leaves.count 40-72→24-42, bark tints tightened to 0x4a-0x8c brown family (Q1 resolution), seeds re-rolled per recipe (Q2 resolution).
  - LOD1 sibling GLBs ship in `assets/models/trees/{tree1,tree2,pine}_lod1.glb` — ~25-30% the LOD0 tris.
- **Gallery + autonomous picks ✅.** 36-GLB matrix baked into staging (24 LOD0 candidates — 4 species × 3 scales × 2 billboard modes — plus 12 LOD1). Auto-picked: `aspen_medium_single` → tree1, `oak_medium_single` → tree2, `pine_medium_single` → pine + matching LOD1 siblings. Each pick has explicit `canonicalName` in [`tools/asset-gallery/picks.json`](tools/asset-gallery/picks.json) (the natural bbox-height sort doesn't fit the species-based slot semantics). Total committed trees: **6 GLBs / 1.59 MB post-draco** (4 MB ceiling).
- **Phase 3 ✅.** Rock picks: `pebble_oval_chunky` → rock1, `boulder_chunky_mid` → rock2, `craggy_chunk_warm` → rock3 (39 KB total post-draco). Flora tuning: `oversampleFraction` 0.05→0.10 (visible dandelion clusters), mushroom `targetHeight` 0.30/0.35 → 0.50 (readable at sheep-cam).
- **Phase 4 ✅.** Linux baseline captured by `perf-baseline-bot` via `workflow_dispatch capture_baseline: true` and committed at `tests/perf-baseline/baseline.json` (commit `1b62fe0`). Numbers reflect ubuntu-latest swiftshader software-WebGL — significantly slower than dev workstations (avg ~3.8s/frame on extreme), but the ±5% threshold absorbs runner noise.
- **Phase 5 ✅.** [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) ships `perf-baseline-capture` (workflow_dispatch-only — re-trigger with `capture_baseline: true` to refresh baseline) and `perf-check` (now gates every push). CI fix: bypass the broken root `dev:setup` / `dev:worker` npm scripts (they `cd worker && wrangler ...` which loses npm bin-PATH in CI) by calling `npx wrangler` directly.
- **Phase 6 prep doc ✅.** [`docs/cycle-16-phase-6-prep.md`](docs/cycle-16-phase-6-prep.md) captures the exact 7-deliverable workflow (3 OG cards + 4 cinematic videos + v1.1.0 tag).
- **Bug fixes shipped during this cycle's review pass:**
  - Mobile bottom-bar overlap (about/github links bleeding into menu buttons on short viewports) → [`js/components/App.js`](js/components/App.js): credits div now uses safe-area-inset-bottom + larger mobile font + 14px top buffer; menu-center has explicit `padding-bottom` so the mode-grid never bleeds into the footer.
  - Auto-refresh-back-to-home mid-interaction → [`index.html`](index.html): SW `controllerchange` listener used to call `location.reload()` immediately when a new deploy landed, yanking the user out of mid-click. Now defers the reload until `visibilitychange → hidden` (next tab-switch / minimise / close), so the new bundle loads invisibly on the next visit.

174/174 vitest pass. Production build clean.

## Cycle 16 — what's left

### 1. Hero cards + v1.1.0 (Phase 6) — keyboard session

[`docs/cycle-16-phase-6-prep.md`](docs/cycle-16-phase-6-prep.md) has the exact workflow. Needs Matt at the keyboard with mouse for `__sdsCinema.freeFly()` posing. The Phase 6 prep doc walks through:
- 3 OG cards (`og-rh-sunset`, `og-field`, `og-open-country`) — open URL → Solo Extreme → freeFly + snapshotPose → paste into `tools/cinematic/shot-list.mjs` → `npm run cinema --shot=<id>`.
- 4 cinematic videos (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`) — iterate framing on the polished post-LOD-chain world.
- Tag `v1.1.0` after all 7 deliverables land cleanly.

Phases 1-5 acceptance is met (perf-check is now gating every push). The remaining hard stop on tagging `v1.1.0` is "no visible LOD pop at typical play distances on any scene" — confirm during the cinematic-video shoot.

### 2. Optional polish — visual review of the gallery picks

The gallery review doc lists what's worth a real eye:
- Aspen vs Ash for the `tree1` slim slot
- Pine size — `pine_medium_single` vs `pine_large_single` for OC horizon
- Bark coherence across species
- LOD0 → LOD1 pop visibility at 80m during chase-cam tracking
- LOD1 → LOD2 (cross-billboard) pop visibility at 150m

Swap path: edit [`tools/asset-gallery/picks.json`](tools/asset-gallery/picks.json) `canonicalName` fields, then `node tools/asset-gen/integrate.mjs --compress`. No code changes needed.

## How to drive the asset pipeline (Phase 1 swap path)

```bash
# Browse the 36-GLB gallery matrix
npm run gallery                                                # all subfolders
npm run gallery -- --dir=tools/asset-gallery/staging/trees     # LOD0 only (24 candidates)
npm run gallery -- --dir=tools/asset-gallery/staging/trees-lod1  # LOD1 only (12 candidates)

# Re-bake from scratch (~9 min for full 36-GLB matrix)
npm run bake-trees                  # all 36
npm run bake-trees -- --set=lod0    # 24 LOD0 only
npm run bake-trees -- --set=lod1    # 12 LOD1 only

# Wire picks → committed assets. Edit picks.json to add `canonicalName` per pick
# (the gallery's save flow doesn't emit canonicalName; bbox-height sort is the
# fallback but doesn't fit pine vs aspen vs oak slot semantics).
node tools/asset-gen/integrate.mjs --compress

# Verify
npm test -- tests/tree-assets.spec.js
```

The tree-assets spec pins both LOD0 and LOD1 sibling contracts — if a re-bake drops one, the test fails closed.

## Tuning knobs (1-line tweaks)

| Looks off? | Knob | File | Default |
| --- | --- | --- | --- |
| LOD0→LOD1 pop visible at 80m | `addLOD(lod1Geo, mat, 80)` distance | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 80m camera distance |
| LOD1→LOD2 pop visible at 150m | `addLOD(billboardGeo, mat, 150)` distance | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 150m camera distance |
| LOD1 too expensive on mobile | LOD1 `branch.children` + `leaves.count` | [`tools/bake-trees.mjs`](tools/bake-trees.mjs) | `LOD1_BRANCH_DEFAULT` + 0.5x leaves |
| Trees rattle too much / too still | `_treeWind.uWindStrength` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.6 desktop / 0 mobile |
| Tree bark color wrong | `BARK_TINTS[species][scale]` | [`tools/bake-trees.mjs`](tools/bake-trees.mjs) | per-species 0x4a-0x8c brown |
| Single-leaf canopy too sparse | `leaves.size` boost factor | [`tools/bake-trees.mjs`](tools/bake-trees.mjs) | 1.3x for single, 1.0x for double |
| Rocks too big / too small | `ROCK_NATIVE_HEIGHT` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.2m |
| Rocks float / sink | `ROCK_Y_SCALE` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.7 |
| Rim-light too strong / dull | `_rockShader.uRimStrength` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.35 |
| Scatter density sparse / dense | `minDist` | [`js/ScatterSystem.js`](js/ScatterSystem.js) | 4m desktop / 6m mobile |
| Yellow-flower clusters wrong | `oversampleFraction` | [`js/ScatterSystem.js`](js/ScatterSystem.js) | 0.10 (was 0.05 pre-cycle-16) |
| Mushrooms unreadable at sheep-cam | `targetHeight` in `PROP_VARIANTS` | [`js/ScatterSystem.js`](js/ScatterSystem.js) | 0.50m (was 0.30/0.35 pre-cycle-16) |

Re-baking trees: edit recipes/seeds in [`tools/bake-trees.mjs`](tools/bake-trees.mjs), then `rm assets/_originals/models/trees/*.glb && npm run bake-trees && npm run compress-glbs`. The `_originals/` rm is required to invalidate the compress-glbs backup cache (cycle 14 finding, commit `39f44fb`).

## Standing risks (carried forward)

- **Sim-baseline fixtures one-way.** Don't regenerate without understanding the diff. Cycles 5-16 left them bit-identical.
- **`?cinematic=1` flips `preserveDrawingBuffer`.** Documented perf hit. Any change letting the flag affect normal play is a Hard Stop.
- **GLB shared-material trap (Cycle 11+12 finding).** Any new code creating an `InstancedMesh` from a cached GLB's `child.geometry` + `child.material` must tag with `userData.sharedFromGlbCache = true` and rely on remove-from-scene only. Cycle 16's LOD chain follows this: trunk + leaves InstancedMesh2 share the LOD0 material across LOD0 + LOD1 entries (the leaf-wind shader patch attaches to the material once, correct for all LODs).
- **InstancedMesh2 entity API.** Entities in `addInstances` callback use `quaternion` (not Euler `rotation`). Cycle 14 hotfix `a41f9a6` documented this; Cycle 16's createTrees follows.
- **`scripts/compress-glbs.mjs` reads from `assets/_originals/` backup.** Re-baking GLBs requires `rm assets/_originals/models/trees/*.glb` first.
- **Mac white-ground bug.** Reproduces on Matt's specific Mac, not on GH `macos-latest` Safari. Environmental. Investigation pending Matt's `__sdsDiag` capture.
- **EZ-Tree billboard string casing.** Caught in cycle 16: EZ-Tree's `leaves.billboard` field expects lowercase `'single'` / `'double'`; capital-case is silently ignored. Codified in `tools/bake-trees.mjs` JSDoc comments and the new `tools/bake-trees.mjs:buildRecipe` helper.

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-16-plan.md`](docs/cycle-16-plan.md) — tree-foliage-lod-and-perf |
| Cycle 16 decision brief | [`docs/cycle-16-tree-research.md`](docs/cycle-16-tree-research.md) |
| Cycle 16 gallery review (per-variant pros/cons) | [`docs/cycle-16-tree-gallery-review.md`](docs/cycle-16-tree-gallery-review.md) |
| Cycle 16 Phase 6 keyboard workflow | [`docs/cycle-16-phase-6-prep.md`](docs/cycle-16-phase-6-prep.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-15-plan.md`](docs/archive/cycles/cycle-15-plan.md) |
| Prior closed cycles | [`docs/archive/cycles/cycle-14-plan.md`](docs/archive/cycles/cycle-14-plan.md), [`docs/archive/cycles/cycle-12-plan.md`](docs/archive/cycles/cycle-12-plan.md), [`docs/archive/cycles/cycle-11-plan.md`](docs/archive/cycles/cycle-11-plan.md) |
| Frozen files / fence rules | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Closed cycles + deferred items | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Slash commands | [`.claude/commands/`](.claude/commands/) — `/cycle-start`, `/cycle-close`, `/validate` |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player CHANGELOG | [`CHANGELOG.md`](CHANGELOG.md) |
| Press kit | [`PRESSKIT.md`](PRESSKIT.md) |
| Tree pipeline contract | [`docs/tree-pipeline.md`](docs/tree-pipeline.md) |
| Asset pipeline (gallery + integrate) | [`tools/asset-gallery/README.md`](tools/asset-gallery/README.md) |

## Running locally

First time on a fresh clone:

```
npm install
cp worker/.dev.vars.example worker/.dev.vars   # sets JWT_SECRET for local
npm run dev:setup                              # applies D1 migrations to local sqlite
```

Every session after that:

```
npm run dev    # starts Vite (:3000) + wrangler (:8787) together
```

To run cinematic captures locally:

```
npm install --save-dev sharp                                    # one-time
choco install ffmpeg  # or scoop install ffmpeg                 # one-time, system
npx playwright install chromium                                  # one-time
npm run cinema -- --skip-video --headed                          # render OG + dog + PWA stills
npm run cinema -- --shot=dog-into-sunset --headed                # iterate single shot
```

URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl` (probe), `?cinematic=1` (filming infra), `?ui=off` (hide React overlay), `?sun=0.5` (sun position), `?perfMode=1` (`__perfHarness` global for the perf harness driver).

## What NOT to do

- Don't rearchitect multiplayer. It works.
- Don't reintroduce procedural mountains. The right path is a height-displaced skirt.
- Don't add new scenes. Three is the right number.
- Don't touch `shared/MovementPhysics.js`'s `updateMovement` for obstacle composition — Cycle 6 deliberately put obstacle-force composition at the call site.
- Don't blow up `main.js` in one PR. Shrink one responsibility at a time.
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed and why.
- Don't hardcode grass-exclusion zones for non-Field scenes. Gate on `sceneDef?.farmHouse` and `sceneDef?.pasture`.
- Don't gate sprint *continuation* on `stamina >= minStaminaToSprint` — only sprint *start*.
- Don't traverse-and-dispose materials on GLB clones (SkeletonUtils.clone, .clone()) — they share materials with the cache. Tag with `userData.sharedFromGlbCache = true` and remove-from-scene only.
- Don't let `?cinematic=1` flip `preserveDrawingBuffer` on the normal-play codepath.
- Don't re-trigger the cinema runner without `--shot=<id>` during regular dev — committed OG/dog/PWA assets re-render with sub-pixel-different WebP encoding and create diff noise.
- **Cycle 16:** Don't tag `v1.1.0` until tree foliage LOD + asset picks + perf baseline land cleanly. The hero cards and tag should ship on a perf-clean polished world.
- **Cycle 16:** Don't replace EZ-Tree with the [Procedural Instanced Forest](https://discourse.threejs.org/t/procedural-instanced-forest-high-performance-real-trees/88610) unless `InstancedMesh2.addLOD` demonstrably misses the perf budget. PIF is interesting + MIT but a different aesthetic + pipeline.
- **Cycle 16:** Don't pass capital-case `'Single'` / `'Double'` strings to EZ-Tree's `leaves.billboard` — they're silently ignored. Use lowercase `'single'` / `'double'` (per `Billboard` enum's underlying string values).
