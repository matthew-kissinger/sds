// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The bole, as one geometry shared by every trunk and every hero bough.
 *
 * At the Follow camera a near bole is about eight pixels across, so the
 * silhouette and the value are the whole asset: TAPER so the outline converges
 * instead of running parallel, a ROOT FLARE that meets the ground almost
 * horizontally so the bole reads as something that grew rather than a post
 * pushed in, and an IRREGULAR SEVEN-SIDED CROSS-SECTION so no two facets are
 * the same width and the outline never lands on the accidental symmetry of a
 * regular polygon.
 *
 * TWO THINGS MOVED OUT OF THE BAKE AND INTO THE INSTANCE, and both are answers
 * to the same critique. The limbs of the hero oak were parallel-edged mitred
 * planks, and a shared geometry with one baked taper cannot be both a 6.4 m
 * bole and a bough that has to die away to a twig. So the extra taper and the
 * sideways bow are per-instance now (trunkMaterial.ts reads them), and this
 * file bakes only the part every limb in the game shares.
 *
 * THE NORMALS ARE SMOOTH WHILE THE SILHOUETTE STAYS FACETED, which is the fix
 * for the other half of that note: a dead-straight vertical seam down the bole
 * where two flat facets met at two flat values. Baking the normal of the
 * underlying SOLID OF REVOLUTION rather than of the facet gives the ramp a
 * continuous nDotL round the bole, so the terminator lands as a curve that
 * follows the cylinder and moves with the taper - while the outline still
 * carries its seven uneven flats, because those live in the positions.
 *
 * The contract matches the crown's: y runs 0 to 1, base radius is 0.5 before
 * the flare, so an instance scale of (diameter, length, diameter) puts it in
 * metres with its origin at the foot.
 */

import * as THREE from 'three/webgpu';
import { hashUnit } from './ringShape';

const SIDES = 7;
/** Rings, packed toward the foot where the root flare lives and toward the tip
 *  where the profile rounds off to a point. */
const RINGS = [0, 0.02, 0.05, 0.1, 0.2, 0.36, 0.56, 0.76, 0.9, 0.95, 0.98, 1] as const;

/**
 * Baked taper: the lateral scale at the tip.
 *
 * STRONG, AND BAKED, because the per-instance version of it could not be made
 * to work. Driving the taper and the bow from an instanced attribute read in
 * the VERTEX stage put six brown ribbons three hundred metres long across the
 * pasture; the data audited clean and a fragment-stage read of the very same
 * attribute painted one correct flat colour per limb, so the values were right
 * and the vertex stage was reading them as garbage. Splitting the pack into two
 * buffers, one per stage, did not help either - it is the vertex read itself.
 * The rule this folder now works to is in trunkMaterial.ts: the trunk's vertex
 * stage reads NO instanced attribute.
 *
 * What that costs is one taper for every limb in the game instead of a bole's
 * and a bough's. 0.42 is chosen for the bough end of that range rather than the
 * middle, because the note being answered is about limbs that arrive under the
 * leaves as planks, and a bole that narrows a little more than an oak's really
 * does is a far smaller error than a bough that does not narrow at all.
 */
const TOP_TAPER = 0.42;
/**
 * The root flare: how much wider than the shaft the very foot is, and over what
 * share of the limb's length it lifts.
 *
 * OVER THE BOTTOM TENTH, WHICH IS THE NOTE. At 0.16 the swell was gentle enough
 * over a long enough run that it read as a slightly conical trunk rather than as
 * roots; compressed into a tenth, the profile leaves the ground nearly
 * horizontally and the bole reads as something that grew there rather than a
 * post pushed in. It applies at the foot of every bough segment too, which is
 * not a side effect being tolerated: a limb that swells where it leaves its
 * parent is what a bough joint looks like, and it also swallows the point the
 * parent tapers to.
 *
 * THE DEPTH IS 0.78 AND NOT THE 1.55 THE FIRST TRY USED. That put the foot at
 * two and a half times the shaft - 6.9 m across on the oak's 2.7 m bole - and at
 * the Follow camera the tree stood on a plank. Real root flare on a field oak is
 * under twice the bole, and 0.78 lands at 1.78 with the compression doing the
 * work the depth was being asked for.
 */
const FLARE = 0.92;
const FLARE_HEIGHT = 0.12;

/**
 * Where the profile stops being a shaft and starts rounding off to a point.
 *
 * NO LIMB IN THIS GAME MAY END IN A FLAT FACE. The geometry is a tube with no
 * caps, so a limb that simply stopped presented either an open hole or, from
 * the wrong side, a hard-edged annulus of backface - the pale stub the critique
 * found on the leader, the left stick and two upper-right offenders. Rounding
 * the last tenth off through a circular arc to zero radius costs three extra
 * rings and removes the failure class outright: there is nothing flat left to
 * see, from any bearing, on any limb, whether it dies inside leaves or not.
 */
