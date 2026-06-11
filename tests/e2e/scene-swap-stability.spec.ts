// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { test, expect, type Page } from '@playwright/test';

/**
 * Cycle 18 Phase 2 — scene-swap + mode-restart state hygiene gate.
 *
 * Originally guarded two regressions from the Cycle 17 deploy review:
 * scatter heightfield ref staleness + sheep respawn after mode restart.
 * Cycle 19 follow-up (2026-05-04) removed the ScatterSystem entirely
 * (pebbles + mushrooms + flowers + clovers were too small to read at
 * gameplay distance), so the scatter-heightfield half of this spec is
 * now a tautology — kept as a grass-heightfield gate (same code path,
 * different captured ref).
 *
 * Drives the swap matrix via window.__sdsSwapTo (installed in main.js
 * _installStressTestHarness) and reads __sdsSwapProbe() for the direct
 * fix-verification numbers. No DOM scraping.
 */

async function seedIdentity(page: Page) {
  await page.context().addInitScript(() => {
    const identity = {
      persistentId: 'player_swapstab_' + Date.now(),
      displayName: 'SwapStab',
      fullName: 'SwapStab#0001',
      discriminator: '0001',
      nameType: 'custom',
      createdAt: Date.now(),
      isRegistered: false,
    };
    localStorage.setItem('playerIdentity', JSON.stringify(identity));
  });
}

async function bootSolo(page: Page) {
  await seedIdentity(page);
  // Cycle 51: enter via the world-first entrance (a ?scene= deep-link bypasses
  // it). The swap harness (window.__sdsSwapTo) installs on the first scene
  // build, which now happens on Play - startSoloClassic waits for it there.
  await page.goto('/?perfMode=1', { waitUntil: 'domcontentloaded' });
  const play = page.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeVisible({ timeout: 30_000 });
}

// "Next world" clicks from the Rolling Hills landing (Cycle 89 default).
const WORLD_STEPS_FROM_DEFAULT: Record<string, number> = {
  'field': 3,
  'rolling-hills': 0,
  'open-country': 1,
};

