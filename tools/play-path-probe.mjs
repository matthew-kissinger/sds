// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// /play/25, /play/75 and /play/200 start that flock once per page load
// (spec/14-score-cards.md). Vitest has no DOM here and cannot remount Boot, so
// this drives the normal application and reads the run clock a player sees.
//
//   npm run build && npm run probe:play-path

import { launchBrowser, removeDir, scratchDir, startPreviewServer, stopServer } from './probe-lib.mjs';

const PORT = 5332;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const RUN_MS = 4_000;
const SETTLE_MS = 1_500;

const seconds = (text) => {
  const [minutes, rest] = text.split(':');
  return Number(minutes) * 60 + Number(rest);
};

async function open(browser, path) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.route(`${ORIGIN}/api/**`, (route) => route.abort('blockedbyclient'));
  await page.route('**/static.cloudflareinsights.com/**', (route) => route.abort());
  await page.goto(`${ORIGIN}${path}?debug=webgl`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForSelector('.herd-app[data-ready="true"]', { timeout: 90_000 });
  return page;
}

const phase = (page) => page.locator('.herd-app').getAttribute('data-phase');
const playing = (page) => page.waitForSelector('.herd-app[data-phase="playing"]', { timeout: 30_000 });
const button = (page, name) => page.getByRole('button', { name, exact: true });

/**
 * Let the run go and return what the clock reads with the game paused. The clock
 * setting outlives a round, so a second round on a page must not toggle it again.
 */
async function runThenPause(page, { showClock = true } = {}) {
  await playing(page);
  if (showClock) await page.getByTestId('timer-toggle').click();
  await page.waitForTimeout(RUN_MS);
  await page.locator('.herd-pause-button').click();
  await page.waitForSelector('.herd-app[data-phase="paused"]', { timeout: 10_000 });
  return page.locator('.herd-timer').innerText();
}

/** Resume, then whether the clock carried on from where the pause left it. */
async function resumeKeepsRun(page, paused) {
  await button(page, 'Resume').click();
  await page.waitForTimeout(SETTLE_MS);
  const resumed = await page.locator('.herd-timer').innerText();
  return {
    paused,
    resumed,
    pass: await phase(page) === 'playing' && seconds(resumed) >= seconds(paused),
  };
}

const checks = {
  async 'flock paths keep their run through pause and resume'(browser) {
    const results = {};
    for (const size of [25, 75, 200]) {
      const page = await open(browser, `/play/${size}`);
      const paused = await runThenPause(page);
      const flock = await page.getByTestId('penned-count').getAttribute('data-flock-size');
      results[size] = { ...await resumeKeepsRun(page, paused), flock };
      results[size].pass &&= flock === String(size);
      await page.context().close();
    }
    return { results, pass: Object.values(results).every((result) => result.pass) };
  },

  async 'a flock path keeps its run through the settings panel'(browser) {
    const page = await open(browser, '/play/25');
    const paused = await runThenPause(page);
    await button(page, 'Settings').click();
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const result = await resumeKeepsRun(page, paused);
    await page.context().close();
    return result;
  },

  async 'ending a run on a flock path stays on the title'(browser) {
    const page = await open(browser, '/play/25');
    await runThenPause(page);
    await button(page, 'End run').click();
    await page.waitForTimeout(SETTLE_MS);
    const after = await phase(page);
    await page.context().close();
    return { after, pass: after === 'title' };
  },

  async 'Play after End run on a flock path starts that flock afresh'(browser) {
    const page = await open(browser, '/play/75');
    await runThenPause(page);
    await button(page, 'End run').click();
    await page.waitForSelector('.herd-app[data-phase="title"]', { timeout: 10_000 });
    await page.waitForTimeout(SETTLE_MS);
    await page.locator('.herd-title-actions > .herd-button--primary').click();
    const paused = await runThenPause(page, { showClock: false });
    const flock = await page.getByTestId('penned-count').getAttribute('data-flock-size');
    const result = await resumeKeepsRun(page, paused);
    await page.context().close();
    // A clock past one run's length would mean the first round's time carried over.
    const fresh = seconds(paused) < (RUN_MS + SETTLE_MS) / 1000;
    return { ...result, flock, fresh, pass: result.pass && fresh && flock === '75' };
  },

  async 'multiplayer opened from a flock path title goes back to the title'(browser) {
    const page = await open(browser, '/play/25');
    await runThenPause(page);
    await button(page, 'End run').click();
    await page.waitForSelector('.herd-app[data-phase="title"]', { timeout: 10_000 });
    await button(page, 'Play multiplayer').click();
    await page.waitForSelector('dialog.mp-dialog[open]', { timeout: 10_000 });
    await page.waitForTimeout(SETTLE_MS);
    const whileOpen = await phase(page);
    await button(page, 'Back to solo').click();
    await page.waitForTimeout(SETTLE_MS);
    const after = await phase(page);
    const title = await button(page, 'Play solo').isVisible();
    await page.context().close();
    return { whileOpen, after, title, pass: whileOpen === 'title' && after === 'title' && title };
  },

  async 'the title path starts nothing and keeps its run'(browser) {
    const page = await open(browser, '/');
    await page.waitForTimeout(SETTLE_MS);
    const before = await phase(page);
    await page.locator('.herd-title-actions > .herd-button--primary').click();
    const paused = await runThenPause(page);
    const result = await resumeKeepsRun(page, paused);
    await page.context().close();
    return { before, ...result, pass: before === 'title' && result.pass };
  },
};

const profile = scratchDir('sds-play-path');
const server = await startPreviewServer(PORT);
const browser = await launchBrowser(profile);
let failed = false;
try {
  for (const [name, check] of Object.entries(checks)) {
    const result = await check(browser);
    failed ||= !result.pass;
    console.log(`${result.pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(result)}`);
  }
} finally {
  await browser.close();
  await stopServer(server);
  removeDir(profile);
}
process.exit(failed ? 1 : 0);
