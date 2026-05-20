/**
 * Cycle 38 Phase 2 — PC visual-gate captures.
 *
 * Drives Chromium against the dev server in WebGPU mode and captures the
 * six visual-gate poses listed in the cycle plan:
 *   - rolling-hills + open-country + field × {follow-close, classic-max,
 *     shoreline-glint, tree-occluded, horizon-terrain-seam}
 *
 * Writes screenshots to cycle38-validation/screenshots/<probe>/ and a
 * JSON manifest with capture metadata (camera, sun, mode, draw calls,
 * quality state, page errors) to cycle38-validation/runtime/<probe>.json.
 *
 * Run: node tools/cycle38-phase2-pc-captures.mjs [baseUrl] [probeName]
 *      defaults: http://localhost:3000, cycle38-phase2-pc-water-grid
 */
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const baseUrl = process.argv[2] || 'http://localhost:3000';
const probeName = process.argv[3] || 'cycle38-phase2-pc-water-grid';

const screenshotDir = resolve(ROOT, 'cycle38-validation', 'screenshots', probeName);
const runtimeDir = resolve(ROOT, 'cycle38-validation', 'runtime');
const runtimePath = resolve(runtimeDir, `${probeName}.json`);
mkdirSync(screenshotDir, { recursive: true });
mkdirSync(runtimeDir, { recursive: true });

const SCENES = ['rolling-hills', 'open-country', 'field'];
const POSES = ['follow-close', 'classic-max', 'shoreline-glint', 'tree-occluded', 'horizon-terrain-seam'];

const CHROMIUM_GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer']
    : ['--enable-unsafe-webgpu'];
const browser = await chromium.launch({ channel: 'chrome', args: CHROMIUM_GPU_ARGS });

async function seedIdentity(ctx) {
    await ctx.addInitScript(() => {
        const id = {
            persistentId: 'desktop_' + Date.now(),
            displayName: 'DesktopProbe',
            fullName: 'DesktopProbe#0001',
            discriminator: '0001',
            nameType: 'custom',
            createdAt: Date.now(),
            isRegistered: false,
        };
        localStorage.setItem('playerIdentity', JSON.stringify(id));
    });
}

const results = [];
for (const scene of SCENES) {
    for (const pose of POSES) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await seedIdentity(ctx);
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
        page.on('console', (m) => {
            if (m.type() === 'error' || m.type() === 'warning') {
                const t = m.text();
                if (!t.includes('Symbol(react.element)')) errors.push(`[${m.type()}] ${t}`);
            }
        });

        const url = `${baseUrl}/?renderer=webgpu&scene=${scene}&mode=classic&autostart=1&perfMode=1&probeRender=1&perfPose=${pose}&perfSystem=full`;
        const captureId = `${scene}--${pose}--full`;
        console.log(`[capture] ${captureId} → ${url}`);
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
            try {
                await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 90_000 });
            } catch (e) {
                console.log(`  ! ready timeout for ${captureId}: ${e.message}`);
            }
            await page.evaluate((poseId) => window.__perfHarness?.setCameraPose?.(poseId), pose);
            await page.waitForTimeout(2500);

            const probe = await page.evaluate(() => {
                const game = window.__sdsGame;
                return game?.getCycle38VisualProbe?.() ?? null;
            });

            const screenshotPath = resolve(screenshotDir, `${captureId}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: false });

            results.push({
                captureId,
                scene,
                pose,
                screenshotPath,
                probe,
                errors,
                ok: errors.length === 0,
            });
        } catch (e) {
            console.log(`  FAILED ${captureId}: ${e.message}`);
            results.push({ captureId, scene, pose, ok: false, error: e.message, errors });
        } finally {
            await ctx.close();
        }
    }
}

await browser.close();

const manifest = {
    ok: results.every((r) => r.ok),
    capturedAt: new Date().toISOString(),
    probeName,
    baseUrl,
    sceneCount: SCENES.length,
    poseCount: POSES.length,
    resultCount: results.length,
    failures: results.filter((r) => !r.ok).map((r) => r.captureId),
    results,
};

writeFileSync(runtimePath, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`\n[capture] wrote ${runtimePath}`);
console.log(`[capture] screenshots: ${screenshotDir}`);
console.log(`[capture] ok=${manifest.ok}, failures=${manifest.failures.length}`);
