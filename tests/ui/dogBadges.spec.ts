// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * Dog completion badges - [P3-ACHIEVE-UNLOCK].
 *
 * The read-only view the entrance dog picker renders badges from. The
 * recorded design decision: no dog is ever locked; the badge marks dogs the
 * player has completed a solo round with (the engine's `dogsCompleted`
 * progress slice). Covers the empty store, accumulation through real
 * recordEvent calls, persistence across an engine reset (reload), corrupt
 * progress shapes, and the full-kennel flag.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    getCompletedDogIds,
    isDogCompleted,
    hasFullKennel,
} from '../../js/achievements/dogBadges.js';
import {
    recordEvent,
    _resetForTests,
    STORAGE_KEY,
    SCHEMA_VERSION,
} from '../../js/achievements/engine.js';
import { DOG_IDS } from '../../js/achievements/definitions.js';

function soloComplete(dog: string) {
    return {
        sceneId: 'field', mode: 'classic', gameMode: 'solo',
        dog, finalTime: 187.4, totalSheep: 200,
    };
}

beforeEach(() => {
    localStorage.clear();
    _resetForTests();
});

afterEach(() => {
    _resetForTests();
    localStorage.clear();
});

describe('getCompletedDogIds', () => {
    it('is empty on a fresh store', () => {
        expect(getCompletedDogIds().size).toBe(0);
        expect(isDogCompleted('jep')).toBe(false);
    });

    it('accumulates dogs as solo rounds complete', () => {
        recordEvent('solo-complete', soloComplete('pip'));
        expect([...getCompletedDogIds()]).toEqual(['pip']);
        recordEvent('solo-complete', soloComplete('sally'));
        expect(getCompletedDogIds()).toEqual(new Set(['pip', 'sally']));
        expect(isDogCompleted('pip')).toBe(true);
        expect(isDogCompleted('jep')).toBe(false);
    });

    it('survives a reload (engine state reset re-reads storage)', () => {
        recordEvent('solo-complete', soloComplete('shiloh'));
        _resetForTests();
        expect(isDogCompleted('shiloh')).toBe(true);
    });

    it('reads a corrupt progress slice as no badges (never throws)', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            schemaVersion: SCHEMA_VERSION,
            unlocked: {},
            progress: { dogsCompleted: 'not-an-array' },
        }));
        expect(getCompletedDogIds().size).toBe(0);
    });

    it('filters unknown dog ids out of the badge set', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            schemaVersion: SCHEMA_VERSION,
            unlocked: {},
            progress: { dogsCompleted: ['pip', 'not-a-dog'] },
        }));
        expect([...getCompletedDogIds()]).toEqual(['pip']);
    });
});

describe('hasFullKennel', () => {
    it('is false until all five dogs have completed a round, then true', () => {
        expect(hasFullKennel()).toBe(false);
        for (const dog of DOG_IDS) {
            recordEvent('solo-complete', soloComplete(dog));
        }
        expect(hasFullKennel()).toBe(true);
        expect(getCompletedDogIds()).toEqual(new Set(DOG_IDS));
    });
});
