import { test, expect, devices, type Page, type BrowserContext } from '@playwright/test';

/**
 * Cycle 17 Phase 1 — mobile asset visibility regression gate.
 *
 * Catches the "trees / rocks / flora invisible at distance on mobile classic
 * camera" regression (gallery-review 2026-05-04) that was rooted in
 * `_bakeTreeImpostor` reading a ~30x undersized cross-billboard width because
 * gltf.scene retained its native scale on root + intermediate Group nodes.
 *
 * Asserts:
 *   1. Per-tree-type cross-billboard impostor width is in a sane range
 *      (>= 0.3m). Pre-fix, all three impostor widths were ~0.01-0.02m.
 *   2. After max-zoom on mobile-emulated viewport, the renderer is drawing
 *      a non-trivial triangle count (> 200k). A near-zero count would mean
 *      the LOD2 cross-billboards are degenerate / over-culled.
 *
 * Run: npm run test:e2e -- mobile-asset-visibility
 */

const SCENES = ['field', 'rolling-hills', 'open-country'];
const VIEWPORT = { width: 390, height: 844 };

async function seedIdentity(ctx: BrowserContext) {
    await ctx.addInitScript(() => {
        const identity = {
            persistentId: 'player_visibility_' + Date.now(),
            displayName: 'VisProbe',
            fullName: 'VisProbe#0001',
            discriminator: '0001',
            nameType: 'custom',
            createdAt: Date.now(),
            isRegistered: false,
        };
        localStorage.setItem('playerIdentity', JSON.stringify(identity));
    });
}

const WORLD_NAME: Record<string, string> = {
    'field': 'Home Field',
    'rolling-hills': 'Rolling Hills',
    'open-country': 'Open Country',
};

// Cycle 51 world-first entrance: the world is armed via the prev/next switcher
// (default Rolling Hills), not a ?scene= deep-link. Cycle the Next-world chip
// until the target biome name shows; the switcher wraps, so the target is
// reached in <= N clicks regardless of the default.
async function armWorld(page: Page, sceneId: string) {
    const wanted = WORLD_NAME[sceneId];
    const nameLoc = page.getByText(wanted, { exact: true });
    const nextBtn = page.getByRole('button', { name: /Next world/i });
    await expect(nextBtn).toBeVisible({ timeout: 30_000 });
    for (let i = 0; i < SCENES.length; i++) {
        if (await nameLoc.isVisible().catch(() => false)) return;
        await nextBtn.dispatchEvent('click');
        await page.waitForTimeout(200);
    }
    await expect(nameLoc).toBeVisible({ timeout: 5_000 });
}

async function startSoloClassic(page: Page, sceneId: string) {
    await armWorld(page, sceneId);
    const classic = page.getByRole('button', { name: /Classic/i });
    await expect(classic).toBeVisible({ timeout: 30_000 });
    await classic.dispatchEvent('click');
    const play = page.getByRole('button', { name: 'Play', exact: true });
    await expect(play).toBeVisible({ timeout: 15_000 });
    await play.dispatchEvent('click');
}

// Emulate iPhone 14 at the file level — mobile UA + hasTouch + isMobile so
// the game's SceneManager.detectMobileDevice flips on, exercising the
// mobile codepath the user-reported regression hit. test.use() at file
// scope is required by Playwright (forces a new worker). Strip the
// devices descriptor's defaultBrowserType ('webkit' for iPhone) so the
// chromium project actually runs this spec.
const iphone14 = devices['iPhone 14'];
test.use({
    viewport: iphone14.viewport,
    userAgent: iphone14.userAgent,
    deviceScaleFactor: iphone14.deviceScaleFactor,
    isMobile: iphone14.isMobile,
    hasTouch: iphone14.hasTouch,
});

test.describe('mobile asset visibility', () => {
    // Chromium-only: WebKit/Firefox don't support our mobile-UA viewport
    // emulation in the same way and would chronically fail in headless CI.
    test.skip(({ browserName }) => browserName !== 'chromium', 'mobile probe is Chromium-only');

    test.beforeEach(async ({ context }) => {
        await context.addInitScript(() => {
            const identity = {
                persistentId: 'player_visibility_' + Date.now(),
                displayName: 'VisProbe',
                fullName: 'VisProbe#0001',
                discriminator: '0001',
                nameType: 'custom',
                createdAt: Date.now(),
                isRegistered: false,
            };
            localStorage.setItem('playerIdentity', JSON.stringify(identity));
        });
    });

    for (const scene of SCENES) {
        test(`${scene}: cross-billboard impostors sized + scene draws at max zoom`, async ({ page }) => {
            test.setTimeout(180_000);

            // Enter via the world-first entrance (a ?scene= deep-link would
            // bypass it). probeRender + perfMode install the probes at boot; the
            // scene builds when Play commits the armed world.
            await page.goto(`/?perfMode=1&probeRender=1`, { waitUntil: 'domcontentloaded' });
            await startSoloClassic(page, scene);

            await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 90_000 });

            // Max-zoom-out so trees > LOD1 distance fire their cross-billboard.
            await page.evaluate(() => window.__sds?.maxZoom?.());
            await page.waitForTimeout(2000);

            const data = await page.evaluate(() => ({
                impostorByType: window.__sds?.probe?.trees?.byType ?? {},
                triangles: window.__sdsRenderer?.info?.render?.triangles ?? 0,
                cameraDistance: window.__sds?.cameraController?.distance ?? 0,
            }));

            // Each tree species' cross-billboard must be sane size. Pre-fix
            // values were ~0.01-0.02m (invisible coin-sized).
            for (const [type, info] of Object.entries(data.impostorByType) as Array<[string, any]>) {
                if (info.instances === 0) continue;
                expect(info.impostorBaked, `${type}: impostor baked`).toBe(true);
                expect(info.impostorWidth, `${type}: impostor width >= 0.3m`).toBeGreaterThanOrEqual(0.3);
                expect(info.impostorBboxMaxY, `${type}: impostor bbox.maxY >= 0.3m`).toBeGreaterThanOrEqual(0.3);
            }

            // Scene must be actually drawing meaningful triangles.
            expect(data.triangles, `${scene}: triangles at zoom=${data.cameraDistance}`).toBeGreaterThan(200_000);
        });
    }
});
