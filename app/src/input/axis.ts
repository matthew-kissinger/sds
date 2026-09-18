// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Device space -> world space. Every device (keys, thumb, stick) produces the
 * same two numbers: how far right and how far forward the player is asking to
 * go, on the screen. This module is the one place that turns those two numbers
 * into the world-axis direction `sim` consumes.
 *
 * THE TWO FRAMINGS (spec/06)
 * --------------------------
 * Classic is top-down and its input stays WORLD-AXIS: the basis is the constant
 * `CLASSIC_FORWARD`, not the camera. Camera-relative movement from above
 * disorients, so only Follow gets the camera's yaw. Both go through the same
 * function; the difference is which forward vector is handed in, which is why
 * there is no mode branch in the mapping itself.
 *
 * The forward vector is a ground-plane direction (y dropped). The screen's right
 * is `cross(forward, up)` = `(-fz, 0, fx)`: with forward = +z the camera looks up
 * the field toward the gate and world +x lies to the LEFT of the screen, so
 * pressing right moves the dog toward -x. That inversion is correct framing, not
 * a sign bug, and `tests/input-axis.spec.ts` pins it.
 *
 * Magnitude is preserved below 1 and clamped at 1. The simulation consumes it
 * as movement effort: partial stick travel walks, full travel runs, and sprint
 * raises the speed ceiling. Digital diagonals never exceed full effort.
 *
 * SHAPING COMES FIRST, AND IT LIVES HERE
 * --------------------------------------
 * An analogue device passes its raw deflection through `shapeAxis` before the
 * mapping: radial dead zone with rescale, outer saturation, then one shared
 * response curve. It is in this file rather than in each device file because
 * two devices should not feel different because their dead-zone code was
 * written at different times (spec/06: one normalized intent shape). With the
 * shaper upstream, the clamp in `worldFromAxis` is a safety net rather than the
 * thing that decides effort.
 */

/** What a device asks for, in screen space. Both components in [-1, 1]. */
export interface MoveAxis {
  right: number;
  forward: number;
}

/** World-axis move direction, the shape `PlayerIntent.direction` wants. */
export interface WorldMove {
  x: number;
  z: number;
}

/** Classic's fixed basis: up the field, toward the gate at z = 100. */
export const CLASSIC_FORWARD_X = 0;
export const CLASSIC_FORWARD_Z = 1;

/** Below this the forward vector is degenerate (camera aimed straight down). */
const MIN_FORWARD_LENGTH = 1e-4;

/** Zero the axis in place. */
export function clearAxis(axis: MoveAxis): void {
  axis.right = 0;
  axis.forward = 0;
}

/** Length of the axis. Used for deadzones and for the stick-wins merge rule. */
export function axisMagnitude(axis: MoveAxis): number {
  return Math.sqrt(axis.right * axis.right + axis.forward * axis.forward);
}

/**
 * Project a device axis onto world axes through a ground-plane forward vector.
 * Writes into `out` and returns it; allocates nothing.
 */
export function worldFromAxis(
  axis: Readonly<MoveAxis>,
  forwardX: number,
  forwardZ: number,
  out: WorldMove,
): WorldMove {
  let fx = forwardX;
  let fz = forwardZ;
  const length = Math.sqrt(fx * fx + fz * fz);
  if (length < MIN_FORWARD_LENGTH) {
    fx = CLASSIC_FORWARD_X;
    fz = CLASSIC_FORWARD_Z;
  } else {
    fx /= length;
    fz /= length;
  }

  // right = cross(forward, up)
  let x = axis.forward * fx + axis.right * -fz;
  let z = axis.forward * fz + axis.right * fx;

  const magnitude = Math.sqrt(x * x + z * z);
  if (magnitude > 1) {
    x /= magnitude;
    z /= magnitude;
  }

  out.x = x;
  out.z = z;
  return out;
}

