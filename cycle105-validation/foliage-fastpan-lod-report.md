# Cycle 5 - Cross-Scene Foliage Motion Proof

Date: 2026-06-25
Branch: `codex/three-r185-upgrade`; follow-up tuning branch `codex/foliage-lod-density-tuning`
Status: post-close tuning validated on the follow-up branch. NSL LOD/shadow/gate wiring fixed and first spike class attributed to harness/cold-readiness. Matt accepted the assets and asked to tune LOD/panning density from the contact sheet; the follow-up branch now makes consolidated tree handoff distances scene-aware and wires the existing quality governor into WebGPU compute-cull tree controllers.

## Goal

Check whether the approved Home Field tree read generalizes under fast camera/dog movement across Home Field, Rolling Hills, Open Country, and NSL. This is a motion-proof pass, not final Matt visual approval.

## Harness Update

`tools/dog-sprint-camera-harness.mjs` now launches desktop Chrome by default instead of Playwright's bundled Chromium, matching the WebGPU grass proof route that resolves `webgpu-production`. It also requests `ui=off` by default and primes frame recording on the first `requestAnimationFrame` so pre-rAF scheduling delay is not counted as a gameplay frame.

Why: the first Home Field run exercised the route but reported `webgl`, so it could not prove r185 WebGPU foliage behavior. After the harness update, all final runs below reported `webgpu-production`.

For streamed scenes, `--waitFoliage=1` now waits for `window.__sdsFoliageStreaming.completedAt` before the warmup clock. This is optional and non-fatal, but NSL fast-pan checks should use it when the intent is steady-state LOD/camera behavior rather than cold streaming.

Note: gameplay HUD and the NSL survival onboarding can still appear in this harness, so screenshots are valid render/nonblank evidence but not clean visual-approval shots.

## Commands

Home Field:

```bash
node tools\dog-sprint-camera-harness.mjs --url=http://localhost:3000 --renderer=webgpu --scene=field --gameMode=classic --cameraModes=classic --zooms=far --duration=18000 --warmup=1500 --screenshots=1 --out=cycle105-validation/foliage-fastpan/field-classic-far.json --screenshotDir=cycle105-validation/foliage-fastpan/screenshots --maxSpikeMs=80 --p99Ms=50
```

Rolling Hills:

```bash
node tools\dog-sprint-camera-harness.mjs --url=http://localhost:3000 --renderer=webgpu --scene=rolling-hills --gameMode=classic --cameraModes=classic --zooms=far --duration=18000 --warmup=1500 --screenshots=1 --out=cycle105-validation/foliage-fastpan/rolling-hills-classic-far.json --screenshotDir=cycle105-validation/foliage-fastpan/screenshots --maxSpikeMs=80 --p99Ms=50
```

Open Country:

```bash
node tools\dog-sprint-camera-harness.mjs --url=http://localhost:3000 --renderer=webgpu --scene=open-country --gameMode=classic --cameraModes=classic --zooms=far --duration=35000 --warmup=1500 --screenshots=1 --out=cycle105-validation/foliage-fastpan/open-country-classic-far.json --screenshotDir=cycle105-validation/foliage-fastpan/screenshots --maxSpikeMs=80 --p99Ms=50
```

NSL:

```bash
node tools\dog-sprint-camera-harness.mjs --url=http://localhost:3000 --renderer=webgpu --scene=newsheepdogland --gameMode=survival --cameraModes=classic --zooms=far --duration=18000 --warmup=1500 --screenshots=1 --out=cycle105-validation/foliage-fastpan/newsheepdogland-survival-far.json --screenshotDir=cycle105-validation/foliage-fastpan/screenshots --route="-200,-30;-200,40;-200,110" --maxSpikeMs=80 --p99Ms=50
```

## Results

