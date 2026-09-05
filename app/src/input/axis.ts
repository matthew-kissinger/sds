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
