// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { chromium } from 'playwright';
import sharp from 'sharp';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_SCENES = ['field', 'rolling-hills', 'open-country'];
const DEFAULT_SUNS = ['0.20', '0.35', '0.50', '0.75'];
const DEFAULT_RENDERERS = ['webgl', 'webgpu'];
const VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];
const IGNORED_CONSOLE = [
  /ServiceWorker/i,
  /geckos/i,
  /WebRTC/i,
  /favicon/i,
  /Failed to load resource.*sw\.js/i,
  /Connection timeout/i,
  /\[NETWORK\]/i,
  /\[PLAYER\].*Server registration failed/i,
];

const CAMERA_POSES = Object.freeze({
  overview: {
    field: { pos: { x: -58, y: 17, z: -52 }, target: { x: 24, y: 7, z: 22 } },
    'rolling-hills': { pos: { x: 62, y: 20, z: 42 }, target: { x: -44, y: 8, z: -24 } },
    'open-country': { pos: { x: 72, y: 24, z: -54 }, target: { x: -62, y: 9, z: 42 } },
  },
  'terrain-grass': {
    field: { pos: { x: -36, y: 10, z: -34 }, target: { x: 18, y: 4, z: 16 } },
    'rolling-hills': { pos: { x: 52, y: 13, z: 30 }, target: { x: -12, y: 5, z: -10 } },
    'open-country': { pos: { x: 62, y: 13, z: -42 }, target: { x: -24, y: 6, z: 20 } },
  },
  'foliage-far-tree': {
    field: { pos: { x: -74, y: 18, z: -18 }, target: { x: -10, y: 9, z: 30 } },
    'rolling-hills': { pos: { x: 84, y: 22, z: -12 }, target: { x: -48, y: 8, z: 28 } },
    'open-country': { pos: { x: 92, y: 23, z: -86 }, target: { x: -72, y: 9, z: 56 } },
  },
  'actor-read': {
    field: { pos: { x: -22, y: 9, z: -25 }, target: { x: 4, y: 3, z: 6 } },
    'rolling-hills': { pos: { x: 28, y: 10, z: -28 }, target: { x: -2, y: 3, z: 8 } },
    'open-country': { pos: { x: 34, y: 11, z: -34 }, target: { x: 2, y: 3, z: 6 } },
  },
  'water-regression': {
    'rolling-hills': { pos: { x: 300, y: 14, z: 145 }, target: { x: -620, y: 6, z: -220 } },
    'open-country': { pos: { x: 480, y: 16, z: -360 }, target: { x: -880, y: 7, z: 650 } },
  },
});

const REGION_BOXES = Object.freeze({
  sky: { x: 0.05, y: 0.04, w: 0.90, h: 0.34 },
  horizon: { x: 0.05, y: 0.35, w: 0.90, h: 0.16 },
  ground: { x: 0.08, y: 0.55, w: 0.84, h: 0.38 },
  actor: { x: 0.37, y: 0.42, w: 0.26, h: 0.42 },
  foliage: { x: 0.02, y: 0.10, w: 0.40, h: 0.62 },
  water: { x: 0.20, y: 0.42, w: 0.60, h: 0.36 },
});

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:3000/',
    out: 'cycle42-validation/runtime/material-lock.json',
    screenshotDir: 'cycle42-validation/screenshots/material-lock',
    contactSheet: 'cycle42-validation/screenshots/cycle42-material-contact-sheet.png',
    scenes: DEFAULT_SCENES.join(','),
    suns: DEFAULT_SUNS.join(','),
    renderers: DEFAULT_RENDERERS.join(','),
    poses: 'overview,terrain-grass,actor-read,foliage-far-tree,water-regression',
    channel: 'chrome',
    headed: false,
    noServer: false,
  };
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith('--')) continue;
    const [rawKey, rawValue] = arg.replace(/^--/, '').split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[key] = rawValue ?? true;
  }
  return {
    ...args,
    sceneIds: String(args.scenes).split(',').map((v) => v.trim()).filter(Boolean),
    sunValues: String(args.suns).split(',').map((v) => v.trim()).filter(Boolean),
    rendererIds: String(args.renderers).split(',').map((v) => v.trim()).filter(Boolean),
    poseIds: String(args.poses).split(',').map((v) => v.trim()).filter(Boolean),
    outPath: resolve(ROOT, args.out),
    screenshotPath: resolve(ROOT, args.screenshotDir),
    contactSheetPath: resolve(ROOT, args.contactSheet),
  };
}

