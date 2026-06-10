// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 65 P7: the skip-to-dusk cutscene.
 *
 * A skip affordance for the homestead day loop: an on-screen button (tappable on
 * mobile, with the F-key hint on desktop) plus the F key, shown only during the
 * grazing window. Triggering it fast-forwards the day/night clock to the dusk
 * crunch while panning the camera up to the sun and back, so the player can skip
 * the slow opening graze and get straight to herding the flock home before dark.
 *
 * Self-contained + client-only: owns its button, its key listener, and a brief
 * camera takeover (it sets `game._cutsceneActive`, which the main loop checks to
 * suspend the normal follow-camera update for the duration). Driven each frame
 * by the day-loop runner's `tick`.
 */
import * as THREE from 'three';
import { Z } from '../ui/zIndex.js';

const DUSK_T = 0.70;       // the herd-back crunch the skip lands on
const DURATION = 2.6;      // seconds of cutscene

function isTypingTarget() {
    const a = typeof document !== 'undefined' ? document.activeElement : null;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
}

// Smooth start + stop for the time fast-forward.
function easeInOut(u) {
    return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

/**
 * @param {object} game The Game instance (atmosphere, sceneManager, dayLoop, etc.)
 * @returns {{ tick: (dt:number)=>void, dispose: ()=>void, start: ()=>void }}
 */
export function createSkipToDusk(game) {
    const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const reducedMotion = typeof matchMedia !== 'undefined'
        && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const top = isTouch ? 'calc(env(safe-area-inset-top, 0px) + 106px)' : '58px';

    const btn = document.createElement('button');
    btn.id = 'sds-skip-dusk';
    btn.type = 'button';
    btn.textContent = isTouch ? 'SKIP TO DUSK' : 'SKIP TO DUSK  ·  F';
    btn.style.cssText = [
        'position:fixed', 'top:' + top, 'left:50%', 'transform:translateX(-50%)',
        'z-index:' + (Z.chips + 1), 'pointer-events:auto', 'cursor:pointer', 'display:none',
        'font:600 11px/1 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
        'letter-spacing:1.2px', 'color:#f3ead3', 'background:rgba(38,30,22,0.62)',
        'padding:7px 13px', 'border:1px solid rgba(243,234,211,0.3)', 'border-radius:999px',
        'backdrop-filter:blur(6px)', '-webkit-backdrop-filter:blur(6px)',
        'box-shadow:0 3px 12px rgba(0,0,0,0.3)',
    ].join(';');
    (document.body || document.documentElement).appendChild(btn);

    const state = { active: false, elapsed: 0, fromT: DUSK_T };
    const _dogPos = new THREE.Vector3();
    const _sunTarget = new THREE.Vector3();
    const _look = new THREE.Vector3();

    function canSkip() {
        const ph = game.dayLoop?.phase;
        return !state.active && (ph === 'morning' || ph === 'day');
    }

    function start() {
        if (!canSkip()) return;
        const dn = game.atmosphere?.dayNight;
        if (!dn) return;
        state.active = true;
        state.elapsed = 0;
        state.fromT = dn.getT();
        game._cutsceneActive = true;
        btn.style.display = 'none';
        if (reducedMotion) {
            // No camera pan; jump the clock straight to dusk and release.
            dn.setT(DUSK_T);
            game.atmosphere.update(0.0001);
            state.active = false;
            game._cutsceneActive = false;
        }
    }

    btn.addEventListener('click', start);
    const onKey = (e) => {
        if ((e.key === 'f' || e.key === 'F') && !isTypingTarget()) start();
    };
    const sig = game._sceneAbort?.signal;
    window.addEventListener('keydown', onKey, sig ? { signal: sig } : false);

    function tick(dt) {
        if (!state.active) {
            const show = canSkip();
            if ((btn.style.display !== 'none') !== show) {
                btn.style.display = show ? 'block' : 'none';
            }
            return;
        }
        state.elapsed += Number.isFinite(dt) ? dt : 0.016;
        const u = Math.min(1, state.elapsed / DURATION);
        const dn = game.atmosphere?.dayNight;
        if (dn) {
            const t = state.fromT + (DUSK_T - state.fromT) * easeInOut(u);
            dn.setT(t);
            game.atmosphere.update(0.0001); // apply the sun at the new time
        }
        // Re-aim the camera up toward the sun at mid-skip, back to the dog at the
        // ends. The main loop has suspended the follow update while cutsceneActive.
        const cam = game.sceneManager?.getCamera?.();
        const dog = game.sheepdog || game.gameState?.sheepdog;
        if (cam && dog?.position) {
            const gy = game.terrainBuilder?._groundY?.(dog.position.x, dog.position.z) ?? 0;
            _dogPos.set(dog.position.x, gy + 1.5, dog.position.z);
            const sun = game.atmosphere.getSunDirection();
            _sunTarget.copy(cam.position).addScaledVector(sun, 220);
            const w = Math.sin(u * Math.PI); // 0 -> 1 -> 0
            _look.copy(_dogPos).lerp(_sunTarget, w);
            cam.lookAt(_look);
            cam.updateMatrixWorld();
        }
        if (u >= 1) {
            state.active = false;
            game._cutsceneActive = false;
        }
    }

    function dispose() {
        state.active = false;
        game._cutsceneActive = false;
        try { window.removeEventListener('keydown', onKey); } catch (_) { /* ignore */ }
        if (btn.parentNode) btn.parentNode.removeChild(btn);
    }

    return { tick, dispose, start };
}
