#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 22 Phase A — meshopt-baked LOD1 GLBs.
 *
 * Replaces the Cycle 16 leaf-count-halved `_lod1.glb` files (which produced
 * the Cycle 17 visual rejection: "less leaves does not look good") with
 * geometry-simplified versions: same leaf count + topology, fewer vertices.
 *
 * For each `_originals/models/trees/{tree1,tree2}.glb` (LOD0):
 *   1. Load via @gltf-transform/core
 *   2. weld() to merge split vertices (better simplifier convergence)
 *   3. simplify({ MeshoptSimplifier, ratio, error: 0.001, lockBorder: true })
 *   4. Write to `assets/_originals/models/trees/<name>_lod1.glb`
 *
 * Multi-ratio iteration mode (this cycle's autonomous-run requirement —
 * "save different iterations so we can branch back"). Default ratio 0.5
 * goes to the canonical path; ratios 0.3 + 0.7 also bake to
 * `cycle22-validation/phaseA/variants/r{ratio}/<name>_lod1.glb` so we can
 * load + compare alternates without re-running the bake.
 *
 * After this script, run `npm run compress-glbs` to Draco-compress the
 * canonical `_originals/` LOD1s into `assets/models/trees/<name>_lod1.glb`
 * (the runtime path that TerrainBuilder.loadModels reads).
 *
 * Run: `npm run bake-tree-lod1`
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplify, weld, prune, dedup } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const ORIGINALS = join(REPO_ROOT, 'assets', '_originals', 'models', 'trees');
const VARIANT_OUT = join(REPO_ROOT, 'cycle22-validation', 'phaseA', 'variants');

const TREES = ['tree1', 'tree2'];

// Bake variants. The ratio + error pair tunes how aggressively the simplifier
// collapses geometry; lockBorder=false is required to reach >5% reduction on
// EZ-Tree foliage (UV-split leaf-card borders dominate when lockBorder=true).
// "default" lands at the canonical _originals/<name>_lod1.glb path; the
// remaining variants land under cycle22-validation/phaseA/variants/<tag>/
// for side-by-side comparison + rollback options.
const VARIANTS = [
  { tag: 'aggressive',   ratio: 0.3, error: 0.05,  lockBorder: false },
  { tag: 'default',      ratio: 0.5, error: 0.05,  lockBorder: false }, // canonical
  { tag: 'conservative', ratio: 0.7, error: 0.05,  lockBorder: false },
  { tag: 'pristine',     ratio: 0.5, error: 0.001, lockBorder: true  }, // near-LOD0
];
const DEFAULT_TAG = 'default';

const fmtKB = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function makeIO() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  await MeshoptSimplifier.ready;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
}

async function bakeOne(io, srcPath, variant) {
  const document = await io.read(srcPath);
  await document.transform(
    dedup(),
    weld(),
    simplify({
      simplifier: MeshoptSimplifier,
      ratio: variant.ratio,
      error: variant.error,
      lockBorder: variant.lockBorder,
    }),
    prune(),
  );
  let tris = 0, verts = 0;
  for (const m of document.getRoot().listMeshes()) {
    for (const p of m.listPrimitives()) {
      const idx = p.getIndices();
      const pos = p.getAttribute('POSITION');
      if (idx) tris += idx.getCount() / 3;
      if (pos) verts += pos.getCount();
    }
  }
  const bytes = await io.writeBinary(document);
  return { bytes, tris, verts };
}

function srcSize(name) {
  return statSync(join(ORIGINALS, `${name}.glb`)).size;
}

async function main() {
  const io = await makeIO();
  await mkdir(VARIANT_OUT, { recursive: true });

  const report = { variants: {}, defaultTag: DEFAULT_TAG };

  for (const variant of VARIANTS) {
    const variantDir = join(VARIANT_OUT, variant.tag);
    await mkdir(variantDir, { recursive: true });
    report.variants[variant.tag] = { config: variant, trees: {} };

    for (const name of TREES) {
      const src = join(ORIGINALS, `${name}.glb`);
      const lod0Bytes = srcSize(name);
      const { bytes, tris, verts } = await bakeOne(io, src, variant);

      const variantPath = join(variantDir, `${name}_lod1.glb`);
      await writeFile(variantPath, bytes);

      const reduction = ((1 - bytes.length / lod0Bytes) * 100).toFixed(1);
      report.variants[variant.tag].trees[name] = {
        lod0Bytes,
        lod1Bytes: bytes.length,
        reductionPct: parseFloat(reduction),
        tris,
        verts,
      };

      console.log(
        `[${variant.tag}] ${name}: ${fmtKB(lod0Bytes)} -> ${fmtKB(bytes.length)}  (-${reduction}%)  ${verts}v ${tris}t`
      );

      // Default variant also lands at the canonical _originals/ path so
      // compress-glbs picks it up in the runtime build.
      if (variant.tag === DEFAULT_TAG) {
        const canonical = join(ORIGINALS, `${name}_lod1.glb`);
        await writeFile(canonical, bytes);
        console.log(`  -> wrote canonical ${canonical}`);
      }
    }
  }

  const reportPath = join(REPO_ROOT, 'cycle22-validation', 'phaseA', 'bake-report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nBake report -> ${reportPath}`);
  console.log(
    `\nDefault variant '${DEFAULT_TAG}' written to _originals/. Run \`npm run compress-glbs\` to update runtime.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
