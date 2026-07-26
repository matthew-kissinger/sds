// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 118 Phases 1 and 6 - the water capture, and the verdict.
 *
 * Captures the water surface on every scene that has water, at noon and at
 * dusk, on the production WebGPU path, from camera poses derived at runtime by
 * walking outward from the island until the terrain drops under the waterline.
 * Phase 1 shot the "before" set with it; Phase 6 shoots the "after" set and
 * scores the two against each other by palette histogram.
 *
 * Usage:
 *   node tools/validation/water-look.mjs
 *   node tools/validation/water-look.mjs --only=rolling-hills
 *   node tools/validation/water-look.mjs --tod=noon
 *   node tools/validation/water-look.mjs --out=cycle118-validation/water-after
 *   node tools/validation/water-look.mjs --compare=off
 *   node tools/validation/water-look.mjs --compare-only
 *
 * The out directory defaults to `water-after` and the compare directory to
 * `water-before`, so a bare run can never overwrite Phase 1's frozen reference.
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
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
        // Cycle 118 Phase 6: the default moved off the before-set. Phase 1's
        // frames are a frozen reference and re-running the tool must never be
        // able to overwrite them.
        outDir: resolve(ROOT, 'cycle118-validation', 'water-after'),
        compareDir: resolve(ROOT, 'cycle118-validation', 'water-before'),
        compareOnly: false,
    };
    for (const a of argv.slice(2)) {
        const [k, v] = a.replace(/^--/, '').split('=');
        if (k === 'only' && v) out.only = v.split(',').map(s => s.trim()).filter(Boolean);
        if (k === 'tod' && v) out.tod = v.split(',').map(s => s.trim()).filter(Boolean);
        if (k === 'out' && v) out.outDir = resolve(ROOT, v);
        if (k === 'compare' && v) out.compareDir = resolve(ROOT, v);
        if (k === 'compare' && v === 'off') out.compareDir = null;
        if (k === 'compare-only') out.compareOnly = true;
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
function deriveShorelineInPage({ shoreOutStandoff }) {
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
    const outCam = { x: P.x - D.x * shoreOutStandoff, z: P.z - D.z * shoreOutStandoff };
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

    const r3 = (n) => Math.round(n * 10) / 10;
    // Cycle 118 Phase 6: the poses are BUILT IN NODE now, by buildWaterPoses,
    // from the geometry this returns. They used to be assembled here, inside
    // page.evaluate, where nothing off-browser could see the framing maths - and
    // the framing maths was wrong (see buildWaterPoses for what and why). What
    // stays in the page is the part that genuinely needs the heightfield: the
    // shoreline solve and the ground height under each camera.
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
        frame: {
            P,
            D,
            T,
            alongOut,
            openOut,
            cameras: {
                out: { ...outCam, groundY: groundY(outCam.x, outCam.z) },
                along: { ...alongCam, groundY: groundY(alongCam.x, alongCam.z) },
                wide: { ...wideCam, groundY: groundY(wideCam.x, wideCam.z) },
                open: { ...openCam, groundY: groundY(openCam.x, openCam.z) },
            },
        },
    };
}

/**
 * How far inland of the waterline the `shore-out` camera stands, in metres.
 * The pitch solve needs the same number the camera was placed with, so it is
 * passed INTO the page rather than duplicated there: page.evaluate serialises
 * the function source and it cannot close over module scope, and a second
 * literal in the page is exactly how a framing constant drifts from the framing
 * maths that reads it.
 */
export const SHORE_OUT_STANDOFF = 12;

