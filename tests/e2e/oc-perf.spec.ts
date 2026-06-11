// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { test, expect, type Page } from '@playwright/test';

/**
 * OC frametime harness — Cycle 8 Phase C.
 *
 * Boots the game directly into Open Country with `?scene=open-country&perfMode=1`,
 * waits for the perf hook to signal ready, samples frametime for 8 seconds,
 * and asserts the average stays under a desktop budget. Acts as a regression
 * gate for the OC-specific changes shipped in Cycles 6/7 (FAR_LOD_DIST=400,
 * grass densityRange=0.92, tree obstacle queries, mesh tree extension to shore).
 *
 * To run locally:
 *   npm run test:e2e -- oc-perf
 *
 * Numbers below are headless-Chromium baselines on the dev workstation.
 * Adjust as needed once the harness has run on real target hardware.
 */

// Cycle 51: enter via the world-first entrance (a ?scene= deep-link would
// bypass it) and arm Open Country there. perfMode installs __perfHarness at boot.
const PERF_MODE_URL = '/?perfMode=1';

// Headless desktop budget. Real-target gates (RTX 3070, mid-tier mobile)
// should run with their own values; this is a CI sanity check.
const BUDGETS = {
  avgFrameTime: 22,   // ms — ~45fps headroom; rendering in headless Chromium
                      // tends to land 5-8ms higher than visible mode
  p95FrameTime: 30,   // ms — tail budget
};

// "Next world" clicks from the Rolling Hills landing (Cycle 89 default).
const WORLD_STEPS_FROM_DEFAULT: Record<string, number> = {
  'open-country': 1,
};

async function seedIdentity(page: Page) {
  await page.context().addInitScript(() => {
    const identity = {
      persistentId: 'player_perf_' + Date.now(),
      displayName: 'PerfHarness',
      fullName: 'PerfHarness#0001',
      discriminator: '0001',
      nameType: 'custom',
      createdAt: Date.now(),
      isRegistered: false,
    };
    localStorage.setItem('playerIdentity', JSON.stringify(identity));
  });
}

async function startSoloClassic(page: Page) {
  // Cycle 51 world-first entrance: arm Open Country via the prev/next switcher,
  // pick the Classic difficulty chip, then Play. dispatchEvent('click')
  // sidesteps the hover-transform stability issue documented in smoke.spec.ts.
  const nextBtn = page.getByRole('button', { name: /Next world/i });
  await expect(nextBtn).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < WORLD_STEPS_FROM_DEFAULT['open-country']; i++) {
    await nextBtn.dispatchEvent('click');
    await page.waitForTimeout(200);
  }

  // Cycle 59: match the Classic rung by "Classic <count>" so the mode-family
  // chip (Solo / Counting Sheep) never collides with this difficulty selector.
  const classic = page.getByRole('button', { name: /Classic\s+\d/i });
  await expect(classic).toBeVisible({ timeout: 15_000 });
  await classic.dispatchEvent('click');

  const play = page.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeVisible({ timeout: 15_000 });
  await play.dispatchEvent('click');
}

test.describe('OC frametime harness', () => {
  // Cycle 9 Phase 3: this is a dev-workstation benchmark, not a CI gate.
  // Numbers were calibrated against hardware-accelerated Chromium on the
  // RTX 3070 dev box; GH Actions ubuntu-latest runners use swiftshader
  // software GL which is materially slower and would chronically miss the
  // 22ms / 30ms budget. The spec is tagged @local-only so the CI workflow
  // can grep-invert it. Run locally with `npm run test:e2e -- oc-perf`.
  // Firefox/WebKit also can't hit the budget on a Linux runner because
  // they have no software WebGL fallback — the test would fail to even
  // create a context. Keep this Chromium-only.
  test.skip(({ browserName }) => browserName !== 'chromium', 'frametime budget is Chromium-only');

  test('open-country averages within frame budget @local-only', async ({ page }) => {
    test.setTimeout(180_000);

    await seedIdentity(page);
    await page.goto(PERF_MODE_URL, { waitUntil: 'domcontentloaded' });
    await startSoloClassic(page);

    // Wait for canvas + game-ready signal from __perfHarness. The hook is
    // installed during init, but sheep don't populate until the scene
    // assets finish loading — the isReady() check covers both.
    await expect(async () => {
      const ready = await page.evaluate(() => Boolean((window as any).__perfHarness?.isReady?.()));
      expect(ready).toBe(true);
    }).toPass({ timeout: 90_000 });

    // Warm up briefly to let GC, shader compilation, and grass culling settle.
    await page.waitForTimeout(2_000);

    // Kick off the 8-second sampling window and wait the same duration.
    const duration = await page.evaluate(() => (window as any).__perfHarness.startSampling(8000));
    await page.waitForTimeout(Number(duration) + 500);

    const summary = await page.evaluate(() => (window as any).__perfHarness.getSummary());
    expect(summary, 'perf harness produced no samples').not.toBeNull();
    console.log('[PERF] OC summary:', JSON.stringify(summary, null, 2));

    expect(
      summary.avgFrameTime,
      `avg frametime ${summary.avgFrameTime.toFixed(2)}ms exceeded ${BUDGETS.avgFrameTime}ms budget`
    ).toBeLessThan(BUDGETS.avgFrameTime);
    expect(
      summary.p95FrameTime,
      `p95 frametime ${summary.p95FrameTime.toFixed(2)}ms exceeded ${BUDGETS.p95FrameTime}ms budget`
    ).toBeLessThan(BUDGETS.p95FrameTime);
  });
});
