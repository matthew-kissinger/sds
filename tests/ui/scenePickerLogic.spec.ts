/**
 * Cycle 47 P5: unit tests for the ScenePicker pure logic extracted from the
 * component ahead of the .tsx conversion. Node environment (no DOM): every
 * function takes plain args, so ordering, URL resolution, the commit predicate,
 * latest-wins coalescing, index wrap, and swipe thresholds are all testable
 * without mounting React.
 */
import { describe, it, expect } from 'vitest';
import {
    ORDER,
    orderScenes,
    resolveSceneId,
    shouldCommit,
    commitAction,
    pendingDispatch,
    flipIndex,
    swipeDirection,
} from '../../js/components/StartScreen/scenePickerLogic';

describe('orderScenes', () => {
    it('sorts into the fixed ORDER regardless of input order', () => {
        const input = [{ id: 'field' }, { id: 'rolling-hills' }, { id: 'open-country' }];
        expect(orderScenes(input).map((s) => s.id)).toEqual([...ORDER]);
    });

    it('is stable for already-ordered input and does not mutate the source', () => {
        const input = [{ id: 'rolling-hills' }, { id: 'open-country' }, { id: 'field' }];
        const out = orderScenes(input);
        expect(out.map((s) => s.id)).toEqual([...ORDER]);
        expect(input.map((s) => s.id)).toEqual(['rolling-hills', 'open-country', 'field']);
    });
});

describe('resolveSceneId', () => {
    const valid = ['rolling-hills', 'open-country', 'field'];

    it('returns the URL scene when it is a known id', () => {
        expect(resolveSceneId('?scene=open-country', valid, 'rolling-hills')).toBe('open-country');
    });

    it('falls back to the default for a missing param', () => {
        expect(resolveSceneId('', valid, 'rolling-hills')).toBe('rolling-hills');
    });

    it('falls back to the default for an unknown scene id', () => {
        expect(resolveSceneId('?scene=does-not-exist', valid, 'rolling-hills')).toBe('rolling-hills');
    });
});

describe('shouldCommit', () => {
    it('never commits a null target', () => {
        expect(shouldCommit(null, 'field', false)).toBe(false);
    });

    it('no-ops re-picking the on-screen scene when attract is not active', () => {
        expect(shouldCommit('field', 'field', false)).toBe(false);
    });

    it('still commits the on-screen scene while the attract field is up', () => {
        expect(shouldCommit('field', 'field', true)).toBe(true);
    });

    it('commits a different target', () => {
        expect(shouldCommit('open-country', 'field', false)).toBe(true);
    });
});

describe('commitAction', () => {
    it('queues while a swap is in flight (latest-wins)', () => {
        expect(commitAction(true)).toBe('queue');
    });

    it('fires immediately when idle', () => {
        expect(commitAction(false)).toBe('fire');
    });
});

describe('pendingDispatch', () => {
    it('does not dispatch a null pending target', () => {
        expect(pendingDispatch(null, 'field')).toBe(false);
    });

    it('drops a pending target equal to the now-active scene', () => {
        expect(pendingDispatch('field', 'field')).toBe(false);
    });

    it('dispatches a pending target that differs from the active scene', () => {
        expect(pendingDispatch('open-country', 'field')).toBe(true);
    });
});

describe('flipIndex', () => {
    it('wraps forward past the end', () => {
        expect(flipIndex(2, 1, 3)).toBe(0);
    });

    it('wraps backward past the start', () => {
        expect(flipIndex(0, -1, 3)).toBe(2);
    });

    it('moves within range', () => {
        expect(flipIndex(0, 1, 3)).toBe(1);
    });
});

describe('swipeDirection', () => {
    it('advances on a long leftward swipe', () => {
        expect(swipeDirection(-80, 300)).toBe(1);
    });

    it('goes back on a long rightward swipe', () => {
        expect(swipeDirection(80, 300)).toBe(-1);
    });

    it('advances on a short fast leftward flick', () => {
        expect(swipeDirection(-20, 30)).toBe(1);
    });

    it('ignores a short slow drag', () => {
        expect(swipeDirection(15, 300)).toBe(0);
    });
});
