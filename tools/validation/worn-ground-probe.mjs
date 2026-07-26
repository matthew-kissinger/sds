// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 121 - the worn-ground probe.
 *
 * Three surfaces are the same ground with three names: the pen interior, the
 * farmhouse yard and the gate approach. This probe frames each of them close
 * enough to judge, on the production WebGPU path, and reports what the LIVE
 * grass system believes about the ground it is standing on.
 *
 * The runtime read matters as much as the picture. `grassSystem.exclusionZones`
 * is the list the scatter actually consulted, so a scene whose pen carries no
 * zone shows up as a number rather than as an argument about which SceneDef key
 * `TerrainBuilder` happened to read.
 *
 * Usage:
 *   node tools/validation/worn-ground-probe.mjs --out=cycle121-validation/before
 *   node tools/validation/worn-ground-probe.mjs --only=rh,nsl
 *
 * Requires a dev server on :3000 and installed Chrome (headed) for real WebGPU:
 * headless bundled Chromium has no navigator.gpu and silently demotes to WebGL.
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
 * Camera poses are GROUND-RELATIVE: `dy` is metres above `_groundY(x, z)` at the
 * pose's own (x, z). Rolling Hills' pasture sits 24-29m up its heightfield and
 * Newsheepdogland's homestead is on a raised foot, so absolute Y values that
 * frame Home Field would look at the inside of a hill on either island.
 *
 * `zones` are the rects each shot is about, in world XZ. The probe reports, per
 * rect, whether the live GrassSystem excludes its centre - which is the whole
 * question Phase 1 exists to answer.
 */
const SHOTS = [
    {
        id: 'field-pen',
        scene: 'field',
        sun: 0.5,
        subject: 'Home Field pen interior + gate approach. The reference: this one HAS an exclusion.',
        camera: { pos: { x: 0, dy: 11, z: 82 }, target: { x: 0, dy: 1.0, z: 116 } },
        dog: { x: 3, z: 92 },
        zones: [{ name: 'pen', minX: -30, maxX: 30, minZ: 100, maxZ: 128 }],
    },
    {
        id: 'field-pen-edge',
        scene: 'field',
        sun: 0.5,
        subject: 'the grass-to-ground transition along the pen\'s west fence, close enough to judge the 4m falloff',
        camera: { pos: { x: -44, dy: 2.4, z: 106 }, target: { x: -22, dy: 0.6, z: 120 } },
        dog: { x: -46, z: 96 },
        zones: [{ name: 'pen', minX: -30, maxX: 30, minZ: 100, maxZ: 128 }],
    },
    {
        id: 'field-yard',
        scene: 'field',
        sun: 0.5,
        subject: 'Home Field farmhouse yard, the second declared exclusion rect',
        camera: { pos: { x: 128, dy: 20, z: 108 }, target: { x: 182, dy: 3, z: 162 } },
        dog: { x: 150, z: 130 },
        zones: [{ name: 'farmyard', minX: 140, maxX: 220, minZ: 120, maxZ: 200 }],
    },
    {
        id: 'rh-pasture',
        scene: 'rolling-hills',
        sun: 0.5,
        subject: 'Rolling Hills island pasture, looking in over the gate. Does grass grow inside it?',
        camera: { pos: { x: 50, dy: 15, z: -26 }, target: { x: 50, dy: 1.0, z: -78 } },
        dog: { x: 50, z: -44 },
        zones: [{ name: 'pen', minX: 32, maxX: 68, minZ: -94, maxZ: -58 }],
    },
    {
        id: 'rh-pasture-interior',
        scene: 'rolling-hills',
        sun: 0.5,
        subject: 'Rolling Hills pasture from inside the fence, low, so the blades read',
        camera: { pos: { x: 26, dy: 6, z: -104 }, target: { x: 56, dy: 1.0, z: -72 } },
        dog: { x: 50, z: -76 },
        zones: [{ name: 'pen', minX: 32, maxX: 68, minZ: -94, maxZ: -58 }],
    },
    {
        // Same pose as rh-pasture-interior, higher sun. Separates "this cycle
        // made the island pen dark" from "the island terrain is dark under its
        // own light", which is Cycle 120's recorded finding and not this
        // cycle's to fix.
        id: 'rh-pasture-interior-highsun',
        scene: 'rolling-hills',
        sun: 0.3,
        subject: 'Rolling Hills pasture with the sun up, as a control on terrain brightness',
        camera: { pos: { x: 26, dy: 6, z: -104 }, target: { x: 56, dy: 1.0, z: -72 } },
        dog: { x: 50, z: -76 },
        zones: [{ name: 'pen', minX: 32, maxX: 68, minZ: -94, maxZ: -58 }],
    },
    {
        id: 'nsl-homestead',
        scene: 'newsheepdogland',
        sun: 0.5,
        subject: 'Newsheepdogland homestead pen (center 640,-1000 r30) + its farmhouse yard',
        camera: { pos: { x: 556, dy: 22, z: -1000 }, target: { x: 646, dy: 2, z: -996 } },
        dog: { x: 600, z: -1000 },
        zones: [
            { name: 'pen', minX: 610, maxX: 670, minZ: -1030, maxZ: -970 },
            { name: 'farmyard', minX: 620, maxX: 660, minZ: -976, maxZ: -936 },
        ],
    },
    {
        id: 'nsl-homestead-interior',
        scene: 'newsheepdogland',
        sun: 0.5,
        subject: 'Newsheepdogland pen interior, low across the enclosure',
        camera: { pos: { x: 616, dy: 5, z: -1026 }, target: { x: 664, dy: 1.0, z: -984 } },
        dog: { x: 640, z: -1000 },
        zones: [{ name: 'pen', minX: 610, maxX: 670, minZ: -1030, maxZ: -970 }],
    },
];

