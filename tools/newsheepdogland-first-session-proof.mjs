// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_OUT = 'cycle85-validation/runtime/newsheepdogland-first-session-proof.json';
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];

const IGNORED_CONSOLE_PATTERNS = [
  /ServiceWorker/i,
  /geckos/i,
  /WebRTC/i,
  /Connection timeout/i,
  /\[NETWORK\]/i,
  /favicon/i,
  /Mixed Content/i,
  /Registration failed/i,
];

const LOADING_COPY = [
  'Waking the dogs',
  'Shaping the land',
  'Raising the hills',
  'Growing the grass',
  'Scattering the stones',
  'Planting the trees',
  'Raising the far hills',
  'Opening the farmhouse',
  'Setting the fences',
  'Filling the shore',
  'Waking the dog',
  'Gathering the flock',
];

const BLOCKING_GAMEPLAY_COPY = [
  ...LOADING_COPY,
  'Tap for fullscreen',
  'Compatibility rendering',
  'WebGL renderer',
];

function parseArgs(argv) {
  const args = {
    baseUrl: 'https://sheepdogsim.com/',
    out: DEFAULT_OUT,
    profile: 'desktop',
    channel: '',
    target: 'chromium',
    cdpUrl: 'http://localhost:9222',
    screenshotDir: null,
    skipCache: false,
  };

  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([A-Za-z0-9-]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[key] = match[2];
  }

  return {
    ...args,
    skipCache: args.skipCache === true || args.skipCache === 'true' || args.skipCache === '1',
    profiles: args.profile.split(',').map((item) => item.trim()).filter(Boolean),
  };
}

function proofUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set('proof', `cycle85-${Date.now()}`);
  return url.href;
}

function serviceWorkerDisabledByLocalHost(baseUrl) {
  try {
    const host = new URL(baseUrl).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

function relative(path) {
  return path.startsWith(ROOT) ? path.slice(ROOT.length + 1).replace(/\\/g, '/') : path;
}

function contextOptionsFor(profile, target, skipCache) {
  if (target === 'android-cdp') return {};
  if (profile === 'mobile-emulation') {
    const iphone14 = devices['iPhone 14'];
    return {
      viewport: iphone14.viewport,
      userAgent: iphone14.userAgent,
      deviceScaleFactor: iphone14.deviceScaleFactor,
      isMobile: iphone14.isMobile,
      hasTouch: iphone14.hasTouch,
      serviceWorkers: skipCache ? 'block' : 'allow',
    };
  }
  return {
    viewport: { width: 1280, height: 720 },
    serviceWorkers: skipCache ? 'block' : 'allow',
  };
}

async function seedIdentity(context) {
  await context.addInitScript(() => {
    const identity = {
      persistentId: `player_cycle85_${Date.now()}`,
      displayName: 'Cycle85Proof',
      fullName: 'Cycle85Proof#0001',
      discriminator: '0001',
      nameType: 'custom',
      createdAt: Date.now(),
      isRegistered: false,
    };
    localStorage.setItem('playerIdentity', JSON.stringify(identity));
    localStorage.setItem('sds.last-world', 'rolling-hills');
    localStorage.setItem('selectedWorld', 'rolling-hills');
    localStorage.setItem('selectedScene', 'rolling-hills');
    localStorage.setItem('sds.last-scene', 'rolling-hills');
    localStorage.setItem('sds.last-mode', 'chaos');
    localStorage.setItem('sds.last-family', 'counting');
    localStorage.setItem('sds.last-curve', 'exponential');
    localStorage.setItem('sds:tutorialDone', '1');
  });
}

function collectErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) return;
    errors.push(text);
  });
  page.on('pageerror', (error) => {
    const text = `pageerror: ${error.message}`;
    if (IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) return;
    errors.push(text);
  });
  return errors;
}

async function waitForServiceWorker(page) {
  const hasServiceWorker = await page.evaluate(() => 'serviceWorker' in navigator);
  if (!hasServiceWorker) {
    return { controlled: false, cacheName: null, reason: 'service-worker-api-missing' };
  }

  await page.waitForFunction(() => navigator.serviceWorker?.ready, null, { timeout: 30_000 });
  const controlled = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) location.reload();
    return Boolean(navigator.serviceWorker.controller);
  });
  if (!controlled) {
    await page.waitForLoadState('domcontentloaded', { timeout: 60_000 });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30_000 });
  }

  const cacheName = await page.evaluate(async () => {
    const swText = await fetch(`/sw.js?cacheNameProof=${Date.now()}`, { cache: 'reload' }).then((res) => res.text());
    const buildId = swText.match(/const BUILD_ID = '([^']+)'/)?.[1];
    if (!buildId) throw new Error('Could not read service worker BUILD_ID');
    return `sheepdog-sim-${buildId}`;
  });

  return { controlled: true, cacheName };
}

