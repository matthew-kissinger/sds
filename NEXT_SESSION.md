# Next Session — Tree LOD2 fix-and-polish (focused, NOT a numbered cycle)

> Updated 2026-05-04 (end of Cycle 20 working session). **Cycle 20 Phase 0 + 1 + 2 v1 landed in one session** — Pixel Forge / Kiln pipeline integrated, all 3 trees baked at 16 hemi-y, new `js/kiln-impostor-material.js` shader written, octahedral runtime baker deleted, 186/186 vitest pass, prod build clean, browser smoke test green (177 trees, zero errors). **But the LOD2 trees don't look right yet** — Matt flagged this on smoke-test review. The next session is a **focused tree-LOD2 fix-and-polish pass**, not a numbered cycle (similar pattern to Cycle 19.5). Once trees look right, resume Cycle 20 Phase 3-5 (per-scene matrix → perf → ship). Active cycle plan: [`docs/cycle-20-plan.md`](docs/cycle-20-plan.md) — Phases 3-5 still pending.

## What landed this session (Cycle 20 Phase 0 + 1 + 2 v1)

- **Phase 0 — recon + Q2 verdict.** Pixel Forge CLI verified working (with two install fixes: bun→Node tsx on Windows, bake from `_originals/` not Draco-compressed runtime). 6-bug audit complete (5 confirmed analytically against the runtime source, Bug 6 anchor mismatch REFUTED via createTrees code reading). **Q2 locked at 16 hemi-y** via 2D barycentric simulation (`tools/q2-orbital-sim.mjs`, max/median ratio 1.024 — visually smooth) corroborated by AAA shipping precedent (Ghost of Tsushima 4×4+parallax, Horizon FW 3×3+parallax+dither, Far Cry 6 5×5 with depth-essential). Saves ~15 MB committed atlas data vs 32 hemi-y. Phase 2 spec refined to promote parallax depth offset + depth-discard ghost suppression to must-have based on research. Full audit: [`cycle20-validation/phase0/AUDIT.md`](cycle20-validation/phase0/AUDIT.md).
- **Phase 1 — bake pipeline integration.** [`tools/bake-tree-impostors.mjs`](tools/bake-tree-impostors.mjs) wraps Pixel Forge CLI; `npm run bake-tree-impostors` regenerates 12 production atlas files (3 trees × albedo + normal + depth + sidecar JSON). [`tools/impostor-inspector.html`](tools/impostor-inspector.html) — one-page debug page with tile labels + atlas grid. [`tests/imposter-sidecar.spec.js`](tests/imposter-sidecar.spec.js) — 6 specs pinning the schema contract (3 trees × 2 specs each).
- **Phase 2 v1 — runtime shader rewrite.** [`js/kiln-impostor-material.js`](js/kiln-impostor-material.js) with 3-tile lat/lon-cell barycentric blend, per-fragment relighting via decoded capture-view normals, anchor via sidecar `worldSize` + `bbox`. Parallax depth offset + depth-discard ghost suppression scaffolded as uniforms but **disabled by default** (`uParallaxScale = 0`, `uDepthDiscardThr = 1`) — atlas already contains the depth aux layer, no re-bake required to enable. `_bakeOctahedralImpostor` (~165 LOC) deleted. `setImpostorTint(sunColor, sunDirWorld, ambientColor)` extended; main.js wires sunDir + ambient through. Smoke-test status: [`cycle20-validation/phase2/PHASE2-V1-STATUS.md`](cycle20-validation/phase2/PHASE2-V1-STATUS.md).

Validation gates green at end of session: 186/186 vitest, prod build 812.28 KB / 242.09 KB gzip (flat with v1.1.0), browser smoke test on rolling-hills with 177 trees logging `LOD0+impostor` chain and zero console errors.

## Where we are visually (and what's not right)

The kiln impostors **render** end-to-end but they don't look right yet on Matt's review. Specifically: distant LOD2 trees read as flat darker patches at noon, possibly too dim, and the visual continuity with LOD0 hasn't been validated under controlled poses. The infrastructure is correct; the visual tuning + acceptance evidence is incomplete.

## Next session — tree LOD2 fix-and-polish (focused pass, not a cycle)

Same shape as Cycle 19.5 — single ad-hoc pass with no formal phase scaffolding. Goal: make the LOD2 trees actually look right, then unblock Cycle 20 Phase 3-5.

