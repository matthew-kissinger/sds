# Cycle 38 - Polished WebGPU Production Readiness

Status: active/in progress - not mobile-ready yet; tree-impostor branch
packet captured, README/release docs aligned for `2.1.5`, and deploy approved
Date: 2026-05-16  
Branch: `codex/cycle-38-tree-impostors`

## Goal

Make WebGPU production readiness real enough to ship as policy, not just a
single-phone proof. The top remaining implementation objective is a
production-ready tree octahedral impostor path that works for both PC and
mobile. Cycle 38 should validate the WebGPU/mobile budget layer across scenes,
camera poses, and isolated systems; close visual acceptance regressions with
screenshots; and rebuild or replace over-budget author-time assets before
claiming production mobile readiness.

This cycle must not regenerate trees or rocks at runtime. Production trees and
rocks are committed assets with explicit budgets, LODs, and impostor sidecars.

## Fresh Handoff Status

Matt's current goal is: implement the remaining work toward a polished
production game, with production-ready tree octahedral impostors as the highest
priority for PC and mobile.

Current truth:

- Cycle 38 is not complete and SDS is not mobile-ready.
- The `2.1.5` release packet can deploy the current WebGPU/tree-impostor work,
  but that deploy is not a mobile-readiness or true-octahedral readiness claim.
- WebGPU remains the intended default on supported browsers, with WebGL fallback
  and explicit `?renderer=webgl` preserved.
- The default WebGPU mobile tree path no longer forces high-tier mobile into
  all-distance LOD1. Low tier can still use LOD1 containment; the explicit
  `?konveyorNativeTreeImpostors=1` route now uses a three-tier production
  integration: near LOD0 geometry, mid branch-preserving LOD1 geometry, and far
  lat/lon-hemi Kiln impostor quads with per-instance camera-driven tile
  attributes.
- This is a production-integrated lat/lon-hemi compatibility stage, not true
  octahedral impostors. The committed sidecars remain 4x4 lat/lon hemi-y; true
  octahedral sidecars and depth/parallax parity remain open before replacing the
  fallback path by default.
- Latest Android proof
  `cycle38-validation/runtime/android-webgpu-glint-grass-sheep-spotcheck.json`
  confirms effective `webgpu-production`, nonblank screenshots, water
  `glintMode="ripple-normal-sun-camera-v2"`, grass interactor contract
  `visualScale=3.4` / `laydownStrength=1.05`, and sheep animation contract
  `vertexId-instanceData-instanceAnimation`. It still fails high-mobile frame
  budget: follow-close `p95=33.3 ms`, `p99=33.4 ms`; shoreline-glint
  `p95=33.4 ms`, `p99=50.0 ms`.
- Latest desktop tree proof
  `cycle38-validation/runtime/desktop-webgpu-tree-impostors-three-tier-matrix.json`
  is valid installed-Chrome WebGPU evidence for the explicit three-tier tree
  path. It captured Rolling Hills and Open Country across tree-occluded and
  horizon/terrain-seam poses, full and trees-only systems, with nonblank
  screenshots under
  `cycle38-validation/screenshots/desktop-webgpu-tree-impostors-three-tier-matrix/`.
- Latest connected-Android tree proof
  `cycle38-validation/runtime/android-webgpu-tree-impostors-three-tier-tight-matrix.json`
  proves the explicit tree path and screenshots run on phone, but it is
  budget-red: three full-scene rows fail the mid-mobile budget, including Open
  Country horizon/terrain-seam at `p95=100.0 ms`, `p99=133.5 ms`.
- Matt still sees water texture/ripple lines in a grid-like alignment pattern,
  sticky or out-of-sync sun glint, weak or invisible grass displacement from
  dog/sheep, missing sheep leg animation, Open Country terrain bands/seams, and
  tree representation/grounding that is not production-polished.

Fresh-agent implementation order:

1. Production tree octahedral impostors for PC/mobile.
2. Water grid/alignment line fix plus sun/camera-synced glint proof.
3. Grass interaction and sheep animation visual proof.
4. Open Country terrain seam/band proof.
5. Mobile/desktop quality-governor and perf budget closeout.

## Current Baseline

- WebGPU is the progressive default on supported browsers with WebGL fallback.
- Connected Android device `R5CX4028VGJ` proved Android Chrome WebGPU over
  secure localhost using `adb reverse tcp:3000 tcp:3000`.
- Proof artifact:
  `cycle37-validation/runtime/android-webgpu-rolling-hills-final-2026-05-16.json`.
- Rolling Hills, follow-close, full scene, WebGPU passed high-mobile budget with
  `p95=16.733 ms`, `p99=16.871 ms`, `drawCalls=37`, and
  `avgEstimatedTriangles=753920`.