function parseArgs(argv) {
    const out = { only: null, outDir: resolve(ROOT, 'cycle121-validation', 'probe') };
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
        throw new Error(`[WORN] WebGPU did not engage for ${id} (ok=${r.ok}, effective=${r.effective}, reason=${r.reason})`);
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

        await page.goto(url.toString(), { waitUntil: 'load', timeout: 180_000 });
        await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 120_000 });
        await page.evaluate(() => window.__sdsCinema.waitReady(180_000));
        await page.evaluate(() => {
            window.__sdsCinema.pauseSimulation();
            window.__sdsCinema.startSolo('jep', 'classic');
        });
        await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 180_000 });
        const engine = await assertWebGpuEngaged(page, shot.id);

        await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));

        // What the LIVE grass system believes about this shot's ground.
        const ground = await page.evaluate(({ shot }) => {
            const tb = window.gameInstance?.terrainBuilder ?? window.__sds?.sceneManager?.terrainBuilder ?? null;
            const gs = tb?.grassSystem ?? null;
            const zones = (gs?.exclusionZones ?? []).map(z => ({ ...z }));
            const report = (shot.zones ?? []).map((rect) => {
                const cx = (rect.minX + rect.maxX) / 2;
                const cz = (rect.minZ + rect.maxZ) / 2;
                let inside = 0, total = 0;
                for (let i = 0; i < 9; i++) {
                    for (let j = 0; j < 9; j++) {
                        const x = rect.minX + (rect.maxX - rect.minX) * (i + 0.5) / 9;
                        const z = rect.minZ + (rect.maxZ - rect.minZ) * (j + 0.5) / 9;
                        total++;
                        if (gs?.isExcluded?.(x, z)) inside++;
                    }
                }
                return {
                    name: rect.name,
                    centre: { x: cx, z: cz },
                    excludedSamples: inside,
                    samples: total,
                    keepAtCentre: gs?.exclusionKeepProbability?.(cx, cz) ?? null,
                };
            });
            const terrainUniforms = (() => {
                const m = tb?.terrainMesh?.material;
                if (!m) return null;
                const worn = m.userData?.wornGroundNodeUniforms ?? null;
                if (worn) {
                    return {
                        path: 'webgpu',
                        wear: worn.slots?.map(s => s.shape?.value?.z ?? null) ?? null,
                        rects: worn.slots?.map(s => (s.rect?.value
                            ? [s.rect.value.x, s.rect.value.y, s.rect.value.z, s.rect.value.w] : null)) ?? null,
                    };
                }
                if (m.uniforms?.uWornZoneShape) {
                    return { path: 'webgl', wear: m.uniforms.uWornZoneShape.value.map(v => v.z) };
                }
                return { path: m.isNodeMaterial ? 'webgpu' : 'webgl', wear: null };
            })();
            return { zoneCount: zones.length, zones, report, terrainUniforms };
        }, { shot });

        const posed = await page.evaluate(({ shot }) => {
            const cinema = window.__sdsCinema;
            const tb = window.gameInstance?.terrainBuilder ?? window.__sds?.sceneManager?.terrainBuilder ?? null;
            const groundY = (x, z) => {
                const y = tb?._groundY?.(x, z);
                return Number.isFinite(y) ? y : 0;
            };
            cinema.setSun(shot.sun);
            if (shot.dog) cinema.poseDog(shot.dog.x, shot.dog.z, { x: 0, z: 0 });
            const pos = { x: shot.camera.pos.x, y: groundY(shot.camera.pos.x, shot.camera.pos.z) + shot.camera.pos.dy, z: shot.camera.pos.z };
            const target = { x: shot.camera.target.x, y: groundY(shot.camera.target.x, shot.camera.target.z) + shot.camera.target.dy, z: shot.camera.target.z };
            cinema.freeFlyActive = true;
            cinema.setCameraPose(pos, target);
            cinema.pauseSimulation();
            cinema.syncAtmosphereToCamera();
            window.__sdsWornPose = { pos, target };
            return { pos, target };
        }, { shot });

        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => {
                const cinema = window.__sdsCinema;
                const p = window.__sdsWornPose;
                if (p) cinema.setCameraPose(p.pos, p.target);
                cinema.syncAtmosphereToCamera();
                return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            });
        }

        const dataUrl = await page.evaluate(() => {
            const canvas = document.querySelector('#canvas-container canvas') ?? document.querySelector('canvas');
            if (!canvas) throw new Error('game canvas not found');
            return canvas.toDataURL('image/png');
        });
        const png = Buffer.from(String(dataUrl).split(',')[1], 'base64');
        return { png, engine, posed, ground, consoleErrors };
    } finally {
        await context.close();
    }
}

