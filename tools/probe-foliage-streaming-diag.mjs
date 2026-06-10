// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Probe: play Newsheepdogland against a local dev server, wait for foliage
// streaming to complete, and dump window.__sdsFoliageStreaming (per-wave
// scatter/build timings) as JSON. Feeds the impostor-first cold-path spike.
//
// Expects a dev server already listening on http://localhost:3000
// (start with: SDS_SUPPRESS_BROWSER_OPEN=1 npm run dev:client).
//
// Run: node tools/probe-foliage-streaming-diag.mjs

import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const context = await browser.newContext();
await context.addInitScript(() => {
    localStorage.setItem('playerIdentity', JSON.stringify({
        persistentId: 'player_probe_foliage_diag',
        displayName: 'DiagProbe',
        fullName: 'DiagProbe#0001',
        discriminator: '0001',
        nameType: 'custom',
        createdAt: Date.now(),
        isRegistered: false,
    }));
});
const page = await context.newPage();

try {
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const play = page.getByRole('button', { name: 'Play', exact: true });
    await play.waitFor({ state: 'visible', timeout: 30_000 });
    await play.dispatchEvent('click');
    await page.locator('#canvas-container canvas').waitFor({ state: 'attached', timeout: 90_000 });

    const deadline = Date.now() + 120_000;
    let diag = null;
    while (Date.now() < deadline) {
        diag = await page.evaluate(() => window.__sdsFoliageStreaming ?? null);
        if (diag?.completedAt > 0 || diag?.error || diag?.aborted) break;
        await new Promise((r) => setTimeout(r, 1000));
    }
    console.log(JSON.stringify(diag, null, 2));
} finally {
    await context.close();
    await browser.close();
}
