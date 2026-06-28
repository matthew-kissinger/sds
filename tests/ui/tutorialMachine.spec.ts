// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P1-TUTORIAL: the first-run tutorial state machine + offer gating.
 *
 * Pure-logic suite (node environment): step advance conditions over injected
 * time/signals, sds:tutorialDone persistence against a mocked storage, and
 * the offer gate's defensive reads (private mode storage that throws).
 */
import { describe, it, expect, vi } from 'vitest';
import {
    createTutorialMachine,
    isTutorialDone,
    markTutorialDone,
    shouldOfferTutorial,
    TUTORIAL_DONE_KEY,
    TUTORIAL_GOAL,
    TUTORIAL_STEPS,
} from '../../js/components/Tutorial/tutorialMachine.js';

function fakeStorage(initial: Record<string, string> = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
        setItem: (k: string, v: string) => { map.set(k, v); },
        map,
    };
}

function throwingStorage() {
    return {
        getItem: () => { throw new Error('private mode'); },
        setItem: () => { throw new Error('private mode'); },
    };
}

/** Machine with a controllable clock. Dwell 900ms, done linger 5000ms. */
function makeMachine(storage = fakeStorage()) {
    let t = 0;
    const machine = createTutorialMachine({ now: () => t, storage });
    const tick = (ms: number) => { t += ms; };
    const idle = { moving: false, sprinting: false, cameraMode: 'classic', barked: false, penned: 0 };
    return { machine, tick, idle, storage };
}

describe('tutorial persistence (sds:tutorialDone)', () => {
    it('is not done on a fresh profile, and the offer shows', () => {
        const s = fakeStorage();
        expect(isTutorialDone(s)).toBe(false);
        expect(shouldOfferTutorial(s)).toBe(true);
    });

    it('markTutorialDone sets the flag and gates the offer', () => {
        const s = fakeStorage();
        markTutorialDone(s);
        expect(s.map.get(TUTORIAL_DONE_KEY)).toBe('1');
        expect(isTutorialDone(s)).toBe(true);
        expect(shouldOfferTutorial(s)).toBe(false);
    });

    it('reads and writes defensively when storage throws (private mode)', () => {
        const s = throwingStorage();
        expect(() => markTutorialDone(s)).not.toThrow();
        expect(isTutorialDone(s)).toBe(false);
        expect(shouldOfferTutorial(s)).toBe(true);
    });

    it('treats a missing storage (null) as not done', () => {
        expect(isTutorialDone(null)).toBe(false);
        expect(shouldOfferTutorial(null)).toBe(true);
        expect(() => markTutorialDone(null)).not.toThrow();
    });
});

