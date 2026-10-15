# Sheepdog Sim 3 release status

This file is the current state: what is live, what the last candidate changed,
and what is still open. The chronology is in `CHANGELOG.md`. Closed candidate
reports and release evidence are in `docs/history/status-log.md`, and closed
investigations are in `docs/history/`.

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


## Asset polish pass - 2026-10-14, in progress

Owner-directed pass to take the shipped assets to hero quality: sheep, dog,
grass, farmhouse, barn, fence and gate, treeline and scatter, their animation
and inverse kinematics, their customization, and their cost. The plan and its
boundaries are `spec/13-asset-lab.md`.

Decisions taken at the start of the pass, so they are not relitigated:

- The lab is a separate Vite entry under `lab/`, outside the production build.
  No editor code reaches `dist/`.
- Movement work is presentation only. The dog's controller and the sheep
  simulation stay unchanged, so the trace fixtures hold and existing `field-v3`
  times stay comparable. Animation and IK are in scope; `sim/tuning.ts` is not.
- The hub is the timing lane and this PC is the functional lane. The rule
  already existed inside a closed investigation log and is now in `AGENTS.md`.
- Documentation was consolidated first: closed logs moved to `docs/history/`,
  durable rules lifted into `AGENTS.md` and `spec/`, and `CLAUDE.md` added as a
  pointer rather than a second copy of the guide.
- The lab typechecks under its own `tsconfig.lab.json` and has left the root
  `include`. `npm run build` is `tsc -b && vite build`, so while `lab` sat in
  that list a type error in a development tool could fail a production build.
  `npm run typecheck:lab` is a maintainer command and not a release gate; it
  needs the sibling grass checkout to pass. The gates in `AGENTS.md` are
  unchanged.

Nothing in this pass has reached a review gate yet. Documentation consolidation
verified on 2026-10-14: `npm run lint` and `npm run typecheck` clean, `npm test`
899 passed in 111 files. No production build or probe was run, because this
change touches no shipped code.

### Grass: the shipped field against `threejs-field-grass`, 2026-10-14

Both are mounted in the lab as the `Grass (shipped)` and `Grass (library)`
subjects, over the same `assets/grass/tufts.bin`, at one camera the panel holds
across the flip. The library is a sibling checkout aliased in
`vite.lab.config.ts`, absent from `package.json`, and cannot reach `dist/`.

Already the same, verified rather than assumed:

- Palette. The library's `DEFAULT_GRASS_PALETTE` is the game's five values
  exactly: `#87995f`, `#a7b76c`, `#8b9468`, `#c0a074`, `#ffc582`.
- Blade mesh. `tuftGeometry` differs only in an import path, and the two
  `mulberry32` agree over 20,000 draws on each of six seeds.
- Decode. One divisor differs: the library scales yaw by 65535 and the game by
  65536. The game's is correct for a wrapping angle; the error is 1e-4 rad.
- Cost. 21 draw calls and 3,165,230 triangles on both, high tier, same camera.
  The library holds 12 geometries and 16 textures against 13 and 18, which is
  the bark ring and the slot grid it does not have.

Why it is not a drop-in:

- Interaction is the opposite architecture. The game packs interactor records
  and a cell-to-slot index and evaluates four oriented footprint SDFs per vertex
  on the GPU. The library rasterises a deformation field on the CPU and samples
  one linearly-filtered texel. Over this field at a 1 m cell that is 213 x 213:
  45,369 cells cleared and finalised in full every frame whatever moved, and
  181 KB re-uploaded per frame. Its own default covers 100 m at 0.5 m, so that
  cost is sized for a demo field rather than this one.
- There is no bark wave and no reduced-motion path.
- The game damps the wind octaves and the flutter where a tuft is pressed. The
  library runs full wind through flattened grass.
- The wake is quantised to 8 bits and to the cell, so its edge is softer than a
  per-vertex footprint. Both wakes are visible at the paws at 11 m; only the
  shipped one has a crisp boundary.

