#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 112 Phase 8 - candidate entrance heroes for all four scenes.
 *
 * Produces CANDIDATE frames and the measurements behind them. The final beauty
 * pass is Matt's, per the media-prep working preference and the precedent set
 * by tools/hero-capture.mjs: the agent writes the manifest and the candidates,
 * Matt drives the browser. Nothing here overwrites assets/scenes/.
 *
 * The D8 brief is one composition repeated four times: dog large in the near
 * third, flock settled and readable mid-frame, destination visible on the
 * horizon, low sun off-axis, generous sky. Every camera below is therefore
 * derived from the scene's own geometry - it sits on the line running from the
 * flock's spawn centre to that scene's destination, pulled back behind the dog -
 * rather than being hand-guessed per scene. Change the geometry and the shot
 * follows it.
 *
 * WHY THE GAMEPLAY ENTRY AND NOT THE BARE CINEMA ONE: a `?cinematic=1` boot
 * without startSolo leaves the sky unlit (fog samples near 0,0,0), which is
 * useless for judging a hero. This boots the same way the golden harness does,
 * then overrides the camera.
 *
 * Measures, per shot:
 *   dogFrameHeightPct   D8 acceptance wants >= 3%
 *   nearestTreeM        distance to the closest tree instance. The "no foreground
 *                       object occluding the frame" line was written for "the
 *                       Open Country camera is inside a tree", and this measures
 *                       that directly. It is not a frame-coverage percentage;
 *                       claiming one would need a depth pass this does not have.
 *                       KNOWN BLIND SPOT: it only sees instances registered in
 *                       _treeCullRegistry. A Rolling Hills frame with a trunk
 *                       cutting the near field still reported 145m, so per-chunk
 *                       LOD0 meshes are not all in that registry. Treat a large
 *                       value as "no consolidated tree near", not "frame clear".
 *   sunElevationDeg     "low sun" - the brief means roughly 8 to 25 degrees
 *   sunOffAxisDeg       "off-axis" - angle between sun and camera azimuth
 *
 * Prereq: a dev server on :3000 with SDS_SUPPRESS_BROWSER_OPEN=1.
 * Output:  cycle112-validation/heroes/*.png + measurements.json (gitignored).
 *
 * Usage:
 *   node tools/hero-capture-cycle112.mjs
 *   node tools/hero-capture-cycle112.mjs --scenes=field,open-country
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve(process.cwd(), 'cycle112-validation', 'heroes');
const BASE = 'http://localhost:3000/';
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];

const ASPECTS = [
  { key: 'entrance', w: 1920, h: 1080 },
  { key: 'social', w: 1200, h: 630 },
];

/**
 * Per-scene shot definition. `flock` and `destination` are read off the scene
 * defs in shared/scenes/; `dogBack` and `camBack` are metres back along the
 * flock-to-destination line. camBack is kept near 20m because that is what puts
 * a ~1m-tall dog over the 3% frame-height floor at a 1080-tall frame.
 */
/**
 * Sun is a TIME OF DAY, not an elevation: 0 = midnight, 0.5 = noon, 0.75 =
 * sunset (Atmosphere.setTimeOfDay). All four scenes carry a day/night cycle, so
 * that mapping applies everywhere. Measured on Home Field:
 *
 *   t     sun elevation   fog (linear, pre tone-map)
 *   0.25       7 deg      0.075, 0.062, 0.070   dawn, cold and dim
 *   0.30      19 deg      0.095, 0.123, 0.155   morning, still blue
 *   0.50      70 deg      0.115, 0.255, 0.582   noon
 *   0.70      19 deg      0.270, 0.171, 0.116   golden, warm
 *   0.75       8 deg      0.233, 0.138, 0.098   low golden
 *
 * D8 asks for a low sun and a calm frame, so the shots sit in the 0.66-0.68
 * late-afternoon window rather than the numerically identical dawn elevations,
 * which render cold. Two earlier passes overshot: 0.28 produced a night sky
 * (dawn side), and 0.72-0.73 produced a navy post-sunset one. 0.66-0.68 is
 * sun still up and warm, which is what "calm" needs.
 */
