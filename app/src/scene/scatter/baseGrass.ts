// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The collar of grass standing over the foot of every solid. One merged mesh,
 * one draw call.
 *
 * WHY IT EXISTS. A solid dropped onto a field of instanced tufts meets the
 * ground along a clean line, because the tufts were placed by a bake that knows
 * nothing about the dressing and nothing grows through a boulder. What the eye
 * sees at that line is an object whose lower edge is fully visible and fully
 * lit, sitting ON the meadow with nothing in front of it. That is the definition
 * of a pasted decal, and no amount of darkening UNDER the object fixes it:
 * darkening is a shading cue, and the missing cue is OCCLUSION.
 *
 * So blades are grown at the foot of every contact spot and they overlap the
 * object's base. A painter does the same thing: you do not paint a rock and then
 * paint grass up to it, you paint grass over the bottom of the rock.
 *
 * THE FRONT BLADES ARE THE ONES THAT MATTER, AND THIS PASS SPENDS THE GEOMETRY
 * THERE. Both gameplay cameras look up-field, so the side of an object a player
 * sees is its -z side and a blade standing behind a boulder occludes nothing.
 * Blades on the camera side are now rooted WELL INSIDE the footprint - a third
 * to two thirds of the way in, which puts them in front of the solid rather than
 * beside it - and stand half again as tall as the ones behind. Four or five
 * blades cross the front silhouette of every solid in the frame.
 *
 * THE COLLAR IS ALSO THE CONTACT SHADOW. A flat disc on the ground is hidden by
 * the blade layer over it, so the darkening a player reads has to be made of
 * blades. These are authored two fifths below open pasture - luminance near 0.40
 * lit against the field's 0.50, dropping to 0.25 in shade - and cooler, so a
 * ring of them at the foot of a stone reads as grass standing in that stone's
 * shadow.
 *
 * WORLD SPACE, NOT INSTANCED. The collar's radius follows the stone it grows
 * around while the blade height does not, and every root needs its own
 * `groundY`. A few hundred triangles built once is cheaper than fighting an
 * instance matrix for both.
 */

import * as THREE from 'three/webgpu';
import type { Heightfield } from '@app/world/heightfield';
import { makeBandedMaterial, type BandTargets } from './bandedMaterial';
import { hash01 } from './hash';
import type { ContactSpot } from './placement';

/**
 * The pasture's greens, dropped two bands and shifted a little cool. palette
 * candidate: promote in cohesion pass.
 *
 * IT CAME BACK FROM TEAL. The last set ran hue 145 to 160, which against a hue-65
 * pasture is not shaded grass at all - the capture showed dark blue-green spikes
 * that read as a second, spikier species growing in a ring. These sit at hue 92
 * to 100, a couple of dozen degrees cool of the field's own green, at 23 per cent
 * chroma.
 *
 * The blades that matter are the ones on the camera side, and their faces look
 * away from an 8 degree sun, so they take the SHADOW band: they render near 0.30
 * against open pasture at 0.48, which is a bit under two thirds of it. The lit
 * band is only ever seen on the far rim of a collar.
 */
const COLLAR: BandTargets = { shadow: '#3d5233', mid: '#546b43', lit: '#63804c' };

/** Blade heights as a fraction of the spot's own blade height, before the front
 *  bias. The meadow runs 0.32 m to 0.78 m (grass/tuftGeometry.ts). */
const HEIGHT_MIN = 0.62;
const HEIGHT_MAX = 1;
/** Half-width at the root and just below the tip, metres. */
const ROOT_HALF = 0.04;
const TIP_HALF = 0.009;
/** How far a blade leans out from its root, as a fraction of its height. */
const LEAN = 0.36;
/** Where a blade roots, as a fraction of the spot radius: deep inside on the
 *  camera side so it crosses the silhouette, out at the rim behind. */
const FRONT_ROOT = [0.34, 0.68] as const;
const BACK_ROOT = [0.74, 1] as const;
/** How much taller a front blade stands than a back one. */
const FRONT_TALL = 1.5;
const BACK_TALL = 0.8;
/** Which side of the spot counts as the camera side. Both gameplay cameras look
 *  up-field, so it is -z, with a wide margin: a solid seen a little off axis
 *  still needs blades across the edge the player is looking at. */
