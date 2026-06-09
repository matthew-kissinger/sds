// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Wolf verification harness (Cycle 61, asset-only). Gated behind `?wolf=1`.
//
// This builds its OWN renderer, scene, camera, lights, and animation loop -
// it does NOT touch the game's SceneManager, GameState, or any playable scene.
// That isolation is deliberate: the wolf is an asset-only drop-in this cycle,
// so the only place it ever renders is this standalone harness. It loads one
// wolf, plays Idle, then runs a scripted speed ramp so you can watch the
// Walk -> Gallop gait blend, and periodically fires the Attack and (once) the
// Death one-shots.
//
// Playwright / dev-tools surface: window.__wolfHarness exposes { ready, error,
// state(), clip(), speed(), frames } so an automated probe can assert the wolf
// loaded and is animating without screenshotting.
//
// See docs/wolf-asset.md for the source, license, and clip mapping.

import * as THREE from 'three';
import { Wolf, WOLF_MODEL_PATH } from '../Wolf.js';

/**
 * Scripted speed timeline (seconds -> target speed in units/sec). The harness
 * lerps the wolf's drive speed across these keys so the gait machine walks
 * IDLE -> WALK -> RUN -> WALK -> IDLE and back, on a loop. RUN speed (16) sits
 * above WOLF_SPEED_THRESHOLDS.RUN so the Gallop clip engages.
 */
const SPEED_TIMELINE = [
    { t: 0.0, speed: 0 },    // idle
    { t: 2.0, speed: 0 },
    { t: 4.0, speed: 2.5 },  // walk
    { t: 7.0, speed: 2.5 },
    { t: 9.0, speed: 16 },   // gallop
    { t: 13.0, speed: 16 },
    { t: 15.0, speed: 2.5 }, // back to walk
    { t: 17.0, speed: 0 },   // back to idle
    { t: 20.0, speed: 0 },
];
const TIMELINE_PERIOD = SPEED_TIMELINE[SPEED_TIMELINE.length - 1].t;

/** Sample the speed timeline at time `t` (seconds), linearly interpolated, looping. */
function sampleSpeed(t) {
    const tt = t % TIMELINE_PERIOD;
    for (let i = 0; i < SPEED_TIMELINE.length - 1; i++) {
        const a = SPEED_TIMELINE[i];
        const b = SPEED_TIMELINE[i + 1];
        if (tt >= a.t && tt <= b.t) {
            const f = (tt - a.t) / Math.max(b.t - a.t, 1e-6);
            return a.speed + (b.speed - a.speed) * f;
        }
    }
    return 0;
}

/**
 * Mount the wolf verification harness. Idempotent-ish: a second call is a no-op
 * if one is already running.
 * @returns {Promise<object>} the window.__wolfHarness surface
 */
