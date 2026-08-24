// SPDX-License-Identifier: AGPL-3.0-or-later
// Lifted from sds/shared/SpawnLogic.js; same license and copyright holder.
// Only the non-competitive clustered rejection-sampled ring spawn is ported;
// the competitive branch (generateCompetitiveBalancedSpawns /
// calculateBalancedSpawnClusters) is deliberately left behind.

import { Vector2D } from './Vector2D';
import { isWithinArea, type RectBounds } from './boundary';
import type { Rng } from './rng';

/** Spawn-rejection exclusion rect; same rect shape as the field bounds. */
export type AvoidArea = RectBounds;

/** Cluster center in the XZ plane. */
export interface SpawnClusterCenter {
  x: number;
  z: number;
}

/**
 * Spawn tuning. Every field is optional and carries the sds default; the
 * object itself is required (TypeScript forbids an optional parameter before
 * the required `rng`). Pass `{}` for all-defaults.
 */
export interface SpawnConfig {
  spreadRadius?: number;
  centerX?: number;
  centerZ?: number;
  avoidAreas?: readonly AvoidArea[];
  clusterCenters?: readonly SpawnClusterCenter[] | null;
}

/**
 * Generate initial sheep positions in a clustered formation.
 *
 * Sheep are rejection-sampled inside a ring around each cluster center: pick a
 * uniform angle and a uniform radius up to `spreadRadius`, retry up to 50 times
 * if the point lands outside the 5 m bounds inset or inside an avoid area, and
 * accept the last attempt regardless once the budget runs out (so the flock
 * always has the requested count).
 *
 * @param sheepCount - Number of sheep to position
 * @param bounds - Field boundaries
 * @param config - Configuration options
 * @param rng - REQUIRED PRNG returning [0,1). The caller passes a per-game
 *   seeded mulberry32 so the spawn layout is reproducible for a given seed
 *   (variety still comes from a fresh seed per game).
 * @returns Array of initial positions
 */
export function generateInitialSheepPositions(
  sheepCount: number,
  bounds: RectBounds,
  config: SpawnConfig,
  rng: Rng,
): Vector2D[] {
  const {
    spreadRadius = 30,
    centerX = -30,
    centerZ = -30,
    avoidAreas = [],
    clusterCenters = null,
  } = config;

  const positions: Vector2D[] = [];

  // Use cluster centers if provided, otherwise single center
  const centers: readonly SpawnClusterCenter[] = clusterCenters || [{ x: centerX, z: centerZ }];
  const sheepPerCluster = Math.ceil(sheepCount / centers.length);

  for (let clusterIndex = 0; clusterIndex < centers.length; clusterIndex++) {
    const center = centers[clusterIndex]!;
    const startIndex = clusterIndex * sheepPerCluster;
    const endIndex = Math.min(startIndex + sheepPerCluster, sheepCount);

    for (let i = startIndex; i < endIndex; i++) {
      let position: Vector2D;
      let attempts = 0;
      const maxAttempts = 50;

      do {
        // Random position in this cluster: a uniform direction and a uniform
        // radius, exactly the distribution sds drew with cos/sin of a uniform
        // angle. The direction comes from rejection-sampling the unit disk
        // instead, because Math.cos and Math.sin are implementation-approximated
        // per the ES spec and V8-in-Node and V8-in-Chromium disagree in the last
        // bit - and a last-bit difference in an INITIAL position forks the whole
        // deterministic run (measured: fixture 5090 vs browser 6088 from one
        // such bit on one sheep). Only basic arithmetic and Math.sqrt round
        // identically everywhere, so those are all a spawn may use.
        let ux: number;
        let uz: number;
        let m2: number;
        do {
          ux = rng() * 2 - 1;
          uz = rng() * 2 - 1;
          m2 = ux * ux + uz * uz;
        } while (m2 > 1 || m2 < 1e-12);
        const m = Math.sqrt(m2);
        const distance = rng() * spreadRadius;
        const x = center.x + (ux / m) * distance;
        const z = center.z + (uz / m) * distance;

        position = new Vector2D(x, z);
        attempts++;

        // Check if position is valid (within bounds and not in avoid areas)
        const withinBounds =
          position.x >= bounds.minX + 5 &&
          position.x <= bounds.maxX - 5 &&
          position.z >= bounds.minZ + 5 &&
          position.z <= bounds.maxZ - 5;

        let inAvoidArea = false;
        for (const area of avoidAreas) {
          if (isWithinArea(position, area)) {
            inAvoidArea = true;
            break;
          }
        }

        if (withinBounds && !inAvoidArea) {
          break;
        }
      } while (attempts < maxAttempts);

      positions.push(position);
    }
  }

  return positions;
}
