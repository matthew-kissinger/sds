// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { test, expect } from '@playwright/test';

/**
 * Cycle 87 Phase 6: overlay collision probe at a phone viewport (390x844).
 *
 * Forces the worst entrance pileup on screen at once - the renderer-fallback
 * notice plus a persistent sample toast (via the `?uiprobe=1` hook through the
 * real hub) - and asserts no two overlay bounding boxes intersect and
 * everything stays inside the viewport. Before Cycle 87 these each picked their
 * own top-center anchor and stacked on top of each other.
 *
 * Cycle 113 Phase 4 (D4) took the tutorial offer card out of this pileup: the
 * tutorial moved inside the first round, so there is no longer a card on the
 * entrance to collide with. The rail still carries two rows here, which is what
 * this probe is actually about.
 */

type Box = { x: number; y: number; width: number; height: number };

const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe('overlay collisions (mobile viewport)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('simultaneous entrance notices stack without overlap', async ({ page, context }) => {
    test.setTimeout(120_000);

    await context.addInitScript(() => {
      const identity = {
        persistentId: 'player_e2e_overlay_' + Date.now(),
        displayName: 'OverlayTester',
        fullName: 'OverlayTester#0001',
        discriminator: '0001',
        nameType: 'custom',
        createdAt: Date.now(),
        isRegistered: false,
      };
      localStorage.setItem('playerIdentity', JSON.stringify(identity));
      sessionStorage.removeItem('sds:rendererFallbackNoticed');
    });

    // renderer=webgl + fallbackReason forces the real fallback-notice path;
    // uiprobe holds a persistent sample toast in the rail alongside it.
    await page.goto('/?renderer=webgl&fallbackReason=webgpu-unavailable&uiprobe=1', {
      waitUntil: 'domcontentloaded',
    });

    // The probe toast is persistent; the fallback notice rides the same rail.
    await expect(page.getByTestId('uiprobe-toast')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#sds-overlay-top-rail > *')).toHaveCount(2, { timeout: 30_000 });

    const boxes = await page.evaluate(() => {
      const out: Record<string, { x: number; y: number; width: number; height: number }> = {};
      const add = (name: string, el: Element | null) => {
        if (!el) return;
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out[name] = { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      // Every row in the shared rail.
      const rail = document.getElementById('sds-overlay-top-rail');
      if (rail) {
        [...rail.children].forEach((row, i) => add(`rail-row-${i}`, row));
      }
      // The Play button must stay reachable below the rail.
      const play = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Play');
      add('play-button', play ?? null);
      return out;
    });

    const names = Object.keys(boxes);
    expect(names.filter((n) => n.startsWith('rail-row-')).length).toBeGreaterThanOrEqual(2);

    // Pairwise: no two overlay boxes intersect.
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = boxes[names[i]];
        const b = boxes[names[j]];
        expect(
          intersects(a, b),
          `${names[i]} ${JSON.stringify(a)} overlaps ${names[j]} ${JSON.stringify(b)}`,
        ).toBe(false);
      }
    }

    // Everything within the viewport.
    for (const name of names) {
      const r = boxes[name];
      expect(r.x, `${name} left edge`).toBeGreaterThanOrEqual(0);
      expect(r.y, `${name} top edge`).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width, `${name} right edge`).toBeLessThanOrEqual(390 + 1);
      expect(r.y + r.height, `${name} bottom edge`).toBeLessThanOrEqual(844 + 1);
    }
  });
});