What the library is ahead on, and worth lifting:

- `valueNoiseField`, lattice value noise with a quintic fade, against the
  game's `sineHashField`. No axis-aligned banding in the patch and the mottle.
- `GrassMaterialStyle` and `GrassPalette`. Every grading constant the game
  hardcodes is a named field, with a second preset already written against it.
  That is the tuning struct this pass was going to have to author anyway.
- `lateralSpread` and `bladeDirectionSpread`: a pressed tuft fans instead of
  every blade leaning one way.
- `generateScatter` and `encodeScatter`: a bake API the game's own recipe can
  sit on, leaving `tools/bake-grass.mjs` and the digest rule intact.

The whole visible difference is grading, not colour: identical palette,
different `ROOT_SHADE`, `ROOT_AO`, `TIP_GOLD`, tint range, `CLUMP_HUE` and noise
function. Screenshots are lab captures on this workstation and are not
acceptance evidence; no timing was taken, because timings come from the hub.

### The painted field and the grading struct, 2026-10-14

The first shipped-code change of the pass. The library's two liftable pieces
came across without it becoming a dependency.

A defect surfaced on the way. The painted breakup lived twice: `paintedField`
in `scene/Terrain.tsx` and `sineHashField` in `scene/grass/grassMaterial.ts`,
at the same frequencies, angles and phases, each with a comment saying the two
matched so a clump on a browner patch would be browner. The copies had drifted
to different inner constants - 1.31 against 1.37, 0.47 against 0.43, 0.63
against 0.61, 0.70 against 0.72 - so the ground and the grass were near
neighbours rather than one field, and a test in each file asserted its own copy.
That is the hazard `grassMaterial.ts` names three lines above its own copy of
the recovery spring.

What shipped:

- `app/src/tsl/paintedField.ts` is now the single `paintedBlend`, read by the
  ground and by the grass. It is lattice value noise with a quintic fade,
  lifted from the library, in place of the two drifted sine pairs. The authored
  scales are carried unchanged: ~14 m patches broken by ~4 m mottling.
- `GrassMaterialStyle` and `GrassPalette` name the grading - wind speed,
  octave weights, reach, flutter, tip gold, tint range, clump hue, and the five
  greens. Defaults are the values this material has always had, and the palette
  stays a lens onto `tsl/palette.ts` rather than a second set of colours, which
  a test enforces by rejecting any hex in the file.
- Wind keeps a sine form, now named `flowField` for what it owns. It has to
  evolve, and a lattice would need re-hashing per frame to move.

Evidence, all on this workstation, which is the functional lane:

- `npm run lint` clean. `npm run typecheck` and `npm run typecheck:lab` clean.
- Production build exit 0, 2,277.04 kB raw and 634.68 kB gzip, against 2,276.64
  and 634.52 before: 0.40 kB and 0.16 kB.
- Lab, high tier, one camera, WebGPU: 21 draw calls, 3,165,230 triangles, 13
  geometries, 18 textures - identical to the same shot before the change.
- Lab, forced WebGL2 via `?debug=webgl`: backend `webgl2`, 22 draw calls,
  3,168,206 triangles, ground and grass both correct.
- Three source-shape guards changed deliberately rather than deleted. The pair
  that asserted each file's own copy of the field now assert that neither file
  has one, and `tests/painted-field.spec.ts` owns the scales, the quintic fade
  and the single-copy rule.

Not done: no hub timing was taken.

One observation that is NOT a finding, written down so it is not rediscovered
as one. The sky came out blue in some lab captures and warm in others. It is
neither the backend nor this change: both appearances occurred on WebGPU and
both on pre-change and post-change builds. The lab takes about twenty seconds
to reach its first draw on this workstation, and a capture nine seconds after
a subject change can land either side of the post chain becoming active. That
is a capture-timing artefact of how these shots were taken, not a defect in the
sky. Lab captures of a graded surface should wait for a non-zero draw count
rather than a fixed delay.

### Grass regrade, 2026-10-14

