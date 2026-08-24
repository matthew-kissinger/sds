// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The dressing's shader: three AUTHORED band tones per surface, delivered
 * through the scene's one toon ramp (tsl/toon.ts).
 *
 * WHY THIS EXISTS. RAMP.shadow is a cool gain - blue survives at 0.80 while red
 * drops to 0.46 - because it was measured for pasture green, where holding blue
 * is what keeps a shaded meadow green instead of grey. Hand the same gain a warm
 * grey stone and the arithmetic does the only thing it can: red loses more than
 * half, blue loses a fifth, and the shadow band arrives on screen as lavender.
 * Re-authoring the base colour cannot fix that, because one base colour has to
 * satisfy three gains at once.
 *
 * So the caller authors what it wants to SEE in each band, and this module
 * divides the ramp's own gain back out:
 *
 *   base_band = (target_band - fill_band) / gain_band
 *
 * Feed those three bases to the ramp under the ramp's own band weights and each
 * band lands on its target exactly. The shared ramp still owns the light
 * direction, the band edges and the terminator softness - nothing here forks the
 * lighting model - while the art direction of a stone gets to say that its
 * shadow is warm taupe and its bands separate by VALUE.
 *
 * The intermediate bases are meaningless colours on their own (the shadow base
 * of a grey stone is a saturated orange). They are never seen; only their
 * product with the gain is. That is why the authored constants in the callers
 * are the TARGETS, in readable hex, and the division happens here.
 *
 * INLAYS ARE A LIST, NOT ONE SLOT. A stone carries lichen, a lichen crust
 * carries a second value inside it, and a log carries both a cool underside and
 * exposed sapwood. Each of those is a full set of three authored bands laid over
 * the surface through its own mask, applied in order, so a material can be built
 * out of four materials without any of them losing its own shadow hue.
 *
 * TSL node material, no ShaderMaterial and no onBeforeCompile: one source
 * compiles to WGSL and to GLSL, so both backends of WebGPURenderer show the same
 * picture (spec/01 hard rule 3).
 */

