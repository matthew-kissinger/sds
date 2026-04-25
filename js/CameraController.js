import * as THREE from 'three';
import { Vector2D } from './Vector2D.js';

/**
 * Camera modes:
 *   CLASSIC - High isometric, preserves the original feel. Tracks zoom for height too.
 *   FOLLOW  - Cinematic close-up, dog framed clearly with smoothed yaw lag.
 *   FREE    - User-controlled yaw orbit (mouse/touch/gamepad), Follow's pitch retained.
 */
export const CameraMode = Object.freeze({
    CLASSIC: 'classic',
    FOLLOW: 'follow',
    FREE: 'free'
});

const MODE_ORDER = [CameraMode.CLASSIC, CameraMode.FOLLOW, CameraMode.FREE];

const FOLLOW_DISTANCE = 22;
const FOLLOW_HEIGHT = 11;
const FOLLOW_LOOK_AT_HEIGHT = 1.5;
const FOLLOW_LOOK_AHEAD = 4;
const FOLLOW_YAW_LAG_TAU = 0.35;
const FOLLOW_POS_LAG_TAU = 0.15;

const CLASSIC_LERP_PER_FRAME_AT_60 = 0.05;

const COMPETITIVE_OFFSETS = {
    north:     [ 0,    1,   -1   ],
    south:     [ 0,    1,    1   ],
    east:      [-1,    1,    0   ],
    west:      [ 1,    1,    0   ],
    southeast: [-0.7,  1,    0.7 ],
    southwest: [ 0.7,  1,    0.7 ]
};

// Rotations applied to input direction so W is "away from camera" in
// each gate orientation. (Free-mode adds an additional yaw rotation on top.)
const COMPETITIVE_INPUT_ROT = {
    north:     ([x, z]) => [x, z],
    south:     ([x, z]) => [-x, -z],
    east:      ([x, z]) => [z, -x],
    west:      ([x, z]) => [-z, x],
    southeast: ([x, z]) => [(-x - z) * 0.7071, (x - z) * 0.7071],
    southwest: ([x, z]) => [(-x + z) * 0.7071, (-x - z) * 0.7071]
};

/**
 * Frame-rate-independent exponential smoothing weight.
 *
 * `1 - exp(-dt/tau)` is the closed-form continuous version (preferred).
 * For the Classic per-frame-at-60 form we expose the equivalent
 * `1 - (1-alpha)^(dt*60)` instead.
 */
function expSmooth(dt, tau) {
    return 1 - Math.exp(-dt / tau);
}

function classicSmooth(dt, alphaAt60) {
    return 1 - Math.pow(1 - alphaAt60, dt * 60);
}

/**
 * Owns the camera's pose and behavior across all three modes.
 *
 * SceneManager keeps lifecycle (renderer, lights) and exposes thin pass-throughs
 * to delegate to a single instance of this class.
 */
export class CameraController {
    constructor(camera, { isMobile = false } = {}) {
        this.camera = camera;
        this.isMobile = isMobile;

        // Optional heightfield for camera y-clamping in Follow/Free modes.
        // Set via setHeightfield() after the scene's heightmap loads.
        // Classic mode is high enough (60m) that no clamp is needed.
        /** @type {import('../shared/terrain/Heightfield.js').Heightfield | null} */
        this.heightfield = null;
        this.minTerrainClearance = 1.5; // metres above ground in Follow/Free

        this.mode = CameraMode.CLASSIC;

        // Zoom (used by Classic; Free retains the same range; Follow ignores).
        this.minDistance = isMobile ? 35 : 20;
        this.maxDistance = 150;
        this.distance = 80;

        // Competitive gate orientation (Classic mode).
        this.competitiveDirection = null;

        // Free-mode accumulator. Initialized so W maps to the default
        // -Z look direction (i.e. "away from camera"). On entry to FREE we
        // re-seed this from whatever the previous mode was framing.
        this.freeYaw = 0;

        // Follow-mode internal state (smoothed yaw + position).
        this.followYaw = 0;
        this.followPosition = new THREE.Vector3();
        this.followInitialized = false;

        // Tunable input scales.
        this.mouseYawScale = 0.005;   // rad per pixel
        this.touchYawScale = 0.005;   // rad per pixel of two-finger pan
        this.gamepadYawScale = 2.0;   // rad/s at full deflection
        this.zoomWheelStep = 5;
        this.zoomGamepadStep = 1.5;

        // Reusable temp vectors to avoid per-frame allocation in update().
        this._tmpTarget = new THREE.Vector3();
        this._tmpOffset = new THREE.Vector3();
        this._tmpDest = new THREE.Vector3();
        this._tmpLook = new THREE.Vector3();
    }

