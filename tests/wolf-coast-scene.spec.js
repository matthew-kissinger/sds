// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 64 Phase 4: the Wolf Coast SceneDef. Proves the scene loads on the new
 * coastline boundary, measures in the 3.0-3.6 km^2 window, keeps every gameplay
 * landmark inside the land polygon, and ships none of the (later-cycle) survival
 * modes.
 */
import { describe, it, expect } from 'vitest';
import { loadScene } from '../shared/scenes/index.js';
import { WOLF_COAST_POINTS } from '../shared/scenes/wolf-coast.coast.js';
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

describe('Wolf Coast SceneDef (Cycle 64)', () => {
    const scene = loadScene('wolf-coast');

    it('loads with a coastline boundary and does not throw', () => {
        expect(scene.id).toBe('wolf-coast');
        expect(scene.boundary.kind).toBe('coastline');
        expect(scene.boundary.points).toBe(WOLF_COAST_POINTS);
        expect(scene.boundary.cellSize).toBe(12);
        expect(scene.boundary.falloff).toBeGreaterThan(0);
    });

    it('measures 3.0-3.6 km^2 by shoelace', () => {
        const km2 = shoelaceArea(WOLF_COAST_POINTS) / 1e6;
        // Report the measured value for the record.
        expect(km2).toBeGreaterThanOrEqual(3.0);
        expect(km2).toBeLessThanOrEqual(3.6);
    });

    it('keeps every gameplay landmark inside the land polygon', () => {
        const P = WOLF_COAST_POINTS;
        const landmarks = {
            dogSpawn: scene.dogSpawn,
            corral: scene.corral.center,
            pen: scene.pen.center,
            sheepSpawn: { x: scene.sheepSpawn.centerX, z: scene.sheepSpawn.centerZ },
            farmHouse: scene.farmHouse.position,
            mountainSummit: { x: -616, z: 1110 },
            ...Object.fromEntries(scene.woodsZones.map((w, i) => [`woods${i}`, w.center])),
        };
        for (const [name, p] of Object.entries(landmarks)) {
            expect(inPoly(p.x, p.z, P), `${name} (${p.x},${p.z}) must be inside`).toBe(true);
        }
    });

    it('pen and corral coexist at the same toe enclosure', () => {
        expect(scene.pen.center).toEqual(scene.corral.center);
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
