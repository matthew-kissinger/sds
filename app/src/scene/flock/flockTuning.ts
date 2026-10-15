// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The numbers the flock's frame loop runs on, and the reasoning behind each.
 *
 * Split out of Flock.tsx so that file stays a loop rather than a wall of tuning
 * (AGENTS.md rule 2). Nothing here is state and nothing here allocates: they are
 * authored constants, read once per frame or once per flock.
 *
 * Every one of them is presentation only. The sim never reads this module.
 */

import { SHEEP_MAX_SPEED_PER_TICK, TICK_HZ } from '@sim/tuning';

/** Top speed in m/s, for normalising agitation. 0.12 m/tick at 60 Hz = 7.2. */
export const SHEEP_MAX_SPEED_MPS = SHEEP_MAX_SPEED_PER_TICK * TICK_HZ;

/** Agitation smoothing time constant, seconds. Frame-rate independent. */
export const AGITATION_TAU = 0.14;
/** Visual facing response. Sim headings remain untouched and authoritative. */
export const SHEEP_HEADING_TAU = 0.1;
/**
 * The fastest sustained turn the flock's presentation may show, in radians per
 * second. This is the 0.28 rad per rendered frame the flock shipped with, read
 * at the 60 Hz it was tuned on: 0.28 * 60 = 16.8. So 60 Hz and below are
 * unchanged, and above it the sustained turn no longer scales with the refresh:
 * a full reversal measured 1738 deg/s at 144 Hz before and 963 deg/s after.
 * The flock fills much of the frame, so its turning is much of the optic flow
 * the comfort work is about, on 200 animals rather than one.
 */
export const SHEEP_HEADING_STEP_RATE = 16.8;
/** The anti-snap guard, which stays per frame on purpose. A long mobile frame
 *  falls behind briefly instead of snapping an animal by more than 16 degrees:
 *  a rate times a long delta does not bound that. See headingSmoothing. */
export const SHEEP_HEADING_STEP_LIMIT = 0.28;

export const TAU = Math.PI * 2;

/**
 * Gait rate in radians per second: the floor a standing sheep keeps ticking over
 * at, plus what a walk adds, plus what a bolt adds. The floor exists because the
 * body bob rides this phase and a resting sheep still breathes; the legs do not
 * move at rest because their amplitude, not their rate, is what agitation opens.
 * At the top that is 9.8 rad/s, so 1.6 strides a second.
 */
export const GAIT_REST = 1.6;
export const GAIT_WALK = 3;
export const GAIT_RUN = 5.2;
export const STRIDE_WALK = 0.18;
export const STRIDE_RUN = 0.188;
/** Hoof clearance as a fraction of fore-aft stride. */
export const HOOF_LIFT = 0.52;

/**
 * A planted foot needs this phase rate:
 *
 *   body speed * pi * stance share / stride
 *
 * because its planted interval sweeps from +stride to -stride.
 *
 * STANCE SHARE FALLS WITH SPEED, and that is what makes a bolting sheep read as
 * an animal rather than as a sewing machine. Hold it at the walking 0.34 and the
 * equation above has only two ways to absorb 7.2 m/s: a stride no 0.59 m leg can
 * reach, or a cadence that is a blur. The shipped asset took the blur - the lock
 * asked for 27.5 rad/s, was capped to 14, and blended to 13.4, which is 2.1
 * strides a second flicking a 0.28 m stride while the body covered 3.4 m. Eighty
 * three per cent of every stride was slide, and it looked like tapping.
 *
 * A real sheep answers the same problem by bounding: the hooves spend less of
 * the cycle on the ground and more of it in the air, so the body covers its
 * distance in flight instead of in cadence. Dropping the share to 0.16 at a bolt
 * brings the demanded rate down to 9.78 rad/s - just under the authored 9.8, so
 * the lock stops engaging at all - and leaves 84 per cent of the cycle airborne,
 * with an interval where neither diagonal is planted. That is the suspension
 * phase, and it is why the gait now reads as a bound.
 */
export const SHEEP_STANCE_WALK = 0.34;
export const SHEEP_STANCE_BOUND = 0.16;