const SHOTS = [
  {
    id: 'field',
    mode: 'classic',
    destination: { x: 0, z: 116 },       // the pen, centreZ 115 with its gate at z=100
    dogAhead: 11, dogLateral: -4, camHeight: 3.0, targetLift: 10, clearFlockBy: 20, ridgeClearance: 3, maxPullback: 70,
    sun: 0.70,
    note: 'Flat pasture. The pen and its gate close the frame on the horizon.',
  },
  {
    id: 'rolling-hills',
    mode: 'classic',
    destination: { x: 110, z: 60 },      // the corral
    dogAhead: 11, dogLateral: -4, camHeight: 3.2, targetLift: 10, clearFlockBy: 20, ridgeClearance: 6, maxPullback: 70,
    sun: 0.705,
    note: 'Camera runs up the diagonal so the rolling ground reads across frame.',
  },
  {
    id: 'open-country',
    mode: 'classic',
    destination: { x: 0, z: 295 },       // the portal, past the z=50 roundup zone
    dogAhead: 11, dogLateral: 4, camHeight: 3.2, targetLift: 12, clearFlockBy: 22, ridgeClearance: 5, maxPullback: 80,
    sun: 0.70,
    note: 'The one scene whose old hero had the camera inside a tree. The '
        + 'straight south-to-north line keeps the near third clear; nearestTreeM '
        + 'is the check that it stayed clear.',
  },
  {
    id: 'newsheepdogland',
    // NOT survival: it starts at 10 sheep, so there is no flock to read
    // mid-frame, and its day/flock/minimap HUD renders straight through
    // ?ui=off and cinema.hideUI(). 'hard' is the 300-sheep rung on this
    // island's own ladder.
    mode: 'timed',
    destination: { x: 610, z: -1000 },   // the homestead gate, mountain beyond
    dogAhead: 11, dogLateral: -4, camHeight: 3.2, targetLift: 12, clearFlockBy: 22, ridgeClearance: 5, maxPullback: 80,
    sun: 0.70,
    note: 'Evening, not night - the wolves are a night mechanic and the brief '
        + 'is calm. The northern mountain sits beyond the gate.',
  },
];

function parseArgs(argv) {
  const args = { scenes: null };
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) args[m[1]] = m[2];
  }
  if (args.scenes) args.scenes = String(args.scenes).split(',');
  return args;
}

