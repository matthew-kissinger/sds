// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Presentation-only animation state. No writes to simulation vectors or clocks. */
import { DOG_MAX_SPEED, DOG_SPRINT_SPEED } from '@sim/tuning';
import { smoothHeadingInto } from '../flock/headingSmoothing';
import { dogGaitRate, DOG_GAIT_TAU } from './dogGait';
// The visual smoother sits on top of the simulation heading slew of 0.125 s, so
// a long constant here is a second lag stacked on a first. Keep it nearly
// transparent and let the yaw lead below carry the character of a turn.
export const DOG_HEADING_TAU = 0.045;
// The sustained turn rate the presentation may show, in radians per second.
// This is the 0.14 rad per frame the rig shipped with, read at the 60 Hz it was
// tuned on, so desktop behaviour is unchanged and a 120 Hz display no longer
// turns the dog, and the camera that tracks it, twice as fast.
export const DOG_HEADING_STEP_RATE = 8.4;
// The anti-snap guard, which stays per frame on purpose. See headingSmoothing.
export const DOG_HEADING_SNAP_CEILING = 0.14;
export const DOG_IDLE_SIT_DELAY = 5;
// Real dogs sustain 0.6 to 1.3 g and lean 30 to 55 degrees. The ceiling here is
// set by the rig rather than by biology: the two-bone solver has 0.857 m of
// fore-limb reach against a 0.851 m rest span, so past about 30 degrees the
// inside knee locks straight even with the root dropped.
export const DOG_MAX_BANK = 0.52;
// Measured mean body rotation error, 15.9 degrees: through a turn the trunk
// sits ahead of the direction of travel rather than along it.
export const DOG_YAW_LEAD = 0.278;
const GRAVITY = 9.81;
// The ramp the conditioned command actually produces: ACCEL_UP and ACCEL_DOWN
// in app/src/input/conditioning.ts, 34 m/s squared up and 45 down. Repeated
// rather than imported because the scene layer imports nothing from the input
// layer, and one presentation cue is not a reason to open that direction.
// DOG_ACCELERATION in @sim/tuning is 40, the ceiling the simulation applies,
// and normalising against one symmetric number clips this cue to full through
// most of the ramp, which erases the gradation the cue exists to show.
const LAUNCH_RAMP = 34;
const BRAKE_RAMP = 45;
// A standing pivot must not lean, and BANK_GATE_SPEED is what buys that: below
// it there is no lean at all. BANK_FULL_SPEED used to track the A_LAT crossover
// where a commanded turn stops being a flat pivot and becomes a constant
// radius, and deliberately no longer does. Raising A_LAT to 65 moved that
// crossover to 13.79 m/s, and gating full lean that high would suppress the cue
// through the whole middle of the range, where the dog is pivoting at the rate
// ceiling and so carrying MORE lateral acceleration than it does at a run -
// 47 m/s^2 at 10 m/s against 36 at 15. The honest term is the arctangent below,
// which already falls to zero as the speed does; this gate only has to clear
// the standing-pivot band, so it is a speed of its own now rather than a
// derived one.
const BANK_GATE_SPEED = 4;
const BANK_FULL_SPEED = 6;
// Per-bone response to a new turn: the head reaches the lead in 0.09 s and the
// pelvis in 0.26 s, so the difference between consecutive bones is the lateral
// spine bend and no second bend mechanism is needed.
const LEAD_TAU_HEAD = 0.09;
const LEAD_TAU_CHEST = 0.17;
const LEAD_TAU_PELVIS = 0.26;
const scratch = new Float32Array(2);
export interface DogMotion {
  gaitPhase: number;
  effort: number;
  sprint: number;
  bob: number;
  lean: number;
  bank: number;
  crouch: number;
  leadPelvis: number;
  leadChest: number;
  leadHead: number;
  tailSwing: number;
  earLag: number;
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
    gaitPhase: 0, effort: 0, sprint: 0, bob: 0, lean: 0, bank: 0, crouch: 0,
    leadPelvis: 0, leadChest: 0, leadHead: 0, tailSwing: 0, earLag: 0,
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
  // The two branches of the ramp are not the same size, so normalise each
  // against its own. Braking has to stay readable rather than pinned at -1.
  const accelNorm = motion.accel >= 0
    ? Math.min(motion.accel / LAUNCH_RAMP, 1)
    : Math.max(motion.accel / BRAKE_RAMP, -1);
  motion.crouch = Math.abs(accelNorm);
  const lean = (0.035 * motion.effort + 0.045 * accelNorm) * secondaryMotion;
  motion.lean += (lean - motion.lean) * approach(dt, 0.1);
  const previousX = motion.headingX;
  const previousZ = motion.headingZ;
  const step = smoothHeadingInto(scratch, 0, previousX, previousZ, headingX, headingZ,
    dt, DOG_HEADING_TAU, DOG_HEADING_SNAP_CEILING, DOG_HEADING_STEP_RATE);
  motion.headingX = scratch[0]!;
  motion.headingZ = scratch[1]!;
  // Positive for a turn toward local +x, which is also where the lateral
  // acceleration points, so the dog leans and yaws into the turn on the same
  // sign. The rig negates for three.js, where a positive rotation.z tilts the
  // top of a bone toward -x.
  const turn = dt > 0 ? -(previousX * motion.headingZ - previousZ * motion.headingX) / dt : 0;
  const gate = Math.max(0, Math.min((speed - BANK_GATE_SPEED) / (BANK_FULL_SPEED - BANK_GATE_SPEED), 1));
  // Lean angle of a body carrying this lateral acceleration, which stays
  // correct if the movement layer is retuned, unlike a turn-rate multiplier.
  const bankTarget = Math.max(-DOG_MAX_BANK, Math.min(Math.atan(turn * speed / GRAVITY), DOG_MAX_BANK))
    * gate * secondaryMotion;
  motion.bank += (bankTarget - motion.bank) * approach(dt, 0.12);
  const leadTarget = DOG_YAW_LEAD * bankTarget / DOG_MAX_BANK;
  motion.leadHead += (leadTarget - motion.leadHead) * approach(dt, LEAD_TAU_HEAD);
  motion.leadChest += (leadTarget - motion.leadChest) * approach(dt, LEAD_TAU_CHEST);
  motion.leadPelvis += (leadTarget - motion.leadPelvis) * approach(dt, LEAD_TAU_PELVIS);
  // A tail hanging off the pelvis swings away from the lean, not with it.
  motion.tailSwing += (-motion.bank - motion.tailSwing) * approach(dt, 0.18);
  // Ears and jowls are one spring on the head: quick to throw, slow to settle.
  const earTau = Math.abs(motion.bank) > Math.abs(motion.earLag) ? 0.08 : 0.12;
  motion.earLag += (motion.bank - motion.earLag) * approach(dt, earTau);
  if (acceptedBark) motion.barkAge = 0;
  else if (motion.barkAge >= 0) motion.barkAge += dt;
  if (motion.barkAge >= 0.34) motion.barkAge = -1;
  motion.bark = motion.barkAge < 0 ? 0 : Math.sin(Math.PI * motion.barkAge / 0.34) * secondaryMotion;
  return step;
}
