// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { glbJson, exportedCounts } from './glb-ledger.mjs';

const root = new URL('../', import.meta.url);
const recipe = 'assets/fence/fence-kit.kiln.js', artifact = 'assets/fence/fence-kit.glb';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = readFileSync(new URL(artifact, root)), json = glbJson(bytes);
const ledger = {
  version: 1, id: 'sheepdog-hewn-fence-kit', status: 'runtime; owner-approved design; deployment tracked in STATUS.md',
  author: 'Matthew Kissinger', license: 'AGPL-3.0-or-later', licenseFile: 'LICENSE',
  provenance: 'Original procedural geometry authored with Kiln. No external meshes, images or textures.',
  toolchain: { name: '@instruktlabs/kiln', version: '1.3.0', license: 'MIT' },
  recipe: { path: recipe, encoding: 'UTF-8 with LF', sha256: sha(readFileSync(new URL(recipe, root), 'utf8').replace(/\r\n/g, '\n')) },
  artifact: { path: artifact, bytes: bytes.length, encoding: 'raw bytes', sha256: sha(bytes) },
  exported: exportedCounts(bytes, Object.fromEntries(json.materials.map(m => [m.name, 'preview']))),
  modules: json.nodes.filter(n => n.extras?.fenceModule).map(n => n.extras.fenceModule),
  runtime: { consumer: 'app/src/scene/fence/fenceField.ts', drawBudget: 3, surfaces: 'Shared procedural timber TSL, oak palette, no texture images',
    note: 'GLB nodes are authoring assemblies. The client fits the complete field and pen into two instance batches and a merged shadow; exported mesh count is not runtime draw count.' },
  sources: ['app/src/scene/fence/fenceKit.ts', 'app/src/scene/fence/fenceField.ts', 'app/src/scene/fence/fenceShadowMotion.ts',
    'app/src/scene/FenceLine.tsx', 'app/src/scene/fence/fieldSections.ts', 'app/src/tsl/palette.ts',
    'app/src/scene/fence/buildMeshes.ts', 'app/src/scene/fence/timberMaterial.ts', 'app/src/scene/fence/timberStyle.ts']
    .map(path => ({ path, sha256: sha(readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n')) })),
};
const path = new URL('assets/fence/asset-manifest.json', root), text = `${JSON.stringify(ledger, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== text) throw new Error('Fence kit ledger differs; re-record the intended bake');
} else writeFileSync(path, text);
console.log(`${artifact}: ${bytes.length} bytes, SHA-256 ${ledger.artifact.sha256}`);
