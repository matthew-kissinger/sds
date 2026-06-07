// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 64 Phase 4: the Newsheepdogland SceneDef. Proves the scene loads on the new
 * coastline boundary, measures in the 3.0-3.6 km^2 window, keeps every gameplay
 * landmark inside the land polygon, and ships none of the (later-cycle) survival
 * modes.
 */
import { describe, it, expect } from 'vitest';
import { loadScene } from '../shared/scenes/index.js';
import { NEWSHEEPDOGLAND_POINTS } from '../shared/scenes/newsheepdogland.coast.js';
import { boundaryToBounds } from '../shared/index.js';

function shoelaceArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

function inPoly(x, z, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x, zi = pts[i].z, xj = pts[j].x, zj = pts[j].z;
        if (((zi > z) !== (zj > z)) && (x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)) inside = !inside;
    }
    return inside;
}

describe('Newsheepdogland SceneDef (Cycle 64)', () => {
    const scene = loadScene('newsheepdogland');

    it('loads with a coastline boundary and does not throw', () => {
        expect(scene.id).toBe('newsheepdogland');
        expect(scene.boundary.kind).toBe('coastline');
        expect(scene.boundary.points).toBe(NEWSHEEPDOGLAND_POINTS);
        expect(scene.boundary.cellSize).toBe(12);
        expect(scene.boundary.falloff).toBeGreaterThan(0);
    });

    it('measures 3.0-3.6 km^2 by shoelace', () => {
        const km2 = shoelaceArea(NEWSHEEPDOGLAND_POINTS) / 1e6;
        // Report the measured value for the record.
        expect(km2).toBeGreaterThanOrEqual(3.0);
        expect(km2).toBeLessThanOrEqual(3.6);
    });

    it('keeps every gameplay landmark inside the land polygon', () => {
        const P = NEWSHEEPDOGLAND_POINTS;
        const landmarks = {
            dogSpawn: scene.dogSpawn,
            corral: scene.corral.center,
            pen: scene.pen.center,
            gate: scene.gate.position,
            sheepSpawn: { x: scene.sheepSpawn.centerX, z: scene.sheepSpawn.centerZ },
            farmHouse: scene.farmHouse.position,
            mountainSummit: { x: -616, z: 1110 },
            ...Object.fromEntries(scene.woodsZones.map((w, i) => [`woods${i}`, w.center])),
        };
        for (const [name, p] of Object.entries(landmarks)) {
            expect(inPoly(p.x, p.z, P), `${name} (${p.x},${p.z}) must be inside`).toBe(true);
        }
    });

    it('separates the homestead pen from the toe corral (Cycle 65)', () => {
        // Cycle 65 relocated the pen to the homestead day-loop zone; the toe
        // corral stays the wired Solo objective. They are now distinct places.
        expect(scene.pen.center).not.toEqual(scene.corral.center);
        // The homestead gate sits on the pen edge.
        expect(scene.gate).toBeTruthy();
        const gd = Math.hypot(scene.gate.position.x - scene.pen.center.x, scene.gate.position.z - scene.pen.center.z);
        expect(gd).toBeLessThanOrEqual(scene.pen.radius + 2);
        // The dog wakes at the homestead, just outside the gate.
        const dd = Math.hypot(scene.dogSpawn.x - scene.gate.position.x, scene.dogSpawn.z - scene.gate.position.z);
        expect(dd).toBeLessThan(40);
    });

    it('opts into the day/night day loop (Cycle 65)', () => {
        expect(scene.dayNight).toBeTruthy();
        expect(scene.dayNight.enabled).toBe(true);
        expect(scene.dayNight.dayLoop).toBe(true);
        expect(scene.dayNight.initialT).toBeGreaterThan(0);
        expect(scene.dayNight.initialT).toBeLessThan(1);
    });

    it('ships no survival modes this cycle', () => {
        for (const mode of scene.allowedModes) {
            expect(mode).not.toBe('survival');
        }
        expect(scene.allowedModes).toContain('cooperative');
    });

    it('boundaryToBounds returns the polygon bbox', () => {
        const bb = boundaryToBounds(scene.boundary);
        expect(bb.minX).toBeLessThan(bb.maxX);
        expect(bb.minZ).toBeLessThan(bb.maxZ);
        // bbox spans roughly the authored 2348 x 2988 boot
        expect(bb.maxX - bb.minX).toBeGreaterThan(2000);
        expect(bb.maxZ - bb.minZ).toBeGreaterThan(2000);
    });

    it('has a soloLadder with a Just Play rung and a Chaos rung', () => {
        const ids = scene.soloLadder.map((r) => r.id);
        expect(ids).toContain('practice');
        expect(ids).toContain('chaos');
        // prose-and-voice: no em-dashes in player-facing blurbs
        for (const rung of scene.soloLadder) {
            if (rung.blurb) expect(rung.blurb.includes('—')).toBe(false);
        }
    });
});
