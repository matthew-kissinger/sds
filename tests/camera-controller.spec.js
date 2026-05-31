// @vitest-environment jsdom
//
// Characterization tests for js/CameraController.js — they lock the CURRENT
// behavior of the camera rig across its three modes. Read-only: nothing here
// edits source. Values are derived from the real module constants
// (FOLLOW_HEIGHT = 11, FOLLOW_DISTANCE = 22, FOLLOW_LOOK_AT_HEIGHT = 1.5,
// minTerrainClearance = 1.5) and the per-mode zoom tables.
//
// The heightfield is duck-typed: CameraController only ever calls
// `heightfield.sample(x, z)`, so the stub mirrors the minimal-surface style of
// tests/optimized-sheep-heightfield.spec.js (an object literal with the one
// method the system under test actually uses).
//
// jsdom is selected via the docblock above so `localStorage` exists (the
// default vitest environment for this repo is node). Per-mode zoom persistence
// reads/writes `sds.cameraZoom.<mode>` keys.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { CameraController, CameraMode } from '../js/CameraController.js';
import { Vector2D } from '../shared/Vector2D.js';

// Module constants, re-stated here so the test is self-documenting. These
// MUST match js/CameraController.js; if the source changes them, these tests
// are the tripwire.
const FOLLOW_HEIGHT = 11;
const FOLLOW_DISTANCE = 22;
const FOLLOW_LOOK_AT_HEIGHT = 1.5;
const CLEARANCE = 1.5; // CameraController.minTerrainClearance default

function makeCamera() {
    // A real PerspectiveCamera so camera.lookAt / matrixWorld behave normally.
    return new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 2000);
}

/**
 * Duck-typed heightfield stub. `fn(x, z) -> Y` is the only contract the
 * controller depends on. Mirrors the literal-stub idiom used by the optimized
 * sheep heightfield spec.
 */
function heightfieldStub(fn) {
    return { sample: (x, z) => fn(x, z) };
}

const atDog = (x, z) => Math.abs(x) < 1e-6 && Math.abs(z) < 1e-6;

beforeEach(() => {
    // Each test starts from a clean persistence slate so constructor zoom-reads
    // are deterministic.
    localStorage.clear();
});

afterEach(() => {
    localStorage.clear();
});

describe('CameraController construction defaults', () => {
    it('boots in FOLLOW mode with the legacy distance default of 80', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });
        // Default boot mode is Follow (Cycle 21 Phase 5).
        expect(c.getMode()).toBe(CameraMode.FOLLOW);
        // The constructor seeds the legacy `distance` field to 80 regardless of
        // mode; the per-mode follow zoom (22) is only applied on an actual
        // setMode transition, not at construction.
        expect(c.getZoom()).toBe(80);
    });
});

