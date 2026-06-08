// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cycle 73 P1: entrance hero FINAL capture for Newsheepdogland.
//
// Supersedes the Cycle 68 headless tools/hero-capture.mjs. The dark-dome on the
// horizon was a HEADLESS-WebGL artifact (offscreen chromium); this tool launches
// a real GPU browser (headed Chrome + d3d11, the Cycle 71 recipe that already
// produced a dome-free shipped capture) so the sky renders correctly.
//
// Drives the in-repo cinematic API (window.__sdsCinema, ?cinematic=1) to hand-set
// the camera/sun per cycle68-validation/hero/manifest.md, plus wider landscape
// framings that show the boot island + mountain instead of the abstract water the
// current shipped webp reads as.
//
// Prereq: a dev server on :3000 (SDS_SUPPRESS_BROWSER_OPEN=1 npm run dev:client).
// Output: cycle73-validation/hero/*.png (gitignored).

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const OUT = resolve(ROOT, 'cycle73-validation', 'hero');
const BASE = 'http://localhost:3000/?scene=newsheepdogland&cinematic=1&probeRender=1';
const GPU = process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : [];

// Candidate poses. Scene coords (from shared/scenes/newsheepdogland.js + manifest):
//   pen center (640,-1000) r30, gate (610,-1000), dog spawn (585,-1000) facing W,
//   grass/flock center ~(250,-1080), mountain peak (-616,1110) 120m, sea level -3.
// The boot island runs SE (homestead) -> NW (mountain). Frame WEST/NW so the lens
// crosses the grazing plain toward the mountain, island filling the frame.
// Round 3: the "dark dome" is the SunBillboard mesh (a flat sun disk whose
// konveyor node-material renders dark on the WebGL-pinned scene). We hide it
// (mesh.name === 'SunBillboard') before capture, keeping the atmosphere's warm
// fog horizon + the island. Now wider framings that show the boot island +
// mountain read cleanly.
// Round 5 (final): sky dome + billboard hidden (both render dark on WebGL). Sun is
// to the WEST (billboard sat at x=-2723), so warm fog horizon is westward. Aim
// west at the flock for warm light, keep water out of frame (it renders dark +
// speckled on WebGL), homestead/sheep/autumn-woods as the subject.
const POSES = [
  {
    name: 'u-pasture-flock-golden07',
    cam: { x: 360, y: 13, z: -1235 }, target: { x: 250, y: 9, z: -1080 }, sun: 0.07,
    note: 'pasture+flock, true golden-hour sun (warm fog horizon), grass + trees',
  },
  {
    name: 'v-pasture-flock-golden10',
    cam: { x: 360, y: 13, z: -1235 }, target: { x: 250, y: 9, z: -1080 }, sun: 0.10,
    note: 'pasture+flock, low golden, slightly brighter than u',
  },
  {
    name: 'w-west-flock-golden07',
    cam: { x: 640, y: 20, z: -1065 }, target: { x: 150, y: 11, z: -1100 }, sun: 0.07,
    note: 'looking W at the flock into the warm western horizon, golden-hour',
  },
  {
    name: 'x-homestead-golden09',
    cam: { x: 430, y: 24, z: -1165 }, target: { x: 640, y: 16, z: -1000 }, sun: 0.09,
    note: 'homestead 3/4 at golden hour, autumn trees warm-lit',
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: [...GPU, '--no-sandbox', '--hide-scrollbars'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', (e) => console.warn('[page error]', e.message));
    await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
    await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 45000 });
    // newsheepdogland is heavy (WebGL pin); let terrain + grass + atmosphere settle.
    await sleep(5000);

    // Diagnostic: what is the dark dome? Dump big/sky scene objects + billboard state.
    const diag = await page.evaluate(() => {
      const sm = window.__sds?.sceneManager;
      const scene = sm?.getScene?.() || sm?.scene;
      if (!scene) return { sceneFound: false, hasSds: !!window.__sds };
      const big = [];
      let billboard = null;
      scene.traverse((o) => {
        if (o.name === 'SunBillboard') billboard = { visible: o.visible, pos: o.position.toArray().map(Math.round), ro: o.renderOrder };
        if (o.isSprite || (o.isMesh && o.geometry?.boundingSphere?.radius > 500) || /sun|sky|dome|sprite/i.test(o.name)) {
          big.push({ name: o.name || o.type, type: o.type, visible: o.visible, ro: o.renderOrder });
        }
      });
      return { sceneFound: true, bg: scene.background?.getHexString?.() ?? null, billboard, big: big.slice(0, 25) };
    });
    console.log('[DIAG]', JSON.stringify(diag, null, 1));

    for (const pose of POSES) {
      const posed = await page.evaluate(({ cam, target, sun }) => {
        const c = window.__sdsCinema;
        if (!c) return { ok: false, reason: 'no __sdsCinema' };
        try {
          c.hideUI?.();
          for (const id of ['sds-daynight-chip', 'react-overlay']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
          }
          for (const el of document.querySelectorAll('canvas ~ div, .hud, [class*="chip"], [class*="Chip"]')) {
            try { el.style.display = 'none'; } catch {}
          }
          // Hide the SunBillboard disk (renders dark on the WebGL-pinned scene).
          let hidBillboard = false;
          const scene = window.__sds?.sceneManager?.getScene?.();
          scene && scene.traverse && scene.traverse((o) => {
            if (o.name === 'SunBillboard' || o.name === 'HosekWilkieSkyDome') { o.visible = false; hidBillboard = true; }
          });
          c.setCameraMode?.('free');
          c.setSun?.(sun);
          c.setCameraPose?.(cam, target);
          return { ok: true, hidBillboard };
        } catch (e) { return { ok: false, reason: String(e) }; }
      }, pose);
      if (posed.ok && !posed.hidBillboard) console.warn(`[${pose.name}] SunBillboard not found to hide`);
      if (!posed.ok) { console.warn(`[${pose.name}] pose failed:`, posed.reason); continue; }
      // Re-assert pose + sun across a few frames so the controller/day-clock don't drift it.
      for (let i = 0; i < 8; i++) {
        await sleep(140);
        await page.evaluate(({ cam, target, sun }) => {
          const scene = window.__sds?.sceneManager?.getScene?.();
          scene && scene.traverse && scene.traverse((o) => { if (o.name === 'SunBillboard' || o.name === 'HosekWilkieSkyDome') o.visible = false; });
          window.__sdsCinema?.setSun?.(sun);
          window.__sdsCinema?.setCameraPose?.(cam, target);
        }, pose);
      }
      const path = resolve(OUT, `${pose.name}.png`);
      await page.screenshot({ path, type: 'png' });
      console.log(`wrote ${path}  (${pose.note})`);
    }
    await page.close();
  } finally {
    await browser.close();
  }
}

main().then(() => console.log('cycle73 hero capture done')).catch((e) => {
  console.error('cycle73 hero capture failed:', e?.message || e);
  process.exit(1);
});