function relative(path) {
  return path.startsWith(ROOT) ? path.slice(ROOT.length + 1).replace(/\\/g, '/') : path;
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '');
}

function shouldIgnoreConsole(text) {
  return IGNORED_CONSOLE.some((pattern) => pattern.test(text));
}

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function chromaDistance(a, b) {
  const ar = a?.meanRgb?.[0] ?? 0;
  const ag = a?.meanRgb?.[1] ?? 0;
  const ab = a?.meanRgb?.[2] ?? 0;
  const br = b?.meanRgb?.[0] ?? 0;
  const bg = b?.meanRgb?.[1] ?? 0;
  const bb = b?.meanRgb?.[2] ?? 0;
  return Math.sqrt(((ar - br) ** 2) + ((ag - bg) ** 2) + ((ab - bb) ** 2));
}

function sampleBuffer(data, width, height, box = { x: 0, y: 0, w: 1, h: 1 }) {
  const minX = Math.max(0, Math.floor(width * box.x));
  const minY = Math.max(0, Math.floor(height * box.y));
  const maxX = Math.min(width, Math.ceil(width * (box.x + box.w)));
  const maxY = Math.min(height, Math.ceil(height * (box.y + box.h)));
  let pixels = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumLum = 0;
  let sumLumSq = 0;
  let maxLum = 0;
  let clippedWhite = 0;
  let warmBright = 0;
  let coolPastel = 0;
  let glint = 0;

  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const lum = luma(r, g, b);
      pixels++;
      sumR += r;
      sumG += g;
      sumB += b;
      sumLum += lum;
      sumLumSq += lum * lum;
      maxLum = Math.max(maxLum, lum);
      if (r >= 248 && g >= 248 && b >= 248) clippedWhite++;
      if (r >= 215 && g >= 120 && b <= 180) warmBright++;
      if (b >= 150 && g >= 145 && r <= 205 && lum >= 135) coolPastel++;
      if (lum >= 178 && b >= 105 && g >= 105) glint++;
    }
  }

  const count = Math.max(1, pixels);
  const meanLum = sumLum / count;
  const variance = Math.max(0, (sumLumSq / count) - (meanLum * meanLum));
  return {
    pixels,
    meanRgb: [
      +(sumR / count).toFixed(3),
      +(sumG / count).toFixed(3),
      +(sumB / count).toFixed(3),
    ],
    meanLuma: +meanLum.toFixed(3),
    stdevLuma: +Math.sqrt(variance).toFixed(3),
    maxLuma: +maxLum.toFixed(3),
    clippedWhitePct: +(clippedWhite / count * 100).toFixed(4),
    warmBrightPct: +(warmBright / count * 100).toFixed(4),
    coolPastelPct: +(coolPastel / count * 100).toFixed(4),
    glintPct: +(glint / count * 100).toFixed(4),
  };
}

async function analyzeImage(path) {
  const raw = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = raw.info;
  const full = sampleBuffer(raw.data, width, height);
  const regions = {};
  for (const [name, box] of Object.entries(REGION_BOXES)) {
    regions[name] = sampleBuffer(raw.data, width, height, box);
  }
  return {
    width,
    height,
    mean: full.meanRgb.reduce((sum, value) => sum + value, 0) / 3,
    stdev: full.stdevLuma,
    maxLuma: full.maxLuma,
    clippedWhitePct: full.clippedWhitePct,
    warmBrightPct: full.warmBrightPct,
    waterGlintPct: regions.water.glintPct,
    nonBlank: full.stdevLuma > 2 && full.maxLuma > 30,
    regions,
  };
}

