# Cycle 38 WebGPU Visual First-Principles Spike - 2026-05-16

## Question

How should SDS repair the remaining WebGPU visual failures after the tree
placement patch, specifically grass contact, sheep leg and wool readability,
and sun/atmosphere direction across the three shipped scenes?

This spike is research and cycle alignment only. It does not authorize touching
`shared/**`, sim-baseline goldens, worker migrations, paid-store work, or a
native-shell dependency. It does authorize the next client-rendering pass to
change WebGPU material, proof, and scene-lighting code when the acceptance gates
below are kept.

## Current observed failures

Matt's latest review keeps these defects open:

- Grass blades still do not read as bending under the dog or sheep. The current
  proof can show localized crop changes, but the visible read is mostly a
  darker patch around the dog. That is not acceptable deformation evidence.
- Sheep on WebGPU can look less smooth than WebGL, and current screenshots raise
  a possible leg-animation defect where legs appear to stick upward toward the
  sky. The wool also does not read as wooly enough.
- The sun still reads as a bright white splotch. Open Country should feel closer
  to dawn or a low 6pm sun, not high 3pm daylight.
- The phone is not connected, so latest phone/mobile acceptance remains deferred.

The completed tree-placement readability patch is separate evidence. It fixed
cross-zone tree clumps and undersized-tree reads; it did not close these grass,
sheep, wool, or atmosphere gates.

## User-provided WebGL reference image

Matt supplied an older WebGL screenshot as the target comparison for this pass.
Treat it as art-direction evidence, not a literal request to restore every
legacy shader value.

Important cues from the reference:

- Grass bending is visible from blade silhouettes. Tufts near the dog and flock
  lean and part as geometry; the player does not need a heatmap or darkened
  patch to infer contact.
- Grass color supports the bend. The yellow-green blades catch low sun and the
  dark ground between parted tufts makes the deformation legible.
- The sun has a strong warm horizon ramp: white core, yellow edge, orange/red
  transition, and darker sky around it. The core is very bright, but the glow has
  color structure instead of a shapeless white blob.
- Water glint is tied to the same sun direction and creates a readable vertical
  reflection path.
- Sheep bodies have a broken wool edge and surface breakup. The read is simple
  and stylized, but not a smooth white capsule.

WebGPU should recover those cues with better control: clear blade deformation,
warm bounded sun/halo, synced water glint, and wool silhouette breakup without
letting the sun become an uncontrolled white splotch.

## Repo evidence

### Grass

`js/world/konveyorGrassBladeNodeMaterial.js` already uses a WebGPU TSL
`positionNode` path. It computes interactor falloff, horizontal displacement,
and vertical laydown:

- `interactionDisp` pushes blade vertices away from the dog/sheep in XZ.
- `interactionLaydown` moves vertices downward by contact falloff.
- `interactionShadow` darkens contact pixels by up to the configured shadow
  strength.

The likely proof failure is that color darkening is more legible than geometry.
That means a screenshot diff can pass while the player still sees "dark grass"
instead of "bent grass".

First-principles correction: contact proof must isolate deformation from
albedo/shadow. The base of a blade stays planted. The tip moves farther than the
middle. Contact should splay away from the body direction, flatten locally, and
recover smoothly. A darker contact patch can be added later, but it cannot be
the proof signal.

### Sheep

`js/konveyorSheepNodeMaterial.js` uses `vertexId`, `instanceData`, and
`instanceAnimation` to animate body, head, legs, and body-only wool
displacement. The current masks are:

- body: `vertexId < 50`
- head: `50 <= vertexId < 100`
- legs: `100 <= vertexId < 140`

`js/OptimizedSheep.js` creates the four legs as small vertical cylinders with
vertex ids `100`, `110`, `120`, and `130`. The WebGL and WebGPU paths both lift
legs with a positive local-Y term. If the screenshot read is legs pointing up,
the next pass must prove whether this is camera perspective, excessive vertical
lift, mask drift, or an animation-vector contract problem.

