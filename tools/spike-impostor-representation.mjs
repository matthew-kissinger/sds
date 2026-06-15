// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cycle 101 Phase 1 spike - representation decision (renderless half).
// Answers the numeric side of Q1 (latlon-hemi vs octahedral), Q2 (depth
// channel), Q4 (resolution/VRAM): tile-selection correctness via the orbit
// lab + the atlas weight / decoded-VRAM matrix from on-disk artifacts. The
// visual quality A/B (does octahedral read better at far distance, does a
// 128px tile hold) is a separate render step - this script does not render.
//
//   node tools/spike-impostor-representation.mjs
//
// Writes cycle101-validation/spike-representation.json (gitignored).

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImpostorOrbitLabReport } from '../js/impostors/impostorOrbitLab.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TREES = join(ROOT, 'assets/models/trees');
const OUT = join(ROOT, 'cycle101-validation/spike-representation.json');

const sizeOf = (p) => { try { return statSync(p).size; } catch { return null; } };
const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const kb = (b) => (b == null ? null : Math.round(b / 1024));
const mb = (b) => (b == null ? null : Math.round((b / 1048576) * 100) / 100);

// BC7 / UASTC LDR decodes to 8 bits per texel = 1 byte/texel, no mips (the
// pipeline bakes mip-free atlases). So decoded VRAM per layer = w*h*1.
const vramBytesPerLayer = (sc) => (sc.atlasWidth ?? 2048) * (sc.atlasHeight ?? 2048);

const latlon = { tree1: loadJson(join(TREES, 'tree1.imposter.json')), tree2: loadJson(join(TREES, 'tree2.imposter.json')) };
const octa = { tree1: loadJson(join(TREES, 'octahedral/tree1.imposter.json')), tree2: loadJson(join(TREES, 'octahedral/tree2.imposter.json')) };

// --- tile-selection correctness (renderless orbit lab) ---
const latlonReport = createImpostorOrbitLabReport({ sidecar: latlon.tree1, layouts: ['latlon-hemi-y'] });
const octaReport = createImpostorOrbitLabReport({ sidecar: octa.tree1, layouts: ['octahedral'] });

const selectionCorrectness = {
  'latlon-hemi-y': {
    tilesX: latlon.tree1.tilesX, tilesY: latlon.tree1.tilesY, views: latlon.tree1.tilesX * latlon.tree1.tilesY,
    samples: latlonReport.layouts['latlon-hemi-y'].sampleCount,
    uniqueTriads: latlonReport.layouts['latlon-hemi-y'].uniqueTriadCount,
    uniqueDominantTiles: latlonReport.layouts['latlon-hemi-y'].uniqueDominantTileCount,
    weightsNormalized: latlonReport.layouts['latlon-hemi-y'].weightsNormalized,
  },
  octahedral: {
    tilesX: octa.tree1.tilesX, tilesY: octa.tree1.tilesY, views: octa.tree1.tilesX * octa.tree1.tilesY,
    samples: octaReport.layouts.octahedral.sampleCount,
    uniqueTriads: octaReport.layouts.octahedral.uniqueTriadCount,
    uniqueDominantTiles: octaReport.layouts.octahedral.uniqueDominantTileCount,
    weightsNormalized: octaReport.layouts.octahedral.weightsNormalized,
  },
};

// --- weight / VRAM matrix ---
// latlon ships KTX2 (wire = ktx2 bytes). octahedral source is PNG only (never
// KTX2-encoded; dropped from dist C98) - its KTX2 wire is un-measured but the
// DECODED VRAM is identical to latlon (same 2048^2), which is the real budget.
const layerFiles = (base, subdir) => ({
  albedo: { png: sizeOf(join(TREES, subdir, base + '.imposter.png')), ktx2: sizeOf(join(TREES, subdir, base + '.imposter.ktx2')) },
  normal: { png: sizeOf(join(TREES, subdir, base + '.imposter.normal.png')), ktx2: sizeOf(join(TREES, subdir, base + '.imposter.normal.ktx2')) },
  depth: { png: sizeOf(join(TREES, subdir, base + '.imposter.depth.png')), ktx2: sizeOf(join(TREES, subdir, base + '.imposter.depth.ktx2')) },
});

