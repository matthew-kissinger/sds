# Sheepdog Sim 3 release status

## Studio release authorization — 2026-09-05

Owner approved the responsive Studio, requested an updated README and authorized
commit, push and deployment. The release includes the local Studio correction
below and documentation corrected against current input and asset sources.
The exact-commit Pages workflow verifies the published identity and discovery.

## Mobile Studio correction — local review, 2026-09-05

Owner-reported Customize overflow is corrected in local build `index-Bq-a9SiU.js`.
Compact portrait bottom panel/landscape sidebar and shared camera composition
keep the animal in clear space. Toolbar selection, naming grids, registry scroll,
safe-area spacing, visual-viewport keyboard handling and focus behavior revised.
See `docs/studio-mobile-review.md`. Full suite94 files/719 tests passed; focused
checks after adjustments, lint, TypeScript/build and release probe pass.
623,633 gzip JS bytes;5,773,849 estimated transfer bytes. Not deployed.
Six-size renderer receipts: `captures/studio-mobile-accepted-webgpu/` and
`captures/studio-mobile-accepted-webgl2/`, all tabs/presets, names, orientation,
Escape/focus and overflow checks pass with no errors. Final naming-first reorder
and landscape visual-keyboard adjustment have a focused final probe. Physical
keyboard/notch behavior remains device-unverified. Probe browsers close; local
preview remains available for owner review at port5330.

## Release authorization — 2026-09-05

Owner requested "commit push and deploy" after the combined local playtest
handoff. This authorizes publication of this reviewed candidate through the
exact-commit Pages workflow. Known startup, physical-device and aesthetic review
limitations below remain disclosed; authorization does not turn them into passed
tests. Deployment status and live identity are verified by the workflow receipts.

## Current owner playtest candidate — 2026-09-05

Local production preview is running at http://127.0.0.1:5330/, bundle
`index-Ca8RQxz9.js`. See `docs/presentation-playtest.md` for the concise included
changes, evidence, playtest steps and release limitations. The entries below
this section are historical checkpoints, not competing current-build claims.

- Owner direction: implement the current trees and stop repeated tree design
  iterations. Trees, atmosphere/light, dense grass, gate cues, farmer, dog,
  camera/input, calmer audio and SEO are integrated for playtest.
- Latest dog tail/hock and front attachment passed narrow independent regression
  review on both backends. Exhausted sprint requires a real release/new hold.
- Found and fixed exact 180-degree heading lock in normal reversal. A small
  deterministic tangent starts the turn; no snap or trig, no regenerated trace.
  All five pinned traces still pass.
- 93 files / 713 tests, lint, TypeScript/build and release probe pass. Initial
  gzip JS 622,264 bytes; estimated transfer 5,772,481 bytes. Discovery verifies
  four built routes and local HTTP metadata, canonicals and social image.
- Final reversal gate probe `captures/guidance/final-reversal-gate/` passes both
  backends with settled behind-camera cue, visible opening, resume and viewport
  clearance. Prior `owner-opening-highlight-02` behind receipt was overstated:
  a transient offscreen condition did not survive until its screenshot.
- No production deployment. Owner art/feel/audio review, physical device tests
  and desktop cold-start budget remain release gates; do not call these passed.
- Final quiet-hub WebGPU run: 200 sheep at 1440p for 60 seconds, p95 8.4 ms,
  max 25 ms, zero >100 ms frames, 40 sampled draws, no errors. Startup 2,023.5 ms
  still misses 2,000 ms. Receipt: `captures/final-hub-receipts/`.
- Prior combined-renderer runs: WebGL2 desktop p95 8.4 ms/max25 ms, 40 draws,
  cold start3.95 s; phone-emulated low tier p95 8.4 ms/max33.3 ms, 28 draws,
  cold start3.39 s. No physical-mobile acceptance follows from laptop emulation.
- Final title-only CSS fixes clipped information links at844x390. Actual built
  title probes pass1440x900,390x844 and844x390, including Play/link reachability
  and no runtime errors. Evidence: `captures/discovery/`. Gameplay receipts
  precede only this title layout adjustment. Preview is intentionally left running
  for owner playtest; probe browsers/servers and hub browser processes closed.

## Presentation and feel plan — 2026-09-05

