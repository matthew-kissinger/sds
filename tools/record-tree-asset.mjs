// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Record/check the Kiln oak: its recipe, its baked GLB and the chain that
 * instances it into every stand of the treeline.
 *
 * THIS IS THE BUILDING LEDGERS' TOOL FOR THE FIRST MODEL THAT IS NOT A BUILDING
 * (record-house-asset.mjs, record-barn-asset.mjs), field for field where the two
 * agree. It pins the bytes that ship, over their raw content, and the recipe
 * that produces them, over UTF-8 with LF, and names both encodings.
 *
 * WHAT A TREE CARRIES THAT A BUILDING DOES NOT. The recipe writes the record of
 * its channels (`treeChannels`: the cluster seed in TEXCOORD_0, the lobe normal
 * in TANGENT, Kiln's `_CAVITY`) on its root node and marks every variant of the
 * family with `treeVariant`; the loader refuses a bake without either. And one
 * tree is drawn 139 times, so the ledger states what the field submits, not
 * only what the file holds: the per-tree count is read from the GLB, the stand
 * count from the placement manifest the treeline instances.
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
import { exportedCounts, glbJson } from './glb-ledger.mjs';

const repo = new URL('../', import.meta.url);
const artifact = 'assets/treeline/kiln/oak.glb';
const recipe = 'assets/treeline/kiln/oak.kiln.js';
const placement = 'assets/treeline/manifest.json';

/** Hashed as text: line endings are not part of what these files mean. */
const sources = [
  recipe,
  'app/src/scene/treeline/kilnTree.ts',
  'app/src/scene/treeline/kilnOak.ts',
  'lab/src/KilnTreeline.tsx',
  'tools/record-tree-asset.mjs',
  'tools/glb-ledger.mjs',
];

/**
 * Authored material to treeline role, the loader's own table (kilnTree.ts
 * BINDING), repeated so the per-role split can be read from the GLB;
 * tests/tree-kiln.spec.ts holds the loader's parts equal to it.
 */
const BINDING = {
  leaf: 'crown',
  bark: 'wood',
};

const textDigest = (path) => createHash('sha256')
  .update(readFileSync(new URL(path, repo), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const bytes = readFileSync(new URL(artifact, repo));
const exported = exportedCounts(bytes, BINDING);
const json = glbJson(bytes);
const extras = json.nodes.map((node) => node.extras ?? {});
const channels = extras.find((entry) => entry.treeChannels !== undefined)?.treeChannels;
if (channels?.version !== 1) throw new Error(`${artifact} carries no treeChannels record of version 1`);
const variants = extras.flatMap((entry) => typeof entry.treeVariant === 'string' ? [entry.treeVariant] : []);
const stands = JSON.parse(readFileSync(new URL(placement, repo), 'utf8')).canopies.length;

const ledger = {
  version: 1,
  id: 'kiln-spreading-oak',
  author: 'Matthew Kissinger',
  license: 'AGPL-3.0-or-later',
  licenseFile: 'LICENSE',
  digestEncoding: 'UTF-8 with LF line endings',
  artifactDigestEncoding: 'raw bytes',
  toolchain: {
    name: '@instruktlabs/kiln',
    version: '1.2.3',
    license: 'MIT',
    command: 'kiln render assets/treeline/kiln/oak.kiln.js --out assets/treeline/kiln/oak.glb',
    note: 'The tool is not a dependency of this repository. It bakes the artifact; nothing imports it.',
  },
  recipe,
  artifact: { path: artifact, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
  // As exported, read from the GLB (tools/glb-ledger.mjs): one tree.
  triangles: exported.triangles,
  triangleBudget: 11000,
  exportedMeshNodes: exported.exportedMeshNodes,
  exportedGeometries: exported.exportedGeometries,
  materials: exported.materials,
  textures: exported.textures,
  images: exported.images,
  gltfExtensions: exported.gltfExtensions,
  boundsMetres: exported.boundsMetres,
  // What rides in which channel (assets/treeline/kiln/README.md). The loader
  // refuses a bake without this record on its root node, a mesh without
  // TEXCOORD_0 or _CAVITY, and a crown without TANGENT.
  treeChannels: {
    record: 'nodes[root].extras.treeChannels',
    version: channels.version,
    seed: channels.attribute,
    lobeNormal: channels.lobeNormal,
    cavity: '_CAVITY',
  },
  // Every node marked `treeVariant` is a variant the loader instances.
  variants: { record: 'nodes[*].extras.treeVariant', names: variants },
  // What the game issues once treeline/kilnTree.ts has parsed the bake and
  // fitted it to the unit stand, and Treeline.tsx has instanced it.
  runtime: {
    draws: 3,
    addedDraws: 0,
    stands,
    trianglesPerRole: exported.trianglesPerSurface,
    submittedTrianglesBeforeShadows: exported.triangles * stands,
    note: 'One instanced draw for every crown and one for all the wood, the procedural treeline\'s own two, beside its pooled shadows: three draws either way. No texture is sampled, nothing is transparent and no pass is added; the light is computed (treeline/kilnTreeMaterials.ts).',
    loader: 'app/src/scene/treeline/kilnTree.ts',
    distPath: 'assets/oak-<hash>.glb',
  },
  qa: { profile: 'asset.requirements.v1', acceptance: 'accepted', disposition: 'pass', gltfErrors: 0, gltfWarnings: 0 },
  consumers: ['app/src/scene/treeline/kilnOak.ts', 'app/src/scene/Treeline.tsx', 'lab/src/subjects.ts'],
  // A build constant, not a setting: see app/src/scene/treeline/source.ts. The
  // GLB reaches dist/ only in a build where it is 'kiln', and the release probe
  // checks that any model in dist/ is a recorded file, byte for byte.
  shipsInProductionBuildWhen: "TREE_SOURCE === 'kiln'",
  sources: sources.map((path) => ({ path, sha256: textDigest(path) })),
};

const output = new URL('assets/treeline/kiln/asset-manifest.json', repo);
const recorded = `${JSON.stringify(ledger, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8').replace(/\r\n/g, '\n') !== recorded) {
    throw new Error('Oak source ledger is stale; review changes before recording new digests.');
  }
  // A cold bake, in a directory with no `.kiln/` cache to answer from. Kiln is
  // not a dependency of this repository, so it may simply be absent: set
  // KILN_CLI to its `dist/cli.mjs`, or put `kiln` on PATH. Where it is missing
  // the digests above are still checked and only the bake is skipped, which is
  // said out loud rather than passed over.
  const cli = process.env.KILN_CLI;
  const [command, lead] = cli ? [process.execPath, [cli]] : ['kiln', []];
  const scratch = mkdtempSync(join(tmpdir(), 'oak-asset-'));
  try {
    const baked = join(scratch, 'oak.glb');
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

console.log(`Oak source ledger verified: ${sources.length} files, ${ledger.triangles} triangles a tree, `
  + `${ledger.runtime.submittedTrianglesBeforeShadows} across ${stands} stands, `
  + `${ledger.runtime.addedDraws} added draws (${fileURLToPath(output)})`);
