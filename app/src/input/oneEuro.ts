// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The 1 euro filter, over a 2D point, with the timestamp handed in.
 *
 * WHY NOT A FIXED LOW-PASS
 * ------------------------
 * A thumb resting on glass jitters, and a panel reports that jitter as
 * direction. A fixed window removes it at a fixed price in latency, and there
 * is no latency to spend: drag lag is detectable at 6 to 10 ms and a browser
 * game on a 60 Hz panel has already spent 50 to 80 ms end to end. The 1 euro
 * filter is speed-adaptive instead, so it pays that price only when the thumb
 * is nearly still, which is exactly when the player cannot perceive it. At rest
 * the 1.2 Hz floor gives a 133 ms time constant; a 500 px/s drag lifts the
 * cutoff to about 26 Hz, a 6 ms constant, under the detection floor.
 *
 * There is no prediction term. A virtual stick reads a position, not a path,
 * and an overshooting stick is worse than a late one.
 *
 * ONE SPEED FOR BOTH AXES
 * -----------------------
 * The cutoff is driven by the magnitude of the filtered 2D derivative, not by
 * each axis separately. Per-axis cutoffs smooth the two components by different
 * amounts, which bends a straight diagonal drag toward whichever axis is
 * currently slower. A stick's direction matters more than either component.
 *
 * TIMESTAMPS COME FROM THE EVENT
 * ------------------------------
 * Callers feed every coalesced sample through in order, using each event's own
 * `timeStamp`, and write only the last result. The cutoff is a function of an
 * estimated speed, and that estimate is wrong if the intermediate samples are
 * dropped. Coalesced samples can share a timestamp, so a zero or negative delta
 * reuses the last usable one rather than dividing by it.
 *
 * Pure arithmetic: no DOM, no clock of its own, unit-testable in node.
 */

/** Cutoff at rest, Hz. 133 ms of smoothing on a thumb that is not moving. */
export const MIN_CUTOFF = 1.2;
/**
 * How fast the cutoff opens with speed: Hz added per unit of speed.
 *
 * It is beta, not the minimum cutoff, that bounds how far the output can trail
 * a moving input. Against a steady drag the filter settles a fixed distance
 * behind it, and that distance is `1 / (2 pi BETA)` - 3.2 px here - whatever
 * the speed, because the cutoff rises with the speed that produced it. A slow
 * drag trails by less: 0.9 px at 10 px/s, 2.2 px at 50, 3.0 px at 500. The
 * published tuning procedure starts at beta 0 and raises it until fast motion
 * stops lagging, so 0.05 is a point on that path rather than a default.
 *
 * Only a sample advances the filter. When the input stops moving the stream
 * stops too, and the output keeps whatever distance it was trailing by.
 */
export const BETA = 0.05;
/** Cutoff of the derivative's own filter, Hz. Keeps the speed estimate calm. */
export const D_CUTOFF = 1.0;

/** Stand-in delta for the first sample and for repeated timestamps, seconds. */
const FALLBACK_DT = 1 / 60;

/** One filter's memory. Create it once per pointer stream and reuse it. */
export interface OneEuroState {
  /** Filtered position, in the units passed to `filterPoint`. */
  x: number;
  y: number;
  /** False until the first sample seeds the filter. */
  seeded: boolean;
  /** Last raw input, for the derivative. */
  rawX: number;
  rawY: number;
  /** Filtered derivative, units per second. */
  dx: number;
  dy: number;
  /** Last accepted timestamp, ms, and the last usable delta, seconds. */
  timeStampMs: number;
  dt: number;
}

export function createOneEuro(): OneEuroState {
  return {
    x: 0,
    y: 0,
    seeded: false,
    rawX: 0,
    rawY: 0,
    dx: 0,
    dy: 0,
    timeStampMs: 0,
    dt: FALLBACK_DT,
  };
}

/** Forget the stream. Call on pointer down, so a new thumb starts unsmoothed. */
export function resetOneEuro(state: OneEuroState): void {
  state.seeded = false;
  state.x = 0;
  state.y = 0;
  state.rawX = 0;
  state.rawY = 0;
  state.dx = 0;
  state.dy = 0;
  state.timeStampMs = 0;
  state.dt = FALLBACK_DT;
}

/** Exponential smoothing factor for a cutoff and a delta, both in SI units. */
function alpha(cutoffHz: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return dt / (dt + tau);
}

/**
 * Filter one sample. The result is written into `state.x` / `state.y` and the
 * state is returned, so nothing is allocated per sample.
 *
 * A long gap between samples drives alpha to 1, which snaps to the input. That
 * is the wanted behaviour after a tab switch or a stalled frame: stale velocity
 * from before the gap has nothing to say about where the thumb is now.
 */
export function filterPoint(
  state: OneEuroState,
  x: number,
  y: number,
  timeStampMs: number,
): OneEuroState {
  if (!state.seeded) {
    state.seeded = true;
    state.x = x;
    state.y = y;
    state.rawX = x;
    state.rawY = y;
    state.dx = 0;
    state.dy = 0;
    state.timeStampMs = timeStampMs;
    state.dt = FALLBACK_DT;
    return state;
  }

  // Two coalesced samples can carry the same timestamp, and a re-ordered one
  // can carry an earlier one. Both would make the derivative meaningless, so
  // reuse the last delta that was usable and leave the clock where it was.
  let dt = (timeStampMs - state.timeStampMs) / 1000;
  if (!(dt > 0)) dt = state.dt;
  else state.timeStampMs = timeStampMs;
  state.dt = dt;

  const dAlpha = alpha(D_CUTOFF, dt);
  state.dx += dAlpha * ((x - state.rawX) / dt - state.dx);
  state.dy += dAlpha * ((y - state.rawY) / dt - state.dy);
  state.rawX = x;
  state.rawY = y;

  const speed = Math.sqrt(state.dx * state.dx + state.dy * state.dy);
  const cutoff = MIN_CUTOFF + BETA * speed;
  const a = alpha(cutoff, dt);
  state.x += a * (x - state.x);
  state.y += a * (y - state.y);
  return state;
}
