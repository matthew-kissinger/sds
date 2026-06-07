// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 65: the day/night HUD chip for the homestead day loop.
 *
 * A dependency-free DOM chip (the StatsChip precedent) driven from the main
 * loop's day-loop update - NOT a self-driving rAF and NOT React, so it is
 * WebGPU-safe and needs no useGameState plumbing. Shows the day number, the
 * phase, a sun-progress track across the day, and the herd-back home count.
 * Dusk turns it amber with a "herd them in" prompt. Top-center, pointer-events
 * none so it never eats a touch.
 *
 * No emoji per the prose-and-voice rule; ALL-CAPS labels in Matt's voice.
 */

let _el = null;
let _phaseEl = null;
let _markerEl = null;
let _homeEl = null;

const PHASE_LABEL = {
    morning: 'MORNING',
    day: 'MIDDAY',
    dusk: 'DUSK',
    night: 'NIGHT',
};

const CREAM = '#f3ead3';
const AMBER = '#f2c14e';

export function mountDayNightChip() {
    if (_el) return;
    const el = document.createElement('div');
    el.id = 'sds-daynight-chip';
    el.style.cssText = [
        'position:fixed', 'top:12px', 'left:50%', 'transform:translateX(-50%)',
        'z-index:1200', 'pointer-events:none',
        'font:600 12px/1.3 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
        'color:' + CREAM, 'background:rgba(38,30,22,0.58)',
        'padding:8px 14px 9px', 'border:1px solid rgba(243,234,211,0.22)',
        'border-radius:12px', 'backdrop-filter:blur(6px)', '-webkit-backdrop-filter:blur(6px)',
        'box-shadow:0 4px 16px rgba(0,0,0,0.28)', 'text-align:center',
        'letter-spacing:0.6px', 'min-width:184px', 'user-select:none',
    ].join(';');

    const phase = document.createElement('div');
    phase.style.cssText = 'font-weight:700;letter-spacing:1.4px;';
    phase.textContent = 'DAY 1  ·  MORNING';
    el.appendChild(phase);
    _phaseEl = phase;

    // The sun-progress track: a thin rail with dawn/dusk ticks and a marker
    // that rides across as the day advances.
    const track = document.createElement('div');
    track.style.cssText = [
        'position:relative', 'height:3px', 'margin:7px 2px 5px',
        'background:rgba(243,234,211,0.22)', 'border-radius:2px',
    ].join(';');
    // dawn tick (~0.25) and dusk tick (~0.75)
    for (const left of ['25%', '75%']) {
        const tick = document.createElement('div');
        tick.style.cssText = `position:absolute;top:-2px;left:${left};width:1px;height:7px;background:rgba(243,234,211,0.4);`;
        track.appendChild(tick);
    }
    const marker = document.createElement('div');
    marker.style.cssText = [
        'position:absolute', 'top:50%', 'left:28%', 'width:8px', 'height:8px',
        'margin:-4px 0 0 -4px', 'border-radius:50%', 'background:' + AMBER,
        'box-shadow:0 0 6px ' + AMBER, 'transition:left 0.12s linear',
    ].join(';');
    track.appendChild(marker);
    el.appendChild(track);
    _markerEl = marker;

    const home = document.createElement('div');
    home.style.cssText = 'font-size:11px;opacity:0.92;letter-spacing:1px;';
    home.textContent = '';
    el.appendChild(home);
    _homeEl = home;

    (document.body || document.documentElement).appendChild(el);
    _el = el;
}

/**
 * @param {{day:number, phase:string, t:number, sheepHome:number, totalSheep:number, duskWarning:boolean}} s
 */
export function updateDayNightChip(s) {
    if (!_el || !s) return;
    const phaseLabel = PHASE_LABEL[s.phase] || '';
    _phaseEl.textContent = `DAY ${s.day}  ·  ${phaseLabel}`;
    // Marker rides 4%..96% across the rail for t in [0,1).
    const t = ((s.t % 1) + 1) % 1;
    _markerEl.style.left = (4 + t * 92).toFixed(1) + '%';

    if (s.duskWarning) {
        _phaseEl.style.color = AMBER;
        _markerEl.style.background = AMBER;
        _homeEl.style.color = AMBER;
        _homeEl.textContent = `HERD THEM IN  ·  ${s.sheepHome} / ${s.totalSheep} HOME`;
    } else {
        _phaseEl.style.color = CREAM;
        _markerEl.style.background = s.phase === 'night' ? '#9fb6d8' : AMBER;
        _homeEl.style.color = CREAM;
        _homeEl.textContent = s.totalSheep > 0 ? `${s.sheepHome} / ${s.totalSheep} HOME` : '';
    }
}

export function unmountDayNightChip() {
    if (_el && _el.parentNode) _el.parentNode.removeChild(_el);
    _el = null;
    _phaseEl = null;
    _markerEl = null;
    _homeEl = null;
}