Three gradings held against each other in the lab at one camera, judged
against `spec/05-art-direction.md`. Three iterations, closed at acceptance,
inside the five the guide allows.

1. **Previous.** Light and flat. At the Classic camera the flock reads as a
   pale cluster against pale green, which fails the hard rule that the flock
   parts into individual sheep and the dog is findable in under a second. The
   root was pale enough to read as washed out rather than as shadow.
2. **Library grade**, the extracted library's numbers on the shipped material.
   Past the bar in two places. Its root occlusion at 0.62 draws a dark pocket
   at every clump base, and `spec/05` puts grass explicitly outside the outline
   pass; its tint range of 0.86 to 1.16 reads as speckle rather than as the
   subtle breakup the spec asks for. At 11 m its spine darkening at 0.90 gives
   every blade its own shading, so the field reads as countable blades against
   a reference bar that says brushstroke masses.
3. **Candidate**, shipped. The library direction as far as the spec supports
   and no further.

What moved: root shade 0.72/0.80/0.90 to 0.62/0.72/0.86, blue still down least
so the shadow stays cool; tip gold 0.16 to 0.24; clump hue 0.28 to 0.38; tint
0.95-1.05 to 0.91-1.11. What was held: root occlusion moved only 0.82 to 0.76,
and spine edge did not move at all. Wind is untouched. The painted breakup is
untouched and was never a candidate, because the grass and the ground read one
field now and regrading its frequencies would pull the clumps off their
patches.

The lab mechanism is `GrassField` taking an optional `style`, with `lab/`
holding the presets. The game mounts it with no props and gets the shipped
grading, so nothing in `app/src` carries a field only the lab reads.

Evidence, this workstation, the functional lane:

- Lint, `typecheck` and `typecheck:lab` clean. 904 tests in 112 files.
- Build exit 0, 2,277.11 kB raw and 634.68 kB gzip, against 2,277.04 and
  634.68 before the regrade: 0.07 kB raw and nothing gzipped. Both changes
  together are 0.47 kB raw and 0.16 kB gzip over the pre-pass build.
- Whole field, high tier, WebGPU: 36 draw calls and 3,423,564 triangles,
  identical to the same shot before the regrade. A grading is literals in an
  unchanged graph, and the counters say so.
- Forced WebGL2 via `?debug=webgl`: backend `webgl2`, 37 draw calls, 3,462,348
  triangles, grading correct.

Not done: no hub timing, and no phone-aspect capture. `spec/05` asks the critic
loop for both gameplay distances and a beauty angle at desktop and phone
aspect; this pass used two desktop distances. The grading is therefore
reviewed, not accepted.

## Direction changes

Owner-ordered changes that override an earlier specification line. Four files
cite this section by name: `sim/BarkImpulse.ts`, `sim/tuning.ts`,
`tests/bark.spec.ts` and `tests/helpers/traces.ts`. The section did not survive
the clean-room import into this repository and was restored on 2026-10-14 from
the record those files carry.

- **Bark redesign, 2026-08-21.** sds's bark reached 24 m through a 100 degree
  cone and expired in 36 ticks, which made it a nudge rather than a verb: a
  player could bark into a spread flock and watch four sheep drift a metre. The
  geometry, magnitude, duration and cooldown were all retuned and a startle
  ripple was added. The shipped values and the reason each one moved are in the
  table in `sim/tuning.ts`; `spec/02-sim.md` carries them as the contract. The
  bark-scatter trace fixture was regenerated as part of that decision, which is
  the one sanctioned reason to regenerate a fixture. The implementation is
  current and is not under review in the asset polish pass.

## Last candidate - typography, label jitter and the screen-anchored cue, 2026-09-22

Owner playtesting on a phone reported text jitter on the gate label and the
sheep nameplates, and a Follow camera that shook while turning. Both were
measured before anything was changed, and neither cause was the one the
symptom suggested.

