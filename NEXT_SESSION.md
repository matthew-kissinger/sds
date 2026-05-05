# Next Session — Cycle 23 (overhead-polish-grass-LOD-and-mp-cap-fix)

> Updated 2026-05-05 (post-v1.3.0 playtest + Cycle 23 plan locked). v1.3.0 playtest by Matt surfaced six items targeting next cycle: overhead Classic-cam trees fade into fog "in a way that does not look zen"; stamina-sprint exit doesn't fire on depletion; OC HUD camera-mode + sheep-in-circle overlap (desktop + mobile); grass dominates 94% of tri budget so far-ring meadow-quad LOD + hardware tiering land here; v1.3.0 MP audit found sheep cap at 1000 silently drops Insane/Chaos modes for guests + likely pine 404s, cheap fixes land here, full audit deferred to Cycle 24. **Active plan: [`docs/cycle-23-plan.md`](docs/cycle-23-plan.md) — six phases (A atmospheric polish, B stamina, C HUD, D grass T4 + tiering, E MP cheap wins, F ship v1.4.0).** Heightfield amplitude root fix, cinema runner, WebGPU/TSL spike all explicitly deferred — keep as Cycle 24+ candidates.

## What landed in Cycle 22 (closed as `v1.3.0`)

Six phases all shipped on `main` plus two Phase C variant branches:

- **Phase A — meshopt-baked LOD1 + pine removal.** [`tools/bake-tree-lod1.mjs`](tools/bake-tree-lod1.mjs) wraps `@gltf-transform/functions.simplify()` with `MeshoptSimplifier`. Four variants (aggressive/default/conservative/pristine) saved under `cycle22-validation/phaseA/variants/`. Default lands at `_originals/<name>_lod1.glb` — tree1 -38.2%, tree2 -45.4% bytes. LOD chain re-enabled at 80m. Pine deleted across `TreePlacement` (mixed becomes 50/50 tree1+tree2), all bake scripts, asset specs, impostor LUT, asset-gallery picks, dev sandboxes. Pine assets archived under `cycle22-validation/phaseA/removed-pine/`.
- **Phase B — alphaHash stochastic LOD crossfade.** `material.alphaHash = true` on every leaf MeshStandardMaterial via `_patchTreeWindMaterial`. Kiln impostor (custom ShaderMaterial) gets a screen-space hashed alpha threshold inline (`uAlphaHashScale = 0.30`).
- **Phase C — atmospheric desaturation.** New [`js/shaders/AtmosphericDesatPatch.js`](js/shaders/AtmosphericDesatPatch.js) module. Single shared `{ uDesatStartM, uDesatEndM, uDesatStrength }` uniform set drives LOD0+LOD1 leaves AND the kiln impostor. Defaults 100m / 320m / 0.6. Variants `cycle-22-phaseC-strength-0.4` and `cycle-22-phaseC-strength-0.8` committed as branches.
- **Phase D — grass auto-LOD.** GrassSystem ticks 60-sample frame-time ring buffer; `_autoLodFactor` scales `clumpsPerChunk` toward 0.5 at 0.05/sec when avg > 18ms. Recovery toward 1.0 under 14ms. Floor 0.5. Stats added: `stats.autoLodFactor`, `stats.avgFrameMs`. No new clamps (Hard-Stop #8 stays clean).
- **Phase E — BatchedMesh research doc.** [`docs/cycle-22-batchedmesh-research.md`](docs/cycle-22-batchedmesh-research.md). Recommendation: **defer to Cycle 24+**. Three.js r184 BatchedMesh has no native per-instance LOD; community workaround requires shared vertex arrays — incompatible with Phase A's meshopt simplify pipeline.
- **Phase F — ship `v1.3.0`.** vitest 179/179, build 825.62 KB / 246.99 KB gzip (+13 KB), perf:check `field-extreme` -26.7%.

Iteration artifacts saved per "branch-back" directive: tags `cycle-22-base`, `cycle-22-phase{A,B,C,D}-default`, `v1.3.0`; branches `cycle-22-phaseC-strength-{0.4,0.8}`; LOD1 variants under `cycle22-validation/phaseA/variants/`; pine archive under `cycle22-validation/phaseA/removed-pine/`.

## Where the project stands

180+ vitest pass. Production build clean (825.62 KB / 246.99 KB gzip). Cycle 22 closed the kiln-impostor / LOD-pop / grass-perf risks. Standing risks (heightfield amplitude, mac-white-ground, cinema runner timeout, sim-baseline care) all unchanged from Cycle 21.

## Cycle 23 phases (locked plan)

See [`docs/cycle-23-plan.md`](docs/cycle-23-plan.md):

- **Phase A — overhead atmospheric polish (~6hr).** Pitch-aware desat strength (drop above 30°), prime fog color from sky on first frame, wire dead scene-level fog defs, finally land impostor pitch-tilt (Cycle 19.5 carryover #2(b)). Closes the "trees look terrible from overhead" playtest finding without removing Classic camera.
- **Phase B — stamina sprint-exit fix (~2hr).** `canContinueSprint` gate isn't firing mid-sprint; trace + fix + new vitest spec.
- **Phase C — OC HUD overlap (~1–2hr).** Camera-mode indicator + sheep-in-circle objective overlap on desktop + mobile; vertical-stack layout fix.
- **Phase D — grass T4 meadow-quad LOD + hardware tiering (~1–1.5d).** Far-ring (>260m) renders as single textured quad per chunk instead of clumps (~50–60% tri reduction on OC-Extreme); HardwareTier service reads `MAX_VERTEX_UNIFORM_VECTORS` + GPU vendor → low/med/high preset; auto-LOD extends to blade count.
- **Phase E — MP cheap wins (~3–4hr).** Extend `RoomDO.ALLOWED_SHEEP_COUNTS` to include 3000/5000 + UI gate "all guests desktop"; cinematic-flag URL strip on `joinRoomByInvite`; pine 404 sweep across worker/client/shared. Full MP audit + test suite → Cycle 24.
- **Phase F — misc + ship `v1.4.0` (~3hr).** Trees triangle-counter unwired in stats panel; CHANGELOG + version bumps + tag.

## What landed in Cycle 20 (Phase 0 + 1 + 2 v1, closed early into Cycle 21)

- **Phase 0 — recon + Q2 verdict.** Pixel Forge CLI verified (with two install fixes: bun→Node tsx on Windows, bake from `_originals/` not Draco-compressed runtime). 6-bug audit complete. Q2 locked at 16 hemi-y via 2D barycentric simulation + AAA shipping precedent (Ghost of Tsushima 4×4+parallax, Horizon FW 3×3+parallax+dither, Far Cry 6 5×5 with depth-essential).
- **Phase 1 — bake pipeline.** [`tools/bake-tree-impostors.mjs`](tools/bake-tree-impostors.mjs) wraps Pixel Forge CLI; `npm run bake-tree-impostors` regenerates 12 production atlas files. Inspector HTML + 6 vitest specs pinning the schema.
- **Phase 2 v1 — runtime shader rewrite.** [`js/kiln-impostor-material.js`](js/kiln-impostor-material.js) ships with 3-tile barycentric blend, per-fragment relighting via decoded capture-view normals, anchor via sidecar `worldSize` + `bbox`. Parallax + depth-discard ghost suppression scaffolded but disabled. Octahedral runtime baker deleted.

Validation at Cycle 20 pause: 186/186 vitest, prod build 812.28 KB / 242.09 KB gzip (flat with v1.1.0). Phases 3-5 (per-scene matrix, perf, ship) absorb into Cycle 21 Phase 5.

## Where we are visually (and why Cycle 21 exists)

The kiln impostors **render** end-to-end but the visual gap with LOD0 surfaced multiple structural issues that incremental tuning can't close:

- **Lighting model gap.** LOD0 uses MeshStandardMaterial (full PBR — Schlick fresnel + GGX + IBL); impostor is half-Lambert + hemi only. Missing rim is the dominant single visible defect (reads warm-biased).
- **Texture sampling gap.** 512px tiles → 5-15 screen pixels at distance: glint without mips, cross-tile bleed with mips. Current half-texel UV clamp + aniso=8 is a compromise, not a fix.
- **Aspen recipe undercut.** `tree1` (Aspen Medium, leaves=30, branches[0]=8) reads as a tall broomstick.
- **Open Country canopy clumping.** `WOODS_INSIDE_FACTOR = 0.85` still sometimes overlaps canopies.

A 6-agent parallel research pass produced a layered fix sequence — shipped as the [`docs/cycle-21-plan.md`](docs/cycle-21-plan.md) phases below.

## Cycle 21 phases (active plan)

Plan: [`docs/cycle-21-plan.md`](docs/cycle-21-plan.md). 6 phases, mostly serial, Phase 6 optional.

0. **Quick wins (~3hr)** — Aspen re-tune (leaves 30→42, branches 8→10), placement diff (WOODS_INSIDE_FACTOR 0.85→0.92, scaleVariation 0.7-1.3 → 0.80-1.20), Schlick fresnel rim (~10 LOC), tree-pipeline.md seed doc fix. Independently shippable.
1. **Sandbox v2 + first measurement (~1 day)** — standalone `tools/lod-sandbox-v2.html`, 5×5 grid sampling, dE2000/dRGB/dLuma per cell, 12-cell smoke matrix baseline.
2. **Calibration LUT (~2 days)** — full 80-cell matrix, generate `(scene, ToD) → vec3 boost` JSON, ship as `uMatchBoost` uniform. Target post-LUT mean dE2000 < 5.
3. **Padded-atlas mipmaps (~1.5 wk)** — re-bake atlases with N=16-32px tile padding, re-enable mipmaps in shader, kill the glint without cross-tile bleed. Halen et al. HPG 2022 approach.
4. **Hybrid trunk-mesh closest band (~1 wk)** — bake trunk-only GLB per tree, render `(trunk-mesh + impostor-canopy)` at 100-150m. Trunk inherits LOD0 MeshStandardMaterial → pixel-perfect anchor.
5. **Per-scene verification + perf + ship (~1 day)** — 12 captures vs v1.1.0, perf delta, sim-baseline byte equality, tag v1.2.0.
6. **Structural escalation (OPTIONAL)** — only if Phase 5 mean dE2000 > 5. Options: MeshStandard.onBeforeCompile extension, RiLoD geometry-image impostor, 2D LUT.

**Closes** Cycle 19.5 carryover impostor-quality items #1, #2 (partial), #3, #4. Drops the standing impostor-quality risk.

## Explicitly DEFERRED out of Cycle 21 (carry forward)

Per Matt's "push back other objectives" directive, these stay in BACKLOG and do NOT land in Cycle 21:

- **Heightfield amplitude bug** (root fix in `Heightfield.sample()` / `scripts/bake-heightmap.mjs`). Cycle 19 hotfix worked around the symptom by relaxing the GrassSystem clamp. RH/OC terrain shipped at peakHeight² metres for ~14 cycles; visual character of the game depends on the amplified state now. Fix is its own cycle.
- **Cinema runner `page.screenshot` font-wait timeout.** Workaround (Playwright MCP for one-off captures) is fine for Cycle 21 Phase 5.
- **4 cinematic videos** (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`) — depend on cinema runner fix and heightfield decision.
- **WebGPU/TSL spike, grass render-texture trample, procedural-instanced-forest eval, mac-white-ground-bug** — standing alternatives, not Cycle 21 scope.

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
- **Cinema runner timeout** — `page.screenshot: Timeout 30000ms exceeded - waiting for fonts to load... fonts loaded` then hang. Affects all shots. **Deferred** out of Cycle 21; workaround for Phase 5 captures is direct Playwright MCP.

## Tuning knobs (1-line tweaks)

| Looks off? | Knob | File | Default |
| --- | --- | --- | --- |
| Grass Y clamp catching legit terrain | `baseY > 50 \|\| baseY < -10` in createChunk | [`js/GrassSystem.js`](js/GrassSystem.js) | > 50 (Cycle 19 hotfix; revert to > 10 once heightfield amplitude is fixed) |
| RH grass too tight to inner area | `grassRadius` in [`shared/scenes/rolling-hills.js`](shared/scenes/rolling-hills.js) | scene config | 172m |
| OC grass not reaching shore | `grassRadius` in [`shared/scenes/open-country.js`](shared/scenes/open-country.js) | scene config | 372m |
| Kiln LOD2 azimuth step visible | enable parallax: `uParallaxScale` default in [`js/kiln-impostor-material.js`](js/kiln-impostor-material.js) — try 0.04. If still bad, escalate to 32 hemi-y in [`tools/bake-tree-impostors.mjs`](tools/bake-tree-impostors.mjs) `--angles` flag and re-bake. | shader uniform / bake | 0 / 16 hemi-y |
| LOD1 dither too noisy at <40m | reduce `material.alphaHash` impact via `alphaTest` lift in [`js/TerrainBuilder.js`](js/TerrainBuilder.js) `_patchTreeWindMaterial` (raise EZ-Tree leaf material alphaTest 0.5 → 0.6); for kiln, lower `uAlphaHashScale` toward 0 (hard alphaTest fallback) | leaf MeshStandardMaterial / kiln uniform | 0.5 / 0.30 |
| Distant trees too desaturated / not enough | tune `uDesatStrength` in `TerrainBuilder._desat` (0..1; `cycle-22-phaseC-strength-{0.4,0.8}` branches preserve alternates) | shared uniform | 0.6 |
| Distant desat starts too close / too far | tune `uDesatStartM` / `uDesatEndM` in `TerrainBuilder._desat` | shared uniform | 100m / 320m |
| Grass collapses density when frames spike | raise `_autoLodHi` (default 18ms) in [`js/GrassSystem.js`](js/GrassSystem.js) — auto-LOD trips later. Raise `_autoLodFloor` (default 0.5) to bound how far density can drop. | constructor field | 18ms / 0.5 |
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
| Active cycle | [`docs/cycle-23-plan.md`](docs/cycle-23-plan.md) — STUB; direction not chosen |
| Latest closed cycle | [`docs/cycle-22-plan.md`](docs/cycle-22-plan.md) — `stylized-lod-pivot-and-grass-perf` shipped as `v1.3.0` 2026-05-05 |
| Cycle 22 research | [`docs/cycle-22-batchedmesh-research.md`](docs/cycle-22-batchedmesh-research.md) — BatchedMesh defer-to-24+ recommendation |
| Cycle 21 (closed) | [`docs/cycle-21-plan.md`](docs/cycle-21-plan.md) — `tree-impostor-pixel-match-and-foliage-polish` (pivoted mid-cycle) |
| Cycle 20 (closed early into 21) | [`docs/cycle-20-plan.md`](docs/cycle-20-plan.md) + [`docs/cycle-20-impostor-color-handoff.md`](docs/cycle-20-impostor-color-handoff.md) |
| Older closed | [`docs/archive/cycles/cycle-19-plan.md`](docs/archive/cycles/cycle-19-plan.md) |
| Cycle 18 (also closed) | [`docs/archive/cycles/cycle-18-plan.md`](docs/archive/cycles/cycle-18-plan.md) |
| Cycle 17 | [`docs/archive/cycles/cycle-17-plan.md`](docs/archive/cycles/cycle-17-plan.md) + [`docs/archive/cycles/cycle-17-research.md`](docs/archive/cycles/cycle-17-research.md) |
| Cycle 16 — tree research + gallery review + Phase 6 prep | [`docs/cycle-16-tree-research.md`](docs/cycle-16-tree-research.md), [`docs/cycle-16-tree-gallery-review.md`](docs/cycle-16-tree-gallery-review.md), [`docs/cycle-16-phase-6-prep.md`](docs/cycle-16-phase-6-prep.md) |
| Prior closed cycles | [`docs/archive/cycles/cycle-16-plan.md`](docs/archive/cycles/cycle-16-plan.md), [`docs/archive/cycles/cycle-15-plan.md`](docs/archive/cycles/cycle-15-plan.md), [`docs/archive/cycles/cycle-14-plan.md`](docs/archive/cycles/cycle-14-plan.md), [`docs/archive/cycles/cycle-12-plan.md`](docs/archive/cycles/cycle-12-plan.md), [`docs/archive/cycles/cycle-11-plan.md`](docs/archive/cycles/cycle-11-plan.md) |
| Older cycles | All under [`docs/archive/cycles/`](docs/archive/cycles/) — `cycle-2-{todo,report}`, `cycle-3-{plan,cleanup,scene-arch,ui-ux}`, `cycle-4-{plan,phase-b,hardening}`, `cycle-5-plan`, `cycle-6-plan`, `cycle-7-plan` … `cycle-19-plan` |
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
