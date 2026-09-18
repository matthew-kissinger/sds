// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The dog's weight, applied to the intent before the sim ever sees it.
 *
 * The sim's dog has no inertia of its own: a held key reverses its velocity
 * direction in one tick, and a camera that follows that signal is following
 * something with an unbounded derivative. Rate-limiting the INTENT fixes that
 * without touching `sim/`, so every committed trace fixture stays byte-identical
 * for a given input sequence. Smoothing the rendered transform instead would buy
 * the same picture and pay for it in onset latency, which is the one thing a
 * control cannot spend.
 *
 * WHAT IS LIMITED, AND WHY EACH ONE
 * ---------------------------------
 * Two pieces of state: a commanded speed in m/s and a commanded unit direction.
 *
 * 1. The direction turns at constant lateral acceleration, `A_LAT / v`, floored
 *    and capped. Slow is nimble, a flat 270 deg/s below 13.79 m/s and a 2.93 m
 *    circle; fast is committed, 248 deg/s at a full run and 149 deg/s at a
 *    sprint. `A_LAT` is set by the radius rather than by the rate, because the
 *    radius is what herding is played against: `v^2 / A_LAT` is 3.46 m at a run
 *    and 9.62 m at a sprint, against a `SHEEP_FLEE_RADIUS` of 8 m and a
 *    `SHEEP_PERCEPTION_RADIUS` of 5. At the 28 m/s^2 this started at, the run
 *    circle was 8.0 m - the pressure zone exactly - so no correction near a
 *    sheep could be made without leaving the zone being used to make it, and
 *    every adjustment became an arc out and back. A run now turns inside the
 *    perception radius and a sprint does not, which keeps the sprint an honest
 *    travel gear rather than a way to corner inside the flock.
 *    This is the property the camera work depends on: the tracked
 *    signal can no longer rotate 180 degrees in one tick, so a rate cap on the
 *    camera is a cap rather than a debt it repays later as a snap.
 * 2. Turn authority scales the commanded effort by the angle between the
 *    request and the dog's existing momentum. A 90-degree corner costs half
 *    effort, so the dog sheds speed into it; a reversal costs all of it, so the
 *    dog brakes, the turn cap widens as it slows, and it powers out on an arc.
 *    Continuous in the angle on purpose: this replaces a skid state machine,
 *    which would have a threshold to chatter against and a latched state to get
 *    stuck in, and braking, skidding and powering out all fall out of the one
 *    rule instead.
 * 3. The speed ramps at `ACCEL_UP` and `ACCEL_DOWN` from a launch speed on a
 *    standing start. Because the ramp is in m/s^2 rather than a time constant,
 *    walking speeds arrive in one to two frames and only the top end gains
 *    weight. Onset survives in the way that matters: the dog still moves on the
 *    first tick after the press.
 *
 * WHAT THE SIM ACTUALLY READS
 * ---------------------------
 * `PlayerInputs.direction` carries the effort as its length, and the sim turns
 * that back into a speed against its own ceiling. So the last step here divides
 * the commanded speed by the ceiling THIS tick is asking for, not by the one
 * the sim happened to use last tick: ask for a sprint and the divisor is the
 * sprint speed on the same frame, or the first frames of every sprint would be
 * quietly scaled down. A release is the same rule read backwards - while the
 * command is still above the walk ceiling the divisor stays at the sprint
 * speed, and `sprintCarry` is what asks the caller to hold the sim's ceiling
 * there to match.
 *
 * MODULE-SCOPE STATE, DELIBERATELY
 * --------------------------------
 * This is per-frame data that must never reach React, so it lives here rather
 * than in the store, under the same sanctioned exception `intent.ts` documents.
 * Two plain objects, one owner (the resolver), cleared by `resetConditioning`.
 * Nothing on `window`, no events, no subscribers.
 *
 * The file imports values from `@sim/tuning` and runs no sim code, and pulls in
 * no THREE, no React and no DOM, so it is unit-testable in node.
 */

import {
  DOG_MAX_SPEED,
  DOG_SPRINT_SPEED,
  MIN_STAMINA_TO_SPRINT,
  STAMINA_DRAIN_RATE,
} from '@sim/tuning';
import type { WorldMove } from './axis';

