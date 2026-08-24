// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The dog's contact shadow: one soft ellipse on the ground, so the animal sits
 * in the field instead of hovering over it.
 *
 * There is no shadow map in this scene and there is not going to be one - the
 * light is a single authored vector and the ramp is art direction, not a
 * physical model (tsl/toon.ts). What the picture actually needs from a shadow
 * is contact: a dark patch that says the paws are touching. That is a decal, and
 * a decal costs one blended quad.
 *
 * It is an alpha blend of one dark tone, not a multiply. Multiply was the first
 * try and it is the more correct idea - it would keep the ground's own colour
 * underneath - but MultiplyBlending does not survive this renderer's blend
 * setup and the patch came back as a white puddle. A measured failure beats a
 * clever one: a straight blend of a hue-shifted dark green reads correctly on
 * the pasture it spends its whole life on, and the pen floor it visits is warm
 * enough that a cool patch still reads as shade there.
 *
 * The tone is hue-shifted cool (blue and green survive, red drops) for the same
 * reason the ramp's shadow band is: a grey shadow on golden-hour grass is mud
 * (spec/05).
 *
 * The mesh takes the dog's position and heading but never its lean, roll or bob:
 * the ground does not tip when the dog does.
 */

import * as THREE from 'three/webgpu';
import { clamp, color, distance, float, length, smoothstep, uv, vec2 } from '@app/tsl/nodes';
import { FORE_PAW, HIND_PAW } from './dogGeometry';

/** Half-width and half-length of the patch, metres. Wider than the dog's stance
 *  and a little shorter than its body: a shadow that ran nose to tail would
 *  read as a plank. */
const HALF_WIDTH = 0.72;
const HALF_LENGTH = 1.25;
/** Where the patch centres along the dog's spine, metres. Between the paws,
 *  which is behind the middle of a long-necked animal. */
const CENTRE_Z = -0.05;
/**
 * Height above the ground, metres. Raised from 0.05, and the reason is the one
 * thing a ground decal cannot do: the grass is 0.5 m of opaque instanced blades
 * standing in front of it, drawn before the transparent pass, so every blade
 * between the camera and the patch wins the depth test and the shadow simply is
 * not there. The critic's sample one row under the hind paws came back at the
 * unshaded pasture value for exactly that reason.
 *
 * 0.11 m lifts the decal into the base of the canopy instead of under it, so it
 * reads through the gaps between blades rather than behind them. It is still
 * well under the blade height, and at Follow's 20 degree elevation an 11 cm lift
 * over a 2.3 m patch is half a pixel of parallax.
 */
export const SHADOW_LIFT = 0.11;

/**
 * The shade tone. A deep pasture green pulled toward the sky, which is what the
 * ramp's shadow band does to grass anyway - and solved backwards through the
 * tone map like every other colour on this animal, so it lands at sRGB(62,76,70)
 * where the patch is at its densest. Authored at face value, the same intent
 * measured (6,25,20) under the paws: Khronos Neutral subtracts a black offset
 * from all three channels, and a decal dark enough to read through 0.5 m of
 * grass became the hole in the ground spec/05 forbids.
 * palette candidate: promote in cohesion pass
 */
const SHADOW_COLOUR = '#505a52';
/** Opacity of the broad body patch, and of each of the four paw pools stacked
 *  on top of it. Measured against the capture rather than guessed: at 0.44 over
 *  a 2.5 m ellipse the patch was too diffuse to read as contact under a canopy
 *  of 0.5 m grass, so the ellipse is smaller, the tone is a step deeper, and
 *  most of the density now sits in the four pools where the paws actually are.
 *  That is the difference between a smudge and a dog standing on the ground. */
const BODY_DENSITY = 0.44;
const PAW_DENSITY = 0.62;
/** The dense core under the barrel, where a low sun actually puts the darkest
 *  ground. Narrower than the body patch and half again as dense: without it the
 *  broad ellipse is a uniform smudge, and a shadow with no gradient in it reads
 *  as a painted circle rather than as an animal standing on grass. */
const CORE_DENSITY = 0.5;
const CORE_HALF_X = 0.55;
const CORE_HALF_Y = 0.62;

/** The four paw pools, in the decal's own unit space (x across, y along),
 *  computed from where dogGeometry actually puts the four soles rather than
 *  copied out by hand: the anatomy tables move, and a pool that stayed behind
 *  would be a dark spot in the grass with no foot in it. */
const PAWS: readonly [number, number][] = [FORE_PAW, HIND_PAW].flatMap(({ x, z }) => {
  const alongPatch = (z - CENTRE_Z) / HALF_LENGTH;
  return [
    [x / HALF_WIDTH, alongPatch],
    [-x / HALF_WIDTH, alongPatch],
  ] as [number, number][];
});

export interface ContactShadow {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.MeshBasicNodeMaterial;
}

export function makeContactShadow(): ContactShadow {
  const geometry = new THREE.CircleGeometry(1, 28);
  geometry.rotateX(-Math.PI / 2);
  geometry.scale(HALF_WIDTH, 1, HALF_LENGTH);
  geometry.translate(0, 0, CENTRE_Z);

  // Unit disc coordinates from the circle's own uv, which survives the rotate,
  // scale and translate above.
  const p = uv().sub(vec2(0.5, 0.5)).mul(float(2));
  const body = float(1)
    .sub(smoothstep(float(0.12), float(1), length(p)))
    .mul(float(BODY_DENSITY));

  const core = float(1)
    .sub(smoothstep(float(0.2), float(1), length(p.div(vec2(CORE_HALF_X, CORE_HALF_Y)))))
    .mul(float(CORE_DENSITY));

  let pools = float(0);
  for (const [x, y] of PAWS) {
    pools = pools.add(
      float(1)
        .sub(smoothstep(float(0.04), float(0.3), distance(p, vec2(x, y))))
        .mul(float(PAW_DENSITY)),
    );
  }

  const density = clamp(body.add(core).add(pools), float(0), float(1));

  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = color(SHADOW_COLOUR);
  material.opacityNode = density;
  material.transparent = true;
  material.depthWrite = false;

  return { geometry, material };
}
