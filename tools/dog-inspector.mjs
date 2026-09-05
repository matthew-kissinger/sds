// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Dog Inspector: Multi-angle character review and visual capture tool.
// Drives the 3D customization studio, steps through curated inspection angles
// (Face Close-Up, 3/4 Hero, Side Profile, Front Chest, Rear 3/4, Top-Down),
// captures high-resolution screenshots across dog coat presets,
// and produces a character inspection report.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  launchBrowser,
  removeDir,
  scratchDir,
} from './probe-lib.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback = '') => {
  const hit = argv.find((argument) => argument.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};

const url = flag('url', 'http://localhost:5199/');
const coatFilter = flag('coat', 'all'); // 'all' or coat id e.g. 'classic', 'red', 'merle', 'chocolate', 'golden'
const angleFilter = flag('angle', 'all'); // 'all' or angle id e.g. 'face', 'hero', 'profile', 'front', 'rear', 'top'
const defaultOutDir = 'C:/Users/Mattm/.gemini/antigravity/brain/85a54d36-a869-412e-9756-7f853ed38d5d/dog-review';
const outDir = flag('out', defaultOutDir);
const dpr = Number(flag('dpr', '2'));
const width = Number(flag('width', '1440'));
const height = Number(flag('height', '900'));

const ALL_COATS = [
  { id: 'classic', name: 'Classic Black & White', buttonText: 'Classic Black & White' },
  { id: 'red', name: 'Red & White (Sable)', buttonText: 'Red & White' },
  { id: 'merle', name: 'Blue Merle', buttonText: 'Blue Merle' },
  { id: 'chocolate', name: 'Chocolate / Liver', buttonText: 'Chocolate' },
  { id: 'golden', name: 'Golden Wheaten', buttonText: 'Golden Wheaten' },
];

const ALL_ANGLES = [
  { id: 'face', label: 'Face', desc: 'Close-up portrait of facial blaze, almond eyes, amber iris, pupil & catch lights' },
  { id: 'hero', label: '3/4 Hero', desc: 'Three-quarter dynamic beauty angle showcasing head, collar, bib & front stockings' },
  { id: 'front', label: 'Front', desc: 'Direct frontal symmetry showing chest bib, muzzle line & forelegs' },
  { id: 'profile', label: 'Profile', desc: 'Lateral broadside view showing topline, underline, flank & tail plume' },
  { id: 'rear', label: 'Rear', desc: 'Rear three-quarter view showing plume tip, hock stockings & spine' },
  { id: 'top', label: 'Top', desc: 'Overhead dorsal view showing skull markings, back coat & tail plume' },
];

const coatsToCapture = coatFilter === 'all'
  ? ALL_COATS
  : ALL_COATS.filter((c) => c.id === coatFilter);

const anglesToCapture = angleFilter === 'all'
  ? ALL_ANGLES
  : ALL_ANGLES.filter((a) => a.id === angleFilter);

if (coatsToCapture.length === 0) {
  throw new Error(`Unknown coat preset: ${coatFilter}. Available: ${ALL_COATS.map((c) => c.id).join(', ')}`);
}
if (anglesToCapture.length === 0) {
  throw new Error(`Unknown angle preset: ${angleFilter}. Available: ${ALL_ANGLES.map((a) => a.id).join(', ')}`);
}

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

let profile = null;
let browser = null;