- The runtime cost report shape now includes `renderer`, `deviceTier`,
  `sceneId`, `cameraPose`, `frameP95`, `frameP99`, `drawCalls`,
  `estimatedTrianglesBySystem`, `visibleCountsBySystem`, and `qualityState`.
- WebGPU triangle reporting uses custom estimates from terrain, trees, rocks,
  grass, sheep, water, structures, and impostors instead of relying on
  `renderer.info.render.triangles`.
- WebGPU mobile must not automatically use the explicit three-tier impostor
  route as the default mobile path until the Android budget and true
  octahedral-sidecar gates pass. Keep fallback behavior available while the
  explicit route is proved and optimized.
- `tree2` is accepted as the current legacy broad-canopy asset but is still
  above the target budget and needs an author-time rebuild before final mobile
  readiness.

## 2026-05-16 Implementation Update

Cycle 38 now has real connected-phone evidence. The work improved the harness
and several visual systems, but it did **not** close mobile readiness.

Implemented and validated:

- Android Chrome/CDP runner now reuses one page target instead of closing and
  recreating a tab per row. A follow-up smoke left `page:1` plus worker targets,
  so perf tests no longer intentionally run with two game tabs.
- Dog sprint harness now drives the dog by a world-space perf hook across a
  scene-specific cross-island polyline instead of holding circular keyboard
  input or a free-camera orbit. The corrected focused phone artifact
  `cycle38-validation/runtime/android-dog-sprint-cross-island-polyline-focused.json`
  proves the route actually reaches the far side:
  `routeMode="perf-world-drive-cross-island-polyline"`,
  `routeProgress=1.0`, `finalTargetDistance=0.133 m`,
  `netDisplacement=269.164`, and `straightness=0.938`. The route bug is closed,
  but the spike gate is still open: `p95=33.3 ms`, `p99=33.4 ms`,
  `max=66.6 ms`, with three `50 ms+` spikes.
- Open Country mobile terrain now uses a high-tier inner heightfield plus a
  height-sampled shared-material skirt (`size=720`, `segments=384`,
  `skirtSize=3200`, `skirtTriangles=3072`) instead of the earlier single coarse
  mobile plane. The current focused phone artifact
  `cycle38-validation/runtime/android-open-country-horizon-current-terrain.json`
  and screenshot under
  `cycle38-validation/screenshots/android-open-country-horizon-current-terrain/`
  are from the split terrain path. The old hard coarse-plane line is reduced,
  but the visual terrain gate remains open until more camera angles prove there
  are no visible bands/seams.
- WebGPU grass now receives dog plus nearest-sheep interactors, sorted by
  actual distance to the dog. The node material now exposes stronger mobile
  interaction controls (`interactionRadius=3.85`, `interactionStrength=0.93`,
  `visualScale=3.4`, `laydownStrength=1.05`) and
  `tests/konveyor-grass-material-adapter.spec.js` asserts those node values.
  The current Android terrain artifact proves `interactorCount=10` and records
  eight interactor samples. Visual acceptance is still pending until screenshots
  clearly show dog and sheep bending grass in normal play.
- WebGPU tree grounding now records per-tree placement samples and recomputes
  native LOD instance Y from `groundY + baseOffset * scale`. Current Open
  Country samples show `placementY == groundY` and `lod0/lod1BaseOffset=0`, so
  the remaining "trees in ground" complaint is likely representation/asset read
  plus terrain/grass occlusion, not a simple placement Y mismatch.
- A one-tree WebGPU impostor orbit lab now exists. `npm run
  probe:webgpu-impostor-lab` writes
  `cycle38-validation/runtime/webgpu-impostor-lab-proof.json` and screenshots
  under `cycle38-validation/screenshots/webgpu-impostor-lab/`. Installed Chrome
  proved `rendererMode.effective="webgpu-diagnostic"`, dynamic uniform tile
  controls, 12 lat/lon-hemi orbit samples, 12 octahedral selector samples,
  varied tile selection, normalized weights, nonblank screenshots, and clean
  console/page state. This remains lab-only and explicitly reports
  `productionReady=false`.
- Tree impostor integration advanced from lab-only to an explicit production
  route. `js/world/TreePlacement.js` now builds near LOD0, mid LOD1, and far
  impostor groups when `?konveyorNativeTreeImpostors=1` is set;
  `js/world/TreeImpostorRuntime.js` maintains world-up billboard matrices and
  per-instance tile blend attributes; and
  `js/konveyorKilnImpostorNodeMaterial.js` consumes instanced tile offsets and
  weights. The branch keeps this behind the explicit flag because the Android
  matrix is not green and the sidecars are still lat/lon-hemi.
