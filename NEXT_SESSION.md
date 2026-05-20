# Next Session - Polished WebGPU Production Readiness Pickup

> **Updated:** 2026-05-20 after a connected-phone spot-check rerun on
> `R5CX4028VGJ` confirmed the desktop visual contracts (grass interactor
> coordinate/overlap mode, sheep lower-leg-weighted gait + body-only wool,
> water ripple-normal-sun-camera-v2 glint, `SunBillboard` ownership) carry on
> Android with 0 console/page errors and 6/6 nonblank screenshots, but
> high-mobile frame budgets remain red and the water grid-band artifact
> reproduces on RH/shoreline-glint. Earlier on 2026-05-20 a repo-housekeeping
> pass moved cycle*-validation to .gitignore (491 files untracked), deleted
> stale branches, cherry-picked sandbox-setup decorative emojis to main,
> collapsed .git/ 1.45 GiB to 637 MiB, retroactively archived Cycle 36 + 37
> plans with BACKLOG entries, disabled GitHub Pages + Wiki, and tagged v2.1.7.
> Underlying Cycle 38 pickup content is unchanged from the 2026-05-16/17
> refresh after the Cycle 38 desktop WebGPU grass/sheep/sun first-principles
> visual repair, shadow-disabled grass proof, sheep jitter spike, and
> tree-placement readability patch.
> **For:** current `main` checkout unless a scoped follow-up branch is needed.
> **Merged PR:** [#52](https://github.com/matthew-kissinger/sds/pull/52).
> **Pickup priority:** continue Cycle 38 toward a polished production game.
> The top implementation priority is still production-ready tree octahedral
> impostors for PC and mobile. The desktop first-principles visual proof repair
> for grass, sheep, wool, and sun/atmosphere is now implemented; water
> grid/glint, Open Country terrain seams, mobile frame-budget governance, and
> phone validation remain active gates.
> Do not call SDS mobile-ready yet.

Cold-start orientation: read [`AGENTS.md`](AGENTS.md), then [`CLAUDE.md`](CLAUDE.md), then this file, then the completed Cycle 37 plan [`docs/cycle-37-plan.md`](docs/cycle-37-plan.md), then the next plan [`docs/cycle-38-plan.md`](docs/cycle-38-plan.md), then [`docs/konveyor-autonomous-run.md`](docs/konveyor-autonomous-run.md), then [`docs/konveyor-sds.md`](docs/konveyor-sds.md), then the completion audit [`docs/konveyor-completion-audit-2026-05-16.md`](docs/konveyor-completion-audit-2026-05-16.md). Cycle 36 is completed foundation evidence at [`docs/cycle-36-plan.md`](docs/cycle-36-plan.md). Cycle 35's closed plan is archived at [`docs/archive/cycles/cycle-35-plan.md`](docs/archive/cycles/cycle-35-plan.md).

## Autonomous Completion Brief for Cycle 38

When Matt opens the next session and authorizes autonomous completion (e.g.
"run cycle 38 autonomously" or "ship it, I'll review when complete"), absorb
the brief below and do not pause for normal-engineering blockers. Treat
mid-session directives from Matt as scope clarifications, not pause requests
([memory `feedback_autonomous_cycle`](../.claude/projects/C--Users-Mattm-X-games-3d-sds/memory/feedback_autonomous_cycle.md);
this path is relative to `~/.claude`).

### Authorization scope (autonomous)

- Continue Cycle 38 work without check-ins between phases or between tasks
  inside a phase.
- May edit anything under `js/`, `tools/`, `tests/`, `docs/`, `assets/`,
  `public/`, and `scripts/`.
- May create new validation tools and artifacts.
- May regenerate `tests/refactor-baseline/__fixtures__/bundle-sizes.json` if
  bundle ratchets are explained and recorded (current cap `590 KiB`; cycle
  plan allows `591 KiB` for the tree-impostor runtime split if needed).
- May regenerate `tests/tree-placement.spec.js` fixtures only inside the
  scope of the 2026-05-16 placement amendment.
- May commit and push doc-only or asset-only changes. May commit code
  changes locally without pushing unless Matt opened the session with
  push/deploy authorization.

### Out of scope without explicit additional approval

- `shared/**` deterministic-sim source (the `shared/TreePlacement.js`
  exception is already exercised).
- `tests/sim-baseline/__fixtures__/*.json` regeneration.
- `worker/migrations/*.sql` edits or D1 migrations.
- Version bump (`package.json#version`), tag, or `CHANGELOG.md` player-line
  entry.
- Production deploy, Cloudflare API changes beyond read, Steam/App Store/
  Google Play submission, store fees, signing, paid services.
- Native-shell dependency commitment (Tauri/Electron/Capacitor).
- Mass deletion of `cycle*-validation/**` artifacts (they are gitignored;
  leave on disk for audit).

### Definition of Done for Cycle 38

Treat the cycle as ready-to-close when every box below either flips to done
or is explicitly carried over to a successor cycle with a reason. Phase 6
items that require Matt or a deploy are carryovers by definition.

Phase 2 - Visual screenshot gates (autonomous-implementable):

- [ ] Water grid/alignment lines fixed on Rolling Hills and Open Country
      shoreline-glint poses (reproduced 2026-05-20 on phone capture
      `cycle38-validation/screenshots/android-webgpu-phone-reconnect-spotcheck/rolling-hills-classic-shoreline-glint-full.png`).
      Root cause likely UV tiling or normal/ripple sampling alignment.
      Acceptance: desktop and phone capture for the same pose show no
      visible horizontal banded ripple.
- [ ] Sun glint sync: glint position tracks sun direction and camera angle
      without a fixed overblown sparkle. Acceptance: rotating the camera
      changes glint position in capture pairs.
- [ ] Open Country terrain seams: capture three OC camera angles
      (follow-close, classic-max, horizon-terrain-seam) and prove no
      visible flat bands at the inner/skirt boundary.
- [ ] Dog-through-tree readability: Follow + Classic poses behind dense
      Open Country trees show the dog silhouette without losing it in
      leaf alpha.
- [ ] Tree coherence: branches and leaves move together on Rolling Hills
      and Open Country, no detached leaf flutter.
- [ ] WebGL-reference comparison artifact for grass deformation, sun
      halo, and sheep wool silhouette (the older WebGL screenshot Matt
      supplied). Side-by-side image saved under
      `cycle38-validation/screenshots/webgl-reference-comparison/`.

Phase 3 - Production tree octahedral impostors (autonomous-implementable):

- [ ] True octahedral sidecar v2 baked through `tools/bake-tree-impostors.mjs`
      (extend or replace the current 4x4 lat/lon-hemi bake). Acceptance:
      bake artifact records octahedral encoding; shader-side projection
      consumes octahedral atlas.
- [ ] WebGPU Kiln node material handles octahedral projection,
      depth/parallax, and depth discard parity with WebGL.
- [ ] `tree2` rebake under LOD0 `<= 8k` triangles and LOD1 `<= 25%` of
      LOD0 (current `tree2.glb=7700`, `tree2_lod1.glb=1924`, already
      within budget; verify and lock with a test).
- [ ] Android matrix at `?konveyorNativeTreeImpostors=1` shows
      view-dependent tile selection, terrain-grounded pivots, no
      sunk-tree read, and Open Country horizon/terrain-seam at or under
      mid-mobile `p95 <= 34 ms` / `p99 <= 45 ms` (current
      `p95=100.0 ms` / `p99=133.5 ms`).
- [ ] Desktop installed-Chrome WebGPU matrix at the same flag shows
      transition quality (no popping at LOD0->LOD1->impostor boundaries).

Phase 4 - Quality governor hysteresis (autonomous-implementable):

- [ ] Five-to-ten-second over-budget window degrades quality with
      hysteresis (no single-frame oscillation). Proof artifact records a
      synthetic over-budget scenario and the governor's response.
- [ ] Quality recovers after sustained stable windows. Proof artifact
      records the recovery path.
- [ ] `fallbackReason='webgpu-frame-budget'` is recorded only after the
      minimum quality floor still misses stable 30 fps for repeated
      windows.

Phase 1 - Real-device matrix (already mostly closed):

- [x] Cost-report shape, secure-localhost Android, failure payload shape.
- [ ] Connected-Android matrix passes high-mobile `p95 <= 18.5 ms` /
      `p99 <= 25 ms` on Rolling Hills follow-close / tree-occluded full
      scenes after the Phase 3 + Phase 4 work lands. Open Country may
      remain mid-mobile only; cycle close acceptable if mid-mobile gates
      pass and the gap is documented.

Phase 5 - Broader device proof (defer to a successor cycle):

- [ ] Multi-Android profiles (high/mid/low) need hardware Matt does not
      currently have. Carryover to a successor cycle, do not block close.
- [ ] iOS Safari WebGPU canary stays separate from the Android Chrome
      proof. Existing `npm run test:ios-water` only covers water
      regressions; WebGPU coverage on iOS Safari is a successor task.

Phase 6 - Release and ops carryovers (require Matt or a deploy):

- [ ] OC paired two-client sheep-driving playtest. Matt at the keyboard,
      two browser tabs, OC cooperative room, drive sheep into the
      round-up zone, confirm portal opens server-side. Cannot run
      autonomously; surface to Matt before close.
- [ ] Post-deploy iOS water canary via `npm run test:ios-water` against
      the deployed origin. Requires a deploy to happen first.
- [ ] Renderer telemetry readout via
      `npm run konveyor:renderer-telemetry -- --days=7` after traffic
      hits a deployed build. Requires deploy + traffic.

### Validation gates (run before /cycle-close)

- `npm test` clean (last known: 476 pass / 7 skipped after 2026-05-17).
- `npm run lint` clean.
- `npm run build` clean (chunk warnings OK if pre-existing).
- Targeted Chromium e2e smoke green:
  `npx playwright test tests/e2e/scene-swap-stability.spec.ts --project=chromium`.
- All cycle 38 acceptance artifacts present and `ok: true` where applicable.
- `git diff --check` only reports LF/CRLF working-copy notices.

### Close-out ritual

When the Definition-of-Done checklist is satisfied (or carried over for
the Phase 5 + Phase 6 items above):

1. Run the validation gates. Any red blocks close per
   [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md).
2. Run `/cycle-close` (path
   [`.claude/commands/cycle-close.md`](.claude/commands/cycle-close.md)).
   This archives `docs/cycle-38-plan.md`, appends `docs/BACKLOG.md`,
   scaffolds `docs/cycle-39-plan.md`, and rewrites
   [`NEXT_SESSION.md`](NEXT_SESSION.md) for cycle 39.
3. Do not bump `package.json#version` and do not push a player-visible
   release without an explicit Matt approval inside this session.
4. Leave new commits unpushed unless Matt opened the session with push
   authorization. Surface the cycle close summary, the list of carryovers,
   and the explicit ask before pushing.

### Hard stops during autonomous run

Pause and surface to Matt only on:

- Any [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) condition.
- Frozen-file violation request without authorization
  ([`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md)).
- Sim-baseline or refactor-baseline drift the cycle plan does not
  explicitly authorize.
- `npm test` or `npm run build` red at cycle close.
- Bundle-size regression above `591 KiB`.
- Visual regression on a previously-passing scene.
- A required external action (deploy, store submission, paid service,
  credential rotation, native-shell commitment).
- The connected Android phone becomes unavailable mid-run and the
  remaining work requires phone evidence.

### Save artifacts under predictable paths

Per the iteration-save framing ([memory `feedback_iteration_save`](../.claude/projects/C--Users-Mattm-X-games-3d-sds/memory/feedback_iteration_save.md)),
write proof artifacts under `cycle38-validation/runtime/` for JSON and
`cycle38-validation/screenshots/<probe-name>/` for image evidence. These
paths are gitignored but kept on disk for audit. Name probes descriptively
(e.g. `android-webgpu-water-grid-fix-after.json`).

Matt approved README/docs alignment, commit, push, and deploy for the Cycle 38
packet on 2026-05-16. Use
[`docs/konveyor-release-decision-checklist.md`](docs/konveyor-release-decision-checklist.md)
as the release gate. PR #52 is now historical merged evidence, not a current
approval to deploy future mobile-readiness work.

## Fresh Agent Goal

Continue polished-production WebGPU work from the current Cycle 38 state. The
tree packet advanced trees from lab-only impostor sampling to an explicit
three-tier production route, and the later visual recovery pass repaired the
desktop WebGPU grass, sheep, wool, and sun/atmosphere proof surface. Grass now
has shadow-disabled geometry-deformation evidence, sheep has fixed-phase
constrained-leg/body-only-wool evidence, and Open Country has a lower bounded
sun/atmosphere proof. Cycle 38 still has not finished true octahedral sidecars,
mobile budget acceptance, water grid/glint closeout, Open Country terrain
seams, or phone validation for the latest visual fixes. A follow-up
tree-placement patch is also accepted in Cycle 38: nested near/mid/far/horizon
candidate zones still seed the deterministic layout, but final placement rejects
cross-zone canopy overlaps and tightens scale jitter floors so trees no longer
read as small stacked clumps.

Start from the current checkout; do not restart Cycle 37. The repo now contains
implemented Cycle 38 tree work and proof artifacts, with mobile readiness still
open. Before editing, inspect `git status --short`, then read this section and
[`docs/cycle-38-plan.md`](docs/cycle-38-plan.md). Keep changes scoped, create a
scoped working branch (e.g. `cycle-38-work`) before committing if isolation is
desired, and do not touch `shared/**`, sim-baseline goldens, or worker
migrations without explicit acceptance.

Implementation order:

1. Preserve the implemented first-principles visual proof repair in
   [`docs/archive/research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md`](docs/archive/research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md):
   shadow-disabled grass deformation evidence, sheep fixed-phase leg/wool
   captures, and sun/atmosphere histogram/screenshot proof for all scenes.
2. Finish the tree representation contract from the current three-tier stage:
   near LOD0 geometry, mid branch-preserving LOD1 geometry, and far
   lat/lon-hemi impostors are integrated behind
   `?konveyorNativeTreeImpostors=1`. Next work is true octahedral sidecar v2,
   shader-side depth/parallax parity where feasible, transition polish, and a
   green Android matrix.
3. Preserve fallback behavior until the production impostor gates pass. Do not
   describe the current lat/lon-hemi sidecars as octahedral.
4. Continue active visual gates with current truth: desktop WebGPU dog/sheep
   grass contact now has shadow-disabled geometry proof, and 2026-05-20
   connected-phone evidence proves the same visual contracts (grass
   interactor, sheep leg/wool, water glint v2, `SunBillboard`) carry on
   Android with 0 errors and 6/6 nonblank screenshots; budget gates and the
   water grid/alignment lines, sticky glint, Open Country terrain bands/seams,
   and tree grounding/read still remain open.
5. Continue using installed Chrome for desktop WebGPU proof and the connected
   Android runner through `adb reverse tcp:3000 tcp:3000`. The current desktop
   tree matrix is valid; the current Android tree matrix is screenshot-valid
   but budget-red.

Latest focused evidence:

- Android phone `R5CX4028VGJ` is reachable when USB debugging is authorized.
  Restore secure localhost with `adb reverse tcp:3000 tcp:3000` before Android
  probes. Vite must be bound to IPv4 (`vite --port 3000 --host 127.0.0.1`) for
  the reverse to reach it; default `npm run dev:client` may bind IPv6 only.
  CDP port `9222` may already be held by a desktop Chrome process; pass
  `--cdpPort=9333` to the Android runner to side-step.
- Phone validation reran on 2026-05-20 against `R5CX4028VGJ` (Galaxy S24+, SM-S926U,
  Android 16). Artifact
  `cycle38-validation/runtime/android-webgpu-phone-reconnect-spotcheck.json`
  covers Rolling Hills + Open Country across follow-close, tree-occluded, and
  shoreline-glint poses, full-scene, with screenshots under
  `cycle38-validation/screenshots/android-webgpu-phone-reconnect-spotcheck/`.
  All 6 rows record `renderer="webgpu-production"`, 0 console/page errors,
  nonblank screenshots, grass `coordinateSource="instanceWorldOffset-instanced-attribute"`
  / `overlapMode="dominant-contact-capped-vector"` /
  `visualScale=6.8` / `laydownStrength=0.95`, sheep
  `legMotion="lower-leg-weighted-fore-aft-constrained-lift"` /
  `vertexId-instanceData-instanceAnimation` / `animationSpeed=1`, sheep
  `woolContract.bodyOnlyWoolShading=true` /
  `silhouetteBreakup="normal-offset-plus-rim-color-breakup"`, water
  `glintMode="ripple-normal-sun-camera-v2"`, and `sunBillboard.applied=true`
  with `presetName="dusk"` on RH and `presetName="golden-hour"` on OC. The
  desktop visual contracts carry to the phone. Budgets remain red against the
  high-mobile gate (`p95 <= 18.5 ms`, `p99 <= 25 ms`): RH follow-close /
  tree-occluded / shoreline-glint all land at `p95=33.4-33.5 ms` /
  `p99=33.5 ms`; OC follow-close / tree-occluded at `p95=33.4-33.5 ms` /
  `p99=33.5 ms`; OC shoreline-glint at `p95=50.2 ms` / `p99=66.8 ms`. Draw
  calls 52-114, estimated visible triangles 0.96M-1.82M. Most rows pin at the
  30Hz vsync cap; OC shoreline-glint pushes past it. The artifact is a focused
  spot-check that proves carry-over of the desktop fixes, not a mobile
  readiness claim. Matt's reported water grid/alignment lines reproduce on the
  phone in RH/shoreline-glint capture.
- `cycle38-validation/runtime/tree-placement-spacing-diagnostics.json` is the
  current deterministic placement evidence for the tree readability patch. It
  records Field `count=1359`, Rolling Hills `count=61`, Open Country
  `count=204`, and zero canopy-overlap pairs for all three scenes.
- `cycle38-validation/runtime/desktop-webgpu-tree-placement-after.json` is the
  current desktop installed-Chrome WebGPU screenshot proof for the same patch,
  with tree-occluded full and trees-only captures under
  `cycle38-validation/screenshots/desktop-webgpu-tree-placement-after/`.
- `cycle38-validation/runtime/desktop-webgpu-grass-interaction-evidence.json`
  is the current discrete visual proof for dog/sheep grass contact. It freezes
  wind/sim, disables contact shadowing, isolates one actor, captures
  off/on/diff/overlay panels, and reports dog contact changed `0.961%` of the
  crop and sheep contact changed `0.992%`. Grass metadata records
  `coordinateSource="instanceWorldOffset-instanced-attribute"`,
  `overlapMode="dominant-contact-capped-vector"`, and
  `maxDisplacement=0.95`. Triptychs live under
  `cycle38-validation/screenshots/desktop-webgpu-grass-interaction-evidence/`.
- `cycle38-validation/runtime/desktop-webgpu-visual-recovery-proof.json` is the
  installed-Chrome WebGPU proof for sun/atmosphere, sheep, water glint, and
  tree-occluded regressions. It reports `ok=true`, sun clipped-white
  percentages Field `0.059`, Rolling Hills `0.059`, Open Country `0.1443`, and
  sheep checks for constrained leg motion, body-only wool, and nonblank crops.
- Latest validation for this desktop visual recovery pass: focused
  grass/sheep/effect/atmosphere/tree specs passed with `106` specs, full
  `npm test` passed with `476` specs and `7` skipped, `npm run lint` passed,
  `npm run build` passed with known chunk warnings, and targeted Chromium e2e
  smoke passed with `2` specs. Broad `npm run test:e2e` was attempted but timed
  out on the full multi-browser/multiplayer Playwright matrix.
- The current first-principles visual spike is still the rationale:
  [`docs/archive/research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md`](docs/archive/research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md).
- `cycle38-validation/runtime/android-webgpu-glint-grass-sheep-spotcheck.json`
  is the latest focused Android WebGPU artifact. It proves effective
  `webgpu-production`, nonblank screenshots, the new water glint contract
  `ripple-normal-sun-camera-v2`, grass interactor contract
  `visualScale=3.4` / `laydownStrength=1.05`, and WebGPU sheep animation
  contract `vertexId-instanceData-instanceAnimation`. It is still budget-red:
  follow-close `p95=33.3 ms`, `p99=33.4 ms`; shoreline-glint `p95=33.4 ms`,
  `p99=50.0 ms`.
- `cycle38-validation/runtime/desktop-webgpu-tree-impostors-three-tier-matrix.json`
  is current installed-Chrome WebGPU evidence for the explicit three-tier tree
  route, with screenshots under
  `cycle38-validation/screenshots/desktop-webgpu-tree-impostors-three-tier-matrix/`.
- `cycle38-validation/runtime/android-webgpu-tree-impostors-three-tier-tight-matrix.json`
  is current connected-phone evidence for the same route. Screenshots are
  nonblank, but three full-scene rows fail the mid-mobile budget.

Matt's latest visual observations to carry forward:

- Water now also shows grid-like/alignment lines, as if the texture/ripple or
  heightfield sampling is visibly tiled.
- Sun glint/reflection still reads sticky and out of sync on PC.
- Grass contact must be treated as open: the current proof can show a localized
  change, but the player read is darkening near the dog rather than obvious
  blade bend.
- Sheep legs may be projecting upward in screenshots; fixed-phase WebGPU gait
  proof is required before calling animation repaired.
- Sheep wool still does not read wooly enough; body-only wool needs a better
  silhouette/normal/color pass without corrupting non-body colors.
- The sun/atmosphere desktop proof now uses explicit ownership: the sky owns
  broad glow/horizon warmth and `SunBillboard` owns the readable disc/near
  halo. Open Country has been retuned lower through the `golden-hour` preset;
  use the visual recovery proof screenshots for any further art-direction pass.
- Matt supplied an older WebGL screenshot as the visual reference for the
  repaired cues: grass bend visible through parted blade silhouettes, warm
  structured sun halo, sun-aligned water reflection, and wool breakup on sheep
  bodies. Do not treat this as a wholesale WebGL parity order.
- Open Country terrain still has lines/bands, and tree impostor/grounding read
  is not production-polished.

## Cycle 37 Closeout

Cycle 37 itself completed without changing the WebGL default, merging,
deploying, submitting to a store, paying store fees, signing installers, or
adding Steamworks features. After closeout, Matt approved moving the web route
to a progressive WebGPU default with WebGL fallback and a user-facing
experimental toggle.

Key artifacts:

- Isolated perf recapture: `cycle36-validation/runtime/cycle37-isolated-webgpu-perf.json`.
- Final WebGPU request proof and screenshots:
  `cycle36-validation/runtime/cycle37-final-webgpu-request.json` and
  `cycle36-validation/runtime/cycle37-final-webgpu-request/`.
- Final WebGPU perf proof:
  `cycle36-validation/runtime/cycle37-final-webgpu-perf.json`.
  Rolling Hills passed with `avgFrameTime=6.993 ms`,
  `p95FrameTime=7.29 ms`, and `sampleCount=1144`; Open Country passed with
  `avgFrameTime=6.944 ms`, `p95FrameTime=6.958 ms`, and
  `sampleCount=1151`.
- Native Packaging Proof 0:
  [`docs/native-packaging-proof-0.md`](docs/native-packaging-proof-0.md).
- Store/Steam readiness checklist:
  [`docs/native-store-steam-readiness-checklist.md`](docs/native-store-steam-readiness-checklist.md).
- Native preflight:
  `cycle36-validation/native/preflight.json` passed at
  `2026-05-16T06:36:27.879Z`.
- Post-cycle progressive-default proof:
  `cycle36-validation/runtime/progressive-webgpu-default-request-proof.json`,
  `cycle36-validation/runtime/progressive-webgpu-default-perf-proof.json`, and
  `cycle36-validation/runtime/progressive-webgpu-settings-toggle.png`.

## Mobile WebGPU Readiness Packet

The mobile-readiness pass after Cycle 37 added a first connected-phone WebGPU
proof, custom WebGPU cost reporting, a scene-wide `QualityGovernor`, Android
ADB/CDP perf tooling, mobile WebGPU tree/rock culling, tree/rock cost
estimates, shared branch/leaf wind controls, dog-through-tree leaf occluder
controls, deep-blue shoreline/glint water controls, grass interaction for dog
plus nearest sheep, and high-tier terrain fidelity policy.

Key artifact:

- Android WebGPU perf proof:
  `cycle37-validation/runtime/android-webgpu-rolling-hills-final-2026-05-16.json`.
  Connected device `R5CX4028VGJ` tested through secure localhost
  `http://127.0.0.1:3000` with `adb reverse tcp:3000 tcp:3000`. Android Chrome
  reported WebGPU available. Rolling Hills follow-close full-scene WebGPU passed
  with `p95=16.733 ms`, `p99=16.871 ms`, `drawCalls=37`,
  `avgEstimatedTriangles=753920`, and no recorded page or console errors.

Current validation:

- `npm test` passed 469 specs / 7 skipped after the Cycle 38 tree packet.
- `npm run build` passed with the accepted bundle fixture at `mainKB=590`.
- New Android runner: `npm run perf:android-webgpu`.
- New runtime report shape includes `renderer`, `deviceTier`, `sceneId`,
  `cameraPose`, `frameP95`, `frameP99`, `drawCalls`,
  `estimatedTrianglesBySystem`, `visibleCountsBySystem`, and `qualityState`.

Scope note: this is one Android phone, one scene, and one camera pose. It proves
the new browser/device path and gives a real high-mobile baseline; it does not
certify the whole game across mobile devices.

The next implementation step is Cycle 38: run the scene/camera/system matrix,
add visual screenshot gates, rebuild over-budget author-time tree/rock assets,
wire the remaining adaptive quality knobs, and keep iOS Safari / BrowserStack
water and WebGPU canaries separate from Android Chrome proof.

## Cycle 38 Connected-Android Follow-Up

Cycle 38 is now active and partially implemented, but not complete. The latest
connected-phone evidence is:

- Dog sprint harness is fixed from circular keyboard input to a scene-specific
  cross-island polyline. Current artifact
  `cycle38-validation/runtime/android-dog-sprint-cross-island-polyline-focused.json`
  proves `routeMode="perf-world-drive-cross-island-polyline"`,
  `routeProgress=1.0`, `finalTargetDistance=0.133 m`,
  `netDisplacement=269.164`, and `straightness=0.938`, but it still captures
  sprint spikes (`p95=33.3 ms`, `p99=33.4 ms`, `max=66.6 ms`, three frames
  above `50 ms`). The route bug is closed; the sprint spike blocker is not.
- Android runner now keeps one game page target and closes CDP extras. Smoke
  artifact `cycle38-validation/runtime/android-webgpu-open-country-one-tab-smoke.json`
  ran follow-close and horizon rows, and post-run CDP showed `page:1` plus
  worker targets.
- Open Country terrain split/ring-skirt and continuous WebGPU terrain material
  reduced the worst hard seam. The current focused artifact
  `cycle38-validation/runtime/android-open-country-horizon-current-terrain.json`
  is from the split mobile path (`size=720`, `segments=384`, `skirtSize=3200`,
  `skirtTriangles=3072`) and writes screenshots under
  `cycle38-validation/screenshots/android-open-country-horizon-current-terrain/`.
  The screenshot is nonblank and the old coarse-plane line is reduced, but the
  terrain visual gate remains open until more camera angles show no visible
  bands/seams.
- Open Country high-mobile perf still fails. Follow-close full scene reports
  `p95=50.1 ms`, `p99=50.1 ms`, `drawCalls=87`, and about `996K` estimated
  visible triangles in
  `cycle38-validation/runtime/android-webgpu-open-country-terrain-grass-impostor-followup.json`.
  The current horizon/terrain-seam artifact
  `cycle38-validation/runtime/android-open-country-horizon-current-terrain.json`
  reports `p95=50.1 ms`, `p99=50.2 ms`, `drawCalls=128`, and about `1.147M`
  estimated visible triangles. It correctly reports aggregate `ok=false` after
  the one-row Android budget-result fix.
- Horizon isolation shows combined pressure, not one isolated bug:
  grass-only `p95=66.8 ms` / `p99=83.4 ms`, trees-only `p95=50.1 ms` /
  `p99=66.8 ms`, terrain-only `p95=50.1 ms`, water-only `p95=50.0 ms`, and
  atmosphere-only `p95=33.4 ms`.
- Grass WebGPU interactor data is live for dog plus nearest sheep sorted by
  dog distance, and the node material now has stronger mobile controls
  (`interactionRadius=3.85`, `interactionStrength=0.93`, `visualScale=3.4`,
  `laydownStrength=1.05`). The latest Android probe records eight interactor
  samples, but visual acceptance remains open until screenshots clearly show
  dog and sheep bending grass in actual play.
- Tree grounding probes show sampled Open Country trees placed at terrain
  height (`placementY == groundY`), but the current path is still native LOD1
  geometry. Proper view-dependent octahedral impostors remain the next renderer
  work package.
- A full connected-Android pose matrix now exists at
  `cycle38-validation/runtime/android-webgpu-cycle38-poses.json`. It captured
  Field, Rolling Hills, and Open Country across all five Cycle 38 poses with
  nonblank screenshots under
  `cycle38-validation/screenshots/android-webgpu-cycle38-poses/`. The matrix is
  not green: all 15 rows miss the high-mobile budget and 12 rows miss the
  mid-mobile budget. Field is the draw-call outlier (`732-748` draw calls);
  Rolling Hills is closest but still high-budget-red; Open Country remains
  visually and budget blocked.
- Validation after the latest Cycle 38 corrections: focused syntax checks
  passed, focused tree and material specs passed, full `npm test` passed with
  `469` specs passing and `7` skipped, `npm run build` passed with known chunk
  warnings, and `git diff --check` only reported LF-to-CRLF working-copy
  notices.

## Cycle 38 WebGPU Tree-Impostor Packet

Matt's mobile screenshots exposed two concrete representation bugs: the mid LOD
had sparse leaves visually detached from branches, and the WebGPU impostor path
could render as black/no-texture foliage. The research spike is recorded at
[`docs/archive/research/webgpu-octahedral-impostor-spike-2026-05-16.md`](docs/archive/research/webgpu-octahedral-impostor-spike-2026-05-16.md).

Pickup rules:

- Do not claim WebGPU mobile trees are using production-quality octahedral
  impostors.
- Current sidecars are 4x4 lat/lon hemi-y Kiln atlases, not true octahedral
  atlases.
- The explicit `?konveyorNativeTreeImpostors=1` path is now a three-tier
  production route: near LOD0 geometry, mid branch-preserving LOD1 geometry, and
  far lat/lon-hemi Kiln impostor quads with per-instance camera-driven tile
  offsets/weights and world-up billboard matrix sync.
- The branch fixed the black impostor read by adding a foliage lighting floor
  and ambient tint clamp in the WebGPU Kiln node material, so atlas color stays
  visible in shadowed captures.
- The middle LOD was rebaked to preserve branches and stop the detached-leaf
  read. Current budget evidence:
  `cycle38-validation/assets/mobile-tree-budget-bake.json`.
- Sibling repo review supports the hybrid choice: TIJ vegetation notes prefer
  close mesh LODs or trunk/branch geometry plus impostor canopy when pure
  impostors read poorly, and Pixel Forge vegetation notes reinforce
  base-color/normal impostor sidecars with runtime relighting.
- The remaining proper impostor work is true octahedral sidecar v2 plus WebGL
  parity for shader-side projection, depth/parallax, depth discard, and
  transition quality.
- Executable lab proof now exists: `npm run probe:webgpu-impostor-lab` writes
  `cycle38-validation/runtime/webgpu-impostor-lab-proof.json` plus nonblank
  screenshots under `cycle38-validation/screenshots/webgpu-impostor-lab/`. The
  installed-Chrome proof verifies dynamic uniform tile controls and varied
  lat/lon plus octahedral selector output, while still reporting
  `productionReady=false`.
- Desktop proof is current:
  `cycle38-validation/runtime/desktop-webgpu-tree-impostors-three-tier-matrix.json`
  with screenshots under
  `cycle38-validation/screenshots/desktop-webgpu-tree-impostors-three-tier-matrix/`.
- Android proof is current but budget-red:
  `cycle38-validation/runtime/android-webgpu-tree-impostors-three-tier-tight-matrix.json`
  has nonblank screenshots but three full-scene mid-mobile budget failures,
  including Open Country horizon/terrain-seam at `p95=100.0 ms`,
  `p99=133.5 ms`.
- Re-enable WebGPU production impostors as default behavior only after Android
  screenshot and perf gates prove camera-facing behavior, terrain sync, LOD
  transition quality, and frame-budget compliance.

## Cycle 35 Outcome

Closed 2026-05-11, no version bump. Eight autonomous phases shipped. The original plan had seven phases; two more (HudLayout slot orchestrator + meadow shader compile fix) absorbed mid-cycle during a Matt review pass. Tests 304 pass / 7 skipped, build clean, lint clean, mainKB 590.33 (+0.27 vs Cycle 34's 590.06). Full per-phase summary in [`docs/BACKLOG.md`](docs/BACKLOG.md) Recently Completed → Cycle 35.

The cycle delivered:

1. **Completion observability** end-to-end. Telemetry route fix in [`js/telemetry.js`](js/telemetry.js) (Pages → Worker URL), a new append-only `score_errors` D1 table that captures every `submitScore` throw before propagating, and a client-side `score_submission_failed` emit when `nm.submitScore` rejects. The next regression shows up as data instead of silence.
2. **Leaderboard as `(scene × mode)` identity.** `/api/leaderboard` and `/api/leaderboards` now require a scene; missing returns 400 `{error: 'scene_required'}`. Dropped the cross-scene fast path on `players.*` and the `isNaturalPartition` fallback. Leaderboard UI restructured scene-first; persists last-scene in `localStorage`.
3. **Shoreline foam tracks the visible waterline.** `AnimeWater` accepts a heightfield, samples it as an R32F DataTexture, and computes foam from `|terrain_y - waterY|`. Falls back to the boundary band when no heightfield (Field has no water anyway).
4. **HudLayout (mid-cycle Phase 8).** Slot-based orchestrator deletes the prior pattern of per-component `position: fixed` with hand-tuned offsets. CameraModeIndicator alone lost ~40 lines of compensating positioning code.
5. **Meadow shader compile fix (mid-cycle Phase 9).** Long-standing `vUv` undeclared error on every island scene boot. Fix: `defines: { USE_UV: '' }` on the MeshLambertMaterial.

## Pickup Priority

Work from the current `main` checkout or create a scoped working branch (e.g.
`cycle-38-work`) before committing. Cycle 37 and the first Android
mobile-readiness proof are complete;
do not restart either as an active plan. Read the closeout packet above, then start
[`docs/cycle-38-plan.md`](docs/cycle-38-plan.md) unless Matt explicitly changes
direction.

Matt approved the progressive WebGPU default after Cycle 37. The branch should
now keep WebGPU as the default request on supported browsers, preserve the
WebGL fallback and explicit `?renderer=webgl` escape hatch, and expose the
experimental WebGPU setting as the user-facing rollback. Do not add paid-store
steps, submit to Steam/App Store/Google Play, or cross store/signing/manual
release gates without explicit approval.

Cycle 38 should close the gap between "works on the connected phone" and
"mobile-ready policy": Field, Rolling Hills, and Open Country across
follow-close, classic-max, tree-occluded, shoreline/glint, and
horizon/terrain-seam poses; full-scene plus terrain, grass, trees, rocks,
water, sheep, and atmosphere isolation; screenshot gates for the visual parity
fixes; and asset-budget rebakes for production tree/rock presets.

The branch now has native-readiness code before a shell dependency:
`BUILD_TARGET=native`, `SDS_WORKER_BASE`, `js/runtimeConfig.js`, and
`npm run native:check`. Use that path for native-shaped perf/profiling work
without committing to Tauri, Electron, or Capacitor yet.
The broader native/release option space is now captured in
[`docs/archive/research/native-release-oss-options-spike-2026-05-16.md`](docs/archive/research/native-release-oss-options-spike-2026-05-16.md):
compare pinned Chromium, platform WebViews, mobile shells, PWA/TWA wrappers,
Steamworks integrations, and true-native rewrite paths by SDS proof, not vibes.
The performance/Rust/WASM option space is captured in
[`docs/archive/research/perf-extensibility-rust-oss-spike-2026-05-16.md`](docs/archive/research/perf-extensibility-rust-oss-spike-2026-05-16.md):
profile first, prefer JS allocation fixes/worker offload/offline Rust tools or
visual-only WebGPU compute, and keep deterministic `shared/**` rewrites behind
explicit authorization.

Cycle 36 foundation evidence is complete. The perf harness has been repaired
and `tests/perf-baseline/baseline.json` now has all six default configs passing
with 900 samples each. Desktop and mobile-profile latency gates are executable.
Screenshot diff enforcement now has committed 12-cell goldens and a deterministic
capture contract; `npm run validation:screenshots -- --diff` has passed on
2026-05-15 with no missing cells; the current refreshed mean SSIM is
0.9945007926542798. Automation starts for Vite dev validation should set
`SDS_SUPPRESS_BROWSER_OPEN=1` so `server.open` does not create real Chrome tabs
during probes. Runtime proof is recorded at
[`docs/archive/research/cycle-36-konveyor-runtime-proof.md`](docs/archive/research/cycle-36-konveyor-runtime-proof.md),
and the Rolling Hills WebGPU spike is blocked by broad GLSL shader surface at
[`docs/archive/research/cycle-36-webgpu-hero-blocker.md`](docs/archive/research/cycle-36-webgpu-hero-blocker.md).
Post-foundation production renderer setup now lives in
[`js/rendering/sceneRendererSetup.js`](js/rendering/sceneRendererSetup.js):
`SceneManager` still creates a WebGL renderer, but its WebGL capability probes,
context handlers, shadow/pixel-ratio setup, and tonemapping choice are explicit
and test-covered. It can also consume an explicit renderer/configure factory for
proof runs. Treat that as a renderer-boundary seam for the next narrow
scene-bound WebGPU proof, not as a production WebGPU boot claim. The first
opt-in proof now exists at
[`cycle36-validation/runtime/scene-manager-webgpu-renderer-proof.json`](cycle36-validation/runtime/scene-manager-webgpu-renderer-proof.json):
installed Chrome injects a real `WebGPURenderer` into `SceneManager`,
  initializes it through `SceneManager.whenRendererReady()`, renders
  the proof frame through `SceneManager.render()` using the async WebGPU render
  path, routes production `Atmosphere` sky/cloud/fog, `SunBillboard`,
  `TerrainBuilder.createTerrain()`, `AnimeWater.createAnimeWater()`, and a
  representative `PortalEffect`, `CorralZapEffectPool`, tree/rock GLB
  material-replacement/native-instancing, `GrassSystem`, `OptimizedSheepSystem`,
  and Kiln impostor slice through the diagnostic-installed
  `window.__sdsKonveyor*MaterialFactories` WebGPU supply on that
  `SceneManager` scene, and
  captures a nonblank 320x180 screenshot with a visible compact
  tree/rock/sheep/Kiln/terrain/water/grass/effects slice while normal
  production boot remains unchanged. The proof adds
WebGPU-module
ambient/directional lights only inside the diagnostic harness because the
vendored WebGPU Three module does not share light objects with default
production Three; normal `SceneManager` lighting remains present and untouched.
Newer production boot scout evidence now exists at
[`cycle36-validation/runtime/production-webgpu-boot-scout.json`](cycle36-validation/runtime/production-webgpu-boot-scout.json):
installed Chrome loads the built production preview at
`?renderer=webgpu&diagnostic=1&konveyorProductionBootScout=1&testNoCanvas=1&konveyorProductionSceneBody=1&konveyorNativeInstancing=1&konveyorProductionLoopScout=1&konveyorProductionRafScout=1&scene=field`,
bypasses the diagnostic scene boot (`diagnosticBoot: false`), constructs the
normal `SheepDogSimulation` shell with injected WebGPU `SceneManager` options,
waits through `SceneManager.whenRendererReady()`, installs the existing WebGPU
factory globals, runs the normal Home Field scene-body init once, and drives a
guarded 12-frame WebGPU scene-loop scout plus a bounded 12-frame
`requestAnimationFrame` scout. The artifact records
`rendererIsWebGpu: true`,
`rendererSetup.rendererMode: "non-webgl"`, `renderStatus.mode: "async"`,
terrain/grass/sheep WebGPU material application, and a nonblank canvas
screenshot. Treat this as guarded scene-loop evidence only: `testNoCanvas=1`
still prevents the normal gameplay start path, while the rAF scout proves the
shared frame body can run from browser frame timestamps. The current loop proof
records
`frameCount: 12`, `performanceFrameCount: 12`, grass time advancing from 0 to
0.2, `sharedFrameStep: true` through `SheepDogSimulation.runFrame(deltaTime)`,
no frame errors, no console/page errors, first-frame WebGPU warmup at
2595.6 ms, and later proof frames between 9.2 and 21.3 ms. The rAF scout then
records `frameCount: 12`, `scheduler: "requestAnimationFrame"`,
`performanceFrameCount: 24`, grass time advancing from 0.2 to 0.3347, monotonic
timestamps, no frame/console/page errors, and per-frame render elapsed samples
between 7.4 and 13.1 ms; it is not yet a perf threshold gate. The latest proof
no longer suppresses
`InstancedMesh2`: under the guarded `konveyorNativeInstancing=1` route,
production tree placement renders 2,002 Home Field trees through 4 native
`THREE.InstancedMesh` groups, rock placement renders 334 rocks through 3 native
`THREE.InstancedMesh` groups, and `suppressedWebglOnlyObjects` is empty.
Additional guarded gameplay-start evidence now exists at
[`cycle36-validation/runtime/production-webgpu-gameplay-scout.json`](cycle36-validation/runtime/production-webgpu-gameplay-scout.json):
the same production scout route runs without `testNoCanvas=1`, uses normal
constructor `init()` plus `animate()`, autostarts solo Classic play, advances the
normal animation loop from `performanceFrameCount` 6 to 68, records a
60-frame normal-loop timing sample (`avgMs: 11.64`, `p95Ms: 14.9`,
`p99Ms/maxMs: 53.6` from an initial warmup spike), advances grass time from
4.0586 to 4.8102, creates a dog plus 200 sheep, records async WebGPU render
status with no init/console/page errors, and captures a nonblank gameplay
canvas screenshot. This is still diagnostic-gated scout evidence, not default
WebGPU production enablement or a perf threshold pass. Plain non-diagnostic
`?renderer=webgpu` now has a separate production-route proof; default URLs
still remain WebGL.

The guarded gameplay-start scout now covers all shipped scenes. Home Field is
[`cycle36-validation/runtime/production-webgpu-gameplay-scout.json`](cycle36-validation/runtime/production-webgpu-gameplay-scout.json),
Rolling Hills is
[`cycle36-validation/runtime/production-webgpu-gameplay-scout-rolling-hills.json`](cycle36-validation/runtime/production-webgpu-gameplay-scout-rolling-hills.json),
and Open Country is
[`cycle36-validation/runtime/production-webgpu-gameplay-scout-open-country.json`](cycle36-validation/runtime/production-webgpu-gameplay-scout-open-country.json).
Open Country records `nativeRockInstancing.emptyPlacement: true`; that is a
valid zero-rock placement after island water/corral filtering, not a WebGPU
failure. All three scene artifacts are `ok: true`, have no console/page errors,
and capture nonblank gameplay canvases.

The current default-ready parity artifact is
[`cycle36-validation/runtime/production-gameplay-parity-proof.json`](cycle36-validation/runtime/production-gameplay-parity-proof.json),
captured 2026-05-16T00:12:39.618Z. It compares production WebGL against the
guarded production WebGPU route for Field, Rolling Hills, and Open Country.
`ok: true` and `defaultReady: true` now mean the runtime/capture gates plus
semantic regional color/luma gates pass; full-frame SSIM remains advisory
because alpha-hashed foliage and grass are structurally different across the
two renderers.

The current plain non-diagnostic production WebGPU request proof is
[`cycle36-validation/runtime/production-webgpu-request-proof.json`](cycle36-validation/runtime/production-webgpu-request-proof.json),
captured 2026-05-16T01:49:53.535Z on installed Chrome. It confirms the default
URL remains `effective: "webgl"` with no fallback, proves a simulated browser
without `navigator.gpu` fails closed to WebGL with
`fallbackReason: "webgpu-unavailable"`, proves a browser with `navigator.gpu`
but a failing `requestDevice()` falls back to WebGL with
`fallbackReason: "webgpu-device-request-failed"`, then runs Field, Rolling
Hills, and Open Country at plain
`?renderer=webgpu&autostart=1&mode=classic`, reports
`effective: "webgpu-production"` with no fallback and successful device
preflight, applies the centralized WebGPU factory suite, routes tree/rock
placement through native `THREE.InstancedMesh`, applies
terrain/grass/sheep/water/tree-rock materials, captures nonblank screenshots,
and records no console/page errors.
`konveyorProduction=1` remains compatible but is no longer required for an
explicit WebGPU renderer request.

The explicit production WebGPU route now also has a post-warmup perf threshold
proof at
[`cycle36-validation/runtime/production-webgpu-perf-proof.json`](cycle36-validation/runtime/production-webgpu-perf-proof.json),
captured 2026-05-16T01:50:50.393Z on installed Chrome. The tool warms each
scene for 5000 ms, resets `window.__perfHarness`, samples 8000 ms, and enforces
the same local desktop frame-time budget used by the Open Country WebGL perf
e2e: average <= 22 ms, p95 <= 30 ms, and at least 240 samples. Current results:
Field `avgFrameTime=6.956 ms`, `p95=7.067 ms`; Rolling Hills
`avgFrameTime=6.944 ms`, `p95=6.952 ms`; Open Country
`avgFrameTime=6.944 ms`, `p95=6.952 ms`. The proof also requires
`effective: "webgpu-production"`, no fallback, WebGPU renderer identity, clean
console/page state, and matching scene identity.

The first real two-client multiplayer WebGPU proof is
[`cycle36-validation/runtime/production-webgpu-mp-proof.json`](cycle36-validation/runtime/production-webgpu-mp-proof.json),
captured 2026-05-16T01:42:30.718Z on installed Chrome against local Vite +
Wrangler. It drives host and guest through a worker-backed cooperative room,
starts gameplay without `testNoCanvas`, captures both rendered canvases, and
requires both clients to report `effective: "webgpu-production"`,
`sceneId: "field"`, `roomState: "in-game"`, connected two-player room state,
nonblank screenshots, and clean console/page state. This proof exposed and fixed
two MP-only gaps: host scene sync now awaits the selected room scene before lobby
monitoring, and production WebGPU state is refreshed after in-process scene
rebuilds so swap-backed proofs no longer describe the boot scene.

The current public-site iOS Safari water baseline is also green, but it is not
evidence for this unpublished branch. `IOS_WATER_BASE_URL=https://sheepdogsim.com
npm run test:ios-water` passed on BrowserStack iPhone 15 Pro Max / iOS 17 Safari
at 2026-05-16T01:57Z. The attached sample averaged `[29, 42, 20]` and reported
`nearFoamWhite: false` against the foam-white failure color `[234, 246, 255]`.
Rerun this after any deploy that carries the WebGPU packet.

Matt's local WebGPU visual review after opening
`?renderer=webgpu&scene=open-country&autostart=1&mode=classic` found that the
route works but is not production-polished. Record of findings:
[`docs/konveyor-visual-polish-qa-2026-05-16.md`](docs/konveyor-visual-polish-qa-2026-05-16.md).
Key issues: non-interactive grass, bland water, sky/cloud cutoff line, missing
or unreadable sun, leaf wind detaching from static branches, and
incorrect/black/palette ground material mapping. The prior look, WebGL, old
screenshots, roadmap, and current scene identity are art-direction references
only, not strict parity targets. The active visual goal is a calmer, richer,
more intentional WebGPU scene that feels relaxing and zen-like while still
carrying mystery and adventure. Next visual work should prioritize ground
material mapping, sky/cloud cutoff plus sun readability, water richness, tree
wind coherence, then grass interaction.

2026-05-16 implementation status: the first WebGPU visual-polish pass is now
implemented and validated on the experimental branch. Final evidence lives at
`cycle36-validation/runtime/visual-polish-final2-webgpu-request.json`, final
screenshots at
`cycle36-validation/runtime/visual-polish-final2-webgpu-request/`, and perf
proof at `cycle36-validation/runtime/visual-polish-final-webgpu-perf.json`.
Fresh validation from the repeated 2026-05-16 `/goal` lives at
`cycle36-validation/runtime/visual-polish-refresh-webgpu-request.json`,
`cycle36-validation/runtime/visual-polish-refresh-webgpu-request/`,
`cycle36-validation/runtime/visual-polish-refresh-webgpu-perf.json`, and
`cycle36-validation/runtime/visual-polish-refresh-grass-interaction.json`.
The pass preserved WebGL as default, preserved fallback gates, made the sun
readable in WebGPU, repaired the worst ground/sky/water/grass/tree-wind reads,
and did not cross merge, deploy, default-renderer, or manual production gates.
Remaining review is art-direction/human acceptance, not WebGL parity.
The contaminated live perf warning was resolved by Cycle 37 Phase 1. Under
isolated installed-Chrome production preview, Rolling Hills and Open Country
both stayed well under the 22 ms average / 30 ms p95 budget. The sun/sky
follow-up from
[`docs/archive/research/sun-sky-atmosphere-perf-spike-2026-05-16.md`](docs/archive/research/sun-sky-atmosphere-perf-spike-2026-05-16.md)
is also closed for this cycle: `AtmosphereFrame.v1` now records the shared
sun/sky/fog/cloud packet, `SunBillboard` owns the readable disc, the WebGPU sun
is materially larger, sky/cloud/fog horizon tuning is recorded in the final
request proof, and final Rolling Hills/Open Country screenshots plus perf
artifacts are under `cycle36-validation/runtime/cycle37-final-*`.

Rolling Hills terrain placement is fixed in current proof: the camera sample is
`y=43.134`, `surfaceY=31.134`, `aboveSurface=12`, and sheep placement reports
`matrixSurfaceAbsMax=0` plus `belowWaterMatrices=0`. The runtime fix keeps
`OptimizedSheepSystem` heightfield-aware from first construction through reset,
update, force-update, and corral ascent paths. The scene-swap fix also caps
client frame `deltaTime` at 0.05s and resets `lastTime` after in-process scene
rebuilds so a rebuild stall cannot fling a fresh flock to an island boundary.
`npx playwright test tests/e2e/scene-swap-stability.spec.ts --project=chromium`
passed after this change, including Field -> Rolling Hills -> Open Country
heightfield refresh and OC sheep in-bounds checks.
Chromium `oc-perf` now launches through the Windows D3D11 GPU path via
`playwright.config.ts`; the repaired perf run produced 480 samples with
`avgFrameTime=16.6657 ms` and `p95=16.6867 ms`.

Keep two carryovers visible:

1. **Phase 7 carryover from Cycle 35: paired OC MP playtest.** Matt at the keyboard, two browser tabs, host an OC cooperative room, drive sheep into the round-up zone at (0, 50), confirm `roundup → drive` flips server-side at hold=2.0s and the portal at z=295 opens. Cannot run autonomously.
2. **iOS Safari foam canary post-deploy.** `npm run test:ios-water` against `https://sheepdogsim.com/` after the latest deploy lands. The current public site passed at 2026-05-16T01:57Z, but that does not cover this unpublished branch. Hard-stop gate from Cycle 32. If `nearFoamWhite: true`, revert Phase 6 and re-open as a paired investigation.
3. **Renderer telemetry readout post-deploy.** After traffic hits a deployed build with `renderer_mode_resolved`, run `npm run konveyor:renderer-telemetry -- --days=7` to summarize requested/effective renderer, fallback reason, device-preflight, scene id, and production WebGPU success before making a default-renderer policy decision. Current live remote smoke returned zero rows before this branch deploys, which is expected.

Automated coverage now reduces the first carryover but does not close it:
`npx playwright test tests/e2e/mp/in-game-state.spec.ts --project=mp --reporter=list`
passes 4/4 and includes an Open Country cooperative room that preserves
`sceneId: "open-country"` across host create, guest join, and start-game. The
worker objective snapshot spec now also drives the authoritative OC
`GameSimulation.tick()` path through `roundup -> drive` and proves corral
retirement stays closed until `drive`. The local-only scene-swap e2e also
proves the OC objective-stage event opens the portal target and hides the
round-up decal in a real browser scene. The manual playtest is still needed for
actual two-client sheep driving through the objective.

**Closed 2026-05-12:** D1 telemetry-route verification. Remote query confirmed `mode_selected` landed 2026-05-11 23:34:45 (after the 18:53 deploy), so the route fix is working end-to-end. `score_errors` table clean (0 entries). No `game_completed` yet, but that's traffic (3 GSC clicks in the same period), not a route bug.

**Closed 2026-05-13:** leaderboard solo-tab correction and content-campaign alignment. `GlobalLeaderboard` now shows solo modes for every concrete scene while multiplayer tabs still follow `scene.allowedModes`. The May 2026 Discord/devlog/capture docs live at [`docs/content-campaign-2026-05.md`](docs/content-campaign-2026-05.md), [`docs/capture-pipeline-spike-2026-05.md`](docs/capture-pipeline-spike-2026-05.md), and [`assets/marketing/content/2026-05-update/discord-threejs-update.md`](assets/marketing/content/2026-05-update/discord-threejs-update.md). Current Discord attachment image: [`assets/marketing/og/og-rh-sunset.webp`](assets/marketing/og/og-rh-sunset.webp). Generated MP4s are review-only; next capture pass should wait for the optimization/EZ-Tree/tree-spacing prep in [`docs/tree-pipeline.md`](docs/tree-pipeline.md).

## Backlog Deferred Behind Konveyor

The prior candidate list remains valid backlog, but it is not the active
autonomous branch objective unless Matt explicitly redirects away from
Konveyor:

1. **OC objective HUD polish.** MP-specific copy or per-player progress indicators on the ObjectiveBanner. Decide after the Phase 7 playtest.
2. **Promote `worker-objective-snapshot.spec.js` into the WS two-client harness.** Requires unskipping `tests/integration/flow.spec.ts`.
3. **Mountains: real horizon ring** as height-displaced skirt that the play-area heightfield blends into.
4. **Bespoke pixel-forge rocks**, **octahedral impostors v2**, **cross-module polygon-spawn dedup**, **build-time `displacedHeights` bake**, **inline `_groundY`** — long-tail polish.
5. **Drop `players.solo_*_best` materialized columns** if a future cycle wants the destructive migration (deferred Q1 in Cycle 35).
6. **Delete legacy `updateGrassLOD` + `updateTreeLOD`** in [`TerrainBuilder.js`](js/TerrainBuilder.js).
7. **Cycle 33 carryovers** still open: local-tunnel BrowserStack canary on Ubuntu (manual `gh workflow run browserstack-ios-water.yml` with empty `base_url`); Node 20 GHA deprecation annotation re-check on next Deploy run.

## Frozen Files (durable fence)

Durable fence applies in full ([`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md)). No cycle-36-specific freezes yet.

## Operational Notes

- **Cloudflare creds**: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in `~/.config/mk-agent/env` (loaded via `set -a && source ~/.config/mk-agent/env && set +a` before any `wrangler d1` command). The current token has scopes `Zone Settings:Edit`, `D1:Read`, `Workers Scripts:Read`. For Web Analytics / RUM lifecycle operations the API tokens are unreliable; use the dashboard cookie session (Claude in Chrome) instead.
- **D1 queries**: use `npx wrangler d1 execute sds-db --remote --command "..." --json` for read-only inspection. Database id `513aa937-e60a-4fb6-b499-9f3814149e88`. Direct API: `POST https://api.cloudflare.com/client/v4/accounts/{acct}/d1/database/{db}/query` with `{sql: "..."}` body.
- **D1 schema snapshot**: 6 applied migrations (0001-0006). `score_errors` table is the newest, added in Cycle 35 Phase 2.
- **Zone settings live state (as of 2026-05-12):** `min_tls_version=1.2`, `always_use_https=on`, `0rtt=on`, `http3=on`, `tls_1_3=zrt`, `brotli=on`, `early_hints=on`, `automatic_https_rewrites=on`, `always_online=on`, `development_mode=off`, Crawler Hints (Beta)=on, IndexNow=on (last two dashboard-only).
- **Cloudflare Web Analytics:** one site only (token `b5895c76...`, host filter `(sds-frontend.pages.dev|sheepdogsim.com)$`). The stale auto-install ruleset from 2025-07-06 was deleted 2026-05-12.

## Reference Table

| Area | Source of truth |
|---|---|
| Active autonomous brief | [`docs/konveyor-autonomous-run.md`](docs/konveyor-autonomous-run.md) |
| Foundation evidence | [`docs/cycle-36-plan.md`](docs/cycle-36-plan.md) |
| Konveyor campaign doctrine | [`docs/konveyor-sds.md`](docs/konveyor-sds.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-35-plan.md`](docs/archive/cycles/cycle-35-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Security advisory acceptance log | [`docs/security-acceptance.md`](docs/security-acceptance.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |

## Running Locally

```bash
npm run dev
npm test
npm run lint
npm run build
npm run test:e2e -- --project=chromium --grep-invert @local-only
npm run test:ios-water
npm run test:integration
```

Useful URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl`, `?cinematic=1`, `?ui=off`, `?sun=0.5`, `?perfMode=1`, `?tier=low|med|high`, `?tonemap=aces|neutral|linear|none`.

D1 inspection:

```bash
set -a && source ~/.config/mk-agent/env && set +a
npx wrangler d1 execute sds-db --remote --command "SELECT COUNT(*) FROM score_submissions;" --json
npx wrangler d1 execute sds-db --remote --command "SELECT * FROM score_errors ORDER BY submitted_at DESC LIMIT 10;" --json
npx wrangler d1 execute sds-db --remote --command "SELECT name, COUNT(*) FROM events GROUP BY name;" --json
```
