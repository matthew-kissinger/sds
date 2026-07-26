// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 118 Phase 1 - the water "before".
 *
 * Captures the water surface on every scene that has water, at noon and at
 * dusk, on the production WebGPU path, from camera poses derived at runtime by
 * walking outward from the island until the terrain drops under the waterline.
 * The point is to have a truthful record of what the shipped AnimeWater looks
 * like BEFORE any rewrite lands. Run this before the first line of new water
 * code exists or it is worth nothing.
 *
 * Usage:
 *   node tools/validation/water-look.mjs
 *   node tools/validation/water-look.mjs --only=rolling-hills
 *   node tools/validation/water-look.mjs --tod=noon
 *   node tools/validation/water-look.mjs --out=cycle118-validation/water-before
 *
 * Requires a dev server on :3000 and installed Chrome (headed).
 *
 * Four things this file already knows so you do not have to rediscover them.
 *
 * 1. WebGPU or nothing. Headless bundled Chromium has no navigator.gpu, so the
 *    boot silently demotes to WebGL (main.js sets productionWebGpu.ok=false and
 *    rendererMode.effective='webgl'). A WebGL "before" frame would invalidate
 *    the whole cycle, so assertWebGpuEngaged throws rather than writes. Same
 *    contract as tools/validation/screenshot-golden.mjs.
 *
 * 2. Do not capture through cinema.captureFrame() or cinema.renderFrame().
 *    Those call renderer.render(scene, camera) directly and skip whatever paints
 *    the sky dome, so every frame taken through them comes back with a black sky.
 *    Let the game's own rAF loop paint and read the canvas with toDataURL.
 *    (tools/validation/homestead-probe.mjs found this the hard way.)
 *
 * 3. Time of day is a cinema call, not a URL param. ?sun= is a sun ELEVATION;
 *    __sdsCinema.setSun(t) drives Atmosphere.setTimeOfDay, a TIME OF DAY, and
 *    re-bakes the sky LUT + sun colour + fog immediately. Measured on this build:
 *    t=0.5 is noon, t=0.7 to 0.75 is golden/dusk, t>=0.8 is night. We shoot 0.5
 *    and 0.74.
 *
 * 4. Newsheepdogland is the one scene whose day/night cycle actually runs, so a
 *    pinned time of day drifts under it. stopDayNightCycle() halts the advance;
 *    pauseSimulation() then short-circuits main.js's update() (which is what
 *    calls atmosphere.update and _tickDayLoop), and setSun re-pins after both.
 *
 * Note on determinism: this was true for the Phase 1 before-capture and is not
 * true any more. main.js used to drive the water off performance.now(), which
 * could be neither paused nor pinned, so those frames are reference material
 * for a human eye and not an SSIM gate. Cycle 118 Phase 5 replaced it with an
 * accumulated clock that stops under cinema.paused, and this tool now pins that
 * clock to PINNED_WATER_CLOCK before every pose - so the after-capture CAN be
 * compared byte for byte against a re-run of itself.
 */

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const BASE_URL = 'http://localhost:3000/';
const VIEWPORT = { width: 1600, height: 900 };
const WEBGPU_LAUNCH_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];

/**
 * Which scenes have water. Gated in js/boot/initWorld.js on
 * `boundary.kind === 'island' || boundary.kind === 'coastline'`; Home Field is
 * a rect boundary and its water init short-circuits before the plane is built.
 * Read out of shared/scenes/*.js, not assumed:
 *   field              boundary.kind rect        no water
 *   rolling-hills      island   r=180 fall=40    water
 *   open-country       island   r=380 fall=70    water
 *   newsheepdogland    coastline    fall=30      water, and the day loop runs
 * The tool re-asserts the kind at runtime and refuses to shoot a scene whose
 * water mesh did not build.
 */
const WATER_SCENES = ['rolling-hills', 'open-country', 'newsheepdogland'];

