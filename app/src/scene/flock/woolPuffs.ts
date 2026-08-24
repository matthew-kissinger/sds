// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The fleece primitive: a rounded puff of wool, and the seeded lump field that
 * keeps any one of them from reading as a machined sphere.
 *
 * A sheep's wool is built as a cluster of these rather than as one displaced
 * ellipsoid, and the reason is worth keeping. The first pass of the asset was a
 * single ellipsoid with the lump field pushed hard into it, and it came back as
 * a segmented grub: smooth normals over broad swellings put the toon ramp's
 * terminator around each swelling in turn, so the body read as ribs. Overlapping
 * puffs behave the opposite way. Each keeps its own rounded normals, so the
 * intersections are creases the ramp bands across, and the silhouette is a
 * cluster rather than an egg - a painted cloud, which is the whole brief.
 *
 * Everything here is seeded from one fixed constant. The wool is authored, not
 * rolled fresh each session, so a capture can be re-shot.
 */

import * as THREE from 'three/webgpu';
import { mulberry32 } from '@sim/rng';

/**
 * A puff: centre, half-extents in metres, and an optional tilt.
 *
 * The tilt is what keeps a cluster from striping. An ellipsoid's own seams run
 * along its axes, so a row of puffs that share their axes hands the toon ramp a
 * set of parallel creases and the body comes back reading as a melon. Rolling
 * each puff to its own angle means no two creases in the cluster are parallel,
 * which is the difference between wool and a striped shell.
 */
export interface Puff {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
  /** Euler tilt in radians, applied after the radii and before the placement. */
  readonly tx?: number;
  readonly ty?: number;
  readonly tz?: number;
}

// --- the lump field ---------------------------------------------------------

const WOOL_SEED = 0x7100_1;
const LOBE_COUNT = 9;
/** Directions the mean swell is integrated over. Build-time cost only. */
const MEAN_SAMPLES = 1024;
/** How much of the swelling survives underneath. Lumps under the belly read as
 *  clutter from every camera that can see them. */
const BELLY_CALM = 0.45;
/** How much of the field a puff takes. The cluster is the shape; this is only
 *  the hand-made irregularity on top of it. */
const LUMP_SCALE = 0.8;

interface Lobe {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly amp: number;
  readonly sharp: number;
}

/** Evenly spread directions, so nine lobes cover a sphere without clustering. */
function fibonacci(index: number, count: number): [number, number, number] {
  const y = 1 - (2 * index + 1) / count;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = Math.PI * (3 - Math.sqrt(5)) * index;
  return [Math.cos(angle) * ring, y, Math.sin(angle) * ring];
}

/** Nine broad swellings, seeded amplitude and width. */
const LOBES: readonly Lobe[] = ((): Lobe[] => {
  const rng = mulberry32(WOOL_SEED);
  const lobes: Lobe[] = [];
  for (let i = 0; i < LOBE_COUNT; i++) {
    const [x, y, z] = fibonacci(i, LOBE_COUNT);
    lobes.push({ x, y, z, amp: 0.13 + rng() * 0.14, sharp: 1.6 + rng() * 2.4 });
  }
  return lobes;
})();

function rawLump(x: number, y: number, z: number): number {
  let sum = 0;
  for (const lobe of LOBES) {
    const facing = x * lobe.x + y * lobe.y + z * lobe.z;
    if (facing <= 0) continue;
    sum += lobe.amp * Math.pow(facing, lobe.sharp);
  }
  return sum;
}

/**
 * The mean of the raw field over the sphere. Subtracting it is what keeps a
 * puff the size its radii say it is however hard the lobes are pushed: the
 * field then only says where the surface sits ABOVE or BELOW that radius, and
 * tuning amplitude changes lumpiness and nothing else.
 */
const LUMP_MEAN = ((): number => {
  let total = 0;
  for (let i = 0; i < MEAN_SAMPLES; i++) {
    const [x, y, z] = fibonacci(i, MEAN_SAMPLES);
    total += rawLump(x, y, z);
  }
  return total / MEAN_SAMPLES;
})();

/** Two rotations, so each puff samples the shared field from its own angle and
 *  no two clumps in a cluster are the same lump. */
interface Spin {
  readonly ca: number;
  readonly sa: number;
  readonly cb: number;
  readonly sb: number;
}

const SPINS: readonly Spin[] = ((): Spin[] => {
  const rng = mulberry32(WOOL_SEED ^ 0x9e37);
  const spins: Spin[] = [];
  // Keep every authored fleece volume on its own orientation. Reusing a spin
  // made separated perimeter puffs repeat the same low-poly contour, which is
  // exactly the patterned look the tilt field is meant to avoid.
  for (let i = 0; i < 24; i++) {
    const a = rng() * Math.PI * 2;
    const b = rng() * Math.PI * 2;
    spins.push({ ca: Math.cos(a), sa: Math.sin(a), cb: Math.cos(b), sb: Math.sin(b) });
  }
  return spins;
})();

/** Signed radial deviation for a puff, at a unit direction on that puff. */
function lumpAt(spin: Spin, x: number, y: number, z: number): number {
  const sx = x * spin.ca + z * spin.sa;
  const sz = z * spin.ca - x * spin.sa;
  const sy = y * spin.cb - sz * spin.sb;
  const tz = y * spin.sb + sz * spin.cb;
  const belly = 1 - Math.max(0, -y) * BELLY_CALM;
  return (rawLump(sx, sy, tz) - LUMP_MEAN) * LUMP_SCALE * belly;
}