const wire = {
  'latlon-hemi-y (shipping, ktx2)': {
    tree1: layerFiles('tree1', '.'), tree2: layerFiles('tree2', '.'),
  },
  'octahedral (source, png only)': {
    tree1: layerFiles('tree1', 'octahedral'), tree2: layerFiles('tree2', 'octahedral'),
  },
};

const sumKtx2 = (t, withDepth) =>
  (t.albedo.ktx2 ?? 0) + (t.normal.ktx2 ?? 0) + (withDepth ? (t.depth.ktx2 ?? 0) : 0);

const shippingKtx2 = wire['latlon-hemi-y (shipping, ktx2)'];
const wireSummaryKtx2 = {
  bothTrees_withDepth_KB: kb(sumKtx2(shippingKtx2.tree1, true) + sumKtx2(shippingKtx2.tree2, true)),
  bothTrees_noDepth_KB: kb(sumKtx2(shippingKtx2.tree1, false) + sumKtx2(shippingKtx2.tree2, false)),
  depthDropSaving_KB: kb((shippingKtx2.tree1.depth.ktx2 ?? 0) + (shippingKtx2.tree2.depth.ktx2 ?? 0)),
};

// VRAM (BC7, 1 byte/texel, both trees)
const vramMatrix = {
  'latlon 2048^2, 3 layers (current)': mb(vramBytesPerLayer(latlon.tree1) * 3 * 2),
  'latlon 2048^2, 2 layers (drop depth)': mb(vramBytesPerLayer(latlon.tree1) * 2 * 2),
  'octahedral 2048^2, 2 layers (8x8@256)': mb(2048 * 2048 * 2 * 2),
  'octahedral 1024^2, 2 layers (8x8@128, pixel-forge tree size)': mb(1024 * 1024 * 2 * 2),
};

const report = {
  source: 'Cycle 101 Phase 1 spike (renderless): impostor representation',
  generated: 'run-stamped after the fact (Date.now avoided per deterministic-tooling rule)',
  selectionCorrectness,
  wire,
  wireSummaryKtx2,
  vramMatrix_MB: vramMatrix,
  notes: [
    'Octahedral 8x8@256 and latlon 4x4@512 are BOTH 2048^2 atlases: identical decoded VRAM, ~equal wire; octahedral buys 64 views vs 16 (4x angular coverage) at no weight cost.',
    'Octahedral source ships no KTX2 (PNG only, dropped from dist C98). Its KTX2 wire is un-measured; measure in Phase 2 at bake time. VRAM parity holds regardless.',
    'Depth layer is read only by the debug kiln material (kiln-impostor-material.js:794); the production consolidated far path loads albedo only (TreePlacement.js:948). Dropping depth is free on every shipping path.',
    'VRAM uses BC7 = 1 byte/texel, no mips. 1024^2 octahedral (pixel-forge shipped tree size) is a 4x VRAM cut vs 2048^2 - pending a visual check that 128px/tile holds at the far distance.',
  ],
};

writeFileSync(OUT, JSON.stringify(report, null, 2));

console.log('=== Tile-selection correctness (renderless orbit lab, 12 orbit poses) ===');
for (const [layout, c] of Object.entries(selectionCorrectness)) {
  console.log(`  ${layout}: ${c.views} views (${c.tilesX}x${c.tilesY}) | uniqueDominantTiles ${c.uniqueDominantTiles}/${c.samples} | uniqueTriads ${c.uniqueTriads} | weightsNormalized ${c.weightsNormalized}`);
}
console.log('\n=== Wire (KTX2, both trees, shipping latlon) ===');
console.log(`  with depth: ${wireSummaryKtx2.bothTrees_withDepth_KB} KB | no depth: ${wireSummaryKtx2.bothTrees_noDepth_KB} KB | depth-drop saves ${wireSummaryKtx2.depthDropSaving_KB} KB`);
console.log('\n=== Decoded VRAM (BC7, both trees) ===');
for (const [k, v] of Object.entries(vramMatrix)) console.log(`  ${v} MB  ${k}`);
console.log(`\nWrote ${OUT}`);