try {
  console.log('=== Dog Character Multi-Angle Inspector ===');
  console.log(`Target URL: ${url}`);
  console.log(`Output Directory: ${outDir}`);
  console.log(`Coats (${coatsToCapture.length}): ${coatsToCapture.map((c) => c.id).join(', ')}`);
  console.log(`Angles (${anglesToCapture.length}): ${anglesToCapture.map((a) => a.id).join(', ')}`);
  console.log(`Resolution: ${width}x${height} @ ${dpr}x DPR\n`);

  profile = scratchDir('sds-dog-inspector');
  browser = await launchBrowser(profile);
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    colorScheme: 'light',
  });
  const page = await context.newPage();

  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle' });

  await page.waitForSelector('.herd-title-card', { timeout: 15000 });
  await page.waitForTimeout(1500);

  // Click Customize button
  console.log('Opening Studio Customizer...');
  await page.click('button:has-text("Customize")');
  await page.waitForSelector('.herd-customize-dock', { timeout: 5000 });
  await page.waitForSelector('.herd-angle-controls', { timeout: 5000 });
  await page.waitForTimeout(1200);

  const manifest = [];

  for (const coat of coatsToCapture) {
    console.log(`\n--- Inspecting Coat: ${coat.name} (${coat.id}) ---`);
    await page.click(`button:has-text("${coat.buttonText}")`);
    await page.waitForTimeout(400);

    for (const angle of anglesToCapture) {
      console.log(`Capturing angle: [${angle.label}] - ${angle.desc}...`);
      await page.click(`.herd-angle-btn:has-text("${angle.label}")`);
      // Wait for camera approach glide to seat comfortably
      await page.waitForTimeout(800);

      const filename = `dog-${coat.id}-${angle.id}.png`;
      const filePath = path.join(outDir, filename);
      await page.screenshot({ path: filePath });
      console.log(`  -> Saved ${filename}`);

      manifest.push({
        coatId: coat.id,
        coatName: coat.name,
        angleId: angle.id,
        angleLabel: angle.label,
        desc: angle.desc,
        filename,
      });
    }
  }

  // Generate HTML Gallery Report
  const htmlReport = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Working Sheepdog Multi-Angle Character Review</title>
  <style>
    :root {
      --bg: #f5efe6;
      --card-bg: #ffffff;
      --ink: #2c251f;
      --ink-soft: #63584e;
      --line: rgba(76, 55, 33, 0.18);
      --accent: #8b5a2b;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 32px;
      background: var(--bg);
      color: var(--ink);
    }
    header {
      margin-bottom: 32px;
      border-bottom: 2px solid var(--line);
      padding-bottom: 16px;
    }
    h1 {
      font-size: 28px;
      margin: 0 0 8px 0;
      font-weight: 700;
      color: var(--ink);
    }
    p.lead {
      color: var(--ink-soft);
      margin: 0;
      font-size: 15px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
      gap: 24px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
      display: flex;
      flex-direction: column;
    }
    .card-img-wrap {
      background: #e2d9cd;
      aspect-ratio: 16 / 10;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card-img-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.25s ease;
      cursor: zoom-in;
    }
    .card-img-wrap img:hover {
      transform: scale(1.04);
    }
    .card-body {
      padding: 16px;
    }
    .badges {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }
    .badge {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 3px 8px;
      border-radius: 4px;
      background: #e8ded2;
      color: var(--ink);
    }
    .badge-coat {
      background: #8b5a2b;
      color: white;
    }
    .card-title {
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 6px 0;
    }
    .card-desc {
      font-size: 13px;
      color: var(--ink-soft);
      margin: 0;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <header>
    <h1>Working Sheepdog Character Inspector</h1>
    <p class="lead">AAA Character Model & Marking Verification across 6 Curated Angles and Authentic Coat Presets.</p>
  </header>
  <main class="grid">
    ${manifest
      .map(
        (item) => `
    <div class="card">
      <div class="card-img-wrap">
        <a href="${item.filename}" target="_blank" rel="noopener">
          <img src="${item.filename}" alt="${item.coatName} - ${item.angleLabel}" loading="lazy" />
        </a>
      </div>
      <div class="card-body">
        <div class="badges">
          <span class="badge badge-coat">${item.coatName}</span>
          <span class="badge">${item.angleLabel}</span>
        </div>
        <div class="card-title">${item.angleLabel} View</div>
        <p class="card-desc">${item.desc}</p>
      </div>
    </div>`,
      )
      .join('\n')}
  </main>
</body>
</html>`;

  writeFileSync(path.join(outDir, 'index.html'), htmlReport, 'utf8');
  console.log(`\nGenerated visual review report at ${path.join(outDir, 'index.html')}`);
  console.log(`Done! All ${manifest.length} character review angles captured successfully.`);
} finally {
  if (browser) await browser.close();
  if (profile) removeDir(profile);
}