const TIMES_OF_DAY = [
    { id: 'noon', t: 0.5 },
    { id: 'dusk', t: 0.74 },
];

function parseArgs(argv) {
    const out = {
        only: null,
        tod: null,
        outDir: resolve(ROOT, 'cycle118-validation', 'water-before'),
    };
    for (const a of argv.slice(2)) {
        const [k, v] = a.replace(/^--/, '').split('=');
        if (k === 'only' && v) out.only = v.split(',').map(s => s.trim()).filter(Boolean);
        if (k === 'tod' && v) out.tod = v.split(',').map(s => s.trim()).filter(Boolean);
        if (k === 'out' && v) out.outDir = resolve(ROOT, v);
    }
    return out;
}

/**
 * Hard stop 1 of the cycle. Fails closed: if the session is not on the
 * production WebGPU path we throw instead of writing a frame.
 */
async function assertWebGpuEngaged(page, label) {
    const r = await page.evaluate(() => ({
        ok: window.__sdsG?.productionWebGpu?.ok === true,
        effective: window.__sdsRendererMode?.effective ?? null,
        isWebGpuRenderer: window.gameInstance?.sceneManager?.renderer?.isWebGPURenderer === true
            || window.__sds?.sceneManager?.renderer?.isWebGPURenderer === true,
        reason: window.__sdsG?.productionWebGpu?.error
            ?? window.__sdsRendererMode?.fallbackReason ?? null,
    }));
    if (!r.ok || r.effective === 'webgl') {
        throw new Error(
            `[WATER] WebGPU did not engage for ${label} `
            + `(ok=${r.ok}, effective=${r.effective}, isWebGPURenderer=${r.isWebGpuRenderer}, reason=${r.reason}). `
            + 'Refusing to write a WebGL "before" frame. Run against installed Chrome, headed.',
        );
    }
    return r;
}

/**
 * Runs in the page. Walks outward from an inland anchor along 36 compass
 * headings until the visible ground surface drops under the water plane, and
 * returns the crossing ring plus the derived camera poses.
 *
 * Deriving instead of hardcoding is what lets one shot list serve a 180m radial
 * island, a 380m radial island, and a 3.3km concave coastline.
 */
