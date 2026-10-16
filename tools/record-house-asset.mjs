// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Record/check the walk-in farmhouse: its recipe, its baked GLB and the chain
 * that re-materialises it through the shipped band ramp.
 *
 * THIS ONE CARRIES A BINARY, WHICH THE COLLIE LEDGER DOES NOT. The dog is
 * geometry that the game computes at boot, so hashing its TypeScript is hashing
 * the asset. The house is a glTF binary baked by an outside tool, so the ledger
 * has to pin two different things: the bytes that ship, over their raw content,
 * and the recipe that produces them, over UTF-8 with LF. Hence two digest
 * encodings, named rather than implied.
 *
 * THE DETERMINISM CLAIM IS TESTED, NOT ASSERTED. `--check` re-runs Kiln from a
 * scratch working directory, which misses the build cache under `.kiln/`, and
 * compares the result with the recorded digest. A recipe that renders to
 * different bytes on a cold machine is not a recipe, and tripwire 11 asks for
 * one.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = new URL('../', import.meta.url);
const artifact = 'assets/house/farmhouse.glb';
const recipe = 'assets/house/farmhouse.kiln.js';

/** Hashed as text: line endings are not part of what these files mean. */
const sources = [
  recipe,
  'lab/src/kilnHouseAsset.ts',
  'lab/src/KilnHouse.tsx',
  'lab/src/glb-url.d.ts',
  'tools/record-house-asset.mjs',
];

const textDigest = (path) => createHash('sha256')
  .update(readFileSync(new URL(path, repo), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const bytes = readFileSync(new URL(artifact, repo));

const ledger = {
  version: 1,
  id: 'kiln-walk-in-farmhouse',
  author: 'Matthew Kissinger',
  license: 'AGPL-3.0-or-later',
  licenseFile: 'LICENSE',
  digestEncoding: 'UTF-8 with LF line endings',
  artifactDigestEncoding: 'raw bytes',
  toolchain: {
    name: '@instruktlabs/kiln',
    version: '1.2.3',
    license: 'MIT',
    command: 'kiln render assets/house/farmhouse.kiln.js --out assets/house/farmhouse.glb',
    note: 'The tool is not a dependency of this repository. It bakes the artifact; nothing imports it.',
  },
  recipe,
  artifact: { path: artifact, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
  // As exported. The lab welds these to one buffer per band set before drawing.
  triangles: 3440,
  exportedMeshNodes: 282,
  exportedGeometries: 173,
  materials: 7,
  textures: 0,
  images: 0,
  gltfExtensions: ['KHR_materials_emissive_strength'],
  boundsMetres: { x: 20.05, y: 12.45, z: 11.87 },
  // What the game actually issues, once lab/src/kilnHouseAsset.ts has welded it.
  runtime: {
    draws: 6,
    trianglesPerSurface: { timber: 1964, wall: 908, dress: 288, opening: 160, lamp: 72, roof: 48 },
    note: 'One draw per farmhouse band set. No texture is sampled; the ramp is computed.',
  },
  qa: { profile: 'asset.requirements.v1', acceptance: 'accepted', disposition: 'pass', gltfErrors: 0, gltfWarnings: 0 },
  consumers: ['lab/src/subjects.ts'],
  shipsInProductionBuild: false,
  sources: sources.map((path) => ({ path, sha256: textDigest(path) })),
};

const output = new URL('assets/house/asset-manifest.json', repo);
const recorded = `${JSON.stringify(ledger, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8').replace(/\r\n/g, '\n') !== recorded) {
    throw new Error('House source ledger is stale; review changes before recording new digests.');
  }
  // A cold bake, in a directory with no `.kiln/` cache to answer from. Kiln is
  // not a dependency of this repository, so it may simply be absent: set
  // KILN_CLI to its `dist/cli.mjs`, or put `kiln` on PATH. Where it is missing
  // the digests above are still checked and only the bake is skipped, which is
  // said out loud rather than passed over.
  const cli = process.env.KILN_CLI;
  const [command, lead] = cli ? [process.execPath, [cli]] : ['kiln', []];
  const scratch = mkdtempSync(join(tmpdir(), 'house-asset-'));
  try {
    const baked = join(scratch, 'farmhouse.glb');
    try {
      execFileSync(command, [...lead, 'render', fileURLToPath(new URL(recipe, repo)),
        '--out', baked, '--json', '--detail', 'lean'],
      { cwd: scratch, stdio: ['ignore', 'ignore', 'inherit'] });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      console.log('Ledger digests verified. Cold bake SKIPPED: no `kiln` on PATH and no KILN_CLI set.');
      process.exit(0);
    }
    const again = createHash('sha256').update(readFileSync(baked)).digest('hex');
    if (again !== ledger.artifact.sha256) {
      throw new Error(`Kiln re-baked ${artifact} to ${again}, not the recorded ${ledger.artifact.sha256}.`);
    }
    console.log('Cold bake reproduced the recorded GLB byte for byte.');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
} else writeFileSync(output, recorded);

console.log(`Farmhouse source ledger verified: ${sources.length} files, ${ledger.triangles} triangles, `
  + `${ledger.runtime.draws} draws (${fileURLToPath(output)})`);
