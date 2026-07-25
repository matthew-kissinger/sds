// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';
import { armWorld, pickRung, clickPlay } from './helpers/entrance';

/**
 * Smoke tests for the current Geckos-based production path.
 *
 * These are intentionally minimal - they verify the app mounts, the start
 * screen renders, and a solo classic game can be kicked off such that the
 * Three.js canvas becomes visible. The point is to give future agents a
 * reference playtest harness, not to exhaustively cover UI flows.
 *
 * Selectors rely on visible text (via i18n English strings) and DOM shape
 * because this React app uses createElement + Tailwind with no test IDs.
 */

// Console error patterns we consider fatal at initial page load.
// We ignore noisy-but-benign messages from Geckos/WebRTC when the server is
// unavailable and from the service worker (which is disabled on localhost
// anyway but can still log).
const IGNORED_CONSOLE_PATTERNS: RegExp[] = [
  /ServiceWorker/i,
  /geckos/i,
  /WebRTC/i,
  /Failed to load resource.*sw\.js/i,
  /Connection timeout/i,
  /\[NETWORK\]/i,
  /\[PLAYER\].*Server registration failed/i,
  /Mixed Content/i,
  /favicon/i,
];

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE_PATTERNS.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => {
    const text = err.message;
    if (IGNORED_CONSOLE_PATTERNS.some((re) => re.test(text))) return;
    errors.push(`pageerror: ${text}`);
  });
  return errors;
}

