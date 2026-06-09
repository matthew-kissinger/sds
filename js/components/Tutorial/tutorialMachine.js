// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P1-TUTORIAL: the first-run tutorial state machine, pure and renderer-free.
 *
 * The tutorial is a ~60 second guided run of Just Play (practice, 30 sheep) on
 * Home Field: move -> sprint -> camera -> herd 3 sheep into the pen -> done.
 * This module owns the step logic and the sds:tutorialDone persistence; the
 * controller (./index.js) pumps it one signal snapshot per frame and the
 * overlay (./TutorialOverlay.tsx) renders whatever step it reports.
 *
 * Kept free of DOM/Three imports so it unit-tests in the node environment.
 * Time and storage are injectable for the same reason.
 */

/** localStorage key. '1' once the player has completed OR skipped the tutorial. */
export const TUTORIAL_DONE_KEY = 'sds:tutorialDone';

/** Sheep the player must pen to complete the herding step. */
export const TUTORIAL_GOAL = 3;

/** Step order. 'done' is the penned celebration; it lingers then finishes. */
export const TUTORIAL_STEPS = Object.freeze(['move', 'sprint', 'camera', 'herd', 'done']);

/** A prompt must be on screen at least this long before its condition can
 * advance it, so a held key doesn't flash the whole ladder past the player. */
export const STEP_MIN_DWELL_MS = 900;

/** How long the celebration step lingers before the tutorial finishes itself. */
export const DONE_LINGER_MS = 5000;

function defaultStorage() {
    // Guarded: jsdom-less tests and private-mode browsers both land in catch.
    try { return globalThis.localStorage ?? null; } catch { return null; }
}

/**
 * True when the player has already completed or skipped the tutorial.
 * Reads defensively: a throwing or absent storage reads as "not done"
 * (the offer shows; declining it simply cannot persist in that case).
 * @param {Pick<Storage, 'getItem'> | null} [storage]
 */
export function isTutorialDone(storage = defaultStorage()) {
    try { return storage?.getItem(TUTORIAL_DONE_KEY) === '1'; } catch { return false; }
}

/**
 * Persist the done flag. Swallows quota/private-mode errors.
 * @param {Pick<Storage, 'setItem'> | null} [storage]
 */
export function markTutorialDone(storage = defaultStorage()) {
    try { storage?.setItem(TUTORIAL_DONE_KEY, '1'); } catch { /* private mode: skip */ }
}

/**
 * Offer gate for the entrance: offer only while the flag is unset.
 * @param {Pick<Storage, 'getItem'> | null} [storage]
 */
export function shouldOfferTutorial(storage = defaultStorage()) {
    return !isTutorialDone(storage);
}

/**
 * @typedef {Object} TutorialSignal
 * @property {boolean} moving      any movement input active this frame
 * @property {boolean} sprinting   sprint input active this frame
 * @property {string | null} cameraMode  current camera mode id, if readable
 * @property {number} penned       sheep retired into the pen so far
 */

/**
 * @typedef {Object} TutorialSnapshot
 * @property {'idle' | 'active' | 'finished'} status
 * @property {string | null} step  current TUTORIAL_STEPS entry while active
 * @property {number} penned       latest penned count (drives herd progress)
 * @property {number} goal
 * @property {boolean} completed   reached 'done' (vs skipped/cancelled)
 */

/**
 * Create a tutorial machine.
 *
 * @param {Object} [opts]
 * @param {() => number} [opts.now]   injectable clock (ms)
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null} [opts.storage]
 * @param {number} [opts.goal]
 * @param {number} [opts.minDwellMs]
 * @param {number} [opts.doneLingerMs]
 */
export function createTutorialMachine(opts = {}) {
    const now = opts.now ?? (() => Date.now());
    const storage = 'storage' in opts ? opts.storage : defaultStorage();
    const goal = opts.goal ?? TUTORIAL_GOAL;
    const minDwellMs = opts.minDwellMs ?? STEP_MIN_DWELL_MS;
    const doneLingerMs = opts.doneLingerMs ?? DONE_LINGER_MS;

    /** @type {TutorialSnapshot} */
    let snapshot = { status: 'idle', step: null, penned: 0, goal, completed: false };
    let stepEnteredAt = 0;
    let cameraBaseline = null;
    const listeners = new Set();

    function emit(next) {
        snapshot = { ...snapshot, ...next };
        for (const l of listeners) l();
    }

    function enterStep(step) {
        stepEnteredAt = now();
        cameraBaseline = null;
        emit({ step });
    }

    function advance() {
        const i = TUTORIAL_STEPS.indexOf(snapshot.step);
        const next = TUTORIAL_STEPS[i + 1];
        if (!next) { finish(); return; }
        if (next === 'done') {
            // Reaching the celebration IS completion: persist immediately so
            // closing the tab mid-celebration still counts.
            markTutorialDone(storage);
            emit({ completed: true });
        }
        enterStep(next);
    }

    function finish() {
        emit({ status: 'finished', step: null });
    }

    return {
        /** Begin the run at the first step. Idempotent while active. */
        start() {
            if (snapshot.status !== 'idle') return;
            emit({ status: 'active' });
            enterStep(TUTORIAL_STEPS[0]);
        },

        /**
         * Feed one frame's worth of input/game state. Advances at most one
         * step per call; each step's condition only counts after the prompt
         * has been visible for minDwellMs.
         * @param {TutorialSignal} sig
         */
        signal(sig) {
            if (snapshot.status !== 'active') return;
            const t = now();
            const penned = typeof sig.penned === 'number' ? sig.penned : snapshot.penned;
            if (penned !== snapshot.penned) emit({ penned });

            // The camera step compares against the mode seen when the step
            // started; record the baseline regardless of the dwell window.
            if (snapshot.step === 'camera' && cameraBaseline === null && sig.cameraMode) {
                cameraBaseline = sig.cameraMode;
            }

            if (snapshot.step === 'done') {
                if (t - stepEnteredAt >= doneLingerMs) finish();
                return;
            }
            if (t - stepEnteredAt < minDwellMs) return;

            switch (snapshot.step) {
                case 'move':
                    if (sig.moving) advance();
                    break;
                case 'sprint':
                    if (sig.sprinting) advance();
                    break;
                case 'camera':
                    if (cameraBaseline && sig.cameraMode && sig.cameraMode !== cameraBaseline) advance();
                    break;
                case 'herd':
                    if (penned >= goal) advance();
                    break;
                default:
                    break;
            }
        },

        /** Player chose to skip (offer decline or in-run skip). Persists. */
        skip() {
            if (snapshot.status === 'finished') return;
            markTutorialDone(storage);
            finish();
        },

        /** Abort without persisting (e.g. the run returned to the menu). */
        cancel() {
            if (snapshot.status === 'finished') return;
            finish();
        },

        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },

        /** @returns {TutorialSnapshot} */
        getSnapshot() {
            return snapshot;
        },
    };
}
