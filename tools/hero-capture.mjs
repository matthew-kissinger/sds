// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cycle 68 P7: candidate entrance hero capture for Newsheepdogland.
//
// Drives the in-repo cinematic API (window.__sdsCinema, enabled by ?cinematic=1 -
// the same hook tools/cinematic/run.mjs uses) so the camera/sun are hand-set per
// cycle68-validation/hero/manifest.md, not the gameplay follow rig. Produces a
// CANDIDATE reference frame; the final beauty pass is Matt's (per the media-prep
// working preference - Claude writes the manifest, Matt drives the browser).
//
// Prereq: a dev server on :3000 (npx vite --port 3000, SDS_SUPPRESS_BROWSER_OPEN=1).
// Output: cycle68-validation/hero/*.png (gitignored).

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const OUT = resolve(ROOT, 'cycle68-validation', 'hero');
const BASE = 'http://localhost:3000/?scene=newsheepdogland&cinematic=1';
const GPU = process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu'] : [];

// Candidate camera - elevated, south of the grazing foot, looking NORTH across
// the play area (pen + flock) toward the island interior, sun higher so the
// low-sun disk isn't in frame. Tune live (this is the reference, not the final).
const CAM = { x: 360, y: 145, z: -1340 };
const TARGET = { x: 320, y: 6, z: -980 };
const SUN_T = 0.36; // mid-morning so the sun disk clears the horizon

const shots = [
  { name: 'hero-newsheepdogland-1920x1080.png', w: 1920, h: 1080 },
  { name: 'hero-newsheepdogland-1200x630.png', w: 1200, h: 630 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: [...GPU, '--no-sandbox'] });
  try {
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: { width: shot.w, height: shot.h } });
      page.on('pageerror', (e) => console.warn('[page error]', e.message));
      await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
      // Wait for the cinematic API to install (scene booted).
      await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 30000 });
      // Let the scene + atmosphere + grass settle a beat.
      await sleep(2500);
      const posed = await page.evaluate(({ cam, target, sunT }) => {
        const c = window.__sdsCinema;
        if (!c) return { ok: false, reason: 'no __sdsCinema' };
        try {
          c.hideUI?.();
          // hideUI only hides #react-overlay; nuke the stray HUD chips too.
          for (const id of ['sds-daynight-chip', 'react-overlay']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
          }
          for (const el of document.querySelectorAll('canvas ~ div, .hud, [class*="chip"], [class*="Chip"]')) {
            try { el.style.display = 'none'; } catch {}
          }
          c.setCameraMode?.('free');
          c.setSun?.(sunT);
          c.setCameraPose?.(cam, target);
          return { ok: true };
        } catch (e) { return { ok: false, reason: String(e) }; }
      }, { cam: CAM, target: TARGET, sunT: SUN_T });
      if (!posed.ok) console.warn('[hero] pose failed:', posed.reason);
      // Re-assert the pose for a few frames so the controller doesn't drift it.
      for (let i = 0; i < 6; i++) {
        await sleep(120);
        await page.evaluate(({ cam, target }) => {
          window.__sdsCinema?.setCameraPose?.(cam, target);
        }, { cam: CAM, target: TARGET });
      }
      const path = resolve(OUT, shot.name);
      await page.screenshot({ path, type: 'png' });
      console.log(`wrote ${path}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().then(() => console.log('hero capture done')).catch((e) => {
  console.error('hero capture failed:', e?.message || e);
  process.exit(1);
});
