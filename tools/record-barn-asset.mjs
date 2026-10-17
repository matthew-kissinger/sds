// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Record/check the Kiln barn: its recipe, its baked GLB and the chain that
 * re-materialises it through the shipped band ramp.
 *
 * THIS IS THE FARMHOUSE LEDGER'S TOOL FOR A SECOND BUILDING
 * (record-house-asset.mjs), field for field, so that the two can fold into one
 * table the way their loaders will. It pins the bytes that ship, over their raw
 * content, and the recipe that produces them, over UTF-8 with LF, and names
 * both encodings.
 *
 * THE BARN CARRIES TWO RECORDS THE HOUSE DOES NOT YET. Beside the surface
 * channels, the recipe writes the masses its outline is grown from
 * (`outlineEnvelope`) and the ground it stands on (`footprint`) into the root
 * node's extras. The loader refuses a bake without the envelope; the footprint
 * is repeated in plan.ts for the grass bake, which runs before any GLB is read,
 * and tests/barn-kiln.spec.ts holds the two equal, and holds the counts below to
 * the bake.
 *
 * THE DETERMINISM CLAIM IS TESTED, NOT ASSERTED. `--check` re-runs Kiln from a
 * scratch working directory, which misses the build cache under `.kiln/`, and
 * compares the result with the recorded digest.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportedCounts } from './glb-ledger.mjs';

const repo = new URL('../', import.meta.url);
const artifact = 'assets/barn/barn.glb';
const recipe = 'assets/barn/barn.kiln.js';

/** Hashed as text: line endings are not part of what these files mean. */
const sources = [
  recipe,
  'app/src/scene/farmhouse/kilnBarn.ts',
  'lab/src/KilnBarn.tsx',
  'tools/record-barn-asset.mjs',
  'tools/glb-ledger.mjs',
];

/**
 * Authored material to band set, the loader's own table (kilnBarn.ts
 * BINDING), repeated so the per-surface split can be read from the GLB;
 * tests/barn-kiln.spec.ts holds the loader's welded parts equal to it.
 */
const BINDING = {
  boards: 'barn',
  slate: 'roof',
  timber: 'timber',
  stone: 'dress',
  opening: 'opening',
  lamp: 'lamp',
};

const textDigest = (path) => createHash('sha256')
  .update(readFileSync(new URL(path, repo), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const bytes = readFileSync(new URL(artifact, repo));
const exported = exportedCounts(bytes, BINDING);

const ledger = {
  version: 1,
  id: 'kiln-threshing-barn',
  author: 'Matthew Kissinger',
  license: 'AGPL-3.0-or-later',
  licenseFile: 'LICENSE',
  digestEncoding: 'UTF-8 with LF line endings',
  artifactDigestEncoding: 'raw bytes',
  toolchain: {
    name: '@instruktlabs/kiln',
    version: '1.3.0',
    license: 'MIT',
    command: 'kiln render assets/barn/barn.kiln.js --out assets/barn/barn.glb',
    note: 'The tool is not a dependency of this repository. It bakes the artifact; nothing imports it.',
  },
  recipe,
  artifact: { path: artifact, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
  // As exported, read from the GLB (tools/glb-ledger.mjs). The game welds
  // these into the farmhouse cluster's buffers.
  triangles: exported.triangles,
  triangleBudget: 2800,
  exportedMeshNodes: exported.exportedMeshNodes,
  exportedGeometries: exported.exportedGeometries,
  materials: exported.materials,
  textures: exported.textures,
  images: exported.images,
  gltfExtensions: exported.gltfExtensions,
  boundsMetres: exported.boundsMetres,
  // The backdrop shader's two per-vertex channels, which the recipe computes per
  // face and writes into TEXCOORD_0 (assets/barn/README.md). The loader refuses a
  // bake without this record on its root node, and a mesh without the attribute.
  surfaceChannels: {
    attribute: 'TEXCOORD_0',
    record: 'nodes[root].extras.surfaceChannels',
    version: 1,
  },
  // The slab, wall and cupola masses the inverted-hull outline is grown from
  // (farmhouse/hull.ts envelopeHull). The loader refuses a bake without it.
  outlineEnvelope: {
    record: 'nodes[root].extras.outlineEnvelope',
    version: 1,
  },
  // Where the barn meets the ground, in its own frame. plan.ts repeats it as
  // KILN_BARN_FOOTPRINT for the grass bake; the barn spec holds the two equal.
  footprint: {
    record: 'nodes[root].extras.footprint',
    repeatedAs: 'app/src/scene/farmhouse/plan.ts KILN_BARN_FOOTPRINT',
  },
  // What the game issues once farmhouse/kilnBarn.ts has parsed it and
  // farmhouse/cluster.ts has welded it into the cluster's own buffers.
  runtime: {
    addedDraws: 0,
    trianglesPerSurface: exported.trianglesPerSurface,
    note: 'Welded into the cluster barn, roof, timber, dress, opening and lamp buffers, so the cluster stays at ten draws. No texture is sampled; the ramp is computed.',
    loader: 'app/src/scene/farmhouse/kilnBarn.ts',
    distPath: 'assets/barn-<hash>.glb',
  },
  qa: { profile: 'asset.requirements.v1', acceptance: 'accepted', disposition: 'pass', gltfErrors: 0, gltfWarnings: 0 },
  consumers: ['app/src/scene/Farmhouse.tsx', 'lab/src/subjects.ts'],
  // A build constant, not a setting: see app/src/scene/farmhouse/barnSource.ts.
  // The GLB reaches dist/ only in a build where it is 'kiln', and the release
  // probe checks that any model in dist/ is a recorded file, byte for byte.
  shipsInProductionBuildWhen: "BARN_SOURCE === 'kiln'",
  sources: sources.map((path) => ({ path, sha256: textDigest(path) })),
};

const output = new URL('assets/barn/asset-manifest.json', repo);
const recorded = `${JSON.stringify(ledger, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8').replace(/\r\n/g, '\n') !== recorded) {
    throw new Error('Barn source ledger is stale; review changes before recording new digests.');
  }
  // A cold bake, in a directory with no `.kiln/` cache to answer from. Kiln is
  // not a dependency of this repository, so it may simply be absent: set
  // KILN_CLI to its `dist/cli.mjs`, or put `kiln` on PATH. Where it is missing
  // the digests above are still checked and only the bake is skipped, which is
  // said out loud rather than passed over.
  const cli = process.env.KILN_CLI;
  const [command, lead] = cli ? [process.execPath, [cli]] : ['kiln', []];
  const scratch = mkdtempSync(join(tmpdir(), 'barn-asset-'));
  try {
    const baked = join(scratch, 'barn.glb');
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

console.log(`Barn source ledger verified: ${sources.length} files, ${ledger.triangles} triangles, `
  + `${ledger.runtime.addedDraws} added draws (${fileURLToPath(output)})`);
