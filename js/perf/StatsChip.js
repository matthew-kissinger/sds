// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 60 Phase 1 - dependency-free on-screen perf chip.
 *
 * Gated by `?stats=1` (persisted to localStorage `sds.show-stats`; `?stats=0`
 * clears it). Unlike the P-key PerformanceMonitor, this pulls NO CDN script
 * (Stats.js) so it works offline on a LAN tablet. Its own requestAnimationFrame
 * loop measures fps + frametime; a sample callback supplies draw calls,
 * triangles, and active sheep from the live renderer + game state.
 *
 * Fixed bottom-left, pointer-events:none so it never eats a touch.
 */

let _mounted = false;
let _rafId = 0;
let _el = null;

function fmtK(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return Math.round(n / 1e3) + 'k';
    return String(n | 0);
}

/**
 * @param {() => { draws:number, tris:number, sheep:number }} sample
 */
export function mountStatsChip(sample) {
    if (_mounted) return;
    _mounted = true;

    const el = document.createElement('div');
    el.id = 'sds-stats-chip';
    el.style.cssText = [
        'position:fixed', 'left:8px', 'bottom:8px', 'z-index:2147483647',
        'font:600 11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
        'color:#d8f5c8', 'background:rgba(12,22,18,0.72)', 'padding:6px 8px',
        'border:1px solid rgba(216,245,200,0.25)', 'border-radius:8px',
        'pointer-events:none', 'white-space:pre', 'letter-spacing:0.2px',
        'text-shadow:0 1px 2px rgba(0,0,0,0.6)', 'min-width:120px',
    ].join(';');
    el.textContent = 'fps --';
    (document.body || document.documentElement).appendChild(el);
    _el = el;

    let frames = 0;
    let acc = 0;
    let worst = 0;
    let last = (typeof performance !== 'undefined' ? performance.now() : 0);

    const tick = (now) => {
        _rafId = requestAnimationFrame(tick);
        frames++;
        const dt = now - last;
        last = now;
        if (dt > worst) worst = dt;
        acc += dt;
        if (acc < 500) return;

        const fps = Math.round((frames * 1000) / acc);
        const ft = acc / frames;
        try { window.__sdsLastFps = fps; } catch (_) { /* note-log reads this */ }
        let draws = 0, tris = 0, sheep = 0;
        try {
            const s = sample && sample();
            if (s) { draws = s.draws | 0; tris = s.tris | 0; sheep = s.sheep | 0; }
        } catch (_) { /* renderer not ready */ }

        el.textContent =
            `fps ${fps}  ${ft.toFixed(1)}ms\n` +
            `peak ${worst.toFixed(1)}ms\n` +
            `draws ${draws}  tris ${fmtK(tris)}\n` +
            `sheep ${sheep}`;
        el.style.color = fps >= 50 ? '#d8f5c8' : fps >= 30 ? '#f5e6a8' : '#f5b8a8';

        frames = 0; acc = 0; worst = 0;
    };
    _rafId = requestAnimationFrame(tick);
}

export function unmountStatsChip() {
    if (!_mounted) return;
    _mounted = false;
    if (_rafId) cancelAnimationFrame(_rafId);
    _rafId = 0;
    if (_el && _el.parentNode) _el.parentNode.removeChild(_el);
    _el = null;
}