/**
 * Lateral acceleration the turn is allowed to spend, m/s^2. 65 is the most that
 * can be spent while `A_LAT / v` still governs at a full run: the ceiling below
 * takes over at 70.7, and past that the law at running speed would be a flat
 * rate rather than a radius.
 */
export const A_LAT = 65;
/** Ceiling on the direction rate, deg/s. Below 13.79 m/s the dog pivots at it. */
export const TURN_RATE_MAX = 270;
/** Floor on the direction rate, deg/s, so speed can never make it unsteerable. */
export const TURN_RATE_MIN = 40;
/** Commanded speed ramp up, m/s^2. Launch to a full run takes 0.34 s. */
export const ACCEL_UP = 34;
/** Commanded speed ramp down, m/s^2. See SPRINT_EASE_TOP for the second job. */
export const ACCEL_DOWN = 45;
/** Speed the ramp starts at on a standing start, m/s, so frame one moves. */
export const LAUNCH_SPEED = 3.5;
/** Up to this angle off the dog's momentum, effort is untouched, degrees. */
export const AUTHORITY_FULL_DEG = 45;
/** At and beyond this angle the command carries no effort at all, degrees. */
export const AUTHORITY_ZERO_DEG = 135;
/** Below this speed, m/s, there is no momentum worth respecting. */
export const AUTHORITY_FREE_SPEED = 3.0;
/** Below this commanded speed, m/s, the direction snaps instead of turning. */
export const DIRECTION_SNAP_SPEED = 0.5;
/** Frame delta ceiling, s. A stalled tab must not arrive as one enormous step. */
export const MAX_INPUT_DT = 0.1;
/** Axis angle change that re-samples the latched camera basis, degrees. */
export const BASIS_RESAMPLE_DEG = 44;
/**
 * Time constant the basis tracks the camera on, s.
 *
 * Small enough that a held turn curves with the camera rather than behind it -
 * at 0.2 s the basis is within a degree of a bearing turning at the 25 deg/s
 * ceiling - and large enough that the residue left by a held mode blend is
 * leaned out over a few frames instead of stepping. It bounds nothing: the
 * ceiling on how fast a held direction can curve is the Follow turning rate,
 * because that is the only thing moving the bearing this is chasing.
 */
export const BASIS_TRACK_TAU = 0.2;
/** Effort above which the device counts as pressed rather than neutral. */
export const INPUT_ENTER = 0.02;

/**
 * The stamina window the commanded sprint ceiling eases across: it leaves full
 * sprint at `SPRINT_EASE_TOP` and arrives at the walk ceiling exactly as
 * `SPRINT_EASE_FLOOR`, the sim's own sprint floor, cuts the sprint off.
 *
 * Both are derived rather than typed in, because both are consequences of
 * numbers that live in `@sim/tuning`. The sim clamps the dog's velocity to the
 * walk ceiling on the tick a sprint stops, a 10 m/s step in one tick, about
 * 600 m/s^2. Spending `ACCEL_DOWN` on that gap instead takes 0.22 s, and 0.22 s
 * of sprint costs `STAMINA_DRAIN_RATE` times that much stamina, which is the
 * width of the window. Change a drain rate or either speed and it follows.
 */
export const SPRINT_EASE_FLOOR = MIN_STAMINA_TO_SPRINT;
export const SPRINT_EASE_TOP =
  MIN_STAMINA_TO_SPRINT +
  STAMINA_DRAIN_RATE * ((DOG_SPRINT_SPEED - DOG_MAX_SPEED) / ACCEL_DOWN);

const DEG_TO_RAD = Math.PI / 180;
const TURN_RATE_MAX_RAD = TURN_RATE_MAX * DEG_TO_RAD;
const TURN_RATE_MIN_RAD = TURN_RATE_MIN * DEG_TO_RAD;
const AUTHORITY_FULL_RAD = AUTHORITY_FULL_DEG * DEG_TO_RAD;
const AUTHORITY_SPAN_RAD = (AUTHORITY_ZERO_DEG - AUTHORITY_FULL_DEG) * DEG_TO_RAD;
const BASIS_RESAMPLE_RAD = BASIS_RESAMPLE_DEG * DEG_TO_RAD;
/** Below this the supplied camera forward is degenerate and not worth latching. */
const MIN_FORWARD_LENGTH = 1e-4;

