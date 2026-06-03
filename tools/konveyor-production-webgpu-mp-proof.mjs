// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:3000/',
    out: 'cycle36-validation/runtime/production-webgpu-mp-proof.json',
    outDir: 'cycle36-validation/runtime/production-webgpu-mp-proof',
    channel: 'chrome',
    scene: 'field',
    gameMode: 'cooperative',
    sheepCount: '200',
    measureMs: '2000',
  };

  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([A-Za-z0-9-]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[key] = match[2];
  }

  return {
    ...args,
    sheepCount: Number(args.sheepCount),
    measureMs: Number(args.measureMs),
  };
}

function buildUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('mpProbe', '1');
  url.searchParams.set('probeRender', '1');
  url.searchParams.set('perfMode', '1');
  return url.href;
}

function makeIdentity(label) {
  const rand = Math.random().toString(36).slice(2, 8);
  return {
    persistentId: `konveyor_${label}_${Date.now()}_${rand}`,
    displayName: `${label}-${rand}`,
  };
}

async function seedIdentity(context, identity) {
  await context.addInitScript((id) => {
    const stored = {
      persistentId: id.persistentId,
      displayName: id.displayName,
      fullName: `${id.displayName}#0001`,
      discriminator: '0001',
      nameType: 'custom',
      createdAt: Date.now(),
      isRegistered: false,
    };
    localStorage.setItem('playerIdentity', JSON.stringify(stored));
  }, identity);
}

function collectPageDiagnostics(page) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
  return { consoleErrors, pageErrors };
}

async function waitForMenu(page) {
  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll('button')).map((button) => button.textContent || '');
    return buttons.some((text) => /Multiplayer|Solo Play|Join Room|Welcome to Sheep Dog/i.test(text));
  }, null, { timeout: 120_000 });
}

async function waitForProductionWebGpu(page) {
  await page.waitForFunction(() => {
    const state = window.__sdsG?.productionWebGpu;
    return state?.ok === true || !!state?.error;
  }, null, { timeout: 120_000 });
  await page.waitForFunction(() => window.__sdsRendererMode?.effective === 'webgpu-production', null, {
    timeout: 30_000,
  });
}