/**
 * THE BODY HAS TO RISE. A gait is not four legs cycling under a torso held at a
 * fixed height - that is a walk cycle played on a hovercraft, and it is the
 * other half of why the flock read as tapping. In a bound the body is thrown,
 * and the legs only catch it: lowest at mid-stance where a diagonal carries the
 * weight, highest at mid-suspension where neither does.
 *
 * Amplitude is a fraction of stride, so it opens with speed and closes to
 * nothing at a graze, plus a small floor that is the resting breath the gait
 * rate's own floor exists for.
 *
 * A twentieth of stride puts the bolt at 0.022 m either side, so 0.045 m peak
 * to peak, which on a 0.72 m withers is six per cent - the top of where real
 * trotting quadrupeds sit, and a trot at a quarter agitation lands on four.
 * The ballistic rise for this suspension interval is 0.058 m; this is a third
 * of it, because a leg is a spring and not a stilt. A tenth of stride was tried
 * first and measured eleven per cent of height peak to peak, which is not a
 * bound, it is a pogo stick.
 */
export const BODY_BOB_STRIDE = 0.05;
export const BODY_BREATH = 0.004;

/**
 * Vertical body offset in local metres, before the (1 - legWeight) taper that
 * keeps it off the soles. CPU twin of the TSL expression in sheepMotion.
 *
 * Two lows and two highs per gait cycle, because the diagonals alternate; the
 * phase offset is what puts the lows under the stance rather than beside it,
 * and it tracks `stanceShare` so the alignment survives the walk-to-bound
 * change rather than only holding at one speed.
 */
export function sheepBodyBob(
  gait: number,
  stride: number,
  stanceShare: number,
): number {
  const amplitude = BODY_BREATH + stride * BODY_BOB_STRIDE;
  return -Math.cos(gait * 2 - TAU * stanceShare) * amplitude;
}

/** Stance share at this agitation. The TSL twin mixes the same two constants. */
export function sheepStanceShareForAgitation(agitation: number): number {
  const level = Math.min(Math.max(agitation, 0), 1);
  return SHEEP_STANCE_WALK + (SHEEP_STANCE_BOUND - SHEEP_STANCE_WALK) * level;
}

const GAIT_LOCK_BLEND = 0.85;
/** A bound on the lock's request. With the share above it no longer binds
 *  anywhere in range - the peak demand is about 10.8 rad/s - but it stays as the
 *  guard that stopped a short stride asking for an unbounded cadence. */
const GAIT_LOCK_RATE_MAX = 14;

export interface SheepLegPose {
  /** -1 at the back reach, +1 at the front reach. */
  readonly travel: number;
  /** 0 on stance, 0..1..0 through the forward recovery. */
  readonly lift: number;
  readonly planted: boolean;
}

function unitTurn(turns: number): number {
  return turns - Math.floor(turns);
}

/**
 * CPU twin of the TSL leg curve used for terrain contact and regression tests.
 *
 * `stanceShare` is passed rather than read from a constant because it is no
 * longer one: it falls with speed, and a twin that assumed the walking value
 * would plant hooves on frames where the shader has them airborne.
 */
export function sheepLegPose(
  gait: number,
  legSign: number,
  stanceShare: number,
): SheepLegPose {
  const turn = unitTurn(gait / TAU + (legSign < 0 ? 0.5 : 0));
  if (turn < stanceShare) {
    const t = turn / stanceShare;
    return { travel: 1 - t * 2, lift: 0, planted: true };
  }
  const t = (turn - stanceShare) / (1 - stanceShare);
  const eased = t * t * (3 - 2 * t);
  return { travel: -1 + eased * 2, lift: Math.sin(t * Math.PI), planted: false };
}

export function sheepStrideForAgitation(agitation: number): number {
  const level = Math.min(Math.max(agitation, 0), 1);
  const walk = Math.min(level * WALK_KNEE, 1);
  return walk * STRIDE_WALK + level * STRIDE_RUN;
}

