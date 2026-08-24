// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The one intent shape every input device produces and the game loop consumes
 * (spec/06: "Input produces one normalized intent shape consumed identically
 * everywhere"). It mirrors `sim/types.ts` PlayerInputs field for field, so the
 * loop hands it straight to `FlockSim.step` with no adapter in between.
 *
 * WHY THIS IS MODULE STATE AND NOT THE STORE
 * ------------------------------------------
 * Intent changes every frame. Routing it through zustand would re-render React
 * at 60 Hz, which spec/01 forbids ("React re-renders only on discrete events").
 * So this module holds one mutable intent object, written by input systems and
 * read by the loop. It is the ONLY sanctioned non-store mutable in app/, and it
 * is sanctioned precisely because it is per-frame data that never reaches React.
 *
 * It is not a bridge singleton: nothing on `window`, no events, no subscribers,
 * no game state. One plain object, one owner (the loop), typed setters.
 *
 * BARK IS EDGE TRIGGERED. An input system calls `requestBark()` on the press;
 * the loop consumes the request in the next fixed tick and calls `clearBark()`.
 * Holding the key down does not queue barks; the sim's own cooldown decides how
 * often a held request can fire, and the input system decides whether to keep
 * requesting.
 */

/** One tick of player intent. `direction` need not be normalized. */
export interface PlayerIntent {
  direction: { x: number; z: number };
  sprint: boolean;
  bark: boolean;
}

/** Standing still, not sprinting, not barking. Never mutated. */
export const NEUTRAL_INTENT: Readonly<PlayerIntent> = {
  direction: { x: 0, z: 0 },
  sprint: false,
  bark: false,
};

const current: PlayerIntent = {
  direction: { x: 0, z: 0 },
  sprint: false,
  bark: false,
};

/**
 * The live intent object. Stable identity for the lifetime of the page, so the
 * loop can hold the reference and never allocate per frame.
 */
export function currentIntent(): PlayerIntent {
  return current;
}

/** World-axis move direction. Classic camera input stays world-axis (spec/06). */
export function setMoveDirection(x: number, z: number): void {
  current.direction.x = x;
  current.direction.z = z;
}

export function setSprint(sprint: boolean): void {
  current.sprint = sprint;
}

/** Ask for a bark on the next fixed tick. Cleared by the loop once consumed. */
export function requestBark(): void {
  current.bark = true;
}

/** Consume the bark request. Called by the loop, not by input systems. */
export function clearBark(): void {
  current.bark = false;
}

/** Drop all intent. Used when the field stops taking input (title, complete). */
export function clearIntent(): void {
  current.direction.x = 0;
  current.direction.z = 0;
  current.sprint = false;
  current.bark = false;
}