async function verifyMutableCacheOverwrite(page, cacheName) {
  return page.evaluate(async (name) => {
    const cache = await caches.open(name);
    const targets = [
      {
        label: 'terrain',
        url: '/terrain/newsheepdogland.bin',
        type: 'application/octet-stream',
        staleBytes: new Uint8Array([1, 2, 3, 4]),
      },
      {
        label: 'entrance',
        url: '/assets/scenes/entrance/newsheepdogland.webp',
        type: 'image/webp',
        staleBytes: new TextEncoder().encode('stale-image'),
      },
    ];
    const out = [];

    for (const target of targets) {
      await cache.put(
        target.url,
        new Response(target.staleBytes, {
          status: 200,
          headers: { 'content-type': target.type, 'x-proof': 'stale' },
        }),
      );
      const before = await caches.match(target.url).then(async (res) => ({
        bytes: (await res.arrayBuffer()).byteLength,
        proof: res.headers.get('x-proof'),
      }));
      const fetched = await fetch(target.url, { cache: 'reload' });
      const fetchedBytes = (await fetched.clone().arrayBuffer()).byteLength;
      await new Promise((resolve) => setTimeout(resolve, 250));
      const after = await caches.match(target.url).then(async (res) => ({
        bytes: (await res.arrayBuffer()).byteLength,
        proof: res.headers.get('x-proof'),
      }));
      out.push({ label: target.label, before, fetchedStatus: fetched.status, fetchedBytes, after });
    }

    return out;
  }, cacheName);
}

function assertCacheProof(cacheProof) {
  for (const target of cacheProof) {
    if (target.before.proof !== 'stale') throw new Error(`${target.label} stale seed was not cached`);
    if (target.fetchedStatus !== 200) throw new Error(`${target.label} fetch status ${target.fetchedStatus}`);
    if (target.after.proof === 'stale') throw new Error(`${target.label} cache was not overwritten`);
    if (target.after.bytes <= target.before.bytes) throw new Error(`${target.label} cache stayed stale-sized`);
  }
}

async function readSurvivalState(page) {
  return page.evaluate(() => {
    const game = window.__sds?.gameInstanceRef;
    const rendererMode = window.__sdsRendererMode ?? null;
    return {
      scene: game?.currentScene?.id ?? null,
      active: game?.gameState?.gameActive ?? null,
      dayLoop: Boolean(game?.dayLoop),
      survivalRun: Boolean(game?._survivalRun),
      wolfPack: Boolean(game?._wolfPack),
      minimap: Boolean(document.getElementById('sds-minimap')),
      rendererMode,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

async function waitForState(page, expected, timeout = 120_000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeout) {
    last = await readSurvivalState(page);
    if (Object.entries(expected).every(([key, value]) => last[key] === value)) return last;
    await page.waitForTimeout(500);
  }
  throw new Error(`Timed out waiting for ${JSON.stringify(expected)}; last=${JSON.stringify(last)}`);
}

async function waitForGameplayVisible(page) {
  await page.getByRole('button', { name: 'Pause game' }).waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(
    (labels) => {
      const text = document.body?.innerText ?? '';
      return !document.querySelector('[data-sds-loading-screen="true"]')
        && !document.querySelector('#renderer-fallback-toast')
        && !labels.some((label) => text.includes(label));
    },
    BLOCKING_GAMEPLAY_COPY,
    { timeout: 30_000 },
  );
}

async function readHudRects(page) {
  return page.evaluate(() => {
    function rectFor(selector) {
      const el = document.querySelector(selector);
      if (!el) return null;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
      };
    }

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      mobileHud: rectFor('[data-sds-mobile-hud="true"]'),
      minimap: rectFor('#sds-minimap'),
      skipDusk: rectFor('#sds-skip-dusk'),
      cameraMode: rectFor('button[aria-label^="Camera mode:"]'),
      fullscreenButton: rectFor('#mobile-fullscreen-button'),
      dayNight: rectFor('#sds-daynight-chip'),
    };
  });
}

function overlap(a, b) {
  if (!a || !b) return null;
  const width = Math.min(a.right, b.right) - Math.max(a.x, b.x);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
  if (width <= 2 || height <= 2) return null;
  return { width, height, area: width * height };
}

async function assertHudLayout(page, label) {
  const rects = await readHudRects(page);
  const pairs = [
    ['mobileHud', 'minimap'],
    ['skipDusk', 'cameraMode'],
    ['skipDusk', 'minimap'],
    ['fullscreenButton', 'mobileHud'],
  ];
  const collisions = pairs
    .map(([left, right]) => ({ left, right, overlap: overlap(rects[left], rects[right]) }))
    .filter((item) => item.overlap);

  if (collisions.length > 0) {
    throw new Error(`${label} HUD overlap: ${JSON.stringify({ collisions, rects })}`);
  }

  return rects;
}

async function verifyLoop(page) {
  await page.getByRole('button', { name: 'Play', exact: true }).waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByRole('button', { name: 'Play', exact: true }).click({ timeout: 30_000 });
  await page.locator('#canvas-container canvas').waitFor({ state: 'attached', timeout: 120_000 });
  const firstReady = await waitForState(page, {
    scene: 'newsheepdogland',
    active: true,
    dayLoop: true,
    survivalRun: true,
    wolfPack: true,
    minimap: true,
  });
  await waitForGameplayVisible(page);
  const firstHud = await assertHudLayout(page, 'first session');

  await page.getByRole('button', { name: 'Pause game' }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Main Menu' }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Play', exact: true }).waitFor({ state: 'visible', timeout: 120_000 });
  const returned = await waitForState(page, {
    scene: 'newsheepdogland',
    active: false,
    dayLoop: false,
    survivalRun: false,
    wolfPack: false,
    minimap: false,
  }, 60_000);

  await page.getByRole('button', { name: 'Play', exact: true }).click({ timeout: 30_000 });
  const secondReady = await waitForState(page, {
    scene: 'newsheepdogland',
    active: true,
    dayLoop: true,
    survivalRun: true,
    wolfPack: true,
    minimap: true,
  });
  await waitForGameplayVisible(page);
  const secondHud = await assertHudLayout(page, 'second session');

  return { firstReady, firstHud, returned, secondReady, secondHud };
}