| Scene | Mode | Renderer | Duration | Route progress | P99 frame | Max frame | >50ms spikes | Verdict |
|---|---|---|---:|---:|---:|---:|---:|---|
| Home Field | classic | `webgpu-production` | 18s | 1.000 | 14.0ms | 20.9ms | 0 | Pass |
| Rolling Hills | classic | `webgpu-production` | 18s | 1.000 | 7.2ms | 194.4ms | 2 | Fail - repeated motion spike |
| Open Country | classic | `webgpu-production` | 35s | 0.982 | 20.9ms | 21.1ms | 0 | Pass |
| NSL | survival | `webgpu-production` | 18s | 0.999 | 7.1ms | 215.3ms | 2 | Fail - repeated early spike |

Raw JSON and screenshots are ignored per validation-artifact policy:

- `cycle105-validation/foliage-fastpan/field-classic-far.json`
- `cycle105-validation/foliage-fastpan/rolling-hills-classic-far.json`
- `cycle105-validation/foliage-fastpan/open-country-classic-far.json`
- `cycle105-validation/foliage-fastpan/newsheepdogland-survival-far.json`
- `cycle105-validation/foliage-fastpan/screenshots/*.png`

## Corrected Spike Attribution

After the first table, Rolling Hills and NSL were rechecked with the rAF-primed dog-sprint harness and the existing jitter probe. Rolling Hills passed once the first pre-rAF scheduling interval was excluded. NSL passed once the run waited for streamed foliage completion (or equivalently used a longer warmup), which means the first NSL dog-sprint failure was cold-readiness contamination rather than steady-state LOD/camera-distance behavior.

| Scene | Proof | Renderer | Foliage gate | P99 frame | Max frame | >50ms spikes | Verdict |
|---|---|---|---|---:|---:|---:|---|
| Rolling Hills | `rolling-hills-current-primed-far.json` | `webgpu-production` | n/a | 7.1ms | 27.8ms | 0 | Pass |
| Rolling Hills | `rolling-hills-jitter-driven-baseline.json` | `webgpu-production` | n/a | 7.1ms | 13.9ms | 0 | Pass |
| Rolling Hills | `rolling-hills-jitter-idle-baseline.json` | `webgpu-production` | n/a | 7.1ms | 7.3ms | 0 | Pass |
| NSL | `newsheepdogland-current-primed-waitfoliage-far.json` | `webgpu-production` | planned 40 / done 40 / completed | 7.1ms | 7.2ms | 0 | Pass |
| NSL | `newsheepdogland-current-primed-warm-far.json` | `webgpu-production` | long warmup | 7.1ms | 7.2ms | 0 | Pass |
| NSL | `newsheepdogland-jitter-driven-baseline.json` | `webgpu-production` | planned 40 / done 40 / completed | 7.1ms | 14.0ms | 0 | Pass |
| NSL | `newsheepdogland-jitter-idle-baseline.json` | `webgpu-production` | planned 40 / done 40 / completed | 7.1ms | 7.3ms | 0 | Pass |

## Visual Handoff Contact Sheet

Generated a steady-state WebGPU contact sheet for Matt visual review:

- Contact sheet: `cycle105-validation/foliage-fastpan/contact-sheet/lod-handoff-contact-sheet.png`
- Manifest: `cycle105-validation/foliage-fastpan/contact-sheet/lod-handoff-contact-sheet.json`
- Rolling Hills renderer: `webgpu-production`
- Rolling Hills controller summary: `tree1:near=54`, `tree2:near=68`, `tree1:far=27`, `tree2:far=34`
- NSL renderer: `webgpu-production`
- NSL foliage readiness: `planned=40`, `wavesDone=40`, `completed=true`
- NSL controller summary: `tree1:near=2762`, `tree2:near=996`, `tree1:far=1381`, `tree2:far=498`

This contact sheet is visual-review evidence, not automatic acceptance. Matt still needs to approve whether the handoff/distribution reads correctly in motion and whether any scene needs density or impostor tuning.

## Interpretation

Home Field approval still needs scene-specific visual review, but the corrected timing evidence no longer points to steady-state Rolling Hills or NSL LOD spikes. Home Field and Open Country were already clean; Rolling Hills is clean with rAF-primed frame recording; NSL is clean when foliage streaming is complete before the measurement window.

