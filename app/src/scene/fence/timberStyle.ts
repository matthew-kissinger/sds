// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import type { BandSet } from './timberBands';
import { BANDS, OUTLINE } from './timberTones';

/** Construction-time surface tuning shared by the game and asset lab.
 * The lab copies these values; no editor state reaches the shipped material.
 */
export interface TimberStyle {
  readonly bands: Readonly<Record<'line' | 'leaf' | 'gate' | 'cap' | 'iron', BandSet>>;
  /** Metres of normal displacement on the outline hull. */
  readonly outlineWidth: number;
  /** An on-screen sRGB target, like the timber bands. */
  readonly outlineColor: string;
  /** 0 removes painted gate collars; 0.9 is the previous treatment. */
  readonly gatePaintStrength: number;
}

/** The previous procedural fence, retained for comparison and load failure fallback. */
export const DEFAULT_TIMBER_STYLE: TimberStyle = {
  bands: {
    line: BANDS.line!,
    leaf: BANDS.leaf!,
    gate: BANDS.gate!,
    cap: BANDS.cap!,
    iron: BANDS.iron!,
  },
  // A wider shell consumes too much of a narrow board at the near camera.
  outlineWidth: 0.009,
  outlineColor: OUTLINE,
  gatePaintStrength: 0.9,
};
