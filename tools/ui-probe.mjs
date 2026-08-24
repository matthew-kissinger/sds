// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Responsive UI acceptance against the normal app. Captures title, settings,
// live HUD and pause states at the four spec/06 shapes, exercises keyboard
// pause/resume, and fails on page errors, horizontal overflow or undersized
// visible buttons. Every browser context and the private dev server are closed.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SEED,
  launchBrowser,
  removeDir,
  repo,
  scratchDir,
  startServer,
  stopServer,
} from './probe-lib.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};

const port = Number(flag('port', 5308));
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error(`bad --port ${port}`);
}
const urlFlag = flag('url', '');
const base = urlFlag ? urlFlag.replace(/\/$/, '') : `http://localhost:${port}`;
const label = flag('label', 'phase4-ui');
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(label)) throw new Error(`bad --label ${label}`);
const outDir = join(repo, 'captures', 'ui', label);

const CASES = [
  { name: 'desktop', width: 1440, height: 900, scale: 1 },
  { name: 'tablet', width: 768, height: 1024, scale: 1 },
  { name: 'phone-portrait', width: 390, height: 844, scale: 2, mobile: true },
  { name: 'phone-landscape', width: 844, height: 390, scale: 2, mobile: true },
];

async function auditLayout(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const undersized = [...document.querySelectorAll('button')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.visibility !== 'hidden' && style.display !== 'none' &&
          rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
      })
      .map((node) => ({
        label: node.getAttribute('aria-label') || node.textContent?.trim() || 'button',
        width: Math.round(node.getBoundingClientRect().width),
        height: Math.round(node.getBoundingClientRect().height),
      }));
    const active = document.activeElement;
    const activeLabel = active instanceof HTMLElement && active !== document.body
      ? active.getAttribute('aria-label') || active.textContent?.trim() || active.tagName
      : active?.tagName || null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      horizontalOverflow: root.scrollWidth - root.clientWidth,
      undersized,
      active: activeLabel,
    };
  });
}

async function waitForReady(page) {
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await page.waitForSelector('.herd-app[data-ready="true"]', { timeout: 90_000 });
}

async function startPlay(page, flockSize) {
  await waitForReady(page);
  await page.locator('.herd-size').filter({ hasText: String(flockSize) }).click();
  await page.locator('.herd-title-actions > .herd-button--primary').click();
  await page.waitForSelector('.herd-app[data-phase="playing"]', { timeout: 30_000 });
  await page.waitForTimeout(250);
}

let server = null;
let browser = null;
let profile = null;
let failed = false;
const receipts = [];

mkdirSync(outDir, { recursive: true });

try {
  if (!urlFlag) server = await startServer(port);
  profile = scratchDir(`herd-ui-${label}`);
  browser = await launchBrowser(profile);

  for (const spec of CASES) {
    const context = await browser.newContext({
      viewport: { width: spec.width, height: spec.height },
      deviceScaleFactor: spec.scale,
      ...(spec.mobile ? { isMobile: true, hasTouch: true } : {}),
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(`page: ${String(error)}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    try {
      await page.goto(`${base}/?seed=${SEED}`, {
        waitUntil: 'load',
        timeout: 60_000,
      });
      await waitForReady(page);
      await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
      await page.screenshot({ path: join(outDir, `${spec.name}-title.png`) });
      const title = await auditLayout(page);

      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('heading', { name: 'Settings' }).waitFor();
      await page.screenshot({ path: join(outDir, `${spec.name}-settings.png`) });
      const settings = await auditLayout(page);
      await page.getByRole('button', { name: 'Close settings' }).click();

      await startPlay(page, 25);
      if (spec.mobile) {
        await page.mouse.move(Math.round(spec.width * 0.25), Math.round(spec.height * 0.76));
        await page.mouse.down();
        await page.mouse.move(Math.round(spec.width * 0.34), Math.round(spec.height * 0.68), { steps: 4 });
      }
      await page.screenshot({ path: join(outDir, `${spec.name}-hud.png`) });
      const hud = await auditLayout(page);
      if (spec.mobile) await page.mouse.up();

      await page.getByRole('button', { name: 'Pause' }).click();
      await page.getByRole('heading', { name: 'Paused' }).waitFor();
      await page.screenshot({ path: join(outDir, `${spec.name}-pause.png`) });
      const pause = await auditLayout(page);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Pause' }).waitFor();

      const layouts = { title, settings, hud, pause };
      const bad = Object.entries(layouts).flatMap(([state, result]) => [
        ...(result.horizontalOverflow > 1
          ? [`${state}: horizontal overflow ${result.horizontalOverflow}px`]
          : []),
        ...result.undersized.map(
          (item) => `${state}: ${item.label} is ${item.width}x${item.height}`,
        ),
      ]);
      if (errors.length > 0 || bad.length > 0) failed = true;
      receipts.push({ case: spec.name, layouts, errors, failures: bad });
    } catch (error) {
      failed = true;
      receipts.push({ case: spec.name, error: String(error?.message ?? error), errors });
    } finally {
      await page.close();
      await context.close();
    }
  }

  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await reduced.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/?seed=${SEED}`, { waitUntil: 'load' });
  await waitForReady(page);
  const attr = await page.locator('.herd-app').getAttribute('data-reduced-motion');
  receipts.push({ case: 'os-reduced-motion', active: attr === 'true' });
  if (attr !== 'true') failed = true;
  await page.close();
  await reduced.close();
} finally {
  if (browser) await browser.close().catch(() => {});
  stopServer(server);
  removeDir(profile);
}

const manifest = {
  label,
  seed: SEED,
  capturedAt: new Date().toISOString(),
  tool: 'tools/ui-probe.mjs',
  receipts,
};
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
process.exit(failed ? 1 : 0);
