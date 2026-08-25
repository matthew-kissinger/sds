// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cold production-preview boot receipt. Measures navigation to the real,
// enabled Play button and then to the playing state on desktop and a throttled
// mid-mobile profile. The normal app is used; there is no boot-only route.

import {
  SEED,
  launchBrowser,
  removeDir,
  repo,
  scratchDir,
  startPreviewServer,
  stopServer,
} from './probe-lib.mjs';
import {
  MID_MOBILE_PROFILE,
  failureCollectionsAreEmpty,
} from './playtest-profile-lib.mjs';
import {
  collectBuildReceipt,
  sameBuildReceipt,
} from './playtest-profile-receipt.mjs';

const argv = process.argv.slice(2);
const hit = argv.find((arg) => arg.startsWith('--port='));
const port = Number(hit?.slice(7) ?? 5310);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`bad port ${port}`);
const base = `http://localhost:${port}`;

async function measure(browser, spec) {
  const context = await browser.newContext({
    viewport: spec.viewport,
    deviceScaleFactor: spec.mobile ? 2 : 1,
    ...(spec.mobile ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  const crashes = [];
  const errors = [];
  const failedRequests = [];
  const failedResponses = [];
  let collectingFailures = true;
  page.on('crash', () => {
    if (collectingFailures) crashes.push('page crashed');
  });
  page.on('pageerror', (error) => {
    if (collectingFailures) errors.push(String(error));
  });
  page.on('console', (message) => {
    if (collectingFailures && message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (collectingFailures && response.status() >= 400) {
      failedResponses.push({ status: response.status(), url: response.url() });
    }
  });
  page.on('requestfailed', (request) => {
    if (collectingFailures) {
      failedRequests.push({
        url: request.url(),
        error: request.failure()?.errorText ?? '',
      });
    }
  });
  // Standalone Vite preview has no Worker binding. Keep the boot receipt about
  // the client path while the release probe separately validates API wiring.
  await context.route('**/api/lobbies', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"lobbies":[]}',
  }));
  if (spec.mobile) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: MID_MOBILE_PROFILE.latencyMs,
      downloadThroughput: (MID_MOBILE_PROFILE.downloadMbps * 1024 * 1024) / 8,
      uploadThroughput: (MID_MOBILE_PROFILE.uploadMbps * 1024 * 1024) / 8,
      connectionType: 'cellular4g',
    });
    await cdp.send('Emulation.setCPUThrottlingRate', {
      rate: MID_MOBILE_PROFILE.cpuSlowdown,
    });
  }
  try {
    await page.goto(`${base}/?seed=${SEED}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    const play = page.locator('.herd-title-actions > .herd-button--primary');
    await play.waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForFunction(
      () => {
        const button = [...document.querySelectorAll('button')]
          .find((node) => node.textContent?.trim() === 'Play');
        return button instanceof HTMLButtonElement && !button.disabled;
      },
      undefined,
      { timeout: 60_000, polling: 25 },
    );
    const readyMs = await page.evaluate(() => performance.now());
    const actionability = await play.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        hitTag: hit?.tagName ?? null,
        hitClass: hit instanceof HTMLElement ? hit.className : null,
        hitText: hit?.textContent?.trim() ?? null,
      };
    });
    const transfer = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource');
      return entries.reduce((total, entry) => total + (entry.transferSize || 0), 0);
    });
    const resourceTail = await page.evaluate(() => performance.getEntriesByType('resource')
      .map((entry) => ({
        name: new URL(entry.name).pathname,
        endMs: Math.round(entry.responseEnd),
        durationMs: Math.round(entry.duration),
      }))
      .sort((a, b) => b.endMs - a.endMs)
      .slice(0, 8));
    const quality = await page.locator('.herd-app').evaluate((node) => ({
      backend: node.getAttribute('data-backend') ?? '',
      renderTier: node.getAttribute('data-render-tier') ?? '',
      fillMs: node.getAttribute('data-fill-ms') ?? '',
    }));
    const boot = await page.evaluate(() => ({
      progress: document.querySelector('.herd-boot')?.getAttribute('data-progress') ?? '',
      stage: document.querySelector('.herd-boot')?.getAttribute('data-stage') ?? '',
      marks: performance.getEntriesByType('mark')
        .filter((entry) => entry.name.startsWith('herd:boot:'))
        .map((entry) => ({ name: entry.name, startMs: Math.round(entry.startTime) })),
    }));
    const clickStartMs = await page.evaluate(() => performance.now());
    await page.mouse.click(
      actionability.rect.x + actionability.rect.width / 2,
      actionability.rect.y + actionability.rect.height / 2,
    );
    const clickEndMs = await page.evaluate(() => performance.now());
    await page.waitForFunction(
      () => document.querySelector('.herd-app')?.getAttribute('data-phase') === 'playing',
      undefined,
      { timeout: 10_000, polling: 25 },
    );
    const playingMs = await page.evaluate(() => performance.now());
    return {
      profile: spec.name,
      emulation: spec.mobile ? MID_MOBILE_PROFILE : null,
      readyMs: Math.round(readyMs),
      playingMs: Math.round(playingMs),
      clickActionMs: Math.round(clickEndMs - clickStartMs),
      clickToPlayingMs: Math.round(playingMs - clickStartMs),
      transferBytes: transfer,
      resourceTail,
      crashes,
      errors,
      failedRequests,
      failedResponses,
      actionability,
      quality,
      boot,
      pass: playingMs < spec.budgetMs
        && failureCollectionsAreEmpty(crashes, errors, failedRequests, failedResponses),
      budgetMs: spec.budgetMs,
    };
  } finally {
    collectingFailures = false;
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

let server = null;
let failed = false;
const results = [];
const buildBefore = collectBuildReceipt(repo);
try {
  server = await startPreviewServer(port);
  for (const spec of [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, budgetMs: 2_000 },
    { name: 'mid-mobile-4g', viewport: { width: 390, height: 844 }, budgetMs: 5_000, mobile: true },
  ]) {
    let browser = null;
    let profile = null;
    try {
      profile = scratchDir(`herd-boot-${port}-${spec.name}`);
      browser = await launchBrowser(profile);
      const result = await measure(browser, spec);
      results.push(result);
      if (!result.pass) failed = true;
    } catch (error) {
      failed = true;
      results.push({
        profile: spec.name,
        pass: false,
        error: String(error?.stack ?? error),
      });
    } finally {
      if (browser) await browser.close().catch(() => {});
      removeDir(profile);
    }
  }
} finally {
  stopServer(server);
}
const buildAfter = collectBuildReceipt(repo);
const buildStable = sameBuildReceipt(buildBefore, buildAfter);
if (!buildStable) failed = true;
console.log(JSON.stringify({
  tool: 'tools/boot-probe.mjs',
  source: { gitHead: buildAfter.gitHead },
  build: {
    stableDuringProbe: buildStable,
    before: buildBefore.files,
    after: buildAfter.files,
  },
  results,
  pass: !failed,
}, null, 2));
process.exit(failed ? 1 : 0);
