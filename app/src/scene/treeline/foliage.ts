// SPDX-License-Identifier: AGPL-3.0-or-later
/** Shared tree light, distance and wind. Color authority lives in tsl/palette.ts. */
import { PALETTE, SUN_DIRECTION } from '@app/tsl/palette';
import {
  cameraPosition, color, dot, float, length, mix, normalWorld,
  positionWorld, sin, smoothstep, time, uniform, type TSLNode,
} from '@app/tsl/nodes';

// Retained shrub material authoring; the active treeline contains no shrubs.
export const UNDER_SHADOW = '#30391f';
export const UNDER_BODY = '#465127';
export const UNDER_LIT = '#667039';

// Scene fog supplies most aerial perspective. This small shared contribution
// separates the outer belts without bleaching the first row into the horizon.
export const AERIAL_MAX = 0.14;
export const AERIAL_NEAR = 100;
export const AERIAL_FAR = 340;
const BARK_AERIAL_MAX = 0.10;

const sunNode = uniform(SUN_DIRECTION) as TSLNode;
const TERMINATOR = 0.085;
const HALF = TERMINATOR / 2;
const SHADOW_EDGE = 0.32;
const LIT_EDGE = 0.665;
export const BAND_SHADOW_EDGE = SHADOW_EDGE;

export function sunFacing(): TSLNode {
  return dot(normalWorld, sunNode).mul(0.5).add(0.5);
}

export function threeBand(shadow: TSLNode, body: TSLNode, lit: TSLNode, nDotL: TSLNode): TSLNode {
  const outOfShadow = smoothstep(float(SHADOW_EDGE - HALF), float(SHADOW_EDGE + HALF), nDotL);
  const intoKey = smoothstep(float(LIT_EDGE - HALF), float(LIT_EDGE + HALF), nDotL);
  return mix(mix(shadow, body, outOfShadow), lit, intoKey);
}

export function recede(tone: TSLNode): TSLNode {
  return mix(tone, color(PALETTE.skyHorizon), aerial().mul(float(AERIAL_MAX)));
}

export function recedeBark(tone: TSLNode): TSLNode {
  return mix(tone, color(PALETTE.skyHorizon), aerial().mul(float(BARK_AERIAL_MAX)));
}

export function aerial(): TSLNode {
  return smoothstep(float(AERIAL_NEAR), float(AERIAL_FAR), length(positionWorld.sub(cameraPosition)));
}

// Same broad wind direction as the grass, evaluated without CPU updates.
export const WIND_X = 0.76;
export const WIND_Z = 0.65;
const GUST = [
  { k: 0.0125, rate: 0.42, weight: 0.62 },
  { k: 0.031, rate: 0.77, weight: 0.38 },
] as const;

export function gustAt(worldX: TSLNode, worldZ: TSLNode): TSLNode {
  let total: TSLNode = float(0);
  for (const wave of GUST) {
    const along = worldX.mul(float(WIND_X * wave.k)).add(worldZ.mul(float(WIND_Z * wave.k)));
    total = total.add(sin(along.sub(time.mul(float(wave.rate)))).mul(float(wave.weight)));
  }
  return total;
}