function deriveShorelineInPage() {
    const game = window.gameInstance;
    const scene = game?.currentScene;
    const hf = game?.heightfield;
    const water = game?._animeWater;
    if (!scene) return { error: 'no currentScene' };
    if (!hf) return { error: 'no heightfield' };
    if (!water?.mesh) return { error: 'no water mesh (scene built without water)' };

    const waterY = Number(water.mesh.position?.y ?? -0.05);

    // surfaceY is the visible mesh surface (falloff applied); sample() is the raw
    // heightfield. Anything placing geometry on the ground uses the former, so the
    // waterline we solve for is the one the player actually sees. surfaceY throws
    // when no mesh grid is bound, so probe once and fall back.
    let groundY;
    try {
        hf.surfaceY(0, 0);
        groundY = (x, z) => hf.surfaceY(x, z);
    } catch {
        groundY = (x, z) => hf.sample(x, z);
    }

    // Anchor: a point guaranteed to be on land. dogSpawn is the scene's own
    // answer to that question. Newsheepdogland needs it - the world origin there
    // is the instep bay, which is open water.
    // boundary.center comes second so radial islands march from their geometric
    // middle and the median crossing is unbiased; coastline scenes have no
    // center and fall through to the homestead points.
    const anchorCandidates = [
        scene.dogSpawn,
        scene.boundary?.center,
        scene.pen?.center,
        scene.corral?.center,
        { x: 0, z: -30 },
    ].filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.z));
    let anchor = null;
    for (const c of anchorCandidates) {
        if (groundY(c.x, c.z) > waterY + 0.5) { anchor = { x: c.x, z: c.z }; break; }
    }
    if (!anchor) return { error: 'no land anchor found among scene spawn points' };

    const halfWorld = Number(hf.worldSize ?? 2000) * 0.5;
    const STEP = 4;
    const inField = (x, z) => Math.abs(x) <= halfWorld && Math.abs(z) <= halfWorld;

    // First crossing outward along a heading, refined by bisection to 0.25m.
    function crossingAt(deg) {
        const rad = deg * Math.PI / 180;
        const dx = Math.sin(rad);
        const dz = Math.cos(rad);
        let prev = 0;
        for (let r = STEP; ; r += STEP) {
            const x = anchor.x + dx * r;
            const z = anchor.z + dz * r;
            if (!inField(x, z)) return null;
            if (groundY(x, z) <= waterY) {
                let lo = prev;
                let hi = r;
                for (let i = 0; i < 6; i++) {
                    const mid = (lo + hi) * 0.5;
                    if (groundY(anchor.x + dx * mid, anchor.z + dz * mid) <= waterY) hi = mid;
                    else lo = mid;
                }
                return { deg, dist: hi, x: anchor.x + dx * hi, z: anchor.z + dz * hi, dx, dz };
            }
            prev = r;
        }
    }

    const ring = [];
    for (let deg = 0; deg < 360; deg += 10) {
        const c = crossingAt(deg);
        if (c) ring.push(c);
    }
    if (ring.length < 6) return { error: `only ${ring.length} shoreline crossings found from anchor` };

    // Pick the MEDIAN crossing distance rather than the nearest or furthest, so
    // the shot lands on representative coast instead of a spit or a deep bay.
    const byDist = [...ring].sort((a, b) => a.dist - b.dist);
    const pick = byDist[Math.floor(byDist.length / 2)];

    const at = (deg) => ring.find(c => c.deg === ((deg % 360) + 360) % 360) ?? null;
    const before = at(pick.deg - 10);
    const after = at(pick.deg + 10);

    // Local shoreline tangent from the two neighbouring crossings. Falls back to
    // the perpendicular of the outward direction when a neighbour is missing.
    let tx, tz;
    if (before && after) {
        tx = after.x - before.x;
        tz = after.z - before.z;
    } else {
        tx = pick.dz;
        tz = -pick.dx;
    }
    const tlen = Math.hypot(tx, tz) || 1;
    tx /= tlen; tz /= tlen;

    const P = { x: pick.x, z: pick.z };
    const D = { x: pick.dx, z: pick.dz };   // outward, land to sea
    const T = { x: tx, z: tz };             // along the shore

    const camY = (x, z, above, floor) => Math.max(groundY(x, z) + above, waterY + floor);

    // The heightfield is a square footprint of side worldSize. Past its edge the
    // sampler clamps and TerrainBuilder's falloff has already taken the mesh to
    // Y=0, which is 5cm ABOVE the water plane at Y=-0.05, so a camera parked out
    // there ends up on a flat green skirt with the sea behind it. Clamp every
    // seaward camera to stay inside the footprint.
    const EDGE_MARGIN = 30;
    function seawardOffset(want) {
        const lim = halfWorld - EDGE_MARGIN;
        let s = want;
        for (const [p, d] of [[P.x, D.x], [P.z, D.z]]) {
            if (d > 1e-6) s = Math.min(s, (lim - p) / d);
            else if (d < -1e-6) s = Math.min(s, (-lim - p) / d);
        }
        return Math.max(0, s - 10);
    }

    // Record where the ground comes back up over the waterline going out to sea.
    // On a finite heightfield that radius is the skirt, and it is the thing that
    // decides how far out a water camera can stand.
    const skirtProbe = [];
    let skirtRadius = null;
    for (let s = 10; s <= 500; s += 20) {
        const x = P.x + D.x * s;
        const z = P.z + D.z * s;
        const y = groundY(x, z);
        skirtProbe.push({ out: s, groundY: Math.round(y * 100) / 100, inField: inField(x, z) });
        if (skirtRadius === null && y > waterY) skirtRadius = s;
    }

    // 1. Low, on the beach, looking out to sea. The frame the rewrite has to beat:
    //    near-shore shallow band, foam line, open water, horizon blend.
    const outCam = { x: P.x - D.x * 12, z: P.z - D.z * 12 };
    // 2. Standing just off the shore looking ALONG it, so the foam band runs
    //    across the frame instead of hugging the bottom edge.
    const alongOut = seawardOffset(8);
    const alongCam = { x: P.x + D.x * alongOut - T.x * 70, z: P.z + D.z * alongOut - T.z * 70 };
    // 3. Pulled back and up: water colour gradient, the whole shoreline read, and
    //    where the water meets the sky.
    const wideCam = { x: P.x - D.x * 110, z: P.z - D.z * 110 };
    // 4. Out on the open sea with no land in frame at all, so the surface shading
    //    is judged on its own: ripple read, sun specular, and the seam where the
    //    finite water plane ends against the sky.
    const openOut = seawardOffset(130);
    const openCam = { x: P.x + D.x * openOut, z: P.z + D.z * openOut };

    const poses = [
        {
            id: 'shore-out',
            subject: 'low on the beach looking out to sea: foam line, shallow band, deep band, horizon',
            pos: { x: outCam.x, y: camY(outCam.x, outCam.z, 2.0, 2.0), z: outCam.z },
            target: { x: P.x + D.x * 150, y: waterY + 0.6, z: P.z + D.z * 150 },
        },
        {
            id: 'shore-along',
            subject: 'just off the shore looking along it: the foam band across frame, shore contact',
            pos: { x: alongCam.x, y: waterY + 2.6, z: alongCam.z },
            target: { x: P.x + T.x * 45 + D.x * 2, y: waterY + 0.5, z: P.z + T.z * 45 + D.z * 2 },
        },
        {
            id: 'water-wide',
            subject: 'elevated pull-back: colour gradient, the whole coast read, water-to-sky seam',
            pos: { x: wideCam.x, y: camY(wideCam.x, wideCam.z, 50, 50), z: wideCam.z },
            target: { x: P.x + D.x * 280, y: waterY, z: P.z + D.z * 280 },
        },
        {
            id: 'open-water',
            subject: 'open sea, no land in frame: ripple read, sun specular, water-plane horizon seam',
            pos: { x: openCam.x, y: waterY + 3.2, z: openCam.z },
            target: { x: openCam.x + D.x * 300, y: waterY + 1.4, z: openCam.z + D.z * 300 },
        },
    ];

    const r3 = (n) => Math.round(n * 10) / 10;
    return {
        anchor,
        waterY,
        boundaryKind: scene.boundary?.kind ?? null,
        worldSize: hf.worldSize ?? null,
        heading: pick.deg,
        crossing: { x: r3(P.x), z: r3(P.z), dist: r3(pick.dist) },
        tangent: { x: r3(T.x * 1000) / 1000, z: r3(T.z * 1000) / 1000 },
        ringCount: ring.length,
        ringDistances: ring.map(c => ({ deg: c.deg, dist: r3(c.dist) })),
        seawardLimit: r3(seawardOffset(1e6)),
        skirtRadius,
        skirtProbe,
        poses,
    };
}

