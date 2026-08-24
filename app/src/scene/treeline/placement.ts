// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * What a planted tree is, as data, and the one routine that turns a standing
 * tree into instances.
 *
 * A tree is emitted as one rooted leader, two exposed root runs, authored
 * boughs, and exactly one shared-geometry canopy. There is no trunkless path for a
 * tree. Low scrub is a separate asset authored in understory.ts.
 */

import * as THREE from 'three/webgpu';
import type { Heightfield } from '@app/world/heightfield';
import { trunkTipOffset } from './trunkShape';

/** One instance of the canopy geometry, in metres. */
export interface CanopyPlacement {
  readonly x: number;
  /** World Y of the crown's lowest point. */
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  /** Crown depth perpendicular to its authored broad silhouette. */
  readonly depth: number;
  readonly yaw: number;
  readonly tiltX: number;
  readonly tiltZ: number;
  /** Bounded per-tree brightness seed, 0 to 1. */
  readonly tint: number;
  /** How far into autumn this whole crown is, 0 to 1. */
  readonly turn: number;
  /** Authored silhouette family. 0 broad rooted oak, 1 rounded elm, 2 airy
   * ash, 3 field oak. Each tree owns exactly one canopy instance. */
  readonly family: number;
  /** Index of the rooted leader carrying this crown. */
  readonly support: number;
  /** Stable rooted-tree identity. It is the leader's trunk index, so the bake
   * can prove every shrub and terminal belongs to a real tree root. */
  readonly treeId: number;
  /** Placement belt of the parent tree: 0 near, 1 middle, 2 far, 3 hero. */
  readonly belt: number;
  /** Separate visual collision radius required by the placement manifest.
   *  Trees are presentation-only in v1, so this is explicitly zero. */
  readonly collisionRadius: number;
}

/** One low, wide bramble wedge. Shrubs deliberately do not share the crown
 * geometry or material path, so they cannot read as fallen tree canopies. */
export interface ShrubPlacement {
  readonly x: number;
  /** World Y of the wedge's base. */
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly yaw: number;
  readonly tint: number;
  /** Rooted leader this bramble grows from. */
  readonly treeId: number;
  /** Parent tree belt: 0 near, 1 middle, 2 far, 3 hero. */
  readonly belt: number;
  readonly collisionRadius: number;
}

/** One instance of the trunk geometry. Boles and the hero oak's boughs. */
export interface TrunkPlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly diameter: number;
  readonly length: number;
  readonly yaw: number;
  readonly tiltX: number;
  readonly tiltZ: number;
  readonly tint: number;
  /** 1 for a bough running through its own crown, 0 for a bole in open air.
   *  A limb inside the canopy mass is in the canopy's shade. */
  readonly shade: number;
  /** Stable rooted-tree identity. The leader's own instance index is used so
   * diagnostics can prove every terminal fork ends inside that tree's single
   * watertight crown. */
  readonly treeId: number;
  /** 1 for a leader or final bough segment whose tip must be buried inside the
   * crown; 0 for exposed roots and intermediate, lapped bough segments. */
  readonly terminal: number;
  /** Parent wood instance. -1 for the rooted leader; root runs and first forks
   * point at the leader, chained hero segments point at the preceding bough. */
  readonly parent: number;
  /** Separate from the visible diameter even though v1 does not collide with
   *  scenery. Keeping it explicit prevents render scale becoming gameplay. */
  readonly collisionRadius: number;
}

export interface TreelinePlacement {
  readonly canopies: readonly CanopyPlacement[];
  readonly shrubs: readonly ShrubPlacement[];
  readonly trunks: readonly TrunkPlacement[];
}

/**
 * Metres of bole buried below `groundY`. The ground rolls and a trunk's own
 * footprint spans a few centimetres of it, so a bole seated exactly on the
 * sampled height opens a sliver of daylight on the downhill side.
 */
export const TRUNK_SINK = 0.35;

/**
 * Small belt trees still need a bole that survives haze and a gameplay camera.
 * This is a world-space floor, not camera-relative LOD: the same baked tree is
 * rendered on every backend and from every camera.
 */
export const MIN_LEADER_DIAMETER = 0.62;

/**
 * Conservative default aspect limit. Families pass their own explicit wide
 * and tall limits to `fitCrown`; callers without an authored silhouette use
 * this balanced fallback.
 */
export const MAX_ASPECT = 1.6;

/** Clamp a crown into explicit wide and tall aspect limits while preserving
 * its requested area. Returns metres. */
export function fitCrown(
  width: number,
  height: number,
  maxWide: number = MAX_ASPECT,
  maxTall: number = MAX_ASPECT,
): { width: number; height: number } {
  const mean = Math.sqrt(width * height);
  if (height > width * maxTall) {
    return { width: mean / Math.sqrt(maxTall), height: mean * Math.sqrt(maxTall) };
  }
  if (width > height * maxWide) {
    return { width: mean * Math.sqrt(maxWide), height: mean / Math.sqrt(maxWide) };
  }
  return { width, height };
}

