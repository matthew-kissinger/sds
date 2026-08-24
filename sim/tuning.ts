// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The tuning appendix of spec/02, as one named module.
 *
 * These values encode years of feel iteration in sds. Change them only through
 * playtesting, never through refactor drift: every one of them is pinned by a
 * committed trace fixture, so a change here shows up as a fixture diff and a
 * fixture diff is a decision (spec/02).
 *
 * Where a lifted module already owns a constant (the collision radii, the bark
 * cone) this module re-exports or references it. There is deliberately no
 * second, divergent copy of any number.
 *
 * UNITS: see the header of types.ts. The dog's numbers are metres and seconds.
 * The sheep's are sds boid units. Exactly one kind of sheep number is converted:
 * a SPEED, by SHEEP_UNIT, where the per-tick configs are assembled at the bottom
 * of this file. Nothing else in sim/ may scale a velocity.
 *
 * A FORCE is never converted. sds's steering forces (maxForce 0.05, bark
 * steerForce 0.22) are already metres per tick, per tick, and the appendix
 * quotes them unchanged; scaling them alongside the speeds is the units mistake
 * that makes a flock unsteerable - a 6x-weak flee force means the dog can walk
 * through a flock without moving it.
 */

import type { FlockingConfig } from './FlockingAlgorithms';
import type { MovementConfig, AccelerationConfig, StaminaConfig } from './MovementPhysics';
import type { BarkConfig } from './BarkImpulse';
import type { GateAvoidanceConfig, HardConstraintConfig } from './boundary';
import type { PenBarrierOptions } from './PenBarrier';
import { DEFAULT_BARK_CONFIG } from './BarkImpulse';

// --- Tick -------------------------------------------------------------------

/** Fixed simulation rate. Variable frame delta never enters `step` (spec/01). */
export const TICK_HZ = 60;
/** Seconds per tick. The only dt the sim ever sees. */
export const FIXED_DT = 1 / TICK_HZ;

// --- Boids (spec/02: separation 1.5, alignment 1.0, cohesion 1.0,
//     maxForce 0.05, perception 5, separationRadius 2.0, flee 2x) -------------

/**
 * Sheep top speed, in sds boid units. 1.5 * SHEEP_VELOCITY_SCALE = 7.2 m/s.
 *
 * DEVIATION, recorded: read as metres per second this would make sheep ten
 * times slower than the 15 m/s dog. At that ratio the flee mechanic stops
 * working as a game: a sheep cannot outrun the dog even briefly, so there is no
 * pressure to release and nothing to steer with (measured: 0 of 25 penned in
 * 60000 ticks by a scripted driver). The appendix value is kept verbatim and
 * the conversion it always implied is named below.
 */
export const SHEEP_MAX_SPEED = 1.5;
/**
 * Cap on any one steering force, metres per tick of velocity change per tick.
 * NOT boid units: this is already a per-tick quantity in sds and stays raw.
 */
export const SHEEP_MAX_FORCE = 0.05;
/**
 * Boid units to metres per second, and the single most feel-critical ratio in
 * the game: how fast a flock is relative to the dog.
 *
 * Fixed by sds's own numbers rather than invented. sds's sim baseline runs
 * sheep at maxSpeed 0.24 m/tick (14.4 m/s) against a dog at 30 m/s and a sprint
 * at 50 m/s - the dog is 2.083x a fleeing sheep, and 3.472x it when sprinting.
 * spec/02 names the smaller sds dog (`Sheepdog.maxSpeed = 15`, sprint 25).
 * 4.8 is the scale that puts sheep at 7.2 m/s, which reproduces BOTH sds ratios
 * exactly (15 / 7.2 = 2.083, 25 / 7.2 = 3.472) under the appendix's dog.
 */
export const SHEEP_VELOCITY_SCALE = 4.8;
/** Neighbour search radius, m. */
export const SHEEP_PERCEPTION_RADIUS = 5;
/** Crowding distance below which separation kicks in, m. */
export const SHEEP_SEPARATION_RADIUS = 2.0;
export const SHEEP_SEPARATION_WEIGHT = 1.5;
export const SHEEP_ALIGNMENT_WEIGHT = 1.0;
export const SHEEP_COHESION_WEIGHT = 1.0;
/**
 * Distance at which a dog starts scaring a sheep, m. Not in the spec/02
 * appendix; lifted from sds (`sheep.fleeRadius = 8`). The "flee force 2x"
 * multiplier the appendix names lives inside `calculateFlee` itself
 * (`limit(maxForce * 2)`) and is not restated here.
 */
export const SHEEP_FLEE_RADIUS = 8;

// --- Movement (spec/02: damping 0.98, smoothing 0.85,
//     maxSpeed sheep 1.5 / dog 15, accel 40, decel 30) ----------------------

export const DAMPING_FACTOR = 0.98;
export const VELOCITY_SMOOTHING = 0.85;
/** Smoothed speed below which a sheep is parked outright, metres per tick. */
export const MIN_MOVEMENT_SPEED = 0.001;

