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

Not done at the time: no hub timing, and no phone-aspect capture. That gap was
closed on 2026-10-15, below.

### Grass regrade: acceptance, 2026-10-15

Accepted on colour. The captures `spec/05` asks for exist at both aspects, and
the three grading lines it names hold at every one of them.

Captures are listed in `captures/grass-regrade/README.md` (gitignored). Two
lanes, both on this workstation, which is the functional lane:

- **Lab**, dev server, WebGPU, high tier, flock 200, at 2560x1440, 390x844 and
  844x390. Shipped, Previous and Library grade flipped at a held camera, at the
  Whole field frame and the Grass frame.
- **Production build**, `tools/playtest-profile.mjs` against `dist/` at the
  three viewports `spec/13` names. `art-classic-webgpu` and `art-follow-webgpu`
  report backend `webgpu` at 2560x1440, 48 and 54 draw calls;
  `art-phone-high-webgpu` reports `webgpu` at 390x844 ratio 3, 49 draw calls;
  `art-phone-low-webgl2` and `art-landscape-low-webgl2` report backend `webgl2`
  at 390x844 and 844x390 ratio 3, 32 and 42 draw calls. Canvas non-blank on all
  five. **The forced-WebGL2 and phone-aspect pairing is therefore checked.**

The beauty angle is the lab's Whole field frame at bearing 2.43 rad. That is
not an approximation of `camera/beautyOrbit.ts`, it is the same pose:
`RADIUS 36` and `HEIGHT 9` against the subject's 36 m and 9 m, opening bearing
`atan2(0.45, -0.52) = 2.4279`, and the same `centre + sin(angle) * radius`
placement. Only the aim height differs, 2.2 m against the turntable's 2.25 m.

The angle cannot come from the production build. `CameraRig` reads debug flags
behind `import.meta.env.DEV`, so `?debug=beauty` is stripped from `dist` and
`grep beauty dist/assets/*.js` finds nothing. `playtest-profile.mjs` encodes
this already, as a `beautyCameraAvailable` check that fails whenever the beauty
camera is asked for. The beauty angle is a dev-server and lab frame by
construction, and `spec/13`'s "captures from the running production build"
cannot be met for that one camera.

Measured rather than judged, since "saturated shadows, hue-shifted cool, never
gray or black" is a claim about pixels. Grass-hued pixels only, darkest decile
against brightest, in the production captures:

| scenario | shadow hue shift | shadow saturation | shadow value |
| --- | --- | --- | --- |
| `art-classic-webgpu` | +18.7 deg | -0.025 | 0.564 |
| `art-follow-webgpu` | +30.3 deg | -0.036 | 0.527 |
| `art-phone-high-webgpu` | +17.8 deg | +0.009 | 0.576 |
| `art-phone-low-webgl2` | +10.2 deg | +0.108 | 0.606 |

Every shadow shifts toward cool, no saturation moves more than 0.04 against the
lit decile, and no value is within 0.35 of black. At the beauty frame the
shipped grading reads +7.1 deg and +0.094 on phone against +5.0 and +0.092 on
desktop: the grading does not change with aspect, which was the open question.

Against the other two gradings at the same frames, the shipped one is the
middle it was designed to be. Shadow saturation gain at the beauty frame:
Previous +0.076, Shipped +0.094, Library +0.131. At 11 m the ordering holds and
the reason the middle is right is visible: Library gives every blade its own
spine shading and the field reads as countable blades, Previous has no root
depth at all and reads washed, Shipped holds the mass. That judgement now
exists at phone aspect, where it previously did not.

Open, and not weakened to pass:

- **The flock-parting rule is not re-tested.** `spec/05` requires that at
  Classic camera height the flock parts into individual sheep and the dog is
  findable in under a second. Every capture here has the dog findable, but the
  probe's art workload drives real `W` input for the whole sample, so the dog
  outruns the flock and no production frame has sheep in it. The grading is
  accepted on colour and mass; that one line rests on the 2026-10-14 desktop
  pass. The lens is not the obstacle: `CameraRig` computes
  `baseFov = 45 + (view.fov - 45) * weight` and the Follow weight is zero in
  Classic, so Classic is a 45 degree lens at both aspects and the lab's fixed
  canvas lens is exact there.
- **No hub timing.** Unchanged. Every `checks.boot` in the probe run failed,
  and `art-phone-high-webgpu` also failed `frames` and `freezeFree`. Those are
  timing checks on the functional lane with other work on the machine, so by
  `spec/13` they are not reportable either as performance or as a regression.
  They are recorded here so the `pass: false` in
  `captures/profiling/grass-gate-receipts/report.json` is not read as a visual
  failure. The visual checks in the same run passed.

Two tooling defects found while taking these, neither caused by the regrade and
neither fixed here:

- `playtest-profile.mjs --flock-views` clicks a button named `Title` to restart
  a run. The pause menu offers `Resume`, `Settings` and `End run`; `Title`
  belongs to a different panel. The locator times out after 30 s and takes the
  whole scenario's `checks` down with it. This is the flag that would have
  produced the flock frames the open item above needs.