async function captureShot(browser, shot, aspect) {
  const url = new URL(BASE);
  url.searchParams.set('cinematic', '1');
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('scene', shot.id);
  url.searchParams.set('sun', String(shot.sun));
  url.searchParams.set('ui', 'off');

  const context = await browser.newContext({ viewport: { width: aspect.w, height: aspect.h } });
  const page = await context.newPage();
  try {
    await page.goto(url.toString(), { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 60_000 });
    await page.evaluate(() => window.__sdsCinema.waitReady(120_000));
    await page.evaluate(({ mode }) => {
      window.__sdsCinema.startSolo('jep', mode);
    }, { mode: shot.mode });
    // waitForFlockSize is the documented cinema wait (see the freeFly docblock
    // in js/cinematic.js), not __perfHarness - that global only exists behind
    // the perf-mode URL flags the golden harness happens to set.
    await page.evaluate(() => window.__sdsCinema.waitForFlockSize(1, 180_000));
    await page.waitForFunction(() => (window.__sdsCinema?.gameState?.sheep?.length ?? 0) > 0, null, { timeout: 180_000 });

    // Let the flock settle: the brief asks for "settled and readable", and a
    // frame grabbed at t=0 catches the spawn scatter mid-relax.
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.__sdsCinema.pauseSimulation());

    const measured = await page.evaluate(({ shot }) => {
      const cinema = window.__sdsCinema;
      const groundY = (x, z) => cinema.getTerrainY(x, z) ?? 0;

      // Aim off the LIVE flock, not the spawn config. Sheep drift while the
      // scene settles, and the first pass framed the spawn centre while the
      // flock had walked 100m north out of it.
      const sheep = cinema.gameState?.sheep ?? [];
      let fx = 0, fz = 0, n = 0;
      for (const s of sheep) {
        const p = s?.position ?? s;
        if (typeof p?.x !== 'number' || typeof p?.z !== 'number') continue;
        fx += p.x; fz += p.z; n++;
      }
      const flock = n ? { x: fx / n, z: fz / n } : { x: 0, z: 0 };

      // Forward runs flock -> destination, so the composition reads
      // camera, dog, flock, destination as one line into the frame.
      const dx = shot.destination.x - flock.x;
      const dz = shot.destination.z - flock.z;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len, uz = dz / len;
      const rx = -uz, rz = ux;                       // camera-right

      // Camera sits behind the flock's REAR EDGE, not behind its centroid. A
      // fixed pullback from the centroid put the lens inside the flock's tail
      // and filled the lower-left quadrant with two sheep, which is the same
      // defect as the Open Country camera being inside a tree. Measure how far
      // back the rear-most sheep actually is and clear it.
      // Clear the rear-most sheep, then CAP the pullback. Two failed variants
      // are worth recording: an uncapped max-extent pullback put the flock 140m
      // out on the scattered-spawn scenes and it read as a smudge, while an 85th
      // percentile left the trailing 15% of the flock surrounding the lens and
      // swallowing the dog. Max with a cap keeps the dog clear and the flock
      // legible; the cap is what bounds the scattered scenes.
      const alongs = [];
      for (const s of sheep) {
        const p = s?.position ?? s;
        if (typeof p?.x !== 'number') continue;
        alongs.push(-((p.x - flock.x) * ux + (p.z - flock.z) * uz));
      }
      alongs.sort((a, b) => a - b);
      const backExtent = alongs.length ? Math.max(0, alongs[alongs.length - 1]) : 0;
      const camBackFromFlock = Math.min(shot.maxPullback, backExtent + shot.clearFlockBy);
      const cam = { x: flock.x - ux * camBackFromFlock, z: flock.z - uz * camBackFromFlock };
      const dogPos = {
        x: cam.x + ux * shot.dogAhead + rx * shot.dogLateral,
        z: cam.z + uz * shot.dogAhead + rz * shot.dogLateral,
      };
      cinema.poseDog(dogPos.x, dogPos.z, { x: ux, z: uz });

      // Ridge clamp, the same rule the gameplay camera follows (see
      // .claude/rules/scene-and-render.md): lift above the highest ground
      // between here and what we are looking at. Without it the Rolling Hills
      // shot sat below a crest and two thirds of the frame was black hillside.
      const target = {
        x: shot.destination.x,
        y: groundY(shot.destination.x, shot.destination.z) + shot.targetLift,
        z: shot.destination.z,
      };
      // Only the NEAR segment, and capped. Clamping against the whole 210m run
      // to the Rolling Hills corral lifted the camera ~20m, which pitched the
      // dog clean out of the bottom of frame. What actually needs clearing is
      // the crest immediately in front.
      const nearRun = 60;
      const runLen = Math.hypot(target.x - cam.x, target.z - cam.z) || 1;
      const nearFrac = Math.min(1, nearRun / runLen);
      let ridge = -Infinity;
      const SAMPLES = 20;
      for (let i = 0; i <= SAMPLES; i++) {
        const f = (i / SAMPLES) * nearFrac;
        const g = groundY(cam.x + (target.x - cam.x) * f, cam.z + (target.z - cam.z) * f);
        if (g > ridge) ridge = g;
      }
      const camGround = groundY(cam.x, cam.z);
      const camY = Math.min(
        camGround + shot.camHeight + 12,
        Math.max(camGround + shot.camHeight, (Number.isFinite(ridge) ? ridge : 0) + shot.ridgeClearance),
      );

      // Aim by solving for the pitch that puts the dog at a chosen NDC y rather
      // than by pointing at the destination and hoping. "Dog large in the near
      // third" is a composition requirement, so it is satisfied by construction:
      // for a point at elevation phi from the camera, its NDC y is
      // tan(phi - pitch) / tan(vfov/2), so pitch = phi - atan(ndcY * tan(vfov/2)).
      const camera0 = cinema.camera;
      const DOG_NDC_Y = -0.45;
      const dogRef = cinema.gameState?.getSheepdog?.()?.mesh?.position;
      let aim = target;
      if (camera0 && dogRef) {
        const halfV = ((camera0.fov * Math.PI) / 180) / 2;
        const horiz = Math.hypot(dogRef.x - cam.x, dogRef.z - cam.z) || 1;
        const phiDog = Math.atan2((dogRef.y + 0.5) - camY, horiz);
        const pitch = phiDog - Math.atan(DOG_NDC_Y * Math.tan(halfV));
        const aimDist = Math.max(60, runLen);
        aim = {
          x: cam.x + ux * aimDist,
          y: camY + Math.tan(pitch) * aimDist,
          z: cam.z + uz * aimDist,
        };
      }
      cinema.setCameraPose({ x: cam.x, y: camY, z: cam.z }, aim);
      cinema.setSun(shot.sun);
      cinema.hideUI?.();
      cinema.hideWorldMarkers?.();
      cinema.syncAtmosphereToCamera?.();
      cinema.renderFrame();

      const camera = cinema.camera;
      const dog = cinema.gameState?.getSheepdog?.() ?? null;

      // Dog height in frame: project the dog's world height through the camera
      // rather than eyeballing it, so the 3% acceptance line is a measurement.
      let dogFrameHeightPct = null;
      if (camera && dog?.mesh) {
        const p = dog.mesh.position;
        const dist = Math.hypot(camera.position.x - p.x, camera.position.y - p.y, camera.position.z - p.z);
        const vFovRad = (camera.fov * Math.PI) / 180;
        const DOG_HEIGHT_M = 1.0;
        dogFrameHeightPct = (DOG_HEIGHT_M / (2 * dist * Math.tan(vFovRad / 2))) * 100;
      }

      // Nearest tree to the camera, read straight off the instance matrices in
      // the tree cull registry (the same registry the golden harness reads for
      // its coverage log). This is the honest version of the "no foreground
      // object occluding the frame" acceptance line: the defect it was written
      // for is "the Open Country camera is inside a tree", and a trunk distance
      // measures exactly that. It deliberately does NOT claim a frame-coverage
      // percentage, which would need a depth pass this harness does not have.
      let nearestTreeM = null;
      try {
        const tb = window.gameInstance?.terrainBuilder ?? null;
        const reg = tb?._treeCullRegistry;
        const cx = camera.position.x, cz = camera.position.z;
        let best = Infinity;
        for (const entry of reg?.values?.() ?? []) {
          const meshes = [entry?.mesh, entry?.lod0?.mesh, entry?.far?.mesh, entry?.farController?.mesh];
          for (const mesh of meshes) {
            const arr = mesh?.instanceMatrix?.array;
            const count = mesh?.count ?? 0;
            if (!arr || !count) continue;
            for (let i = 0; i < count; i++) {
              const o = i * 16;
              const d = Math.hypot(arr[o + 12] - cx, arr[o + 14] - cz);
              if (d < best) best = d;
            }
          }
        }
        nearestTreeM = Number.isFinite(best) ? +best.toFixed(1) : null;
      } catch { /* best effort; a null here just means "not measured" */ }

      // Sun geometry.
      let sunElevationDeg = null, sunOffAxisDeg = null;
      const sunDir = window.gameInstance?.atmosphere?.getSunDirection?.();
      if (sunDir && camera) {
        sunElevationDeg = (Math.asin(Math.max(-1, Math.min(1, sunDir.y))) * 180) / Math.PI;
        const sunAz = Math.atan2(sunDir.x, sunDir.z);
        const fwdAz = Math.atan2(target.x - camera.position.x, target.z - camera.position.z);
        let d = ((sunAz - fwdAz) * 180) / Math.PI;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        sunOffAxisDeg = Math.abs(d);
      }

      // Where the dog actually lands in frame. "Near third" is a composition
      // claim, so it gets measured too: NDC y below 0 is the lower half.
      let dogNdc = null;
      if (camera && dog?.mesh) {
        const p = dog.mesh.position;
        const v = { x: p.x, y: p.y + 0.5, z: p.z };
        camera.updateMatrixWorld();
        const m = camera.matrixWorldInverse.elements, pr = camera.projectionMatrix.elements;
        const ex = m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12];
        const ey = m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13];
        const ez = m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14];
        const cx2 = pr[0] * ex + pr[8] * ez;
        const cy2 = pr[5] * ey + pr[9] * ez;
        const cw = pr[11] * ez;
        if (cw !== 0) dogNdc = { x: +(cx2 / cw).toFixed(2), y: +(cy2 / cw).toFixed(2) };
      }

      return {
        dogFrameHeightPct,
        dogNdc,
        nearestTreeM,
        sunElevationDeg,
        sunOffAxisDeg,
        camera: { x: +camera.position.x.toFixed(1), y: +camera.position.y.toFixed(1), z: +camera.position.z.toFixed(1) },
        target: { x: +target.x.toFixed(1), y: +target.y.toFixed(1), z: +target.z.toFixed(1) },
        dog: dog?.mesh ? { x: +dog.mesh.position.x.toFixed(1), z: +dog.mesh.position.z.toFixed(1) } : null,
        flockCentroid: { x: +flock.x.toFixed(1), z: +flock.z.toFixed(1) },
        flockDistanceM: +Math.hypot(flock.x - camera.position.x, flock.z - camera.position.z).toFixed(1),
        sheepVisible: sheep.length,
      };
    }, { shot });

    // Two frames after the pose: the first flushes the new camera matrices.
    await page.evaluate(() => window.__sdsCinema.renderFrame());
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__sdsCinema.renderFrame());

    const file = `${shot.id}__${aspect.key}__${aspect.w}x${aspect.h}.png`;
    await page.screenshot({ path: resolve(OUT, file) });
    return { shot: shot.id, aspect: aspect.key, file, ...measured };
  } finally {
    await page.close();
    await context.close();
  }
}

