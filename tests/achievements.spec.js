// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Achievement model + persistence - [P3-ACHIEVE-DATA].
 *
 * Node environment with a mocked localStorage installed per-test. Covers:
 * unlock on qualifying event, persistence round-trip, corrupt-data reset,
 * versioned schema field, no double-unlock, onUnlock fires exactly once,
 * cross-event progress (all-five-dogs-used), and the survival threshold.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    ACHIEVEMENTS,
    DOG_IDS,
    STORAGE_KEY,
    SCHEMA_VERSION,
    recordEvent,
    getUnlocked,
    isUnlocked,
    onUnlock,
    getProgress,
    _resetForTests,
} from '../js/achievements/index.js';

/** Minimal in-memory localStorage stand-in. */
function makeMockStorage(seed = {}) {
    const map = new Map(Object.entries(seed));
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => { map.set(k, String(v)); },
        removeItem: (k) => { map.delete(k); },
        clear: () => { map.clear(); },
        _dump: () => Object.fromEntries(map),
    };
}

let mockStorage;

beforeEach(() => {
    mockStorage = makeMockStorage();
    globalThis.localStorage = mockStorage;
    _resetForTests();
});

afterEach(() => {
    _resetForTests();
    delete globalThis.localStorage;
});

const soloClassicField = {
    sceneId: 'field',
    mode: 'classic',
    gameMode: 'solo',
    dog: 'jep',
    finalTime: 187.4,
    totalSheep: 200,
};

describe('definitions registry', () => {
    it('ships the five spec achievements plus the derivable extras', () => {
        const ids = ACHIEVEMENTS.map((d) => d.id);
        expect(ids).toEqual(expect.arrayContaining([
            'pen-200-home-field',
            'pen-200-rolling-hills',
            'pen-200-open-country',
            'survive-5-nights',
            'win-competitive-room',
            'first-pen',
            'all-five-dogs-used',
            'chaos-5000-complete',
            'survive-first-night',
        ]));
        expect(new Set(ids).size).toBe(ids.length); // ids unique
    });

    it('every definition has locale keys under achievements.*', () => {
        for (const def of ACHIEVEMENTS) {
            expect(def.nameKey).toMatch(/^achievements\./);
            expect(def.descKey).toMatch(/^achievements\./);
        }
    });
});

describe('unlock on qualifying event', () => {
    it('unlocks per-biome classic on a matching solo-complete', () => {
        const newly = recordEvent('solo-complete', soloClassicField);
        expect(newly).toContain('pen-200-home-field');
        expect(newly).toContain('first-pen');
        expect(isUnlocked('pen-200-home-field')).toBe(true);
        // Other biomes stay locked.
        expect(isUnlocked('pen-200-rolling-hills')).toBe(false);
        expect(isUnlocked('pen-200-open-country')).toBe(false);
    });

    it('does not unlock biome classics on a non-classic mode', () => {
        recordEvent('solo-complete', { ...soloClassicField, mode: 'extreme' });
        expect(isUnlocked('pen-200-home-field')).toBe(false);
        expect(isUnlocked('first-pen')).toBe(true); // any solo completion
    });

    it('unlocks chaos-5000-complete on a chaos completion', () => {
        recordEvent('solo-complete', { ...soloClassicField, mode: 'chaos', totalSheep: 5000 });
        expect(isUnlocked('chaos-5000-complete')).toBe(true);
    });

    it('unlocks win-competitive-room on a competitive win', () => {
        const newly = recordEvent('competitive-win', { winType: 'first-to-target' });
        expect(newly).toEqual(['win-competitive-room']);
    });

    it('survival nights: first night at 1, five nights at 5, nothing at 4', () => {
        recordEvent('survival-night-survived', { nightsSurvived: 1, sceneId: 'newsheepdogland' });
        expect(isUnlocked('survive-first-night')).toBe(true);
        expect(isUnlocked('survive-5-nights')).toBe(false);
        recordEvent('survival-night-survived', { nightsSurvived: 4, sceneId: 'newsheepdogland' });
        expect(isUnlocked('survive-5-nights')).toBe(false);
        const newly = recordEvent('survival-night-survived', { nightsSurvived: 5, sceneId: 'newsheepdogland' });
        expect(newly).toEqual(['survive-5-nights']);
    });

    it('an unknown event type unlocks nothing and does not throw', () => {
        expect(recordEvent('no-such-event', {})).toEqual([]);
        expect(recordEvent('solo-complete', undefined)).toContain('first-pen');
    });
});

