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
import { MIN_STAMINA_TO_SPRINT } from '@sim/tuning';
import { resetConditioning } from './conditioning';

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
let sprintHeld = false;
let sprintCarry = false;
let sprintExhausted = false;

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

export function setSprint(sprint: boolean, allSourcesReleased = false): void {
  sprintHeld = sprint;
  if (!sprint || allSourcesReleased) sprintExhausted = false;
  current.sprint = (sprintHeld || sprintCarry) && !sprintExhausted;
}

/**
 * The trailing sprint ceiling: true for the few ticks the commanded speed
 * spends above the walk ceiling after a sprint ends.
 *
 * A SECOND FLAG, AND NOT AN ARGUMENT TO `setSprint`. The sim clamps the dog's
 * velocity to whichever ceiling this tick's `sprint` selects, so a sprint that
 * ends while the command is still above the walk ceiling is a 10 m/s step in
 * one tick. Keeping `sprint` true while the command ramps down removes that
 * step, but the exhaustion latch must not see it: the device has already let
 * go, so feeding it to `setSprint` would fire the release edge while the value
 * was still true, clear the latch, and hand a player who exhausts sprint,
 * releases above the walk ceiling and re-presses a free burst.
 *
 * It cannot arm the latch either. `resolveSprintForTick` arms it only on a
 * held device, and the device is by definition released during a carry.
 */
export function setSprintCarry(carry: boolean): void {
  sprintCarry = carry;
  current.sprint = (sprintHeld || sprintCarry) && !sprintExhausted;
}

/** Sample immediately before every fixed tick, including catch-up ticks. An
 * exhausted hold cannot re-arm itself as stamina regenerates between frames.
 * This is the last write before the sim reads the intent, so it resolves the
 * carry as well; recomputing from the held flag alone would drop it. */
export function resolveSprintForTick(stamina: number): void {
  if (sprintHeld && stamina < MIN_STAMINA_TO_SPRINT) sprintExhausted = true;
  current.sprint = (sprintHeld || sprintCarry) && !sprintExhausted;
}

/**
 * Whether the exhaustion latch is currently set.
 *
 * Exported so the resolver can work out what the sim will grant this tick from
 * the same latch the sim is about to be handed, rather than keeping a second
 * copy of the rule beside this one. Two latches would be two things to keep in
 * step, and the failure is silent: the commanded speed would be measured
 * against a ceiling the sim is not applying.
 */
export function isSprintExhausted(): boolean {
  return sprintExhausted;
}

/** A replacement run owns a fresh stamina/hold lifecycle. */
export function resetSprintExhaustion(): void {
  sprintExhausted = false;
  current.sprint = sprintHeld || sprintCarry;
}

/** Ask for a bark on the next fixed tick. Cleared by the loop once consumed. */
export function requestBark(): void {
  current.bark = true;
}

/** Consume the bark request. Called by the loop, not by input systems. */
export function clearBark(): void {
  current.bark = false;
}

/**
 * Drop all intent. Used when the field stops taking input (title, complete).
 *
 * The conditioner carries a commanded speed and direction of its own, so it has
 * to be dropped here too. Leaving it running would hand the next press a
 * momentum the dog does not have.
 */
export function clearIntent(): void {
  current.direction.x = 0;
  current.direction.z = 0;
  current.sprint = false;
  current.bark = false;
  sprintHeld = false;
  sprintCarry = false;
  sprintExhausted = false;
  resetConditioning();
}