/**
 * One tree, as the planters describe it: a place, a size, and how much of it is
 * bole. Everything downstream is derived.
 */
export interface StandingTree {
  readonly x: number;
  readonly z: number;
  /** World Y the tree stands on, including any visual lift its belt has taken. */
  readonly ground: number;
  /** Overall height, ground to crown top, metres. */
  readonly height: number;
  /** Crown width, metres. */
  readonly width: number;
  /** Bole diameter as a fraction of tree height. */
  readonly slenderness: number;
  readonly yaw: number;
  readonly tiltX: number;
  readonly tiltZ: number;
  readonly tint: number;
  readonly turn: number;
  /** 0 broad rooted oak, 1 rounded elm, 2 airy ash, 3 field oak. */
  readonly family: number;
  /** 0 near, 1 middle, 2 far. */
  readonly belt: number;
}

/**
 * Where the tip of a limb ends up, relative to its own foot, in world metres.
 *
 * Every crown in the game is placed from this, which is the structural half of
 * the headless-trunk fix: a crown does not sit above a tree's ROOTS, it sits on
 * the end of the limb that carries it, and a limb that tapers, bows and leans
 * can finish more than a metre away from the axis it left. Solving it once here
 * means the belts and the hero oak cannot disagree about where a limb ends.
 *
 * Allocated per call and called only at mount, never in a frame.
 */
export function limbTip(limb: {
  diameter: number;
  length: number;
  yaw: number;
  tiltX: number;
  tiltZ: number;
}): THREE.Vector3 {
  const offset = trunkTipOffset();
  return new THREE.Vector3(offset.x * limb.diameter, limb.length, offset.z * limb.diameter).applyEuler(
    new THREE.Euler(limb.tiltX, limb.yaw, limb.tiltZ),
  );
}

/** Euler rotation for a +Y-authored limb with an exact world bearing and lean.
 * A local-axis twist keeps the baked bow from pointing the same way on every
 * fork without changing the limb's centre line. */
export function limbRotation(
  bearing: number,
  lean: number,
): { yaw: number; tiltX: number; tiltZ: number } {
  const direction = new THREE.Vector3(
    Math.sin(bearing) * Math.sin(lean),
    Math.cos(lean),
    Math.cos(bearing) * Math.sin(lean),
  );
  const orientation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction,
  );
  orientation.multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), bearing),
  );
  const euler = new THREE.Euler().setFromQuaternion(orientation, 'XYZ');
  return { yaw: euler.y, tiltX: euler.x, tiltZ: euler.z };
}

/**
 * Emit one tree into the two instance lists. The ONLY producer of trunks.
 */