import * as THREE from 'three/webgpu';
import { RAMP, SUN_DIRECTION } from '@app/tsl/palette';
import { makeToonMaterial } from '@app/tsl/toon';
import {
  clamp,
  color,
  dot,
  float,
  floor,
  mix,
  normalWorld,
  positionWorld,
  sin,
  smoothstep,
  uniform,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';

/** What a surface should look like in each of the ramp's three bands. */
export interface BandTargets {
  /** Facing away from the key. */
  readonly shadow: string;
  /** Across the key. The tone a flat-ish upward face lands on. */
  readonly mid: string;
  /** Full key. */
  readonly lit: string;
}

export type BandSet = readonly [TSLNode, TSLNode, TSLNode];

const sunNode = uniform(SUN_DIRECTION) as TSLNode;
const HALF_TERMINATOR = RAMP.terminator / 2;
const NO_FILL = [0, 0, 0] as const;

/** Scratch for the sRGB-to-linear conversion. Reused; never held. */
const WORK = new THREE.Color();

/**
 * How far above the sky fill a channel has to sit before the band's own base
 * carries it. At 1.0 the base would be zero and the pixel would be pure fill.
 */
const FLOOR_MARGIN = 1.35;

/**
 * One band's base: the authored target with the ramp's own gain divided out.
 *
 * THE SHADOW BAND HAS A FLOOR AND THIS IS WHERE THE LAVENDER CAME FROM. The ramp
 * ADDS `RAMP.fill` after the gain, so no shadow can land below it, and the fill
 * is a sky bounce: its blue is more than twice its red. An authored umber darker
 * than that floor in blue cannot be reached at all, and clamping the offending
 * channel at zero lands the pixel on a blue-dominant dark plum.
 *
 * So a target below the floor is LIFTED rather than clamped: the whole colour is
 * scaled until its worst channel clears the fill, which moves the band's value
 * and leaves its hue exactly where it was authored. Authors who want the value
 * they wrote should keep every shadow target at or above about #414141 in blue.
 */
function bandBase(
  target: string,
  gain: readonly [number, number, number],
  fill: readonly number[] = NO_FILL,
): TSLNode {
  WORK.set(target);
  const channels = [WORK.r, WORK.g, WORK.b];
  let lift = 1;
  for (let i = 0; i < 3; i++) {
    const floorValue = fill[i]! * FLOOR_MARGIN;
    const value = channels[i]!;
    if (value > 1e-6 && floorValue > value * lift) lift = floorValue / value;
  }
  const base = channels.map((value, i) => Math.max((value * lift - fill[i]!) / gain[i]!, 0));
  return vec3(base[0], base[1], base[2]);
}

/** The three bases for a set of targets, in ramp order. */
export function bandBases(targets: BandTargets): BandSet {
  return [
    bandBase(targets.shadow, RAMP.shadow, RAMP.fill),
    bandBase(targets.mid, RAMP.mid),
    bandBase(targets.lit, RAMP.lit),
  ];
}

/**
 * The ramp's own band weights, recomputed here from the same uniform, the same
 * half-lambert and the same edges the ramp uses. Recomputed rather than
 * imported because toon.ts publishes a material, not its intermediates; the
 * constants both read live in palette.ts, so the two cannot drift.
 */
export function bandWeights(): { readonly outOfShadow: TSLNode; readonly intoKey: TSLNode } {
  const nDotL = dot(normalWorld, sunNode).mul(0.5).add(0.5);
  return {
    outOfShadow: smoothstep(
      float(RAMP.shadowEdge - HALF_TERMINATOR),
      float(RAMP.shadowEdge + HALF_TERMINATOR),
      nDotL,
    ),
    intoKey: smoothstep(
      float(RAMP.litEdge - HALF_TERMINATOR),
      float(RAMP.litEdge + HALF_TERMINATOR),
      nDotL,
    ),
  };
}

/** Collapse three bases into the one base node the ramp is handed. */
export function blendBands(
  bands: BandSet,
  weights: { readonly outOfShadow: TSLNode; readonly intoKey: TSLNode },
): TSLNode {
  return mix(mix(bands[0], bands[1], weights.outOfShadow), bands[2], weights.intoKey);
}

/** Blend two sets of band bases by one mask, band for band. */
export function mixBandBases(a: BandSet, b: BandSet, mask: TSLNode): BandSet {
  return [mix(a[0], b[0], mask), mix(a[1], b[1], mask), mix(a[2], b[2], mask)];
}

/** A material laid over the surface through its own mask: lichen, sapwood, the
 *  cool underside of a trunk. Applied in list order. */
export interface Inlay {
  readonly targets: BandTargets;
  readonly mask: TSLNode;
}

export interface BandedInputs {
  readonly surface: BandTargets;
  readonly inlays?: readonly Inlay[];
  /** Cycles per metre of the fine value grain. */
  readonly grainScale: number;
  /** Half-range of the fine grain, as a fraction of value. Small: the bands are
   *  meant to read as flat tones, and grain that competes with them turns a
   *  faceted solid back into a mottled blob. */
  readonly grainAmount: number;
  /**
   * Painted patch breakup, QUANTISED. The critique that earned this said a
   * single unmodulated plane per facet is what makes a stone read as plastic,
   * and that the answer is two or three closely spaced values inside each facet
   * rather than an airbrushed wash. So this is a coarse world noise stepped into
   * a small number of levels: a facet picks up two or three flat patches of
   * slightly different value, which is what a painter's loaded brush leaves.
   */
  readonly mottle?: { readonly scale: number; readonly amount: number; readonly steps: number };
  /** An extra value multiplier the caller composes, e.g. the growth rings on a
   *  cut end. Multiplied with the grain, so it shifts value and never hue. */
  readonly tone?: TSLNode;
  /**
   * The scene's contour, baked into the same buffer as the solid
   * (scatter/outline.ts). Where `mask` is 1 the fragment is flat outline colour
   * and takes no light at all: an outline that banded with the ramp would be a
   * second lit surface rather than a line.
   */
  readonly outline?: { readonly color: string; readonly mask: TSLNode };
}

/**
 * Two crossed, deterministic brush waves in roughly [-1, 1]. Scatter surfaces
 * need stable painted variation, not the full MaterialX gradient-noise helper
 * library in every first-frame pipeline.
 */
export function paintedField(point: TSLNode, phase = 0): TSLNode {
  const broad = sin(dot(point, vec3(0.73, 1.17, 1.43)).add(float(phase)));
  const cross = sin(dot(point, vec3(1.61, -0.91, 0.57)).add(float(phase * 1.73 + 0.41)));
  return broad.mul(float(0.68)).add(cross.mul(float(0.32)));
}

/** A world-space noise stepped into `steps` flat levels, 0..1. */
export function quantisedNoise(scale: number, steps: number): TSLNode {
  const raw = paintedField(positionWorld.mul(float(scale)), scale * 0.37)
    .mul(float(0.5))
    .add(float(0.5));
  const stepped = floor(clamp(raw, float(0), float(0.999)).mul(float(steps)));
  return stepped.div(float(Math.max(steps - 1, 1)));
}

export function makeBandedMaterial(inputs: BandedInputs): THREE.MeshBasicNodeMaterial {
  let bands = bandBases(inputs.surface);
  for (const inlay of inputs.inlays ?? []) {
    bands = mixBandBases(bands, bandBases(inlay.targets), inlay.mask);
  }

  // Value only: one multiplier across all three channels, so a stone is never
  // one dead flat tone and two stones a metre apart draw different values out of
  // the same world noise, without either of them shifting hue.
  const grain = paintedField(positionWorld.mul(float(inputs.grainScale)), inputs.grainScale * 0.19);
  let tone = mix(
    float(1 - inputs.grainAmount),
    float(1 + inputs.grainAmount),
    smoothstep(float(-0.75), float(0.75), grain),
  );
  if (inputs.mottle !== undefined) {
    const patch = quantisedNoise(inputs.mottle.scale, inputs.mottle.steps);
    tone = tone.mul(
      mix(float(1 - inputs.mottle.amount), float(1 + inputs.mottle.amount), patch),
    );
  }
  if (inputs.tone !== undefined) tone = tone.mul(inputs.tone);

  const material = makeToonMaterial(blendBands(bands, bandWeights()).mul(tone));
  if (inputs.outline !== undefined) {
    // After the ramp, not before it: the contour is a line, not a lit surface.
    material.colorNode = mix(
      material.colorNode as TSLNode,
      color(inputs.outline.color),
      inputs.outline.mask,
    );
  }
  return material;
}
