// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 82 — validate the grass distance-fade fix on the SHIPPED render path.
// NO __SDS_GRASS_CHUNK flag, so newsheepdogland uses its real compute-cull path
// (8 InstancedMeshes) and rolling-hills its per-chunk path. With the konveyor blade
// material now using positionView/positionWorld instead of the fragment-collapsing
// bladeWorld, grass must render at the ~1.2km-from-origin play area. Captures, per
// scene: the real gameplay close-up + a grass-only isolation (non-grass hidden, sky
// kept), plus wiring (compute-cull controller present, mesh count).
//
// Needs the dev server: SDS_SUPPRESS_BROWSER_OPEN=1 npx vite --port 3000
// Usage: node tools/grass-fix-validate-cycle82.mjs

import { chromium } from 'playwright';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'cycle82-validation');
const GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox']
    : [];
const BASE = 'http://localhost:3000/?renderer=webgpu';

async function boot(page) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => !!window.gameInstance, null, { timeout: 60_000 });
    await page.waitForFunction(() => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true, null, { timeout: 60_000 }).catch(() => {});
}

async function shoot(page, name) {
    const client = await page.context().newCDPSession(page);
    const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(resolve(OUT_DIR, name), Buffer.from(data, 'base64'));
}

async function startSolo(page, sceneId, px, pz) {
    await page.evaluate((sid) => window.gameInstance.swapScene(sid).catch(() => {}), sceneId);
    await page.waitForFunction((sid) => window.gameInstance?.currentScene?.id === sid, sceneId, { timeout: 120_000 }).catch(() => {});
    await page.waitForFunction(() => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true, null, { timeout: 60_000 }).catch(() => {});
    await page.evaluate(() => { window.gameInstance.menuController.selectSolo('jep', 'classic'); });
    await page.waitForFunction(() => !!window.gameInstance?.sheepdog, null, { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.evaluate(({ x, z }) => {
        const gi = window.gameInstance;
        if (gi.sheepdog?.position) { gi.sheepdog.position.x = x; gi.sheepdog.position.z = z; }
        gi.cameraController?.setZoom?.(14);
    }, { x: px, z: pz });
    await page.waitForTimeout(4000);
    return page.evaluate(() => {
        const gi = window.gameInstance;
        const gs = gi?.terrainBuilder?.grassSystem;
        let instMeshes = 0;
        (gi.scene ?? gi.sceneManager?.getScene?.())?.traverse((o) => { if (o.isInstancedMesh) instMeshes++; });
        return {
            sceneId: gi?.currentScene?.id,
            grassControllerPresent: !!gs?._computeCullController,
            grassChunks: gs?.chunks?.size ?? 0,
            instMeshes,
        };
    });
}

async function isolate(page) {
    return page.evaluate(() => {
        const gi = window.gameInstance;
        const scene = gi.scene ?? gi.sceneManager?.getScene?.();
        let hidden = 0, grass = 0;
        scene.traverse((o) => {
            if (!o.isMesh && !o.isInstancedMesh) return;
            const mat = Array.isArray(o.material) ? o.material[0] : o.material;
            if ((mat?.name || '') === 'konveyor-node-grass-blade') { if (o.visible) grass++; }
            else if (o.visible) { o.visible = false; hidden++; }
        });
        return { hidden, grass };
    });
}

async function run() {
    const profile = resolve(tmpdir(), 'sds-c82-grass-validate');
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    const ctx = await chromium.launchPersistentContext(profile, {
        channel: 'chrome', args: GPU_ARGS, viewport: { width: 1600, height: 900 }, hasTouch: false, isMobile: false,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e?.message || e).slice(0, 200)));
    const result = {};
    try {
        await boot(page);
        // newsheepdogland — the SHIPPED compute-cull path
        result.newsheepdogland = await startSolo(page, 'newsheepdogland', 400, -1150);
        await shoot(page, 'fix-newsheepdogland-closeup.png');
        result.newsheepdogland.isolate = await isolate(page);
        await page.waitForTimeout(600);
        await shoot(page, 'fix-newsheepdogland-isolate.png');

        // rolling-hills — control; the fix adds the intended camera-distance fade,
        // so confirm near grass stays solid (no regression on near-origin scenes).
        result.rollinghills = await startSolo(page, 'rolling-hills', 0, -30);
        await shoot(page, 'fix-rollinghills-closeup.png');
        result.rollinghills.isolate = await isolate(page);
        await page.waitForTimeout(600);
        await shoot(page, 'fix-rollinghills-isolate.png');
    } catch (e) {
        result.fatal = String(e?.stack || e?.message || e).slice(0, 500);
    } finally {
        await page.close().catch(() => {});
        await ctx.close().catch(() => {});
    }
    result.errors = errors.slice(0, 10);
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(resolve(OUT_DIR, 'grass-fix-validate.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    console.log('\nWrote', resolve(OUT_DIR, 'grass-fix-validate.json'));
}
run().catch((e) => { console.error('[C82-VALIDATE] fatal', e); process.exit(1); });
