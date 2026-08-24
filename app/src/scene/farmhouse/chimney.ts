// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The chimney. Short, wide, shouldered and capped, which is what a cottage stack
 * is and what the previous one was not.
 *
 * THE PROPORTION IS THE WHOLE NOTE. That stack stood 3.4 m over a ridge on a
 * shaft 1.8 m across and read as a factory flue on a farmhouse: at a hundred
 * metres a chimney is a proportion and nothing else. This one shows 1.6 m over
 * the ridge on a base 3 m across - visible height under a third of the depth of
 * the slope it pierces, and WIDER THAN IT IS TALL above the slate - with a
 * weathering shoulder where the masonry meets the slate and a corbelled cap with
 * a pot on it. Both numbers moved this pass: the shaft came out a third broader
 * and the head came down a quarter metre, because at the beauty framing the
 * previous stack still read as a tower rather than as the thick cottage breast a
 * cluster this size wants.
 *
 * THE LEAN IS GONE, and that is a bug fix rather than a taste change. A tapered
 * box whose top ring was pushed off plumb has four NON-PLANAR side faces, and
 * this builder gives every triangle its own geometric normal, so each of those
 * faces arrived as two triangles in two different bands: a hard dark line down
 * the centre of the stack that no sun angle in this scene could produce. A pure
 * taper keeps every face planar and the stack keeps one tone per side.
 *
 * TWO THINGS SURVIVE FROM THE PREVIOUS PASS BECAUSE THEY WERE RIGHT:
 *
 *  - IT STANDS ON THE CAMERA SIDE OF THE RIDGE. Every camera looks at this
 *    cluster from down-field, so a stack seated on the ridge line shows only its
 *    head and appears to begin in mid-air.
 *  - IT IS SUNK, NOT PARKED. The shaft starts below the slate at its seat, so
 *    there is no sliver of roof visible under it from any angle, and a flashing
 *    collar closes the joint the way lead does.
 *
 * `uv.x = 1` on every surface here tells the dressings material to take the stone
 * band set, so the stack reads as masonry rather than as trim.
 */

import type { Local, Shell, Stand } from './shell';
import type { RoofSpec } from './roof';

/** What masonry carries in uv.x. The dressings material switches on it. */
const MASONRY = 1;
/** How far below its seat the shaft starts. Deep enough to show no sliver. */
const SUNK = 1.6;
/** Half extents of the flashing collar, and how much further the apron runs. */
const COLLAR_X = 1.9;
const COLLAR_UP = 1.05;
const COLLAR_DOWN = 1.6;
/** How far the collar stands above the slate, and how far it beds below it. */
const COLLAR_TOP = 0.2;
const COLLAR_BED = 0.2;
/**
 * Base half-extents of the shaft, and the head it tapers to. Three metres across
 * the front: broader than the last pass by a third, because the stack's whole job
 * at this range is its proportion, and a shaft that reads narrower than the
 * emergence is tall reverts to a flue however carefully it is capped.
 */
export const BASE_X = 1.5;
export const BASE_Z = 1.24;
const NECK_X = 1.2;
const NECK_Z = 1.0;
/** Height of the shouldered course at the base of the visible shaft. */
const SHOULDER = 0.42;

export type SurfaceY = (x: number, z: number) => number;

/**
 * The stack. `atX` is along the ridge and `atZ` across the building, both in its
 * own frame; `rise` is how far the head stands over the ridge.
 */
export function chimney(
  shell: Shell,
  place: Stand,
  spec: RoofSpec,
  atX: number,
  atZ: number,
  rise: number,
  surfaceY: SurfaceY,
): void {
  shell.mark(MASONRY, 0);

  const head = spec.ridgeHeight + rise;
  const seat = surfaceY(atX, atZ);
  const foot = seat - SUNK;
  const shaftTop = head - 0.5;

  // The shouldered base: a course wider than the shaft, sitting where the
  // masonry comes through the slate, so the stack meets the roof instead of
  // being pushed into it.
  const shoulderTop = seat + SHOULDER;
  const mid0 = (foot + shoulderTop) / 2;
  shell.taperedBox(
    place,
    [atX, mid0, atZ],
    [BASE_X + 0.16, (shoulderTop - foot) / 2, BASE_Z + 0.16],
    [BASE_X, (shoulderTop - foot) / 2, BASE_Z],
  );

  // The shaft.
  const mid1 = (shoulderTop + shaftTop) / 2;
  const half1 = (shaftTop - shoulderTop) / 2;
  shell.taperedBox(place, [atX, mid1, atZ], [BASE_X, half1, BASE_Z], [NECK_X, half1, NECK_Z]);

  flashing(shell, place, atX, atZ, surfaceY);

  // The corbelled cap: one course stepping back out, then a slab, then the pot.
  shell.taperedBox(
    place,
    [atX, shaftTop + 0.14, atZ],
    [NECK_X, 0.14, NECK_Z],
    [NECK_X + 0.26, 0.14, NECK_Z + 0.26],
  );
  shell.taperedBox(
    place,
    [atX, head - 0.11, atZ],
    [NECK_X + 0.26, 0.11, NECK_Z + 0.26],
    [NECK_X + 0.14, 0.11, NECK_Z + 0.14],
  );
  // The pot. Small, off centre, and the one piece of the stack that is allowed to
  // be a separate shape against the sky.
  shell.taperedBox(
    place,
    [atX + 0.22, head + 0.3, atZ - 0.1],
    [0.4, 0.3, 0.36],
    [0.32, 0.3, 0.28],
  );
}

/** Where the pot's mouth sits in the building's frame, for the smoke to leave. */
export function potLocal(
  spec: RoofSpec,
  atX: number,
  atZ: number,
  rise: number,
): readonly [number, number, number] {
  return [atX + 0.22, spec.ridgeHeight + rise + 0.6, atZ - 0.1];
}

/**
 * The lead collar. A slab whose bottom beds under the slate and whose top runs
 * parallel to it, longer on the downhill side, so the joint is closed on every
 * side and there is an apron where the water would actually run.
 */
function flashing(shell: Shell, place: Stand, atX: number, atZ: number, surfaceY: SurfaceY): void {
  const down = atZ < 0 ? -1 : 1;
  const za = atZ + down * COLLAR_DOWN;
  const zb = atZ - down * COLLAR_UP;
  const zLow = Math.min(za, zb);
  const zHigh = Math.max(za, zb);
  const plan: readonly (readonly [number, number])[] = [
    [atX - COLLAR_X, zLow],
    [atX + COLLAR_X, zLow],
    [atX + COLLAR_X, zHigh],
    [atX - COLLAR_X, zHigh],
  ];

  const low: Local[] = [];
  const high: Local[] = [];
  for (const [x, z] of plan) {
    const y = surfaceY(x, z);
    low.push([x, y - COLLAR_BED, z]);
    high.push([x, y + COLLAR_TOP, z]);
  }

  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    shell.quad(place, low[j]!, low[i]!, high[i]!, high[j]!);
  }
  shell.quad(place, high[0]!, high[3]!, high[2]!, high[1]!);
}
