// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P1-TUTORIAL: optional first-run tutorial (Home Field, Just Play, herd 3
 * sheep into the pen with contextual prompts for move / sprint / camera).
 *
 * Public surface:
 *   - TutorialOffer        first-run offer card (the entrance mounts it)
 *   - startTutorial()      start the guided run programmatically. This is the
 *                          Settings re-trigger hook: P1-SETTINGS-PANEL wires a
 *                          "Replay tutorial" control in SettingsPanel.js to
 *                          exactly this export (no arguments needed).
 *   - shouldOfferTutorial / isTutorialDone / markTutorialDone
 *                          sds:tutorialDone persistence helpers
 *   - isTutorialSessionActive
 *                          live-session probe (PracticeHint stands down)
 */
export { TutorialOffer } from './TutorialOffer.js';
export { startTutorial, isTutorialSessionActive } from './startTutorial.js';
export {
    shouldOfferTutorial,
    isTutorialDone,
    markTutorialDone,
    TUTORIAL_DONE_KEY,
    TUTORIAL_GOAL,
    TUTORIAL_STEPS,
} from './tutorialMachine.js';
