// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The first-run tutorial: move, sprint, swap the camera, bark, pen 3 sheep.
 *
 * Cycle 113 Phase 4 (D4) moved it inside the first round. There is no offer
 * card any more, and no TutorialOffer export: a first-time player gets the
 * prompts over whatever they chose to play, and nobody is asked first.
 *
 * Public surface:
 *   - maybeAttachFirstRunTutorial()
 *                          the D4 gate. The entrance commit calls this once the
 *                          round is armed; it is a no-op for a player who has
 *                          completed or dismissed the tutorial.
 *   - attachTutorial()     mount the prompts over the running round, ungated.
 *   - startTutorial()      swap to Home Field, start Just Play, then attach.
 *                          The Settings "Replay tutorial" hook, no arguments.
 *   - isTutorialSessionActive()
 *                          live-session probe (PracticeHint stands down)
 *   - shouldOfferTutorial / isTutorialDone / markTutorialDone
 *                          sds:tutorialDone persistence helpers
 */
export {
    attachTutorial,
    maybeAttachFirstRunTutorial,
    startTutorial,
    isTutorialSessionActive,
} from './startTutorial.js';
export {
    shouldOfferTutorial,
    isTutorialDone,
    markTutorialDone,
    TUTORIAL_DONE_KEY,
    TUTORIAL_GOAL,
    TUTORIAL_STEPS,
} from './tutorialMachine.js';
