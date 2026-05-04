# Next Session — Cycle 20 (`heightfield-amplitude-fix-and-cinematic-videos`) plan scaffolded

> Updated 2026-05-04. **Active plan: [`docs/cycle-20-plan.md`](docs/cycle-20-plan.md)** — 3 phases: (1) fix the longstanding `Heightfield.sample()` double-amplification bug at root, (2) debug + fix the `tools/cinematic/run.mjs` `page.screenshot` 30s timeout, (3) re-pose + render the 4 cinematic videos deferred from Cycle 19. Run `/cycle-start` to orient. Cycle 19 closed end-to-end autonomous; `v1.1.0` shipped. **Cycle 19.5 polish landed on top** (deploy unblock, per-instance frustum culling, ScatterSystem removal, impostor brightness lift) — see BACKLOG `Cycle 19.5` entry.

## Where the project stands (Cycle 19 close)

Cycle 19 ran end-to-end autonomous from a single "run whole cycle - i'll review when complete" prompt. Started as a visual verification pass on Cycle 18; mid-cycle, Phase 1.B's grass screenshot surfaced a **separate, longstanding regression masking** Cycle 18 Phase 1's acceptance — RH/OC grass was rendering at sea level, not on terrain. Diagnosed root cause, shipped a hotfix, then completed Phase 1 verification + Phase 3 OG cards + `v1.1.0` tag.

Headlines from Cycle 19:

- **Phase 1.A — grass-Y heightfield clamp regression ✅ HOTFIX** (commit `0790333`). `js/GrassSystem.js` had a Cycle 17 Phase 3 clamp `baseY > 10 → 0` with the comment "heightScale tops out at 6". In practice the displaced terrain mesh peaks at ~25m on OC and ~36m on RH (a longstanding `Heightfield.sample()` double-amplification bug from Cycle 4/5 — bake script writes pre-multiplied metres while sample() multiplies by peakHeight again). All legit terrain Y was being snapped to 0, dropping grass to water level. Reverted clamp to `> 50`. Verified post-fix: OC inner-chunk grass at meanY=21 (matches displaced terrain), RH at meanY=20-30, Field byte-identical.
- **Phase 1.B/C/D/E ✅** All Cycle 18 phases verified post-grass-fix. Octahedral impostor brightness parity holds at noon + dawn (no visible cliff at 100m boundary). No visible azimuth-step. Scene-swap OC→RH preserves grass-on-terrain. OC-Extreme on RTX 3070 = 73 fps avg (Q2 settled — no clumpsPerChunk reduction needed).
- **Phase 2 — octahedral polish SKIPPED.** No defects surfaced.
- **Phase 3.A ✅** 3 OG cards refreshed (commit `897ce29`): og-field, og-rh-sunset (Solo Extreme + 1000 sheep), og-open-country. All under 200 KB. Captured directly via Playwright MCP because the cinema runner has a separate `page.screenshot` 30s timeout issue.
- **Phase 3.B — 4 cinematic videos DEFERRED** to Cycle 20. Cinema runner timeout blocks; needs debug pass.
- **Phase 3.C — `v1.1.0` tagged + pushed ✅** (commit `d0fcb66`). CHANGELOG.md updated, worker/package.json bumped 0.1.0 → 1.1.0.

180/180 vitest pass. Production build clean (812.80 KB main / 241.46 KB gzip — flat with v1.0.0 baseline).

## CI quirks worth knowing

