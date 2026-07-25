#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Entrance panel vs hero dog clearance (Cycle 113 Phase 6).
 *
 * D8 frames every hero around a dog large in the near third. The entrance panel
 * sits at the bottom of that same frame, so the two compete for the same band
 * and the old 362px panel won: on the live entrance the dog and the near half
 * of the flock were behind it on all four worlds.
 *
 * Cycle 113 shrank the panel and moved the world name onto the photograph. This
 * measures whether that was enough, per world and per viewport, rather than
 * trusting the arithmetic. The cycle plan's Q3 arithmetic was wrong once
 * already: it compared the panel against the dog's CENTRE band (73.5% to 76% of
 * frame height) and forgot the dog's own height, which puts the real floor at
 * its bottom edge, 78.0%.
 *
 * The dog's position comes from cycle112-validation/heroes/measurements.json,
 * written by tools/hero-capture-cycle112.mjs when the heroes were shot. Its
 * `dogNdc` is the dog's centre in the captured 1920x1080 frame; this script
 * re-projects that through the same `object-fit: cover` the entrance applies at
 * each viewport.
 *
 * WHAT THIS DOES NOT MEASURE. `dogFrameHeightPct` is a height, so the dog's
 * on-screen WIDTH is estimated at 1.6x its height (a standing dog in profile).
 * Vertical overlap against a full-width panel does not depend on that estimate;
 * the horizontal crop check does, and is reported as an estimate.
 *
 * Assumes a dev server on :3000, matching the other scripts here.
 *
 * Usage:
 *   node tools/validation/entrance-hero-clearance.mjs
 *   node tools/validation/entrance-hero-clearance.mjs --shots
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.SDS_BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = 'cycle113-validation';
const MEASUREMENTS = 'cycle112-validation/heroes/measurements.json';

const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];

/** The captured heroes are 1920x1080; every projection below assumes it. */
const HERO_W = 1920;
const HERO_H = 1080;

/** A standing dog in profile is roughly 1.6x as long as it is tall. */
const DOG_ASPECT = 1.6;

const WORLDS = [
  { shot: 'field', name: 'Home Field' },
  { shot: 'rolling-hills', name: 'Rolling Hills' },
  { shot: 'open-country', name: 'Open Country' },
  { shot: 'newsheepdogland', name: 'Newsheepdogland' },
];

const VIEWPORTS = [
  { label: '1440x900', width: 1440, height: 900, gate: true },
  { label: '1920x1080', width: 1920, height: 1080, gate: true },
  { label: '390x844', width: 390, height: 844, gate: true, isMobile: true, hasTouch: true },
];

function parseArgs(argv) {
  const args = { shots: false };
  for (const a of argv.slice(2)) {
    if (a === '--shots') args.shots = true;
  }
  return args;
}

/**
 * Where the dog lands on screen, given `object-fit: cover` of the 1920x1080
 * hero in this viewport with the default centred object-position.
 */
function projectDog(measure, vw, vh, objectPositionPct) {
  const scale = Math.max(vw / HERO_W, vh / HERO_H);
  const renderedW = HERO_W * scale;
  const renderedH = HERO_H * scale;
  // `object-position: X%` aligns the image's X% point with the box's X% point,
  // which for an overflowing axis works out to this offset. Centre is 50%.
  const offsetX = (vw - renderedW) * (objectPositionPct / 100);
  const offsetY = (vh - renderedH) / 2;

  const fx = (measure.dogNdc.x + 1) / 2;
  const fy = (1 - measure.dogNdc.y) / 2;
  const h = (measure.dogFrameHeightPct / 100) * renderedH;
  const w = h * DOG_ASPECT;
  const cx = offsetX + fx * renderedW;
  const cy = offsetY + fy * renderedH;

  return {
    top: cy - h / 2,
    bottom: cy + h / 2,
    left: cx - w / 2,
    right: cx + w / 2,
    centreX: cx,
    centreY: cy,
    heightPx: h,
    widthPxEstimated: w,
  };
}

async function armWorld(page, name) {
  const armed = page.locator('#react-overlay .sds-ent-world-name');
  await armed.waitFor({ state: 'visible', timeout: 60_000 });
  for (let i = 0; i < 8; i++) {
    const text = (await armed.textContent())?.trim() ?? '';
    if (text.startsWith(name)) return true;
    await page.getByRole('button', { name: /Next world/i }).dispatchEvent('click');
    await page.waitForTimeout(180);
  }
  return false;
}