- Front-leg attachment candidate is now built as `index-DYxsVRVM.js` on port5330.
  Buried upper roots follow the adjacent torso's chest/neck skin weights, with a
  tapered transition to the upper leg; forward paws and bone chains are retained.
  Geometry is 1,696 triangles. Actual skinned containment verifies 34 attachment
  vertices against torso triangles across 20 poses. Full suite: 90 files / 701
  tests; lint, TypeScript/build and release probe pass (621,846 gzip JS bytes,
  5,770,876 transfer bytes). An indexed-array type error in the first build was
  corrected without changing arithmetic; stale `front-attachment-after-webgpu`
  capture is explicitly marked INVALID and must not be used as after evidence.
- Correct after evidence: `captures/actors/front-attachment-fixed-webgpu/` has
  stable build hashes, no page errors, Studio front/profile/hero and normal held
  W+A/W+D movement. Independent narrow standing-view PASS: exposed upper caps
  gone, roots sit beneath chest, profile connection continuous. Remaining shoulder
  shading is faceted but does not read detached in those views. This does not
  establish broad character acceptance or continuous gait smoothness. Matching
  `front-attachment-fixed-webgl2` capture also passes with stable hashes and no
  page errors. Broader art remains paused per owner priority.
- ACTIVE PRIORITY, owner correction: dog front legs are not properly attached.
  Broader art work is paused while attachment is corrected and reviewed in idle
  and held W+A/W+D movement. The narrower torso plus forward-shifted legs exposed
  an upper-leg/body skinning transition problem; a separate chest paint-mask
  correction does not establish anatomical attachment. Current before-fix build
  is `index-BQVeZX8g.js` (90 files / 700 tests, lint and TypeScript build pass).
- Current owner-review build: `index-CD0FvYH3.js`, served at local port 5330.
  Includes dense meadow, narrower dog chest, foreleg chains moved forward 14 cm,
  open level eyes, turning paw lift-off continuity, zero Studio body bob, farmer
  shoulder/contact refinements, corrected below-zero boundary-tuft paint, audio
  fixes and the redesigned gate. Lint, TypeScript build, 90 files / 699 tests,
  release probe pass: 621,669 gzip JS bytes / 5,770,699 transfer bytes. Genuine
  WebGPU actor capture includes sustained W+A/W+D sequences, stable hashes and no
  page errors (`captures/actors/owner-dog-diagonals-webgpu/`). Runtime/owner
  acceptance and current dense-field hardware performance remain open.
- First redesigned gate probe reached visible opening and behind-camera views,
  then failed an obsolete resume assertion requiring the now-hidden badge to
  appear. Its data showed on-screen/unobscured with hidden badge, consistent with
  the redesign. The probe now checks projection-consistent resume behavior and
  deliberately returns to offscreen framing for unchanged mobile bounds checks.
  Retained failed evidence: `captures/guidance/owner-opening-highlight/`.
- Owner review corrections now take priority: evenly dense grass (scattered
  treatment rejected), a redesigned gate cue with actual entrance highlighting,
  and a slimmer/less round dog torso below the neck. Source grass correction
  removes strong density/height correlation: field 81,752 / surround 16,595 tufts,
  1,180,164 bytes, height scales 0.75–1.25. Twenty-nine grass checks pass. Greater
  density requires fresh runtime/performance evidence. These revisions are now
  in the current preview described above.
- Integrated pre-owner-correction build passes lint, TypeScript build, 88 files /
  691 tests and release probe (621,146 gzip JS bytes; 5,408,664 transfer bytes).
  Dog5 actor captures on genuine WebGPU and forced WebGL2 have stable hashes and
  no page errors. Final independent Studio verdict remains unaccepted at cap 5;
  owner torso correction is a new explicit revision, not retroactive acceptance.
- Farmer contact correction: actual skinned-boot test reproduced 4.89 cm of
  sole lift at a flat-ground stride endpoint. Lowering posed hips from 1.10 to
  1.04 m leaves knee reach for the stride; all five sampled stance phases now
  stay within 5 mm on both feet. Seven farmer tests pass, source digests updated. This does not
  prove all slope contact or replace motion review. The centered normal-approach
  farmer capture is complete but predates this source correction.
- Historical dog model pass 5: narrower sloping bib, eased
  shoulder transition, restrained eye aperture and reduced coat-band contrast.
  Geometry is 1,664 triangles (+24); bones, solvers, soles and draw count remain
  unchanged. Forty-seven focused tests and scoped lint passed. Final independent
  review remained unaccepted; subsequent owner-directed corrections are above.
