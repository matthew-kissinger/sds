// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The sheep's colour: what goes through the wool ramp (sheepRamp.ts), and the
 * things a ramp cannot say on its own. Split from the material factories so both
 * files stay readable (AGENTS.md rule 2).
 *
 * THE FLOCK IS THE LIGHTEST MASS IN THE FIELD, measured rather than felt: sunlit
 * wool sits a clear 60 points of value above sunlit pasture. It is no longer the
 * lightest mass EVENLY, though. The three ramp values span key, cream and sage,
 * the per-instance tint spans another 25 points across the flock on top of that,
 * and roughly a fifth of the animals carry a visibly browner fleece. A flock of
 * one cream is one animal stamped out; a flock of creams is a flock.
 *
 * Three light additions ride on top, all consequences of the same authored sun
 * rather than second light sources:
 *
 *   rim     warm sun-side edge, ADDITIVE and kept OFF the key band. A rim cannot
 *           brighten what is already the brightest thing in frame - spent there
 *           it lands on the tone map's shoulder and disappears. Spent on the
 *           warm, mid and shade bands it is a warm edge on a violet flank.
 *   sky     a small warm lift from straight up; small, because the ramp itself
 *           now carries most of the sky term.
 *   bounce  a warm-horizon lift inside the shade band, so the darkest wool gains
 *           chroma rather than losing value.
 *
 * THE PAINTED BREAKUP IS TWO THINGS: a coarse two-octave mottle so the fleece is
 * not the flattest object in a frame full of hand-textured grass, and a broad
 * soiling patch pulling the lower wool toward dun in irregular blotches. Both are
 * seeded off the instance, so no two animals carry the same dirt.
 *
 * THE DARK PARTS ARE ONE FAMILY. Run at a warm mid brown the legs sat in the same
 * value family as the dirt paths and the fence rails - four fence posts under a
 * cloud. Face, legs and hooves are now three values of one cool near-black, hue
 * shifted violet against the warm ground, so the animal reads as a cream mass on
 * dark points and nothing on it can be mistaken for timber.
 */

