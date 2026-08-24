// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/** D-major pentatonic, kept low and warm so repeated pen notes never chirp. */
export const PEN_PHRASE_HZ = [293.66, 329.63, 369.99, 440, 493.88] as const;

export function penNoteFrequency(pennedOrdinal: number): number {
  const index = Math.max(0, pennedOrdinal - 1);
  const octave = Math.floor(index / PEN_PHRASE_HZ.length) % 2;
  return PEN_PHRASE_HZ[index % PEN_PHRASE_HZ.length]! * (octave === 0 ? 1 : 2);
}

export const UI_TONES = {
  tap: 220,
  confirm: 329.63,
  back: 196,
} as const;

/** The final D-major add-six resolve, voiced as an unhurried rising spread. */
export const COMPLETION_RESOLVE = [293.66, 369.99, 440, 587.33] as const;
