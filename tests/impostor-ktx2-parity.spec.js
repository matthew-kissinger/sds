// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import { statSync, existsSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, enabledImpostorTargets } from '../tools/bake-tree-impostors.mjs';

/**
 * Cycle 102 - impostor KTX2 encode-matrix guard.
 *
 * tools/encode-impostors-ktx2.mjs transcodes every impostor-enabled target's
 * albedo + each auxLayers layer to UASTC .ktx2 (the wire/VRAM win; the runtime
 * loadImpostorTexture prefers .ktx2 and the dist build drops the .png sibling).
 * This spec guards that the committed .ktx2 set is complete: every target has a
 * .ktx2 for albedo and each declared aux layer, each non-empty and smaller than
 * its source .png. It reuses the same preset-derived layer list as
 * objects-impostor-parity.spec.js, so the encode matrix cannot drift from the
 * bake matrix - add a target or an aux layer without re-encoding and this fails.
 *
 * Existence + size, not a content hash: UASTC is a lossy transcode whose bytes
 * can legitimately shift across encoder-version bumps, so a hash would be brittle
 * for no added safety. The byte-exact source of truth lives on the .png in
 * objects-impostor-parity.hashes.json; this spec only guards that the .ktx2 are
 * present and actually a win.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const relPosix = (abs) => relative(root, abs).split('\\').join('/');

const targets = [...enabledImpostorTargets(loadManifest())];

// Albedo + each declared aux layer as .ktx2 paths. Mirrors atlasLayers() in
// objects-impostor-parity.spec.js (swapping .png -> .ktx2) so the two specs
// share one preset-derived source of truth and cannot drift.
const ktx2Layers = (t) => [
  t.atlasPath.replace(/\.png$/, '.ktx2'),
  ...(t.preset.auxLayers ?? []).map((layer) => t.atlasPath.replace(/\.png$/, `.${layer}.ktx2`)),
];

describe('impostor KTX2 encode-matrix parity', () => {
  it('has at least one impostor-enabled target to guard', () => {
    expect(targets.length).toBeGreaterThan(0);
  });

  describe.each(targets.map((t) => [`${t.obj.id}/${t.layoutId}/${t.variant.id}`, t]))('%s', (label, t) => {
    it('every layer has a committed .ktx2 sibling, non-empty and smaller than its .png', () => {
      for (const ktx2Path of ktx2Layers(t)) {
        const pngPath = ktx2Path.replace(/\.ktx2$/, '.png');
        const relKtx2 = relPosix(ktx2Path);
        expect(existsSync(ktx2Path), `missing .ktx2: ${relKtx2} (run npm run encode-impostors-ktx2)`).toBe(true);
        const ktx2Bytes = statSync(ktx2Path).size;
        expect(ktx2Bytes, `empty .ktx2: ${relKtx2}`).toBeGreaterThan(0);
        // The source .png is the encoder's input; assets/ always keeps it.
        const pngBytes = statSync(pngPath).size;
        expect(ktx2Bytes, `${relKtx2} (${ktx2Bytes}B) not smaller than its .png (${pngBytes}B)`).toBeLessThan(pngBytes);
      }
    });
  });
});