**Single-tree harness first.** The bottleneck is that Layers E-I (anchor diff, orbital sweep, sun-dir sweep, elevation sweep, LOD-boundary dolly) all need a controlled scene with one tree, no grass/sheep/dog, and a scriptable camera pose. Build [`tools/single-tree-harness.html`](tools/single-tree-harness.html) — one-page no-deps Three.js scaffolding that calls `loadKilnImpostor()` and accepts `?az=N&el=N&dist=N&sun=N` URL params. ~1hr scaffolding → unlocks all five layers in fast iteration.

**Order of operations** (each block falsifiable; stop and tune the moment evidence diverges from prediction):

1. **Layer F — orbital azimuth sweep** at radius 120m / elevation 5° / 24 frames. The 3D analogue of the Phase 0 2D simulation. If max-Δ stays within 1.5× median (matching the simulation), Q2's 16 hemi-y verdict ports to 3D and we're done with that branch. If a step shows, enable parallax (`uParallaxScale = 0.04`), re-run; if still showing, escalate to 32 hemi-y (one CLI flag flip + re-bake).
2. **Layer G — sun direction sweep**, 11 frames sun=0.0..1.0. Confirms per-fragment relighting tracks time-of-day. The smoke test already showed sunset trees dimmer than noon — Layer G turns that into evidence.
3. **Layer E — anchor pixel-diff** at LOD0 vs LOD2 of one tree. Already analytically REFUTED in Phase 1 AUDIT.md, so this is a regression guard. Should be ≤2px aligned out of the box.
4. **Layer H — elevation sweep**, 5°→75° in 6 frames. Documents the cylindrical-billboard quad's known-bad behavior at high-elevation views (Bug 4, deferred to Cycle 19.5 carryover #2 follow-up cycle). Establishes baseline.
5. **Layer I — LOD2→LOD0 boundary dolly**, z=110→90 over 20 frames. Position-pop / silhouette-pop / brightness-step. Anchor alignment + sidecar-based geometry should keep position pop ≤2px.

**Tuning candidates** (start at default, adjust empirically per the screenshots):
- `uParallaxScale` — try `0.04` if Layer F shows azimuth step.
- `uDepthDiscardThr` — try `0.15` if blend produces visible ghost / double-image.
- Ambient lift in `setImpostorTint` — if trees too dim at noon despite atmosphere ambient being correct, the kiln baseColor + atmosphere ambient combo may need a multiplier. The shader currently sets a 0.35-grey fallback when atmosphere gives null; consider a `uAmbientBoost` uniform.
- Bake-time light direction in `_bakeOctahedralImpostor` was `(2, 4, 3)` (Cycle 18). The Pixel Forge bake is unlit (`baseColor`) — sun comes entirely from runtime. If LOD0 PBR vs LOD2 baseColor produces a brightness step at the swap, the gap is material-level (PBR has roughness/metallic/specular; baseColor is flat). Worth measuring before tuning.

