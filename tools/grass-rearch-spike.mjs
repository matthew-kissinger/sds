// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cycle 68 P5: grass density/LOD spike (measure-first, throwaway).
//
// Question: is a whole-island grass rearch on Newsheepdogland worth a change to
// the cohesion-frozen GrassSystem? Cycle 66 P7 grasses only a 760m play-area
// disc (grassCenter) and explicitly deferred grassing the full ~3.2 km^2 island
// "gated on a perf spike" (the scene comment + docs/BACKLOG.md). This quantifies
// the current cost vs the whole-island cost so the go/no-go is numbers, not vibes.
//
// It is ANALYTICAL, not a GPU frame-time: it imports the real scene def + the
// pure CoastlineField SDF and replays GrassSystem's exact chunk-cull + clumpScale
// math (js/GrassSystem.js buildChunks) in Node. GrassSystem pulls Three.js, so
// it can't be imported here - the formulas are mirrored and cited by line.
// No GrassSystem edit; output -> cycle68-validation/grass/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { newsheepdogland } from '../shared/scenes/newsheepdogland.js';
import { getCoastlineField, sampleSignedDistance, pointsBounds } from '../shared/CoastlineField.js';

// ---- Constants mirrored from js/GrassSystem.js (high desktop tier) ----------
const CHUNK_SIZE = 40;            // config.chunkSize (GrassSystem.js:181)
const BLADES_PER_CLUMP = 7;       // TIER_PRESETS high (scene-and-render.md: high=7)
const VERTS_PER_BLADE = 4;        // createClumpGeometry (GrassSystem.js:433)
const TRIS_PER_BLADE = 2 * 2;     // 2 tris, double-sided (GrassSystem.js:434/437)
const BASE_WORLD = 420;           // desktop baseWorldSize (GrassSystem.js:150)
const DEFAULT_RADIUS = BASE_WORLD * 0.6; // 252m (GrassSystem.js:1090)
const BYTES_PER_INSTANCE = 64;    // instanceMatrix: 16 floats * 4 bytes

const g = newsheepdogland.grass;
const CLUMPS_PER_CHUNK_BASE = g.clumpsPerChunk.desktop; // 950
const grassCenter = g.grassCenter;                       // { x:250, z:-1080 }
const field = getCoastlineField(newsheepdogland.boundary);

// adjustedClumpsPerChunk = round(base * clumpScale * autoLodFactor), autoLod=1.0
// clumpScale = min(1, defaultRadius / grassRadius) for explicit-radius scenes
// (GrassSystem.js:1091). Wider radius -> fewer clumps/chunk (per-m^2 ~ constant).
function adjustedClumps(grassRadius) {
  const clumpScale = Math.min(1, DEFAULT_RADIUS / grassRadius);
  return { clumpScale, clumps: Math.max(1, Math.round(CLUMPS_PER_CHUNK_BASE * clumpScale)) };
}

// Replay the coastline chunk-cull: a chunk is kept iff sd >= -chunkSize
// (GrassSystem.js:1131-1133). Grid is worldSize/chunkSize per side, centred on
// `center`. Returns the kept-chunk count.
function countKeptChunks(center, worldSize) {
  const half = worldSize / 2;
  const perSide = Math.ceil(worldSize / CHUNK_SIZE);
  let kept = 0;
  for (let cx = 0; cx < perSide; cx++) {
    for (let cz = 0; cz < perSide; cz++) {
      const ccx = center.x - half + (cx + 0.5) * CHUNK_SIZE;
      const ccz = center.z - half + (cz + 0.5) * CHUNK_SIZE;
      if (sampleSignedDistance(field, ccx, ccz) >= -CHUNK_SIZE) kept++;
    }
  }
  return { kept, perSide, totalCells: perSide * perSide };
}

function cost(label, center, grassRadius, worldSize) {
  const { clumpScale, clumps: clumpsPerChunk } = adjustedClumps(grassRadius);
  const { kept, perSide, totalCells } = countKeptChunks(center, worldSize);
  const clumps = kept * clumpsPerChunk;       // InstancedMesh instances total
  const blades = clumps * BLADES_PER_CLUMP;
  const tris = blades * TRIS_PER_BLADE;
  const instanceMB = (clumps * BYTES_PER_INSTANCE) / 1e6;
  return {
    label, grassRadius, worldSize, gridPerSide: perSide, gridCells: totalCells,
    clumpScale: +clumpScale.toFixed(4), clumpsPerChunk,
    drawCalls_chunks: kept,                    // 1 InstancedMesh per chunk = 1 draw
    instances_clumps: clumps,
    blades, triangles: tris,
    instanceMatrixMB: +instanceMB.toFixed(2),
  };
}

