// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Tiny diagnostic probe — load a scene, capture whatever's there after
 * 30s, dump the global state. Used to triage why __sdsCinema isn't
 * coming up in playtest-screenshots.mjs.
 */
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const baseUrl = process.argv[2] || 'http://localhost:4173';
const scene = process.argv[3] || 'field';

const outDir = resolve(ROOT, 'tools/playtest/probe');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
        errors.push(`[${msg.type()}] ${msg.text()}`);
    }
});
page.on('requestfailed', req => {
    errors.push(`[netfail] ${req.method()} ${req.url()} :: ${req.failure()?.errorText || ''}`);
});

const url = `${baseUrl}/?scene=${scene}&ui=off&cinematic=1`;
console.log(`Loading ${url}`);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('domcontentloaded — sleeping 45s while init runs...');
await page.waitForTimeout(45000);

const state = await page.evaluate(() => ({
    cinema: typeof window.__sdsCinema,
    sds: typeof window.__sds,
    sdsKeys: Object.keys(window).filter(k => k.startsWith('__sds')),
    canvas: !!document.querySelector('canvas'),
    canvasSize: (() => {
        const c = document.querySelector('canvas');
        return c ? { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight } : null;
    })(),
    body: document.body.innerHTML.slice(0, 500),
    title: document.title
}));

console.log('STATE:', JSON.stringify(state, null, 2));
console.log(`\nERRORS (${errors.length}):`);
for (const e of errors.slice(0, 30)) console.log(' ', e);

// Bypass page.screenshot (flaky w/ continuous WebGL animation) — grab
// canvas pixels via toDataURL + write the base64 to disk in Node.
try {
    const dataUrl = await page.evaluate(async () => {
        const c = document.querySelector('canvas');
        if (!c) return null;
        // preserveDrawingBuffer is true in cinematic=1 mode, so the
        // canvas pixels are still around after the most recent draw.
        return c.toDataURL('image/png');
    });
    if (dataUrl?.startsWith('data:image/png;base64,')) {
        const buf = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
        const { writeFile } = await import('node:fs/promises');
        await writeFile(resolve(outDir, `${scene}.png`), buf);
        console.log(`Canvas dump: tools/playtest/probe/${scene}.png (${buf.length} bytes)`);
    } else {
        console.log('Canvas toDataURL returned no data');
    }
} catch (e) {
    console.log(`Screenshot failed: ${e.message}`);
}

await browser.close();
