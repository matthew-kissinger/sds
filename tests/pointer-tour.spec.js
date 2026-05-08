/**
 * Cycle 27 Phase F — pointer-tour gating + dismissal-on-input.
 *
 * Two load-bearing assertions per the cycle plan:
 *   1. localStorage gating: first-time visitor sees the overlay,
 *      second-time visitor does not.
 *   2. Dismissal on first input flips the persistence flag so refreshes
 *      don't re-show.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    shouldShowTour,
    markTourShown,
    HAS_PLAYED_KEY,
    TOUR_SHOWN_KEY,
    INPUT_EVENTS,
} from '../js/components/StartScreen/pointerTourState.js';

beforeEach(() => {
    // In-memory localStorage shim — vitest node env has no DOM by default.
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
    };
});

describe('pointer-tour localStorage gating', () => {
    it('a fresh visitor (no flags) should see the tour', () => {
        expect(shouldShowTour()).toBe(true);
    });

    it('a visitor who completed any round should NOT see the tour', () => {
        localStorage.setItem(HAS_PLAYED_KEY, '1');
        expect(shouldShowTour()).toBe(false);
    });

    it('a visitor who saw the tour but never finished a round should NOT re-see it', () => {
        localStorage.setItem(TOUR_SHOWN_KEY, '1');
        expect(shouldShowTour()).toBe(false);
    });
});

describe('markTourShown persistence', () => {
    it('flips the TOUR_SHOWN flag so subsequent loads skip the overlay', () => {
        expect(shouldShowTour()).toBe(true);
        markTourShown();
        expect(localStorage.getItem(TOUR_SHOWN_KEY)).toBe('1');
        expect(shouldShowTour()).toBe(false);
    });

    it('survives a localStorage failure (privacy mode) without throwing', () => {
        // Simulate setItem throwing.
        const realSet = localStorage.setItem;
        localStorage.setItem = () => { throw new Error('quota'); };
        expect(() => markTourShown()).not.toThrow();
        localStorage.setItem = realSet;
    });
});

describe('input-event names', () => {
    it('covers keyboard, pointer, and touch first-input flavors', () => {
        expect(INPUT_EVENTS).toEqual(['keydown', 'pointerdown', 'touchstart']);
    });
});
