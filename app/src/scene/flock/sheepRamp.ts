// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The sheep's three-band ramp. A warm key, broad cream middle and cool sage
 * shade are the complete cel statement. The previous four-value chain put three
 * terminators across a body scarcely 30 pixels tall at Classic distance; the
 * extra warm-to-mid edge read as a dark belt rather than useful form.
 *
 * The ramp still evaluates the light the animal actually stands in: an even mix
 * of the low golden key and sky visibility. The key alone spans too little of a
 * rounded fleece under an eight-degree sun to place reliable bands. Sky
 * visibility opens that range without inventing a second directional light.
 *
 * Face, ears, legs and hooves cross the same two edges as gains, so every part
 * belongs to one drawing. All authored pigment lives in the master palette.
 */

import { PALETTE } from '@app/tsl/palette';
import { float, mix, smoothstep, vec3, type TSLNode } from '@app/tsl/nodes';

/**
 * Authored sRGB hex to the linear working space, at build time.
 *
 * Done here rather than by handing the hex to `color('#...')` because these
 * values are wanted as plain vec3 constants inside one mix chain, and keeping
 * every term in the chain the same node type is what stops the expression
 * compiling differently on the two backends.
 */
export function srgbLinear(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [channel((n >> 16) & 255), channel((n >> 8) & 255), channel(n & 255)];
}

/**
 * How the key and the sky split the fleece's light.
 *
 * AN EVEN SPLIT, AND BOTH ENDS OF IT WERE MEASURED OFF CAPTURES. At 56/44 the
 * ramp banded on a sheep seen broadside and not at all on one seen from behind:
 * a scan down the rump of the big centre animal in the Follow frame ran 228 to
 * 197 sRGB over eighty pixels, because a rump's normals barely change in the
 * vertical once the key is weighted heavily and the key itself is nearly
 * horizontal. Pushed the other way to 36/64 the rump banded and the TOP went
 * flat: at the Classic and Follow cameras, which look down on the animal, sky
 * visibility is near 1 across everything they can see, so the whole crest shared
 * one band and a flock read as white blobs.
 *
 * At 50/50 both scans work, and they work differently, which is the point. Down
 * the shaded side a vertical scan crosses lit at the crown, mid through the
 * broad flank and shade under the belly: two terminators. Across the top the
 * KEY term is what varies, so the lit edge runs
 * fore and aft along the spine and separates the sun side from the shaded side -
 * which is the edge a top-down camera sees.
 *
 * That is art direction, not physics, and it is the same direction Breath of the
 * Wild takes on cloth: the ramp describes the FORM first and the light second.
 * It is still one authored light - there is no second sun and no second shadow,
 * only the warm sky the fog and the bounce already read, weighted by how much of
 * it a patch of fleece can see.
 */
export const KEY_SHARE = 0.5;
export const SKY_SHARE = 0.5;

/** Two edges, both softened enough to stay stable in motion. */
const EDGE_SHADE = 0.285;
const EDGE_LIT = 0.64;
const TERMINATOR_SHADE = 0.07;
const TERMINATOR_LIT = 0.06;

const WOOL_LIT = vec3(...srgbLinear(PALETTE.sheepWoolLit)) as TSLNode;
const WOOL_MID = vec3(...srgbLinear(PALETTE.sheepWoolMid)) as TSLNode;
const WOOL_SHADE = vec3(...srgbLinear(PALETTE.sheepWoolShade)) as TSLNode;

/**
 * What the same three bands do to the dark parts, as gains. Gains rather than
 * painted values because the face, the legs and the hooves are three values of
 * one near-black and they all have to band together.
 */
const DARK_SHADE = 0.72;
const DARK_MID = 0.92;
const DARK_LIT = 1.2;

export interface WoolBands {
  /** The fleece colour for this fragment, before mottle and root shade. */
  readonly fleece: TSLNode;
  /** The gain the dark parts take at the same light. */
  readonly darkGain: TSLNode;
  /** 1 deep in the shade band, 0 out of it. Drives the sky bounce. */
  readonly shade: TSLNode;
  /** 1 in full key, 0 below it. Drives the painted breakup's contrast, and
   *  keeps the rim off the one band that has no room left to brighten. */
  readonly key: TSLNode;
}

function band(edge: number, width: number, light: TSLNode): TSLNode {
  return smoothstep(float(edge - width / 2), float(edge + width / 2), light);
}

/**
 * Evaluate the ramp once. Both readers share the two smoothsteps.
 *
 * @param light key and sky, combined and normalised to 0..1.
 * @param gain the instance's fleece gain, applied to all three palette tones so
 *   a dark-fleeced sheep stays dark across its own terminators.
 */
export function woolBands(light: TSLNode, gain: TSLNode): WoolBands {
  const outOfShade = band(EDGE_SHADE, TERMINATOR_SHADE, light);
  const intoLit = band(EDGE_LIT, TERMINATOR_LIT, light);

  const fleece = mix(
    mix(WOOL_SHADE.mul(gain), WOOL_MID.mul(gain), outOfShade),
    WOOL_LIT.mul(gain),
    intoLit,
  );

  const darkGain = mix(
    mix(float(DARK_SHADE), float(DARK_MID), outOfShade),
    float(DARK_LIT),
    intoLit,
  );

  return { fleece, darkGain, shade: float(1).sub(outOfShade), key: intoLit };
}
