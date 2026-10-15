// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The painted breakup of the field: the one field the ground and the grass
 * standing in it both read, so a clump on a browner patch is itself browner.
 *
 * IT IS ONE FUNCTION BECAUSE IT HAS TO BE. This lived twice - as `paintedField`
 * in scene/Terrain.tsx and as `sineHashField` in scene/grass/grassMaterial.ts -
 * at the same frequencies, angles and phases, with a comment in each saying the
 * two matched. They did not. The copies had drifted to different inner
 * constants (1.31 against 1.37, 0.47 against 0.43, 0.63 against 0.61, 0.70
 * against 0.72), so the ground's patches and the grass's patches were near
 * neighbours rather than one field, and nothing could have caught it: two
 * copies of a formula in different files drift unseen, which is the hazard
 * grassMaterial.ts names three lines above its own copy of the recovery spring.
 *
 * LATTICE VALUE NOISE, NOT CROSSED SINES. The pair it replaces summed two
 * rotated sine strokes with an inner warp. That is cheap and has no lattice,
 * but a sum of sines keeps the axes of its strokes. This is ordinary value
 * noise - four hashed lattice corners, bilinear between them, a quintic fade
 * on each axis so the cell edges carry no visible seam - which has no preferred
 * direction. One more hash, no texture, no MaterialX helper graph.
 *
 * The frequencies are art direction and are carried unchanged: ~14 m patches
 * broken by ~4 m mottling. One octave alone reads as camouflage blobs from the
 * Classic camera.
 */

import {
  dot,
  float,
  floor,
  fract,
  mix,
  sin,
  smoothstep,
  vec2,
  type TSLNode,
} from './nodes';

/** Cycles per metre. The reciprocal is the feature size: 14.3 m and 3.8 m. */
const PATCH_SCALE = 0.07;
const MOTTLE_SCALE = 0.26;
/** How far the fine octave may pull the coarse one. */
const MOTTLE_WEIGHT = 0.45;

/**
 * Rotations, in radians, and lattice offsets. The rotations stop the two
 * octaves from sharing lattice lines; the offsets put them in unrelated parts
 * of the same hash, which is what the old pair used a phase argument for.
 */
const PATCH_ANGLE = 0.38;
const PATCH_OFFSET = [11.7, -4.3] as const;
const MOTTLE_ANGLE = -1.13;
const MOTTLE_OFFSET = [-7.1, 9.8] as const;

/** Where the summed octaves are cut into the 0..1 blend both surfaces mix on. */
const BLEND_LOW = -0.35;
const BLEND_HIGH = 0.35;

/** One hashed lattice corner, in [-1, 1]. */
function latticeValue(cell: TSLNode): TSLNode {
  return fract(sin(dot(cell, vec2(127.1, 311.7))).mul(float(43758.5453123)))
    .mul(float(2))
    .sub(float(1));
}

/** One octave of value noise at a world position, in roughly [-1, 1]. */
function octave(
  root: TSLNode,
  frequency: number,
  angle: number,
  offset: readonly [number, number],
): TSLNode {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rotated = vec2(
    root.x.mul(float(c)).add(root.y.mul(float(s))),
    root.y.mul(float(c)).sub(root.x.mul(float(s))),
  )
    .mul(float(frequency))
    .add(vec2(offset[0], offset[1]));

  const cell = floor(rotated);
  const local = fract(rotated);
  // Quintic fade, 6t^5 - 15t^4 + 10t^3: zero first AND second derivative at
  // both ends, so neighbouring cells meet without a crease. The cubic
  // smoothstep three leaves a faint grid at these feature sizes.
  const fade = local
    .mul(local)
    .mul(local)
    .mul(local.mul(local.mul(float(6)).sub(float(15))).add(float(10)));

  const near = mix(latticeValue(cell), latticeValue(cell.add(vec2(1, 0))), fade.x);
  const far = mix(
    latticeValue(cell.add(vec2(0, 1))),
    latticeValue(cell.add(vec2(1, 1))),
    fade.x,
  );
  return mix(near, far, fade.y);
}

/**
 * The painted blend at a world XZ, 0 toward the dark green and 1 toward the
 * light. Both the terrain and the grass mix their own colours on this one
 * number, which is the whole point of the module.
 */
export function paintedBlend(root: TSLNode): TSLNode {
  const patches = octave(root, PATCH_SCALE, PATCH_ANGLE, PATCH_OFFSET);
  const mottle = octave(root, MOTTLE_SCALE, MOTTLE_ANGLE, MOTTLE_OFFSET);
  return smoothstep(
    float(BLEND_LOW),
    float(BLEND_HIGH),
    patches.add(mottle.mul(float(MOTTLE_WEIGHT))),
  );
}
