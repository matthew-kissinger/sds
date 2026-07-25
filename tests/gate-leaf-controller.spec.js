// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
    GateLeafController,
    GATE_LEAF_INITIAL_OPEN_FRACTION,
    GATE_LEAF_LEFT_NAME,
    GATE_LEAF_RIGHT_NAME,
    attachGateLeafController,
    buildAuthoredGateLeaves,
    collectGateLeafControllers,
    getGateLeafController,
} from '../js/world/gateLeafController.js';

/**
 * The leaf rig promoted out of the Newsheepdogland branch in Cycle 115 P3.
 *
 * The interesting case is the RIGHT leaf. `Gate_Assembly-v1.0.0.glb` bakes it
 * at a 252-degree yaw, which arrives as the quaternion asserted below and which
 * three decomposes to Euler XYZ (180, -72, 180). Its `rotation.y` therefore
 * reads the same -72 degrees as its twin, and zeroing it leaves the 180-degree
 * flip that lays the (shared, left-handed) wood mesh back across the opening.
 * That is the whole reason a single `rotation.y` channel per leaf is a valid
 * hinge; if it ever stops being true the rig silently poses garbage, so it is
 * locked here against the real numbers rather than a convenient fixture.
 */
const SHIPPED_RIGHT_LEAF_QUATERNION = [0, 0.8090169943749475, 0, -0.5877852522924731];
const SHIPPED_LEFT_LEAF_QUATERNION = [0, -0.5877852522924731, 0, 0.8090169943749475];

/** Yaw of the leaf's local +X in world terms, which is what a viewer reads. */
function leafFacingDeg(node) {
    const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(node.quaternion);
    return (Math.atan2(dir.z, dir.x) * 180) / Math.PI;
}

function makeShippedGateAsset() {
    const root = new THREE.Group();
    root.name = 'Gate_Assembly';

    // Both leaf pivots ship UNNAMED in the GLB; they are found by the wood mesh
    // they parent. Leaving them unnamed here is the point of the fixture.
    const leftPivot = new THREE.Group();
    leftPivot.position.set(-3.8, 0, 0);
    leftPivot.quaternion.fromArray(SHIPPED_LEFT_LEAF_QUATERNION);
    const leftWood = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.3, 0.12));
    leftWood.name = 'Mesh_LeftGateWood';
    const leftMetal = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.86, 0.14));
    leftMetal.name = 'Mesh_LeftGateMetal';
    leftPivot.add(leftWood, leftMetal);

    const rightPivot = new THREE.Group();
    rightPivot.position.set(3.8, 0, 0);
    rightPivot.quaternion.fromArray(SHIPPED_RIGHT_LEAF_QUATERNION);
    const rightWood = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.3, 0.12));
    rightWood.name = 'Mesh_RightGateWood';
    rightPivot.add(rightWood);

    root.add(leftPivot, rightPivot);
    return { root, leftPivot, rightPivot };
}

describe('buildAuthoredGateLeaves — reads the swing off the shipped asset', () => {
    it('names the two unnamed pivots and records closed/open from the baked pose', () => {
        const { root, leftPivot, rightPivot } = makeShippedGateAsset();

        const leaves = buildAuthoredGateLeaves(root);

        expect(leaves.length).toBe(2);
        expect(leftPivot.name).toBe(GATE_LEAF_LEFT_NAME);
        expect(rightPivot.name).toBe(GATE_LEAF_RIGHT_NAME);
        for (const leaf of leaves) {
            expect(leaf.closed).toBe(0);
            expect(leaf.open).toBeCloseTo(THREE.MathUtils.degToRad(-72), 9);
        }
    });

    it('locks the right leaf Euler coincidence the single-channel hinge depends on', () => {
        const { rightPivot } = makeShippedGateAsset();

        expect(rightPivot.rotation.order).toBe('XYZ');
        expect(Math.abs(rightPivot.rotation.x)).toBeCloseTo(Math.PI, 9);
        expect(Math.abs(rightPivot.rotation.z)).toBeCloseTo(Math.PI, 9);
        // Open: swung to the same +Z side as its twin, 72 degrees off the gap.
        expect(leafFacingDeg(rightPivot)).toBeCloseTo(108, 6);

        rightPivot.rotation.y = 0;
        // Closed: laid back across the opening, pointing at the left leaf.
        expect(leafFacingDeg(rightPivot)).toBeCloseTo(180, 6);
    });

    it('returns no leaves for a flattened export rather than hinging one node twice', () => {
        // A material-merged bake collapses both leaves under one node. Cycle 105
        // kept the hierarchy-preserving GLB precisely to avoid this; if a future
        // re-bake regresses, the gate must go stiff, not inside-out.
        const root = new THREE.Group();
        const merged = new THREE.Group();
        const left = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        left.name = 'Mesh_LeftGateWood';
        const right = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        right.name = 'Mesh_RightGateWood';
        merged.add(left, right);
        root.add(merged);

        expect(buildAuthoredGateLeaves(root)).toEqual([]);
        expect(merged.name).toBe('');
    });

    it('returns no leaves for an asset with no leaf meshes at all', () => {
        const root = new THREE.Group();
        root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
        expect(buildAuthoredGateLeaves(root)).toEqual([]);
        expect(buildAuthoredGateLeaves(null)).toEqual([]);
    });
});

