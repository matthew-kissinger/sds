// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Presentation-only animation state. No writes to simulation vectors or clocks. */
import { DOG_MAX_SPEED, DOG_SPRINT_SPEED } from '@sim/tuning';
import { smoothHeadingInto } from '../flock/headingSmoothing';
import {
  dogGaitRate, dogStanceShare, dogStride, dogFootOffset, dogPawPose,
  DOG_GAIT_TAU, type DogPawPose,
} from './dogGait';
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
/**
 * How fast a foot may be moved to a new place in the gait order, in cycles per
 * second, and only while that foot is off the ground.
 *
 * `dogFootOffset` separates the diagonal trot into a gallop as `sprint` opens,
 * which drags foot 3's offset from 0 to 0.6 and foot 1's from 0.5 to 0.1. Done
 * per frame from the instantaneous speed, that moved a foot's whole cycle under
 * it: surging from 8 to 20 m/s shifts foot 3 by 0.22 of a cycle in 0.3 s, which
 * at that speed is about one and a half whole contacts, and a foot standing on
 * the ground was dragged along its own stance ramp by it. The hind chain reached
 * 0.9997 of its bone doing this - the one case the `dogRig` sweep bound could
 * not catch, because the body had not travelled any further than it should.
 *
 * So the order is re-timed in the AIR, where a foot is only deciding where to
 * land and nothing is standing on it. 0.5 cycles per second crosses the whole
 * 0.6 of the gallop separation in 1.2 s of sustained sprint, which is slower
 * than the gait itself and so reads as the dog settling into the gait rather
 * than as a foot jumping its place in the order.
 */
