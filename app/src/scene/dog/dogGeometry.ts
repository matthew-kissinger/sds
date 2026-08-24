// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Where the collie's parts hang. The shapes are in dogParts.ts; this file is the
 * skeleton, and every constant in it is a joint position in dog-local metres.
 *
 * One mesh, one draw call, and - the part the material depends on - every part
 * authored directly in dog-local space with no per-part group transform. That
 * makes `positionLocal` mean the same thing everywhere on the mesh, which is what
 * lets dogMarkings paint the collie's marks from anatomy coordinates.
 *
 * THE LEGS HANG UNDER THE BARREL. Fore legs at x 0.24 against a 0.43 half-width
 * withers and hind legs at x 0.22 against a 0.44 half-width haunch keep even the
 * widest upper-arm and thigh rings inside the body envelope. The previous 0.34 /
 * 0.35 stance put those masses proud of the ribs and hips, making the shoulders
 * and thighs read much broader than the body.
 *
 * This is not a centreline stack. The upper arms retain 15 cm of daylight
 * between their medial edges, the thigh swells retain a narrow seam, and the
 * smaller lower legs and paws separate clearly at gameplay distance. The body
 * keeps the collie silhouette while the limbs now read as supporting it rather
 * than being bolted to its sides. Burying each first-ring cap well inside the
 * body also prevents the outline hull from drawing a plate at either joint.
 */

import * as THREE from 'three/webgpu';
import { LoftBuilder, place } from './loft';
import { EAR, FORE_LEG, GASKIN, PAW, SPINE, TAIL, THIGH } from './dogParts';

/** Where the four legs hang from. Both pairs sit beneath their body masses but
 *  remain far enough apart that the left and right legs never merge. */
const FORE_LEG_X = 0.24;
const FORE_LEG_Z = 0.32;
/** Shoulder joint height. FORE_LEG drops 0.85 m from here to the pastern, and
 *  the paw takes the last 0.18 m, so the sole lands at 0.02 m: on the ground,
 *  with a sliver left for the contact shadow. */
const FORE_LEG_Y = 1.05;
const HIND_LEG_X = 0.22;
const HIND_LEG_Z = -0.56;
const HIND_LEG_Y = 1.13;
/** Where the thigh hands over to the gaskin, from THIGH's last ring. */
const STIFLE_Y = HIND_LEG_Y - 0.5;
const STIFLE_Z = HIND_LEG_Z - 0.07;
/** Where each leg hands over to its paw, from the legs' last rings. Both sit at
 *  y 0.20, which is what puts all four soles on one plane. */
const FORE_PASTERN_Y = FORE_LEG_Y - 0.85;
const FORE_PASTERN_Z = FORE_LEG_Z + 0.036;
const HIND_PASTERN_Y = STIFLE_Y - 0.43;
const HIND_PASTERN_Z = STIFLE_Z - 0.01;

/** Where a paw sole ends up, for the contact shadow that has to pool under it. */
export const FORE_PAW = { x: FORE_LEG_X, z: FORE_PASTERN_Z + 0.068 } as const;
export const HIND_PAW = { x: HIND_LEG_X, z: HIND_PASTERN_Z + 0.068 } as const;
/** All four authored paw soles share this local height. */
export const DOG_PAW_BASELINE = 0.02;
/** Material selector order: front +x, front -x, hind +x, hind -x. */
export const DOG_PAW_CONTACTS = [
  FORE_PAW,
  { x: -FORE_PAW.x, z: FORE_PAW.z },
  HIND_PAW,
  { x: -HIND_PAW.x, z: HIND_PAW.z },
] as const;

const EAR_X = 0.175;
const EAR_Y = 1.45;
const EAR_Z = 0.95;
/** Outward tilt of an ear from vertical, radians. 17 degrees: a clear V from
 *  overhead, well short of the alert-terrier look, and shallow enough that the
 *  pair keep the same width from the front as they have from behind. */
const EAR_SPLAY = 0.3;
/** Spin of the ear blade about its own axis, radians. 13 degrees. The section is
 *  nearly square, so all the twist does is turn the fold slightly outward, the
 *  direction a working collie's ears actually fall. */
const EAR_TWIST = 0.22;

const TAIL_Y = 1.11;
const TAIL_Z = -0.9;

const DOWN = Math.PI / 2;
const UP = -Math.PI / 2;
const BACKWARD = Math.PI;

/** Cross-section polygon counts. 8 reads as a body and as a plume; 6 is chunky
 *  enough for a leg, an ear and a paw at every distance the game uses. The thigh
 *  takes the body count rather than the limb count: it is 0.42 m across, and at
 *  six sides its facets were wide enough to read as a machined slab from
 *  overhead. */
const BODY_SIDES = 8;
const LIMB_SIDES = 6;

/** Build the whole dog as one geometry. */
export function buildDogGeometry(): THREE.BufferGeometry {
  const dog = new LoftBuilder();

  dog.add(SPINE, BODY_SIDES);

  for (const side of [1, -1]) {
    dog.add(FORE_LEG, LIMB_SIDES, place(side * FORE_LEG_X, FORE_LEG_Y, FORE_LEG_Z, DOWN));
    dog.add(PAW, LIMB_SIDES, place(side * FORE_LEG_X, FORE_PASTERN_Y, FORE_PASTERN_Z, DOWN));
    dog.add(THIGH, BODY_SIDES, place(side * HIND_LEG_X, HIND_LEG_Y, HIND_LEG_Z, DOWN));
    dog.add(GASKIN, LIMB_SIDES, place(side * HIND_LEG_X, STIFLE_Y, STIFLE_Z, DOWN));
    dog.add(PAW, LIMB_SIDES, place(side * HIND_LEG_X, HIND_PASTERN_Y, HIND_PASTERN_Z, DOWN));
    dog.add(
      EAR,
      LIMB_SIDES,
      place(side * EAR_X, EAR_Y, EAR_Z, UP, side * EAR_TWIST, -side * EAR_SPLAY),
    );
  }

  dog.add(TAIL, BODY_SIDES, place(0, TAIL_Y, TAIL_Z, 0, BACKWARD));

  return dog.build();
}
