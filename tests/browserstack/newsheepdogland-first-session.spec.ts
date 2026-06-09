// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

type SurvivalState = {
  scene: string | null;
  active: boolean | null;
  dayLoop: boolean;
  survivalRun: boolean;
  wolfPack: boolean;
  minimap: boolean;
  rendererMode: string | null;
  viewport: { width: number; height: number };
};

type ButtonQuery = {
  text?: string;
  aria?: string;
};

const IOS_BASE_URL = process.env.IOS_WATER_BASE_URL || 'http://localhost:3000';
const FIRST_SESSION_URL = new URL(`/?proof=browserstack-newsheepdogland-${Date.now()}`, IOS_BASE_URL).toString();
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

async function seedReturningPlayer(context: BrowserContext) {
  await context.addInitScript(() => {
    const identity = {
      persistentId: `browserstack_ios_${Date.now()}`,
      displayName: 'BrowserStack iOS',
      fullName: 'BrowserStack iOS#0001',
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

async function waitForEntrance(page: Page) {
  await waitForVisibleButton(page, { text: 'Play' }, 120_000);
  await page.waitForFunction(() => (document.body?.innerText ?? '').includes('Newsheepdogland'), null, {
    timeout: 30_000,
  });
}

async function waitForVisibleButton(page: Page, query: ButtonQuery, timeout = 45_000) {
  await page.waitForFunction(
    ({ text, aria }) => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some((button) => {
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        const visible = style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0;
        if (!visible) return false;
        if (aria && button.getAttribute('aria-label') !== aria) return false;
        if (text && button.textContent?.replace(/\s+/g, ' ').trim() !== text) return false;
        return true;
      });
    },
    query,
    { timeout },
  );
}

async function tapVisibleButton(page: Page, query: ButtonQuery, timeout = 45_000) {
  await waitForVisibleButton(page, query, timeout);
  const rect = await page.evaluate(({ text, aria }) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const button of buttons) {
      const style = getComputedStyle(button);
      const bounds = button.getBoundingClientRect();
      const visible = style.display !== 'none'
        && style.visibility !== 'hidden'
        && bounds.width > 0
        && bounds.height > 0;
      if (!visible) continue;
      if (aria && button.getAttribute('aria-label') !== aria) continue;
      if (text && button.textContent?.replace(/\s+/g, ' ').trim() !== text) continue;
      return {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };
    }
    return null;
  }, query);
  if (!rect) throw new Error(`button not found: ${JSON.stringify(query)}`);
  const x = rect.x + Math.round(rect.width / 2);
  const y = rect.y + Math.round(rect.height / 2);
  await page.touchscreen.tap(x, y).catch(() => page.mouse.click(x, y));
}

async function ensureServiceWorkerController(page: Page) {
  const status = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('service worker API missing');
    if (!('caches' in window)) throw new Error('Cache API missing');
    const ready = await Promise.race([
      navigator.serviceWorker.ready.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 45_000)),
    ]);
    if (!ready) throw new Error('service worker ready timed out');
    return { controlled: Boolean(navigator.serviceWorker.controller) };
  });

  if (status.controlled) return;

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
  await waitForEntrance(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 45_000 });
}

async function verifyMutableCacheOverwrite(page: Page) {
  await ensureServiceWorkerController(page);
  const proof = await page.evaluate(async () => {
    const swText = await fetch(`/sw.js?browserstackCacheProof=${Date.now()}`, { cache: 'reload' }).then((res) => res.text());
    const buildId = swText.match(/const BUILD_ID = '([^']+)'/)?.[1];
    if (!buildId) throw new Error('Could not read service worker BUILD_ID');

    const cacheName = `sheepdog-sim-${buildId}`;
    const cache = await caches.open(cacheName);
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
    const targetsProof = [];

    for (const target of targets) {
      await cache.put(
        target.url,
        new Response(target.staleBytes, {
          status: 200,
          headers: { 'content-type': target.type, 'x-proof': 'stale' },
        }),
      );
      const before = await caches.match(target.url).then(async (res) => {
        if (!res) throw new Error(`${target.label} stale seed was not cached`);
        return { bytes: (await res.arrayBuffer()).byteLength, proof: res.headers.get('x-proof') };
      });
      const fetched = await fetch(target.url, { cache: 'reload' });
      const fetchedBytes = (await fetched.clone().arrayBuffer()).byteLength;
      await new Promise((resolve) => setTimeout(resolve, 500));
      const after = await caches.match(target.url).then(async (res) => {
        if (!res) throw new Error(`${target.label} cache entry disappeared`);
        return { bytes: (await res.arrayBuffer()).byteLength, proof: res.headers.get('x-proof') };
      });
      targetsProof.push({ label: target.label, before, fetchedStatus: fetched.status, fetchedBytes, after });
    }

    return {
      serviceWorker: { controlled: Boolean(navigator.serviceWorker.controller), cacheName },
      targets: targetsProof,
    };
  });

  for (const target of proof.targets) {
    expect(target.before.proof, `${target.label} stale marker should be seeded`).toBe('stale');
    expect(target.fetchedStatus, `${target.label} should fetch successfully`).toBe(200);
    expect(target.after.proof, `${target.label} stale marker should be overwritten`).not.toBe('stale');
    expect(target.after.bytes, `${target.label} should no longer be stale-sized`).toBeGreaterThan(target.before.bytes);
  }

  return proof;
}

