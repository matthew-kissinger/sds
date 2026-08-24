// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Tools-only proof of deterministic lobe, branch-lean and negative-space variation. */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { buildFoxHybrid, FOX_HYBRID_RECIPE } from './bake-sourced-tree-candidates.mjs';

const repo = resolve(import.meta.dirname, '..');
const output = resolve(process.argv[2] ?? 'captures/source-review/fox-candidate-variations-v2.png');
const candidates = [{
  style: FOX_HYBRID_RECIPE.style,
  variants: FOX_HYBRID_RECIPE.variants.map((variant, index) => ({
    seed: variant.seed,
    name: variant.name,
    geometry: buildFoxHybrid(index),
  })),
}];

mkdirSync(dirname(output), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 840 } });
  await page.setContent('<canvas id="sheet" width="1500" height="840"></canvas>');
  await page.evaluate((input) => {
    const ctx = document.querySelector('#sheet').getContext('2d');
    const foliageColors = ['#477c53', '#51885d', '#3f714c', '#4b8055'];
    ctx.fillStyle = '#efe9d8'; ctx.fillRect(0, 0, 1500, 840);
    ctx.fillStyle = '#3f4438'; ctx.font = '600 25px system-ui';
    ctx.fillText('Fox hybrid authored family variants', 35, 38);
    ctx.font = '15px system-ui';
    ctx.fillText('Same exact CC0 source shells, deterministic lobe balance, branch lean and shallow sky bites', 35, 64);
    for (let row = 0; row < input.length; row++) {
      const candidate = input[row];
      for (let col = 0; col < candidate.variants.length; col++) {
        const variant = candidate.variants[col];
        const x0 = col * 500; const y0 = 135 + row * 500;
        const triangles = [];
        for (let index = 0; index < variant.geometry.foliage.positions.length; index += 9) {
          triangles.push({
            wood: false,
            part: variant.geometry.foliage.parts[index / 3],
            points: Array.from({ length: 3 }, (_, vertex) => (
              variant.geometry.foliage.positions.slice(index + vertex * 3, index + vertex * 3 + 3)
            )),
          });
        }
        for (let index = 0; index < variant.geometry.wood.positions.length; index += 9) {
          triangles.push({
            wood: true,
            part: 0,
            points: Array.from({ length: 3 }, (_, vertex) => (
              variant.geometry.wood.positions.slice(index + vertex * 3, index + vertex * 3 + 3)
            )),
          });
        }
        const points = triangles.flatMap((triangle) => triangle.points);
        const xs = points.map((point) => point[0]); const ys = points.map((point) => point[1]);
        const minX = Math.min(...xs); const maxX = Math.max(...xs);
        const minY = Math.min(...ys); const maxY = Math.max(...ys);
        const scale = Math.min(390 / (maxX - minX), 390 / (maxY - minY));
        const cx = x0 + 250; const ground = y0 + 400;
        triangles.sort((a, b) => (
          a.points.reduce((sum, point) => sum + point[2], 0)
          - b.points.reduce((sum, point) => sum + point[2], 0)
        ));
        for (const triangle of triangles) {
          ctx.fillStyle = triangle.wood ? '#76513c' : foliageColors[triangle.part % foliageColors.length];
          ctx.beginPath();
          triangle.points.forEach((point, index) => {
            const px = cx + (point[0] - (minX + maxX) / 2) * scale;
            const py = ground - (point[1] - minY) * scale;
            if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          });
          ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = '#d2cab5'; ctx.strokeRect(x0 + 12, y0 + 4, 476, 470);
        ctx.fillStyle = '#4a4d43'; ctx.textAlign = 'center'; ctx.font = '600 18px system-ui';
        ctx.fillText(`${candidate.style}, seed ${variant.seed}`, cx, y0 + 434);
        ctx.font = '15px system-ui'; ctx.fillText(variant.name, cx, y0 + 460);
      }
    }
  }, candidates);
  await page.locator('#sheet').screenshot({ path: output });
} finally {
  await browser.close();
}
console.log(output);