export const DOG_RETIME_RATE = 0.5;
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
  /**
   * Each foot's place in its OWN cycle, [0, 1), with 0 at touchdown.
   *
   * Derived from `gaitPhase` and `footOffset` rather than integrated per foot,
   * so four feet can never drift apart from the body clock they bob with.
   */
  footCycle: Float32Array;
  /** Each foot's place in the gait order. See `DOG_RETIME_RATE`. */
  footOffset: Float32Array;
  /**
   * The share of a cycle THIS contact was given, fixed when the foot touched
   * down and held until it does so again.
   *
   * A stance is a distance - exactly `2 * dogStride`, which is why stance slip
   * measures zero at every steady speed - and `dogStanceShare` is what turns
   * that distance into a share of the cycle AT A GIVEN SPEED. Read it from the
   * instantaneous speed instead and the gate deciding when a planted foot lifts
   * moves while the foot is standing on the ground. Braking from DOG_MAX_SPEED
   * raises the share from 0.16 to 0.62, so a foot one frame from lifting was
   * suddenly a third of a cycle from it and held while the body kept going: the
   * hind chain was pulled to 1.0000 of its bone with the paw 145.6 mm off the
   * ground it was meant to be driving against. The same gate crossing the other
   * way makes a foot that was airborne read as planted mid-swing.
   *
   * Fixed at touchdown it is simply a property of the contact, and both go away.
   */
  footStance: Float32Array;
  /**
   * The half-stride this foot is working to: fixed while it carries weight, free
   * to follow the speed while it is in the air.
   *
   * Split from the share above because the two are not the same kind of thing.
   * The share is a timing gate and the whole contact is measured against it, so
   * it cannot move at all. The stride is the geometry, and it is flat at
   * DOG_MAX_PAW_REACH for every speed above 2.112 m/s - see `dogStride` - so
   * freezing it through a contact costs nothing anywhere the dog is running, and
   * below that it collapses with the speed. That collapse is the standstill: the
   * frame a dog stopped, every paw's commanded travel went to zero at once and
   * four feet caught anywhere in their cycles were moved to the standing stance
   * in that frame, 471.9 mm of paw and 249.7 mm of knee. A foot on the ground
   * holds the stride it planted with; a foot in the air is only choosing where
   * to land, so it may be re-aimed - but it ARRIVES at the new stride rather
   * than jumping to it, because the swing runs from -stride to +stride and so a
   * stride that changes is a paw that moves. Snapping to the live value on the
   * lift-off frame merely moved the teleport there: 188.6 mm, measured.
   */
  footStride: Float32Array;
}
export function createDogMotion(): DogMotion {
  return {
    gaitPhase: 0, effort: 0, sprint: 0, bob: 0, lean: 0, bank: 0, crouch: 0,
    leadPelvis: 0, leadChest: 0, leadHead: 0, tailSwing: 0, earLag: 0,
    speed: 0, accel: 0, headingX: 0, headingZ: 1, seated: false,
    idleSeconds: 0, sit: 0, headTilt: 0, barkAge: -1, bark: 0,
    clock: 0, locomotionSpeed: 0,
    footCycle: new Float32Array(4),
    footOffset: Float32Array.from([0, 1, 2, 3], (foot) => dogFootOffset(foot, 0)),
    // A standing contact, so that a pose taken before the first advance divides
    // by a real share rather than by zero.
    footStance: new Float32Array(4).fill(dogStanceShare(0)),
    footStride: new Float32Array(4),
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
  const sprint = Math.max(0, Math.min(1, (speed - DOG_MAX_SPEED) / (DOG_SPRINT_SPEED - DOG_MAX_SPEED)));
  // Contact timing follows actual travel; smoothing this speed makes a newly
  // planted foot wait too long while the simulation has already accelerated.
  // What must NOT follow it per frame is the contact a foot already standing on
  // the ground committed to - see `footStance` and `advanceDogFeet`.
  motion.locomotionSpeed = Math.max(0, Math.min(speed, DOG_SPRINT_SPEED));
  if (!motion.seated) {
    motion.seated = true;
    motion.speed = speed;
    motion.headingX = headingX;
    motion.headingZ = headingZ;
    // The dog arrives with every foot already committed to the step it is
    // taking, rather than to a standing one it would have to grow out of.
    for (let foot = 0; foot < 4; foot++) motion.footOffset[foot] = dogFootOffset(foot, sprint);
    motion.footStance.fill(dogStanceShare(motion.locomotionSpeed));
    motion.footStride.fill(dogStride(motion.locomotionSpeed));
  }
  motion.clock += dt;
  motion.effort += (Math.min(speed / DOG_MAX_SPEED, 1) - motion.effort) * approach(dt, 0.1);
  motion.sprint += (sprint - motion.sprint) * approach(dt, 0.1);
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
  advanceDogFeet(motion, dt, sprint);
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

/**
 * Carry the four feet through one frame of the body clock.
 *
 * Everything a foot's pose is drawn from is settled here, and the one rule it
 * all comes from is that A FOOT ON THE GROUND IS NOT NEGOTIABLE. It is
 * world-locked and carrying weight, so the contact it committed to at touchdown
 * is what it gets: its share of the cycle, and the stride it is sweeping. A foot
 * in the air is only choosing where to land, so it may be re-aimed and re-timed
 * freely, and that is where every change the speed asks for is taken.
 */
function advanceDogFeet(motion: DogMotion, dt: number, sprint: number): void {
  const reference = motion.gaitPhase / DOG_GAIT_TAU;
  const stance = dogStanceShare(motion.locomotionSpeed);
  const stride = dogStride(motion.locomotionSpeed);
  for (let foot = 0; foot < 4; foot++) {
    const previous = motion.footCycle[foot]!;
    let cycle = (reference + motion.footOffset[foot]!) % 1;
    if (cycle < 0) cycle += 1;
    // Touchdown, which is where the contact commits its share of the cycle. A
    // real wrap is a backward jump of most of a cycle; the largest a re-timing
    // step can be is DOG_RETIME_RATE * dt, so half a cycle tells the two apart
    // at any frame rate the game runs at.
    //
    // The STRIDE is not taken from the speed here. It is already whatever the
    // foot was reaching for on the frame it landed, and that is the honest
    // value: a contact's stride is the step the foot committed to in the air,
    // and taking the live one instead would put a step in the pose at touchdown
    // exactly the size of whatever the swing had not yet closed.
    if (cycle < previous - 0.5) motion.footStance[foot] = stance;
    motion.footCycle[foot] = cycle;
    const share = motion.footStance[foot]!;
    if (cycle < share) continue;
    // In the air. Close what is left of the gap to the step the dog is taking
    // now over what is left of the swing, so the foot leaves the ground working
    // to the stride its contact ended on and lands working to the new one. Over
    // a swing at a constant speed that is exactly a linear blend in `recovery`,
    // and it arrives precisely at touchdown.
    //
    // Deliberately NOT rate-limited. A budget on it looks prudent - `dogStride`
    // is flat at DOG_MAX_PAW_REACH down to 2.112 m/s and then collapses, so on a
    // brake at the movement layer's ceiling the whole 0.4 m falls due inside the
    // last three frames of a swing, which is 54 mm of paw a frame. Capped at
    // a third of what a swing costs anyway, the foot instead LANDED still owing
    // 318 mm of it, and then stood 302 mm in front of its own contact with the
    // limb against the solver's clamp for a quarter of a second. Measured, the
    // cap made the brake worse, not better: 1.0000 of the chain against 0.9901.
    // Paying it in the air, where nothing is standing on the foot, is the whole
    // point of doing it in the air.
    const recovery = (cycle - share) / (1 - share);
    const before = Math.max(0, (previous - share) / (1 - share));
    const closed = Math.max(0, Math.min(1, (recovery - before) / Math.max(1 - before, 1e-6)));
    motion.footStride[foot] = motion.footStride[foot]!
      + (stride - motion.footStride[foot]!) * closed;
    let error = dogFootOffset(foot, sprint) - motion.footOffset[foot]!;
    // The short way round: the order is a cycle, so 0.9 behind is 0.1 ahead.
    error -= Math.round(error);
    // Never backward past its own touchdown. A re-timing step that pushed the
    // cycle back under the stance share would put the foot on the ground
    // without a contact having been committed for it.
    const room = cycle - share;
    const step = Math.min(Math.abs(error), DOG_RETIME_RATE * dt) * Math.sign(error);
    motion.footOffset[foot] = motion.footOffset[foot]! + Math.max(step, -room);
  }
}

/** Where one paw is, from the contact that foot committed to. */
export function dogFootPose(motion: DogMotion, foot: number, out: DogPawPose): void {
  dogPawPose(motion.footCycle[foot]!, motion.footStance[foot]!, motion.footStride[foot]!, out);
}