async function main() {
    const args = parseArgs(process.argv);
    const shots = args.only ? SHOTS.filter(s => args.only.some(o => s.id.includes(o))) : SHOTS;
    if (!shots.length) { console.error('[WORN] no shots matched --only'); process.exit(2); }

    await mkdir(args.outDir, { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: false, args: WEBGPU_LAUNCH_ARGS });
    const results = [];
    try {
        for (const shot of shots) {
            process.stdout.write(`[WORN] ${shot.id} (${shot.scene}) ... `);
            try {
                const { png, engine, posed, ground, consoleErrors } = await shoot(browser, shot);
                await writeFile(resolve(args.outDir, `${shot.id}.png`), png);
                results.push({ id: shot.id, ok: true, engine: engine.effective, ground, posed, errors: consoleErrors.slice(0, 3) });
                console.log(`ok ${(png.length / 1024).toFixed(0)}kB ${engine.effective} zones=${ground.zoneCount}`);
                for (const r of ground.report) {
                    console.log(`[WORN]     ${r.name}: excluded ${r.excludedSamples}/${r.samples} samples, keepAtCentre=${r.keepAtCentre}`);
                }
                console.log(`[WORN]     terrain=${JSON.stringify(ground.terrainUniforms)}`);
                if (consoleErrors.length) consoleErrors.slice(0, 2).forEach(e => console.log(`[WORN]     ! ${e}`));
            } catch (err) {
                results.push({ id: shot.id, ok: false, error: String(err?.message || err).slice(0, 500) });
                console.log(`FAILED - ${String(err?.message || err).slice(0, 200)}`);
            }
        }
    } finally {
        await browser.close();
    }

    await writeFile(resolve(args.outDir, 'worn-ground-report.json'), JSON.stringify({ shots: results }, null, 2));
    const failed = results.filter(r => !r.ok);
    console.log(`[WORN] ${results.length - failed.length}/${results.length} captured to ${args.outDir}`);
    process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error('[WORN] fatal:', err); process.exit(2); });
