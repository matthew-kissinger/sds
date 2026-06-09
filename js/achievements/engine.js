// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Achievement engine - [P3-ACHIEVE-DATA].
 *
 * Evaluates the definitions registry against game events and persists unlocks
 * to localStorage under a VERSIONED schema (the legacy 'sds-settings' blob has
 * no version field; this store does, so a future shape change can migrate
 * instead of guessing).
 *
 *   key:    'sds:achievements'
 *   value:  { schemaVersion: 1,
 *             unlocked: { [achievementId]: isoDateString },
 *             progress: { [sliceKey]: any } }
 *
 * Discipline:
 *   - Defensive read: parse failures, wrong/unknown schemaVersion, or a
 *     malformed shape reset to an empty store (corrupt data never crashes
 *     the caller and never half-loads).
 *   - Write-through: every unlock or progress change persists immediately,
 *     so an unlock survives reload even if the tab dies right after.
 *   - No double-unlock: an already-unlocked id is skipped at recordEvent
 *     time, so its onUnlock callbacks fire exactly once per id.
 *   - Storage-free environments (node tests, blocked storage) degrade to
 *     in-memory state; recordEvent never throws.
 *
 * The module is render-free and main.js-free: callers wire `recordEvent` at
 * the completion/survival/competitive seams (see definitions.js header).
 */

import { ACHIEVEMENTS } from './definitions.js';

export const STORAGE_KEY = 'sds:achievements';
export const SCHEMA_VERSION = 1;

/** @type {{schemaVersion: number, unlocked: Record<string, string>, progress: Record<string, any>} | null} */
let state = null;

/** @type {Set<(id: string, unlockedAt: string) => void>} */
const unlockListeners = new Set();

/** localStorage, or null when unavailable (node, blocked storage access). */
function getStorage() {
    try {
        if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    } catch {
        // Accessing localStorage can throw (e.g. blocked third-party storage).
    }
    return null;
}

function isPlainObject(v) {
    return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function emptyState() {
    return { schemaVersion: SCHEMA_VERSION, unlocked: {}, progress: {} };
}

/**
 * Defensive read of the persisted store. Any corruption (bad JSON, wrong
 * schemaVersion, malformed shape) resets to an empty store rather than
 * crashing or half-loading.
 */
function readState() {
    const store = getStorage();
    if (!store) return emptyState();
    let raw = null;
    try {
        raw = store.getItem(STORAGE_KEY);
    } catch {
        return emptyState();
    }
    if (!raw) return emptyState();
    try {
        const parsed = JSON.parse(raw);
        if (
            !isPlainObject(parsed)
            || parsed.schemaVersion !== SCHEMA_VERSION
            || !isPlainObject(parsed.unlocked)
            || !isPlainObject(parsed.progress)
        ) {
            return emptyState();
        }
        // Keep only well-formed unlock entries (id -> ISO date string).
        const unlocked = {};
        for (const [id, when] of Object.entries(parsed.unlocked)) {
            if (typeof when === 'string') unlocked[id] = when;
        }
        return { schemaVersion: SCHEMA_VERSION, unlocked, progress: parsed.progress };
    } catch {
        return emptyState();
    }
}

function ensureState() {
    if (!state) state = readState();
    return state;
}

/** Write-through persist. Quota/security failures degrade to in-memory only. */
function persist() {
    const store = getStorage();
    if (!store || !state) return;
    try {
        store.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Quota exceeded or storage blocked: keep the in-memory state.
    }
}

/**
 * Feed a game event to the engine. Evaluates every definition listening to
 * `type`; persists progress + unlocks write-through; notifies onUnlock
 * subscribers once per newly unlocked id. Never throws.
 *
 * @param {string} type     Event type (see definitions.js header).
 * @param {Object} [payload]
 * @returns {string[]}      Ids newly unlocked by this event.
 */
export function recordEvent(type, payload = {}) {
    const st = ensureState();
    let dirty = false;
    const newlyUnlocked = [];
    const ctx = {
        getProgress: (key) => st.progress[key],
        setProgress: (key, value) => {
            st.progress[key] = value;
            dirty = true;
        },
    };
    for (const def of ACHIEVEMENTS) {
        if (def.event !== type || st.unlocked[def.id]) continue;
        let pass = false;
        try {
            pass = Boolean(def.check(payload || {}, ctx));
        } catch (err) {
            console.warn(`[ACHIEVEMENTS] check failed for ${def.id}:`, err);
        }
        if (pass) {
            st.unlocked[def.id] = new Date().toISOString();
            dirty = true;
            newlyUnlocked.push(def.id);
        }
    }
    if (dirty) persist();
    for (const id of newlyUnlocked) {
        for (const cb of unlockListeners) {
            try {
                cb(id, st.unlocked[id]);
            } catch (err) {
                console.warn('[ACHIEVEMENTS] onUnlock listener failed:', err);
            }
        }
    }
    return newlyUnlocked;
}

/** @returns {Record<string, string>} Copy of the unlock map (id -> ISO date). */
export function getUnlocked() {
    return { ...ensureState().unlocked };
}

/** @param {string} id */
export function isUnlocked(id) {
    return Boolean(ensureState().unlocked[id]);
}

/**
 * Subscribe to unlocks. The callback fires once per newly unlocked id
 * (no double-unlock by construction: unlocked ids are skipped upstream).
 *
 * @param {(id: string, unlockedAt: string) => void} cb
 * @returns {() => void} Unsubscribe.
 */
export function onUnlock(cb) {
    unlockListeners.add(cb);
    return () => unlockListeners.delete(cb);
}

/**
 * Read a persisted progress slice (e.g. 'dogsCompleted'). For the UI task.
 * @param {string} key
 */
export function getProgress(key) {
    return ensureState().progress[key];
}

/** Test hook: drop in-memory state + listeners so the next call re-reads storage. */
export function _resetForTests() {
    state = null;
    unlockListeners.clear();
}
