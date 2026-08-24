// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Touch as a device. The overlay in `TouchControls.tsx` owns the pixels and the
 * pointer events; this owns the two numbers the resolver reads. Splitting them
 * keeps the thumb out of React entirely: a drag writes here at pointer rate and
 * moves two DOM transforms by ref, and nothing re-renders (spec/06 forbids
 * per-frame churn through React state).
 *
 * SPRINT IS STICK EDGE, and that is a deliberate choice. `sim/step.ts`
 * normalizes the move direction, so partial deflection is already full walking
 * speed: an analog magnitude has nowhere to go. Pushing the thumb past
 * `SPRINT_DEFLECTION` is therefore the second gear, the same "push harder to go
 * faster" a player already expects, and it costs no screen space next to the
 * bark button. A separate sprint button would be a third 44 px target competing
 * for the same thumb.
 */

import { clearAxis, type MoveAxis } from './axis';

/** Pixels from the touch-down point to full deflection. */
export const STICK_RADIUS = 56;
/** Deflection under this is thumb noise, not a direction. */
export const DEADZONE = 0.16;
/** Deflection at or past this is a sprint request. */
export const SPRINT_DEFLECTION = 0.92;

const axis: MoveAxis = { right: 0, forward: 0 };
let active = false;
let sprint = false;

/** True while a thumb is down on the stick half. */
export function touchActive(): boolean {
  return active;
}

export function touchAxis(): Readonly<MoveAxis> {
  return axis;
}

export function touchSprint(): boolean {
  return sprint;
}

/** The thumb went down. Direction is zero until it moves. */
export function beginTouchStick(): void {
  active = true;
  sprint = false;
  clearAxis(axis);
}

/**
 * The thumb moved. `right`/`forward` are already deflection-scaled to [-1, 1]
 * and deadzoned by the overlay, which is the only thing that knows pixels.
 */
export function setTouchStick(right: number, forward: number, sprinting: boolean): void {
  axis.right = right;
  axis.forward = forward;
  sprint = sprinting;
}

/** The thumb lifted, or the pointer was cancelled. */
export function endTouchStick(): void {
  active = false;
  sprint = false;
  clearAxis(axis);
}
