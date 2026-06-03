// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { test, expect } from '@playwright/test';
import {
  bootApp,
  createRoomAsHost,
  getMpProbe,
  navigateToMultiplayer,
  seedIdentity,
  makeIdentity,
} from './_helpers';

/**
 * Cycle 24 Phase 1 — sheep-cap allow-list.
 *
 * Locks in Cycle 23 Phase E: ALLOWED_SHEEP_COUNTS extended to include 3000
 * (Insane) + 5000 (Chaos) on the worker, and the RoomCreation UI shows an
 * amber "all guests desktop" warning when the picker is set above 1000.
 *
 * Worker source: worker/src/RoomDO.ts ALLOWED_SHEEP_COUNTS Set.
 * UI source:    js/components/Multiplayer/RoomCreation.js DESKTOP_ONLY_THRESHOLD.
 */
test.describe('Cycle 24 Phase 1 — sheep cap allow-list', () => {
  // Single-tab tests still need 60-120s for asset load on swiftshader.
  test.setTimeout(180_000);

  for (const sheepCount of [3000, 5000]) {
    test(`worker accepts sheepCount=${sheepCount} (Cycle 23 Phase E extension)`, async ({ browser }) => {
      const ctx = await browser.newContext();
      await seedIdentity(ctx, makeIdentity(`host${sheepCount}`));
      const page = await ctx.newPage();
      try {
        await bootApp(page);
        await navigateToMultiplayer(page);
        await createRoomAsHost(page, { sheepCount, gameMode: 'cooperative' });

        const probe = await getMpProbe(page);
        expect(probe.sheepCount).toBe(sheepCount);
        expect(probe.roomState).toBe('waiting');
      } finally {
        await ctx.close();
      }
    });
  }

  test('amber desktop-only warning toggles with picker (>1000 only)', async ({ browser }) => {
    const ctx = await browser.newContext();
    await seedIdentity(ctx, makeIdentity('hostUi'));
    const page = await ctx.newPage();
    try {
      await bootApp(page);
      await navigateToMultiplayer(page);

      // Open Create Room form.
      await page.getByRole('button', { name: /Create Room/i }).first().dispatchEvent('click');

      // Sheep count is the 3rd <select>.
      const sheepSelect = page.locator('select').nth(2);
      await expect(sheepSelect).toBeVisible({ timeout: 10_000 });

      const warningRegex = /Mobile players will be unable to join/i;
      const warning = page.getByText(warningRegex);

      // Default 200 → no warning.
      await expect(warning).toHaveCount(0);

      // 1000 (Extreme) → still no warning (DESKTOP_ONLY_THRESHOLD is strictly >1000).
      await sheepSelect.selectOption('1000');
      await expect(warning).toHaveCount(0);

      // 3000 (Insane) → warning visible.
      await sheepSelect.selectOption('3000');
      await expect(warning).toBeVisible();

      // 5000 (Chaos) → warning still visible.
      await sheepSelect.selectOption('5000');
      await expect(warning).toBeVisible();

      // Drop back to 200 → warning hides again.
      await sheepSelect.selectOption('200');
      await expect(warning).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});
