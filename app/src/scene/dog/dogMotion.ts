// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * How the dog carries itself, derived entirely from what the sim already knows.
 *
 * Presentation only, and one-way: this module reads speed and heading and
 * writes nothing back. It reads them as components (`velocity.x`, `heading.z`),
 * never by calling a method on a sim vector, because those vectors are pooled
 * and mutating one from the renderer would corrupt the tick.
 *
 * Everything here is a smoothed follow rather than a direct map. The sim can
 * change the dog's speed by 40 m/s^2, and an unsmoothed lean at that rate reads
 * as a twitch; a 0.1 s time constant reads as weight. The smoothing is written
 * as an exponential approach so it is frame-rate independent, matching
 * camera/feel.ts rather than inventing a second convention.
 *
 * State lives in one object the caller keeps for the life of the component, so
 * the frame path allocates nothing.
 */

import { DOG_ACCELERATION, DOG_MAX_SPEED } from '@sim/tuning';
import { smoothHeadingInto } from '../flock/headingSmoothing';

/** Gait rate at a standstill, rad/s. A slow weight shift, not a march. */
const GAIT_IDLE_RATE = 1.6;
/** Extra gait rate per m/s of ground speed. At the 15 m/s run this gives 2.8
 *  stride cycles a second, which is a working collie's trot-into-gallop. */
const GAIT_SPEED_RATE = 1.05;
/** Phase wrap. 4 PI, not 2 PI: the tail sway runs at half the leg rate, and
 *  wrapping at 2 PI would flip its sign every cycle. */
const GAIT_WRAP = Math.PI * 4;
const PAW_REACH = 0.6;
const STRIDE_IDLE = 0.05;
const STRIDE_RUN = 0.8;

const EFFORT_TAU = 0.14;
const ACCEL_TAU = 0.1;
const LEAN_TAU = 0.1;
const ROLL_TAU = 0.12;
/** Direction settles quickly enough to stay responsive while absorbing tick seams. */
export const DOG_HEADING_TAU = 0.085;
/** The player character gets the tighter catch-up ceiling: eight degrees per
 *  rendered frame after a stall, while ordinary small turns stay exponential. */
export const DOG_HEADING_STEP_LIMIT = 0.14;

/** The dog settles only after a real pause, never between direction taps. */
export const DOG_IDLE_SIT_DELAY = 5;
const IDLE_SPEED = 0.22;
const SIT_TAU = 0.72;
const HEAD_TILT_TAU = 0.3;
const HEAD_TILT_MAX = 0.16;

/** Nose-down pitch at full speed, radians. 2.3 degrees, down from 4. The vertex
 *  pose masks this away from the paw line while the upper body still carries
 *  enough pitch to read as forward effort. */
const LEAN_SPEED = 0.04;
/** Extra pitch from acceleration, radians at full throttle. Leans into a start
 *  and rocks back onto the haunches under braking, which is where most of the
 *  weight in the animation actually comes from. */
const LEAN_ACCEL = 0.08;
/** Bank per rad/s of turn rate, at full effort. */
const ROLL_GAIN = 0.024;
/** Bank ceiling, radians. 11 degrees: enough to feel the corner, short of a
 *  motorcycle. */
const ROLL_MAX = 0.2;

/** Vertical bob amplitude at rest and at full effort, metres. */
const BOB_IDLE = 0.008;
const BOB_RUN = 0.085;

export interface DogMotion {
  /** Radians, wrapped. Drives the leg, tail and head nodes. */
  gaitPhase: number;
  /** 0 standing, 1 at the sim's 15 m/s run speed. Sprint clamps here. */
  effort: number;
  /** Metres, added to the ground height. */
  bob: number;
  /** Radians, nose down positive. */
  lean: number;
  /** Radians, banking into the turn. */
  roll: number;
  speed: number;
  accel: number;
  headingX: number;
  headingZ: number;
  seated: boolean;
  /** Seconds continuously below IDLE_SPEED. Presentation only. */
  idleSeconds: number;
  /** 0 standing, 1 fully settled onto the haunches. */
  sit: number;
  /** Signed head cant in radians. Applied in dogMaterial without an Euler node. */
  headTilt: number;
}

export function createDogMotion(): DogMotion {
  return {
    gaitPhase: 0,
    effort: 0,
    bob: 0,
    lean: 0,
    roll: 0,
    speed: 0,
    accel: 0,
    headingX: 0,
    headingZ: 1,
    seated: false,
    idleSeconds: 0,
    sit: 0,
    headTilt: 0,
  };
}

