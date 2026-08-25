// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Touch as a device. The overlay in `TouchControls.tsx` owns the pixels and the
 * pointer events; this owns the two numbers the resolver reads. Splitting them
 * keeps the thumb out of React entirely: a drag writes here at pointer rate and
 * moves two DOM transforms by ref, and nothing re-renders (spec/06 forbids
 * per-frame churn through React state).
 *
 * Sprint has its own held state. Movement and sprint pointers are deliberately
 * independent so two thumbs can steer and sprint at the same time, and neither
 * control needs to route high-frequency input through React state.
 */

import { clearAxis, type MoveAxis } from './axis';

/** Pixels from the touch-down point to full deflection. */
export const STICK_RADIUS = 56;
/** Deflection under this is thumb noise, not a direction. */
export const DEADZONE = 0.16;
const axis: MoveAxis = { right: 0, forward: 0 };
let active = false;
let sprintHeld = false;

/** True while a thumb is down on the stick half. */
export function touchActive(): boolean {
  return active;
}

export function touchAxis(): Readonly<MoveAxis> {
  return axis;
}

export function touchSprint(): boolean {
  return sprintHeld;
}

/** The thumb went down. Direction is zero until it moves. */
export function beginTouchStick(): void {
  active = true;
  clearAxis(axis);
}

/**
 * The thumb moved. `right`/`forward` are already deflection-scaled to [-1, 1]
 * and deadzoned by the overlay, which is the only thing that knows pixels.
 */
export function setTouchStick(right: number, forward: number): void {
  axis.right = right;
  axis.forward = forward;
}

/** The dedicated sprint button is held or released. */
export function setTouchSprint(held: boolean): void {
  sprintHeld = held;
}

/** The thumb lifted, or the pointer was cancelled. */
export function endTouchStick(): void {
  active = false;
  clearAxis(axis);
}

/** Window blur and visibility loss must release every held touch control. */
export function endAllTouch(): void {
  endTouchStick();
  sprintHeld = false;
}