- `?debug=webgl` in the lab takes far longer than WebGPU to reach a first draw -
  more than two minutes at both 2560x1440 and 390x844, against about twenty
  seconds for WebGPU. It does arrive; a `WebGLTimestampQueryPool` warning
  confirms the backend initialises. A lab session wanting the WebGL2 grading
  should expect the wait or take the receipt from the production build.

### Sheep legs: a solved knee, and the answer on `math`, 2026-10-15

The sheep's mid-leg fold was the airborne swing arc times a hand-tuned half of
stride, gated to the recovery half of the cycle. It bent the joint on a
timetable rather than because anything had moved, so the three terms that
actually move an endpoint - terrain planting at +/-0.08 m, the body bob at
+/-0.016, the fore-aft swing at +/-stride - changed the shoulder-to-sole
distance with no knee response at all. The limb telescoped. A sheep standing
across a hummock stretched one leg by a seventh of its length and nothing in the
pose bent.

`sheepKneeBend` in `flockTuning.ts` is now the closed-form two-bone solve, and
`sheepParts.ts` measures each chain off the same rings the leg is lofted from,
so the solver and the mesh cannot drift apart. The solve lands back on the
modelled joint to a hundredth of a millimetre on both pairs - 0.050 m of carpus
in front, 0.053 of hock behind - which is the check that it reads the rig
correctly, and `tests/animal-presentation.spec.ts` holds it.

Three things had to change with it:

- **The front chain was authored dead straight**, 0.0001 m of slack on a 0.5605
  chain. A two-bone bend goes as the square root of how far the limb has
  shortened, so a straight chain sits on a cusp with infinite slope: the first
  frame of a hoof leaving the ground snapped the knee 76 mm. The carpus moved
  forward to `dz: 0.065`, which gives it the 2.0% slack the hock always had and
  brings that frame to 45 mm, in line with the hind leg beside it.
- **`KNEE_COMPLIANCE`, 0.035 m,** is a residual flexion under the square root.
  The authored hoof sweep over-reaches the chain by 12% at each handover - a
  0.6 m stride on 0.57 m of bone - so the pose crosses full extension twice a
  cycle whatever the rest pose is, and the exact solve answers each crossing
  with 50 mm of knee in one frame at a walk, in plain view, on a planted leg.
  The residual is a constant and cancels in the difference the shader displaces
  by, so it changes the shape of the response and not the rest pose. It costs
  5% of the fold at peak recovery, where the leg is airborne and tucked.
- **The body bob is deliberately not in the span.** It is the thorax riding over
  the scapula rather than the shoulder joint translating, and a chain this close
  to straight answers far too loudly: 4 mm of idle breath would come back as
  9 mm of knee, a new idle motion on the title screen for no gain. What it
  leaves behind is the 16 mm the shoulder ring rises at a dead run, already
  carried and already named as compliance.

What the pass bought, measured over every agitation, both terrain limits and a
full cycle walked in real frames:

- A standing sheep on a hummock folds the uphill knee 0.070 m and straightens
  the downhill one 0.026 toward its chord. Both were zero.
- An idle sheep on flat ground is bit-identical to the modelled mesh.
- Worst per-frame knee travel anywhere is 71.7 mm, at a dead run where the hoof
  is covering 153 mm in the same frame. The worst knee-to-hoof ratio is 2.60,
  and it is 16.1 mm against 6.2 at an agitation of 0.04.
- Each pair folds the way its own joint is modelled, carpus forward and hock
  back, with the direction read from the rings. Neither leg folds through its
  own rest pose anywhere in the envelope, and it cannot: `sqrt(a^2 + c^2) - c`
  is less than `a` for any compliance `c`.
- The fold rides a linear tent peaking at the bend ring instead of a sine.
  Bones are rigid, and the sine gave the `t = 0.2` ring 0.59 of full bend where
  the chain gives 0.36, bowing the radius outward. It is also one transcendental
  cheaper than what it replaces.

The hand-tuned constant was not the wrong size, only blind: at full run the
solve returns 0.140 m of bend on the front chain and 0.154 on the back, against
the authored 0.5 * 0.3 = 0.150. What it could not do was answer a hill, bend
during stance, or stop the hock over-folding by 30% at speed.

**`math` from pmndrs is not adopted, and the open question is closed.** The gate
in `spec/13-asset-lab.md` asks for the FABRIK result to be visibly better and
not merely equivalent. Every leg chain in this game is two bones - the dog's
`DOG_JOINTS` triples in `dogLegSolver.ts` and the sheep's shoulder-knee-sole
rings - and two bones have an exact answer in one step, the law of cosines with
the cosine cancelled. FABRIK is iterative because three or more links have no
closed form; on two links it converges toward the line that is already written
here. Adopting it would spend a dependency, a version pin and a loop to
approximate an exact answer, so it cannot clear its own gate. The package was
never installed and is not in `package.json`. Reopen it if a chain with three
bones is ever authored - a real scapula, or a stifle and hock modelled apart -
because that is the case the library exists for.

