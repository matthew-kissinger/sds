// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Focused CPU profile for the forced-WebGL cold boot. This drives the normal
// app and records the browser's sampled main-thread profile until Play becomes
// enabled, so a slow fallback is attributed instead of guessed at.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SEED,
  launchBrowser,
  removeDir,
  repo,
  scratchDir,
  startPreviewServer,
  stopServer,
} from './probe-lib.mjs';

const port = Number(process.argv.find((arg) => arg.startsWith('--port='))?.slice(7) ?? 5342);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`bad port ${port}`);
const angle = process.argv.find((arg) => arg.startsWith('--angle='))?.slice(8) ?? '';
if (angle && !/^[a-z0-9_-]+$/i.test(angle)) throw new Error(`bad angle ${angle}`);
const outputDir = join(repo, 'captures', 'profiling', 'webgl-boot-cpu');
mkdirSync(outputDir, { recursive: true });

function summarize(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const selfUs = new Map();
  for (let index = 0; index < profile.samples.length; index++) {
    const id = profile.samples[index];
    selfUs.set(id, (selfUs.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0));
  }
  return [...selfUs.entries()]
    .map(([id, microseconds]) => {
      const frame = nodes.get(id)?.callFrame;
      return {
        milliseconds: Math.round(microseconds / 100) / 10,
        function: frame?.functionName || '(anonymous)',
        url: frame?.url || '',
        line: (frame?.lineNumber ?? -1) + 1,
      };
    })
    .sort((a, b) => b.milliseconds - a.milliseconds)
    .slice(0, 40);
}

let server = null;
let browser = null;
let profileRoot = null;
try {
  server = await startPreviewServer(port);
  profileRoot = scratchDir(`herd-webgl-boot-cpu-${port}`);
  browser = await launchBrowser(profileRoot, angle ? [
    `--use-angle=${angle}`,
    ...(angle === 'd3d11' ? ['--disable-features=Vulkan'] : []),
  ] : []);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const sourceByShader = new WeakMap();
    const shadersByProgram = new WeakMap();
    const linkedAt = new WeakMap();
    const receipts = [];
    Object.defineProperty(globalThis, '__herdShaderProfile', { value: receipts });
    const prototype = WebGL2RenderingContext.prototype;
    const shaderSource = prototype.shaderSource;
    const attachShader = prototype.attachShader;
    const linkProgram = prototype.linkProgram;
    const getProgramParameter = prototype.getProgramParameter;
    prototype.shaderSource = function patchedShaderSource(shader, source) {
      sourceByShader.set(shader, source);
      return shaderSource.call(this, shader, source);
    };
    prototype.attachShader = function patchedAttachShader(program, shader) {
      const shaders = shadersByProgram.get(program) ?? [];
      shaders.push(shader);
      shadersByProgram.set(program, shaders);
      return attachShader.call(this, program, shader);
    };
    prototype.linkProgram = function patchedLinkProgram(program) {
      linkedAt.set(program, performance.now());
      return linkProgram.call(this, program);
    };
    prototype.getProgramParameter = function patchedGetProgramParameter(program, parameter) {
      const started = performance.now();
      const result = getProgramParameter.call(this, program, parameter);
      const blockedMs = performance.now() - started;
      if (parameter === this.LINK_STATUS) {
        const sources = (shadersByProgram.get(program) ?? []).map((shader) => sourceByShader.get(shader) ?? '');
        receipts.push({
          blockedMs,
          sinceLinkMs: performance.now() - (linkedAt.get(program) ?? performance.now()),
          sourceLengths: sources.map((source) => source.length),
          attributes: sources.flatMap((source) => source.match(/\b(?:in|attribute)\s+\w+\s+\w+/g) ?? []).slice(0, 40),
          uniforms: sources.flatMap((source) => source.match(/\buniform\s+\w+\s+\w+/g) ?? []).slice(0, 80),
        });
      }
      return result;
    };
  });
  await context.route('**/api/lobbies', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"lobbies":[]}',
  }));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  const started = Date.now();
  await page.goto(`http://localhost:${port}/?seed=${SEED}&debug=webgl,readout`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  const play = page.getByRole('button', { name: 'Play', exact: true });
  await play.waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent?.trim() === 'Play');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 60_000, polling: 25 });
  const interactiveMs = Date.now() - started;
  const gpu = await page.locator('canvas').evaluate((canvas) => {
    const context = canvas.getContext('webgl2');
    if (context === null) return null;
    const extension = context.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: extension ? context.getParameter(extension.UNMASKED_VENDOR_WEBGL) : '',
      renderer: extension ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL) : '',
    };
  });
  const { profile } = await cdp.send('Profiler.stop');
  const shaderPrograms = await page.evaluate(() => globalThis.__herdShaderProfile ?? []);
  const result = { interactiveMs, gpu, topSelfTime: summarize(profile), shaderPrograms, profile };
  writeFileSync(join(outputDir, 'profile.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    interactiveMs,
    gpu,
    topSelfTime: result.topSelfTime,
    shaderPrograms: shaderPrograms.sort((a, b) => b.blockedMs - a.blockedMs),
  }, null, 2));
  await page.close();
  await context.close();
} finally {
  if (browser) await browser.close().catch(() => {});
  stopServer(server);
  removeDir(profileRoot);
}