/** What the resolver knows this frame. Fill one scratch object and reuse it. */
export interface MoveRequest {
  /** Requested world direction, unit length. Zero when the device is neutral. */
  dirX: number;
  dirZ: number;
  /** Device effort in [0, 1], already dead-zoned, saturated and curved. */
  effort: number;
  /** The PHYSICAL device sprint. Not a stamina decision. */
  sprintDevice: boolean;
  /**
   * Whether the sim would grant a sprint to a dog that asked for one on this
   * tick: moving, not exhausted, and with stamina still above the floor after
   * this tick's drain. A FACT about the dog rather than a decision about the
   * input. The decisions are made here instead - a held sprint is this and
   * `sprintDevice`, a trailing one is this and a command still above the walk
   * ceiling - so that the ceiling and the effort measured against it cannot
   * disagree.
   *
   * The sim cuts a sprint on the tick whose stamina is below the floor AFTER
   * that tick's drain, so a caller reading stamina before the tick has to look
   * one drain ahead to agree with it. Measured over a sprint held to
   * exhaustion: agreeing costs 67 m/s^2 at the cut, against 600 today and
   * 285 if the caller is one tick behind.
   */
  sprintAvailable: boolean;
  /** The dog's stamina now, in sim units. */
  stamina: number;
  /** The dog's velocity now, m/s, world axes. This is its real momentum. */
  velocityX: number;
  velocityZ: number;
  /** Seconds since the previous call. Clamped to `MAX_INPUT_DT`. */
  dt: number;
}

/**
 * One conditioned frame. Valid until the next call; do not hold the object.
 *
 * Nothing on it reaches `intent.setSprint`. The exhaustion latch has to stay
 * driven by the physical control, so the resolver hands the device sprint to
 * the latch directly, before it calls in here; a field carrying it back out
 * would only be one more value that could be mistaken for the device's.
 */
export interface ConditionedMove {
  /** Direction times effort: the vector `setMoveDirection` wants. */
  x: number;
  z: number;
  /** Length of (x, z). Exactly 0 when the dog should be decelerating. */
  effort: number;
  /** Commanded speed, m/s. What the effort above was built from. */
  speed: number;
  /**
   * Whether `intent.sprint` has to stay true this tick although the device is
   * no longer asking for a sprint. Goes to `intent.setSprintCarry` and never to
   * `setSprint`: it trails the device on purpose, so feeding it to the
   * exhaustion latch would clear the latch on a release edge that has not
   * happened yet and hand a re-pressing player a free burst.
   */
  sprintCarry: boolean;
}

const state = {
  speed: 0,
  dirX: 0,
  dirZ: 0,
  hasDirection: false,
  engaged: false,
};

const basis = {
  latched: false,
  forwardX: 0,
  forwardZ: 0,
  axisRight: 0,
  axisForward: 0,
};

const result: ConditionedMove = {
  x: 0,
  z: 0,
  effort: 0,
  speed: 0,
  sprintCarry: false,
};

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** The commanded sprint ceiling, m/s, eased as the stamina floor approaches. */
function easedCeiling(stamina: number): number {
  const remaining = clamp01((stamina - SPRINT_EASE_FLOOR) / (SPRINT_EASE_TOP - SPRINT_EASE_FLOOR));
  return DOG_MAX_SPEED + (DOG_SPRINT_SPEED - DOG_MAX_SPEED) * remaining;
}

/**
 * How much of the commanded effort survives the angle to the dog's momentum.
 *
 * Continuous in the angle, which is the part that matters: there is no corner
 * sharp enough to make the dog snap between gripping and sliding. Below
 * `AUTHORITY_FREE_SPEED` it is restored outright, because a nearly stationary
 * dog has no momentum to argue with and close work must stay light. That
 * restore is a step in the TARGET only; the ramp below turns it into at most
 * `ACCEL_UP` of commanded speed, so nothing the player sees steps.
 */
