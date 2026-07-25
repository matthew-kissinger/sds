// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
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
// Cycle 17 Phase 7: URL-param helpers moved to ./cinematic-url.js so main.js
// can import them without pulling three.js into the main bundle. Re-exported
// here for any legacy import paths.
export { isCinematicMode, isUiHidden, getRequestedSun } from './cinematic-url.js';

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
    const sampleTimedPath = (sorted, tMs) => {
        let a = sorted[0];
        let b = sorted[sorted.length - 1];
        for (let i = 0; i < sorted.length - 1; i++) {
            if (tMs >= sorted[i].t && tMs <= sorted[i + 1].t) {
                a = sorted[i];
                b = sorted[i + 1];
                break;
            }
        }
        const span = Math.max(1, (b.t ?? 0) - (a.t ?? 0));
        const k = Math.max(0, Math.min(1, (tMs - (a.t ?? 0)) / span));
        const sk = k * k * (3 - 2 * k);
        return {
            x: a.x + (b.x - a.x) * sk,
            z: a.z + (b.z - a.z) * sk,
        };
    };

    const cinema = {
        // Direct refs (looked up lazily so a future scene swap doesn't strand them).
        get camera() { return game.sceneManager?.getCamera() ?? null; },
        get atmosphere() { return game.atmosphere ?? null; },
        get gameState() { return game.gameState ?? null; },
        get scene() { return game.sceneManager?.getScene() ?? null; },
        get renderer() { return game.sceneManager?.getRenderer() ?? null; },

        // Convenience helpers.
        // Cycle 112 Phase 8: flips the document-level switch rather than
        // hiding #react-overlay directly. The old version left the five chips
        // that mount to document.body (day/night, survival summary, minimap,
        // skip-to-dusk, stats) rendering into every capture. See the
        // [data-sds-ui="hidden"] rule in css/main.css for why this is CSS.
        hideUI() {
            document.documentElement.dataset.sdsUi = 'hidden';
            cinema.hideWorldMarkers();
        },
        showUI() {
            delete document.documentElement.dataset.sdsUi;
            cinema.showWorldMarkers();
        },
        hideWorldMarkers() {
            for (const dog of cinema.getDogs()) {
                if (dog?.distanceIndicator) dog.distanceIndicator.visible = false;
            }
        },
        showWorldMarkers() {
            for (const dog of cinema.getDogs()) {
                if (dog?.distanceIndicator) dog.distanceIndicator.visible = true;
            }
        },
        mountMenuDog() {
            const dog = game.gameState?.getSheepdog?.() ?? game.sheepdog;
            const mesh = dog?.mesh ?? game.sheepdogMesh;
            if (!dog || !mesh) return false;
            if (!mesh.parent) game.sceneManager?.add?.(mesh);
            cinema.hideWorldMarkers();
            return true;
        },
        tickMenuHerding(deltaTime = 1 / 60) {
            const dog = game.gameState?.getSheepdog?.() ?? game.sheepdog;
            const sheepSystem = game.gameState?.optimizedSheepSystem;
            if (!dog || !sheepSystem?.update) return false;
            sheepSystem.update(
                deltaTime,
                dog,
                null,
                null,
                game.gameState?.getBoundary?.(),
                game.gameState?.params,
                false,
                false,
                null,
            );
            return true;
        },
        getDogs() {
            const dogs = [
                game.sheepdog,
                game.sheepdog2,
                game.gameState?.getSheepdog?.(),
            ].filter(Boolean);
            return [...new Set(dogs)];
        },
        setSun(t) {
            const atm = game.atmosphere;
            if (!atm) return;
            // Prefer setTimeOfDay: it re-bakes the sky immediately, so a paused
            // capture (cinema.paused short-circuits the game/atmosphere update
            // loop) still reflects the requested time instead of freezing the
            // dome at the pre-pause state.
            if (typeof atm.setTimeOfDay === 'function') {
                atm.setTimeOfDay(t);
            } else if (typeof atm.dayNight?.setT === 'function') {
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
        setCameraMode(mode = 'follow') {
            game.sceneManager?.getCameraController?.()?.setMode?.(mode);
        },
        setCameraZoom(distance) {
            game.sceneManager?.getCameraController?.()?.setZoom?.(distance);
        },
        resetFollowCamera() {
            const controller = game.sceneManager?.getCameraController?.();
            if (!controller) return false;
            controller.setMode?.('follow');
            controller.followInitialized = false;
            controller.smoothedFloorY = -Infinity;
            return true;
        },
        updateFollowCamera(deltaTime = 1 / 60, zoom = null) {
            const dog = game.gameState?.getSheepdog?.();
            if (!dog) return false;
            cinema.freeFlyActive = false;
            const controller = game.sceneManager?.getCameraController?.();
            controller?.setMode?.('follow');
            if (Number.isFinite(zoom)) controller?.setZoom?.(zoom);
            game.sceneManager?.updateCamera?.(dog, deltaTime);
            return true;
        },
        getTerrainY(x, z) {
            const hf = game.heightfield;
            if (!hf) return 0;
            if (typeof hf.surfaceY === 'function') return hf.surfaceY(x, z);
            if (typeof hf.sample === 'function') return hf.sample(x, z);
            return 0;
        },
        setDogTrackCamera(opts = {}) {
            const dog = game.gameState?.getSheepdog?.();
            if (!dog) return false;
            const vx = dog.velocity?.x ?? 0;
            const vz = dog.velocity?.z ?? 0;
            const speed = Math.hypot(vx, vz);
            const fallbackYaw = dog.currentRotation ?? 0;
            const forward = speed > 0.01
                ? { x: vx / speed, z: vz / speed }
                : { x: Math.sin(fallbackYaw), z: Math.cos(fallbackYaw) };
            const right = { x: forward.z, z: -forward.x };
            const side = opts.side ?? -11;
            const back = opts.back ?? 10;
            const height = opts.height ?? 5.25;
            const lookAhead = opts.lookAhead ?? 6;
            const lookHeight = opts.lookHeight ?? 1.6;
            const camX = dog.position.x - forward.x * back + right.x * side;
            const camZ = dog.position.z - forward.z * back + right.z * side;
            const dogY = cinema.getTerrainY(dog.position.x, dog.position.z);
            const camGroundY = cinema.getTerrainY(camX, camZ);
            const camY = Math.max(camGroundY + 1.5, dogY + height);
            cinema.freeFlyActive = true;
            cinema.setCameraPose(
                { x: camX, y: camY, z: camZ },
                {
                    x: dog.position.x + forward.x * lookAhead,
                    y: dogY + lookHeight,
                    z: dog.position.z + forward.z * lookAhead,
                },
            );
            return true;
        },
        renderFrame() {
            if (cinema.renderer && cinema.scene && cinema.camera) {
                // Keep the atmosphere centered on the cinematic camera before we
                // paint. The gameplay loop does this inside this.update(), which
                // cinema.paused short-circuits; without it the 500-unit Hosek sky
                // dome strands at the spawn while the cinematic camera flies the
                // island, so most of the frame falls through to the clear color.
                cinema.syncAtmosphereToCamera();
                cinema.renderer.render(cinema.scene, cinema.camera);
                return true;
            }
            return false;
        },

        /**
         * Re-center the sky dome (and cloud/fog ground anchor) on the current
         * cinematic camera. Safe to call every frame of a moving shot.
         */
        syncAtmosphereToCamera() {
            const atm = cinema.atmosphere;
            const cam = cinema.camera;
            if (!atm || !cam) return false;
            atm.syncCamera?.(cam.position);
            if (typeof atm.setTerrainYAtCamera === 'function') {
                atm.setTerrainYAtCamera(cinema.getTerrainY(cam.position.x, cam.position.z));
            }
            return true;
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

        poseDog(x, z, velocity = { x: 0, z: 0 }, deltaTime = 0.016) {
            const dog = game.gameState?.getSheepdog?.();
            if (!dog) return false;
            dog.position.x = x;
            dog.position.z = z;
            dog.velocity.x = velocity.x ?? 0;
            dog.velocity.z = velocity.z ?? 0;
            dog.targetVelocity.x = dog.velocity.x;
            dog.targetVelocity.z = dog.velocity.z;

            const speed = Math.hypot(dog.velocity.x, dog.velocity.z);
            if (speed > 0.01) {
                const velocityAngle = Math.atan2(dog.velocity.z, dog.velocity.x);
                dog.currentRotation = -velocityAngle + Math.PI / 2;
                dog.targetRotation = dog.currentRotation;
                dog.isMoving = true;
            } else {
                dog.isMoving = false;
            }

            if (dog.mesh) {
                dog.mesh.position.x = dog.position.x;
                dog.mesh.position.z = dog.position.z;
                if (dog.heightfield) {
                    dog.mesh.position.y = dog.heightfield.surfaceY(dog.position.x, dog.position.z);
                }
                dog.mesh.rotation.y = dog.currentRotation;
                dog.updateTerrainTilt?.(deltaTime);
                dog.updateAnimationSystem?.(deltaTime);
            }
            return true;
        },

        poseDogOnPath(keyframes, tMs, deltaTime = 0.016) {
            if (!Array.isArray(keyframes) || keyframes.length < 1) return false;
            const sorted = [...keyframes].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
            const totalMs = Math.max(1, sorted[sorted.length - 1].t ?? 1);
            const clamped = Math.max(0, Math.min(totalMs, tMs));
            const pos = sampleTimedPath(sorted, clamped);
            const windowMs = Math.max(80, Math.min(180, totalMs * 0.025));
            const prevT = Math.max(0, clamped - windowMs);
            const nextT = Math.min(totalMs, clamped + windowMs);
            const prev = sampleTimedPath(sorted, prevT);
            const next = sampleTimedPath(sorted, nextT);
            const seconds = Math.max(0.001, (nextT - prevT) / 1000);
            return cinema.poseDog(
                pos.x,
                pos.z,
                { x: (next.x - prev.x) / seconds, z: (next.z - prev.z) / seconds },
                deltaTime,
            );
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

        /**
         * LOD/cull focus override. Grass density, tree LOD, and the compute
         * cull normally center on the dog (runFrame's playerPosition); a
         * flyover or orbital shot that leaves the dog behind gets wrong
         * culling in frame. Set this to a Vector3 (typically
         * `cinema.camera.position`, which tracks the posed camera by
         * reference) to center LOD on the lens instead; null restores the
         * gameplay behavior.
         */
        lodFocus: null,

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

            // Mount the requested dog clone at origin. Dogs other than jep
            // load on demand now, so ensure the rig is present first.
            await tb.loadAnimal?.(dogId);
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
