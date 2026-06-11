#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
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
import { dedup, draco, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const ASSETS_DIR = join(REPO_ROOT, 'assets');
const ORIGINALS_DIR = join(ASSETS_DIR, '_originals');
const SKIP_THRESHOLD = 0.7; // Skip if current is already <70% of original.

// Per-asset texture-dimension caps. Some source GLBs ship maps far larger than
// their on-screen footprint warrants. The 7 fence/gate pieces each embed the
// identical 1024^2 baseColor+normal+ORM set (~4 MB) on trivial perimeter meshes
// (Cycle 45 Phase 3 probe). Everything else keeps native resolution: hero dog
// rigs and silhouette-critical foliage cards must not be downscaled here.
const TEXTURE_CAPS = [{ match: /(Fence|Gate|Corner)_/i, maxDim: 512 }];

// Per-asset texture FORMAT conversion. The Cycle 91 tree bakes embed
// photographic ambientcg bark (color+AO+normal) + 512px leaf cards;
// GLTFExporter writes them as PNG, which lands ~2 MB per tree GLB. WebP
// q85 at these resolutions is visually transparent at SDS viewing
// distances and cuts most of the texture bytes (EXT_texture_webp; every
// SDS-supported browser decodes it). Flat-color legacy assets stay PNG.
const TEXTURE_FORMATS = [{ match: /^tree\d(_lod1)?\.glb$/i, format: 'webp', quality: 85 }];

/** Largest allowed texture dimension for `relPath`, or null to preserve native. */
function textureCapFor(relPath) {
  const base = relPath.split(/[\\/]/).pop();
  return TEXTURE_CAPS.find((c) => c.match.test(base))?.maxDim ?? null;
}

/** Texture format-conversion rule for `relPath`, or null to keep source format. */
function textureFormatFor(relPath) {
  const base = relPath.split(/[\\/]/).pop();
  return TEXTURE_FORMATS.find((c) => c.match.test(base)) ?? null;
}

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
      const maxDim = textureCapFor(rel);
      const formatRule = textureFormatFor(rel);
      const transforms = [dedup(), weld(), prune()];
      if (maxDim || formatRule) {
        transforms.push(textureCompress({
          encoder: sharp,
          ...(maxDim ? { resize: [maxDim, maxDim] } : {}),
          ...(formatRule ? { targetFormat: formatRule.format, quality: formatRule.quality } : {}),
        }));
      }
      transforms.push(
        // encodeSpeed=0 = best compression (level 7-equivalent), decodeSpeed=5 = balanced runtime.
        draco({ method: 'edgebreaker', encodeSpeed: 0, decodeSpeed: 5 }),
        meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
      );
      await document.transform(...transforms);

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
