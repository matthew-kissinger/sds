// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The band weights of the shared toon ramp, plus the inversion that lets this
 * asset author the colour it wants ON SCREEN rather than the colour that happens
 * to survive the ramp.
 *
 * This is not a second ramp. It reads RAMP and SUN_DIRECTION from tsl/palette.ts
 * and rebuilds the two smoothsteps tsl/toon.ts uses, so the terminator sits in
 * exactly the same place on this roof as on a sheep standing in front of it.
 *
 * WHY THE INVERSION EXISTS. Two passes were lost to the same arithmetic. The
 * shared ramp multiplies a base colour by a band tint, and RAMP.shadow is a cool
 * GAIN of (0.46, 0.55, 0.80). Hand it a warm cream and it returns a periwinkle:
 * red is cut by more than half while blue keeps four fifths. Authoring a warmer
 * shadow colour by eye did not fix it either, because the gain is applied on top
 * of whatever is authored, so every correction landed somewhere unpredictable.
 *
 * So the palette now authors TARGETS - the sRGB a screenshot should contain - and
 * this module solves backwards through the whole chain for the base the ramp has
 * to be handed:
 *
 *   target sRGB -> linear -> undo tone map -> undo grade -> undo band tint -> base
 *
 * The tone map is Khronos Neutral, which below its shoulder subtracts a flat 0.04
 * from every channel; the grade is the one expression in scene/PostProcessing.tsx.
 * Both are inverted here at build time, in TypeScript, so the shader is unchanged
 * and costs nothing extra.
 *
 * WHAT IS NOT REACHABLE IS CLAMPED, and it is worth knowing where the ceiling is:
 * in the shadow band red cannot exceed 0.46 + fill however bright the base, which
 * lands near sRGB 185. A shadow on this house is therefore a dusty rose-violet at
 * roughly a fifth saturation rather than a cream, and that is the honest limit of
 * the shared ramp rather than a colour choice.
 *
 * There is also `hardPatch`, the painterly breakup this asset uses everywhere. A
 * cel surface breaks up in STEPS: a low-frequency field thresholded with an edge
 * a couple of pixels wide, so a wall is two flat tones meeting along a crisp line
 * rather than one tone sliding into another.
 */

import * as THREE from 'three/webgpu';
import { GRADE, RAMP, SUN_DIRECTION } from '@app/tsl/palette';
import {
  color,
  dot,
  float,
  mix,
  mx_noise_float,
  normalWorld,
  positionWorld,
  smoothstep,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import type { BandSet } from './palette';

const SUN = vec3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z) as TSLNode;
const HALF_TERMINATOR = RAMP.terminator / 2;

/** What Khronos Neutral takes off each channel below its shoulder. */
const TONE_OFFSET = 0.04;
/** Rec.709 luminance, the same weights `luminance()` uses in the post chain. */
const LUMA: readonly [number, number, number] = [0.2126, 0.7152, 0.0722];

function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Solve for the pre-grade linear colour that the grade turns into `target`.
 *
 * The grade's tint is chosen by the luminance of its own INPUT, so this is a
 * fixed point rather than a division. Four rounds is well past convergence for
 * the small tints involved.
 */
function ungrade(target: readonly [number, number, number]): [number, number, number] {
  let pre: [number, number, number] = [target[0], target[1], target[2]];
  for (let pass = 0; pass < 4; pass++) {
    const level = LUMA[0] * pre[0] + LUMA[1] * pre[1] + LUMA[2] * pre[2];
    const t = smoothstep01(GRADE.shadowLuminance, GRADE.highlightLuminance, level);
    const s = GRADE.saturation;
    const lift = (1 - s) * level;
    pre = [0, 1, 2].map((i) => {
      const tint = GRADE.shadowTint[i]! + (GRADE.highlightTint[i]! - GRADE.shadowTint[i]!) * t;
      return (target[i]! - lift) / (s * tint);
    }) as [number, number, number];
  }
  return pre;
}

/**
 * The base colour to hand the ramp so that band `tint` (plus `fill`, for the
 * shadow band) renders as `target` on screen. Returns a linear-space colour, so
 * the TSL `color()` node passes it through untouched.
 */
function preRamp(
  target: string,
  tint: readonly [number, number, number],
  fill: readonly [number, number, number] = [0, 0, 0],
): THREE.Color {
  // THREE.Color converts the authored sRGB into the linear working space.
  const linear = new THREE.Color(target);
  const shown: [number, number, number] = [linear.r, linear.g, linear.b];
  const preTone = shown.map((c) => c + TONE_OFFSET) as [number, number, number];
  const preGrade = ungrade(preTone);
  const base = new THREE.Color();
  base.setRGB(
    Math.min(1, Math.max(0, (preGrade[0] - fill[0]) / tint[0])),
    Math.min(1, Math.max(0, (preGrade[1] - fill[1]) / tint[1])),
    Math.min(1, Math.max(0, (preGrade[2] - fill[2]) / tint[2])),
    THREE.LinearSRGBColorSpace,
  );
  return base;
}

/**
 * The three linear base colours a material reference must expose to reproduce a
 * {@link BandSet} through the shared toon ramp. Keeping this conversion beside
 * `bandedBase` makes the constant-node and material-uniform paths use the same
 * inverse rather than maintaining two colour pipelines.
 */
export interface BandedBaseColors {
  readonly shade: THREE.Color;
  readonly body: THREE.Color;
  readonly key: THREE.Color;
}

export function bandedBaseColors(set: BandSet): BandedBaseColors {
  return {
    shade: preRamp(set.shade, RAMP.shadow, RAMP.fill),
    body: preRamp(set.body, RAMP.mid),
    key: preRamp(set.key, RAMP.lit),
  };
}

/** Half-lambert, the same remap tsl/toon.ts does before it bands. */
function nDotL(): TSLNode {
  return dot(normalWorld, SUN).mul(0.5).add(0.5);
}

/**
 * The base colour node for a three-band surface, built from what the three bands
 * should LOOK like. Hand the result to `makeToonMaterial` and the ramp puts each
 * band back where it was asked for.
 */
export function bandedBase(set: BandSet): TSLNode {
  const resolved = bandedBaseColors(set);
  const shade = color(resolved.shade);
  const body = color(resolved.body);
  const key = color(resolved.key);

  const n = nDotL();
  const outOfShadow = smoothstep(
    float(RAMP.shadowEdge - HALF_TERMINATOR),
    float(RAMP.shadowEdge + HALF_TERMINATOR),
    n,
  );
  const intoKey = smoothstep(
    float(RAMP.litEdge - HALF_TERMINATOR),
    float(RAMP.litEdge + HALF_TERMINATOR),
    n,
  );
  return mix(mix(shade, body, outOfShadow), key, intoKey);
}

/**
 * A low-frequency world-space field thresholded to a hard edge: the painterly
 * patch. `scale` is per axis, so a wall can weather in vertical runs and a barn
 * in vertical boards from the same helper. `edge` is the width of the step in
 * noise units and wants to stay near 0.06 - wide enough not to crawl at eight
 * pixels to the metre, narrow enough to still be a line.
 */
export function hardPatch(
  scale: readonly [number, number, number],
  threshold: number,
  edge = 0.06,
): TSLNode {
  const field = mx_noise_float(positionWorld.mul(vec3(scale[0], scale[1], scale[2])));
  return smoothstep(float(threshold - edge), float(threshold + edge), field);
}