test.describe('SDS smoke', () => {
  test('launches and renders the entrance', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Title is set in index.html head.
    await expect(page).toHaveTitle(/Sheep Dog Sim/i);

    // The React overlay mount point exists in the HTML shell.
    await expect(page.locator('#react-overlay')).toBeAttached();

    // Cycle 51 world-first entrance: identity is deferred (no name gate), so
    // the armed-world panel is the first interactive surface. Its Play button
    // is the reliable "entrance is up" signal. Generous timeout - React loads
    // modules dynamically and the entrance can take a few seconds on cold boot.
    const play = page.getByRole('button', { name: 'Play', exact: true });
    await expect(play).toBeVisible({ timeout: 30_000 });

    // No unexpected console errors so far.
    expect(errors, `Unexpected console errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('solo classic game starts and 3D canvas renders', async ({ page, context }) => {
    test.setTimeout(180_000);
    const errors = collectConsoleErrors(page);

    // Seed localStorage with a pre-existing player identity so the
    // identity setup screen is skipped. Doing it this way avoids
    // flakiness around the network registration flow (which talks to
    // Geckos and can stall in headless Chromium with WebRTC disabled).
    await context.addInitScript(() => {
      const identity = {
        persistentId: 'player_e2e_smoke_' + Date.now(),
        displayName: 'E2ETester',
        fullName: 'E2ETester#0001',
        discriminator: '0001',
        nameType: 'custom',
        createdAt: Date.now(),
        isRegistered: false,
      };
      localStorage.setItem('playerIdentity', JSON.stringify(identity));
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Home Field is the default entrance world. Cycle 113 collapsed the rung
    // behind the one summary line, so picking Classic means opening the picker
    // first; the helper owns that and the D7 "three rungs plus More" case.
    await pickRung(page, /Classic\s+\d/i);
    await clickPlay(page);

    // The game injects a <canvas> into #canvas-container once the scene
    // is ready. Asset loading can take a while (models, textures, shaders).
    // We can't use toBeVisible here because Playwright treats the canvas
    // as covered by the #react-overlay (z-index 1000), and
    // locator.boundingBox() can also time out because of how Playwright
    // treats canvases covered by overlays. Use page.evaluate to read the
    // canvas size directly from the DOM instead.
    const canvas = page.locator('#canvas-container canvas');
    await expect(canvas).toBeAttached({ timeout: 60_000 });

    await expect(async () => {
      const dims = await page.evaluate(() => {
        const c = document.querySelector('#canvas-container canvas') as HTMLCanvasElement | null;
        if (!c) return null;
        return { width: c.width, height: c.height };
      });
      expect(dims).not.toBeNull();
      expect(dims!.width).toBeGreaterThan(100);
      expect(dims!.height).toBeGreaterThan(100);
    }).toPass({ timeout: 60_000 });

    // Brief play - confirm no critical errors during the first second.
    await page.waitForTimeout(1_000);

    expect(errors, `Unexpected console errors during gameplay: ${errors.join('\n')}`).toEqual([]);
  });

  // Rolling Hills is the default entrance world (Cycle 89); Newsheepdogland
  // must be armed via the carousel before Play. Entrance state resets to the
  // default on every menu return, so re-arm before each Play click.
  const armNewsheepdogland = async (page: Page) => {
    const next = page.getByRole('button', { name: 'Next world' });
    await expect(next).toBeVisible({ timeout: 30_000 });
    // Scope to the entrance overlay: the page's seo-content also contains a
    // "Newsheepdogland" link that an unscoped getByText would match. Substring
    // match: the armed title also carries the Experimental (WIP) pill, so an
    // exact match never fires.
    const armedTitle = page.locator('#react-overlay').getByText('Newsheepdogland');
    for (let i = 0; i < 5; i++) {
      if (await armedTitle.isVisible().catch(() => false)) break;
      await next.dispatchEvent('click');
      await page.waitForTimeout(150);
    }
    await expect(armedTitle).toBeVisible({ timeout: 5_000 });
  };

  // Skipped while Newsheepdogland is switched off pending its regression burn-down:
  // the entrance Play button is disabled (the world is "Coming soon"), so this
  // arm-via-entrance survival loop cannot start. Re-enable when the world is playable
  // again, alongside the worlds.ts `comingSoon` removal.
  test.skip('Newsheepdogland returns to menu and starts again with survival surfaces', async ({ page, context }) => {
    test.setTimeout(240_000);
    const errors = collectConsoleErrors(page);

    await context.addInitScript(() => {
      const identity = {
        persistentId: 'player_e2e_loop_' + Date.now(),
        displayName: 'LoopTester',
        fullName: 'LoopTester#0001',
        discriminator: '0001',
        nameType: 'custom',
        createdAt: Date.now(),
        isRegistered: false,
      };
      localStorage.setItem('playerIdentity', JSON.stringify(identity));
    });

    const readSurvivalState = () => page.evaluate(() => {
      const game = (window as any).__sds?.gameInstanceRef;
      return {
        scene: game?.currentScene?.id ?? null,
        active: game?.gameState?.gameActive ?? null,
        dayLoop: Boolean(game?.dayLoop),
        survivalRun: Boolean(game?._survivalRun),
        wolfPack: Boolean(game?._wolfPack),
        minimap: Boolean(document.getElementById('sds-minimap')),
      };
    });

    const expectSurvivalRunReady = async () => {
      await expect(async () => {
        expect(await readSurvivalState()).toMatchObject({
          scene: 'newsheepdogland',
          active: true,
          dayLoop: true,
          survivalRun: true,
          wolfPack: true,
          minimap: true,
        });
      }).toPass({ timeout: 90_000 });
    };

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await armNewsheepdogland(page);

    await page.getByRole('button', { name: 'Play', exact: true }).dispatchEvent('click');
    await expect(page.locator('#canvas-container canvas')).toBeAttached({ timeout: 90_000 });
    await expectSurvivalRunReady();

    await page.getByRole('button', { name: 'Pause game' }).click();
    await page.getByRole('button', { name: 'Main Menu' }).dispatchEvent('click');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(async () => {
      expect(await readSurvivalState()).toMatchObject({
        scene: 'newsheepdogland',
        active: false,
        dayLoop: false,
        survivalRun: false,
        wolfPack: false,
        minimap: false,
      });
    }).toPass({ timeout: 30_000 });

    await armNewsheepdogland(page);
    await page.getByRole('button', { name: 'Play', exact: true }).dispatchEvent('click');
    await expectSurvivalRunReady();

    expect(errors, `Unexpected console errors during Newsheepdogland loop: ${errors.join('\n')}`).toEqual([]);
  });
});