/**
 * Cycle 118 Phase 6 - the `shore-out` pitch fix, and the reason the poses moved
 * out of the page.
 *
 * The pose used to aim at a point 150 m out to sea at the water's surface. On a
 * gentle coast that is a near-level shot; on Rolling Hills, where the ground is
 * 12.7 m up only 12 m inland of the waterline, the camera lands at y=14.72 and
 * the aim drops it 5.4 degrees. The shoreline it is supposed to be framing sits
 * atan(14.77 / 12) = 50.9 degrees below horizontal, so it fell far outside the
 * frame and two of that scene's four frames came back as duplicates of
 * `open-water`. Rolling Hills is the scene most players see first and its
 * near-shore water was covered by a single pose.
 *
 * The fix is to derive the pitch instead of fixing the target distance: aim the
 * view axis at the BISECTOR of the shoreline and the horizon, so both land the
 * same angular distance from frame centre and the composition degrades
 * gracefully on any coast. The camera is 75 degrees vertical FOV
 * (js/SceneManager.js), so the bisector fits anything up to a 75-degree
 * depression; Rolling Hills needs 50.9 and asks for a 25.4-degree pitch.
 *
 * The clamps only bite outside that: MAX_PITCH_DEG keeps the horizon inside the
 * frame if a future coast is steeper still, and MIN_PITCH_DEG stops a camera
 * that is nearly at sea level from aiming at infinity.
 *
 * Pure, exported, and unit-tested (tests/water-look-poses.spec.js) precisely
 * because the bug it fixes was a geometry error that no browser run could have
 * caught - both frames rendered fine, they just did not contain the subject.
 */
export const SHORE_OUT_PITCH = Object.freeze({
    minDeg: 3,
    maxDeg: 30,
    eyeAboveGround: 2.0,
    eyeAboveWater: 2.0,
});

export function buildWaterPoses(shore) {
    const { waterY, frame } = shore;
    const { P, D, T, cameras } = frame;
    const camY = (camera, above, floor) => Math.max(camera.groundY + above, waterY + floor);

    const outY = camY(cameras.out, SHORE_OUT_PITCH.eyeAboveGround, SHORE_OUT_PITCH.eyeAboveWater);
    const outHeight = outY - waterY;
    const depressionToShore = Math.atan2(outHeight, SHORE_OUT_STANDOFF);
    const pitch = Math.min(
        Math.max(depressionToShore * 0.5, SHORE_OUT_PITCH.minDeg * Math.PI / 180),
        SHORE_OUT_PITCH.maxDeg * Math.PI / 180,
    );
    // Horizontal distance from the CAMERA to the aim point on the water.
    const outAim = outHeight / Math.tan(pitch);

    return [
        {
            id: 'shore-out',
            subject: 'low on the beach looking out to sea: foam line, shallow band, deep band, horizon',
            pos: { x: cameras.out.x, y: outY, z: cameras.out.z },
            target: {
                x: cameras.out.x + D.x * outAim,
                y: waterY,
                z: cameras.out.z + D.z * outAim,
            },
            framing: {
                camHeightAboveWater: outHeight,
                shoreStandoff: SHORE_OUT_STANDOFF,
                depressionToShoreDeg: depressionToShore * 180 / Math.PI,
                pitchDeg: pitch * 180 / Math.PI,
                aimDistance: outAim,
            },
        },
        {
            id: 'shore-along',
            subject: 'just off the shore looking along it: the foam band across frame, shore contact',
            pos: { x: cameras.along.x, y: waterY + 2.6, z: cameras.along.z },
            target: { x: P.x + T.x * 45 + D.x * 2, y: waterY + 0.5, z: P.z + T.z * 45 + D.z * 2 },
        },
        {
            id: 'water-wide',
            subject: 'elevated pull-back: colour gradient, the whole coast read, water-to-sky seam',
            pos: { x: cameras.wide.x, y: camY(cameras.wide, 50, 50), z: cameras.wide.z },
            target: { x: P.x + D.x * 280, y: waterY, z: P.z + D.z * 280 },
        },
        {
            id: 'open-water',
            subject: 'open sea, no land in frame: ripple read, sun specular, water-plane horizon seam',
            pos: { x: cameras.open.x, y: waterY + 3.2, z: cameras.open.z },
            target: {
                x: cameras.open.x + D.x * 300,
                y: waterY + 1.4,
                z: cameras.open.z + D.z * 300,
            },
        },
    ];
}

/**
 * Is the waterline inside the vertical frame of a `shore-out` pose? The
 * question the acceptance criterion asks, answered off-browser.
 *
 * The pitch is measured from the pose's OWN camera and target, not read back
 * off `framing.pitchDeg`. Reading the recorded number would make this a check
 * that the solver agrees with itself: a mutation that leaves the pitch solve
 * alone and aims the target somewhere else entirely still passes, which is the
 * exact bug being fixed and the exact shape of spec this program keeps shipping.
 */
