// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Where the gate cue sits, and how far round its needle has turned.
 *
 * This used to place the cue from the gate's PROJECTED point, clamped to the
 * perimeter of an inset rectangle. Swept over a full turn on a 390x844 phone
 * that put it on one of exactly two x values at 29 of the 31 bearings where it
 * was shown, moved it 130 px over 110 degrees of rotation, and - at the one
 * bearing where a player most needs a steady reading, the gate directly behind
 * them - threw it 245 px across the screen for a single degree of turn, because
 * the projected point passes through the camera axis there and the code fell
 * back to a hard `dx = 1`.
 *
 * A projected point is the wrong quantity. It answers "where did the gate leave
 * the frame", which on a phone held upright is a question about 40 degrees out
 * of 360: the 76 degree vertical lens spans only +/-20 degrees horizontally at
 * a 0.46 aspect, so the gate is off screen for 85% of a turn and the cue is
 * furniture rather than a hint. The quantity a player reads is the BEARING, the
 * angle between where the camera looks and where the gate is, and that one is
 * continuous through every heading including straight behind.
 *
 * So the cue rides an ellipse inscribed in the safe area at the true bearing.
 * Ahead is up and right is right; that is the whole of the mapping. Measured
 * over the same sweep: 5.8 to 10.8 px per 2 degrees of turn rather than 1.5 to
 * 245, 77 distinct x positions rather than 23, no discontinuity anywhere, and
 * no special case left in the function at all.
 */

/** What the store carries, because it is all any subscriber reads. */
export interface GateCue {
  /** The opening is inside the frame, so the marker in the world may light. */
  readonly onScreen: boolean;
  /** A ridge stands between the camera and the opening. */
  readonly obscured: boolean;
}

/** The per-frame result. Everything here is written straight to the element. */
export interface GateAim extends GateCue {
  readonly x: number;
  readonly y: number;
  /** How far to turn the needle, radians, zero pointing straight up. */
  readonly angle: number;
  /** How much of the token to show. Zero while the opening is centre frame. */
  readonly presence: number;
  /** Closeness for the rim arc: 0 at RANGE_SPAN or beyond, 1 at the opening. */
  readonly range: number;
}

/*
 * The insets below are not taste. Every rectangle the HUD occupies was read off
 * UiStyles, the 44 px token was swept round the resulting ellipse at a quarter
 * of a degree, and each number is the smallest that clears every rectangle on
 * every viewport in its class - checked from 320x568 up to 2560x1440, in both
 * orientations, with a few px of slack on top. Shrink one and something starts
 * sitting on the clock or on Sprint.
 */

/** Half a 44 px token and a hair, off every edge the ring can reach. */
const SIDE = 30;
/**
 * Landscape hands BOTH edges away: the stick runs to x 124 on the left, and
 * Camera, Sprint and Bark stack from x w-202 on the right. Inset symmetrically
 * rather than only on the right, or the ring leans into the thumb.
 */
const SIDE_SHORT = 152;
/** Stamina ends at y 46 centre-top; that is all the top has to clear. */
const TOP = 76;
/**
 * Upright, the ring is narrow enough that its upper-left shoulder swings into
 * the clock at y 118, and the narrower the phone the harder it hugs that
 * corner. 144 is what the narrowest phone still in use needs.
 */
const TOP_NARROW = 144;
/** The Camera button sits mid-height at y h-214, not down in the corner. */
const BOTTOM_TOUCH = 240;
/** Landscape only has to clear Sprint, at y h-116. */
const BOTTOM_SHORT = 136;
/** The keyboard reminder runs y h-78 to h-20 across the foot of the frame. */
const BOTTOM_ROOMY = 108;
/** No token may be narrower than itself, whatever the viewport does. */
const MIN_SPAN = 44;
/** The rim arc is empty at this range and closed at the opening, in metres. */
const RANGE_SPAN = 150;
/** How near an edge the opening may project and still count as in shot. */
const EDGE_MARGIN = 24;
/**
 * The token dissolves as the opening comes in off the frame edge, and the two
 * axes have to be asked separately, because only one of them is about turning.
 *
 * SIDEWAYS is: the opening crosses from the middle of the frame to its edge
 * over about 25 degrees of turn on an upright phone and 50 on a landscape one,
 * so a ramp that starts at FADE_SIDE spans 19 degrees of turn at the tightest
 * and cannot read as a pop.
 *
 * UPWARD is not. The follow camera looks down, so distance alone carries the
 * opening up the frame - dead ahead it sits a third of the way up at 60 m and
 * nearly half way at 150 m - and a ramp pitched anywhere near there would ghost
 * the token in every time the gate was merely far away. But the climb does not
 * stop: on the shortest landscape phones a dead-ahead opening really does leave
 * the top of the frame at 215 m, which a dog standing in a far corner of the
 * 200 m field can reach, and the token has to come back for it. So the upward
 * ramp is only FADE_RISE wide and is hung off the top edge itself. It is narrow
 * in the frame and slow in the hand: on the phone where it does fire it takes
 * 70 m of running to cross, and it reaches full exactly as the opening goes.
 *
 * Both ramps finish exactly where onScreen flips, so the token is already fully
 * present when the opening leaves and the flip underneath can never show.
 */
