// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Wolf - Quaternius "Ultimate Animated Animals" wolf (CC0), loader + animation
// state machine. ASSET-ONLY as of Cycle 61: this class is NOT wired into any
// game mode. It exists so a future predator-bearing mode can drop a ready,
// already-rigged wolf in. See docs/wolf-asset.md for the source, license, the
// clip-name-to-state mapping, and the future bark-repel design intent.
//
// Structure mirrors js/Sheepdog.js (GLTF load + SkeletonUtils.clone + a small
// speed-driven state machine with hysteresis), but the Quaternius rig is NOT
// the PolyArt dog rig, so the clip names and state set are the wolf's own. The
// dog blends Walk -> Trot -> Run -> RunFast; the wolf rig ships only Walk and a
// Gallop (no separate Run/Trot), so the gait blend here is Walk -> Gallop.
//
// Coupling note: unlike Sheepdog (which reads its rig from TerrainBuilder via
// GameBridge), Wolf is deliberately self-contained. It takes a pre-loaded glTF
// (scene + animations) so it imports nothing from the live game (no GameBridge,
// no TerrainBuilder, no sim). The static Wolf.load() helper builds its own
// Draco+meshopt GLTFLoader for the harness. Keeping it decoupled means the
// future mode can decide how the wolf gets its rig (shared registry, its own
// load) without this class assuming a game is running.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** Default runtime GLB path (Draco+meshopt compressed, produced by scripts/compress-glbs.mjs). */
export const WOLF_MODEL_PATH = 'assets/models/Wolf.glb';

// Same Google-hosted Draco decoder the rest of the codebase uses
// (see js/TerrainBuilder.js configureGLTFLoader). The wolf GLB is Draco +
// meshopt + KHR_mesh_quantization, identical to the dog rigs, so both decoders
// must be attached or the GLB fails to parse.
const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/v1/decoders/';

/**
 * Animation states for the Quaternius wolf rig.
 *
 * The rig ships 12 unique clips (each also present with an "AnimalArmature|"
 * prefix - an FBX2glTF export artifact; we register both names, so either
 * resolves). Mapping to a dog-style state machine:
 *
 *   IDLE   -> Idle, Idle_2, Idle_2_HeadLow   (cycled, like the dog's Idle_1..7)
 *   WALK   -> Walk
 *   RUN    -> Gallop                          (no separate Run clip on this rig)
 *   ATTACK -> Attack                          (one-shot, then back to IDLE)
 *   DEATH  -> Death                           (one-shot, clamps on the last frame)
 *
 * Unused-by-default clips the future mode may want: Gallop_Jump, Jump_ToIdle,
 * Eating, Idle_HitReact_Left, Idle_HitReact_Right. They are loaded into the
 * action map (every clip is) but no state references them yet.
 *
 * transitionTime / duration are in seconds. duration is only meaningful for the
 * one-shot states (ATTACK, DEATH) and roughly matches the clip length so the
 * machine knows when a one-shot is done.
 */
export const WOLF_ANIMATION_STATES = {
    IDLE: {
        animations: ['Idle', 'Idle_2', 'Idle_2_HeadLow'],
        loop: true,
        transitionTime: 0.4,
    },
    WALK: {
        animations: ['Walk'],
        loop: true,
        transitionTime: 0.3,
    },
    RUN: {
        animations: ['Gallop'],
        loop: true,
        transitionTime: 0.2,
    },
    ATTACK: {
        animations: ['Attack'],
        loop: false,
        transitionTime: 0.12,
        duration: 1.333,
    },
    DEATH: {
        animations: ['Death'],
        loop: false,
        transitionTime: 0.2,
        duration: 1.042,
    },
};

/**
 * Speed thresholds (units/sec) for the gait state machine, scaled to the same
 * world units the dog moves in. Below WALK -> IDLE; WALK -> Gallop(RUN) at RUN.
 * Mirrors the dog's SPEED_THRESHOLDS shape, collapsed to the two gaits the wolf
 * rig actually has.
 */
export const WOLF_SPEED_THRESHOLDS = {
    IDLE: 0.1,
    WALK: 4.0,
    RUN: 11.0,
};

/** Hysteresis margin (units/sec) so the gait does not flip-flop at a boundary. */
const WOLF_SPEED_HYSTERESIS = 1.0;

/**
 * "Ideal" speed (units/sec) each gait clip was authored for. Used to scale the
 * mixer action timeScale so the legs visually match the body's actual speed
 * (same trick as the dog's SPEED_STATE_MAX): a wolf cruising at the low edge of
 * Gallop should not churn its legs at 1x. Non-gait states (IDLE, ATTACK, DEATH)
 * are omitted so they play at authored 1x.
 */