export function shorelineIsInFrame(pose, verticalFovDeg = 75) {
    const { camHeightAboveWater, shoreStandoff } = pose.framing ?? {};
    if (!Number.isFinite(camHeightAboveWater)) return null;
    const run = Math.hypot(pose.target.x - pose.pos.x, pose.target.z - pose.pos.z);
    const pitchDeg = Math.atan2(pose.pos.y - pose.target.y, run) * 180 / Math.PI;
    const depression = Math.atan2(camHeightAboveWater, shoreStandoff) * 180 / Math.PI;
    return {
        shorelineBelowAxisDeg: depression - pitchDeg,
        horizonAboveAxisDeg: pitchDeg,
        halfFovDeg: verticalFovDeg / 2,
        shorelineInFrame: (depression - pitchDeg) < verticalFovDeg / 2,
        horizonInFrame: pitchDeg < verticalFovDeg / 2,
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

// ---------------------------------------------------------------------------
// The palette histogram
// ---------------------------------------------------------------------------

/**
 * Cycle 118 Phase 6 - the comparison, and why it is a histogram and not SSIM.
 *
 * The question D-W actually poses is "is it still anime cobalt", which is a
 * question about WHICH COLOURS are on the screen and in what proportion. SSIM
 * answers a different question - "are these two frames structurally the same" -
 * and answers it badly here, because an animated surface differs from itself by
 * ripple phase and SSIM cannot tell that apart from a rewrite. A hue/saturation
 * histogram is blind to phase and reads the thing under test directly.
 *
 * `cobaltFraction` is the headline: the share of non-sky pixels sitting in the
 * saturated blue wedge the retired palette occupied. Blue-wedge bounds are
 * generous on purpose (200 to 265 degrees covers #002477 at 217 and #103662 at
 * 213) and the saturation gate at 0.5 is what separates a cobalt sea from a
 * pale blue sky.
 */
const HISTOGRAM_SIZE = { width: 400, height: 225 };
const HUE_BUCKETS = 12;

function rgbToHsv(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let hue = 0;
    if (delta > 0) {
        if (max === r) hue = 60 * (((g - b) / delta) % 6);
        else if (max === g) hue = 60 * ((b - r) / delta + 2);
        else hue = 60 * ((r - g) / delta + 4);
    }
    if (hue < 0) hue += 360;
    return { hue, saturation: max === 0 ? 0 : delta / max, value: max / 255 };
}

export function paletteHistogramFromPixels(pixels, channels, options = {}) {
    const buckets = new Array(HUE_BUCKETS * 2).fill(0);
    let neutral = 0;
    let cobalt = 0;
    let total = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let i = 0; i < pixels.length; i += channels) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const { hue, saturation, value } = rgbToHsv(r, g, b);
        total += 1;
        sumR += r; sumG += g; sumB += b;
        if (saturation < 0.12 || value < 0.05) { neutral += 1; continue; }
        const hueIndex = Math.min(HUE_BUCKETS - 1, Math.floor(hue / (360 / HUE_BUCKETS)));
        buckets[hueIndex * 2 + (saturation >= 0.5 ? 1 : 0)] += 1;
        if (hue >= 200 && hue < 265 && saturation >= 0.5) cobalt += 1;
    }
    const share = (n) => Math.round((n / total) * 10000) / 10000;
    const labelled = buckets.map((count, index) => ({
        hue: `${(index >> 1) * (360 / HUE_BUCKETS)}-${((index >> 1) + 1) * (360 / HUE_BUCKETS)}`,
        sat: (index & 1) ? 'high' : 'low',
        share: share(count),
    })).filter((entry) => entry.share > 0.005);
    labelled.sort((a, b) => b.share - a.share);
    return {
        pixels: total,
        meanRgb: [Math.round(sumR / total), Math.round(sumG / total), Math.round(sumB / total)],
        neutralShare: share(neutral),
        cobaltFraction: share(cobalt),
        topBuckets: labelled.slice(0, 4),
    };
}

