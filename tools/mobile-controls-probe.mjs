// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, removeDir, repo, scratchDir } from './probe-lib.mjs';

const urlArg = process.argv.find((arg) => arg.startsWith('--url='));
const url = urlArg?.slice('--url='.length) ?? 'http://127.0.0.1:5317/';
const outputDir = join(repo, 'captures', 'mobile-controls');
mkdirSync(outputDir, { recursive: true });

const profile = scratchDir('sds-mobile-controls');
let browser;
let context;
try {
  browser = await launchBrowser(profile);
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => document.querySelector('.herd-app')?.dataset.ready === 'true',
    { timeout: 60_000 },
  );
  await page.locator('.herd-size').filter({ hasText: '200' }).click();
  await page.locator('.herd-title-actions > .herd-button--primary').click();
  await page.waitForSelector('[data-testid="sprint-button"]', { state: 'visible' });

  const before = await page.locator('.herd-stamina').getAttribute('aria-valuenow');
  await page.dispatchEvent('[data-testid="touch-stick-zone"]', 'pointerdown', {
    pointerId: 11, pointerType: 'touch', clientX: 80, clientY: 690, isPrimary: true,
  });
  await page.dispatchEvent('[data-testid="touch-stick-zone"]', 'pointermove', {
    pointerId: 11, pointerType: 'touch', clientX: 80, clientY: 625, isPrimary: true,
  });
  const sprint = page.locator('[data-testid="sprint-button"]');
  const sprintBox = await sprint.boundingBox();
  if (sprintBox === null) throw new Error('sprint button has no bounding box');
  await page.dispatchEvent('[data-testid="sprint-button"]', 'pointerdown', {
    pointerId: 12,
    pointerType: 'touch',
    clientX: sprintBox.x + sprintBox.width / 2,
    clientY: sprintBox.y + sprintBox.height / 2,
  });
  await page.waitForTimeout(750);
  const active = await sprint.getAttribute('aria-pressed');
  const after = await page.locator('.herd-stamina').getAttribute('aria-valuenow');

  // Exercise the worst label without altering gameplay state: this is a CSS
  // containment check for the final 200 / 200 text, not a scoring shortcut.
  const countFits = await page.locator('[data-testid="penned-count"]').evaluate((node) => {
    const count = node.querySelector('.herd-progress__count');
    if (!(count instanceof HTMLElement)) return false;
    count.textContent = '200 / 200';
    const outer = node.getBoundingClientRect();
    const inner = count.getBoundingClientRect();
    return inner.left >= outer.left && inner.right <= outer.right;
  });
  await page.screenshot({ path: join(outputDir, 'portrait-200-sprint.png') });

  await page.dispatchEvent('[data-testid="sprint-button"]', 'pointerup', {
    pointerId: 12, pointerType: 'touch',
  });
  await page.dispatchEvent('[data-testid="touch-stick-zone"]', 'pointerup', {
    pointerId: 11, pointerType: 'touch',
  });

  const result = {
    viewport: { width: 390, height: 844 },
    sprintActiveWhileHeld: active === 'true',
    staminaBefore: Number(before),
    staminaAfter: Number(after),
    staminaDrained: Number(after) < Number(before),
    count200Fits: countFits,
    screenshot: 'captures/mobile-controls/portrait-200-sprint.png',
  };
  console.log(JSON.stringify(result));
  if (!result.sprintActiveWhileHeld || !result.staminaDrained || !result.count200Fits) {
    process.exitCode = 1;
  }
} finally {
  await context?.close();
  await browser?.close();
  removeDir(profile);
}