describe('all-five-dogs-used progress', () => {
    it('accumulates dogs across events and unlocks on the fifth distinct dog', () => {
        for (const dog of DOG_IDS.slice(0, 4)) {
            recordEvent('solo-complete', { ...soloClassicField, dog });
            expect(isUnlocked('all-five-dogs-used')).toBe(false);
        }
        // Repeat dog: no progress, no unlock.
        recordEvent('solo-complete', { ...soloClassicField, dog: 'jep' });
        expect(isUnlocked('all-five-dogs-used')).toBe(false);
        const newly = recordEvent('solo-complete', { ...soloClassicField, dog: 'george_washington' });
        expect(newly).toContain('all-five-dogs-used');
        expect(getProgress('dogsCompleted')).toEqual([...DOG_IDS].sort());
    });

    it('progress survives reload (persisted in the same store)', () => {
        recordEvent('solo-complete', { ...soloClassicField, dog: 'pip' });
        _resetForTests(); // simulate reload; same mockStorage
        recordEvent('solo-complete', { ...soloClassicField, dog: 'sally' });
        expect(getProgress('dogsCompleted')).toEqual(['pip', 'sally']);
    });

    it('ignores unknown dog ids', () => {
        recordEvent('solo-complete', { ...soloClassicField, dog: 'rex' });
        expect(getProgress('dogsCompleted')).toBeUndefined();
    });
});

describe('persistence', () => {
    it('writes through on unlock under the versioned schema key', () => {
        recordEvent('competitive-win', {});
        const raw = mockStorage.getItem(STORAGE_KEY);
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw);
        expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
        expect(parsed.schemaVersion).toBe(1);
        expect(typeof parsed.unlocked['win-competitive-room']).toBe('string');
        // ISO date round-trips.
        expect(Number.isNaN(Date.parse(parsed.unlocked['win-competitive-room']))).toBe(false);
        expect(parsed.progress).toEqual({});
    });

    it('round-trips: unlocks survive a reload', () => {
        recordEvent('solo-complete', soloClassicField);
        const before = getUnlocked();
        _resetForTests(); // drop in-memory state; storage persists
        expect(getUnlocked()).toEqual(before);
        expect(isUnlocked('pen-200-home-field')).toBe(true);
    });

    it('degrades to in-memory when localStorage is absent', () => {
        delete globalThis.localStorage;
        _resetForTests();
        expect(recordEvent('competitive-win', {})).toEqual(['win-competitive-room']);
        expect(isUnlocked('win-competitive-room')).toBe(true);
    });
});

describe('corrupt-data reset', () => {
    it('resets on unparseable JSON', () => {
        mockStorage.setItem(STORAGE_KEY, '{not json');
        expect(getUnlocked()).toEqual({});
        // And the store recovers on the next unlock.
        recordEvent('competitive-win', {});
        expect(JSON.parse(mockStorage.getItem(STORAGE_KEY)).schemaVersion).toBe(1);
    });

    it('resets on a wrong schemaVersion', () => {
        mockStorage.setItem(STORAGE_KEY, JSON.stringify({
            schemaVersion: 999,
            unlocked: { 'first-pen': '2026-01-01T00:00:00.000Z' },
            progress: {},
        }));
        expect(isUnlocked('first-pen')).toBe(false);
    });

    it('resets on a malformed shape', () => {
        mockStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, unlocked: [], progress: {} }));
        expect(getUnlocked()).toEqual({});
        mockStorage.setItem(STORAGE_KEY, JSON.stringify('first-pen'));
        _resetForTests();
        expect(getUnlocked()).toEqual({});
    });

    it('drops non-string unlock timestamps but keeps valid entries', () => {
        mockStorage.setItem(STORAGE_KEY, JSON.stringify({
            schemaVersion: 1,
            unlocked: { 'first-pen': '2026-01-01T00:00:00.000Z', 'win-competitive-room': 42 },
            progress: {},
        }));
        expect(isUnlocked('first-pen')).toBe(true);
        expect(isUnlocked('win-competitive-room')).toBe(false);
    });
});

describe('no double-unlock + onUnlock', () => {
    it('a repeat qualifying event does not re-unlock', () => {
        expect(recordEvent('competitive-win', {})).toEqual(['win-competitive-room']);
        expect(recordEvent('competitive-win', {})).toEqual([]);
    });

    it('onUnlock fires exactly once per achievement', () => {
        const calls = [];
        const off = onUnlock((id, when) => calls.push({ id, when }));
        recordEvent('competitive-win', {});
        recordEvent('competitive-win', {});
        const competitive = calls.filter((c) => c.id === 'win-competitive-room');
        expect(competitive).toHaveLength(1);
        expect(typeof competitive[0].when).toBe('string');
        off();
        recordEvent('solo-complete', soloClassicField);
        expect(calls).toHaveLength(1); // unsubscribed: no further calls
    });

    it('a throwing listener does not break the unlock or other listeners', () => {
        const seen = [];
        onUnlock(() => { throw new Error('boom'); });
        onUnlock((id) => seen.push(id));
        expect(recordEvent('competitive-win', {})).toEqual(['win-competitive-room']);
        expect(seen).toEqual(['win-competitive-room']);
        expect(isUnlocked('win-competitive-room')).toBe(true);
    });
});
