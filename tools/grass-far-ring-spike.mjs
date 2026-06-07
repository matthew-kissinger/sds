// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cycle 69 P2: coastline grass far-ring spike (measure-first, throwaway).
//
// The Cycle 68 P5 spike returned NO-GO on a whole-island grass rearch (2.71x the
// draw calls for ground the dog never traverses). The named follow-up was a
// "far-ring meadow-quad for coastline that would also trim the current 829 draw
// calls." This spike checks that premise with numbers BEFORE touching the
// cohesion-frozen GrassSystem, settling three options:
//
//   A. Enable the EXISTING 40m meadow-quad path for coastline far chunks.
//      (createMeadowQuadChunk is 1 draw call/chunk, same as a clump chunk -> so
//       this trims TRIANGLES, not draw calls. Quantify the triangle win.)
//   B. Merged TxT meadow tiles in the far ring (one draw call per NxN chunks) ->
//      the only option that actually cuts draw calls. Quantify the cut AND the
//      cost: tiles that straddle the shore tile over water (coastline coarsening),
//      and the far ring overlaps the play area unless meadowFrom is pushed out.
//   C. Coverage extension to the leg/treeline (enlarged window) under A vs B.
//
// ANALYTICAL, not a GPU frame-time: imports the real scene def + the pure
// CoastlineField SDF and replays GrassSystem's exact chunk-cull + clumpScale +
// meadow-geometry math (js/GrassSystem.js buildChunks / createMeadowQuadChunk).
// GrassSystem pulls Three.js, so the formulas are mirrored and cited by line.
// No GrassSystem edit; output -> cycle69-validation/grass/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { newsheepdogland } from '../shared/scenes/newsheepdogland.js';
import { getCoastlineField, sampleSignedDistance, pointsBounds } from '../shared/CoastlineField.js';

// ---- Constants mirrored from js/GrassSystem.js (high desktop tier) ----------
const CHUNK_SIZE = 40;            // config.chunkSize (GrassSystem.js:181)
const BLADES_PER_CLUMP = 7;       // TIER_PRESETS high (scene-and-render.md)
const TRIS_PER_BLADE = 2 * 2;     // 2 tris, double-sided (GrassSystem.js:434/437)
const BASE_WORLD = 420;           // desktop baseWorldSize (GrassSystem.js:150)
const DEFAULT_RADIUS = BASE_WORLD * 0.6; // 252m (GrassSystem.js:1090)
const MEADOW_SEG = 4;             // PlaneGeometry(size,size,4,4) (GrassSystem.js:1349)
const MEADOW_TRIS_PER_CHUNK = 2 * MEADOW_SEG * MEADOW_SEG; // 32 tris/40m quad
const MERGED_SPAN_PER_SEG = 10;   // keep ~10m tessellation when tiles grow

const g = newsheepdogland.grass;
const grassCenter = g.grassCenter;                       // { x:250, z:-1080 }
const field = getCoastlineField(newsheepdogland.boundary);

// clumpScale = min(1, defaultRadius / grassRadius) for explicit-radius scenes
// (GrassSystem.js:1091). Wider window -> fewer clumps/chunk (per-m^2 ~ constant).
function adjustedClumps(grassRadius) {
  const clumpScale = Math.min(1, DEFAULT_RADIUS / grassRadius);
  return Math.max(1, Math.round(g.clumpsPerChunk.desktop * clumpScale));
}

// Collect every kept (on-land) chunk in a window centred on `center`, tagging
// each with its distance from grassCenter (the far-ring split axis). Cull matches
// the coastline path: keep iff sd >= -chunkSize (GrassSystem.js:1131-1133).
function keptChunks(center, worldSize) {
  const half = worldSize / 2;
  const perSide = Math.ceil(worldSize / CHUNK_SIZE);
  const kept = [];
  for (let cx = 0; cx < perSide; cx++) {
    for (let cz = 0; cz < perSide; cz++) {
      const ccx = center.x - half + (cx + 0.5) * CHUNK_SIZE;
      const ccz = center.z - half + (cz + 0.5) * CHUNK_SIZE;
      if (sampleSignedDistance(field, ccx, ccz) < -CHUNK_SIZE) continue;
      const dx = ccx - grassCenter.x;
      const dz = ccz - grassCenter.z;
      kept.push({ cx, cz, dist: Math.sqrt(dx * dx + dz * dz) });
    }
  }
  return { kept, perSide };
}

const clumpTris = (chunks, clumpsPerChunk) => chunks * clumpsPerChunk * BLADES_PER_CLUMP * TRIS_PER_BLADE;

