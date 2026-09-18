// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useGameStore } from '@app/state/store';

/**
 * The store's value. It follows `prefers-reduced-motion`, live, until the player
 * sets the toggle themselves; the store holds the query listener so every caller
 * shares one. Reading the query here as well, which is what this hook used to
 * do, would mean a player whose system says reduce could never turn it off.
 */
export function useReducedMotion(): boolean {
  return useGameStore((state) => state.reduceMotion);
}