**Then resume Cycle 20**: Phase 3 (12-capture per-scene matrix vs `v1.1.0` deployed), Phase 4 (perf + sim-baseline), Phase 5 (ship — closes Cycle 19.5 carryover impostor-quality items #1, #2 partial, #4).

## Original Cycle 20 plan (Phases 3-5 still pending)

Plan at [`docs/cycle-20-plan.md`](docs/cycle-20-plan.md). Open it after the polish session unblocks the visuals. The plan is unchanged — it correctly tracks Phases 3-5 as the remaining acceptance gates.

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

Plan at [`docs/cycle-20-plan.md`](docs/cycle-20-plan.md). 6 phases, strictly serial.

**Why this cycle exists.** The current LOD2 impostor at `js/octahedral-impostor-material.js` is named octahedral but is actually a 4×4 lat/lon grid with a cylindrical Y-billboard, single-tile pick, no relighting data, and a likely anchor mismatch at the LOD0→LOD2 swap. **Pixel Forge / Kiln** (local at `C:\Users\Mattm\X\games-3d\pixel-forge\packages\core\src\kiln\imposter\`) is a polished offline impostor baker matching SDS's stack (Three.js 0.184 + Playwright + sharp), with a sidecar JSON contract, normal + depth aux layers, and a CLI `pixelforge kiln bake-imposter`. This cycle adopts it.

**Phase summary:**
0. **Recon + assumption audit** (~1hr). Document 6 suspected impostor bugs with optical evidence; verify Pixel Forge CLI works on a real SDS GLB.
1. **Bake pipeline integration** (~2hr). New `tools/bake-tree-impostors.mjs` calling Kiln CLI; outputs PNG + normal + depth + JSON sidecar to `assets/models/trees/`.
2. **Runtime shader rewrite** (~3hr). New `js/kiln-impostor-material.js` consumes sidecar, anchors via `worldSize`+`yOffset`, samples normal atlas for `dot(N, sunDir)` per-fragment lighting, 3-tile barycentric blend across azimuth.
3. **Per-scene verification** (~1hr). 12 captures (3 scenes × 4 sun positions); side-by-side with `v1.1.0`-deployed.
4. **Perf + sim-baseline** (~30min).
5. **Ship** (~30min). Closes Cycle 19.5 carryover impostor-quality items #1, #2 (partial), #4. Doesn't bump version.

**Optical validation matrix:** the plan defines 12 layers (A-L) covering atlas inspection, schema contracts, anchor pixel-diff, orbital sweep, sun-direction sweep, elevation sweep, LOD-boundary dolly, per-scene matrix, perf delta, sim-baseline byte equality. Cycle is not done until all 12 have saved artifacts in `cycle20-validation/`.

**Open questions:** Q1 integration mechanism (CLI subprocess favored), Q2 16 vs 32 angles (16 to start), Q3 atlas size budget (~15 MB total), Q4 baseColor vs beauty (baseColor — runtime relighting), Q5 LOD2/LOD0 swap distance (keep 100m), Q6 artifact path (next to GLBs).

**Deferred from this cycle (carryover from prior Cycle 20 plan):**
- Heightfield amplitude bug (root fix in `Heightfield.sample()` / `scripts/bake-heightmap.mjs`).
- Cinema runner `page.screenshot` font-wait timeout.
- 4 cinematic videos (depend on heightfield decision).

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
| Kiln LOD2 azimuth step visible | enable parallax: `uParallaxScale` default in [`js/kiln-impostor-material.js`](js/kiln-impostor-material.js) — try 0.04. If still bad, escalate to 32 hemi-y in [`tools/bake-tree-impostors.mjs`](tools/bake-tree-impostors.mjs) `--angles` flag and re-bake. | shader uniform / bake | 0 / 16 hemi-y |
| Kiln LOD2 ghost / double-image during blend | `uDepthDiscardThr` in [`js/kiln-impostor-material.js`](js/kiln-impostor-material.js) — try 0.15 | shader uniform | 1.0 (disabled) |
| Kiln LOD2 too dim at noon | `uAmbientColor` write in `setImpostorTint`, [`js/TerrainBuilder.js`](js/TerrainBuilder.js) — atmosphere ambient may need a `uAmbientBoost` multiplier | runtime uniform | atmosphere `ambientLight.color` (or 0.35-grey fallback) |
| Cross-billboard fallback sun-tint blend | `BLEND` in `setImpostorTint` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.35 (only fires if kiln load fails) |
| Cross-billboard fallback sun-luma boost | inline `0.20 * lum` factor in `setImpostorTint` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.20 |
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
- **Cycle 18 finding — InstancedMesh2 + custom ShaderMaterial.** Custom shaders that need per-instance matrix MUST `#include <batching_pars_vertex>` + `#include <batching_vertex>` so `getInstancedMatrix()` + `matricesTexture` get declared inside `USE_INSTANCING_INDIRECT`. Cycle 20 Phase 2's [`js/kiln-impostor-material.js`](js/kiln-impostor-material.js) inherits this requirement.
- **Cycle 20 finding — Pixel Forge CLI install on Windows.** `bun run` of pixelforge hangs on Playwright CDP-pipe handshake (Chromium subprocess spawns but launch never returns within 180s). Workaround in [`tools/bake-tree-impostors.mjs`](tools/bake-tree-impostors.mjs): invoke through Pixel Forge's `node_modules/.bin/tsx.exe` (Node) instead of bun. Re-baking impostors `npm run bake-tree-impostors` works; running `pixelforge ...` directly from a Windows shell does not.
- **Cycle 20 finding — bake from `_originals/`, not Draco-compressed runtime.** Pixel Forge's bake harness has no `DRACOLoader`. The bake script reads `assets/_originals/models/trees/*.glb` (uncompressed canonical sources) by design.
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
| Active cycle | [`docs/cycle-20-plan.md`](docs/cycle-20-plan.md) — `tree-impostor-overhaul-via-kiln` (Phase 0+1+2 v1 landed; tree-polish then Phase 3-5 next) |
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
