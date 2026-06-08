// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 81 Phase 5 - real-device mobile check on the connected Galaxy Tab S9 FE
// (SM-X518U, Mali-G68), driven over CDP (adb forward tcp:9222). Validates:
//   1. The tablet's WebGPU support (navigator.gpu) - if absent, mobile is WebGL anyway.
//   2. newsheepdogland on the MOBILE DEFAULT path loads on WebGL byte-identical and
//      renders crash-clean (the shipped mobile behavior after the tier-gate).
//   3. Characterizes whether the tablet can run the game on WebGPU at all using a
//      NON-pinned scene (so the tier-gate doesn't force WebGL) - informs the
//      keep-the-mobile-pin decision without bypassing production code.
// Needs: vite on :3000 + `adb reverse tcp:3000 tcp:3000` + `adb forward tcp:9222 localabstract:chrome_devtools_remote`.
// Usage: node tools/tablet-mobile-check-cycle81.mjs

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'cycle81-validation');

async function loadAndProbe(page, url, tag, { settleMs = 12000 } = {}) {
    const errors = [];
    const onConsole = (m) => { const t = m.text(); if (/error|destroyed|NodeBuilder|lost|crash/i.test(t)) errors.push(`[${m.type()}] ${t.slice(0, 200)}`); };
    const onPageErr = (e) => errors.push(`[pageerror] ${String(e?.message || e).slice(0, 200)}`);
    page.on('console', onConsole);
    page.on('pageerror', onPageErr);
    const out = { tag, url };
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForFunction(() => !!window.gameInstance, null, { timeout: 90_000 }).catch(() => {});
        await page.waitForFunction(() => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true, null, { timeout: 90_000 }).catch(() => {});
        await page.waitForTimeout(settleMs);
        out.state = await page.evaluate(() => {
            const gi = window.gameInstance;
            const tb = gi?.terrainBuilder ?? null;
            const scene = gi?.sceneManager?.getScene?.();
            let inst = 0, indirect = 0;
            scene?.traverse((o) => { if (o?.isInstancedMesh) { inst++; if (o.geometry?.indirect) indirect++; } });
            return {
                effective: window.__sdsRendererMode?.effective ?? null,
                requested: window.__sdsRendererMode?.requested ?? null,
                fallbackReason: window.__sdsRendererMode?.fallbackReason ?? null,
                webgpuApiAvailable: window.__sdsRendererMode?.webgpuApiAvailable ?? null,
                isMobile: tb?.isMobile ?? null,
                scene: gi?.currentScene?.id ?? null,
                instMeshes: inst,
                indirectMeshes: indirect,
                rendererReady: gi?.sceneManager?.getRenderStatus?.()?.rendererReady ?? null,
            };
        }).catch((e) => ({ evalError: String(e?.message || e) }));
        // crude fps sample
        out.fps = await page.evaluate(() => new Promise((res) => {
            let f = 0; const t0 = performance.now();
            const tick = () => { f++; if (performance.now() - t0 >= 1500) res(Math.round(f / ((performance.now() - t0) / 1000))); else requestAnimationFrame(tick); };
            requestAnimationFrame(tick);
        })).catch(() => null);
        try {
            const buf = await page.screenshot({ timeout: 20_000 });
            await mkdir(OUT_DIR, { recursive: true });
            await writeFile(resolve(OUT_DIR, `tablet-${tag}.png`), buf);
            out.screenshot = `tablet-${tag}.png`;
        } catch (e) { out.screenshot = `failed: ${String(e?.message || e).slice(0, 80)}`; }
    } catch (e) {
        out.fatal = String(e?.message || e);
    } finally {
        page.off('console', onConsole);
        page.off('pageerror', onPageErr);
    }
    out.errors = errors.slice(0, 8);
    out.errorCount = errors.length;
    return out;
}

async function run() {
    const result = { device: 'SM-X518U Galaxy Tab S9 FE (Mali-G68)', startedAt: new Date().toISOString() };
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const ctx = browser.contexts()[0] ?? await browser.newContext();
    const page = ctx.pages()[0] ?? await ctx.newPage();
    try {
        result.webgpu = await page.evaluate(async () => {
            const out = { hasNavigatorGpu: !!navigator.gpu };
            if (navigator.gpu) {
                try { const a = await navigator.gpu.requestAdapter(); out.adapter = !!a; out.adapterInfo = a?.info ? { ...a.info } : null; }
                catch (e) { out.adapterError = String(e?.message || e); }
            }
            return out;
        }).catch((e) => ({ evalError: String(e?.message || e) }));
        // 1. Mobile default path -> the shipped behavior (expect WebGL via the pin).
        result.mobileDefault = await loadAndProbe(page, 'http://localhost:3000/?scene=newsheepdogland', 'nsl-mobile-default');
        // 2. Characterize WebGPU on the tablet with a NON-pinned scene (tier-gate
        //    won't force WebGL there), so we learn if the tablet does WebGPU at all.
        if (result.webgpu?.hasNavigatorGpu) {
            result.webgpuCharacterize = await loadAndProbe(page, 'http://localhost:3000/?renderer=webgpu&scene=rolling-hills', 'rh-webgpu', { settleMs: 15000 });
        }
    } catch (e) {
        result.fatal = String(e?.stack || e?.message || e);
    } finally {
        await browser.close().catch(() => {});
        result.endedAt = new Date().toISOString();
    }
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(resolve(OUT_DIR, 'tablet-mobile-check.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
}
run().catch((e) => { console.error('[C81-TABLET] fatal', e); process.exit(1); });
