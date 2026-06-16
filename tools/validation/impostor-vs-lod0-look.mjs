// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Ad-hoc visual inspection: far-tree impostor vs LOD0 mesh, real WebGPU.
 *
 * Not a gate - a look. Loads a scene on the production WebGPU path (installed
 * Chrome, headed, navigator.gpu present - the same launch the golden harness
 * uses, since headless bundled Chromium silently demotes to WebGL and the
 * impostor material under inspection never renders), poses the camera with the
 * __sdsCinema free-pose API, and writes full-res PNGs plus a coverage manifest.
 *
 * The consolidated cull switches LOD0 -> octahedral impostor at 200m FROM THE
 * CAMERA (CONSOLIDATED_FAR_SWITCH_DISTANCE), camera-relative and re-evaluated
 * every painted frame, so a low-angle shot across a treeline puts near rows on
 * LOD0 and far rows on impostors with the seam ~200m out. The A/B pair frames
 * one cluster twice (near=LOD0, far=impostor) with matched apparent size via fov.
 *
 * Usage: node tools/validation/impostor-vs-lod0-look.mjs
 *   SDS_LOOK_OUT=<dir>   output dir (default cycle104-validation/impostor-look)
 *   SDS_LOOK_SHOTS=a,b   only these shot names
 */

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const OUT = resolve(ROOT, process.env.SDS_LOOK_OUT || 'cycle104-validation/impostor-look');
const BASE_URL = 'http://localhost:3000/';
const VIEWPORT = { width: 1600, height: 900 };
const WEBGPU_LAUNCH_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];

// cam/tgt are terrain-relative: dy = metres above the terrain at that (x,z).
// classic:<zoom> uses the gameplay top-down camera instead (golden framing).
const SHOTS = [
  { name: 'oc-hero', scene: 'open-country', sun: 0.82, fov: 48,
    cam: { x: 30, z: -110, dy: 12 }, tgt: { x: 30, z: 175, dy: 7 } },
  { name: 'oc-ab-lod0', scene: 'open-country', sun: 0.82, fov: 45,
    cam: { x: 170, z: -120, dy: 7 }, tgt: { x: 170, z: 0, dy: 6 } },
  { name: 'oc-ab-impostor', scene: 'open-country', sun: 0.82, fov: 22,
    cam: { x: 170, z: -250, dy: 11 }, tgt: { x: 170, z: 0, dy: 6 } },
  { name: 'oc-classic', scene: 'open-country', sun: 0.82, classic: 60 },
  { name: 'rh-hero', scene: 'rolling-hills', sun: 0.82, fov: 48,
    cam: { x: 0, z: -130, dy: 11 }, tgt: { x: 0, z: 120, dy: 6 } },
  // Definitive A/B: identical pose on the (170,0) woods cluster at ~230m (the
  // distance impostors actually appear in game), flipping every cull controller
  // between all-LOD0 and all-impostor via the live lodDistance uniform.
  { name: 'oc-flip-lod0', scene: 'open-country', sun: 0.82, fov: 28, flip: 'lod0',
    cam: { x: 170, z: -230, dy: 12 }, tgt: { x: 170, z: 0, dy: 7 } },
  { name: 'oc-flip-impostor', scene: 'open-country', sun: 0.82, fov: 28, flip: 'impostor',
    cam: { x: 170, z: -230, dy: 12 }, tgt: { x: 170, z: 0, dy: 7 } },
  // Home Field (P2's new path): flat starter pasture, treeline ring r122-430.
  // Establishing look north across the pasture, then the definitive flip A/B on
  // the north treeline (the trees P2 newly turned into far impostors).
  { name: 'field-hero', scene: 'field', sun: 0.82, fov: 54,
    cam: { x: 0, z: -130, dy: 15 }, tgt: { x: 0, z: 140, dy: 8 } },
  { name: 'field-flip-lod0', scene: 'field', sun: 0.82, fov: 32, flip: 'lod0',
    cam: { x: 0, z: -60, dy: 13 }, tgt: { x: 0, z: 250, dy: 11 } },
  { name: 'field-flip-impostor', scene: 'field', sun: 0.82, fov: 32, flip: 'impostor',
    cam: { x: 0, z: -60, dy: 13 }, tgt: { x: 0, z: 250, dy: 11 } },
];

function wantShot(name) {
  const only = (process.env.SDS_LOOK_SHOTS || '').split(',').map(s => s.trim()).filter(Boolean);
  return only.length === 0 || only.includes(name);
}

async function bootScene(page, scene, sun) {
  const url = new URL(BASE_URL);
  url.searchParams.set('perfMode', '1');
  url.searchParams.set('probeRender', '1');
  url.searchParams.set('cinematic', '1');
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('scene', scene);
  url.searchParams.set('sun', String(sun));
  url.searchParams.set('ui', 'off');
  await page.goto(url.toString(), { waitUntil: 'load', timeout: 90_000 });
  await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 30_000 });
  await page.evaluate(() => window.__sdsCinema.waitReady(90_000));
  await page.evaluate(() => {
    window.__sdsCinema.startSolo('jep', 'classic');
    window.__sdsCinema.pauseSimulation?.();
  });
  await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 90_000 });
}

async function assertWebGpu(page, scene) {
  const r = await page.evaluate(() => ({
    ok: window.__sdsG?.productionWebGpu?.ok === true,
    effective: window.__sdsRendererMode?.effective ?? null,
    reason: window.__sdsG?.productionWebGpu?.error ?? window.__sdsRendererMode?.fallbackReason ?? null,
  }));
  if (!r.ok || r.effective === 'webgl') {
    throw new Error(`[LOOK] WebGPU did not engage for ${scene} (ok=${r.ok}, effective=${r.effective}, reason=${r.reason})`);
  }
  return r;
}

