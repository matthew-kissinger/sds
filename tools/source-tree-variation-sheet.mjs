// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Tools-only proof that full source trees tolerate deterministic proportions. */

import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const repo = resolve(import.meta.dirname, '..');
const output = resolve(process.argv[2] ?? 'captures/source-review/fox-candidate-variations.png');

function parseObj(filename) {
  const vertices = []; const triangles = []; let material = '';
  for (const line of readFileSync(resolve(repo, 'assets/treeline/sources', filename), 'utf8').split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'v') vertices.push(parts.slice(1, 4).map(Number));
    if (parts[0] === 'usemtl') material = parts.slice(1).join(' ').toLowerCase();
    if (parts[0] === 'f') {
      const face = parts.slice(1).map((value) => Number(value.split('/')[0]) - 1);
      for (let index = 1; index < face.length - 1; index++) {
        triangles.push({ points: [vertices[face[0]], vertices[face[index]], vertices[face[index + 1]]], material });
      }
    }
  }
  return triangles;
}

function tuckFoliage(triangles, fraction) {
  const points = triangles.flatMap((triangle) => triangle.points);
  const ys = points.map((point) => point[1]);
  const offset = (Math.max(...ys) - Math.min(...ys)) * fraction;
  return triangles.map((triangle) => ({
    ...triangle,
    points: triangle.points.map(([x, y, z]) => (
      /brown|trunk|bark|wood/.test(triangle.material) ? [x, y, z] : [x, y - offset, z]
    )),
  }));
}

const recipes = [
  { style: 'Spreading A', source: 'fox-tree-spreading.obj', tuck: 0.05, seed: 44191, variants: [[1, 1, 1, -0.28], [0.91, 1.08, 0.96, 0.16], [1.08, 0.94, 1.03, 0.5]] },
  { style: 'Round B', source: 'fox-tree-round.obj', tuck: 0.075, seed: 9157, variants: [[1, 1, 1, -0.2], [0.92, 1.09, 0.95, 0.2], [1.07, 0.95, 1.04, 0.48]] },
].map((recipe) => ({ ...recipe, triangles: tuckFoliage(parseObj(recipe.source), recipe.tuck) }));

mkdirSync(dirname(output), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 820 } });
  await page.setContent('<canvas id="sheet" width="1500" height="820"></canvas>');
  await page.evaluate((input) => {
    const ctx = document.querySelector('#sheet').getContext('2d');
    ctx.fillStyle = '#efe9d8'; ctx.fillRect(0, 0, 1500, 820);
    ctx.fillStyle = '#3f4438'; ctx.font = '600 25px system-ui'; ctx.fillText('Deterministic full-tree proportional variants', 35, 38);
    for (let row = 0; row < input.length; row++) {
      const recipe = input[row];
      for (let col = 0; col < recipe.variants.length; col++) {
        const [sx, sy, sz, yaw] = recipe.variants[col]; const x0 = col * 500; const y0 = 55 + row * 375;
        const pointsFor = ([x, y, z]) => [
          (x * Math.cos(yaw) - z * Math.sin(yaw)) * sx,
          y * sy,
          (x * Math.sin(yaw) + z * Math.cos(yaw)) * sz,
        ];
        const triangles = recipe.triangles.map((triangle) => ({ ...triangle, points: triangle.points.map(pointsFor) }));
        const points = triangles.flatMap((triangle) => triangle.points);
        const xs = points.map((point) => point[0]); const ys = points.map((point) => point[1]);
        const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
        const scale = Math.min(400 / (maxX - minX), 275 / (maxY - minY)); const cx = x0 + 250; const ground = y0 + 305;
        triangles.sort((a, b) => a.points.reduce((s, p) => s + p[2], 0) - b.points.reduce((s, p) => s + p[2], 0));
        for (const triangle of triangles) {
          const wood = /brown|trunk|bark|wood/.test(triangle.material);
          const depth = triangle.points.reduce((sum, point) => sum + point[2], 0) / 3;
          const shade = Math.max(0, Math.min(18, depth * 1.4));
          ctx.fillStyle = wood ? `rgb(${105 + shade},${72 + shade},${52 + shade})`
            : `rgb(${66 + shade},${119 + shade},${78 + shade})`;
          ctx.beginPath();
          triangle.points.forEach((point, index) => {
            const px = cx + (point[0] - (minX + maxX) / 2) * scale; const py = ground - (point[1] - minY) * scale;
            if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          });
          ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = '#d2cab5'; ctx.strokeRect(x0 + 12, y0 + 4, 476, 352);
        ctx.fillStyle = '#4a4d43'; ctx.textAlign = 'center'; ctx.font = '600 18px system-ui';
        ctx.fillText(`${recipe.style}, seed ${recipe.seed}, variant ${col + 1}`, cx, y0 + 342);
        ctx.font = '15px system-ui'; ctx.fillText(`scale ${sx.toFixed(2)} x ${sy.toFixed(2)} x ${sz.toFixed(2)}`, cx, y0 + 365);
      }
    }
  }, recipes);
  await page.locator('#sheet').screenshot({ path: output });
} finally {
  await browser.close();
}
console.log(output);
