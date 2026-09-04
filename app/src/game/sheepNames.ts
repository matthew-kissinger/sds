// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import sheepNames from '../../../assets/sheep-names.json';

/**
 * Returns the effective name for a sheep by its instance index, checking
 * player custom names first, then falling back to the deterministic authored ledger.
 * Falls back to "Sheep #N" if out of bounds.
 */
export function getSheepName(
  index: number,
  customNames?: Readonly<Record<number, string>>,
): string {
  if (customNames && customNames[index] && customNames[index].trim().length > 0) {
    return customNames[index].trim();
  }
  return getDefaultSheepName(index);
}

/**
 * Returns the default deterministic authored name for a sheep.
 */
export function getDefaultSheepName(index: number): string {
  if (index >= 0 && index < sheepNames.length) {
    return sheepNames[index]!;
  }
  return `Sheep #${index + 1}`;
}

export const SHEEP_NAMES_LEDGER: readonly string[] = sheepNames;

export function getRandomSheepName(): string {
  const index = Math.floor(Math.random() * sheepNames.length);
  return sheepNames[index] ?? 'Clover';
}

export function getTotalSheepNames(): number {
  return sheepNames.length;
}