**Type.** The candidate fix was `@pmndrs/glyph`, a runtime text renderer. It
was in `package.json` and no shipped code read it, so the first question was
whether to adopt or drop it. Dropping it, because it would have made the
reported defect worse: `app/src/scene/autoTier.ts` caps the canvas device
pixel ratio between 0.8 and 1.5, while DOM composites at the device's own
ratio of 3 on the phone that complained, so moving these labels into the canvas
would render them at roughly a third of their current resolution. The interface
now runs on one self-hosted variable family, Piazzolla, subsetted from an
in-repository `fonttools` recipe to a 26 KB woff2 with provenance, licence and
digest recorded in `assets/fonts/README.md`. Reasoning in `spec/11-typography.md`.

**The jitter itself** was sampling and rounding, not rasterisation. The gate cue
projected at 20 Hz against a camera that moves every frame, rounded its
transform to whole pixels - three device pixels at a ratio of 3 - and carried a
150 ms CSS transition on a transform rewritten every frame, which trails the
camera and rubber-bands rather than ever landing. All three are fixed and the
rules are written down where the next label will find them.

**The gate cue** was rebuilt twice, and the second time from a screenshot. The
first pass replaced a "Gate / 161 m" pill placed from the gate's projected point
- which over a full turn on a phone sat on one of two x values at 29 of the 31
bearings it appeared at, and jumped 245 px for one degree of turn with the gate
behind - with a 44 px compass riding an ellipse inscribed in the safe area.
Owner review of that then caught the reading itself: the cue was placed from the
GROUND bearing, which is not the angle the opening subtends on screen. Follow
looks down 22.5 degrees and Classic 44.9, which foreshortens the forward axis in
the image and leaves the sideways one alone, so ten degrees of turn walks the
opening 26.7 degrees round the frame while the needle moved seven. Over 84,377
poses of the two rigs across the whole field the needle pointed up to 39.7
degrees away from the opening, and a full 180 degrees away inside five metres of
the gate, where the camera axis has already passed over it. Reading the same
direction in the camera's own basis is exact: 0.0000 degrees over those poses,
0.005 end to end in the running build, and no fov, aspect or pitch in the
function, which is why the two camera modes need no case between them.

Measuring that turned up a second reading of the same complaint, and it is worth
separating because the needle can be exact while the instrument still reads
wrong: a cue riding a perimeter at the target's angle overshoots a target inside
that perimeter, so with the opening in shot, sighting along the needle from the
dial missed. That was 32,734 of 391,539 bright on-screen poses across six
viewports, worst on wide ones whose ellipse is inset only 30 px. The ellipse is
now a ceiling on the reach rather than the reach, which takes it to 0 while
moving the worst visible step from 28.5 to 30.0 px per degree of turn against a
146.9 budget. What survives is bounded by construction - the clamp matches the
radius from the ring's centre, which sits up to 48 px off the frame's where the
insets are asymmetric - so the tests hold the rule rather than a number: either
the needle points at the opening or the dial is sitting on it.

**The camera** was a separate defect with the same reporter. `YAW_ENGAGE_SPEED`
was the only hard boolean in `followFraming.ts`, and one metre per second is
6.7% of commanded effort - 3.2 px on a 48 px stick, which is exactly the
settled trailing distance of the one-euro filter that exists because a thumb
cannot hold still. Measured on a steady turn with effort breathing +/-15% at 33
fps: 23.7% of frames reversed the camera's rotation direction, mean yaw
acceleration 23.9 deg/s^2 against 3.1 either side of the band, worst frame 965
against 180. A band alone relocates the chatter to its own lower edge - 0.0% at
0.90 m/s and 26.4% at 0.60 - so the acted-on share is also lagged. Both
constants are asserted by name in `tests/camera-follow-jitter.spec.ts`.

**Also in this candidate**, from the same round of owner feedback: the touch
stick gains a visible resting home that teaches once and retires on evidence of
real travel; the touch controls become sheer enough to see the field through
while keeping a full border so their extent stays legible; and "My times"
groups a player's runs by flock size with a rank against the public board for
each, described in `spec/12-my-times.md`.

