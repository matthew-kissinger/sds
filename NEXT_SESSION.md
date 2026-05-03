# Next Session — Cycle 15 (`visuals-polish-and-harness`) scaffolded; Matt is folding in additional analysis before phases are final

> Updated 2026-05-03 (Cycle 14 closed, Cycle 15 scaffolded). **Active plan: [`docs/cycle-15-plan.md`](docs/cycle-15-plan.md).** Live on [sheepdogsim.com](https://sheepdogsim.com) at the `b5e1e45` build (Cycle 14 visual-issues followup). Last closed cycle: [`docs/archive/cycles/cycle-14-plan.md`](docs/archive/cycles/cycle-14-plan.md).

## Where the project stands (2026-05-03 close of Cycle 14)

Cycle 14 (`visuals-foundation`) closed with Phases 1–3 shipped + visually verified, Phase 4 needing rebuild, Phase 5 + `v1.1.0` tag bumped to Cycle 15. Headlines:

- **Phase 1 — Heightfield Y unification ✅** — `Heightfield.meshSampleY()` triangle-interps against captured displaced-Y grid; visual consumers (sheep, dog, grass, trees, rocks, farmhouse) routed through it; sim baseline byte-identical.
- **Phase 2 — Grass shader modernization ✅** — gust-envelope wind + 2-octave analytic sway + tip flutter + sun-aligned fake-SSS; render-texture interactors + critically-damped recovery deferred to Cycle 15+.
- **Phase 3 — Trees ✅** — EZ-Tree build-time bake, 3 seeded recipes, InstancedMesh2 per-instance frustum culling, leaf-wind shader patch via `onBeforeCompile`, denser canopy + brown bark + trunk-grounded placement after the visual-issues followup pass.
- **Phase 4 — Rocks + ScatterSystem 🟡 partial** — fresnel rim-light shader + new `js/ScatterSystem.js` (Bridson Poisson sampler, 9 prop variants, yellow-flower oversampling) shipped. Procedural icosa+simplex rock bake (~33 KB total) shipped. **Matt's playtest verdict: rocks + mushrooms tiny + floating, no dandelions visible — needs full rebuild in Cycle 15.**
- **Phase 5 — Hero cards + `v1.1.0`** — bumped to end of Cycle 15.

158/158 vitest pass. Production build clean (815 KB main / 241 KB gzip). Sim-baseline byte-identical.

**CI status:** Pages + Worker deploys green on `b5e1e45`; E2E (Chromium) smoke red (10s `locator.dispatchEvent` timeout, likely first-paint slowdown from the 2.2 MB tree bundle). Site is live and serving correctly. Smoke-fix is Phase 6 of Cycle 15.

## Cycle 15 carryover from Matt's 2026-05-03 playtest

Captured during cycle close — these are the things Cycle 15 picks up:

1. **Rocks + scatter rebuild.** Rocks tiny + floating, mushrooms tiny + floating, no yellow dandelion patches visible. Procedural icosa+simplex bake doesn't carry visual presence. Decision needed: re-tune procedural with much larger scale ranges, or swap to hand-curated CC0 / Pixel Forge generation. The rim-light + flora-wind shader patches will auto-apply to whatever new GLBs land at `assets/models/rocks/` + `assets/models/scatter/`.
2. **Grass anomaly.** A few rogue blades stretch up to the sky near trees outside the play area on Field. Suspect zone: GrassSystem placement meets a tree exclusion-zone or terrain-falloff edge case where `meshSampleY` returns an outlier, OR an `_treeWind` uniform leaks into grass shader sway. Triage with probe at suspect zones.
3. **Tree pipeline audit.** Trees ARE 100% seed→build-time GLBs (`tools/bake-trees.mjs` → `assets/models/trees/` committed). Pin the contract: short doc at `docs/tree-pipeline.md` + vitest spec asserting GLBs exist + are non-empty.
4. **Perf regression triage + perf harness build-out.** Frametime degraded post-Cycle-14. Matt wants root-cause + a real perf harness with CI regression detection. Suspects (in order of plausibility): InstancedMesh2 BVH bookkeeping, ScatterSystem 9-variant draw-call multiplication, 2.2 MB tree GLB GPU upload spike. Profile before patching.
5. **Hero cards + `v1.1.0` tag.** Bumped to end of Cycle 15. Workflow already shipped in Cycle 13 (`__sdsCinema.freeFly()` + `snapshotPose()` + `npm run cinema --shot=<id>`).
6. **CI E2E smoke fix.** 1hr; bump timeout or address load timing.

**Plus:** Matt is gathering additional analysis this session for further polish/upgrade/perf items to fold into Cycle 15. The plan is scaffolded but not final — leave room for additional phases or scope adjustments before treating it as locked.

## Tuning knobs surfaced from Cycle 14 (1-line tweaks for Cycle 15 iteration)

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
| Active cycle | [`docs/cycle-15-plan.md`](docs/cycle-15-plan.md) — scaffolded; Matt folding in additional analysis |
| Latest closed cycle | [`docs/archive/cycles/cycle-14-plan.md`](docs/archive/cycles/cycle-14-plan.md) |
| Prior closed cycles | [`docs/archive/cycles/cycle-12-plan.md`](docs/archive/cycles/cycle-12-plan.md), [`docs/archive/cycles/cycle-11-plan.md`](docs/archive/cycles/cycle-11-plan.md), [`docs/archive/cycles/cycle-10-plan.md`](docs/archive/cycles/cycle-10-plan.md) |
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
- **Cycle 15:** Don't tag `v1.1.0` until Phase 1 (rocks/scatter rebuild) + Phase 2 (perf regression) + Phase 4 (grass anomaly) land cleanly. The hero cards and tag should ship on a polished world.
