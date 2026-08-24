// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The toon ramp (spec/05). One material factory, one light direction, used by
 * every solid in the field so the whole scene reads as one image rather than a
 * pile of primitives.
 *
 * TSL node materials only (spec/01). No ShaderMaterial, no onBeforeCompile:
 * this compiles to WGSL and GLSL from the same source, so the WebGPU and WebGL2
 * backends of WebGPURenderer show the same picture with no per-backend fork.
 *
 * Three bands, a soft terminator, and a cool hue shift in shadow rather than a
 * darkened base. The band placement is not arbitrary - it is derived from the
 * sun's 14.5 degree elevation (tsl/palette.ts):
 *
 *   ground plane, normal +y      nDotL 0.62   -> lit band
 *   surface facing the sun       nDotL 0.98   -> lit band
 *   surface across the sun       nDotL 0.50   -> mid band
 *   surface facing away          nDotL 0.02   -> shadow band
 *
 * so the field is golden, a sheep's flank splits into three tones across its
 * width, and rolling terrain crosses a band edge where a slope turns away.
 *
 * The lighting is computed here rather than by three's light nodes on purpose.
 * The ramp is the art direction, not a physical model, and a quantized ramp
 * driven by a single authored vector is both cheaper and more controllable than
 * a toon node fed by a real DirectionalLight. That is also why Atmosphere mounts
 * no light objects: there is nothing for them to feed (AGENTS.md rule 10).
 */

import * as THREE from 'three/webgpu';
import { RAMP, RIM, SUN_DIRECTION } from './palette';
import {
  clamp,
  color,
  dot,
  float,
  mix,
  normalView,
  normalWorld,
  positionViewDirection,
  smoothstep,
  uniform,
  vec3,
  type TSLNode,
} from './nodes';

/**
 * One uniform for the whole game. Sharing the node (rather than one uniform per
 * material) is what makes "consistent light direction everywhere" structural
 * instead of a convention someone has to remember.
 */
const sunNode = uniform(SUN_DIRECTION) as TSLNode;

const SHADOW_TINT = vec3(...RAMP.shadow) as TSLNode;
const MID_TINT = vec3(...RAMP.mid) as TSLNode;
const LIT_TINT = vec3(...RAMP.lit) as TSLNode;
const SKY_FILL = vec3(...RAMP.fill) as TSLNode;
const RIM_COLOR = vec3(...RIM.color) as TSLNode;

const HALF_TERMINATOR = RAMP.terminator / 2;

export interface ToonOptions {
  /**
   * Gentle warm rim on the silhouette. Hero assets only (sheep, dog): it costs
   * a fresnel per fragment, and on ground and ground-adjacent flats it reads as
   * noise along every edge rather than as light.
   */
  rim?: boolean;
}

/**
 * Build a toon-banded material around a base colour node.
 *
 * Takes a node rather than a colour so callers can hand it a mix, a noise, or a
 * per-instance tint and still get the same ramp. Wrap a flat colour with
 * `color('#...')` from the TSL shim, or use `makeToonColorMaterial`.
 */
export function makeToonMaterial(
  baseColorNode: TSLNode,
  options: ToonOptions = {},
): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();

  // Half-lambert: the raw dot spends most of a sphere below zero, which throws
  // away the range the bands need. Remapped to 0..1 the terminator lands where
  // it can be placed by eye.
  const nDotL = dot(normalWorld, sunNode).mul(0.5).add(0.5);

  const shaded = baseColorNode.mul(SHADOW_TINT).add(SKY_FILL);
  const midlit = baseColorNode.mul(MID_TINT);
  const sunlit = baseColorNode.mul(LIT_TINT);

  const outOfShadow = smoothstep(
    float(RAMP.shadowEdge - HALF_TERMINATOR),
    float(RAMP.shadowEdge + HALF_TERMINATOR),
    nDotL,
  );
  const intoKey = smoothstep(
    float(RAMP.litEdge - HALF_TERMINATOR),
    float(RAMP.litEdge + HALF_TERMINATOR),
    nDotL,
  );

  let shadedColor = mix(mix(shaded, midlit, outOfShadow), sunlit, intoKey);

  if (options.rim === true) {
    // Fresnel: 1 where the surface turns away from the camera, 0 facing it.
    const facing = clamp(dot(normalView, positionViewDirection), float(0), float(1));
    const fresnel = float(1).sub(facing);
    const edge = smoothstep(float(RIM.start), float(1), fresnel);
    // Strongest on the key side, but never off: a backlit sheep needs its edge
    // most exactly where its body has gone dark.
    const keyed = mix(
      float(RIM.shadowFloor),
      float(1),
      smoothstep(float(0.3), float(0.7), nDotL),
    );
    shadedColor = shadedColor.add(RIM_COLOR.mul(edge).mul(keyed).mul(float(RIM.strength)));
  }

  material.colorNode = shadedColor;
  return material;
}

/** Convenience for the common case: one flat colour through the same ramp. */
export function makeToonColorMaterial(
  base: string,
  options: ToonOptions = {},
): THREE.MeshBasicNodeMaterial {
  return makeToonMaterial(color(base), options);
}
