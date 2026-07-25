// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Z } from '../../ui/zIndex.js';
/**
 * Cycle 66 P7: the Newsheepdogland survival minimap.
 *
 * A dependency-free DOM + canvas overlay (the DayNightChip / StatsChip
 * precedent) - NOT React and NOT a self-driving rAF, so it is WebGPU-safe and
 * needs no useGameState plumbing. The main loop's day-loop tick feeds it live
 * positions; it redraws at ~20 Hz.
 *
 * It draws the island layout straight from the coastline polygon (the SAME
 * NEWSHEEPDOGLAND_POINTS the boundary + heightmap bake use, so the minimap shape
 * cannot drift from the real coast), then overlays live markers: the pen, the
 * dog (player), the flock (penned vs roaming), and the night wolves. Top-right,
 * pointer-events none so it never eats a touch. No emoji; pastoral palette.
 */

let _wrap = null;
let _canvas = null;
let _ctx = null;
let _islandPath = null;   // Path2D in canvas space, baked once
let _xf = null;           // world -> canvas transform
let _acc = 0;             // redraw throttle accumulator

// Pastoral palette (matches the dusk island + the DayNightChip cream/amber).
const C = {
    land: 'rgba(74, 92, 58, 0.55)',     // muted coastal green
    landEdge: 'rgba(243, 234, 211, 0.35)',
    pen: 'rgba(243, 234, 211, 0.85)',
    sheep: 'rgba(243, 234, 211, 0.95)',
    penned: 'rgba(150, 200, 130, 0.95)',
    dog: '#5ea0ff',
    wolf: '#f0613a',
};

const SIZE_MAX = 158;          // longest minimap edge in CSS px
const MOBILE_SIZE_MAX = 104;   // keep the mobile top HUD readable
const PAD = 6;                 // inner padding in CSS px

function _isCompactMobile() {
    if (typeof window === 'undefined') return false;
    const coarsePointer = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    return coarsePointer || window.innerWidth <= 480;
}

function _sizeMax() {
    if (_isCompactMobile()) return MOBILE_SIZE_MAX;
    return SIZE_MAX;
}

function _topOffset() {
    if (_isCompactMobile()) return 'calc(env(safe-area-inset-top, 0px) + 96px)';
    // Cycle 91: clear the HUD's topRight stack (the GameTimer renders in the
    // same corner; the minimap used to draw under it). HudLayout publishes
    // the reserve, 0px when the slot is empty.
    return 'calc(max(env(safe-area-inset-top, 8px), 8px) + var(--sds-topright-reserve, 0px))';
}

/**
 * Build the world->canvas transform + the island Path2D from the coast polygon.
 * North (+z) is up: world +x -> canvas +x, world +z -> canvas -y.
 */
function _buildTransform(points) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of points) {
        const x = p.x ?? p[0], z = p.z ?? p[1];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const wWorld = Math.max(1, maxX - minX);
    const hWorld = Math.max(1, maxZ - minZ);
    // Fit the bbox into the active size preserving aspect.
    const sizeMax = _sizeMax();
    const scale = (sizeMax - 2 * PAD) / Math.max(wWorld, hWorld);
    const wCss = wWorld * scale + 2 * PAD;
    const hCss = hWorld * scale + 2 * PAD;
    return {
        wCss, hCss, scale,
        toX: (x) => PAD + (x - minX) * scale,
        toY: (z) => PAD + (maxZ - z) * scale, // invert z so north is up
    };
}

/**
 * Mount the minimap. Idempotent.
 * @param {{points:Array, pen?:{center:{x:number,z:number},radius:number}}} cfg
 */
export function mountMinimap({ points, pen } = {}) {
    if (_wrap) return;
    if (!Array.isArray(points) || points.length < 3) return;

    _xf = _buildTransform(points);
    _pen = pen || null;

    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);

    const wrap = document.createElement('div');
    wrap.id = 'sds-minimap';
    wrap.dataset.sdsOverlay = 'hud';
    wrap.style.cssText = [
        'position:fixed', 'top:' + _topOffset(), 'right:8px', 'z-index:' + Z.chips,
        'pointer-events:none', 'user-select:none',
        `width:${Math.round(_xf.wCss)}px`, `height:${Math.round(_xf.hCss)}px`,
        'background:rgba(38,30,22,0.42)', 'border:1px solid rgba(243,234,211,0.18)',
        'border-radius:10px', 'backdrop-filter:blur(6px)', '-webkit-backdrop-filter:blur(6px)',
        'box-shadow:0 3px 12px rgba(0,0,0,0.24)', 'overflow:hidden',
    ].join(';');

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(_xf.wCss * dpr);
    canvas.height = Math.round(_xf.hCss * dpr);
    canvas.style.cssText = `width:${Math.round(_xf.wCss)}px;height:${Math.round(_xf.hCss)}px;display:block;`;
    wrap.appendChild(canvas);
    (document.body || document.documentElement).appendChild(wrap);

    _wrap = wrap;
    _canvas = canvas;
    _ctx = canvas.getContext('2d');
    _ctx.scale(dpr, dpr);

    // Bake the island silhouette once in canvas space.
    _islandPath = new Path2D();
    points.forEach((p, i) => {
        const x = _xf.toX(p.x ?? p[0]);
        const y = _xf.toY(p.z ?? p[1]);
        if (i === 0) _islandPath.moveTo(x, y); else _islandPath.lineTo(x, y);
    });
    _islandPath.closePath();

    _drawStatic();
}