/** Dog walk/run top speed, m/s. */
export const DOG_MAX_SPEED = 15;
/**
 * Dog sprint top speed, m/s. Not in the spec/02 appendix; lifted from sds
 * (`Sheepdog.sprintSpeed = 25`). Read by the sprint branch in step.ts.
 */
export const DOG_SPRINT_SPEED = 25;
export const DOG_ACCELERATION = 40;
export const DOG_DECELERATION = 30;
/**
 * Heading slew rate, 1/s. herd addition: sds turned the dog with atan2 plus an
 * angle lerp, which is trig on the tick path. The heading is a unit vector
 * lerped toward the velocity direction and renormalized, so only sqrt is used.
 * 8/s converges a 90 degree turn in about 0.35 s, matching sds's turnSpeed feel.
 */
export const DOG_TURN_RATE = 8;
/** Below this speed, m/s, the dog keeps its previous heading. */
export const DOG_HEADING_MIN_SPEED = 0.1;

// --- Stamina (spec/02: drain 30/s sprinting, regen 20/s) --------------------

export const DOG_MAX_STAMINA = 100;
export const STAMINA_DRAIN_RATE = 30;
export const STAMINA_REGEN_RATE = 20;
/** Hysteresis floor: below this a sprint cannot start or continue. */
export const MIN_STAMINA_TO_SPRINT = 10;

// --- Boundary (spec/02: margin 10, forceMultiplier 1.5) --------------------

/** Distance from the fence at which the steering force starts, m. */
export const BOUNDARY_MARGIN = 10;
/**
 * The 1.5 the appendix names. `calculateBoundaryAvoidanceWithGate` hardcodes it
 * at its own call site (sds did, and the fixtures pin it); this constant is the
 * one the gate-free `calculateRectAvoidance` path reads.
 */
export const BOUNDARY_FORCE_MULTIPLIER = 1.5;
/** Hard clamp inset from the fence line, m. */
export const HARD_BOUNDARY_MARGIN = 0.5;
/** Half-depth of the gate passage slot in which the fence force is skipped, m. */
export const GATE_PASSAGE_DEPTH = 2;

// --- Collision (spec/02: radius dog 1.2 / sheep 0.78, push cap 0.42 / 0.14) --
// Owned by EntityCollision.ts, re-exported so tuning is one import.

export {
  DOG_BODY_RADIUS,
  SHEEP_BODY_RADIUS,
  DOG_SHEEP_MIN_DISTANCE,
  SHEEP_SHEEP_MIN_DISTANCE,
  MAX_DOG_SHEEP_PUSH_PER_TICK,
  MAX_SHEEP_SHEEP_PUSH_PER_TICK,
} from './EntityCollision';

// --- Bark -------------------------------------------------------------------
//
// USER-ORDERED REDESIGN (STATUS.md "Direction changes", 2026-08-21). This
// section overrides spec/02's "BarkImpulse verbatim" and its appendix line
// "Bark: range 24, cone cos(50 deg), decay 36 ticks". sds's bark was measured
// and found unusable as a herding verb; the shape of the tool changed, not just
// its numbers. The bark-scatter fixture diff is the record of that decision.
//
//   what                 sds      herd     why it moved
//   range                24 m     40 m     24 m reached a corner of a spread
//                                          flock; 40 m reaches a slice of it.
//   cone half-angle      50 deg   60 deg   Wider, so aiming is a push
//                                          direction and not a needle thread.
//   nearRadius           -        10 m     Inside it the cone is ignored and
//                                          the push is purely radial: a bark at
//                                          the shoulder startles either way.
//   steerForce           0.22     0.34     Holds a sheep pinned at the speed
//                                          cap through most of the decay.
//   durationTicks        36       75       0.6 s of push became 1.25 s, the
//                                          "surge then settle" the order asks
//                                          for. Never longer than the cooldown.
//   forwardWeight        0.62     0.45     Radial-dominant, so the push always
//   radialWeight         0.38     0.55     reads as "away from the dog" even at
//                                          the cone edge (26 deg off, worst
//                                          case), while facing still aims it.
//   minFalloff           0.18     0.55     0.18 made the far half of the reach
//                                          nominal. It now scales the DURATION
//                                          as well as the force, which is the
//                                          only thing distance can honestly buy
//                                          under a speed cap; see durationAt()
//                                          in BarkImpulse.ts for the measurement
//                                          that forced that change.
//   cooldown             150 tk   90 tk    2.5 s punished using the tool. 1.5 s
//                                          still forbids machine-gunning: it is
//                                          15 ticks longer than the longest
//                                          push, so no sheep ever carries two
//                                          barks at once.
//
// New in herd: the startle ripple. A sheep the cone missed, standing within
// rippleRadius (6 m) of a sheep it hit, takes rippleForceScale (0.38) of the
// force for rippleDurationScale (0.5) of the duration, beginning
// rippleDelayTicksPerMetre (0.25) ticks per metre of its distance from the dog
// later, capped at rippleMaxDelayTicks (18). 0.25 ticks/m is a startle front
// travelling 4 m per tick, 240 m/s: at the 40 m edge of the reach the collar of
// sheep beyond the cone flinches 10 ticks after the bark. That is what makes a
// flock read as a body instead of a set of independent agents, and it is the
// number the presentation layer expands its bark ring on.
//
// Everything else about the bark is owned by BarkImpulse.ts.

