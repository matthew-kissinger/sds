// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import { Vector2D } from '../shared/Vector2D.js';
import {
    calculateBoundaryAvoidance,
    calculateBoundaryAvoidanceWithGate,
    applyHardBoundaryConstraints,
} from '../shared/BoundaryCollision.js';
import { boundaryToBounds } from '../shared/index.js';

/**
 * Island boundary contract tests (Cycle 5 Phase 1).
 *
 * The dispatchers accept either a legacy `bounds` rect or a discriminated
 * `Boundary`. These specs cover:
 *   - Rect path is unchanged (smoke check; full coverage lives in sim-baseline)
 *   - Island radial smoothstep produces inward force inside the falloff zone
 *   - Entities well inside the safe zone get zero force
 *   - Hard clamp at the radius prevents escape
 */

function makeEntity(x, z, vx = 0, vz = 0) {
    return {
        position: new Vector2D(x, z),
        velocity: new Vector2D(vx, vz),
    };
}

const ISLAND = {
    kind: 'island',
    center: { x: 0, z: 0 },
    radius: 90,
    falloff: 15,
};

const RECT = {
    kind: 'rect',
    minX: -100, maxX: 100, minZ: -100, maxZ: 100,
};

const LEGACY_RECT = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };

describe('Boundary dispatch — accepts both legacy bounds and tagged Boundary', () => {
    it('legacy bounds rect produces same force as kind:rect', () => {
        const eA = makeEntity(95, 0);
        const eB = makeEntity(95, 0);
        const fA = calculateBoundaryAvoidance(eA, LEGACY_RECT);
        const fB = calculateBoundaryAvoidance(eB, RECT);
        expect(fA.x).toBeCloseTo(fB.x, 10);
        expect(fA.z).toBeCloseTo(fB.z, 10);
    });
});

describe('Island avoidance — calculateBoundaryAvoidance', () => {
    it('entity well inside the safe zone gets zero force', () => {
        const e = makeEntity(50, 0);
        const force = calculateBoundaryAvoidance(e, ISLAND);
        expect(force.x).toBe(0);
        expect(force.z).toBe(0);
    });

    it('entity inside the falloff zone gets inward force', () => {
        const e = makeEntity(80, 0);  // r=80, safeRadius=75 → inside falloff
        const force = calculateBoundaryAvoidance(e, ISLAND);
        // Force should push back toward origin, so x-component must be negative
        expect(force.x).toBeLessThan(0);
        expect(force.z).toBeCloseTo(0, 6);
    });

    it('entity past the radius gets maximum inward force (saturating)', () => {
        const e = makeEntity(95, 0);
        const force = calculateBoundaryAvoidance(e, ISLAND);
        expect(force.x).toBeLessThan(0);
        // Magnitude should be larger than mid-falloff entity
        const eMid = makeEntity(80, 0);
        const fMid = calculateBoundaryAvoidance(eMid, ISLAND);
        expect(Math.abs(force.x)).toBeGreaterThanOrEqual(Math.abs(fMid.x));
    });

    it('inward force points toward island center from any angle', () => {
        // Entity at northeast inside falloff
        const e = makeEntity(60, 60);  // r ≈ 84.85, in falloff
        const force = calculateBoundaryAvoidance(e, ISLAND);
        // Force x and z must both be negative (toward origin)
        expect(force.x).toBeLessThan(0);
        expect(force.z).toBeLessThan(0);
    });
});

describe('Island avoidance — calculateBoundaryAvoidanceWithGate', () => {
    it('island branch ignores gate (gates are inside the island, not at boundary)', () => {
        const e = makeEntity(95, 0);
        const fakeGate = { position: { x: 0, z: 95 }, width: 8 };
        // With or without gate — same force on island
        const fA = calculateBoundaryAvoidanceWithGate(e, ISLAND, fakeGate);
        const fB = calculateBoundaryAvoidanceWithGate(e, ISLAND, null);
        expect(fA.x).toBeCloseTo(fB.x, 10);
        expect(fA.z).toBeCloseTo(fB.z, 10);
    });

    it('island force has positive magnitude at the boundary', () => {
        const e = makeEntity(90, 0);  // exactly at radius
        const force = calculateBoundaryAvoidanceWithGate(e, ISLAND, null);
        expect(Math.abs(force.x) + Math.abs(force.z)).toBeGreaterThan(0);
    });
});