/** Water-system facts worth having on record next to the pixels. */
function readWaterStateInPage() {
    const game = window.gameInstance;
    const w = game?._animeWater;
    if (!w?.mesh) return { present: false };
    const m = w.material ?? w.mesh.material;
    const u = m?.uniforms ?? null;
    const col = (c) => (c && typeof c.getHexString === 'function' ? `#${c.getHexString()}` : null);

    // On the WebGPU path the shipped material is a MeshBasicNodeMaterial with no
    // `.uniforms` bag; its tuning lives on userData.webgpuWater* plus a handful
    // of live TSL uniform nodes. That tuning is the thing a rewrite replaces, so
    // record it next to the pixels.
    const nodeTuning = {};
    for (const k of Object.keys(m?.userData ?? {})) {
        if (!k.startsWith('webgpuWater')) continue;
        const v = m.userData[k];
        if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) nodeTuning[k] = v;
    }
    const nodeUniforms = m?.userData?.webgpuWaterNodeUniforms ?? null;
    const nodeUniformValues = nodeUniforms ? Object.fromEntries(
        Object.entries(nodeUniforms).map(([k, node]) => {
            const val = node?.value;
            if (val == null) return [k, null];
            if (typeof val === 'number') return [k, Math.round(val * 1000) / 1000];
            const r3 = (n) => Math.round(n * 1000) / 1000;
            return [k, { x: r3(val.x), y: r3(val.y), z: r3(val.z) }];
        }),
    ) : null;

    return {
        present: true,
        visible: w.mesh.visible !== false,
        y: w.mesh.position?.y ?? null,
        geometrySize: w.mesh.geometry?.parameters
            ? { width: w.mesh.geometry.parameters.width, segments: w.mesh.geometry.parameters.widthSegments }
            : null,
        materialType: m?.type ?? null,
        materialName: m?.name ?? null,
        isNodeMaterial: m?.isNodeMaterial === true,
        summary: w.webgpuWaterMaterialSummary ?? null,
        sparkleScale: w.qualitySparkleScale ?? null,
        nodeTuning,
        nodeUniformValues,
        uniforms: u ? {
            shallowColor: col(u.uShallowColor?.value),
            deepColor: col(u.uDeepColor?.value),
            foamColor: col(u.uFoamColor?.value),
            foamThickness: u.uFoamThickness?.value ?? null,
            rippleStrength: u.uRippleStrength?.value ?? null,
            sparkleStrength: u.uSparkleStrength?.value ?? null,
            sunSpecularIntensity: u.uSunSpecularIntensity?.value ?? null,
            hasHeight: u.uHasHeight?.value ?? null,
            waterY: u.uWaterY?.value ?? null,
        } : null,
    };
}