- Current source adds distance-dependent crowd filtering (1,300 Hz near to 650 Hz
  far, smoothed over 250 ms) through the existing node. Ten audio graph/fatigue
  tests pass, including listener/flock movement and bounded graph size. This is
  now rebuilt but not yet captured; earlier audio recordings precede this change.
- Dog iteration 4 independent still-image review: ITERATE. Raised head and tuck
  improve the profile; broad rigid bib, shoulder join, bead-like eyes and slab-like
  torso shading remain. Final bounded model pass 5 is underway. Animation and
  two-camera gameplay acceptance are separate from Studio anatomy review.
- After-build interaction review closes the reproduced nameplate overlap and
  verifies sampled portrait steer+sprint+camera, release, gamepad disconnect and
  neutral reconnect, and reduced-motion switching. No runtime errors; build
  hashes stable. Evidence: `captures/profiling/interaction-after-review/review.md`.
  Physical-device feel and measured camera jerk remain unverified. Full regression
  suite at the dog4/nameplate checkpoint passed 88 files / 686 tests.
- Current source/build adds dog iteration 4 (raised/retracted skull, 0.30 m
  muzzle, lifted rib/waist underside and softer wrists) and fixes the interaction
  critic's Classic nameplate overlap by anchoring above the dog with a 20 px
  minimum screen gap. Rig remains 22 bones / 1,640 triangles. Dog's 47 focused
  tests, lint and client typecheck pass; build/release probe pass at 620,835 gzip
  JS bytes and 5,408,352 transfer bytes. After-build visual/interaction checks
  completed with the interaction result and dog iteration 4 critique above.
- Independent input review of frozen dog3/meadow5 verified normal keyboard
  release/reverse, pause-held-input handling and camera switching. Gamepad and
  touch half input moved roughly half full input distance; deadzone held still.
  Evidence and precise limitations are in
  `captures/profiling/interaction-frozen-review/review.md`. This is browser
  emulation, not physical-controller or phone latency acceptance.
- Hub startup diagnostic on dog3/meadow5: resources completed by about 285 ms,
  renderer around 647 ms, mounted scene 1,051 ms, shaders 1,876 ms and presented
  2,061 ms. The corrected in-browser ready observer measured 2,062.7 ms, still
  above the desktop 2,000 ms requirement. Earlier readiness numbers included
  locator polling delay (one run was 2,704 ms versus presented 2,180.5 ms).
  `tools/hub-presentation-probe.mjs` now retains wall observation separately and
  uses a browser MutationObserver timestamp for readiness; `--boot-only` records
  a diagnostic without claiming frame-budget coverage. Before-run GPU was 0%,
  no competing game process observed; receipts in `captures/hub-dog03-startup/`.
- Dog iteration 3 is built: muzzle stop-to-nose length 0.260 to 0.360 m,
  narrower cheeks, fuller lower chest, articulated wrists and five-ring paws.
  Geometry is 1,640 triangles; rig remains 22 bones with two body draws and one
  contact shadow. Forty-seven focused dog tests and scoped lint pass, including
  actual skinned-sole contact checks. Production build/release probe pass at
  620,722 gzip JS bytes and 5,408,239 estimated transfer bytes. This supersedes
  earlier size receipts; actual front/profile and motion review is in progress.
- Scene iteration 5, `meadow-massing-05`, closes the five-iteration scene loop
  without acceptance. Independent verdict: ESCALATE for art-direction review.
  Grass now uses correlated 28 m groups, shorter 0.42–1.25 tuft scales and
  stronger density variation. Field tufts fall from 64,946 to 55,495;
  surround 13,350 to 12,726. Asset size falls 939,552 to 818,652 bytes.
  This is an intentional authored scatter change, not a simulation-fixture update.
  Twenty-four focused bake/interaction checks pass unchanged, including byte
  reproduction, height ranges, ground contact, keep-outs and low-tier coverage.
  Production build and release probe pass: gzip JS 620,679 bytes; estimated
  transfer 5,408,196 bytes. Classic WebGPU, Follow WebGPU/WebGL2 and phone low
  captures have stable pages and correct backends; local timing gates still fail.
  Full regression suite passes 88 files / 686 tests at this grass checkpoint.
- Critic accepts the direction of grass massing, not the finished scene. Visible
  sheep are distinguishable, but the full flock is not framed. Remaining scene
  issues: flat olive clearings; mismatched grass/tree/cloud edge detail;
  repetitive horizon arrangement; padded crowns and graphic clouds. Scores:
  silhouette 7, ramp 6, cohesion 7, painterly conviction 5, screenshot test 6;
  visible-animal readability 7. Establish an approved in-scene target for ground,
  foliage and sky together before opening another scene art loop. Do not call
  the five-iteration cap an acceptance. Other character/input/audio evidence work
  can continue independently.
