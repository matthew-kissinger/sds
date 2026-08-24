// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * How light lands on sawn timber, and the arithmetic that lets this asset author
 * the colour it wants ON SCREEN rather than the colour that happens to survive
 * the post chain.
 *
 * TWO IDEAS LIVE HERE.
 *
 * 1. THE LADDER IS DECIDED BY WHICH WAY A FACE POINTS, not by the raw half
 *    lambert. The sun sits 8 degrees above the horizon (tsl/palette.ts), so a
 *    plain dot product puts a rail's TOP face at 0.57 - the middle of the
 *    terminator - and a vertical face turned into the sun at 0.99. Shaded that
 *    way, the face both gameplay cameras see most of is the dimmest part of the
 *    piece, and 800 m of fence collapses into a dark scribble drawn across a
 *    bright field. So the level is built from three named terms instead: how far
 *    up a face looks, how far down it looks, and how much key it takes. Top faces
 *    and top arrises land in the key band, vertical faces one band down, the
 *    undersides in a cool hue-shifted shadow. The sun still decides which
 *    vertical face is the brighter of the two, which is where light direction
 *    lives on this asset.
 *
 * 2. THE BANDS ARE AUTHORED AS TARGETS. `screenTone` solves backwards through
 *    the whole output chain - Khronos Neutral tone mapping, then the one grade in
 *    scene/PostProcessing.tsx - so a band written as `#c4a677` arrives on the
 *    capture as `#c4a677`. Three passes of this asset were lost guessing at what
 *    a base colour would become after a ramp gain, a warm catch, an additive
 *    bounce and a tone map, and every guess landed somewhere else.
 *
 * The farmhouse solves the same problem in farmhouse/bands.ts. The two want
 * hoisting into tsl/ in the cohesion pass; they are duplicated rather than shared
 * because the palette module is off limits while other builders are in it.
 */

