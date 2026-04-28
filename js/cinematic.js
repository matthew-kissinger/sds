/**
 * Cycle 10 Phase 3: cinematic capture infrastructure.
 *
 * `?cinematic=1` opt-in:
 *   - SceneManager flips preserveDrawingBuffer on (so canvas.toDataURL works)
 *   - main.js calls installCinemaApi(this) to expose window.__sdsCinema
 *
 * Companion URL params honoured here:
 *   - ?ui=off   — hides the React overlay so the canvas is clean.
 *   - ?sun=N    — N in [0..1] applied to atmosphere.dayNight.setT() if the
 *                 day-night cycle is wired; falls back to setSun({elevation}).
 *   - ?mode=X   — start screen auto-skip into the named solo mode (classic,
 *                 timed, extreme, insane, chaos). Honoured by main.js
 *                 separately; we only document it here for the shot-list.
 *
 * The api intentionally exposes scene/atmosphere/effects refs by reference,
 * not deep-cloned — Playwright shots can poke whatever they need without
 * a wrapping API surface that we'd have to keep in sync.
 *
 * No in-game UI lands in this cycle (Cycle 10 Q2 — Playwright-driven only).
 * Adding a record button later just means consuming this surface instead
 * of building a new one.
 */
import * as THREE from 'three';

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

/**
 * Lerp a camera along a list of pose keyframes. Each keyframe is
 * { pos: {x,y,z}, target: {x,y,z}, t: 0..1 }. Returns a controller with
 * an update(dtSec) method; call it every animate() tick. When done, the
 * controller's `done` flag flips true and update() becomes a no-op.
 *
 * Designed for short marketing shots — 5-15s is the sweet spot. For longer
 * tracking shots, prefer scripting frame-by-frame from the Playwright runner.
 */
export function makeCameraPath(camera, keyframes, durationMs) {
    if (!Array.isArray(keyframes) || keyframes.length < 2) {
        throw new Error('makeCameraPath requires at least 2 keyframes');
    }
    const sorted = [...keyframes].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
    const start = performance.now();
    const tmpPos = new THREE.Vector3();
    const tmpTarget = new THREE.Vector3();

    function lerpVec3(out, a, b, k) {
        out.set(
            a.x + (b.x - a.x) * k,
            a.y + (b.y - a.y) * k,
            a.z + (b.z - a.z) * k,
        );
    }

    function findSegment(t) {
        for (let i = 0; i < sorted.length - 1; i++) {
            if (t >= sorted[i].t && t <= sorted[i + 1].t) {
                const span = sorted[i + 1].t - sorted[i].t;
                const k = span > 0 ? (t - sorted[i].t) / span : 0;
                return { a: sorted[i], b: sorted[i + 1], k };
            }
        }
        const last = sorted[sorted.length - 1];
        return { a: last, b: last, k: 0 };
    }

    const controller = {
        done: false,
        update() {
            if (controller.done) return;
            const elapsed = performance.now() - start;
            const t = Math.min(1, elapsed / durationMs);
            const { a, b, k } = findSegment(t);
            // Smooth-step inside each segment for less linear-feeling motion.
            const sk = k * k * (3 - 2 * k);
            lerpVec3(tmpPos, a.pos, b.pos, sk);
            lerpVec3(tmpTarget, a.target, b.target, sk);
            camera.position.copy(tmpPos);
            camera.lookAt(tmpTarget);
            if (t >= 1) controller.done = true;
        },
        cancel() { controller.done = true; },
    };
    return controller;
}

/**
 * Install window.__sdsCinema for Playwright-driven shot capture.
 * Called from main.js init() only when isCinematicMode() returns true.
 *
 * The `game` argument is the SheepDogSimulation instance. We hold a soft
 * reference — anything that swaps out (sheepdog, atmosphere, etc.) needs
 * to be looked up dynamically each call.
 */
export function installCinemaApi(game) {
    if (typeof window === 'undefined') return;
    if (window.__sdsCinema) return; // idempotent

    const cinema = {
        // Direct refs (looked up lazily so a future scene swap doesn't strand them).
        get camera() { return game.sceneManager?.getCamera() ?? null; },
        get atmosphere() { return game.atmosphere ?? null; },
        get gameState() { return game.gameState ?? null; },
        get scene() { return game.sceneManager?.getScene() ?? null; },
        get renderer() { return game.sceneManager?.getRenderer() ?? null; },

        // Convenience helpers.
        hideUI() {
            const overlay = document.getElementById('react-overlay');
            if (overlay) overlay.style.display = 'none';
        },
        showUI() {
            const overlay = document.getElementById('react-overlay');
            if (overlay) overlay.style.display = '';
        },
        setSun(t) {
            const atm = game.atmosphere;
            if (!atm) return;
            if (typeof atm.dayNight?.setT === 'function') {
                atm.dayNight.setT(t);
            } else if (typeof atm.setSun === 'function') {
                // Map t in [0..1] to elevation 0 (horizon) → 90° (zenith).
                const elevation = Math.max(0, Math.min(1, t)) * Math.PI * 0.5;
                atm.setSun({ elevation });
            }
        },
        setCameraPose(pos, target) {
            const cam = cinema.camera;
            if (!cam) return;
            cam.position.set(pos.x, pos.y, pos.z);
            cam.lookAt(target.x, target.y, target.z);
        },
        getCameraPose() {
            const cam = cinema.camera;
            if (!cam) return null;
            return {
                pos: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
                target: null, // Not derivable from camera state alone; callers track it.
            };
        },
        playPath(keyframes, durationMs) {
            const cam = cinema.camera;
            if (!cam) return null;
            return makeCameraPath(cam, keyframes, durationMs);
        },
        triggerLightning(pos = { x: 0, y: 0, z: 0 }) {
            const pool = game._corralZapPool;
            if (pool?.fire) pool.fire(pos);
        },
        swapScene(toId, opts) { return game.swapScene(toId, opts); },
        captureFrame() {
            const renderer = cinema.renderer;
            if (!renderer) return null;
            return renderer.domElement.toDataURL('image/png');
        },
    };

    window.__sdsCinema = cinema;
    console.log('[CINEMA] window.__sdsCinema installed (cinematic=1)');
}