async function openSession(browser, scene, tod) {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 300)));

    const url = new URL(BASE_URL);
    url.searchParams.set('perfMode', '1');
    url.searchParams.set('probeRender', '1');
    url.searchParams.set('cinematic', '1');
    url.searchParams.set('renderer', 'webgpu');
    url.searchParams.set('visualGolden', '1');
    url.searchParams.set('scene', scene);
    url.searchParams.set('ui', 'off');

    await page.goto(url.toString(), { waitUntil: 'load', timeout: 180_000 });
    await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 120_000 });
    await page.evaluate(() => window.__sdsCinema.waitReady(180_000));
    await page.evaluate(() => {
        window.__sdsCinema.pauseSimulation();
        window.__sdsCinema.startSolo('jep', 'classic');
    });
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 180_000 });

    const engine = await assertWebGpuEngaged(page, `${scene}/${tod.id}`);

    // Confirm the scene really is a water scene before shooting it.
    const kind = await page.evaluate(() => window.gameInstance?.currentScene?.boundary?.kind ?? null);
    if (kind !== 'island' && kind !== 'coastline') {
        throw new Error(`[WATER] ${scene} boundary.kind=${kind}; initWorld only builds water for island/coastline`);
    }

    // Newsheepdogland runs its day/night cycle for real, so a pinned time of day
    // drifts under the capture. Stop the advance, freeze the sim, then pin.
    const clock = await page.evaluate(({ t }) => {
        const atm = window.__sdsCinema.atmosphere;
        const wasRunning = atm?.isDayNightRunning?.() === true;
        atm?.stopDayNightCycle?.();
        window.__sdsCinema.pauseSimulation();
        window.__sdsCinema.setSun(t);
        return {
            dayNightWasRunning: wasRunning,
            dayNightNowRunning: atm?.isDayNightRunning?.() === true,
            dayLoopScene: window.gameInstance?.currentScene?.dayNight?.dayLoop === true,
            tPinned: atm?.dayNight?.getT?.() ?? null,
        };
    }, { t: tod.t });

    // Let the flock and the terrain settle a beat before anything is read.
    await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));

    return { context, page, engine, clock, consoleErrors };
}

