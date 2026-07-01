// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// v2.6.1 trailer capture runner. Implements the decided capture architecture
// (docs/capture-pipeline-spike-2026-05.md): the in-game shot director
// (js/cinematic.js __sdsCinema) stages and steps every shot frame-exactly;
// the master recorder is Mediabunny running inside the page (CanvasSource ->
// H.264 MP4, hardware WebCodecs encode), with the proven page.screenshot +
// ffmpeg frame-dump path kept as the deterministic fallback.
//
// Mediabunny is injected into the built page from node_modules at runtime
// (blob-URL module import), so it stays a dev/capture dependency and never
// enters the production bundle.
//
// Usage:
//   npm run build
//   SDS_SUPPRESS_BROWSER_OPEN=1 npx vite preview --host 127.0.0.1 --port 4173
//   node tools/trailer/capture.mjs --shot=rh-flock-mass --preview   # contact sheet
//   node tools/trailer/capture.mjs --shot=rh-flock-mass --video     # master mp4
//   node tools/trailer/capture.mjs --all --video                    # everything
//   node tools/trailer/capture.mjs --all --video --recorder=frames  # fallback path
//
// Outputs land in tools/trailer/output/ (gitignored): <id>.mp4, contact
// sheets, and manifest.json with per-clip validation results.

import { chromium } from 'playwright';
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync, appendFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS, FPS as DEFAULT_FPS, WIDTH, HEIGHT } from './shots.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(ROOT, 'tools/trailer/output');
const MEDIABUNNY_BUNDLE = resolve(ROOT, 'node_modules/mediabunny/dist/bundles/mediabunny.min.mjs');
const BASE_URL = argValue('--base-url') ?? 'http://127.0.0.1:4173/';
const FPS = Number(argValue('--fps') ?? DEFAULT_FPS);
const WANT_VIDEO = process.argv.includes('--video');
const WANT_PREVIEW = process.argv.includes('--preview');
const WANT_ALL = process.argv.includes('--all');
const RECORDER = argValue('--recorder') ?? 'mediabunny';
const ONLY_SHOT = argValue('--shot');
const BITRATE = Number(argValue('--bitrate') ?? 16_000_000);
// Probe aid: override every planned shot's duration (ms), e.g. --duration=2000
// for the 2-second recorder acceptance probe from the capture spike doc.
const DURATION_OVERRIDE = argValue('--duration') ? Number(argValue('--duration')) : null;
// The throttling flags matter: an occluded/unfocused Chrome window throttles
// requestAnimationFrame to zero, which dead-hangs every rAF-driven wait in
// the page (waitReady, waitForFlockSize) when the runner is launched from an
// unattended shell.
const GPU_ARGS = [
    ...(process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : []),
    '--no-sandbox', '--hide-scrollbars',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
];

function argValue(name) {
    const prefix = `${name}=`;
    const hit = process.argv.find((arg) => arg.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : null;
}

function buildUrl(shot) {
    const url = new URL(BASE_URL);
    if (shot.renderer) url.searchParams.set('renderer', shot.renderer);
    url.searchParams.set('scene', shot.scene);
    url.searchParams.set('cinematic', '1');
    url.searchParams.set('ui', 'off');
    return url.toString();
}

async function shotPng(page, path) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try { await page.screenshot({ path, type: 'png', fullPage: false }); return; }
        catch (err) { if (attempt === 2) throw err; await page.waitForTimeout(120); }
    }
}

// ---------------------------------------------------------------------------
// Page boot + in-page driver install
// ---------------------------------------------------------------------------

