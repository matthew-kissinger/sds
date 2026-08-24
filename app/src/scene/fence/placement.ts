// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Where every stick of the fence actually stands. `fenceGeometry.ts` answers
 * where the fence IS - the layer the sim's boundary has to agree with, which
 * never moves; `kit.ts` answers what the sticks are cut to and how far each one
 * departs from the drawing; this puts them on the rolling ground.
 *
 * Still plain arithmetic, no three, and still no Math.random. It takes a
 * `groundY` sampler rather than importing one, so it stays testable and
 * three-free.
 */

import {
  hash01,
  postKey,
  runDivisions,
  type FenceLayout,
} from '../fenceGeometry';
import { CORNER_STOP, RAIL_LAP, cornerBraces, pegPlacement } from './joinery';
import { RAILS, RAIL_LEVELLING, RAIL_RISE, TIMBER, postJitter } from './kit';
import { POST_TONE, TIMBER_TONE } from './timberTones';


/** One post, ready to be turned into a matrix. */
export interface PostPlacement {
  readonly x: number;
  readonly z: number;
  /** Where the foot sits: ground under the post, less the sink. */
  readonly baseY: number;
  readonly height: number;
  readonly girth: number;
  readonly tilt: number;
  readonly tiltDir: number;
  readonly yaw: number;
  /** Which stock this piece is cut from: `POST_TONE` in timberTones.ts. */
  readonly tone: number;
  readonly seed: number;
}

/** One bar of timber, as the two points it spans between. */
export interface RailPlacement {
  readonly ax: number;
  readonly ay: number;
  readonly az: number;
  readonly bx: number;
  readonly by: number;
  readonly bz: number;
  readonly thickness: number;
  readonly depth: number;
  /** 0 for the ground rail, 1 for the cap rail. Drives the warm catch. */
  readonly topness: number;
  /** Which stock this bar is cut from: `TIMBER_TONE` in timberTones.ts. */
  readonly tone: number;
  readonly seed: number;
}

export interface FencePlacements {
  readonly posts: readonly PostPlacement[];
  readonly rails: readonly RailPlacement[];
}

export type GroundSampler = (x: number, z: number) => number;

/**
 * The fence in three dimensions. The ground rolls, so every post stands at its
 * own `groundY` and every bay pitches from one post to the next; a run carried
 * as one 200 m box would bury itself at one end of the field and fly at the
 * other. The rail line follows that ground only three parts in five, smoothed
 * against its neighbours, which is what a builder sighting down a run does and
 * what keeps a bay from alternately floating and ploughing.
 *
 * The posts that frame a KITTED opening are not built here. A gate is a pier of
 * two braced shafts under one cap (gateKit.ts) and not a fat line post, so the
 * kit builds the whole thing; what stays here is their jitter, because the rail
 * lines running up to them have to know where their heads are.
 */
export function fencePlacements(
  layout: FenceLayout,
  groundY: GroundSampler,
  postSpacing: number,
): FencePlacements {
  const gateKeys = new Set<string>();
  const cornerKeys = new Set<string>();
  for (const post of layout.posts) {
    if (post.gatePost) gateKeys.add(postKey(post.x, post.z));
    if (post.corner) cornerKeys.add(postKey(post.x, post.z));
  }
  const isCorner = (x: number, z: number): boolean => cornerKeys.has(postKey(x, z));

  const posts: PostPlacement[] = [];
  for (const post of layout.posts) {
    if (post.gatePost) continue;
    posts.push({
      ...postJitter(post.x, post.z, false, post.corner),
      x: post.x,
      z: post.z,
      baseY: groundY(post.x, post.z) - TIMBER.sink,
      tone: POST_TONE.line,
    });
  }

  const rails: RailPlacement[] = [];
  for (const rail of layout.rails) {
    const alongX = rail.axis === 'x';
    const fixed = alongX ? rail.z : rail.x;
    const divisions = runDivisions(rail.to - rail.from, postSpacing);
    const stride = (rail.to - rail.from) / divisions;
    // Where the rail line sits relative to the post line: lapped onto the outside
    // faces, which is what puts a visible joint at every post instead of a bar
    // passing through one.
    const lapX = rail.outX * RAIL_LAP;
    const lapZ = rail.outZ * RAIL_LAP;

    const raw: number[] = [];
    for (let i = 0; i <= divisions; i++) {
      const along = rail.from + stride * i;
      raw.push(alongX ? groundY(along, fixed) : groundY(fixed, along));
    }
    const level = raw.map((y, i) => {
      const prev = raw[Math.max(0, i - 1)]!;
      const next = raw[Math.min(divisions, i + 1)]!;
      return y + ((prev + y + next) / 3 - y) * RAIL_LEVELLING;
    });

    for (let i = 0; i < divisions; i++) {
      const a = rail.from + stride * i;
      const b = a + stride;
      const ax = alongX ? a : fixed;
      const az = alongX ? fixed : a;
      const bx = alongX ? b : fixed;
      const bz = alongX ? fixed : b;
      const ja = postJitter(ax, az, gateKeys.has(postKey(ax, az)), isCorner(ax, az));
      const jb = postJitter(bx, bz, gateKeys.has(postKey(bx, bz)), isCorner(bx, bz));
      // A run stops at the faces of a corner post rather than crossing through
      // it: two runs terminating on the same heavy stick is what a corner is.
      const stopA = isCorner(ax, az) ? CORNER_STOP : 0;
      const stopB = isCorner(bx, bz) ? CORNER_STOP : 0;
      const dirX = alongX ? 1 : 0;
      const dirZ = alongX ? 0 : 1;

      for (let r = 0; r < RAILS.length; r++) {
        const spec = RAILS[r]!;
        // Height above the foot, so a leaning post carries its rail sideways by
        // the amount the post itself has moved at that height.
        const above = spec.height + TIMBER.sink;
        const leanA = ja.tilt * above;
        const leanB = jb.tilt * above;
        const riseA = (hash01(ax, az, 131 + r * 17) - 0.5) * 2 * RAIL_RISE;
        const riseB = (hash01(bx, bz, 131 + r * 17) - 0.5) * 2 * RAIL_RISE;
        rails.push({
          ax: ax + Math.cos(ja.tiltDir) * leanA + lapX + dirX * stopA,
          ay: level[i]! + spec.height + riseA,
          az: az + Math.sin(ja.tiltDir) * leanA + lapZ + dirZ * stopA,
          bx: bx + Math.cos(jb.tiltDir) * leanB + lapX - dirX * stopB,
          by: level[i + 1]! + spec.height + riseB,
          bz: bz + Math.sin(jb.tiltDir) * leanB + lapZ - dirZ * stopB,
          thickness: spec.thickness,
          depth: spec.depth,
          topness: r / (RAILS.length - 1),
          tone: TIMBER_TONE.line,
          seed: hash01(a, fixed, 97 + r),
        });

        // A peg at the start of every bay, and once more at the far end of the
        // run, so no joint is pegged twice and none is left bare.
        const pegAt = (px: number, pz: number, lean: number, dir: number, y: number): void => {
          rails.push(
            pegPlacement({
              x: px + Math.cos(dir) * lean,
              z: pz + Math.sin(dir) * lean,
              y,
              outX: rail.outX,
              outZ: rail.outZ,
              row: r,
            }),
          );
        };
        pegAt(ax, az, leanA, ja.tiltDir, level[i]! + spec.height + riseA);
        if (i === divisions - 1) {
          pegAt(bx, bz, leanB, jb.tiltDir, level[i + 1]! + spec.height + riseB);
        }
      }
    }
  }

  cornerBraces(layout, groundY, rails);
  return { posts, rails };
}
