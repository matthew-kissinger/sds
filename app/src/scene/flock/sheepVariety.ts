// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Pastoral sheep breed definitions and flock variety modes.
 * Provides authentic English, Scottish, and Welsh sheep breed classifications.
 */

import { mulberry32 } from '@sim/rng';
import { STYLE_SEED } from './flockTuning';

export type FlockVarietyId = 'heritage' | 'classic' | 'highland' | 'marked' | 'black';

export type SheepBreedId =
  | 'suffolk'
  | 'cheviot'
  | 'herdwick'
  | 'kerry_hill'
  | 'badger_face'
  | 'moorit'
  | 'balwen'
  | 'jacob'
  | 'black';

export interface SheepBreedInfo {
  readonly id: SheepBreedId;
  readonly name: string;
  readonly origin: string;
  readonly description: string;
  readonly fleeceDescription: string;
  readonly faceDescription: string;
  readonly swatchFleece: string;
  readonly swatchFace: string;
}

export const SHEEP_BREEDS: Readonly<Record<SheepBreedId, SheepBreedInfo>> = {
  suffolk: {
    id: 'suffolk',
    name: 'Suffolk Down',
    origin: 'East Anglia, England',
    description: 'The traditional countryside icon: dense warm cream fleece with jet charcoal head and shanks.',
    fleeceDescription: 'Dense warm cream',
    faceDescription: 'Charcoal black',
    swatchFleece: '#ebd9ba',
    swatchFace: '#3b3234',
  },
  cheviot: {
    id: 'cheviot',
    name: 'Cheviot White-faced',
    origin: 'Cheviot Hills, Scottish Borders',
    description: 'Hardy hill sheep with a bright white fleece and distinctive pale white-faced head without black markings.',
    fleeceDescription: 'Crisp pale cream',
    faceDescription: 'Clean white / pale cream',
    swatchFleece: '#f7f2ea',
    swatchFace: '#f0e7da',
  },
  herdwick: {
    id: 'herdwick',
    name: 'Herdwick',
    origin: 'Lake District, Cumbria',
    description: 'Legendary fell breed famous for its rugged steel blue-grey fleece and hoar-frosted white head and legs.',
    fleeceDescription: 'Steel blue-grey',
    faceDescription: 'Hoar-frosted white',
    swatchFleece: '#7b838a',
    swatchFace: '#f4f1ea',
  },
  kerry_hill: {
    id: 'kerry_hill',
    name: 'Kerry Hill',
    origin: 'Powys, Welsh Borders',
    description: 'Famous British border breed with dense white wool and striking panda-like black patches on the eyes, nose, and knees.',
    fleeceDescription: 'Dense pure white',
    faceDescription: 'White with black panda patches',
    swatchFleece: '#faf8f2',
    swatchFace: '#282222',
  },
  badger_face: {
    id: 'badger_face',
    name: 'Badger Face Welsh Mountain',
    origin: 'Cambrian Mountains, Wales',
    description: 'Ancient Celtic breed (Torddu) featuring warm oatmeal fleece, distinctive black badger eye stripes, and dark throat.',
    fleeceDescription: 'Oatmeal biscuit',
    faceDescription: 'Oatmeal with badger stripes',
    swatchFleece: '#e2d6c1',
    swatchFace: '#322828',
  },
  moorit: {
    id: 'moorit',
    name: 'Moorit Shetland',
    origin: 'Shetland Isles, Scotland',
    description: 'Heritage moorland breed naturally colored in rich cinnamon and chocolate-brown fleece and matching brown face.',
    fleeceDescription: 'Warm cinnamon chocolate',
    faceDescription: 'Dark chocolate brown',
    swatchFleece: '#916b49',
    swatchFace: '#4a3628',
  },
  balwen: {
    id: 'balwen',
    name: 'Balwen Welsh Mountain',
    origin: 'Tywi Valley, Wales',
    description: 'Distinctive Welsh hill sheep with deep peat-charcoal fleece, a crisp white facial blaze, and white socks.',
    fleeceDescription: 'Deep peat charcoal',
    faceDescription: 'Dark with white facial blaze',
    swatchFleece: '#332c2b',
    swatchFace: '#ede7dc',
  },
  jacob: {
    id: 'jacob',
    name: 'Jacob',
    origin: 'British Heritage Breed',
    description: 'Ancient British heritage breed featuring warm toasted wheat wool with deep charcoal-brown points.',
    fleeceDescription: 'Warm toasted wheat',
    faceDescription: 'Charcoal-brown',
    swatchFleece: '#d8c29d',
    swatchFace: '#382f30',
  },
  black: {
    id: 'black',
    name: 'Black Welsh Mountain',
    origin: 'Cambrian Mountains, Wales',
    description: 'Ancient British heritage breed featuring completely dark, lustrous espresso-charcoal fleece and deep dark points.',
    fleeceDescription: 'Espresso charcoal',
    faceDescription: 'Deep charcoal',
    swatchFleece: '#423c38',
    swatchFace: '#2a2424',
  },
};