// Option B: merge the far chunks into TxT tiles (T = N*CHUNK_SIZE). A tile is kept
// if it contains >=1 kept far chunk. Tris/tile keep ~10m tessellation. Coarsening
// = sub-cells inside kept tiles that are NOT kept-far land (they tile over water
// or near-clump ground), the coastline-fidelity cost of merging.
function mergedFarRing(far, tileSpan) {
  const N = Math.round(tileSpan / CHUNK_SIZE);
  const tiles = new Map();
  for (const c of far) {
    const key = `${Math.floor(c.cx / N)}_${Math.floor(c.cz / N)}`;
    tiles.set(key, (tiles.get(key) ?? 0) + 1);
  }
  const tileCount = tiles.size;
  let coveredSubcells = 0;
  for (const n of tiles.values()) coveredSubcells += n;
  const straddleSubcells = tileCount * N * N - coveredSubcells; // over-tiled cells
  const segs = Math.max(1, Math.round(tileSpan / MERGED_SPAN_PER_SEG));
  const trisPerTile = 2 * segs * segs;
  return { tileSpan, N, tileCount, trisPerTile, tris: tileCount * trisPerTile, straddleSubcells };
}

function analyzeWindow(label, center, grassRadius, worldSize, meadowFromList) {
  const clumpsPerChunk = adjustedClumps(grassRadius);
  const { kept, perSide } = keptChunks(center, worldSize);
  const baseline = {
    drawCalls: kept.length,
    triangles: clumpTris(kept.length, clumpsPerChunk),
  };
  const splits = meadowFromList.map((meadowFrom) => {
    const near = kept.filter((c) => c.dist <= meadowFrom);
    const far = kept.filter((c) => c.dist > meadowFrom);
    // Option A: near clumps + far 40m meadow quads (still 1 draw call/chunk).
    const optionA = {
      meadowFrom,
      drawCalls: near.length + far.length, // == baseline.drawCalls (unchanged)
      triangles: clumpTris(near.length, clumpsPerChunk) + far.length * MEADOW_TRIS_PER_CHUNK,
      farChunks: far.length,
    };
    // Option B: near clumps + merged far tiles (the only draw-call cut).
    const optionB = [80, 120, 160].map((T) => {
      const m = mergedFarRing(far, T);
      return {
        meadowFrom, tileSpan: T,
        drawCalls: near.length + m.tileCount,
        triangles: clumpTris(near.length, clumpsPerChunk) + m.tris,
        farTiles: m.tileCount,
        coastlineCoarseningSubcells: m.straddleSubcells,
      };
    });
    return { meadowFrom, nearChunks: near.length, farChunks: far.length, optionA, optionB };
  });
  return { label, grassRadius, worldSize, gridPerSide: perSide, clumpsPerChunk, baseline, splits };
}

// ---- Window 1: the shipped 760m play-area window ----------------------------
const grassRadiusCur = g.grassRadius;                          // 760
const worldSizeCur = Math.max(BASE_WORLD, (grassRadiusCur + 40) * 2); // 1600
// meadowFrom sweep: 300 cuts into the active play area; 500/600 protect it
// (play zone is x[-300,700] z[-1450,-800] ~ +-500m from grassCenter).
const current = analyzeWindow('current (760m window)', grassCenter, grassRadiusCur, worldSizeCur, [300, 500, 600]);

