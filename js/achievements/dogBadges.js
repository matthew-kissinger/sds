// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Dog completion badges - [P3-ACHIEVE-UNLOCK].
 *
 * Read-only view over the engine's persisted `dogsCompleted` progress slice
 * (written by the `all-five-dogs-used` definition) for the entrance dog
 * picker. The decision recorded in the phase doc: no dog is ever locked
 * away (all five stay selectable for every player, solo and multiplayer);
 * the achievement surface on the picker is a cosmetic badge marking dogs
 * the player has completed a solo round with.
 *
 * Defensive by construction: a missing or malformed progress slice reads
 * as "no dogs completed" so the picker never breaks on a corrupt store.
 */

import { DOG_IDS } from './definitions.js';
import { getProgress, isUnlocked } from './engine.js';

/**
 * The set of dog ids the player has completed a solo round with.
 * @returns {Set<string>}
 */
export function getCompletedDogIds() {
    const raw = getProgress('dogsCompleted');
    const list = Array.isArray(raw) ? raw : [];
    return new Set(list.filter((id) => DOG_IDS.includes(id)));
}

/**
 * @param {string} dogId
 * @returns {boolean} True when a solo round has been completed with this dog.
 */
export function isDogCompleted(dogId) {
    return getCompletedDogIds().has(dogId);
}

/** @returns {boolean} True when the all-five-dogs achievement is unlocked. */
export function hasFullKennel() {
    return isUnlocked('all-five-dogs-used');
}
