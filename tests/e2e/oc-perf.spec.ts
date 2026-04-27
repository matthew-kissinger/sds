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

const PERF_MODE_URL = '/?scene=open-country&perfMode=1';

// Headless desktop budget. Real-target gates (RTX 3070, mid-tier mobile)
// should run with their own values; this is a CI sanity check.
const BUDGETS = {
  avgFrameTime: 22,   // ms — ~45fps headroom; rendering in headless Chromium
                      // tends to land 5-8ms higher than visible mode
  p95FrameTime: 30,   // ms — tail budget
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
  // Start screen → Solo → Confirm dog → Classic Mode. dispatchEvent('click')
  // sidesteps the hover-transform stability issue documented in smoke.spec.ts.
  const soloPlay = page.getByRole('button', { name: /Solo Play/i });
  await expect(soloPlay).toBeVisible({ timeout: 30_000 });
  await soloPlay.dispatchEvent('click');

  const confirm = page.getByRole('button', { name: /Confirm Selection/i });
  await expect(confirm).toBeVisible({ timeout: 15_000 });
  await confirm.dispatchEvent('click');

  const classic = page.getByRole('button', { name: /Classic Mode/i });
  await expect(classic).toBeVisible({ timeout: 15_000 });
  await classic.dispatchEvent('click');
}

test.describe('OC frametime harness', () => {
  // Cycle 9 Phase 3: budgets are calibrated for headless Chromium on Linux
  // CI. Firefox/WebKit headless render at materially different speeds and
  // would flake the budget; gate this spec to Chromium only.
  test.skip(({ browserName }) => browserName !== 'chromium', 'frametime budget is Chromium-only');

  test('open-country averages within frame budget', async ({ page }) => {
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
