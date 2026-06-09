// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Achievement definitions registry - [P3-ACHIEVE-DATA].
 *
 * Data only: each definition binds an id to one engine event type and a pure
 * predicate over that event's payload. The engine (engine.js) owns evaluation,
 * persistence, and unlock notification; the UI task (P3-ACHIEVE-UI) reads
 * `nameKey` / `descKey` to resolve player-facing strings from the locales
 * (`js/locales/<lang>/index.js` under `achievements.*`).
 *
 * Event types and payloads (emitted by the seams listed per definition):
 *
 *   'solo-complete'            { sceneId, mode, gameMode, dog, finalTime, totalSheep }
 *                              Fired by js/boot/completionOverlay.js when a
 *                              non-sandbox solo round completes.
 *   'survival-night-survived'  { nightsSurvived, sceneId }
 *                              Fired by js/boot/initWorld.js on the survival
 *                              run's dawn 'survived' transition. nightsSurvived
 *                              counts nights survived in the CURRENT run.
 *   'competitive-win'          { winType }
 *                              Fired by js/gamestate/completion.js when the
 *                              local player wins a competitive room.
 *
 * A definition's `check(payload, ctx)` returns true to unlock. Definitions
 * needing cross-event progress (all-five-dogs-used) read/write a named slice
 * of the persisted progress object via ctx.getProgress / ctx.setProgress.
 */

/** The five playable dogs (ids as used by MenuController.selectedDog). */
export const DOG_IDS = ['jep', 'pip', 'sally', 'shiloh', 'george_washington'];

/**
 * @typedef {Object} AchievementDef
 * @property {string} id            Stable id; persisted in the unlock map.
 * @property {string} event         Engine event type this definition listens to.
 * @property {string} nameKey       Locale key for the player-facing name.
 * @property {string} descKey       Locale key for the player-facing description.
 * @property {(payload: Object, ctx: {getProgress: (key: string) => any, setProgress: (key: string, value: any) => void}) => boolean} check
 */

/** @type {AchievementDef[]} */
export const ACHIEVEMENTS = [
    {
        id: 'first-pen',
        event: 'solo-complete',
        nameKey: 'achievements.firstPen.name',
        descKey: 'achievements.firstPen.desc',
        check: () => true,
    },
    {
        id: 'pen-200-home-field',
        event: 'solo-complete',
        nameKey: 'achievements.pen200HomeField.name',
        descKey: 'achievements.pen200HomeField.desc',
        check: (p) => p.mode === 'classic' && p.sceneId === 'field',
    },
    {
        id: 'pen-200-rolling-hills',
        event: 'solo-complete',
        nameKey: 'achievements.pen200RollingHills.name',
        descKey: 'achievements.pen200RollingHills.desc',
        check: (p) => p.mode === 'classic' && p.sceneId === 'rolling-hills',
    },
    {
        id: 'pen-200-open-country',
        event: 'solo-complete',
        nameKey: 'achievements.pen200OpenCountry.name',
        descKey: 'achievements.pen200OpenCountry.desc',
        check: (p) => p.mode === 'classic' && p.sceneId === 'open-country',
    },
    {
        id: 'chaos-5000-complete',
        event: 'solo-complete',
        nameKey: 'achievements.chaos5000.name',
        descKey: 'achievements.chaos5000.desc',
        check: (p) => p.mode === 'chaos',
    },
    {
        id: 'all-five-dogs-used',
        event: 'solo-complete',
        nameKey: 'achievements.allFiveDogs.name',
        descKey: 'achievements.allFiveDogs.desc',
        check: (p, ctx) => {
            if (!DOG_IDS.includes(p.dog)) return false;
            const used = new Set(Array.isArray(ctx.getProgress('dogsCompleted')) ? ctx.getProgress('dogsCompleted') : []);
            if (!used.has(p.dog)) {
                used.add(p.dog);
                ctx.setProgress('dogsCompleted', [...used].sort());
            }
            return DOG_IDS.every((d) => used.has(d));
        },
    },
    {
        id: 'survive-first-night',
        event: 'survival-night-survived',
        nameKey: 'achievements.surviveFirstNight.name',
        descKey: 'achievements.surviveFirstNight.desc',
        check: (p) => (p.nightsSurvived | 0) >= 1,
    },
    {
        id: 'survive-5-nights',
        event: 'survival-night-survived',
        nameKey: 'achievements.survive5Nights.name',
        descKey: 'achievements.survive5Nights.desc',
        check: (p) => (p.nightsSurvived | 0) >= 5,
    },
    {
        id: 'win-competitive-room',
        event: 'competitive-win',
        nameKey: 'achievements.winCompetitiveRoom.name',
        descKey: 'achievements.winCompetitiveRoom.desc',
        check: () => true,
    },
];