/** Unit direction plus the effort that came with it, split apart once. */
export interface MoveSplit {
  dirX: number;
  dirZ: number;
  /** Length of the world move, in [0, 1]. Exactly 0 when there is no input. */
  effort: number;
}

/**
 * Weight of the cubic term in the response curve. The rest is linear.
 *
 * 0.5 is not a taste setting. It is the mix that makes half travel command
 * 0.3125 effort, which puts the 30% walk band (spec/06 `WALK_EFFORT`) at the
 * midpoint of thumb or stick travel. A landmark the player can feel at the
 * centre of the throw is the whole reason to prefer this curve to a smoother
 * one.
 */
export const RESPONSE_CUBIC_MIX = 0.5;

/** A saturation that is not above the dead zone would divide by zero. */
const MIN_SHAPE_SPAN = 1e-4;

/**
 * The shared analogue response curve, over a normalized [0, 1] travel.
 *
 * ANALOGUE DEVICES ONLY. A key press is already a step command at effort 1 and
 * the speed ramp in `conditioning.ts` is its analogue; at the shipped mix this
 * curve returns 0.1635 for a 0.3 input, so putting a digital walk through it
 * would silently deliver that instead of the spec/06 `WALK_EFFORT` of 0.3 - a
 * contract quietly broken rather than a feel change. No digital device reaches
 * this curve: `keyboard.ts` sets its own effort directly and never calls
 * `shapeAxis`.
 */
export function responseCurve(travel: number): number {
  const t = travel < 0 ? 0 : travel > 1 ? 1 : travel;
  return (1 - RESPONSE_CUBIC_MIX) * t + RESPONSE_CUBIC_MIX * t * t * t;
}

/**
 * Shape a raw analogue axis in place and return the effort it now carries.
 *
 * Radial, never per-axis. An axial dead zone lets one component survive while
 * the other is zeroed, so the direction snaps to the compass points near the
 * centre, which reads as a machine rather than an animal.
 *
 * The dead zone RESCALES. Without the rescale, effort jumps from 0 to the dead
 * zone value at the threshold and the band below it is unreachable, so the slow
 * deliberate walk that makes herding calm cannot be held at all. Saturation
 * does the same job at the other end: a worn stick that cannot quite reach the
 * gate rim in the diagonals still gets full effort.
 *
 * The curve is not optional. Both callers are analogue - `gamepad.ts` and
 * `touch.ts` - and the one shared response is the point of the function: a
 * device that wanted the dead zone and the saturation without the curve would
 * be a device that feels different from its sibling for no reason the player
 * can see.
 */
export function shapeAxis(
  axis: MoveAxis,
  deadzone: number,
  saturation: number,
): number {
  const magnitude = axisMagnitude(axis);
  if (magnitude <= deadzone || magnitude === 0) {
    clearAxis(axis);
    return 0;
  }
  const span = Math.max(saturation - deadzone, MIN_SHAPE_SPAN);
  const travel = Math.min(1, (magnitude - deadzone) / span);
  const effort = responseCurve(travel);
  const scale = effort / magnitude;
  axis.right *= scale;
  axis.forward *= scale;
  return effort;
}

/**
 * Split a mapped world move into a unit direction and an effort.
 *
 * The conditioner rate-limits a direction and a speed as separate quantities,
 * so it needs them separate. Deriving them there would mean taking the length
 * of a vector whose length the resolver already knows, once per frame, and
 * would leave two places that decide what a zero-length move means.
 */
export function splitWorldMove(world: Readonly<WorldMove>, out: MoveSplit): MoveSplit {
  const magnitude = Math.sqrt(world.x * world.x + world.z * world.z);
  if (magnitude === 0) {
    out.dirX = 0;
    out.dirZ = 0;
    out.effort = 0;
    return out;
  }
  out.dirX = world.x / magnitude;
  out.dirZ = world.z / magnitude;
  out.effort = magnitude > 1 ? 1 : magnitude;
  return out;
}
