// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import sheepNames from '../../../assets/sheep-names.json';

/**
 * Returns the deterministic authored name for a sheep by its instance index.
 * Falls back to "Sheep #N" if out of bounds.
 */
export function getSheepName(index: number): string {
  if (index >= 0 && index < sheepNames.length) {
    return sheepNames[index]!;
  }
  return `Sheep #${index + 1}`;
}

export function getTotalSheepNames(): number {
  return sheepNames.length;
}
