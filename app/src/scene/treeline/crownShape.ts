// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * One shared crown geometry made from three closed, interlocking leaf masses.
 *
 * A crown is still one instanced mesh and one draw. The separate welded shells
 * provide large lobes, deep cut-ins and small sky notches that survive the
 * gameplay camera. `crownPart` identifies each shell so the one canopy TSL
 * material can shade the whole kit as one crown. Family silhouette comes from
 * deterministic instance scale and depth, not a second mesh or draw.
 */

import * as THREE from 'three/webgpu';

const SIDES = 12;
const RINGS = [
  { rise: 0.03, radius: 0.14 },
  { rise: 0.16, radius: 0.68 },
  { rise: 0.36, radius: 1 },
  { rise: 0.58, radius: 0.96 },
  { rise: 0.76, radius: 0.74 },
  { rise: 0.9, radius: 0.42 },
  { rise: 0.98, radius: 0.12 },
] as const;

interface LobeSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly phase: number;
  readonly lean: number;
}

/** Three broad masses overlap deeply enough to remain one crown, while their
 * offset shoulders leave two readable cut-ins at gameplay distance. Family
 * spacing and aspect are applied by the one canopy material, so this stays one
 * geometry and one crown draw. */
const LOBES: readonly LobeSpec[] = [
  { x: -0.25, y: 0.48, z: 0.03, width: 0.74, height: 0.66, depth: 0.72, phase: 1.4, lean: -0.025 },
  { x: -0.01, y: 0.58, z: -0.02, width: 0.84, height: 0.78, depth: 0.8, phase: 0.2, lean: 0.025 },
  { x: 0.26, y: 0.47, z: -0.04, width: 0.72, height: 0.64, depth: 0.7, phase: 2.7, lean: 0.04 },
] as const;

interface CrownData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly parts: Float32Array;
  readonly indices: Uint16Array;
}

function buildCrownData(): CrownData {
  const positions: number[] = [];
  const normals: number[] = [];
  const parts: number[] = [];
  const indices: number[] = [];

  const vertex = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    part: number,
  ): number => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    const length = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / length, ny / length, nz / length);
    parts.push(part);
    return index;
  };

  for (let part = 0; part < LOBES.length; part++) {
    const lobe = LOBES[part]!;
    const bottom = vertex(lobe.x, lobe.y - lobe.height * 0.5, lobe.z, 0, -1, 0, part);
    const firstRing = positions.length / 3;

    for (const ring of RINGS) {
      for (let side = 0; side < SIDES; side++) {
        const theta = (side / SIDES) * Math.PI * 2;
        const outline = 1
          + 0.13 * Math.cos(theta * 3 + lobe.phase)
          + 0.07 * Math.cos(theta * 5 - lobe.phase * 0.7);
        const shoulder = Math.sin(Math.PI * ring.rise);
        const ridge = shoulder * (
          0.045 * Math.cos(theta * 2 + lobe.phase)
          + 0.026 * Math.sin(theta * 5 - lobe.phase)
        );
        const radius = ring.radius * outline;
        const nx = Math.sin(theta) / lobe.width;
        const ny = ((ring.rise - 0.48) * 2.1) / lobe.height;
        const nz = Math.cos(theta) / lobe.depth;
        vertex(
          lobe.x + Math.sin(theta) * radius * lobe.width * 0.5 + ring.rise * lobe.lean,
          lobe.y + (ring.rise - 0.5) * lobe.height + ridge * lobe.height,
          lobe.z + Math.cos(theta) * radius * lobe.depth * 0.5,
          nx,
          ny,
          nz,
          part,
        );
      }
    }

    const top = vertex(lobe.x + lobe.lean, lobe.y + lobe.height * 0.5, lobe.z, 0, 1, 0, part);
    for (let side = 0; side < SIDES; side++) {
      const next = (side + 1) % SIDES;
      indices.push(bottom, firstRing + next, firstRing + side);
    }
    for (let ring = 0; ring < RINGS.length - 1; ring++) {
      const a = firstRing + ring * SIDES;
      const b = a + SIDES;
      for (let side = 0; side < SIDES; side++) {
        const next = (side + 1) % SIDES;
        indices.push(a + side, a + next, b + side, a + next, b + next, b + side);
      }
    }
    const last = firstRing + (RINGS.length - 1) * SIDES;
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
  const height = maxY - minY;
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] = positions[index]! / (maxX * 2);
    positions[index + 1] = (positions[index + 1]! - minY) / height;
    positions[index + 2] = positions[index + 2]! / (maxZ * 2);
    // One smooth crown-scale normal field crosses every lobe. Per-lobe radial
    // normals repeated the lit band as a bright vertical stripe on each shell;
    // this keeps the scalloped geometry while the light reads one broad mass.
    const nx = positions[index]! * 1.1;
    const ny = (positions[index + 1]! - 0.42) * 0.9;
    const nz = positions[index + 2]! * 1.1;
    const normalLength = Math.hypot(nx, ny, nz) || 1;
    normals[index] = nx / normalLength;
    normals[index + 1] = ny / normalLength;
    normals[index + 2] = nz / normalLength;
  }

  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    parts: Float32Array.from(parts),
    indices: Uint16Array.from(indices),
  };
}

const CROWN = buildCrownData();

/** A conservative support envelope for structural diagnostics. The visible
 * surface intentionally contains notches, but every terminal fork must remain
 * inside this outer leaf-mass envelope. */
export function crownEnvelopeAt(localY: number, _theta: number): {
  readonly centreX: number;
  readonly centreZ: number;
  readonly radius: number;
} {
  const y = Math.min(1, Math.max(0, localY));
  const round = Math.sqrt(Math.max(0, 1 - Math.pow((y - 0.53) / 0.58, 2)));
  return {
    centreX: 0.025 + y * 0.025,
    centreZ: 0.015,
    radius: 0.16 + round * 0.36,
  };
}

export function buildCrownGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(CROWN.positions.slice(), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(CROWN.normals.slice(), 3));
  geometry.setAttribute('crownPart', new THREE.BufferAttribute(CROWN.parts.slice(), 1));
  geometry.setIndex(new THREE.BufferAttribute(CROWN.indices.slice(), 1));
  geometry.computeBoundingSphere();
  return geometry;
}