Not done, and not weakened to pass:

- **The hoof path still over-reaches the leg by 12% at speed**, 0.641 m of span
  against 0.572 of bone, which is what the compliance term is absorbing. The
  honest fix is a compass gait: the hip dips as the limb swings off vertical,
  which on a 0.56 m leg at 32 degrees is 0.085 m against the 0.016 the body bob
  carries. That is a five-fold change to a bounce the owner has just accepted,
  and it is coupled to the ballistic-bound receipt, so it is a change of its own
  and not a correction to this one.
- **No motion review.** The legs were checked functionally in the lab at 4 m and
  read as jointed limbs, with a hock behind and a flexing carpus in front and
  nothing inverted. Captures at both gameplay cameras and both aspects have not
  been taken, and the obstacle is the one already recorded above: the probe's
  art workload drives `W` for the whole sample, so the dog outruns the flock and
  the Classic capture from this very run has the sheep as a distant raft at the
  top edge with no leg visible at all. This is the same defect that holds the
  grass regrade's flock-parting line open, and it now blocks a second gate.

Hub timing, 2026-10-15, `mk-os`, GTX 1660 Ti, `performance` profile, 1440x900,
Classic camera, 60 s each. The candidate is `5332de35`; the baseline is the same
tree with `sheepMotion.ts`, `sheepParts.ts` and `flockTuning.ts` reverted one
commit, so the delta is this change alone. Preflight on every run was at or
under 2.5% CPU and 0% GPU, inside the 5%/15% requirement. Receipts in
`captures/stability/hub-receipts/`.

| build | backend | frames | p50 | p95 | p99 | max | >100 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | WebGPU | 7,192 | 8.30 | 8.40 | 8.40 | 25.0 | 0 |
| candidate | WebGPU | 7,191 | 8.30 | 8.40 | 8.40 | 25.0 | 0 |
| baseline | WebGL2 | 7,195 | 8.30 | 8.40 | 8.40 | 16.7 | 0 |
| candidate | WebGL2 | 7,194 | 8.30 | 8.40 | 8.40 | 16.7 | 0 |

Identical to the last digit the probe reports, on both backends, with 40 draw
calls and 3,959,384 triangles on all four runs. **Read it as a bound, not a
measurement**: the hub presents at 120 Hz and every percentile here is the
8.3 ms refresh interval, so what the run establishes is that the solve stays
inside the frame the display asks for with at least 8.3 ms of headroom against
the stated 16.7 ms budget - not that it costs nothing. A length, a divide and a
square root per vertex, against the sine it replaces, is too small for this lane
to resolve.

Bundle: the initial JS chunk goes from 631,341 to 631,697 gzipped bytes, +356
for the solve and its constants. The release probe passes at 635,615 gzip
against a 1,572,864 limit and 6,164,223 estimated first-load bytes against
8,388,608, with a clean client secret scan.

Startup still fails its 2,000 ms gate on every run - 2,698 and 3,478 ms on the
baseline, 3,835 and 5,332 on the candidate. That is one sample each with the
candidate run first into a cold shader cache, so it establishes nothing in
either direction and is recorded rather than read. The gate was already failing
before this change.

### Dog legs: a swing that starts where the limb can reach, 2026-10-15

Measured the same way the sheep were, but through the real rig rather than a
twin: a `DogRig` posed by the real `advanceDogMotion`, frame by frame, at ten
speeds from 1 to 25 m/s, reading the posed bone positions back out. Two defects,
both invisible to the existing guards because every one of them held.

| speed | hind reach | paw off its commanded target | worst joint travel in one frame |
| --- | --- | --- | --- |
| 4 m/s | 0.97 | 0 mm | 50 mm |
| 8 m/s | 1.0000 | 11 mm | 141 mm |
| 15 m/s | 1.0000 | 69 mm | 196 mm |
| 25 m/s | 1.0000 | 133 mm | 262 mm |

From 8 m/s the hind limb is at full extension for part of every cycle, 13% of it
at a sprint; the fore limb joins at 20. The gait's own planting was never the
problem - stance slip measures zero at every speed, because `dogStride` is
already derived from the stance share and the cadence, the same constraint the
sheep were given this week.

**The sub-frame one.** A swing's foot-drift offset is read on the first airborne
frame against that frame's nominal. But a frame almost never lands on the stance
handover: it lands some fraction past it, and over that fraction a world-locked
foot keeps travelling backward under the body while the swing curve already has
it standing still at `-stride`. The gap is speed times that fraction - 93 mm at
DOG_MAX_SPEED - and it was banked as drift and held into the swing by
`remaining`, at the one moment in the cycle when the hind limb is already at full
stretch. `sampleDogPaw` now also reports `stanceTravel`, the stance ramp carried
on past its own end, and the offset is measured against that instead. The two
curves meet exactly at the boundary, so a foot that is where the ramp says it is
has no drift to carry; a real turn's drift is untouched, and the two lift-off
tests that guard the turn case pass unchanged.

