// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P1-TUTORIAL: the tutorial session controller.
 *
 * startTutorial() starts a standard Just Play (practice, 30 sheep) run on
 * Home Field through the same MenuController path the entrance Play button
 * uses, then layers the tutorial prompts on top:
 *
 *   - mounts TutorialOverlay in its own React root (no App.js / GameHUD slot
 *     needed; the start surface unmounts itself once the game goes active),
 *   - pumps the machine one signal per rendered frame off the GameBridge
 *     'frame' bus (movement/sprint via InputHandler, camera mode via the
 *     camera controller, penned count via gameState.sheepRetired),
 *   - tears down when the machine finishes (completed or skipped) or when
 *     the run returns to the menu (cancelled, no flag persisted).
 *
 * The scene swap is covered by the standard SceneSwapOverlay (we do not set
 * window.__sdsBootLoading), so no bespoke loading chrome is needed.
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
    waitForGameInstance,
    selectDog,
    getSelectedDog,
    getInputHandler,
    getGameState,
    getSceneManager,
    subscribeGameEvent,
} from '../../GameBridge.js';
import { createTutorialMachine } from './tutorialMachine.js';
import { TutorialOverlay } from './TutorialOverlay.js';

/** Scene + mode the tutorial always runs on: the flat fenced starter pasture. */
const TUTORIAL_SCENE_ID = 'field';
const TUTORIAL_MODE = 'practice';

let session = null;

/** True while a tutorial run is live (used by PracticeHint to stand down). */
export function isTutorialSessionActive() {
    return session !== null;
}

function readSignal() {
    const input = getInputHandler();
    const gameState = getGameState();
    const cameraMode = getSceneManager()?.getCameraController?.()?.getMode?.() ?? null;
    const barked = session?.barked === true;
    if (session) session.barked = false;
    return {
        moving: input?.isMoving?.() === true,
        sprinting: input?.isSprinting?.() === true,
        cameraMode,
        barked,
        penned: gameState?.sheepRetired ?? 0,
    };
}

function teardown(reason) {
    const s = session;
    if (!s) return;
    session = null;
    s.unsubFrame?.();
    s.unsubRestart?.();
    s.unsubMachine?.();
    if (s.onBarkFired) window.removeEventListener('sds-bark-fired', s.onBarkFired);
    if (reason === 'cancelled') s.machine.cancel();
    // Defer the unmount one tick: the machine subscription that calls this can
    // fire from inside a React event handler, and root.unmount() during render
    // warns.
    setTimeout(() => {
        s.root.unmount();
        s.container.remove();
    }, 0);
}

/**
 * Start (or re-start) the guided first-run tutorial.
 *
 * Safe to call from the entrance offer or from any later surface; if a
 * session is already live it is a no-op. The Settings panel re-trigger
 * (P1-SETTINGS-PANEL) calls exactly this export, with no arguments.
 *
 * @param {Object} [opts]
 * @param {string} [opts.dogId]  dog to run with; defaults to the player's
 *                               current selection, then 'jep'.
 */
export async function startTutorial(opts = {}) {
    if (session) return;

    const machine = createTutorialMachine();
    const container = document.createElement('div');
    container.id = 'tutorial-overlay-root';
    document.body.appendChild(container);
    const root = createRoot(container);

    session = { machine, container, root, barked: false };
    session.onBarkFired = () => {
        if (session) session.barked = true;
    };
    window.addEventListener('sds-bark-fired', session.onBarkFired);
    session.unsubMachine = machine.subscribe(() => {
        if (machine.getSnapshot().status === 'finished') teardown('finished');
    });
    // The run going back to the menu (pause -> main menu, restart-to-menu)
    // aborts the tutorial without persisting the flag.
    session.unsubRestart = subscribeGameEvent('scene-restart-to-menu', () => teardown('cancelled'));

    try {
        const game = await waitForGameInstance();
        await game.waitForInitialization?.();
        const dogId = opts.dogId || getSelectedDog() || 'jep';
        selectDog(dogId);
        // Build Home Field (no-op if it is already the live scene; `f` forces
        // the build out of the attract field), then start Just Play on it.
        await game.swapScene(TUTORIAL_SCENE_ID, { noCrossfade: true, f: true });
        await game.menuController?.selectSolo?.(dogId, TUTORIAL_MODE);
    } catch (err) {
        console.error('[TUTORIAL] failed to start the guided run:', err);
        teardown('cancelled');
        return;
    }
    if (!session) return; // torn down while the scene was building

    machine.start();
    root.render(createElement(TutorialOverlay, { machine }));
    session.unsubFrame = subscribeGameEvent('frame', () => machine.signal(readSignal()));
}
