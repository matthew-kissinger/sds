// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Record/check the editable collie geometry, skeleton and animation source chain. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const repo = new URL('../', import.meta.url);
const files = [
  'app/src/scene/Dog.tsx',
  ...['dogParts.ts', 'loft.ts', 'dogGeometry.ts', 'dogRigDefinition.ts', 'dogSkin.ts',
    'dogRig.ts', 'dogLegSolver.ts', 'dogGait.ts', 'dogMotion.ts', 'dogMaterial.ts',
    'dogMarkings.ts', 'dogMarks.ts', 'coatTones.ts', 'dogToon.ts', 'dogCustomization.ts',
    'outlineWidth.ts', 'contactShadow.ts'].map((name) => `app/src/scene/dog/${name}`),
  'tools/record-dog-asset.mjs',
];
const ledger = {
  version: 1, id: 'owned-skinned-collie', author: 'Matthew Kissinger',
  license: 'AGPL-3.0-or-later', licenseFile: 'LICENSE',
  digestEncoding: 'UTF-8 with LF line endings',
  geometryRecipe: 'app/src/scene/dog/dogGeometry.ts',
  skeletonRecipe: 'app/src/scene/dog/dogRigDefinition.ts',
  animationRecipe: 'app/src/scene/dog/dogRig.ts',
  bones: 22, triangles: 1696, skeletons: 1, bodyDraws: 2, contactShadowDraws: 1,
  externalAssets: 0,
  sources: files.map((path) => ({ path, sha256: createHash('sha256')
    .update(readFileSync(new URL(path, repo), 'utf8').replace(/\r\n/g, '\n')).digest('hex') })),
};
const output = new URL('assets/dog/procedural-manifest.json', repo);
const bytes = `${JSON.stringify(ledger, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8').replace(/\r\n/g, '\n') !== bytes) {
    throw new Error('Dog source ledger is stale; review changes before recording new digests.');
  }
} else writeFileSync(output, bytes);
console.log(`Collie source ledger verified: ${files.length} files, ${ledger.bones} bones (${fileURLToPath(output)})`);
