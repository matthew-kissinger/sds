// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Bake the treeline and meadow-dressing transforms into committed JSON. The
// authored recipes stay in app/src/scene/*/placement modules so the render data
// has one source; this tool bundles and executes those modules in Node. Runtime
// imports only the resulting manifests and never scatters (spec/04).
//
//   node tools/bake-world-placement.mjs
//   node tools/bake-world-placement.mjs --out DIR


import { build } from 'esbuild';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staging = mkdtempSync(join(tmpdir(), 'herd-bake-placement-'));
const entry = join(staging, 'placement-entry.ts');
writeFileSync(
  entry,
  [
    "export { placeTreeline } from '@app/scene/treeline/treePlacement';",
    "export { measureTreeline } from '@app/scene/treeline/diagnostics';",
    "export { rockTransforms, fallenLogTransform, contactSpots } from '@app/scene/scatter/placement';",
    "export { flowerBlooms } from '@app/scene/scatter/flowerPlacement';",
    "export { decodeHeightfield } from '@app/world/heightfieldSampler';",
  ].join('\n'),
);
const bundle = join(staging, 'placement.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  alias: {
    '@app': join(repo, 'app', 'src'),
    '@sim': join(repo, 'sim'),
  },
});

const recipe = await import(pathToFileURL(bundle).href);
const terrainManifest = JSON.parse(
  readFileSync(join(repo, 'assets', 'terrain', 'manifest.json'), 'utf8'),
);
const terrainBytes = readFileSync(join(repo, 'assets', 'terrain', 'heightfield.bin'));
const terrain = recipe.decodeHeightfield(
  terrainBytes.buffer.slice(terrainBytes.byteOffset, terrainBytes.byteOffset + terrainBytes.byteLength),
  terrainManifest,
);

const treeline = recipe.placeTreeline(terrain);
const treelineDiagnostics = recipe.measureTreeline(treeline, terrain);
const rocks = recipe.rockTransforms(terrain);
const flowers = recipe.flowerBlooms(terrain);
const log = recipe.fallenLogTransform(terrain);
const contacts = recipe.contactSpots(rocks, log);

/** Six decimals is sub-millimetre placement resolution and keeps the committed
 * JSON compact. Collapse negative zero so equivalent transforms are one byte. */
function stable(value) {
  if (typeof value === 'number') {
    const rounded = Math.round(value * 1_000_000) / 1_000_000;
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

const treelineManifest = stable({
  version: 3,
  recipe: 'tools/bake-world-placement.mjs',
  terrainSeed: terrainManifest.seed,
  ...treeline,
});
const scatterManifest = stable({
  version: 1,
  recipe: 'tools/bake-world-placement.mjs',
  terrainSeed: terrainManifest.seed,
  rocks,
  flowers,
  log,
  contacts,
});

const outFlag = process.argv.indexOf('--out');
const root = outFlag === -1 ? join(repo, 'assets') : resolve(process.argv[outFlag + 1]);
const treelineDir = join(root, 'treeline');
const scatterDir = join(root, 'scatter');
mkdirSync(treelineDir, { recursive: true });
mkdirSync(scatterDir, { recursive: true });
writeFileSync(join(treelineDir, 'manifest.json'), `${JSON.stringify(treelineManifest, null, 2)}\n`);
writeFileSync(join(scatterDir, 'manifest.json'), `${JSON.stringify(scatterManifest, null, 2)}\n`);

console.log(
  `baked ${treeline.canopies.length} single canopies, ${treeline.shrubs.length} shrubs, ` +
    `${treeline.trunks.length} wood instances, ` +
    `${rocks.length} rocks and ${flowers.length} flowers; ` +
    `root ground ${treelineDiagnostics.treeGroundErrorMax.toFixed(3)} m, ` +
    `support ${treelineDiagnostics.treeSupportGapMax.toFixed(3)} m, ` +
    `unsupported ${treelineDiagnostics.treeUnsupported}, ` +
    `vertical drift ${treelineDiagnostics.treeVerticalDriftMax.toFixed(3)} m; ` +
    `rooted crowns ${treelineDiagnostics.treeRootedCrownCount} ` +
    `[${treelineDiagnostics.treeBeltCounts.join('/')}], ` +
    `leader depth ${treelineDiagnostics.treeLeaderPenetrationMin.toFixed(3)}, ` +
    `wood envelope ${treelineDiagnostics.treeLeaderEnvelopeMax.toFixed(3)}/` +
    `${treelineDiagnostics.treeBranchEnvelopeMax.toFixed(3)}, ` +
    `family envelope ${treelineDiagnostics.treeBranchEnvelopeByFamily.map((value) => value.toFixed(3)).join('/')}, ` +
    `branch y ${treelineDiagnostics.treeBranchLocalYMinByFamily.map((value) => value.toFixed(3)).join('/')}-` +
    `${treelineDiagnostics.treeBranchLocalYMaxByFamily.map((value) => value.toFixed(3)).join('/')}, ` +
    `exposed ${treelineDiagnostics.treeExposedWoodTips} ` +
    `[${treelineDiagnostics.treeExposedWoodByFamily.join('/')}], ` +
    `single-surface violations ${treelineDiagnostics.treeSingleCanopyViolations}, ` +
    `gaps ${treelineDiagnostics.treeMaxGapDegrees.map((value) => value.toFixed(1)).join('/')}, ` +
    `composite gaps ${treelineDiagnostics.treeCompositeMaxGapDegrees.toFixed(1)}/` +
    `${treelineDiagnostics.treeCompositeSecondGapDegrees.toFixed(1)}, ` +
    `near accidental gap ${treelineDiagnostics.treeNearNonAuthoredMaxGapDegrees.toFixed(1)}, ` +
    `near crown contact ${(treelineDiagnostics.treeNearCrownTouchShare * 100).toFixed(1)}%, ` +
    `windswept crown bias ${(treelineDiagnostics.treeWindsweptCrownDownwindMinShare * 100).toFixed(1)}%, ` +
    `shrub root gap ${treelineDiagnostics.treeShrubRootGapMax.toFixed(3)} m, ` +
    `detached shrubs ${treelineDiagnostics.treeShrubDetached}, ` +
    `shrub burial ${treelineDiagnostics.treeShrubBurialMin.toFixed(3)}-` +
    `${treelineDiagnostics.treeShrubBurialMax.toFixed(3)}, ` +
    `shrub height ${(treelineDiagnostics.treeShrubHeightShareMax * 100).toFixed(1)}%`,
);