/**
 * Cooldown between barks, ticks. 90 at 60 Hz is 1.5 s. See the table above:
 * it must stay above SHEEP_BARK.durationTicks so two barks cannot stack on one
 * sheep, which is the difference between a strong tool and a chaos button.
 */
export const BARK_COOLDOWN_TICKS = 90;

// --- Pen --------------------------------------------------------------------

/** Fence standoff for a sheep body, m (sds PenBarrier default). */
export const PEN_SHEEP_BODY = 0.6;
/** Fence standoff for the dog body, m (sds PenBarrier default). */
export const PEN_DOG_BODY = 1.0;
/**
 * Walk-in speed for a sheep that has just crossed the gate, m/s. sds's value:
 * a stroll next to a 7.2 m/s flock, which is the point - retirement is calm.
 */
export const PEN_SETTLE_SPEED = 6;

// --- Ambient grazing drift --------------------------------------------------
// herd adaptation of sds's `updateAmbientMotion`. sds derived the drift angle
// from the animation clock and applied it with cos/sin; both are banned on the
// tick path here, so the direction is a seeded unit vector drawn from the tick
// rng. This is the only consumer of `step`'s rng, and it is why a still flock
// keeps breathing instead of freezing solid under the damping term.

/** Above this fraction of top speed a sheep is busy and does not drift. */
export const AMBIENT_SPEED_FRACTION = 0.45;
/** Below this fraction of top speed the drift uses its stronger push. */
export const AMBIENT_IDLE_FRACTION = 0.08;
/** Drift force as a fraction of maxForce when nearly stopped / when ambling. */
export const AMBIENT_STRENGTH_IDLE = 0.72;
export const AMBIENT_STRENGTH_MOVING = 0.32;
/** Ticks a drift direction is held before a fresh one is drawn. */
export const AMBIENT_WANDER_TICKS = 36;

// --- Derived per-tick configs ----------------------------------------------
// The unit conversion lives here and only here.

/** Boid units to metres per tick. Multiply any sheep velocity constant by this. */
export const SHEEP_UNIT = SHEEP_VELOCITY_SCALE * FIXED_DT;

/** Sheep top speed in metres per tick (0.12, i.e. 7.2 m/s). */
export const SHEEP_MAX_SPEED_PER_TICK = SHEEP_MAX_SPEED * SHEEP_UNIT;

export const SHEEP_FLOCKING: Required<FlockingConfig> = {
  separationDistance: SHEEP_SEPARATION_RADIUS,
  separationWeight: SHEEP_SEPARATION_WEIGHT,
  alignmentWeight: SHEEP_ALIGNMENT_WEIGHT,
  cohesionWeight: SHEEP_COHESION_WEIGHT,
  maxSpeed: SHEEP_MAX_SPEED_PER_TICK,
  maxForce: SHEEP_MAX_FORCE,
};

export const SHEEP_MOVEMENT: Required<MovementConfig> = {
  maxSpeed: SHEEP_MAX_SPEED_PER_TICK,
  dampingFactor: DAMPING_FACTOR,
  velocitySmoothing: VELOCITY_SMOOTHING,
  minMovementThreshold: MIN_MOVEMENT_SPEED,
};

export const SHEEP_BOUNDARY: Required<GateAvoidanceConfig> = {
  margin: BOUNDARY_MARGIN,
  maxSpeed: SHEEP_MAX_SPEED_PER_TICK,
  maxForce: SHEEP_MAX_FORCE,
};

export const HARD_BOUNDARY: Required<HardConstraintConfig> = {
  margin: HARD_BOUNDARY_MARGIN,
  allowGatePassage: true,
};

/**
 * The bark, as the tick reads it. Every field is already a per-tick quantity
 * (metres, cosines, forces in m/tick/tick, ticks), so this is the module
 * default under the name the sim uses. The table in the bark section above is
 * the one place that says what each number does and why it is not sds's.
 */
export const SHEEP_BARK: BarkConfig = DEFAULT_BARK_CONFIG;

export const DOG_MOVEMENT: Required<AccelerationConfig> = {
  acceleration: DOG_ACCELERATION,
  deceleration: DOG_DECELERATION,
  maxSpeed: DOG_MAX_SPEED,
};

export const DOG_STAMINA: Required<StaminaConfig> = {
  maxStamina: DOG_MAX_STAMINA,
  drainRate: STAMINA_DRAIN_RATE,
  regenRate: STAMINA_REGEN_RATE,
  minStaminaToConsume: MIN_STAMINA_TO_SPRINT,
};

export const PEN_BARRIER: Required<Omit<PenBarrierOptions, 'settleSeed'>> = {
  sheepBody: PEN_SHEEP_BODY,
  dogBody: PEN_DOG_BODY,
  settleSpeed: PEN_SETTLE_SPEED,
};