describe('Island hard clamp — applyHardBoundaryConstraints', () => {
    it('entity inside the radius is unchanged', () => {
        const e = makeEntity(50, 0);
        const out = applyHardBoundaryConstraints(e, ISLAND);
        expect(out.x).toBeCloseTo(50, 10);
        expect(out.z).toBeCloseTo(0, 10);
    });

    it('entity outside the radius is clamped to radius − margin', () => {
        const e = makeEntity(120, 0);
        const out = applyHardBoundaryConstraints(e, ISLAND, null, { margin: 0.2 });
        const r = Math.sqrt(out.x * out.x + out.z * out.z);
        expect(r).toBeCloseTo(90 - 0.2, 6);
    });

    it('clamp preserves angular position', () => {
        const e = makeEntity(60, 60);  // r ≈ 84.85, inside (no clamp)
        const out = applyHardBoundaryConstraints(e, ISLAND);
        expect(out.x).toBeCloseTo(60, 10);
        expect(out.z).toBeCloseTo(60, 10);

        // Now push outside
        const eFar = makeEntity(100, 100);  // r ≈ 141.4
        const outFar = applyHardBoundaryConstraints(eFar, ISLAND, null, { margin: 0 });
        // Original ratio x:z is 1:1 → clamped should also be 1:1
        expect(outFar.x).toBeCloseTo(outFar.z, 6);
        const rFar = Math.sqrt(outFar.x * outFar.x + outFar.z * outFar.z);
        expect(rFar).toBeCloseTo(90, 6);
    });
});

// Cycle 64: the coastline kind is a new dispatch branch. A square polygon makes
// the inward direction trivially predictable (near +x edge, inward is -x). Deep
// behaviour + analytic-circle parity live in tests/coastline-field.spec.js;
// these specs prove the three dispatchers route coastline at all.
const COASTLINE_SQUARE = {
    kind: 'coastline',
    points: [
        { x: -100, z: -100 }, { x: 100, z: -100 },
        { x: 100, z: 100 }, { x: -100, z: 100 },
    ],
    falloff: 20,
    cellSize: 5,
};

describe('Coastline dispatch — calculateBoundaryAvoidance', () => {
    it('entity well inside the safe zone gets zero force', () => {
        const e = makeEntity(0, 0);
        const force = calculateBoundaryAvoidance(e, COASTLINE_SQUARE);
        expect(force.x).toBe(0);
        expect(force.z).toBe(0);
    });

    it('entity inside the falloff band near +x edge gets inward (-x) force', () => {
        const e = makeEntity(90, 0); // 10m inside the +x shore, within 20m falloff
        const force = calculateBoundaryAvoidance(e, COASTLINE_SQUARE);
        expect(force.x).toBeLessThan(0);
        expect(Math.abs(force.z)).toBeLessThan(Math.abs(force.x));
    });

    it('with-gate dispatcher also routes coastline (no gate carve-out)', () => {
        const e = makeEntity(90, 0);
        const force = calculateBoundaryAvoidanceWithGate(e, COASTLINE_SQUARE, null);
        expect(Math.abs(force.x) + Math.abs(force.z)).toBeGreaterThan(0);
    });
});

describe('Coastline hard clamp — applyHardBoundaryConstraints', () => {
    it('pushes a realistic overshoot back inside in one clamp', () => {
        const e = makeEntity(120, 0); // 20m past the +x shore, within the padded grid
        const out = applyHardBoundaryConstraints(e, COASTLINE_SQUARE, null, { margin: 0.2 });
        expect(out.x).toBeLessThanOrEqual(100);
        expect(out.x).toBeGreaterThan(0);
    });

    it('reels a far-flung entity back inside over a few ticks (centroid fallback)', () => {
        const e = makeEntity(400, 400); // way past the padded grid in both axes
        for (let i = 0; i < 12; i++) {
            const out = applyHardBoundaryConstraints(e, COASTLINE_SQUARE, null, { margin: 0.2 });
            e.position.x = out.x;
            e.position.z = out.z;
        }
        expect(e.position.x).toBeLessThanOrEqual(100);
        expect(e.position.z).toBeLessThanOrEqual(100);
        expect(e.position.x).toBeGreaterThan(-100);
        expect(e.position.z).toBeGreaterThan(-100);
    });

    it('leaves a deep-interior point unchanged', () => {
        const e = makeEntity(0, 0);
        const out = applyHardBoundaryConstraints(e, COASTLINE_SQUARE);
        expect(out.x).toBeCloseTo(0, 6);
        expect(out.z).toBeCloseTo(0, 6);
    });
});

describe('Coastline boundaryToBounds — returns bbox instead of throwing', () => {
    it('returns the polygon bounding box', () => {
        const bb = boundaryToBounds(COASTLINE_SQUARE);
        expect(bb).toEqual({ minX: -100, maxX: 100, minZ: -100, maxZ: 100 });
    });
});

describe('Rect path — unchanged after refactor', () => {
    // The sim-baseline tests cover deep behaviour; these are smoke checks.
    it('legacy rect entity near minX gets eastward push', () => {
        const e = makeEntity(-95, 0);
        const force = calculateBoundaryAvoidance(e, LEGACY_RECT);
        expect(force.x).toBeGreaterThan(0);
    });

    it('rect kind discriminated produces same behaviour', () => {
        const e = makeEntity(-95, 0);
        const force = calculateBoundaryAvoidance(e, RECT);
        expect(force.x).toBeGreaterThan(0);
    });
});
