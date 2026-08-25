// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The dark parts of the sheep: neck and head, ears, legs. Split from the
 * assembly so neither file grows past reading size (AGENTS.md rule 2).
 *
 * THE HEAD LOFT IS COMPACT AND ITS ROOT IS BURIED. The previous pass preserved
 * three narrow rings between shoulder and cheek. From the high gameplay camera
 * they joined into one dark stalk, even though their rear vertices were
 * technically inside the fleece. This recipe fully occludes the first two rings
 * and shortens the remaining skull to a broad cheek and blunt muzzle. Numeric
 * burial is pinned in tests; visual acceptance remains an owner-facing gate.
 *
 * The profile is authored in three moves rather than as one taper:
 *
 *   root    two low sections at z 0.43-0.555, buried in the shoulder collar
 *   cheek   two broad sections at z 0.59-0.635
 *   step    one short span at z 0.695 that drops into the muzzle
 *
 * The muzzle ends at z 0.755, wider than it is tall so the end reads BLUNT.
 *
 * Every part here is arithmetic on primitives (AGENTS.md rule 11). Local space
 * is metres, +z forward, origin between the hooves.
 */

import * as THREE from 'three/webgpu';
import { HEAD_FACE_SCALE, HEAD_FORWARD, HEAD_LIFT } from './sheepFormTuning';

// --- head -------------------------------------------------------------------

/**
 * One ring of the head loft. `square` is 0 for a box section and 1 for a round
 * one: the braincase is a rounded box, the muzzle a softer one, and holding
 * both near 0.5 is what gives the profile a cheek and a jaw line.
 */
interface HeadRing {
  readonly z: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
  readonly square: number;
}

/** Buried head root to nose. The first two sections are fully exposure-occluded;
 *  the third opens into the broad cheek inside the shoulder ruff. */
const HEAD_RINGS: readonly HeadRing[] = [
  { z: 0.43, y: 0.545, hw: 0.135, hh: 0.055, square: 0.82 },
  { z: 0.555, y: 0.56, hw: 0.15, hh: 0.07, square: 0.54 },
  { z: 0.59, y: 0.59, hw: 0.15, hh: 0.095, square: 0.48 },
  { z: 0.635, y: 0.58, hw: 0.14, hh: 0.085, square: 0.44 },
  { z: 0.695, y: 0.565, hw: 0.13, hh: 0.07, square: 0.5 },
  { z: 0.755, y: 0.555, hw: 0.12, hh: 0.055, square: 0.62 },
];

/** Points around one section. Twelve: enough that the rounded end of the skull
 *  is round and the squared end still shows its corners. */
const HEAD_SIDES = 12;

/** Where the head stops following the fleece and starts following the nod.
 *  Read by the mask writer so the buried neck never moves. */
export const HEAD_GRAZE_START = 0.52;
export const HEAD_GRAZE_END = 0.66;

/** Nose tip, for anything that needs to know how long the animal is. */
export const HEAD_NOSE_Z = 0.755 + HEAD_FORWARD;

/**
 * A point on a unit section: a circle and a square blended by `square`. The
 * square term divides out the larger component, which walks the point onto the
 * unit box; near 0.5 the corners are visible without the section reading as a
 * crate.
 */
function section(angle: number, square: number): [number, number] {
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  const box = 1 / Math.max(Math.abs(s), Math.abs(c));
  const k = square + (1 - square) * box;
  return [s * k, c * k];
}

/** The head, as one closed loft. Both ends are capped: the root end is
 *  buried in wool, but the outline hull is drawn from back faces and an open end
 *  would let it show through the fleece. */