let _pen = null;

/** Draw just the static island + pen (markers layer redraws on top each tick). */
function _drawStatic() {
    if (!_ctx) return;
    _ctx.clearRect(0, 0, _xf.wCss, _xf.hCss);
    _ctx.fillStyle = C.land;
    _ctx.fill(_islandPath);
    _ctx.lineWidth = 1;
    _ctx.strokeStyle = C.landEdge;
    _ctx.stroke(_islandPath);
}

/**
 * Redraw the live layer (island + pen + markers). Throttled to ~20 Hz off the
 * caller's dt so it costs almost nothing even with a few hundred sheep.
 * @param {{dt?:number, dog?:{x:number,z:number}|null, dogs?:Array<{x:number,z:number,self?:boolean}>, sheep?:Array, wolves?:Array, force?:boolean}} s
 */
export function updateMinimap(s = {}) {
    if (!_ctx || !_xf) return;
    _acc += Number.isFinite(s.dt) ? s.dt : 0.016;
    if (!s.force && _acc < 0.05) return; // ~20 Hz
    _acc = 0;

    _drawStatic();

    // Pen outline (a small square around its centre at +/- radius).
    if (_pen?.center) {
        const x0 = _xf.toX(_pen.center.x - _pen.radius);
        const x1 = _xf.toX(_pen.center.x + _pen.radius);
        const y0 = _xf.toY(_pen.center.z + _pen.radius);
        const y1 = _xf.toY(_pen.center.z - _pen.radius);
        _ctx.lineWidth = 1.25;
        _ctx.strokeStyle = C.pen;
        _ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }

    // Flock: a small dot per active sheep (penned tinted green, roaming cream).
    const sheep = s.sheep;
    if (Array.isArray(sheep)) {
        for (let i = 0; i < sheep.length; i++) {
            const sh = sheep[i];
            const p = sh && sh.position;
            if (!p || sh.killed) continue;
            _ctx.fillStyle = sh.penned ? C.penned : C.sheep;
            _ctx.fillRect(_xf.toX(p.x) - 1, _xf.toY(p.z) - 1, 2, 2);
        }
    }

    // Wolves: red dots (night only; the pack is empty by day).
    const wolves = s.wolves;
    if (Array.isArray(wolves)) {
        _ctx.fillStyle = C.wolf;
        for (let i = 0; i < wolves.length; i++) {
            const w = wolves[i];
            if (!w) continue;
            const wx = _xf.toX(w.x), wy = _xf.toY(w.z);
            _ctx.beginPath();
            _ctx.arc(wx, wy, 2.2, 0, Math.PI * 2);
            _ctx.fill();
        }
    }

    // Dogs: a bright ringed dot per player. Co-op passes `dogs` (all players,
    // the local one flagged `self`); solo passes a single `dog`. The local dog
    // gets a brighter ring so it reads above teammates and the flock.
    const dogs = Array.isArray(s.dogs)
        ? s.dogs
        : (s.dog ? [{ x: s.dog.x, z: s.dog.z, self: true }] : []);
    for (const d of dogs) {
        if (!d) continue;
        const dx = _xf.toX(d.x), dy = _xf.toY(d.z);
        _ctx.beginPath();
        _ctx.arc(dx, dy, 3, 0, Math.PI * 2);
        _ctx.fillStyle = C.dog;
        _ctx.fill();
        _ctx.lineWidth = 1.25;
        _ctx.strokeStyle = d.self ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)';
        _ctx.stroke();
    }
}

export function unmountMinimap() {
    if (_wrap && _wrap.parentNode) _wrap.parentNode.removeChild(_wrap);
    _wrap = null;
    _canvas = null;
    _ctx = null;
    _islandPath = null;
    _xf = null;
    _pen = null;
    _acc = 0;
}
