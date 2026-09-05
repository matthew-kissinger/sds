// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Presentation-only animation state. No writes to simulation vectors or clocks. */
import { DOG_ACCELERATION, DOG_MAX_SPEED, DOG_SPRINT_SPEED } from '@sim/tuning';
import { smoothHeadingInto } from '../flock/headingSmoothing';
import { dogGaitRate, DOG_GAIT_TAU } from './dogGait';
export const DOG_HEADING_TAU = 0.085;
export const DOG_HEADING_STEP_LIMIT = 0.14;
export const DOG_IDLE_SIT_DELAY = 5;
const scratch = new Float32Array(2);
export interface DogMotion {
  gaitPhase: number;
  effort: number;
  sprint: number;
  bob: number;
  lean: number;
  roll: number;
  speed: number;
  accel: number;
  headingX: number;
  headingZ: number;
  seated: boolean;
  idleSeconds: number;
  sit: number;
  headTilt: number;
  barkAge: number;
  bark: number;
  clock: number;
  locomotionSpeed: number;
}
export function createDogMotion(): DogMotion {
  return {
    gaitPhase: 0, effort: 0, sprint: 0, bob: 0, lean: 0, roll: 0,
    speed: 0, accel: 0, headingX: 0, headingZ: 1, seated: false,
    idleSeconds: 0, sit: 0, headTilt: 0, barkAge: -1, bark: 0,
    clock: 0, locomotionSpeed: 0,
  };
}
export function resetDogMotion(motion: DogMotion): void {
  Object.assign(motion, createDogMotion());
}
const approach = (dt: number, tau: number) => dt > 0 ? 1 - Math.exp(-dt / tau) : 0;
export function advanceDogMotion(
  motion: DogMotion, delta: number, speed: number, headingX: number, headingZ: number,
  secondaryMotion = 1, paused = false, acceptedBark = false,
): number {
  if (paused) return 0;
  const dt = Math.max(0, Math.min(delta, 0.1));
  if (!motion.seated) {
    motion.seated = true;
    motion.speed = speed;
    motion.headingX = headingX;
    motion.headingZ = headingZ;
  }
  motion.clock += dt;
  motion.effort += (Math.min(speed / DOG_MAX_SPEED, 1) - motion.effort) * approach(dt, 0.1);
  const sprint = Math.max(0, Math.min(1, (speed - DOG_MAX_SPEED) / (DOG_SPRINT_SPEED - DOG_MAX_SPEED)));
  motion.sprint += (sprint - motion.sprint) * approach(dt, 0.1);
  // Contact timing follows actual travel; smoothing this speed makes a newly
  // planted foot wait too long while the simulation has already accelerated.
  motion.locomotionSpeed = Math.max(0, Math.min(speed, DOG_SPRINT_SPEED));
  if (speed < 0.22) motion.idleSeconds += dt;
  else motion.idleSeconds = 0;
  const sitTarget = motion.idleSeconds >= DOG_IDLE_SIT_DELAY ? 1 : 0;
  motion.sit += (sitTarget - motion.sit) * approach(dt, sitTarget ? 0.72 : 0.075);
  const tiltTarget = sitTarget ? Math.sin((motion.idleSeconds - DOG_IDLE_SIT_DELAY) * 0.72) * 0.16 * secondaryMotion : 0;
  motion.headTilt += (tiltTarget - motion.headTilt) * approach(dt, 0.3);
  const rawAccel = dt > 0 ? (speed - motion.speed) / dt : 0;
  motion.accel += (rawAccel - motion.accel) * approach(dt, 0.1);
  motion.speed = speed;
  motion.gaitPhase = (motion.gaitPhase + dt * dogGaitRate(motion.locomotionSpeed) * DOG_GAIT_TAU) % (DOG_GAIT_TAU * 2);
  // Stride bounce belongs to locomotion. A nonzero idle floor produced a
  // persistent 2.8 Hz body tremor in the close Studio view.
  motion.bob = Math.sin(motion.gaitPhase * 2) * motion.effort * 0.026 * secondaryMotion;
  const accelNorm = Math.max(-1, Math.min(motion.accel / DOG_ACCELERATION, 1));
  const lean = (0.035 * motion.effort + 0.045 * accelNorm) * secondaryMotion;
  motion.lean += (lean - motion.lean) * approach(dt, 0.1);
  const previousX = motion.headingX;
  const previousZ = motion.headingZ;
  const step = smoothHeadingInto(scratch, 0, previousX, previousZ, headingX, headingZ,
    dt, DOG_HEADING_TAU, DOG_HEADING_STEP_LIMIT);
  motion.headingX = scratch[0]!;
  motion.headingZ = scratch[1]!;
  const turn = dt > 0 ? -(previousX * motion.headingZ - previousZ * motion.headingX) / dt : 0;
  const roll = Math.max(-0.12, Math.min(turn * 0.02 * motion.effort * secondaryMotion, 0.12));
  motion.roll += (roll - motion.roll) * approach(dt, 0.12);
  if (acceptedBark) motion.barkAge = 0;
  else if (motion.barkAge >= 0) motion.barkAge += dt;
  if (motion.barkAge >= 0.34) motion.barkAge = -1;
  motion.bark = motion.barkAge < 0 ? 0 : Math.sin(Math.PI * motion.barkAge / 0.34) * secondaryMotion;
  return step;
}