async function screenshot(page, dir, profile, name) {
  if (!dir) return null;
  const file = resolve(ROOT, dir, `${profile}-${name}.png`);
  await mkdir(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true });
  return relative(file);
}

async function runProfile({ browser, args, profile }) {
  const context = args.target === 'android-cdp'
    ? (browser.contexts()[0] ?? await browser.newContext())
    : await browser.newContext(contextOptionsFor(profile, args.target, args.skipCache));
  await seedIdentity(context);
  const page = context.pages()[0] ?? await context.newPage();
  const errors = collectErrors(page);
  const result = {
    profile,
    target: args.target,
    baseUrl: args.baseUrl,
    startedAt: new Date().toISOString(),
    screenshots: {},
  };

  try {
    await page.goto(proofUrl(args.baseUrl), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor({ state: 'visible', timeout: 60_000 });
    result.screenshots.entrance = await screenshot(page, args.screenshotDir, profile, 'entrance');
    const localSwDisabled = serviceWorkerDisabledByLocalHost(args.baseUrl);
    if (args.skipCache || localSwDisabled) {
      result.serviceWorker = {
        skipped: true,
        reason: args.skipCache ? 'skip-cache' : 'local-preview-disables-service-worker',
      };
      result.cacheProof = [];
    } else {
      result.serviceWorker = await waitForServiceWorker(page);
      if (!result.serviceWorker.cacheName) throw new Error(`Service worker cache unavailable: ${result.serviceWorker.reason ?? 'unknown'}`);
      result.cacheProof = await verifyMutableCacheOverwrite(page, result.serviceWorker.cacheName);
      assertCacheProof(result.cacheProof);
    }
    result.loop = await verifyLoop(page);
    result.screenshots.gameplay = await screenshot(page, args.screenshotDir, profile, 'gameplay');
    result.errors = errors;
    result.ok = errors.length === 0;
    if (errors.length > 0) result.error = `Unexpected console errors: ${errors.join('\n')}`;
  } catch (error) {
    result.ok = false;
    result.error = String(error?.stack || error?.message || error);
    result.errors = errors;
    result.screenshots.failure = await screenshot(page, args.screenshotDir, profile, 'failure').catch(() => null);
  } finally {
    result.endedAt = new Date().toISOString();
    if (args.target !== 'android-cdp') await context.close().catch(() => {});
  }

  return result;
}

async function launchBrowser(args) {
  if (args.target === 'android-cdp') {
    return chromium.connectOverCDP(args.cdpUrl);
  }
  const launchOptions = { args: CHROMIUM_GPU_ARGS, headless: true };
  if (args.channel) launchOptions.channel = args.channel;
  return chromium.launch(launchOptions);
}

async function run() {
  const args = parseArgs(process.argv);
  const outPath = resolve(ROOT, args.out);
  const browser = await launchBrowser(args);
  const report = {
    tool: 'newsheepdogland-first-session-proof',
    startedAt: new Date().toISOString(),
    args: {
      baseUrl: args.baseUrl,
      profile: args.profile,
      target: args.target,
      cdpUrl: args.target === 'android-cdp' ? args.cdpUrl : undefined,
      skipCache: args.skipCache,
    },
    results: [],
  };

  try {
    for (const profile of args.profiles) {
      report.results.push(await runProfile({ browser, args, profile }));
    }
  } finally {
    await browser.close().catch(() => {});
    report.endedAt = new Date().toISOString();
    report.ok = report.results.every((result) => result.ok);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(report, null, 2));
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