- Historical built candidate `cohesion-04-dog-02`: 88 files / 686 tests, lint,
  client typecheck, production build and corrected release probe pass. Initial
  gzip JS 620,678 bytes; transfer 5,529,095 bytes. Release verification now checks
  23 dog/farmer source digests. The art wrapper retained an initial checker failure
  because the dog ledger legitimately includes its authoring tool; its path
  allow-list is corrected and a separate release probe passed on the same build.
  Source/build capture hashes are stable. Local timing failures remain provisional.
- Independent scene iteration 4 and dog model iteration 2 both remain ITERATE.
  Dog face/contour and chest are visibly improved. Next work: grass height and
  grouped masses judged against a full-flock Classic/Follow composition; clearer
  dog shoulder/wrist/paw forms; less padded tree lighting. Clouds remain graphic.
  Scene scores: silhouette 7, ramp 6, cohesion 7, painterly conviction 5,
  screenshot test 6. Continuous movement and farmer anatomy remain unaccepted.
- Gate iteration 2 runtime checks now pass both genuine WebGPU and WebGL2:
  visible/behind cues, pause/resume, portrait/landscape bounds and explicit HUD/
  button overlap checks in `captures/guidance/gate-02-settled/`. A preceding
  fixed-delay probe failed before camera settling; condition-based waiting
  verifies the intended state without assuming a fast host. Physical touch and
  terrain/object-occlusion coverage remain separate open review items.
- Ten-minute idle audio recording completed at `captures/audio/calm-audio-fatigue-200/`:
  599.984 seconds, stable production hashes, one running context, no page/network
  errors, -42.2 LUFS and -22.9 dBFS true peak. This is a capture, not completed
  fatigue listening. `tools/audio-capture.mjs --layer=leaves-loop` (or crowd/birds/
  pant/chime) now supports tools-only isolation through the normal downstream mix;
  isolated recordings still need to be captured and judged.
- Next visual candidate: dog model iteration 2 refines face, chest, wrists,
  paws and outline at 1,272 triangles (+24), preserving the 22-bone rig.
  Atmosphere iteration 4 replaces uniform cloud bases with offset connected
  lobes and shape-following shade. Grass reduces compounded dark roots and
  per-clump brightness contrast. Forty-three focused tests pass across grass,
  sky and actor rigs; client typecheck passes. New production visual review
  remains pending while the previous build's ten-minute audio capture finishes.
- Hub hardware baseline (before the above visual candidate): 60-second runs,
  200 sheep, 2560x1440 high, NVIDIA GTX 1660 Ti Max-Q, performance power profile.
  Genuine WebGPU and native-GL WebGL2 both measured 8.4 ms p95; readiness was
  3,725 / 5,995 ms and maxima 141.6 / 191.6 ms. Startup and hitch gates fail.
  Phone viewport 390x844 DPR3 at low WebGL2 measured 8.4 ms p95, 58.3 ms max
  and 2,689 ms readiness on the laptop GPU: emulation, not physical-mobile proof.
  Before-run GPU was 0%; five-second process samples show probe Chrome and normal
  desktop services, with no observed competing game. Reports include build hashes,
  driver/adapter identity and samples in `captures/hub-presentation-latest/`.
  Draw receipts (40 desktop / 28 phone) cover the final 250 ms only, not a
  whole-run maximum. The failed WebGL2 Vulkan launch is retained separately;
  native GL succeeds. No clean overall performance acceptance is claimed.
- Goal execution has started. Gate guidance now has an initial store-driven
  on/off-screen cue, behind-camera projection and painted gate-post collars;
  client typecheck and four projection tests pass. Iteration 1 production smoke
  rendered on genuine WebGPU and forced WebGL2. `captures/guidance/gate-01-turn/`
  verifies visible/behind-camera cues, pause/resume and viewport bounds on both
  backends. Critic found phone counter overlap; iteration 2 source now reserves
  full badge bounds and HUD/control margins, avoids redundant subscription writes,
  and adds reduced-motion-aware transitions. Rebuilt visual validation of those
  fixes is pending. Terrain-only occlusion is not complete object occlusion.
