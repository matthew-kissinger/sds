// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * How the timber is held together, as opposed to where it stands.
 *
 * A post-and-rail fence is not a post with a bar passing through it. The rails
 * are lapped onto ONE face of the posts and pegged there, which is why a real run
 * has a visible offset between the post line and the rail line, a stub of peg at
 * every joint, and a corner where two runs stop against one heavy braced stick
 * rather than crossing each other and overshooting into the grass.
 *
 * None of that is decoration. Without it the rails read as bars floating past
 * posts, the corners read as two fences overlapping, and there is nothing in the
 * frame at gameplay distance that says the fence was BUILT. All of it is more
 * instances in the rail mesh, so it costs no draw call.
 *
 * Still plain arithmetic, no three, and still no Math.random: every seed is a
 * hash of the piece's own position (fenceGeometry.ts).
 */

import { hash01, type FenceLayout } from '../fenceGeometry';
import type { GroundSampler, RailPlacement } from './placement';
import { TIMBER_TONE } from './timberTones';

/**
 * How far the rails lap onto the OUTSIDE face of the posts, metres. Half a post
 * girth puts the rail's inner face against the post's outer one.
 */
export const RAIL_LAP = 0.17;

/** The peg: a short stub of leaf stock driven through the rail into the post, so
 *  a joint is a mark a player can see rather than an intersection. At Classic
 *  distance it is two or three pixels, which is exactly a nail head. */
export const PEG = { length: 0.2, thickness: 0.07, depth: 0.07 } as const;

/** How far a rail stops short of a corner post's centre, so the two runs meeting
 *  there terminate on its faces instead of crossing through it. */
export const CORNER_STOP = 0.24;

/** The corner brace: steep enough to read as a brace rather than as a plank
 *  lying in the grass beside the fence. */
const CORNER_BRACE = {
  reach: 1.15,
  foot: 0.08,
  head: 1.3,
  thickness: 0.14,
  depth: 0.12,
} as const;

export interface PegSpec {
  /** Post centre, already carrying that post's own lean at the rail's height. */
  readonly x: number;
  readonly z: number;
  readonly y: number;
  /** The run's outward normal: the peg is driven along it. */
  readonly outX: number;
  readonly outZ: number;
  readonly row: number;
}

/** One peg at one joint. */
export function pegPlacement(spec: PegSpec): RailPlacement {
  const reach = RAIL_LAP + PEG.length / 2;
  const back = RAIL_LAP - PEG.length / 2;
  return {
    ax: spec.x + spec.outX * reach,
    ay: spec.y,
    az: spec.z + spec.outZ * reach,
    bx: spec.x + spec.outX * back,
    by: spec.y,
    bz: spec.z + spec.outZ * back,
    thickness: PEG.thickness,
    depth: PEG.depth,
    topness: 1,
    tone: TIMBER_TONE.leaf,
    seed: hash01(spec.x, spec.z, 311 + spec.row),
  };
}

/**
 * A raking brace down each run from every corner post. Two runs pull against
 * each other at a corner and a real fence answers that with timber; without it a
 * corner is only the place where two identical runs happen to stop.
 */
export function cornerBraces(
  layout: FenceLayout,
  groundY: GroundSampler,
  rails: RailPlacement[],
): void {
  let minX = Infinity;
  let minZ = Infinity;
  for (const post of layout.posts) {
    minX = Math.min(minX, post.x);
    minZ = Math.min(minZ, post.z);
  }
  for (const post of layout.posts) {
    if (!post.corner) continue;
    const head = groundY(post.x, post.z) + CORNER_BRACE.head;
    // Both braces rake INWARD along their own run, away from the corner.
    for (const [dx, dz] of [
      [post.x === minX ? 1 : -1, 0],
      [0, post.z === minZ ? 1 : -1],
    ] as const) {
      const footX = post.x + dx * CORNER_BRACE.reach;
      const footZ = post.z + dz * CORNER_BRACE.reach;
      rails.push({
        ax: footX,
        ay: groundY(footX, footZ) + CORNER_BRACE.foot,
        az: footZ,
        bx: post.x,
        by: head,
        bz: post.z,
        thickness: CORNER_BRACE.thickness,
        depth: CORNER_BRACE.depth,
        topness: 0.7,
        tone: TIMBER_TONE.line,
        seed: hash01(post.x, post.z, 419 + dx + dz * 3),
      });
    }
  }
}
