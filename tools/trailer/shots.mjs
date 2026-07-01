// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// v2.6.1 beta trailer shot list. Public posture: three public scenes only
// (Home Field, Rolling Hills, Open Country). Newsheepdogland is a gated lab
// and does not appear here; the old NSL ascent shot lives on in
// drone-ascent.mjs as a historical spike.
//
// Shot kinds:
//   live    - startSolo boots real gameplay, the sim warms up, then the
//             capture loop pauses the rAF gameplay gate and steps
//             gameInstance.update(1/fps) once per captured frame.
//   (all shots here are live; a pure flyover is a live shot with
//    steering 'none' and a camera path)
//
// Camera types:
//   track  - setDogTrackCamera off the dog's shoulder (opts passed through)
//   orbit  - circle the flock centroid measured after warmup
//   static - fixed pos/target
//   path   - keyframed dolly sampled over the shot duration (t in 0..1)
//
// Steering types:
//   none   - dog stays wherever gameplay left it
//   chase  - dog seeks the centroid of its nearest sheep cluster (speedCap)
//   sprint - dog runs a straight line through the flock centroid (speedCap)
//   drive  - dog works behind the flock, pushing it toward `toward` (speedCap)
//
// Staging (runs once after warmup, before the capture loop):
//   teleportFlock       - move the N nearest sheep (or all) to a disc
//   poseDogAt           - place the dog before the first frame
//   forceObjectiveDrive - flip the multi-stage objective to 'drive' and wake
//                         the portal (runtime state only; no shared/ change)
//
// Dogs are chosen deliberately (js/Sheepdog.js 9-point stat system):
//   sally             - Speed Demon (maxSpeed 22 / sprint 35): the chaos
//                       sprint-through, where the flock parting at speed is
//                       the whole read.
//   jep               - Balanced, the face of the game: Rolling Hills beats.
//   george_washington - Tactical (stamina 4): the long Open Country drives.
//
// Sheep counts come from each scene's soloLadder (shared/difficulty.js):
//   field: classic=200, chaos=5000
//   rolling-hills: hard=200, extreme=1000
//   open-country: hard=150, extreme=600

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// Production plan after Matt's 2026-07-01 review: hand-played OBS footage
// covers the action beats (docs/trailer-recording-checklist-v2.6.1.md); the
// scripted set below is the scenic material - the establish flyover plus one
// slow orbital per public scene, captured with cinema.lodFocus so the
// grass/tree cull centers on the lens, not the dog. The live-action staged
// shots further down are kept as data (fallbacks if a beat is missing from
// the hand-played takes) but are not part of the default scripted set.
export const SCENIC_SET = ['rh-island-establish', 'rh-orbital', 'field-orbital', 'oc-orbital'];

