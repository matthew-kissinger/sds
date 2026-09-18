// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Gamepad as a device. Polled from the frame loop, never from events: the
 * Gamepad API only fires connect/disconnect events and its button state is a
 * snapshot you have to read, so a poll is the honest shape. `getGamepads()`
 * returns a fresh snapshot array each call; nothing here is cached across
 * frames except the two press edges.
 *
 * Standard mapping button indices (w3c gamepad "standard"):
 *   0 A/cross, 1 B/circle, 2 X/square, 3 Y/triangle, 7 right trigger.
 *
 * Sprint is right trigger OR A: a trigger is the natural analog run, and A is
 * where a player who has never held a controller before puts their thumb. Bark
 * is B or X, either face button next to the thumb, matched as an edge so a held
 * button is one bark (the intent.ts contract). Y swaps camera framing, the
 * gamepad's C key: without it a pad-only player cannot reach Follow at all,
 * which rule 10 (no unreachable feature) would not forgive.
 */

import { clearAxis, shapeAxis, type MoveAxis } from './axis';

/**
 * Radial deadzone. Rescaled above it so the first degree of tilt is not a jump.
 *
 * 0.18 rather than the 0.22 it replaces: published guidance is 0.1 to 0.2 for a
 * physical stick and up to 0.25 for a worn one, and 0.18 still rejects the 0.1
 * resting drift `gamepad-input.spec.ts` pins, with a 1.8x margin, while
 * returning 4% of travel to the player. It does NOT go to the touch value: a
 * physical stick has spring return, wear and recentring error, and a
 * touchscreen has none of them.
 */
const DEADZONE = 0.18;
/** Full effort short of the rim: a worn stick often cannot reach it diagonally. */
const SATURATION = 0.95;
/** A trigger past this counts as held. Below it a resting finger does not sprint. */
const TRIGGER_THRESHOLD = 0.35;

const BUTTON_A = 0;
const BUTTON_B = 1;
const BUTTON_X = 2;
const BUTTON_Y = 3;
const BUTTON_RIGHT_TRIGGER = 7;

/** What one poll saw. Edges are already differenced against the last poll. */
export interface GamepadReading {
  /** False when no pad is connected; the resolver then ignores the rest. */
  present: boolean;
  sprint: boolean;
  /** True on the frame a bark button went down. */
  barkPressed: boolean;
  /** True on the frame the camera button went down. */
  cameraPressed: boolean;
}

const reading: GamepadReading = {
  present: false,
  sprint: false,
  barkPressed: false,
  cameraPressed: false,
};

let barkWasDown = false;
let cameraWasDown = false;

function firstConnectedPad(): Gamepad | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
  const pads = navigator.getGamepads();
  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i];
    if (pad && pad.connected) return pad;
  }
  return null;
}

function held(pad: Gamepad, index: number): boolean {
  return pad.buttons[index]?.pressed === true;
}

/**
 * Read the pad once. Writes the stick into `out` and returns the shared reading
 * object; allocates nothing per frame beyond what `getGamepads()` itself does.
 */
export function pollGamepad(out: MoveAxis): Readonly<GamepadReading> {
  clearAxis(out);
  const pad = firstConnectedPad();
  if (!pad) {
    barkWasDown = false;
    cameraWasDown = false;
    reading.present = false;
    reading.sprint = false;
    reading.barkPressed = false;
    reading.cameraPressed = false;
    return reading;
  }

  // Screen forward is stick up, which the API reports as negative y.
  out.right = pad.axes[0] ?? 0;
  out.forward = -(pad.axes[1] ?? 0);
  // The shaping lives in `axis.ts`, not here. Two devices should not feel
  // different because their dead-zone code was written at different times.
  shapeAxis(out, DEADZONE, SATURATION);

  const trigger = pad.buttons[BUTTON_RIGHT_TRIGGER]?.value ?? 0;
  const barkDown = held(pad, BUTTON_B) || held(pad, BUTTON_X);
  const cameraDown = held(pad, BUTTON_Y);

  reading.present = true;
  reading.sprint = trigger > TRIGGER_THRESHOLD || held(pad, BUTTON_A);
  reading.barkPressed = barkDown && !barkWasDown;
  reading.cameraPressed = cameraDown && !cameraWasDown;
  barkWasDown = barkDown;
  cameraWasDown = cameraDown;
  return reading;
}