async function ensureVite(baseUrl, noServer) {
  if (noServer) return null;
  try {
    const response = await fetch(baseUrl, { method: 'HEAD' });
    if (response.ok || response.status === 404) {
      console.log('[CYCLE42-MATERIAL] Vite already running');
      return null;
    }
  } catch {}

  console.log('[CYCLE42-MATERIAL] Starting Vite dev server on 127.0.0.1:3000');
  const viteBin = resolve(ROOT, 'node_modules/vite/bin/vite.js');
  const proc = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '3000'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0', SDS_SUPPRESS_BROWSER_OPEN: '1' },
  });
  proc.stdout.on('data', () => {});
  proc.stderr.on('data', () => {});

  const startedAt = Date.now();
  while (Date.now() - startedAt < 90_000) {
    try {
      const response = await fetch(baseUrl, { method: 'HEAD' });
      if (response.ok || response.status === 404) {
        console.log('[CYCLE42-MATERIAL] Vite ready');
        return proc;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  try { proc.kill(); } catch {}
  throw new Error('Vite start timeout');
}

function buildUrl(baseUrl, shot, renderer) {
  const url = new URL(baseUrl);
  url.searchParams.set('renderer', renderer);
  url.searchParams.set('scene', shot.scene);
  url.searchParams.set('cinematic', '1');
  url.searchParams.set('perfMode', '1');
  url.searchParams.set('probeRender', '1');
  url.searchParams.set('ui', 'off');
  url.searchParams.set('autostart', '1');
  url.searchParams.set('mode', 'classic');
  url.searchParams.set('sun', String(shot.sun));
  return url.href;
}

function buildShots(sceneIds, sunValues, poseIds) {
  const shots = [];
  const wantsPose = (poseClass) => poseIds.includes(poseClass);
  if (wantsPose('overview')) {
    for (const scene of sceneIds) {
      for (const sun of sunValues) {
        shots.push({
          id: `overview-${scene}-sun-${safeName(sun)}`,
          poseClass: 'overview',
          scene,
          sun,
          camera: CAMERA_POSES.overview[scene] ?? CAMERA_POSES.overview.field,
        });
      }
    }
  }

  const midSuns = sunValues.filter((sun) => sun === '0.35' || sun === '0.50');
  for (const scene of sceneIds) {
    for (const sun of midSuns) {
      if (wantsPose('terrain-grass')) {
        shots.push({
          id: `terrain-grass-${scene}-sun-${safeName(sun)}`,
          poseClass: 'terrain-grass',
          scene,
          sun,
          camera: CAMERA_POSES['terrain-grass'][scene] ?? CAMERA_POSES['terrain-grass'].field,
        });
      }
      if (wantsPose('actor-read')) {
        shots.push({
          id: `actor-read-${scene}-sun-${safeName(sun)}`,
          poseClass: 'actor-read',
          scene,
          sun,
          camera: CAMERA_POSES['actor-read'][scene] ?? CAMERA_POSES['actor-read'].field,
          dogPose: { x: 0, z: 0 },
        });
      }
    }
  }

  for (const scene of ['rolling-hills', 'open-country'].filter((value) => sceneIds.includes(value))) {
    if (wantsPose('foliage-far-tree')) {
      for (const sun of midSuns) {
        shots.push({
          id: `foliage-far-tree-${scene}-sun-${safeName(sun)}`,
          poseClass: 'foliage-far-tree',
          scene,
          sun,
          camera: CAMERA_POSES['foliage-far-tree'][scene],
        });
      }
    }
    if (wantsPose('water-regression') && sunValues.includes('0.20')) {
      shots.push({
        id: `water-regression-${scene}-sun-0.20`,
        poseClass: 'water-regression',
        scene,
        sun: '0.20',
        camera: CAMERA_POSES['water-regression'][scene],
      });
    }
  }
  return shots;
}

async function seedIdentity(context) {
  await context.addInitScript(() => {
    const identity = {
      persistentId: 'player_cycle42_material_lock_' + Date.now(),
      displayName: 'Cycle42Proof',
      fullName: 'Cycle42Proof#0001',
      discriminator: '0001',
      nameType: 'custom',
      createdAt: Date.now(),
      isRegistered: false,
    };
    localStorage.setItem('playerIdentity', JSON.stringify(identity));
  });
}

async function captureCanvas(page, file) {
  const dataUrl = await page.evaluate(async () => {
    window.__sdsCinema?.hideUI?.();
    window.__sdsCinema?.hideWorldMarkers?.();
    window.__sdsCinema?.renderFrame?.();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = document.querySelector('#canvas-container canvas');
    if (!canvas) throw new Error('canvas not found in #canvas-container');
    return canvas.toDataURL('image/png');
  });
  await writeFile(file, Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'));
}

async function setupShot(page, shot) {
  await page.addStyleTag({
    content: `
      #react-overlay,
      #site-footer,
      footer,
      [data-testid="site-footer"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `,
  }).catch(() => {});

  await page.evaluate(async ({ shot }) => {
    await window.__sdsCinema?.waitReady?.();
    window.__sdsCinema?.hideUI?.();
    window.__sdsCinema?.hideWorldMarkers?.();
    window.__perfHarness?.setSystemIsolation?.('full');
    if (shot.dogPose) {
      window.__perfHarness?.setDogPose?.({ ...shot.dogPose, resetVelocity: true });
    }
    window.__perfHarness?.setSun?.(Number(shot.sun));
    window.__sdsCinema?.setSun?.(Number(shot.sun));
    if (shot.camera) {
      window.__sdsCinema?.setCameraPose?.(shot.camera.pos, shot.camera.target);
    }
    window.__sdsCinema?.pauseSimulation?.();
    window.__sdsCinema?.renderFrame?.();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (shot.camera) {
      window.__sdsCinema?.setCameraPose?.(shot.camera.pos, shot.camera.target);
    }
  }, { shot });
  await page.waitForTimeout(500);
}

async function captureShot(browser, baseUrl, screenshotDir, shot, renderer) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await seedIdentity(context);
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!shouldIgnoreConsole(text)) consoleErrors.push(text);
  });
  page.on('pageerror', (err) => {
    const text = String(err?.message || err);
    if (!shouldIgnoreConsole(text)) pageErrors.push(text);
  });

  const url = buildUrl(baseUrl, shot, renderer);
  const file = resolve(screenshotDir, `${shot.id}--${renderer}.png`);
  let visualProbe = null;
  let rendererMode = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => Boolean(window.__sdsCinema), null, { timeout: 60_000 });
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
    await setupShot(page, shot);
    await captureCanvas(page, file);
    visualProbe = await page.evaluate(() => window.__perfHarness?.getVisualProbe?.() ?? null).catch(() => null);
    rendererMode = await page.evaluate(() => window.__sdsRendererMode ?? null).catch(() => null);
  } finally {
    await context.close().catch(() => {});
  }

  const stats = await analyzeImage(file);
  const effectiveRenderer = rendererMode?.effective ?? visualProbe?.renderer ?? null;
  return {
    shotId: shot.id,
    poseClass: shot.poseClass,
    scene: shot.scene,
    sun: shot.sun,
    renderer,
    url,
    path: relative(file),
    stats,
    visualProbe,
    rendererMode,
    checks: {
      nonBlank: stats.nonBlank,
      noPageErrors: pageErrors.length === 0,
      noConsoleErrors: consoleErrors.length === 0,
      requestedRendererActive: renderer === 'webgpu'
        ? String(effectiveRenderer ?? '').startsWith('webgpu')
        : String(effectiveRenderer ?? '').startsWith('webgl'),
      webgpuWaterGlintContract: renderer !== 'webgpu' || shot.poseClass !== 'water-regression'
        ? true
        : visualProbe?.water?.sunCameraGlint === true,
    },
    consoleErrors,
    pageErrors,
  };
}