export interface FlockVarietyOption {
  readonly id: FlockVarietyId;
  readonly name: string;
  readonly description: string;
}

export const FLOCK_VARIETY_OPTIONS: readonly FlockVarietyOption[] = [
  {
    id: 'heritage',
    name: 'Natural Heritage Mix',
    description: 'A realistic pastoral flock with Suffolk, Cheviot, Herdwick, Kerry Hill, Badger Face, Moorit, Balwen, Jacob, and Black Welsh.',
  },
  {
    id: 'classic',
    name: 'Classic Country',
    description: 'The traditional uniform look: all cream sheep with charcoal-black heads.',
  },
  {
    id: 'highland',
    name: 'Upland Fells',
    description: 'Hardy hill and moorland breeds: steel Herdwick, cinnamon Moorit, and Black Welsh.',
  },
  {
    id: 'marked',
    name: 'Marked & Badger Breeds',
    description: 'Striking patterns: Kerry Hill panda markings, Badger Face stripes, Balwen blazes, and Jacob piebalds.',
  },
  {
    id: 'black',
    name: 'Black Welsh Mountain',
    description: 'A striking flock of all-dark sheep with deep espresso wool.',
  },
];

export const DEFAULT_FLOCK_VARIETY: FlockVarietyId = 'heritage';

/**
 * Deterministically computes a sheep's breed ID from its index, variety mode, and seed.
 */
/**
 * Visual RNG stream for sheep attributes, matching presentationBuffers.ts.
 */
export function getSheepVisualSeed(sheepIndex: number): number {
  const rng = mulberry32((STYLE_SEED ^ Math.imul(sheepIndex + 1, 0x9e37_79b1)) >>> 0);
  rng(); // first sample is tint
  return rng() * 8; // second sample is seed passed to GPU style attribute
}

/**
 * Calculates the exact 0..1 breed distribution unit for a sheep index, matching GPU breedSpread.
 */
export function getSheepBreedUnit(sheepIndex: number): number {
  const seed = getSheepVisualSeed(sheepIndex);
  const v = seed * 5.71 + 5.71 * 0.3137;
  return v - Math.floor(v);
}

/**
 * Deterministically computes a sheep's breed ID from its index and variety mode.
 * Evaluates identically on CPU and GPU shader.
 */
export function getSheepBreed(
  index: number,
  mode: FlockVarietyId = 'heritage',
): SheepBreedId {
  if (mode === 'classic') return 'suffolk';
  if (mode === 'black') return 'black';

  const unit = getSheepBreedUnit(index);

  if (mode === 'highland') {
    if (unit < 0.45) return 'herdwick';
    if (unit < 0.80) return 'moorit';
    return 'black';
  }

  if (mode === 'marked') {
    if (unit < 0.35) return 'kerry_hill';
    if (unit < 0.65) return 'badger_face';
    if (unit < 0.85) return 'jacob';
    return 'balwen';
  }

  // Heritage mode (all 9 breeds authentically distributed):
  if (unit < 0.35) return 'suffolk';
  if (unit < 0.50) return 'cheviot';
  if (unit < 0.62) return 'herdwick';
  if (unit < 0.72) return 'kerry_hill';
  if (unit < 0.80) return 'badger_face';
  if (unit < 0.88) return 'moorit';
  if (unit < 0.93) return 'black';
  if (unit < 0.97) return 'balwen';
  return 'jacob';
}

