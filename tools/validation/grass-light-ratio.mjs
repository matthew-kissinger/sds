// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 123 Phase 2: measure the grass lighting factor and the
 * grass-to-terrain ratio at several times of day, on every scene.
 *
 * The defect this cycle closes was found by measurement (Cycle 120 recorded
 * terrain floor p05 14.30 at noon falling to ~0 at night while the grass
 * canopy p95 fell only 115.81 to 102.10, i.e. 8:1 to 204:1) and it closes by
 * measurement rather than by eye.
 *
 * It also answers hard stop 1 directly. "Noon does not move" is proven
 * arithmetically for the REFERENCE LIGHTS by tests/grass-lighting.spec.js, but
 * the golden harness captures at day-cycle t=0.5, which is not the same thing
 * as the static `pastoral-noon` preset the reference was tuned at. This probe
 * reports the factor at t=0.5 so that gap is a measured number instead of an
 * assumption.
 *
 * Requires a dev server on :3000. Reads numbers, not pixels, so it does not
 * need genuine WebGPU - the lighting rig is renderer-independent.
 *
 *   node tools/validation/grass-light-ratio.mjs [--scenes=a,b] [--out=path.json]
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE_URL = 'http://localhost:3000/';

function parseArgs(argv) {
    const out = {};
    for (const a of argv.slice(2)) {
        const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
        if (m) out[m[1]] = m[2] ?? true;
    }
    return out;
}

const args = parseArgs(process.argv);
const SCENES = String(args.scenes || 'field,rolling-hills,open-country,newsheepdogland').split(',');
// t is the day-cycle position the golden harness also uses: 0.5 is midday,
// 0.85 is the evening cell, 0.95 is well after sundown.
// NOTE, measured: the golden matrix's `sun085` cell is NOT golden hour. At
// t=0.85 the sun sits 13.5 degrees BELOW the horizon, so its daylight gate is
// already 0. The real sundown ramp is around t=0.72 to 0.78, which is why
// those two are sampled here - without them the table would show a step and
// hide the fact that there is a smooth band at all.
const TIMES = [
    { t: 0.5, label: 'noon' },
    { t: 0.72, label: 'late-day' },
    { t: 0.75, label: 'sundown' },
    { t: 0.78, label: 'dusk' },
    { t: 0.85, label: 'golden-cell' },
    { t: 0.95, label: 'night' }
];

async function main() {
    // Cycle 103's lesson, which this probe re-learned the hard way: headless
    // Chromium has no navigator.gpu, so the session silently demotes to WebGL
    // and every number describes the twin instead of production. `--webgpu`
    // uses the same headed-Chrome launch the golden harness uses.
    const browser = args.webgpu
        ? await chromium.launch({
            channel: 'chrome',
            headless: false,
            args: ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist']
        })
        : await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const rows = [];

    try {
        for (const scene of SCENES) {
            for (const { t, label } of TIMES) {
                const url = new URL(BASE_URL);
                url.searchParams.set('cinematic', '1');
                // window.__sds (which carries sceneManager) only installs under
                // probeRender=1. The golden harness sets it for the same reason.
                url.searchParams.set('probeRender', '1');
                url.searchParams.set('scene', scene);
                url.searchParams.set('sun', String(t));
                url.searchParams.set('ui', 'off');
                if (args.webgpu) url.searchParams.set('renderer', 'webgpu');
                await page.goto(url.toString(), { waitUntil: 'load', timeout: 90_000 });
                await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 60_000 });
                await page.evaluate(() => window.__sdsCinema.waitReady(90_000));
                await page.evaluate((tt) => {
                    window.__sdsCinema.setSun(tt);
                    window.__sdsCinema.pauseSimulation();
                }, t);
                await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

                const sample = await page.evaluate(async () => {
                    const cinema = window.__sdsCinema;
                    // Prefer the rig; fall back to walking the scene graph, so
                    // the probe reports real numbers even if the harness global
                    // moves. The lights ARE the ground truth either way.
                    const rig = window.__sds?.sceneManager?.sceneLightingRig ?? null;
                    let sun = rig?.sun ?? null;
                    let ambient = rig?.ambient ?? null;
                    if (!sun || !ambient) {
                        for (const child of cinema?.scene?.children ?? []) {
                            if (!sun && child.isDirectionalLight) sun = child;
                            if (!ambient && child.isAmbientLight) ambient = child;
                        }
                    }
                    const mod = await import('/js/world/grassLighting.js');
                    // Pass the REAL rig when there is one. Carrying `profile`
                    // is the whole point: the two rigs are balanced in
                    // different units, so the reference the factor normalises
                    // against differs. An earlier version of this probe built a
                    // synthetic {sun, ambient}, dropped the profile, and
                    // reported a WebGL noon of 0.49 that was the probe's error.
                    const lights = mod.lightsFromRig(rig ?? { sun, ambient });
                    const factor = lights ? mod.grassLightFactor(lights) : null;
                    return {
                        profile: rig?.profile?.name ?? 'none (synthetic)',
                        drivesSun: rig?.profile?.drivesSun ?? null,
                        ambientAnchor: rig?.profile?.ambientAnchor ?? null,
                        ambientColorRaw: ambient ? { r: ambient.color.r, g: ambient.color.g, b: ambient.color.b } : null,
                        sunIntensity: sun?.intensity ?? null,
                        sunColor: sun ? { r: sun.color.r, g: sun.color.g, b: sun.color.b } : null,
                        ambientIntensity: ambient?.intensity ?? null,
                        daylight: lights?.daylight ?? null,
                        factor,
                        elevationDeg: cinema?.atmosphere?.sun?.getElevation
                            ? (cinema.atmosphere.sun.getElevation() * 180) / Math.PI
                            : null
                    };
                });

                rows.push({ scene, t, label, ...sample });
                const f = sample.factor;
                console.log(
                    `${scene.padEnd(14)} ${label.padEnd(12)} t=${String(t).padEnd(5)} ` +
                    `${String(sample.profile).padEnd(18)} ` +
                    `elev=${String((sample.elevationDeg ?? NaN).toFixed(1)).padStart(6)}deg  ` +
                    `sunI=${(sample.sunIntensity ?? NaN).toFixed(3)}  ` +
                    `gate=${sample.daylight === null || sample.daylight === undefined ? '  n/a' : sample.daylight.toFixed(3)}  ` +
                    `factor=${f ? f.g.toFixed(4) : 'null (rig does not drive the sun)'}`
                );
            }
        }
    } finally {
        await page.close();
        await context.close();
        await browser.close();
    }

    const noon = rows.filter((r) => r.label === 'noon' && r.factor);
    const night = rows.filter((r) => r.label === 'night' && r.factor);
    console.log('');
    console.log('NOON  factor.g range: ' + noon.map((r) => r.factor.g.toFixed(4)).join(', '));
    console.log('NIGHT factor.g range: ' + night.map((r) => r.factor.g.toFixed(4)).join(', '));

    if (args.out) {
        writeFileSync(String(args.out), JSON.stringify({ rows }, null, 2) + '\n', 'utf8');
        console.log(`wrote ${args.out}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(2);
});
