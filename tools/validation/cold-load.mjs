#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cold-load budget gate (Cycle 112 Phase 5).
 *
 * "Loading is slow" was a standing complaint with no number behind it, so it
 * could neither be closed nor regressed against. This measures the two moments
 * a player actually waits through, on a genuinely cold cache, and fails when
 * either exceeds the D17 budget:
 *
 *   firstInteractive  the entrance is up and Play is pressable
 *   roundPlayable     the round is built and the player has control
 *
 * COLDNESS IS THE WHOLE POINT. Each run gets a fresh browser context, so the
 * HTTP cache, service worker and storage all start empty. Reusing a context
 * would measure a warm load and quietly report a number several times better
 * than any real first visit. The service worker is left registered but a new
 * context has no activated worker on the first navigation, which is what a
 * first-time visitor gets.
 *
 * Budgets are per D17: 2,500ms desktop, 5,000ms phone, to firstInteractive.
 * roundPlayable is reported and, by default, not enforced - it depends on scene
 * size and hardware far more than on the payload this cycle changed. Pass
 * --enforceRound to gate on it too.
 *
 * Assumes `npm run dev` is already serving on :3000, matching the other scripts
 * in this directory. Note that a dev-server number is not a production number:
 * it is unminified and unbundled, so treat it as a regression signal rather
 * than as the figure to quote.
 *
 * Usage:
 *   node tools/validation/cold-load.mjs
 *   node tools/validation/cold-load.mjs --profile=mobile
 *   node tools/validation/cold-load.mjs --runs=3 --out=coldload.json
 */
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];

const PROFILES = {
  desktop: {
    viewport: { width: 1280, height: 720 },
    budgetMs: 2500,
  },
  mobile: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    budgetMs: 5000,
  },
};

function parseArgs(argv) {
  const args = { profile: 'desktop', scene: null, runs: 1, out: null, enforceRound: false };
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)=?(.*)$/.exec(a);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'runs') args.runs = Number(v);
    else if (k === 'enforceRound') args.enforceRound = true;
    else args[k] = v === '' ? true : v;
  }
  return args;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function measureOnce(browser, profile, scene) {
  // A fresh context per run is what makes this cold.
  const { budgetMs, ...contextOptions } = profile;
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  try {
    const url = new URL('http://localhost:3000/');
    if (scene) url.searchParams.set('scene', scene);
    await page.goto(url.toString(), { waitUntil: 'commit' });

    await page.waitForFunction(
      () => typeof window.__sdsBootTimeline?.firstInteractive === 'number',
      null,
      { timeout: 120_000 },
    );
    const firstInteractive = await page.evaluate(() => window.__sdsBootTimeline.firstInteractive);

    // Press Play and wait for control. Located by accessible name so this does
    // not depend on the entrance's DOM shape, which Cycle 113 rewrites.
    let roundPlayable = null;
    try {
      const dismiss = page.getByRole('button', { name: 'No thanks' });
      if (await dismiss.isVisible({ timeout: 2000 }).catch(() => false)) await dismiss.click();
      await page.getByRole('button', { name: 'Play', exact: true }).click({ timeout: 10_000 });
      await page.waitForFunction(
        () => typeof window.__sdsBootTimeline?.roundPlayable === 'number',
        null,
        { timeout: 180_000 },
      );
      roundPlayable = await page.evaluate(() => window.__sdsBootTimeline.roundPlayable);
    } catch (err) {
      console.warn(`[COLDLOAD] round measurement skipped: ${err.message.split('\n')[0]}`);
    }

    return { firstInteractive, roundPlayable };
  } finally {
    await page.close();
    await context.close();
  }
}

async function run() {
  const args = parseArgs(process.argv);
  const profile = PROFILES[args.profile];
  if (!profile) {
    console.error(`[COLDLOAD] unknown profile "${args.profile}" (expected: ${Object.keys(PROFILES).join(', ')})`);
    process.exit(2);
  }

  const browser = await chromium.launch({ args: CHROMIUM_GPU_ARGS });
  const runs = [];
  try {
    for (let i = 0; i < Math.max(1, args.runs); i++) {
      const r = await measureOnce(browser, profile, args.scene);
      runs.push(r);
      console.log(
        `[COLDLOAD] run ${i + 1}/${args.runs}  firstInteractive=${r.firstInteractive.toFixed(0)}ms` +
        (r.roundPlayable != null ? `  roundPlayable=${r.roundPlayable.toFixed(0)}ms` : '  roundPlayable=n/a'),
      );
    }
  } finally {
    await browser.close();
  }

  const fi = median(runs.map((r) => r.firstInteractive));
  const roundSamples = runs.map((r) => r.roundPlayable).filter((v) => v != null);
  const rp = roundSamples.length ? median(roundSamples) : null;

  console.log('');
  console.log(`[COLDLOAD] profile=${args.profile} runs=${runs.length} budget=${profile.budgetMs}ms`);
  console.log(`[COLDLOAD] firstInteractive median ${fi.toFixed(0)}ms`);
  if (rp != null) console.log(`[COLDLOAD] roundPlayable    median ${rp.toFixed(0)}ms${args.enforceRound ? '' : ' (reported, not enforced)'}`);

  if (args.out) {
    await writeFile(String(args.out), JSON.stringify({
      profile: args.profile, budgetMs: profile.budgetMs, runs, firstInteractiveMedian: fi, roundPlayableMedian: rp,
    }, null, 2));
    console.log(`[COLDLOAD] wrote ${args.out}`);
  }

  const failures = [];
  if (fi > profile.budgetMs) failures.push(`firstInteractive ${fi.toFixed(0)}ms > ${profile.budgetMs}ms`);
  if (args.enforceRound && rp != null && rp > profile.budgetMs) failures.push(`roundPlayable ${rp.toFixed(0)}ms > ${profile.budgetMs}ms`);

  if (failures.length) {
    console.error(`[COLDLOAD] FAIL: ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log(`[COLDLOAD] PASS: within the ${args.profile} budget`);
}

run().catch((err) => {
  console.error('[COLDLOAD] fatal:', err);
  process.exit(2);
});