**The structural one.** The hind paw rests 0.08 m behind its hip, so at the end
of a 0.4 m drive it is 0.55 m aft of the hip and 0.76 below it: 0.94 m of demand
on 0.935 m of bone, with the body bob near its peak at exactly that moment.
`GALLOP_DROP` brings the chest down past a trot - 0.085 m, gated at 5 m/s,
leaving 0.29 m of belly clearance at the deepest rib. It is where a real dog
gets the same reach back, and it is already how this rig answers the same problem
under bank.

After both, over every speed, both pairs and a full cycle: the paw lands on its
commanded target to within a tenth of a millimetre, no limb exceeds 0.954 of its
chain, stance slip stays at zero, and the worst single-frame joint travel falls
from 262 mm to 114 - against a paw covering 417 mm in that same frame. Three
guards in `tests/dog-rig.spec.ts` hold all of it, and each was checked against
the old behaviour first: they fail at 91 mm and 0.99999.

The sheep's `KNEE_COMPLIANCE` was tried here and is not shipped. It removes the
square-root cusp at full extension, which is what it is for, but with the pose no
longer visiting full extension there is no cusp to remove and it cost 5 mm of paw
placement at every speed. A guard on reach is the right form of that protection,
and that is what the second test is.

Not done:

- **No lab verification at the time.** CORRECTED, 2026-10-15: this entry
  originally said the lab's treadmill did not latch on the Dog subject. It does
  latch. The claim came from reading `button.className` to decide whether a
  toggle had taken, and the lab's `Button` styles inline and sets no class, so an
  empty className was a false negative, not a dead control. The treadmill's real
  defects were different and are recorded below. Every number above still comes
  from the rig itself.
- **No hub receipt.** The change is two scalar expressions in a per-frame pose
  that already runs; there is no plausible cost, which is a reason to say so
  rather than a reason to claim it measured.

### The lab treadmill, and the snap at the end of a swing, 2026-10-15

Two findings, one in the lab's own tooling and one in the gait, found because
the first was blocking the second.

**The treadmill.** `Sprint` latched and did nothing: the module's only effect
returned early unless `walking` was also on, so a lit button drove no keys.
Sprinting is walking, faster, so the store now keeps the pair consistent from
either end. The larger problem was that it held `forward` and nothing else, and
`forward` under Classic's basis is the constant world +z - straight at the gate
standing open at z = 100. The lab mounts no `CameraRig`, so `cameraModeBlend`
stays 0 and that basis never changes. The dog left the field in about fourteen
seconds, parked in the pen at z = 107.5, and sat down, with the lab camera
following it out there. It now chooses which of the eight compass directions
four movement keys can describe from where the dog actually is: straight
shuttles through the flock and turns around at 50 m, a held turn orbits at 35 m.
Still only keys - the conditioner decides everything about how that direction is
taken up, which is the whole contract of the file.

Measured in the browser, at a sprint, over 66 seconds: the radius from the
flock's own ground stayed between 0.1 m and 60.2 m, against 80 m to the nearest
fence, with legs of about 100 m between turnarounds.

It also re-presses the held keys every 0.25 s rather than trusting its own cache
of them. `keyboard.ts` drops every held key on blur and on tab-hide, and a hot
update leaves the replaced instance's keyup to land after the new one has
recorded the key as held; either way the diff saw no change and never pressed
again. That was measured as a dog standing still with KeyD down for all 132
samples over 66 seconds, with the loop still rendering at 13.9 ms - which is
indistinguishable from the broken treadmill the file was opened to fix.

**The snap.** A planted paw stands still in the world, so its body-space travel
sweeps backward at exactly the body's ground speed. The swing was a smoothstep,
which leaves and arrives with zero body-space velocity - so the paw's world
velocity stepped by the whole of the dog's speed in the frame it lifted and again
in the frame it landed. Through the rig, at two thirds of DOG_MAX_SPEED, the paw
covered 98 mm on the frame it touched down and 0 mm on the next. `sin` for the
lift is worse than it looks for the same reason: it is steepest at exactly those
two frames, and threw the paw upward at 1.7 m/s in the one it lifted.

The swing is now a cubic whose end slopes are the stance sweep, and the lift is
`sin` squared. The two slopes are not equal, because their costs are not: the
rearward bulge lands just after lift-off where the hind limb is already at 0.95
of its bone, and the forward one lands where the limb is folding.

| | touchdown step, 2 / 8 m/s | lift-off step | reach, steady |
| --- | --- | --- | --- |
| before | 59 / 141 mm | 56 / 134 mm | 0.954 |
| after | 19 / 41 mm | 29 / 124 mm | 0.957 |