export const SHOTS = {
    // ------------------------------------------------------------------
    // Scenic orbitals - one per public scene. No dog steering; the flock
    // gives ambient life wherever it grazes. Orbit centers are scene
    // centerpieces, not the flock, so composition is deterministic.
    // ------------------------------------------------------------------

    // Home Field: noon pastoral orbit over mid-field; fence, gate, pen, and
    // the classic 200 flock in frame.
    'field-orbital': {
        scene: 'field',
        mode: 'classic',
        dog: 'jep',
        sun: 0.42,
        durationMs: 10000,
        waitForFlockSize: 200,
        warmupSteps: 120,
        steering: { type: 'none' },
        camera: { type: 'orbit', radius: 85, height: 30, sweep: 0.22, theta0: 3.6, centerOn: 'point', point: { x: 0, z: 85 } },
        expect: { dogVisibleMinFrac: 0 },
        beat: 'Home Field orbit: the fenced starter pasture in one slow move.',
    },

    // Rolling Hills: dusk orbit around the staged 1,000-sheep mass.
    'rh-orbital': {
        scene: 'rolling-hills',
        mode: 'extreme',
        dog: 'jep',
        sun: 0.08,
        durationMs: 10000,
        waitForFlockSize: 1000,
        warmupSteps: 120,
        stage: {
            teleportFlock: { x: -25, z: -10, radius: 45 },
            poseDogAt: { x: 35, z: -40, faceToward: { x: -25, z: -10 } },
        },
        steering: { type: 'chase', speedCap: 6 },
        camera: { type: 'orbit', radius: 105, height: 47, sweep: 0.22, theta0: -1.05, centerOn: 'flock' },
        expect: { dogVisibleMinFrac: 0 },
        beat: 'Rolling Hills orbit: a thousand sheep at dusk.',
    },

    // Open Country: golden-hour orbit high over the island middle; woods,
    // meadow, portal glint at the north shore, mountain ring behind.
    'oc-orbital': {
        scene: 'open-country',
        mode: 'extreme',
        dog: 'george_washington',
        sun: 0.66,
        durationMs: 10000,
        waitForFlockSize: 600,
        flockTimeoutMs: 120000,
        warmupSteps: 90,
        steering: { type: 'none' },
        camera: { type: 'orbit', radius: 230, height: 95, sweep: 0.18, theta0: -1.9, centerOn: 'point', point: { x: 0, z: 80 } },
        expect: { dogVisibleMinFrac: 0 },
        beat: 'Open Country orbit: the 380-metre island at golden hour.',
    },

    // ------------------------------------------------------------------
    // Rolling Hills - the island, dusk. Default entrance world; hero mood.
    // ------------------------------------------------------------------

    // Establishing flyover: approach from the south-east over open water,
    // cross the island, end looking west into the low sun. 200 grazing
    // sheep (hard) give the hills ambient life. YouTube opener.
    'rh-island-establish': {
        scene: 'rolling-hills',
        mode: 'hard',
        dog: 'jep',
        sun: 0.075,
        durationMs: 10000,
        waitForFlockSize: 200,
        warmupSteps: 120,
        steering: { type: 'none' },
        camera: {
            type: 'path',
            path: [
                { t: 0.0, pos: { x: 250, y: 26, z: -215 }, target: { x: 0, y: 10, z: 0 } },
                { t: 0.4, pos: { x: 160, y: 58, z: -95 }, target: { x: -30, y: 8, z: 15 } },
                { t: 0.75, pos: { x: 85, y: 62, z: 30 }, target: { x: -90, y: 10, z: 45 } },
                { t: 1.0, pos: { x: 45, y: 55, z: 80 }, target: { x: -230, y: 20, z: 60 } },
            ],
        },
        expect: { dogVisibleMinFrac: 0 },
        beat: 'Island reveal at dusk, ending into the sunset.',
    },

    // The skill loop: Jep works the 200-sheep flock, camera low off the
    // shoulder. Proven chase rig from the June spike, mode fixed from
    // 'classic' (now 75 sheep post-Cycle-58) to 'hard' (200).
    'rh-herding-track': {
        scene: 'rolling-hills',
        mode: 'hard',
        dog: 'jep',
        sun: 0.08,
        durationMs: 8000,
        waitForFlockSize: 200,
        warmupSteps: 90,
        stage: {
            poseDogAt: { x: -72, z: -78, faceToward: { x: -30, z: -30 } },
        },
        steering: { type: 'chase', speedCap: 8 },
        camera: { type: 'chaseCam', side: -7.5, back: 10, height: 6.5, lookAhead: 8, minGround: 3.2 },
        expect: { dogVisibleMinFrac: 0.9 },
        beat: 'The actual herding loop: dog pressures the flock, flock reacts.',
    },

    // Scale at dusk: 1,000 sheep (Solo Extreme) staged as one loose herd,
    // low-ish orbit from the east so the sunset glow sits behind the mass.
    // Jep works the near edge so the herd ripples instead of grazing still.
    'rh-flock-mass': {
        scene: 'rolling-hills',
        mode: 'extreme',
        dog: 'jep',
        sun: 0.08,
        durationMs: 8000,
        waitForFlockSize: 1000,
        warmupSteps: 120,
        stage: {
            teleportFlock: { x: -25, z: -10, radius: 45 },
            poseDogAt: { x: 35, z: -40, faceToward: { x: -25, z: -10 } },
        },
        steering: { type: 'chase', speedCap: 6 },
        camera: { type: 'orbit', radius: 100, height: 40, sweep: 0.25, theta0: -1.05, centerOn: 'flock' },
        expect: { dogVisibleMinFrac: 0 },
        beat: 'A thousand sheep across the island at dusk.',
    },

    // The corral payoff: the dog drives a bunched flock into the corral on
    // camera; each retirement fires the real corral zap and the sheep
    // ascends. No scripted lightning - the actual scoring effect carries
    // the beat. Flock staged just OUTSIDE the corral disc (retirements
    // start mid-shot, not during settle).
    'rh-corral-zap': {
        scene: 'rolling-hills',
        mode: 'hard',
        dog: 'jep',
        sun: 0.09,
        durationMs: 8000,
        waitForFlockSize: 200,
        warmupSteps: 60,
        stage: {
            teleportFlock: { x: 82, z: 42, radius: 11, count: 120 },
            poseDogAt: { x: 66, z: 30, faceToward: { x: 110, z: 60 } },
        },
        steering: { type: 'drive', toward: { x: 110, z: 60 }, speedCap: 5, swing: 9 },
        camera: { type: 'static', pos: { x: 66, y: 24, z: 10 }, target: { x: 106, y: 2, z: 58 } },
        expect: { dogVisibleMinFrac: 0.5 },
        beat: 'Corral zaps: sheep retire home in lightning.',
    },

    // ------------------------------------------------------------------
    // Home Field - the flat fenced starter pasture, noon.
    // ------------------------------------------------------------------

    // Calm control: Jep works the 200-sheep classic flock from behind while
    // it presses north into the fence funnel at the gate. Staging puts the
    // flock between dog and pen so plain flee physics does the driving; the
    // chase camera rides Jep's shoulder with the fence line ahead.
    'field-gate-drive': {
        scene: 'field',
        mode: 'classic',
        dog: 'jep',
        sun: 0.42,
        durationMs: 9000,
        waitForFlockSize: 200,
        warmupSteps: 90,
        stage: {
            teleportFlock: { x: 0, z: 74, radius: 15, count: 200 },
            poseDogAt: { x: 0, z: 48, faceToward: { x: 0, z: 100 } },
        },
        steering: { type: 'chase', speedCap: 7 },
        camera: { type: 'chaseCam', side: -8, back: 11, height: 6, lookAhead: 9, minGround: 2.2 },
        expect: { dogVisibleMinFrac: 0.85 },
        beat: 'Home Field: press the flock into the gate funnel. The starter loop.',
    },

    // THE flex: Sally sprints a straight line through 5,000 sheep (Solo
    // Chaos) and the carpet parts around her. Track camera off the shoulder.
    'field-chaos-surge': {
        scene: 'field',
        mode: 'chaos',
        dog: 'sally',
        sun: 0.42,
        durationMs: 9000,
        waitForFlockSize: 5000,
        flockTimeoutMs: 240000,
        warmupSteps: 150,
        steering: { type: 'sprint', speedCap: 10, throughFlock: true, startOffset: 0.4 },
        camera: { type: 'chaseCam', side: -8, back: 13, height: 7, lookAhead: 12, minGround: 3.0 },
        expect: { dogVisibleMinFrac: 0.9 },
        beat: '5,000 sheep part around a sprinting dog.',
    },

    // ------------------------------------------------------------------
    // Open Country - the 380m portal island, golden hour.
    // ------------------------------------------------------------------

    // Scale wide: slow push from high over the south shore. 600 sheep
    // (extreme) in perimeter clusters read as distant flocks.
    'oc-scale-wide': {
        scene: 'open-country',
        mode: 'extreme',
        dog: 'george_washington',
        sun: 0.66,
        durationMs: 8000,
        waitForFlockSize: 600,
        flockTimeoutMs: 120000,
        warmupSteps: 90,
        steering: { type: 'none' },
        camera: {
            type: 'path',
            path: [
                { t: 0, pos: { x: 0, y: 55, z: -430 }, target: { x: 0, y: 20, z: 100 } },
                { t: 1, pos: { x: 0, y: 85, z: -330 }, target: { x: 0, y: 25, z: 180 } },
            ],
        },
        expect: { dogVisibleMinFrac: 0 },
        beat: 'Open Country scale: the 380-metre island in one frame.',
    },

    // The portal payoff: objective forced to drive stage, portal awake,
    // George Washington pushes a staged cluster north into it. Sheep retire
    // with portal pulses; open sea past the north shore behind.
    // North shore sits on a ~13m plateau (probe-portal.mjs) - camera heights
    // are plateau-relative, not sea-level.
    'oc-portal-retire': {
        scene: 'open-country',
        mode: 'hard',
        dog: 'george_washington',
        sun: 0.66,
        durationMs: 10000,
        waitForFlockSize: 150,
        warmupSteps: 60,
        stage: {
            forceObjectiveDrive: true,
            teleportFlock: { x: 0, z: 262, radius: 9, count: 35 },
            poseDogAt: { x: 0, z: 244, faceToward: { x: 0, z: 295 } },
        },
        steering: { type: 'drive', toward: { x: 0, z: 295 }, speedCap: 5, swing: 8 },
        // Flock, dog, and portal all sit on the camera axis (x=0) so the
        // whole drive-and-ascend beat stays in frame; probe-portal.mjs pose c
        // validated this composition.
        camera: { type: 'static', pos: { x: 0, y: 34, z: 248 }, target: { x: 0, y: 6, z: 293 } },
        expect: { dogVisibleMinFrac: 0.4 },
        beat: 'Sheep ascend to retire through the portal.',
    },
};