    getMode() { return this.mode; }

    /**
     * Provide (or clear) the scene's heightfield. Used to clamp the camera
     * above terrain in Follow / Free modes and to lift the look-at point
     * to terrain height in those modes too.
     * @param {import('../shared/terrain/Heightfield.js').Heightfield | null} heightfield
     */
    setHeightfield(heightfield) {
        this.heightfield = heightfield ?? null;
    }

    setMode(mode) {
        if (mode === this.mode) return;
        if (!MODE_ORDER.includes(mode)) {
            console.warn(`[CAMERA] Unknown mode: ${mode}`);
            return;
        }

        // When switching INTO Free, seed freeYaw from the most recent yaw
        // we were rendering at so there's no jump-cut.
        if (mode === CameraMode.FREE) {
            if (this.mode === CameraMode.FOLLOW && this.followInitialized) {
                this.freeYaw = this.followYaw;
            } else if (this.mode === CameraMode.CLASSIC) {
                // Classic looks down -Z (or competitive variant) from above.
                this.freeYaw = this._classicYaw();
            }
        }

        // Re-init follow smoothing when entering Follow so we don't snap
        // through the world from a stale position.
        if (mode === CameraMode.FOLLOW) {
            this.followInitialized = false;
        }

        this.mode = mode;
    }

    cycleMode() {
        const idx = MODE_ORDER.indexOf(this.mode);
        const next = MODE_ORDER[(idx + 1) % MODE_ORDER.length];
        this.setMode(next);
        return next;
    }

    applyYawDelta(rad) {
        if (this.mode !== CameraMode.FREE || !rad) return;
        this.freeYaw += rad;
        // Keep within [-PI, PI] for numerical hygiene.
        if (this.freeYaw > Math.PI) this.freeYaw -= 2 * Math.PI;
        else if (this.freeYaw < -Math.PI) this.freeYaw += 2 * Math.PI;
    }