The screenshot review confirms all four captures are nonblank and show the new tree assets in actual terrain context. However, the screenshots are not sufficient for final LOD/impostor visual approval because the harness captures one end-state frame and does not produce a panning video/contact sheet.

## NSL LOD and Shadow Correction

The NSL south-turn disappearance investigation found two r185-sensitive assumptions:

- Tree compute-cull LOD distance was tied to a separate `vec3` offset storage buffer instead of the authoritative matrix translation. The cull now derives distance and frustum position from the source matrix translation so LOD0/LOD far handoff tracks camera distance.
- The canopy shadow caster wrapped the full island impostor matrix store in a plain instanced attribute. On r185/WebGPU this can lower to an oversized uniform buffer at NSL scale (`1381 * mat4 = 88384 bytes`, over the 65536-byte uniform limit). The caster now uses `StorageInstancedBufferAttribute` on the WebGPU path, matching the compute-cull contract.

The farmhouse GLB remains visible but no longer casts its monolithic mesh into the dog-following shadow box. Restore house shadows later with a purpose-built proxy or rebuilt house asset.

Bundle ratchet recorded: `chunkBudgetsKiB.main` `624` -> `625` KiB for the NSL tree LOD source-matrix fix, WebGPU storage-backed canopy shadow caster, farmhouse shadow policy, and cold/far readiness diagnostics.

Additional headed NSL proof after the correction:

- URL: `http://localhost:3000/?renderer=webgpu&scene=newsheepdogland&mode=survival&autostart=1&perfMode=1&probeRender=1&ui=off`
- Renderer: `webgpu-production`
- Cold foliage readiness: `trees=1800`, `farImpostorTypesScheduled=2`, `farImpostorTypesActive=["tree1","tree2"]`, `error=null`
- Tree controllers: `positionSource=sourceMatrixTranslation`, `matrixStorage=true`
- Canopy shadow casters: `matrixStorage=true`, `castShadow=true`
- Farmhouse: visible with `castShadow=false`, policy `disabled-monolithic-caster`
- Indirect draw readback after streaming: near LOD0 tree1 trunk/leaves `24`, near LOD0 tree2 trunk/leaves `7`, far impostor tree1 `462`, far impostor tree2 `164`
- Screenshots: `cycle105-validation/nsl-lod-shadow-entrance-proof-r185-storage.png` and `cycle105-validation/nsl-lod-shadow-entrance-proof-r185-storage-streamed.png`

This directly answers the LOD0 concern: after the matrix-translation fix, NSL trees are reaching LOD0 near the camera instead of staying far/impostor-only.

## Post-Close LOD Density Tuning

The contact sheet showed that one global `200m` consolidated far switch is too blunt:

- Dense streamed coastline scenes need a tight enough handoff to stay performant after all waves land.
- Sparse island scenes can hold LOD0 farther during pans because their total tree counts are low.
- Home Field's treeline is a flat, opt-in consolidated scene and should not inherit NSL's dense-streaming handoff.

Follow-up implementation on `codex/foliage-lod-density-tuning`:

- Dense coastline profile: `220m`.
- Sparse island profile: `280m`.
- Flat consolidated pasture profile: `320m`.
- Minimum quality-governed profile distance: `96m`.
- `TerrainBuilder.applyQualityState()` now applies `treeLodBias` to consolidated WebGPU tree cull controllers, not only to the older `InstancedMesh2` LOD chain.
- Controller diagnostics report the active `lodDistance`, while each controller retains its base distance internally for QualityGovernor updates. Contact-sheet/browser probes can prove which scene-specific distance is active without shipping profile-label state.

Focused validation:

```bash
npx vitest run tests\tree-cull-gate.spec.js
```

Result: 7 tests passed.

Final branch validation:

```bash
npm run build
npx vitest run tests\tree-cull-gate.spec.js tests\refactor-baseline\baseline.spec.ts
npm test
```

Results:

- `npm run build`: pass, `main-*.js` `649.72 kB`; no bundle-budget fixture bump required.
- Focused LOD + bundle-ratchet specs: 24 tests passed.
- `npm test`: pass.

