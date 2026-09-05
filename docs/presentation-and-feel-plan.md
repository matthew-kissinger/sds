# Presentation and game-feel work plan

Updated 2026-09-05. Owner-requested scope and execution handoff. The original
eight-lane goal now includes owner-requested lane 9: calm audio balance and lane
10: search discovery and indexability.

## Objective

Deliver a cohesive, polished, playable local review build of Sheepdog Sim with
stronger trees, atmosphere and lighting; clear gate guidance; a better-authored
dog with improved rigging, animation and responsive controls; smoother cameras;
an ambient animated farmer, and a calmer, less fatiguing soundscape. Preserve the calm painterly, cel-shaded style
and prioritize broad mobile and PC usability. AAA-grade is the quality ambition,
not a claim established by passing tests or by this plan.

Read `AGENTS.md`, `spec/00-vision.md` through `spec/10-roadmap.md`, and `STATUS.md`
before implementation. This plan records the owner's expanded presentation scope;
it does not silently replace the remaining specification or its acceptance gates.

## Owner review corrections (2026-09-05)

- Latest direction: integrate the current trees and stop repeated design
  iterations. Finish the combined candidate for owner playtest, then seek the
  approved release SHA before deployment. Current handoff:
  `docs/presentation-playtest.md`; older iteration verdicts remain historical.

- Follow-up scope after front attachment review: exhausted sprint requires a real
  release and fresh hold; trim excessive tail volume and soften the rear hock
  outline while preserving natural anatomy and contact; audit and improve SEO.
- Current priority: stop broader tree/scene work and fix the dog's front-leg
  attachment. Verify the shoulder connection standing and through held W+A/W+D
  motion before resuming other lanes. Do not treat paint-mask cleanup as proof
  that the anatomical attachment is fixed.
- Grass must read as an evenly dense field. The scattered meadow/short-clearing
  treatment was rejected. Restore continuous coverage with restrained individual
  height variation and retain required paths/structure keep-outs; measure the
  denser candidate rather than claiming the earlier performance receipts apply.
- Replace the fence-like gate icon and floating on-screen badge. Use a restrained
  direction cue off-screen and emphasize the actual entrance when visible.
- Slim the dog's torso directly below the neck and make it less round, preserving
  the rig, legs and accepted structural improvements.
- Move the dog's front-leg support farther forward so it does not look front
  heavy; investigate the awkward motion while holding W+A or W+D. Restore an
  open, friendly sheepdog expression: the narrowed/slanted eyes were rejected
  as evil or fox-like. Capture those exact sustained diagonal inputs for review.

These are explicit owner-directed revisions. They do not imply acceptance of
the previous scene/dog critic loops or authorize unrelated art changes.

## Initial planning checkpoint (historical)

- Main was checked against freshly fetched `origin/main` at `50757dae` before
  the existing art work. Recheck repository state before resuming; preserve the
  current uncommitted changes and unrelated untracked work.
- Tree and atmosphere iteration 3 is implemented locally. Seven unequal crown
  masses and connected wood total 924 triangles per tree, 128,436 across 139
  trees, with three treeline draws. The owned deterministic recipe, provenance,
  license and digests are recorded in `assets/treeline/`.
- Sky/clouds, shared palette, fog, sun glow and high-tier postprocessing have
  a coordinated first pass. The separate critic's verdict is ITERATE, suitable
  for owner review, not final visual acceptance. Three iterations are documented.
- `npm run review:art` provides production captures, source hashes, comparison
  reports and explicit failed gates. See `docs/art-review.md`.
- Last validated art checkpoint: lint, client typecheck, 83 files / 656 tests,
  production build and release probe passed. These receipts precede the new lanes.
- At this initial checkpoint, gate guidance, farmer, dog, camera and controller
  implementation had not begun. All now have candidate implementations; see
  `STATUS.md` for current evidence and remaining acceptance gates.
- Local preview was served on port 5330. Check availability and build freshness
  before presenting it again; it is not a durable hosted release.

## Lanes and deliverables

### 1. Trees and vegetation

- Refine spreading-oak silhouettes, lateral branches, asymmetry and crown gaps.
- Remove padded oval shading and isolated dark dents; establish connected light
  and shadow masses, readable from Classic and Follow.
- Improve variation and wind without detached foliage, shimmering leaf detail,
  extra transparency or avoidable draw calls. Keep placement changes deliberate.
- Owners: `tools/bake-sculpted-trees.mjs`, `assets/treeline/`,
  `app/src/scene/treeline/`, `app/src/scene/Treeline.tsx`.
- Review: near and distant trees, whole treeline rhythm, grounding and wind in
  motion; identical visual intent on both renderer backends and low quality.

### 2. Atmosphere and lighting

- Refine sky colors, cloud silhouettes and undersides, sun disc and local glow,
  depth haze, warm highlights and cool shadows as one composition.