The foot is placed exactly, rather than slammed forward into the ground, up to
6.3 m/s; above that it takes what the bone allows, 82% of the match at two thirds
of DOG_MAX_SPEED and 43% at a sprint, where a paw covers 25 cm a frame.

**And a third thing, which was already there.** A stance is a distance - exactly
`2 * dogStride` - but `dogStanceShare` turns it into a share of the cycle at the
CURRENT speed. Change the speed under a foot the world has locked down and the
two stop agreeing: braking raises the stance share, the foot is held past the
stride it budgeted, the body walks away from it, and the limb is pulled straight.
On a 10 m/s^2 brake from DOG_MAX_SPEED - gentler than DOG_ACCELERATION, which is
what the player gets - the hind chain reached 1.0000 of its bone and the solver
clamped, leaving the paw 145.6 mm off the ground it was meant to be standing on.
Confirmed present with the shipped curve, so it is not something this week
introduced; the lab treadmill turns around constantly, which is why it surfaced
now. A contact now ends where its stride ends and slides forward past that, which
is what a braking dog's foot does on grass. Reach 1.0000 -> 0.9559, paw
145.6 mm -> 0.00 mm off target, and every steady speed untouched.

Open, and recorded in `tests/dog-rig.spec.ts` rather than left to be rediscovered:

- **The gallop transition drags a foot's phase.** `sampleDogPaw` offsets each
  foot by a share of `sprint` computed from the instantaneous speed, so foot 3
  moves 0.3 of a cycle between DOG_MAX_SPEED and DOG_SPRINT_SPEED. A dog surging
  across that band has that phase dragged by 0.22 of a cycle - about 1.4 whole
  stances at those speeds - so a foot is locked down mid-sweep, 196 mm behind
  where a contact belongs, and the limb reaches the solver's clamp. The sweep
  bound can only take back the part past the stride. The fix is a transition that
  re-times the swing instead of moving a foot's phase.
- ~~**The sit is still wrong.**~~ Done, below.
- **No hub receipt.** Curve evaluation in a per-frame pose that already runs,
  with one added `Math.hypot` per foot; there is no plausible cost, which is a
  reason to say so rather than to claim it measured.

### A dog that sits, and feet that stop without teleporting, 2026-10-15

**The sit.** It was authored by eye and it showed. A sitting dog rests on three
things - both fore paws, the point of buttock, and the hocks with the metatarsus
lying flat - and two of those are contacts this rig can be solved against.
`SPINE[0]` is the point of buttock, rest-space z -0.96 with its underside at
y 0.83; the ground is y 0.20 where the paws contact. So a sit has to bring that
point down 0.63 m. The pose that shipped brought it down 0.30 while the
`-0.17 * moving` ride height RAISED the root by 0.17 as the dog stopped.

| | shipped | now | wanted |
| --- | --- | --- | --- |
| point of buttock | 0.406 | 0.203 | 0.200, the ground |
| hock | 0.374 | 0.200 | 0.200, the ground |
| fore reach | 0.973 | 0.950 | near straight, off the cusp |
| hind reach | 0.692 | 0.564 | folded |

The four numbers were solved against those contacts on the real rig -
sensitivities measured one lever at a time, then a grid - rather than nudged
until it looked right. The hock is not placed on the ground by a rule of its
own: once the hip is low enough and the foot is under it rather than ahead of
it, the solver's existing backward pole puts the middle joint 0.41 m behind the
hip at ground level, which is the hock down with the metatarsus flat and the
foot forward of it. That is what `SIT_HIND_ADVANCE` is for, and why it is 0.22
rather than something that looks like a step.

**And the stop.** Found while measuring the sit, present with the shipped code:
`dogStride` collapses to zero with the speed, so on the frame a dog reaches a
standstill every paw's commanded travel becomes zero at once and four feet
caught anywhere in their cycles are moved to the standing stance in that one
frame. Measured at 471.9 mm of paw and 249.7 mm of knee in a single frame, with
the limb reaching 1.0000 of its bone on the way - the same thing again a few
seconds later when the sit dropped the locks. A foot now keeps where it was
drawn and the difference decays over 0.35 s, so it gathers rather than
teleports: 471.9 mm -> 53.4 mm.

What is left of that 53 mm is the last two frames of the speed ramp, over which
`dogStride` itself collapses from 0.4 m to nothing while the feet are still on
the swing curve. That is the same root cause one step upstream, and it is the
third place this week it has been paid for, after the braking stance and the
gallop transition: **gait geometry is a function of the instantaneous speed**.
Worth fixing once, properly, rather than a fourth time. Done, below.

### A contact belongs to the foot standing on it, 2026-10-15

The root cause the three sections above each paid for separately. A stance is a
DISTANCE - exactly `2 * dogStride`, the paw sweeping from +stride to -stride
while the body covers the same ground, which is why stance slip measures zero at
every steady speed. `dogStanceShare` is what turns that distance into a share of
the cycle at a given speed. Reading that share per frame means **the gate
deciding when a planted foot lifts moves while the foot is on the ground**, and
every symptom followed from it.

