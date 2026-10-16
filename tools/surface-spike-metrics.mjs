// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Numbers from the atlas spike's captures, so the comparison is not eyeballed.
//
//   node tools/surface-spike-metrics.mjs [--label 2026-10-16] [--backend webgpu]
//
// For every view captured by tools/surface-spike-capture.mjs it reads the A
// (procedural), B (atlas) and B+ (atlas, painted extras) frames and reports,
// over a centre crop that holds the panel at that distance:
//
//   diff A-B      mean absolute luminance difference, 0..255, and the share of
//                 pixels that differ by more than 8 levels. The content is the
//                 same by construction, so this is the mechanism's footprint:
//                 texel quantisation, bilinear and mip filtering, half-texel
//                 insets, gradient handling at the cell seam.
//   sharpness     variance of a 3x3 Laplacian, per frame. Higher is crisper.
//                 A cel surface lives on hard edges; a drop from A to B at a
//                 given distance is the mip chain softening them.
//   seam          the diff concentrated in a one-pixel-wide column at each
//                 4 m cell boundary against the diff elsewhere, for the
//                 close views where the boundary is on screen.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { repo } from './probe-lib.mjs';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const label = arg('label', new Date().toISOString().slice(0, 10));
const backend = arg('backend', 'webgpu');

/** Centre crops: the panel is 8 m wide, so its on-screen size follows distance. */
const CROPS = {
  '01-classic-90m': { width: 360, height: 180 },
  '02-mid-20m': { width: 1100, height: 520 },
  '03-close-3m': { width: 1600, height: 760 },
  '04-close-3m-oblique': { width: 1600, height: 760 },
  '05-close-1.5m': { width: 1600, height: 760 },
};

async function gray(path, crop) {
  const image = sharp(readFileSync(path));
  const meta = await image.metadata();
  const left = Math.floor((meta.width - crop.width) / 2);
  const top = Math.floor((meta.height - crop.height) / 2);
  const { data } = await image.extract({ left, top, width: crop.width, height: crop.height }).grayscale().raw().toBuffer({ resolveWithObject: true });
  return { data, width: crop.width, height: crop.height };
}

function laplacianVariance({ data, width, height }) {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - width] - data[i + width];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function difference(a, b) {
  let total = 0;
  let over = 0;
  for (let i = 0; i < a.data.length; i++) {
    const d = Math.abs(a.data[i] - b.data[i]);
    total += d;
    if (d > 8) over++;
  }
  return { mean: total / a.data.length, over: over / a.data.length };
}

const dir = join(repo, 'captures', 'spike', label, backend);
const rows = [];
for (const [view, crop] of Object.entries(CROPS)) {
  const a = await gray(join(dir, 'a', `${view}.png`), crop);
  const b = await gray(join(dir, 'b', `${view}.png`), crop);
  const bplus = await gray(join(dir, 'bplus', `${view}.png`), crop);
  const ab = difference(a, b);
  rows.push({
    view,
    'diff A-B mean': ab.mean.toFixed(2),
    'diff A-B >8 share': (ab.over * 100).toFixed(1) + '%',
    'sharp A': laplacianVariance(a).toFixed(1),
    'sharp B': laplacianVariance(b).toFixed(1),
    'sharp B+': laplacianVariance(bplus).toFixed(1),
  });
}
console.table(rows);
