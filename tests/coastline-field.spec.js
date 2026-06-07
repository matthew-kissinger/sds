// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 64 Phase 1: the coastline SDF primitive. Proves the four properties the
 * Newsheepdogland boundary rides on:
 *   1. containment from the field matches an even-odd ray cast ground truth,
 *   2. the build is deterministic (byte-identical Float32Array across runs),
 *   3. the avoidance force matches an analytic circle within the falloff band,
 *   4. a flock pressed outward for 600 ticks never escapes the polygon.
 *
 * The geometry helpers (isPointInPolygon, distanceToPolygon) are inlined here as
 * the independent ground truth — the module is allowed to be wrong and the test
 * to catch it, so they don't import the same code under test.
 */
import { describe, it, expect } from 'vitest';
import { Vector2D } from '../shared/Vector2D.js';
import { calculateBoundaryAvoidance } from '../shared/BoundaryCollision.js';
import {
    buildCoastlineField,
    sampleSignedDistance,
    coastlineAvoidance,
    applyHardCoastlineConstraint,
    coastlineBounds,
    pointsBounds,
} from '../shared/CoastlineField.js';

// ---------------------------------------------------------------------------
// Independent ground-truth geometry (NOT imported from the module under test).
// ---------------------------------------------------------------------------

function isPointInPolygon(x, z, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x, zi = pts[i].z;
        const xj = pts[j].x, zj = pts[j].z;
        if (((zi > z) !== (zj > z)) && (x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

function distanceToPolygon(px, pz, pts) {
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const dx = b.x - a.x, dz = b.z - a.z;
        const lenSq = dx * dx + dz * dz;
        let t = 0;
        if (lenSq > 0) {
            t = ((px - a.x) * dx + (pz - a.z) * dz) / lenSq;
            if (t < 0) t = 0; else if (t > 1) t = 1;
        }
        const qx = a.x + t * dx, qz = a.z + t * dz;
        const ex = px - qx, ez = pz - qz;
        const d = Math.sqrt(ex * ex + ez * ez);
        if (d < best) best = d;
    }
    return best;
}

// mulberry32 (deterministic sampling for the tests).
function mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// A coarse concave boot, the Newsheepdogland silhouette shape (same as the spike).
const BOOT = [
    { x: -380, z: 1100 }, { x: -430, z: 920 }, { x: -410, z: 720 },
    { x: -440, z: 520 }, { x: -415, z: 320 }, { x: -445, z: 120 },
    { x: -420, z: -100 },
    { x: -520, z: -300 }, { x: -600, z: -480 }, { x: -560, z: -650 },
    { x: -400, z: -760 },
    { x: -120, z: -780 }, { x: 200, z: -790 }, { x: 520, z: -785 },
    { x: 840, z: -775 }, { x: 1080, z: -740 }, { x: 1250, z: -660 },
    { x: 1360, z: -520 }, { x: 1380, z: -380 }, { x: 1300, z: -260 },
    { x: 1120, z: -250 }, { x: 900, z: -300 }, { x: 640, z: -320 },
    { x: 380, z: -330 }, { x: 160, z: -330 },
    { x: 80, z: -160 }, { x: 60, z: 60 }, { x: 85, z: 260 },
    { x: 75, z: 460 }, { x: 100, z: 660 }, { x: 80, z: 860 },
    { x: 70, z: 1060 },
    { x: -130, z: 1110 },
];

function circlePolygon(cx, cz, radius, segs) {
    const pts = [];
    for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        pts.push({ x: cx + Math.cos(a) * radius, z: cz + Math.sin(a) * radius });
    }
    return pts;
}

function entity(x, z, vx = 0, vz = 0) {
    return { position: new Vector2D(x, z), velocity: new Vector2D(vx, vz) };
}

describe('shared/CoastlineField — SDF build + containment', () => {
    it('field sign matches an even-odd ray cast away from the shore', () => {
        const cellSize = 10;
        const falloff = 30;
        const field = buildCoastlineField(BOOT, { cellSize, falloff });
        const bb = pointsBounds(BOOT);
        const rnd = mulberry32(12345);
        let checked = 0;
        let agree = 0;
        // Sample the bbox; only assert where the point is comfortably (> 1.5
        // cells) clear of any edge, since the bilinear field can disagree with
        // the exact polygon inside a one-cell shell around the boundary.
        for (let k = 0; k < 4000; k++) {
            const x = bb.minX + rnd() * (bb.maxX - bb.minX);
            const z = bb.minZ + rnd() * (bb.maxZ - bb.minZ);
            if (distanceToPolygon(x, z, BOOT) < cellSize * 1.5) continue;
            const truth = isPointInPolygon(x, z, BOOT);
            const sd = sampleSignedDistance(field, x, z);
            checked++;
            if ((sd > 0) === truth) agree++;
        }
        expect(checked).toBeGreaterThan(500);
        expect(agree).toBe(checked); // perfect away from the one-cell shell
    });

    it('reports the polygon bbox via coastlineBounds', () => {
        const bb = coastlineBounds({ kind: 'coastline', points: BOOT, falloff: 30 });
        const ref = pointsBounds(BOOT);
        expect(bb).toEqual(ref);
    });

    it('builds byte-identically from the same points + cellSize', () => {
        const a = buildCoastlineField(BOOT, { cellSize: 12, falloff: 30 });
        const b = buildCoastlineField(BOOT, { cellSize: 12, falloff: 30 });
        expect(a.width).toBe(b.width);
        expect(a.height).toBe(b.height);
        expect(a.data.length).toBe(b.data.length);
        let identical = true;
        for (let i = 0; i < a.data.length; i++) {
            if (a.data[i] !== b.data[i]) { identical = false; break; }
        }
        expect(identical).toBe(true);
    });

    it('throws on a degenerate polygon', () => {
        expect(() => buildCoastlineField([{ x: 0, z: 0 }, { x: 1, z: 1 }], {})).toThrow();
    });
});

describe('shared/CoastlineField — force parity vs an analytic circle', () => {
    it('matches calculateIslandAvoidance direction within 1 deg in the band', () => {
        const radius = 300;
        const falloff = 30;
        const center = { x: 0, z: 0 };
        const island = { kind: 'island', center, radius, falloff };
        const coastline = { kind: 'coastline', points: circlePolygon(0, 0, radius, 64), falloff, cellSize: 10 };
        const cfg = { maxSpeed: 1.5, maxForce: 0.05, forceMultiplier: 1.5 };
        const rnd = mulberry32(99);
        const RAD2DEG = 180 / Math.PI;
        let both = 0, onOffAgree = 0, total = 0, sumDir = 0, maxDir = 0;
        for (let k = 0; k < 6000; k++) {
            const ang = rnd() * Math.PI * 2;
            const r = radius - rnd() * (falloff + 4) + 2;
            const x = Math.cos(ang) * r;
            const z = Math.sin(ang) * r;
            const vx = Math.cos(ang) * 0.8;
            const vz = Math.sin(ang) * 0.8;
            const a = calculateBoundaryAvoidance(entity(x, z, vx, vz), island, cfg);
            const b = coastlineAvoidance(entity(x, z, vx, vz), coastline, cfg);
            const am = a.x * a.x + a.z * a.z;
            const bm = b.x * b.x + b.z * b.z;
            const aOn = am > 1e-12, bOn = bm > 1e-12;
            total++;
            if (aOn === bOn) onOffAgree++;
            if (aOn && bOn) {
                both++;
                const dot = (a.x * b.x + a.z * b.z) / (Math.sqrt(am) * Math.sqrt(bm));
                const deg = Math.acos(Math.max(-1, Math.min(1, dot))) * RAD2DEG;
                sumDir += deg;
                if (deg > maxDir) maxDir = deg;
            }
        }
        const meanDir = sumDir / Math.max(1, both);
        const onOffPct = (onOffAgree / total) * 100;
        expect(both).toBeGreaterThan(1000);
        expect(meanDir).toBeLessThan(1.0);
        expect(onOffPct).toBeGreaterThan(98);
    });

    it('applies zero force well inside the safe zone', () => {
        const coastline = { kind: 'coastline', points: BOOT, falloff: 30, cellSize: 10 };
        // A point deep in the foot interior, far from any shore.
        const f = coastlineAvoidance(entity(400, -550), coastline, {});
        expect(f.magnitude()).toBe(0);
    });
});

describe('shared/CoastlineField — containment under outward pressure', () => {
    it('keeps a 600-tick outward-pressed flock inside the polygon', () => {
        const coastline = { kind: 'coastline', points: BOOT, falloff: 30, cellSize: 10 };
        const cfg = { maxSpeed: 1.5, maxForce: 0.05, forceMultiplier: 1.5 };
        const N = 200;
        const rnd = mulberry32(4242);
        const bb = pointsBounds(BOOT);
        // centroid for the outward velocity bias
        let cx = 0, cz = 0;
        for (const p of BOOT) { cx += p.x; cz += p.z; }
        cx /= BOOT.length; cz /= BOOT.length;
        // seed N interior sheep with outward velocity
        const sheep = [];
        let guard = 0;
        while (sheep.length < N && guard < N * 200) {
            guard++;
            const x = bb.minX + rnd() * (bb.maxX - bb.minX);
            const z = bb.minZ + rnd() * (bb.maxZ - bb.minZ);
            if (!isPointInPolygon(x, z, BOOT)) continue;
            const dx = x - cx, dz = z - cz;
            const m = Math.sqrt(dx * dx + dz * dz) || 1;
            const speed = 0.6 + rnd() * 0.6;
            sheep.push(entity(x, z, (dx / m) * speed, (dz / m) * speed));
        }
        expect(sheep.length).toBe(N);
        for (let t = 0; t < 600; t++) {
            for (const s of sheep) {
                const f = coastlineAvoidance(s, coastline, cfg);
                s.velocity.x += f.x;
                s.velocity.z += f.z;
                const sp = Math.sqrt(s.velocity.x * s.velocity.x + s.velocity.z * s.velocity.z);
                if (sp > cfg.maxSpeed) {
                    const k = cfg.maxSpeed / sp;
                    s.velocity.x *= k; s.velocity.z *= k;
                }
                s.position.x += s.velocity.x;
                s.position.z += s.velocity.z;
                const clamped = applyHardCoastlineConstraint(s, coastline, { margin: 0.2 });
                s.position.x = clamped.x;
                s.position.z = clamped.z;
            }
        }
        let escaped = 0;
        for (const s of sheep) {
            if (!isPointInPolygon(s.position.x, s.position.z, BOOT)) escaped++;
        }
        expect(escaped).toBe(0);
    });

    it('reels an entity flung far past the grid (concave shape) back inside', () => {
        const coastline = { kind: 'coastline', points: BOOT, falloff: 30, cellSize: 12 };
        // Far out in the sea well beyond the bbox, on the concave (instep) side
        // where the bbox centre itself is outside the polygon. The interior-point
        // fallback must still converge it back onto land.
        const e = entity(1600, -300);
        for (let t = 0; t < 60; t++) {
            const clamped = applyHardCoastlineConstraint(e, coastline, { margin: 0.2 });
            e.position.x = clamped.x;
            e.position.z = clamped.z;
        }
        expect(isPointInPolygon(e.position.x, e.position.z, BOOT)).toBe(true);
    });
});