const FRONT_LIMIT = -0.15;
/** Blades per metre of spot radius, and the floor and ceiling on the count. */
const BLADES_PER_METRE = 9;
const BLADES_MIN = 9;
const BLADES_MAX = 20;
/** How much of a vertex normal is the sky rather than the blade's own face. */
const SKY_LIFT = 0.34;

const SALT = {
  around: 0x51c3,
  reach: 0x62d4,
  height: 0x73e5,
  bearing: 0x84f6,
} as const;

interface Blade {
  readonly rootX: number;
  readonly rootZ: number;
  readonly rootY: number;
  readonly height: number;
  readonly bearing: number;
}

function bladesFor(field: Heightfield, spot: ContactSpot, seed: number): Blade[] {
  const count = Math.max(
    BLADES_MIN,
    Math.min(BLADES_MAX, Math.round(spot.radius * BLADES_PER_METRE)),
  );
  const out: Blade[] = [];
  for (let b = 0; b < count; b++) {
    const index = seed + b;
    const around = ((b + hash01(index, SALT.around) * 0.8) / count) * Math.PI * 2;
    const dirX = Math.cos(around);
    const dirZ = Math.sin(around);
    const front = dirZ < FRONT_LIMIT;
    const [near, far] = front ? FRONT_ROOT : BACK_ROOT;
    const reach = spot.radius * (near + (far - near) * hash01(index, SALT.reach));
    const rootX = spot.x + dirX * reach;
    const rootZ = spot.z + dirZ * reach;
    out.push({
      rootX,
      rootZ,
      rootY: field.groundY(rootX, rootZ),
      height:
        spot.blade *
        (HEIGHT_MIN + (HEIGHT_MAX - HEIGHT_MIN) * hash01(index, SALT.height)) *
        (front ? FRONT_TALL : BACK_TALL),
      // Leaning outward from the spot, wandering off the radial by up to a third
      // of a radian so a collar is not a starburst.
      bearing: around + (hash01(index, SALT.bearing) - 0.5) * 0.7,
    });
  }
  return out;
}

function buildCollarGeometry(
  field: Heightfield,
  spots: readonly ContactSpot[],
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let seed = 1;

  for (const spot of spots) {
    for (const blade of bladesFor(field, spot, seed)) {
      seed += 7;
      const leanX = Math.cos(blade.bearing) * LEAN * blade.height;
      const leanZ = Math.sin(blade.bearing) * LEAN * blade.height;
      // Across the blade's width: perpendicular to its lean, in the ground
      // plane. Its face therefore looks along the lean, which is outward, which
      // is toward whichever camera can see it.
      const acrossX = -Math.sin(blade.bearing);
      const acrossZ = Math.cos(blade.bearing);
      const nx = Math.cos(blade.bearing) * (1 - SKY_LIFT);
      const nz = Math.sin(blade.bearing) * (1 - SKY_LIFT);
      const length = Math.sqrt(nx * nx + SKY_LIFT * SKY_LIFT + nz * nz) || 1;

      const base = positions.length / 3;
      for (const end of [0, 1] as const) {
        const half = end === 0 ? ROOT_HALF : TIP_HALF;
        const cx = blade.rootX + leanX * end;
        const cz = blade.rootZ + leanZ * end;
        for (const side of [-1, 1] as const) {
          positions.push(
            cx + acrossX * half * side,
            blade.rootY + blade.height * end,
            cz + acrossZ * half * side,
          );
          // Flat across the whole blade: a collar blade is four vertices, and a
          // smooth normal over four vertices is a gradient rather than a band.
          normals.push(nx / length, SKY_LIFT / length, nz / length);
        }
      }
      indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildBaseGrassMesh(field: Heightfield, spots: readonly ContactSpot[]): THREE.Mesh {
  const material = makeBandedMaterial({
    surface: COLLAR,
    // Grain at roughly two cycles per metre, so two blades a hand apart draw
    // different values and the collar reads as many plants rather than one cut
    // shape.
    grainScale: 2.6,
    grainAmount: 0.11,
  });
  // A blade is a strip with no thickness, so half of every collar is seen from
  // behind; three flips the normal for those faces.
  material.side = THREE.DoubleSide;
  return new THREE.Mesh(buildCollarGeometry(field, spots), material);
}
