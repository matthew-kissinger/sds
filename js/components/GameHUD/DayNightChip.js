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
let _summaryEl = null;

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
    // Cycle 65/66: top-LEFT, BELOW the SheepCounter panel (score + stamina bar)
    // which lives in HudLayout's topLeft slot. top:148px clears that panel so the
    // chip never overlays the stamina bar (Matt, Cycle 66 playtest). Aligned to
    // the same 8px gutter as the slot. A compact left-aligned pill.
    el.style.cssText = [
        'position:fixed', 'top:148px', 'left:8px',
        'z-index:1200', 'pointer-events:none',
        'font:600 11px/1.3 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
        'color:' + CREAM, 'background:rgba(38,30,22,0.5)',
        'padding:6px 10px 7px', 'border:1px solid rgba(243,234,211,0.18)',
        'border-radius:10px', 'backdrop-filter:blur(6px)', '-webkit-backdrop-filter:blur(6px)',
        'box-shadow:0 3px 12px rgba(0,0,0,0.24)', 'text-align:left',
        'letter-spacing:0.5px', 'min-width:150px', 'user-select:none',
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
 * Cycle 66 P3: doubles as the survival HUD when `flock` is provided (the live
 * flock size). Shows day, phase, sun progress, in-pen count, and the night
 * threat. Falls back to the Cycle 65 home/total readout for non-survival scenes.
 * @param {{day:number, phase:string, t?:number, sheepHome:number, totalSheep:number, duskWarning:boolean, flock?:number}} s
 */
export function updateDayNightChip(s) {
    if (!_el || !s) return;
    const phaseLabel = PHASE_LABEL[s.phase] || '';
    _phaseEl.textContent = `DAY ${s.day}  ·  ${phaseLabel}`;
    // Marker rides 4%..96% across the rail for t in [0,1).
    const t = ((((s.t ?? 0) % 1) + 1) % 1);
    _markerEl.style.left = (4 + t * 92).toFixed(1) + '%';

    const isSurvival = typeof s.flock === 'number';
    const inPen = s.sheepHome | 0;

    if (s.phase === 'night') {
        // Night: the threat is live - the wolves are out.
        _phaseEl.style.color = AMBER;
        _markerEl.style.background = '#9fb6d8';
        _homeEl.style.color = '#f0a35a';
        _homeEl.textContent = isSurvival
            ? `WOLVES OUT  ·  ${inPen} SAFE IN PEN`
            : `${inPen} / ${s.totalSheep} HOME`;
    } else if (s.duskWarning) {
        _phaseEl.style.color = AMBER;
        _markerEl.style.background = AMBER;
        _homeEl.style.color = AMBER;
        _homeEl.textContent = isSurvival
            ? `HERD THEM IN  ·  ${inPen} / ${s.flock} SAFE`
            : `HERD THEM IN  ·  ${inPen} / ${s.totalSheep} HOME`;
    } else {
        _phaseEl.style.color = CREAM;
        _markerEl.style.background = AMBER;
        _homeEl.style.color = CREAM;
        _homeEl.textContent = isSurvival
            ? `FLOCK ${s.flock}  ·  ${inPen} IN PEN`
            : (s.totalSheep > 0 ? `${inPen} / ${s.totalSheep} HOME` : '');
    }
}

/**
 * Cycle 66 P3: the survival run-summary overlay shown when the flock is lost.
 * A centered modal with the peak-flock score and a restart. Per prose-and-voice:
 * no exclamation marks, no emoji, numbers carry the weight.
 * @param {{day:number, score:number, onRestart?:Function}} info
 */
export function showSurvivalSummary({ day = 1, score = 0, onRestart } = {}) {
    if (_summaryEl) return;
    const el = document.createElement('div');
    el.id = 'sds-survival-summary';
    el.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:2000', 'display:flex',
        'align-items:center', 'justify-content:center',
        'background:rgba(18,14,10,0.62)', 'backdrop-filter:blur(4px)',
        '-webkit-backdrop-filter:blur(4px)',
        'font:600 14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
        'color:' + CREAM,
    ].join(';');
    const panel = document.createElement('div');
    panel.style.cssText = [
        'text-align:center', 'padding:28px 40px', 'background:rgba(38,30,22,0.94)',
        'border:1px solid rgba(243,234,211,0.2)', 'border-radius:16px',
        'box-shadow:0 10px 40px rgba(0,0,0,0.5)', 'max-width:360px',
    ].join(';');
    panel.innerHTML =
        `<div style="font-size:20px;font-weight:800;letter-spacing:1px;color:${AMBER}">THE FLOCK IS LOST</div>` +
        `<div style="margin:12px 0 10px;opacity:0.85">Reached day ${day}.</div>` +
        `<div style="font-size:32px;font-weight:800;margin:6px 0 0">${score}</div>` +
        `<div style="opacity:0.7;letter-spacing:1px;font-size:11px">PEAK FLOCK</div>`;
    const btn = document.createElement('button');
    btn.textContent = 'TRY AGAIN';
    btn.style.cssText = [
        'margin-top:22px', 'padding:10px 24px', 'cursor:pointer',
        'font:700 13px/1 ui-sans-serif,system-ui,sans-serif', 'letter-spacing:1px',
        'color:#241e16', 'background:' + AMBER, 'border:none', 'border-radius:10px',
    ].join(';');
    btn.onclick = () => { if (onRestart) onRestart(); };
    panel.appendChild(btn);
    el.appendChild(panel);
    (document.body || document.documentElement).appendChild(el);
    _summaryEl = el;
}

export function hideSurvivalSummary() {
    if (_summaryEl && _summaryEl.parentNode) _summaryEl.parentNode.removeChild(_summaryEl);
    _summaryEl = null;
}

export function unmountDayNightChip() {
    if (_el && _el.parentNode) _el.parentNode.removeChild(_el);
    _el = null;
    _phaseEl = null;
    _markerEl = null;
    _homeEl = null;
    hideSurvivalSummary();
}