/**
 * Cycle 118 Phase 5: the water's surface phase is pinned to this value before
 * every pose. Any constant works; a non-zero one is chosen so the ripple field
 * is not sampled at its t=0 origin, where the three rotated wave terms share a
 * phase and the surface reads flatter than it ever does in play.
 */
const PINNED_WATER_CLOCK = 12.0;

async function shootPose(page, pose, tod) {
    await page.evaluate(({ pose, t, waterClock }) => {
        const cinema = window.__sdsCinema;
        cinema.hideUI();
        // Pin the water clock, not just pause it. The clock only advances when
        // the sim is running, but its value at capture time still depends on
        // how long scene load took, so an unpinned capture is reproducible in
        // look and not in bytes.
        cinema.setWaterClock?.(waterClock);
        // freeFlyActive is the documented gate on SceneManager.updateCamera
        // (js/SceneManager.js:232). Set it without mounting OrbitControls: the
        // controls want pointer input we do not have, and all this needs is for
        // the gameplay camera to stop overwriting the pose every frame.
        cinema.freeFlyActive = true;
        cinema.setCameraPose(pose.pos, pose.target);
        cinema.setSun(t);
        cinema.pauseSimulation();
        cinema.syncAtmosphereToCamera();
    }, { pose, t: tod.t, waterClock: PINNED_WATER_CLOCK });

    // Let the GAME's own render loop paint. cinema.renderFrame() / captureFrame()
    // do a bare renderer.render(scene, camera) that skips the sky dome pass, and
    // come back with a black sky that reads as a scene defect and is not one.
    // Re-pin the clock inside the loop: these rAF ticks run main.js's frame, so
    // a clock left free would advance four times between the pose and the read.
    for (let i = 0; i < 4; i++) {
        await page.evaluate(({ pose, waterClock }) => {
            const cinema = window.__sdsCinema;
            cinema.setCameraPose(pose.pos, pose.target);
            cinema.setWaterClock?.(waterClock);
            cinema.syncAtmosphereToCamera();
            return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        }, { pose, waterClock: PINNED_WATER_CLOCK });
    }

    const dataUrl = await page.evaluate(() => {
        const canvas = document.querySelector('#canvas-container canvas') ?? document.querySelector('canvas');
        if (!canvas) throw new Error('game canvas not found');
        return canvas.toDataURL('image/png');
    });
    return Buffer.from(String(dataUrl).split(',')[1], 'base64');
}