const CAP_START = 0.9;
const SIDE_STREAM = 9203;

/**
 * The bow's direction in the geometry's own space, unit length.
 *
 * Fixed here rather than drawn per instance because every trunk carries a
 * random yaw already, and a yaw is exactly a rotation of this vector. One
 * authored direction plus the yaw the placement already has is a bow that
 * points somewhere different on every tree, for no extra attribute.
 */
export const BOW_DIR = { x: 0.912, z: -0.41 } as const;
/**
 * How the bow grows with height: the square of the rise.
 *
 * AN INTEGER, AND WRITTEN AS A MULTIPLY IN THE SHADER. It was 1.6, which meant
 * the vertex stage evaluated `pow(rise, 1.6)`, and the base ring of this
 * geometry sits at exactly y = 0. `pow(0, k)` for fractional k returns NaN on
 * this backend, so every limb's foot vertices went to NaN and the scene grew
 * brown ribbons three hundred metres long. The tip offset below does not depend
 * on the exponent at all - at rise = 1 every power is 1 - so nothing was bought
 * by the fractional curve in the first place.
 */
export const BOW_CURVE = 2;

/**
 * How far the axis drifts sideways by the tip, in the geometry's own units.
 * Baked in with the taper and for the same reason: no instanced attribute may
 * be read by this material's vertex stage. Every belt bole carries a yaw
 * already and a yaw rotates BOW_DIR, so one baked curve still points a
 * different way on every tree out there. The hero oak's limbs are thrown by
 * tilt rather than by yaw, so they do share a bearing for their bow; six limbs
 * at six leans, lengths and heights do not read as repeated because of it.
 */
export const BAKED_BOW = 0.34;

/** Radius at a height, before the per-side variation. */
function trunkRadius(y: number): number {
  const taper = 1 + (TOP_TAPER - 1) * y;
  const foot = Math.max(0, 1 - y / FLARE_HEIGHT);
  const shaft = 0.5 * taper * (1 + FLARE * foot * foot * foot);
  if (y <= CAP_START) return shaft;
  const t = (y - CAP_START) / (1 - CAP_START);
  return shaft * Math.sqrt(Math.max(0, 1 - t * t));
}

/** Where the tip of the bowed profile lands, in the geometry's own space, at
 *  y = 1. The crown that limb carries is placed from this, so a crown can never
 *  come off the end of the limb it grew on (placement.ts). */
export function trunkTipOffset(): { x: number; z: number } {
  return { x: BOW_DIR.x * BAKED_BOW, z: BOW_DIR.z * BAKED_BOW };
}

/**
 * Built non-indexed so the facets stay flat in silhouette, with the smooth
 * surface-of-revolution normal written per vertex so the shading does not.
 */
export function buildTrunkGeometry(): THREE.BufferGeometry {
  const sideScale: number[] = [];
  for (let s = 0; s < SIDES; s++) sideScale.push(0.86 + 0.28 * hashUnit(s, SIDE_STREAM));

  const positions: number[] = [];
  const normals: number[] = [];
  const push = (ring: number, side: number): void => {
    const y = RINGS[ring]!;
    const angle = ((side % SIDES) / SIDES) * Math.PI * 2;
    const scale = sideScale[side % SIDES]!;
    const radius = trunkRadius(y) * scale;
    const drift = BAKED_BOW * Math.pow(y, BOW_CURVE);
    positions.push(
      Math.sin(angle) * radius + BOW_DIR.x * drift,
      y,
      Math.cos(angle) * radius + BOW_DIR.z * drift,
    );
    // The normal of the revolved profile, not of the facet: (1, -dr/dy) in the
    // radial-vertical plane. The flare's slope is steep enough near the foot
    // that leaving it out would light the root flare as if it were vertical.
    const step = 0.008;
    const nx = Math.sin(angle);
    const nz = Math.cos(angle);
    // The profile's own slope, plus the part of the bow's lean that lies in this
    // vertex's radial plane: the bow tips the surface toward the light down one
    // side of a limb and away from it down the other, and leaving it out would
    // put the terminator on the wrong side of every bough in the oak.
    const slope =
      ((trunkRadius(Math.min(1, y + step)) - trunkRadius(Math.max(0, y - step))) * scale) /
        (Math.min(1, y + step) - Math.max(0, y - step)) +
      (BOW_DIR.x * nx + BOW_DIR.z * nz) * BOW_CURVE * BAKED_BOW * Math.pow(y, BOW_CURVE - 1);
    const len = Math.hypot(1, slope);
    normals.push(nx / len, -slope / len, nz / len);
  };

  for (let r = 0; r < RINGS.length - 1; r++) {
    for (let s = 0; s < SIDES; s++) {
      push(r, s);
      push(r, s + 1);
      push(r + 1, s + 1);
      push(r, s);
      push(r + 1, s + 1);
      push(r + 1, s);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  geometry.computeBoundingSphere();
  return geometry;
}
