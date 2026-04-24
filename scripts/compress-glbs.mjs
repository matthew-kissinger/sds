#!/usr/bin/env node
/**
 * GLB compression pipeline.
 *
 * Walks `assets/**\/*.glb`, applies dedup + weld + prune cleanup, then
 * Draco (level 7 — encodeSpeed=0, slowest+best) and Meshopt compression
 * via gltf-transform.
 *
 * Idempotent: backs up each original to `assets/_originals/<rel-path>` once
 * (skipped on subsequent runs) and skips files already smaller than 70% of
 * their backed-up sibling so re-runs are cheap.
 *
 * Usage: `node scripts/compress-glbs.mjs`
 */
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, meshopt, prune, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const ASSETS_DIR = join(REPO_ROOT, 'assets');
const ORIGINALS_DIR = join(ASSETS_DIR, '_originals');
const SKIP_THRESHOLD = 0.7; // Skip if current is already <70% of original.

/** Recursively collect every .glb under `dir`, skipping the originals backup. */
async function findGlbs(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === ORIGINALS_DIR) continue;
      out.push(...(await findGlbs(full)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) {
      out.push(full);
    }
  }
  return out;
}

const fmtKB = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function main() {
  const glbs = await findGlbs(ASSETS_DIR);
  if (glbs.length === 0) {
    console.log('No .glb files found under assets/.');
    return;
  }

  await mkdir(ORIGINALS_DIR, { recursive: true });
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });

  let totalBefore = 0;
  let totalAfter = 0;
  let processed = 0;
  let skipped = 0;

  for (const glb of glbs) {
    const rel = relative(ASSETS_DIR, glb);
    const backup = join(ORIGINALS_DIR, rel);

    // Back up original once.
    if (!existsSync(backup)) {
      await mkdir(dirname(backup), { recursive: true });
      await copyFile(glb, backup);
    }

    const originalSize = (await stat(backup)).size;
    const currentSize = (await stat(glb)).size;
    totalBefore += originalSize;

    // Idempotency: leave already-compressed files alone on re-runs.
    if (currentSize <= originalSize * SKIP_THRESHOLD) {
      console.log(`SKIP  ${rel}  ${fmtKB(currentSize)} (already compressed)`);
      totalAfter += currentSize;
      skipped++;
      continue;
    }

    try {
      // Always re-read from the pristine backup so transforms compose cleanly.
      const document = await io.read(backup);
      await document.transform(
        dedup(),
        weld(),
        prune(),
        // encodeSpeed=0 = best compression (level 7-equivalent), decodeSpeed=5 = balanced runtime.
        draco({ method: 'edgebreaker', encodeSpeed: 0, decodeSpeed: 5 }),
        meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
      );

      const bytes = await io.writeBinary(document);
      await writeFile(glb, bytes);
      const newSize = bytes.length;
      totalAfter += newSize;
      processed++;
      const pct = ((1 - newSize / originalSize) * 100).toFixed(1);
      console.log(`OK    ${rel}  ${fmtKB(originalSize)} -> ${fmtKB(newSize)}  (-${pct}%)`);
    } catch (err) {
      console.error(`FAIL  ${rel}: ${err.message}`);
      // Leave current file alone on failure.
      totalAfter += currentSize;
    }
  }

  const pct = totalBefore > 0 ? ((1 - totalAfter / totalBefore) * 100).toFixed(1) : '0.0';
  console.log('');
  console.log(`Processed ${processed}, skipped ${skipped}, total ${glbs.length}.`);
  console.log(`Total: ${fmtKB(totalBefore)} -> ${fmtKB(totalAfter)}  (-${pct}%)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
