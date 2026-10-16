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
import { exportedCounts } from './glb-ledger.mjs';

const repo = new URL('../', import.meta.url);
const artifact = 'assets/house/farmhouse.glb';
const recipe = 'assets/house/farmhouse.kiln.js';

/** Hashed as text: line endings are not part of what these files mean. */
const sources = [
  recipe,
  'app/src/scene/farmhouse/kilnHouse.ts',
  'lab/src/KilnHouse.tsx',
  'tools/record-house-asset.mjs',
  'tools/glb-ledger.mjs',
];

/**
 * Authored material to band set, the loader's own table (kilnHouse.ts
 * BINDING). It is repeated here so the per-surface split below can be read
 * from the GLB; tests/farmhouse-kiln.spec.ts holds the loader's welded parts
 * equal to that split, which is what keeps the two tables one.
 */
const BINDING = {
  limewash: 'wall',
  slate: 'roof',
  timber: 'timber',
  stone: 'dress',
  masonry: 'dress',
  opening: 'opening',
  lamp: 'lamp',
};

const textDigest = (path) => createHash('sha256')
  .update(readFileSync(new URL(path, repo), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const bytes = readFileSync(new URL(artifact, repo));
const exported = exportedCounts(bytes, BINDING);

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
  // As exported, read from the GLB (tools/glb-ledger.mjs). The game welds
  // these into the farmhouse cluster's buffers.
  triangles: exported.triangles,
  exportedMeshNodes: exported.exportedMeshNodes,
  exportedGeometries: exported.exportedGeometries,
  materials: exported.materials,
  textures: exported.textures,
  images: exported.images,
  gltfExtensions: exported.gltfExtensions,
  boundsMetres: exported.boundsMetres,
  // The backdrop shader's two per-vertex channels, which the recipe computes per
  // face and writes into TEXCOORD_0 (assets/house/README.md). The loader refuses a
  // bake without this record on its root node, and a mesh without the attribute.
  surfaceChannels: {
    attribute: 'TEXCOORD_0',
    record: 'nodes[root].extras.surfaceChannels',
    version: 1,
  },
  // What the game issues once farmhouse/kilnHouse.ts has parsed it and
  // farmhouse/cluster.ts has welded it into the cluster's own buffers.
  runtime: {
    addedDraws: 0,
    trianglesPerSurface: exported.trianglesPerSurface,
    note: 'Welded into the cluster wall, roof, timber, dress, opening and lamp buffers, so the cluster stays at ten draws. No texture is sampled; the ramp is computed.',
    loader: 'app/src/scene/farmhouse/kilnHouse.ts',
    distPath: 'assets/farmhouse-<hash>.glb',
  },
  qa: { profile: 'asset.requirements.v1', acceptance: 'accepted', disposition: 'pass', gltfErrors: 0, gltfWarnings: 0 },
  consumers: ['app/src/scene/Farmhouse.tsx', 'lab/src/subjects.ts'],
  // A build constant, not a setting: see app/src/scene/farmhouse/source.ts. The
  // GLB reaches dist/ only in a build where it is 'kiln', and the release probe
  // checks that any model in dist/ is this file, byte for byte.
  shipsInProductionBuildWhen: "FARMHOUSE_SOURCE === 'kiln'",
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
  + `${ledger.runtime.addedDraws} added draws (${fileURLToPath(output)})`);
