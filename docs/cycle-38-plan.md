# Cycle 38 - Polished WebGPU Production Readiness

Status: active, partially implemented; mobile readiness still open.
Date: 2026-05-16 (last meaningful edit: 2026-05-20).
Branch: current `main` checkout unless a scoped working branch is created.

## Goal

Make WebGPU production readiness real enough to ship as policy, not just a
single-phone proof. Validate the WebGPU/mobile budget layer across scenes,
camera poses, and isolated systems; close visual acceptance regressions with
screenshots; rebuild or replace over-budget author-time assets; and prove a
production-ready tree octahedral impostor path that works on both PC and
mobile.

This cycle must not regenerate trees or rocks at runtime. Production trees
and rocks are committed assets with explicit budgets, LODs, and impostor
sidecars.

## Current state pointers

Don't repeat running narrative here. The pickup-state-of-record is
[`../NEXT_SESSION.md`](../NEXT_SESSION.md). The underlying rationale and
spike evidence lives in:

- Grass/sheep/wool/sun first-principles repair:
  [`archive/research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md`](archive/research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md).
  Current desktop proof: shadow-disabled grass deformation, fixed-phase
  sheep leg + body-only wool, bounded sun/atmosphere.
- WebGPU octahedral impostor spike:
  [`archive/research/webgpu-octahedral-impostor-spike-2026-05-16.md`](archive/research/webgpu-octahedral-impostor-spike-2026-05-16.md).
  Current `?konveyorNativeTreeImpostors=1` route is a lat/lon-hemi
  compatibility stage; true octahedral sidecar v2 remains open.
- 2026-05-16 tree-placement readability amendment (active scope): see
  Phase 3 below.
- 2026-05-20 connected-phone spot-check:
  `cycle38-validation/runtime/android-webgpu-phone-reconnect-spotcheck.json`.

Treat the latest validation artifacts under `cycle38-validation/` as the
current ground truth for what is implemented. The cycle is not complete and
SDS is not mobile-ready.

## Budgets

- High mobile: `p95 <= 18.5 ms`, `p99 <= 25 ms`.
- Mid mobile: `p95 <= 34 ms`, `p99 <= 45 ms`, no repeated spikes above `50 ms`.
- WebGPU draw-call target: under `250`.
- High-mobile visible geometry target: near or below `1M` estimated triangles.
- Tree targets: `tree1` LOD0 <= `4k` tris; broad-canopy tree LOD0 <= `8k`
  tris; LOD1 <= `25%` of LOD0; far impostor sidecar mandatory.
- Rock target: <= `500` triangles per rock unless explicitly approved.

## Autonomous Completion Brief

When the operator opens the next session and authorizes autonomous completion
(e.g. "run cycle 38 autonomously" or "ship it, I'll review when complete"),
absorb the brief below and do not pause for normal-engineering blockers.
Treat mid-session directives as scope clarifications, not pause requests
(see memory `feedback_autonomous_cycle` under `~/.claude/projects/...`).

### Authorization scope

- Continue Cycle 38 work without check-ins between phases or tasks.
- May edit anything under `js/`, `tools/`, `tests/`, `docs/`, `assets/`,
  `public/`, `scripts/`.
- May create new validation tools and artifacts.
- May regenerate `tests/refactor-baseline/__fixtures__/bundle-sizes.json` if
  ratchets are explained and recorded (current cap `591 KiB`).
- May regenerate `tests/tree-placement.spec.js` fixtures only within the
  scope of the 2026-05-16 placement amendment below.
- May commit and push doc-only or asset-only changes. Code commits stay
  local unless the session opens with push/deploy authorization.

### Out of scope without explicit additional approval

- `shared/**` deterministic-sim source (the `shared/TreePlacement.js`
  exception is already exercised).
- `tests/sim-baseline/__fixtures__/*.json` regeneration.
- `worker/migrations/*.sql` edits or D1 migrations.
- `package.json#version` bump, tag, or `CHANGELOG.md` player-line entry.
- Production deploy, Steam/App Store/Google Play submission, store fees,
  signing, paid services, native-shell dependency commitment, Cloudflare
  API changes beyond read.
- Mass deletion of `cycle*-validation/**` artifacts (gitignored; keep on
  disk for audit).

### Definition of Done

Treat the cycle as ready-to-close when every box below either flips to done
or is explicitly carried over to a successor cycle with a reason. Phase 6
items that require the operator or a deploy are carryovers by definition.

