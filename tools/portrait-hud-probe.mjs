// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 17 Phase 4 — portrait HUD layout visual probe.
 *
 * Drives Playwright into Solo Classic on a portrait-mobile viewport,
 * then captures the FULL page (HUD overlay + canvas) so we can verify
 * the camera-mode indicator no longer overlaps MobileHUD.
 */
import { chromium, devices } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const baseUrl = process.argv[2] || 'http://localhost:3000';
const outDir = resolve(ROOT, 'tools/playtest/probe-hud');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

const VIEWPORTS = [
    { name: 'iphone-se-portrait', width: 375, height: 667 },
    { name: 'iphone-14-portrait', width: 390, height: 844 },
    { name: 'android-portrait',   width: 360, height: 780 },
    { name: 'ipad-portrait',      width: 768, height: 1024 },
];

const iphone14 = devices['iPhone 14'];

async function seedIdentity(ctx) {
    await ctx.addInitScript(() => {
        const id = {
            persistentId: 'hud_' + Date.now(),
            displayName: 'HUDProbe', fullName: 'HUDProbe#0001',
            discriminator: '0001', nameType: 'custom',
            createdAt: Date.now(), isRegistered: false,
        };
        localStorage.setItem('playerIdentity', JSON.stringify(id));
    });
}

async function startSoloClassic(page) {
    await page.getByRole('button', { name: /Solo Play/i }).dispatchEvent('click');
    await page.getByRole('button', { name: /Confirm Selection/i }).dispatchEvent('click');
    await page.getByRole('button', { name: /Classic Mode/i }).dispatchEvent('click');
}

for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: iphone14.deviceScaleFactor,
        isMobile: true,
        hasTouch: true,
        userAgent: iphone14.userAgent,
    });
    await seedIdentity(ctx);
    const page = await ctx.newPage();
    console.log(`[${vp.name}] loading`);
    await page.goto(`${baseUrl}/?scene=open-country&perfMode=1`, { waitUntil: 'domcontentloaded' });
    await startSoloClassic(page);
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 60_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: resolve(outDir, `${vp.name}.png`), fullPage: false });
    console.log(`[${vp.name}] saved screenshot`);
    await ctx.close();
}

await browser.close();
console.log('Done.');
