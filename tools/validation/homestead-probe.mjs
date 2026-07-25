// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 116 - the look-at-it probe.
 *
 * Cycles 114 (grounding) and 115 (fence and homestead) shipped every visual
 * acceptance line verified by unit test, analytic bound, or reading the shader.
 * Nobody looked. This captures the specific things those two cycles changed, at
 * framings close enough to judge them, on the production WebGPU path.
 *
 * The standing golden matrix (tools/validation/screenshot-golden.mjs) is a
 * classic-camera zoom-60 overview per scene. At that distance a leaning fence
 * post is two pixels and a grass exclusion band is a colour. So this probe poses
 * the camera by hand at each subject instead.
 *
 * Usage:
 *   node tools/validation/homestead-probe.mjs                # all shots
 *   node tools/validation/homestead-probe.mjs --only=pen,lamp
 *   node tools/validation/homestead-probe.mjs --out=<dir>
 *
 * Time of day: setSun(t) drives Atmosphere.setTimeOfDay. Measured on Home Field,
 * t=0.5 is noon (fog #5f8ac9), t=0.7-0.75 is golden/dusk (#8e7360 / #856858), and
 * t>=0.8 is night (fog goes near-black). The standing golden matrix captures at
 * t=0.85, which is night - it never showed because those cells look straight down.
 *
 * Requires a dev server on :3000 and installed Chrome (headed) for real WebGPU,
 * the same constraint screenshot-golden.mjs documents: headless bundled
 * Chromium has no navigator.gpu and silently demotes to WebGL.
 */

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const BASE_URL = 'http://localhost:3000/';
const VIEWPORT = { width: 1280, height: 720 };
const WEBGPU_LAUNCH_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];

/**
 * Home Field geometry, from shared/scenes/field.js:
 *   bounds   x,z in [-100, 100]      gate { x: 0, z: 100 }, width 8
 *   pasture  x [-30, 30], z [102, 130]   (the pen rect the scene declares)
 *   farmHouse position { x: 180, z: 160 }
 *
 * Note the two-metre offset Cycle 114 P7 fixed: the pen fence stands at
 * z [100, 128], anchored on bounds.maxZ, not at the pasture rect's z [102, 130].
 * Shots below frame the fence, so they use 100/128.
 */
