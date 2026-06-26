# Cycle 5 - Grass and Ground Redesign Brief

Date: 2026-06-25  
Branch: `codex/three-r185-upgrade`  
Status: accepted; architecture brief, current baseline, and hybrid sparse-grass path captured. Matt liked the visual direction, the Rolling Hills slice passed perf/wiring/build validation, cross-scene stills and motion proof passed, and `sds-hybrid-v1` is now the production default. Use `?grassProfile=legacy` for explicit comparison captures.

## Goal

Redesign the SDS grass and ground-readability layer from first principles instead of tuning the current shader until one narrow proof passes. The accepted direction must look coherent with the SDS palette, preserve sheep/dog/herd readability, respond visibly to movement, and stay inside measured WebGPU/WebGL runtime budgets.

## Current Evidence

Runtime asset audit already shows grass is the largest visible triangle source in the measured Home Field view:

- Whole frame: about 1,186-1,195 render calls and about 2.77M triangles.
- Grass: about 136.6k-137.1k clumps, 110 chunks, 67-68 visible chunks, about 73k visible clumps.
- Grass visible triangle estimate: about 2.05M visible triangles.
- Grass total triangle estimate: about 3.82M total triangles.

Clean interaction proof now uses two modes:

```bash
node tools\grass-interaction-visual-proof.mjs --base-url=http://localhost:3000/ --contactMode=both --check=0 --out=cycle105-validation/grass/grass-interaction-default-both.json --screenshotDir=cycle105-validation/grass/interaction-default-both
```

The proof ran in `webgpu-production` with no browser errors. Geometry mode keeps contact shadow and hybrid ground contact disabled. Visible mode uses full-scene rendering, contact shadow, and any opt-in hybrid ground contact.

| Mode | Actor | Changed pixels | Changed % | Old threshold | Verdict |
|---|---|---:|---:|---:|---|
| Geometry-only default | Dog | 917 | 0.215% | 1,200 | Still below old absolute threshold |
| Geometry-only default | Sheep | 422 | 0.099% | 1,200 | Still too weak |
| Visible-contact default | Dog | 936 | 0.220% | 1,200 | Still below threshold |
| Visible-contact default | Sheep | 443 | 0.104% | 1,200 | Still too weak |

Current proof artifacts are intentionally ignored per `.gitignore`, but the key files are:

- `cycle105-validation/grass/grass-interaction-default-both.json`
- `cycle105-validation/grass/interaction-default-both/dog-shadowless-triptych.png`
- `cycle105-validation/grass/interaction-default-both/sheep-shadowless-triptych.png`

## Prototype Evidence - `sds-hybrid-v1`

`sds-hybrid-v1` reduces blade geometry and adds a single instanced hybrid ground-contact patch for visible dog/sheep read. Matt likes the actual Rolling Hills scene direction, and the candidate passed the local Rolling Hills perf/wiring/build slice plus cross-scene still/motion proof. It is now the production default; `?grassProfile=legacy` keeps the old path available for explicit comparison.

Implementation shape:

- Clump density scale: `0.68`.
- Streamed clump density scale: `0.58`.
- Blades per clump: `5` instead of desktop default `7`.
- Ground contact: one `THREE.InstancedMesh`, one draw call, two triangles per active interactor patch.
- No `shared/` edits and no sim-baseline regeneration.

Focused verification:

```bash
npx vitest run tests\webgpu-grass-material-adapter.spec.js
```

Result: 18 tests passed.

Validation after actual-scene visual approval:

- `npx vitest run tests\webgpu-grass-material-adapter.spec.js`: passed, 18 tests.
- `npm test`: passed.
- `npm run build`: passed.
- `git diff --check` on touched grass/runtime/test/doc files: passed.
- Bundle ratchet: accepted `tests/refactor-baseline/__fixtures__/bundle-sizes.json` `chunkBudgetsKiB.other` growth from `676` to `683` KiB for the opt-in `sds-hybrid-v1` grass profile, ground-contact overlay, and visual proof hooks. This is recorded as candidate infrastructure cost, not as tree LOD or farmhouse shadow cost.

Interaction proof:

```bash
node tools\grass-interaction-visual-proof.mjs --base-url=http://localhost:3000/ --grassProfile=sds-hybrid-v1 --contactMode=both --check=0 --proofX=50 --proofZ=-40 --out=cycle105-validation/grass/grass-interaction-sds-hybrid-v1-open-a.json --screenshotDir=cycle105-validation/grass/interaction-sds-hybrid-v1-open-a
```