async function main() {
    const args = parseArgs(process.argv);
    const scenes = args.only ? WATER_SCENES.filter(s => args.only.includes(s)) : WATER_SCENES;
    const times = args.tod ? TIMES_OF_DAY.filter(t => args.tod.includes(t.id)) : TIMES_OF_DAY;
    if (!scenes.length) { console.error('[WATER] no scenes matched --only'); process.exit(2); }
    if (!times.length) { console.error('[WATER] no times matched --tod'); process.exit(2); }

    await mkdir(args.outDir, { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: false, args: WEBGPU_LAUNCH_ARGS });

    const report = {
        cycle: 118,
        phase: 1,
        purpose: 'water "before" reference, production WebGPU path, captured prior to any water rewrite',
        capturedAt: new Date().toISOString(),
        viewport: VIEWPORT,
        baseUrl: BASE_URL,
        waterScenes: WATER_SCENES,
        waterGate: "js/boot/initWorld.js builds AnimeWater when boundary.kind is 'island' or 'coastline'",
        timesOfDay: TIMES_OF_DAY,
        sessions: [],
    };
    let frames = 0;
    let failures = 0;

    try {
        for (const scene of scenes) {
            for (const tod of times) {
                const label = `${scene}/${tod.id}`;
                process.stdout.write(`[WATER] ${label} loading ... `);
                const session = { scene, tod: tod.id, t: tod.t, ok: false, shots: [] };
                let ctx = null;
                try {
                    const opened = await openSession(browser, scene, tod);
                    ctx = opened.context;
                    const { page, engine, clock } = opened;
                    session.engine = engine.effective;
                    session.clock = clock;
                    console.log(`ok  engine=${engine.effective}  dayNightWasRunning=${clock.dayNightWasRunning}`);

                    session.water = await page.evaluate(readWaterStateInPage);
                    if (!session.water?.present) {
                        throw new Error('water mesh absent after scene build (initWorld water init failed)');
                    }

                    const shore = await page.evaluate(deriveShorelineInPage);
                    if (shore?.error) throw new Error(`shoreline derivation failed: ${shore.error}`);
                    session.shoreline = {
                        anchor: shore.anchor,
                        waterY: shore.waterY,
                        boundaryKind: shore.boundaryKind,
                        worldSize: shore.worldSize,
                        heading: shore.heading,
                        crossing: shore.crossing,
                        tangent: shore.tangent,
                        ringCount: shore.ringCount,
                        ringDistances: shore.ringDistances,
                        seawardLimit: shore.seawardLimit,
                        skirtRadius: shore.skirtRadius,
                        skirtProbe: shore.skirtProbe,
                    };
                    console.log(`[WATER]   shore: anchor=(${shore.anchor.x},${shore.anchor.z}) `
                        + `heading=${shore.heading}deg crossing=(${shore.crossing.x},${shore.crossing.z}) `
                        + `dist=${shore.crossing.dist}m ring=${shore.ringCount}/36 waterY=${shore.waterY} `
                        + `seawardLimit=${shore.seawardLimit}m skirt=${shore.skirtRadius ?? 'none within 500m'}`);

                    for (const pose of shore.poses) {
                        const name = `${scene}__${tod.id}__${pose.id}.png`;
                        try {
                            const png = await shootPose(page, pose, tod);
                            await writeFile(resolve(args.outDir, name), png);
                            frames += 1;
                            session.shots.push({
                                id: pose.id, file: name, ok: true, bytes: png.length,
                                subject: pose.subject, pos: pose.pos, target: pose.target,
                            });
                            console.log(`[WATER]   ${pose.id} -> ${name} ${(png.length / 1024).toFixed(0)}kB`);
                        } catch (err) {
                            failures += 1;
                            session.shots.push({ id: pose.id, file: name, ok: false, error: String(err?.message || err).slice(0, 400) });
                            console.log(`[WATER]   ${pose.id} FAILED - ${String(err?.message || err).slice(0, 160)}`);
                        }
                    }
                    session.consoleErrors = opened.consoleErrors.slice(0, 8);
                    session.consoleErrorCount = opened.consoleErrors.length;
                    session.ok = session.shots.every(s => s.ok);
                } catch (err) {
                    failures += 1;
                    session.error = String(err?.message || err).slice(0, 600);
                    console.log(`FAILED - ${session.error.slice(0, 200)}`);
                } finally {
                    if (ctx) await ctx.close();
                }
                report.sessions.push(session);
            }
        }
    } finally {
        await browser.close();
    }

    report.frames = frames;
    report.failures = failures;
    const reportPath = resolve(args.outDir, 'water-before-report.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`[WATER] ${frames} frames written to ${args.outDir}`);
    console.log(`[WATER] report ${reportPath}`);
    const badSessions = report.sessions.filter(s => !s.ok);
    for (const s of badSessions) {
        console.log(`[WATER] session not clean: ${s.scene}/${s.tod} ${s.error ? '- ' + s.error.slice(0, 160) : ''}`);
    }
    process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error('[WATER] fatal:', err); process.exit(2); });
