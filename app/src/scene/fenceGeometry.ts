// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Fence layout as data. Given a rect and the gaps in it, produce post positions,
 * rail segments and the openings between them. Pure arithmetic, no three, so the
 * perimeter fence and the pen fence are the same code reading the same
 * HOME_FIELD numbers rather than two hand-placed approximations that drift apart
 * from the sim's collision geometry.
 *
 * This is the layer the sim's boundary has to agree with, and it never moves.
 * What each stick of timber then DOES - how it leans, how tall it grew, where
 * the ground put its foot - lives in fence/placement.ts, and the gate's own
 * parts in fence/gateKit.ts. Both are built on the hash at the bottom of this
 * file, so a post leans the same way on every reload and the two rail segments
 * meeting at it agree without having to be told about each other.
 */

import type { RectBounds } from '@sim/boundary';

export type FenceSide = 'north' | 'south' | 'east' | 'west';

const ALL_FENCE_SIDES: readonly FenceSide[] = ['north', 'south', 'west', 'east'];

/** An opening in one side, centred on `center` along that side's free axis. */
export interface FenceGap {
  readonly center: number;
  readonly width: number;
  /**
   * Whether this opening is a GATE - heavy capped posts, strainers, hung leaves
   * - or a plain break in the run. Required, not defaulted, because the answer
   * is load-bearing: the field gate is the retirement pasture's shared front
   * opening, so adding another kit would put four capped posts in one landmark.
   * Exactly one opening in the game carries a kit.
   */
  readonly kit: boolean;
}

export interface FencePost {
  readonly x: number;
  readonly z: number;
  /** True for the posts that frame an opening. They get their own kit. */
  readonly gatePost: boolean;
  /**
   * True where two runs meet at a rect corner. A corner takes the whole pull of
   * both runs, so a real fence puts its heaviest stick there and braces it; and
   * the rails have to stop at its faces rather than crossing through it and out
   * the far side, which is what made every corner of this fence read as two
   * fences overlapping.
   */
  readonly corner: boolean;
}

/** One straight run of fence, centred at (x, z), `length` long along `axis`. */
export interface FenceRail {
  readonly x: number;
  readonly z: number;
  readonly length: number;
  readonly axis: 'x' | 'z';
  /** The run's two ends along `axis`. The posts sit on the same arithmetic, so
   *  a segment end and a post foot are the same point rather than two rounded
   *  approximations of it. */
  readonly from: number;
  readonly to: number;
  /** The run's OUTWARD normal. The rails lap onto the outside face of the posts
   *  the way a stock fence is actually nailed up, so this is the direction that
   *  offset goes in. */
  readonly outX: number;
  readonly outZ: number;
}

/**
 * A gap, described the way the gate kit needs it: the two posts, the unit vector
 * from one to the other, and the inward normal the leaf swings toward.
 */
export interface FenceOpening {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly ux: number;
  readonly uz: number;
  readonly nx: number;
  readonly nz: number;
  readonly width: number;
  /** Carried through from the gap: only a kitted opening gets the gate built. */
  readonly kit: boolean;
}

export interface FenceLayout {
  readonly posts: readonly FencePost[];
  readonly rails: readonly FenceRail[];
  readonly openings: readonly FenceOpening[];
}

/** [from, to] spans left once a gap is cut out of [min, max]. */
function spans(min: number, max: number, gap: FenceGap | undefined): [number, number][] {
  if (!gap) return [[min, max]];
  const half = gap.width / 2;
  const left = gap.center - half;
  const right = gap.center + half;
  const out: [number, number][] = [];
  if (left > min) out.push([min, left]);
  if (right < max) out.push([right, max]);
  return out;
}

/** How many bays a run of this length is cut into. One formula, two readers. */
export function runDivisions(length: number, postSpacing: number): number {
  return Math.max(1, Math.round(length / postSpacing));
}

/** Side geometry: the fixed coordinate, the free axis, and the inward normal. */
const SIDES = {
  north: { axis: 'x' as const, nx: 0, nz: -1 },
  south: { axis: 'x' as const, nx: 0, nz: 1 },
  west: { axis: 'z' as const, nx: 1, nz: 0 },
  east: { axis: 'z' as const, nx: -1, nz: 0 },
};

