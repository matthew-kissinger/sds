import { chromium } from 'playwright';
import sharp from 'sharp';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
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

const ROUTES = Object.freeze([
  { id: 'default-webgpu', label: 'Default WebGPU', impostorParam: null, expectedLayout: null, required: true },
  { id: 'production-octahedral-v2', label: 'Production impostor route', impostorParam: '1', expectedLayout: 'octahedral', expectedVersion: 2, required: true },
  { id: 'latlon-rollback-v1', label: 'Latlon rollback route', impostorParam: 'latlon', expectedLayout: 'latlon-hemi-y', expectedVersion: 1, required: true },
  { id: 'explicit-octahedral-v2', label: 'Explicit octahedral route', impostorParam: 'octahedral', expectedLayout: 'octahedral', expectedVersion: 2, required: true },
]);

const POSES = Object.freeze([
  {
    id: 'ridge-long',
    scene: 'rolling-hills',
    sun: '0.35',
    camera: { pos: { x: 112, y: 24, z: -86 }, target: { x: -96, y: 8, z: 62 } },
  },
  {
    id: 'far-tree-band',
    scene: 'rolling-hills',
    sun: '0.50',
    camera: { pos: { x: -132, y: 22, z: 78 }, target: { x: 74, y: 8, z: -44 } },
  },
  {
    id: 'open-country-treeline',
    scene: 'open-country',
    sun: '0.35',
    camera: { pos: { x: 148, y: 24, z: -112 }, target: { x: -132, y: 9, z: 82 } },
  },
  {
    id: 'open-country-cross',
    scene: 'open-country',
    sun: '0.50',
    camera: { pos: { x: -140, y: 25, z: 112 }, target: { x: 122, y: 9, z: -84 } },
  },
]);

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:3000/',
    out: 'cycle42-validation/runtime/octahedral-proof.json',
    screenshotDir: 'cycle42-validation/screenshots/octahedral-proof',
    contactSheet: 'cycle42-validation/screenshots/cycle42-octahedral-contact-sheet.png',
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
  const raw = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let min = 255;
  let max = 0;
  let whiteGrey = 0;
  let opaque = 0;
  let chromaSum = 0;
  for (let i = 0; i < raw.data.length; i += 4) {
    if (raw.data[i + 3] > 0) opaque++;
    const lum = luma(raw.data[i], raw.data[i + 1], raw.data[i + 2]);
    min = Math.min(min, lum);
    max = Math.max(max, lum);
    const chroma = Math.max(raw.data[i], raw.data[i + 1], raw.data[i + 2])
      - Math.min(raw.data[i], raw.data[i + 1], raw.data[i + 2]);
    chromaSum += chroma;
    if (lum > 210 && chroma < 12) whiteGrey++;
  }
  const pixels = Math.max(1, raw.info.width * raw.info.height);
  return {
    width: raw.info.width,
    height: raw.info.height,
    nonBlank: opaque > 0 && max - min >= 8,
    lumaRange: +(max - min).toFixed(3),
    whiteGreyPct: +(whiteGrey / pixels * 100).toFixed(4),
    meanChroma: +(chromaSum / pixels).toFixed(3),
  };
}

async function ensureVite(baseUrl, noServer) {
  if (noServer) return null;
  try {
    const response = await fetch(baseUrl, { method: 'HEAD' });
    if (response.ok || response.status === 404) {
      console.log('[CYCLE42-OCTA] Vite already running');
      return null;
    }
  } catch {}

  console.log('[CYCLE42-OCTA] Starting Vite dev server on 127.0.0.1:3000');
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
        console.log('[CYCLE42-OCTA] Vite ready');
        return proc;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  try { proc.kill(); } catch {}
  throw new Error('Vite start timeout');
}

function buildUrl(baseUrl, route, pose) {
  const url = new URL(baseUrl);
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('scene', pose.scene);
  url.searchParams.set('cinematic', '1');
  url.searchParams.set('perfMode', '1');
  url.searchParams.set('probeRender', '1');
  url.searchParams.set('ui', 'off');
  url.searchParams.set('autostart', '1');
  url.searchParams.set('mode', 'classic');
  url.searchParams.set('sun', pose.sun);
  if (route.impostorParam != null) {
    url.searchParams.set('konveyorNativeTreeImpostors', route.impostorParam);
  }
  return url.href;
}

async function seedIdentity(context) {
  await context.addInitScript(() => {
    const identity = {
      persistentId: 'player_cycle42_octahedral_' + Date.now(),
      displayName: 'Cycle42OctaProof',
      fullName: 'Cycle42OctaProof#0001',
      discriminator: '0001',
      nameType: 'custom',
      createdAt: Date.now(),
      isRegistered: false,
    };
    localStorage.setItem('playerIdentity', JSON.stringify(identity));
  });
}

