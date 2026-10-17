// SPDX-License-Identifier: AGPL-3.0-or-later
// Review-only lab captures. Counts are functional evidence, no PC timings qualify.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { launchBrowser, reachable, removeDir, repo, scratchDir, stopServer, stubHarnessNetwork } from './probe-lib.mjs';

const label = process.argv[2] ?? 'iteration-1';
if (!/^[a-z0-9_-]+$/i.test(label)) throw new Error('Use a plain directory label');
const out = join(repo, 'captures/fence-kit', label);
if (existsSync(out)) throw new Error(`Preserve existing captures: ${out}`);
mkdirSync(out, { recursive: true });
const port = 5269;
if (await reachable(`http://localhost:${port}`)) throw new Error('Review port already occupied');
const profile = scratchDir('fence-kit');
let browser, server;
const receipts = [];
const sourceFiles = ['assets/fence/fence-kit.kiln.js', 'assets/fence/fence-kit.glb',
  'app/src/scene/fence/fenceKit.ts', 'app/src/scene/fence/fenceField.ts', 'lab/src/KilnFence.tsx', 'app/src/scene/fence/fenceShadowMotion.ts', 'lab/src/subjects.ts',
  'app/src/scene/fence/timberStyle.ts', 'app/src/scene/fence/timberMaterial.ts',
  'app/src/scene/farmhouse/plan.ts', 'assets/grass/manifest.json', 'assets/grass/tufts.bin',
  'assets/barn/barn.kiln.js', 'assets/barn/barn.glb'];
const hashes = () => sourceFiles.map(file => ({ file,
  sha256: createHash('sha256').update(readFileSync(join(repo, file))).digest('hex') }));
