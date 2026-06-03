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

const CORE_CAMERA_BY_SCENE = Object.freeze({
  field: {
    pos: { x: -58, y: 17, z: -52 },
    target: { x: 24, y: 7, z: 22 },
  },
  'rolling-hills': {
    pos: { x: 62, y: 20, z: 42 },
    target: { x: -44, y: 8, z: -24 },
  },
  'open-country': {
    pos: { x: 72, y: 24, z: -54 },
    target: { x: -62, y: 9, z: 42 },
  },
});

const WATER_CAMERA_BY_SCENE = Object.freeze({
  'rolling-hills': {
    pos: { x: 300, y: 14, z: 145 },
    target: { x: -620, y: 6, z: -220 },
  },
  'open-country': {
    pos: { x: 480, y: 16, z: -360 },
    target: { x: -880, y: 7, z: 650 },
  },
});

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:3000/',
    out: 'cycle41-validation/runtime/art-lock-matrix.json',
    screenshotDir: 'cycle41-validation/screenshots/art-lock-matrix',
    contactSheet: 'cycle41-validation/screenshots/cycle41-webgl-webgpu-contact-sheet.png',
    scenes: DEFAULT_SCENES.join(','),
    suns: DEFAULT_SUNS.join(','),
    renderers: DEFAULT_RENDERERS.join(','),
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