// --- welding ----------------------------------------------------------------

/**
 * Index a polyhedron by position so `computeVertexNormals` can average across
 * its shared corners. Written here rather than pulled from BufferGeometryUtils
 * because the weld also SNAPS to the quantised grid: adjacent icosahedron faces
 * subdivide independently and their shared corners differ in the last bits, and
 * snapping is what makes the seam vertices exactly equal rather than merely
 * close. Callers re-normalise, so the snap costs nothing.
 */
const WELD_GRID = 1e4;

function weld(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = source.getAttribute('position');
  const seen = new Map<string, number>();
  const points: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const x = Math.round(position.getX(i) * WELD_GRID) / WELD_GRID;
    const y = Math.round(position.getY(i) * WELD_GRID) / WELD_GRID;
    const z = Math.round(position.getZ(i) * WELD_GRID) / WELD_GRID;
    const key = `${x},${y},${z}`;
    let id = seen.get(key);
    if (id === undefined) {
      id = points.length / 3;
      seen.set(key, id);
      points.push(x, y, z);
    }
    index.push(id);
  }
  const welded = new THREE.BufferGeometry();
  welded.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  welded.setIndex(index);
  return welded;
}

/** A welded icosphere whose vertices sit exactly on the unit sphere. Detail 1
 *  is 80 triangles: the working unit for everything rounded on the sheep. */
export function icosphere(detail: number): THREE.BufferGeometry {
  const raw = new THREE.IcosahedronGeometry(1, detail);
  const welded = weld(raw);
  raw.dispose();
  const position = welded.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const inverse = 1 / Math.sqrt(x * x + y * y + z * z);
    position.setXYZ(i, x * inverse, y * inverse, z * inverse);
  }
  return welded;
}

/**
 * The affine transform that takes a unit sphere to this puff, in exactly the
 * order `woolPuff` applies it: scale by the radii, tilt, then translate.
 *
 * Exported because the hull's exposure bake needs to ask the inverse question -
 * "is this vertex inside that puff" - and the answer is the length of the point
 * mapped back through this matrix. Deriving it in the exposure module instead
 * would put the rotation order in two places, and a disagreement there would
 * silently erase outline where there is no wool (sheepExposure.ts).
 */
export function puffMatrix(puff: Puff): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeScale(puff.rx, puff.ry, puff.rz);
  if (puff.tx !== undefined) m.premultiply(new THREE.Matrix4().makeRotationX(puff.tx));
  if (puff.ty !== undefined) m.premultiply(new THREE.Matrix4().makeRotationY(puff.ty));
  if (puff.tz !== undefined) m.premultiply(new THREE.Matrix4().makeRotationZ(puff.tz));
  return m.premultiply(new THREE.Matrix4().makeTranslation(puff.cx, puff.cy, puff.cz));
}

/**
 * One puff of fleece: a sphere wobbled by its own view of the lump field, then
 * sized and placed.
 *
 * THE NORMALS ARE ANALYTIC, NOT AVERAGED FROM THE FACES. `computeVertexNormals`
 * over an 80-triangle shell averages face normals, and at a Follow closeup the
 * result is visible: a band edge crossing one of those triangles interpolates
 * along a straight line, so the terminator arrives on the rump as a lit TRIANGLE
 * with three hard corners. An ellipsoid knows its own normal at any direction -
 * the direction divided by the radii - and writing that costs nothing, kills the
 * facet outright, and needs no extra subdivision, which matters because this
 * geometry is instanced up to 5000 times in phase 7.
 *
 * What is given up is the lump field's contribution to the shading normal, and
 * that is a gain rather than a loss: the cluster is meant to band as ONE rounded
 * barrel (see SHADING_BLEND in sheepGeometry.ts, which already pulls two thirds
 * of the way there), while the lumps do their work in the silhouette and in the
 * outline hull, where they still read exactly as authored.
 */
export function woolPuff(puff: Puff, spin: number): THREE.BufferGeometry {
  const geometry = icosphere(1);
  const twist = SPINS[spin % SPINS.length]!;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normals = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const radius = 1 + lumpAt(twist, x, y, z);
    position.setXYZ(i, x * radius * puff.rx, y * radius * puff.ry, z * radius * puff.rz);
    const nx = x / puff.rx;
    const ny = y / puff.ry;
    const nz = z / puff.rz;
    const unit = 1 / Math.max(Math.sqrt(nx * nx + ny * ny + nz * nz), 1e-6);
    normals[i * 3] = nx * unit;
    normals[i * 3 + 1] = ny * unit;
    normals[i * 3 + 2] = nz * unit;
  }
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  // After the normals are in place: rotating a geometry carries its normal
  // attribute with it, so the tilt applies to both at once.
  if (puff.tx !== undefined) geometry.rotateX(puff.tx);
  if (puff.ty !== undefined) geometry.rotateY(puff.ty);
  if (puff.tz !== undefined) geometry.rotateZ(puff.tz);
  geometry.translate(puff.cx, puff.cy, puff.cz);
  return geometry;
}
