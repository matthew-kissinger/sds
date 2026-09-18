// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Touch as a device. The overlay in `TouchControls.tsx` owns the pixels and the
 * pointer events; this owns the two numbers the resolver reads. Splitting them
 * keeps the thumb out of React entirely: a drag writes here at pointer rate and
 * moves the ring and the knob by ref, and nothing re-renders (spec/06 forbids
 * per-frame churn through React state).
 *
 * Sprint has its own held state. Movement and sprint pointers are deliberately
 * independent so two thumbs can steer and sprint at the same time, and neither
 * control needs to route high-frequency input through React state.
 *
 * THIS FILE OWNS THE SHAPE OF THE THUMB
 * -------------------------------------
 * The overlay hands over the pointer's offset from the point where the thumb
 * LANDED - raw, unclamped, never re-referenced - plus the event's own
 * timestamp. Everything after that happens here: the smoothing, the base that
 * trails the thumb, the rim, the dead zone and the curve. The overlay used to
 * apply the dead zone, and later the rim, which put two files in charge of what
 * a thumb position means. One of them is enough, and it is the one the resolver
 * reads. The overlay reads `touchStickPixels` back to draw what was decided.
 *
 * The dead zone was the defect. It did not rescale, so effort jumped from 0 to
 * 0.16 at the threshold and the whole band below was unreachable: the slow
 * deliberate walk that makes herding calm could not be held on a phone at all.
 * `shapeAxis` rescales, so the first perceptible movement is the slowest one.
 *
 * The filter is a 1 euro filter, not a fixed low-pass. Drag latency is
 * detectable at 6 to 10 ms and a browser game on a 60 Hz panel has already
 * spent 50 to 80 ms end to end, so there is no fixed window to spend. See
 * `oneEuro.ts` for why the callers must feed every coalesced sample through it.
 */

import { shapeAxis, clearAxis, type MoveAxis } from './axis';
import { createOneEuro, filterPoint, resetOneEuro } from './oneEuro';
import { setSprintSource } from './sprintSources';

/**
 * Pixels from the stick base to full deflection.
 *
 * 48 px is 7.7 to 8.6 mm of thumb travel on the panels this ships to, at 0.16
 * to 0.18 mm per CSS pixel. It is a travel, not a target: the thing a thumb has
 * to be able to hit is the whole left half of the viewport, and the drawn ring
 * is 96 px across, so the 9.6 mm phone minimum for touch targets is met by a
 * wide margin and has nothing to say about this number. Comparing the two is a
 * category error, and this constant was picked while making it.
 *
 * What the radius actually sets is gain: 1 mm of thumb is 0.116 to 0.130 of
 * full deflection here, against 0.099 to 0.112 at the 56 px it replaced, so the
 * stick is 17% more direct than it was. Reach is not part of it - the base
 * trails the thumb, so reach stopped being a function of the radius. The
 * honest status of 48 is that no thumb has been measured against it; a
 * deflection histogram from the live build settles it and nothing else does.
 */
export const STICK_RADIUS = 48;

/**
 * Deflection under this is thumb noise, not a direction.
 *
 * 0.06 is about 0.49 mm of travel. The 0.16 it replaces was 1.4 to 1.6 mm, a
 * figure inherited from physical thumbsticks, where a dead zone rejects spring
 * return error and mechanical slop. A touchscreen has neither. It only has
 * finger tremor and panel jitter, commonly filtered at about 0.5 mm.
 */
export const DEADZONE = 0.06;

/**
 * Deflection at and above which the stick is at full effort, so the last 4 px
 * of travel are not a band the player has to hold a thumb steady inside.
 */
export const SATURATION = 0.92;

/** Where the overlay draws the stick. Pixels, in client axes. */
export interface StickPixels {
  /** Base, relative to where the thumb landed. Trails the thumb past the rim. */
  baseX: number;
  baseY: number;
  /** Knob, relative to the base. At or inside `STICK_RADIUS`. */
  knobX: number;
  knobY: number;
}

const axis: MoveAxis = { right: 0, forward: 0 };
const filter = createOneEuro();
const pixels: StickPixels = { baseX: 0, baseY: 0, knobX: 0, knobY: 0 };
let active = false;
let sprintHeld = false;

function resetStickPixels(): void {
  pixels.baseX = 0;
  pixels.baseY = 0;
  pixels.knobX = 0;
  pixels.knobY = 0;
}

/** True while a thumb is down on the stick half. */
export function touchActive(): boolean {
  return active;
}

