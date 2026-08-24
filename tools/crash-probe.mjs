// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { chromium } from 'playwright';
import { repo } from './probe-lib.mjs';
import { collectBuildReceipt } from './playtest-profile-receipt.mjs';

const target = process.argv[2] ?? 'http://127.0.0.1:5199/';
const screenshotPath = join(repo, 'captures', 'crash-probe.png');
const manifestPath = join(dirname(screenshotPath), 'crash-probe.json');
mkdirSync(dirname(screenshotPath), { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.route('**/api/lobbies', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: '{"lobbies":[]}',
}));
const page = await context.newPage();
const fatalEvents = [];
const warnings = [];
let collecting = true;
let before = null;
let after = null;
let screenshot = null;

page.on('crash', () => {
  if (collecting) fatalEvents.push({ kind: 'crash' });
});
page.on('pageerror', (error) => {
  if (collecting) fatalEvents.push({ kind: 'pageerror', message: String(error) });
});
page.on('console', (message) => {
  if (!collecting) return;
  if (message.type() === 'error') {
    fatalEvents.push({ kind: 'console-error', message: message.text() });
  } else if (message.type() === 'warning') {
    const text = message.text();
    warnings.push({
      kind: 'console-warning',
      message: text,
      deprecation: /deprecat/i.test(text),
    });
  }
});
page.on('requestfailed', (request) => {
  if (collecting) {
    fatalEvents.push({
      kind: 'requestfailed',
      url: request.url(),
      message: request.failure()?.errorText ?? '',
    });
  }
});
page.on('response', (response) => {
  if (collecting && response.status() >= 400) {
    fatalEvents.push({
      kind: 'response',
      status: response.status(),
      url: response.url(),
    });
  }
});

try {
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('.herd-boot[data-ready=true]').waitFor({ timeout: 60_000 });
  before = await page.evaluate(() => ({
    title: document.title,
    phase: document.querySelector('.herd-app')?.getAttribute('data-phase'),
    canvas: (() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        css: [rect.width, rect.height],
        buffer: [canvas.width, canvas.height],
      };
    })(),
  }));
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.locator('.herd-app[data-phase=playing]').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(8_000);
  await page.screenshot({ path: screenshotPath });
  screenshot = relative(repo, screenshotPath).replaceAll('\\', '/');
  after = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const readout = document.querySelector('[data-testid="debug-readout"]');
    const style = canvas instanceof HTMLCanvasElement ? getComputedStyle(canvas) : null;
    return {
      readout: readout instanceof HTMLElement ? { ...readout.dataset } : null,
      canvas: canvas instanceof HTMLCanvasElement ? {
        width: canvas.width,
        height: canvas.height,
        display: style?.display ?? null,
        opacity: style?.opacity ?? null,
        visibility: style?.visibility ?? null,
      } : null,
    };
  });
} catch (error) {
  fatalEvents.push({ kind: 'probe-error', message: String(error?.stack ?? error) });
} finally {
  // Browser teardown can abort harmless in-flight requests. Stop collection
  // before closing so cleanup cannot manufacture a failed stability receipt.
  collecting = false;
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

const build = collectBuildReceipt(repo);
const manifest = {
  tool: 'tools/crash-probe.mjs',
  generatedAt: new Date().toISOString(),
  target,
  source: { gitHead: build.gitHead },
  build: { files: build.files },
  before,
  after,
  fatalEvents,
  warnings,
  // Null on an interrupted probe. An older PNG may still exist on disk, but
  // this receipt must never claim it was produced by the current run.
  screenshot,
  pass: fatalEvents.length === 0,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
process.exitCode = manifest.pass ? 0 : 1;