- Dog now has a 22-bone skinned rig with terrain-aware paws; farmer has a
  13-joint rig and bounded homestead route. Integrated production captures in
  `captures/actors/integrated-01-webgpu/` and `integrated-01-webgl2/` verify both
  backends with stable build hashes and no page errors. Continuous recordings
  exist, but have not received playback acceptance. Dog model iteration 2 is
  addressing the critic's blunt face, chest plate, peg feet and heavy contour.
  Farmer remains too distant/obscured in captures for anatomy or gait acceptance.
- Integration checkpoint: lint, client typecheck, 88 files / 686 tests,
  production build and release probe passed. Initial gzip JS is 620,533 bytes;
  first transfer is 5,528,951 bytes. These receipts precede dog model iteration 2.
- Camera now follows the same interpolated subject as dog rendering and clamps
  intermediate camera transitions above terrain; focused camera tests pass.
  Combined input/motion review remains open.
- Controller: partial analog intent now scales target walking speed, preserving
  the existing full/digital normalization path. This is an intentional gameplay
  improvement for precise positioning, not just animation polish. Thirty focused
  control/input/sim tests and twelve determinism/trace checks pass; all existing
  fixtures remain unchanged. Running touch/gamepad feel review is pending.
- Owner added lane 9 for calmer audio: wind-like whooshing and excessive sheep
  noise. The [audio audit](docs/audio-balance-audit.md) records current sources,
  scheduling and listening tasks. Dedicated wind is absent from runtime; the
  actual whoosh source remains unisolated. The baseline permitted a baa start
  every 0.467 s over continuous crowd ambience. Candidate source now adds longer,
  varied call spacing, crowd rests, quieter leaves and fixed spectral filtering.
  Layer isolation and listening acceptance remain pending; this extends rather
  than replaces the original eight-lane goal.
- Audio candidate production capture `captures/audio/calm-audio-candidate-200/`
  has stable build hashes, no page/network errors, -37.2 LUFS and -15.5 dBFS
  true peak. The baseline was -31.7 LUFS / -14.7 dBFS. These short captures do
  not establish subjective improvement; source isolation and fatigue listening
  are still required. A quieter result alone does not satisfy the calm pillar.
- The owner requested a documented eight-lane goal before starting the expanded
  work. See [presentation and feel plan](docs/presentation-and-feel-plan.md) for
  scope, file ownership, sequencing, review criteria and the copy-ready goal.
- It includes continued tree/atmosphere work, gate guidance, dog asset/rig/motion,
  controller/camera polish, an ambient farmer, scene cohesion and validation.
  The planning checkpoint originally had dog work at audit-only; implementation
  has since started as recorded above. No future mode implementation is included.
- All earlier local performance isolation claims are provisional: other agents
  may have been running games. The hub is reachable, but clean CPU/GPU conditions
  must be checked again before and during any replacement performance run.

## Art iteration reopened — 2026-09-05

- Owner authorized a local implementation for review after the concept sheets.
  Main was freshly checked against `origin/main` at `50757dae` before this work.
  The candidate now includes an owned sculpted-oak recipe plus coordinated sky,
  cloud, sun, haze and lighting changes. Nothing has been deployed.
- `tools/bake-sculpted-trees.mjs` deterministically generates the committed
  geometry with source/output digests and AGPL provenance. Seven unequal crown
  masses and connected tapered wood use 560 + 364 triangles per tree: 128,436
  triangles across the unchanged 139-tree placement, still three treeline draws.
  There are no alpha leaves, external models or new tree textures. Tree and bark
  colors now use the master palette. Whole-crown normals soften isolated lobe
  lighting; normalized shader coordinates use `positionGeometry`, avoiding the
  first iteration's instance-space crown/trunk separation.
- Atmosphere: six authored cloud masses in the existing opaque sky draw; warm
  highlights and restrained cool undersides; horizon-matched haze; defined sun
  disc with local glow. Fog now spans 210–580 m. High-tier bloom is 0.18 with
  threshold 1.05; vignette depth is 0.12. Low tier retains the sky/cloud shading
  without postprocessing. Sun direction remains the shared eight-degree light.
- Independent critique: iteration 1 required warmer, less evenly rounded crowns
  and less slab-like clouds; iteration 2 fixed the detached foliage but retained
  padded oval shading; iteration 3 improved connected masses and cloud volume.
  Iteration 3 is suitable for owner review, with verdict ITERATE, not AAA visual
  acceptance. Scores: silhouette 7, ramp 6, cohesion 7, painterly conviction 5,
  tree readability 7, screenshot test 6. Remaining issues are padded canopy
  patches, uniform Y-shaped forks, dense sharp grass versus smooth trees, and
  graphic cloud bases. Continuous motion and physical mobile remain unaccepted.