/**
 * Posts, rails and openings for one rect.
 *
 * @param rect the fence line itself, not an inset
 * @param postSpacing target metres between posts; each run rounds to fit so
 *   both ends always carry a post
 * @param gaps at most one opening per side
 * @param sides sides that receive new timber. A shared boundary can omit the
 *   side already supplied by an adjoining fence without drawing it twice.
 */
export function rectFenceLayout(
  rect: RectBounds,
  postSpacing: number,
  gaps: Partial<Record<FenceSide, FenceGap>> = {},
  sides: readonly FenceSide[] | undefined = ALL_FENCE_SIDES,
): FenceLayout {
  const posts: FencePost[] = [];
  const rails: FenceRail[] = [];
  const openings: FenceOpening[] = [];
  const seen = new Set<string>();

  const isCorner = (x: number, z: number): boolean =>
    (x === rect.minX || x === rect.maxX) && (z === rect.minZ || z === rect.maxZ);

  const addPost = (x: number, z: number, gatePost: boolean): void => {
    const key = `${x.toFixed(2)},${z.toFixed(2)}`;
    if (seen.has(key)) return;
    seen.add(key);
    posts.push({ x, z, gatePost, corner: isCorner(x, z) });
  };

  /**
   * One straight run. A post at either end frames an opening whenever that end
   * is not the rect's own corner, which is exactly where a gap was cut out - but
   * it is only a GATE post if that opening carries a kit. A plain break in the
   * run is framed by ordinary line posts.
   */
  const addRun = (
    from: number,
    to: number,
    fixed: number,
    axis: 'x' | 'z',
    sideMin: number,
    sideMax: number,
    kitted: boolean,
    outX: number,
    outZ: number,
  ): void => {
    const length = to - from;
    if (length <= 0) return;
    rails.push(
      axis === 'x'
        ? { x: (from + to) / 2, z: fixed, length, axis, from, to, outX, outZ }
        : { x: fixed, z: (from + to) / 2, length, axis, from, to, outX, outZ },
    );
    const divisions = runDivisions(length, postSpacing);
    const stride = length / divisions;
    for (let i = 0; i <= divisions; i++) {
      const along = from + stride * i;
      const framesGap =
        kitted && ((i === 0 && from !== sideMin) || (i === divisions && to !== sideMax));
      if (axis === 'x') addPost(along, fixed, framesGap);
      else addPost(fixed, along, framesGap);
    }
  };

  const addSide = (side: FenceSide, fixed: number, min: number, max: number): void => {
    const info = SIDES[side];
    const gap = gaps[side];
    for (const [from, to] of spans(min, max, gap)) {
      addRun(from, to, fixed, info.axis, min, max, gap?.kit === true, -info.nx, -info.nz);
    }
    if (!gap) return;
    const a = gap.center - gap.width / 2;
    const b = gap.center + gap.width / 2;
    const alongX = info.axis === 'x';
    openings.push({
      ax: alongX ? a : fixed,
      az: alongX ? fixed : a,
      bx: alongX ? b : fixed,
      bz: alongX ? fixed : b,
      ux: alongX ? 1 : 0,
      uz: alongX ? 0 : 1,
      nx: info.nx,
      nz: info.nz,
      width: gap.width,
      kit: gap.kit,
    });
  };

  const included = new Set(sides);
  if (included.has('north')) addSide('north', rect.maxZ, rect.minX, rect.maxX);
  if (included.has('south')) addSide('south', rect.minZ, rect.minX, rect.maxX);
  if (included.has('west')) addSide('west', rect.minX, rect.minZ, rect.maxZ);
  if (included.has('east')) addSide('east', rect.maxX, rect.minZ, rect.maxZ);

  return { posts, rails, openings };
}

// --- deterministic irregularity ---------------------------------------------

/** Centimetre-quantised key, shared by the hash and the gate-post lookup. */
export function postKey(x: number, z: number): string {
  return `${Math.round(x * 100)},${Math.round(z * 100)}`;
}

/** Deterministic 0..1 from a position and a salt. Integer mixing, so the answer
 *  does not depend on float formatting or on iteration order. No Math.random
 *  anywhere on the fence: a post leans the same way on every reload. */
export function hash01(x: number, z: number, salt: number): number {
  let h =
    Math.imul(Math.round(x * 100), 73856093) ^
    Math.imul(Math.round(z * 100), 19349663) ^
    Math.imul(salt, 83492791);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
