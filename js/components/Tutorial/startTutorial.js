// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The tutorial session controller.
 *
 * Cycle 113 Phase 4 (D4): the tutorial moved inside the first round. It used to
 * be an offer card on the entrance with a meadow-green "Show me", which was the
 * second primary button on first paint and the thing D4 names as the worst part
 * of that paint. An in-round card with two buttons would have moved that button
 * rather than removed it, so there is no accept step at all now: a first-time
 * player's prompts simply appear over whatever they chose to play, and retire
 * themselves as the player does each thing. The machine already advances on
 * observed movement, sprint, camera, bark and penned count, so it never needed
 * consent to be useful, and it costs a player who ignores it nothing.
 *
 * Three entry points, one session:
 *
 *   attachTutorial()               mount the prompts over the round that is
 *                                  already running. Changes no scene, no mode
 *                                  and no camera: the player picked those.
 *   maybeAttachFirstRunTutorial()  the D4 gate. Attach only for a player who
 *                                  has neither completed nor dismissed it.
 *   startTutorial()                swap to Home Field, start Just Play, then
 *                                  attach. This is the Settings "Replay
 *                                  tutorial" hook and it takes no arguments.
 *
 * The session pumps the machine one signal per rendered frame off the
 * GameBridge 'frame' bus (movement and sprint via InputHandler, camera mode via
 * the camera controller, penned count via gameState.sheepRetired) and tears
 * down when the machine finishes or the run returns to the menu.
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
import { createTutorialMachine, shouldOfferTutorial } from './tutorialMachine.js';
import { TutorialOverlay } from './TutorialOverlay.js';

/** Scene + mode the REPLAY path always runs on: the flat fenced starter pasture. */
const TUTORIAL_SCENE_ID = 'field';
const TUTORIAL_MODE = 'practice';
const TUTORIAL_FOLLOW_ZOOM = 16;

let session = null;
/** Set across startTutorial's awaits, since `session` only exists after them. */
let starting = false;

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

function frameTutorialCamera(game) {
    const controller = game.sceneManager?.getCameraController?.();
    if (!controller) return;
    controller.setMode?.('follow');
    controller.setZoom?.(TUTORIAL_FOLLOW_ZOOM, { persist: false });
    controller.followInitialized = false;
    controller.smoothedFloorY = -Infinity;
    const dog = game.gameState?.getSheepdog?.();
    if (dog) game.sceneManager?.updateCamera?.(dog, 1 / 60);
}

/**
 * Mount the prompt layer over the round that is already running.
 *
 * Deliberately touches nothing about the round itself. The replay path below
 * frames the camera because it also chose the scene and the mode; this path was
 * handed a round the player chose, and moving their camera under them would be
 * the overlay stopping being soft.
 *
 * @returns {boolean} true if a session was started (false if one was already live)
 */
export function attachTutorial() {
    if (session) return false;

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
    // aborts the tutorial without persisting the flag, so a player who bailed
    // in the first ten seconds meets it once more rather than never again.
    session.unsubRestart = subscribeGameEvent('scene-restart-to-menu', () => teardown('cancelled'));

    machine.start();
    root.render(createElement(TutorialOverlay, { machine }));
    session.unsubFrame = subscribeGameEvent('frame', () => machine.signal(readSignal()));
    return true;
}

/**
 * D4's gate: attach for a first-time player, do nothing for everyone else.
 * Called from the entrance commit once the round is armed.
 *
 * @returns {boolean} true if the prompts were mounted
 */
export function maybeAttachFirstRunTutorial() {
    if (!shouldOfferTutorial()) return false;
    return attachTutorial();
}

/**
 * Start (or re-start) the guided run on Home Field, scene swap and all.
 *
 * This is the Settings re-trigger hook (P1-SETTINGS-PANEL wires "Replay
 * tutorial" to exactly this export, with no arguments). Safe to call from
 * anywhere; if a session is already live or starting it is a no-op.
 *
 * @param {Object} [opts]
 * @param {string} [opts.dogId]  dog to run with; defaults to the player's
 *                               current selection, then 'jep'.
 */
export async function startTutorial(opts = {}) {
    if (session || starting) return;
    starting = true;
    try {
        const game = await waitForGameInstance();
        await game.waitForInitialization?.();
        const dogId = opts.dogId || getSelectedDog() || 'jep';
        selectDog(dogId);
        // Build Home Field (no-op if it is already the live scene; `f` forces
        // the build out of the attract field), then start Just Play on it.
        await game.swapScene(TUTORIAL_SCENE_ID, { noCrossfade: true, f: true });
        await game.menuController?.selectSolo?.(dogId, TUTORIAL_MODE);
        frameTutorialCamera(game);
    } catch (err) {
        console.error('[TUTORIAL] failed to start the guided run:', err);
        return;
    } finally {
        starting = false;
    }
    attachTutorial();
}
