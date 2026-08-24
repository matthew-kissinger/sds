// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import type { Heightfield } from '@app/world/heightfield';
import { buildCrownGeometry, crownEnvelopeAt } from './crownShape';
import { limbTip, type CanopyPlacement, type TreelinePlacement, type TrunkPlacement } from './placement';
import { skyGap } from './ringShape';

/** Canopy wind is horizontal only. */
export const TREE_VERTICAL_DRIFT_MAX = 0;
/** Terminal wood must remain this far inside the actual saddle-cut crown ray.
 * The remaining 38% radius covers macro notches and the 4.8% horizontal sway. */
export const TREE_WOOD_ENVELOPE_LIMIT = 0.62;

export interface TreelineDiagnostics {
  readonly treeGroundErrorMax: number;
  readonly treeSupportGapMax: number;
  readonly treeUnsupported: number;
  readonly treeVerticalDriftMax: number;
  readonly treeRootedCrownCount: number;
  readonly treeCanopyInstancesMax: number;
  readonly treeSingleCanopyViolations: number;
  readonly treeLeaderPenetrationMin: number;
  readonly treeLeaderEnvelopeMax: number;
  readonly treeBranchEnvelopeMax: number;
  readonly treeBranchEnvelopeByFamily: readonly [number, number, number, number];
  readonly treeExposedWoodByFamily: readonly [number, number, number, number];
  readonly treeBranchLocalYMinByFamily: readonly [number, number, number, number];
  readonly treeBranchLocalYMaxByFamily: readonly [number, number, number, number];
  readonly treeExposedWoodTips: number;
  readonly treeBrokenWoodJoints: number;
  readonly treeTerminalBoughMin: number;
  readonly treeHeroTerminalBoughs: number;
  readonly treeBroadOrchardSplayMinDegrees: number;
  readonly treeWindsweptBranchDownwindShare: number;
  readonly treeWindsweptCrownDownwindMinShare: number;
  readonly treeCrownBaseShareMin: number;
  readonly treeCrownBaseShareMax: number;
  readonly treeBeltCounts: readonly [number, number, number];
  readonly treeNearestNeighborMin: readonly [number, number, number];
  readonly treeMaxGapDegrees: readonly [number, number, number];
  readonly treeSecondGapDegrees: readonly [number, number, number];
  readonly treeCompositeMaxGapDegrees: number;
  readonly treeCompositeSecondGapDegrees: number;
  readonly treeNearNonAuthoredMaxGapDegrees: number;
  readonly treeNearCrownTouchShare: number;
  readonly treeQuadrantMinShare: readonly [number, number, number];
  readonly treeQuadrantMaxShare: readonly [number, number, number];
  readonly treeShrubRootGapMax: number;
  readonly treeShrubDetached: number;
  readonly treeShrubBurialMin: number;
  readonly treeShrubBurialMax: number;
  readonly treeShrubAspectMin: number;
  readonly treeShrubAspectMax: number;
  readonly treeShrubHeightShareMax: number;
  readonly treeShrubGroupMin: number;
  readonly treeShrubGroupMax: number;
}

interface Point {
  readonly x: number;
  readonly z: number;
}

function tipOf(limb: TrunkPlacement): { x: number; y: number; z: number } {
  const run = limbTip(limb);
  return { x: limb.x + run.x, y: limb.y + run.y, z: limb.z + run.z };
}

function groundGap(y0: number, y1: number, ground: number): number {
  const low = Math.min(y0, y1);
  const high = Math.max(y0, y1);
  if (ground < low) return low - ground;
  if (ground > high) return ground - high;
  return 0;
}

/** Ratio of a wood tip's planar reach to the actual authored crown surface at
 * the same height and bearing. One is the surface, smaller is safely buried. */
