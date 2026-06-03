// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Reactive read of the OS "reduce motion" accessibility setting.
 *
 * Cycle 47 P6: the plumbing the Motion layer (P7) consumes so every animated
 * transition can collapse to an instant cut when the user asks for reduced
 * motion. The CSS keyframe path honors the same preference through the global
 * `@media (prefers-reduced-motion: reduce)` block in `css/main.css`; this hook
 * is the JS-side mirror for animation libraries that animate via style.
 *
 * Implemented on `useSyncExternalStore` so it stays in sync if the OS setting
 * flips mid-session. `getSnapshot` returns a primitive boolean, so React's
 * Object.is check keeps the reference stable with no extra renders.
 */
import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function getSnapshot(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
    return false;
}

function subscribe(onChange: () => void): () => void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
    }
    const mql = window.matchMedia(QUERY);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
}

/** True when the user has requested reduced motion at the OS level. */
export function useReducedMotion(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