export function emitTree(
  tree: StandingTree,
  canopies: CanopyPlacement[],
  trunks: TrunkPlacement[],
): void {
  // The leader is emitted first, so its index is a deterministic tree identity
  // shared by its crown and shrubs. This is bake metadata only; it does not
  // create a runtime hierarchy or another draw call.
  const treeId = trunks.length;

  /** Place the tree's one procedural crown from its centre. Its irregular
   * outline is authored by compact, deeply interlocking lobe shells. */
  const crown = (
    centre: THREE.Vector3,
    width: number,
    height: number,
    depth: number,
    support: number,
  ): void => {
    canopies.push({
      x: centre.x,
      y: centre.y - height * 0.5,
      z: centre.z,
      width,
      height,
      depth,
      // The crown's upper travel points along local +X. Rotate that
      // shoulder over the middle of each family's forks so the timber remains
      // buried in foliage rather than ending under the opposite saddle.
      yaw: tree.yaw + ([-1.34, -1.51, -1.53, -Math.PI * 0.5][tree.family] ?? -1.34),
      tiltX: 0,
      tiltZ: 0,
      tint: tree.tint,
      turn: tree.turn,
      family: tree.family,
      support,
      treeId,
      belt: tree.belt,
      collisionRadius: 0,
    });
  };

  /** Add a limb and return the actual bowed, tilted world-space tip that the
   *  foliage must overlap. Branch feet sit inside the parent shaft so there is
   *  no open joint or unsupported visual gap. */
  const limb = (
    foot: THREE.Vector3,
    diameter: number,
    length: number,
    bearing: number,
    lean: number,
    shade: number,
    terminal: number,
    parent: number,
  ): { support: number; tip: THREE.Vector3 } => {
    const rotation = limbRotation(bearing, lean);
    const placed: TrunkPlacement = {
      x: foot.x,
      y: foot.y,
      z: foot.z,
      diameter,
      length,
      yaw: rotation.yaw,
      tiltX: rotation.tiltX,
      tiltZ: rotation.tiltZ,
      tint: tree.tint,
      shade,
      treeId,
      terminal,
      parent,
      collisionRadius: 0,
    };
    const support = trunks.length;
    trunks.push(placed);
    return { support, tip: foot.clone().add(limbTip(placed)) };
  };

  const trunkLength = tree.height * ([0.68, 0.72, 0.55, 0.62][tree.family] ?? 0.62);
  const leaderRotation = tree.family === 3
    ? { yaw: tree.yaw, tiltX: 0, tiltZ: 0 }
    : { yaw: tree.yaw, tiltX: tree.tiltX, tiltZ: tree.tiltZ };
  const leader: TrunkPlacement = {
    x: tree.x,
    y: tree.ground - TRUNK_SINK,
    z: tree.z,
    diameter: Math.max(MIN_LEADER_DIAMETER, tree.height * tree.slenderness),
    length: trunkLength + TRUNK_SINK,
    yaw: leaderRotation.yaw,
    tiltX: leaderRotation.tiltX,
    tiltZ: leaderRotation.tiltZ,
    tint: tree.tint,
    shade: 0,
    treeId,
    terminal: 1,
    parent: -1,
    collisionRadius: 0,
  };
  const leaderSupport = trunks.length;
  trunks.push(leader);
  const leaderBase = new THREE.Vector3(tree.x, tree.ground - TRUNK_SINK, tree.z);
  const leaderRun = limbTip(leader);
  const leaderTip = leaderBase.clone().add(leaderRun);

  // Two exposed root runs make the contact read from the low Follow camera.
  // Beyond the readable front rank the leader's baked flare and contact pool
  // carry the same job, avoiding hundreds of sub-pixel instances in the bake.
  if (Math.max(Math.abs(tree.x), Math.abs(tree.z)) <= 156) {
    for (const offset of [-0.8, 1.55]) {
      limb(
        new THREE.Vector3(tree.x, tree.ground - 0.22, tree.z),
        leader.diameter * 0.5,
        Math.max(1.25, leader.diameter * 1.5),
        tree.yaw + offset,
        1.28,
        0,
        0,
        treeId,
      );
    }
  }

  const branch = (
    from: number,
    bearingOffset: number,
    length: number,
    lean: number,
    diameter: number,
  ): { support: number; tip: THREE.Vector3 } =>
    limb(
      leaderBase.clone().addScaledVector(
        leaderRun,
        Math.min(1, (tree.height * from + TRUNK_SINK) / leader.length),
      ),
      tree.height * diameter,
      tree.height * length,
      tree.yaw + bearingOffset,
      lean,
      1,
      1,
      treeId,
    );

  // Sparse buried branch anchors support placement diagnostics. Sourced
  // candidates render their own complete wood silhouette at runtime.
  if (tree.family === 1) {
    branch(0.34, -0.52, 0.3, 0.09, 0.076);
    branch(0.35, 0.64, 0.28, 0.08, 0.068);
  } else if (tree.family === 2) {
    branch(0.29, -0.78, 0.28, 0.35, 0.086);
    branch(0.3, 0.86, 0.27, 0.34, 0.082);
  } else if (tree.family === 3) {
    branch(0.29, -0.2, 0.29, 0.34, 0.09);
    branch(0.3, 0.22, 0.27, 0.32, 0.08);
  } else {
    branch(0.29, -0.72, 0.3, 0.28, 0.092);
    branch(0.3, 1.18, 0.29, 0.27, 0.086);
  }

  // One shared lobe kit, four unmistakable world-space envelopes. Oak owns a
  // low umbrella, elm a narrow vase, ash a shallow plane whose separated upper
  // shells read as clumps, and field oak the broadest wind-shaped shoulder.
  const rawCrownHeight = tree.height * ([0.55, 0.84, 0.78, 0.52][tree.family] ?? 0.55);
  const rawCrownWidth = tree.width * ([1.28, 0.7, 1.08, 1.2][tree.family] ?? 1.28);
  const crownAspect = fitCrown(
    rawCrownWidth,
    rawCrownHeight,
    [2.25, 1.15, 1.55, 2.3][tree.family] ?? 2.25,
    [1.25, 2.1, 1.45, 1.2][tree.family] ?? 1.25,
  );
  const crownDepth = crownAspect.width * ([0.88, 0.68, 0.44, 0.62][tree.family] ?? 0.88);
  const centreY = tree.ground + tree.height * ([0.58, 0.69, 0.62, 0.56][tree.family] ?? 0.58);
  const downwind = tree.family === 3 ? tree.height * 0.11 : 0;
  const centre = new THREE.Vector3(
    leaderTip.x + Math.sin(tree.yaw) * downwind,
    centreY,
    leaderTip.z + Math.cos(tree.yaw) * downwind,
  );
  crown(
    centre,
    crownAspect.width,
    crownAspect.height,
    crownDepth,
    leaderSupport,
  );
}

/** The ground a tree stands on, sampled once. Kept here so no planter samples
 *  the heightfield with its own convention. */
export function standOn(field: Heightfield, x: number, z: number, lift: number): number {
  return field.groundY(x, z) + lift;
}
