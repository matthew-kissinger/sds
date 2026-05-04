# Next Session — Cycle 17 (`mobile-hardening-lod-and-bundle-slim`) shipped end-to-end; ready for `/cycle-close`

> Updated 2026-05-04 (Cycle 17 ran autonomous end-to-end through all 7 phases). **Active plan: [`docs/cycle-17-plan.md`](docs/cycle-17-plan.md)** + research doc [`docs/cycle-17-research.md`](docs/cycle-17-research.md) (open-question resolutions). Headline finding: `_bakeTreeImpostor` was reading `Box3.setFromObject(modelClone)` against a gltf.scene that retained ~0.021× native Group scales, producing a ~30× undersized cross-billboard. Fix: reset every node's local transform after baking child world matrices into geometry. Mobile cross-billboards now render visibly at LOD2. e2e smoke spec gates the regression. Live on [sheepdogsim.com](https://sheepdogsim.com) at the cycle-16-close push (ship after this commit's CI passes). Last closed cycle: [`docs/archive/cycles/cycle-16-plan.md`](docs/archive/cycles/cycle-16-plan.md).

## Where the project stands (Cycle 16 close)

Cycle 16 ran end-to-end autonomous through Phases 1-5 in one pass. Tree foliage LOD chain shipped (per-instance `InstancedMesh2.addLOD`: LOD0 → LOD1 at 80m → cross-billboard impostor at 150m), retiring the Cycle 14 world-distance-from-origin split. Recipe re-tune layered on top (single-billboard leaves, halved leaf count, tightened bark, re-rolled seeds). Linux perf baseline captured + `perf-check` graduated to gate every push. Two bug fixes Matt flagged during gallery review (mobile bottom-bar overlap + auto-refresh-mid-interaction) shipped in the same pass. Phase 6 (hero cards + v1.1.0 tag) carryover — needs Matt at the keyboard for `__sdsCinema.freeFly()` posing.

Headlines from Cycle 16:

- **Decision brief ✅.** [`docs/cycle-16-tree-research.md`](docs/cycle-16-tree-research.md) surveyed 8 techniques and pinned A+B+E (recipe re-tune + addLOD chain + cross-billboard). Octahedral impostors + Procedural Instanced Forest deferred to long-tail.
- **Phase 1+2 ✅** Tree LOD chain wired in [`js/TerrainBuilder.js`](js/TerrainBuilder.js). Trunk + leaves InstancedMesh2 each get LOD0 → LOD1 (80m) → LOD2 (150m). Trunk's LOD2 = degenerate triangle since cross-billboard texture covers it. LOD1 sibling GLBs at `assets/models/trees/{tree1,tree2,pine}_lod1.glb` (~25-30% the LOD0 tris). Caught + documented an EZ-Tree casing bug — `'Single'/'Double'` capital-case is silently ignored; must be lowercase.
- **Phase 3 ✅** Rocks (gallery-reviewed: pebble_round_small / boulder_chunky_mid / spire_jagged_dark, 38 KB total post-draco) + flora tuning (oversampleFraction 0.05 → 0.10, mushroom targetHeight → 0.50).
- **Phase 4 ✅** Linux baseline at `tests/perf-baseline/baseline.json` (committed by `perf-baseline-bot`). Numbers reflect ubuntu-latest swiftshader (~3.8s/frame avg on extreme); ±5% threshold absorbs runner noise.
- **Phase 5 ✅** `perf-check` gates every push. CI fix bundled: bypass the broken root `dev:setup` / `dev:worker` npm scripts (they `cd worker && wrangler ...` which loses npm bin-PATH in CI) by calling `npx wrangler` directly. Side-effect win: long-standing E2E flakiness unblocked too.
- **Bug fixes shipped during review pass:**
  - Mobile bottom-bar overlap (about/github links bleeding into menu buttons on short viewports) → [`js/components/App.js`](js/components/App.js): credits div uses safe-area-inset-bottom + larger mobile font + 14px top buffer; menu-center has explicit padding-bottom.
  - Auto-refresh-back-to-home mid-interaction → [`index.html`](index.html): SW `controllerchange` listener now defers reload until `visibilitychange → hidden` (next tab-switch / minimise / close) instead of yanking the user mid-click.

