# 02 - Deterministic sim

The herding feel is the single most valuable artifact in sds. It lifts into `sim/` nearly verbatim. This doc names exactly what lifts, what is redesigned, and the tuned constants that must survive.

## Lift list (from sds, AGPL, same copyright holder)

| Module | sds path | Disposition |
|---|---|---|
| Vector2D | `sds/shared/Vector2D.js` | Verbatim to TS. Drop `.random()` (Math.random) and fence `.angle()` (atan2) out of tick paths. |
| FlockingAlgorithms | `sds/shared/FlockingAlgorithms.js` | Verbatim. Separation/alignment/cohesion/seek/flee, config-driven. This IS the feel. O(n^2) neighbors is fine at 200; spatial hash only if the GPU-scale toggle's CPU fallback ever needs it. |
| MovementPhysics | `sds/shared/MovementPhysics.js` | Verbatim minus slope-modulated speed (herd's sim is flat 2D; ground relief is visual only). Keep damping, smoothing, micro-movement threshold, stamina, NaN/Infinity guards. |
| EntityCollision | `sds/shared/EntityCollision.js` | Verbatim. Capped positional correction (never snap), hashed fallback normals, trig-free. Body radii are tuned to mesh scale; re-verify against the new painterly meshes. |
| BarkImpulse | `sds/shared/BarkImpulse.js` | Verbatim. Decaying steering intent in a forward cone, cone test via precomputed cos(50 deg). |
| Rect boundary + gate | `sds/shared/BoundaryCollision.js` (rect branch only) | Extract the rect math: rectBoundarySteer, gate-gap force suppression, hard constraints, isWithinArea. Leave the island/coastline union, all dispatch layers, and every compat shim behind. |
| PenBarrier | `sds/shared/PenBarrier.js` | Verbatim. The pen mechanism (see below). |
| Spawn generation | `sds/shared/SpawnLogic.js` (non-competitive path) | Clustered rejection-sampled ring spawns, rng required. Spawn-time trig is acceptable: runs once, server-side (or local-solo-side), seeded, result transmitted. |
| mulberry32 | `sds/shared/Random.js` | Verbatim. The rng parameter is REQUIRED at every call site. |
| State factory | `sds/shared/index.js` (pattern only) | One factory assembles field geometry + params into the canonical SimState both sides construct identically. No multi-shape input resolution. |

Not lifted, by decision: CompetitiveLayout/Mode, objective.js state machine, ObjectiveLogic, counting/survival/difficulty registries, CoastlineField, Heightfield-in-sim, SceneObstacles/TreePlacement as sim collision, GameStateValidation and its shims.

## The one mode

Win condition: every sheep is penned. One predicate, no stage machine, no timers in the sim.

**Geometry (Home Field layout, playtested numbers):** 200 x 200 m field, perimeter fence, north gate at x=0, z=100, 8 m wide, pen (pasture) rect behind it spanning x [-30, 30], z [102, 130]. Flock spawns clustered near (-20, -20) with spread radius 25. These numbers are the starting point; retune freely in playtesting, but start here.

**Mechanism (PenBarrier, the newer and better sds design):** the fence is real collision with one passable gate gap, so "sheep is inside the pen" geometrically implies "herded through the gate." Retirement is calm: a penned sheep walks to a seeded settle spot and grazes. No teleport, no despawn, no flag ceremony. The older sds gate-passage-flag flow (checkGatePassage, hasPassedGate) is reference-only; do not implement both (sds carried three parallel retirement paths).

**Sheep lifecycle is one enum:** `active | retiring | penned`. Single source of truth for "is this sheep in play." No boolean accretion (sds failure mode: five flags conjoined to answer that question).

**Flock sizes:** 25 / 75 / 200 as a config value on game setup. Leaderboard identity is the flock size. Score is completion time. In co-op, sheep flee all dogs equally.

## Tuning constants appendix (the real asset)

Extract into one named module `sim/tuning.ts`. Values encode years of feel iteration; change only through playtesting, never through refactor drift.

```
Boids:      separation 1.5, alignment 1.0, cohesion 1.0, maxForce 0.05,
            perception 5, separationRadius 2.0, flee force 2x within flee radius
Movement:   dampingFactor 0.98, velocitySmoothing 0.85,
            maxSpeed sheep 1.5 / dog 15, accel 40, decel 30
Stamina:    drain 30/s sprinting, regen 20/s
Boundary:   margin 10, forceMultiplier 1.5
Collision:  body radius dog 1.2 / sheep 0.78, push cap per tick 0.42 / 0.14
Bark:       range 24, cone cos(50 deg), decay 36 ticks
Tick:       60 Hz fixed
```

## Trace fixtures

Committed 60 Hz fixed-seed traces (JSON, values rounded to 4 decimals to absorb cross-platform double drift) pin the sim. Discipline, verbatim from sds:

- A fixture diff means a behavior change. Read the diff; decide if it is intended.
- Regeneration requires an explicitly recorded intent in the same PR. Never regenerate to make tests pass.
- The traces exercise `step` itself (the exported pure function), so there is no harness to drift.
- Good trace granularity to replicate: flock drift under no input, dog rotation convergence, stamina curve, bark response, full 25-sheep completion run.

## Forbidden in sim/

- Mode flags of any kind. A hypothetical second mode is a new sim composition, not a boolean.
- Math.random (lint error), trig in per-tick paths, default rng parameters.
- Imports from three, react, DOM, app/, worker/ (lint error).
- Scene-id strings, magic map coordinates, console.log in tick paths (sds shipped emoji logging inside its deterministic spawn path).
- Render state on sim objects (sds's Heightfield grew a mesh cache that was null on the Worker, blurring the exact boundary the fence protects).