- Remove graphic cloud bases and excessive washout; control bloom and vignette.
- Keep low-quality composition attractive without depending on postprocessing.
- Owners: `app/src/tsl/sky.ts`, `app/src/scene/Atmosphere.tsx`,
  `app/src/scene/PostProcessing.tsx`; master palette through integration owner.
- Review: sun direction coherence, horizon continuity, cloud motion and readable
  animals/landmarks under both cameras. Avoid new expensive full-screen effects
  unless measured benefit justifies their cost.

### 3. Gate guidance

- Make the actual entrance distinguishable from ordinary fence through silhouette,
  material/color treatment and restrained shader emphasis where useful.
- Add a legible on-screen gate cue and an off-screen directional cue. Correctly
  handle targets behind the camera, viewport edges and camera-mode transitions.
- Keep the opening unobstructed; account for terrain occlusion, distance, pause,
  completion, reduced motion and touch-control/safe-area overlap.
- Derive the destination from the existing field definition. No second gate
  authority, window globals or UI event bridge; use store subscriptions without
  per-frame React rendering.
- Owners: fence/gate modules and new focused guidance UI/projection modules.
- Review: a first-time player can locate the entrance from representative field
  positions in Classic and Follow, on desktop and portrait/landscape phone views.
  The cue must communicate through shape and contrast as well as color.

### 4. Dog asset, rig and animation

- Improve border-collie anatomy, silhouette, coat shading and outline consistency
  while preserving existing coat customization and identity.
- Close the explicit spec gap: the current lofted mesh uses masked deformation,
  not an actual skinned rig. Author a joint hierarchy, weights and animation set
  with an editable source or deterministic recipe and verified provenance.
- Refine idle, trot, run, sprint, sit, get-up, bark and turn response. Coordinate
  planted stance, lifted recovery and terrain contact; eliminate foot sliding.
- Audit findings to resolve: run/sprint currently share maximum gait effort;
  get-up inherits slow sit smoothing; legs advance during pause; motion state
  does not reset with simulation replacement; outline assumes a 45-degree lens.
- Use accepted bark events, not raw button presses, for the bark pose. Reduced
  motion must retain essential locomotion while reducing secondary movement.
- Owners: `app/src/scene/Dog.tsx`, `app/src/scene/dog/`, dog asset records/tests.
- Review: close-up and gameplay-distance motion sequences including starts,
  stops, reversals, sprint, slopes, bark, idle, pause/resume and new runs.

### 5. Controller and camera feel

- Tune acceleration, braking, turning, responsiveness and visual body response
  together; preserve predictable keyboard, touch and gamepad control.
- Refine Follow tracking, aim/look-ahead, damping, terrain clearance and framing;
  improve camera transitions and verify Classic remains stable and readable.
- Use actual camera lens settings for dependent presentation such as outlines.
- Separate presentation fixes from gameplay changes. Analog magnitude currently
  reaches the sim but is normalized away: proportional walking would change
  gameplay and deterministic traces. Document and validate such changes explicitly;
  never regenerate fixtures merely to silence failures.
- Owners: `app/src/camera/`, `app/src/input/`; coordinate with dog lane. Any
  justified `sim/` changes require their own coherent review and deterministic tests.
- Review: direct play across start/stop/turn/reversal/sprint, both camera modes,
  camera switching, terrain edges and each supported input path.

### 6. Ambient farmer

- Author a farmer matching the world's shape, palette and detail level, with
  walking, idle and a small set of recognizable chore animations.
- Build a bounded route and pause schedule around the actual house and barn,
  with terrain contact and clearance from walls, fences and the gate approach.
- Keep the character ambient and inexpensive. No sheep attraction, score effects,
  interaction system or new game mode is implied.
- Preserve editable source/recipe, rig/animation ownership, license and digests.
- Owners: new focused farmer asset, animation and route modules; scene mount
  through integration owner, building coordinates from the existing layout.
- Review: routes and transitions in motion, no sliding or clipping, readable
  activity without competing with the player's dog or gate.

### 7. Whole-scene asset cohesion

- Audit grass, sheep, fences, gate, house, barn, rocks, flowers and other dressing
  together. Make targeted improvements where needed rather than replacing every
  asset indiscriminately.
- Resolve the current smooth-tree versus dense sharp-grass mismatch. Balance
  detail density, edge softness, scale, color, shadow shapes and visual hierarchy.
- Preserve dog/flock readability and keep the destination easy to find.
- Owners: affected asset modules, one bounded asset change at a time.
- Review: representative active-play compositions, not isolated asset renders alone.

### 8. Iteration tools, performance and integration

- Maintain deterministic recipes, digests, comparison captures and meaningful
  tests; no editor diagnostics or review controls in the production client.
- Run genuine WebGPU and forced WebGL2 production builds, desktop and mobile
  quality tiers, portrait/landscape, startup and at least 60-second frame pacing.
- Record environment, exact source/build, workload, quality, resolution, draws,
  bundle/transfer size, percentiles, long frames and failures alongside screenshots.
