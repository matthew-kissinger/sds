// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Tools-only orthographic contact sheet for source OBJ silhouette review. */

import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const sourceDir = process.argv[2];
const output = resolve(process.argv[3] ?? 'captures/source-review/fox-trees-contact.png');
if (!sourceDir) throw new Error('usage: node tools/source-tree-contact-sheet.mjs <obj-dir> [output]');

function parseObj(path) {
  const vertices = [];
  const triangles = [];
  let material = '';
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'v') vertices.push(parts.slice(1, 4).map(Number));
    if (parts[0] === 'usemtl') material = parts.slice(1).join(' ').toLowerCase();
    if (parts[0] === 'f') {
      const face = parts.slice(1).map((value) => Number(value.split('/')[0]) - 1);
      for (let i = 1; i < face.length - 1; i++) {
        triangles.push({ points: [vertices[face[0]], vertices[face[i]], vertices[face[i + 1]]], material });
      }
    }
  }
  return triangles;
}

const names = ['branched', 'columnar', 'conical', 'open', 'oval', 'pyramidal', 'round', 'spreading', 'vase'];
const models = names.map((name) => ({
  name,
  triangles: parseObj(join(sourceDir, `tree-${name}.obj`)),
}));

mkdirSync(dirname(output), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1020 }, deviceScaleFactor: 1 });
  await page.setContent('<canvas id="sheet" width="1500" height="1020"></canvas>');
  await page.evaluate((input) => {
    const canvas = document.querySelector('#sheet');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#efe9d8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '600 24px system-ui'; ctx.fillStyle = '#3f4438';
    ctx.fillText('Fox Trees Pack, source silhouettes', 40, 38);
    const cellW = 500; const cellH = 320; const angle = 0.43;
    for (let modelIndex = 0; modelIndex < input.length; modelIndex++) {
      const model = input[modelIndex]; const col = modelIndex % 3; const row = Math.floor(modelIndex / 3);
      const x0 = col * cellW; const y0 = 60 + row * cellH;
      const rotated = model.triangles.map((triangle) => ({
        ...triangle,
        points: triangle.points.map(([x, y, z]) => [
          x * Math.cos(angle) - z * Math.sin(angle), y, x * Math.sin(angle) + z * Math.cos(angle),
        ]),
      }));
      const points = rotated.flatMap((triangle) => triangle.points);
      const minX = Math.min(...points.map((p) => p[0])); const maxX = Math.max(...points.map((p) => p[0]));
      const minY = Math.min(...points.map((p) => p[1])); const maxY = Math.max(...points.map((p) => p[1]));
      const scale = Math.min(410 / (maxX - minX), 248 / (maxY - minY));
      const centreX = x0 + 250; const groundY = y0 + 265;
      rotated.sort((a, b) => a.points.reduce((s, p) => s + p[2], 0) - b.points.reduce((s, p) => s + p[2], 0));
      for (const triangle of rotated) {
        const [a, b, c] = triangle.points;
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const nz = ab[0] * ac[1] - ab[1] * ac[0];
        const light = 0.78 + Math.min(0.18, Math.abs(nz) * 0.002);
        const wood = /brown|trunk|bark|wood/.test(triangle.material);
        ctx.fillStyle = wood ? `rgb(${Math.round(110 * light)},${Math.round(77 * light)},${Math.round(56 * light)})`
          : `rgb(${Math.round(72 * light)},${Math.round(126 * light)},${Math.round(82 * light)})`;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const p = triangle.points[i]; const sx = centreX + (p[0] - (minX + maxX) / 2) * scale;
          const sy = groundY - (p[1] - minY) * scale;
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#4a4d43'; ctx.font = '600 20px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(`tree-${model.name}.obj`, x0 + 250, y0 + 302);
      ctx.strokeStyle = '#d2cab5'; ctx.strokeRect(x0 + 12, y0 + 6, cellW - 24, cellH - 14);
    }
  }, models);
  await page.locator('#sheet').screenshot({ path: output });
} finally {
  await browser.close();
}
console.log(output);