// ---- Current: the shipped 760m play-area disc -------------------------------
const grassRadiusCur = g.grassRadius;                         // 760
const worldSizeCur = Math.max(BASE_WORLD, (grassRadiusCur + 40) * 2); // 1600
const current = cost('current (760m play-area disc)', grassCenter, grassRadiusCur, worldSizeCur);

// ---- Hypothetical: grass the literal whole island ---------------------------
const b = pointsBounds(newsheepdogland.boundary.points);
const islandCenter = { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
const islandSpanX = b.maxX - b.minX;
const islandSpanZ = b.maxZ - b.minZ;
// Radius/worldSize that fully covers the polygon bounds from its centre.
const grassRadiusWhole = Math.max(islandSpanX, islandSpanZ) / 2;
const worldSizeWhole = Math.max(BASE_WORLD, (grassRadiusWhole + 40) * 2);
const whole = cost('whole-island', islandCenter, grassRadiusWhole, worldSizeWhole);

// Shoelace island area (sanity vs the "~3.2 km^2" scene comment).
function polygonArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a) / 2;
}
const islandAreaM2 = polygonArea(newsheepdogland.boundary.points);

const ratio = (a, c) => +(a / c).toFixed(2);
const verdict = {
  drawCallRatio: ratio(whole.drawCalls_chunks, current.drawCalls_chunks),
  bladeRatio: ratio(whole.blades, current.blades),
  instanceRatio: ratio(whole.instances_clumps, current.instances_clumps),
};

// Go/no-go gate: a whole-island rearch is justified only if the CURRENT cost is
// already a problem OR the whole-island cost is reachable within a sane budget
// AND adds gameplay value. The dog only traverses the play area, and meadow-quad
// LOD is OFF for coastline (GrassSystem.js:1143) so every far chunk is full
// clump instancing - whole-island multiplies draw calls with no play benefit.
const DRAW_CALL_BUDGET = 1500; // rough desktop chunk/draw-call comfort ceiling
const recommendation =
  whole.drawCalls_chunks <= DRAW_CALL_BUDGET && verdict.drawCallRatio <= 1.5
    ? 'GO: whole-island fits the draw-call budget; rearch is cheap.'
    : 'NO-GO: keep the 760m play-area disc. Whole-island multiplies draw calls / '
      + 'instances well past budget for ground the dog never traverses, and '
      + 'coastline has no meadow-quad LOD so far chunks would be full-cost. If '
      + 'far scenery is wanted, a cheap far-ring meadow-quad for coastline (not a '
      + 'full GrassSystem rearch) is the lead follow-up - its own spike + cycle.';

const report = {
  scene: 'newsheepdogland',
  generatedBy: 'tools/grass-rearch-spike.mjs (Cycle 68 P5)',
  note: 'Analytical (chunk-cull + clumpScale replay), not a GPU frame-time. '
    + 'GPU validation is the gate for any P6 implementation.',
  islandAreaKm2: +(islandAreaM2 / 1e6).toFixed(2),
  tier: 'high-desktop', bladesPerClump: BLADES_PER_CLUMP, clumpsPerChunkBase: CLUMPS_PER_CHUNK_BASE,
  current,
  whole,
  verdict,
  meadowQuadOnCoastline: false, // GrassSystem.js:1143 - disabled for coastline
  recommendation,
};

mkdirSync('cycle68-validation/grass', { recursive: true });
writeFileSync('cycle68-validation/grass/grass-spike.json', JSON.stringify(report, null, 2));

console.log('=== Grass density/LOD spike: Newsheepdogland ===');
console.log(`island area: ${report.islandAreaKm2} km^2 (scene says ~3.2)`);
console.table([current, whole].map((c) => ({
  approach: c.label, drawCalls: c.drawCalls_chunks, clumps: c.instances_clumps,
  blades: c.blades, triangles: c.triangles, instMB: c.instanceMatrixMB,
})));
console.log('ratios (whole / current):', verdict);
console.log('meadow-quad LOD on coastline:', report.meadowQuadOnCoastline);
console.log('\nRECOMMENDATION:', recommendation);
console.log('\nwrote cycle68-validation/grass/grass-spike.json');
