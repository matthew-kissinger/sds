// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The drift off the chimney. It is the smallest thing in this asset and it is the
 * one that says somebody lives here.
 *
 * IT RISES, AND THAT IS THE CORRECTION THIS PASS IS BUILT AROUND. The plume used
 * to be a held drift: seven puffs frozen in a leaning column, argued for on the
 * grounds that motion at ninety metres would arrive as a shimmer. It does not. A
 * column of smoke is the one shape in a landscape that the eye knows cannot be
 * still, so holding it still does not read as a long exposure - it reads as a
 * grey sculpture bolted to the roof, in a frame where the grass, the flock and
 * the dog are all moving. What makes the motion legible rather than busy is its
 * RATE: a puff takes seven seconds to climb eleven metres, a metre and a half a
 * second, slower than anything else on screen and far under the speed at which a
 * distant object flickers instead of travelling.
 *
 * NOTHING RUNS IN A FRAME TO DO IT. There is still no useFrame in this asset and
 * no particle system. The geometry is nine puff SLOTS built once; every vertex
 * carries the pot it leaves from, its own unit lobe and its slot's phase, and the
 * vertex stage places it from `time`. A slot climbs, swells, thins and is reborn
 * at the pot, so the column is continuously remade for one draw call, no CPU work
 * and no buffer upload. The anchor is the pot for every vertex, so the bounding
 * sphere is walked here rather than computed from the attribute.
 *
 * FOUR THINGS SURVIVE FROM THE HELD VERSION BECAUSE THEY WERE RIGHT:
 *
 *  - IT IS UNDER THE SKY IT STANDS ON. An earlier plume measured sRGB
 *    (216, 201, 180) against a sky at (171, 169, 175): the brightest thing in a
 *    frame that is meant to be quiet. Woodsmoke is not steam. The banded tone
 *    (farmhouse/palette.ts SMOKE) tops out at luminance 158, and no puff carries
 *    more than half opacity, so no part of the column can render over the sky
 *    behind it.
 *  - IT HAS NO STRAIGHT EDGES. Five lobes at five latitudes and nine meridians
 *    drew a visibly polygonal silhouette against a clear sky. Nine latitudes and
 *    sixteen meridians put every silhouette edge under two pixels at the distance
 *    this is seen from, and the per-vertex lump is scaled with the radius rather
 *    than fixed, so a big lobe is as soft as a small one.
 *  - IT DISSOLVES. A slot runs out from its opening value to nothing over the
 *    back of its climb, under the threshold at which a cel edge can be seen at
 *    all, so the column thins into the sky instead of stopping at a rim. Now that
 *    a slot is reborn rather than parked, that dissolve is also the whole reason
 *    the loop cannot be seen: a puff is already invisible before it recycles.
 *  - IT LEANS, AND THE LEAN GROWS. The drift is not linear in height. It goes as
 *    the 1.4 power, which is what wind shear does to a column, so the axis moves
 *    ten metres downwind over eleven of rise and reads as air moving rather than
 *    as a mast standing on a stack.
 */

import * as THREE from 'three/webgpu';
import { makeToonMaterial } from '@app/tsl/toon';
import {
  attribute,
  float,
  fract,
  max,
  pow,
  sin,
  smoothstep,
  time,
  uv,
  vec3,
} from '@app/tsl/nodes';
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
 * The column, as slots rather than as fixed puffs.
 *
 * Nine of them, evenly spread round one cycle, so a puff leaves the pot every
 * four fifths of a second and the gap above it is always filled by the swell of
 * the one below. Seven seconds to the top is a rise of 1.5 m/s.
 */
const SLOTS = 9;
const PERIOD = 7.2;
/** How far a slot climbs in one cycle, and what it swells from and to. */
const RISE = 11;
const RADIUS_AT_POT = 0.85;
const RADIUS_GROWTH = 2.9;
/**
 * The dissolve. A slot opens over the first tenth of its climb, so it is not born
 * at full strength in the pot's mouth, then runs out as the 1.7 power of what is
 * left of the cycle.
 */
const PEAK = 0.46;
const OPEN = 0.1;
const FADE = 1.7;
/** How far a slot wanders across the wind, how far that opens out, how it turns. */
const SWAY = 0.85;
const SWAY_SPREAD = 0.1;
const SWAY_TURN = 0.55;

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
 *
 * Every vertex gets the pot as its position. Where it actually lands is the
 * vertex stage's business (see `makeSmokeMaterial`): this only has to say which
 * slot a vertex belongs to, how far out of that slot's centre it sits, and how
 * far across the wind the slot wanders.
 */
