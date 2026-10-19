// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Scales the three accepted card stills to the 1200 by 630 frame the share
// image uses. The stills are 1440 by 810, the same 16:9, so this is a scale
// and not a crop. Output is JPEG because the first-load budget counts every
// file under the built assets, and a PNG of the grass does not fit.
//
// Input defaults to captures/boards/plates, which is gitignored. The committed
// files are the JPEGs this writes to app/public/cards. Re-running it is a
// visual decision: the capture recipe is tools/capture-card-plates.mjs.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = ['flank', 'across', 'wide'];
const from = resolve(process.argv[2] ?? join(repo, 'captures', 'boards', 'plates'));
const to = resolve(process.argv[3] ?? join(repo, 'app', 'public', 'cards'));

mkdirSync(to, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<canvas id="frame" width="1200" height="630"></canvas>');
  for (const name of names) {
    const png = readFileSync(join(from, `${name}.png`)).toString('base64');
    const jpeg = await page.evaluate(async (encoded) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.getElementById('frame');
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, 1200, 630);
      return canvas.toDataURL('image/jpeg', 0.82).slice('data:image/jpeg;base64,'.length);
    }, png);
    const bytes = Buffer.from(jpeg, 'base64');
    writeFileSync(join(to, `${name}.jpg`), bytes);
    console.log(`${name}.jpg ${bytes.length}`);
  }
  await page.close();
} finally {
  await browser.close();
}
