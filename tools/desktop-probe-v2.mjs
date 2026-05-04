/**
 * Desktop probe v2 — generous timeouts, captures both renderer state +
 * full page screenshot for visual diagnosis.
 */
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const baseUrl = process.argv[2] || 'http://localhost:3000';
const outDir = resolve(ROOT, 'tools/playtest/probe-desktop');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function seedIdentity(ctx) {
    await ctx.addInitScript(() => {
        const id = {
            persistentId: 'desktop_' + Date.now(),
            displayName: 'DesktopProbe', fullName: 'DesktopProbe#0001',
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

const SCENES = ['rolling-hills', 'open-country', 'field'];
const ZOOMS = ['mid', 'max'];

for (const scene of SCENES) {
    for (const zoomMode of ZOOMS) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await seedIdentity(ctx);
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
        page.on('console', m => {
            if (m.type() === 'error' || m.type() === 'warning') {
                const t = m.text();
                if (!t.includes('Symbol(react.element)')) errors.push(`[${m.type()}] ${t}`);
            }
        });
        const url = `${baseUrl}/?scene=${scene}&perfMode=1&probeRender=1&cinematic=1`;
        console.log(`[desktop:${zoomMode}] ${scene} → loading`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await startSoloClassic(page);
        try {
            await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 90_000 });
        } catch (e) {
            console.log(`[desktop:${zoomMode}] ${scene} → ready timeout: ${e.message}`);
        }
        // Set zoom: max=150 (mobile cap), mid=85 (between min 20 and max 150)
        await page.evaluate((z) => {
            const cc = window.__sds?.cameraController;
            if (!cc) return;
            const dist = z === 'max' ? cc.maxDistance : (cc.minDistance + cc.maxDistance) / 2;
            cc.setZoom(dist);
        }, zoomMode);
        await page.waitForTimeout(2500);

        const data = await page.evaluate(() => ({
            tris: window.__sdsRenderer?.info?.render?.triangles ?? 0,
            calls: window.__sdsRenderer?.info?.render?.calls ?? 0,
            cameraDist: window.__sds?.cameraController?.distance,
            grassChunks: (() => {
                const s = window.__sds?.sceneManager?.getScene?.();
                if (!s) return 0;
                let n = 0;
                s.traverse(o => {
                    if (o.isInstancedMesh && o.geometry?.attributes?.bladeData) n++;
                });
                return n;
            })(),
        }));

        // Canvas dump (cinematic=1 keeps preserveDrawingBuffer)
        const dataUrl = await page.evaluate(() => {
            const c = document.querySelector('canvas');
            return c ? c.toDataURL('image/png') : null;
        });
        if (dataUrl?.startsWith('data:image/png;base64,')) {
            const buf = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
            writeFileSync(resolve(outDir, `${scene}-${zoomMode}.png`), buf);
        }

        console.log(`[desktop:${zoomMode}] ${scene} → ${data.tris.toLocaleString()} tris, ${data.calls} calls, ${data.grassChunks} grass chunks @ zoom=${data.cameraDist}m`);
        if (errors.length) {
            console.log(`  errors (${errors.length}): ${errors.slice(0, 3).join(' | ')}`);
        }
        await ctx.close();
    }
}

await browser.close();
console.log('Done');