async function readPanel(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-sds-entrance-panel]');
    const dock = document.querySelector('.sds-ent-dock');
    if (!panel || !dock) return null;
    const p = panel.getBoundingClientRect();
    // The panel's sds-rise keyframe may still be mid-flight (and is throttled
    // outright in a background tab), so read the untransformed dock for the
    // settled top edge and take the panel only for its height.
    const d = dock.getBoundingClientRect();
    return {
      top: d.top,
      settledTop: d.top,
      renderedTop: p.top,
      height: p.height,
      width: p.width,
      left: p.left,
      right: p.right,
      viewportH: window.innerHeight,
      viewportW: window.innerWidth,
    };
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const measurements = JSON.parse(await readFile(MEASUREMENTS, 'utf8'))
    .results.filter((r) => r.aspect === 'entrance');

  await mkdir(OUT_DIR, { recursive: true });
  if (args.shots) await mkdir(`${OUT_DIR}/entrance`, { recursive: true });

  const browser = await chromium.launch({ args: CHROMIUM_GPU_ARGS });
  const rows = [];
  let failures = 0;

  try {
    for (const vp of VIEWPORTS) {
      const { label, gate, width, height, ...rest } = vp;
      const context = await browser.newContext({ viewport: { width, height }, ...rest });
      const page = await context.newPage();
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => typeof window.__sdsBootTimeline?.firstInteractive === 'number',
        null,
        { timeout: 90_000 },
      );

      for (const world of WORLDS) {
        const measure = measurements.find((m) => m.shot === world.shot);
        if (!measure) continue;
        const armed = await armWorld(page, world.name);
        const panel = await readPanel(page);
        if (!armed || !panel) {
          rows.push({ viewport: label, world: world.shot, error: armed ? 'no panel' : 'could not arm' });
          failures++;
          continue;
        }

        // Read the object-position the entrance is actually applying rather
        // than the value in worlds.ts, so a knob that never reaches the <img>
        // reads as a failure instead of as a pass.
        const objectPositionPct = await page.evaluate(() => {
          const img = document.querySelector('.sds-ent-hero img');
          const x = img ? getComputedStyle(img).objectPosition.split(/\s+/)[0] : '50%';
          return x.endsWith('%') ? parseFloat(x) : 50;
        });

        const dog = projectDog(measure, panel.viewportW, panel.viewportH, objectPositionPct);
        const overlapPx = Math.max(0, dog.bottom - panel.settledTop);
        const overlapPctOfDog = +(overlapPx / dog.heightPx * 100).toFixed(1);
        // Horizontal: the whole dog must be inside the crop, not merely
        // intersecting it. A centre at -3.9% technically "intersects" and is
        // still a hero with no dog in it.
        const croppedOut = dog.left < 0 || dog.right > panel.viewportW;

        const row = {
          viewport: label,
          world: world.shot,
          gated: gate,
          objectPositionPct,
          panelTopPx: Math.round(panel.settledTop),
          panelTopPctOfViewport: +(panel.settledTop / panel.viewportH * 100).toFixed(1),
          panelHeightPx: Math.round(panel.height),
          dogTopPctOfViewport: +(dog.top / panel.viewportH * 100).toFixed(1),
          dogBottomPctOfViewport: +(dog.bottom / panel.viewportH * 100).toFixed(1),
          dogCentreXPctOfViewport: +(dog.centreX / panel.viewportW * 100).toFixed(1),
          dogHeightPx: +dog.heightPx.toFixed(1),
          overlapPx: +overlapPx.toFixed(1),
          overlapPctOfDog,
          croppedOut,
          clear: overlapPx <= 0 && !croppedOut,
        };
        rows.push(row);

        if (gate && !row.clear) failures++;

        if (args.shots) {
          await page.screenshot({ path: `${OUT_DIR}/entrance/${world.shot}__${label}.png` });
        }

        const verdict = row.clear ? 'CLEAR' : (row.croppedOut ? 'CROPPED' : `OVERLAP ${row.overlapPx}px`);
        console.log(
          `${label.padEnd(10)} ${world.shot.padEnd(17)} panel@${String(row.panelTopPctOfViewport).padStart(5)}%  `
          + `dog ${String(row.dogTopPctOfViewport).padStart(5)}-${String(row.dogBottomPctOfViewport).padStart(5)}%  `
          + `x ${String(row.dogCentreXPctOfViewport).padStart(5)}%  ${verdict}`,
        );
      }

      await page.close();
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const report = {
    note: 'dog width is estimated at 1.6x its measured height; vertical clearance does not depend on it',
    heroSource: MEASUREMENTS,
    rows,
  };
  await writeFile(`${OUT_DIR}/hero-panel-clearance.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nwrote ${OUT_DIR}/hero-panel-clearance.json`);

  if (failures > 0) {
    console.error(`\n${failures} gated case(s) not clear.`);
    process.exit(1);
  }
  console.log('every gated case clear.');
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