describe('FOLLOW mode terrain clamps', () => {
    it('lifts camera.y above a midpoint ridge by at least the clearance', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });
        // Tall ridge only in the z-band between the settled camera (z ~ -80,
        // since the boot distance is 80 and facing is +Z) and the dog at the
        // origin. Dog ground and camera ground are both 0, so the only thing
        // that can lift the camera is the ridge-along-the-sightline clamp
        // (_sampleMaxTerrainAlong), not the camera-ground clamp.
        const RIDGE = 60; // taller than the natural rig height (~40) so it bites
        c.setHeightfield(
            heightfieldStub((x, z) => (z < -20 && z > -60 ? RIDGE : 0))
        );

        // Settle the smoothed follow rig so the camera reaches full distance and
        // the midpoint sample lands inside the ridge band.
        for (let i = 0; i < 600; i++) {
            c.update(new Vector2D(0, 0), new Vector2D(0, 1), 1 / 60);
        }

        const floor = RIDGE + CLEARANCE;
        // Guarantee: never below the ridge floor.
        expect(c.camera.position.y).toBeGreaterThanOrEqual(floor - 1e-6);
        // Pinned exactly to the ridge floor (the natural rig height ~40 is well
        // below 61.5, so the clamp is the binding constraint).
        expect(c.camera.position.y).toBeCloseTo(floor, 4);
        // And it is the *sightline* clamp doing the lifting, not the camera's
        // own ground (whose floor would be only 0 + 1.5 = 1.5).
        expect(c.camera.position.y).toBeGreaterThan(0 + CLEARANCE + 1);
    });

    it('first frame pins camera.y to ridge+clearance when the rig would sit lower', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });
        // Ridge everywhere except directly under the dog. On the very first
        // frame the smoothed rig has only eased a fraction toward its target,
        // so it sits below the ridge floor and gets snapped up to it.
        const RIDGE = 30;
        const DOG_Y = 5;
        c.setHeightfield(
            heightfieldStub((x, z) => (atDog(x, z) ? DOG_Y : RIDGE))
        );

        c.update(new Vector2D(0, 0), new Vector2D(0, 1), 1 / 60);

        expect(c.camera.position.y).toBeCloseTo(RIDGE + CLEARANCE, 4); // 31.5
        // smoothedFloorY is seated to the same raw floor on the first frame.
        expect(c.smoothedFloorY).toBeCloseTo(RIDGE + CLEARANCE, 4);
    });

    it('over a flat field, the whole rig rides up by exactly the terrain delta', () => {
        // "Tracks the dog terrain Y": raising a uniform flat field by 10m shifts
        // the camera height by exactly 10m, and the camera always sits above the
        // ground it is tracking.
        const run = (H) => {
            const c = new CameraController(makeCamera(), { isMobile: false });
            c.setHeightfield(heightfieldStub(() => H));
            c.update(new Vector2D(0, 0), new Vector2D(0, 1), 1 / 60);
            return c.camera.position.y;
        };

        const y0 = run(0);
        const y10 = run(10);

        expect(y10 - y0).toBeCloseTo(10, 6);
        // Camera is above the flat ground it tracks (well clear of the
        // ground+clearance floor of H + 1.5).
        expect(y0).toBeGreaterThan(0 + CLEARANCE);
        expect(y10).toBeGreaterThan(10 + CLEARANCE);
    });

    it('look-at target height follows dog terrain + FOLLOW_LOOK_AT_HEIGHT when idle (no look-ahead)', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });
        const DOG_Y = 8;
        c.setHeightfield(heightfieldStub(() => DOG_Y));
        // Zero facing -> speed 0 -> look-ahead term vanishes, so the look point
        // sits straight over the dog at dogTerrainY + FOLLOW_LOOK_AT_HEIGHT.
        c.update(new Vector2D(0, 0), new Vector2D(0, 0), 1 / 60);
        expect(c._tmpLook.x).toBeCloseTo(0, 6);
        expect(c._tmpLook.z).toBeCloseTo(0, 6);
        expect(c._tmpLook.y).toBeCloseTo(DOG_Y + FOLLOW_LOOK_AT_HEIGHT, 6); // 9.5
    });
});

describe('FREE mode dual ground+ridge clamp', () => {
    it('lifts the camera over a midpoint ridge on the camera->dog sightline', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });
        c.setMode(CameraMode.FREE); // distance becomes 35, freeYaw 0 -> cam at z = -35
        // Ridge only in the band around the midpoint (z ~ -17.5); dog ground and
        // camera ground are 0. Free places the camera instantly (no smoothing),
        // so the midpoint sample lands in the band on the first frame.
        const RIDGE = 25;
        c.setHeightfield(
            heightfieldStub((x, z) => (z < -8 && z > -28 ? RIDGE : 0))
        );

        c.update(new Vector2D(0, 0), new Vector2D(0, 1), 1 / 60);

        const floor = RIDGE + CLEARANCE; // 26.5
        expect(c.camera.position.y).toBeCloseTo(floor, 4);
        // The camera sat at full free distance, confirming this exercised the
        // ridge (sightline) clamp rather than only the camera-ground clamp.
        expect(c.camera.position.z).toBeCloseTo(-35, 4);
    });

    it('on a uniform field the rig sits at its natural height, above the ground+clearance floor', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });
        c.setMode(CameraMode.FREE); // distance 35 -> heightFactor 35/22
        // Uniform field: the natural rig height (dogTerrainY + FOLLOW_HEIGHT *
        // distance/FOLLOW_DISTANCE) is higher than both the ground floor and the
        // ridge floor (each H + clearance), so neither clamp bites and the
        // camera sits at the natural height.
        const H = 40;
        c.setHeightfield(heightfieldStub(() => H));
        c.update(new Vector2D(0, 0), new Vector2D(0, 1), 1 / 60);
        const naturalHeight = H + FOLLOW_HEIGHT * (35 / FOLLOW_DISTANCE); // 57.5
        expect(c.camera.position.y).toBeCloseTo(naturalHeight, 4);
        // Still clear of the ground+clearance floor (the clamp is a lower bound).
        expect(c.camera.position.y).toBeGreaterThan(H + CLEARANCE);
    });

    it('ground clamp lifts the camera when natural height would sink it below camGround+clearance', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });
        c.setMode(CameraMode.FREE);
        // High pad ONLY directly under the camera (freeYaw 0 -> cam at z = -35),
        // with the dog and the whole midpoint sightline deeply negative. This
        // isolates the camera-ground clamp: the ridge-along-sightline floor
        // would be -100 + 1.5, so only the ground clamp can lift the camera.
        const CAM_GROUND = 50;
        c.setHeightfield(heightfieldStub((x, z) => (z < -30 ? CAM_GROUND : -100)));
        c.update(new Vector2D(0, 0), new Vector2D(0, 1), 1 / 60);
        // Natural height keys off the (deeply negative) dog terrain, far below
        // CAM_GROUND + clearance, so the ground clamp lifts to CAM_GROUND + 1.5.
        expect(c.camera.position.y).toBeCloseTo(CAM_GROUND + CLEARANCE, 4); // 51.5
    });
});

