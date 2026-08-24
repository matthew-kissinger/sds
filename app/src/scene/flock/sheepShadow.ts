// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The flock's contact shadow: one soft ellipse per sheep, so the animals sit in
 * the field instead of hovering over it.
 *
 * There is no shadow map in this scene and there is not going to be one - the
 * light is a single authored vector and the ramp is art direction, not a
 * physical model (tsl/toon.ts). What the picture actually needs from a shadow is
 * contact: a dark patch that says the hooves are touching. That is a decal, and
 * a decal costs one blended quad. The dog already sits in the grass this way
 * (scene/dog/contactShadow.ts); until this pass the flock in the same frame did
 * not, and a hovering flock next to a grounded dog is the mixed-provenance read
 * spec/05 spends a whole section on.
 *
 * IT COSTS NO CPU AND NO EXTRA MATRIX. The decal mesh is a third InstancedMesh
 * bound to the SAME instance matrix buffer as the body and the outline, so the
 * frame loop still writes one matrix per sheep however large the flock grows.
 * That is only possible because the instance matrix carries nothing a shadow
 * must not have: the run lean and the breathing bob both live in the vertex
 * shader (sheepMotion.ts), so what the matrix holds is position, heading and
 * size - exactly what a shadow wants. A bigger sheep gets a bigger patch for
 * free.
 *
 * The tone is a deep pasture green pulled toward the sky rather than a grey,
 * for the reason the ramp's shadow band is hue-shifted: a grey shadow on
 * golden-hour grass is mud (spec/05).
 */

import * as THREE from 'three/webgpu';
import { clamp, color, distance, float, length, smoothstep, uv, vec2 } from '@app/tsl/nodes';

/**
 * Half-width and half-length of the patch, metres.
 *
 * SCALED TO THE FOOTPRINT, NOT TO THE ANIMAL. The previous patch was 0.76 by
 * 1.10 m, wider than the stance and nearly as long as the body, and at the phone
 * framing it read as a hard dark ellipse sitting beside the sheep rather than
 * under it. These bounds are the four hooves plus a hand's width: 0.64 by 0.94,
 * centred between them.
 */
const HALF_WIDTH = 0.32;
const HALF_LENGTH = 0.47;
/** Where the patch centres along the spine, metres. Between the hooves, which
 *  is behind the middle of an animal that carries a head out front. */
const CENTRE_Z = -0.03;
/** Height above the ground, metres. Enough to clear the relief under the patch
 *  without the decal floating visibly at Follow. */
const LIFT = 0.03;

/**
 * The shade tone, solved backwards through the tone map the way the dog's was:
 * Khronos Neutral subtracts a black offset from all three channels, so a decal
 * authored dark enough to read through 0.5 m of grass arrives as the hole in the
 * ground spec/05 forbids.
 *
 * palette candidate: promote in cohesion pass
 */
const SHADOW_COLOUR = '#586253';
/** Opacity of the broad body patch, and of each of the four hoof pools stacked
 *  on top of it. Most of the density sits in the pools, because that is where
 *  the animal is actually touching; the broad patch only stops the pools reading
 *  as four unrelated spots. Both came down this pass: the patch was reading as
 *  a painted-on ellipse rather than as contact. */
const BODY_DENSITY = 0.38;
const HOOF_DENSITY = 0.32;

/** The four hoof pools, in the decal's own unit space (x across, y along).
 *  Taken from LEG_PLACEMENT divided by the half-extents above. */
const HOOVES: readonly [number, number][] = [
  [0.7, 0.53],
  [-0.7, 0.53],
  [0.66, -0.53],
  [-0.66, -0.53],
];

export interface SheepShadow {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.MeshBasicNodeMaterial;
}

export function makeSheepShadow(): SheepShadow {
  const geometry = new THREE.CircleGeometry(1, 20);
  geometry.rotateX(-Math.PI / 2);
  geometry.scale(HALF_WIDTH, 1, HALF_LENGTH);
  geometry.translate(0, LIFT, CENTRE_Z);

  // Unit disc coordinates from the circle's own uv, which survives the rotate,
  // scale and translate above.
  const p = uv().sub(vec2(0.5, 0.5)).mul(float(2));
  // Falloff from the centre with no plateau. The previous patch held full
  // density out to a tenth of its radius and then fell, which put a visible hard
  // rim on the ellipse; starting the falloff at zero makes the whole decal a
  // gradient and there is no edge left to see.
  const body = float(1)
    .sub(smoothstep(float(0), float(0.95), length(p)))
    .mul(float(BODY_DENSITY));

  let pools = float(0);
  for (const [x, y] of HOOVES) {
    pools = pools.add(
      float(1)
        .sub(smoothstep(float(0), float(0.42), distance(p, vec2(x, y))))
        .mul(float(HOOF_DENSITY)),
    );
  }

  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = color(SHADOW_COLOUR);
  material.opacityNode = clamp(body.add(pools), float(0), float(1));
  material.transparent = true;
  material.depthWrite = false;

  return { geometry, material };
}