- **macOS Safari Smoke** is the standing mac-white-ground bug, environmental (not on CI Safari, only Matt's Mac). Documented in BACKLOG standing risks.
- **Cinema runner timeout** is *new* this cycle — `page.screenshot: Timeout 30000ms exceeded - waiting for fonts to load... fonts loaded` then hang. Affects all shots. Cycle 20 Phase 2 fixes.

## Cycle 20 — what to pick up next

Plan at [`docs/cycle-20-plan.md`](docs/cycle-20-plan.md). 3 phases.

**Phase summary:**
1. **Heightfield amplitude fix** (~2hr, foundation). Pick Q1 path (Option A re-bake / B contract change / C load-time normalize). Author lean: A. Visually verify all three scenes look acceptable at corrected design heights (RH 6m peaks vs current 36m, OC 5m vs 25m).
2. **Cinema runner timeout fix** (~1hr, can run parallel with Phase 1). Diagnose `page.screenshot` font-wait timeout. Likely fix: pass `timeout: 60000` option or skip the font-wait.
3. **Re-pose + render 4 cinematic videos** (~3hr, depends on 1+2). The Cycle 12+13 hero poses were tuned for the amplified-terrain era; post-Phase-1 they'll need re-pinning via `__sdsCinema.freeFly()` + `snapshotPose()`.

**Open questions:** Q1 amplitude-fix path (A/B/C), Q2 cinema runner root cause, Q3 re-pose scope, Q4 video scope.

Standing alternatives if Cycle 20 scope shifts:
- `webgpu-tsl-spike` — port grass + tree-leaf shader math to TSL; bring up WebGPU renderer with WebGL fallback
- `grass-render-texture-trample` — per-blade RT ping-pong for sheep trample recovery
- `procedural-instanced-forest-eval` — measure PIF perf vs current LOD chain
- `mac-white-ground-bug` — investigate Matt's Mac-specific repro

## Tuning knobs (1-line tweaks)

| Looks off? | Knob | File | Default |
| --- | --- | --- | --- |
| Grass Y clamp catching legit terrain | `baseY > 50 \|\| baseY < -10` in createChunk | [`js/GrassSystem.js`](js/GrassSystem.js) | > 50 (Cycle 19 hotfix; revert to > 10 once heightfield amplitude is fixed) |
| RH grass too tight to inner area | `grassRadius` in [`shared/scenes/rolling-hills.js`](shared/scenes/rolling-hills.js) | scene config | 172m |
| OC grass not reaching shore | `grassRadius` in [`shared/scenes/open-country.js`](shared/scenes/open-country.js) | scene config | 372m |
| Octahedral impostor azimuth step visible | `COLS` in `_bakeOctahedralImpostor` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 4 (90° step) → 8 (45° step) |
| Octahedral impostor brightness wrong | ambient + dirLight in `_bakeOctahedralImpostor` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.70 / 1.20 (Cycle 19.5 lift; was 0.30 / 0.55 pre-cycle) |
| Sun-tint blend strength | `BLEND` in `setImpostorTint` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.35 |
| Impostor sun-luma brightness boost | inline `0.20 * lum` factor in `setImpostorTint` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.20 (Cycle 19.5; up to 1.2× brighter at noon) |
| LOD0→impostor pop visible at 100m | `addLOD(billboardGeo, mat, 100)` distance | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 100m camera distance |
| Trees rattle too much / too still | `_treeWind.uWindStrength` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.6 desktop / 0 mobile |
| Tree bark color wrong | `BARK_TINTS[species][scale]` | [`tools/bake-trees.mjs`](tools/bake-trees.mjs) | per-species 0x4a-0x8c brown |
| Single-leaf canopy too sparse | `baseSize` per species + single boost | [`tools/bake-trees.mjs`](tools/bake-trees.mjs) | 1.6 deciduous / 1.2 pine; ×1.25 single |
| Rocks too big / too small | `ROCK_NATIVE_HEIGHT` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.2m |
| Rocks float / sink | `ROCK_Y_SCALE` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.7 |

Re-baking trees: edit recipes/seeds in [`tools/bake-trees.mjs`](tools/bake-trees.mjs), then `rm assets/_originals/models/trees/*.glb && npm run bake-trees && npm run compress-glbs`. The `_originals/` rm is required to invalidate the compress-glbs backup cache (Cycle 14 finding, commit `39f44fb`).

Re-baking heightmaps: `npm run bake-heightmaps` regenerates all three. **Cycle 20 Phase 1 will likely re-bake to fix the amplitude bug.**

## Standing risks (carried forward)

- **Heightfield amplitude bug.** `Heightfield.sample()` multiplies stored data by `peakHeight` while `scripts/bake-heightmap.mjs` already writes pre-multiplied metres. Net: terrain mesh has shipped at peakHeight² metres for ~14 cycles (RH 36m peaks instead of 6m, OC 25m instead of 5m). Cycle 19 hotfix worked around the symptom by relaxing the GrassSystem clamp; Cycle 20 Phase 1 fixes at root. Until then, expect RH/OC terrain to feel taller-than-design.
- **Sim-baseline fixtures one-way.** Don't regenerate without understanding the diff. Cycles 5-19 left them bit-identical.
- **`?cinematic=1` flips `preserveDrawingBuffer`.** Documented perf hit. Any change letting the flag affect normal play is a Hard Stop.
- **GLB shared-material trap (Cycle 11+12 finding).** Any new code creating an `InstancedMesh` from a cached GLB's `child.geometry` + `child.material` must tag with `userData.sharedFromGlbCache = true` and rely on remove-from-scene only.
- **InstancedMesh2 entity API.** Entities in `addInstances` callback use `quaternion` (not Euler `rotation`). Cycle 14 hotfix `a41f9a6` documented this.
- **Cycle 18 finding — InstancedMesh2 + custom ShaderMaterial.** Custom shaders that need per-instance matrix MUST `#include <batching_pars_vertex>` + `#include <batching_vertex>` so `getInstancedMatrix()` + `matricesTexture` get declared inside `USE_INSTANCING_INDIRECT`. See [`js/octahedral-impostor-material.js`](js/octahedral-impostor-material.js).
- **`scripts/compress-glbs.mjs` reads from `assets/_originals/` backup.** Re-baking GLBs requires `rm assets/_originals/models/trees/*.glb` first.
- **EZ-Tree billboard string casing.** `leaves.billboard` expects lowercase `'single'` / `'double'`; capital-case is silently ignored. Codified in `tools/bake-trees.mjs` JSDoc.
- **CI worker scripts depend on `npx wrangler`** (Cycle 16 `be09eb7`). The root `dev:setup` / `dev:worker` npm scripts use bare `wrangler` after `cd worker` which loses the bin-PATH in CI environments. The deploy.yml workflow calls `npx wrangler` directly to bypass.
- **Mac white-ground bug.** Reproduces on Matt's specific Mac, not on GH `macos-latest` Safari. Environmental. Investigation pending Matt's `__sdsDiag` capture.
- **perf-check noise on swiftshader extreme.** ~4-second-per-frame baseline with ~2 sample frames per measure window. Single-run failures may be noise; check whether the next push reproduces.
- **scene-swap-stability spec is `@local-only`.** Run locally after touching scene-swap or flock-recreation code: `npm run test:e2e -- scene-swap-stability`.
- **Cinema runner has a `page.screenshot` 30s font-wait timeout.** Cycle 20 Phase 2 fixes. Workaround until then: use Playwright MCP directly for one-off captures.

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-20-plan.md`](docs/cycle-20-plan.md) — `heightfield-amplitude-fix-and-cinematic-videos` |
| Latest closed cycle | [`docs/archive/cycles/cycle-19-plan.md`](docs/archive/cycles/cycle-19-plan.md) |
| Cycle 18 (also closed) | [`docs/archive/cycles/cycle-18-plan.md`](docs/archive/cycles/cycle-18-plan.md) |
| Cycle 17 | [`docs/archive/cycles/cycle-17-plan.md`](docs/archive/cycles/cycle-17-plan.md) + [`docs/archive/cycles/cycle-17-research.md`](docs/archive/cycles/cycle-17-research.md) |
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
- Don't blow up `main.js` in one PR. Shrink one responsibility at a time.
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed and why.
- Don't hardcode grass-exclusion zones for non-Field scenes. Gate on `sceneDef?.farmHouse` and `sceneDef?.pasture`.
- Don't gate sprint *continuation* on `stamina >= minStaminaToSprint` — only sprint *start*.
- Don't traverse-and-dispose materials on GLB clones (SkeletonUtils.clone, .clone()) — they share materials with the cache. Tag with `userData.sharedFromGlbCache = true` and remove-from-scene only.
- Don't let `?cinematic=1` flip `preserveDrawingBuffer` on the normal-play codepath.
- Don't re-trigger the cinema runner without `--shot=<id>` during regular dev — committed OG/dog/PWA assets re-render with sub-pixel-different WebP encoding and create diff noise.
- Don't pass capital-case `'Single'` / `'Double'` strings to EZ-Tree's `leaves.billboard` — they're silently ignored. Use lowercase.
- Don't replace EZ-Tree with the Procedural Instanced Forest unless `InstancedMesh2.addLOD` demonstrably misses the perf budget.
- Don't add new clamp logic to `js/GrassSystem.js` to mask future regressions — fix at the heightfield root.
