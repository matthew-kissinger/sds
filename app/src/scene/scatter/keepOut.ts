// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Where the dressing may not go, and the small frame it is placed in.
 *
 * THE CORRIDOR STAYS CLEAN. The lane from the spawn to the gate is the ground
 * the player pushes a flock across, and nothing chunky belongs in it. The
 * clearances are graded rather than uniform, because the objects are not
 * equivalent and pretending they were would either clutter the working ground or
 * empty the whole frame:
 *
 *   rocks    16 m from the lane. A cluster is stone FRAMING the working ground.
 *   log      16 m, brought in from 26. Not a loosening of the corridor rule but
 *            a correction to it: the sim never sees any of this (see below), so
 *            the only thing a clearance buys is composition, and 26 m put the
 *            one horizontal silhouette in the game outside the Follow frame
 *            entirely. At 16 m the log's near end is still eight sheep-lengths
 *            off the line the player works, and it is on screen.
 *   flowers  8 m, deliberately closer, and brought in from 11 by a measurement
 *            rather than a preference. A drift is 0.4 m tall standing in grass
 *            that is already half a metre: it cannot hide a 0.8 m sheep, it
 *            cannot hide the dog, and the sim never tests it, so the only thing
 *            this clearance protects is the READABILITY of the working ground.
 *            Eight metres either side is a sixteen-metre clean strip, which is
 *            two flock widths, and it is what lets the drifts reach the middle
 *            third of the beauty frame at all - that frame's screen-right axis
 *            runs almost exactly along the lane's east normal, so every metre of
 *            clearance here is a fifth of the picture left as bare pasture.
 *
 * On top of the lane: the terrain pads (assets/terrain/manifest.json, which
 * spec/04 names as scatter keep-outs directly) and an inset from the perimeter
 * so nothing grows through a fence post.
 *
 * NONE OF THIS REACHES THE SIM. These are composition rules, not collision
 * rules. Scatter is visual only; the sim's field is bounds, gate, pen and spawn
 * (sim/field.ts) and it never learns any of these objects exist, so a stone can
 * neither block a sheep nor change a fixed-seed run.
 */

import { HOME_FIELD } from '@sim/field';
import { TERRAIN_PADS } from '@app/world/terrainLayout';

export const LANE_START = HOME_FIELD.spawn.center;
export const LANE_END = HOME_FIELD.gate.position;
export const LANE_DX = LANE_END.x - LANE_START.x;
export const LANE_DZ = LANE_END.z - LANE_START.z;
export const LANE_LENGTH = Math.sqrt(LANE_DX * LANE_DX + LANE_DZ * LANE_DZ);

const LANE_LENGTH_SQUARED = LANE_DX * LANE_DX + LANE_DZ * LANE_DZ;
const { bounds } = HOME_FIELD;

/** Unit normal of the lane, pointing east. Every anchor in placement.ts is
 *  authored as a distance ALONG the lane and a distance to one side of it, so a
 *  clearance is visible in the number rather than implied by a world position. */
const EAST_X = LANE_DZ / LANE_LENGTH;
const EAST_Z = -LANE_DX / LANE_LENGTH;

export interface Spot {
  readonly x: number;
  readonly z: number;
}

/**
 * A point beside the lane. `along` is a fraction of the spawn-to-gate line and
 * may run past either end; `offset` is metres east of it, negative for west.
 */
export function beside(along: number, offset: number): Spot {
  return {
    x: LANE_START.x + LANE_DX * along + EAST_X * offset,
    z: LANE_START.z + LANE_DZ * along + EAST_Z * offset,
  };
}

export interface KeepOut {
  /** Metres of clearance from the spawn-to-gate line. */
  readonly lane: number;
  /** Metres of clearance from the spawn centre, where the flock starts spread. */
  readonly spawn: number;
  /** Margin outside a flattened terrain pad. */
  readonly pad: number;
  /** Inset from the perimeter fence, so nothing grows through a post. */
  readonly fence: number;
}

export const ROCK_KEEP_OUT: KeepOut = { lane: 16, spawn: 24, pad: 3, fence: 6 };
export const FLOWER_KEEP_OUT: KeepOut = { lane: 8, spawn: 16, pad: 2, fence: 3 };
export const LOG_KEEP_OUT: KeepOut = { lane: 16, spawn: 32, pad: 4, fence: 8 };

/** Distance from (x, z) to the nearest point of the spawn-to-gate segment. */
export function laneDistance(x: number, z: number): number {
  const raw = ((x - LANE_START.x) * LANE_DX + (z - LANE_START.z) * LANE_DZ) / LANE_LENGTH_SQUARED;
  const along = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  const dx = x - (LANE_START.x + LANE_DX * along);
  const dz = z - (LANE_START.z + LANE_DZ * along);
  return Math.sqrt(dx * dx + dz * dz);
}

/** True when a point is far enough from everything the dressing must avoid. */
export function isClear(x: number, z: number, keepOut: KeepOut): boolean {
  if (
    x < bounds.minX + keepOut.fence ||
    x > bounds.maxX - keepOut.fence ||
    z < bounds.minZ + keepOut.fence ||
    z > bounds.maxZ - keepOut.fence
  ) {
    return false;
  }
  const spawnX = x - LANE_START.x;
  const spawnZ = z - LANE_START.z;
  if (Math.sqrt(spawnX * spawnX + spawnZ * spawnZ) < keepOut.spawn) return false;
  if (laneDistance(x, z) < keepOut.lane) return false;
  for (const pad of TERRAIN_PADS) {
    if (
      x > pad.minX - keepOut.pad &&
      x < pad.maxX + keepOut.pad &&
      z > pad.minZ - keepOut.pad &&
      z < pad.maxZ + keepOut.pad
    ) {
      return false;
    }
  }
  return true;
}
