# Next Session — Cycle 19 (`visual-verification-and-octahedral-polish-and-v1.1.0`) plan scaffolded

> Updated 2026-05-04. **Active plan: [`docs/cycle-19-plan.md`](docs/cycle-19-plan.md)** — 3 phases: (1) visual verification of Cycle 18 phases on real WebGL hardware, (2) octahedral polish (3-tile blend / normal-map / 32-angle) only if Phase 1 surfaces visible defects, (3) `v1.1.0` hero cards + cinematic videos + tag (Cycle 16 carryover). Run `/cycle-start` to orient. Cycle 18 closed end-to-end: shipped per-scene `grassRadius`, scene-swap + mode-restart state hygiene, real octahedral impostors. Cycle 17 also closed retroactively (was shipped 2026-05-04 but never formally `/cycle-close`'d).

## Where the project stands (Cycle 18 close)

Cycle 18 ran end-to-end autonomous overnight from a single "resume and run without checkins" prompt. All three phases shipped + pushed in independent commits with CI gates green on Pages + Worker deploys. Plan declared an autonomous mandate with all 6 open questions pre-resolved; agent followed the leans verbatim through three independent threads.

Headlines from Cycle 18:

- **Phase 1 — Per-scene `grassRadius` ✅** (commit `b376034`). New `GrassDef.grassRadius?: number` schema field; RH sets 172m, OC sets 372m (= boundary.radius - 8). [`js/GrassSystem.js`](js/GrassSystem.js) expands chunk grid to fit, culls tighter (`grassRadius + chunkSize`), rescales per-chunk clumps so OC's wider extent doesn't blow the perf budget. Field omits the field — byte-identical. Replaces the implicit area math from Cycle 17 Phase 3 (which was reverted for dropping per-m² density 3.4x).
- **Phase 2 — Scene-swap + mode-restart hygiene ✅** (commit `c8c899f`). Two regression fixes: (a) `TerrainBuilder.createScatter` else-branch now refreshes `scatterSystem.heightfield` (it was stale post-swap, leaving flora pinned to prior scene's heightmap); (b) `GameState.startGame` always sets `needsFlockRecreation = true` (was gated on count change, leaving sheep at prior session's positions on same-count restarts). New regression spec [`tests/e2e/scene-swap-stability.spec.ts`](tests/e2e/scene-swap-stability.spec.ts) gates both — tagged `@local-only` because the full scene-rebuild × 4 swaps takes ~6 min on swiftshader CI.
- **Phase 3 — Octahedral impostors ✅** (commit `04ffef6`). New [`js/octahedral-impostor-material.js`](js/octahedral-impostor-material.js) — single-quad billboard `ShaderMaterial` that picks 1 of 16 atlas tiles per-instance per-frame from camera direction. New `_bakeOctahedralImpostor(model, renderer)` in [`js/TerrainBuilder.js`](js/TerrainBuilder.js) — runtime atlas baker (16 RTT renders × 3 species per session, cached for app lifetime). Cross-billboard kept as the bake-failure fallback. Per Q4 lean: self-contained Three.js (no Pixel Forge dep). Per Q5 lean: single-tile picker (3-tile blend deferred to Cycle 19 Phase 2).

180/180 vitest pass (was 174 in cycle 16). Production build clean (806 KB main / 239 KB gzip — flat vs Cycle 17). All three Cycle 18 push commits deployed live via GH Actions.

## CI quirks shipped this cycle (worth knowing)

- **perf-check is noisy on swiftshader at extreme mode.** Phase 1's CI run flagged Field-Extreme at +11.5% vs 5% threshold — Phase 2's CI run on the same Field code path passed cleanly. The runner is rendering at ~4 seconds per frame on swiftshader software-WebGL, with only ~2 sample frames in the 15s measure window — variance is structurally high. Don't immediately trust a single perf-check failure on extreme mode; check whether the next push reproduces.
- **`scene-swap-stability.spec.ts` is `@local-only`.** Full scene-rebuild × 4 swaps takes ~6 min on swiftshader (vs ~30s on real WebGL). The fix verification is a JS reference equality + int comparison — CI doesn't need to gate on a 6-minute browser test. Run locally with `npm run test:e2e -- scene-swap-stability` after touching scene-swap or flock-recreation code.

## Cycle 19 — what to pick up next

Plan at [`docs/cycle-19-plan.md`](docs/cycle-19-plan.md). 3 phases, all gated on Phase 1 (visual verification of Cycle 18 on real WebGL hardware). Hardening gates `v1.1.0`.

**Phase summary:**
1. **Visual verification of Cycle 18** (~2-3hr, foundation) — boot all three scenes × all modes × all camera modes on RTX 3070. Confirm RH grass to slopes / OC grass to shore (Phase 1 acceptance) + octahedral impostor brightness parity across 4 sun positions (Phase 3 acceptance) + scene-swap stability (Phase 2 acceptance). If any phase doesn't visually verify, ROLL BACK and document why.
2. **Octahedral polish** (~2-3hr, optional) — 3-tile blend / normal-map atlas / 32-angle bake variant. Only triggers if Phase 1 surfaces visible azimuth-step or brightness-parity issues.
3. **`v1.1.0` hero cards + tag** (~3-4hr, keyboard session) — 3 OG cards + 4 cinematic videos + `npm version 1.1.0` + tag push. Cycle 16 carryover. Hard stop on tagging until Phase 1 visual verification passes.

**Open questions (4 in plan):** Q1 octahedral single-tile-picker quality, Q2 OC-Extreme perf budget post-grass-expansion, Q3 cinematic palette, Q4 octahedral fallback telemetry.

Standing alternatives if Cycle 19 scope shifts:
- `webgpu-tsl-spike` — port grass + tree-leaf shader math to TSL; bring up WebGPU renderer with WebGL fallback
- `grass-render-texture-trample` — per-blade RT ping-pong for sheep trample recovery
- `procedural-instanced-forest-eval` — measure PIF perf vs current LOD chain on the actual scene
- `mac-white-ground-bug` — investigate Matt's Mac-specific repro

## Cycle 18 carryover (folded into Cycle 19 Phase 1+2)

Visual playtest + Phase 4 polish from Cycle 18 plan. See `docs/cycle-19-plan.md` for the playbook.

## Cycle 16 carryover (folded into Cycle 19 Phase 3)

### Hero cards + v1.1.0 tag (keyboard session)

[`docs/cycle-16-phase-6-prep.md`](docs/cycle-16-phase-6-prep.md) has the exact workflow:
- 3 OG cards (`og-rh-sunset`, `og-field`, `og-open-country`) — open URL → Solo Extreme → `await __sdsCinema.freeFly()` + `__sdsCinema.snapshotPose()` → paste into `tools/cinematic/shot-list.mjs` → `npm run cinema --shot=<id>`.
- 4 cinematic videos (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`) — iterate framing on the post-octahedral world.
- Tag `v1.1.0`: `npm version 1.1.0 -m "..."` + bump worker/package.json + append CHANGELOG + `git push origin main --tags`.

**Hard stop on tagging:** confirm no LOD pop visible at typical play distances during the cinematic-video shoot. If popping shows, raise distances to 110m / 180m (one-line edit in [`js/TerrainBuilder.js`](js/TerrainBuilder.js)).

### Optional polish — gallery picks visual review

[`docs/cycle-16-tree-gallery-review.md`](docs/cycle-16-tree-gallery-review.md) lists what's worth a real eye:
- Aspen vs ash for tree1 slim slot
- Pine size — pine_medium_single vs pine_large_single for OC horizon
- Bark coherence across species
- LOD0 → octahedral pop at 100m

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
| Octahedral impostor azimuth step visible | `COLS` in `_bakeOctahedralImpostor` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 4 (90° step) → 8 (45° step) |
| Octahedral impostor brightness wrong | ambient + dirLight in `_bakeOctahedralImpostor` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.30 / 0.55 (matches cross-billboard) |
| Sun-tint blend strength | `BLEND` in `setImpostorTint` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.35 |
| LOD0→impostor pop visible at 100m | `addLOD(billboardGeo, mat, 100)` distance | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 100m camera distance |
| RH grass too tight to inner area | `grassRadius` in [`shared/scenes/rolling-hills.js`](shared/scenes/rolling-hills.js) | scene config | 172m |
| OC grass not reaching shore | `grassRadius` in [`shared/scenes/open-country.js`](shared/scenes/open-country.js) | scene config | 372m |
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

- **Sim-baseline fixtures one-way.** Don't regenerate without understanding the diff. Cycles 5-18 left them bit-identical.
- **`?cinematic=1` flips `preserveDrawingBuffer`.** Documented perf hit. Any change letting the flag affect normal play is a Hard Stop.
- **GLB shared-material trap (Cycle 11+12 finding).** Any new code creating an `InstancedMesh` from a cached GLB's `child.geometry` + `child.material` must tag with `userData.sharedFromGlbCache = true` and rely on remove-from-scene only. Cycle 16's LOD chain follows this; Cycle 18's octahedral impostor path explicitly does NOT share materials with the GLB cache.
- **InstancedMesh2 entity API.** Entities in `addInstances` callback use `quaternion` (not Euler `rotation`). Cycle 14 hotfix `a41f9a6` documented this; Cycle 16's createTrees follows.
- **Cycle 18 finding — InstancedMesh2 + custom ShaderMaterial.** Custom shaders that need per-instance matrix MUST `#include <batching_pars_vertex>` + `#include <batching_vertex>` so `getInstancedMatrix()` + `matricesTexture` get declared inside `USE_INSTANCING_INDIRECT`. See [`js/octahedral-impostor-material.js`](js/octahedral-impostor-material.js).
- **`scripts/compress-glbs.mjs` reads from `assets/_originals/` backup.** Re-baking GLBs requires `rm assets/_originals/models/trees/*.glb` first.
- **EZ-Tree billboard string casing.** `leaves.billboard` expects lowercase `'single'` / `'double'`; capital-case is silently ignored. Codified in `tools/bake-trees.mjs` JSDoc.
- **CI worker scripts depend on `npx wrangler`** (Cycle 16 `be09eb7`). The root `dev:setup` / `dev:worker` npm scripts use bare `wrangler` after `cd worker` which loses the bin-PATH in CI environments. The deploy.yml workflow calls `npx wrangler` directly to bypass.
- **Mac white-ground bug.** Reproduces on Matt's specific Mac, not on GH `macos-latest` Safari. Environmental. Investigation pending Matt's `__sdsDiag` capture.
- **perf-check noise on swiftshader extreme.** ~4-second-per-frame baseline with ~2 sample frames per measure window. Single-run failures may be noise; check whether the next push reproduces.
- **scene-swap-stability spec is `@local-only`.** Run locally after touching scene-swap or flock-recreation code: `npm run test:e2e -- scene-swap-stability`.

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-19-plan.md`](docs/cycle-19-plan.md) — `visual-verification-and-octahedral-polish-and-v1.1.0` |
| Latest closed cycle | [`docs/archive/cycles/cycle-18-plan.md`](docs/archive/cycles/cycle-18-plan.md) |
| Cycle 17 (also closed) | [`docs/archive/cycles/cycle-17-plan.md`](docs/archive/cycles/cycle-17-plan.md) + [`docs/archive/cycles/cycle-17-research.md`](docs/archive/cycles/cycle-17-research.md) |
| Cycle 16 — tree research + gallery review + Phase 6 prep | [`docs/cycle-16-tree-research.md`](docs/cycle-16-tree-research.md), [`docs/cycle-16-tree-gallery-review.md`](docs/cycle-16-tree-gallery-review.md), [`docs/cycle-16-phase-6-prep.md`](docs/cycle-16-phase-6-prep.md) |
| Prior closed cycles | [`docs/archive/cycles/cycle-16-plan.md`](docs/archive/cycles/cycle-16-plan.md), [`docs/archive/cycles/cycle-15-plan.md`](docs/archive/cycles/cycle-15-plan.md), [`docs/archive/cycles/cycle-14-plan.md`](docs/archive/cycles/cycle-14-plan.md), [`docs/archive/cycles/cycle-12-plan.md`](docs/archive/cycles/cycle-12-plan.md), [`docs/archive/cycles/cycle-11-plan.md`](docs/archive/cycles/cycle-11-plan.md) |
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
- Don't blow up `main.js` in one PR. Shrink one responsibility at a time. (Cycle 17 `bundle-slim` Phase 7 specifically aimed at this — careful, incremental splits.)
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed and why.
- Don't hardcode grass-exclusion zones for non-Field scenes. Gate on `sceneDef?.farmHouse` and `sceneDef?.pasture`.
- Don't gate sprint *continuation* on `stamina >= minStaminaToSprint` — only sprint *start*.
- Don't traverse-and-dispose materials on GLB clones (SkeletonUtils.clone, .clone()) — they share materials with the cache. Tag with `userData.sharedFromGlbCache = true` and remove-from-scene only.
- Don't let `?cinematic=1` flip `preserveDrawingBuffer` on the normal-play codepath.
- Don't re-trigger the cinema runner without `--shot=<id>` during regular dev — committed OG/dog/PWA assets re-render with sub-pixel-different WebP encoding and create diff noise.
- Don't pass capital-case `'Single'` / `'Double'` strings to EZ-Tree's `leaves.billboard` — they're silently ignored. Use lowercase.
- Don't replace EZ-Tree with the [Procedural Instanced Forest](https://discourse.threejs.org/t/procedural-instanced-forest-high-performance-real-trees/88610) unless `InstancedMesh2.addLOD` demonstrably misses the perf budget. PIF is interesting + MIT but a different aesthetic + pipeline.
- Don't tag `v1.1.0` on a build that hasn't passed Cycle 19 Phase 1 visual verification. Hardening gates the version tag.