async function run() {
  const args = parseArgs(process.argv);
  const shots = args.scenes ? SHOTS.filter((s) => args.scenes.includes(s.id)) : SHOTS;
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU });
  const results = [];
  try {
    for (const shot of shots) {
      for (const aspect of ASPECTS) {
        try {
          const r = await captureShot(browser, shot, aspect);
          results.push(r);
          console.log(
            `[HERO] ${r.file}  dog=${r.dogFrameHeightPct?.toFixed(2)}%  ` +
            `sunElev=${r.sunElevationDeg?.toFixed(1)}deg  offAxis=${r.sunOffAxisDeg?.toFixed(0)}deg  ` +
            `nearestTree=${r.nearestTreeM ?? 'n/a'}m  flock=${r.flockDistanceM}m  ` +
            `dogNdc=${r.dogNdc ? `${r.dogNdc.x},${r.dogNdc.y}` : 'n/a'}  sheep=${r.sheepVisible}`,
          );
        } catch (err) {
          console.warn(`[HERO] ${shot.id}/${aspect.key} failed: ${err.message.split('\n')[0]}`);
          results.push({ shot: shot.id, aspect: aspect.key, error: err.message.split('\n')[0] });
        }
      }
    }
  } finally {
    await browser.close();
  }

  await writeFile(resolve(OUT, 'measurements.json'), JSON.stringify({ results }, null, 2));
  console.log(`\n[HERO] wrote ${results.length} entries to ${OUT}`);

  const belowFloor = results.filter((r) => r.dogFrameHeightPct != null && r.dogFrameHeightPct < 3);
  if (belowFloor.length) {
    console.log(`[HERO] ${belowFloor.length} shot(s) under the 3% dog-height floor: ` +
      belowFloor.map((r) => r.file).join(', '));
  }
}

run().catch((err) => {
  console.error('[HERO] fatal:', err);
  process.exit(2);
});