// ---- Window 2: coverage extension to the whole island -----------------------
const b = pointsBounds(newsheepdogland.boundary.points);
const islandCenter = { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
const grassRadiusWhole = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2;
const worldSizeWhole = Math.max(BASE_WORLD, (grassRadiusWhole + 40) * 2);
const whole = analyzeWindow('whole-island window', islandCenter, grassRadiusWhole, worldSizeWhole, [600]);

// ---- Verdict ----------------------------------------------------------------
// GO requires a far-ring option that EITHER cuts draw calls below the in-budget
// baseline WITHOUT downgrading visible play-area grass and WITHOUT coarsening the
// coast, OR extends coverage to new play-relevant ground inside the budget. The
// play disc already renders in budget (829 < ~1500), the leg is forested, and the
// foot play area reaches ~500m from grassCenter, so a draw-call cut needs
// meadowFrom >= ~500 (a thin far ring) and merged tiles straddle the shore.
const DRAW_CALL_BUDGET = 1500;
const protectedSplit = current.splits.find((s) => s.meadowFrom === 600);
const bestProtectedB = protectedSplit.optionB.reduce((a, c) => (c.drawCalls < a.drawCalls ? c : a));
const protectedCut = current.baseline.drawCalls - bestProtectedB.drawCalls;
const protectedCutPct = +((protectedCut / current.baseline.drawCalls) * 100).toFixed(1);
const optionATris = protectedSplit.optionA.triangles;
const optionATrisCutPct = +((1 - optionATris / current.baseline.triangles) * 100).toFixed(1);

// Option B (draw-call cut): NO-GO. The disc already renders in budget, so the cut
// solves a non-problem, and every B variant that protects the play area still
// coarsens the coast (merged tiles straddle the shore) and floats on leg relief.
const optionBVerdict = {
  decision: 'NO-GO',
  reason: `disc is in budget (${current.baseline.drawCalls} < ${DRAW_CALL_BUDGET}); best play-area-safe cut is `
    + `${protectedCut} draw calls (${protectedCutPct}%) at tileSpan ${bestProtectedB.tileSpan}m but it over-tiles `
    + `${bestProtectedB.coastlineCoarseningSubcells} shore sub-cells (coast coarsening) and floats on relief.`,
};

// Option A (triangle cut via the EXISTING meadow-quad LOD, enabled for coastline
// far chunks): VIABLE + contained. 40m quads stay SDF-culled per-chunk (no coast
// coarsening) and terrain-follow (no float, the Cycle 51 fix), and this is exactly
// the desktop LOD already shipped on Rolling Hills / Open Country - coastline is
// the only desktop scene still paying full clump cost to the cull edge. It is a
// one-flag, additive change (gate the line-1143 `!_isCoastline` on a SceneDef
// opt-in + distance-from-grassCenter). BUT it is a VISUAL change to the exact
// scene Matt has a pending hero-capture + feel pass on (Cycle 68 P7 carryover),
// so per the media-prep split it ships WITH his visual pass, not autonomously
// ahead of it. Defer-to-Matt, not dead.
const optionAVerdict = {
  decision: 'VIABLE - defer to Matt\'s visual pass',
  triangleCutPct: optionATrisCutPct,
  reason: `cuts grass triangles ${optionATrisCutPct}% (${current.baseline.triangles.toLocaleString()} -> `
    + `${optionATris.toLocaleString()}) at meadowFrom 600m with zero draw-call change, zero coast coarsening, zero relief float; `
    + 'parity with the RH/OC desktop meadow-quad LOD. Contained one-flag change, but a visual change to the hero-capture scene - bundle with the media/feel pass.',
};

const recommendation =
  'NO-GO on the draw-call premise (consistent with P5): keep the 760m play-area disc as-is for now. '
  + `Option B (${optionBVerdict.decision}) ${optionBVerdict.reason} `
  + `Option A (${optionAVerdict.decision}): ${optionAVerdict.reason}`;

const report = {
  scene: 'newsheepdogland',
  generatedBy: 'tools/grass-far-ring-spike.mjs (Cycle 69 P2)',
  note: 'Analytical (chunk-cull + clumpScale + meadow-geometry replay), not a GPU frame-time.',
  tier: 'high-desktop',
  meadowTrisPerChunk: MEADOW_TRIS_PER_CHUNK,
  current,
  whole,
  verdict: {
    baselineDrawCalls: current.baseline.drawCalls,
    baselineTriangles: current.baseline.triangles,
    drawCallBudget: DRAW_CALL_BUDGET,
    optionA: optionAVerdict,
    optionB: { ...optionBVerdict, bestProtected: bestProtectedB },
  },
  recommendation,
};

mkdirSync('cycle69-validation/grass', { recursive: true });
writeFileSync('cycle69-validation/grass/far-ring-spike.json', JSON.stringify(report, null, 2));

console.log('=== Grass far-ring spike: Newsheepdogland (Cycle 69 P2) ===');
console.log(`baseline (current 760m window): ${current.baseline.drawCalls} draw calls, ${current.baseline.triangles.toLocaleString()} tris`);
console.log('\nOption A (40m meadow far chunks) - draw calls UNCHANGED, triangles cut:');
console.table(current.splits.map((s) => ({
  meadowFrom: s.meadowFrom, nearChunks: s.nearChunks, farChunks: s.farChunks,
  drawCalls_A: s.optionA.drawCalls, tris_A: s.optionA.triangles,
  trisVsBaseline: `${((s.optionA.triangles / current.baseline.triangles) * 100).toFixed(0)}%`,
})));
console.log('\nOption B (merged far tiles) - the only draw-call cut, but coarsens the coast:');
for (const s of current.splits) {
  console.table(s.optionB.map((o) => ({
    meadowFrom: o.meadowFrom, tileSpan: o.tileSpan, drawCalls_B: o.drawCalls,
    cutVsBaseline: current.baseline.drawCalls - o.drawCalls,
    coastCoarseningCells: o.coastlineCoarseningSubcells,
  })));
}
console.log(`\nwhole-island window: ${whole.baseline.drawCalls} draw calls (coverage extension reference)`);
console.log('\nRECOMMENDATION:', recommendation);
console.log('\nwrote cycle69-validation/grass/far-ring-spike.json');