Worth writing down what the two curves actually are, because the shape of them
is why the fix is split the way it is. Substituting the share into the stride:

| speed | stance share | stride |
| --- | --- | --- |
| 0 | 0.62 | 0 |
| 1 | 0.62 | 0.205 |
| 2.112 | 0.62 | 0.400 |
| 4 | 0.370 | 0.400 |
| 12 | 0.183 | 0.400 |
| 25 | 0.134 | 0.400 |

Above 2.112 m/s the stance clamp is off and the two terms cancel exactly:
**stride is flat at `DOG_MAX_PAW_REACH` for the whole running range** and the
share carries all of the speed dependence. Below it the dog is taking shorter
steps at the gait rate's floor and the stride collapses with the speed - which
is the standstill, and nowhere else. So the share is a timing gate that the
whole contact is measured against, and the stride is geometry; they need
different rules, and giving them the same one is what made the earlier attempts
trade one defect for another.

**One rule.** A foot on the ground is world-locked and carrying weight, so the
contact it committed to at touchdown is what it gets. A foot in the air is only
choosing where to land, so it may be re-aimed and re-timed freely, and that is
where every change the speed asks for is now taken. In `DogMotion`:

- `footStance` is fixed at touchdown and held for the whole cycle.
- `footStride` is frozen while the foot carries weight and closes toward the
  live value across the swing, arriving at touchdown. Deliberately not
  rate-limited: a cap at a third of what a swing costs anyway made a foot LAND
  still owing 318 mm of stride, standing 302 mm in front of its own contact with
  the limb against the solver's clamp for a quarter of a second. Measured, the
  cap made the hard brake worse, not better - 1.0000 of the chain against
  0.9901. Paying it in the air is the whole point of doing it in the air.
- `footOffset` is the foot's place in the gait order, moved at `DOG_RETIME_RATE`
  and only while airborne. The trot-to-gallop separation drags foot 3 by 0.6 of
  a cycle, and doing that to a foot on the ground pulled it along its own stance
  ramp - the one case the `dogRig` sweep bound could never catch, because the
  body had not travelled any further than it should have.

Measured through the real rig, six speed profiles, counting every foot-frame
where a limb sits within 1% of straight - the cusp where a two-bone solve has
infinite slope and a millimetre of paw is tens of millimetres of knee:

| profile | shipped | now |
| --- | --- | --- |
| gallop surge, 8 to 20 m/s | 1.0000, 7 frames | **0.9525, none** |
| sprint surge, 12 to 25 m/s | 1.0000, 14 frames | **0.9537, none** |
| standing start to 15 m/s | 0.9983, 1 frame | **0.9710, none** |
| brake, 15 to 2 m/s | 0.9575, none | 0.9559, none |
| brake to a dead stop | 1.0000, 219 frames | **0.9901, 1 frame** |
| stop, then sit | 1.0000, 307 frames | **1.0000, 30 frames** |

2106 clamped foot-frames to 52. Steady-state reach is unchanged to four decimal
places at every speed, and stance slip is still zero.

**Two things it exposed.** Neither was a regression - both are in the shipped
code too - but both became visible once a stopped dog's feet really were at
rest rather than merely heading there:

- The sweep bound's allowance was `2 * footStride`, and a standing contact has
  no stride at all, so twice nothing is an allowance of nothing. A dog spawned
  at rest and accelerated had the bound collapse its feet onto the body root on
  the second frame: 547 mm of paw with all four limbs pinned straight. The
  allowance now has `DOG_MAX_PAW_REACH` as a floor, and the carry is along the
  body's own displacement by the excess rather than a lerp toward the root by
  the excess's share of the sweep - the two agree while the excess is small and
  part company as it grows, and the second is what had the singularity.
- `-0.17 * moving` lowers a moving dog and goes to nothing at a standstill, so a
  standing dog stood at its bind pose - where the hind chain is 0.17% from
  straight. `STAND_DROP` is a 0.045 m floor on it, which buys the fore limb back
  to 0.940 and the hind to 0.950, costs 4.5 cm of a 1.05 m standing height, and
  applies only below 0.4 m/s where the moving term is not already deeper.

**And one patch retired.** The 0.35 s settle decay that brought the standstill
teleport down from 471.9 mm to 53.4 mm is gone, along with its three arrays.
With a contact holding the stride it planted with, and the world lock no longer
given up below a walk, there is nothing left to gather from: removing the decay
entirely leaves the measured standstill step where it already was, at 56.0 mm.
The `dogRig` sweep bound stays as a backstop - what the share buys is a contact
of the right length in cycles, and the body's speed still decides what that is
worth in metres, so a foot that plants and then accelerates hard can still
outrun its stride. Nothing reaches it now, but the margin is a function of the
acceleration the movement layer happens to allow, and a limb snapping straight
is not an acceptable way to find out that has been raised.

Still open, and now the oldest thing here:

- **Both chains bind straight.** The hind limb is 0.17% short of straight in the
  bind pose and the fore 0.77%, so the bind pose is itself within a millimetre
  of the cusp. `STAND_DROP` above is a floor on the symptom, and `BANK_ROOT_DROP`,
  `GALLOP_DROP` and `CROUCH_DROP` all exist to buy bend back the same way. The
  sheep's front leg had the same problem this week and was fixed by authoring a
  real carpus into the rings; the dog wants an authored stifle angle, which moves
  the bind pose and so the skinning, and is a bigger change than anything above.
- **The dead stop still clamps, for 30 frames of a sit.** Down from 307, and the
  one frame at 1.0000 is the fore limb passing through near-straight as the sit
  ramp takes over. The sit itself is solved against its contacts and measures
  0.950; it is the transition into it that is unmeasured, and it is next.

### The homestead, and a walk-in house built with Kiln, 2026-10-15

Two separate pieces of work, kept separate on purpose.

**The shipped cluster was corrected in place.** The owner's reading - static
smoke, an uncanny wall, a barn that needed love - resolved into three measured
faults. The painted breakup in `farmhouse/surfaceMaterial.ts` was running at
5.4x its authored feature size, measured over a 16.5 m run: boards came out
6.6 m, wall patches 11 m, stone grain 16.5 m, so five different skins were flat
fills and the building had no surface at all. `STROKE = 5.4` scales the sample
point and the threshold edge together, so every step keeps its world width.
The wall patch was then only 3:1 stretched against the boards' 14:1 and 21:1,
which drew an arcade of arches along the foot of every wall; it is 9:1 now.
Nine openings sat on two faces of the house and two of the barn, leaving the
sunlit 18.6 x 5.8 m front and both 10.8 x 10.5 m barn gables blank - a roof says
cottage and a blank wall says warehouse, and the eye believes the wall. There
are 23 now, no two alike, for 44 triangles and no extra draw. `DRESS` was the
most saturated band in the cluster at 41% and read as pink skirting; it lost a
third of its chroma and kept its value ladder. The chimney smoke is a
vertex-stage plume on a 7.2 s cycle instead of a static cone.

**The walk-in house is a prototype, and it is lab-only.** `assets/house/` holds
an editable Kiln program and the GLB it bakes to; `lab/src/kilnHouseAsset.ts`
welds that GLB into one buffer per farmhouse band set and the shipped
`makeFarmhouseSurfaceMaterial` draws it. Nothing under `app/` imports any of it
and `dist/` contains no GLB. The point was to answer whether an outside asset
can arrive inside this game's painting, and it can: the look lives in
`bands.ts` and in the `uv.x`/`uv.y` channel convention, both of which the
importer reconstructs from material name and world position, so no new shader
and no texture were needed.

Measured, with the ground off and both subjects at one camera: the Kiln house
is 3,440 triangles in 6 draws; the whole shipped cluster - house, cross wing,
two lean-tos, porch, barn, cupola, outshot, hood, 23 openings and the plume -
is 4,874. One building with an interior costs two thirds of the homestead.

Verified 2026-10-15: `npm run typecheck` and `npm run typecheck:lab` clean,
`npm run lint` clean on every touched file (the 2 errors and 2 warnings it
reports are inside another worktree under `.claude/worktrees/`), `npm test`
940 passed in 113 files, `npm run build` exit 0 at 2,286.69 kB raw and
637.46 kB gzip against 2,277.14 and 634.68 before: 9.55 kB raw and 2.78 kB
gzipped, all of it the procedural pass, none of it the prototype.
`node tools/record-house-asset.mjs --check` re-bakes from a scratch directory
with no `.kiln/` cache and reproduces the recorded GLB byte for byte.

Four faults were then found on owner review, and all four are fixed. The gable
wall was not breaking through the roof, it was exactly coplanar with it: the
gable triangles took the roof's own span and rise, so their top edge and the
slate's top face both finished at y 10.72 and z-fought as a bright stripe down
the pitch. They are built 200 mm inside the slab now. The eaves overhang was
1.15 m, which on this pitch drops 1.23 m and put the eaves edge at 4.44 against
first-floor window heads at 5.05 - the roof hung down past the top of the
windows; at 450 mm it clears them by 338 mm. Every corner had a 275 mm square
full-height hole, because `createGableShell` builds walls on their centrelines
and the long walls stopped short of the end walls' outer face; four corner posts
close them flush. And there was no first floor: the deck and the stair were
right, but nothing made the deck a floor, so eight windows opened onto a lid
with a 4.9 m void over it. It now has a railed landing, three bedrooms, a
ceiling at the wall head and a loft hatch, and two first-floor windows are lit.
The asset went from 3,224 triangles to 3,440.

Not done: the barn has had no equivalent of the Kiln treatment, and no
screenshot of this pass has been taken on the hub.

## Direction changes