async function setupPose(page, pose) {
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
  await page.evaluate(async ({ pose }) => {
    await window.__sdsCinema?.waitReady?.();
    window.__sdsCinema?.hideUI?.();
    window.__sdsCinema?.hideWorldMarkers?.();
    window.__perfHarness?.setSystemIsolation?.('full');
    window.__perfHarness?.setSun?.(Number(pose.sun));
    window.__sdsCinema?.setSun?.(Number(pose.sun));
    window.__sdsCinema?.setCameraPose?.(pose.camera.pos, pose.camera.target);
    window.__sdsCinema?.pauseSimulation?.();
    window.__sdsCinema?.renderFrame?.();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__sdsCinema?.setCameraPose?.(pose.camera.pos, pose.camera.target);
  }, { pose });
  await page.waitForTimeout(500);
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

function dominantTileKeys(samples) {
  return samples
    .flatMap((sample) => sample?.lastDominantTiles?.slice?.(0, 1) ?? [])
    .map((tile) => `${tile?.[0] ?? 'x'}:${tile?.[1] ?? 'x'}`);
}

async function captureRoutePose(browser, baseUrl, screenshotDir, route, pose) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await seedIdentity(context);
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
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

  const url = buildUrl(baseUrl, route, pose);
  const file = resolve(screenshotDir, `${route.id}--${pose.id}.png`);
  let visualProbe = null;
  let rendererMode = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => Boolean(window.__sdsCinema), null, { timeout: 60_000 });
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
    await setupPose(page, pose);
    await captureCanvas(page, file);
    visualProbe = await page.evaluate(() => window.__perfHarness?.getVisualProbe?.() ?? null).catch(() => null);
    rendererMode = await page.evaluate(() => window.__sdsRendererMode ?? null).catch(() => null);
  } finally {
    await context.close().catch(() => {});
  }
  const stats = await analyzeImage(file);
  const effectiveRenderer = rendererMode?.effective ?? visualProbe?.renderer ?? null;
  const native = visualProbe?.trees?.native ?? null;
  const impostor = native?.impostor ?? null;
  const samples = visualProbe?.trees?.impostorRuntimeSamples ?? [];
  const tileKeys = dominantTileKeys(samples);
  const uniqueTileKeys = [...new Set(tileKeys)];
  const expectedInactive = route.expectedLayout == null;
  const routeChecks = {
    nonBlank: stats.nonBlank,
    noFatalErrors: consoleErrors.length === 0 && pageErrors.length === 0,
    webgpuActive: String(effectiveRenderer ?? '').startsWith('webgpu'),
    expectedRouteActive: expectedInactive ? native?.applied === true : impostor?.active === true,
    expectedLayout: expectedInactive ? true : impostor?.sidecarLayout === route.expectedLayout,
    expectedVersion: expectedInactive ? true : impostor?.sidecarVersion === route.expectedVersion,
    sampleLayout: expectedInactive ? true : samples.some((sample) => sample.layout === route.expectedLayout),
    tileVariation: expectedInactive ? true : uniqueTileKeys.length >= 1,
    noWhiteGreyRegression: stats.whiteGreyPct < 28,
  };
  return {
    routeId: route.id,
    routeLabel: route.label,
    poseId: pose.id,
    scene: pose.scene,
    sun: pose.sun,
    url,
    path: relative(file),
    stats,
    rendererMode,
    visualProbe,
    routeChecks,
    consoleErrors,
    pageErrors,
    tileKeys,
    uniqueTileKeys,
  };
}

function routeSummary(route, captures) {
  const routeCaptures = captures.filter((capture) => capture.routeId === route.id);
  const samples = routeCaptures.flatMap((capture) => capture.visualProbe?.trees?.impostorRuntimeSamples ?? []);
  const native = routeCaptures.find((capture) => capture.visualProbe?.trees?.native)?.visualProbe?.trees?.native ?? null;
  const tileKeys = dominantTileKeys(samples);
  const uniqueTileKeys = [...new Set(tileKeys)];
  const expectedInactive = route.expectedLayout == null;
  return {
    id: route.id,
    label: route.label,
    expectedLayout: route.expectedLayout ?? null,
    expectedVersion: route.expectedVersion ?? null,
    captures: routeCaptures.length,
    native,
    uniqueDominantTileCount: uniqueTileKeys.length,
    uniqueDominantTiles: uniqueTileKeys.slice(0, 16),
    checks: {
      capturesNonBlank: routeCaptures.every((capture) => capture.stats.nonBlank),
      noFatalErrors: routeCaptures.every((capture) => capture.consoleErrors.length === 0 && capture.pageErrors.length === 0),
      webgpuActive: routeCaptures.every((capture) => capture.routeChecks.webgpuActive),
      sidecarLayout: expectedInactive || routeCaptures.every((capture) => capture.routeChecks.expectedLayout),
      sidecarVersion: expectedInactive || routeCaptures.every((capture) => capture.routeChecks.expectedVersion),
      routeSamples: expectedInactive || samples.length > 0,
      tileVariationAcrossCameraPoses: expectedInactive || uniqueTileKeys.length >= 2,
      noWhiteGreyRegression: routeCaptures.every((capture) => capture.routeChecks.noWhiteGreyRegression),
    },
  };
}

