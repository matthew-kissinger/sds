// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Working sheepdog coat presets and color ladders.
 * Authored using the same Khronos Neutral inverse palette standards as coatTones.ts.
 */

export type DogCoatId = 'classic' | 'red' | 'merle' | 'chocolate' | 'golden';

export interface DogCoatPreset {
  readonly id: DogCoatId;
  readonly name: string;
  readonly description: string;
  readonly swatch: string;
  readonly shadow: string;
  readonly mid: string;
  readonly lit: string;
  readonly outline: string;
}

export const DOG_COAT_PRESETS: Readonly<Record<DogCoatId, DogCoatPreset>> = {
  classic: {
    id: 'classic',
    name: 'Classic Black & White',
    description: 'Traditional working Border Collie with charcoal-black coat and white trim.',
    swatch: '#36302a',
    shadow: '#2e2720',
    mid: '#5c5246',
    lit: '#766654',
    outline: '#20150c',
  },
  red: {
    id: 'red',
    name: 'Red & White (Sable)',
    description: 'Warm russet-amber working collie with bright chestnut tones.',
    swatch: '#8c4826',
    shadow: '#422415',
    mid: '#7d4323',
    lit: '#a65d35',
    outline: '#2b1207',
  },
  merle: {
    id: 'merle',
    name: 'Blue Merle',
    description: 'Slate grey and cool charcoal mottle with crisp white markings.',
    swatch: '#636c7a',
    shadow: '#353940',
    mid: '#626975',
    lit: '#87909e',
    outline: '#22242a',
  },
  chocolate: {
    id: 'chocolate',
    name: 'Chocolate / Liver',
    description: 'Deep cocoa and dark chocolate coat with warm undertones.',
    swatch: '#5a3b2c',
    shadow: '#2b1c15',
    mid: '#58392a',
    lit: '#79513e',
    outline: '#1c100a',
  },
  golden: {
    id: 'golden',
    name: 'Golden Wheaten',
    description: 'Honeyed pasture-gold coat with soft cream markings.',
    swatch: '#b3864c',
    shadow: '#5e4222',
    mid: '#997341',
    lit: '#c2995e',
    outline: '#3c2710',
  },
};

export const DEFAULT_DOG_COAT: DogCoatId = 'classic';
export const DEFAULT_DOG_NAME = 'Pip';

export const WORKING_DOG_NAMES: readonly string[] = [
  'Pip',
  'Moss',
  'Fly',
  'Shep',
  'Lass',
  'Glen',
  'Sweep',
  'Meg',
  'Roy',
  'Cap',
  'Tweed',
  'Bracken',
  'Buster',
  'Skye',
  'Mist',
  'Jed',
  'Nell',
  'Ben',
  'Tarn',
  'Gyp',
];

export function getRandomDogName(): string {
  const idx = Math.floor(Math.random() * WORKING_DOG_NAMES.length);
  return WORKING_DOG_NAMES[idx] ?? DEFAULT_DOG_NAME;
}