| Mode | Actor | Changed pixels | Changed % | Old threshold | Verdict |
|---|---|---:|---:|---:|---|
| Geometry-only candidate | Dog | 268 | 0.063% | 1,200 | Fails; sparse local grass cannot be judged by the old absolute geometry threshold alone |
| Geometry-only candidate | Sheep | 251 | 0.059% | 1,200 | Fails; sparse local grass cannot be judged by the old absolute geometry threshold alone |
| Visible-contact candidate | Dog | 1,219 | 0.286% | 1,200 | Passes diagnostic threshold |
| Visible-contact candidate | Sheep | 1,277 | 0.300% | 1,200 | Passes diagnostic threshold |

Perf proof:

```bash
node tools\perf-harness.mjs --capture --renderer=webgpu --configs=rolling-hills-classic --poses=follow-close,classic-max --systems=grass-only --warmup=2 --measure=5 --screenshots --out=cycle105-validation/grass/grass-perf-default.json --screenshotDir=cycle105-validation/grass/perf-default
node tools\perf-harness.mjs --capture --renderer=webgpu --configs=rolling-hills-classic --poses=follow-close,classic-max --systems=grass-only --warmup=2 --measure=5 --screenshots --grassProfile=sds-hybrid-v1 --out=cycle105-validation/grass/grass-perf-sds-hybrid-v1.json --screenshotDir=cycle105-validation/grass/perf-sds-hybrid-v1
node tools\perf-harness.mjs --capture --renderer=webgpu --configs=rolling-hills-classic --poses=follow-close,classic-max --systems=full --warmup=2 --measure=5 --out=cycle105-validation/grass/full-perf-default.json
node tools\perf-harness.mjs --capture --renderer=webgpu --configs=rolling-hills-classic --poses=follow-close,classic-max --systems=full --warmup=2 --measure=5 --grassProfile=sds-hybrid-v1 --out=cycle105-validation/grass/full-perf-sds-hybrid-v1.json
```

All four captures saved evidence but reported gate failure because the harness frame-time gate is capped at the measured 60 Hz envelope (`p99` about 16.8 ms). The useful comparison is calls and triangle cost:

| Capture | Default | `sds-hybrid-v1` | Delta |
|---|---:|---:|---:|
| Grass-only follow-close estimated grass tris | 1,449,756 | 650,420 | -55.1% |
| Grass-only classic-max estimated grass tris | 1,702,260 | 689,560 | -59.5% |
| Grass-only follow-close render calls | 85 | 84 | -1 |
| Grass-only classic-max render calls | 91 | 92 | +1 |
| Full-scene follow-close renderer tris | 2,418,444 | 1,610,038 | -33.4% |
| Full-scene classic-max renderer tris | 2,389,724 | 1,358,016 | -43.2% |
| Full-scene follow-close render calls | 80 | 82 | +2 |
| Full-scene classic-max render calls | 113 | 119 | +6 |

Gameplay wiring evidence:

- Full-scene `sds-hybrid-v1` captures report `interactorCount: 76` in Rolling Hills classic mode: the local dog plus 75 active sheep.
- The hybrid ground contact path reports `instances: 76`, `drawCalls: 1`, and `trianglesPerInstance: 2`.
- The overlay is driven by the same `GrassSystem.updateInteractors()` path as blade deformation and is included in `__perfHarness.setSystemIsolation('grass-only')`.

Cross-scene herd-readability proof:

```bash
node tools\grass-hybrid-cross-scene-proof.mjs --base-url=http://localhost:3000/ --out=cycle105-validation/grass/grass-hybrid-cross-scene-proof.json --screenshotDir=cycle105-validation/grass/hybrid-cross-scene --contactSheet=cycle105-validation/grass/hybrid-cross-scene-contact-sheet.png
```

All 16 default-versus-hybrid screenshots were nonblank. The contact sheet is ignored evidence on disk at `cycle105-validation/grass/hybrid-cross-scene-contact-sheet.png`; the hybrid direction has since been accepted as the production default for this branch.

| Scene | Pose | Visible grass tri delta | Sheep | Hybrid contact instances |
|---|---|---:|---:|---:|
| Home Field | follow-close | -58.0% | 200 | 201 |
| Home Field | classic-max | -58.0% | 200 | 201 |
| Rolling Hills | follow-close | -56.8% | 75 | 76 |
| Rolling Hills | classic-max | -56.8% | 75 | 76 |
| Open Country | follow-close | -58.3% | 50 | 32 |
| Open Country | classic-max | -58.3% | 50 | 32 |
| NSL | follow-close | -51.5% | 10 | 3 |
| NSL | classic-max | -51.5% | 10 | 3 |

Cross-scene motion proof:

