// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 60 Phase 6 - playtest note log.
 *
 * Client-only, localStorage-backed. Notes ride with session context (scene,
 * mode, round/counted, fps, build) so feedback is actionable without a separate
 * window. Follows the playerIdentity.js try/catch JSON convention.
 */
const KEY = 'sds.playtest-notes';

export function readNotes() {
    try {
        const raw = localStorage.getItem(KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

export function addNote(text, context = {}) {
    const note = {
        ts: new Date().toISOString(),
        text: String(text || '').slice(0, 2000),
        ...context,
    };
    try {
        const notes = readNotes();
        notes.push(note);
        localStorage.setItem(KEY, JSON.stringify(notes));
    } catch {
        /* privacy mode / quota: skip */
    }
    return note;
}

export function clearNotes() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function notesAsJson() {
    return JSON.stringify(readNotes(), null, 2);
}

/**
 * Best-effort session context from the live game globals. Everything is wrapped
 * so a missing field never throws - a note with partial context still saves.
 */
export function captureContext() {
    const ctx = {};
    try { ctx.buildId = (typeof __BUILD_ID__ !== 'undefined') ? __BUILD_ID__ : 'dev'; } catch { ctx.buildId = 'dev'; }
    try {
        const game = (typeof window !== 'undefined') ? window.__sds?.gameInstanceRef : null;
        const gs = game?.gameState;
        if (game) ctx.scene = game.currentSceneId ?? game.sceneManager?.currentSceneId ?? gs?.sceneId ?? null;
        if (gs) {
            ctx.gameMode = gs.gameMode ?? null;
            if (gs.countingState) {
                ctx.round = gs.countingState.round ?? null;
                ctx.counted = gs.sheepRetired ?? null;
            }
        }
        if (typeof window !== 'undefined' && typeof window.__sdsLastFps === 'number') ctx.fps = window.__sdsLastFps;
    } catch {
        /* ignore - partial context is fine */
    }
    return ctx;
}

/**
 * The playtest toolkit (note tab + perf chip) is opt-in so regular players never
 * see it. `?notes=1` or `?stats=1` turns it on and persists; `?notes=0` clears.
 */
export function isPlaytestEnabled() {
    try {
        const p = new URLSearchParams(window.location.search);
        if (p.get('notes') === '1' || p.get('stats') === '1') {
            localStorage.setItem('sds.playtest', '1');
            return true;
        }
        if (p.get('notes') === '0') {
            localStorage.removeItem('sds.playtest');
            return false;
        }
        return localStorage.getItem('sds.playtest') === '1' || localStorage.getItem('sds.show-stats') === '1';
    } catch {
        return false;
    }
}