- The black/no-texture impostor read was traced to WebGPU relighting/tinting
  rather than missing atlas loads. The Kiln node material now applies an
  evergreen foliage lighting floor and clamps runtime ambient tint so the
  atlas albedo remains visible in shadowed captures. The color check artifact is
  `cycle38-validation/runtime/desktop-webgpu-tree-impostors-color-check.json`.
- The middle LOD was rebuilt as a branch-preserving LOD instead of the earlier
  sparse-leaf simplification that left leaves visually detached from branches.
  `tools/bake-mobile-tree-budgets.mjs` also stopped writing simplified
  intermediates back into `assets/_originals/models/trees`. Current tree asset
  metrics are `tree1.glb=3783 tris`, `tree1_lod1.glb=944 tris`,
  `tree2.glb=7700 tris`, and `tree2_lod1.glb=1924 tris`; bake evidence is
  `cycle38-validation/assets/mobile-tree-budget-bake.json`.
- Sibling repo review supported this representation choice. TIJ vegetation
  notes favor close mesh LODs or a hybrid trunk/branch mesh plus impostor canopy
  when pure impostors read poorly, and Pixel Forge vegetation packaging notes
  reinforce that production impostors need base-color/normal data with runtime
  relighting instead of black or baked-beauty-only cards.
- The Android full pose matrix now has a complete artifact at
  `cycle38-validation/runtime/android-webgpu-cycle38-poses.json`: 15 full-scene
  rows across Field, Rolling Hills, and Open Country; all screenshots are
  nonblank; all 15 rows miss the high-mobile budget, and 12 rows miss the
  mid-mobile budget. The package script now uses concise JSON output so future
  full matrices do not flood the shell with the full artifact.
- The Android perf runner now preserves aggregate `ok=false` on single-row
  artifacts when budget checks fail. Before this fix, a one-row probe could
  overwrite the budget failure with the row-level screenshot/runtime `ok=true`.
- Validation after this pass: focused syntax checks passed, focused tree and
  material specs passed, full `npm test` passed with `469` specs passing and
  `7` skipped, and `npm run build` passed with known chunk warnings. The Cycle
  38 diagnostic and
  mobile proof surface intentionally ratchets `tests/refactor-baseline` main
  bundle size to `590 KiB` after splitting the explicit tree-impostor runtime
  into its own chunk.

Current connected-phone blockers:

- The latest full Android pose matrix is the current budget truth. Field is the
  worst draw-call outlier (`732-748` draw calls, `p95=42.5-93.0 ms`,
  `p99=85.0-170.3 ms`). Rolling Hills is closer but still fails high mobile
  (`p95=20.0-37.8 ms`, `p99=20.1-38.1 ms`). Open Country still fails both
  high-mobile and most mid-mobile gates (`p95=34.9-74.3 ms`,
  `p99=37.0-168.7 ms`).
- Open Country follow-close full scene still fails the high-mobile target:
  `cycle38-validation/runtime/android-webgpu-open-country-terrain-grass-impostor-followup.json`
  reports `p95=50.1 ms`, `p99=50.1 ms`, `drawCalls=87`, and about `996K`
  estimated visible triangles.
- Open Country horizon/terrain-seam remains over budget:
  `cycle38-validation/runtime/android-open-country-horizon-current-terrain.json`
  reports full scene `p95=50.1 ms`, `p99=50.2 ms`, `drawCalls=128`, and about
  `1.147M` estimated visible triangles. The row is screenshot/runtime-ok but
  budget-failed, and the artifact now reports aggregate `ok=false`.
- Horizon system isolation shows no single silver bullet: terrain-only
  `p95=50.1 ms`, grass-only `p95=66.8 ms` / `p99=83.4 ms`, trees-only
  `p95=50.1 ms` / `p99=66.8 ms`, sheep-only `p95=50.1 ms`, water-only
  `p95=50.0 ms`, and atmosphere-only `p95=33.4 ms`.
- The default/fallback WebGPU mobile tree path is still chunked native LOD1
  geometry until the explicit tree route passes the Android gates.
- The explicit three-tier tree path is not ready to replace fallback behavior
  automatically. It improves the close/mid visual read and enables far impostor
  proof, but the connected Android matrix still fails budget and true
  octahedral sidecars remain unbaked.
- The terrain screenshot gate remains open. The worst seam is reduced, but Open
  Country still shows visible mobile terrain lines/banding.