const FADE_SIDE = 0.22, FADE_RISE = 0.08;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * @param clip   the opening in clip space, for visibility only.
 * @param bearing radians from the camera's forward to the gate, right positive.
 */
export function aimAtGate(
  clip: { x: number; y: number; w: number },
  bearing: number,
  width: number, height: number,
  distance: number,
  obscured = false,
): GateAim {
  // Short is asked first: a landscape phone is both short and narrow, and it is
  // the short layout it wears.
  const short = height < 500, narrow = width < 600;
  const left = short ? SIDE_SHORT : SIDE;
  const right = Math.max(left + MIN_SPAN, width - left);
  const top = narrow && !short ? TOP_NARROW : TOP;
  const bottom = Math.max(top + MIN_SPAN, height
    - (short ? BOTTOM_SHORT : narrow ? BOTTOM_TOUCH : BOTTOM_ROOMY));

  // An ellipse inscribed in the safe rectangle. An asymmetric inset shifts the
  // ring rather than breaking the reading, which is why landscape can hand the
  // right-hand edge to the action buttons and still point true.
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  const rx = (right - left) / 2, ry = (bottom - top) / 2;
  const dx = Math.sin(bearing), dy = -Math.cos(bearing);
  const reach = 1 / Math.hypot(dx / rx, dy / ry);

  // Visibility still belongs to the world opening, not to the ring: a gate the
  // player can see near the frame edge must not acquire a floating token.
  const px = width / 2 + (clip.x / clip.w) * (width / 2);
  const py = height / 2 - (clip.y / clip.w) * (height / 2);
  const onScreen = clip.w > 0
    && px >= EDGE_MARGIN && px <= width - EDGE_MARGIN
    && py >= EDGE_MARGIN && py <= height - EDGE_MARGIN;

  // Both ramps run on the clip point rather than the pixel one, so they are
  // measured in the lens rather than in the layout: a wider frame sees further
  // round, and the fade widens with it instead of needing a second constant.
  // A zero w makes these NaN, and nothing downstream sees it, because the fade
  // is only consulted when onScreen - which a NaN comparison cannot pass.
  const nx = Math.abs(clip.x / clip.w), ny = Math.abs(clip.y / clip.w);
  // Where onScreen flips, in the same units, one figure per axis.
  const xEdge = Math.max(1 - (2 * EDGE_MARGIN) / width, FADE_SIDE + FADE_RISE);
  const yEdge = Math.max(1 - (2 * EDGE_MARGIN) / height, FADE_RISE);
  const shown = Math.max(
    clamp01((nx - FADE_SIDE) / (xEdge - FADE_SIDE)),
    clamp01((ny - yEdge + FADE_RISE) / FADE_RISE),
  );

  return {
    x: cx + dx * reach,
    y: cy + dy * reach,
    // The needle reads the bearing itself, not the direction to the token. The
    // ellipse skews placement a little on a tall frame; the needle must not.
    angle: bearing,
    onScreen,
    obscured,
    presence: onScreen && !obscured ? shown : 1,
    range: clamp01(1 - distance / RANGE_SPAN),
  };
}

/**
 * Radians from the camera's forward to the gate, measured in the ground plane,
 * clockwise on screen. Zero is dead ahead and half a turn is straight behind,
 * with no heading at which the value jumps - which is the entire reason the cue
 * is placed from this rather than from a projected point.
 */
export function gateBearing(
  forwardX: number, forwardZ: number, toGateX: number, toGateZ: number,
): number {
  const fLen = Math.hypot(forwardX, forwardZ) || 1;
  const ax = forwardX / fLen, az = forwardZ / fLen;
  const gLen = Math.hypot(toGateX, toGateZ) || 1;
  const gx = toGateX / gLen, gz = toGateZ / gLen;
  // Screen right is forward crossed with world up, which flattens to (-az, ax).
  return Math.atan2(-az * gx + ax * gz, ax * gx + az * gz);
}
