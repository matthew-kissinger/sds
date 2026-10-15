# 13 - The asset lab and the polish pass

The version 3.0 client ships. Every asset in it is procedural TypeScript and
TSL: there are no DCC files, no imported models and no textures. This document
is the contract for the pass that takes those assets from shipped to hero
quality, and for the lab that makes the pass possible.

It does not lower any gate in `spec/05-art-direction.md` or `spec/08-performance.md`.
It adds a faster loop in front of them.

## Why a lab

Changing a sheep's wool volume today means editing a constant, running `tsc -b`,
running `vite build`, then a 60-second Playwright capture, and then judging
animation from stills. That loop is why polish stalls, and stills cannot pass
motion work at all (`spec/05`, the critic loop).

The lab exists to make one asset visible in isolation, at the game's real
cameras, under the game's real light, with its cost on screen, while a constant
changes. Nothing more. It is not an editor, not a scene authoring tool and not a
second application.

## Scope: four jobs with different gates

1. **Shape and shading.** Sheep, dog, farmhouse, barn, fence and gate, grass,
   treeline, scatter, sky. Presentation only.
2. **Animation and inverse kinematics.** Foot and hoof planting against
   `groundY`, foot-slide elimination, leg-solver bend, weight shift, secondary
   motion on ears, tail and wool. Presentation only.
3. **Customization.** Dog coat, markings and name; flock variety; sheep names.
   The whole matrix is reviewed, not one good example of it.
4. **Performance.** Measured per asset first, then the savings spent back on
   quality.

### What this pass does not touch

The dog's controller and the sheep simulation are frozen. `sim/`, `app/src/input/`
and `sim/tuning.ts` are out of scope, including the open sprint-speed question in
`STATUS.md`. The reason is not caution about the code, it is that those constants
are load-bearing twice over: they move the trace fixtures in `tests/fixtures/`,
and they make existing `field-v3` times incomparable with new ones.

Animation and IK are presentation layers over an unchanged controller. If a
polish idea requires a sim constant to move, it stops being polish and becomes a
gameplay decision for the owner, recorded under `STATUS.md` open questions.

## Where the lab lives

- `lab/` at the repository root, with its own `vite.lab.config.ts` whose root is
  `lab/` and which reuses the `@app` and `@sim` aliases. Started with
  `npm run lab`.
- The production build keeps `app/` as its root and never references `lab/`, so
  no lab code reaches `dist/`. This is the existing rule stated at the top of
  `tools/art-review.mjs`: no editor code is imported into the game.
- `lab/` is a consumer of the game's modules. Imports point from `lab/` into
  `app/src/` and `sim/`, never the other way.
- The lab adds no URL parameter to the player page. Production still reads
  exactly `seed` and `debug`, which `tools/release-hardening-probe.mjs` enforces
  by scanning `app/src`.

## What the lab provides

- **Isolation.** Any one system alone, or the field with one system removed.
- **The real cameras.** Classic height, Follow distance and the beauty angle,
  through the game's own framing modules, plus the Studio framing.
- **Judgement views.** Flat-black silhouette, ramp-band isolation, wireframe and
  normals. Silhouette first is a hard rule in `spec/05`; it needs a view.
- **Viewports.** 2560x1440, 390x844 at device ratio 3, and 844x390.
- **Both backends.** WebGPU and forced WebGL2, because one material path through
  `WebGPURenderer` is a tripwire and a regression in either backend is a defect.
- **A motion treadmill.** Hold a speed, a turn rate, a graze or a bark and watch
  the animation cycle without playing the game to reach that state.
- **Cost on screen.** Draw calls, triangles, instance count and shader compile
  time for the isolated system, from the counters the probes already install.
- **A variation matrix.** Every coat, marking, variety and tint as a contact
  sheet, so customization is judged as a set.
- **A/B against committed values.** The candidate beside what is in `main`.

## Tuning structs

Live tuning is only legal if it does not put editor state into the game. The
mechanism is a refactor, done per asset:

- Each asset exposes one exported tuning object that the shipped code reads.
- The lab mutates a copy of it and never writes back at runtime.
- The lab emits the TypeScript patch for the changed values, so a session ends
  as a committed constant rather than a slider position someone remembers.

This keeps tripwire 10 honest: the game reads every field that exists, and the
lab adds no flag to `app/src`. It also makes the constants testable, which is
worth the refactor on its own.

## Grass: the shipped field and `threejs-field-grass`

The standalone grass library is the shipped field extracted and generalised. It
is mounted in the lab beside the real one, over the same committed scatter, so
the two can be judged rather than argued about. It is a sibling checkout aliased
in `vite.lab.config.ts`, it is not in `package.json`, and no production build can
reach it.

The comparison is already made and recorded in `STATUS.md`. Its shape is what
governs adoption:

- Scatter, decode, blade mesh and palette are the same on both sides, to the
  value. Draw calls and triangles are equal at the same tier and camera.
- The library is ahead on grading and authoring: value noise instead of a sine
  hash, and every grading constant named on a `GrassMaterialStyle` and
  `GrassPalette` rather than hardcoded.
