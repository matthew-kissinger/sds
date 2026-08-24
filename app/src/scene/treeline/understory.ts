// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Low bramble planted only at real tree roots.
 *
 * This is deliberately a separate asset from the crowns. One irregular wedge
 * per selected root is written to `shrubs`, rendered with its own low-profile
 * geometry and cool dark ramp. It cannot inherit crown sway, crown proportions
 * or the balloon silhouette that made the old shared canopy path read as loose
 * foliage on the pasture.
 */

import type { Heightfield } from '@app/world/heightfield';
import { TAU, hashUnit, insidePad } from './ringShape';
import type { CanopyPlacement, ShrubPlacement, TrunkPlacement } from './placement';

/** Share of rooted trees that receive one bramble wedge. Deep ranks need only
 * occasional dark contact; their trunks and haze already carry the ground. */
const ROOT_SHARE = [0.54, 0.36, 0.04] as const;
const FIELD_FLOOR = 108;
const STREAM = 211;
/** One authored blackthorn read against the east fence in ordinary Follow. */
const FENCE_HEDGE_TARGET = { x: 132, z: 100 } as const;

function pushShrub(
  shrubs: ShrubPlacement[],
  field: Heightfield,
  treeId: number,
  belt: number,
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  yaw: number,
  tint: number,
): void {
  if (insidePad(x, z)) return;
  if (Math.max(Math.abs(x), Math.abs(z)) < FIELD_FLOOR) return;
  shrubs.push({
    x,
    // A small sink keeps every footprint under the grass even across a sloped
    // heightfield. The wedge itself is only 0.4-0.7 m tall above that contact.
    y: field.groundY(x, z) - 0.16,
    z,
    width,
    height: height + 0.16,
    depth,
    yaw,
    tint,
    treeId,
    belt,
    collisionRadius: 0,
  });
}

export function plantUnderstory(
  field: Heightfield,
  canopies: readonly CanopyPlacement[],
  trunks: readonly TrunkPlacement[],
  shrubs: ShrubPlacement[],
): void {
  for (const crown of canopies) {
    if (crown.belt < 0 || crown.belt > 2) continue;
    const leader = trunks[crown.treeId];
    if (leader === undefined) continue;
    const share = ROOT_SHARE[crown.belt] ?? 0;
    if (hashUnit(crown.treeId, STREAM) > share) continue;

    const baseBearing = hashUnit(crown.treeId, STREAM + 1) * TAU;
    const groupSize =
      2 +
      (hashUnit(crown.treeId, STREAM + 9) < 0.34 ? 1 : 0) +
      (hashUnit(crown.treeId, STREAM + 10) < 0.08 ? 1 : 0);
    for (let member = 0; member < groupSize; member++) {
      const seed = crown.treeId * 5 + member;
      const bearing =
        baseBearing + member * 2.399963229728653 + (hashUnit(seed, STREAM + 2) - 0.5) * 0.45;
      const away = 0.35 + hashUnit(seed, STREAM + 3) * 0.55;
      const requestedVisibleHeight =
        (0.36 + hashUnit(seed, STREAM + 4) * 0.24) * (1 - crown.belt * 0.08);
      // Leave a small serialization margin under the 25% silhouette cap. The
      // manifest stores float32 values, so authoring exactly on the boundary
      // can round a valid wedge a few ulps above it after rebake.
      const visibleHeight = Math.min(requestedVisibleHeight, crown.height * 0.249 - 0.16);
      const totalHeight = visibleHeight + 0.16;
      const width = totalHeight * (2.35 + hashUnit(seed, STREAM + 5) * 0.7);
      const depth = width * (0.48 + hashUnit(seed, STREAM + 6) * 0.24);
      pushShrub(
        shrubs,
        field,
        crown.treeId,
        crown.belt,
        leader.x + Math.sin(bearing) * away,
        leader.z + Math.cos(bearing) * away,
        width,
        depth,
        visibleHeight,
        bearing + (hashUnit(seed, STREAM + 7) - 0.5) * 0.7,
        0.08 + hashUnit(seed, STREAM + 11) * 0.34,
      );
    }
  }

  // Promote the existing rooted group nearest the fence target. This changes
  // no draw or instance count: three shared shrub wedges simply interlock into
  // one low, dark hedge mass instead of disappearing into the grass texture.
  let hedgeTreeId = -1;
  let hedgeDistance = Number.POSITIVE_INFINITY;
  for (const crown of canopies) {
    if (crown.belt !== 0 || !shrubs.some((shrub) => shrub.treeId === crown.treeId)) continue;
    const distance = Math.hypot(crown.x - FENCE_HEDGE_TARGET.x, crown.z - FENCE_HEDGE_TARGET.z);
    if (distance < hedgeDistance) {
      hedgeDistance = distance;
      hedgeTreeId = crown.treeId;
    }
  }
  const hedgeCrown = canopies.find((crown) => crown.treeId === hedgeTreeId);
  if (hedgeCrown !== undefined) {
    for (let index = 0; index < shrubs.length; index++) {
      const shrub = shrubs[index]!;
      if (shrub.treeId !== hedgeTreeId) continue;
      const height = Math.min(shrub.height * 1.65, hedgeCrown.height * 0.245);
      shrubs[index] = {
        ...shrub,
        y: field.groundY(shrub.x, shrub.z) - height * 0.24,
        width: shrub.width * 2.35,
        height,
        depth: shrub.depth * 1.9,
        tint: -1,
      };
    }
  }
}
