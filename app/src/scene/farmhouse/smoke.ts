// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The drift off the chimney. It is the smallest thing in this asset and it is the
 * one that says somebody lives here.
 *
 * FOUR CORRECTIONS, AND THE PLUME IS ALL FOUR OF THEM:
 *
 *  - IT IS UNDER THE SKY IT STANDS ON. The previous plume measured sRGB
 *    (216, 201, 180) against a sky at (171, 169, 175): the brightest thing in a
 *    frame that is meant to be quiet. Woodsmoke is not steam. The banded tone
 *    (farmhouse/palette.ts SMOKE) tops out at luminance 158, and the puffs carry
 *    at most half opacity, so no part of the column can render over the sky
 *    behind it.
 *  - IT HAS NO STRAIGHT EDGES. Five lobes at five latitudes and nine meridians
 *    drew a visibly polygonal silhouette against a clear sky. Nine latitudes and
 *    sixteen meridians put every silhouette edge under two pixels at the distance
 *    this is seen from, and the per-vertex lump is scaled with the radius rather
 *    than fixed, so a big lobe is as soft as a small one.
 *  - IT DISSOLVES. The top three puffs run out from a fifth opacity to a
 *    twentieth, which is under the threshold at which a cel edge can be seen at
 *    all: the column thins into the sky instead of stopping at a rim.
 *  - IT LEANS, AND THE LEAN GROWS. The drift is not linear in height. It goes as
 *    the 1.4 power, which is what wind shear does to a column, so the axis moves
 *    nine metres downwind over nine of rise and reads as air moving rather than
 *    as a mast standing on a stack.
 *
 * IT DOES NOT MOVE. Nothing in this asset runs in a frame (scene/Farmhouse.tsx),
 * and a plume that animated would be the only moving thing in a still cluster
 * ninety metres away, where its motion would arrive as a shimmer rather than as
 * smoke. A held drift, leaning the way the grass leans, reads as a long exposure
 * of the same fire and costs one draw call.
 */

import * as THREE from 'three/webgpu';
import { makeToonMaterial } from '@app/tsl/toon';
import { float, uv } from '@app/tsl/nodes';
import { bandedBase } from './bands';
import { SMOKE } from './palette';

/**
 * Which way the drift leans, matching the field's wind so the smoke and the grass
 * agree about the weather. The pair is the same bearing the grass shader travels
 * its noise along (scene/grass/grassMaterial.ts WIND_X / WIND_Z); it is repeated
 * rather than imported because that constant is internal to the grass material.
 * Hoist it in the cohesion pass.
 */
const WIND: readonly [number, number] = [0.76, 0.65];

/** Metres of drift at one metre of rise, and how the drift accelerates with it. */
const TILT = 0.34;
const SHEAR = 1.4;

/**
 * The column, bottom to top: how far over the pot each puff sits, how wide it is
 * and how much of it is left. The first one starts inside the pot so there is no
 * gap between the masonry and the smoke.
 *
 * The opacities are the dissolve. Nothing over half, and the last two under a
 * tenth, which at this distance is a tone the eye reads as haze rather than as an
 * object with an edge.
 */
const PUFFS: readonly { readonly up: number; readonly r: number; readonly a: number }[] = [
  { up: 0.5, r: 1.0, a: 0.5 },
  { up: 1.7, r: 1.45, a: 0.44 },
  { up: 3.1, r: 1.9, a: 0.34 },
  { up: 4.7, r: 2.35, a: 0.24 },
  { up: 6.4, r: 2.8, a: 0.15 },
  { up: 8.2, r: 3.2, a: 0.08 },
  { up: 10.0, r: 3.5, a: 0.035 },
];

/** Latitude bands and meridians per puff. Past reading as a polygon at 100 m. */
const RINGS = 9;
const SEGS = 16;
/** How far a vertex wanders off the sphere, as a fraction of its radius. */
const LUMP = 0.16;

/** Deterministic wobble in -1..1 from a pair of indices. No Math.random here. */
function wobble(a: number, b: number): number {
  const h = Math.sin(a * 78.233 + b * 12.9898 + 4.1) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
}

/**
 * The plume standing over one chimney. `x`, `z` are the pot in world space and
 * `y` is its mouth; everything above that is smoke.
 */
export function buildSmoke(x: number, y: number, z: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  // Across the wind, for the sideways wander that stops the column reading as a
  // ruled line.
  const sideX = -WIND[1];
  const sideZ = WIND[0];

  for (let p = 0; p < PUFFS.length; p++) {
    const puff = PUFFS[p]!;
    const drift = TILT * Math.pow(puff.up, SHEAR);
    const sway = 0.7 * wobble(p, 11);
    const cx = x + WIND[0] * drift + sideX * sway;
    const cy = y + puff.up;
    const cz = z + WIND[1] * drift + sideZ * sway;

    // The lumpy shell, ring by ring. Radii are hashed off the vertex indices and
    // the puff index, so the same seven clouds come back on every reload and on
    // both renderer backends. The normal is the direction out of the puff's own
    // centre rather than the triangle's plane: the ramp then bands each lobe
    // across its width instead of faceting it.
    const at = (i: number, j: number): Vertex => {
      const phi = (Math.PI * i) / RINGS;
      const theta = (2 * Math.PI * (j % SEGS)) / SEGS;
      const pole = i === 0 || i === RINGS;
      const r = puff.r * (1 + LUMP * wobble(i * 31 + (pole ? 0 : j % SEGS) * 7, p));
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      return {
        p: [cx + r * nx, cy + r * ny * 0.82, cz + r * nz],
        n: [nx, ny, nz],
      };
    };

    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SEGS; j++) {
        const a = at(i, j);
        const b = at(i, j + 1);
        const c = at(i + 1, j + 1);
        const d = at(i + 1, j);
        face(positions, normals, uvs, a, b, c, puff.a);
        face(positions, normals, uvs, a, c, d, puff.a);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.computeBoundingSphere();
  return geometry;
}

/** A point on a puff's shell: where it is, and which way that shell faces. */
interface Vertex {
  readonly p: readonly [number, number, number];
  readonly n: readonly [number, number, number];
}

/** One triangle, each corner keeping its own shell normal and the puff's opacity. */
function face(
  positions: number[],
  normals: number[],
  uvs: number[],
  a: Vertex,
  b: Vertex,
  c: Vertex,
  alpha: number,
): void {
  for (const v of [a, b, c]) {
    positions.push(v.p[0], v.p[1], v.p[2]);
    normals.push(v.n[0], v.n[1], v.n[2]);
    uvs.push(alpha, 0);
  }
}

/**
 * Woodsmoke, through the same ramp as the roof it drifts over. A puff that took a
 * flat tone would have no volume in it however well its silhouette was drawn, and
 * a plume banded by the same sun as the slate under it is the cheapest way to say
 * the two are in one photograph.
 *
 * Front faces only and no depth write: one fragment per puff per pixel keeps the
 * density even across a ball instead of doubling it wherever a back face shows
 * through, and the puffs never carve each other out.
 */
export function makeSmokeMaterial(): THREE.MeshBasicNodeMaterial {
  const material = makeToonMaterial(bandedBase(SMOKE));
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.FrontSide;
  material.opacityNode = uv().x.mul(float(1));
  return material;
}
