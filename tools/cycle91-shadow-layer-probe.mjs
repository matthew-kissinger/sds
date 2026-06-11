// Cycle 91 Phase 2 / Q1: probe three.js #33730 on r184 in the live scene.
// The canopy-caster design wants shadow-only casters on a layer the main
// camera ignores, with shadow.camera.layers enabling it. Upstream issue
// #33730 (fixed in unpublished r185) reports instanced RECEIVERS going
// black when the shadow camera uses a non-default layer. This probe loads
// NSL with shadows live, screenshots, then injects a layer-2 instanced
// caster + enables layer 2 on the shadow camera, screenshots again, and
// reports average-luminance deltas so receiver blackout is detectable
// offline. Probe hygiene: closes everything it opens.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = resolve(ROOT, 'cycle91-validation/shadow-layer-probe');
mkdirSync(OUT_DIR, { recursive: true });

const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];
const URL = 'http://localhost:4173/?scene=newsheepdogland&mode=survival&autostart=1&perfMode=1';

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 180000 });
    // Shadows arm on the first day-loop tick; give warmup time.
    await page.waitForTimeout(12000);

    const baseline = await page.screenshot({ path: resolve(OUT_DIR, 'a-baseline.png') });

    const setup = await page.evaluate(() => {
        const M = window.__sdsWebGpuModules;
        const gi = window.gameInstance;
        const scene = gi.sceneManager.getScene();
        const sun = gi.sceneManager.webgpuSunLight;
        const dog = gi.gameState.getSheepdog()?.position;
        if (!M || !sun || !dog) return { ok: false, reason: 'missing modules/sun/dog' };
        const geo = new M.PlaneGeometry(10, 10);
        const mat = new M.MeshBasicMaterial({ color: 0x227722, side: M.DoubleSide });
        const im = new M.InstancedMesh(geo, mat, 4);
        const m4 = new M.Matrix4();
        for (let i = 0; i < 4; i++) {
            m4.makeTranslation(dog.x + (i - 1.5) * 12, 5, dog.z - 8);
            im.setMatrixAt(i, m4);
        }
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = true;
        im.receiveShadow = false;
        im.frustumCulled = false;
        im.layers.set(2); // main camera (layer 0) never renders it
        scene.add(im);
        sun.shadow.camera.layers.enable(2);
        window.__probeShadowLayer = { im, sun };
        return {
            ok: true,
            sunCasts: sun.castShadow,
            shadowCamLayersMask: sun.shadow.camera.layers.mask,
            dog: { x: +dog.x.toFixed(1), z: +dog.z.toFixed(1) },
        };
    });
    await page.waitForTimeout(2500);
    const withLayer = await page.screenshot({ path: resolve(OUT_DIR, 'b-layer-caster.png') });

    // Revert the shadow-camera layer change, keep the caster: isolates
    // whether any blackout came from the layers mask vs the mesh itself.
    await page.evaluate(() => {
        const p = window.__probeShadowLayer;
        if (p?.sun) p.sun.shadow.camera.layers.set(0);
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: resolve(OUT_DIR, 'c-layer-reverted.png') });

    // Cheap offline signal: mean byte value of each PNG (blackout collapses it).
    const mean = (buf) => {
        let s = 0;
        for (let i = 0; i < buf.length; i += 97) s += buf[i];
        return Math.round(s / Math.ceil(buf.length / 97));
    };
    const result = { setup, meanA: mean(baseline), meanB: mean(withLayer) };
    writeFileSync(resolve(OUT_DIR, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    console.log(`[SHADOW-LAYER-PROBE] wrote ${OUT_DIR} (judge receivers from the PNGs)`);
} finally {
    await page.close();
    await browser.close();
}