import * as THREE from 'three/webgpu';
import { GRADE, RAMP, SUN_DIRECTION } from '@app/tsl/palette';
import {
  abs,
  color,
  dot,
  float,
  mix,
  normalWorld,
  smoothstep,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';

/** Three values of one material: what it looks like in shadow, on a side face,
 *  and where the low sun actually lands. Authored as on-screen sRGB. */
export interface BandSet {
  readonly shade: string;
  readonly body: string;
  readonly key: string;
}

/** Rec.709 luminance, the weights `luminance()` uses in the post chain. */
const LUMA: readonly [number, number, number] = [0.2126, 0.7152, 0.0722];

function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * What Khronos Neutral subtracts from every channel below its shoulder. The
 * offset is 0.04 only once the darkest channel clears 0.08; below that it tapers
 * to zero, which is exactly the range a shadow band lives in, so the taper is
 * modelled rather than approximated. Getting this wrong is how the pen floor
 * ended up with its blue channel crushed to zero and read as a burn scar.
 */
function toneOffset(channels: readonly [number, number, number]): number {
  const low = Math.min(channels[0], Math.min(channels[1], channels[2]));
  return low < 0.08 ? low - 6.25 * low * low : 0.04;
}

/**
 * Undo the grade. Its tint is chosen by the luminance of its own INPUT, so this
 * is a fixed point rather than a division; four rounds is well past convergence
 * for tints this small.
 */
function ungrade(target: readonly [number, number, number]): [number, number, number] {
  let pre: [number, number, number] = [target[0], target[1], target[2]];
  for (let round = 0; round < 4; round++) {
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
 * The linear colour a fragment must output for the frame to contain `target`.
 * Bloom is ignored on purpose: its threshold is 0.92 linear luminance and no
 * timber tone here comes within half of that.
 */
export function screenTone(target: string): THREE.Color {
  const linear = new THREE.Color(target);
  const shown: [number, number, number] = [linear.r, linear.g, linear.b];
  const preTone = shown.map((c) => c + toneOffset(shown)) as [number, number, number];
  const preGrade = ungrade(preTone);
  const out = new THREE.Color();
  out.setRGB(
    Math.min(1, Math.max(0, preGrade[0])),
    Math.min(1, Math.max(0, preGrade[1])),
    Math.min(1, Math.max(0, preGrade[2])),
    THREE.LinearSRGBColorSpace,
  );
  return out;
}

/**
 * The same solve, for a surface that will additionally be run through the shared
 * toon ramp: divide out the band tint the ramp is going to multiply by, and
 * subtract the sky fill it is going to add.
 */
export function preRamp(
  target: string,
  tint: readonly [number, number, number],
  fill: readonly [number, number, number] = [0, 0, 0],
): THREE.Color {
  const solved = screenTone(target);
  const out = new THREE.Color();
  out.setRGB(
    Math.min(1, Math.max(0, (solved.r - fill[0]) / tint[0])),
    Math.min(1, Math.max(0, (solved.g - fill[1]) / tint[1])),
    Math.min(1, Math.max(0, (solved.b - fill[2]) / tint[2])),
    THREE.LinearSRGBColorSpace,
  );
  return out;
}

/**
 * The ramp gain a FLAT, upward-facing surface takes. Ground is the one normal
 * this scene has a closed form for, so a ground material can author screen
 * targets too rather than guessing at where the terminator left it. Derived from
 * RAMP so it cannot drift out of step with tsl/toon.ts.
 */
export const FLAT_RAMP_TINT: readonly [number, number, number] = (() => {
  const half = RAMP.terminator / 2;
  const n = SUN_DIRECTION.y * 0.5 + 0.5;
  const intoKey = smoothstep01(RAMP.litEdge - half, RAMP.litEdge + half, n);
  const outOfShadow = smoothstep01(RAMP.shadowEdge - half, RAMP.shadowEdge + half, n);
  return [0, 1, 2].map((i) => {
    const low = RAMP.shadow[i]! + (RAMP.mid[i]! - RAMP.shadow[i]!) * outOfShadow;
    return low + (RAMP.lit[i]! - low) * intoKey;
  }) as [number, number, number];
})();

// --- the orientation ladder --------------------------------------------------

const SUN = vec3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z) as TSLNode;

/** A vertical face sits here; everything else is a step off it. */
const SIDE_LEVEL = 0.5;
/** What a face that looks straight up gains, and what one that looks down loses. */
const UP_GAIN = 0.43;
const DOWN_LOSS = 0.35;
/** How much the sun decides between two vertical faces. One band's worth of
 *  difference would invert the ladder; a tenth is light direction without it. */
const KEY_GAIN = 0.1;
/** Where the two band edges cut, and how hard. Narrow: every edge on this asset
 *  is a real edge in the geometry, so the shading edge should be one too. */
const SHADE_CUT = 0.3;
const KEY_CUT = 0.73;
const CUT_EDGE = 0.05;

/**
 * How lit this fragment is, 0 (underside) to 1 (sun-struck top face).
 *
 * `lift` is the piece's own local contribution - a post's chamfered head, a
 * rail's top arris - added by the caller, because it is measured in the piece's
 * local height and only the caller knows how long the piece is.
 */
export function timberLevel(lift: TSLNode, drop: TSLNode): TSLNode {
  const nDotL = dot(normalWorld, SUN).mul(0.5).add(0.5);
  const upness = smoothstep(float(0.35), float(0.85), normalWorld.y);
  const downness = smoothstep(float(0.25), float(0.85), normalWorld.y.negate());
  const keyness = smoothstep(float(0.45), float(0.8), nDotL);
  return float(SIDE_LEVEL)
    .add(upness.mul(float(UP_GAIN)))
    .add(keyness.mul(float(KEY_GAIN)))
    .sub(downness.mul(float(DOWN_LOSS)))
    .add(lift)
    .sub(drop);
}

/** 1 where a face is vertical, 0 on a top or bottom face. What the local arris
 *  terms are scaled by, so a top face is never given a second top edge. */
export function sideness(): TSLNode {
  return float(1).sub(smoothstep(float(0.2), float(0.7), abs(normalWorld.y)));
}

/** The three authored values, cut into bands by `level`. */
export function bandedTimber(set: BandSet, level: TSLNode): TSLNode {
  const shade = color(screenTone(set.shade));
  const body = color(screenTone(set.body));
  const key = color(screenTone(set.key));
  const outOfShade = smoothstep(float(SHADE_CUT - CUT_EDGE), float(SHADE_CUT + CUT_EDGE), level);
  const intoKey = smoothstep(float(KEY_CUT - CUT_EDGE), float(KEY_CUT + CUT_EDGE), level);
  return mix(mix(shade, body, outOfShade), key, intoKey);
}