async function bootPage(browser, shot) {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    const errors = [];
    page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
        else if (m.text().startsWith('[TRAILERCAP]')) console.log(`    ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(buildUrl(shot), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => Boolean(window.__sdsCinema), null, { timeout: 90_000 });
    await page.evaluate(() => window.__sdsCinema.waitReady?.(90_000));
    await page.waitForFunction(
        () => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true,
        null, { timeout: 120_000 },
    ).catch(() => {});
    await page.waitForTimeout(4_000);
    await installDriver(page);
    return { page, errors };
}

// Everything the capture loop needs inside the page, installed once per page.
// Serialized as a single function; must not close over Node scope.
async function installDriver(page) {
    await page.evaluate(() => {
        if (window.__trailerCap) return;

        const cap = {
            // --- generic helpers -------------------------------------------------
            mainCanvas() {
                const canvases = Array.from(document.querySelectorAll('canvas'));
                return canvases
                    .map((c) => ({ c, a: c.clientWidth * c.clientHeight }))
                    .sort((x, y) => y.a - x.a)[0]?.c ?? null;
            },
            hideNonCanvasUi() {
                const main = cap.mainCanvas();
                const keep = new Set();
                for (let n = main; n; n = n.parentElement) keep.add(n);
                for (const el of Array.from(document.querySelectorAll('body *'))) {
                    if (!keep.has(el)) { el.style.visibility = 'hidden'; el.style.pointerEvents = 'none'; }
                }
            },
            samplePath(path, t) {
                let a = path[0], b = path[path.length - 1];
                for (let i = 0; i < path.length - 1; i++) {
                    if (t >= path[i].t && t <= path[i + 1].t) { a = path[i]; b = path[i + 1]; break; }
                }
                const span = Math.max(1e-6, b.t - a.t);
                const k = Math.max(0, Math.min(1, (t - a.t) / span));
                const sk = k * k * (3 - 2 * k);
                const L = (p, q) => p + (q - p) * sk;
                return {
                    pos: { x: L(a.pos.x, b.pos.x), y: L(a.pos.y, b.pos.y), z: L(a.pos.z, b.pos.z) },
                    target: { x: L(a.target.x, b.target.x), y: L(a.target.y, b.target.y), z: L(a.target.z, b.target.z) },
                };
            },
            sheep() {
                return window.gameInstance?.gameState?.optimizedSheepSystem?.sheep ?? [];
            },
            dog() {
                return window.gameInstance?.gameState?.getSheepdog?.() ?? null;
            },
            flockCentroid(list) {
                const sheep = list ?? cap.sheep();
                if (!sheep.length) return { x: 0, z: 0 };
                let x = 0, z = 0;
                for (const s of sheep) { x += s.position.x; z += s.position.z; }
                return { x: x / sheep.length, z: z / sheep.length };
            },
            densestSheep() {
                const sheep = cap.sheep();
                let best = null, bestCount = -1;
                for (const s of sheep) {
                    let count = 0;
                    for (const o of sheep) {
                        const dx = o.position.x - s.position.x, dz = o.position.z - s.position.z;
                        if (dx * dx + dz * dz < 625) count++;
                    }
                    if (count > bestCount) { bestCount = count; best = s; }
                }
                return best;
            },
            nearestSheepCentroid(px, pz, n) {
                const sheep = cap.sheep();
                if (!sheep.length) return { x: px, z: pz };
                const nearest = sheep
                    .map((sh) => ({ sh, d: (sh.position.x - px) ** 2 + (sh.position.z - pz) ** 2 }))
                    .sort((a, b) => a.d - b.d)
                    .slice(0, n);
                let cx = 0, cz = 0;
                for (const { sh } of nearest) { cx += sh.position.x; cz += sh.position.z; }
                return { x: cx / nearest.length, z: cz / nearest.length };
            },

            // --- staging ----------------------------------------------------------
            applyStage(stage) {
                const c = window.__sdsCinema;
                const game = window.gameInstance;
                if (!stage) return;
                if (stage.forceObjectiveDrive) {
                    const obj = game.gameState?.objective;
                    if (obj) {
                        obj.stage = 'drive';
                        obj.holdTimer = obj.holdRequired ?? 0;
                    }
                    game._portalEffect?.setIntensity?.(1);
                    window.dispatchEvent(new CustomEvent('objective-stage-changed', { detail: { stage: 'drive' } }));
                }
                if (stage.teleportFlock) {
                    const { x, z, radius, count } = stage.teleportFlock;
                    const sheep = cap.sheep();
                    const picked = Number.isFinite(count) && count < sheep.length
                        ? sheep
                            .map((sh) => ({ sh, d: (sh.position.x - x) ** 2 + (sh.position.z - z) ** 2 }))
                            .sort((a, b) => a.d - b.d)
                            .slice(0, count)
                            .map((e) => e.sh)
                        : sheep;
                    // Deterministic golden-angle spiral fill of the disc: even
                    // coverage without Math.random.
                    for (let i = 0; i < picked.length; i++) {
                        const s = picked[i];
                        const r = radius * Math.sqrt((i + 0.5) / picked.length);
                        const theta = i * 2.39996322973;
                        s.position.x = x + Math.cos(theta) * r;
                        s.position.z = z + Math.sin(theta) * r;
                        if (s.velocity) { s.velocity.x = 0; s.velocity.z = 0; }
                    }
                }
                if (stage.poseDogAt) {
                    const { x, z, faceToward } = stage.poseDogAt;
                    let v = { x: 0, z: 0.01 };
                    if (faceToward) {
                        const dx = faceToward.x - x, dz = faceToward.z - z;
                        const len = Math.hypot(dx, dz) || 1;
                        v = { x: (dx / len) * 0.02, z: (dz / len) * 0.02 };
                    }
                    c.poseDog(x, z, v, 1 / 60);
                }
            },

            // --- per-frame steering -----------------------------------------------
            // tSec is shot time; passed explicitly because steer also runs
            // during beginShot's settle loop, before the frame counter exists.
            steer(steering, dt, tSec) {
                const c = window.__sdsCinema;
                const dog = cap.dog();
                if (!dog || !steering || steering.type === 'none') return;
                const cap8 = steering.speedCap ?? 8;
                if (steering.type === 'chase') {
                    const target = cap.nearestSheepCentroid(dog.position.x, dog.position.z, 30);
                    const dx = target.x - dog.position.x, dz = target.z - dog.position.z;
                    const dist = Math.hypot(dx, dz) || 1;
                    const speed = Math.min(cap8, dist);
                    c.poseDog(
                        dog.position.x + (dx / dist) * speed * dt,
                        dog.position.z + (dz / dist) * speed * dt,
                        { x: (dx / dist) * speed, z: (dz / dist) * speed },
                        dt,
                    );
                } else if (steering.type === 'sprint') {
                    const s = cap._sprint;
                    if (s) {
                        c.poseDog(
                            dog.position.x + s.dir.x * cap8 * dt,
                            dog.position.z + s.dir.z * cap8 * dt,
                            { x: s.dir.x * cap8, z: s.dir.z * cap8 },
                            dt,
                        );
                    }
                } else if (steering.type === 'drive') {
                    // Hold a pressure point behind the working flock, pushing it
                    // toward `toward`, with a lateral flanking weave so the dog
                    // sweeps behind the flock instead of splitting it up the
                    // middle. Classic drive read.
                    const flock = cap.nearestSheepCentroid(dog.position.x, dog.position.z, 60);
                    const tx = steering.toward.x, tz = steering.toward.z;
                    let bx = flock.x - tx, bz = flock.z - tz;
                    const blen = Math.hypot(bx, bz) || 1;
                    bx /= blen; bz /= blen;
                    const press = steering.pressDist ?? 14;
                    const swing = steering.swing ?? 10;
                    const swingHz = steering.swingHz ?? 0.4;
                    const phase = Math.sin((tSec ?? 0) * Math.PI * 2 * swingHz);
                    const px = flock.x + bx * press + -bz * swing * phase;
                    const pz = flock.z + bz * press + bx * swing * phase;
                    const dx = px - dog.position.x, dz = pz - dog.position.z;
                    const dist = Math.hypot(dx, dz) || 1;
                    const speed = Math.min(cap8, dist * 1.5);
                    if (dist > 0.5 && Number.isFinite(px) && Number.isFinite(pz)) {
                        c.poseDog(
                            dog.position.x + (dx / dist) * speed * dt,
                            dog.position.z + (dz / dist) * speed * dt,
                            { x: (dx / dist) * speed, z: (dz / dist) * speed },
                            dt,
                        );
                    }
                }
            },

            // --- per-frame camera ---------------------------------------------------
            aimCamera(camera, t, i, durationMs) {
                const c = window.__sdsCinema;
                if (camera.type === 'chaseCam') {
                    // Like cinema.setDogTrackCamera but with a taller ground
                    // clamp so hillside grass (~1.5m blades) stays out of the
                    // lens on the uphill side.
                    const dog = cap.dog();
                    if (!dog) return;
                    const vx = dog.velocity?.x ?? 0, vz = dog.velocity?.z ?? 0;
                    const speed = Math.hypot(vx, vz);
                    const yaw = dog.currentRotation ?? 0;
                    const fwd = speed > 0.01
                        ? { x: vx / speed, z: vz / speed }
                        : { x: Math.sin(yaw), z: Math.cos(yaw) };
                    // Smooth the forward direction so boid-chase jitter doesn't
                    // whip the camera.
                    const sm = cap._chaseFwd ?? fwd;
                    const k = 0.12;
                    const nx = sm.x + (fwd.x - sm.x) * k, nz = sm.z + (fwd.z - sm.z) * k;
                    const nl = Math.hypot(nx, nz) || 1;
                    cap._chaseFwd = { x: nx / nl, z: nz / nl };
                    const f = cap._chaseFwd;
                    const right = { x: f.z, z: -f.x };
                    const side = camera.side ?? -8, back = camera.back ?? 10;
                    const height = camera.height ?? 6, lookAhead = camera.lookAhead ?? 8;
                    const lookHeight = camera.lookHeight ?? 1.4, minGround = camera.minGround ?? 3.0;
                    const camX = dog.position.x - f.x * back + right.x * side;
                    const camZ = dog.position.z - f.z * back + right.z * side;
                    const dogY = c.getTerrainY(dog.position.x, dog.position.z);
                    const camY = Math.max(c.getTerrainY(camX, camZ) + minGround, dogY + height);
                    c.setCameraPose(
                        { x: camX, y: camY, z: camZ },
                        {
                            x: dog.position.x + f.x * lookAhead,
                            y: dogY + lookHeight,
                            z: dog.position.z + f.z * lookAhead,
                        },
                    );
                } else if (camera.type === 'track') {
                    c.setDogTrackCamera({
                        side: camera.side, back: camera.back,
                        height: camera.height, lookAhead: camera.lookAhead,
                    });
                } else if (camera.type === 'orbit') {
                    const o = cap._orbit;
                    const theta = (o.theta0 ?? 0) + t * Math.PI * 2 * (camera.sweep ?? 0.35);
                    c.setCameraPose(
                        {
                            x: o.cx + Math.cos(theta) * camera.radius,
                            y: c.getTerrainY(o.cx, o.cz) + camera.height,
                            z: o.cz + Math.sin(theta) * camera.radius,
                        },
                        { x: o.cx, y: c.getTerrainY(o.cx, o.cz) + 2, z: o.cz },
                    );
                } else if (camera.type === 'static') {
                    c.setCameraPose(camera.pos, camera.target);
                } else if (camera.type === 'path') {
                    const f = cap.samplePath(camera.path, t);
                    c.setCameraPose(f.pos, f.target);
                }
            },

            // --- shot lifecycle -------------------------------------------------------
            beginShot(shot, fps) {
                const c = window.__sdsCinema;
                c.pauseSimulation();
                c.freeFlyActive = true;
                // Center grass/tree LOD and the compute cull on the lens for
                // the whole shot. camera.position is a live Vector3 reference,
                // so every subsequent setCameraPose keeps lodFocus current.
                if (c.camera) c.lodFocus = c.camera.position;
                c.setSun(shot.sun);
                c.hideUI();
                cap.hideNonCanvasUi();
                cap.applyStage(shot.stage);

                if (shot.camera.type === 'orbit') {
                    const centroid = shot.camera.centerOn === 'flock'
                        ? cap.flockCentroid()
                        : (shot.camera.point ?? { x: 0, z: 0 });
                    cap._orbit = { cx: centroid.x, cz: centroid.z, theta0: shot.camera.theta0 ?? 0 };
                }
                if (shot.steering?.type === 'sprint') {
                    const anchor = shot.steering.throughFlock
                        ? (cap.densestSheep()?.position ?? cap.flockCentroid())
                        : cap.flockCentroid();
                    const dir = shot.steering.dir ?? { x: 1, z: 0 };
                    const len = Math.hypot(dir.x, dir.z) || 1;
                    const d = { x: dir.x / len, z: dir.z / len };
                    const run = (shot.steering.speedCap ?? 13) * (shot.durationMs / 1000);
                    const startOffset = shot.steering.startOffset ?? 0.5;
                    window.__sdsCinema.poseDog(
                        anchor.x - d.x * run * startOffset,
                        anchor.z - d.z * run * startOffset,
                        { x: d.x * (shot.steering.speedCap ?? 13), z: d.z * (shot.steering.speedCap ?? 13) },
                        1 / 60,
                    );
                    cap._sprint = { dir: d };
                }

                // Settle: let boids reorient after staging before frame 0.
                const settle = shot.settleSteps ?? 20;
                for (let k = 0; k < settle; k++) {
                    cap.steer(shot.steering, 1 / fps, (k - settle) / fps);
                    window.gameInstance.update(1 / fps);
                }

                cap._shot = shot;
                cap._fps = fps;
                cap._frame = 0;
                cap._frames = Math.ceil((shot.durationMs / 1000) * fps);
                cap._dogVisible = 0;
                cap._sunT = null;
                cap._chaseFwd = null;

                // Static clearance guard for pre-plotted cameras: over land the
                // camera must clear terrain + tree canopy (~24m), over water
                // just the surface. Logged, not fatal - beach-hugging shots are
                // sometimes intentional.
                const clearance = [];
                const guard = (pos, where) => {
                    const ty = c.getTerrainY(pos.x, pos.z);
                    const need = ty > 0.5 ? ty + 24 : 6;
                    if (pos.y < need) clearance.push(`${where}: camY ${pos.y.toFixed(1)} < ${need.toFixed(1)} (terrain ${ty.toFixed(1)})`);
                };
                if (shot.camera.type === 'path') {
                    for (let k = 0; k <= 60; k++) guard(cap.samplePath(shot.camera.path, k / 60).pos, `t=${(k / 60).toFixed(2)}`);
                } else if (shot.camera.type === 'orbit') {
                    const o = cap._orbit;
                    for (let k = 0; k <= 60; k++) {
                        const theta = (o.theta0 ?? 0) + (k / 60) * Math.PI * 2 * (shot.camera.sweep ?? 0.35);
                        guard({
                            x: o.cx + Math.cos(theta) * shot.camera.radius,
                            y: c.getTerrainY(o.cx, o.cz) + shot.camera.height,
                            z: o.cz + Math.sin(theta) * shot.camera.radius,
                        }, `theta=${theta.toFixed(2)}`);
                    }
                }
                if (clearance.length) {
                    console.log(`[TRAILERCAP] clearance: ${clearance.length}/61 low samples; first: ${clearance[0]}`);
                }
                cap._clearance = clearance.length;
                return cap._frames;
            },

            // Advance exactly one video frame of sim + camera + render.
            stepFrame() {
                const c = window.__sdsCinema;
                const game = window.gameInstance;
                const shot = cap._shot;
                const fps = cap._fps;
                const i = cap._frame;
                const frames = cap._frames;
                const dt = 1 / fps;
                const t = frames <= 1 ? 0 : i / (frames - 1);
                const tMs = (i / fps) * 1000;

                // Sun: only re-bake when something drifted it (NSL-style day
                // loops advance inside game.update; the public scenes mostly
                // hold still, so skip the LUT re-bake when already in place).
                const atm = game.atmosphere;
                const curT = atm?.dayNight?.getT?.();
                const wantT = shot.sunTo !== undefined
                    ? shot.sun + (shot.sunTo - shot.sun) * t
                    : shot.sun;
                if (cap._sunT === null || curT === undefined || Math.abs(curT - wantT) > 2e-4) {
                    c.setSun(wantT);
                    cap._sunT = wantT;
                }
                cap.hideNonCanvasUi();

                cap.steer(shot.steering, dt, i / fps);
                game.update(dt);
                cap.aimCamera(shot.camera, t, i, shot.durationMs);

                // Re-run grass/tree LOD and the compute-cull passes for the
                // camera pose we just set, so the captured frame's culling is
                // exact instead of one rAF stale (visible as edge popping in
                // orbital shots). lodFocus makes the rAF loop agree between
                // captured frames.
                const lodCam = c.camera;
                if (lodCam && game.terrainBuilder) {
                    game.terrainBuilder.updateGrassAnimation(dt, lodCam, c.lodFocus ?? lodCam.position, null);
                }

                for (const l of shot.lightning ?? []) {
                    if (tMs >= l.ms && tMs < l.ms + 300) c.triggerLightning(l.pos);
                }

                // Deterministic water: ripples keyed to shot time, not capture
                // wall-clock pace.
                const sunDir = atm?.getSunDirection?.();
                const sunColor = atm?.sun?.light?.color;
                game._animeWater?.update?.(tMs / 1000, sunDir, sunColor);

                c.renderFrame();

                // Dog-visibility validation sample: project dog chest height
                // into NDC against the live camera.
                const dog = cap.dog();
                const cam = c.camera;
                if (dog?.mesh && cam) {
                    const p = dog.mesh.position.clone();
                    p.y += 0.8;
                    p.project(cam);
                    if (p.x > -1 && p.x < 1 && p.y > -1 && p.y < 1 && p.z > 0 && p.z < 1) {
                        cap._dogVisible++;
                    }
                }

                cap._frame++;
                return { frame: cap._frame, frames, dogVisible: cap._dogVisible };
            },

            // --- Mediabunny recorder ---------------------------------------------------
            async recBegin(fps, bitrate) {
                const M = window.__mediabunny;
                if (!M) throw new Error('mediabunny not injected');
                const canvas = cap.mainCanvas();
                if (!canvas) throw new Error('no canvas');
                cap._rec = {
                    output: new M.Output({
                        format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }),
                        target: new M.BufferTarget(),
                    }),
                };
                cap._rec.source = new M.CanvasSource(canvas, { codec: 'avc', bitrate, keyFrameInterval: 1 });
                cap._rec.output.addVideoTrack(cap._rec.source, { frameRate: fps });
                await cap._rec.output.start();
                cap._rec.fps = fps;
                cap._rec.n = 0;
                return { width: canvas.width, height: canvas.height };
            },
            async recGrab() {
                const r = cap._rec;
                await r.source.add(r.n / r.fps, 1 / r.fps);
                r.n++;
            },
            async recEnd() {
                const r = cap._rec;
                try { r.source.close?.(); } catch (e) { /* close is best-effort */ }
                await r.output.finalize();
                cap._bytes = new Uint8Array(r.output.target.buffer);
                cap._rec = null;
                return cap._bytes.length;
            },
            readBytes(offset, length) {
                const slice = cap._bytes.subarray(offset, offset + length);
                let bin = '';
                const CHUNK = 0x8000;
                for (let i = 0; i < slice.length; i += CHUNK) {
                    bin += String.fromCharCode.apply(null, slice.subarray(i, i + CHUNK));
                }
                return btoa(bin);
            },
            dropBytes() { cap._bytes = null; },
        };

        window.__trailerCap = cap;
        console.log('[TRAILERCAP] driver installed');
    });
}

async function injectMediabunny(page) {
    const src = await readFile(MEDIABUNNY_BUNDLE, 'utf8');
    await page.evaluate(async (code) => {
        if (window.__mediabunny) return;
        const blob = new Blob([code], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        window.__mediabunny = await import(url);
        URL.revokeObjectURL(url);
    }, src);
}

// ---------------------------------------------------------------------------
// Gameplay boot per session
// ---------------------------------------------------------------------------

async function startGameplay(page, shot, id) {
    await page.evaluate(({ dog, mode, sun }) => {
        const c = window.__sdsCinema;
        c.startSolo(dog, mode);
        c.hideUI(); // gameplay start remounts the HUD overlay even with ?ui=off
        c.setSun(sun);
    }, { dog: shot.dog ?? 'jep', mode: shot.mode, sun: shot.sun });
    await page.evaluate(() => window.__trailerCap.hideNonCanvasUi());

    if (shot.waitForFlockSize) {
        console.log(`  [${id}] waiting for ${shot.waitForFlockSize} sheep...`);
        const reached = await page.evaluate(
            ({ target, timeout }) => window.__sdsCinema.waitForFlockSize(target, timeout),
            { target: shot.waitForFlockSize, timeout: shot.flockTimeoutMs ?? 90_000 },
        ).catch((err) => { console.warn(`  [${id}] ${err.message} - proceeding`); return 0; });
        console.log(`  [${id}] flock at ${reached}`);
    }
    await page.waitForTimeout((shot.warmupSteps ?? 60) * (1000 / 60));
    await page.evaluate(() => window.__trailerCap.hideNonCanvasUi());
}

// ---------------------------------------------------------------------------
// Capture paths
// ---------------------------------------------------------------------------

async function capturePreview(page, shot, id) {
    const marks = [0, 0.2, 0.45, 0.68, 0.86, 1];
    const frames = await page.evaluate(
        ({ shot, fps }) => window.__trailerCap.beginShot(shot, fps),
        { shot, fps: FPS },
    );
    const stills = [];
    let done = 0;
    for (const mark of marks) {
        const until = Math.max(1, Math.round(mark * (frames - 1)) + 1);
        while (done < until) {
            const step = Math.min(30, until - done);
            await page.evaluate((n) => {
                for (let k = 0; k < n; k++) window.__trailerCap.stepFrame();
            }, step);
            done += step;
        }
        const p = join(OUT_DIR, `preview-${id}-t${mark.toFixed(2)}.png`);
        await shotPng(page, p);
        stills.push({ t: mark, path: p });
    }
    // Contact sheet
    const TW = 620, TH = 349, LABEL = 26, GAP = 6;
    const sheetW = stills.length * (TW + GAP) + GAP, sheetH = TH + LABEL + 2 * GAP;
    const comps = [];
    for (let i = 0; i < stills.length; i++) {
        const x = GAP + i * (TW + GAP);
        const tile = await sharp(stills[i].path).resize(TW, TH, { fit: 'cover' }).png().toBuffer();
        comps.push({ input: tile, left: x, top: GAP + LABEL });
        const svg = Buffer.from(`<svg width="${TW}" height="${LABEL}"><rect width="100%" height="100%" fill="#11161d"/><text x="8" y="18" font-family="monospace" font-size="14" fill="#cfe">t=${stills[i].t.toFixed(2)}</text></svg>`);
        comps.push({ input: svg, left: x, top: GAP });
    }
    const sheetPath = join(OUT_DIR, `contact-${id}.png`);
    await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#000' } })
        .composite(comps).png().toFile(sheetPath);
    console.log(`  [${id}] contact sheet -> ${sheetPath}`);
    return { contactSheet: sheetPath };
}

async function captureVideoMediabunny(page, shot, id) {
    await injectMediabunny(page);
    const frames = await page.evaluate(
        ({ shot, fps }) => window.__trailerCap.beginShot(shot, fps),
        { shot, fps: FPS },
    );
    const dims = await page.evaluate(
        ({ fps, bitrate }) => window.__trailerCap.recBegin(fps, bitrate),
        { fps: FPS, bitrate: BITRATE },
    );
    console.log(`  [${id}] mediabunny capture: ${frames} frames @ ${FPS}fps (${dims.width}x${dims.height})`);
    let progress = null;
    let done = 0;
    const t0 = Date.now();
    while (done < frames) {
        const step = Math.min(30, frames - done);
        progress = await page.evaluate(async (n) => {
            let last = null;
            for (let k = 0; k < n; k++) {
                last = window.__trailerCap.stepFrame();
                await window.__trailerCap.recGrab();
            }
            return last;
        }, step);
        done = progress.frame;
        if (done % 120 === 0 || done === frames) {
            console.log(`  [${id}] ${done}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
        }
    }
    const total = await page.evaluate(() => window.__trailerCap.recEnd());
    console.log(`  [${id}] encoded ${(total / 1e6).toFixed(1)} MB, pulling...`);
    const CHUNK = 4 * 1024 * 1024;
    const parts = [];
    for (let off = 0; off < total; off += CHUNK) {
        const b64 = await page.evaluate(
            ({ off, len }) => window.__trailerCap.readBytes(off, len),
            { off, len: Math.min(CHUNK, total - off) },
        );
        parts.push(Buffer.from(b64, 'base64'));
    }
    await page.evaluate(() => window.__trailerCap.dropBytes());
    const mp4 = join(OUT_DIR, `${id}.mp4`);
    await writeFile(mp4, Buffer.concat(parts));
    return { mp4, frames, dogVisible: progress?.dogVisible ?? 0, method: 'mediabunny-avc' };
}

