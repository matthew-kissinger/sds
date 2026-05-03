# Next Session — Cycle 16 (`tree-foliage-lod-and-perf`) scaffolded; Phase 1 LOD authoring is the foundation

> Updated 2026-05-03 (Cycle 15 closed). **Active plan: [`docs/cycle-16-plan.md`](docs/cycle-16-plan.md).** Live on [sheepdogsim.com](https://sheepdogsim.com) at the cycle-15-close push. Last closed cycle: [`docs/archive/cycles/cycle-15-plan.md`](docs/archive/cycles/cycle-15-plan.md).

## Where the project stands (Cycle 15 close)

Cycle 15 closed with Phases 4 + 6 fully shipped, Phase 1 tooling shipped (gallery + bake-and-pick pipeline + 28 baked variations in staging), Phase 3 scaffold shipped (perf-harness scripts), and Phases 1 picks / 2 / 3 baseline / 5 carrying to Cycle 16. Tree review during the cycle surfaced a foundational issue that gates everything downstream: leaves are 90-96% of all tree triangles and there's no LOD chain — each tree at every distance renders the full ~50k-tri canopy.

Headlines from Cycle 15:

- **Phase 4 ✅** Grass anomaly clamp shipped + tree pipeline doc + tree-assets contract spec (165/165 vitest after +7).
- **Phase 6 ✅** CI E2E smoke fix — `actionTimeout: 10s → 30s` in [`playwright.config.ts`](playwright.config.ts).
- **Phase 1 tooling ✅, picks deferred to Cycle 16.** 16 rocks (~450 KB) + 12 trees (~23 MB pre-compress, ~7 MB post-draco) baked into `tools/asset-gallery/staging/`. Browser-based gallery picker + integrate script with canonical-rename promotion shipped. npm scripts: `bake-rocks`, `bake-trees`, `gallery`, `gen:integrate`, `gen:meshy` (escape hatch), `perf:baseline`, `perf:check`.
- **Phase 3 scaffold ✅, baseline deferred to Cycle 16.** `tools/perf-harness.mjs` 6-config matrix ready. `window.__sdsRenderer` hook behind `perfMode=1`.
- **Tree-foliage research ✅ logged.** Industry-standard answer is 3-tier LOD (full / reduced / billboard impostor via `InstancedMesh2.addLOD`). Cycle 16 Phase 1 ships this.

165/165 vitest pass. Production build clean (816 KB main / 241 KB gzip — flat vs Cycle 14).

## Cycle 16 — what's next

Cycle 16 plan is at [`docs/cycle-16-plan.md`](docs/cycle-16-plan.md). Goal: ship the proper tree foliage LOD pipeline (LOD0 mesh / LOD1 reduced / LOD2 billboard impostor), pick + integrate asset variations on top of the optimized geometry, capture perf baseline, ship hero cards + the `v1.1.0` tag.

Phase order (mostly sequential — tree LOD gates everything):

```
Phase 1 (LOD authoring + recipe re-tune)  — foundation
Phase 2 (billboard impostor LOD2)         — depends on Phase 1
Phase 3 (asset picks + flora tuning)      — depends on Phase 1 (trees)
Phase 4 (perf baseline + triage)          — depends on Phases 1, 2, 3
Phase 5 (perf:check CI integration)       — depends on Phase 4
Phase 6 (hero cards + v1.1.0)             — depends on Phases 1, 2, 3, 4
```

Open questions for Cycle 16 (author leans recorded; resolve at start):
1. Bark color contrast strategy (tighten range / single tone / current).
2. Asymmetric canopy fix (re-roll seeds / bump `branch.children`).
3. LOD strategy — A+B+E (proper foundation) is the lean.
4. Flora rebuild scope (tune existing Quaternius vs new bake).

Run `/cycle-start` to orient on the cycle-16 plan once you're ready to begin.

## How to drive the asset pipeline (Phase 1)

The primary path uses the in-repo primitive bakes. **Variations are already baked** at `tools/asset-gallery/staging/` — `f-NEW` shipped 16 rocks + 12 trees there for review.

```bash
# 1. View + pick (browser opens; ★ to pick, s to save). Default scans all
#    staging subfolders; the category filter switches between rocks/trees.
npm run gallery

# 2. Wire picks into committed assets. Sorts picks by bbox height, renames
#    to rock1/rock2/rock3 + tree1/tree2/pine so the loader works unchanged.
node tools/asset-gen/integrate.mjs --compress

# 3. Re-run npm test to make sure tree-assets spec still passes.
npm test
```

Re-bake variations any time:

```bash
npm run bake-rocks                  # 16 rocks → staging/rocks/, ~1 min
npm run bake-trees                  # 12 trees → staging/trees/, ~3 min
```

**Adding more variations:** edit [`tools/bake-rocks/recipes.mjs`](tools/bake-rocks/recipes.mjs) (rocks) or the `RECIPES` array in [`tools/bake-trees.mjs`](tools/bake-trees.mjs) (trees), append entries, re-run the bake. Recipes are committed code — every variant is reproducible from its `(seed, knobs)` tuple.

The Meshy AI text-to-GLB path is kept in-tree as an optional escape hatch (`npm run gen:meshy -- --set=rocks --count=8`, requires `MESHY_API_KEY`) but is NOT the primary path. Per Matt's note: prefer extending the in-repo bakes — Meshy only when the primitive recipes can't get there visually.

(Note: "Pixel Forge 3D" turned out to be a Gemini Flash + Imagen concept-art tool — 2D images, not GLBs. Not the same product as Meshy.)

## Phase 2 — perf baseline capture workflow

After Phase 1 picks land:

```bash
npm run dev                                    # leave running
npm run perf:baseline                          # captures + writes tests/perf-baseline/baseline.json
git add tests/perf-baseline/baseline.json && git commit -m "perf: pin baseline post-asset-integration"
npm run perf:check                             # verifies fits inside +5% threshold
```

If `perf:check` flags a regression > 5% on any of the 6 configs, that's Phase 2 work. The harness prints renderer.info per config so the bottleneck localizes (draw calls, triangles, geometries, textures).

## Phase 5 — hero cards + `v1.1.0` workflow

Reqs: at the keyboard with mouse for `__sdsCinema.freeFly()` posing.

```bash
# OG cards (3): og-rh-sunset, og-field, og-open-country
# Open localhost:3000/?cinematic=1, start Solo Extreme, pose with mouse
await __sdsCinema.freeFly()
__sdsCinema.snapshotPose()                     # paste pose into tools/cinematic/shot-list.mjs
npm run cinema --shot=og-field

# Tag v1.1.0 only after Phase 1 + Phase 2 land cleanly
npm version 1.1.0 -m "release: v1.1.0 — visuals polish + perf harness"
git push origin main --tags
```

## Tuning knobs (1-line tweaks for Cycle 16 iteration)

| Looks off? | Knob | File | Default |
| --- | --- | --- | --- |
| Trees rattle too much / too still | `_treeWind.uWindStrength` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.6 desktop / 0 mobile |
| Tree bark color wrong | `bark.tint` per recipe | [`tools/bake-trees.mjs`](tools/bake-trees.mjs) | brown 0x4a–0x7a range |
| Rocks too big / too small | `ROCK_NATIVE_HEIGHT` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.2m |
| Rocks float / sink | `ROCK_Y_SCALE` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.7 |
| Rim-light too strong / dull | `_rockShader.uRimStrength` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.35 |
| Scatter density sparse / dense | `minDist` | [`js/ScatterSystem.js`](js/ScatterSystem.js) | 4m desktop / 6m mobile |
| Yellow-flower clusters wrong | `oversampleFraction` | [`js/ScatterSystem.js`](js/ScatterSystem.js) | 0.05 |
| Specific scatter prop sized wrong | `targetHeight` in `PROP_VARIANTS` | [`js/ScatterSystem.js`](js/ScatterSystem.js) | per type (10–40cm) |

Re-baking trees: edit recipes, then `rm assets/_originals/models/trees/*.glb && npm run bake-trees && npm run compress-glbs`. The `_originals` rm is required to invalidate the compress-glbs backup cache.

## Visual review tooling shipped during Cycle 14

If anything in the deployed world reads as "off," these tools triage without depending on a live human eye:

- **[`tools/probe.mjs <baseUrl> <scene>`](tools/probe.mjs)** — Playwright harness. Loads cinematic URL, sleeps 45s for full init, dumps canvas via `toDataURL('image/png')` to `tools/playtest/probe/<scene>.png`. Captures page-errors + warnings + failed network requests.
- **[`tools/playtest-screenshots.mjs`](tools/playtest-screenshots.mjs)** — six-shot scene sweep harness (Field/RH/OC × noon/sunset). Uses `__sdsCinema.startSolo` + `setSun` + `setCameraPose`. Useful as a starting point.
- **[`tools/inspect-glb.mjs <path>`](tools/inspect-glb.mjs)** + **[`tools/inspect-glb-three.mjs <path>`](tools/inspect-glb-three.mjs)** — GLB bbox + pivot inspectors. The Cycle 14 pivot+scale audit (commit `ea9547a`) caught issues via these inspectors before the browser.

`tools/playtest/` and inspector outputs are gitignored (regenerable on demand).

## Long-tail Cycle 15+ candidates surfaced during Cycle 14 (optional escalations)

- **Tree LOD-pool unification** — per-instance dynamic full-mesh → impostor switch via `InstancedMesh2.addLOD`. Needs trunk-only + leaves-only impostor authoring since EZ-Tree splits each tree into trunk + leaves child meshes with separate materials.
- **Grass render-texture interactors + critically-damped trample recovery** — Phase 2 deferred this; needs per-blade render-target ping-pong state. Pairs with the WebGPU spike since TSL maps cleanly onto compute shaders.
- **WebGPU spike** — Phase 2 grass + Phase 3 tree shader math both port cleanly to TSL.
- **[Procedural Instanced Forest](https://discourse.threejs.org/t/procedural-instanced-forest-high-performance-real-trees/88610)** (red-reddington, Dec 2025) as alternative to EZ-Tree if higher tree-count scenes become a priority — 2,800 trees in 8 draw calls at 60fps mid-range desktop, TSL/WebGPU port done.
- **ScatterSystem polish** — seeded RNG via `mulberry32` from `shared/Random.js` for byte-identical placement across machines/scene swaps; tune density post-playtest.

Earlier cycle threads still real but unblocked-by-but-not-blocking the visual fixes: bundle slim, gameplay constants, main.js split, broader test coverage. These carry to Cycle 16+ as their own focused cycle.

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

Open `http://localhost:3000`. URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl` (probe), `?cinematic=1` (filming infra), `?ui=off` (hide React overlay), `?sun=0.5` (sun position).

## Standing risks (carried forward)

- **Sim-baseline fixtures one-way.** Don't regenerate without understanding the diff. Cycles 5-14 left them bit-identical.
- **`?cinematic=1` flips `preserveDrawingBuffer`.** Documented perf hit. Any change letting the flag affect normal play is a Hard Stop.
- **GLB shared-material trap (Cycle 11+12 finding).** Any new code creating an `InstancedMesh` from a cached GLB's `child.geometry` + `child.material` must tag with `userData.sharedFromGlbCache = true` and rely on remove-from-scene only. ScatterSystem already follows this; new asset work must too.
- **InstancedMesh2 entity API.** Entities in `addInstances` callback use `quaternion` (not Euler `rotation`). Cycle 14 hotfix `a41f9a6` documented this; new InstancedMesh2 sites must follow.
- **`scripts/compress-glbs.mjs` reads from `assets/_originals/` backup.** Re-baking GLBs requires `rm assets/_originals/models/trees/*.glb` first. Documented in `39f44fb`. Future polish: teach compress-glbs to detect newer-mtime-than-backup and re-back-up automatically.
- **Mac white-ground bug.** Reproduces on Matt's specific Mac, not on GH `macos-latest` Safari. Environmental. Investigation pending Matt's `__sdsDiag` capture.

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-16-plan.md`](docs/cycle-16-plan.md) — tree-foliage-lod-and-perf |
| Latest closed cycle | [`docs/archive/cycles/cycle-15-plan.md`](docs/archive/cycles/cycle-15-plan.md) |
| Prior closed cycles | [`docs/archive/cycles/cycle-14-plan.md`](docs/archive/cycles/cycle-14-plan.md), [`docs/archive/cycles/cycle-12-plan.md`](docs/archive/cycles/cycle-12-plan.md), [`docs/archive/cycles/cycle-11-plan.md`](docs/archive/cycles/cycle-11-plan.md), [`docs/archive/cycles/cycle-10-plan.md`](docs/archive/cycles/cycle-10-plan.md) |
| Older cycles | [`docs/archive/cycles/cycle-9-plan.md`](docs/archive/cycles/cycle-9-plan.md), [`docs/archive/cycles/cycle-8-plan.md`](docs/archive/cycles/cycle-8-plan.md), [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md), [`docs/cycle-6-plan.md`](docs/cycle-6-plan.md), [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md) |
| Cycle stub template | [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) |
| Frozen files / fence rules | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Closed cycles + deferred items | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Mac bug research | [`docs/mac-bug-research.md`](docs/mac-bug-research.md) |
| Slash commands | [`.claude/commands/`](.claude/commands/) — `/cycle-start`, `/cycle-close`, `/validate` |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player CHANGELOG | [`CHANGELOG.md`](CHANGELOG.md) |
| Press kit | [`PRESSKIT.md`](PRESSKIT.md) |
| Electron readiness | [`docs/electron-readiness.md`](docs/electron-readiness.md) |
| How to add a biome | [`docs/adding-a-biome.md`](docs/adding-a-biome.md) |

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
- **Cycle 16:** Don't replace EZ-Tree with the Procedural Instanced Forest unless `InstancedMesh2.addLOD` demonstrably misses the perf budget. PIF is interesting + MIT but a different aesthetic + pipeline.