function allChecksPass(result) {
  return Object.values(result.checks).every(Boolean);
}

function comparePair(shot, webgl, webgpu) {
  const regionName = shot.poseClass === 'water-regression'
    ? 'water'
    : shot.poseClass === 'actor-read'
      ? 'actor'
      : shot.poseClass === 'foliage-far-tree'
        ? 'foliage'
        : shot.poseClass === 'terrain-grass'
          ? 'ground'
          : 'horizon';
  const glRegion = webgl?.stats?.regions?.[regionName];
  const gpuRegion = webgpu?.stats?.regions?.[regionName];
  const skyGl = webgl?.stats?.regions?.sky;
  const skyGpu = webgpu?.stats?.regions?.sky;
  const waterGl = webgl?.stats?.regions?.water;
  const waterGpu = webgpu?.stats?.regions?.water;

  const metrics = {
    region: regionName,
    regionLumaDelta: +(Math.abs((gpuRegion?.meanLuma ?? 0) - (glRegion?.meanLuma ?? 0))).toFixed(3),
    regionChromaDelta: +chromaDistance(glRegion, gpuRegion).toFixed(3),
    regionContrastRatio: +((gpuRegion?.stdevLuma ?? 0) / Math.max(1, glRegion?.stdevLuma ?? 1)).toFixed(3),
    skyLumaDelta: +(Math.abs((skyGpu?.meanLuma ?? 0) - (skyGl?.meanLuma ?? 0))).toFixed(3),
    skyClippedWhiteDelta: +((skyGpu?.clippedWhitePct ?? 0) - (skyGl?.clippedWhitePct ?? 0)).toFixed(4),
    skyCoolPastelDelta: +((skyGpu?.coolPastelPct ?? 0) - (skyGl?.coolPastelPct ?? 0)).toFixed(4),
    waterGlintRatio: +((waterGpu?.glintPct ?? 0) / Math.max(0.001, waterGl?.glintPct ?? 0.001)).toFixed(3),
    waterGlintWebgpuPct: +(waterGpu?.glintPct ?? 0).toFixed(4),
  };

  const hardFailed = !webgl || !webgpu || !allChecksPass(webgl) || !allChecksPass(webgpu);
  const categories = [];
  if (hardFailed) {
    categories.push('device/perf issue');
  }
  if (shot.poseClass === 'water-regression') {
    if (webgpu?.checks?.webgpuWaterGlintContract === true && metrics.waterGlintWebgpuPct >= 0.05) {
      categories.push('accepted sun/water');
    } else {
      categories.push('material parity issue');
    }
  } else if (
    metrics.regionLumaDelta > 54
    || metrics.regionChromaDelta > 70
    || (metrics.regionContrastRatio < 0.30 && metrics.regionLumaDelta > 30)
    || metrics.skyClippedWhiteDelta > 7.5
  ) {
    categories.push('material parity issue');
  } else {
    categories.push('accepted sun/water');
  }

  if (shot.poseClass === 'foliage-far-tree' && webgpu?.visualProbe?.trees?.materialSummary?.applied === false) {
    categories.push('asset/geometry issue');
  }

  return {
    shotId: shot.id,
    poseClass: shot.poseClass,
    scene: shot.scene,
    sun: shot.sun,
    webglPath: webgl?.path ?? null,
    webgpuPath: webgpu?.path ?? null,
    metrics,
    classification: [...new Set(categories)],
  };
}

