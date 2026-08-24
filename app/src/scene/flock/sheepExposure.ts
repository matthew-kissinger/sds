// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The exposure bake: for every vertex on the sheep, how much of the outline hull
 * it is allowed to carry.
 *
 * THIS IS THE FIX FOR THE INK INSIDE THE ANIMAL. The sheep is a union of about
 * twenty closed volumes - a dozen wool puffs, a neck-and-skull loft, two ears,
 * four legs - and an inverted hull pushes EVERY back face outward, including the
 * ones buried inside a neighbouring volume. Where a buried face happens to
 * emerge in front of the surface that covers it, the hull draws a closed line in
 * the middle of the body: the concentric ring the critic found on the rump, and
 * the stroke it found in the dead centre of the barrel. Widening the line, which
 * the same critic also asked for, makes that worse in exact proportion.
 *
 * So the bake asks one question per vertex - is this point inside some OTHER
 * volume - and hands the answer to the material as a per-vertex weight. A vertex
 * that is buried expands by nothing, so it cannot draw. A vertex on the true
 * silhouette expands by the full width. There is no runtime cost: this is
 * arithmetic at geometry build time, once for the whole flock.
 *
 * The volumes are approximated as ellipsoids, which is exact for the wool (the
 * puffs ARE ellipsoids, give or take the lump field) and generous for the head
 * and the legs, where a capsule bounding each segment is close enough that a
 * buried leg top is buried and an exposed shank is exposed.
 *
 * THE THRESHOLDS ARE NARROW AND THE MATERIAL DOES THE REST. Calling burial the
 * moment a vertex is inside anything at all was tried and measured: the crest
 * lobes sit ON the stations, so most of a lobe's surface is inside a station
 * ellipsoid, and the gate ate the line along the top of the animal - a scan
 * across the crest in the Follow frame showed a single transition pixel where it
 * should show two of ink. So the gate stays tight, 0.90 to 1.06, and the buried
 * end of it is spent making the hull RETREAT rather than merely stop
 * (sheepMaterial.ts). A buried face pulled inward cannot emerge at any width,
 * and the true silhouette keeps its ink.
 */

import * as THREE from 'three/webgpu';
import { type Puff, puffMatrix } from './woolPuffs';

/** Below this fraction of a neighbour's radius a vertex carries no hull. */
const BURIED = 0.9;
/** Above this it carries all of it. */
const CLEAR = 1.06;

/**
 * One occluding volume: the inverse of the transform that takes a unit sphere
 * onto it, plus the id of the part that owns it. A vertex is tested against
 * every volume whose owner is not its own part, so a puff never buries itself.
 */
export interface Volume {
  readonly owner: number;
  readonly inverse: THREE.Matrix4;
}

/** The volume of one wool puff, exactly as `woolPuff` places it. */
export function puffVolume(puff: Puff, owner: number): Volume {
  return { owner, inverse: puffMatrix(puff).invert() };
}

/**
 * A rounded volume around a lofted segment: an axis-aligned ellipsoid centred
 * between two rings and sized to contain both. Used for the neck rings buried in
 * the shoulder wool and for the leg tops buried in the flank, neither of which
 * needs to be tight - it only has to know that they are inside something.
 */
export function segmentVolume(
  owner: number,
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  radius: number,
): Volume {
  const half: [number, number, number] = [
    Math.abs(to[0] - from[0]) / 2 + radius,
    Math.abs(to[1] - from[1]) / 2 + radius,
    Math.abs(to[2] - from[2]) / 2 + radius,
  ];
  const matrix = new THREE.Matrix4()
    .makeScale(half[0], half[1], half[2])
    .premultiply(
      new THREE.Matrix4().makeTranslation(
        (from[0] + to[0]) / 2,
        (from[1] + to[1]) / 2,
        (from[2] + to[2]) / 2,
      ),
    );
  return { owner, inverse: matrix.invert() };
}

/**
 * How much hull one vertex carries: 0 buried, 1 in open air.
 *
 * Reuses one scratch vector across the whole bake rather than allocating per
 * test. The bake runs once, but it runs over every vertex times every volume,
 * and a few hundred thousand short-lived vectors is a stall on the first frame.
 */
const probe = new THREE.Vector3();

export function exposureAt(volumes: readonly Volume[], owner: number, x: number, y: number, z: number): number {
  let weight = 1;
  for (const volume of volumes) {
    if (volume.owner === owner) continue;
    probe.set(x, y, z).applyMatrix4(volume.inverse);
    const radius = probe.length();
    if (radius >= CLEAR) continue;
    if (radius <= BURIED) return 0;
    // Linear rather than smoothstep: this weight multiplies a width that is
    // itself a fraction of a pixel at the fade's edge, and a curve there costs
    // arithmetic to describe something no camera can resolve.
    const open = (radius - BURIED) / (CLEAR - BURIED);
    if (open < weight) weight = open;
  }
  return weight;
}