Phase 2 - Visual screenshot gates (autonomous-implementable):

- [ ] Water grid/alignment lines fixed on RH and OC shoreline-glint poses
      (reproduced 2026-05-20 on
      `cycle38-validation/screenshots/android-webgpu-phone-reconnect-spotcheck/rolling-hills-classic-shoreline-glint-full.png`).
      Likely UV tiling or normal/ripple sampling alignment. Acceptance:
      desktop and phone capture for the same pose show no horizontal banded
      ripple.
- [ ] Sun glint sync: rotating camera changes glint position in capture
      pairs; no fixed overblown sparkle.
- [ ] Open Country terrain seams: three OC camera angles (follow-close,
      classic-max, horizon-terrain-seam) show no visible flat bands at the
      inner/skirt boundary.
- [ ] Dog-through-tree readability in Follow + Classic behind dense OC
      trees.
- [ ] Tree coherence: branches and leaves move together on RH and OC, no
      detached leaf flutter.
- [ ] WebGL-reference comparison artifact for grass deformation, sun halo,
      and sheep wool silhouette saved under
      `cycle38-validation/screenshots/webgl-reference-comparison/`.

Phase 3 - Production tree octahedral impostors (autonomous-implementable):

- [ ] True octahedral sidecar v2 baked through
      `tools/bake-tree-impostors.mjs` (extend or replace the 4x4
      lat/lon-hemi bake).
- [ ] WebGPU Kiln node material handles octahedral projection,
      depth/parallax, and depth discard parity with WebGL.
- [ ] `tree2` LOD0 + LOD1 confirmed within budget (current
      `tree2.glb=7700 tris`, `tree2_lod1.glb=1924 tris`); lock with a test.
- [ ] Android matrix at `?konveyorNativeTreeImpostors=1` shows
      view-dependent tile selection, terrain-grounded pivots, no sunk-tree
      read, and OC horizon/terrain-seam at or under mid-mobile budget
      (current `p95=100.0 ms` / `p99=133.5 ms`).
- [ ] Desktop installed-Chrome WebGPU matrix at the same flag shows
      transition quality (no popping at LOD0->LOD1->impostor boundaries).

Phase 4 - Quality governor hysteresis (autonomous-implementable):

- [ ] 5-10 second over-budget window degrades quality with hysteresis (no
      single-frame oscillation). Proof artifact records the response.
- [ ] Quality recovers after sustained stable windows.
- [ ] `fallbackReason='webgpu-frame-budget'` recorded only after the floor
      still misses stable 30 fps for repeated windows.

Phase 1 - Real-device matrix (mostly closed):

- [x] Cost-report shape, secure-localhost Android, failure payload shape.
- [ ] Connected-Android matrix passes high-mobile budget on RH
      follow-close / tree-occluded after Phase 3 + 4 work lands. OC may
      remain mid-mobile only; cycle close acceptable with the gap documented.

Phase 5 - Broader device proof (carryover, do not block close):

- [ ] Multi-Android profiles (high/mid/low). Operator does not currently
      have the hardware.
- [ ] iOS Safari WebGPU canary stays separate from Android Chrome proof.

Phase 6 - Release and ops carryovers (require operator or deploy):

- [ ] OC paired two-client sheep-driving playtest. Operator at keyboard,
      two browser tabs, OC cooperative room, drive sheep into round-up zone,
      confirm portal opens server-side.
- [ ] Post-deploy iOS water canary via `npm run test:ios-water` against
      the deployed origin.
- [ ] Renderer telemetry readout via
      `npm run konveyor:renderer-telemetry -- --days=7` after deployed
      traffic.

### Validation gates (run before /cycle-close)

- `npm test`, `npm run lint`, `npm run build` clean.
- `npx playwright test tests/e2e/scene-swap-stability.spec.ts --project=chromium` green.
- All cycle 38 acceptance artifacts present and `ok: true` where applicable.
- `git diff --check` only reports LF/CRLF working-copy notices.

### Close-out ritual

1. Run validation gates. Any red blocks close per
   [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md).
2. Run `/cycle-close`
   ([`../.claude/commands/cycle-close.md`](../.claude/commands/cycle-close.md)).
3. Do not bump `package.json#version` and do not push a player-visible
   release without explicit operator approval inside the session.
4. Leave new commits unpushed unless the session opened with push
   authorization. Surface the cycle close summary, carryovers, and the
   explicit ask before pushing.