async function coverage(page) {
  return page.evaluate(() => {
    try {
      const game = window.gameInstance || window.__sds || null;
      const tb = game?.terrainBuilder || game?.sceneManager?.terrainBuilder
        || window.__sds?.sceneManager?.terrainBuilder;
      const reg = tb?._treeCullRegistry;
      if (!reg || !reg.size) return { registry: 0, far: 0, types: [] };
      let far = 0;
      const types = [];
      for (const [type, e] of reg.entries()) {
        const used = Number(e?.used ?? 0) || 0;
        const fm = e?.far?.mesh ?? e?.farController?.mesh ?? e?.farMesh ?? null;
        const fc = Number(fm?.count ?? fm?.instanceCount ?? 0) || 0;
        far += fc;
        // bbox/centroid of the per-type far-impostor offsets (best-effort).
        let bbox = null;
        const off = e?.impostorOffsets;
        if (off && used > 0) {
          let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity, sx = 0, sz = 0;
          for (let i = 0; i < used; i++) {
            const x = off[i * 3], z = off[i * 3 + 2];
            if (x < minx) minx = x; if (x > maxx) maxx = x;
            if (z < minz) minz = z; if (z > maxz) maxz = z;
            sx += x; sz += z;
          }
          bbox = { minx: Math.round(minx), maxx: Math.round(maxx), minz: Math.round(minz), maxz: Math.round(maxz),
            cx: Math.round(sx / used), cz: Math.round(sz / used) };
        }
        types.push({ type, used, far: fc, bbox });
      }
      return { registry: reg.size, far, types };
    } catch (err) { return { error: String(err?.message || err) }; }
  });
}

async function poseAndShoot(page, shot) {
  await page.evaluate((s) => {
    const c = window.__sdsCinema;
    c.setSun(s.sun);
    if (s.classic) {
      c.freeFlyActive = false;
      c.setCameraMode('classic');
      c.setCameraZoom(s.classic);
      const sm = window.gameInstance?.sceneManager || window.__sds?.sceneManager;
      const dog = c.gameState?.getSheepdog?.();
      for (let i = 0; i < 120; i++) sm?.updateCamera?.(dog, 1 / 60);
    } else {
      const gy = (x, z) => c.getTerrainY(x, z);
      c.freeFlyActive = true;
      const cam = c.camera;
      if (cam && s.fov) { cam.fov = s.fov; cam.updateProjectionMatrix(); }
      c.setCameraPose(
        { x: s.cam.x, y: gy(s.cam.x, s.cam.z) + s.cam.dy, z: s.cam.z },
        { x: s.tgt.x, y: gy(s.tgt.x, s.tgt.z) + s.tgt.dy, z: s.tgt.z },
      );
      c.syncAtmosphereToCamera();
    }
  }, shot);
  // Definitive A/B: flip every tree cull controller's live LOD switch distance so
  // the same camera pose renders all-LOD0 (d=1e9) or all-impostor (d=0).
  if (shot.flip) {
    const flipped = await page.evaluate((mode) => {
      const game = window.gameInstance || window.__sds || null;
      const tb = game?.terrainBuilder || game?.sceneManager?.terrainBuilder
        || window.__sds?.sceneManager?.terrainBuilder;
      const ctrls = tb?._treeCullControllers || [];
      const d = mode === 'impostor' ? 0 : 1e9;
      let n = 0;
      for (const c of ctrls) {
        try { c.setLodEnabled?.(true); c.setLodDistance?.(d); n++; } catch { /* skip */ }
      }
      return n;
    }, shot.flip);
    console.log(`[LOOK]   ${shot.name} flipped ${flipped} controllers -> ${shot.flip}`);
  }
  // Let the render loop re-cull against the new camera and the atmosphere settle.
  await page.evaluate(() => new Promise((r) => {
    let n = 0; const f = () => { if (++n >= 8) return r(); requestAnimationFrame(f); }; requestAnimationFrame(f);
  }));
  await page.evaluate(() => window.__sdsCinema.syncAtmosphereToCamera());
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const dataUrl = await page.evaluate(() => {
    const canvas = document.querySelector('#canvas-container canvas') ?? document.querySelector('canvas');
    if (!canvas) throw new Error('game canvas not found');
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: WEBGPU_LAUNCH_ARGS });
  const manifest = { capturedAt: null, viewport: VIEWPORT, shots: [] };
  const shots = SHOTS.filter((s) => wantShot(s.name));
  const byScene = new Map();
  for (const s of shots) { if (!byScene.has(s.scene)) byScene.set(s.scene, []); byScene.get(s.scene).push(s); }

  for (const [scene, group] of byScene.entries()) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    try {
      console.log(`[LOOK] boot ${scene}`);
      await bootScene(page, scene, group[0].sun);
      const gpu = await assertWebGpu(page, scene);
      const cov = await coverage(page);
      console.log(`[LOOK] ${scene} webgpu ok=${gpu.ok} effective=${gpu.effective} coverage=${JSON.stringify(cov)}`);
      for (const shot of group) {
        console.log(`[LOOK]   shoot ${shot.name}`);
        const png = await poseAndShoot(page, shot);
        const fp = resolve(OUT, `${shot.name}.png`);
        await writeFile(fp, png);
        manifest.shots.push({ name: shot.name, scene, file: fp, bytes: png.length, sun: shot.sun,
          fov: shot.fov ?? null, classic: shot.classic ?? null });
      }
    } finally {
      await context.close();
    }
  }
  await browser.close();
  await writeFile(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`[LOOK] wrote ${manifest.shots.length} shots to ${OUT}`);
}

run().catch((e) => { console.error('[LOOK] fatal:', e); process.exit(2); });