Final production WebGPU proof:

- Contact sheet: `cycle105-validation/foliage-fastpan/lod-density-proof/contact-sheet.png`
- Manifest: `cycle105-validation/foliage-fastpan/lod-density-proof/manifest.json`
- Browser route: production preview on `http://127.0.0.1:4174/` with `renderer=webgpu`, `perfMode=1`, `probeRender=1`, `cinematic=1`, `ui=off`
- Console/page errors: none.
- Field: `webgpu-production`, `flat-pasture:near:320 = 4`, `flat-pasture:far:320 = 2`, far-controller tree count `268`, nonblank frame.
- Rolling Hills: `webgpu-production`, `sparse-island:near:280 = 4`, `sparse-island:far:280 = 2`, far-controller tree count `61`, nonblank frames.
- NSL: `webgpu-production`, `dense-coastline:near:220 = 4`, `dense-coastline:far:220 = 2`, far-controller tree count `1879`, active far types `tree1/tree2`, nonblank frames.
- Runtime quality-bias proof: applying `treeLodBias: 0.55` in Field updated all four near controllers and both far controllers to `144m`, with no console errors.

## Entrance and E2E Gate

The entrance concern did not reproduce as a runtime render blocker in the browser smoke lane. Chromium, Firefox, and WebKit release-subset smoke all passed `SDS smoke > launches and renders the entrance`.

The multiplayer e2e bucket initially failed because its helpers still targeted the old entrance contract: a `Multiplayer` button, a separate dog-selection screen, and the older room-form select index. The current entrance uses `Play online`, selects dog on the entrance card, and has a four-select room form. The helpers were updated to follow the current entrance flow, after which the Chromium MP release bucket passed: `19 passed`.

Validation after the entrance/helper correction:

- `npx playwright test --project=chromium --reporter=list`: `11 passed`, `3 skipped`
- `npx playwright test --project=firefox --reporter=list`: `7 passed`, `7 skipped`
- `npx playwright test --project=webkit --grep-invert @local-only --reporter=list`: `4 passed`, `5 skipped`
- `npx playwright test --project=mp --grep-invert @local-only --reporter=list`: `19 passed`
- `npm test`: pass
- `npm run build`: pass
- `git diff --check`: pass

Remaining caveat: the full local WebKit project timed out at 300s when including local-only specs, but the focused WebKit extension smoke and WebKit release subset both passed. Keep WebKit local-only as a local harness follow-up, not a current runtime blocker.

## NSL Homestead Gate Integration

NSL uses the approved fence GLB kit in the homestead pen and the approved authored gate GLB at the entrance. The old procedural homestead door was removed from the authored-gate path so it no longer overlaps the new asset, while the day-loop open/close contract still drives the gate through an authored asset pivot.

Browser object proof on `http://localhost:3000/?renderer=webgpu&scene=newsheepdogland&mode=survival&autostart=1&perfMode=1&probeRender=1&ui=off`:

- Runtime names: `Fence_Post: 0`, `Fence_Rail: 0`, `Fence_Post_Instances: 5`, `Fence_Rail_Instances: 5`, `Gate_Assembly: 1`, `HomesteadGateAssetDoor: 1`, `HomesteadGateDoor: 0`
- Runtime instance totals: `Fence_Post_Instances: 51`, `Fence_Rail_Instances: 138`
- Existing `setHomesteadGateOpen` / `updateGate` calls moved the authored gate from open `-1.8221` radians to closed `0` and back open.
- Console errors: none.

## Next Investigation

1. Matt should review `cycle105-validation/foliage-fastpan/contact-sheet/lod-handoff-contact-sheet.png` and call out any scene/direction where tree LOD, impostor density, or distribution still reads wrong.

2. Keep ash reserve-only. Do not use these follow-up findings to add a third tree species until a later `shared/` placement/species cycle authorizes it.

3. Fold any tree/grass LOD distribution changes into the grass/ground redesign decision, because grass density and tree impostor distribution interact visually during fast camera motion.