174/174 vitest pass. Production build clean (817 KB main / 241 KB gzip — flat vs Cycle 15; the chunk-size warning here is what motivates Cycle 17's slug).

## Cycle 17 — what to pick up next

Plan at [`docs/cycle-17-plan.md`](docs/cycle-17-plan.md). 7 phases, all grounded in regressions Matt flagged during the Cycle 16 deploy review. Run `/cycle-start` to orient.

Slug: `mobile-hardening-lod-and-bundle-slim` (renamed from `bundle-slim` after the regression intake — bundle-slim becomes Phase 7). The hardening is the gate: don't tag `v1.1.0` until Phases 1-4 land cleanly.

**Phase summary:**
1. **Mobile asset visibility audit** (~3-4hr, foundation) — trees / rocks / flora invisible at distance on mobile classic camera; root-cause via mobile-probe harness + e2e smoke spec.
2. **White-bark tree + bark coherence** (~2hr) — one stray "white bark, tall and skinny, few branches" tree in the live build; likely cross-billboard impostor lighting washout (white ambient 0.55 + dirLight 0.85 = 1.4× washout) but recipe-level `bark.tint` not applied also possible.
3. **Grass anomalies** (~3-4hr) — skyward grass blades near trees recurring (Cycle 15's `Number.isFinite` clamp fixed placement Y; theory: shared-material trap leaks tree-wind shader patch into grass material). Plus OC grass only in middle of island, not extending to edge — generation radius hardcoded ~250m, OC island is 380m.
4. **Portrait-mobile HUD layout** (~2-3hr) — camera-mode toggle button overlaps time/score on portrait. General portrait UX audit while we're there (iPhone SE 375×667, iPhone 14 390×844, Android 360×780, iPad 768×1024).
5. **LOD chain extensions + culling sync** (~5-7hr) — Matt observed culling out-of-sync with camera; needs profiling. Plus more LOD tiers including octahedral impostor evaluation via local **Pixel Forge Kiln** (`pixelforge kiln bake-imposter ./tree.glb --out ./tree.png --angles 16` per [`pixel-forge/docs/kiln-vision.md`](file:///C:/Users/Mattm/X/games-3d/pixel-forge/docs/kiln-vision.md)).
6. **OC portal scales to total sheep** (~1-2hr) — currently hardcoded `requiredSheep: 40`; should be ~40% of mode count (Classic 200→80, Extreme 1000→400, Insane 3000→1200, Chaos 5000→2000). Schema change to `CorralDef.requiredSheepFraction` + `requiredSheepMin`.
7. **Bundle slim** (~4-6hr, deferred from cycle's original framing) — main.js 817 KB / 241 KB gzip flagged by Vite chunk-size warning; dynamic-import the deferred React panels (Multiplayer, Leaderboard, Settings, Sandbox).

**Open questions (5 in the plan; settle at `/cycle-start`):** octahedral pipeline (Kiln vs internal), mobile-invisibility root cause, white-bark origin, OC portal formula, grass-stretch mechanism, bundle-slim strategy.

Standing alternatives if Cycle 17 scope shifts:
- `webgpu-tsl-spike` — port grass + tree-leaf shader math to TSL; bring up WebGPU renderer with WebGL fallback
- `grass-render-texture-trample` — per-blade RT ping-pong for sheep trample recovery
- `procedural-instanced-forest-eval` — measure PIF perf vs current LOD chain on the actual scene
- `mac-white-ground-bug` — investigate Matt's Mac-specific repro

## Cycle 16 carryover (do whenever — not Cycle 17 phases)

### Phase 6 — Hero cards + v1.1.0 (keyboard session)

[`docs/cycle-16-phase-6-prep.md`](docs/cycle-16-phase-6-prep.md) has the exact workflow:
- 3 OG cards (`og-rh-sunset`, `og-field`, `og-open-country`) — open URL → Solo Extreme → `await __sdsCinema.freeFly()` + `__sdsCinema.snapshotPose()` → paste into `tools/cinematic/shot-list.mjs` → `npm run cinema --shot=<id>`.
- 4 cinematic videos (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`) — iterate framing on the polished post-LOD-chain world.
- Tag `v1.1.0`: `npm version 1.1.0 -m "..."` + bump worker/package.json + append CHANGELOG + `git push origin main --tags`.

**Hard stop on tagging:** confirm no LOD pop visible at typical play distances during the cinematic-video shoot. If popping shows, raise distances to 100m / 180m (one-line edits in [`js/TerrainBuilder.js`](js/TerrainBuilder.js)).

### Optional polish — gallery picks visual review

[`docs/cycle-16-tree-gallery-review.md`](docs/cycle-16-tree-gallery-review.md) lists what's worth a real eye:
- Aspen vs ash for tree1 slim slot
- Pine size — pine_medium_single vs pine_large_single for OC horizon
- Bark coherence across species
- LOD1 → LOD2 (cross-billboard) pop at 150m

Swap path: edit [`tools/asset-gallery/picks.json`](tools/asset-gallery/picks.json) `canonicalName` fields, then `node tools/asset-gen/integrate.mjs --compress`. No code changes needed.

## How to drive the asset pipeline

```bash
# Browse the 36-GLB gallery matrix
npm run gallery                                                # all subfolders
npm run gallery -- --dir=tools/asset-gallery/staging/trees     # LOD0 only (24 candidates)
npm run gallery -- --dir=tools/asset-gallery/staging/trees-lod1  # LOD1 only (12 candidates)

# Re-bake from scratch (~9 min for full 36-GLB matrix)
npm run bake-trees                  # all 36
npm run bake-trees -- --set=lod0    # 24 LOD0 only
npm run bake-trees -- --set=lod1    # 12 LOD1 only

# Wire picks → committed assets. Edit picks.json's canonicalName per pick.
node tools/asset-gen/integrate.mjs --compress

# Verify
npm test -- tests/tree-assets.spec.js
```

## Tuning knobs (1-line tweaks)

| Looks off? | Knob | File | Default |
| --- | --- | --- | --- |
| LOD0→LOD1 pop visible at 80m | `addLOD(lod1Geo, mat, 80)` distance | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 80m camera distance |
| LOD1→LOD2 pop visible at 150m | `addLOD(billboardGeo, mat, 150)` distance | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 150m camera distance |
| LOD1 too expensive on mobile | LOD1 `branch.children` + `leaves.count` | [`tools/bake-trees.mjs`](tools/bake-trees.mjs) | `LOD1_BRANCH_DEFAULT` + 0.5x leaves |
| Trees rattle too much / too still | `_treeWind.uWindStrength` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.6 desktop / 0 mobile |
| Tree bark color wrong | `BARK_TINTS[species][scale]` | [`tools/bake-trees.mjs`](tools/bake-trees.mjs) | per-species 0x4a-0x8c brown |
| Single-leaf canopy too sparse | `baseSize` per species + single boost | [`tools/bake-trees.mjs`](tools/bake-trees.mjs) | 1.6 deciduous / 1.2 pine; ×1.25 single |
| Rocks too big / too small | `ROCK_NATIVE_HEIGHT` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.2m |
| Rocks float / sink | `ROCK_Y_SCALE` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.7 |
| Rim-light too strong / dull | `_rockShader.uRimStrength` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.35 |
| Scatter density sparse / dense | `minDist` | [`js/ScatterSystem.js`](js/ScatterSystem.js) | 4m desktop / 6m mobile |
| Yellow-flower clusters wrong | `oversampleFraction` | [`js/ScatterSystem.js`](js/ScatterSystem.js) | 0.10 (was 0.05 pre-cycle-16) |
| Mushrooms unreadable at sheep-cam | `targetHeight` in `PROP_VARIANTS` | [`js/ScatterSystem.js`](js/ScatterSystem.js) | 0.50m (was 0.30/0.35 pre-cycle-16) |

Re-baking trees: edit recipes/seeds in [`tools/bake-trees.mjs`](tools/bake-trees.mjs), then `rm assets/_originals/models/trees/*.glb && npm run bake-trees && npm run compress-glbs`. The `_originals/` rm is required to invalidate the compress-glbs backup cache (Cycle 14 finding, commit `39f44fb`).

## Standing risks (carried forward)

- **Sim-baseline fixtures one-way.** Don't regenerate without understanding the diff. Cycles 5-16 left them bit-identical.
- **`?cinematic=1` flips `preserveDrawingBuffer`.** Documented perf hit. Any change letting the flag affect normal play is a Hard Stop.
- **GLB shared-material trap (Cycle 11+12 finding).** Any new code creating an `InstancedMesh` from a cached GLB's `child.geometry` + `child.material` must tag with `userData.sharedFromGlbCache = true` and rely on remove-from-scene only. Cycle 16's LOD chain follows this: trunk + leaves InstancedMesh2 share the LOD0 material across LOD0 + LOD1 entries.
- **InstancedMesh2 entity API.** Entities in `addInstances` callback use `quaternion` (not Euler `rotation`). Cycle 14 hotfix `a41f9a6` documented this; Cycle 16's createTrees follows.
- **`scripts/compress-glbs.mjs` reads from `assets/_originals/` backup.** Re-baking GLBs requires `rm assets/_originals/models/trees/*.glb` first.
- **EZ-Tree billboard string casing.** `leaves.billboard` expects lowercase `'single'` / `'double'`; capital-case is silently ignored. Codified in `tools/bake-trees.mjs` JSDoc.
- **CI worker scripts depend on `npx wrangler`** (Cycle 16 `be09eb7`). The root `dev:setup` / `dev:worker` npm scripts use bare `wrangler` after `cd worker` which loses the bin-PATH in CI environments. The deploy.yml workflow calls `npx wrangler` directly to bypass.
- **Mac white-ground bug.** Reproduces on Matt's specific Mac, not on GH `macos-latest` Safari. Environmental. Investigation pending Matt's `__sdsDiag` capture.

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-17-plan.md`](docs/cycle-17-plan.md) — `mobile-hardening-lod-and-bundle-slim` (7 phases written + 6 open questions) |
| Latest closed cycle | [`docs/archive/cycles/cycle-16-plan.md`](docs/archive/cycles/cycle-16-plan.md) |
| Cycle 16 decision brief | [`docs/cycle-16-tree-research.md`](docs/cycle-16-tree-research.md) |
| Cycle 16 gallery review | [`docs/cycle-16-tree-gallery-review.md`](docs/cycle-16-tree-gallery-review.md) |
| Cycle 16 Phase 6 keyboard workflow | [`docs/cycle-16-phase-6-prep.md`](docs/cycle-16-phase-6-prep.md) |
| Prior closed cycles | [`docs/archive/cycles/cycle-15-plan.md`](docs/archive/cycles/cycle-15-plan.md), [`docs/archive/cycles/cycle-14-plan.md`](docs/archive/cycles/cycle-14-plan.md), [`docs/archive/cycles/cycle-12-plan.md`](docs/archive/cycles/cycle-12-plan.md), [`docs/archive/cycles/cycle-11-plan.md`](docs/archive/cycles/cycle-11-plan.md) |
| Older cycles | [`docs/archive/cycles/cycle-10-plan.md`](docs/archive/cycles/cycle-10-plan.md), [`docs/archive/cycles/cycle-9-plan.md`](docs/archive/cycles/cycle-9-plan.md), [`docs/archive/cycles/cycle-8-plan.md`](docs/archive/cycles/cycle-8-plan.md), [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md), [`docs/cycle-6-plan.md`](docs/cycle-6-plan.md), [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md) |
| Cycle stub template | [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) |
| Frozen files / fence rules | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Closed cycles + deferred items | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Tree pipeline contract | [`docs/tree-pipeline.md`](docs/tree-pipeline.md) |
| Asset pipeline (gallery + integrate) | [`tools/asset-gallery/README.md`](tools/asset-gallery/README.md) |
| Slash commands | [`.claude/commands/`](.claude/commands/) — `/cycle-start`, `/cycle-close`, `/validate` |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player CHANGELOG | [`CHANGELOG.md`](CHANGELOG.md) |
| Press kit | [`PRESSKIT.md`](PRESSKIT.md) |

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

URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl` (probe), `?cinematic=1` (filming infra), `?ui=off` (hide React overlay), `?sun=0.5` (sun position), `?perfMode=1` (`__perfHarness` global for the perf harness driver).

## What NOT to do

- Don't rearchitect multiplayer. It works.
- Don't reintroduce procedural mountains. The right path is a height-displaced skirt.
- Don't add new scenes. Three is the right number.
- Don't touch `shared/MovementPhysics.js`'s `updateMovement` for obstacle composition — Cycle 6 deliberately put obstacle-force composition at the call site.
- Don't blow up `main.js` in one PR. Shrink one responsibility at a time. (Cycle 17's `bundle-slim` slug specifically aims at this — careful, incremental splits.)
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed and why.
- Don't hardcode grass-exclusion zones for non-Field scenes. Gate on `sceneDef?.farmHouse` and `sceneDef?.pasture`.
- Don't gate sprint *continuation* on `stamina >= minStaminaToSprint` — only sprint *start*.
- Don't traverse-and-dispose materials on GLB clones (SkeletonUtils.clone, .clone()) — they share materials with the cache. Tag with `userData.sharedFromGlbCache = true` and remove-from-scene only.
- Don't let `?cinematic=1` flip `preserveDrawingBuffer` on the normal-play codepath.
- Don't re-trigger the cinema runner without `--shot=<id>` during regular dev — committed OG/dog/PWA assets re-render with sub-pixel-different WebP encoding and create diff noise.
- Don't pass capital-case `'Single'` / `'Double'` strings to EZ-Tree's `leaves.billboard` — they're silently ignored. Use lowercase.
- Don't replace EZ-Tree with the [Procedural Instanced Forest](https://discourse.threejs.org/t/procedural-instanced-forest-high-performance-real-trees/88610) unless `InstancedMesh2.addLOD` demonstrably misses the perf budget. PIF is interesting + MIT but a different aesthetic + pipeline.
