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
/**
 * Visual facing response, in seconds. Sim headings remain untouched and
 * authoritative; this only decides how fast the drawn body chases them.
 *
 * IT HAS TO DEPEND ON SPEED, BECAUSE THE SIGNAL'S QUALITY DOES. The sim writes
 * `headings[i] = velocity.angle()`, so the heading is the travel direction -
 * and the angle of a nearly-zero vector is nearly meaningless. A sheep settling
 * or grazing sits just above the sim's own MIN_MOVEMENT_SPEED guard, where a
 * tiny change in the separation and cohesion terms swings the reported angle by
 * tens of degrees between ticks. One fixed 0.1 s filter passed most of that
 * through, and the animal visibly shivered while it was seeking its place in
 * the flock. Because the ramp bands on the world normal, a shiver in the facing
 * is also a shiver in the shading across the whole fleece, which is why the
 * wool looked like it was crawling when the fault was not in the wool.
 *
 * So: 0.6 s at rest, where the heading is mostly noise and nobody can tell a
 * slow drift from a fast one, easing to 0.12 s by the time the legs are
 * visibly walking, where the heading is real and a late turn would show. The
 * same walk knee the stride and the yaw offset use, so one speed curve governs
 * the whole presentation rather than three disagreeing ones.
 */
export const SHEEP_HEADING_TAU_REST = 0.6;
export const SHEEP_HEADING_TAU_RUN = 0.12;

export function sheepHeadingTauForAgitation(agitation: number): number {
  const level = Math.min(Math.max(agitation, 0), 1);
  const walk = Math.min(level * WALK_KNEE, 1);
  return SHEEP_HEADING_TAU_REST + (SHEEP_HEADING_TAU_RUN - SHEEP_HEADING_TAU_REST) * walk;
}
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
 * The rate a standing sheep keeps ticking over at, radians per second. It
 * exists because the body bob rides this phase and a resting sheep breathes.
 * The legs do not move at rest because their amplitude, not their rate, is what
 * agitation opens.
 *
 * It is the ONLY authored rate left. There used to be three - a rest, a walk
 * and a run, summed into a cadence - and the honest problem with that is that
 * cadence is not free to author. Given a step length and a ground speed, how
 * often a planted foot must be picked up is arithmetic, and an authored number
 * can only agree with it or be wrong. The old code wrote the arithmetic down as
 * a "lock", then applied 85 per cent of it (GAIT_LOCK_BLEND), which is a
 * deliberate 15 per cent of slide in every stance at every speed. Measured as a
 * ratio of hoof sweep to ground speed it ran 0.90 to 0.97: the foot never once
 * kept up with the ground, and that residue is what still read as tapping after
 * the stance share was fixed.
 *
 * So cadence is derived now and stride is authored, which is the way round the
 * physics allows.
 */
export const GAIT_REST = 1.6;

/**
 * Fore-aft half-travel of a hoof, in metres, at a walk and at a bolt.
 *
 * AUTHORED AGAINST THE LEG, because this is the number a leg's length actually
 * limits. SHEEP_AUTHORED_LEG_SPAN is 0.59 m, and a limb can swing to roughly
 * half its length fore and aft before the hip runs out of travel. 0.30 m is
 * 0.51 of the leg at full speed, which is where a galloping animal's foot
 * genuinely reaches; the old 0.368 was 0.62 of it, past what the joint has, and
 * part of why legs appeared outside the body.
 *
 * It opens over a very short band rather than ramping with agitation, because a
 * sheep that is walking at all is taking a real step - a creature does not take
 * four-centimetre paces. Below the band the amplitude closes to zero so a
 * standing animal's legs are still, which is the only thing the ramp was for.
 */
export const STRIDE_WALK = 0.2;
export const STRIDE_RUN = 0.3;
/** Agitation at which the stride is fully open. A twentieth: a sheep that has
 *  started moving has started stepping. */
export const STRIDE_OPEN_KNEE = 20;

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
 * distance in flight instead of in cadence.
 *
 * THESE ARE DUTY FACTORS, AND THE WALKING ONE WAS NOT A WALK. 0.34 means each
 * foot is off the ground for two thirds of the cycle; with the diagonals offset
 * by half a cycle that leaves two intervals per stride where NEITHER pair is
 * down. A sheep ambling at a third of a metre per second was airborne 34 per
 * cent of the time. Quadrupeds do not do that at a walk - a walk is defined by
 * never having fewer than two feet down, which needs a duty factor above 0.5 -
 * and brief touches with air between them is precisely what "tap, tap, tap"
 * describes.
 *
 * 0.62 at a walk gives an overlap where all four are down, no suspension at
 * all, and it passes through 0.5 at about a third of top speed where the gait
 * becomes a trot. 0.20 at a bolt is a gallop's duty factor and leaves 60 per
 * cent of the cycle airborne, which is the suspension a bound is named for.
 */
export const SHEEP_STANCE_WALK = 0.62;
export const SHEEP_STANCE_BOUND = 0.2;

