// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Regenerate tests/objects-impostor-parity.hashes.json from the committed
 * impostor atlases. This is the explicit, reviewed act of accepting a new bake
 * (see tests/objects-impostor-parity.spec.js and .claude/rules/scene-and-render.md):
 * run it only after an intentional re-bake, then commit the atlas + hash change
 * together.
 *
 * The shipped layers per target are manifest-derived (the albedo base atlas plus
 * each aux layer the layout preset declares), so dropping or adding an aux layer
 * in assets/objects.manifest.json is reflected automatically - no hardcoded
 * [albedo, normal, depth]. Cycle 101 dropped depth from the octahedral preset;
 * this tool emits albedo + normal for octahedral and albedo + normal + depth for
 * latlon-hemi-y, matching atlasLayers() in the parity spec exactly.
 *
 * Run: `npm run record-impostor-parity-hashes`
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, enabledImpostorTargets } from './bake-tree-impostors.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'tests/objects-impostor-parity.hashes.json');
const relPosix = (abs) => relative(ROOT, abs).split('\\').join('/');

const atlases = {};
for (const t of enabledImpostorTargets(loadManifest())) {
  const layers = [
    t.atlasPath,
    ...(t.preset.auxLayers ?? []).map((layer) => t.atlasPath.replace(/\.png$/, `.${layer}.png`)),
  ];
  for (const layer of layers) {
    atlases[relPosix(layer)] = createHash('sha256').update(readFileSync(layer)).digest('hex');
  }
}

const doc = {
  _comment:
    'Recorded sha256 of the committed Kiln impostor atlas PNGs (Cycle 50 Phase 2 determinism golden; ' +
    'layer set is manifest-derived since Cycle 101). A real re-bake must reproduce these byte-for-byte; ' +
    'tests/objects-impostor-parity.spec.js fails on drift. Regenerating these hashes is the explicit, ' +
    'reviewed act of accepting a new bake - run `npm run record-impostor-parity-hashes` (see ' +
    'docs/cycle-50-plan.md hard stops and .claude/rules/scene-and-render.md).',
  atlases,
};

writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
console.log(`recorded ${Object.keys(atlases).length} atlas hashes to ${relPosix(OUT)}`);