```bash
node tools\dog-sprint-camera-harness.mjs --url=http://localhost:3000 --renderer=webgpu --scene=field --gameMode=classic --cameraModes=classic --zooms=far --duration=18000 --warmup=1500 --screenshots=1 --grassProfile=sds-hybrid-v1 --out=cycle105-validation/grass/hybrid-motion/field-classic-far.json --screenshotDir=cycle105-validation/grass/hybrid-motion/screenshots --maxSpikeMs=80 --p99Ms=50
node tools\dog-sprint-camera-harness.mjs --url=http://localhost:3000 --renderer=webgpu --scene=rolling-hills --gameMode=classic --cameraModes=classic --zooms=far --duration=18000 --warmup=1500 --screenshots=1 --grassProfile=sds-hybrid-v1 --out=cycle105-validation/grass/hybrid-motion/rolling-hills-classic-far.json --screenshotDir=cycle105-validation/grass/hybrid-motion/screenshots --maxSpikeMs=80 --p99Ms=50
node tools\dog-sprint-camera-harness.mjs --url=http://localhost:3000 --renderer=webgpu --scene=open-country --gameMode=classic --cameraModes=classic --zooms=far --duration=35000 --warmup=1500 --screenshots=1 --grassProfile=sds-hybrid-v1 --out=cycle105-validation/grass/hybrid-motion/open-country-classic-far.json --screenshotDir=cycle105-validation/grass/hybrid-motion/screenshots --maxSpikeMs=80 --p99Ms=50
node tools\dog-sprint-camera-harness.mjs --url=http://localhost:3000 --renderer=webgpu --scene=newsheepdogland --gameMode=survival --cameraModes=classic --zooms=far --duration=18000 --warmup=1500 --screenshots=1 --grassProfile=sds-hybrid-v1 --out=cycle105-validation/grass/hybrid-motion/newsheepdogland-survival-far.json --screenshotDir=cycle105-validation/grass/hybrid-motion/screenshots --route="-200,-30;-200,40;-200,110" --waitFoliage=1 --maxSpikeMs=80 --p99Ms=50
```

| Scene | Renderer | Foliage readiness | p99 | Max | Spikes over 50ms | Verdict |
|---|---|---|---:|---:|---:|---|
| Home Field | webgpu-production | n/a | 14.00 ms | 20.80 ms | 0 | Pass |
| Rolling Hills | webgpu-production | n/a | 13.80 ms | 20.80 ms | 0 | Pass |
| Open Country | webgpu-production | n/a | 20.90 ms | 27.90 ms | 0 | Pass |
| NSL | webgpu-production | 40 planned / 40 done / completed | 7.10 ms | 7.20 ms | 0 | Pass |

Current verdict: accepted production default. The hybrid grass path was visually liked by Matt in the actual Rolling Hills scene, validated across Home Field, Rolling Hills, Open Country, and NSL for automated herd-readability stills and motion timing, and confirmed by a live route without a `grassProfile` query reporting `grassProfile: sds-hybrid-v1`.

## r185-Specific Finding

The current minimal code repair is justified independently of the redesign. Three r185's TSL path distinguishes pre-transform `positionGeometry` from instanced/transformed `positionLocal`. The grass contact lookup was still using `positionLocal` to rebuild world contact positions. Under r185, that risks double-counting the clump transform on the regular instanced path.

The current branch changes grass contact lookup in `js/world/webgpuGrassBladeNodeMaterial.js` to derive `bladeWorld` from `positionGeometry` plus the instance offset, and records the material contract as:

```text
coordinateSource: instanceWorldOffset-plus-positionGeometry
```

Focused verification passed:

```bash
npx vitest run tests\webgpu-grass-material-adapter.spec.js
```

Result: 18 tests passed.

This repair should stay narrow. It makes the baseline honest, but it does not settle whether the current grass design is the right final system.

## Current Grass Contract

Main runtime surfaces:

- `js/GrassSystem.js` owns grass density, chunking, blade geometry, interaction config, WebGL fallback shaders, WebGPU material context, LOD, quality scaling, and triangle estimates.
- `js/world/webgpuGrassBladeNodeMaterial.js` owns WebGPU blade color, wind, fog, contact bend, laydown, and interactor uniforms.
- `js/world/webgpuGrassNodeMaterialFactories.js` maps `GrassSystem` config into reusable WebGPU node materials.
- `js/main.js` gathers dog, sheep, and remote dog interactors each frame and sends them into `GrassSystem.updateInteractors()`.
- `tools/grass-interaction-visual-proof.mjs` captures shadow-disabled geometry proof and full-scene visible-contact proof for one dog and one sheep.

Important current values:

