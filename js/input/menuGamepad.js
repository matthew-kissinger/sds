// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 60 Phase 2 - menu gamepad poll.
 *
 * A single requestAnimationFrame loop (running only while there is at least one
 * subscriber) edge-detects the d-pad, left stick, A, and B and emits directional
 * + activate/back events to subscribed menu surfaces. This is deliberately
 * SEPARATE from the gameplay gamepad poll in main.js runFrame, which does not
 * tick on the pre-game entrance and must stay the sole driver during play.
 *
 * Standard mapping: d-pad 12-15, A=0, B=1, left stick axes 0/1.
 */

const BTN = { A: 0, B: 1, DUP: 12, DDOWN: 13, DLEFT: 14, DRIGHT: 15 };
const STICK_THRESHOLD = 0.55;
const STICK_REPEAT_MS = 180;

const subscribers = new Set();
let rafId = 0;
let prev = {};
let stickNextAt = 0;

function readPad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected) return p;
    return null;
}

function emit(type) {
    for (const fn of subscribers) {
        try { fn(type); } catch (_) { /* a subscriber throwing must not kill the loop */ }
    }
}

function edge(pad, idx) {
    const cur = !!(pad.buttons[idx] && pad.buttons[idx].pressed);
    const was = !!prev[idx];
    prev[idx] = cur;
    return cur && !was;
}

function tick() {
    rafId = requestAnimationFrame(tick);
    const pad = readPad();
    if (!pad) { prev = {}; stickNextAt = 0; return; }

    if (edge(pad, BTN.A)) emit('activate');
    if (edge(pad, BTN.B)) emit('back');
    if (edge(pad, BTN.DUP)) emit('up');
    if (edge(pad, BTN.DDOWN)) emit('down');
    if (edge(pad, BTN.DLEFT)) emit('left');
    if (edge(pad, BTN.DRIGHT)) emit('right');

    const x = pad.axes[0] || 0;
    const y = pad.axes[1] || 0;
    const now = (typeof performance !== 'undefined') ? performance.now() : 0;
    if (Math.max(Math.abs(x), Math.abs(y)) >= STICK_THRESHOLD) {
        if (now >= stickNextAt) {
            if (Math.abs(x) >= Math.abs(y)) emit(x > 0 ? 'right' : 'left');
            else emit(y > 0 ? 'down' : 'up');
            stickNextAt = now + STICK_REPEAT_MS;
        }
    } else {
        stickNextAt = 0;
    }
}

/**
 * Subscribe to menu gamepad events. The handler receives one of:
 * 'up' | 'down' | 'left' | 'right' | 'activate' | 'back'.
 * @param {(type: string) => void} handler
 * @returns {() => void} unsubscribe
 */
export function subscribeMenuGamepad(handler) {
    subscribers.add(handler);
    if (!rafId && typeof requestAnimationFrame === 'function') {
        prev = {};
        stickNextAt = 0;
        rafId = requestAnimationFrame(tick);
    }
    return () => {
        subscribers.delete(handler);
        if (subscribers.size === 0 && rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
    };
}
