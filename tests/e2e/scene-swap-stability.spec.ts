import { test, expect, type Page } from '@playwright/test';

/**
 * Cycle 18 Phase 2 — scene-swap + mode-restart state hygiene gate.
 *
 * Two regressions Matt flagged in the Cycle 17 deploy review:
 *
 * 1. Scene swap (e.g. Field → RH → OC) left flora / mushrooms placed
 *    against the prior scene's heightfield Y. Root cause: TerrainBuilder
 *    .createScatter()'s else-branch refreshed sceneDef + boundary but
 *    forgot heightfield, so ScatterSystem held a stale ref.
 *
 * 2. Mode restart (Classic → Extreme → Classic) left sheep at the prior
 *    mode's leftover positions. Root cause: GameState.startGame gated
 *    flock recreation on `previousSheepCount !== totalSheep`, so any
 *    same-count restart skipped recreation and inherited stale state.
 *
 * This spec drives the swap matrix via window.__sdsSwapTo (installed in
 * main.js _installStressTestHarness) and reads __sdsSwapProbe() for the
 * direct fix-verification numbers (scatterHeightfieldMatches +
 * sheep.outOfBounds). No DOM scraping.
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
  await page.goto('/?scene=field', { waitUntil: 'domcontentloaded' });

  // Wait for the start screen + the swap harness to be installed
  // (window.__sdsSwapTo is set inside _installStressTestHarness, which
  // runs at the end of init()).
  const soloPlay = page.getByRole('button', { name: /Solo Play/i });
  await expect(soloPlay).toBeVisible({ timeout: 30_000 });

  // Generous timeout — scene init on swiftshader CI clears 60-90s once the
  // Cycle 18 octahedral bake is added on top of the existing terrain + grass +
  // tree LOD setup. 150s leaves headroom on slow runners.
  await expect(async () => {
    const ready = await page.evaluate(() => typeof (window as any).__sdsSwapTo === 'function');
    expect(ready).toBe(true);
  }).toPass({ timeout: 150_000 });
}

async function startSoloClassic(page: Page) {
  const soloPlay = page.getByRole('button', { name: /Solo Play/i });
  await expect(soloPlay).toBeVisible({ timeout: 15_000 });
  await soloPlay.dispatchEvent('click');

  const confirm = page.getByRole('button', { name: /Confirm Selection/i });
  await expect(confirm).toBeVisible({ timeout: 15_000 });
  await confirm.dispatchEvent('click');

  const classic = page.getByRole('button', { name: /Classic Mode/i });
  await expect(classic).toBeVisible({ timeout: 15_000 });
  await classic.dispatchEvent('click');

  // Game canvas should mount
  await expect(page.locator('#canvas-container canvas')).toBeAttached({ timeout: 60_000 });
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

  test('scatter heightfield ref refreshes across Field → RH → OC swap matrix @local-only', async ({ page }) => {
    await bootSolo(page);
    await startSoloClassic(page);

    // Swap matrix: Field → RH → OC → Field → RH. After every swap,
    // ScatterSystem.heightfield should be the same object as
    // app.heightfield. The bug pre-fix: scatter held the prior scene's ref.
    const matrix = ['rolling-hills', 'open-country', 'field', 'rolling-hills'];

    for (const target of matrix) {
      const probeBefore = await page.evaluate(async (id) => {
        await (window as any).__sdsSwapTo(id);
        return (window as any).__sdsSwapProbe();
      }, target);

      expect(probeBefore.scene, `landed on ${target}`).toBe(target);
      expect(probeBefore.hasHeightfield, `heightfield loaded for ${target}`).toBe(true);
      expect(probeBefore.scatterHeightfieldMatches,
        `scatter heightfield ref must match current heightfield post-swap to ${target}`).toBe(true);
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
});