Wool is currently body-only procedural noise plus normal displacement. That can
help surface texture, but it is not enough by itself to make a distant,
low-poly sheep read as wooly at silhouette.

### Sun and atmosphere

`js/effects/konveyorSunNodeMaterial.js` paints a billboard sun with additive
blending and a default intensity around `1.58`. `js/atmosphere/konveyorSkyNodeMaterial.js`
also contributes sun disc and glow terms to the sky. When both owners add
bright disc/glow energy, a warm sun can clip into a white blob.

`js/atmosphere/skyPresets.js` sets Open Country to `golden-hour`, currently
with a 22 degree sun elevation. That is higher than the target review language.
Open Country should be tested with a low-sun preset or a scene-specific
low-sun variant before more sun-brightness tweaks.

## External references

- Three.js TSL docs: Node materials expose high-level slots like `colorNode`,
  `roughnessNode`, and `positionNode`, preserving the material model while
  customizing shader behavior. TSL also exposes geometry attributes through
  `attribute()` and local/world position nodes. Reference:
  https://threejs.org/docs/TSL.html
- NVIDIA GPU Gems, "Rendering Countless Blades of Waving Grass": the classic
  low-draw-call grass solution moves grass in the vertex shader and, for better
  local variation, computes animation per grass object from an object center.
  Reference:
  https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-7-rendering-countless-blades-waving-grass
- Lengyel, Praun, Finkelstein, Hoppe, "Real-Time Fur over Arbitrary Surfaces":
  convincing real-time fur uses shell layers and silhouette fins to create hair
  volume and edge detail. SDS does not need that full system for sheep, but the
  paper explains why color noise alone will not sell wool at silhouettes.
  Reference: https://people.csail.mit.edu/ericchan/bib/pdf/p227-lengyel.pdf
- Three.js Sky docs: Three's sky object is based on the Preetham analytic
  daylight model and exposes turbidity, Rayleigh, Mie coefficient, Mie
  directional G, sun position, and an explicit sun-disc control. Reference:
  https://threejs.org/docs/pages/Sky.html
- Preetham, Shirley, Smits, "A Practical Analytic Model for Daylight": outdoor
  sky and aerial perspective should model sunlight, skylight, turbidity, and
  distance haze as a coupled daylight problem, not as an isolated colored
  gradient. Reference:
  https://courses.cs.duke.edu/cps124/fall02/resources/p91-preetham.pdf
- Hosek and Wilkie, "An analytic model for full spectral sky-dome radiance":
  improves known weaknesses of Preetham at sunset and high turbidity. That is
  relevant because SDS wants low sun and warm haze without white clipping.
  Reference:
  https://cgg.mff.cuni.cz/projects/SkylightModelling/HosekWilkie_SkylightModel_SIGGRAPH2012_Supplement.pdf

## Per-scene visual contract

### Home Field

Why: starter pasture, fenced, flat, readable tutorial scene.

What should improve: grass contact should be visible but restrained. The scene
can stay pastoral-noon, but dog/sheep deformation still needs proof because the
flat ground makes contact easiest to judge.

Optimal solution: keep lower drama, prove a small clean deformation radius with
shadow disabled in proof mode, and avoid a heavy trample wake that makes the
starter field look muddy.

### Rolling Hills / Sheep Dog Island

Why: current hero scene with island, warm dusk mood, water, trees, and the
highest screenshot value.

What should improve: this is the primary visible proof for grass bending,
sheep wool, sheep gait, and readable low sun. The grass is short enough that a
dog path should create a clear parted/flattened wake. Sheep close crops should
show legs staying under the body and wool softening the body silhouette.

Optimal solution: use the strongest but still plausible contact response here.
Keep the sky broad glow and sun billboard coordinated, and test sheep at fixed
gait phases before accepting normal-play screenshots.

### Open Country

Why: largest scene, multi-stage objective, open meadow and woods, intended to
feel expansive and atmospheric.

What should improve: Open Country currently reads too much like high afternoon.
The scene should shift toward low dawn/late-day light, with warmer horizon,
longer shadows, and a sun disc that is warm and bounded rather than a clipped
white patch.