const SHOTS = [
    {
        id: '01-gate-approach',
        scene: 'field',
        sun: 0.5,
        subject: 'C115 P4 gate approach fan, C115 P2 post jitter, C114 P4 pen grass exclusion',
        camera: { pos: { x: 0, y: 9, z: 78 }, target: { x: 0, y: 1.2, z: 104 } },
        dog: { x: 4, z: 88 },
    },
    {
        id: '02-gate-oblique',
        scene: 'field',
        sun: 0.5,
        subject: 'the gate read from the side: leaf pose, post lean, where grass stops',
        camera: { pos: { x: 26, y: 5.5, z: 84 }, target: { x: -2, y: 1.4, z: 103 } },
        dog: { x: 12, z: 92 },
    },
    {
        id: '03-pen-interior',
        scene: 'field',
        sun: 0.5,
        subject: 'C114 P4 exclusion band inside the pen, C115 P1 fence wear + sag on the long run',
        camera: { pos: { x: -34, y: 7, z: 112 }, target: { x: 10, y: 1.0, z: 118 } },
        dog: { x: 0, z: 112 },
    },
    {
        id: '04-fence-run',
        scene: 'field',
        sun: 0.5,
        subject: 'C115 P2 per-post jitter along a long perimeter run, raking light',
        camera: { pos: { x: -88, y: 3.2, z: -40 }, target: { x: -99, y: 1.4, z: 40 } },
        dog: { x: -90, z: -20 },
    },
    {
        id: '05-farmhouse',
        scene: 'field',
        sun: 0.5,
        subject: 'C115 P6 farmhouse material roles: roof / walls / trim should read as three',
        camera: { pos: { x: 150, y: 12, z: 122 }, target: { x: 181, y: 5, z: 160 } },
        dog: { x: 160, z: 135 },
    },
    {
        id: '06-farmhouse-dusk',
        scene: 'field',
        sun: 0.72,
        subject: 'C115 P7 dusk lamp lights the homestead',
        camera: { pos: { x: 150, y: 9, z: 126 }, target: { x: 181, y: 4, z: 160 } },
        dog: { x: 162, z: 138 },
    },
    {
        id: '07-dog-contact',
        scene: 'field',
        sun: 0.5,
        subject: 'C114 P5 ground contact darkening under the dog, in grass and on bare ground',
        camera: { pos: { x: 6, y: 3.4, z: -34 }, target: { x: 0, y: 0.4, z: -20 } },
        dog: { x: 0, z: -20 },
    },
    {
        id: '08-ground-variation',
        scene: 'field',
        sun: 0.5,
        subject: 'C114 P2/P3 low-frequency ground albedo that grass now reads',
        camera: { pos: { x: -60, y: 22, z: -60 }, target: { x: 10, y: 0, z: 20 } },
        dog: { x: -40, z: -40 },
    },
    {
        id: '09-horizon',
        scene: 'field',
        sun: 0.5,
        subject: 'C112 P6 horizon seam, shallow look at the far terrain edge',
        camera: { pos: { x: 0, y: 14, z: -90 }, target: { x: 0, y: 13.4, z: 400 } },
        dog: { x: 0, z: -80 },
    },
    {
        id: '10-rh-corral',
        scene: 'rolling-hills',
        sun: 0.5,
        subject: 'D14 cross-scene check: what marks the island objective today',
        camera: null, // classic camera, let the controller frame it
        dog: null,
    },
];

function parseArgs(argv) {
    const out = { only: null, outDir: resolve(ROOT, 'cycle116-validation', 'probe') };
    for (const a of argv.slice(2)) {
        const [k, v] = a.replace(/^--/, '').split('=');
        if (k === 'only' && v) out.only = v.split(',').map(s => s.trim()).filter(Boolean);
        if (k === 'out' && v) out.outDir = resolve(ROOT, v);
    }
    return out;
}

async function assertWebGpuEngaged(page, id) {
    const r = await page.evaluate(() => ({
        ok: window.__sdsG?.productionWebGpu?.ok === true,
        effective: window.__sdsRendererMode?.effective ?? null,
        reason: window.__sdsG?.productionWebGpu?.error ?? window.__sdsRendererMode?.fallbackReason ?? null,
    }));
    if (!r.ok || r.effective === 'webgl') {
        throw new Error(`[PROBE] WebGPU did not engage for ${id} (ok=${r.ok}, effective=${r.effective}, reason=${r.reason})`);
    }
    return r;
}