describe('CLASSIC mode look-at target Y', () => {
    it('resolves the look-at target Y to heightfield.sample at the dog (x, z)', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });
        c.setMode(CameraMode.CLASSIC);
        // Slope so sample depends on x: sample(x,z) = 13 + x.
        c.setHeightfield(heightfieldStub((x) => 13 + x));
        const dog = new Vector2D(10, 0);
        c.update(dog, null, 1 / 60);
        // Classic lifts the look-at target to the dog's terrain elevation.
        expect(c._tmpTarget.x).toBeCloseTo(10, 6);
        expect(c._tmpTarget.z).toBeCloseTo(0, 6);
        expect(c._tmpTarget.y).toBeCloseTo(23, 6); // 13 + 10
    });

    it('falls back to look-at target Y = 0 when no heightfield is set', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });
        c.setMode(CameraMode.CLASSIC);
        // No setHeightfield call -> heightfield is null -> terrainY defaults to 0.
        c.update(new Vector2D(10, 5), null, 1 / 60);
        expect(c._tmpTarget.x).toBeCloseTo(10, 6);
        expect(c._tmpTarget.z).toBeCloseTo(5, 6);
        expect(c._tmpTarget.y).toBe(0);
    });
});

describe('transformMovement yaw differs between FOLLOW and FREE', () => {
    it('rotates the input vector by freeYaw in FREE and followYaw in FOLLOW', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });

        // FREE: rotate (0,1) by freeYaw = PI/2.
        // out = (x*cos + z*sin, -x*sin + z*cos) = (sin, cos) = (1, ~0).
        c.setMode(CameraMode.FREE);
        c.freeYaw = Math.PI / 2;
        const free = c.transformMovement(new Vector2D(0, 1));
        expect(free.x).toBeCloseTo(1, 6);
        expect(free.z).toBeCloseTo(0, 6);

        // FOLLOW: same input but rotated by followYaw = 0 -> identity.
        c.setMode(CameraMode.FOLLOW);
        c.followYaw = 0;
        const follow = c.transformMovement(new Vector2D(0, 1));
        expect(follow.x).toBeCloseTo(0, 6);
        expect(follow.z).toBeCloseTo(1, 6);

        // The two modes produce materially different rotations for identical
        // input + identical yaw magnitude expectations.
        expect(Math.abs(free.x - follow.x)).toBeGreaterThan(0.5);
    });

    it('uses each mode\'s own yaw field: FOLLOW ignores freeYaw, FREE ignores followYaw', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });
        const input = new Vector2D(1, 0);

        c.setMode(CameraMode.FOLLOW);
        c.followYaw = Math.PI / 2;
        c.freeYaw = 0; // should be ignored in FOLLOW
        const follow = c.transformMovement(input);
        // rotate (1,0) by PI/2: (cos*1, -sin*1) = (~0, -1).
        expect(follow.x).toBeCloseTo(0, 6);
        expect(follow.z).toBeCloseTo(-1, 6);

        c.setMode(CameraMode.FREE);
        c.freeYaw = Math.PI / 2;
        c.followYaw = 0; // should be ignored in FREE
        const free = c.transformMovement(input);
        expect(free.x).toBeCloseTo(0, 6);
        expect(free.z).toBeCloseTo(-1, 6);
    });
});