/**
 * THE BODY HAS TO RISE. A gait is not four legs cycling under a torso held at a
 * fixed height - that is a walk cycle played on a hovercraft, and it is the
 * other half of why the flock read as tapping. In a bound the body is thrown,
 * and the legs only catch it: lowest at mid-stance where a diagonal carries the
 * weight, highest at mid-suspension where neither does.
 *
 * Amplitude rides AGITATION, plus a small floor that is the resting breath the
 * gait rate's own floor exists for.
 *
 * It rode stride first, and that was wrong in a way worth recording, because
 * stride looks like the right quantity and is not. Stride saturates early: its
 * walk term is full by agitation 0.25 (WALK_KNEE is 4), so a sheep ambling at a
 * quarter speed already carried seventy per cent of a bolt's amplitude. The bob
 * was correct in shape and far too large for the speed, and on an animal barely
 * moving that does not read as a bound - it reads as a rapid bounce, which is
 * exactly how it was described. Agitation does not saturate, so the bob now
 * opens with the speed it is supposed to be a consequence of.
 *
 * 0.012 puts the bolt at 0.016 m either side, so 0.032 m peak to peak: four and
 * a half per cent of a 0.72 m withers, inside where real trotting quadrupeds
 * sit.
 *
 * TRIMMED FROM 0.018 WHEN THE CADENCE BECAME HONEST. A bob cannot be larger
 * than the rise free flight would give it, or the body is being thrown by
 * nothing. The suspension used to be long because the cadence was wrong, which
 * bought a 0.058 m ballistic ceiling the bob sat comfortably under. Deriving
 * the cadence from the planting constraint shortened each flight to 0.125 s and
 * with it the ceiling, to 0.019 m - and 0.022 m was suddenly over it. This is
 * the test catching a real consequence two changes downstream, which is the
 * only reason to write the ballistic bound into a test rather than a comment.
 */
export const BODY_BOB_RUN = 0.012;
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
  agitation: number,
  stanceShare: number,
): number {
  const level = Math.min(Math.max(agitation, 0), 1);
  const amplitude = BODY_BREATH + level * BODY_BOB_RUN;
  return -Math.cos(gait * 2 - TAU * stanceShare) * amplitude;
}

/** Stance share at this agitation. The TSL twin mixes the same two constants. */
export function sheepStanceShareForAgitation(agitation: number): number {
  const level = Math.min(Math.max(agitation, 0), 1);
  return SHEEP_STANCE_WALK + (SHEEP_STANCE_BOUND - SHEEP_STANCE_WALK) * level;
}

/**
 * A bound on the derived cadence. The demand peaks near 19.2 rad/s - about
 * three strides a second, at a canter around 4.3 m/s, which is what a small
 * animal covering that ground actually does - so at 20 this does not bind
 * anywhere in range. It remains as the guard that stops a degenerate stride
 * asking for an unbounded cadence, which is the only job it ever had.
 *
 * There is no blend any more. A blend here is a fraction of a slide.
 */
const GAIT_RATE_MAX = 20;

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

/** Step length at this agitation, metres. Opens over a twentieth of the range
 *  and then grows with speed, so a moving sheep always takes a real step and a
 *  standing one takes none. The TSL twin builds the same two terms. */
export function sheepStrideForAgitation(agitation: number): number {
  const level = Math.min(Math.max(agitation, 0), 1);
  const open = Math.min(level * STRIDE_OPEN_KNEE, 1);
  return open * (STRIDE_WALK + level * (STRIDE_RUN - STRIDE_WALK));
}

/**
 * Cadence, radians per second, DERIVED rather than authored.
 *
 * A planted foot sweeps from +stride to -stride over its stance, so holding it
 * still against the ground requires exactly
 *
 *   body speed * pi * stance share / stride
 *
 * and there is no second opinion to be had about it. The previous version
 * computed this, called it a lock, and then applied 85 per cent of it on top of
 * an authored cadence - which guaranteed the hoof swept slower than the ground
 * at every speed in the range. Measured, the sweep-to-ground ratio ran 0.90 at
 * an amble and 0.97 at a canter, never 1. A foot that is 3 to 10 per cent slow
 * is a foot sliding forward under a body, every stance, for the whole life of
 * the animation.
 *
 * Taking the constraint exactly puts that ratio at 1.000 across the range. The
 * feel knobs that remain are the ones physics leaves free: how long a step is
 * and how much of the cycle it spends down.
 */
export function sheepGaitRateForAgitation(agitation: number): number {
  const level = Math.min(Math.max(agitation, 0), 1);
  const stride = sheepStrideForAgitation(level);
  if (stride <= 1e-6) return GAIT_REST;
  const planted = level * SHEEP_MAX_SPEED_MPS * Math.PI
    * sheepStanceShareForAgitation(level) / stride;
  return Math.max(GAIT_REST, Math.min(planted, GAIT_RATE_MAX));
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

/**
 * How much of that offset survives at this agitation.
 *
 * ALL OF IT, AT ANY SPEED, WAS SIDESTEPPING. The offset is up to 13 degrees
 * either way and it was applied as a constant, so an animal at a dead run was
 * pointed thirteen degrees off the line it was travelling along - which is not
 * a sheep facing slightly askew, it is a sheep crabbing. It also meant the body
 * carried a permanent rotation error that the heading smoothing was forever
 * working against, and because the ramp is evaluated on the world normal, that
 * constant small rotation dragged the bands across the fleece. The wool looked
 * like it was crawling, and the cause was not in the wool.
 *
 * Standing at an angle to the flock is the thing worth keeping, and a standing
 * animal keeps all of it. It fades out over the same walk knee the legs open
 * on, so by the time a sheep is visibly stepping it is facing where it is
 * going. The fade rides smoothed agitation, so the body turns onto its line
 * rather than snapping onto it.
 */
export function sheepYawOffsetShareForAgitation(agitation: number): number {
  const level = Math.min(Math.max(agitation, 0), 1);
  return 1 - Math.min(level * WALK_KNEE, 1);
}

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