async function captureVideoFrames(page, shot, id) {
    const frameDir = join(OUT_DIR, 'frames', id);
    await rm(frameDir, { recursive: true, force: true }).catch(() => {});
    await mkdir(frameDir, { recursive: true });
    const frames = await page.evaluate(
        ({ shot, fps }) => window.__trailerCap.beginShot(shot, fps),
        { shot, fps: FPS },
    );
    console.log(`  [${id}] frame-dump capture: ${frames} frames @ ${FPS}fps`);
    let progress = null;
    for (let i = 0; i < frames; i++) {
        progress = await page.evaluate(() => window.__trailerCap.stepFrame());
        await shotPng(page, join(frameDir, `${String(i).padStart(4, '0')}.png`));
        if (i > 0 && i % 120 === 0) console.log(`  [${id}] ${i}/${frames}`);
    }
    const mp4 = join(OUT_DIR, `${id}.mp4`);
    const r = spawnSync('ffmpeg', [
        '-y', '-framerate', String(FPS), '-i', join(frameDir, '%04d.png'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
        '-movflags', '+faststart', mp4,
    ], { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error(`ffmpeg mux failed for ${id}`);
    return { mp4, frames, dogVisible: progress?.dogVisible ?? 0, method: 'frames-ffmpeg' };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function ffprobe(mp4) {
    const r = spawnSync('ffprobe', [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,duration',
        '-show_entries', 'format=duration,size',
        '-of', 'json', mp4,
    ], { encoding: 'utf8', shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error(`ffprobe failed for ${mp4}`);
    return JSON.parse(r.stdout);
}

async function frameStats(mp4, seek) {
    const tmp = join(OUT_DIR, `_validate-frame.png`);
    const r = spawnSync('ffmpeg', [
        '-y', ...(seek === 'last' ? ['-sseof', '-0.2'] : ['-ss', '0']),
        '-i', mp4, '-frames:v', '1', tmp,
    ], { stdio: 'ignore', shell: process.platform === 'win32' });
    if (r.status !== 0) return null;
    const stats = await sharp(tmp).greyscale().stats();
    return { mean: stats.channels[0].mean, stdev: stats.channels[0].stdev };
}

async function validateClip(shot, id, result, errors, rendererMode) {
    const probe = ffprobe(result.mp4);
    const stream = probe.streams?.[0] ?? {};
    const duration = Number(probe.format?.duration ?? stream.duration ?? 0);
    const specSec = result.frames / FPS;
    const first = await frameStats(result.mp4, 'first');
    const last = await frameStats(result.mp4, 'last');
    const dogFrac = result.frames > 0 ? result.dogVisible / result.frames : 0;
    const wantDog = shot.expect?.dogVisibleMinFrac ?? 0;
    const fallbackWarnings = errors.filter((e) => /swiftshader|software.*(webgl|rasteriz)|fallback.*webgl/i.test(e));

    const checks = {
        durationWithinSpec: Math.abs(duration - specSec) <= 0.25,
        bytesSane: Number(probe.format?.size ?? 0) > 500_000,
        resolution: `${stream.width}x${stream.height}`,
        firstFrameNotBlank: first ? first.stdev > 5 : false,
        lastFrameNotBlank: last ? last.stdev > 5 : false,
        dogVisibleFrac: Number(dogFrac.toFixed(3)),
        dogVisibleOk: dogFrac >= wantDog,
        noRendererFallbackWarnings: fallbackWarnings.length === 0,
        consoleErrorCount: errors.length,
    };
    const pass = checks.durationWithinSpec && checks.bytesSane && checks.firstFrameNotBlank
        && checks.lastFrameNotBlank && checks.dogVisibleOk && checks.noRendererFallbackWarnings;
    return {
        id,
        file: result.mp4,
        method: result.method,
        fps: FPS,
        width: stream.width,
        height: stream.height,
        durationSec: Number(duration.toFixed(3)),
        specSec: Number(specSec.toFixed(3)),
        bytes: Number(probe.format?.size ?? 0),
        rendererMode,
        scene: shot.scene,
        mode: shot.mode,
        dog: shot.dog,
        sun: shot.sun,
        beat: shot.beat,
        checks,
        pass,
        consoleErrors: errors.slice(0, 5),
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function sessionKey(shot) {
    return `${shot.scene}|${shot.mode}|${shot.dog ?? 'jep'}|${shot.renderer ?? 'default'}`;
}

async function run() {
    await mkdir(OUT_DIR, { recursive: true });
    if (!existsSync(MEDIABUNNY_BUNDLE) && RECORDER === 'mediabunny') {
        throw new Error(`mediabunny bundle not found at ${MEDIABUNNY_BUNDLE}`);
    }
    let plan = Object.entries(SHOTS);
    if (DURATION_OVERRIDE) {
        plan = plan.map(([id, shot]) => [id, { ...shot, durationMs: DURATION_OVERRIDE }]);
    }
    if (ONLY_SHOT) plan = plan.filter(([id]) => ONLY_SHOT.split(',').includes(id));
    else if (!WANT_ALL) {
        console.error('specify --shot=<id>[,<id>] or --all');
        process.exit(1);
    }
    if (plan.length === 0) {
        console.error(`no shot matched "${ONLY_SHOT}" (have: ${Object.keys(SHOTS).join(', ')})`);
        process.exit(1);
    }

    // Group into sessions (same scene+mode+dog reuses one booted page).
    const sessions = new Map();
    for (const [id, shot] of plan) {
        const key = sessionKey(shot);
        if (!sessions.has(key)) sessions.set(key, []);
        sessions.get(key).push([id, shot]);
    }

    const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU_ARGS });
    const manifestPath = join(OUT_DIR, 'manifest.json');
    let manifest = { fps: FPS, generatedAt: new Date().toISOString(), clips: {} };
    if (existsSync(manifestPath)) {
        try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch { /* rebuild */ }
        manifest.clips ??= {};
    }

    try {
        for (const [key, shots] of sessions) {
            console.log(`session ${key} (${shots.length} shot${shots.length > 1 ? 's' : ''})`);
            const { page, errors } = await bootPage(browser, shots[0][1]);
            try {
                await startGameplay(page, shots[0][1], shots[0][0]);
                const rendererMode = await page.evaluate(() => window.__sdsRendererMode?.effective ?? 'unknown');
                console.log(`  renderer: ${rendererMode}`);
                for (const [id, shot] of shots) {
                    errors.length = 0;
                    if (WANT_PREVIEW && !WANT_VIDEO) {
                        await capturePreview(page, shot, id);
                        continue;
                    }
                    let result;
                    if (RECORDER === 'frames') {
                        result = await captureVideoFrames(page, shot, id);
                    } else {
                        try {
                            result = await captureVideoMediabunny(page, shot, id);
                        } catch (err) {
                            console.warn(`  [${id}] mediabunny path failed (${err.message}); falling back to frame dump`);
                            result = await captureVideoFrames(page, shot, id);
                        }
                    }
                    const entry = await validateClip(shot, id, result, errors, rendererMode);
                    manifest.clips[id] = entry;
                    manifest.generatedAt = new Date().toISOString();
                    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
                    console.log(`  [${id}] ${entry.pass ? 'PASS' : 'FAIL'} ${entry.durationSec}s/${entry.specSec}s dog=${entry.checks.dogVisibleFrac} ${(entry.bytes / 1e6).toFixed(1)}MB`);
                }
            } finally {
                await page.close().catch(() => {});
            }
        }
    } finally {
        await browser.close().catch(() => {});
    }
    console.log(`manifest -> ${manifestPath}`);
}

run().catch((err) => { console.error(err); process.exit(1); });