async function bootApp(page, baseUrl) {
  await page.goto(buildUrl(baseUrl), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForProductionWebGpu(page);
  await waitForMenu(page);
}

async function navigateToMultiplayer(page) {
  await page.getByRole('button', { name: /^Multiplayer\b/i }).dispatchEvent('click');
  await page.getByRole('button', { name: /Confirm Selection/i }).waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByRole('button', { name: /Confirm Selection/i }).dispatchEvent('click');
  await page.getByRole('button', { name: /Create Room/i }).first().waitFor({ state: 'visible', timeout: 60_000 });
}

async function getMpProbe(page) {
  const probe = await page.evaluate(() => {
    const fn = window.__sdsMpProbe;
    return typeof fn === 'function' ? fn() : null;
  });
  if (!probe) throw new Error('window.__sdsMpProbe not installed');
  return probe;
}

async function waitForRoomState(page, opts = {}) {
  const deadline = Date.now() + (opts.timeoutMs ?? 60_000);
  let last = null;
  while (Date.now() < deadline) {
    last = await getMpProbe(page);
    const roomOk = opts.roomState === undefined || last.roomState === opts.roomState;
    const codeOk = !opts.expectedCode || last.roomCode === opts.expectedCode.toUpperCase();
    const playersOk = opts.minPlayers == null || last.playerCount >= opts.minPlayers;
    if (roomOk && codeOk && playersOk) return last;
    await page.waitForTimeout(250);
  }
  throw new Error(`timed out waiting for room state ${JSON.stringify(opts)}; last=${JSON.stringify(last)}`);
}

async function createRoomAsHost(page, { sceneId, gameMode, sheepCount }) {
  await page.getByRole('button', { name: /Create Room/i }).first().dispatchEvent('click');
  await page.locator('select').nth(0).selectOption('4');
  await page.locator('select').nth(1).selectOption(sceneId);
  await page.locator('select').nth(2).selectOption(gameMode);
  await page.locator('select').nth(3).selectOption(String(sheepCount));
  await page.getByRole('button', { name: /Create Room\s*→/i }).dispatchEvent('click');
  const probe = await waitForRoomState(page, { roomState: 'waiting', timeoutMs: 90_000 });
  if (!probe.roomCode) throw new Error('room creation did not expose a room code');
  return probe.roomCode;
}

async function joinRoomByCode(page, code) {
  await page.getByRole('button', { name: /^Join Room\b/i }).first().dispatchEvent('click');
  const input = page.locator('input[type="text"]').first();
  await input.waitFor({ state: 'visible', timeout: 60_000 });
  await input.fill(code.toUpperCase(), { force: true });
  await page.getByRole('button', { name: /Join Room\s*→/i }).dispatchEvent('click');
  await waitForRoomState(page, {
    roomState: 'waiting',
    expectedCode: code.toUpperCase(),
    timeoutMs: 90_000,
  });
}

function luma(r, g, b) {
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

async function inspectScreenshot(path) {
  const image = sharp(path);
  const metadata = await image.metadata();
  const { data } = await image
    .resize({ width: 64, height: 36, fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minLuma = Infinity;
  let maxLuma = -Infinity;
  const colorBuckets = new Set();
  for (let offset = 0; offset < data.length; offset += 4) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const y = luma(r, g, b);
    minLuma = Math.min(minLuma, y);
    maxLuma = Math.max(maxLuma, y);
    colorBuckets.add(`${r >> 4},${g >> 4},${b >> 4}`);
  }

  return {
    dimensions: {
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
    },
    lumaRange: Number((maxLuma - minLuma).toFixed(2)),
    coarseColorBuckets: colorBuckets.size,
    nonBlank: maxLuma - minLuma >= 20 && colorBuckets.size >= 16,
  };
}

async function samplePage(page, { label, outDir, measureMs }) {
    await page.waitForFunction(() => window.__sdsMpProbe?.().roomState === 'in-game', null, {
        timeout: 60_000,
    });
    await page.bringToFront().catch(() => {});
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 60_000 });
  await page.evaluate(() => window.__perfHarness.reset?.());
  const duration = await page.evaluate((ms) => window.__perfHarness.startSampling(ms), measureMs);
  await page.waitForTimeout(Number(duration) + 500);
  await page.locator('#canvas-container canvas').first().waitFor({ state: 'visible', timeout: 60_000 });

  const screenshot = `${label}.png`;
  const screenshotPath = resolve(outDir, screenshot);
  await page.locator('#canvas-container canvas').first().screenshot({ path: screenshotPath });
  const screenshotProof = await inspectScreenshot(screenshotPath);

  const state = await page.evaluate(() => {
    const sceneManager = window.__sds?.sceneManagerRef ?? null;
    const renderer = sceneManager?.getRenderer?.() ?? null;
    return {
      rendererMode: window.__sdsRendererMode ?? null,
      productionWebGpu: window.__sdsG?.productionWebGpu ?? null,
      currentSceneId: window.__currentSceneId ?? null,
      mpProbe: window.__sdsMpProbe?.() ?? null,
      renderer: {
        className: renderer?.constructor?.name ?? null,
        isWebGLRenderer: renderer?.isWebGLRenderer === true,
        isWebGPURenderer: renderer?.isWebGPURenderer === true,
        calls: renderer?.info?.render?.calls ?? null,
        triangles: renderer?.info?.render?.triangles ?? null,
      },
      perfSummary: window.__perfHarness?.getSummary?.() ?? null,
    };
  });

  return {
    label,
    screenshot,
    screenshotProof,
    ...state,
  };
}

function buildChecks({ host, guest, diagnostics, args, roomCode }) {
  const pageChecks = (side) => ({
    effectiveProductionWebGpu: side.rendererMode?.effective === 'webgpu-production',
    noFallback: side.rendererMode?.fallbackReason == null,
    productionStateOk: side.productionWebGpu?.ok === true,
    devicePreflightOk: side.productionWebGpu?.devicePreflight?.ok === true,
    rendererWebGpu: side.renderer?.isWebGPURenderer === true || side.renderer?.className === 'WebGPURenderer',
    connected: side.mpProbe?.connected === true,
    inGame: side.mpProbe?.roomState === 'in-game',
    playerCount: side.mpProbe?.playerCount >= 2,
    sheepCount: side.mpProbe?.sheepCount === args.sheepCount,
    sceneMatchesRoom: side.mpProbe?.sceneId === args.scene,
    currentSceneMatches: side.currentSceneId === args.scene,
    screenshotNonBlank: side.screenshotProof?.nonBlank === true,
    perfSampled: (side.perfSummary?.sampleCount ?? 0) >= 1,
  });

  return {
    host: pageChecks(host),
    guest: pageChecks(guest),
    sharedRoom: host.mpProbe?.roomCode === roomCode
      && guest.mpProbe?.roomCode === roomCode
      && host.mpProbe?.roomCode === guest.mpProbe?.roomCode,
    noConsoleErrors: diagnostics.host.consoleErrors.length === 0 && diagnostics.guest.consoleErrors.length === 0,
    noPageErrors: diagnostics.host.pageErrors.length === 0 && diagnostics.guest.pageErrors.length === 0,
  };
}

function checksPass(checks) {
  return Object.entries(checks).every(([, value]) => {
    if (value && typeof value === 'object') return Object.values(value).every(Boolean);
    return value === true;
  });
}

async function run() {
  const args = parseArgs(process.argv);
  const launchOptions = { args: CHROMIUM_GPU_ARGS, headless: true };
  if (args.channel) launchOptions.channel = args.channel;
  const outDir = resolve(ROOT, args.outDir);
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch(launchOptions);
  let hostContext;
  let guestContext;
  let hostPage;
  let guestPage;
  try {
    hostContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      serviceWorkers: 'block',
    });
    guestContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      serviceWorkers: 'block',
    });
    await seedIdentity(hostContext, makeIdentity('host'));
    await seedIdentity(guestContext, makeIdentity('guest'));
    hostPage = await hostContext.newPage();
    guestPage = await guestContext.newPage();
    const diagnostics = {
      host: collectPageDiagnostics(hostPage),
      guest: collectPageDiagnostics(guestPage),
    };

    await bootApp(hostPage, args.baseUrl);
    await navigateToMultiplayer(hostPage);
    const roomCode = await createRoomAsHost(hostPage, {
      sceneId: args.scene,
      gameMode: args.gameMode,
      sheepCount: args.sheepCount,
    });

    await bootApp(guestPage, args.baseUrl);
    await navigateToMultiplayer(guestPage);
    await joinRoomByCode(guestPage, roomCode);
    await waitForRoomState(hostPage, { minPlayers: 2, timeoutMs: 60_000 });

    const startBtn = hostPage.getByRole('button', { name: /^Start Game$/i });
    await startBtn.waitFor({ state: 'visible', timeout: 30_000 });
    await startBtn.dispatchEvent('click');
    await waitForRoomState(hostPage, { roomState: 'in-game', timeoutMs: 90_000 });
    await waitForRoomState(guestPage, { roomState: 'in-game', timeoutMs: 90_000 });

    const host = await samplePage(hostPage, { label: 'host', outDir, measureMs: args.measureMs });
    const guest = await samplePage(guestPage, { label: 'guest', outDir, measureMs: args.measureMs });

    const checks = buildChecks({ host, guest, diagnostics, args, roomCode });
    const manifest = {
      capturedAt: new Date().toISOString(),
      contract: 'konveyor-production-webgpu-mp-proof',
      baseUrl: args.baseUrl,
      channel: args.channel,
      chromiumArgs: CHROMIUM_GPU_ARGS,
      scene: args.scene,
      gameMode: args.gameMode,
      sheepCount: args.sheepCount,
      measureMs: args.measureMs,
      roomCode,
      screenshotDir: args.outDir,
      host,
      guest,
      consoleErrors: {
        host: diagnostics.host.consoleErrors,
        guest: diagnostics.guest.consoleErrors,
      },
      pageErrors: {
        host: diagnostics.host.pageErrors,
        guest: diagnostics.guest.pageErrors,
      },
      checks,
      ok: checksPass(checks),
    };

    const outPath = resolve(ROOT, args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    if (!manifest.ok) {
      throw new Error('production WebGPU multiplayer proof did not satisfy manifest gates');
    }
  } finally {
    await hostPage?.close().catch(() => {});
    await guestPage?.close().catch(() => {});
    await hostContext?.close().catch(() => {});
    await guestContext?.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error('[PRODUCTION-WEBGPU-MP] fatal:', error);
  process.exit(1);
});