async function readSurvivalState(page: Page): Promise<SurvivalState> {
  return page.evaluate(() => {
    const sds = (window as unknown as {
      __sds?: { gameInstanceRef?: any };
      __sdsRendererMode?: string;
    });
    const game = sds.__sds?.gameInstanceRef;
    return {
      scene: game?.currentScene?.id ?? null,
      active: game?.gameState?.gameActive ?? null,
      dayLoop: Boolean(game?.dayLoop),
      survivalRun: Boolean(game?._survivalRun),
      wolfPack: Boolean(game?._wolfPack),
      minimap: Boolean(document.getElementById('sds-minimap')),
      rendererMode: sds.__sdsRendererMode ?? null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

async function waitForState(
  page: Page,
  expected: Partial<SurvivalState>,
  timeout = 150_000,
) {
  const start = Date.now();
  let last: SurvivalState | null = null;
  while (Date.now() - start < timeout) {
    last = await readSurvivalState(page);
    if (Object.entries(expected).every(([key, value]) => last?.[key as keyof SurvivalState] === value)) return last;
    await page.waitForTimeout(500);
  }
  throw new Error(`Timed out waiting for ${JSON.stringify(expected)}; last=${JSON.stringify(last)}`);
}

async function waitForGameplayVisible(page: Page) {
  await waitForVisibleButton(page, { aria: 'Pause game' }, 45_000);
  await page.waitForFunction(
    (labels) => {
      const text = document.body?.innerText ?? '';
      return !document.querySelector('[data-sds-loading-screen="true"]')
        && !document.querySelector('#renderer-fallback-toast')
        && !(labels as string[]).some((label) => text.includes(label));
    },
    BLOCKING_GAMEPLAY_COPY,
    { timeout: 45_000 },
  );
}

async function readHudRects(page: Page) {
  return page.evaluate(() => {
    function rectFor(selector: string) {
      const el = document.querySelector(selector);
      if (!el) return null;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return null;
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
    };
  });
}

function overlap(a: Rect | null, b: Rect | null) {
  if (!a || !b) return null;
  const width = Math.min(a.right, b.right) - Math.max(a.x, b.x);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
  if (width <= 2 || height <= 2) return null;
  return { width, height, area: width * height };
}

async function assertHudLayout(page: Page, label: string) {
  const rects = await readHudRects(page);
  const pairs = [
    ['mobileHud', 'minimap'],
    ['skipDusk', 'cameraMode'],
    ['skipDusk', 'minimap'],
    ['fullscreenButton', 'mobileHud'],
  ] as const;
  const collisions = pairs
    .map(([left, right]) => ({ left, right, overlap: overlap(rects[left], rects[right]) }))
    .filter((item) => item.overlap);

  expect(collisions, `${label} HUD controls should not overlap: ${JSON.stringify(rects)}`).toEqual([]);
  return rects;
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(`${name}.png`, { path, contentType: 'image/png' });
  return path;
}

test('Newsheepdogland first-session loop survives stale cache and stale scene storage on real iOS Safari', async ({ page, context }, testInfo) => {
  await seedReturningPlayer(context);
  const report: Record<string, unknown> = {
    label: 'browserstack-newsheepdogland-first-session',
    baseUrl: IOS_BASE_URL,
    url: FIRST_SESSION_URL,
    startedAt: new Date().toISOString(),
  };

  try {
    await page.evaluate((url) => {
      window.location.assign(url);
    }, FIRST_SESSION_URL);
    await waitForEntrance(page);
    report.entranceScreenshot = await screenshot(page, testInfo, 'newsheepdogland-entrance');
    report.cacheProof = await verifyMutableCacheOverwrite(page);

    await tapVisibleButton(page, { text: 'Play' }, 45_000);
    await page.locator('#canvas-container canvas').waitFor({ state: 'attached', timeout: 150_000 });
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

    await tapVisibleButton(page, { aria: 'Pause game' }, 45_000);
    await tapVisibleButton(page, { text: 'Main Menu' }, 45_000);
    await waitForEntrance(page);
    const returned = await waitForState(page, {
      scene: 'newsheepdogland',
      active: false,
      dayLoop: false,
      survivalRun: false,
      wolfPack: false,
      minimap: false,
    }, 90_000);

    await tapVisibleButton(page, { text: 'Play' }, 45_000);
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

    report.loop = { firstReady, firstHud, returned, secondReady, secondHud };
    report.gameplayScreenshot = await screenshot(page, testInfo, 'newsheepdogland-gameplay');
  } catch (err) {
    report.error = String((err as Error)?.stack || (err as Error)?.message || err);
    report.failureScreenshot = await screenshot(page, testInfo, 'newsheepdogland-failure').catch(() => null);
    throw err;
  } finally {
    report.endedAt = new Date().toISOString();
    const reportPath = testInfo.outputPath('newsheepdogland-first-session.json');
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await testInfo.attach('newsheepdogland-first-session.json', { path: reportPath, contentType: 'application/json' });
  }
});
