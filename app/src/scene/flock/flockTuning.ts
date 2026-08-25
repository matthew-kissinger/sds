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
/** Largest heading catch-up shown in one rendered frame. A long mobile frame
 *  falls behind briefly instead of snapping an animal by more than 16 degrees. */
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
export const STRIDE_RUN = 0.1;
/** Hoof clearance as a fraction of fore-aft stride. */
export const HOOF_LIFT = 0.52;

/**
 * A planted foot needs this phase rate:
 *
 *   body speed * pi * stance share / stride
 *
 * because its planted interval sweeps from +stride to -stride. Keeping stance
 * shorter than recovery allows an ordinary walking cadence to hold the ground,
 * then gives the hoof longer to lift and return forward. Full lock at a bolt
 * would still cycle implausibly fast, so the request is capped before blending.
 */
export const SHEEP_STANCE_SHARE = 0.34;
const GAIT_LOCK_BLEND = 0.85;
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

/** CPU twin of the TSL leg curve used for terrain contact and regression tests. */
export function sheepLegPose(gait: number, legSign: number): SheepLegPose {
  const turn = unitTurn(gait / TAU + (legSign < 0 ? 0.5 : 0));
  if (turn < SHEEP_STANCE_SHARE) {
    const t = turn / SHEEP_STANCE_SHARE;
    return { travel: 1 - t * 2, lift: 0, planted: true };
  }
  const t = (turn - SHEEP_STANCE_SHARE) / (1 - SHEEP_STANCE_SHARE);
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
    level * SHEEP_MAX_SPEED_MPS * Math.PI * SHEEP_STANCE_SHARE / stride,
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