function crownEnvelopeRatio(
  crown: CanopyPlacement,
  point: { readonly x: number; readonly y: number; readonly z: number },
): { ratio: number; localY: number } {
  const localY = (point.y - crown.y) / crown.height;
  if (localY <= 0 || localY >= 1) return { ratio: Number.POSITIVE_INFINITY, localY };
  const dx = point.x - crown.x;
  const dz = point.z - crown.z;
  const cos = Math.cos(crown.yaw);
  const sin = Math.sin(crown.yaw);
  const localX = (cos * dx - sin * dz) / crown.width;
  const localZ = (sin * dx + cos * dz) / crown.depth;
  // The upper-centre offset is independent of bearing. One first estimate is
  // enough to select the ray; the second samples its exact saddle profile.
  let theta = Math.atan2(localX, localZ);
  let envelope = crownEnvelopeAt(localY, theta);
  theta = Math.atan2(localX - envelope.centreX, localZ - envelope.centreZ);
  envelope = crownEnvelopeAt(localY, theta);
  const distance = Math.hypot(localX - envelope.centreX, localZ - envelope.centreZ);
  return { ratio: distance / Math.max(0.0001, envelope.radius), localY };
}

function angularGapRecords(points: readonly Point[]): { degrees: number; midpoint: number }[] {
  if (points.length < 2) return [{ degrees: 360, midpoint: 0 }];
  const bearings = points.map((point) => Math.atan2(point.x, point.z)).sort((a, b) => a - b);
  const gaps: { degrees: number; midpoint: number }[] = [];
  for (let index = 0; index < bearings.length; index++) {
    const a = bearings[index]!;
    const b = index === bearings.length - 1 ? bearings[0]! + Math.PI * 2 : bearings[index + 1]!;
    let midpoint = (a + b) * 0.5;
    if (midpoint > Math.PI) midpoint -= Math.PI * 2;
    gaps.push({ degrees: ((b - a) * 180) / Math.PI, midpoint });
  }
  return gaps.sort((a, b) => b.degrees - a.degrees);
}

function angularGaps(points: readonly Point[]): [number, number] {
  const gaps = angularGapRecords(points);
  return [gaps[0]!.degrees, gaps[1]?.degrees ?? gaps[0]!.degrees];
}

function nearestNeighbor(points: readonly Point[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) {
      nearest = Math.min(nearest, Math.hypot(points[a]!.x - points[b]!.x, points[a]!.z - points[b]!.z));
    }
  }
  return nearest;
}

function crownReachToward(crown: CanopyPlacement, dx: number, dz: number): number {
  const distance = Math.hypot(dx, dz) || 1;
  const worldX = dx / distance;
  const worldZ = dz / distance;
  const cos = Math.cos(crown.yaw);
  const sin = Math.sin(crown.yaw);
  const localX = cos * worldX - sin * worldZ;
  const localZ = sin * worldX + cos * worldZ;
  return 0.5 / Math.max(
    0.0001,
    Math.hypot(localX / crown.width, localZ / crown.depth),
  );
}

function bearingDelta(a: number, b: number): number {
  let delta = Math.abs(a - b);
  if (delta > Math.PI) delta = Math.PI * 2 - delta;
  return delta;
}