import type * as THREE from 'three/webgpu';
import { PALETTE } from '@app/tsl/palette';
import {
  abs,
  clamp,
  color,
  dot,
  float,
  fract,
  instancedBufferAttribute,
  mix,
  normalView,
  normalWorld,
  positionLocal,
  positionViewDirection,
  smoothstep,
  sin,
  step,
  uv,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import { SHEEP_FORM } from './sheepGeometry';
import { woolBands } from './sheepRamp';

// --- the dark parts ---------------------------------------------------------

/** How far the jaw line darkens the underside of the skull, and over what
 *  vertical span. A third of a stop: enough that the muzzle reads as stepped in
 *  under the cheek, not enough to take the face back to a hole. */
const JAW_DEPTH = 0.76;
const JAW_SPAN = 0.07;

/**
 * Additive sky fill on the dark parts in shade, linear. Small, and the reason a
 * charcoal face in shadow reads as cool blue-grey rather than as a hole.
 */
const DARK_FILL = [0.016, 0.016, 0.026] as const;
/** One restrained warm plane in the shared key keeps the face and shanks from
 *  becoming paper cutouts. Hooves stay at the planted darkest value. */
const DARK_KEY_PLANE = [0.065, 0.038, 0.024] as const;

// --- the fleece -------------------------------------------------------------

/**
 * Per-instance fleece gain. One end golden, the other pale and cooler, both
 * still cream, and the value spread on top of them comes from Flock.tsx.
 */
const TINT_GOLD = [1.03, 0.99, 0.9] as const;
const TINT_PALE = [0.94, 0.965, 1.02] as const;

/**
 * The brown minority. Roughly a fifth of any real flock is a browner animal, and
 * without them the mass has one colour however wide the cream jitter is: ten
 * sampled sheep spanned nine sRGB points before. These land near sRGB(224,212,179)
 * at the key band - a different sheep from two metres of grass away, still inside
 * the palette.
 */
const DUN_SHARE = 0.84;
const DUN_TINT = [0.9, 0.83, 0.72] as const;

/** Value drop under the fleece, where the wool shades itself. Gentle, because
 *  the ramp's shade band now does most of that work. */
const WOOL_ROOT = 0.9;

/**
 * The painted breakup: a two-octave mottle in cycles per metre, and its depth.
 *
 * SIZED TO THE ANIMAL, which was wrong in both directions before. At 1.05 cycles
 * per metre the broad octave was under one full swing across a 1.2 m body, so
 * every sheep got a near-uniform tint offset and the fleece measured as a flat
 * fill at 3x; at 11 cycles it was smaller than a Classic pixel and resolved to
 * speckle. At 2.2 and 4.2 the broad octave is a patch about the size of a
 * shoulder and the mid octave breaks its edge. The depth opens further in the key
 * band, where a near-white fleece has the most room to show it.
 */
const MOTTLE_DEPTH = 0.21;
const MOTTLE_KEY_GAIN = 0.36;
/** How far the mottle is biased toward darkening rather than brightening. A
 *  symmetric multiply does almost nothing on wool this pale: the up half of the
 *  swing lands on the tone map's shoulder and is compressed away. Biasing down
 *  spends all of it where the picture can show it, and is also what dirt does. */
const MOTTLE_BIAS = 0.16;
const MOTTLE_BROAD = 0.68;
const MOTTLE_MID = 1.35;
/** How far the mottle also swings hue, toward warm where it brightens and cool
 *  where it darkens. Small, and it is the difference between a value texture and
 *  something that reads as laid-on paint. */
const MOTTLE_HUE = [0.075, 0.018, -0.055] as const;

/**
 * The soiling: broad irregular blotches of dun on the lower fleece, strongest at
 * the belly and gone by the crest. The one thing on the animal allowed to leave
 * the cream family, and only in patches.
 */
const SOIL_TINT = [0.95, 0.9, 0.82] as const;
const SOIL_DEPTH = 0.24;

/** The rim: strength at the silhouette, where the fresnel bites, how much
 *  survives facing away from the sun, and the band above which it is switched
 *  off. That last pair is what makes it visible - additive light on a fleece
 *  already at the tone map's shoulder is light thrown away. */
const RIM_STRENGTH = 0.95;
const RIM_START = 0.4;
const RIM_AWAY = 0.45;
const RIM_KEY_OFF = [0.64, 0.76] as const;
/** How much of the rim the dark parts take. Two thirds: a lit ear rim is what
 *  separates a head from the treeline behind it, a glowing hoof is a bug. */
const RIM_DARK = 0.66;

/** Warm light from straight up, on the fleece only. Small now that the ramp
 *  itself is weighted by sky visibility; what is left is the gloss on the very
 *  top of the crest. */
const TOP_LIGHT = 0.03;

/** The warm lift inside the shade band. Horizon-coloured, because that is the
 *  brightest thing a shaded flank can see. */
const BOUNCE = 0.06;

/** Deterministic spread of one seed into another decorrelated 0..1. Seeded
 *  hashes of an index only; there is no Math.random in scene code. */
export function spread(seed: TSLNode, salt: number): TSLNode {
  return fract(seed.mul(float(salt)).add(float(salt * 0.3137)));
}

export interface SheepNodes {
  readonly masks: TSLNode;
  readonly legs: TSLNode;
  readonly seed: TSLNode;
  readonly tint: TSLNode;
  readonly gait: TSLNode;
  readonly agitation: TSLNode;
  /** CPU presentation packs scaleY/scaleX and scaleY/scaleZ beside tint and
   * seed. GPU storage placement already normalises its own outline scalar. */
  readonly outlineScale?: TSLNode;
  /** Short presentation envelope from acceleration, turns and gate crossing. */
  readonly response: TSLNode;
  /** Outline hull width for this instance, in local metres. Written by the frame
   *  loop from the camera distance, so the line is constant in SCREEN space. */
  readonly outline: TSLNode;
  /** 1 in open air, 0 buried in a neighbouring mass. Gates the hull so no ink is
   *  drawn inside the animal (sheepExposure.ts). */
  readonly exposure: TSLNode;
}

export function readInstance(
  style: THREE.InstancedBufferAttribute,
  motion: THREE.InstancedBufferAttribute,
): SheepNodes {
  const styleNode = instancedBufferAttribute(style, 'vec4');
  const motionNode = instancedBufferAttribute(motion, 'vec4');
  return {
    // uv carries (wool, graze); uv1 carries (legSign, legWeight); uv2 carries
    // (exposure, spare).
    masks: uv(),
    legs: uv(1),
    exposure: uv(2).x,
    tint: styleNode.x,
    seed: styleNode.y,
    outlineScale: styleNode.zw,
    gait: motionNode.x,
    agitation: motionNode.y,
    outline: motionNode.z,
    response: motionNode.w,
  };
}

/** This instance's fleece gain: hue walk, value jitter, and the brown minority. */
function fleeceGain(nodes: SheepNodes): TSLNode {
  const family = mix(vec3(...TINT_GOLD), vec3(...TINT_PALE), spread(nodes.seed, 7.13));
  const dun = step(float(DUN_SHARE), spread(nodes.seed, 3.41));
  return family.mul(nodes.tint).mul(mix(vec3(1, 1, 1), vec3(...DUN_TINT), dun));
}

/** The whole animal's base colour, banded. */
export function sheepBaseColor(nodes: SheepNodes, light: TSLNode): TSLNode {
  const { masks, legs, seed } = nodes;

  const gain = fleeceGain(nodes);
  const bands = woolBands(light, gain);

  // Compact deterministic brush fields. MaterialX gradient noise expands into
  // a large helper graph on both backends; these interfering strokes keep the
  // same animal-scale breakup and per-instance phase without that cold-start
  // compilation cost. Each field stays in -1..1 by construction.
  const broad = sin(
    dot(
      positionLocal,
      vec3(float(MOTTLE_BROAD), float(MOTTLE_BROAD * 0.65), float(-MOTTLE_BROAD * 0.74)),
    ).add(seed.mul(float(13.7))),
  )
    .mul(float(0.66))
    .add(
      sin(
        dot(
          positionLocal,
          vec3(
            float(-MOTTLE_BROAD * 0.58),
            float(MOTTLE_BROAD * 1.3),
            float(MOTTLE_BROAD * 0.48),
          ),
        ).add(seed.mul(float(7.31)).add(float(2.17))),
      ).mul(float(0.34)),
    );
  const midOctave = sin(
    dot(
      positionLocal,
      vec3(float(MOTTLE_MID), float(-MOTTLE_MID * 0.55), float(MOTTLE_MID * 0.74)),
    ).add(seed.mul(float(19.4)).add(float(11.3))),
  )
    .mul(float(0.7))
    .add(
      sin(
        dot(
          positionLocal,
          vec3(
            float(MOTTLE_MID * 0.45),
            float(MOTTLE_MID * 0.85),
            float(-MOTTLE_MID * 1.17),
          ),
        ).add(seed.mul(float(11.9)).add(float(4.7))),
      ).mul(float(0.3)),
    );
  const mottle = broad.mul(float(0.88)).add(midOctave.mul(float(0.12))).sub(float(MOTTLE_BIAS));
  const depth = float(MOTTLE_DEPTH).mul(float(1).add(bands.key.mul(float(MOTTLE_KEY_GAIN))));
  const paint = vec3(1, 1, 1).add(vec3(...MOTTLE_HUE).add(vec3(1, 1, 1)).mul(mottle).mul(depth));

  const crest = smoothstep(float(SHEEP_FORM.bellyY), float(SHEEP_FORM.crestY), positionLocal.y);
  // The soiling reads the same broad octave from a different corner of the
  // field, so the dirt and the mottle are decorrelated for free.
  const soil = smoothstep(float(0.1), float(0.7), broad.add(midOctave.mul(float(0.3))))
    .mul(float(1).sub(crest))
    .mul(float(SOIL_DEPTH));
  const fleece = bands.fleece
    .mul(paint)
    .mul(mix(float(WOOL_ROOT), float(1), crest))
    .mul(mix(vec3(1, 1, 1), vec3(...SOIL_TINT), soil));

  // abs(legSign) is 1 on a limb and 0 on a skull: the only channel that tells
  // them apart, and what lets the two carry different values of the near-black.
  const limb = abs(legs.x);
  const jaw = smoothstep(float(SHEEP_FORM.jawY), float(SHEEP_FORM.jawY - JAW_SPAN), positionLocal.y)
    .mul(float(1).sub(limb));
  const skull = color(PALETTE.sheepFace).mul(mix(float(1), float(JAW_DEPTH), jaw));
  const hoof = smoothstep(float(0.7), float(0.86), legs.y);
  const shank = mix(
    color(PALETTE.sheepLeg),
    color(PALETTE.sheepHoof),
    hoof,
  );
  const dark = mix(skull, shank, limb)
    .mul(bands.darkGain)
    .add(vec3(...DARK_FILL).mul(bands.shade))
    .add(
      vec3(...DARK_KEY_PLANE)
        .mul(bands.key.mul(float(0.75)).add(float(1).sub(bands.shade).mul(float(0.25))))
        .mul(float(1).sub(hoof)),
    );

  return mix(dark, fleece, masks.x);
}

/** Warm rim along the silhouette, the sky from above, and the lift that keeps
 *  the shade band from washing out. */
export function sheepLightAdditions(
  nodes: SheepNodes,
  light: TSLNode,
  nDotL: TSLNode,
): TSLNode {
  const { masks } = nodes;

  const facing = clamp(dot(normalView, positionViewDirection), float(0), float(1));
  const edge = smoothstep(float(RIM_START), float(1), float(1).sub(facing));
  const sunSide = smoothstep(float(0.25), float(0.75), nDotL);
  // Off wherever the fleece is already in full key: additive light there is
  // spent on the tone map's shoulder and never arrives.
  const room = float(1).sub(smoothstep(float(RIM_KEY_OFF[0]), float(RIM_KEY_OFF[1]), light));
  const rim = color(PALETTE.sunGlow)
    .mul(edge)
    .mul(room)
    .mul(mix(float(RIM_AWAY), float(1), sunSide))
    .mul(mix(float(RIM_DARK), float(1), masks.x))
    .mul(float(RIM_STRENGTH));

  const upward = smoothstep(float(0.1), float(0.9), normalWorld.y);
  const sky = color(PALETTE.skyHorizon).mul(upward).mul(masks.x).mul(float(TOP_LIGHT));

  const shade = float(1).sub(smoothstep(float(0.22), float(0.36), light));
  const bounce = color(PALETTE.skyHorizon).mul(shade).mul(masks.x).mul(float(BOUNCE));

  return rim.add(sky).add(bounce);
}