const sources = hashes();
async function slider(page, name, value) {
  await page.locator('label').filter({ hasText: name }).locator('input').evaluate((input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}
try {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.lab.config.ts', '--port', String(port), '--strictPort'],
    { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  server.stdout.on('data', () => {});
  server.stderr.on('data', chunk => process.stderr.write(chunk));
  const deadline = Date.now() + 60_000;
  while (!await reachable(`http://localhost:${port}`)) {
    if (server.exitCode !== null || Date.now() > deadline) throw new Error('Lab did not start');
    await new Promise(r => setTimeout(r, 200));
  }
  browser = await launchBrowser(profile);
  for (const backend of ['webgpu', 'webgl']) for (const shape of ['desktop', 'phone']) {
    const viewport = shape === 'desktop' ? { width: 1600, height: 900 } : { width: 390, height: 844 };
    const folder = join(out, `${backend}-${shape}`);
    mkdirSync(folder, { recursive: true });
    const context = await browser.newContext({ viewport, deviceScaleFactor: shape === 'phone' ? 3 : 1,
      recordVideo: { dir: folder, size: viewport } });
    try {
      await context.addInitScript(() => {
        let calls = [], last = [];
        const wrap = (prototype, name, countAt, instancesAt) => {
          if (!prototype?.[name]) return;
          const original = prototype[name];
          prototype[name] = function (...args) {
            calls.push({ method: name, vertices: args[countAt], instances: args[instancesAt] ?? 1 });
            return original.apply(this, args);
          };
        };
        const gl = globalThis.WebGL2RenderingContext?.prototype, gpu = globalThis.GPURenderPassEncoder?.prototype;
        wrap(gl, 'drawArrays', 2, 99); wrap(gl, 'drawElements', 1, 99);
        wrap(gl, 'drawArraysInstanced', 2, 3); wrap(gl, 'drawElementsInstanced', 1, 4);
        wrap(gpu, 'draw', 0, 1); wrap(gpu, 'drawIndexed', 0, 1);
        const frame = () => {
          if (calls.length) last = calls;
          calls = [];
          if (document.body) {
            let node = document.querySelector('[data-fence-submissions]');
            if (!node) { node = document.createElement('output'); node.hidden = true; document.body.append(node); }
            node.setAttribute('data-fence-submissions', JSON.stringify(last));
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      await stubHarnessNetwork(context);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
      await page.goto(`http://localhost:${port}/${backend === 'webgl' ? '?debug=webgl' : ''}`);
      await page.getByRole('button', { name: 'Fence kit (Kiln)', exact: true }).click();
      await page.getByRole('button', { name: '200', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('dt') && [...document.querySelectorAll('dt')]
        .some(n => n.textContent === 'Backend' && /WebGPU|WebGL/i.test(n.nextElementSibling?.textContent ?? '')));
      await slider(page, 'Bearing', 3.14);
      await page.waitForTimeout(2500);
      const actual = await page.locator('dt:text-is("Backend") + dd').textContent();
      if (!actual?.toLowerCase().includes(backend === 'webgl' ? 'webgl' : 'webgpu')) throw new Error(`Wrong backend: ${actual}`);
      for (const [id, subject] of [['reference', 'Fence previous'], ['context', 'Fence kit (Kiln)'],
        ['outline', 'Fence perimeter (Kiln)'], ['straight', 'Fence straight (Kiln)'],
        ['corner', 'Fence corner (Kiln)'], ['gate', 'Fence gate (Kiln)']]) {
        await page.getByRole('button', { name: subject, exact: true }).click();
        await slider(page, 'Bearing', id === 'corner' ? -2.3 : id === 'reference' || id === 'context' ? -2.7 : 3.14);
        if (shape === 'phone') {
          await slider(page, 'Distance', id === 'reference' || id === 'context' ? 200 : id === 'outline' ? 170 : id === 'gate' ? 54 : id === 'straight' ? 38 : 32);
          if (id === 'reference' || id === 'context') await slider(page, 'Height', 70);
          if (id === 'outline') await slider(page, 'Height', 580);
        }
        await page.getByRole('button', { name: 'Hide', exact: true }).click();
        await page.waitForTimeout(1200);
        await page.screenshot({ path: join(folder, `${id}.png`) });
        await page.getByRole('button', { name: 'Panel', exact: true }).click();
      }
      await page.getByRole('button', { name: 'Gate open', exact: true }).click();
      await page.getByRole('button', { name: 'Hide', exact: true }).click();
      await page.waitForTimeout(2800);
      await page.screenshot({ path: join(folder, 'gate-closed.png') });
      await page.getByRole('button', { name: 'Panel', exact: true }).click();
      await page.getByRole('button', { name: 'Fence kit alone (Kiln)', exact: true }).click();
      await slider(page, 'Bearing', 3.14);
      if (shape === 'phone') { await slider(page, 'Distance', 170); await slider(page, 'Height', 580); }
      await page.getByRole('button', { name: 'Terrain and grass', exact: true }).click();
      await page.getByRole('button', { name: 'Silhouette', exact: true }).click();
      await page.waitForTimeout(1500);
      const counters = await page.locator('dl').innerText();
      const submissions = JSON.parse(await page.locator('[data-fence-submissions]').getAttribute('data-fence-submissions'));
      const assetDraws = submissions.filter(draw => !(draw.vertices === 3 && draw.instances === 1));
      if (assetDraws.length !== 3) throw new Error(`Fence kit submitted ${assetDraws.length} draws`);
      await page.getByRole('button', { name: 'Hide', exact: true }).click();
      await page.screenshot({ path: join(folder, 'silhouette.png') });
      receipts.push({ backend: actual, shape, counters, submissions, assetDraws: assetDraws.length, errors });
      if (errors.length) throw new Error(errors.join('\n'));
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  stopServer(server);
  removeDir(profile);
  const sourceStable = JSON.stringify(sources) === JSON.stringify(hashes());
  writeFileSync(join(out, 'receipt.json'), JSON.stringify({ note: 'Lab iteration only. Phone viewport is emulation. No timing qualification. Isolated frame includes one fullscreen background draw in addition to the three asset draws.', sources, sourceStable, receipts }, null, 2));
  if (!sourceStable) throw new Error('Source changed during capture');
}
console.log(out);