Optimal solution: test a scene-specific low-sun preset before changing shared
sky presets. Candidate direction is sun elevation around 6-10 degrees, warmer
sun/halo, lower billboard intensity, no hard sky-disc double-add, and fog/haze
that supports depth without hiding terrain bands.

## Implementation plan

### Phase A - Evidence harness repair

1. Add a grass deformation proof mode that can capture the same crop with
   contact off, contact on with shadow/albedo darkening disabled, and a quiet
   bend-vector/edge overlay. The proof must fail if the only visible difference
   is darkening.
2. Add sheep phase proof: freeze one or a few sheep at representative gait
   phases in WebGPU, capture side/front/three-quarter crops, and record max leg
   vertex height relative to the body. The proof must show legs below the body
   and no upward sky-spike read.
3. Add atmosphere preset proof for all scenes: capture sun screen position,
   sun billboard intensity/size, sky sun-disc contribution, color histogram for
   clipped whites, and screenshots for Field, Rolling Hills, and Open Country.

### Phase B - Grass first-principles fix

1. Rewrite contact response around anchored blades:
   - Base fixed or nearly fixed.
   - Mid blade bends moderately.
   - Tip bends and flattens most.
   - Horizontal push follows dog/sheep body footprint and direction.
   - Downward laydown supports flattening but does not replace bend.
2. Separate production contact shadow from deformation proof. Reintroduce a
   subtle darkening term only after shadow-off captures prove geometry.
3. Keep the current uniform-array interactor path for this fix. A trample
   texture or compute path can come later if high-count sheep contact needs
   persistence or broader fields.

### Phase C - Sheep animation and wool fix

1. Audit WebGPU masks against merged geometry vertex ids and prove face, eyes,
   nose, legs, and body remain in their intended material regions.
2. Replace pure upward leg lift with a more constrained gait motion. The cheap
   acceptable version is lower-amplitude lift plus fore/aft swing weighted by
   leg vertex height. The better version is hinge-like rotation around the hip
   anchor, but only if it stays simple and stable.
3. Improve wool read without a heavy fur system:
   - Keep body-only displacement.
   - Add multi-scale wool normal/color variation.
   - Add a subtle rim/silhouette fuzz cue on the body only.
   - Consider a very small shell/fur card experiment only if the body shader
     still reads smooth after the simple pass.

### Phase D - Sun and atmosphere fix

1. Make sun-disc ownership explicit again in code and proof: sky owns broad
   glow/horizon warmth, sun billboard owns the readable disc and near halo.
2. Clamp the billboard and sky contributions so a low sun can be bright without
   creating a large clipped white patch.
3. Retune Open Country toward low sun. Prefer a scene-specific preset or narrow
   override so Field's noon and Rolling Hills' dusk are not accidentally
   dragged with it.
4. Validate water glint after the sun retune because glint depends on the same
   sun direction/color/intensity packet.

### Phase E - Acceptance

Desktop installed-Chrome WebGPU is the first gate. Phone/mobile proof is a
separate gate when hardware is connected.

Acceptance requires:

- Grass: off/on proof where shadow disabled still shows blade displacement.
- Grass: normal-play screenshot where dog and at least one sheep visibly bend
  grass, not just darken it.
- Sheep: fixed-phase crops show no leg vertex or silhouette projecting upward
  out of the body.
- Sheep: close crop shows a body-only wool read without corrupting face, legs,
  eyes, or nose colors.
- Sun: no large clipped white sun blob in Rolling Hills or Open Country.
- Open Country: low-sun atmosphere reads dawn or late-day, not high afternoon.
- Repo: docs and artifacts explicitly distinguish desktop acceptance from
  deferred phone/mobile acceptance.

## Hard stops

- Do not call grass fixed if the proof relies on color darkening.
- Do not call sheep fixed until WebGPU fixed-phase captures rule out the upward
  leg read.
- Do not brighten the sun more until sky-disc and billboard ownership are
  separated.
- Do not cite phone/mobile acceptance until the phone is connected and the
  device proof is rerun.