- `GrassSystem.config.interactionRadius`: `1.02`
- `GrassSystem.config.sheepInteractionRadius`: `1.05`
- `GrassSystem.config.interaction.dog`: `{ halfLen: 1.16, halfWid: 0.48, falloff: 0.68 }`
- `GrassSystem.config.interaction.sheep`: `{ halfLen: 0.7, halfWid: 0.48, falloff: 0.82 }`
- WebGPU node `interactionVisualScale`: `7.1`
- WebGPU node `interactionLaydownStrength`: `1.05`
- WebGPU node `maxNodeInteractors`: `4` on the default med tier, up to `8` on high tier.
- `sds-hybrid-v1` adds `GrassSystem.groundContactMesh`; live Rolling Hills proof reports one ground-contact draw call with 76 instances.

## Design Principles

The next grass direction should be evaluated against these principles before more shader constants are tuned:

- Sheep silhouettes stay readable at gameplay camera distance.
- Dog path feedback is visible without creating a wide artificial trench.
- Sheep contact response is visible enough to confirm sync, but not so large that one sheep clears a field-sized patch.
- Dense grass should not hide herd state, fence openings, or gate approach lines.
- Fast panning should not expose distracting LOD popping, shimmer, or late interaction updates.
- Palette should be SDS pastoral-survival: warm, clear, restrained, and compatible with the approved fence and new trees.
- Runtime cost should come from a small number of predictable draw calls, not many chunks of high-overdraw noise.
- Ground detail should do more of the visual work when full blade geometry is too expensive or visually noisy.

## Prototype Directions

### Prototype A - Cleaned Current Shader

Keep the current grass architecture, but clean it up around the r185 coordinate model and current art goals.

Evaluate:

- Geometry-space contact lookup for regular and compute-cull paths.
- Separate dog and sheep contact footprint tuning only if proof shows the current values are under-scaled.
- Lower visible triangle count through clump density, blade count, fade, or scene density distribution.
- Stronger palette discipline in blade base/mid/tip colors.
- Camera-motion proof across Home Field, Rolling Hills, Open Country, and NSL.

Ship only if it passes dog/sheep proof and looks better without preserving unnecessary shader complexity.

### Prototype B - Hybrid Ground Detail Plus Sparse Grass

Move more visual richness into terrain/ground treatment and use less blade geometry.

Evaluate:

- Palette-driven ground material variation, worn paths, sheep trails, and gate traffic patches.
- Sparse clumps concentrated near readable edges, paths, and gameplay-relevant areas.
- Optional low-density accent cards or curated instanced patches for flowers/tall grass.
- Smaller WebGPU interaction area where the dog/sheep response is visible because surrounding grass is not dense noise.

Ship only if field richness stays high while draw calls, overdraw, and interaction clarity improve.

### Prototype C - Scene-Scoped Grass Distributions

Keep one grass system but make scene distributions explicit instead of assuming Home Field, Rolling Hills, Open Country, and NSL need the same grass behavior.

Evaluate:

- Home Field: fence/gate readability and low camera-distance clutter.
- Rolling Hills: small-island foliage balance and camera panning stability.
- Open Country: large-island density budget and herd visibility at distance.
- NSL: survival-mode readability, streamed zones, and coastline compute-cull behavior.

Ship only if scene-specific budgets are explicit and testable.

## Acceptance Gates

Before approving grass as stay/tune/replace, collect:

1. Static architecture note naming the chosen prototype and rejected alternatives.
2. Draw-call and triangle evidence from `window.__perfHarness.getVisualProbe()` or `tools/perf-harness.mjs`.
3. Dog and sheep interaction proof with shadow disabled.
4. Camera-motion or fast-pan proof across Home Field, Rolling Hills, Open Country, and NSL.
5. Herd-visibility screenshots with enough sheep present to judge gameplay readability.
6. PC visual review from Matt in the actual scene.
7. Focused tests for any material adapter or runtime contract changed.
8. `npm run build` before committing implementation changes.

## Decisions So Far

- Keep dog and sheep assets unchanged.
- Keep the r185 coordinate repair as a focused runtime fix.
- Do not inflate the sheep interaction radius or visual scale as the next move unless a prototype decision says the cleaned current shader is the chosen direction.
- Do not touch `shared/` or regenerate sim-baseline fixtures for grass redesign.
- Do not treat the current proof failure as a reason to approve the current grass system.
- Treat `sds-hybrid-v1` as the accepted production grass direction for this branch. It passed the Rolling Hills perf/wiring/build slice, automated cross-scene still/motion proof, and live default-route probe; future work should be targeted tuning, not another default-vs-hybrid decision.

## Next Work

1. Use `?grassProfile=legacy` only for explicit regression comparison.
2. If new playtest issues appear, tune `sds-hybrid-v1` per scene instead of reopening the old default path by default.
3. Keep `shared/` untouched unless a later scene-distribution cycle explicitly authorizes deterministic placement changes.