function svgLabel(width, height, text, fill = '#0b1520', color = '#eef7ff') {
  const safe = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="${fill}"/>
      <text x="12" y="${Math.round(height * 0.62)}" font-family="Arial, sans-serif"
        font-size="15" fill="${color}">${safe}</text>
    </svg>
  `);
}

async function renderTile(inputPath, label) {
  const width = 300;
  const height = 169;
  const labelHeight = 28;
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

async function createContactSheet(captures, routes, poses, outputPath) {
  const labelWidth = 220;
  const tileWidth = 300;
  const tileHeight = 197;
  const gap = 10;
  const headerHeight = 50;
  const width = labelWidth + (tileWidth * routes.length) + (gap * (routes.length + 1));
  const height = headerHeight + (tileHeight + gap) * poses.length + gap;
  const composites = [
    {
      input: svgLabel(width, headerHeight, 'Cycle 42 octahedral tree-impostor proof', '#071018', '#f5fbff'),
      top: 0,
      left: 0,
    },
  ];
  for (let row = 0; row < poses.length; row++) {
    const pose = poses[row];
    const y = headerHeight + gap + row * (tileHeight + gap);
    composites.push({
      input: svgLabel(labelWidth, tileHeight, `${pose.scene} | ${pose.id}`, '#17212b', '#e9f2fa'),
      top: y,
      left: 0,
    });
    for (let col = 0; col < routes.length; col++) {
      const route = routes[col];
      const capture = captures.find((item) => item.routeId === route.id && item.poseId === pose.id);
      const x = labelWidth + gap + col * (tileWidth + gap);
      const tile = capture?.path && existsSync(resolve(ROOT, capture.path))
        ? await renderTile(resolve(ROOT, capture.path), route.id)
        : svgLabel(tileWidth, tileHeight, `${route.id}: missing`, '#2c1111', '#fff0f0');
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
  const captures = [];

  try {
    for (const route of ROUTES) {
      for (const pose of POSES) {
        console.log(`[CYCLE42-OCTA] ${route.id} ${pose.id}`);
        const capture = await captureRoutePose(browser, args.baseUrl, args.screenshotPath, route, pose);
        captures.push(capture);
        const mark = Object.values(capture.routeChecks).every(Boolean) ? 'PASS' : 'CHECK';
        console.log(`[CYCLE42-OCTA]   ${mark} ${capture.path}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
    if (server) {
      server.kill();
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  const routes = ROUTES.map((route) => routeSummary(route, captures));
  await createContactSheet(captures, ROUTES, POSES, args.contactSheetPath);
  const requiredChecks = routes.flatMap((route) => Object.entries(route.checks).map(([name, ok]) => ({
    routeId: route.id,
    name,
    ok,
  })));
  const output = {
    capturedAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    viewport: VIEWPORT,
    routes,
    poses: POSES,
    rollbackQuery: '?renderer=webgpu&konveyorNativeTreeImpostors=latlon',
    contactSheet: relative(args.contactSheetPath),
    screenshotDir: relative(args.screenshotPath),
    captures,
    ok: requiredChecks.every((check) => check.ok),
    failures: requiredChecks.filter((check) => !check.ok),
    mobileDeviceProofRequired: true,
  };
  await writeFile(args.outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`[CYCLE42-OCTA] Contact sheet: ${relative(args.contactSheetPath)}`);
  console.log(`[CYCLE42-OCTA] Runtime JSON: ${relative(args.outPath)}`);

  if (!output.ok) {
    console.error('[CYCLE42-OCTA] FAIL - one or more octahedral proof gates failed.');
    process.exit(1);
  }
  console.log('[CYCLE42-OCTA] PASS');
}

main().catch((err) => {
  console.error('[CYCLE42-OCTA] FATAL:', err);
  process.exit(1);
});
