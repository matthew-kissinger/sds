// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { expect, test } from '@playwright/test';

import { startSolo } from './helpers/entrance';

test('Home Field gameplay never mounts Survival time controls', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.addInitScript(() => {
    localStorage.setItem('sds:tutorialDone', '1');
  });

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await startSolo(page, 'Home Field', /Just Play\s+3/i);

  await expect(async () => {
    expect(await page.evaluate(() => ({
      scene: (window as any).gameInstance?.currentScene?.id ?? null,
      active: (window as any).gameInstance?.gameState?.gameActive === true,
      survival: Boolean((window as any).gameInstance?._survivalRun),
      dayLoop: Boolean((window as any).gameInstance?.dayLoop),
    }))).toEqual({
      scene: 'field',
      active: true,
      survival: false,
      dayLoop: false,
    });
  }).toPass({ timeout: 90_000 });

  await expect(page.locator('#sds-daynight-chip')).toHaveCount(0);
  await expect(page.locator('#sds-skip-dusk')).toHaveCount(0);
  await page.screenshot({ path: 'output/web-game/survival-ui-home-field/gameplay-page.png' });
});