- Current validation: lint and client TypeScript passed; 83 files / 656 tests
  passed. Production build and release probe passed: 613,245 gzip initial JS
  bytes and estimated first transfer 5,521,662 bytes across 37 files. Current
  60-second renderer evidence is under
  `captures/profiling/sculpted-oak-03-final/`. All six views pass actual backend,
  nonblank screenshot, page stability and draw limits. P95 in matrix order is
  7.1 / 7 / 7 / 48.6 / 34.7 / 20.9 ms; peak draws 49 / 50 / 50 / 50 / 33 / 38.
  Every startup and maximum-gap check failed; portrait high and low also fail
  p95. Crucially, the owner then reported other agents running games on this
  machine: these timings are POTENTIALLY CONTAMINATED and cannot establish
  performance acceptance or a regression. Check hub availability and quietness
  before collecting replacement timing evidence. Art review awaits owner feedback,
  with three of the maximum five critique iterations documented.

### Earlier tooling baseline (before runtime art changes)

- The owner reopened trees, atmosphere, clouds, sun and lighting for a stronger
  art direction. Historical foliage acceptance below is not acceptance of this
  new review. This change adds offline production-build review tooling only;
  it does not change runtime art or deploy anything.
- `npm run review:art` rebuilds, checks the release surface and captures the
  normal game at desktop and emulated phone sizes on WebGPU and forced WebGL2.
  `docs/art-review.md` documents baseline/candidate comparisons, source hashes,
  comparable settings, explicit failed gates and separate human art acceptance.
- Validation: lint and client TypeScript passed; 83 test files / 655 tests
  passed. Production build and release probe passed: 627,957 gzip initial JS
  bytes; estimated first transfer 5,536,374 bytes over 37 files.
- Final isolated tools-only smoke receipt:
  `captures/profiling/art-baseline-tools-20260905/index.html` (four views plus
  three motion stills each). Genuine WebGPU Classic/Follow, forced WebGL2 Follow
  and emulated phone landscape low all pass backend, frame p95, maximum gap,
  stable-page, nonblank canvas and draw-count checks. Five-second p95 values:
  7 / 7 / 7 / 27.8 ms; peak API draw counts: 44 / 50 / 50 / 38. These instrumented
  API counts include browser-probe overhead and are not native renderer GPU
  timings. Camera labels describe scripted controls, not measured transforms.
- Boot remains FAILED on every view: 2,601 / 2,570 / 3,786 / 5,731 ms against
  2,000 ms desktop and 5,000 ms mobile limits. The wrapper correctly exits 1.
  Source and build hashes remained stable; release-surface probe passed with
  no runtime diagnostics added. Earlier exploratory receipts are superseded;
  overlapping browser activity makes their timings unsuitable as a baseline.
- Generated baseline HTML loaded all 16 images with no page errors; a local
  same-receipt comparison smoke loaded all 20 side-by-side/motion images.
  Beauty-camera and grounding acceptance remain unavailable in production;
  they are not silently treated as passed by this art tool.
- Open specification questions (pre-existing, no silent runtime correction):
  `spec/08-performance.md` forbids a per-frame quality governor, while
  `app/src/quality/RuntimeQualityGovernor.tsx` exists; `spec/05-art-direction.md`
  requires the master palette to own colors, while treeline `foliage.ts` and
  `farmhouse/palette.ts` contain authored colors; `spec/04-world-and-assets.md`
  requests an in-field hero tree, while the current treeline README describes
  139 trees outside the fence and no shrubs. Keep the current behavior for this
  tooling change; resolve intent before changing those systems.
- Art verdict remains UNREVIEWED. Physical mobile remains NOT_TESTED. Five-second
  iteration receipts do not satisfy the specified 60-second performance gate.

Updated 2026-08-24 with the approved loading, launch-media and audio-restoration
follow-up. The deployed `release.json` remains the authority for production
commit identity.

## Production state

- Version 3 client source, deterministic simulation, procedural assets, tests
  and public documentation have been curated into the SDS release branch.
- Version 2 remains recoverable from the annotated `v2.6.4` tag, the pushed
  `release/2.x` branch at `d5c38469`, and immutable Pages deployment
  `https://7cea2cd2.sds-frontend.pages.dev`.