export function headShape(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const ring of HEAD_RINGS) {
    for (let s = 0; s < HEAD_SIDES; s++) {
      const [sx, sy] = section(((s + 0.5) / HEAD_SIDES) * Math.PI * 2, ring.square);
      const alongHead = (ring.z - HEAD_RINGS[0]!.z) / (HEAD_RINGS[HEAD_RINGS.length - 1]!.z - HEAD_RINGS[0]!.z);
      // Grow only beyond both buried root rings. Their authored size remains
      // untouched, so a larger visible skull cannot reopen the neck connection.
      const visibleHead = Math.max(
        0,
        (ring.z - HEAD_RINGS[1]!.z) / (HEAD_RINGS[HEAD_RINGS.length - 1]!.z - HEAD_RINGS[1]!.z),
      );
      const faceScale = 1 + visibleHead * (HEAD_FACE_SCALE - 1);
      positions.push(
        sx * ring.hw * faceScale,
        ring.y + HEAD_LIFT + sy * ring.hh * faceScale,
        ring.z + alongHead * HEAD_FORWARD,
      );
    }
  }
  for (let r = 0; r + 1 < HEAD_RINGS.length; r++) {
    for (let s = 0; s < HEAD_SIDES; s++) {
      const a = r * HEAD_SIDES + s;
      const b = r * HEAD_SIDES + ((s + 1) % HEAD_SIDES);
      // Wound so the face normal points OUT of the loft.
      indices.push(a, a + HEAD_SIDES, b, b, a + HEAD_SIDES, b + HEAD_SIDES);
    }
  }
  const last = (HEAD_RINGS.length - 1) * HEAD_SIDES;
  for (let s = 1; s + 1 < HEAD_SIDES; s++) {
    indices.push(last, last + s + 1, last + s);
    indices.push(0, s, s + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// --- ears -------------------------------------------------------------------

/**
 * Blade length outward, thickness, and fore-aft depth at the root.
 *
 * A wedge rather than a stick: the root section is 0.15 m deep and the tip keeps
 * three fifths of it, so the broad face is what a camera sees from the side AND
 * from above. Rooted BEHIND the brow at z 0.59, where a sheep's ears actually
 * sit, and angled 31 degrees down and 20 degrees back, which puts the two tips
 * at x +/- 0.27 - a 0.54 m span, wide enough that the pair reads as two ticks
 * either side of the skull at the Classic camera.
 */
const EAR = { length: 0.225, thickness: 0.052, depth: 0.165 } as const;
const EAR_ROOT = { x: 0.108, y: 0.63, z: 0.585 } as const;
/** How much the blade narrows at the tip. Kept high: a blade that keeps most of
 *  its section to the tip reads as an ear, one that tapers to nothing reads as a
 *  horn. */
const EAR_TIP = 0.6;
const EAR_DROOP = 0.55;
const EAR_SWEEP = 0.35;

export function earShape(side: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(EAR.length, EAR.thickness, EAR.depth);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    if (position.getX(i) <= 0) continue;
    position.setY(i, position.getY(i) * EAR_TIP);
    position.setZ(i, position.getZ(i) * EAR_TIP);
  }
  geometry.translate((EAR.length / 2) * side, 0, 0);
  geometry.rotateZ(-EAR_DROOP * side);
  geometry.rotateY(EAR_SWEEP * side);
  geometry.computeVertexNormals();
  geometry.translate(EAR_ROOT.x * side, EAR_ROOT.y + HEAD_LIFT, EAR_ROOT.z + HEAD_FORWARD * 0.56);
  return geometry;
}

// --- legs -------------------------------------------------------------------

/**
 * A leg is five rings swept as a six-sided prism: shoulder, shank, knee,
 * fetlock, hoof. Six sides because at Follow distance a square leg reads as a
 * square, and 60 triangles is not a budget worth defending.
 *
 * The lower profile is deliberately short and tapered. The upper four rings
 * stay narrow enough that a swinging leg does not read as a full dark slab
 * outside the fleece, then the unchanged sole opens into a compact planted
 * foot. That keeps the hoof readable without returning to either the oversized
 * pony legs from the first asset pass or a thin rod at Follow distance.
 *
 * The profile is not on one vertical line. The front pair drops near-plumb with
 * the knee a little forward; the back pair carries a real HOCK - the joint sits
 * 0.07 m behind the hip and the hoof comes 0.045 m forward again under it. That
 * S is what makes a sheep look like it is standing on its legs rather than
 * skewered on them, and it is also what breaks the wishbone the four legs
 * otherwise converge into head-on.
 *
 * Where the leg meets the body is now the fleece's job, not the leg's: the puff
 * cluster carries a shoulder swell at the front pair and a haunch at the rear
 * (sheepGeometry.ts), so the limb emerges from a mass instead of poking out of a
 * flat belly.
 */
interface Ring {
  /** Height above ground, m. */
  readonly y: number;
  /** Half width across, m. */
  readonly hw: number;
  /** Half depth fore-aft, m. */
  readonly hd: number;
  /** Fore-aft offset from the leg's hip, m. */
  readonly dz: number;
  /** Sideways offset from the leg's hip, m. */
  readonly dx: number;
  /** 0 at the shoulder, 1 at the hoof: the material's hoof selector, the
   *  stride's swing weight, and the weight that keeps the bob off the ground. */
  readonly t: number;
}

const FRONT_RINGS: readonly Ring[] = [
  { y: 0.56, hw: 0.058, hd: 0.065, dz: 0, dx: 0, t: 0 },
  { y: 0.34, hw: 0.054, hd: 0.061, dz: 0.008, dx: -0.003, t: 0.2 },
  { y: 0.14, hw: 0.049, hd: 0.056, dz: 0.02, dx: -0.006, t: 0.56 },
  { y: 0.05, hw: 0.045, hd: 0.052, dz: 0.01, dx: -0.01, t: 0.86 },
  { y: 0, hw: 0.068, hd: 0.08, dz: 0.02, dx: -0.01, t: 1 },
];

const BACK_RINGS: readonly Ring[] = [
  { y: 0.59, hw: 0.065, hd: 0.076, dz: -0.014, dx: 0, t: 0 },
  { y: 0.35, hw: 0.059, hd: 0.069, dz: -0.04, dx: 0.003, t: 0.2 },
  { y: 0.145, hw: 0.053, hd: 0.061, dz: -0.07, dx: 0.006, t: 0.56 },
  { y: 0.05, hw: 0.046, hd: 0.054, dz: -0.026, dx: 0.012, t: 0.86 },
  { y: 0, hw: 0.069, hd: 0.082, dz: -0.018, dx: 0.014, t: 1 },
];

const SIDES = 6;
/** Unit hexagon, corner-forward so a leg shows a face to the camera rather than
 *  an edge from the two angles that matter. */
const RING_ANGLES: readonly number[] = Array.from(
  { length: SIDES },
  (_, i) => ((i + 0.5) / SIDES) * Math.PI * 2,
);

/**
 * One leg, plus the per-vertex shoulder-to-hoof weight the material reads. The
 * weight rides in the geometry rather than being re-derived from y, because the
 * rings are not evenly spaced in height and the hoof has to be exactly the
 * bottom band however the profile is retuned.
 */
export function legShape(
  hipX: number,
  hipZ: number,
  rings: readonly Ring[],
): { geometry: THREE.BufferGeometry; weights: Float32Array } {
  const positions: number[] = [];
  const weights: number[] = [];
  const indices: number[] = [];

  for (const ring of rings) {
    for (const angle of RING_ANGLES) {
      positions.push(
        hipX + ring.dx + Math.sin(angle) * ring.hw,
        ring.y,
        hipZ + ring.dz + Math.cos(angle) * ring.hd,
      );
      weights.push(ring.t);
    }
  }
  for (let r = 0; r + 1 < rings.length; r++) {
    for (let s = 0; s < SIDES; s++) {
      const a = r * SIDES + s;
      const b = r * SIDES + ((s + 1) % SIDES);
      indices.push(a, a + SIDES, b, b, a + SIDES, b + SIDES);
    }
  }
  // Hoof cap, fanned from the first vertex of the bottom ring.
  const base = (rings.length - 1) * SIDES;
  for (let s = 1; s + 1 < SIDES; s++) indices.push(base, base + s + 1, base + s);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, weights: Float32Array.from(weights) };
}

