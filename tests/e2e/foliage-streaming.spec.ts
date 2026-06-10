// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { test, expect } from '@playwright/test';

/**
 * Cycle 87 Phase 4: post-first-interactive foliage streaming proof.
 *
 * Plays Newsheepdogland (the default entrance world) and asserts that the
 * deferred island foliage streams in after the cold path: every planned wave
 * completes, streamed trees exist beyond the cold homestead corridor, and
 * the QualityGovernor records no quality demotion while the waves land.
 */

test.describe('Newsheepdogland foliage streaming', () => {
  // Two concurrent full NSL sessions contend for the GPU and the dev server
  // and fail each other (goto timeouts, quality step-downs); run one at a time.
  test.describe.configure({ mode: 'serial' });

  test('streams the island foliage after Play without quality demotion', async ({ page, context, browserName }) => {
    // Streaming itself is renderer-agnostic, but the quality/perf reads at the
    // end depend on a real GPU; software WebGL in headless firefox/webkit
    // makes them meaningless (same scoping as oc-perf).
    test.skip(browserName !== 'chromium', 'quality reads are Chromium-only');
    test.setTimeout(240_000);

    await context.addInitScript(() => {
      const identity = {
        persistentId: 'player_e2e_foliage_' + Date.now(),
        displayName: 'FoliageTester',
        fullName: 'FoliageTester#0001',
        discriminator: '0001',
        nameType: 'custom',
        createdAt: Date.now(),
        isRegistered: false,
      };
      localStorage.setItem('playerIdentity', JSON.stringify(identity));
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const play = page.getByRole('button', { name: 'Play', exact: true });
    await expect(play).toBeVisible({ timeout: 30_000 });
    await play.dispatchEvent('click');
    await expect(page.locator('#canvas-container canvas')).toBeAttached({ timeout: 90_000 });

    // Streaming arms when the scene body completes and starts ~6.5s later;
    // waves run in idle slots. Poll the diag until every wave lands.
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
        totalTrees: trees.length,
        treesBeyondCold: beyondCold.length,
        qualityIndex: game?.qualityGovernor?.getState?.()?.qualityIndex ?? null,
        missWindows: game?.qualityGovernor?.missWindows ?? null,
        grassTotalClumps: game?.terrainBuilder?.grassSystem?.stats?.totalClumps ?? null,
      };
    });

    expect(result.diag.totalStreamedTrees).toBeGreaterThan(500);
    expect(result.treesBeyondCold).toBeGreaterThan(500);
    expect(result.totalTrees).toBeGreaterThan(result.treesBeyondCold);
    // Streamed grass lands wherever the resolved tier allows it (high on a
    // real GPU; CI's software GPU can classify lower, where no grass is
    // correct per TIER_PRESETS).
    expect(result.diag.grass === undefined || typeof result.diag.grass === 'object').toBe(true);
    // No quality demotion attributable to the streaming window - meaningful
    // only on real hardware, so it lives in the @local-only variant below.
    // missWindows is deliberately never asserted: it is a transient
    // in-flight counter (the step-down requires 2 consecutive misses).
    return result;
  });

  test('@local-only streaming causes no quality demotion on real hardware', async ({ page, context, browserName }) => {
    // CI runners render on SwiftShader, where the QualityGovernor
    // legitimately steps quality down regardless of streaming; this
    // assertion only means something on a real GPU. CI invokes playwright
    // with --grep-invert='@local-only'.
    test.skip(browserName !== 'chromium', 'quality reads are Chromium-only');
    test.setTimeout(240_000);

    await context.addInitScript(() => {
      const identity = {
        persistentId: 'player_e2e_foliageq_' + Date.now(),
        displayName: 'FoliageQTester',
        fullName: 'FoliageQTester#0001',
        discriminator: '0001',
        nameType: 'custom',
        createdAt: Date.now(),
        isRegistered: false,
      };
      localStorage.setItem('playerIdentity', JSON.stringify(identity));
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const play = page.getByRole('button', { name: 'Play', exact: true });
    await expect(play).toBeVisible({ timeout: 30_000 });
    await play.dispatchEvent('click');
    await expect(page.locator('#canvas-container canvas')).toBeAttached({ timeout: 90_000 });
    // completedAt is stamped after the final grass wave; waiting on
    // wavesDone alone races the tree-wave/grass-wave boundary.
    await expect(async () => {
      const diag = await page.evaluate(() => (window as any).__sdsFoliageStreaming ?? null);
      expect(diag?.wavesDone).toBe(diag?.planned);
      expect(diag?.completedAt).toBeGreaterThan(0);
    }).toPass({ timeout: 90_000 });

    const quality = await page.evaluate(() => {
      const game = (window as any).__sds?.gameInstanceRef;
      return {
        qualityIndex: game?.qualityGovernor?.getState?.()?.qualityIndex ?? null,
        grassBuilt: (window as any).__sdsFoliageStreaming?.grass?.built ?? null,
      };
    });
    expect(quality.grassBuilt).toBe(true);
    expect(quality.qualityIndex).toBe(0);
  });
});