- The owner reports other agents running games on this PC. Existing local timing
  receipts are potentially contaminated, including claims of isolation; they
  cannot establish performance acceptance or a regression.
- The hub/laptop is reachable using the configured SSH alias `hub`. A preliminary
  check found light CPU load, but did not establish GPU isolation. Recheck CPU,
  GPU and competing browser/probe activity immediately before and during a run.
  Use isolated work/output directories; do not stop other agents' jobs or alter
  their checkouts. Defer or flag contaminated measurements rather than blessing them.
- Browser emulation is not physical-mobile validation. Test representative real
  devices when accessible; otherwise record the gap without claiming universal
  phone support. Follow the existing performance budgets rather than lowering them.

### 9. Calm audio balance

- Analyze and improve the reported wind-like whooshing and excessive sheep noise.
  See `docs/audio-balance-audit.md` for current source/scheduler findings and tasks.
- Isolate the actual whoosh source before replacing anything: the current runtime
  has no dedicated wind loop. Do not restore previously rejected wind/insect beds.
- Reduce foreground-call density and crowd-layer masking, add natural quiet gaps,
  soften ambient texture, and retain useful dog/progress cues and agitation feedback.
- Owners: `app/src/audio/`, `assets/audio/`, audio capture/lifecycle tools and tests.
- Review: recorded running mix, layer isolation, 25/75/200 sheep, idle/active/
  completion, 10-minute fatigue listening and separate critical audio review.
  Document headphone/speaker/mobile listening coverage and unresolved acceptance.

### 10. Search discovery and indexability

- Improve useful crawlable HTML, game explanation and controls, ordinary links,
  search/social metadata, canonical URLs, robots and sitemap consistency.
- Keep structured data truthful to the shipped single-player browser game. Do
  not invent ratings, reviews, download numbers or unsupported platform claims.
- Verify built local HTTP routes, content, social image dimensions and redirects
  where supported. Record deployment-specific and Search Console checks separately;
  local changes cannot prove public indexing or rankings.
- No publishing, production infrastructure or Search Console mutations under this
  goal. Prepare reviewable improvements and document remaining external evidence.

## Sequencing and shared ownership

1. Preserve and review the existing art checkpoint; establish clean measurement
   conditions and record any specification discrepancies.
2. Implement gate guidance as the first new player-facing slice.
3. Coordinate dog rig/animation with controller/camera feel. Establish the rig and
   gait interfaces early so temporary deformation work is not discarded later.
4. Continue trees and atmosphere in separate file scopes; integrate palette and
   whole-scene composition deliberately.
5. Add the ambient farmer after core navigation and player feel are stable.
6. Develop audio balance alongside the visual lanes, coordinating dog events and
   keeping listening captures separate from performance measurements.
7. Finish scene cohesion, critical review, regression testing and local handoff.

Lanes are ownership boundaries, not instructions to run competing GPU tests.
One integration owner edits shared palette, field composition, game store,
quality settings and cross-system manifests. Coordinate shared APIs before
parallel edits. Serialize GPU captures/benchmarks. Keep coherent system changes
separate if committing; do not sweep unrelated workspace files into a commit.

## Completion and boundaries

- Deliver implemented, integrated behavior for all ten lanes in a working
  local production preview, with a concise owner review packet and usable URL.
- Run focused tests while iterating, then lint, typecheck, full tests, build and
  release probe. Document changed counts and current evidence in `STATUS.md`.
- Use separate critical review for visuals and interaction, including motion.
  Respect the specification's maximum five documented iterations per review loop;
  existing tree work is at three. A capped loop with unresolved issues remains
  unaccepted, not silently passed. User review and technical checks are distinct.
- Report remaining failed gates and unavailable device evidence plainly. Do not
  label the overall quality/performance ambition achieved when required acceptance
  is still missing; distinguish implemented review build from accepted release.
- Preserve the solo 25/75/200 experience, score partition and service boundary.
  No campaign, story or survival modes, multiplayer, backend changes or production
  infrastructure changes. No deployment or publication under this goal.

## Copy-ready goal statement

Complete the ten lanes in `docs/presentation-and-feel-plan.md`: refine trees,
atmosphere, clouds, sun and lighting; implement clear on-screen and off-screen
gate guidance; improve the dog asset, proper rigging and animations; polish
controller and camera feel together; add an ambient animated farmer around the
house and barn; bring the scene into a cohesive painterly style; and balance the
audio for a calmer field, addressing wind-like whooshing and excessive sheep
calls without losing useful feedback; and improve search discovery and
indexability through useful crawlable content and accurate metadata. Work
autonomously within the documented scope, preserve existing work and gameplay
boundaries, and prioritize mobile and PC performance. Use separate critical
reviews and clean WebGPU/WebGL2 testing; check that the hub is quiet before using
it for benchmarks and do not treat contaminated timings as acceptance. Deliver
an integrated local production preview, passing required code checks, documented
visual/performance evidence and an honest account of unresolved gates in
`STATUS.md`. Do not implement future game modes or deploy/publish anything.
