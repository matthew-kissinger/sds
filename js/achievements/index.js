// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Achievements module - [P3-ACHIEVE-DATA].
 *
 * Public surface: the definitions registry (definitions.js) and the
 * evaluate/persist/notify engine (engine.js). Event-emitting seams import
 * `recordEvent` from here; the UI task (P3-ACHIEVE-UI) consumes
 * `ACHIEVEMENTS` + `getUnlocked`/`isUnlocked`/`onUnlock`.
 */

export { ACHIEVEMENTS, DOG_IDS } from './definitions.js';
export {
    STORAGE_KEY,
    SCHEMA_VERSION,
    recordEvent,
    getUnlocked,
    isUnlocked,
    onUnlock,
    getProgress,
    _resetForTests,
} from './engine.js';
