// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cycle 73 P2: Newsheepdogland aerial flythrough recording.
//
// The scene's dramatic Hosek sky + clean water are WebGPU-only (konveyor node
// materials); on the WebGL-pinned scene they render dark, so we hide the dark
// sky dome + sun billboard and capture the LAND, which renders beautifully. The
// clip conveys the 3.2 km^2 boot island's scale + geography (homestead -> grazing
// -> mountain) that stills cannot. Pale sky is a documented WebGL-pin limitation;
// a dramatic-sky version is gated behind the deferred WebGPU compile-reduction.
//
// Prereq: dev server on :3000 (SDS_SUPPRESS_BROWSER_OPEN=1 npm run dev:client) +
// ffmpeg on PATH. Output: cycle73-validation/cinematic/ (frames + mp4, gitignored).

import { chromium } from 'playwright';
import { mkdir, rm, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const OUT = resolve(ROOT, 'cycle73-validation', 'cinematic');
const FRAMES = resolve(OUT, 'frames');
const BASE = 'http://localhost:3000/?scene=newsheepdogland&cinematic=1&probeRender=1';
const GPU = process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : [];
const W = 1280, H = 720, FPS = 30, SECONDS = 9;
const N = FPS * SECONDS;
const SUN = 0.16;

// Low aerial sweep ALONG the grazing foot (E->W), staying over land the whole
// way so the WebGL-dark water stays out of frame: homestead -> flock/pasture ->
// west woods, mountain rising at frame-right. All keys sit in the grazing band
// (z ~ -1150..-1230, the playArea), low altitude, looking down at the pasture.
const KEYS = [
  { cam: { x: 690, y: 58, z: -1170 }, target: { x: 540, y: 12, z: -1000 } },
  { cam: { x: 470, y: 52, z: -1210 }, target: { x: 300, y: 10, z: -1060 } },
  { cam: { x: 200, y: 52, z: -1230 }, target: { x: 60, y: 12, z: -1050 } },
  { cam: { x: -60, y: 60, z: -1220 }, target: { x: -240, y: 24, z: -880 } },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lerp = (a, b, t) => a + (b - a) * t;
function pathAt(t) {
  const seg = Math.min(KEYS.length - 2, Math.floor(t * (KEYS.length - 1)));
  const lt = t * (KEYS.length - 1) - seg;
  const e = (x) => x * x * (3 - 2 * x); // smoothstep
  const u = e(lt);
  const a = KEYS[seg], b = KEYS[seg + 1];
  return {
    cam: { x: lerp(a.cam.x, b.cam.x, u), y: lerp(a.cam.y, b.cam.y, u), z: lerp(a.cam.z, b.cam.z, u) },
    target: { x: lerp(a.target.x, b.target.x, u), y: lerp(a.target.y, b.target.y, u), z: lerp(a.target.z, b.target.z, u) },
  };
}

async function main() {
  await rm(FRAMES, { recursive: true, force: true });
  await mkdir(FRAMES, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: [...GPU, '--no-sandbox', '--hide-scrollbars'] });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => console.warn('[page error]', e.message));
    await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
    await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 45000 });
    await sleep(5000);
    await page.evaluate((sun) => {
      const c = window.__sdsCinema;
      c.hideUI?.();
      for (const id of ['sds-daynight-chip', 'react-overlay']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
      c.setCameraMode?.('free');
      c.setSun?.(sun);
    }, SUN);

    for (let i = 0; i < N; i++) {
      const pose = pathAt(i / (N - 1));
      await page.evaluate(({ cam, target, sun }) => {
        const scene = window.__sds?.sceneManager?.getScene?.();
        scene && scene.traverse && scene.traverse((o) => { if (o.name === 'SunBillboard' || o.name === 'HosekWilkieSkyDome') o.visible = false; });
        window.__sdsCinema?.setSun?.(sun);
        window.__sdsCinema?.setCameraPose?.(cam, target);
      }, { ...pose, sun: SUN });
      await sleep(33);
      await page.screenshot({ path: resolve(FRAMES, `f${String(i).padStart(4, '0')}.png`), type: 'png' });
      if (i % 30 === 0) console.log(`frame ${i}/${N}`);
    }
    await page.close();
  } finally {
    await browser.close();
  }

  const frameCount = (await readdir(FRAMES)).filter((f) => f.endsWith('.png')).length;
  console.log(`captured ${frameCount} frames`);
  const mp4 = resolve(OUT, 'newsheepdogland-flythrough.mp4');
  const r = spawnSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', resolve(FRAMES, 'f%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', mp4],
    { encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status === 0) console.log(`wrote ${mp4}`);
  else console.warn('ffmpeg mux failed; frame sequence remains at', FRAMES, r.stderr?.split('\n').slice(-3).join(' '));
}

main().then(() => console.log('flythrough done')).catch((e) => { console.error('flythrough failed:', e?.message || e); process.exit(1); });