/**
 * Whole frame, plus the bottom 45% of it on its own.
 *
 * The whole-frame number is diluted by sky: the dusk sky is itself a saturated
 * blue that lands inside the cobalt wedge, so a dusk frame reads 30% cobalt with
 * a perfectly teal sea. The lower band is water in `shore-out`, `shore-along`
 * and `open-water` (it is land in `water-wide`, noted in the report), so it is
 * the honest read of the thing under test.
 */
const WATER_BAND_FRACTION = 0.45;

async function paletteHistogram(pngBuffer) {
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(pngBuffer)
        .resize(HISTOGRAM_SIZE.width, HISTOGRAM_SIZE.height, { fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const bandStart = Math.floor(info.height * (1 - WATER_BAND_FRACTION)) * info.width * info.channels;
    return {
        ...paletteHistogramFromPixels(data, info.channels),
        lowerBand: paletteHistogramFromPixels(data.subarray(bandStart), info.channels),
    };
}

async function compareAgainst(beforeDir, afterDir, frameNames) {
    const rows = [];
    for (const name of frameNames) {
        const beforePath = resolve(beforeDir, name);
        const afterPath = resolve(afterDir, name);
        if (!existsSync(beforePath) || !existsSync(afterPath)) {
            rows.push({ file: name, ok: false, reason: existsSync(beforePath) ? 'after missing' : 'before missing' });
            continue;
        }
        const [before, after] = await Promise.all([
            paletteHistogram(await readFile(beforePath)),
            paletteHistogram(await readFile(afterPath)),
        ]);
        rows.push({
            file: name,
            ok: true,
            before,
            after,
            cobaltDelta: Math.round((after.cobaltFraction - before.cobaltFraction) * 10000) / 10000,
        });
    }
    return rows;
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

    // --compare-only re-scores two directories of frames that already exist. No
    // browser, no capture: useful for re-reading a comparison without spending
    // a WebGPU session on it.
    if (args.compareOnly) {
        const names = scenes.flatMap(s => times.flatMap(t => ['shore-out', 'shore-along', 'water-wide', 'open-water']
            .map(p => `${s}__${t.id}__${p}.png`)));
        const rows = await compareAgainst(args.compareDir, args.outDir, names);
        for (const row of rows) {
            if (!row.ok) { console.log(`[WATER] ${row.file}  SKIPPED (${row.reason})`); continue; }
            console.log(`[WATER] ${row.file.padEnd(44)} cobalt ${(row.before.cobaltFraction * 100).toFixed(1)}% -> `
                + `${(row.after.cobaltFraction * 100).toFixed(1)}%   mean rgb [${row.before.meanRgb}] -> [${row.after.meanRgb}]`);
        }
        process.exit(0);
    }

    await mkdir(args.outDir, { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: false, args: WEBGPU_LAUNCH_ARGS });

    const report = {
        cycle: 118,
        phase: 6,
        purpose: 'water "after" capture, production WebGPU path, compared against the Phase 1 before-set by palette histogram',
        comparedAgainst: args.compareDir ? args.compareDir.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, '') : null,
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

                    const shore = await page.evaluate(deriveShorelineInPage, {
                        shoreOutStandoff: SHORE_OUT_STANDOFF,
                    });
                    if (shore?.error) throw new Error(`shoreline derivation failed: ${shore.error}`);
                    const poses = buildWaterPoses(shore);
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
                        frame: shore.frame,
                    };
                    session.shoreOutFraming = shorelineIsInFrame(poses[0]);
                    console.log(`[WATER]   shore-out framing: cam ${session.shoreOutFraming.horizonAboveAxisDeg.toFixed(1)}deg pitch, `
                        + `shoreline ${session.shoreOutFraming.shorelineBelowAxisDeg.toFixed(1)}deg below axis `
                        + `(half-FOV ${session.shoreOutFraming.halfFovDeg}deg, in frame=${session.shoreOutFraming.shorelineInFrame})`);
                    console.log(`[WATER]   shore: anchor=(${shore.anchor.x},${shore.anchor.z}) `
                        + `heading=${shore.heading}deg crossing=(${shore.crossing.x},${shore.crossing.z}) `
                        + `dist=${shore.crossing.dist}m ring=${shore.ringCount}/36 waterY=${shore.waterY} `
                        + `seawardLimit=${shore.seawardLimit}m skirt=${shore.skirtRadius ?? 'none within 500m'}`);

                    for (const pose of poses) {
                        const name = `${scene}__${tod.id}__${pose.id}.png`;
                        try {
                            const png = await shootPose(page, pose, tod);
                            await writeFile(resolve(args.outDir, name), png);
                            frames += 1;
                            session.shots.push({
                                id: pose.id, file: name, ok: true, bytes: png.length,
                                subject: pose.subject, pos: pose.pos, target: pose.target,
                                framing: pose.framing ?? null,
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

    if (args.compareDir) {
        const names = report.sessions.flatMap(s => s.shots.filter(x => x.ok).map(x => x.file));
        report.paletteComparison = {
            method: 'hue/saturation histogram, 12 hue buckets x 2 saturation bands, frames resized to 400x225',
            cobaltWedge: 'hue 200-265 deg with saturation >= 0.5',
            rows: await compareAgainst(args.compareDir, args.outDir, names),
        };
        console.log('\n[WATER] palette histogram, before -> after');
        for (const row of report.paletteComparison.rows) {
            if (!row.ok) { console.log(`[WATER]   ${row.file}  SKIPPED (${row.reason})`); continue; }
            console.log(`[WATER]   ${row.file.padEnd(44)} cobalt frame ${(row.before.cobaltFraction * 100).toFixed(1)}%`
                + ` -> ${(row.after.cobaltFraction * 100).toFixed(1)}%   water band `
                + `${(row.before.lowerBand.cobaltFraction * 100).toFixed(1)}% -> ${(row.after.lowerBand.cobaltFraction * 100).toFixed(1)}%`
                + `   mean rgb [${row.before.lowerBand.meanRgb}] -> [${row.after.lowerBand.meanRgb}]`);
        }
        const usable = report.paletteComparison.rows.filter(r => r.ok);
        if (usable.length) {
            const mean = (pick) => usable.reduce((acc, r) => acc + pick(r), 0) / usable.length;
            report.paletteComparison.meanCobaltBefore = Math.round(mean(r => r.before.cobaltFraction) * 10000) / 10000;
            report.paletteComparison.meanCobaltAfter = Math.round(mean(r => r.after.cobaltFraction) * 10000) / 10000;
            report.paletteComparison.meanWaterBandCobaltBefore = Math.round(mean(r => r.before.lowerBand.cobaltFraction) * 10000) / 10000;
            report.paletteComparison.meanWaterBandCobaltAfter = Math.round(mean(r => r.after.lowerBand.cobaltFraction) * 10000) / 10000;
            console.log(`[WATER]   mean cobalt fraction: whole frame `
                + `${(report.paletteComparison.meanCobaltBefore * 100).toFixed(1)}% -> ${(report.paletteComparison.meanCobaltAfter * 100).toFixed(1)}%`
                + `, water band ${(report.paletteComparison.meanWaterBandCobaltBefore * 100).toFixed(1)}%`
                + ` -> ${(report.paletteComparison.meanWaterBandCobaltAfter * 100).toFixed(1)}%`);
        }
    }

    const reportPath = resolve(args.outDir, 'water-report.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`[WATER] ${frames} frames written to ${args.outDir}`);
    console.log(`[WATER] report ${reportPath}`);
    const badSessions = report.sessions.filter(s => !s.ok);
    for (const s of badSessions) {
        console.log(`[WATER] session not clean: ${s.scene}/${s.tod} ${s.error ? '- ' + s.error.slice(0, 160) : ''}`);
    }
    process.exit(failures ? 1 : 0);
}

// Only run when invoked directly. tests/water-look-poses.spec.js imports
// buildWaterPoses from here, and importing a module that launches Chrome as a
// side effect is how a unit test turns into a browser session.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((err) => { console.error('[WATER] fatal:', err); process.exit(2); });
}