### Hard stops during autonomous run

Pause and surface only on:

- Any [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) condition.
- Frozen-file violation request without authorization
  ([`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)).
- Sim-baseline or refactor-baseline drift not explicitly authorized here.
- `npm test` or `npm run build` red at cycle close.
- Bundle-size regression above `591 KiB`.
- Visual regression on a previously-passing scene.
- A required external action (deploy, store, paid service, native shell).
- Connected Android phone unavailable mid-run and remaining work requires
  phone evidence.

### Artifact paths

Write proof artifacts under `cycle38-validation/runtime/` for JSON and
`cycle38-validation/screenshots/<probe-name>/` for image evidence. Name
probes descriptively (e.g. `android-webgpu-water-grid-fix-after.json`).
These paths are gitignored but kept on disk for audit.

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
- Failures include device id, renderer, scene, pose, system isolation mode,
  frame percentiles, draw calls, estimated triangles by system, and visible
  counts by system.

## Phase 2 - Visual Acceptance Screenshot Gates

Add screenshot or runtime gates for the visual regressions that triggered
this cycle:

- Dog remains readable behind dense tree leaves in Follow and Classic
  cameras.
- Tree branches and leaves move as one coherent tree; leaves may flutter
  but do not visually detach from static branches.
- Ocean reads deep blue away from shore.
- Shoreline foam appears at terrain/water contact.
- Water shows no grid-like texture/ripple alignment lines or tiled sampling
  bands.
- Glint varies with sun direction and camera angle and is clamped enough to
  avoid a fixed overblown sparkle.
- Sheep and dog visibly bend grass on rolling hills. Grass proof includes a
  shadow-disabled deformation crop; darker grass around an actor does not
  close this gate. Compare against the older WebGL reference for
  silhouette-level blade bend, not only pixel-diff thresholds.
- Sheep legs visibly animate in the WebGPU sheep material path; fixed-phase
  WebGPU crops show no upward leg-spike silhouette.
- Sheep wool reads as body-only fleece in a close WebGPU crop without
  changing face, leg, eye, or nose colors.
- Rolling Hills and Open Country show a warm bounded sun disc, not a large
  clipped white patch.
- Open Country reads low-sun dawn/late-day rather than high afternoon.
- Sun/water proof recovers the older WebGL reference's structured warm halo
  plus sun-aligned water reflection without accepting an uncontrolled
  clipped white blob.
- Terrain has no obvious flat seams from mobile camera angles.

Acceptance:

- Screenshots are captured for the same scene/camera poses used by the perf
  matrix.
- Visual fixes are not considered closed only because material controls
  exist; they must be visible in captured frames.
- Visual fixes are not considered closed by pixel deltas alone; the
  captured proof must show the intended physical read.

## Phase 3 - Production Tree Octahedral Impostors And Asset Budgets

Rebuild or replace production tree and rock presets against explicit
budgets. For trees, the priority is the production octahedral impostor
contract, not another temporary billboard/LOD hack:

- No runtime tree or rock generation.
- Every production tree needs LOD0, LOD1, and Kiln impostor sidecars.
- WebGPU production must not consume the existing fixed-tile Kiln node
  impostor as the mobile LOD until the dynamic-tile production acceptance
  gates pass.
- A production tree impostor must be camera-driven per instance, project as
  a stable world-up billboard, select and blend the correct view frames,
  preserve terrain-grounded pivots/base offsets, avoid the "sunk tree"
  read, and prove LOD transition quality in screenshots.
- If current 4x4 lat/lon-hemi Kiln sidecars are retained temporarily,
  document that as a compatibility stage. True octahedral sidecars remain
  the target before calling this path production-polished.
- Rebuild `tree2` first because it is the known broad-canopy budget
  outlier.
- Keep rocks under the `500` triangle target unless a specific exception is
  recorded.
- Preserve placement and collision contracts unless the active cycle
  explicitly accepts deterministic baseline changes.

### 2026-05-16 Tree Placement Amendment

This amendment is part of Cycle 38 acceptance:

- `shared/TreePlacement.js` may change to add a deterministic cross-zone
  visual-spacing pass after candidate generation.
- The pass keeps trunk collision radius separate from visual canopy
  spacing. `radiusXZ` remains the gameplay trunk radius; canopy footprint
  is used only to stop two trees rendering on top of each other.
- Per-scene `treeScaleJitter` may be tightened so production trees no
  longer read as undersized saplings in WebGPU/mobile LOD captures.
- The `tests/refactor-baseline/__fixtures__/scatter-positions.json` drift
  is intentional if and only if the new counts/hashes match the amended
  placement contract and the tree-placement tests prove zero canopy
  overlaps.
- The `tests/refactor-baseline/__fixtures__/bundle-sizes.json` main bundle
  ratchet may move from `590 KiB` to `591 KiB` for this placement filter
  only.
- No sim-baseline goldens are expected to change.

Acceptance:

- Asset budget specs fail if required LOD/impostor sidecars are missing or
  if triangle/byte/material budgets are exceeded without an explicit
  cycle-plan exception.
- Visual screenshot comparison confirms the rebuilt assets and impostors
  are not a visual downgrade on PC or mobile.
- Android and desktop proof artifacts show the tree impostor path is
  active, view-dependent, terrain-synced, and within the appropriate frame
  budget before it replaces chunked native LOD1 as the mobile production
  path.

## Phase 4 - Quality Governor Knob Wiring

The `QualityGovernor` and quality-state plumbing exist. Cycle 38 should
wire the remaining adaptive controls so the governor can actually protect
frame pacing:

- Render scale.
- Grass density and grass draw distance.
- Tree LOD bias and impostor thresholds.
- Water sparkle/glint cost.
- Sheep animation update cadence.
- Terrain segment/resolution policy.

Acceptance:

- 5-10 second windows degrade with hysteresis after repeated over-budget
  samples.
- Quality recovers after sustained stable windows.
- WebGPU remains first choice on mobile while quality is above the floor.
- `fallbackReason='webgpu-frame-budget'` is recorded only after the minimum
  quality floor still misses stable 30 fps for repeated windows.

## Phase 5 - Broader Device and Browser Proof

Do not claim all-mobile readiness from one Android phone:

- Test at least the connected Android phone through Chrome WebGPU.
- Add high/mid/low Android profiles when hardware or remote devices are
  available.
- Keep BrowserStack/iOS Safari water and WebGPU canaries separate from
  Android Chrome proof.
- Keep Android WebView/Capacitor/TWA proof separate from browser proof
  unless explicitly approved.
- Record Windows desktop high/low profile controls so desktop quality
  remains protected while mobile policy changes.

## Phase 6 - Release and Ops Carryovers

- Run an Open Country paired two-client sheep-driving playtest before any
  release claim.
- Run post-deploy iOS water canary if this cycle is shipped to production.
- Review renderer telemetry after deploy if WebGPU remains the default
  request.
- Do not add paid-store, signing, native-shell, Steamworks, App Store, or
  Google Play work without explicit approval.

## Frozen Files and Boundaries

Do not touch `shared/**`, sim-baseline goldens, or worker migrations in
this cycle unless the active plan is explicitly amended and accepted.
Placement count changes that affect deterministic shared behavior are out
of scope by default.

Exception accepted on 2026-05-16: this cycle may modify
`shared/TreePlacement.js` and regenerate the refactor-baseline scatter
fixture for the tree-clumping/undersized-tree fix above.

## Hard Stops

- Connected phone unavailable or CDP/ADB cannot produce artifacts.
- Any required scene/camera matrix repeatedly misses the target budget
  after governor degradation.
- Screenshot gates show regressions in dog readability, tree coherence,
  shoreline water, glint, grass interaction, sheep leg/wool correctness,
  sun/atmosphere read, or terrain seams.
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
- Android perf matrix via `npm run perf:android-webgpu`.
- Desktop Chrome WebGPU and WebGL control perf matrix.
- Visual screenshot gates for accepted scenes and camera poses.

## Success Criteria

- High-mobile target scenes/poses hold `p95 <= 18.5 ms` and `p99 <= 25 ms`.
- Mid-mobile profile holds `p95 <= 34 ms`, `p99 <= 45 ms`, and no repeated
  spikes above `50 ms`.
- WebGPU draw calls stay under `250`.
- High-mobile visible geometry stays near or below `1M` estimated
  triangles.
- Dog-through-tree readability, coherent tree wind, shoreline water,
  synced glint, grass interaction, sheep leg/wool correctness,
  sun/atmosphere read, and terrain seam screenshots pass or have explicit
  blockers recorded.
- Tree/rock production assets have committed LOD and impostor sidecars
  with encoded budget tests.