- The library is behind on interaction, and only there. It rasterises a
  deformation grid on the CPU where the game evaluates oriented footprint SDFs
  per vertex on the GPU, it has no bark wave, no reduced-motion path, and it
  does not damp wind through pressed grass.

So adoption runs one way. Grading, authoring structs, geometry and the bake API
may come from the library into the game. The interaction field goes the other
way: the game's is the reference implementation and the library takes it, or
makes interaction pluggable so the game keeps its own.

**The gate.** The library may become a dependency when, in this order: its
interaction is the game's architecture or injectable; the bark wave and the
reduced-motion path survive; a lab A/B at one camera shows no regression in
wake edge, wind damping under press or silhouette; and the hub reports the
swap at or inside the current frame budget on both backends, with the WebGPU
and forced-WebGL2 receipts `AGENTS.md` requires. An exact version pin and a
measured bundle delta land in the same change, as tripwire 10 requires.

Until every one of those holds, the library stays a lab subject and the game
keeps `app/src/scene/grass/`. A grading or noise improvement found this way is
lifted into the shipped material as an ordinary change; it does not need the
dependency.

## Inverse kinematics and the `math` dependency

The dog already has a hand-rolled leg solver (`app/src/scene/dog/dogLegSolver.ts`)
and both animals already plant feet against the heightfield
(`DOG_PAW_CONTACTS`, `SHEEP_HOOF_SOLE_POINTS`, `terrainPlanting.ts`).

The candidate for better IK is `math` from pmndrs (MIT, `math/ik`, `fabrik2` and
`fabrik3`): FABRIK chains of two and three bones, which is the shape of a
quadruped leg. Its API writes into an out-parameter and allocates nothing, which
is what `spec/08` requires of a per-frame path.

It is version 0.1.0. Adoption is therefore gated, not assumed:

- Pin the exact version. No range.
- The dependency and its first real consumer land in the same commit. This
  repository already shipped `@pmndrs/glyph` in `package.json` with no code
  reading it and had to remove it again.
- Measure the gzipped bundle delta against the `spec/08` budget before
  adopting. Subpath entry points are tree-shakeable in principle; confirm it in
  this build rather than trusting the claim.
- Show the result beside the current solver in the lab. Replace the hand-rolled
  solver only if the FABRIK result is visibly better, not merely equivalent.
- `sim/` does not import it. The ESLint fence in `eslint.config.js` gains `math`
  alongside `three`, `react` and `app`, so `math/random`'s generator can never
  become a second RNG inside the deterministic path.

`math/time` springs are candidates for secondary motion under the same rules.

## Measurement lanes

This is the rule that was previously only written inside a closed
investigation log, and it is the reason to state it here:

- **The hub is the timing lane.** Frame times, percentiles, startup timing and
  any claim about performance come from the hub over the `hub` SSH alias, using
  `tools/hub-presentation-probe.mjs` against a copied production `dist/`.
  Preflight requires two consecutive samples at or under 5% GPU and 15%
  aggregate CPU. Runs are 60 to 600 seconds. Receipts land under
  `captures/stability/hub-receipts/`.
- **This PC is the functional lane.** It runs other work and other agents, so
  its timings cannot certify performance or establish a regression. Functional
  correctness, visual review and interaction testing are fine here.
- **Browser phone emulation is neither.** It shares the host GPU. It is a
  composition and layout check, and it is never reported as phone performance.
- Use isolated working and output directories on the hub. Do not stop another
  job or alter another checkout there.

## Acceptance, per asset

A pass closes on the existing bar, unchanged: the seven dimensions in
`spec/prompts/harsh-critic.md`, judged on captures from the running production
build, at both gameplay cameras and both aspects, with motion work judged in
motion. WOWED needs every dimension at 8 or above and two at 10.

Added by this document, because "more AAA" and "more performant" are the same
request pulling in two directions:

- Every pass reports its cost next to its look: draw calls, triangles, instance
  count and shader compile time, before and after.
- A pass that improves the look and the cost is finished. A pass that improves
  the look and spends cost states what it bought and what budget it came from.
- The lab cannot close a gate. Acceptance evidence comes from the production
  build, with hub receipts for anything timed, and lands in `STATUS.md` with the
  iteration count.

## Order

One asset per commit, measure first.

1. Documentation and operating rules. This document and `AGENTS.md`.
2. The lab skeleton: isolation, the real cameras, judgement views, counters, the
   treadmill.
3. **Sheep.** The hero asset at 200 instances: silhouette, wool volume, face,
   then animation and hoof contact.
4. **Dog.** The player: face, chest, legs, the trot-to-gallop transition, paw
   contact and IK, lean, tail and ear follow-through, bark anticipation.
5. **Grass.** The signature system and the largest performance lever.
6. **Farmhouse, barn, fence and gate.** Silhouette on the Classic approach,
   window glow, weathered timber, the gate's swing.
7. **Treeline, scatter, sky and post.** The frame-level cohesion pass.
8. **Customization matrices.**
9. **Performance consolidation**, including the single oversized client chunk.
10. **Physical-device receipts.** The one thing neither the lab nor the hub can
    supply.