- The water visual gate remains open. In addition to glint sync/strength,
  Matt now reports grid-like lines where the water texture/ripple field appears
  misaligned or visibly tiled.

## WebGPU Impostor Spike Update

Research and repo evidence are recorded in
[`archive/research/webgpu-octahedral-impostor-spike-2026-05-16.md`](archive/research/webgpu-octahedral-impostor-spike-2026-05-16.md).

Cycle 38 should treat "octahedral impostor" precisely:

- Current sidecars are 4x4 lat/lon hemi-y Kiln atlases, not true octahedral
  atlases.
- The WebGPU branch now has per-instance CPU camera-to-instance selection,
  instanced tile attributes, and world-up billboard matrix sync for the explicit
  far-impostor tier. It still lacks true octahedral sidecars and WebGL parity
  for shader-side projection, depth/parallax, and depth discard.
- Cycle 38 therefore has a production-compatible lat/lon-hemi impostor stage,
  not production octahedral impostoring. Keep naming precise until sidecar v2
  bakes true octahedral atlases and the Android matrix passes.
- The lab is now executable through `tools/webgpu-impostor-lab-proof.mjs` and
  the `probe:webgpu-impostor-lab` npm script. Treat that proof as the entry
  gate for the next production integration step, not as permission to enable
  impostors in gameplay.
- The current mobile-safe stopgap is chunked LOD1 geometry with frustum-cullable
  bounds.
- Re-enable WebGPU impostors in production only after screenshots prove
  view-dependent frame selection, terrain grounding, LOD transition quality, and
  Android frame budget compliance.

## Budgets

- High mobile: `p95 <= 18.5 ms`, `p99 <= 25 ms`.
- Mid mobile: `p95 <= 34 ms`, `p99 <= 45 ms`, no repeated spikes above `50 ms`.
- WebGPU draw-call target: under `250`.
- High-mobile visible geometry target: near or below `1M` estimated triangles.
- Tree targets:
  - `tree1` LOD0 <= `4k` triangles.
  - Broad canopy tree LOD0 <= `8k` triangles.
  - LOD1 <= `25%` of LOD0.
  - Far impostor sidecar mandatory.
- Rock target: <= `500` triangles per rock unless explicitly approved.

## Phase 1 - Real-Device Matrix and Harness Hardening

Run the perf matrix on desktop Chrome and the connected Android phone:

- Scenes: Field, Rolling Hills, Open Country.
- Camera poses: follow-close, classic-max, tree-occluded, shoreline-glint,
  horizon-terrain-seam.
- System isolation: full scene, terrain-only, grass-only, trees-only,
  rocks-only, water-only, sheep-only, atmosphere-only.
- Android entry point: `npm run perf:android-webgpu`.
- Desktop entry point: existing perf harness with WebGPU and WebGL controls.

Acceptance:

- Every artifact records the full cost report shape.
- Android WebGPU runs on secure localhost, not an insecure LAN origin.
- Failures include the device id, renderer, scene, pose, system isolation mode,
  frame percentiles, draw calls, estimated triangles by system, and visible
  counts by system.

## Phase 2 - Visual Acceptance Screenshot Gates

Add screenshot or runtime gates for the visual regressions that triggered this
cycle:

- Dog remains readable behind dense tree leaves in Follow and Classic cameras.
- Tree branches and leaves move as one coherent tree; leaves may flutter but do
  not visually detach from static branches.
- Ocean reads deep blue away from shore.
- Shoreline foam appears at terrain/water contact.
- Water does not show grid-like texture/ripple alignment lines or obvious tiled
  sampling bands.
- Glint varies with sun direction and camera angle and is clamped enough to avoid
  a fixed overblown sparkle.
- Sheep and dog visibly bend grass on rolling hills.
- Sheep legs visibly animate in the WebGPU sheep material path.
- Terrain has no obvious flat seams from mobile camera angles.

Acceptance:

- Screenshots are captured for the same scene/camera poses used by the perf
  matrix.
- Visual fixes are not considered closed only because material controls exist;
  they must be visible in captured frames.

## Phase 3 - Production Tree Octahedral Impostors And Asset Budgets

Rebuild or replace production tree and rock presets against explicit budgets.
For trees, the priority is now the production octahedral impostor contract, not
another temporary billboard/LOD hack:

- No runtime tree or rock generation.
- Every production tree needs LOD0, LOD1, and Kiln impostor sidecars.
- WebGPU production must not consume the existing fixed-tile Kiln node impostor
  as the mobile LOD until the dynamic-tile production acceptance gates pass.
- A production tree impostor must be camera-driven per instance, not a global
  uniform lab tile. It must project as a stable world-up billboard, select and
  blend the correct view frames, preserve terrain-grounded pivots/base offsets,
  avoid the "sunk tree" read, and prove LOD transition quality in screenshots.
