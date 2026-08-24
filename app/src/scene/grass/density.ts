// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Grass densities selected by the measured boot capability tier
 * (`quality/autoTier.ts`). The renderer backend and a device-pixel-ratio-scaled
 * offscreen fill determine auto; settings can override high/low. The result is
 * held for the session, never adjusted by a per-frame governor.
 *
 * The presets are FRACTIONS of what the bake committed, not counts, because the
 * tier is a prefix of the same buffer (tuftData.ts). Rebaking at a different
 * density moves both presets together and neither number here goes stale.
 *
 * A FRACTION ALONE IS NOT A PRESET. Halving the tuft count halves the ground
 * the tufts cover, and a meadow with holes in it does not read as thinner
 * grass, it reads as a lawn with weeds on it - which is exactly what the first
 * phone capture looked like. So the reduced preset also SPREADS what is left:
 * each surviving tuft is widened until the clumps touch their neighbours again.
 * Coverage goes as the square of the spread, so 1.28 buys back most of what
 * halving the count spent, for nothing - the widening is in the instance matrix
 * and costs not one extra vertex.
 */

export type GrassPreset = 'high' | 'low';

export interface GrassDensity {
  /** Fraction of the baked interactive tier to draw. */
  readonly field: number;
  /** Fraction of the baked surround tier to draw. */
  readonly surround: number;
  /**
   * Horizontal scale on every surviving tuft. Horizontal only: a phone looks at
   * this field from the Classic camera, almost straight down, where what closes
   * the gaps between clumps is their width and taller grass would only swallow
   * the dog.
   */
  readonly spread: number;
}

export const GRASS_PRESETS: Record<GrassPreset, GrassDensity> = {
  /** Desktop: every tuft the bake placed, at the size it was authored. */
  high: { field: 1, surround: 1, spread: 1 },
  /**
   * Touch: half the tufts, spread wide enough to still close. That is half the
   * vertex load of the desktop field with the full flock intact - spec/08 is
   * explicit that grass is what gets cut and gameplay entities are what never
   * do, so the flock size is untouched here.
   */
  low: { field: 0.5, surround: 0.5, spread: 1.28 },
};
