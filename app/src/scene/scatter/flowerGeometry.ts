// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * ONE FLOWER: a head of two crossed planes on a visible stem of two crossed
 * quads. The instance matrix decides where it stands, which way it faces, and
 * how big it is.
 *
 * THIS IS A REBUILD, NOT A TUNE. Three passes tried to make a rosette of seven
 * domed heads read at gameplay distance and all three failed the same way: the
 * clump was authored as a mass, so from any real camera it was a pale smudge
 * that could have been anything, and the shader that scaled each head about its
 * own centre was elaborate enough to blow a head into a metre-wide sheet when
 * one of its attributes came back wrong. The answer is the oldest one in
 * stylised foliage: CROSS-QUADS. Two intersecting planes per head, each carrying
 * a notched blossom outline, one flower per instance, no per-head bookkeeping in
 * the shader at all.
 *
 * WHY TWO PLANES AND NOT ONE. A single plane is invisible seen along its own
 * edge, so a third of any drift would vanish from any given camera - which is
 * exactly what the first pass's flat hexagons did. Crossed, a flower presents a
 * face from every bearing on the compass. The two planes also lean OPPOSITE
 * ways, by 32 degrees off vertical, so from the Classic camera looking down at
 * 50 degrees the pair reads as an open blossom rather than as an edge-on cross.
 *
 * THE HEAD IS 19 cm ACROSS AT SCALE 1 and the instance scale runs 0.85 to 1.2,
 * so a head spans 16 cm to 23 cm. At the Follow camera's near ground, 10 m out,
 * that is about 30 screen pixels: unmistakably a flower. At Classic's 45 m it is
 * seven, so what carries there is the DRIFT - twenty-five to forty heads inside
 * two metres, which is a 90 pixel pale mass with visible texture.
 *
 * THE STEM IS THE OTHER HALF OF READING AS A FLOWER. A pale blob lying in grass
 * is litter; a pale blob on a green stalk is a plant. It is two crossed quads for
 * the same reason the head is two planes, and its height is the single number
 * that decides whether any of this is visible at all - see STEM_HEIGHT.
 *
 * WHAT THE SHADER READS OFF A VERTEX:
 *
 *   position  flower-local metres, the root at the origin
 *   normal    the surface's own, lifted a little toward the sky (SKY_LIFT)
 *   uv        (up, radial) - `up` is 0 at the root and 1 on the head, so it
 *             drives the wind bend and, at HEAD_EDGE, the switch from stem
 *             colour to petal colour. `radial` is 0 at a head's centre and 1 at
 *             its rim, and drives the gold heart. Stem vertices carry radial 1
 *             and stop at up = 0.995, so no triangle spans the switch.
 *
 * No uv1, no uv2, no per-vertex head origin: the vertex has nothing left in it
 * that the shader has to reconstruct.
 */

import * as THREE from 'three/webgpu';

/** Planes per head, and rim points on each. */
const PLANES = 2;
/**
 * Rim points per plane, alternating long petal and short bay, so a head carries
 * RIM/2 petals.
 *
 * FIVE PETALS, NOT FOUR. At eight the outline was a four-pointed star, and a
 * four-pointed star at thirty screen pixels with a deep notch reads as a square
 * turned on its corner - the zoomed capture came back looking like pale confetti
 * scattered in the grass. Five is the count almost every meadow flower actually
 * has, it has no axis of symmetry a viewer can mistake for a box corner, and it
 * costs two triangles.
 */
const RIM = 10;
const STEM_QUADS = 2;
const VERTS = STEM_QUADS * 4 + PLANES * (1 + RIM);
const TRIS = STEM_QUADS * 2 + PLANES * RIM;

/** Head radius before the instance scale, metres. 19 cm across. */
const HEAD_RADIUS = 0.095;
/**
 * Rim radius of the bays, as a fraction of the petals.
 *
 * THE NOTCHES CAME UP FROM 0.62, which is a softening rather than a retreat. At
 * a 38 per cent bite the outline was a five-pointed star with deep valleys, and
 * a five-pointed star at seven pixels is a vector glyph: the zoomed capture read
 * as confetti cut with scissors. At 0.80 the petals still separate along the rim
 * - the bays are 2 cm deep on a 9.5 cm radius, which is a pixel and a half at
 * Follow range - but the blossom's outline is a rounded flower rather than a
 * star, which is what a painter puts down at this size.
 */
const NOTCH = 0.8;
/** How far the head's centre lifts off its own plane, in head radii. A shallow
 *  cup, so the blossom catches the key across its face instead of flat-on. */
const CUP = 0.2;
/** How far each plane leans off vertical, radians, the two in opposite
 *  directions. See the module note: this is what the overhead camera reads. */
const LEAN = 0.56;

/**
 * Stem height before the instance scale, metres, and its half-width at the root
 * and just under the head.
 *
 * IT CAME BACK DOWN, AND THE STEM GOT THICKER. At 0.55 m in a meadow whose tufts
 * run 0.32 m to 0.78 m, every head stood clear of the sward on a 2 cm wire, and
 * the capture earned the note it deserved: dead weeds. A wildflower nestles
 * among the blade tips, it does not tower over them. At 0.40 m - which is a
 * little above the field's median tuft and well under its tallest - a head sits
 * IN the grass texture rather than on top of it, and the plant reads as part of
 * the meadow.
 *
 * The half-widths went up by a quarter for the same reason the colour did
 * (scatter/flowers.ts): a 1.3 cm stem at 20 m is a sub-pixel line, and a
 * sub-pixel dark line renders as a black hair with a dot on top. At 1.6 cm it is
 * a stalk with a value, which is what the eye needs to read a plant.
 */
