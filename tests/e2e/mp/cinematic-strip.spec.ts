// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { test, expect } from '@playwright/test';

/**
 * Cycle 24 Phase 1 — cinematic-flag strip on invite-hash URL.
 *
 * Cycle 23 Phase E added an IIFE in js/main.js (`stripCinematicOnInvite`)
 * that runs synchronously at module-top: if location.hash starts with '#/r/'
 * AND the search has `?cinematic=1`, the cinematic param is stripped before
 * SceneManager constructs (which reads the flag synchronously and would
 * otherwise flip `preserveDrawingBuffer: true` on the renderer for normal-
 * play sessions — a documented Hard Stop).
 *
 * Acceptance: with `?cinematic=1#/r/ABCDEF`, no __sdsCinema global is ever
 * installed, and the IIFE's console log fires.
 */
test.describe('Cycle 24 Phase 1 — cinematic-flag invite strip', () => {
  test('?cinematic=1 + #/r/CODE → cinematic stripped, __sdsCinema never installed', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));

    await page.goto('/?cinematic=1#/r/ABCDEF', { waitUntil: 'domcontentloaded' });

    // The IIFE runs synchronously at main.js module-top, so by the time
    // domcontentloaded fires, the strip has already happened. Wait briefly
    // for the page to settle (React hydration etc).
    await page.waitForLoadState('load');

    // The IIFE should have logged its strip notice.
    await expect.poll(
      () => consoleLogs.some((l) => /Stripped \?cinematic=1/i.test(l)),
      { timeout: 10_000, message: 'expected [CINEMA] Stripped log from main.js IIFE' },
    ).toBe(true);

    // __sdsCinema is gated on `isCinematicMode()` which reads the search
    // string AFTER the IIFE strip. With cinematic stripped, the gate is
    // false and the cinematic API never gets installed.
    const cinemaInstalled = await page.evaluate(() => !!(window as any).__sdsCinema);
    expect(cinemaInstalled).toBe(false);
  });

  test('?cinematic=1 alone (no invite hash) → IIFE does not strip', async ({ page }) => {
    // Sanity: the strip must ONLY trigger on invite-hash URLs. Power users
    // hitting `?cinematic=1` directly (cinema runner, OG-card capture, /tools)
    // need the flag to survive. This test asserts negative: the IIFE log
    // does NOT fire and the search string still has cinematic=1.
    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));

    await page.goto('/?cinematic=1', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load');
    // Give the synchronous IIFE a beat to log if it were going to.
    await page.waitForTimeout(300);

    expect(
      consoleLogs.some((l) => /Stripped \?cinematic=1/i.test(l)),
      'IIFE should not strip when no invite hash present',
    ).toBe(false);
    expect(await page.evaluate(() => location.search)).toContain('cinematic=1');
  });
});
