// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// The atlas spike's bake (docs/history/spike-surface-atlas-2026-10-16.md).
//
//   node tools/bake-surface-atlas.mjs             bake into assets/spike/
//   node tools/bake-surface-atlas.mjs --out DIR   bake into DIR instead
//
// Evaluates the surface functions in lab/src/spike/boardMath.ts once per
// texel into a 2048 by 2048 RGBA8 atlas of four 1024 cells (barn boards, barn
// boards with painted extras, limewash, slate), builds the full mip chain with
// a box filter, and writes:
//
//   surface-atlas.ktx2   KTX2, VK_FORMAT_R8G8B8A8_UNORM, every mip level,
//                        Zstandard supercompression (the format spec/08 names,
//                        read by three's KTX2Loader without a transcoder)
//   surface-atlas.png    level 0, for looking at
//   manifest.json        sizes, the encoding gain, the cell table, digests
//
// The functions are bundled from the lab's TypeScript with esbuild, as
// tools/bake-grass.mjs bundles the layout: the bake and the shader twin read
// the same constants from the same file, so neither can drift from the other.
//
// Values are LINEAR MULTIPLIERS near 1, stored as value / ATLAS_GAIN in 8 bits
// and multiplied back in the shader. The transfer function is declared linear
// so the loader hands the texels over untouched.
//
// Byte-deterministic: same source, same bytes. No encoder outside node is
// needed. A Basis UASTC encoding (one byte a texel on the GPU instead of
// four) would need the `basisu` or `toktx` tool, which this repository does
// not carry; the manifest records what it would save.

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { constants as zlibConstants, zstdCompressSync } from 'node:zlib';
import sharp from 'sharp';
import {
  KHR_DF_CHANNEL_RGBSDA_ALPHA,
  KHR_DF_CHANNEL_RGBSDA_BLUE,
  KHR_DF_CHANNEL_RGBSDA_GREEN,
  KHR_DF_CHANNEL_RGBSDA_RED,
  KHR_DF_FLAG_ALPHA_STRAIGHT,
  KHR_DF_KHR_DESCRIPTORTYPE_BASICFORMAT,
  KHR_DF_MODEL_RGBSDA,
  KHR_DF_PRIMARIES_BT709,
  KHR_DF_TRANSFER_LINEAR,
  KHR_DF_VENDORID_KHRONOS,
  KHR_DF_VERSION,
  KHR_SUPERCOMPRESSION_ZSTD,
  VK_FORMAT_R8G8B8A8_UNORM,
  write,
} from 'three/examples/jsm/libs/ktx-parse.module.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const outDir = outArg > 0 ? resolve(process.argv[outArg + 1]) : join(repo, 'assets', 'spike');

// --- the surface functions, bundled from the lab's TypeScript ---------------

const staging = mkdtempSync(join(tmpdir(), 'sds-bake-atlas-'));
const entry = join(staging, 'entry.ts');
writeFileSync(entry, "export * from '@lab/spike/boardSurface';\n");
const bundle = join(staging, 'surface.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  alias: {
    '@lab': join(repo, 'lab', 'src'),
    '@app': join(repo, 'app', 'src'),
    '@sim': join(repo, 'sim'),
  },
});
const surface = await import(pathToFileURL(bundle).href);
const { ATLAS_CELLS, ATLAS_CELL_SURFACES, ATLAS_GAIN, ATLAS_TEXELS, CELL_METRES, CELL_TEXELS } = surface;

// --- level 0 ----------------------------------------------------------------

const level0 = new Uint8Array(ATLAS_TEXELS * ATLAS_TEXELS * 4);
const encode = (value) => Math.max(0, Math.min(255, Math.round((value / ATLAS_GAIN) * 255)));

for (const [id, [column, row]] of Object.entries(ATLAS_CELLS)) {
  const fn = ATLAS_CELL_SURFACES[id];
  const x0 = column * CELL_TEXELS;
  const y0 = row * CELL_TEXELS;
  for (let ty = 0; ty < CELL_TEXELS; ty++) {
    // Texture row 0 is v = 0, the bottom of the cell (no flip on this path).
    const y = ((ty + 0.5) / CELL_TEXELS) * CELL_METRES;
    for (let tx = 0; tx < CELL_TEXELS; tx++) {
      const x = ((tx + 0.5) / CELL_TEXELS) * CELL_METRES;
      const [r, g, b] = fn(x, y);
      const at = ((y0 + ty) * ATLAS_TEXELS + (x0 + tx)) * 4;
      level0[at] = encode(r);
      level0[at + 1] = encode(g);
      level0[at + 2] = encode(b);
      level0[at + 3] = 255;
    }
  }
}

// --- the mip chain, box filtered in multiplier space -------------------------