/** Hip placements. The back pair sits narrower and further out fore-aft than the
 *  front, which is what a sheep does and what keeps the four hooves from
 *  stacking into one line when the animal is seen head-on. */
export const LEG_PLACEMENT = {
  frontX: 0.225,
  frontZ: 0.22,
  backX: 0.21,
  backZ: -0.28,
  front: FRONT_RINGS,
  back: BACK_RINGS,
} as const;

/** All authored sole-cap vertices share this local height. */
export const SHEEP_HOOF_BASELINE = 0;
/** Longest authored shoulder-to-sole vertical span, before terrain flex. */
export const SHEEP_AUTHORED_LEG_SPAN = 0.59;

const FRONT_SOLE = FRONT_RINGS[FRONT_RINGS.length - 1]!;
const BACK_SOLE = BACK_RINGS[BACK_RINGS.length - 1]!;

/** Authored centres of the four sole caps, in material selector order. */
export const SHEEP_HOOF_CONTACTS = [
  { x: LEG_PLACEMENT.frontX + FRONT_SOLE.dx, z: LEG_PLACEMENT.frontZ + FRONT_SOLE.dz },
  { x: -LEG_PLACEMENT.frontX + FRONT_SOLE.dx, z: LEG_PLACEMENT.frontZ + FRONT_SOLE.dz },
  { x: LEG_PLACEMENT.backX + BACK_SOLE.dx, z: LEG_PLACEMENT.backZ + BACK_SOLE.dz },
  { x: -LEG_PLACEMENT.backX + BACK_SOLE.dx, z: LEG_PLACEMENT.backZ + BACK_SOLE.dz },
] as const;

export interface SheepHoofSolePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly legSign: 1 | -1;
  readonly contact: 0 | 1 | 2 | 3;
}

function solePoints(
  hipX: number,
  hipZ: number,
  sole: Ring,
  legSign: 1 | -1,
  contact: 0 | 1 | 2 | 3,
): SheepHoofSolePoint[] {
  return RING_ANGLES.map((angle) => ({
    x: hipX + sole.dx + Math.sin(angle) * sole.hw,
    y: SHEEP_HOOF_BASELINE,
    z: hipZ + sole.dz + Math.cos(angle) * sole.hd,
    legSign,
    contact,
  }));
}

/** Sole-cap perimeter used by debug contact receipts, derived from the recipe. */
export const SHEEP_HOOF_SOLE_POINTS: readonly SheepHoofSolePoint[] = [
  ...solePoints(LEG_PLACEMENT.frontX, LEG_PLACEMENT.frontZ, FRONT_SOLE, 1, 0),
  ...solePoints(-LEG_PLACEMENT.frontX, LEG_PLACEMENT.frontZ, FRONT_SOLE, -1, 1),
  ...solePoints(LEG_PLACEMENT.backX, LEG_PLACEMENT.backZ, BACK_SOLE, -1, 2),
  ...solePoints(-LEG_PLACEMENT.backX, LEG_PLACEMENT.backZ, BACK_SOLE, 1, 3),
];

// The tail is not here. It used to be a bare 20-face icosahedron, and at a
// Follow closeup its flat faces were the one hard-edged triangle on an animal
// made of rounded masses. It is now one more entry in the fleece's puff list
// (sheepGeometry.ts), which gives it the same smooth analytic normals and the
// same lump field as the rest of the wool for no extra code.