export function buildSmoke(x: number, y: number, z: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const lobes: number[] = [];

  for (let s = 0; s < SLOTS; s++) {
    const seed = s / SLOTS;
    const sway = SWAY * wobble(s, 11);

    // The lumpy unit shell, ring by ring. Radii are hashed off the vertex indices
    // and the slot index, so the same nine clouds come back on every reload and
    // on both renderer backends. The normal is the direction out of the slot's
    // own centre rather than the triangle's plane: the ramp then bands each lobe
    // across its width instead of faceting it.
    const at = (i: number, j: number): Vertex => {
      const phi = (Math.PI * i) / RINGS;
      const theta = (2 * Math.PI * (j % SEGS)) / SEGS;
      const pole = i === 0 || i === RINGS;
      const lump = 1 + LUMP * wobble(i * 31 + (pole ? 0 : j % SEGS) * 7, s);
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      return { n: [nx, ny, nz], l: [nx * lump, ny * lump * 0.82, nz * lump] };
    };

    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SEGS; j++) {
        const a = at(i, j);
        const b = at(i, j + 1);
        const c = at(i + 1, j + 1);
        const d = at(i + 1, j);
        face(positions, normals, uvs, lobes, [x, y, z], [a, b, c], seed, sway);
        face(positions, normals, uvs, lobes, [x, y, z], [a, c, d], seed, sway);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute('lobe', new THREE.BufferAttribute(new Float32Array(lobes), 3));
  geometry.boundingSphere = plumeBounds(x, y, z);
  return geometry;
}

/**
 * The volume the column sweeps over one cycle. Every vertex sits at the pot until
 * the vertex stage moves it, so a sphere computed from the attribute would be a
 * point and the plume would vanish the moment the pot left the frustum. Walked
 * rather than estimated: the same climb, drift and swell the shader runs.
 */
function plumeBounds(x: number, y: number, z: number): THREE.Sphere {
  const low: number[] = [x, y, z];
  const high: number[] = [x, y, z];
  for (let step = 0; step <= 16; step++) {
    const phase = step / 16;
    const rise = phase * RISE;
    const drift = TILT * Math.pow(rise, SHEAR);
    const reach = RADIUS_AT_POT + phase * RADIUS_GROWTH + SWAY * (1 + SWAY_SPREAD * rise);
    const at = [x + WIND[0] * drift, y + rise, z + WIND[1] * drift];
    for (let axis = 0; axis < 3; axis++) {
      low[axis] = Math.min(low[axis]!, at[axis]! - reach);
      high[axis] = Math.max(high[axis]!, at[axis]! + reach);
    }
  }
  const centre = new THREE.Vector3(
    (low[0]! + high[0]!) / 2,
    (low[1]! + high[1]!) / 2,
    (low[2]! + high[2]!) / 2,
  );
  return new THREE.Sphere(
    centre,
    new THREE.Vector3(high[0]!, high[1]!, high[2]!).distanceTo(centre),
  );
}

/** A point on a slot's shell: which way it faces, and how far out of centre. */
interface Vertex {
  readonly n: readonly [number, number, number];
  readonly l: readonly [number, number, number];
}

/** One triangle, each corner keeping its shell normal, its lobe and its slot. */
function face(
  positions: number[],
  normals: number[],
  uvs: number[],
  lobes: number[],
  pot: readonly [number, number, number],
  corners: readonly [Vertex, Vertex, Vertex],
  seed: number,
  sway: number,
): void {
  for (const v of corners) {
    positions.push(pot[0], pot[1], pot[2]);
    normals.push(v.n[0], v.n[1], v.n[2]);
    uvs.push(seed, sway);
    lobes.push(v.l[0], v.l[1], v.l[2]);
  }
}

/**
 * Woodsmoke, through the same ramp as the roof it drifts over, placed and faded
 * by the vertex stage.
 *
 * A puff that took a flat tone would have no volume in it however well its
 * silhouette was drawn, and a plume banded by the same sun as the slate under it
 * is the cheapest way to say the two are in one photograph.
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

  // Where this slot is in its cycle: 0 in the pot's mouth, 1 gone.
  const phase = fract(time.mul(float(1 / PERIOD)).add(uv().x));
  const rise = phase.mul(float(RISE));
  const radius = float(RADIUS_AT_POT).add(phase.mul(float(RADIUS_GROWTH)));

  // The lean, as the 1.4 power of the rise. The epsilon keeps the pow off zero,
  // where a fractional exponent is not defined on every backend.
  const drift = pow(rise.add(float(0.001)), float(SHEAR)).mul(float(TILT));
  // The wander across the wind. It opens out as the puff climbs and turns as it
  // goes, so the nine slots are a snaking ribbon rather than nine fixed rays.
  const snake = uv()
    .y.mul(float(1).add(rise.mul(float(SWAY_SPREAD))))
    .mul(sin(rise.mul(float(SWAY_TURN)).add(uv().y.mul(float(7.1)))));

  material.positionNode = attribute('position', 'vec3')
    .add(
      vec3(
        drift.mul(float(WIND[0])).sub(snake.mul(float(WIND[1]))),
        rise,
        drift.mul(float(WIND[1])).add(snake.mul(float(WIND[0]))),
      ),
    )
    .add(attribute('lobe', 'vec3').mul(radius));

  material.opacityNode = smoothstep(float(0), float(OPEN), phase)
    .mul(pow(max(float(1).sub(phase), float(0)), float(FADE)))
    .mul(float(PEAK));

  return material;
}
