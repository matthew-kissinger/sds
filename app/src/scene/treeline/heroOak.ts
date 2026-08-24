// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The in-field hero oak: one leader, nine joined bough segments, one connected
 * umbrella canopy and one separate low bramble collar. Every terminal piece of
 * wood ends deep inside the single crown surface; there are no foliage
 * satellites and therefore no seams that can read as floating leaf balloons.
 */

import * as THREE from 'three/webgpu';
import type { Heightfield } from '@app/world/heightfield';
import {
  TRUNK_SINK,
  fitCrown,
  limbRotation,
  limbTip,
  type CanopyPlacement,
  type ShrubPlacement,
  type TrunkPlacement,
} from './placement';
import {
  BOLE,
  BOUGHS,
  HEART,
  HERO,
  HERO_SHRUBS,
  JOINT_LAP,
  OUTER_GIRTH,
  ROOTS,
  type Bough,
} from './oakSkeleton';

function plantBough(
  bough: Bough,
  ground: number,
  treeId: number,
  trunks: TrunkPlacement[],
): void {
  let foot = new THREE.Vector3(HERO.x, ground + bough.from, HERO.z);
  let girth = bough.diameter;
  let parent = treeId;

  for (let index = 0; index < bough.segments.length; index++) {
    const segment = bough.segments[index]!;
    const limb = {
      diameter: girth,
      length: segment.length,
      ...limbRotation(bough.yaw, segment.lean),
    };
    const support = trunks.length;
    trunks.push({
      x: foot.x,
      y: foot.y,
      z: foot.z,
      diameter: limb.diameter,
      length: limb.length,
      yaw: limb.yaw,
      tiltX: limb.tiltX,
      tiltZ: limb.tiltZ,
      tint: 0.44,
      shade: 1,
      treeId,
      terminal: index === bough.segments.length - 1 ? 1 : 0,
      parent,
      collisionRadius: 0,
    });
    const run = limbTip(limb);
    const tip = foot.clone().add(run);
    const nextGirth = girth * OUTER_GIRTH;
    foot = tip.clone().addScaledVector(run.clone().normalize(), -nextGirth * JOINT_LAP);
    girth = nextGirth;
    parent = support;
  }
}

export function plantHeroOak(
  field: Heightfield,
  canopies: CanopyPlacement[],
  trunks: TrunkPlacement[],
  shrubs: ShrubPlacement[],
): void {
  const ground = field.groundY(HERO.x, HERO.z);
  const treeId = trunks.length;
  trunks.push({
    x: HERO.x,
    y: ground - TRUNK_SINK,
    z: HERO.z,
    diameter: BOLE.diameter,
    length: BOLE.length + TRUNK_SINK,
    yaw: BOLE.yaw,
    tiltX: BOLE.tiltX,
    tiltZ: BOLE.tiltZ,
    tint: 0.5,
    shade: 0,
    treeId,
    terminal: 1,
    parent: -1,
    collisionRadius: 0,
  });

  for (const root of ROOTS) {
    const rotation = limbRotation(root.yaw, root.lean);
    trunks.push({
      x: HERO.x,
      y: ground - 0.24,
      z: HERO.z,
      diameter: root.diameter,
      length: root.length,
      yaw: rotation.yaw,
      tiltX: rotation.tiltX,
      tiltZ: rotation.tiltZ,
      tint: 0.48,
      shade: 0,
      treeId,
      terminal: 0,
      parent: treeId,
      collisionRadius: 0,
    });
  }

  for (const bough of BOUGHS) plantBough(bough, ground, treeId, trunks);

  const crown = fitCrown(HEART.width, HEART.height, 2.3);
  canopies.push({
    x: HERO.x + HEART.dx,
    y: ground + HEART.dy - crown.height * 0.5,
    z: HERO.z + HEART.dz,
    width: crown.width,
    height: crown.height,
    depth: HEART.depth,
    yaw: HEART.yaw,
    tiltX: 0,
    tiltZ: 0,
    tint: HEART.tint,
    turn: 0,
    family: 0,
    support: treeId,
    treeId,
    belt: 3,
    collisionRadius: 0,
  });

  for (const authored of HERO_SHRUBS) {
    const shrubX = HERO.x + authored.dx;
    const shrubZ = HERO.z + authored.dz;
    shrubs.push({
      x: shrubX,
      y: field.groundY(shrubX, shrubZ) - 0.17,
      z: shrubZ,
      width: authored.width,
      height: authored.height + 0.17,
      depth: authored.depth,
      yaw: authored.yaw,
      tint: authored.tint,
      treeId,
      belt: 3,
      collisionRadius: 0,
    });
  }
}
