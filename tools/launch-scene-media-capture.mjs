// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Captures current in-game launch media for README/site hero images and
// Open Graph/Twitter cards. Run against a production preview after `npm run build`.

import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASE_URL = argValue('--base-url') ?? 'http://127.0.0.1:4173/';
const REPORT_DIR = resolve(ROOT, argValue('--report-dir') ?? 'cycle110-validation/scene-media-refresh');
const HERO_DIR = resolve(ROOT, 'assets/scenes/entrance');
const SOCIAL_DIR = resolve(ROOT, 'assets/scenes/social');
const CONTACT_SHEET = resolve(REPORT_DIR, 'contact-sheet.webp');
const HERO_SIZE = { width: 1920, height: 1080 };
const SOCIAL_SIZE = { width: 1200, height: 630 };
const LAUNCH_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--no-sandbox']
  : ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--no-sandbox'];

const SHOTS = [
  {
    id: 'field',
    file: 'field.webp',
    scene: 'field',
    sun: 0.58,
    dog: { x: 18, z: 34, velocity: { x: -1.1, z: -1.2 } },
    camera: { pos: { x: 52, y: 20, z: 66 }, target: { x: 0, y: 2, z: 0 } },
  },
  {
    id: 'rolling-hills',
    file: 'rolling-hills.webp',
    scene: 'rolling-hills',
    sun: 0.08,
    dog: { x: 16, z: 30, velocity: { x: -0.8, z: -1.3 } },
    camera: { pos: { x: 110, y: 58, z: 155 }, target: { x: 0, y: 7, z: 0 } },
  },
  {
    id: 'open-country',
    file: 'open-country.webp',
    scene: 'open-country',
    sun: 0.48,
    dog: { x: 22, z: 34, velocity: { x: -1.3, z: -0.8 } },
    camera: { pos: { x: 82, y: 36, z: 120 }, target: { x: 0, y: 6, z: 0 } },
  },
  {
    id: 'newsheepdogland',
    file: 'newsheepdogland.webp',
    scene: 'newsheepdogland',
    sun: 0.13,
    dog: { x: 604, z: -1008, velocity: { x: 1.4, z: 1.6 } },
    camera: { pos: { x: 430, y: 28, z: -1165 }, target: { x: 640, y: 14, z: -985 } },
  },
];

function argValue(name) {
  const prefix = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function publicUrl(baseUrl, scene) {
  const url = new URL(baseUrl);
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('scene', scene);
  url.searchParams.set('cinematic', '1');
  url.searchParams.set('probeRender', '1');
  url.searchParams.set('ui', 'off');
  return url.toString();
}

function seedFor(id) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

async function newShotPage(browser, shot) {
  const context = await browser.newContext({ viewport: HERO_SIZE });
  await context.addInitScript(({ seed }) => {
    let state = seed >>> 0;
    Math.random = () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try {
      localStorage.clear();
      localStorage.setItem('playerIdentity', JSON.stringify({
        persistentId: 'launch_media',
        displayName: 'LaunchMedia',
        fullName: 'LaunchMedia#0001',
        discriminator: '0001',
        nameType: 'custom',
        createdAt: 1782499200000,
        isRegistered: false,
      }));
    } catch {}
  }, { seed: seedFor(shot.id) });
  return { context, page: await context.newPage() };
}

async function canvasShot(page) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.querySelector('#canvas-container canvas') ?? document.querySelector('canvas');
    if (!canvas) throw new Error('game canvas not found');
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
}

async function assertWebGpu(page, shot) {
  const renderer = await page.evaluate(() => ({
    ok: window.__sdsG?.productionWebGpu?.ok === true,
    effective: window.__sdsRendererMode?.effective ?? null,
    isWebGpuRenderer: window.gameInstance?.sceneManager?.renderer?.isWebGPURenderer === true
      || window.__sds?.sceneManager?.renderer?.isWebGPURenderer === true,
    reason: window.__sdsG?.productionWebGpu?.error
      ?? window.__sdsRendererMode?.fallbackReason ?? null,
  }));
  if (!renderer.ok || renderer.effective === 'webgl') {
    throw new Error(`${shot.id}: WebGPU did not engage: ${JSON.stringify(renderer)}`);
  }
  return renderer;
}

async function poseShot(page, shot) {
  await page.evaluate((s) => {
    const c = window.__sdsCinema;
    c.hideUI?.();
    c.startSolo?.('jep', 'classic');
    c.hideUI?.();
    c.setSun?.(s.sun);
  }, shot);
  await page.evaluate(() => window.__sdsCinema.waitForFlockSize?.(30, 60_000)).catch(() => {});
  for (let i = 0; i < 10; i++) {
    await page.evaluate((s) => {
      const c = window.__sdsCinema;
      c.pauseSimulation?.();
      c.freeFlyActive = true;
      c.setSun?.(s.sun);
      c.poseDog?.(s.dog.x, s.dog.z, s.dog.velocity, 1 / 60);
      c.setCameraPose?.(s.camera.pos, s.camera.target);
      c.syncAtmosphereToCamera?.();
      c.renderFrame?.();
    }, shot);
    await page.waitForTimeout(120);
  }
}