export async function mountWolfHarness() {
    if (typeof window !== 'undefined' && window.__wolfHarness?.ready) {
        return window.__wolfHarness;
    }

    /** @type {any} */
    const surface = {
        ready: false,
        error: null,
        frames: 0,
        attackCount: 0,
        diedAt: null,
        elapsed: 0,
        state: () => null,
        clip: () => null,
        speed: () => 0,
        dispose: () => {},
    };
    if (typeof window !== 'undefined') window.__wolfHarness = surface;

    // --- Standalone renderer + scene (own everything; touch no game state). ---
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x9fb8c8, 1);
    renderer.domElement.id = 'wolf-harness-canvas';
    Object.assign(renderer.domElement.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '99999',
        display: 'block',
    });
    document.body.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x9fb8c8, 18, 60);
    // No environment map by design: the game scene has no IBL either, so the
    // harness stays a faithful preview of the in-game look. The wolf reads
    // correctly here because js/Wolf.js sets its materials to metalness 0 (the
    // dog-rig treatment); see the material traversal there.

    const camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.1,
        500,
    );
    camera.position.set(3.4, 2.2, 4.6);
    camera.lookAt(0, 0.6, 0);

    // Lights: warm key + cool fill, matching the pastoral golden-hour read.
    const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x6b5a44, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.1);
    sun.position.set(6, 10, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    scene.add(sun);

    // Simple ground so the shadow + footing read.
    const ground = new THREE.Mesh(
        new THREE.CircleGeometry(20, 48).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x6f8f55, roughness: 1 }),
    );
    ground.receiveShadow = true;
    scene.add(ground);

    // On-screen label so a human knows the harness is up (not a real game).
    const label = document.createElement('div');
    label.id = 'wolf-harness-label';
    Object.assign(label.style, {
        position: 'fixed',
        top: '12px',
        left: '12px',
        zIndex: '100000',
        font: '13px/1.4 ui-monospace, monospace',
        color: '#fff',
        background: 'rgba(20,30,40,0.6)',
        padding: '8px 10px',
        borderRadius: '8px',
        pointerEvents: 'none',
        whiteSpace: 'pre',
    });
    label.textContent = 'Wolf harness loading...';
    document.body.appendChild(label);

    let wolf = null;
    try {
        wolf = await Wolf.load(WOLF_MODEL_PATH, { targetHeight: 1.35 });
    } catch (err) {
        surface.error = String(err?.message || err);
        label.textContent = `Wolf harness FAILED: ${surface.error}`;
        console.error('[WOLF-HARNESS] load failed:', err);
        // Leave the surface in place so a probe can read .error.
        return surface;
    }

    scene.add(wolf.getObject3D());
    wolf.setPosition(0, 0, 0);
    wolf.transitionToState('IDLE');

    // Camera framing for the vertical-fit wolf.
    camera.position.set(2.3, 1.55, 3.0);
    camera.lookAt(0, 0.7, 0);
    camera.updateProjectionMatrix();

    // Expose the renderer refs so a probe / human can live-tune the view and
    // inspect the wolf without re-instrumenting THREE.
    surface.camera = camera;
    surface.scene = scene;
    surface.getWolf = () => wolf;

    surface.state = () => wolf.currentState;
    surface.clip = () => wolf.currentAction?.getClip?.()?.name ?? null;
    surface.speed = () => wolf.speed;

    // Scripted one-shots: attack at ~21.5s and ~43s (mid-timeline), a single
    // death near ~62s to show the clamp, then respawn (revive) ~3s later so the
    // harness keeps looping rather than freezing on Death.
    const ATTACK_TIMES = [21.5, 43.0];
    const DEATH_TIME = 62.0;
    const REVIVE_AFTER_DEATH = 3.0;
    let nextAttackIdx = 0;
    let deathFired = false;

    const clock = new THREE.Clock();
    let rafId = 0;
    let running = true;

    const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // Manual one-shot triggers so a human can fire the predator beats on demand.
    // The scripted timeline fires them too, but waiting ~20s to see Attack is
    // tedious when inspecting the asset. A = Attack (auto-returns to the gait);
    // K = Death (the existing revive loop brings the wolf back ~3s later, once
    // the death bookkeeping below is armed).
    const onKeyDown = (e) => {
        const k = e.key.toLowerCase();
        if (k === 'a') {
            wolf.triggerAttack();
        } else if (k === 'k') {
            wolf.triggerDeath();
            surface.diedAt = surface.elapsed; // arm the revive
            deathFired = true;
        }
    };
    window.addEventListener('keydown', onKeyDown);

    const tick = () => {
        if (!running) return;
        rafId = requestAnimationFrame(tick);
        const dt = Math.min(clock.getDelta(), 0.05);
        surface.elapsed += dt;
        const t = surface.elapsed;

        // Scripted speed ramp drives the gait blend (skipped while dead).
        if (!wolf.isDead) {
            wolf.setSpeed(sampleSpeed(t));
        }

        // One-shot scheduling.
        if (!wolf.isDead && nextAttackIdx < ATTACK_TIMES.length && t >= ATTACK_TIMES[nextAttackIdx]) {
            wolf.triggerAttack();
            surface.attackCount++;
            nextAttackIdx++;
        }
        if (!deathFired && t >= DEATH_TIME) {
            wolf.triggerDeath();
            surface.diedAt = t;
            deathFired = true;
        }
        // Revive so the loop continues (asset harness only; a real mode would
        // despawn instead). Rebuild a fresh wolf in place.
        if (deathFired && wolf.isDead && t >= (surface.diedAt + REVIVE_AFTER_DEATH)) {
            wolf.dispose();
            Wolf.load(WOLF_MODEL_PATH, { targetHeight: 1.35 }).then((w) => {
                wolf = w;
                scene.add(wolf.getObject3D());
                surface.state = () => wolf.currentState;
                surface.clip = () => wolf.currentAction?.getClip?.()?.name ?? null;
                surface.speed = () => wolf.speed;
            }).catch(() => {});
            deathFired = false;
            surface.diedAt = null;
            surface.elapsed = 0;
        }

        wolf.update(dt);

        // Slow turntable so all sides are visible.
        wolf.setRotationY(t * 0.35);

        renderer.render(scene, camera);
        surface.frames++;
        label.textContent =
            `Wolf harness (?wolf=1) - ASSET-ONLY, not a game mode\n` +
            `state: ${wolf.currentState}   clip: ${surface.clip() ?? '-'}\n` +
            `speed: ${wolf.speed.toFixed(1)} u/s   frames: ${surface.frames}` +
            (wolf.isDead ? '   [DEAD - reviving]' : '') +
            `\nkeys: A = attack   K = death`;
    };

    surface.dispose = () => {
        running = false;
        cancelAnimationFrame(rafId);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('keydown', onKeyDown);
        wolf?.dispose?.();
        renderer.dispose();
        renderer.domElement.remove();
        label.remove();
    };

    surface.ready = true;
    rafId = requestAnimationFrame(tick);
    console.log('[WOLF-HARNESS] mounted. window.__wolfHarness ready. Asset-only - not wired into any mode.');
    return surface;
}