const levels = [{ width: ATLAS_TEXELS, height: ATLAS_TEXELS, data: level0 }];
while (levels[levels.length - 1].width > 1) {
  const prev = levels[levels.length - 1];
  const width = Math.max(1, prev.width >> 1);
  const height = Math.max(1, prev.height >> 1);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 4; c++) {
        const a = prev.data[((y * 2) * prev.width + x * 2) * 4 + c];
        const b = prev.data[((y * 2) * prev.width + Math.min(prev.width - 1, x * 2 + 1)) * 4 + c];
        const d = prev.data[(Math.min(prev.height - 1, y * 2 + 1) * prev.width + x * 2) * 4 + c];
        const e = prev.data[(Math.min(prev.height - 1, y * 2 + 1) * prev.width + Math.min(prev.width - 1, x * 2 + 1)) * 4 + c];
        data[(y * width + x) * 4 + c] = Math.round((a + b + d + e) / 4);
      }
    }
  }
  levels.push({ width, height, data });
}

// --- KTX2 ---------------------------------------------------------------------

const zstd = (bytes) => zstdCompressSync(bytes, {
  params: { [zlibConstants.ZSTD_c_compressionLevel]: 19 },
});

const container = {
  vkFormat: VK_FORMAT_R8G8B8A8_UNORM,
  typeSize: 1,
  pixelWidth: ATLAS_TEXELS,
  pixelHeight: ATLAS_TEXELS,
  pixelDepth: 0,
  layerCount: 0,
  faceCount: 1,
  levelCount: levels.length,
  supercompressionScheme: KHR_SUPERCOMPRESSION_ZSTD,
  levels: levels.map((level) => {
    const compressed = zstd(level.data);
    return {
      levelData: new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength),
      uncompressedByteLength: level.data.byteLength,
    };
  }),
  dataFormatDescriptor: [{
    vendorId: KHR_DF_VENDORID_KHRONOS,
    descriptorType: KHR_DF_KHR_DESCRIPTORTYPE_BASICFORMAT,
    versionNumber: KHR_DF_VERSION,
    colorModel: KHR_DF_MODEL_RGBSDA,
    colorPrimaries: KHR_DF_PRIMARIES_BT709,
    transferFunction: KHR_DF_TRANSFER_LINEAR,
    flags: KHR_DF_FLAG_ALPHA_STRAIGHT,
    texelBlockDimension: [0, 0, 0, 0],
    bytesPlane: [4, 0, 0, 0, 0, 0, 0, 0],
    samples: [
      KHR_DF_CHANNEL_RGBSDA_RED,
      KHR_DF_CHANNEL_RGBSDA_GREEN,
      KHR_DF_CHANNEL_RGBSDA_BLUE,
      KHR_DF_CHANNEL_RGBSDA_ALPHA,
    ].map((channelType, i) => ({
      bitOffset: i * 8,
      bitLength: 7,
      channelType,
      samplePosition: [0, 0, 0, 0],
      sampleLower: 0,
      sampleUpper: 255,
    })),
  }],
  keyValue: {
    KTXorientation: 'rd',
    'sds.recipe': 'tools/bake-surface-atlas.mjs',
    'sds.gain': String(ATLAS_GAIN),
  },
  globalData: null,
};

const ktx2 = write(container, { keepWriter: true });

// --- outputs ------------------------------------------------------------------

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'surface-atlas.ktx2'), ktx2);
// sharp writes rows top-down; the texture's row 0 is the bottom, so flip for the eye.
const png = await sharp(Buffer.from(level0.buffer), { raw: { width: ATLAS_TEXELS, height: ATLAS_TEXELS, channels: 4 } })
  .flip()
  .png({ compressionLevel: 9, effort: 10 })
  .toBuffer();
writeFileSync(join(outDir, 'surface-atlas.png'), png);

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gpuBytesRgba8 = levels.reduce((sum, level) => sum + level.data.byteLength, 0);
const manifest = {
  version: 1,
  recipe: 'tools/bake-surface-atlas.mjs',
  format: 'VK_FORMAT_R8G8B8A8_UNORM, zstd, full mip chain, linear transfer',
  texels: ATLAS_TEXELS,
  cellTexels: CELL_TEXELS,
  cellMetres: CELL_METRES,
  texelsPerMetre: CELL_TEXELS / CELL_METRES,
  gain: ATLAS_GAIN,
  cells: ATLAS_CELLS,
  levels: levels.length,
  bytes: {
    ktx2: ktx2.byteLength,
    png: png.byteLength,
    gpuRgba8WithMips: gpuBytesRgba8,
    gpuUastcWithMipsEstimate: Math.round(gpuBytesRgba8 / 4),
  },
  sha256: { ktx2: sha(ktx2), png: sha(png), level0: sha(level0) },
};
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest.bytes), `-> ${outDir}`);