export function measureTreeline(
  placement: TreelinePlacement,
  field: Heightfield,
): TreelineDiagnostics {
  let treeGroundErrorMax = 0;
  for (const shrub of placement.shrubs) {
    const ground = field.groundY(shrub.x, shrub.z);
    treeGroundErrorMax = Math.max(
      treeGroundErrorMax,
      groundGap(shrub.y, shrub.y + shrub.height, ground),
    );
  }
  for (const trunk of placement.trunks) {
    if (trunk.shade !== 0) continue;
    const ground = field.groundY(trunk.x, trunk.z);
    const tip = tipOf(trunk);
    treeGroundErrorMax = Math.max(treeGroundErrorMax, groundGap(trunk.y, tip.y, ground));
  }

  const crownsByTree = new Map<number, CanopyPlacement[]>();
  for (const crown of placement.canopies) {
    const crowns = crownsByTree.get(crown.treeId);
    if (crowns === undefined) crownsByTree.set(crown.treeId, [crown]);
    else crowns.push(crown);
  }
  const crownByTree = new Map<number, CanopyPlacement>();
  let treeCanopyInstancesMax = 0;
  let treeSingleCanopyViolations = 0;
  for (const [treeId, crowns] of crownsByTree) {
    treeCanopyInstancesMax = Math.max(treeCanopyInstancesMax, crowns.length);
    if (crowns.length !== 1) treeSingleCanopyViolations++;
    crownByTree.set(treeId, crowns[0]!);
  }

  let treeUnsupported = 0;
  let treeSupportGapMax = 0;
  let treeLeaderPenetrationMin = Number.POSITIVE_INFINITY;
  let treeLeaderEnvelopeMax = 0;
  let treeBranchEnvelopeMax = 0;
  const treeBranchEnvelopeByFamily: [number, number, number, number] = [0, 0, 0, 0];
  const treeExposedWoodByFamily: [number, number, number, number] = [0, 0, 0, 0];
  const treeBranchLocalYMinByFamily: [number, number, number, number] = [1, 1, 1, 1];
  const treeBranchLocalYMaxByFamily: [number, number, number, number] = [0, 0, 0, 0];
  let treeExposedWoodTips = 0;
  let treeBrokenWoodJoints = 0;
  let treeCrownBaseShareMin = Number.POSITIVE_INFINITY;
  let treeCrownBaseShareMax = 0;

  const terminalBoughs = new Map<number, TrunkPlacement[]>();
  for (let index = 0; index < placement.trunks.length; index++) {
    const trunk = placement.trunks[index]!;
    const crown = crownByTree.get(trunk.treeId);
    if (crown === undefined) {
      treeUnsupported++;
      continue;
    }
    if (trunk.shade === 1) {
      const parent = placement.trunks[trunk.parent];
      if (parent === undefined || parent.treeId !== trunk.treeId) treeBrokenWoodJoints++;
      if (trunk.terminal === 0) {
        const childIndex = placement.trunks.findIndex((candidate) => candidate.parent === index);
        const child = placement.trunks[childIndex];
        if (child === undefined || child.treeId !== trunk.treeId) {
          treeBrokenWoodJoints++;
        } else {
          const tip = tipOf(trunk);
          const jointGap = Math.hypot(tip.x - child.x, tip.y - child.y, tip.z - child.z);
          if (jointGap > Math.max(trunk.diameter, child.diameter) * 1.1) treeBrokenWoodJoints++;
        }
      }
    }
    if (trunk.terminal !== 1) continue;

    const envelope = crownEnvelopeRatio(crown, tipOf(trunk));
    if (trunk.shade === 0 && index === trunk.treeId) {
      treeLeaderEnvelopeMax = Math.max(treeLeaderEnvelopeMax, envelope.ratio);
      treeLeaderPenetrationMin = Math.min(treeLeaderPenetrationMin, envelope.localY);
      const ground = field.groundY(trunk.x, trunk.z);
      const total = crown.y + crown.height - ground;
      const baseShare = (crown.y - ground) / Math.max(0.001, total);
      treeCrownBaseShareMin = Math.min(treeCrownBaseShareMin, baseShare);
      treeCrownBaseShareMax = Math.max(treeCrownBaseShareMax, baseShare);
      if (crown.support !== index || crown.treeId !== index) treeUnsupported++;
    } else if (trunk.shade === 1) {
      treeBranchEnvelopeMax = Math.max(treeBranchEnvelopeMax, envelope.ratio);
      treeBranchEnvelopeByFamily[crown.family] = Math.max(
        treeBranchEnvelopeByFamily[crown.family] ?? 0,
        envelope.ratio,
      );
      treeBranchLocalYMinByFamily[crown.family] = Math.min(
        treeBranchLocalYMinByFamily[crown.family] ?? 1,
        envelope.localY,
      );
      treeBranchLocalYMaxByFamily[crown.family] = Math.max(
        treeBranchLocalYMaxByFamily[crown.family] ?? 0,
        envelope.localY,
      );
      const list = terminalBoughs.get(trunk.treeId);
      if (list === undefined) terminalBoughs.set(trunk.treeId, [trunk]);
      else list.push(trunk);
    }
    if (!Number.isFinite(envelope.ratio) || envelope.ratio > TREE_WOOD_ENVELOPE_LIMIT) {
      treeExposedWoodTips++;
      treeExposedWoodByFamily[crown.family] = (treeExposedWoodByFamily[crown.family] ?? 0) + 1;
      treeSupportGapMax = Number.isFinite(envelope.ratio)
        ? Math.max(treeSupportGapMax, (envelope.ratio - 1) * Math.min(crown.width, crown.depth) * 0.5)
        : Number.POSITIVE_INFINITY;
      if (envelope.ratio > 1 || !Number.isFinite(envelope.ratio)) treeUnsupported++;
    }
  }

  let treeTerminalBoughMin = Number.POSITIVE_INFINITY;
  let treeHeroTerminalBoughs = 0;
  let treeBroadOrchardSplayMinDegrees = Number.POSITIVE_INFINITY;
  let windsweptTerminals = 0;
  let windsweptDownwind = 0;
  let treeWindsweptCrownDownwindMinShare = Number.POSITIVE_INFINITY;
  const crownGeometry = buildCrownGeometry();
  const crownPositions = crownGeometry.getAttribute('position');
  for (const [treeId, crown] of crownByTree) {
    const branches = terminalBoughs.get(treeId) ?? [];
    if (crown.belt === 3) treeHeroTerminalBoughs = branches.length;
    else treeTerminalBoughMin = Math.min(treeTerminalBoughMin, branches.length);

    const leader = placement.trunks[treeId];
    if (leader === undefined) continue;
    if ((crown.family === 0 || crown.family === 2) && crown.belt !== 3 && branches.length >= 2) {
      const bearings = branches.map((branch) => {
        const run = limbTip(branch);
        return Math.atan2(run.x, run.z);
      });
      let widest = 0;
      for (let a = 0; a < bearings.length; a++) {
        for (let b = a + 1; b < bearings.length; b++) {
          widest = Math.max(widest, bearingDelta(bearings[a]!, bearings[b]!));
        }
      }
      treeBroadOrchardSplayMinDegrees = Math.min(
        treeBroadOrchardSplayMinDegrees,
        (widest * 180) / Math.PI,
      );
    }
    if (crown.family === 3 && crown.belt !== 3) {
      // Windswept crowns point their authored +X axis downwind. The leader's
      // stored Euler yaw is a decomposed limb rotation, not the original world
      // bearing, so deriving this from it would measure the wrong direction.
      const downwindX = Math.cos(crown.yaw);
      const downwindZ = -Math.sin(crown.yaw);
      for (const branch of branches) {
        const run = limbTip(branch);
        const dx = run.x;
        const dz = run.z;
        windsweptTerminals++;
        if (dx * downwindX + dz * downwindZ > 0) windsweptDownwind++;
      }
      const cos = Math.cos(crown.yaw);
      const sin = Math.sin(crown.yaw);
      let minProjection = Number.POSITIVE_INFINITY;
      let maxProjection = Number.NEGATIVE_INFINITY;
      for (let vertex = 0; vertex < crownPositions.count; vertex++) {
        const localX = crownPositions.getX(vertex) * crown.width;
        const localZ = crownPositions.getZ(vertex) * crown.depth;
        const worldX = crown.x + cos * localX + sin * localZ;
        const worldZ = crown.z - sin * localX + cos * localZ;
        const projection = (worldX - leader.x) * downwindX + (worldZ - leader.z) * downwindZ;
        minProjection = Math.min(minProjection, projection);
        maxProjection = Math.max(maxProjection, projection);
      }
      const span = Math.max(0.0001, maxProjection - minProjection);
      treeWindsweptCrownDownwindMinShare = Math.min(
        treeWindsweptCrownDownwindMinShare,
        maxProjection / span,
      );
    }
  }
  crownGeometry.dispose();

  const beltRoots: [Point[], Point[], Point[]] = [[], [], []];
  for (const crown of placement.canopies) {
    if (crown.belt < 0 || crown.belt > 2) continue;
    const leader = placement.trunks[crown.treeId];
    if (leader !== undefined) beltRoots[crown.belt]!.push({ x: leader.x, z: leader.z });
  }
  const treeBeltCounts = beltRoots.map((points) => points.length) as [number, number, number];
  const treeNearestNeighborMin = beltRoots.map(nearestNeighbor) as [number, number, number];
  const treeMaxGapDegrees: [number, number, number] = [0, 0, 0];
  const treeSecondGapDegrees: [number, number, number] = [0, 0, 0];
  const treeQuadrantMinShare: [number, number, number] = [0, 0, 0];
  const treeQuadrantMaxShare: [number, number, number] = [0, 0, 0];
  for (let belt = 0; belt < 3; belt++) {
    const points = beltRoots[belt]!;
    [treeMaxGapDegrees[belt], treeSecondGapDegrees[belt]] = angularGaps(points);
    const quadrants = [0, 0, 0, 0];
    for (const point of points) {
      const quadrant = (point.x >= 0 ? 0 : 2) + (point.z >= 0 ? 0 : 1);
      quadrants[quadrant] = (quadrants[quadrant] ?? 0) + 1;
    }
    const shares = quadrants.map((count) => count / Math.max(1, points.length));
    treeQuadrantMinShare[belt] = Math.min(...shares);
    treeQuadrantMaxShare[belt] = Math.max(...shares);
  }
  const [treeCompositeMaxGapDegrees, treeCompositeSecondGapDegrees] = angularGaps(
    beltRoots.flat(),
  );
  const nearNonAuthoredGaps = angularGapRecords(beltRoots[0]).filter(
    (gap) => skyGap(gap.midpoint) >= 0.98,
  );
  const treeNearNonAuthoredMaxGapDegrees = nearNonAuthoredGaps[0]?.degrees ?? 0;
  const nearCrowns = placement.canopies.filter((crown) => crown.belt === 0);
  let touchingNearCrowns = 0;
  for (let a = 0; a < nearCrowns.length; a++) {
    const crown = nearCrowns[a]!;
    let touches = false;
    for (let b = 0; b < nearCrowns.length; b++) {
      if (a === b) continue;
      const other = nearCrowns[b]!;
      const dx = other.x - crown.x;
      const dz = other.z - crown.z;
      const distance = Math.hypot(dx, dz);
      const joinedReach =
        crownReachToward(crown, dx, dz) + crownReachToward(other, -dx, -dz);
      if (distance <= joinedReach * 1.15) {
        touches = true;
        break;
      }
    }
    if (touches) touchingNearCrowns++;
  }
  const treeNearCrownTouchShare = nearCrowns.length === 0
    ? 0
    : touchingNearCrowns / nearCrowns.length;

  const shrubGroups = new Map<number, typeof placement.shrubs>();
  for (const shrub of placement.shrubs) {
    const group = shrubGroups.get(shrub.treeId);
    if (group === undefined) shrubGroups.set(shrub.treeId, [shrub]);
    else shrubGroups.set(shrub.treeId, [...group, shrub]);
  }
  let treeShrubRootGapMax = 0;
  let treeShrubDetached = 0;
  let treeShrubBurialMin = Number.POSITIVE_INFINITY;
  let treeShrubBurialMax = 0;
  let treeShrubAspectMin = Number.POSITIVE_INFINITY;
  let treeShrubAspectMax = 0;
  let treeShrubHeightShareMax = 0;
  for (const shrub of placement.shrubs) {
    const crown = crownByTree.get(shrub.treeId);
    const leader = placement.trunks[shrub.treeId];
    const rootGap = leader === undefined
      ? Number.POSITIVE_INFINITY
      : Math.hypot(shrub.x - leader.x, shrub.z - leader.z);
    treeShrubRootGapMax = Math.max(treeShrubRootGapMax, rootGap);
    if (
      crown === undefined ||
      leader === undefined ||
      shrub.belt !== crown.belt ||
      rootGap > 6
    ) treeShrubDetached++;

    const ground = field.groundY(shrub.x, shrub.z);
    const burial = (ground - shrub.y) / shrub.height;
    treeShrubBurialMin = Math.min(treeShrubBurialMin, burial);
    treeShrubBurialMax = Math.max(treeShrubBurialMax, burial);
    const aspect = shrub.width / shrub.height;
    treeShrubAspectMin = Math.min(treeShrubAspectMin, aspect);
    treeShrubAspectMax = Math.max(treeShrubAspectMax, aspect);
    if (crown !== undefined) {
      treeShrubHeightShareMax = Math.max(treeShrubHeightShareMax, shrub.height / crown.height);
    }

  }

  const shrubGroupCounts = [...shrubGroups.values()].map((group) => group.length);
  return {
    treeGroundErrorMax,
    treeSupportGapMax,
    treeUnsupported,
    treeVerticalDriftMax: TREE_VERTICAL_DRIFT_MAX,
    treeRootedCrownCount: crownsByTree.size,
    treeCanopyInstancesMax,
    treeSingleCanopyViolations,
    treeLeaderPenetrationMin: Number.isFinite(treeLeaderPenetrationMin) ? treeLeaderPenetrationMin : 0,
    treeLeaderEnvelopeMax,
    treeBranchEnvelopeMax,
    treeBranchEnvelopeByFamily,
    treeExposedWoodByFamily,
    treeBranchLocalYMinByFamily,
    treeBranchLocalYMaxByFamily,
    treeExposedWoodTips,
    treeBrokenWoodJoints,
    treeTerminalBoughMin: Number.isFinite(treeTerminalBoughMin) ? treeTerminalBoughMin : 0,
    treeHeroTerminalBoughs,
    treeBroadOrchardSplayMinDegrees: Number.isFinite(treeBroadOrchardSplayMinDegrees)
      ? treeBroadOrchardSplayMinDegrees
      : 0,
    treeWindsweptBranchDownwindShare:
      windsweptTerminals === 0 ? 0 : windsweptDownwind / windsweptTerminals,
    treeWindsweptCrownDownwindMinShare: Number.isFinite(treeWindsweptCrownDownwindMinShare)
      ? treeWindsweptCrownDownwindMinShare
      : 0,
    treeCrownBaseShareMin: Number.isFinite(treeCrownBaseShareMin) ? treeCrownBaseShareMin : 0,
    treeCrownBaseShareMax,
    treeBeltCounts,
    treeNearestNeighborMin,
    treeMaxGapDegrees,
    treeSecondGapDegrees,
    treeCompositeMaxGapDegrees,
    treeCompositeSecondGapDegrees,
    treeNearNonAuthoredMaxGapDegrees,
    treeNearCrownTouchShare,
    treeQuadrantMinShare,
    treeQuadrantMaxShare,
    treeShrubRootGapMax,
    treeShrubDetached,
    treeShrubBurialMin: Number.isFinite(treeShrubBurialMin) ? treeShrubBurialMin : 0,
    treeShrubBurialMax,
    treeShrubAspectMin: Number.isFinite(treeShrubAspectMin) ? treeShrubAspectMin : 0,
    treeShrubAspectMax,
    treeShrubHeightShareMax,
    treeShrubGroupMin: shrubGroupCounts.length === 0 ? 0 : Math.min(...shrubGroupCounts),
    treeShrubGroupMax: shrubGroupCounts.length === 0 ? 0 : Math.max(...shrubGroupCounts),
  };
}
