// SPDX-License-Identifier: AGPL-3.0-or-later
// Functional and visual receipts from the actual production build. No PC timings.
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { collectBuildReceipt, sameBuildReceipt } from './playtest-profile-receipt.mjs';
import { launchBrowser, removeDir, repo, scratchDir, startPreviewServer, stopServer, stubHarnessNetwork } from './probe-lib.mjs';

const label = process.argv[2];
const gateView = process.argv.includes('--gate');
if (!label || !/^[a-z0-9_-]+$/i.test(label)) throw new Error('Supply a unique plain directory label');
const out = join(repo, 'captures/fence-kit', label);
if (existsSync(out)) throw new Error(`Preserve existing captures: ${out}`);
mkdirSync(out, { recursive: true });
const originalBuild = collectBuildReceipt();
const profile = scratchDir('fence-runtime');
const report = { note: 'Production build. Phone viewport is composition only. No timing qualification.', build: originalBuild, cases: [] };
let server, browser;
try {
  // Derive signatures from the exact shipped builder, without adding a browser
  // diagnostics bridge or loading editor code into the game.
  const descriptor = join(out, 'batch-descriptor.mjs');
  await build({ stdin: { contents: "export {readFenceKit} from './app/src/scene/fence/fenceKit.ts'; export {buildFenceField} from './app/src/scene/fence/fenceField.ts';", resolveDir: repo },
    bundle: true, platform: 'node', packages: 'external', format: 'esm', outfile: descriptor, logLevel: 'silent' });
  const { readFenceKit, buildFenceField } = await import(pathToFileURL(descriptor).href);
  const bytes = readFileSync(join(repo, 'assets/fence/fence-kit.glb'));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const kit = readFenceKit(gltf.scene), field = buildFenceField(kit, () => 0);
  report.assetSha256 = createHash('sha256').update(bytes).digest('hex');
  report.expectedBatches = field.objects.map(mesh => ({ vertices: mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count, instances: mesh.count ?? 1 }));
  for (const mesh of field.objects) { mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose?.(); }
  kit.post.dispose(); kit.rail.dispose();
  server = await startPreviewServer(5293);
  browser = await launchBrowser(profile);
  const browserSession = await browser.newBrowserCDPSession();
  report.gpu = (await browserSession.send('SystemInfo.getInfo')).gpu;
  await browserSession.detach();
  if (/swiftshader|llvmpipe|software rasterizer/i.test(JSON.stringify(report.gpu))) throw new Error('Software renderer invalidates this receipt');
  for (const backend of ['webgpu', 'webgl2']) for (const shape of ['desktop', 'phone']) {
    const folder = join(out, `${backend}-${shape}`);
    mkdirSync(folder, { recursive: true });
    const viewport = shape === 'desktop' ? { width: 1600, height: 900 } : { width: 390, height: 844 };
    const context = await browser.newContext({ viewport, deviceScaleFactor: shape === 'phone' ? 3 : 1,
      recordVideo: { dir: folder, size: viewport } });
    const receipt = { backend, shape, errors: [], requestsFailed: [], captures: [] };
    report.cases.push(receipt);
    try {
      await context.addInitScript(() => {
        localStorage.setItem('herd.settings.v1', JSON.stringify({ quality: 'high' }));
        let calls = [], last = [];
        const wrap = (prototype, name, countAt, instancesAt) => {
          if (!prototype?.[name]) return;
          const original = prototype[name];
          prototype[name] = function (...args) {
            calls.push({ vertices: args[countAt], instances: args[instancesAt] ?? 1 });
            return Reflect.apply(original, this, args);
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
            let node = document.querySelector('[data-runtime-submissions]');
            if (!node) { node = document.createElement('output'); node.hidden = true; document.body.append(node); }
            node.setAttribute('data-runtime-submissions', JSON.stringify(last));
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      await stubHarnessNetwork(context);
      const page = await context.newPage();
      page.on('pageerror', error => receipt.errors.push(String(error)));
      page.on('console', msg => { if (msg.type() === 'error') receipt.errors.push(msg.text()); });
      page.on('requestfailed', request => receipt.requestsFailed.push(request.url()));
      await page.goto(`http://127.0.0.1:5293/?seed=20260821${backend === 'webgl2' ? '&debug=webgl' : ''}`);
      await page.locator('.herd-app[data-ready="true"]').waitFor({ state: 'attached', timeout: 90000 });
      receipt.surface = await page.locator('.herd-app').evaluate(node => ({ ...node.dataset }));
      if (receipt.surface.backend !== backend) throw new Error(`Requested ${backend}, rendered ${receipt.surface.backend}`);
      const capture = async name => {
        await page.waitForTimeout(1400);
        const calls = JSON.parse(await page.locator('[data-runtime-submissions]').getAttribute('data-runtime-submissions'));
        const matches = report.expectedBatches.map(expected => calls.filter(call => call.vertices === expected.vertices && call.instances === expected.instances).length);
        receipt.captures.push({ name, totalDraws: calls.length, fenceMatches: matches });
        if (matches.some(count => count !== 1)) throw new Error(`${name}: expected one submission per fence role, got ${matches}`);
        if (calls.length >= 100) throw new Error(`${name}: exceeded whole-frame budget`);
        await page.screenshot({ path: join(folder, `${name}.png`) });
      };
      await capture('title');
      await page.locator('.herd-size').filter({ hasText: '200' }).click();
      await page.locator('.herd-title-actions > .herd-button--primary').click();
      await capture('classic-spawn');
      const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
      await hold('KeyA', gateView ? 1350 : 3400);
      await hold('KeyW', gateView ? 9500 : 11000);
      await capture(gateView ? 'classic-gate' : 'classic-homestead');
      await page.keyboard.press('KeyC');
      await capture(gateView ? 'follow-gate' : 'follow-homestead');
      if (receipt.errors.length || receipt.requestsFailed.length) throw new Error(JSON.stringify(receipt));
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  stopServer(server); removeDir(profile);
  report.buildStable = sameBuildReceipt(originalBuild, collectBuildReceipt());
  writeFileSync(join(out, 'receipt.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (!report.buildStable) throw new Error('Build changed during capture');
}
console.log(out);