describe('per-mode zoom clamps and localStorage persistence', () => {
    it('clamps zoom to the FOLLOW range [6, 45] and persists the clamped value', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });
        // Switch away then back so the per-mode FOLLOW zoom range is active.
        c.setMode(CameraMode.CLASSIC);
        c.setMode(CameraMode.FOLLOW);

        c.setZoom(1000);
        expect(c.getZoom()).toBe(45);
        expect(localStorage.getItem('sds.cameraZoom.follow')).toBe('45');

        c.setZoom(-50);
        expect(c.getZoom()).toBe(6);
        expect(localStorage.getItem('sds.cameraZoom.follow')).toBe('6');
    });

    it('clamps zoom to the CLASSIC range [20, 150] independently', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });
        c.setMode(CameraMode.CLASSIC);
        c.setZoom(5);
        expect(c.getZoom()).toBe(20);
        expect(localStorage.getItem('sds.cameraZoom.classic')).toBe('20');

        // getZoomState reflects the active mode's live range + distance.
        expect(c.getZoomState()).toEqual({
            mode: CameraMode.CLASSIC,
            distance: 20,
            min: 20,
            max: 150,
        });
    });

    it('clamps zoom to the FREE range [10, 70]', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });
        c.setMode(CameraMode.FREE);
        c.setZoom(9999);
        expect(c.getZoom()).toBe(70);
        expect(localStorage.getItem('sds.cameraZoom.free')).toBe('70');
    });

    it('re-reads persisted per-mode zoom on construction (clamped into range)', () => {
        // An in-range stored value survives verbatim.
        localStorage.setItem('sds.cameraZoom.free', '50');
        const c1 = new CameraController(makeCamera(), { isMobile: false });
        c1.setMode(CameraMode.FREE);
        expect(c1.getZoom()).toBe(50);

        // An out-of-range stored value is clamped to the mode max on read.
        localStorage.setItem('sds.cameraZoom.free', '999');
        const c2 = new CameraController(makeCamera(), { isMobile: false });
        c2.setMode(CameraMode.FREE);
        expect(c2.getZoom()).toBe(70);
    });

    it('handleWheel steps the active-mode zoom by the wheel step and clamps', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });
        c.setMode(CameraMode.FREE); // free default zoom 35, step 5
        c.handleWheel(120); // positive deltaY -> zoom out by zoomWheelStep
        expect(c.getZoom()).toBe(40);
        c.handleWheel(-120); // zoom in
        expect(c.getZoom()).toBe(35);
    });
});

describe('_facingAngle holds the last valid facing when idle', () => {
    it('returns the last above-threshold facing for null and below-threshold velocity', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });

        // atan2(x, z): facing +Z -> 0; facing +X -> PI/2.
        expect(c._facingAngle(new Vector2D(0, 1))).toBeCloseTo(0, 6);
        expect(c._facingAngle(new Vector2D(1, 0))).toBeCloseTo(Math.PI / 2, 6);
        expect(c._lastValidFacing).toBeCloseTo(Math.PI / 2, 6);

        // Below the 0.1 magnitude threshold -> hold last valid (PI/2), and the
        // stored last-valid is unchanged.
        expect(c._facingAngle(new Vector2D(0.01, 0.01))).toBeCloseTo(Math.PI / 2, 6);
        expect(c._lastValidFacing).toBeCloseTo(Math.PI / 2, 6);

        // Null facing -> also holds last valid.
        expect(c._facingAngle(null)).toBeCloseTo(Math.PI / 2, 6);
    });

    it('initial last-valid facing is 0 before any movement', () => {
        const c = new CameraController(makeCamera(), { isMobile: false });
        expect(c._facingAngle(null)).toBe(0);
        expect(c._facingAngle(new Vector2D(0, 0))).toBe(0);
    });
});