import {
  abs,
  clamp,
  color,
  float,
  fract,
  mix,
  smoothstep,
  step,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import { PALETTE } from '@app/tsl/palette';

export const FLOCK_VARIETY_MODE_VALUES: Readonly<Record<FlockVarietyId, number>> = {
  heritage: 0,
  classic: 1,
  highland: 2,
  marked: 3,
  black: 4,
};

function breedSpread(seed: TSLNode, salt: number): TSLNode {
  return fract(seed.mul(float(salt)).add(float(salt * 0.3137)));
}

export function computeBreedWeights(seed: TSLNode, mode: TSLNode) {
  const unit = breedSpread(seed, 5.71);

  // Heritage:
  const cheviotHer = step(float(0.35), unit).sub(step(float(0.50), unit));
  const herdwickHer = step(float(0.50), unit).sub(step(float(0.62), unit));
  const kerryHer = step(float(0.62), unit).sub(step(float(0.72), unit));
  const badgerHer = step(float(0.72), unit).sub(step(float(0.80), unit));
  const mooritHer = step(float(0.80), unit).sub(step(float(0.88), unit));
  const blackHer = step(float(0.88), unit).sub(step(float(0.93), unit));
  const balwenHer = step(float(0.93), unit).sub(step(float(0.97), unit));
  const jacobHer = step(float(0.97), unit);

  // Highland:
  const herdwickHigh = float(1).sub(step(float(0.45), unit));
  const mooritHigh = step(float(0.45), unit).sub(step(float(0.80), unit));
  const blackHigh = step(float(0.80), unit);

  // Marked:
  const kerryMark = float(1).sub(step(float(0.35), unit));
  const badgerMark = step(float(0.35), unit).sub(step(float(0.65), unit));
  const jacobMark = step(float(0.65), unit).sub(step(float(0.85), unit));
  const balwenMark = step(float(0.85), unit);

  // Mode selectors:
  const isHeritage = step(mode, float(0.5));
  const isHighland = step(float(1.5), mode).mul(step(mode, float(2.5)));
  const isMarked = step(float(2.5), mode).mul(step(mode, float(3.5)));
  const isBlackMode = step(float(3.5), mode);

  const isCheviot = cheviotHer.mul(isHeritage);
  const isHerdwick = herdwickHer.mul(isHeritage).add(herdwickHigh.mul(isHighland));
  const isKerryHill = kerryHer.mul(isHeritage).add(kerryMark.mul(isMarked));
  const isBadgerFace = badgerHer.mul(isHeritage).add(badgerMark.mul(isMarked));
  const isMoorit = mooritHer.mul(isHeritage).add(mooritHigh.mul(isHighland));
  const isBalwen = balwenHer.mul(isHeritage).add(balwenMark.mul(isMarked));
  const isJacob = jacobHer.mul(isHeritage).add(jacobMark.mul(isMarked));
  const isBlackSheep = blackHer.mul(isHeritage).add(blackHigh.mul(isHighland)).add(isBlackMode);

  return {
    isCheviot,
    isHerdwick,
    isKerryHill,
    isBadgerFace,
    isMoorit,
    isBalwen,
    isJacob,
    isBlackSheep,
  };
}

export function getBreedFleeceGain(seed: TSLNode, mode: TSLNode, _localPos?: TSLNode): TSLNode {
  const {
    isCheviot,
    isHerdwick,
    isKerryHill,
    isBadgerFace,
    isMoorit,
    isBalwen,
    isJacob,
    isBlackSheep,
  } = computeBreedWeights(seed, mode);

  let gain = vec3(1, 1, 1);
  gain = mix(gain, vec3(1.04, 1.04, 1.06), isCheviot);
  gain = mix(gain, vec3(0.54, 0.58, 0.62), isHerdwick);
  gain = mix(gain, vec3(1.06, 1.06, 1.07), isKerryHill);
  gain = mix(gain, vec3(0.94, 0.90, 0.82), isBadgerFace);
  gain = mix(gain, vec3(0.58, 0.44, 0.32), isMoorit);
  gain = mix(gain, vec3(0.25, 0.23, 0.22), isBalwen);
  gain = mix(gain, vec3(0.24, 0.23, 0.22), isBlackSheep);
  gain = mix(gain, vec3(0.88, 0.82, 0.72), isJacob);
  return gain;
}

export function getBreedDarkParts(
  seed: TSLNode,
  mode: TSLNode,
  localPos: TSLNode,
  limb: TSLNode,
  jaw: TSLNode,
  hoof: TSLNode,
  jawDepth: number,
  baseSkull: TSLNode,
  baseShank: TSLNode,
  bandsKey: TSLNode,
): {
  readonly skull: TSLNode;
  readonly shank: TSLNode;
  readonly customPoints: {
    readonly points: TSLNode;
    readonly isCustom: TSLNode;
  };
} {
  const {
    isCheviot,
    isHerdwick,
    isKerryHill,
    isBadgerFace,
    isMoorit,
    isBalwen,
    isJacob,
    isBlackSheep,
  } = computeBreedWeights(seed, mode);

  // 1. Dark points base (Suffolk, Moorit, Black, Jacob)
  let skull = mix(baseSkull, color('#4a3628').mul(mix(float(1), float(jawDepth), jaw)), isMoorit);
  skull = mix(skull, color('#2b2526').mul(mix(float(1), float(jawDepth), jaw)), isBlackSheep);
  skull = mix(skull, color('#382f30').mul(mix(float(1), float(jawDepth), jaw)), isJacob);

  let shank = mix(baseShank, mix(color('#38281d'), color(PALETTE.sheepHoof), hoof), isMoorit);
  shank = mix(shank, mix(color('#201c1c'), color(PALETTE.sheepHoof), hoof), isBlackSheep);
  shank = mix(shank, mix(color('#2a2324'), color(PALETTE.sheepHoof), hoof), isJacob);

  // 2. White-faced points (Cheviot & Herdwick)
  const whiteNose = smoothstep(float(0.70), float(0.74), localPos.z).mul(float(1).sub(limb));
  const whiteFace = mix(
    color('#f6eee4').mul(mix(float(0.88), float(1.08), bandsKey)),
    color('#302829'),
    whiteNose,
  );
  const whiteLeg = mix(
    color('#ece3d4').mul(mix(float(0.86), float(1.06), bandsKey)),
    color(PALETTE.sheepHoof),
    hoof,
  );
  const whitePoints = mix(whiteFace, whiteLeg, limb);
  const isWhiteHead = isCheviot.add(isHerdwick);

  // 3. Kerry Hill ("Panda" eyes and muzzle)
  const eyeDistZ = abs(localPos.z.sub(float(0.625)));
  const eyeDistY = abs(localPos.y.sub(float(0.585)));
  const eyeDistX = abs(localPos.x);
  const pandaEye = smoothstep(float(0.065), float(0.035), eyeDistZ)
    .mul(smoothstep(float(0.055), float(0.025), eyeDistY))
    .mul(smoothstep(float(0.06), float(0.09), eyeDistX));
  const pandaMuzzle = smoothstep(float(0.69), float(0.73), localPos.z);
  const kerryDark = clamp(pandaEye.add(pandaMuzzle), float(0), float(1)).mul(float(1).sub(limb));
  const kerryFace = mix(color('#faf8f2').mul(mix(float(0.88), float(1.08), bandsKey)), color('#221c1d'), kerryDark);
  const kerryKnee = smoothstep(float(0.35), float(0.45), hoof).mul(float(1).sub(smoothstep(float(0.55), float(0.65), hoof)));
  const kerryLeg = mix(
    mix(color('#ede5d6'), color('#252020'), kerryKnee),
    color(PALETTE.sheepHoof),
    hoof,
  );
  const kerryPoints = mix(kerryFace, kerryLeg, limb);

  // 4. Badger Face Welsh Mountain (Torddu)
  const stripeY = abs(localPos.y.sub(float(0.585)));
  const stripeSide = smoothstep(float(0.06), float(0.09), abs(localPos.x));
  const eyeStripe = smoothstep(float(0.035), float(0.015), stripeY)
    .mul(stripeSide)
    .mul(smoothstep(float(0.53), float(0.57), localPos.z));
  const throatDark = smoothstep(float(0.52), float(0.48), localPos.y);
  const badgerNose = smoothstep(float(0.70), float(0.74), localPos.z);
  const badgerDark = clamp(eyeStripe.add(throatDark).add(badgerNose), float(0), float(1)).mul(float(1).sub(limb));
  const badgerFaceColor = mix(color('#ded0ba').mul(mix(float(0.88), float(1.08), bandsKey)), color('#2b2323'), badgerDark);
  const badgerPoints = mix(badgerFaceColor, shank, limb);

  // 5. Balwen Welsh Mountain (White blaze + white socks)
  const blazeX = abs(localPos.x);
  const blaze = smoothstep(float(0.038), float(0.018), blazeX)
    .mul(smoothstep(float(0.54), float(0.60), localPos.z))
    .mul(float(1).sub(smoothstep(float(0.73), float(0.755), localPos.z)))
    .mul(float(1).sub(limb));
  const balwenFace = mix(color('#2a2425'), color('#f4eee4').mul(mix(float(0.88), float(1.08), bandsKey)), blaze);
  const sock = smoothstep(float(0.30), float(0.42), hoof)
    .mul(float(1).sub(smoothstep(float(0.68), float(0.76), hoof)));
  const balwenLeg = mix(
    mix(color('#252020'), color('#ede5d6'), sock),
    color(PALETTE.sheepHoof),
    hoof,
  );
  const balwenPoints = mix(balwenFace, balwenLeg, limb);

  let customPointColor = whitePoints;
  customPointColor = mix(customPointColor, kerryPoints, isKerryHill);
  customPointColor = mix(customPointColor, badgerPoints, isBadgerFace);
  customPointColor = mix(customPointColor, balwenPoints, isBalwen);

  const isCustom = clamp(isWhiteHead.add(isKerryHill).add(isBadgerFace).add(isBalwen), float(0), float(1));

  return {
    skull,
    shank,
    customPoints: {
      points: customPointColor,
      isCustom,
    },
  };
}