async function imageStats(path) {
  const image = sharp(path);
  const meta = await image.metadata();
  const { data, info } = await image
    .resize(160, 90, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  let sumSq = 0;
  for (const value of data) {
    sum += value;
    sumSq += value * value;
  }
  const n = info.width * info.height * info.channels;
  const mean = sum / n;
  const variance = Math.max(0, (sumSq / n) - mean * mean);
  return {
    width: meta.width,
    height: meta.height,
    size: statSync(path).size,
    mean: Number(mean.toFixed(2)),
    stddev: Number(Math.sqrt(variance).toFixed(2)),
    nonBlank: Math.sqrt(variance) > 8,
  };
}

async function writeAssets(png, shot) {
  const heroPath = resolve(HERO_DIR, shot.file);
  const socialPath = resolve(SOCIAL_DIR, shot.file);
  await sharp(png)
    .resize(HERO_SIZE.width, HERO_SIZE.height, { fit: 'cover' })
    .webp({ quality: 84, effort: 6 })
    .toFile(heroPath);
  await sharp(png)
    .resize(SOCIAL_SIZE.width, SOCIAL_SIZE.height, { fit: 'cover' })
    .webp({ quality: 82, effort: 6 })
    .toFile(socialPath);
  const heroStats = await imageStats(heroPath);
  const socialStats = await imageStats(socialPath);
  if (!heroStats.nonBlank || !socialStats.nonBlank) throw new Error(`${shot.id}: blank image output`);
  if (heroStats.width !== HERO_SIZE.width || heroStats.height !== HERO_SIZE.height) {
    throw new Error(`${shot.id}: hero dimension mismatch ${heroStats.width}x${heroStats.height}`);
  }
  if (socialStats.width !== SOCIAL_SIZE.width || socialStats.height !== SOCIAL_SIZE.height) {
    throw new Error(`${shot.id}: social dimension mismatch ${socialStats.width}x${socialStats.height}`);
  }
  return {
    hero: { path: relative(ROOT, heroPath).replace(/\\/g, '/'), ...heroStats },
    social: { path: relative(ROOT, socialPath).replace(/\\/g, '/'), ...socialStats },
  };
}

async function writeContactSheet(results) {
  const tiles = [];
  for (const result of results) {
    tiles.push(await sharp(resolve(ROOT, result.assets.hero.path)).resize(480, 270).webp().toBuffer());
    tiles.push(await sharp(resolve(ROOT, result.assets.social.path)).resize(480, 252).webp().toBuffer());
  }
  const width = 960;
  const height = results.length * 270;
  const composites = [];
  for (let i = 0; i < results.length; i++) {
    composites.push({ input: tiles[i * 2], left: 0, top: i * 270 });
    composites.push({ input: tiles[i * 2 + 1], left: 480, top: i * 270 + 9 });
  }
  await sharp({ create: { width, height, channels: 3, background: '#101820' } })
    .composite(composites)
    .webp({ quality: 86, effort: 6 })
    .toFile(CONTACT_SHEET);
}

async function captureShot(browser, shot) {
  const { context, page } = await newShotPage(browser, shot);
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  try {
    const url = publicUrl(BASE_URL, shot.scene);
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => Boolean(window.__sdsCinema), null, { timeout: 90_000 });
    await page.evaluate(() => window.__sdsCinema.waitReady?.(120_000));
    await page.waitForFunction(
      () => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true,
      null,
      { timeout: 180_000 },
    ).catch(() => {});
    const renderer = await assertWebGpu(page, shot);
    await poseShot(page, shot);
    const png = await canvasShot(page);
    const assets = await writeAssets(png, shot);
    const runtime = await page.evaluate(() => ({
      scene: window.gameInstance?.currentScene?.id ?? null,
      totalSheep: window.gameInstance?.gameState?.totalSheep ?? null,
      sheepCount: window.gameInstance?.gameState?.optimizedSheepSystem?.sheep?.length ?? null,
    }));
    return { id: shot.id, url, renderer, runtime, assets, consoleErrors };
  } finally {
    await context.close().catch(() => {});
  }
}

async function run() {
  await mkdir(HERO_DIR, { recursive: true });
  await mkdir(SOCIAL_DIR, { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: LAUNCH_ARGS,
  });
  const report = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    heroSize: HERO_SIZE,
    socialSize: SOCIAL_SIZE,
    results: [],
  };
  try {
    for (const shot of SHOTS) {
      console.log(`[LAUNCH-MEDIA] capturing ${shot.id}`);
      report.results.push(await captureShot(browser, shot));
    }
  } finally {
    await browser.close().catch(() => {});
  }
  await writeContactSheet(report.results);
  report.contactSheet = relative(ROOT, CONTACT_SHEET).replace(/\\/g, '/');
  report.ok = report.results.every((result) =>
    result.assets.hero.nonBlank
    && result.assets.social.nonBlank
    && result.renderer.ok
    && result.renderer.effective !== 'webgl'
  );
  await writeFile(resolve(REPORT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

run().catch((err) => {
  console.error('[LAUNCH-MEDIA] fatal:', err);
  process.exit(1);
});