- If current 4x4 lat/lon-hemi Kiln sidecars are retained temporarily, document
  that as a compatibility stage. True octahedral sidecars remain the target
  before calling this path production-polished.
- Rebuild `tree2` first because it is the known broad-canopy budget outlier.
- Keep rocks under the `500` triangle target unless a specific exception is
  recorded.
- Preserve placement and collision contracts unless the active cycle explicitly
  accepts deterministic baseline changes.

Acceptance:

- Asset budget specs fail if required LOD/impostor sidecars are missing.
- Asset specs fail if triangle, byte, or material budgets are exceeded without
  an explicit cycle-plan exception.
- Visual screenshot comparison confirms the rebuilt assets and impostors are
  not a visual downgrade on PC or mobile.
- Android and desktop proof artifacts show the tree impostor path is active,
  view-dependent, terrain-synced, and within the appropriate frame budget before
  it replaces chunked native LOD1 as the mobile production path.

## Phase 4 - Quality Governor Knob Wiring

The `QualityGovernor` and quality-state plumbing exist. Cycle 38 should wire the
remaining adaptive controls so the governor can actually protect frame pacing:

- Render scale.
- Grass density and grass draw distance.
- Tree LOD bias and impostor thresholds.
- Water sparkle/glint cost.
- Sheep animation update cadence.
- Terrain segment/resolution policy.

Acceptance:

- Five-to-ten-second windows degrade with hysteresis after repeated over-budget
  samples.
- Quality can recover after sustained stable windows.
- WebGPU remains first choice on mobile while quality is above the floor.
- `fallbackReason="webgpu-frame-budget"` is recorded only after the minimum
  quality floor still misses stable 30 fps for repeated windows.

## Phase 5 - Broader Device and Browser Proof

Do not claim all-mobile readiness from one Android phone:

- Test at least the connected Android phone through Chrome WebGPU.
- Add high/mid/low Android profiles when hardware or remote devices are
  available.
- Keep BrowserStack/iOS Safari water and WebGPU canaries separate from Android
  Chrome proof.
- Keep Android WebView/Capacitor/TWA proof separate from browser proof unless
  Matt explicitly approves a native-shell cycle.
- Record Windows desktop high/low profile controls so desktop quality remains
  protected while mobile policy changes.

## Phase 6 - Release and Ops Carryovers

- Run an Open Country paired two-client sheep-driving playtest before any
  release claim.
- Run post-deploy iOS water canary if this cycle is shipped to production.
- Review renderer telemetry after deploy if WebGPU remains the default request.
- Do not add paid-store, signing, native-shell, Steamworks, App Store, or Google
  Play work without explicit approval.

## Frozen Files and Boundaries

Do not touch `shared/**`, sim-baseline goldens, or worker migrations in this
cycle unless the active plan is explicitly amended and accepted. Placement count
changes that affect deterministic shared behavior are out of scope by default.

## Hard Stops

- Connected phone is unavailable or CDP/ADB cannot produce artifacts.
- Any required scene/camera matrix repeatedly misses the target budget after
  governor degradation.
- Screenshot gates show dog readability, tree coherence, shoreline water,
  glint, grass interaction, or terrain seam regressions.
- Asset budget specs fail without an explicit exception.
- The fix requires touching frozen deterministic files.

## Validation

- `npm test`
- `npm run build`
- Focused material, asset, and cost-report specs:
  - `tests/render-cost-report.spec.js`
  - `tests/tree-assets.spec.js`
  - `tests/konveyor-water-material-adapter.spec.js`
  - `tests/konveyor-grass-material-adapter.spec.js`
  - `tests/konveyor-impostor-material-adapter.spec.js`
- Android perf matrix with `npm run perf:android-webgpu`.
- Desktop Chrome WebGPU and WebGL control perf matrix.
- Visual screenshot gates for accepted scenes and camera poses.

## Success Criteria

- High-mobile target scenes/poses hold `p95 <= 18.5 ms` and `p99 <= 25 ms`.
- Mid-mobile profile holds `p95 <= 34 ms`, `p99 <= 45 ms`, and no repeated
  spikes above `50 ms`.
- WebGPU draw calls stay under `250`.
- High-mobile visible geometry stays near or below `1M` estimated triangles.
- Dog-through-tree readability, coherent tree wind, shoreline water, synced
  glint, grass interaction, and terrain seam screenshots pass or have explicit
  blockers recorded.
- Tree/rock production assets have committed LOD and impostor sidecars with
  encoded budget tests.