Owner-ordered changes that override an earlier specification line. Four files
cite this section by name: `sim/BarkImpulse.ts`, `sim/tuning.ts`,
`tests/bark.spec.ts` and `tests/helpers/traces.ts`. The section did not survive
the clean-room import into this repository and was restored on 2026-10-14 from
the record those files carry.

- **Sheep grass footprint, 2026-10-15.** The owner's observation was that a
  sheep's impact on the grass reaches too far forward and back for how long a
  sheep is. It did, by a factor of two. The footprint rect ran 1.68 m of
  half-length against an animal `sheepGeometry.ts` states at 1.67 m nose to
  tail, so with `INTERACTION_RADIUS` and `falloff` the pressed region reached
  2.40 m fore and aft of a body that ends at 0.78 m: more flattened grass past
  the nose than the whole sheep is long.

  The dog is the thing that shows what the rule was meant to be. Its footprint
  IS its body's half-extents - 1.16 against the 1.173 that `dogParts.ts` SPINE
  lofts, 0.48 against its widest 0.45 - with `falloff` as the soft edge
  outside. The sheep missed that rule because `SHEEP_SCALE` was authored above
  one, on the written premise that "a sheep is wider and longer through the
  wool than a collie is through the ribs". This game's meshes say otherwise:
  the collie is 2.35 m by 0.90 m and the sheep 1.67 m by 0.84 m, so the dog is
  the bigger animal and the scale belonged below one. The old comment hid the
  error by comparing unlike things, a half-width against a collision radius
  but a half-length against a full body length.

  `SHEEP_SCALE` is now x0.93 / z0.71, which lands the sheep on the dog's two
  ratios: 0.824 against 0.835 along, 0.446 against 0.42 across. `spec/06` is
  amended in the same change. Presentation only - `interactionField.ts` is in
  `app/src`, `sim/` cannot import it, so no trace fixture moves and no
  `field-v3` time becomes incomparable. The reach a body files into the lookup
  grid falls from 2.40 m to 1.52 m, which is strictly less work.

  The test that should have caught this asserted the premise instead of
  measuring it: "a sheep is wider and longer than a collie, or the scale is
  upside down". It was upside down, and the assertion held the error in place.
  It now derives the dog's half-extents from the SPINE table and requires each
  footprint to sit within a tenth of its own animal.

  Evidence, this workstation, the functional lane: lint, `typecheck` and
  `typecheck:lab` clean. 905 tests in 112 files, all passing - 904 before, plus
  the one added here. Build exit 0, 2,277.14 kB raw and 634.68 kB gzip against
  2,277.11 and 634.68 before: 0.03 kB raw and nothing gzipped. Release
  hardening probe exit 0, player page params still exactly `debug` and `seed`,
  client secret scan clean. Before and after at the Sheep frame are in
  `captures/sheep-footprint/`. No hub timing.

  A worktree note, since it cost a false failure here: `assets/audio/licensed/`
  is gitignored, so a fresh worktree has none of it, and both
  `audio-manifest.spec.ts` and `tools/release-hardening-probe.mjs` fail on the
  missing `birds-loop.flac` until the directory is copied across from a
  checkout that has it. Neither failure is a code defect.

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
- Whether the walk-in Kiln house becomes the real house. The prototype answers
  the technical question - a GLB can be re-banded into this game's painting
  with no new shader - and leaves the judgement open. Against it: the backdrop
  cluster's look is a procedural surface keyed to `uv.x`/`uv.y`, and a baked
  mesh can only have those channels reconstructed from world position, which
  works for walls and roof slopes and degenerates wherever a surface is neither;
  one building with an interior is 3,440 triangles against the whole present
  homestead's 4,874; and `tests/treeline-assets.spec.ts:329` records this
  project's standing choice not to load GLBs at runtime, which adopting this
  would reverse. For it: an interior, a door and real reveals are not reachable
  by growing `farmhouse/parts.ts`, and the render-and-revise loop caught a
  twisted prism in the porch that no view of mine would have. The reversible
  reading, and the one taken: keep the 90 m backdrop procedural, keep the
  walk-in house in the lab, and decide when there is a scene to walk into.
- Whether to build the grass on `threejs-field-grass`. The owner's condition is
  that it be at least as performant as what ships. It is not, yet, and the
  reason is narrow: only the interaction field differs, and it trades GPU work
  for a constant CPU and upload cost sized for a 100 m demo field. Everything
  else is equal or better. The gate and the one-way direction of adoption are
  in `spec/13-asset-lab.md`; the deciding measurement is a hub run, not a
  desktop reading.
- ~~Whether to adopt `math` from pmndrs for leg IK.~~ Closed on 2026-10-15, not
  adopted. Every leg chain here is two bones, where the closed form is exact in
  one step and an iterative solver can at best converge toward it, so FABRIK
  cannot be "visibly better, not merely equivalent" as its own gate in
  `spec/13-asset-lab.md` requires. The reasoning and the sheep's new solver are
  in the asset polish pass above. Reopen it if a three-bone chain is ever
  authored.