async function analyzeImage(path) {
  const image = sharp(path);
  const [stats, metadata, raw] = await Promise.all([
    image.stats(),
    image.metadata(),
    image.ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const channels = stats.channels.slice(0, 3);
  const mean = channels.reduce((sum, c) => sum + c.mean, 0) / channels.length;
  const stdev = channels.reduce((sum, c) => sum + c.stdev, 0) / channels.length;
  let warmBright = 0;
  let clippedWhite = 0;
  let waterGlint = 0;
  let maxLuma = 0;
  const width = metadata.width ?? raw.info.width ?? 0;
  const height = metadata.height ?? raw.info.height ?? 0;
  for (let offset = 0; offset < raw.data.length; offset += 4) {
    const pixel = offset / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const r = raw.data[offset];
    const g = raw.data[offset + 1];
    const b = raw.data[offset + 2];
    const lum = luma(r, g, b);
    maxLuma = Math.max(maxLuma, lum);
    if (r >= 248 && g >= 248 && b >= 248) clippedWhite++;
    if (r >= 215 && g >= 120 && b <= 175) warmBright++;
    if (
      y > height * 0.45
      && x > width * 0.25
      && x < width * 0.75
      && lum >= 178
      && b >= 105
      && g >= 105
    ) {
      waterGlint++;
    }
  }
  const pixels = Math.max(1, width * height);
  return {
    width,
    height,
    mean: +mean.toFixed(3),
    stdev: +stdev.toFixed(3),
    maxLuma: +maxLuma.toFixed(3),
    clippedWhitePct: +(clippedWhite / pixels * 100).toFixed(4),
    warmBrightPct: +(warmBright / pixels * 100).toFixed(4),
    waterGlintPct: +(waterGlint / pixels * 100).toFixed(4),
    nonBlank: stdev > 2 && maxLuma > 30,
  };
}

async function ensureVite(baseUrl, noServer) {
  if (noServer) return null;
  try {
    const response = await fetch(baseUrl, { method: 'HEAD' });
    if (response.ok || response.status === 404) {
      console.log('[CYCLE41] Vite already running');
      return null;
    }
  } catch {}

  console.log('[CYCLE41] Starting Vite dev server on 127.0.0.1:3000');
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
        console.log('[CYCLE41] Vite ready');
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

function buildShots(sceneIds, sunValues) {
  const core = sceneIds.flatMap((scene) => sunValues.map((sun) => ({
    id: `core-${scene}-sun-${safeName(sun)}`,
    kind: 'core',
    scene,
    sun,
    camera: CORE_CAMERA_BY_SCENE[scene] ?? CORE_CAMERA_BY_SCENE.field,
  })));
  const water = ['rolling-hills', 'open-country']
    .filter((scene) => sceneIds.includes(scene))
    .map((scene) => ({
      id: `water-${scene}-sun-0.20`,
      kind: 'water',
      scene,
      sun: '0.20',
      camera: WATER_CAMERA_BY_SCENE[scene],
    }));
  return [...core, ...water];
}

async function seedIdentity(context) {
  await context.addInitScript(() => {
    const identity = {
      persistentId: 'player_cycle41_art_lock_' + Date.now(),
      displayName: 'Cycle41Proof',
      fullName: 'Cycle41Proof#0001',
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
    window.__perfHarness?.setSun?.(Number(shot.sun));
    window.__sdsCinema?.setSun?.(Number(shot.sun));
    if (shot.perfPose) {
      window.__perfHarness?.setCameraPose?.(shot.perfPose);
    } else if (shot.camera) {
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
    kind: shot.kind,
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
      webgpuWaterGlintContract: renderer !== 'webgpu' || shot.kind !== 'water'
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

function svgLabel(width, height, text, fill = '#0b1520', color = '#eef7ff') {
  const safe = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="${fill}"/>
      <text x="14" y="${Math.round(height * 0.62)}" font-family="Arial, sans-serif"
        font-size="18" fill="${color}">${safe}</text>
    </svg>
  `);
}

async function renderTile(inputPath, label) {
  const width = 420;
  const height = 236;
  const labelHeight = 32;
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

async function createContactSheet(results, shots, renderers, outputPath) {
  const labelWidth = 230;
  const tileWidth = 420;
  const tileHeight = 268;
  const gap = 14;
  const headerHeight = 52;
  const width = labelWidth + (tileWidth * renderers.length) + (gap * (renderers.length + 1));
  const height = headerHeight + (tileHeight + gap) * shots.length + gap;
  const composites = [
    {
      input: svgLabel(width, headerHeight, 'Cycle 41 WebGL / WebGPU art-lock matrix', '#071018', '#f5fbff'),
      top: 0,
      left: 0,
    },
  ];

  for (let row = 0; row < shots.length; row++) {
    const shot = shots[row];
    const y = headerHeight + gap + row * (tileHeight + gap);
    composites.push({
      input: svgLabel(labelWidth, tileHeight, `${shot.kind} | ${shot.scene} | sun ${shot.sun}`, '#17212b', '#e9f2fa'),
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
  const shots = buildShots(args.sceneIds, args.sunValues);
  const results = [];

  try {
    for (const shot of shots) {
      for (const renderer of args.rendererIds) {
        console.log(`[CYCLE41] ${shot.id} ${renderer}`);
        const result = await captureShot(browser, args.baseUrl, args.screenshotPath, shot, renderer);
        const mark = allChecksPass(result) ? 'PASS' : 'FAIL';
        console.log(`[CYCLE41]   ${mark} ${result.path}`);
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

  await createContactSheet(results, shots, args.rendererIds, args.contactSheetPath);
  const failures = results.filter((result) => !allChecksPass(result));
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
    ok: failures.length === 0,
    failures: failures.map((result) => ({
      shotId: result.shotId,
      renderer: result.renderer,
      checks: result.checks,
      consoleErrors: result.consoleErrors,
      pageErrors: result.pageErrors,
    })),
  };
  await writeFile(args.outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`[CYCLE41] Contact sheet: ${relative(args.contactSheetPath)}`);
  console.log(`[CYCLE41] Runtime JSON: ${relative(args.outPath)}`);

  if (!output.ok) {
    console.error('[CYCLE41] FAIL - one or more captures failed the art-lock proof gates.');
    process.exit(1);
  }
  console.log('[CYCLE41] PASS');
}

main().catch((err) => {
  console.error('[CYCLE41] FATAL:', err);
  process.exit(1);
});