- Multiplayer and the 5,000-sheep player path are absent from the version 3
  client. Solo-time boards use only the isolated `field-v3` partition.
- Solo times are reachable from the title screen and after a completed run.
  No name entry is required: the service assigns a random running name unless
  the player chooses Edit, and the board read path does not require identity.
- Version 3 is live at `https://sheepdogsim.com`. `release.json` is the
  authority for the exact deployed source commit and artifact digest.
- The production Worker was deployed first without a D1 migration. Health and
  all three `field-v3` leaderboard read paths returned HTTP 200 before Pages
  was cut over.
- Player-facing branding is `Sheepdog Sim`. The `3.0.0` number is retained only
  in package, migration and release records.
- The owner selected the CC0 Fox Trees Pack Round and Spreading hybrid for the
  shipped treeline. The final field contains 139 trees outside the fence, no
  understory shrubs and no exposed root runs.

## Passed evidence before public import

- 51 test files and 327 tests passed in the clean-room candidate.
- Lint, TypeScript, production build and release-surface probe passed.
- The 17 runtime audio files are pinned by size and SHA-256 in a source ledger.
- WebGPU and forced WebGL2 foliage captures matched with four foliage draws,
  276,110 submitted triangles, no textures and no external models.
- Standalone grass WebGL2 motion evidence found no sharp seam, rhythmic
  stationary annulus or snapping wake trail after the distance-sampled wake
  fix. The integrated game still needs the same running-build probe.

## Clean SDS candidate evidence

- Lint passed. Client and Worker TypeScript checks passed.
- 77 test files and 613 tests passed after the Fox hybrid import.
- Root and Worker dependency audits report zero vulnerabilities.
- Gitleaks 8.30.1 scanned 12.50 MB with no findings. Direct runtime and build
  dependencies report MIT, ISC, Apache-2.0 or dual MIT/Apache licensing.
- The production build contains 231 modules. Initial JavaScript is 612,634
  gzip bytes. Estimated first transfer is 5,768,165 bytes across 35 files,
  below the 8 MiB release limit.
- The procedural replacement passed deterministic bake checks but was not
  owner-accepted for sound character. Treat its inclusion in the public
  cutover as a release regression, not an approved audio decision.
- The deterministic simulation produced 23,563 identical bytes through the
  independent esbuild and Vite bundles.
- Actual WebGPU and forced WebGL2 running-game captures passed at 1,600 by
  1,000 with four foliage draws and no runtime errors.
- The selected Fox hybrid passed its final running-game capture with three
  foliage geometry draws, 94,798 submitted triangles before shadows and a
  WebGPU p95 frame time of about 7 ms.
- Desktop, tablet, phone portrait, phone landscape and reduced-motion UI probes
  passed with no clipped content or controls below 44 CSS pixels. This is
  Chromium touch emulation, not a physical-device receipt.
- The title-screen times dialog passed those same layouts with keyboard focus,
  Escape-to-close and focus restoration. The local probe data is mocked so
  repeated layout checks cannot create identities or write public scores.
- The isolated Pages and Worker preview passed a real mobile interaction: a
  random running name was assigned, renamed to `Preview Shepherd`, and the 25,
  75 and 200 boards each returned HTTP 200. No staging scores were submitted.
- The integrated grass motion critic passed native WebGPU and forced WebGL2 at
  automatic Low and player-forced High settings. It could not reproduce the
  rhythmic annulus, wake snapping or diagonal dark lane.
- The 1,200 by 630 site card and 1,280 by 640 GitHub social preview were
  regenerated from the production bundle on actual WebGPU without score writes.
  The GitHub JPEG is 273,355 bytes.
- Canonical pages, JSON-LD, Open Graph, Twitter cards, robots, sitemap, legacy
  redirects and social-image dimensions pass the discovery gate. Production
  verification also requires the existing Cloudflare Web Analytics beacon.
- Pull request 86 passed Client CI, the isolated score-service preview and the
  Pages preview before merge. The owner then requested the production cutover.

## Post-release follow-up evidence

### Approved follow-up release

- The 17 actual ElevenLabs-generated MP3 assets from commit `6380fe64` are
  restored without changing the audio graph, buses or scheduler. This
  is the earlier 1,255,526-byte set the owner preferred, with the rejected
  insects and wind loops still absent.