export function touchAxis(): Readonly<MoveAxis> {
  return axis;
}

/**
 * The base and knob the last sample decided, for the overlay to draw.
 *
 * The knob is the commanded offset, filter and rim included, rather than the
 * raw thumb. The thumb's own position is under the player's finger and mostly
 * occluded by it; the ring and knob are the only sight the player gets of what
 * the dog was actually told, so they show that. Drawing the raw thumb instead
 * would hide the one error worth seeing, because the filter advances only when
 * a sample arrives: a thumb that stops moving stops the stream and leaves the
 * command holding whatever gap the last sample had. The gap is bounded by
 * 1 / (2 pi BETA), 3.2 px or 6.6% of the radius, and measured at up to 4 px and
 * 4.8 degrees of direction during a fast sweep at the rim.
 */
export function touchStickPixels(): Readonly<StickPixels> {
  return pixels;
}

export function touchSprint(): boolean {
  return sprintHeld;
}

/** The thumb went down. Direction is zero until it moves. */
export function beginTouchStick(): void {
  active = true;
  clearAxis(axis);
  resetStickPixels();
  // A new thumb starts unsmoothed: the previous stream's velocity has nothing
  // to say about where this one is, and seeding from it would drag the first
  // samples toward wherever the last drag was heading.
  resetOneEuro(filter);
}

/**
 * The thumb moved. `dxPx`/`dyPx` are the offset from where the thumb landed, in
 * client pixels, and `timeMs` is the event's own `timeStamp`.
 *
 * SMOOTH FIRST, THEN CLAMP, AND CLAMP ONLY HERE. The offset arrives measured
 * against the landing point rather than against the base, which makes it a pure
 * translation of the thumb's own path: its derivative is the thumb's speed at
 * every deflection, including past the rim. Filtering a rim-clamped offset
 * instead - which is what the overlay handed over while it owned the rim - feeds
 * the cutoff a speed the clamp has flattened, so the faster the thumb turns the
 * more the cutoff understates it. Against the same paths with no filter at all,
 * a 90-degree turn at the rim put the command 7.2, 10.1 and 13.4 degrees off at
 * 200, 400 and 800 px/s, outside 5 degrees for 100 to 167 ms afterwards. Here
 * the error is flat at 4.4 degrees and never reaches 5.
 *
 * It costs one motion, and the trade is worth recording: pulling straight back
 * off the rim makes the speed estimate cross zero, and the worst instantaneous
 * command error over that 100 ms rises from 0.36 to 0.80 of full effort at
 * 800 px/s. It is a transient rather than a drift - integrated over the whole
 * pull it commands 0.22 m LESS travel than the thumb asked for, against 0.07 m
 * more before - and the alternative is paying for it on every turn instead.
 *
 * ORIGIN RE-ANCHORING is the clamp. Past the radius the base is dragged along
 * behind the thumb until the offset is exactly the radius again, so reach stops
 * being a function of the radius and the stick can never saturate in a way that
 * needs re-seating. It bounds the offset by construction, which is why there is
 * no second radial clamp below: `shapeAxis` would give the same answer for any
 * larger magnitude anyway, since everything at or past saturation is effort 1.
 */
export function setTouchOffset(dxPx: number, dyPx: number, timeMs: number): void {
  const point = filterPoint(filter, dxPx, dyPx, timeMs);
  let x = point.x - pixels.baseX;
  let y = point.y - pixels.baseY;
  const distance = Math.sqrt(x * x + y * y);
  if (distance > STICK_RADIUS) {
    const keep = STICK_RADIUS / distance;
    pixels.baseX += x * (1 - keep);
    pixels.baseY += y * (1 - keep);
    x *= keep;
    y *= keep;
  }
  pixels.knobX = x;
  pixels.knobY = y;
  axis.right = x / STICK_RADIUS;
  // Client y grows downward and the stick's forward is up the screen.
  axis.forward = -y / STICK_RADIUS;
  shapeAxis(axis, DEADZONE, SATURATION);
}

/** The dedicated sprint button is held or released. */
export function setTouchSprint(held: boolean): void {
  sprintHeld = held;
  setSprintSource('touch', held);
}

/** The thumb lifted, or the pointer was cancelled. */
export function endTouchStick(): void {
  active = false;
  clearAxis(axis);
  resetStickPixels();
}

/** Window blur and visibility loss must release every held touch control. */
export function endAllTouch(): void {
  endTouchStick();
  setTouchSprint(false);
}
