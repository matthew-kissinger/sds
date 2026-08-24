// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * THE KIT: the dimensions every stick of this fence is cut to, and how far a
 * single post is allowed to depart from the drawing.
 *
 * Split out of `placement.ts` so the numbers a critic argues with sit in one
 * small file and the placement pass stays a placement pass. Plain arithmetic, no
 * three, and no Math.random anywhere: every irregularity is a hash of the post's
 * own position (fenceGeometry.ts), so a post leans the same way on every reload
 * and the two bays meeting at it agree without being told about each other.
 */

import { hash01 } from '../fenceGeometry';

/**
 * Nominal dimensions, metres. The sds reference GLB carries a 2.18 m post with
 * rails at 0.5 / 1.2 / 1.9 (spec/04, dimensions only, never style); this is a
 * stock-fence version of the same kit, sized against the things standing next to
 * it. A sheep's back is 0.58 m, so the middle rail crosses it.
 *
 * Rail heights are ABSOLUTE metres above the ground, not fractions of a post,
 * because a real fence is built rail-first: the rails run at a builder's height
 * and the post tops are the part that varies.
 *
 * `postProud` is how far a post head stands above the cap rail. Clearing the rail
 * by 40 cm - more than a post width - puts a row of heads along the top of every
 * run, which is the thing that says "fence" before any shading is applied; at
 * half a post width the run is a slab with nothing sticking out of it.
 */
export const TIMBER = {
  postGirth: 0.33,
  /** What a corner post adds. It takes the pull of two runs, so a real fence
   *  puts its heaviest stick there and the silhouette says so. */
  cornerGirth: 1.4,
  /**
   * One shaft of the gate pier. There are TWO of them per side (gateKit.ts), so
   * the mass at the mouth is 1.3 m of timber across rather than one fat post.
   */
  gatePostGirth: 0.66,
  /**
   * The pier, and the number came DOWN by a metre this pass.
   *
   * A landmark is read by proportion, not by altitude. At 3.9 m the pier stood
   * more than twice a line post and, being no wider, arrived at both gameplay
   * cameras as a toothpick with a dark blob on top - the thinnest silhouette on
   * the fence in the one place that needed the heaviest. At 2.9 m it is a little
   * over one and a half line posts, and the mass that makes it findable comes
   * from the pier being 1.3 m wide, from the head being the LIGHTEST timber
   * anywhere on the perimeter, and from the slot of sky between its two shafts,
   * which is a shape no tree in the treeline has.
   */
  gatePostHeight: 2.9,
  postProud: 0.4,
  proudSpread: 0.16,
  /** How far a foot goes under the surface. Deep enough that a leaning post on
   *  a slope never lifts its own base out of the ground. */
  sink: 0.2,
} as const;

/**
 * Three rails, and the rhythm between them is UNEVEN on purpose: a stock fence
 * carries its widest gap low, where nothing needs stopping, and closes up toward
 * the top where the cap rail does the work. The cap is twice the section of the
 * ones below it, because at Classic distance the fence is one line across the
 * frame and a run of one gauge reads as wire.
 *
 * THE LOWEST RAIL WENT UP 22 CM, and that is a sorting fix rather than a design
 * one. The pasture runs 0.32 m to 0.78 m tall (grass/tuftGeometry.ts) and there
 * is no fence keep-out in the grass bake, so a bottom rail at 0.34 m sat inside
 * the blades and the whole run came back with bright green slivers cutting
 * through solid timber. At 0.56 m the rail clears two thirds of the meadow, the
 * blades that do reach it read as grass at a fence foot, and the line the
 * perimeter is actually read by - the cap rail at 1.48 m - is clear of every
 * blade in the field.
 */
export const RAILS = [
  { height: 0.56, thickness: 0.11, depth: 0.09 },
  { height: 1.06, thickness: 0.12, depth: 0.1 },
  { height: 1.48, thickness: 0.22, depth: 0.16 },
] as const;

/** How the sticks are held together - the lap, the pegs, the corner brace -
 *  lives in fence/joinery.ts. */

export const CAP_RAIL_HEIGHT = RAILS[RAILS.length - 1]!.height;

/** How a single post departs from the drawing. */
export interface PostJitter {
  /** Top offset as a fraction of height. 0.105 is 6 degrees off plumb. */
  readonly tilt: number;
  /** Which way the top leans, radians in the xz plane. */
  readonly tiltDir: number;
  /** Rotation about y. The prism has five faces; turning them means no two
   *  posts catch the sun on the same facet. */
  readonly yaw: number;
  readonly height: number;
  readonly girth: number;
  /** 0..1, the shader's per-post weathering tone. */
  readonly seed: number;
}

/**
 * Most of a fence stands nearly true and a few posts have given up.
 *
 * DIALLED BACK HARD. Two posts in five leaning up to 0.32 - nearly two post
 * widths at the head - is not a weathered fence, it is a fence falling down: the
 * run stepped visibly from bay to bay and the top rail showed real gaps where two
 * neighbours leaned apart. One in six at half the amplitude still reads as age
 * from twelve metres and holds a continuous line from a hundred. Gate piers and
 * corner posts do not move at all.
 */
const DRUNK_SHARE = 0.17;
const DRUNK_TILT = [0.09, 0.15] as const;
const PLUMB_TILT = [0.012, 0.05] as const;
const GATE_TILT = 0;
const GIRTH_SPREAD = 0.16;
/** Per-rail-row undulation at each post. Keyed on the post, so the two bays
 *  meeting there agree, and keyed on the row, so the three rails are never
 *  parallel. */
export const RAIL_RISE = 0.05;
/** How much of the terrain a rail line keeps. Below 1 the rails smooth out the
 *  ground they follow, the way a builder levels a run by eye. */
export const RAIL_LEVELLING = 0.6;

export function postJitter(
  x: number,
  z: number,
  gatePost: boolean,
  corner = false,
): PostJitter {
  const a = hash01(x, z, 11);
  const b = hash01(x, z, 23);
  const c = hash01(x, z, 37);
  const d = hash01(x, z, 53);
  const e = hash01(x, z, 71);
  const drunk = a < DRUNK_SHARE;
  const band = drunk ? DRUNK_TILT : PLUMB_TILT;
  const t = drunk ? a / DRUNK_SHARE : (a - DRUNK_SHARE) / (1 - DRUNK_SHARE);
  const proud = TIMBER.postProud + (d - 0.5) * 2 * TIMBER.proudSpread;
  return {
    // A corner post is set as deep and as true as a pier: it is the thing the
    // whole run is strained against.
    tilt: gatePost || corner ? GATE_TILT : band[0] + (band[1] - band[0]) * t,
    tiltDir: b * Math.PI * 2,
    // A pier shaft is squared up to the run, and both of them the same way: the
    // two sides of the gate have to be one matched pair, and a free yaw on a
    // five-sided prism is enough on its own to render them thirty saturation
    // points apart.
    yaw: gatePost ? 0.3 : c * Math.PI * 2,
    height: gatePost
      ? TIMBER.gatePostHeight + TIMBER.sink
      : CAP_RAIL_HEIGHT + proud + TIMBER.sink,
    girth: gatePost
      ? TIMBER.gatePostGirth
      : TIMBER.postGirth *
        (1 + (a - 0.5) * GIRTH_SPREAD) *
        (corner ? TIMBER.cornerGirth : 1),
    seed: gatePost ? 0.5 : e,
  };
}