export const STEM_HEIGHT = 0.4;
const STEM_ROOT = 0.016;
const STEM_TIP = 0.012;

/**
 * How much of a vertex normal is the sky rather than the surface it belongs to.
 *
 * Raised hard this pass. Under an 8 degree sun a vertical-ish petal plane either
 * faces the key or faces away, so a head built on its own face normals came back
 * half warm-white and half violet - one blossom reading as two objects, and a
 * drift reading as speckle. Leaning the normals toward the sky puts most of a
 * head in the mid and lit bands, with the shadow band as a minority accent along
 * the away-facing petals, which is how a painter renders a small pale flower.
 *
 * AND IT WAS STILL SHORT BY ONE BAND, WHICH THE CAPTURE MEASURED. At 0.5 and
 * 0.62 a camera-facing petal carries a normal near (-0.375, 0.628, -0.683),
 * whose half-lambert against this scene's key is 0.404 - a hair under
 * RAMP.shadowEdge, so the whole side of every head the camera can see took the
 * SHADOW band and the drifts photographed as lavender-grey specks. The violet
 * was doing its job; it was simply on the wrong half of the flower.
 *
 * At 0.8 and 0.5 the same petal reads 0.464, clear of the shadow edge and well
 * under the key: the face a camera sees lands in the MID band, a warm white, and
 * the shadow stays where a painter puts it - the far petals and the underside of
 * the cup. It also lands the head at the value the note asks for, because the
 * mid target is a step below the lit one and the lit one was measuring hot.
 */
const SKY_LIFT = 0.8;
const SKY_FACE = 0.5;

/** The stem's top vertices stop just short of 1 so the material can switch to
 *  petal colour at the head and nowhere else. */
const STEM_TOP_UV = 0.995;

type Vector = readonly [number, number, number];

function writeNormal(target: number[], x: number, y: number, z: number): void {
  const length = Math.sqrt(x * x + y * y + z * z) || 1;
  const nx = (x / length) * SKY_FACE;
  const ny = (y / length) * SKY_FACE + SKY_LIFT;
  const nz = (z / length) * SKY_FACE;
  const lifted = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  target.push(nx / lifted, ny / lifted, nz / lifted);
}

function cross(a: Vector, b: Vector): Vector {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(v: Vector): Vector {
  const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** One stem quad, spread along `across`. */
function appendStem(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
  across: Vector,
): void {
  const base = positions.length / 3;
  for (const end of [0, 1] as const) {
    const t = end === 0 ? 0 : STEM_TOP_UV;
    const half = end === 0 ? STEM_ROOT : STEM_TIP;
    for (const side of [-1, 1] as const) {
      positions.push(across[0] * half * side, STEM_HEIGHT * t, across[2] * half * side);
      // The quad's own face normal is the axis it is NOT spread along, so the
      // two halves of the cross take different bands.
      writeNormal(normals, -across[2], 0.3, across[0]);
      uvs.push(t, 1);
    }
  }
  indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
}

/** One blossom plane: a notched fan in the plane spanned by `flat` and `rise`. */
function appendPlane(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
  flat: Vector,
  rise: Vector,
): void {
  const face = unit(cross(rise, flat));
  const centre = positions.length / 3;
  positions.push(face[0] * HEAD_RADIUS * CUP, STEM_HEIGHT + face[1] * HEAD_RADIUS * CUP, face[2] * HEAD_RADIUS * CUP);
  writeNormal(normals, face[0], face[1], face[2]);
  uvs.push(1, 0);

  for (let i = 0; i < RIM; i++) {
    const angle = (i / RIM) * Math.PI * 2;
    const radius = HEAD_RADIUS * (i % 2 === 0 ? 1 : NOTCH);
    const cx = Math.cos(angle) * radius;
    const cy = Math.sin(angle) * radius;
    positions.push(
      flat[0] * cx + rise[0] * cy,
      STEM_HEIGHT + flat[1] * cx + rise[1] * cy,
      flat[2] * cx + rise[2] * cy,
    );
    // Bent a little outward from the plane's own normal, so the petals of one
    // head do not all light identically.
    writeNormal(
      normals,
      face[0] * 0.8 + (flat[0] * cx + rise[0] * cy) / radius / 2,
      face[1] * 0.8 + (flat[1] * cx + rise[1] * cy) / radius / 2,
      face[2] * 0.8 + (flat[2] * cx + rise[2] * cy) / radius / 2,
    );
    uvs.push(1, 1);
    indices.push(centre, centre + 1 + i, centre + 1 + ((i + 1) % RIM));
  }
}

export function buildFlowerGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let k = 0; k < STEM_QUADS; k++) {
    const bearing = (k / STEM_QUADS) * Math.PI;
    appendStem(positions, normals, uvs, indices, [Math.cos(bearing), 0, Math.sin(bearing)]);
  }

  for (let k = 0; k < PLANES; k++) {
    const bearing = (k / PLANES) * Math.PI;
    const flat: Vector = [Math.cos(bearing), 0, Math.sin(bearing)];
    // The plane's vertical axis, leaned toward the direction it does NOT span,
    // alternating sign so the two planes open away from each other.
    const sign = k === 0 ? 1 : -1;
    const rise = unit([
      -Math.sin(bearing) * Math.sin(LEAN) * sign,
      Math.cos(LEAN),
      Math.cos(bearing) * Math.sin(LEAN) * sign,
    ]);
    appendPlane(positions, normals, uvs, indices, flat, rise);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  if (positions.length / 3 !== VERTS || indices.length / 3 !== TRIS) {
    // A shape this small is worth asserting on: the counts are the contract the
    // module note quotes, and a silent mismatch would mean a torn blossom.
    throw new Error('flower geometry does not match its declared vertex or triangle count');
  }
  return geometry;
}