    setZoom(distance) {
        this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, distance));
    }

    getZoom() { return this.distance; }

    setCompetitiveDirection(direction) {
        this.competitiveDirection = direction || null;
    }

    getCompetitiveDirection() { return this.competitiveDirection; }

    /**
     * Apply mouse wheel zoom delta (deltaY in browser units).
     */
    handleWheel(deltaY) {
        const sign = Math.sign(deltaY) || 0;
        if (sign === 0) return;
        this.setZoom(this.distance + sign * this.zoomWheelStep);
    }

    /**
     * Apply gamepad zoom (called per frame from main loop).
     * `zoomIn`/`zoomOut` are booleans (current button state).
     */
    handleGamepadZoom({ zoomIn, zoomOut } = {}) {
        if (zoomIn)  this.setZoom(this.distance - this.zoomGamepadStep);
        if (zoomOut) this.setZoom(this.distance + this.zoomGamepadStep);
    }

    /**
     * Set initial camera placement when a competitive game starts. This is
     * a non-smoothed, instant snap (matches prior SceneManager behavior).
     */
    setCompetitiveCameraPosition(playerGate) {
        if (!playerGate || !playerGate.direction) {
            console.warn('[CAMERA] Invalid player gate for competitive setup');
            return;
        }

        this.competitiveDirection = playerGate.direction;
        const offset = this._classicOffset();
        this.camera.position.set(offset.x, offset.y, offset.z);
        this.camera.lookAt(0, 0, 0);
    }

    /**
     * Restore the default, non-competitive camera. Resets mode to Classic.
     */
    resetCameraToDefault() {
        this.competitiveDirection = null;
        this.mode = CameraMode.CLASSIC;
        this.followInitialized = false;
        this.camera.position.set(0, 60, -60);
        this.camera.lookAt(0, 0, 0);
    }

    /**
     * Reset camera state to defaults (mode + zoom). Used on mode-cycle reset
     * or settings reset.
     */
    reset() {
        this.mode = CameraMode.CLASSIC;
        this.distance = 80;
        this.freeYaw = 0;
        this.followInitialized = false;
        this.competitiveDirection = null;
    }

    /**
     * Drive the camera per-frame. `dogPosition` is a Vector2D (x,z); facing
     * is the dog's velocity vector (Vector2D, may be zero).
     */
    update(dogPosition, dogFacing, deltaTime = 1 / 60) {
        if (!dogPosition) return;

        switch (this.mode) {
            case CameraMode.FOLLOW:
                this._updateFollow(dogPosition, dogFacing, deltaTime);
                return;
            case CameraMode.FREE:
                this._updateFree(dogPosition, deltaTime);
                return;
            case CameraMode.CLASSIC:
            default:
                this._updateClassic(dogPosition, deltaTime);
        }
    }

    /**
     * Rotate an input movement vector into world axes for the active camera.
     * For Free mode: rotates by freeYaw so W = "away from camera".
     * For Classic + competitive: rotates by gate direction (legacy behavior).
     */
    transformMovement(direction) {
        if (!direction) return direction;

        if (this.mode === CameraMode.FREE) {
            const cos = Math.cos(this.freeYaw);
            const sin = Math.sin(this.freeYaw);
            // Free-mode camera looks toward +Z*cos + +X*sin from behind, so
            // forward (W -> +z input) needs to map to world (-sin, +cos).
            // Convention here mirrors the existing competitive transforms
            // (input z is forward, input x is right).
            return new Vector2D(
                direction.x * cos + direction.z * sin,
                -direction.x * sin + direction.z * cos
            );
        }

        if (this.competitiveDirection) {
            const fn = COMPETITIVE_INPUT_ROT[this.competitiveDirection];
            if (fn) {
                const [x, z] = fn([direction.x, direction.z]);
                return new Vector2D(x, z);
            }
        }

        return direction;
    }

    // -- internals -----------------------------------------------------------

    _updateClassic(dogPosition, deltaTime) {
        const offset = this._classicOffset(); // mutates _tmpOffset, returns it
        this._tmpTarget.set(dogPosition.x, 0, dogPosition.z);
        this._tmpDest.copy(this._tmpTarget).add(offset);
        const k = classicSmooth(deltaTime, CLASSIC_LERP_PER_FRAME_AT_60);
        this.camera.position.lerp(this._tmpDest, k);
        this.camera.lookAt(this._tmpTarget);
    }

    _updateFollow(dogPosition, dogFacing, deltaTime) {
        const facingAngle = this._facingAngle(dogFacing);
        const speed = dogFacing ? Math.hypot(dogFacing.x, dogFacing.z) : 0;
        // ~30 is the dog's max sprint speed; clamp so look-ahead saturates.
        const speedNorm = Math.min(1, speed / 30);

        // Lift the rig by terrain elevation under the dog so we don't dive
        // through hills. Uses sample at dog position (not at the offset
        // camera position) so the camera tracks the dog's elevation rather
        // than chasing terrain bumps behind the dog.
        const dogTerrainY = this.heightfield
            ? this.heightfield.sample(dogPosition.x, dogPosition.z)
            : 0;

        if (!this.followInitialized) {
            this.followYaw = facingAngle;
            this.followPosition.set(dogPosition.x, dogTerrainY + FOLLOW_HEIGHT, dogPosition.z);
            this.followInitialized = true;
        } else {
            const yawK = expSmooth(deltaTime, FOLLOW_YAW_LAG_TAU);
            this.followYaw = lerpAngle(this.followYaw, facingAngle, yawK);
        }

        // Camera sits behind the dog (opposite the facing dir).
        const camOffsetX = -Math.sin(this.followYaw) * FOLLOW_DISTANCE;
        const camOffsetZ = -Math.cos(this.followYaw) * FOLLOW_DISTANCE;
        this._tmpTarget.set(
            dogPosition.x + camOffsetX,
            dogTerrainY + FOLLOW_HEIGHT,
            dogPosition.z + camOffsetZ
        );

        const posK = expSmooth(deltaTime, FOLLOW_POS_LAG_TAU);
        this.followPosition.lerp(this._tmpTarget, posK);

        // Hard clamp to terrain at the camera's actual XZ so dipping into a
        // valley behind the dog still leaves a buffer above the ground.
        if (this.heightfield) {
            const camGroundY = this.heightfield.sample(
                this.followPosition.x,
                this.followPosition.z
            );
            const minY = camGroundY + this.minTerrainClearance;
            if (this.followPosition.y < minY) this.followPosition.y = minY;
        }

        this.camera.position.copy(this.followPosition);

        const lookAheadX = Math.sin(facingAngle) * FOLLOW_LOOK_AHEAD * speedNorm;
        const lookAheadZ = Math.cos(facingAngle) * FOLLOW_LOOK_AHEAD * speedNorm;
        this._tmpLook.set(
            dogPosition.x + lookAheadX,
            dogTerrainY + FOLLOW_LOOK_AT_HEIGHT,
            dogPosition.z + lookAheadZ
        );
        this.camera.lookAt(this._tmpLook);
    }

    _updateFree(dogPosition, _deltaTime) {
        // Same pitch as Follow (height/distance), but yaw is user-controlled.
        const dogTerrainY = this.heightfield
            ? this.heightfield.sample(dogPosition.x, dogPosition.z)
            : 0;

        const camOffsetX = -Math.sin(this.freeYaw) * FOLLOW_DISTANCE;
        const camOffsetZ = -Math.cos(this.freeYaw) * FOLLOW_DISTANCE;
        let camY = dogTerrainY + FOLLOW_HEIGHT;
        const camX = dogPosition.x + camOffsetX;
        const camZ = dogPosition.z + camOffsetZ;
        if (this.heightfield) {
            const camGroundY = this.heightfield.sample(camX, camZ);
            const minY = camGroundY + this.minTerrainClearance;
            if (camY < minY) camY = minY;
        }
        this.camera.position.set(camX, camY, camZ);
        this._tmpLook.set(dogPosition.x, dogTerrainY + FOLLOW_LOOK_AT_HEIGHT, dogPosition.z);
        this.camera.lookAt(this._tmpLook);
    }

    _classicOffset() {
        if (this.competitiveDirection && COMPETITIVE_OFFSETS[this.competitiveDirection]) {
            const [sx, sy, sz] = COMPETITIVE_OFFSETS[this.competitiveDirection];
            const d = this.distance;
            this._tmpOffset.set(sx * d, sy * d, sz * d);
            return this._tmpOffset;
        }
        // Default solo/coop offset.
        this._tmpOffset.set(0, this.distance, -this.distance);
        return this._tmpOffset;
    }

    _classicYaw() {
        if (!this.competitiveDirection) return 0; // looking down -Z
        switch (this.competitiveDirection) {
            case 'north':     return 0;
            case 'south':     return Math.PI;
            case 'east':      return Math.PI / 2;
            case 'west':      return -Math.PI / 2;
            case 'southeast': return Math.PI * 0.75;
            case 'southwest': return -Math.PI * 0.75;
            default:          return 0;
        }
    }

    _facingAngle(facing) {
        if (!facing) return this.followYaw;
        const mag = Math.hypot(facing.x, facing.z);
        if (mag < 0.1) return this.followYaw; // keep last angle when idle
        return Math.atan2(facing.x, facing.z);
    }
}

/**
 * Shortest-path angle lerp (handles wrap-around at PI).
 */
function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return a + diff * t;
}