function turnAuthority(dirX: number, dirZ: number, vx: number, vz: number): number {
  const momentum = Math.sqrt(vx * vx + vz * vz);
  if (momentum < AUTHORITY_FREE_SPEED) return 1;
  const dot = Math.min(1, Math.max(-1, (dirX * vx + dirZ * vz) / momentum));
  const wide = clamp01((Math.acos(dot) - AUTHORITY_FULL_RAD) / AUTHORITY_SPAN_RAD);
  return 1 - wide;
}

/** Rotate the commanded direction toward the request by at most `maxStep` rad. */
function turnToward(requestX: number, requestZ: number, maxStep: number): void {
  const dot = Math.min(1, Math.max(-1, state.dirX * requestX + state.dirZ * requestZ));
  if (Math.acos(dot) <= maxStep) {
    state.dirX = requestX;
    state.dirZ = requestZ;
    return;
  }
  // A positive cross product is the shorter way round in the x-z plane. An
  // exact reversal has no shorter way, so it turns positive: the tie has to
  // break somewhere, and breaking it the same way every time keeps a reversal
  // reproducible instead of dependent on float dust in the last bit.
  const cross = state.dirX * requestZ - state.dirZ * requestX;
  const sin = cross >= 0 ? Math.sin(maxStep) : -Math.sin(maxStep);
  const cos = Math.cos(maxStep);
  const x = state.dirX * cos - state.dirZ * sin;
  const z = state.dirX * sin + state.dirZ * cos;
  const length = Math.sqrt(x * x + z * z);
  state.dirX = x / length;
  state.dirZ = z / length;
}

/**
 * Condition one frame of input. Returns the shared result object; allocates
 * nothing.
 *
 * Order matters and is the order the rules compose in: the sprint ceiling sets
 * how much speed is on offer, turn authority decides how much of it this
 * heading may claim, the ramp moves the commanded speed toward that, the turn
 * limit moves the commanded direction, and the last step converts the pair back
 * into the dimensionless effort the sim reads.
 */