const WOLF_SPEED_STATE_MAX = {
    WALK: 4.0,
    RUN: 14.0,
};

/** Idle variation re-roll window (ms), matching the dog's 3-7s cadence. */
const IDLE_VARIATION_MIN_MS = 3000;
const IDLE_VARIATION_SPAN_MS = 4000;

let _sharedWolfDracoLoader = null;

/**
 * Build (once) a Draco loader for the harness's GLTFLoader. Kept local to this
 * module so the wolf has no import dependency on TerrainBuilder; the decoder
 * path is the same Google CDN the rest of the app uses.
 */
function getWolfDracoLoader() {
    if (!_sharedWolfDracoLoader) {
        _sharedWolfDracoLoader = new DRACOLoader();
        _sharedWolfDracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    }
    return _sharedWolfDracoLoader;
}

/**
 * Wolf - render-only animated entity. Construct with a pre-loaded glTF
 * (`{ scene, animations }`) returned by GLTFLoader; call update(dt) each frame
 * and drive it with setSpeed() (for the gait blend) or the one-shot triggers.
 */
export class Wolf {
    /**
     * @param {{ scene: THREE.Object3D, animations: THREE.AnimationClip[] }} gltf
     *        A loaded glTF (use Wolf.load() or any configured GLTFLoader).
     * @param {object} [opts]
     * @param {number} [opts.scale]   Uniform scale override. Omit to auto-fit so
     *        the wolf stands a sensible height in world units (the raw rig is
     *        ~0.055 model-units tall, so a fit is required to read at game scale).
     * @param {number} [opts.targetHeight=1.1]  Desired world height in metres
     *        when auto-fitting (a wolf is a touch taller than the ~1m dog read).
     */
    constructor(gltf, opts = {}) {
        if (!gltf || !gltf.scene) {
            throw new Error('[WOLF] Wolf requires a loaded glTF with a .scene');
        }

        this.mesh = new THREE.Group();
        // YXZ so yaw applies first (world Y), then any future terrain pitch/roll
        // on local axes - same convention as the dog.
        this.mesh.rotation.order = 'YXZ';

        // Clone via SkeletonUtils so the skinned mesh + skeleton animate
        // independently of the source glTF (identical to Sheepdog).
        this.model = SkeletonUtils.clone(gltf.scene);

        // Normalize scale. The Quaternius export is tiny in model units; fit to
        // a target world height unless the caller pins an explicit scale.
        if (typeof opts.scale === 'number') {
            this.model.scale.setScalar(opts.scale);
        } else {
            const targetHeight = opts.targetHeight ?? 1.1;
            // Fit to the posed SKELETON extent, NOT Box3.setFromObject. The
            // FBX2glTF export gives the skinned-mesh geometry a ~500-unit bind
            // box (a unit-conversion artifact), while the bones that actually
            // drive the rendered wolf sit at ~6 native units. A geometry-box fit
            // therefore divides by ~500 and collapses the visible wolf to ~1cm.
            // Bone world positions carry every nested node scale, so their extent
            // is the true rendered size (here ~6 units -> scale ~0.18 -> ~1.1m).
            this.model.updateWorldMatrix(true, true);
            const box = new THREE.Box3();
            const p = new THREE.Vector3();
            let anyBone = false;
            this.model.traverse((child) => {
                if (child.isBone) { child.getWorldPosition(p); box.expandByPoint(p); anyBone = true; }
            });
            if (!anyBone) box.setFromObject(this.model); // boneless fallback
            const size = box.getSize(new THREE.Vector3());
            const largest = Math.max(size.x, size.y, size.z, 1e-6);
            this.model.scale.setScalar(targetHeight / largest);
        }
        this.model.position.set(0, 0, 0);

        this.model.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const m of mats) {
                if (!m) continue;
                m.fog = true;
                // The Quaternius export ships metalness 0.4 (an FBX2glTF default).
                // The game scene has no environment map, so a metallic surface
                // with nothing to reflect renders flat and ~40% too dark. The dog
                // rigs are metalness 0; match them so the wolf reads correctly in
                // real scene lighting (and the harness) without needing IBL. Its
                // colour is four flat baseColorFactors (textureless), shown
                // faithfully at metalness 0.
                m.metalness = 0;
            }
        });
        this.mesh.add(this.model);

        // Animation system (shape mirrors Sheepdog.animationSystem).
        this.mixer = new THREE.AnimationMixer(this.model);
        /** @type {Map<string, THREE.AnimationAction>} */
        this.actions = new Map();
        this.currentState = 'IDLE';
        this.currentAction = null;
        this.stateTimer = 0;
        this.idleVariationTimer = 0;
        this.idleVariationIndex = 0;
        // While a one-shot (ATTACK/DEATH) is playing, the gait machine is
        // suspended until oneShotTimer elapses (DEATH latches forever).
        this.oneShotTimer = 0;
        this.isDead = false;

        // Current scripted/driving speed (units/sec), set via setSpeed().
        this.speed = 0;

        this._registerClips(gltf.animations || []);
        this.transitionToState('IDLE');
    }

    /**
     * Load the wolf GLB and return a ready Wolf instance. Self-contained: builds
     * its own Draco+meshopt-configured GLTFLoader so the harness needs nothing
     * from the running game.
     * @param {string} [url=WOLF_MODEL_PATH]
     * @param {object} [opts]  Forwarded to the Wolf constructor.
     * @returns {Promise<Wolf>}
     */
    static async load(url = WOLF_MODEL_PATH, opts = {}) {
        const loader = new GLTFLoader();
        loader.setDRACOLoader(getWolfDracoLoader());
        loader.setMeshoptDecoder(MeshoptDecoder);
        const gltf = await loader.loadAsync(url);
        return new Wolf(gltf, opts);
    }

    /**
     * Register every clip in the glTF as a mixer action, keyed by clip name.
     * The rig double-lists each clip (bare + "AnimalArmature|" prefixed); we
     * store both so resolveClip() finds a match regardless of which name a
     * state references.
     */
    _registerClips(animations) {
        for (const clip of animations) {
            this.actions.set(clip.name, this.mixer.clipAction(clip));
        }
    }

    /**
     * Resolve a logical clip name (e.g. "Idle", "Gallop") to a registered
     * action, tolerating the "AnimalArmature|" prefix variant.
     * @param {string} name
     * @returns {THREE.AnimationAction | null}
     */
    resolveClip(name) {
        return (
            this.actions.get(name) ||
            this.actions.get(`AnimalArmature|${name}`) ||
            null
        );
    }

    /**
     * Pick the clip name for a state. IDLE cycles its variation list; other
     * states use the first (and usually only) entry.
     */
    getAnimationForState(state) {
        const cfg = WOLF_ANIMATION_STATES[state];
        if (!cfg) return null;
        if (state === 'IDLE') {
            return cfg.animations[this.idleVariationIndex % cfg.animations.length];
        }
        return cfg.animations[0];
    }

    /**
     * Drive the gait blend. Pass the wolf's current planar speed (units/sec);
     * the state machine maps it to IDLE / WALK / RUN with hysteresis. No-op
     * while a one-shot is playing or the wolf is dead.
     * @param {number} speed
     */
    setSpeed(speed) {
        this.speed = Math.max(0, speed || 0);
    }

    /**
     * Determine the gait state from the current speed, applying hysteresis so
     * the state does not oscillate at a boundary. Mirrors the dog's
     * determineAnimationState shape, collapsed to IDLE/WALK/RUN.
     */
    determineGaitState() {
        const speed = this.speed;
        const h = WOLF_SPEED_HYSTERESIS;
        const current = this.currentState;

        if (speed < WOLF_SPEED_THRESHOLDS.IDLE) return 'IDLE';

        // Two gaits: WALK band is [IDLE, RUN); RUN above that.
        // Climbing WALK -> RUN needs +h; dropping RUN -> WALK needs -h.
        if (current === 'WALK') {
            return speed >= WOLF_SPEED_THRESHOLDS.RUN + h ? 'RUN' : 'WALK';
        }
        if (current === 'RUN') {
            return speed < WOLF_SPEED_THRESHOLDS.RUN - h ? 'WALK' : 'RUN';
        }
        // Coming from IDLE / one-shot: enter at the raw threshold (no bias).
        return speed < WOLF_SPEED_THRESHOLDS.RUN ? 'WALK' : 'RUN';
    }

    /**
     * Play the Attack clip once, then fall back to the gait machine. Ignored if
     * the wolf is dead or already mid-one-shot.
     */
    triggerAttack() {
        if (this.isDead || this.oneShotTimer > 0) return;
        this.oneShotTimer = WOLF_ANIMATION_STATES.ATTACK.duration;
        this.transitionToState('ATTACK');
    }

    /**
     * Play the Death clip once and latch into the dead state (clamps on the last
     * frame; the gait machine stays suspended). Call reset()/respawn logic in a
     * future mode to revive; this asset-only class just stops here.
     */
    triggerDeath() {
        if (this.isDead) return;
        this.isDead = true;
        this.oneShotTimer = Infinity;
        this.transitionToState('DEATH');
    }

    /**
     * Transition the mixer to `newState`, cross-fading from the current action.
     * One-shot states (loop:false) clamp on their last frame.
     */
    transitionToState(newState) {
        const cfg = WOLF_ANIMATION_STATES[newState];
        if (!cfg) {
            console.warn(`[WOLF] Unknown state: ${newState}`);
            return;
        }
        const animName = this.getAnimationForState(newState);
        const nextAction = animName ? this.resolveClip(animName) : null;
        if (!nextAction) {
            console.warn(`[WOLF] No action for state ${newState} (clip "${animName}")`);
            return;
        }

        const transitionTime = cfg.transitionTime ?? 0.25;

        if (cfg.loop) {
            nextAction.setLoop(THREE.LoopRepeat, Infinity);
            nextAction.clampWhenFinished = false;
        } else {
            nextAction.setLoop(THREE.LoopOnce, 1);
            nextAction.clampWhenFinished = true;
        }

        if (this.currentAction && this.currentAction !== nextAction) {
            this.currentAction.fadeOut(transitionTime);
        }
        nextAction.reset().fadeIn(transitionTime).play();

        this.currentState = newState;
        this.currentAction = nextAction;
        this.stateTimer = 0;

        if (newState === 'IDLE') {
            this.idleVariationTimer = IDLE_VARIATION_MIN_MS + Math.random() * IDLE_VARIATION_SPAN_MS;
        }
    }

    /** Advance to the next idle variation clip and re-roll the timer. */
    cycleIdleAnimation() {
        const list = WOLF_ANIMATION_STATES.IDLE.animations;
        this.idleVariationIndex = (this.idleVariationIndex + 1) % list.length;
        this.idleVariationTimer = IDLE_VARIATION_MIN_MS + Math.random() * IDLE_VARIATION_SPAN_MS;
        this.transitionToState('IDLE');
    }

    /**
     * Per-frame update. Advances the mixer, scales gait clip playback to body
     * speed, cycles idle variations, expires one-shots, and runs the gait state
     * machine when not mid-one-shot.
     * @param {number} deltaTime  seconds
     */
    update(deltaTime) {
        if (!this.mixer) return;
        this.mixer.update(deltaTime);
        this.stateTimer += deltaTime * 1000;

        // Scale gait clip playback to body speed (legs match ground speed).
        if (this.currentAction) {
            const stateMax = WOLF_SPEED_STATE_MAX[this.currentState];
            if (stateMax && stateMax > 0) {
                this.currentAction.timeScale = THREE.MathUtils.clamp(this.speed / stateMax, 0.5, 1.5);
            } else {
                this.currentAction.timeScale = 1.0;
            }
        }

        // One-shot countdown. DEATH latches (Infinity) and never returns to gait.
        if (this.oneShotTimer > 0 && this.oneShotTimer !== Infinity) {
            this.oneShotTimer -= deltaTime;
            if (this.oneShotTimer <= 0) {
                this.oneShotTimer = 0;
            }
        }
        if (this.oneShotTimer > 0 || this.isDead) {
            return; // suspend the gait machine while a one-shot owns the rig
        }

        // Idle variation cycling.
        if (this.currentState === 'IDLE') {
            this.idleVariationTimer -= deltaTime * 1000;
            if (this.idleVariationTimer <= 0) {
                this.cycleIdleAnimation();
                return;
            }
        }

        // Gait state machine.
        const target = this.determineGaitState();
        if (target !== this.currentState) {
            this.transitionToState(target);
        }
    }

    /** The Object3D to add to a scene. */
    getObject3D() {
        return this.mesh;
    }

    /**
     * Position the wolf in world space (x, z planar; y vertical). Convenience for
     * the harness / a future mode; the wolf does no terrain sampling itself.
     */
    setPosition(x, y, z) {
        this.mesh.position.set(x, y, z);
    }

    /** Yaw the wolf (radians) about world Y. */
    setRotationY(yaw) {
        this.mesh.rotation.y = yaw;
    }

    /** Dispose geometry + materials. Call when removing the wolf from a scene. */
    dispose() {
        this.mixer?.stopAllAction();
        this.model?.traverse((child) => {
            if (!child.isMesh) return;
            child.geometry?.dispose?.();
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => m?.dispose?.());
        });
        this.mesh.parent?.remove(this.mesh);
    }
}
