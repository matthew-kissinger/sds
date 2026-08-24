// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Four closed, interlocking bramble mounds in one shared geometry and draw.
 * Their low travelling ridges and unequal tops separate the hedge from both
 * the grass blades below and the tree crowns above. */

import * as THREE from 'three/webgpu';

const SIDES = 10;
const RINGS = [
  { rise: 0.05, radius: 0.48 },
  { rise: 0.28, radius: 1 },
  { rise: 0.62, radius: 0.84 },
  { rise: 0.88, radius: 0.36 },
] as const;
const MOUNDS = [
  { x: -0.24, y: 0.34, z: 0.02, w: 0.82, h: 0.5, d: 0.74, phase: 0.2 },
  { x: 0.24, y: 0.38, z: -0.05, w: 0.86, h: 0.58, d: 0.7, phase: 1.8 },
  { x: 0.02, y: 0.31, z: 0.24, w: 0.88, h: 0.44, d: 0.68, phase: 3.1 },
  { x: 0.04, y: 0.33, z: -0.24, w: 0.76, h: 0.47, d: 0.66, phase: 4.7 },
] as const;

export function buildShrubGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  const vertex = (x: number, y: number, z: number): number => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    return index;
  };

  for (const mound of MOUNDS) {
    const bottom = vertex(mound.x, mound.y - mound.h * 0.5, mound.z);
    const first = positions.length / 3;
    for (const ring of RINGS) {
      for (let side = 0; side < SIDES; side++) {
        const theta = (side / SIDES) * Math.PI * 2;
        const irregular = 1
          + 0.18 * Math.cos(theta * 3 + mound.phase)
          + 0.09 * Math.cos(theta * 5 - mound.phase);
        const ridge = Math.sin(Math.PI * ring.rise) * 0.07
          * Math.sin(theta * 4 + mound.phase);
        const radius = ring.radius * irregular;
        vertex(
          mound.x + Math.sin(theta) * radius * mound.w * 0.5 + ring.rise * 0.035,
          mound.y + (ring.rise - 0.5) * mound.h + ridge * mound.h,
          mound.z + Math.cos(theta) * radius * mound.d * 0.5,
        );
      }
    }
    const top = vertex(mound.x + 0.035, mound.y + mound.h * 0.5, mound.z);
    for (let side = 0; side < SIDES; side++) {
      const next = (side + 1) % SIDES;
      indices.push(bottom, first + next, first + side);
    }
    for (let ring = 0; ring < RINGS.length - 1; ring++) {
      const a = first + ring * SIDES;
      const b = a + SIDES;
      for (let side = 0; side < SIDES; side++) {
        const next = (side + 1) % SIDES;
        indices.push(a + side, a + next, b + side, a + next, b + next, b + side);
      }
    }
    const last = first + (RINGS.length - 1) * SIDES;
    for (let side = 0; side < SIDES; side++) {
      indices.push(last + side, last + ((side + 1) % SIDES), top);
    }
  }

  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxX = 0;
  let maxZ = 0;
  for (let index = 0; index < positions.length; index += 3) {
    maxX = Math.max(maxX, Math.abs(positions[index]!));
    minY = Math.min(minY, positions[index + 1]!);
    maxY = Math.max(maxY, positions[index + 1]!);
    maxZ = Math.max(maxZ, Math.abs(positions[index + 2]!));
  }
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] = positions[index]! / (maxX * 2);
    positions[index + 1] = (positions[index + 1]! - minY) / (maxY - minY);
    positions[index + 2] = positions[index + 2]! / (maxZ * 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