async function shoot(browser, shot) {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 300)));

    try {
        const url = new URL(BASE_URL);
        url.searchParams.set('perfMode', '1');
        url.searchParams.set('probeRender', '1');
        url.searchParams.set('cinematic', '1');
        url.searchParams.set('renderer', 'webgpu');
        url.searchParams.set('visualGolden', '1');
        url.searchParams.set('scene', shot.scene);
        url.searchParams.set('sun', String(shot.sun));
        url.searchParams.set('ui', 'off');

        await page.goto(url.toString(), { waitUntil: 'load', timeout: 120_000 });
        await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 90_000 });
        await page.evaluate(() => window.__sdsCinema.waitReady(120_000));
        await page.evaluate(() => {
            window.__sdsCinema.pauseSimulation();
            window.__sdsCinema.startSolo('jep', 'classic');
        });
        await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
        const engine = await assertWebGpuEngaged(page, shot.id);

        // Let the flock settle a beat so sheep are standing, not spawning.
        await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));

        const posed = await page.evaluate(({ shot }) => {
            const cinema = window.__sdsCinema;
            cinema.setSun(shot.sun);
            if (shot.dog) cinema.poseDog(shot.dog.x, shot.dog.z, { x: 0, z: 0 });
            if (shot.camera) {
                // freeFlyActive is the documented gate on SceneManager.updateCamera
                // (js/SceneManager.js:232). Set it WITHOUT mounting OrbitControls:
                // the controls need pointer input we do not have, and all this shot
                // wants is for the gameplay camera to stop overwriting the pose.
                cinema.freeFlyActive = true;
                cinema.setCameraPose(shot.camera.pos, shot.camera.target);
            } else {
                const dog = cinema.gameState?.getSheepdog?.();
                cinema.freeFlyActive = false;
                cinema.setCameraMode('classic');
                cinema.setCameraZoom(60);
                for (let i = 0; i < 120; i++) window.__sds?.sceneManager?.updateCamera?.(dog, 1 / 60);
            }
            cinema.pauseSimulation();
            cinema.syncAtmosphereToCamera();
            return cinema.getCameraPose();
        }, { shot });

        // Let the GAME's own render loop paint. cinema.renderFrame() does a bare
        // renderer.render(scene, camera) which skips whatever paints the sky dome:
        // captures taken through it come back with a black sky, which reads as a
        // scene defect and is not one. Verified against a live unpaused frame.
        for (let i = 0; i < 3; i++) {
            await page.evaluate(({ shot }) => {
                const cinema = window.__sdsCinema;
                if (shot.camera) cinema.setCameraPose(shot.camera.pos, shot.camera.target);
                cinema.syncAtmosphereToCamera();
                return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            }, { shot });
        }

        const dataUrl = await page.evaluate(() => {
            const canvas = document.querySelector('#canvas-container canvas') ?? document.querySelector('canvas');
            if (!canvas) throw new Error('game canvas not found');
            return canvas.toDataURL('image/png');
        });
        const png = Buffer.from(String(dataUrl).split(',')[1], 'base64');
        return { png, engine, posed, consoleErrors };
    } finally {
        await context.close();
    }
}

async function main() {
    const args = parseArgs(process.argv);
    const shots = args.only ? SHOTS.filter(s => args.only.some(o => s.id.includes(o))) : SHOTS;
    if (!shots.length) { console.error('[PROBE] no shots matched --only'); process.exit(2); }

    await mkdir(args.outDir, { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: false, args: WEBGPU_LAUNCH_ARGS });
    const results = [];
    try {
        for (const shot of shots) {
            process.stdout.write(`[PROBE] ${shot.id} (${shot.scene}) ... `);
            try {
                const { png, engine, posed, consoleErrors } = await shoot(browser, shot);
                const fp = resolve(args.outDir, `${shot.id}.png`);
                await writeFile(fp, png);
                results.push({ id: shot.id, ok: true, bytes: png.length, engine: engine.effective, errors: consoleErrors.length, subject: shot.subject });
                console.log(`ok ${(png.length / 1024).toFixed(0)}kB  ${engine.effective}  errors=${consoleErrors.length}`);
                if (consoleErrors.length) consoleErrors.slice(0, 3).forEach(e => console.log(`[PROBE]     ! ${e}`));
                if (posed) console.log(`[PROBE]     pose ${JSON.stringify(posed.pos)}`);
            } catch (err) {
                results.push({ id: shot.id, ok: false, error: String(err?.message || err).slice(0, 400) });
                console.log(`FAILED - ${String(err?.message || err).slice(0, 160)}`);
            }
        }
    } finally {
        await browser.close();
    }

    await writeFile(resolve(args.outDir, 'probe-report.json'), JSON.stringify({ shots: results }, null, 2));
    const failed = results.filter(r => !r.ok);
    console.log(`[PROBE] ${results.length - failed.length}/${results.length} captured to ${args.outDir}`);
    process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error('[PROBE] fatal:', err); process.exit(2); });