describe('tutorial machine step ladder', () => {
    it('starts idle, enters the first step on start(), and is idempotent', () => {
        const { machine } = makeMachine();
        expect(machine.getSnapshot().status).toBe('idle');
        machine.start();
        expect(machine.getSnapshot()).toMatchObject({ status: 'active', step: TUTORIAL_STEPS[0] });
        machine.start(); // no-op while active
        expect(machine.getSnapshot().step).toBe('move');
    });

    it('does not advance before the dwell window even if the condition holds', () => {
        const { machine, tick, idle } = makeMachine();
        machine.start();
        machine.signal({ ...idle, moving: true }); // t=0, dwell not met
        expect(machine.getSnapshot().step).toBe('move');
        tick(899);
        machine.signal({ ...idle, moving: true });
        expect(machine.getSnapshot().step).toBe('move');
        tick(1);
        machine.signal({ ...idle, moving: true });
        expect(machine.getSnapshot().step).toBe('sprint');
    });

    it('advances at most one step per signal (held inputs cannot skip the ladder)', () => {
        const { machine, tick, idle } = makeMachine();
        machine.start();
        tick(1000);
        machine.signal({ ...idle, moving: true, sprinting: true });
        expect(machine.getSnapshot().step).toBe('sprint');
        // Sprint is still held but the new step's dwell window restarts.
        machine.signal({ ...idle, sprinting: true });
        expect(machine.getSnapshot().step).toBe('sprint');
        tick(1000);
        machine.signal({ ...idle, sprinting: true });
        expect(machine.getSnapshot().step).toBe('camera');
    });

    it('camera step advances when the mode changes from its baseline', () => {
        const { machine, tick, idle } = makeMachine();
        machine.start();
        tick(1000);
        machine.signal({ ...idle, moving: true });   // -> sprint
        tick(1000);
        machine.signal({ ...idle, sprinting: true }); // -> camera
        tick(1000);
        machine.signal({ ...idle, cameraMode: 'classic' }); // baseline recorded, unchanged
        expect(machine.getSnapshot().step).toBe('camera');
        machine.signal({ ...idle, cameraMode: 'follow' });
        expect(machine.getSnapshot().step).toBe('bark');
    });

    it('bark step advances on an accepted bark after dwell', () => {
        const { machine, tick, idle } = makeMachine();
        machine.start();
        tick(1000);
        machine.signal({ ...idle, moving: true });   // -> sprint
        tick(1000);
        machine.signal({ ...idle, sprinting: true }); // -> camera
        tick(1000);
        machine.signal({ ...idle, cameraMode: 'classic' });
        machine.signal({ ...idle, cameraMode: 'follow' }); // -> bark
        expect(machine.getSnapshot().step).toBe('bark');

        machine.signal({ ...idle, barked: true });
        expect(machine.getSnapshot().step).toBe('bark');
        tick(1000);
        machine.signal({ ...idle, barked: true });
        expect(machine.getSnapshot().step).toBe('herd');
    });

    it('herd completes at the 3-sheep goal, persists, lingers, then finishes', () => {
        const { machine, tick, idle, storage } = makeMachine();
        machine.start();
        tick(1000); machine.signal({ ...idle, moving: true });
        tick(1000); machine.signal({ ...idle, sprinting: true });
        tick(1000); machine.signal({ ...idle, cameraMode: 'classic' });
        machine.signal({ ...idle, cameraMode: 'follow' });
        tick(1000); machine.signal({ ...idle, barked: true });
        expect(machine.getSnapshot().step).toBe('herd');

        tick(1000);
        machine.signal({ ...idle, penned: TUTORIAL_GOAL - 1 });
        expect(machine.getSnapshot()).toMatchObject({ step: 'herd', penned: TUTORIAL_GOAL - 1 });

        machine.signal({ ...idle, penned: TUTORIAL_GOAL });
        expect(machine.getSnapshot()).toMatchObject({ step: 'done', completed: true });
        // Completion persists at 'done' entry, not at the end of the linger.
        expect(storage.map.get(TUTORIAL_DONE_KEY)).toBe('1');

        tick(4999);
        machine.signal({ ...idle });
        expect(machine.getSnapshot().status).toBe('active');
        tick(1);
        machine.signal({ ...idle });
        expect(machine.getSnapshot()).toMatchObject({ status: 'finished', step: null });
    });

    it('skip() persists the flag and finishes from any step', () => {
        const { machine, storage } = makeMachine();
        machine.start();
        machine.skip();
        expect(machine.getSnapshot().status).toBe('finished');
        expect(machine.getSnapshot().completed).toBe(false);
        expect(storage.map.get(TUTORIAL_DONE_KEY)).toBe('1');
    });

    it('cancel() finishes WITHOUT persisting (abandoned run re-offers next launch)', () => {
        const { machine, storage } = makeMachine();
        machine.start();
        machine.cancel();
        expect(machine.getSnapshot().status).toBe('finished');
        expect(storage.map.has(TUTORIAL_DONE_KEY)).toBe(false);
    });

    it('ignores signals while idle or finished', () => {
        const { machine, tick, idle } = makeMachine();
        machine.signal({ ...idle, moving: true });
        expect(machine.getSnapshot().status).toBe('idle');
        machine.start();
        machine.skip();
        tick(5000);
        machine.signal({ ...idle, moving: true });
        expect(machine.getSnapshot().status).toBe('finished');
    });

    it('notifies subscribers on step changes and supports unsubscribe', () => {
        const { machine, tick, idle } = makeMachine();
        const listener = vi.fn();
        const unsub = machine.subscribe(listener);
        machine.start();
        expect(listener).toHaveBeenCalled();
        const calls = listener.mock.calls.length;
        unsub();
        tick(1000);
        machine.signal({ ...idle, moving: true });
        expect(listener.mock.calls.length).toBe(calls);
    });
});