export function sheepGaitRateForAgitation(agitation: number): number {
  const level = Math.min(Math.max(agitation, 0), 1);
  const walk = Math.min(level * WALK_KNEE, 1);
  const authored = GAIT_REST + walk * GAIT_WALK + level * GAIT_RUN;
  const stride = sheepStrideForAgitation(level);
  if (stride <= 1e-6) return authored;
  const planted = Math.min(
    level * SHEEP_MAX_SPEED_MPS * Math.PI * sheepStanceShareForAgitation(level) / stride,
    GAIT_LOCK_RATE_MAX,
  );
  return authored + Math.max(planted - authored, 0) * GAIT_LOCK_BLEND;
}

/** Agitation at which the walk is fully open. Matches WALK_KNEE in the motion
 *  module, because the two curves have to describe the same animal. */
export const WALK_KNEE = 4;

/** Per-instance scale range. A fifth either side of nominal: at 200 the flock's
 *  top contour has to be visibly irregular, and still narrow enough that none of
 *  them reads as a lamb, because a lamb is a different shape and not a smaller
 *  one. */
export const SIZE_MIN = 0.82;
export const SIZE_SPREAD = 0.38;

/** How far the build varies on top of size: longer or dumpier, taller or
 *  squatter, wider or narrower. Small numbers, applied to three axes at once,
 *  which is what makes twenty sheep in a huddle read as twenty animals rather
 *  than as one animal at twenty scales. */
export const BUILD_LONG = 0.16;
export const BUILD_TALL = 0.14;
export const BUILD_WIDE = 0.12;

/** Per-instance yaw offset from the sim heading, radians. The sim points a sheep
 *  where it is going; a real flock stands at angles to itself. Widened from 12
 *  degrees to 26, because at 12 a settled group still read as one animal stamped
 *  out in rows. */
export const YAW_JITTER = 0.46;

/** Per-instance lateral scatter off the sim position, metres. Presentation only
 *  and deliberately under a quarter of the sim's separation distance, so the
 *  group still reads as the shape the sim is making while its rows stop being
 *  rows. Measured at 0.22 first, which softened the lattice without breaking it;
 *  a third of a metre is what it takes for the rows to stop being findable. */
export const SCATTER = 0.32;

/**
 * Fleece tint gain range. The material walks a golden-to-pale mix on top of this
 * from the same seed, and gives roughly a fifth of the flock a browner fleece
 * outright (sheepColor.ts).
 *
 * WIDENED, BECAUSE THE PREVIOUS SPREAD WAS NOT VISIBLE. Ten sheep sampled off a
 * capture spanned nine sRGB points, inside the noise of the grade. The range here
 * is 0.78 to 1.06 in linear gain, which is 25 to 30 sRGB points of value across
 * the flock at the key band and more in the shade band. The ceiling is held just
 * over 1 on purpose: past that the pale end lands on the tone map's shoulder and
 * the difference is compressed away again.
 */
export const TINT_MIN = 0.78;
export const TINT_SPREAD = 0.28;

/**
 * How wide the outline should be on screen, in CSS pixels - near, far, and the
 * distances the ramp between them runs over - plus the local-metre bounds the
 * solved width is held between.
 *
 * One number for every distance was wrong in both directions. At a Follow closeup
 * 1.9 px measured as a single half-antialiased pixel against bright grass and
 * read as an edge artifact; at Classic, where a sheep is under 30 px tall, the
 * same line is a tenth of the animal and eats the shape it describes. So the ink
 * is solved for 2.8 px inside 14 m, eases to 1.8 px by 42 m, and holds. Those are
 * the SOLVED widths; measured off a capture the drawn ring runs a little under
 * them, because the hull expands along the body axis rather than the screen
 * normal and the two disagree by about 25 degrees where the back line turns away.
 * The metre ceiling stops a sheep at the far fence being swallowed by its hull.
 */
export const OUTLINE_NEAR_PIXELS = 2.8;
export const OUTLINE_FAR_PIXELS = 1.8;
export const OUTLINE_NEAR_METRES = 14;
export const OUTLINE_FAR_METRES = 42;
export const OUTLINE_MIN = 0.005;
export const OUTLINE_MAX = 0.085;

/** Seeds. Fixed constants, so the flock is the same flock every session. */
export const STYLE_SEED = 0x5eed;
export const SIZE_SEED = 0x5121;

/** Stride of the per-instance shape record: three scale axes, a yaw offset and
 *  a lateral scatter in x and z. */
export const SHAPE_STRIDE = 6;