### Evidence

- `npm test` 893 passed, 111 files. `npm run lint`, `npm run typecheck`,
  `npm run typecheck:worker`, `npm run check:discovery` clean.
- `npm run build` succeeds. First load 32 files, 6,497,688 raw bytes,
  4,250,613 estimated transfer against an 8,388,608 budget. Client bundle
  2,276.64 kB raw, 634.51 kB gzip.
- `npm run probe:release` passes: 23 character sources verified, 14 audio
  assets verified, 4 recipe manifests, 0 external models, client secret scan
  clean, page params still exactly `debug` and `seed`.
- Gate cue verified in the running dev build in both orientations. Landscape
  750x417 the token travels 316,80 to 198,116 and portrait 390x844 it travels
  171,146 to 99,187, both continuous, with opacity ramping 0.41 to 1 as the
  opening leaves the frame.

### Open

- The terrain-occlusion walk never fires on Home Field. Swept against the real
  baked heightfield over both rigs, both orientations and the whole 200 m
  field, `obscured` came back true in 0 of 800,790 poses: relief runs -2.16 to
  +2.02 m, the opening sits at -0.54 m, and a rig 14 to 17.5 m up looks over
  all of it. An earlier note here said the opposite - that it reported a block
  through the early approach - and that was wrong. The code is harmless and is
  left alone, but it is dead weight on this field and the cue's presence is
  entirely the fade's doing. Worth deleting or earning its keep on a field with
  real relief; not decided here.
- The client has one 2.3 MB chunk and Vite warns about it. Unchanged by this
  candidate and untouched by it.

## Open questions

- None for the production cutover. Physical-device and final launch-media
  receipts remain follow-up evidence.
- Follow camera turning ships at Gentle by default. Off rotates 119 degrees over
  a two-minute run against 5,204 on the rig it replaces and frames the dog
  better; its only cost is that the player cannot see around a corner they are
  turning toward. Gentle is a judgement, not a measurement, and is the owner's
  call.
- Is the 25 m/s sprint still wanted now the commanded speed has weight? Lowering
  it, or scaling dog and sheep speeds together, moves the trace fixtures and
  makes existing `field-v3` times incomparable, which is why nothing in the
  camera work depends on it.
- Should the player have any manual camera authority? At the Off end stop the
  whole of it is the documented camera key twice, which re-arms the bearing. A
  real nudge would need a control surface neither screen has to spare.
- The bark ring is reported as very quick or invisible on a phone while it reads
  correctly on desktop. Two suspects, both presentation: `reduceMotion` follows
  the operating system unless the player overrides it, and under it
  `barkRingFrame` pins the ring to the 10 m near radius at 0.096 opacity for
  0.24 s instead of 40 m at 0.48 for 0.78 s; separately the ring is 1 m wide
  expanding to 40 m in 0.64 s while `autoTier` caps phone device pixel ratio at
  0.8 to 1.5, so it can render as a sub-pixel line. Checking the game's own
  Reduce Motion toggle on the reporting phone distinguishes them. Not yet
  measured on a device.
- Whether to build the grass on `threejs-field-grass`. The owner's condition is
  that it be at least as performant as what ships. It is not, yet, and the
  reason is narrow: only the interaction field differs, and it trades GPU work
  for a constant CPU and upload cost sized for a 100 m demo field. Everything
  else is equal or better. The gate and the one-way direction of adoption are
  in `spec/13-asset-lab.md`; the deciding measurement is a hub run, not a
  desktop reading.
- Whether to adopt `math` from pmndrs for leg IK. It is MIT and version 0.1.0,
  its `math/ik` entry point has `fabrik2` and `fabrik3`, and its allocation-free
  style matches the `spec/08` hot-path rule. The gate is in
  `spec/13-asset-lab.md`: exact pin, first consumer in the same commit, measured
  bundle delta, and a lab comparison against the current hand-rolled solver.
