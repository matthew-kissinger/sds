#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 64 provenance: how shared/scenes/wolf-coast.coast.js was generated.
 *
 * Authors the Wolf Coast boot silhouette at a clean scale, densifies the long
 * edges into believable banking curves (Q4: 60-80 points), then uniformly
 * scales the whole polygon about its centroid so the shoelace area lands in the
 * 3.0-3.6 km^2 acceptance window (Q-area). Uniform scale preserves the boot
 * shape + the instep concavity exactly. Prints the final integer-rounded points
 * array, the measured area, the bbox, and landmark containment.
 *
 * Run:  node tools/author-wolf-coast.mjs
 * Then paste the printed POINTS array into shared/scenes/wolf-coast.coast.js.
 * This is a one-shot generator, not part of the build.
 */

// Raw boot, traced counter-clockwise. +X east (toe), +Z north (mountain/leg
// top). Arbitrary units; scaled to the target area below. Concave at the instep
// (the upper-east of the foot) so the silhouette reads as a boot, not a blob.
const RAW = [
    // leg, west side, north -> south
    { x: -10.5, z: 30.0 }, { x: -11.6, z: 25.0 }, { x: -11.2, z: 20.0 },
    { x: -11.9, z: 15.0 }, { x: -11.3, z: 10.0 }, { x: -12.0, z: 5.0 },
    { x: -11.6, z: 0.0 }, { x: -11.8, z: -4.0 },
    // heel (south-west)
    { x: -13.2, z: -8.0 }, { x: -14.6, z: -12.0 }, { x: -13.8, z: -16.0 },
    { x: -11.2, z: -19.0 },
    // sole, west -> east
    { x: -6.0, z: -20.4 }, { x: 0.0, z: -20.8 }, { x: 6.5, z: -20.7 },
    { x: 13.0, z: -20.2 }, { x: 18.5, z: -19.2 }, { x: 22.5, z: -17.4 },
    // toe (far east)
    { x: 25.2, z: -14.6 }, { x: 25.8, z: -11.6 }, { x: 24.2, z: -9.2 },
    // instep (concave), east -> west along the upper foot
    { x: 20.5, z: -8.8 }, { x: 15.5, z: -9.4 }, { x: 10.5, z: -9.8 },
    { x: 5.8, z: -9.9 },
    // instep notch rising into the front of the leg
    { x: 2.6, z: -6.5 }, { x: 1.8, z: -1.0 }, { x: 2.2, z: 5.0 },
    { x: 1.9, z: 11.0 }, { x: 2.3, z: 17.0 }, { x: 1.9, z: 23.0 },
    { x: 1.6, z: 29.0 },
    // top of the leg, east -> west back toward the start
    { x: -4.5, z: 30.6 },
];

// Landmarks (in RAW units) we want inside the final silhouette. Positions are
// the design intent: mountain in the north leg-top, the toe enclosure far east,
// the biome bands down the leg, the open lowland in the centre of the foot.
const RAW_LANDMARKS = {
    mountainSummit: { x: -5.0, z: 24.0 },
    toeEnclosure: { x: 21.0, z: -12.0 },
    forestBand: { x: -5.0, z: 14.0 },
    tallGrassBand: { x: -4.0, z: 6.0 },
    footLowland: { x: 8.0, z: -15.0 },
};

const TARGET_AREA_M2 = 3.2e6; // middle of the 3.0-3.6 km^2 window
const MAX_EDGE_FRACTION = 0.045; // densify edges longer than this * bbox diag

function shoelaceArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

function bbox(pts) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    return { minX, maxX, minZ, maxZ };
}

function centroid(pts) {
    let x = 0, z = 0;
    for (const p of pts) { x += p.x; z += p.z; }
    return { x: x / pts.length, z: z / pts.length };
}

function densify(pts, maxEdge) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        out.push({ x: a.x, z: a.z });
        const dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        const n = Math.floor(len / maxEdge);
        for (let k = 1; k <= n; k++) {
            const t = k / (n + 1);
            out.push({ x: a.x + dx * t, z: a.z + dz * t });
        }
    }
    return out;
}

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

// 1) densify
const bb0 = bbox(RAW);
const diag = Math.hypot(bb0.maxX - bb0.minX, bb0.maxZ - bb0.minZ);
const dense = densify(RAW, diag * MAX_EDGE_FRACTION);

// 2) scale about centroid to hit the target area, then recenter the bbox on the
//    origin so the heightmap (centred at world origin) covers the boot
//    symmetrically with a modest worldSize.
const c = centroid(dense);
const s = Math.sqrt(TARGET_AREA_M2 / shoelaceArea(dense));
const scaledFloat = dense.map((p) => ({ x: c.x + (p.x - c.x) * s, z: c.z + (p.z - c.z) * s }));
const sbb = bbox(scaledFloat);
const shiftX = -(sbb.minX + sbb.maxX) / 2;
const shiftZ = -(sbb.minZ + sbb.maxZ) / 2;
const scaled = scaledFloat.map((p) => ({ x: Math.round(p.x + shiftX), z: Math.round(p.z + shiftZ) }));
const scaledLandmarks = {};
for (const [k, p] of Object.entries(RAW_LANDMARKS)) {
    scaledLandmarks[k] = {
        x: Math.round(c.x + (p.x - c.x) * s + shiftX),
        z: Math.round(c.z + (p.z - c.z) * s + shiftZ),
    };
}

const area = shoelaceArea(scaled);
const bb = bbox(scaled);
console.log(`points: ${scaled.length}`);
console.log(`area: ${Math.round(area)} m^2 = ${(area / 1e6).toFixed(3)} km^2 (target ${(TARGET_AREA_M2 / 1e6).toFixed(1)})`);
console.log(`bbox: x[${bb.minX}, ${bb.maxX}] (${bb.maxX - bb.minX}m)  z[${bb.minZ}, ${bb.maxZ}] (${bb.maxZ - bb.minZ}m)`);
console.log('landmarks inside:');
for (const [k, p] of Object.entries(scaledLandmarks)) {
    console.log(`  ${k.padEnd(16)} (${p.x}, ${p.z}) -> ${isPointInPolygon(p.x, p.z, scaled) ? 'YES' : 'NO'}`);
}
console.log('\nPOINTS = [');
let line = '    ';
for (let i = 0; i < scaled.length; i++) {
    const tok = `{ x: ${scaled[i].x}, z: ${scaled[i].z} },`;
    if ((line + tok).length > 96) { console.log(line.replace(/\s+$/, '')); line = '    '; }
    line += tok + ' ';
}
if (line.trim()) console.log(line.replace(/\s+$/, ''));
console.log('];');
console.log('\nLANDMARKS = ' + JSON.stringify(scaledLandmarks));
