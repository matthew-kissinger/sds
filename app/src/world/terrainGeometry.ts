// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The displaced ground, built once from the baked grid.
 *
 * One geometry, two parts, no seam between them:
 *
 *  - the footprint: a `width - 1` square grid over the manifest's worldSize,
 *    with vertex (ix, iz) sitting exactly on grid sample (ix, iz). No
 *    resampling, no second displacement pass, no falloff applied here - the
 *    bake already faded the edge to zero. That exact correspondence is what
 *    lets `Heightfield.groundY` be the drawn surface rather than a guess at it
 *    (see heightfieldSampler.ts).
 *  - the skirt: a flat ring from the footprint edge out to the horizon, at
 *    y = 0, which is exactly where the faded footprint edge sits. Same
 *    geometry, same material, one draw call, and nothing to catch the light
 *    where the roll ends.
 *
 * Quads split on the south-west to north-east diagonal, matching
 * PlaneGeometry's index order, because `meshSampleY` interpolates against that
 * split.
 */

import * as THREE from 'three/webgpu';
import type { Heightfield } from './heightfieldSampler';

/**
 * How far the flat skirt reaches, metres from the origin. Far enough that the
 * ground runs well into Atmosphere's fog before it ends (so the horizon is
 * haze, not a line), close enough that its corners stay inside the camera's
 * 1200 m far plane (so it never clips to sky).
 */
export const HORIZON_EXTENT = 700;

export function buildTerrainGeometry(field: Heightfield): THREE.BufferGeometry {
  const { width, worldSize, spacing } = field.manifest;
  const half = worldSize / 2;
  const quads = width - 1;

  const gridVertices = width * width;
  const skirtVertices = 8 * 4;
  const positions = new Float32Array((gridVertices + skirtVertices) * 3);
  const indices = new Uint32Array((quads * quads + 8) * 6);

  let p = 0;
  for (let iz = 0; iz < width; iz++) {
    const z = -half + iz * spacing;
    for (let ix = 0; ix < width; ix++) {
      positions[p++] = -half + ix * spacing;
      positions[p++] = field.data[iz * width + ix]!;
      positions[p++] = z;
    }
  }

  let i = 0;
  for (let iz = 0; iz < quads; iz++) {
    for (let ix = 0; ix < quads; ix++) {
      const a = iz * width + ix;
      const b = (iz + 1) * width + ix;
      const c = (iz + 1) * width + ix + 1;
      const d = iz * width + ix + 1;
      indices[i++] = a;
      indices[i++] = b;
      indices[i++] = d;
      indices[i++] = b;
      indices[i++] = c;
      indices[i++] = d;
    }
  }

  // The skirt: eight flat quads (four sides, four corners) filling the ring
  // between the footprint and the horizon. Written as independent quads rather
  // than a strip so the corners stay coplanar and no diagonal shows.
  const h = half;
  const o = HORIZON_EXTENT;
  const ring: [number, number, number, number][] = [
    [-h, h, -o, -h], // south edge
    [-h, h, h, o], // north edge
    [-o, -h, -h, h], // west edge
    [h, o, -h, h], // east edge
    [-o, -h, -o, -h], // south-west corner
    [h, o, -o, -h], // south-east corner
    [-o, -h, h, o], // north-west corner
    [h, o, h, o], // north-east corner
  ];
  let vertex = gridVertices;
  for (const [x0, x1, z0, z1] of ring) {
    const base = vertex;
    for (const [x, z] of [
      [x0, z0],
      [x0, z1],
      [x1, z1],
      [x1, z0],
    ] as const) {
      positions[p++] = x;
      positions[p++] = 0;
      positions[p++] = z;
      vertex++;
    }
    indices[i++] = base;
    indices[i++] = base + 1;
    indices[i++] = base + 3;
    indices[i++] = base + 1;
    indices[i++] = base + 2;
    indices[i++] = base + 3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
