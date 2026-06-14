// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 99 Phase 1 — KTX2 impostor load-path probe.
 *
 * The golden harness (tools/validation/screenshot-golden.mjs) is not a valid
 * KTX2 gate: it captures before impostor textures finish (the KTX2 path adds an
 * async transcoder fetch + transcode), and its tree-placement/LOD0 state is
 * non-deterministic run-to-run - LOD0 trees use the GLB leaf texture, not the
 * impostor atlas, so KTX2 cannot be the cause of those diffs.
 *
 * This probe answers the only question that gates dropping the PNG fallback:
 * does the .ktx2 path load and decode end-to-end in a real browser, with no
 * silent fall-through to .png and no decode error? It loads an impostor-bearing
 * scene, lets the atlas resolve, and reports the impostor-atlas network traffic
 * (.ktx2 vs .png), the transcoder fetch, and any [KTX2]/error console output.
 *
 * Usage: node tools/ktx2-impostor-probe.mjs [--scene=open-country] [--out=DIR]
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASE_URL = 'http://localhost:3000/';
const VIEWPORT = { width: 1280, height: 720 };
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=?(.*)$/);
  return [m[1], m[2] === '' ? true : m[2]];
}));
const SCENE = args.scene || 'open-country';
const TAG = args.tag ? `-${args.tag}` : '';
const OUT_DIR = resolve(ROOT, args.out || 'cycle99-validation');
// Fixed seed shared by both A/B arms so tree placement is byte-identical and
// the only variable across runs is the impostor texture source (.ktx2 vs .png).
const SEED = 0x5d5c0de;

const isImpostorAtlas = (url) => /\.imposter(\.\w+)?\.(ktx2|png)(\?|$)/.test(url);

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ args: CHROMIUM_GPU_ARGS });
  const requests = [];
  const consoleMsgs = [];
  const pageErrors = [];
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
    // Match the golden harness: seed Math.random before any module runs so tree
    // scatter is deterministic and identical across the two A/B arms.
    await context.addInitScript((seed) => {
      let state = seed >>> 0;
      Math.random = () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      window.__sdsSetVisualGoldenSeed = (s) => { state = s >>> 0; };
      try {
        localStorage.clear();
        localStorage.setItem('playerIdentity', JSON.stringify({
          persistentId: 'ktx2_probe', displayName: 'Ktx2Probe', fullName: 'Ktx2Probe#0001',
          discriminator: '0001', nameType: 'custom', createdAt: 1778862051000, isRegistered: false,
        }));
      } catch {}
    }, SEED);
    const page = await context.newPage();
    page.on('request', (r) => { if (isImpostorAtlas(r.url()) || /basis_transcoder/.test(r.url())) requests.push(r.url()); });
    page.on('console', (m) => { const t = m.text(); if (/\[KTX2\]|ktx2|imposter|error/i.test(t)) consoleMsgs.push(`${m.type()}: ${t}`); });
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    const url = new URL(BASE_URL);
    url.searchParams.set('perfMode', '1');
    url.searchParams.set('probeRender', '1');
    url.searchParams.set('cinematic', '1');
    url.searchParams.set('renderer', 'webgpu');
    url.searchParams.set('visualGolden', '1');
    url.searchParams.set('scene', SCENE);
    url.searchParams.set('sun', '0.85');
    url.searchParams.set('ui', 'off');

    await page.goto(url.toString(), { waitUntil: 'load', timeout: 90_000 });
    await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 30_000 });
    await page.evaluate(() => window.__sdsCinema.waitReady(90_000));
    await page.evaluate((seed) => {
      window.__sdsSetVisualGoldenSeed?.(seed);
      window.__sdsCinema.pauseSimulation();
      window.__sdsCinema.startSolo('jep', 'classic');
    }, SEED);
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 90_000 });

    // Top-down so far-distance impostors fill the frame, then let the atlas
    // resolve (transcoder fetch + UASTC transcode is the async cost we test).
    await page.evaluate(() => {
      const cinema = window.__sdsCinema;
      const dog = cinema?.gameState?.getSheepdog?.();
      cinema?.setCameraMode?.('classic');
      cinema?.setCameraZoom?.(90);
      for (let i = 0; i < 120; i++) window.__sds?.sceneManager?.updateCamera?.(dog, 1 / 60);
    });
    // 15s: more than enough for the transcoder fetch + UASTC transcode of all
    // 6 atlases to fully resolve, so both A/B arms capture a settled frame
    // (kills the KTX2-slower-resolve timing confound).
    await page.waitForTimeout(15000);

    // Inspect a live far-impostor material: CompressedTexture => KTX2 decoded;
    // plain Texture => PNG fallback. Best-effort; null if the hook is absent.
    const textureKind = await page.evaluate(() => {
      try {
        const reg = window.__sds?.sceneManager?.terrainBuilder?._treeCullRegistry
          || window.__sds?._treeCullRegistry || null;
        const probe = (mat) => {
          const map = mat?.map || mat?.uniforms?.map?.value;
          if (!map) return null;
          return map.isCompressedTexture ? 'compressed(ktx2)' : (map.isTexture ? 'plain(png?)' : 'unknown');
        };
        if (reg) for (const e of (reg.values?.() ? [...reg.values()] : [])) {
          const m = e?.far?.material; const k = probe(m); if (k) return k;
        }
        return null;
      } catch (e) { return 'probe-error:' + e.message; }
    });

    // Canvas-only (the WebGL/WebGPU framebuffer), not the page screenshot, so
    // the comparison is the render output with no HUD overlay.
    const dataUrl = await page.evaluate(() => {
      const c = document.querySelector('#canvas-container canvas') ?? document.querySelector('canvas');
      return c ? c.toDataURL('image/png') : null;
    });
    if (dataUrl) {
      await writeFile(resolve(OUT_DIR, `ktx2-probe-${SCENE}${TAG}.png`),
        Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'));
    }

    const ktx2 = requests.filter((u) => /\.ktx2(\?|$)/.test(u));
    const pngFallback = requests.filter((u) => isImpostorAtlas(u) && /\.png(\?|$)/.test(u));
    const transcoder = requests.filter((u) => /basis_transcoder/.test(u));
    const report = {
      scene: SCENE,
      ktx2Requested: [...new Set(ktx2.map((u) => u.split('/').pop()))].sort(),
      pngFallbackRequested: [...new Set(pngFallback.map((u) => u.split('/').pop()))].sort(),
      transcoderRequested: [...new Set(transcoder.map((u) => u.split('/').pop()))].sort(),
      farImpostorTextureKind: textureKind,
      ktx2ConsoleWarnings: consoleMsgs.filter((m) => /\[KTX2\]/.test(m)),
      errors: [...consoleMsgs.filter((m) => /^error/i.test(m)), ...pageErrors],
    };
    report.verdict =
      report.ktx2Requested.length >= 1 &&
      report.pngFallbackRequested.length === 0 &&
      report.ktx2ConsoleWarnings.length === 0 &&
      report.errors.length === 0
        ? 'PASS: ktx2 loaded, no png fallback, no errors'
        : 'REVIEW: see fields';
    await writeFile(resolve(OUT_DIR, `ktx2-probe-${SCENE}${TAG}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