export function conditionMove(request: Readonly<MoveRequest>): Readonly<ConditionedMove> {
  const dt = Math.min(Math.max(request.dt, 0), MAX_INPUT_DT);

  const sprintGranted = request.sprintDevice && request.sprintAvailable;
  const ceiling = sprintGranted ? easedCeiling(request.stamina) : DOG_MAX_SPEED;

  let dirX = request.dirX;
  let dirZ = request.dirZ;
  const length = Math.sqrt(dirX * dirX + dirZ * dirZ);
  const engaged = request.effort > INPUT_ENTER && length > 0;
  let target = 0;
  if (engaged) {
    dirX /= length;
    dirZ /= length;
    const authority = turnAuthority(dirX, dirZ, request.velocityX, request.velocityZ);
    target = ceiling * clamp01(request.effort) * authority;

    // Entering from neutral, the ramp starts at whatever momentum the dog
    // already carries along the new heading, and only falls back to the launch
    // speed when there is none. Restarting at the launch speed after a coast
    // would command a hard brake the player never asked for.
    if (!state.engaged) {
      const projected = request.velocityX * dirX + request.velocityZ * dirZ;
      state.speed = Math.max(state.speed, projected, Math.min(LAUNCH_SPEED, target));
    }
  }

  // The ramp must ARRIVE, not asymptote: zero is the only intent that puts the
  // sim on its deceleration branch, so a ramp that only approaches zero would
  // leave the dog creeping forever after a release.
  const step = (target > state.speed ? ACCEL_UP : ACCEL_DOWN) * dt;
  const gap = target - state.speed;
  if (Math.abs(gap) <= step) state.speed = target;
  else state.speed += gap > 0 ? step : -step;

  if (engaged) {
    // The turn budget is spent against the speed the DOG carries, not against
    // the speed just commanded. The rule is a lateral acceleration, and it is
    // the moving dog that has to survive it; during a hard corner the command
    // has already braked while the dog is still travelling, and pricing the
    // turn off the lower number would sell an arc the animal cannot make.
    // Measured, this is also the reading that reproduces the plan: 3.6 m/s
    // through a sprint reversal and 9.8 m/s through a 90-degree corner at a
    // full run.
    const carried = Math.sqrt(
      request.velocityX * request.velocityX + request.velocityZ * request.velocityZ,
    );
    if (!state.hasDirection || carried <= DIRECTION_SNAP_SPEED) {
      // Nothing is moving yet, so there is no arc to respect, and a rate limit
      // here would only read as a sticky control on the first frames of a press.
      state.dirX = dirX;
      state.dirZ = dirZ;
      state.hasDirection = true;
    } else {
      const turnRate = Math.min(
        TURN_RATE_MAX_RAD,
        Math.max(TURN_RATE_MIN_RAD, A_LAT / carried),
      );
      turnToward(dirX, dirZ, turnRate * dt);
    }
  }
  state.engaged = engaged;

  // Decided here, after the ramp, because it is this tick's commanded speed
  // that says whether the sim's ceiling still has to be up. `sim/` clamps the
  // dog's velocity to whichever ceiling this tick's sprint selects, so ending a
  // sprint while the command is above the walk ceiling is a 10 m/s step in one
  // tick, about 600 m/s^2; holding the sim's ceiling for the 0.22 s the ramp
  // needs spends ACCEL_DOWN on that gap instead, 45 m/s^2 measured. It costs
  // that 0.22 s of drain, 6.5 stamina, plus the 4.3 the dog would have
  // regenerated over the same 13 ticks: 10.8 units off the bar, a third of a
  // second of sprint. The drain half of that is the reserve SPRINT_EASE_TOP
  // holds back, so a carry begun at the eased ceiling reaches the walk ceiling
  // on the tick stamina reaches the sim's floor and is never cut off part way
  // down.
  //
  // `sprintAvailable` gates it because a carry the sim will not honour is worse
  // than none: the sim would hold its ceiling at the walk speed while the
  // effort below was divided by the sprint speed, and the dog would be asked
  // for 0.6 of a walk. That is the exhaustion cut, where the ceiling drops for
  // a reason the carry cannot argue with.
  const sprintCarry =
    !sprintGranted && request.sprintAvailable && state.speed > DOG_MAX_SPEED;
  // The divisor is the ceiling THIS tick asks for rather than the one the sim
  // used last tick: through a carry the sim's ceiling is still the sprint speed
  // while the device sprint is already gone, and dividing by the walk ceiling
  // there would saturate the effort at 1 and ask for 15 m/s for the whole ramp
  // down, which is the step the carry exists to remove.
  const simTopSpeed = sprintGranted || sprintCarry ? DOG_SPRINT_SPEED : DOG_MAX_SPEED;

  const effort = state.speed <= 0 ? 0 : Math.min(1, state.speed / simTopSpeed);
  result.x = state.dirX * effort;
  result.z = state.dirZ * effort;
  result.effort = effort;
  result.speed = state.speed;
  result.sprintCarry = sprintCarry;
  return result;
}

/**
 * The camera basis the device axis is projected through: sampled on entry from
 * neutral, then TRACKING the camera, and held still only while a camera-mode
 * blend is in flight.
 *
 * Camera-relative input under a camera that follows the dog is a feedback loop:
 * pressing a direction turns the dog, which turns the camera, which redefines
 * the direction that was pressed, which turns the dog again. This basis used to
 * cut that loop outright by freezing the sample for the whole hold, which took
 * a held key from a widening spiral to a straight line and 3,828 degrees of
 * camera yaw over a run down to 542.
 *
 * THAT WAS ONE BRAKE TOO MANY, and the owner found it the first time the rig
 * was played: hold a turn and the dog rounds the corner and then runs straight,
 * because "left" keeps meaning the compass direction left meant when it was
 * pressed. Steering a follow camera that way is not what a hand expects.
 *
 * The freeze was right when the camera could whip around, and the measurement
 * above was taken against exactly that camera. It is not that camera any more.
 * The Follow bearing now turns at the profile's own ceiling behind a dead zone,
 * 25 deg/s at the default, so the loop it closes has a bounded gain: hold a
 * direction and dog and camera settle into a common turn at that ceiling, a
 * 34 m arc at a full run, every degree of it asked for by the player and none
 * of it faster than the number chosen for comfort. Cutting the loop a second
 * time here buys nothing the ceiling has not already bought, and it costs the
 * steering. ONE number governs how fast a held direction curves, and it is the
 * Follow turning setting: at the `off` end stop the camera does not turn, so
 * the basis does not either and a held key is world-locked exactly as before.
 *
 * WHAT THE HOLD IS STILL FOR is the mode blend, which is the one motion of the
 * basis that is not the player's. A swap sweeps it between Classic's constant
 * world forward and the Follow compass, up to half a turn in 0.8 s, and that
 * belongs to the camera rather than to the hand: tracking it would swing a held
 * dog through the whole arc. So the sample is held for the length of the blend
 * and the residue is eased out afterwards, rather than stepping.
 *
 * 44 degrees rather than 45 or 60: 45 is exactly the cardinal-to-diagonal step
 * on a keyboard, so a threshold just under it guarantees that adding or
 * releasing the second key of a diagonal always re-samples. Anything below 30
 * re-latches on stick noise.
 *
 * The camera forward arrives as two numbers. This module knows nothing about
 * cameras and must not learn.
 */