async function startSoloClassic(page: Page, sceneId = 'field') {
  // Cycle 51 world-first entrance: arm the requested world via the switcher,
  // pick the Classic difficulty chip, then Play.
  const nextBtn = page.getByRole('button', { name: /Next world/i });
  await expect(nextBtn).toBeVisible({ timeout: 30_000 });
  const steps = WORLD_STEPS_FROM_DEFAULT[sceneId] ?? WORLD_STEPS_FROM_DEFAULT.field;
  for (let i = 0; i < steps; i++) {
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

  // Game canvas should mount. The swap harness (window.__sdsSwapTo) installs on
  // the first scene build. Generous timeout - scene init on swiftshader CI
  // clears 60-90s with the octahedral bake on top of terrain + grass + tree LOD.
  await expect(page.locator('#canvas-container canvas')).toBeAttached({ timeout: 60_000 });
  await expect(async () => {
    const ready = await page.evaluate(() => typeof (window as any).__sdsSwapTo === 'function');
    expect(ready).toBe(true);
  }).toPass({ timeout: 150_000 });
  // Wait for sheep flock to populate before reading positions.
  await expect(async () => {
    const hasSheep = await page.evaluate(() => {
      const probe = (window as any).__sdsSwapProbe?.();
      return probe?.sheep?.count > 0;
    });
    expect(hasSheep).toBe(true);
  }).toPass({ timeout: 30_000 });
}

// @local-only — full scene rebuild × 4 swaps takes ~6 min on CI's swiftshader
// (vs ~30s on real WebGL). Each swap drives disposeScene + rebuildScene +
// _buildSceneBody, including the Cycle 18 octahedral atlas bake (16 RTT
// renders × 3 species). The fix verification is purely a JS reference
// equality + an int comparison; don't gate CI on something this expensive
// when the underlying code change is small + reviewable. Run locally with
// `npm run test:e2e -- scene-swap-stability` after touching scene-swap or
// flock-recreation code.
test.describe('Cycle 18 Phase 2 — scene-swap + mode-restart hygiene @local-only', () => {
  test.setTimeout(360_000);

  test('grass heightfield ref refreshes across Field → RH → OC swap matrix @local-only', async ({ page }) => {
    await bootSolo(page);
    await startSoloClassic(page);

    // Swap matrix: Field → RH → OC → Field → RH. After every swap,
    // GrassSystem.heightfield should be the same object as app.heightfield.
    const matrix = ['rolling-hills', 'open-country', 'field', 'rolling-hills'];

    for (const target of matrix) {
      const probeBefore = await page.evaluate(async (id) => {
        await (window as any).__sdsSwapTo(id);
        return (window as any).__sdsSwapProbe();
      }, target);

      expect(probeBefore.scene, `landed on ${target}`).toBe(target);
      expect(probeBefore.hasHeightfield, `heightfield loaded for ${target}`)
        .toBe(target !== 'field');
      expect(probeBefore.grassHeightfieldMatches,
        `grass heightfield ref must match current heightfield post-swap to ${target}`).toBe(true);
    }
  });

  test('sheep respawn within scene bounds across mode + scene swaps @local-only', async ({ page }) => {
    await bootSolo(page);
    await startSoloClassic(page);

    // After Classic on Field: sheep should be in Field bounds. No swap yet.
    const fieldBaseline = await page.evaluate(() => (window as any).__sdsSwapProbe());
    expect(fieldBaseline.sheep.count).toBeGreaterThan(0);
    expect(fieldBaseline.sheep.outOfBounds, 'fresh Classic spawn should be in-bounds').toBe(0);

    // Swap to OC + restart Classic mode. Q3/Q6 fix: GameState.startGame now
    // always recreates the flock, so post-swap sheep should be at OC's ring
    // cluster spawn — not stuck at Field's prior positions.
    await page.evaluate(async () => {
      await (window as any).__sdsSwapTo('open-country');
    });

    // Restart Classic via the menu. After scene swap, the start screen is
    // back. We don't drive the full menu flow because that's exercised by
    // smoke.spec.ts; instead we verify post-swap probe directly: the
    // _buildSceneBody during rebuild creates the flock fresh at the new
    // scene's sheepSpawn, so the sheep must already be inside OC's
    // boundary even before clicking Play.
    const ocProbe = await page.evaluate(() => (window as any).__sdsSwapProbe());
    expect(ocProbe.scene).toBe('open-country');
    expect(ocProbe.sheep.count).toBeGreaterThan(0);
    // OC ring spawn is at radius 240m, all inside the 380m island radius.
    // Tolerate up to 5 sheep at the very edge from initialization noise;
    // the bug pre-fix put HUNDREDS out of bounds. A non-trivial fraction
    // would mean the flock recreation regressed.
    expect(ocProbe.sheep.outOfBounds,
      `at most a handful of OC sheep should leak past the island boundary; got ${ocProbe.sheep.outOfBounds}/${ocProbe.sheep.count}`)
      .toBeLessThanOrEqual(5);
  });

  test('open country objective event opens portal and hides roundup decal @local-only', async ({ page }) => {
    await bootSolo(page);
    await startSoloClassic(page, 'open-country');

    const initialProbe = await page.evaluate(() => (window as any).__sdsSwapProbe());
    expect(initialProbe.scene).toBe('open-country');
    expect(initialProbe.objectiveVisual?.stage).toBe('roundup');
    expect(initialProbe.objectiveVisual?.portal?.present).toBe(true);
    expect(initialProbe.objectiveVisual?.portal?.targetIntensity).toBe(0);
    expect(initialProbe.objectiveVisual?.portal?.ringInScene).toBe(true);
    expect(initialProbe.objectiveVisual?.portal?.padInScene).toBe(true);
    expect(initialProbe.objectiveVisual?.portal?.particlesInScene).toBe(true);
    expect(initialProbe.objectiveVisual?.roundupZoneDecal?.visible).toBe(true);
    expect(initialProbe.objectiveVisual?.roundupZoneDecal?.inScene).toBe(true);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('objective-stage-changed', { detail: { stage: 'drive' } }));
    });

    await expect(async () => {
      const probe = await page.evaluate(() => (window as any).__sdsSwapProbe());
      expect(probe.objectiveVisual?.portal?.targetIntensity).toBe(1);
      expect(probe.objectiveVisual?.roundupZoneDecal?.visible).toBe(false);
    }).toPass({ timeout: 5_000 });
  });
});
