/**
 * Cycle 17 Phase 7 — synchronous URL-param helpers split out of cinematic.js
 * so main.js can probe `?cinematic=1` without pulling the three.js-dependent
 * `installCinemaApi` + `makeCameraPath` into the main bundle. The heavy half
 * is dynamic-imported on demand when isCinematicMode() returns true.
 *
 * Bundle impact: removes one `import * as THREE from 'three'` from main.js's
 * static import graph, letting Vite split the cinematic surface into its own
 * chunk (~5-10 KB) loaded only on `?cinematic=1` URLs.
 */

export function isCinematicMode() {
    if (typeof location === 'undefined') return false;
    return new URLSearchParams(location.search).get('cinematic') === '1';
}

export function isUiHidden() {
    if (typeof location === 'undefined') return false;
    return new URLSearchParams(location.search).get('ui') === 'off';
}

export function getRequestedSun() {
    if (typeof location === 'undefined') return null;
    const raw = new URLSearchParams(location.search).get('sun');
    if (raw == null) return null;
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return null;
    return Math.max(0, Math.min(1, v));
}