export function latchBasis(
  dt: number,
  blending: boolean,
  axisRight: number,
  axisForward: number,
  forwardX: number,
  forwardZ: number,
  out: WorldMove,
): WorldMove {
  const magnitude = Math.sqrt(axisRight * axisRight + axisForward * axisForward);
  if (magnitude <= INPUT_ENTER) {
    // Neutral. Track the live camera so the next press samples where the player
    // is actually looking, not where they were looking when they let go.
    basis.latched = false;
    out.x = forwardX;
    out.z = forwardZ;
    return out;
  }

  const right = axisRight / magnitude;
  const forward = axisForward / magnitude;
  const usable = Math.sqrt(forwardX * forwardX + forwardZ * forwardZ) >= MIN_FORWARD_LENGTH;
  let resample = !basis.latched;
  if (!resample) {
    const dot = Math.min(1, Math.max(-1, right * basis.axisRight + forward * basis.axisForward));
    resample = Math.acos(dot) >= BASIS_RESAMPLE_RAD;
  }

  // A degenerate forward (the camera aimed straight down) is not worth latching:
  // sampling it would freeze the fallback basis in for the whole hold, which is
  // a framing change rather than the safety net `worldFromAxis` means it to be.
  if (resample && usable) {
    basis.forwardX = forwardX;
    basis.forwardZ = forwardZ;
    basis.axisRight = right;
    basis.axisForward = forward;
    basis.latched = true;
  } else if (basis.latched && usable && !blending && dt > 0) {
    // Track the camera. Shortest arc on the ANGLE and not a lerp of the two
    // vectors, because a vector lerp between opposed bearings passes through
    // zero length - the same degeneracy the camera rig has in its own blends,
    // and the same answer.
    //
    // The ease is what absorbs the mode blend's residue: the sample is held for
    // the blend's length, so the frame it ends on has a gap to close, and
    // closing it over a time constant rather than in one frame is the
    // difference between the dog leaning back onto the new framing and
    // snapping onto it.
    const current = Math.atan2(basis.forwardX, basis.forwardZ);
    const live = Math.atan2(forwardX, forwardZ);
    let delta = live - current;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    else if (delta < -Math.PI) delta += 2 * Math.PI;
    const step = Math.min(dt, MAX_INPUT_DT);
    const next = current + delta * (1 - Math.exp(-step / BASIS_TRACK_TAU));
    basis.forwardX = Math.sin(next);
    basis.forwardZ = Math.cos(next);
  }

  out.x = basis.latched ? basis.forwardX : forwardX;
  out.z = basis.latched ? basis.forwardZ : forwardZ;
  return out;
}

/**
 * Drop the latched basis so the next input samples afresh. For the discrete
 * store events that change what the camera means: a camera-mode change and the
 * start of a run.
 */
export function invalidateBasis(): void {
  basis.latched = false;
}

/** Forget every commanded value. A new run starts from a standing dog. */
export function resetConditioning(): void {
  state.speed = 0;
  state.dirX = 0;
  state.dirZ = 0;
  state.hasDirection = false;
  state.engaged = false;
  basis.latched = false;
  basis.forwardX = 0;
  basis.forwardZ = 0;
  basis.axisRight = 0;
  basis.axisForward = 0;
  result.x = 0;
  result.z = 0;
  result.effort = 0;
  result.speed = 0;
  result.sprintCarry = false;
}
