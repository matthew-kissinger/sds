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

    const round = (n) => Math.round(n * 10) / 10; // 1-decimal precision for shot configs

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

        // Cycle 11 Phase 3 additions ----------------------------------------

        /**
         * Wait until the scene is fully ready for capture: gameState mounted,
         * atmosphere initialized, renderer alive, and at least one frame
         * rendered. Resolves once those conditions hold; rejects after timeout.
         */
        async waitReady(timeoutMs = 20000) {
            const start = performance.now();
            const ok = () => game.gameState && game.atmosphere && game.sceneManager?.getRenderer?.();
            while (!ok()) {
                if (performance.now() - start > timeoutMs) throw new Error('waitReady timeout');
                await new Promise(r => requestAnimationFrame(r));
            }
            // One more frame for renderer info to settle.
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        },

        /** Pause the gameplay loop so static shots aren't blurred by sheep. */
        pauseSimulation() { cinema.paused = true; },
        resumeSimulation() { cinema.paused = false; },
        paused: false,

        /** Wraps SheepDogSimulation.startSoloGame for Playwright shot drives. */
        startSolo(dogId = 'jep', mode = 'classic') {
            game.startSoloGame?.(dogId, mode);
        },

        /**
         * Free-fly camera mode. Mounts OrbitControls on the canvas and
         * suspends the gameplay CameraController (gated in SceneManager.
         * updateCamera). Drag = orbit; right-drag = pan; scroll = zoom.
         * Use snapshotPose() to print paste-ready coords, then lockFly()
         * to restore the gameplay camera.
         *
         * Typical workflow for posing a hero shot:
         *   __sdsCinema.startSolo('jep', 'extreme');
         *   await __sdsCinema.waitForFlockSize(1000);
         *   await __sdsCinema.freeFly();
         *   // ... orbit/pan/zoom in the browser ...
         *   __sdsCinema.snapshotPose();   // copy coords from console
         *   __sdsCinema.lockFly();        // restore gameplay camera
         */
        async freeFly() {
            if (cinema.freeFlyActive) {
                console.warn('[CINEMA] freeFly already active');
                return cinema._orbitControls;
            }
            const cam = cinema.camera;
            const renderer = cinema.renderer;
            if (!cam || !renderer) {
                console.error('[CINEMA] freeFly: camera or renderer not ready');
                return null;
            }
            const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
            const controls = new OrbitControls(cam, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.08;
            controls.screenSpacePanning = true;
            controls.minDistance = 1;
            controls.maxDistance = 2000;
            // Initial target = origin if not set; user pans away as needed.
            controls.target.set(0, 1, 0);
            controls.update();
            cinema._orbitControls = controls;
            cinema.freeFlyActive = true;
            // Auto-hide the React overlay so it doesn't swallow pointer events.
            cinema.hideUI();
            // Damped controls need an animation tick to feel right.
            cinema._orbitTickId = requestAnimationFrame(function tick() {
                if (!cinema.freeFlyActive) return;
                controls.update();
                cinema._orbitTickId = requestAnimationFrame(tick);
            });
            console.log('[CINEMA] freeFly ON — drag/scroll/right-drag to pose; call snapshotPose() to print coords; lockFly() to restore.');
            return controls;
        },

        /** Restore gameplay camera control. */
        lockFly() {
            if (!cinema.freeFlyActive) return;
            try { cinema._orbitControls?.dispose(); } catch {}
            cinema._orbitControls = null;
            if (cinema._orbitTickId) cancelAnimationFrame(cinema._orbitTickId);
            cinema._orbitTickId = null;
            cinema.freeFlyActive = false;
            cinema.showUI();
            console.log('[CINEMA] freeFly OFF — gameplay camera restored.');
        },

        /** Status flag — true when freeFly() is mounted; gates SceneManager.updateCamera. */
        freeFlyActive: false,

        /**
         * Print + return paste-ready { pos, target } JSON for the current
         * camera state. Target comes from OrbitControls when freeFly is
         * active; otherwise it's derived from the camera's forward vector
         * projected 30m out (good enough for setCameraPose round-trip).
         */
        snapshotPose() {
            const cam = cinema.camera;
            if (!cam) return null;
            let target;
            if (cinema._orbitControls) {
                const t = cinema._orbitControls.target;
                target = { x: round(t.x), y: round(t.y), z: round(t.z) };
            } else {
                // Project camera forward 30m as a reasonable lookAt target.
                const fwd = new THREE.Vector3();
                cam.getWorldDirection(fwd);
                target = {
                    x: round(cam.position.x + fwd.x * 30),
                    y: round(cam.position.y + fwd.y * 30),
                    z: round(cam.position.z + fwd.z * 30),
                };
            }
            const pose = {
                pos: { x: round(cam.position.x), y: round(cam.position.y), z: round(cam.position.z) },
                target,
            };
            const oneLine = `camera: { pos: { x: ${pose.pos.x}, y: ${pose.pos.y}, z: ${pose.pos.z} }, target: { x: ${pose.target.x}, y: ${pose.target.y}, z: ${pose.target.z} } },`;
            console.log('[CINEMA] snapshotPose:');
            console.log(oneLine);
            console.log(JSON.stringify(pose, null, 2));
            return pose;
        },

        /**
         * Wait until the optimized sheep system has spawned at least
         * `target` instances. Used by live-action static shots so we
         * don't capture mid-spawn-pop. At Solo Extreme = 1000 sheep,
         * spawn takes ~6-10s on desktop; chaos = 5000 takes longer.
         * Falls back to a settle delay if the sheep system isn't reachable.
         */
        async waitForFlockSize(target, timeoutMs = 30000) {
            const start = performance.now();
            while (true) {
                const count = game.gameState?.optimizedSheepSystem?.sheep?.length ?? 0;
                if (count >= target) return count;
                if (performance.now() - start > timeoutMs) {
                    throw new Error(`waitForFlockSize timeout: have ${count}, want ${target}`);
                }
                await new Promise(r => requestAnimationFrame(r));
            }
        },

        /**
         * Pose a single dog model at origin against a neutral backdrop plane.
         * Used by Phase 3 to render dog thumbnails (DogSelection PNGs).
         * Removes existing flock + dog, mounts a fresh clone of the named
         * dog's GLB, locks camera. Phase 3 acceptance: 5 dogs at 512×512.
         */
        async mountDogShowcase(dogId = 'jep') {
            const SkeletonUtils = await import('three/addons/utils/SkeletonUtils.js');
            const tb = game.terrainBuilder;
            const sm = game.sceneManager;
            if (!tb || !sm) throw new Error('mountDogShowcase: builders not ready');

            // Hide existing flock.
            if (game.gameState?.optimizedSheepSystem) {
                const inst = game.gameState.optimizedSheepSystem.instancedMesh;
                if (inst) inst.visible = false;
            }
            // Hide existing sheepdog (don't dispose — it's still owned by gameState).
            if (game.sheepdogMesh) game.sheepdogMesh.visible = false;
            // Hide structures and trees so the dog is the focal subject.
            const scene = sm.getScene();
            scene.traverse(obj => {
                if (obj.userData?._showcaseHide) obj.visible = false;
            });

            // Backdrop plane (matches manifest theme color #0c1c2c).
            if (!cinema._showcaseBackdrop) {
                const planeGeo = new THREE.PlaneGeometry(2000, 2000);
                const planeMat = new THREE.MeshBasicMaterial({ color: 0x0c1c2c, fog: false });
                const plane = new THREE.Mesh(planeGeo, planeMat);
                plane.position.set(0, -0.5, -50);
                plane.lookAt(0, -0.5, 0);
                plane.renderOrder = -1000;
                scene.add(plane);
                cinema._showcaseBackdrop = plane;
            }

            // Mount the requested dog clone at origin.
            const original = tb.models?.animals?.[dogId];
            if (!original) throw new Error(`mountDogShowcase: model not found for ${dogId}`);
            if (cinema._showcaseDog) {
                if (cinema._showcaseDog.parent) cinema._showcaseDog.parent.remove(cinema._showcaseDog);
            }
            const clone = SkeletonUtils.clone(original);
            clone.scale.set(4, 4, 4);
            clone.position.set(0, 0, 0);
            clone.rotation.y = Math.PI * 0.15; // slight 3/4 angle for portrait
            scene.add(clone);
            cinema._showcaseDog = clone;

            // Lock camera at portrait pose.
            const cam = sm.getCamera();
            cam.position.set(0, 2.4, 5.5);
            cam.lookAt(0, 1.6, 0);

            // Brighten ambient so the dog reads cleanly against the backdrop.
            if (sm.ambientLight) sm.ambientLight.intensity = 1.6;

            cinema.paused = true; // freeze sheep simulation
        },
    };

    window.__sdsCinema = cinema;
    console.log('[CINEMA] window.__sdsCinema installed (cinematic=1)');
}