/** Frame-rate independent exponential approach, as in camera/feel.ts. */
function approach(dt: number, tau: number): number {
  return dt > 0 ? 1 - Math.exp(-dt / tau) : 0;
}

/**
 * Advance one frame. `speed` is m/s; `headingX` and `headingZ` are the sim's
 * unit forward vector, read as components.
 */
export function advanceDogMotion(
  motion: DogMotion,
  dt: number,
  speed: number,
  headingX: number,
  headingZ: number,
  secondaryMotion = 1,
): number {
  if (!motion.seated) {
    // First frame of the page: nothing to differentiate against, and a start
    // from a stale zero heading would fire a full-lock bank.
    motion.seated = true;
    motion.speed = speed;
    motion.headingX = headingX;
    motion.headingZ = headingZ;
  }

  const effortTarget = Math.min(speed / DOG_MAX_SPEED, 1);
  motion.effort += (effortTarget - motion.effort) * approach(dt, EFFORT_TAU);

  if (speed < IDLE_SPEED) motion.idleSeconds += dt;
  else motion.idleSeconds = 0;
  const sitTarget = motion.idleSeconds >= DOG_IDLE_SIT_DELAY ? 1 : 0;
  motion.sit += (sitTarget - motion.sit) * approach(dt, SIT_TAU);
  const tiltTarget = sitTarget > 0
    ? Math.sin((motion.idleSeconds - DOG_IDLE_SIT_DELAY) * 0.72) * HEAD_TILT_MAX * secondaryMotion
    : 0;
  motion.headTilt += (tiltTarget - motion.headTilt) * approach(dt, HEAD_TILT_TAU);

  const rawAccel = dt > 0 ? (speed - motion.speed) / dt : 0;
  motion.accel += (rawAccel - motion.accel) * approach(dt, ACCEL_TAU);
  motion.speed = speed;

  motion.gaitPhase += dt * (GAIT_IDLE_RATE + motion.effort * GAIT_SPEED_RATE * DOG_MAX_SPEED);
  if (motion.gaitPhase > GAIT_WRAP) motion.gaitPhase -= GAIT_WRAP;

  motion.bob = Math.sin(motion.gaitPhase * 2) * (BOB_IDLE + motion.effort * BOB_RUN) * secondaryMotion;

  const accelNorm = Math.max(-1, Math.min(motion.accel / DOG_ACCELERATION, 1));
  const leanTarget = (LEAN_SPEED * motion.effort + LEAN_ACCEL * accelNorm) * secondaryMotion;
  motion.lean += (leanTarget - motion.lean) * approach(dt, LEAN_TAU);
  // Smooth the renderer's forward vector without touching the sim-owned one.
  // atan2(cross,dot) in the helper chooses the shortest arc even across +/-PI.
  const previousX = motion.headingX;
  const previousZ = motion.headingZ;
  const smoothed = HEADING_SCRATCH;
  const headingStep = smoothHeadingInto(
    smoothed,
    0,
    previousX,
    previousZ,
    headingX,
    headingZ,
    dt,
    DOG_HEADING_TAU,
    DOG_HEADING_STEP_LIMIT,
  );
  motion.headingX = smoothed[0]!;
  motion.headingZ = smoothed[1]!;

  // Signed turn rate about +y, now derived from the presentation heading so a
  // one-tick sim correction cannot fire a full-lock visual bank.
  const cross = previousX * motion.headingZ - previousZ * motion.headingX;
  const turnRight = dt > 0 ? -cross / dt : 0;

  const rollTarget = Math.max(
    -ROLL_MAX,
    Math.min(turnRight * ROLL_GAIN * motion.effort * secondaryMotion, ROLL_MAX),
  );
  motion.roll += (rollTarget - motion.roll) * approach(dt, ROLL_TAU);
  return headingStep;
}

/** Local +z travel of one paw centre for terrain sampling. */
export function dogPawSwingZ(
  motion: DogMotion,
  pairSign: number,
  secondaryMotion = 1,
): number {
  return Math.sin(motion.gaitPhase) * pairSign * PAW_REACH
    * (STRIDE_IDLE + motion.effort * STRIDE_RUN)
    * (1 - motion.sit)
    * secondaryMotion;
}

/** Module-owned two-float scratch. Calls run serially from the render loop. */
const HEADING_SCRATCH = new Float32Array(2);