function buildComparisons(results, shots) {
  return shots.map((shot) => {
    const webgl = results.find((result) => result.shotId === shot.id && result.renderer === 'webgl');
    const webgpu = results.find((result) => result.shotId === shot.id && result.renderer === 'webgpu');
    return comparePair(shot, webgl, webgpu);
  });
}

function svgLabel(width, height, text, fill = '#0b1520', color = '#eef7ff') {
  const safe = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="${fill}"/>
      <text x="14" y="${Math.round(height * 0.62)}" font-family="Arial, sans-serif"
        font-size="16" fill="${color}">${safe}</text>
    </svg>
  `);
}

async function renderTile(inputPath, label) {
  const width = 400;
  const height = 225;
  const labelHeight = 30;
  const image = await sharp(inputPath)
    .resize(width, height, { fit: 'cover' })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width,
      height: height + labelHeight,
      channels: 4,
      background: '#101820',
    },
  })
    .composite([
      { input: image, top: labelHeight, left: 0 },
      { input: svgLabel(width, labelHeight, label), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}

async function createContactSheet(results, shots, renderers, comparisons, outputPath) {
  const labelWidth = 270;
  const tileWidth = 400;
  const tileHeight = 255;
  const gap = 12;
  const headerHeight = 52;
  const width = labelWidth + (tileWidth * renderers.length) + (gap * (renderers.length + 1));
  const height = headerHeight + (tileHeight + gap) * shots.length + gap;
  const composites = [
    {
      input: svgLabel(width, headerHeight, 'Cycle 42 WebGPU material-lock matrix', '#071018', '#f5fbff'),
      top: 0,
      left: 0,
    },
  ];

  for (let row = 0; row < shots.length; row++) {
    const shot = shots[row];
    const y = headerHeight + gap + row * (tileHeight + gap);
    const comparison = comparisons.find((item) => item.shotId === shot.id);
    const label = `${shot.poseClass} | ${shot.scene} | sun ${shot.sun} | ${comparison?.classification?.join(', ') ?? 'unclassified'}`;
    composites.push({
      input: svgLabel(labelWidth, tileHeight, label, '#17212b', '#e9f2fa'),
      top: y,
      left: 0,
    });
    for (let col = 0; col < renderers.length; col++) {
      const renderer = renderers[col];
      const item = results.find((result) => result.shotId === shot.id && result.renderer === renderer);
      const x = labelWidth + gap + col * (tileWidth + gap);
      const tile = item?.path && existsSync(resolve(ROOT, item.path))
        ? await renderTile(resolve(ROOT, item.path), renderer.toUpperCase())
        : svgLabel(tileWidth, tileHeight, `${renderer}: missing`, '#2c1111', '#fff0f0');
      composites.push({ input: tile, top: y, left: x });
    }
  }

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#0a1118',
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);
}

async function main() {
  const args = parseArgs(process.argv);
  await mkdir(dirname(args.outPath), { recursive: true });
  await mkdir(args.screenshotPath, { recursive: true });
  await mkdir(dirname(args.contactSheetPath), { recursive: true });

  const server = await ensureVite(args.baseUrl, args.noServer === true || args.noServer === 'true');
  const launchOptions = {
    headless: !(args.headed === true || args.headed === 'true'),
    args: CHROMIUM_GPU_ARGS,
  };
  if (args.channel) launchOptions.channel = args.channel;

  const browser = await chromium.launch(launchOptions);
  const shots = buildShots(args.sceneIds, args.sunValues, args.poseIds);
  const results = [];

  try {
    for (const shot of shots) {
      for (const renderer of args.rendererIds) {
        console.log(`[CYCLE42-MATERIAL] ${shot.id} ${renderer}`);
        const result = await captureShot(browser, args.baseUrl, args.screenshotPath, shot, renderer);
        const mark = allChecksPass(result) ? 'PASS' : 'FAIL';
        console.log(`[CYCLE42-MATERIAL]   ${mark} ${result.path}`);
        results.push(result);
      }
    }
  } finally {
    await browser.close().catch(() => {});
    if (server) {
      server.kill();
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  const comparisons = buildComparisons(results, shots);
  await createContactSheet(results, shots, args.rendererIds, comparisons, args.contactSheetPath);
  const failures = results.filter((result) => !allChecksPass(result));
  const materialParityIssues = comparisons
    .filter((comparison) => comparison.classification.includes('material parity issue'))
    .map((comparison) => ({
      shotId: comparison.shotId,
      poseClass: comparison.poseClass,
      scene: comparison.scene,
      sun: comparison.sun,
      metrics: comparison.metrics,
      classification: comparison.classification,
    }));
  const output = {
    capturedAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    viewport: VIEWPORT,
    scenes: args.sceneIds,
    suns: args.sunValues,
    renderers: args.rendererIds,
    shots,
    contactSheet: relative(args.contactSheetPath),
    screenshotDir: relative(args.screenshotPath),
    results,
    comparisons,
    materialParityIssues,
    ok: failures.length === 0,
    visualAcceptanceRequired: true,
    failures: failures.map((result) => ({
      shotId: result.shotId,
      renderer: result.renderer,
      checks: result.checks,
      consoleErrors: result.consoleErrors,
      pageErrors: result.pageErrors,
    })),
  };
  await writeFile(args.outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`[CYCLE42-MATERIAL] Contact sheet: ${relative(args.contactSheetPath)}`);
  console.log(`[CYCLE42-MATERIAL] Runtime JSON: ${relative(args.outPath)}`);
  if (materialParityIssues.length > 0) {
    console.log(`[CYCLE42-MATERIAL] Classified ${materialParityIssues.length} material parity issue(s); review the contact sheet before release.`);
  }

  if (!output.ok) {
    console.error('[CYCLE42-MATERIAL] FAIL - one or more captures failed runtime proof gates.');
    process.exit(1);
  }
  console.log('[CYCLE42-MATERIAL] PASS');
}

main().catch((err) => {
  console.error('[CYCLE42-MATERIAL] FATAL:', err);
  process.exit(1);
});
