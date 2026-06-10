// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { test, expect } from '@playwright/test';

/**
 * Cycle 87 Phase 4: post-first-interactive foliage streaming proof.
 *
 * Two layers, split by what CI hardware can actually prove:
 *
 * - CI-safe: streaming arms on Newsheepdogland (the default entrance world),
 *   plans the full wave set, and lands at least the first wave with trees
 *   beyond the cold homestead corridor. On GitHub runners every wave pays a
 *   SwiftShader-speed compileAsync prewarm (tens of seconds each), so full
 *   completion is not provable there.
 * - @local-only (real GPU): every planned wave and the grass wave complete,
 *   streamed coverage lands island-wide, and the QualityGovernor records no
 *   quality demotion. CI invokes playwright with --grep-invert='@local-only'.
 */

function seedIdentity(id: string) {
  const identity = {
    persistentId: id,
    displayName: 'FoliageTester',
    fullName: 'FoliageTester#0001',
    discriminator: '0001',
    nameType: 'custom',
    createdAt: Date.now(),
    isRegistered: false,
  };
  localStorage.setItem('playerIdentity', JSON.stringify(identity));
}

test.describe('Newsheepdogland foliage streaming', () => {
  // Two concurrent full NSL sessions contend for the GPU and the dev server
  // and fail each other (goto timeouts, quality step-downs); run one at a time.
  test.describe.configure({ mode: 'serial' });

  test('arms streaming and lands the first wave beyond the cold corridor', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'streaming diag reads are Chromium-only');
    // Two 120s polls + SwiftShader-speed boot need more than the old 240s.
    test.setTimeout(300_000);

    await context.addInitScript(seedIdentity, 'player_e2e_foliage_arm');

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const play = page.getByRole('button', { name: 'Play', exact: true });
    await expect(play).toBeVisible({ timeout: 30_000 });
    await play.dispatchEvent('click');
    await expect(page.locator('#canvas-container canvas')).toBeAttached({ timeout: 90_000 });

    // Cycle 88 Phase 2: the impostor cold coverage scatters inside the
    // scene-load transition and its mesh build runs as a detached
    // continuation, so poll until it reports complete - on real GPUs that
    // is within the load; on SwiftShader it slots in between waves.
    await expect(async () => {
      const cold = await page.evaluate(() => (window as any).__sdsFoliageColdCoverage ?? null);
      expect(cold).not.toBeNull();
      expect(cold.error).toBeNull();
      expect(cold.aborted).toBe(false);
      expect(cold.completedAt).toBeGreaterThan(0);
      expect(cold.trees).toBeGreaterThan(500);
      expect(cold.meshes).toBeGreaterThan(0);
    }).toPass({ timeout: 120_000 });

    // Streaming arms when the scene body completes and starts on the
    // QualityGovernor warmup signal (10s fallback); waves run in idle slots.
    // CI runners take most of the window for a single wave (software-GPU
    // compileAsync), so assert progress, not completion.
    await expect(async () => {
      const diag = await page.evaluate(() => (window as any).__sdsFoliageStreaming ?? null);
      expect(diag).not.toBeNull();
      expect(diag.error).toBeNull();
      expect(diag.aborted).toBe(false);
      expect(diag.planned).toBeGreaterThan(0);
      expect(diag.wavesDone).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 120_000 });

    const result = await page.evaluate(() => {
      const w = window as any;
      const game = w.__sds?.gameInstanceRef;
      const scene = game?.currentScene;
      const coldZones = scene?.terrain?.zones ?? {};
      const coldRects = Object.entries(coldZones)
        .filter(([name]) => name !== 'playArea')
        .map(([, r]) => r as { minX: number; maxX: number; minZ: number; maxZ: number });
      const trees = game?.terrainBuilder?.treeInstances ?? [];
      const beyondCold = trees.filter((t: { x: number; z: number }) =>
        !coldRects.some((r) => t.x >= r.minX && t.x <= r.maxX && t.z >= r.minZ && t.z <= r.maxZ));
      return {
        diag: w.__sdsFoliageStreaming,
        totalTrees: trees.length,
        treesBeyondCold: beyondCold.length,
      };
    });

    expect(result.diag.totalStreamedTrees).toBeGreaterThan(0);
    expect(result.treesBeyondCold).toBeGreaterThan(0);
    expect(result.totalTrees).toBeGreaterThan(result.treesBeyondCold);
    // Cycle 88 Phase 3: landed waves reuse the cold scatter cache and retire
    // their zone's impostor instances.
    for (const wave of result.diag.perWave) {
      expect(wave.fromCache).toBe(true);
    }
  });

  test('@local-only completes all waves island-wide with no quality demotion', async ({ page, context, browserName }) => {
    // Real-GPU-only: full wave completion in bounded time plus the
    // QualityGovernor reads. On SwiftShader the governor legitimately steps
    // quality down and the waves take minutes; meaningless there.
    test.skip(browserName !== 'chromium', 'quality reads are Chromium-only');
    test.setTimeout(240_000);

    await context.addInitScript(seedIdentity, 'player_e2e_foliage_full');

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const play = page.getByRole('button', { name: 'Play', exact: true });
    await expect(play).toBeVisible({ timeout: 30_000 });
    await play.dispatchEvent('click');
    await expect(page.locator('#canvas-container canvas')).toBeAttached({ timeout: 90_000 });

    // completedAt is stamped after the final grass wave; waiting on
    // wavesDone alone races the tree-wave/grass-wave boundary.
    await expect(async () => {
      const diag = await page.evaluate(() => (window as any).__sdsFoliageStreaming ?? null);
      expect(diag).not.toBeNull();
      expect(diag.error).toBeNull();
      expect(diag.aborted).toBe(false);
      expect(diag.wavesDone).toBe(diag.planned);
      expect(diag.completedAt).toBeGreaterThan(0);
    }).toPass({ timeout: 90_000 });

    const result = await page.evaluate(() => {
      const w = window as any;
      const game = w.__sds?.gameInstanceRef;
      const scene = game?.currentScene;
      const cold = scene?.terrain?.zones ?? {};
      const coldRects = Object.entries(cold)
        .filter(([name]) => name !== 'playArea')
        .map(([, r]) => r as { minX: number; maxX: number; minZ: number; maxZ: number });
      const trees = game?.terrainBuilder?.treeInstances ?? [];
      const beyondCold = trees.filter((t: { x: number; z: number }) =>
        !coldRects.some((r) => t.x >= r.minX && t.x <= r.maxX && t.z >= r.minZ && t.z <= r.maxZ));
      return {
        diag: w.__sdsFoliageStreaming,
        coldCoverage: w.__sdsFoliageColdCoverage ?? null,
        totalTrees: trees.length,
        treesBeyondCold: beyondCold.length,
        qualityIndex: game?.qualityGovernor?.getState?.()?.qualityIndex ?? null,
      };
    });

    expect(result.diag.totalStreamedTrees).toBeGreaterThan(500);
    expect(result.treesBeyondCold).toBeGreaterThan(500);
    expect(result.totalTrees).toBeGreaterThan(result.treesBeyondCold);
    expect(result.diag.grass?.built).toBe(true);
    // Cycle 88: with every wave landed, every cold impostor instance has
    // been retired - no double representation anywhere on the island.
    expect(result.coldCoverage).not.toBeNull();
    expect(result.coldCoverage.error).toBeNull();
    expect(result.coldCoverage.completedAt).toBeGreaterThan(0);
    const retired = result.diag.perWave.reduce(
      (s: number, wave: { retiredImpostors?: number }) => s + (wave.retiredImpostors ?? 0), 0);
    expect(retired).toBe(result.coldCoverage.trees);
    // missWindows is deliberately never asserted: it is a transient
    // in-flight counter (the step-down requires 2 consecutive misses).
    expect(result.qualityIndex).toBe(0);
  });
});