describe('GateLeafController', () => {
    function makeLeaves() {
        return [
            { node: { rotation: { y: 0 } }, closed: 0, open: -1 },
            // A second leaf whose closed pose is NOT zero: the vertical-gate
            // procedural leaf is exactly this shape, and it is why the rig
            // stores absolute angles instead of one shared delta.
            { node: { rotation: { y: 0 } }, closed: Math.PI / 2, open: Math.PI / 2 + 2 },
        ];
    }

    it('poses every leaf from one fraction at construction', () => {
        const leaves = makeLeaves();
        const controller = new GateLeafController(leaves, 0);

        expect(controller.openFraction).toBe(0);
        expect(controller.targetOpenFraction).toBe(0);
        expect(controller.isSettled).toBe(true);
        expect(leaves[0].node.rotation.y).toBe(0);
        expect(leaves[1].node.rotation.y).toBeCloseTo(Math.PI / 2, 9);

        controller.setOpenFraction(1);
        expect(leaves[0].node.rotation.y).toBeCloseTo(-1, 9);
        expect(leaves[1].node.rotation.y).toBeCloseTo(Math.PI / 2 + 2, 9);
    });

    it('builds OPEN by default, because closing one puts sheep through it', () => {
        // This asserted 0 for an afternoon and that was a gameplay regression:
        // sheep retire by walking to a target inside the pen, so they cross the
        // gate line, and closed leaves span the whole 8m opening. Phase 3's
        // brief was "only makes it possible", so the default preserves the
        // behaviour that shipped before the controller existed. What is new is
        // that the pose is drivable at all, which the next test covers.
        expect(GATE_LEAF_INITIAL_OPEN_FRACTION).toBe(1);
        const leaves = makeLeaves();
        leaves[0].node.rotation.y = 0; // asset arrives however it arrives
        const controller = new GateLeafController(leaves);
        expect(controller.openFraction).toBe(1);
        expect(leaves[0].node.rotation.y).toBeCloseTo(-1, 9);
    });

    it('can still be built closed explicitly, which is the capability the phase added', () => {
        const leaves = makeLeaves();
        leaves[0].node.rotation.y = -1; // asset arrives baked open
        const controller = new GateLeafController(leaves, 0);
        expect(controller.openFraction).toBe(0);
        expect(leaves[0].node.rotation.y).toBe(0);
    });

    it('separates target from current and never moves without a step', () => {
        const leaves = makeLeaves();
        const controller = new GateLeafController(leaves, 0);

        controller.setTargetOpenFraction(1);
        expect(controller.targetOpenFraction).toBe(1);
        expect(controller.openFraction).toBe(0);
        expect(controller.isSettled).toBe(false);
        expect(leaves[0].node.rotation.y).toBe(0);

        expect(controller.step(0.1)).toBe(true);      // 0.1 * 3 = 30% of the gap
        expect(controller.openFraction).toBeCloseTo(0.3, 9);
        expect(leaves[0].node.rotation.y).toBeCloseTo(-0.3, 9);

        controller.step(1000);                         // capped, no overshoot
        expect(controller.openFraction).toBe(1);
        expect(controller.step(1)).toBe(false);
    });

    it('honours a caller-supplied swing rate and a non-finite delta', () => {
        const controller = new GateLeafController(makeLeaves(), 0);
        controller.setTargetOpenFraction(1);
        controller.step(0.1, 1);
        expect(controller.openFraction).toBeCloseTo(0.1, 9);

        const other = new GateLeafController(makeLeaves(), 0);
        other.setTargetOpenFraction(1);
        other.step(undefined);                         // falls back to ~one frame
        expect(other.openFraction).toBeGreaterThan(0);
        expect(other.openFraction).toBeLessThan(0.1);
    });

    it('clamps out-of-range fractions instead of flinging leaves past the posts', () => {
        const controller = new GateLeafController(makeLeaves(), 5);
        expect(controller.openFraction).toBe(1);
        controller.setOpenFraction(-3);
        expect(controller.openFraction).toBe(0);
        controller.setTargetOpenFraction(Number.NaN);
        expect(controller.targetOpenFraction).toBe(0);
    });

    it('is a safe no-op with no leaves, so consumers need no null branch', () => {
        const controller = new GateLeafController([], 0);
        expect(controller.leaves).toEqual([]);
        expect(() => controller.setOpenFraction(1)).not.toThrow();
        expect(controller.step(1)).toBe(false);
        expect(controller.openFraction).toBe(1);
    });

    it('drops malformed leaf descriptors at construction', () => {
        const good = { node: { rotation: { y: 0 } }, closed: 0, open: 1 };
        const controller = new GateLeafController(
            [good, null, { node: null, closed: 0, open: 1 }, { node: { rotation: { y: 0 } }, closed: 0 }],
            1,
        );
        expect(controller.leaves).toEqual([good]);
    });
});

describe('controller attachment and lookup', () => {
    it('hangs the controller on the host userData and reads it back', () => {
        const host = new THREE.Group();
        const controller = attachGateLeafController(host, []);
        expect(getGateLeafController(host)).toBe(controller);
        expect(host.userData.gateLeafController).toBe(controller);
    });

    it('returns null rather than a stray userData value', () => {
        const host = new THREE.Group();
        expect(getGateLeafController(host)).toBe(null);
        expect(getGateLeafController(null)).toBe(null);
        host.userData.gateLeafController = { openFraction: 1 };
        expect(getGateLeafController(host)).toBe(null);
    });

    it('collects every controller in a subtree, once each, in traversal order', () => {
        const root = new THREE.Group();
        const first = new THREE.Group();
        const second = new THREE.Group();
        root.add(first, second);
        const a = attachGateLeafController(first, []);
        const b = attachGateLeafController(second, []);

        expect(collectGateLeafControllers(root)).toEqual([a, b]);
        // Idempotent against an accumulator, so a builder can fold several roots.
        const out = [a];
        expect(collectGateLeafControllers(root, out)).toEqual([a, b]);
        expect(collectGateLeafControllers(null)).toEqual([]);
    });
});