- The blank post-React paper wash is replaced by an immediate loading card.
  Its percentage is derived from observed terrain, grass, treeline and scatter
  bytes plus renderer initialization, capability measurement, mounted scene,
  shader compilation and the first presented frame. It cannot publish 100%
  before the field has drawn.
- `npm run probe:boot` now measures the public DOM contract and records named
  `herd:boot:*` performance marks without relying on the retired debug readout.
- Two final cold probes reached Play-ready in 2,299 to 2,371 ms on desktop and
  5,009 to 5,175 ms under 4x CPU plus 9 Mbps mobile emulation. The honest
  progress card reached `Field ready` without page, request or response errors,
  but both results miss the 2,000 ms desktop target and the mobile result is 9
  to 175 ms over its 5,000 ms target. This remains a measured post-release
  optimization risk rather than an unreported pass.
- The candidate passes lint, client and Worker TypeScript, dependency audits,
  production build and 78 test files with 627 tests. The build contains 234
  modules and 614,466 gzip bytes of initial JavaScript. Its estimated first
  transfer is 4,009,011 bytes after restoring the smaller MP3 source set.
- The Open Graph image and GitHub social preview now use a reproducible
  200-sheep Follow-camera gameplay capture. The GitHub JPEG is 221,312 bytes.
  The capture forces the real WebGL2 fallback because first-context headless
  WebGPU screenshots can return a clear canvas; gameplay uses the same TSL
  material path on both backends.
- React Three Fiber is now named in the README and package keywords. The
  repository topic remains a separate metadata follow-up.
- The loading card and title state share the same boot-grid cell, keeping the
  loading card vertically and horizontally centered. Desktop 1,440 by 900 and
  mobile 390 by 844 screenshots passed owner review.
- Portrait Follow uses a wider lens, higher seat and shorter look-ahead. The
  packaged 390 by 844, 200-sheep probe kept the dog framed, held the joystick
  and dedicated Sprint button together, drained stamina from 100 to 76 and fit
  `200 / 200` inside the progress circle. Desktop movement, bark, pause and
  resume also completed without console, page, request or response errors.
- Dog markings now remain attached through vertex deformation; farmhouse dirt
  remains only inside the pen; sheep cheek wool and upper-leg widths are
  balanced; and the asymmetric gait plants backward, recovers forward and
  folds the airborne leg rearward without the rejected body stomp. Matt
  approved the local candidate and authorized commit, push and deployment.
- The restored MP3 runtime passed the production-preview audio lifecycle probe:
  one graph, gesture unlock, five non-duplicated loops, pause/resume, restart,
  visibility, mute/volume and positional bark all passed with no media errors.

### Customizer Studio, Screen-Space Heritage Nameplates and Working Dog Naming

- Added Customizer Studio to personalize working collie coat presets, dog naming, and flock breed variety.
- Working collie can be named by the player, defaulting to "Pip" with 20 authentic British working sheepdog names in a roll ledger. Persisted to `localStorage` under `herd.customization.v1`.
- Implemented unified Screen-Space Heritage Nameplates with 100% native vector Retina typography (Alice serif font, walnut border `#282016`, gold rosettes `◆`, and downward chevron pin) anchored via 3D camera projection. Resolves mobile DPR downsampling blur without Three.js texture upload overhead.
- Features dual-envelope tracking hysteresis (0.055 NDC acquisition, 0.110 NDC retention, 250ms dropout grace window), harmonic spring arrival (\(k=260, c=18\)), organic pasture bobbing, and full mobile touch parity (tap-to-pin for 4s, tap-to-dismiss).
- Flock breeds supported: Suffolk, Cheviot, Herdwick, Kerry Hill, Badger Face, Moorit, and Balwen.
- 81 test files and 649 unit tests pass. Lint, client TypeScript, Worker TypeScript, and production build pass with zero errors and zero warnings. Initial JavaScript bundle is 627.54 kB gzip.


- Complete the desktop, mobile, offline-score and service-worker transition
  matrix in `docs/launch/v3-launch-pack.md`.
- Complete a physical iOS or Android playtest. Browser touch emulation already
  covers portrait and landscape layout, joystick, bark, camera and pause.
- Capture the remaining final launch screenshot set from the accepted commit.
- Update the stale GitHub description/topics,
  redirect `www.sheepdogsim.com` and `sds-frontend.pages.dev` to the apex, and
  submit the sitemap in Google Search Console and Bing Webmaster Tools.

## Open questions

- None for the production cutover. Physical-device and final launch-media
  receipts remain follow-up evidence.
