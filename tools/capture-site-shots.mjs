// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// The screenshots on the static pages, taken from the normal application with
// the keyboard and touch input a player has. No game hooks. See
// assets/site-shots/README.md.
//
//   npm run build && node tools/capture-site-shots.mjs
//   npm run build && node tools/capture-site-shots.mjs --lang=id
//   npm run coop:built, then node tools/capture-site-shots.mjs --multiplayer
//
// The multiplayer half needs real rooms, so it drives the disposable local
// service in tools/coop-local.mjs. It never connects to production.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SEED,
  launchBrowser,
  removeDir,
  repo,
  scratchDir,
  startPreviewServer,
  stopServer,
} from './probe-lib.mjs';

const PORT = 5327;
const OUTPUT = join(repo, 'app', 'public', 'shots');
const COOP_ORIGIN = 'http://localhost:5198';
const multiplayer = process.argv.includes('--multiplayer');
const lang = process.argv.find((arg) => arg.startsWith('--lang='))?.slice('--lang='.length);
const QUALITY = 0.8;
const WIDE = 1000;
mkdirSync(OUTPUT, { recursive: true });

/** Re-encode through the browser's own WebP encoder, so no dependency lands for it. */
async function saveWebp(page, name, width = WIDE) {
  const png = await page.screenshot({ type: 'png' });
  const encoded = await page.evaluate(async ({ source, width: target, quality }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${source}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = Math.round(image.height * (target / image.width));
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    const buffer = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of buffer) binary += String.fromCharCode(byte);
    return { data: btoa(binary), width: canvas.width, height: canvas.height };
  }, { source: png.toString('base64'), width, quality: QUALITY });
  const bytes = Buffer.from(encoded.data, 'base64');
  writeFileSync(join(OUTPUT, `${name}.webp`), bytes);
  console.log(`${name}.webp ${encoded.width}x${encoded.height} ${bytes.length} bytes`);
}

async function blockBackend(page, origin) {
  await page.route(`${origin}/api/**`, (route) => route.abort('blockedbyclient'));
  await page.route('**/static.cloudflareinsights.com/**', (route) => route.abort());
}

async function openGame(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForSelector('.herd-app[data-ready="true"]', { timeout: 90_000 });
}

/** Start a solo round at this flock size, from the title screen. */
async function startSolo(page, size) {
  await page.locator('.herd-size').filter({ hasText: String(size) }).click();
  await page.locator('.herd-title-actions > .herd-button--primary').click();
  await page.waitForSelector('.herd-app[data-phase="playing"]', { timeout: 30_000 });
}

/** Walk the dog with held keys, the way a player would. */
async function hold(page, keys, ms) {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  for (const key of keys) await page.keyboard.up(key);
}

/** The Studio, on the dog tab, with a coat the default dog does not wear. */
async function captureStudio(browser, origin, name, query) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });
  const page = await context.newPage();
  await blockBackend(page, origin);
  await openGame(page, `${origin}/?seed=${SEED}&debug=webgl${query}`);
  await page.locator('#customize-trigger').click();
  await page.getByRole('tab', { selected: true }).waitFor({ timeout: 10_000 });
  await page.getByRole('radio', { name: /Blue Merle/ }).click();
  await page.waitForTimeout(1_200);
  await saveWebp(page, name);
  await context.close();
}

/** The frames that show interface text, in one language. */
async function captureLanguage(browser, origin, code) {
  await captureStudio(browser, origin, `studio-${code}`, `&lang=${code}`);
  await captureTouch(browser, origin, `touch-controls-${code}`, `&lang=${code}`);
}

async function captureTouch(browser, origin, name, query) {
  const touch = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    colorScheme: 'light',
  });
  const controls = await touch.newPage();
  await blockBackend(controls, origin);
  await openGame(controls, `${origin}/?seed=${SEED}&debug=webgl${query}`);
  await startSolo(controls, 75);
  await controls.waitForSelector('[data-testid="sprint-button"]', { state: 'visible' });
  await controls.waitForTimeout(2_000);
  await saveWebp(controls, name);
  await touch.close();
}

async function captureSolo(browser, origin) {
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });

  const field = await desktop.newPage();
  await blockBackend(field, origin);
  await openGame(field, `${origin}/?seed=${SEED}&debug=webgl`);
  await startSolo(field, 25);
  await field.waitForTimeout(1_500);
  await hold(field, ['w'], 1_400);
  await field.waitForTimeout(600);
  await saveWebp(field, 'field-25');
  await field.close();

  const flock = await desktop.newPage();
  await blockBackend(flock, origin);
  await openGame(flock, `${origin}/?seed=${SEED}&debug=webgl`);
  await startSolo(flock, 200);
  await flock.waitForTimeout(1_500);
  await hold(flock, ['w'], 1_100);
  await flock.keyboard.press('c');
  await flock.waitForTimeout(1_400);
  await saveWebp(flock, 'flock-200');
  // The same frame without interface text, for a page in another language.
  await flock.addStyleTag({
    content: '.herd-app > * { visibility: hidden } canvas { visibility: visible !important }',
  });
  await saveWebp(flock, 'flock-200-field');
  await flock.close();
  await desktop.close();

  await captureStudio(browser, origin, 'studio', '');
  await captureTouch(browser, origin, 'touch-controls', '');
}

async function captureRooms(browser) {
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  })));
  const [host, guest] = await Promise.all(contexts.map((context) => context.newPage()));
  for (const page of [host, guest]) {
    await page.route('**/static.cloudflareinsights.com/**', (route) => route.abort());
  }
  await openGame(host, `${COOP_ORIGIN}/?debug=webgl`);
  await host.getByRole('button', { name: 'Play multiplayer locally', exact: true }).click();
  await host.getByRole('button', { name: 'Create room', exact: true }).click();
  await host.getByRole('button', { name: 'Start co-op', exact: true }).waitFor({ timeout: 20_000 });
  const link = await host.getByLabel('Invite link', { exact: true }).inputValue();
  await openGame(guest, `${link}?debug=webgl`);
  await guest.getByRole('button', { name: 'Join room', exact: true }).click();
  await guest.getByRole('button', { name: 'Ready', exact: true }).waitFor({ timeout: 20_000 });
  await host.getByRole('button', { name: 'Ready', exact: true }).click();
  await guest.getByRole('button', { name: 'Ready', exact: true }).click();
  await host.waitForTimeout(500);
  await saveWebp(host, 'multiplayer-room');
  await host.getByRole('button', { name: 'Start co-op', exact: true }).click();
  for (const page of [host, guest]) {
    await page.waitForSelector('.herd-app[data-phase="playing"]', { timeout: 20_000 });
  }
  await host.waitForTimeout(1_500);
  await host.keyboard.down('w');
  await guest.keyboard.down('w');
  await host.waitForTimeout(1_400);
  await host.keyboard.up('w');
  await guest.keyboard.up('w');
  await host.waitForTimeout(500);
  await saveWebp(host, 'coop-round');
  await Promise.all(contexts.map((context) => context.close()));
}

let server = null;
let browser = null;
const profile = scratchDir('sds-site-shots');
try {
  browser = await launchBrowser(profile);
  if (multiplayer) {
    await captureRooms(browser);
  } else {
    server = await startPreviewServer(PORT);
    if (lang) await captureLanguage(browser, `http://127.0.0.1:${PORT}`, lang);
    else await captureSolo(browser, `http://127.0.0.1:${PORT}`);
  }
} finally {
  await browser?.close();
  if (server) await stopServer(server);
  removeDir(profile);
}
