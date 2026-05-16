import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_WORKER_BASE = 'https://sds-worker.matt-m-kissinger.workers.dev';

function parseArgs(argv) {
  const args = {
    dist: 'dist',
    target: process.env.BUILD_TARGET || 'native',
    out: 'cycle36-validation/native/preflight.json',
  };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([\w-]+)=(.*)$/);
    if (!m) continue;
    args[m[1]] = m[2];
  }
  return args;
}

async function findMainBundle(distDir) {
  const assetsDir = resolve(distDir, 'assets');
  const files = await readdir(assetsDir);
  const main = files.find((name) => /^main-.*\.js$/.test(name));
  if (!main) throw new Error('No main-*.js bundle found in dist/assets');
  return resolve(assetsDir, main);
}

function check(condition, message, details = null) {
  return { ok: !!condition, message, details };
}

function hasRootRelativeAssetUrls(html) {
  return /(?:src|href)="\/assets\//.test(html);
}

function hasRelativeAssetUrls(html) {
  return /(?:src|href)="\.\/assets\//.test(html);
}

async function run() {
  const args = parseArgs(process.argv);
  const distDir = resolve(ROOT, args.dist);
  const indexPath = resolve(distDir, 'index.html');
  const aboutPath = resolve(distDir, 'about.html');
  const mainBundlePath = await findMainBundle(distDir);
  const index = await readFile(indexPath, 'utf8');
  const about = await readFile(aboutPath, 'utf8');
  const mainBundle = await readFile(mainBundlePath, 'utf8');
  const expectedWorkerBase = process.env.SDS_WORKER_BASE || DEFAULT_WORKER_BASE;
  const swPath = resolve(distDir, 'sw.js');

  const checks = [
    check(index.includes(`const buildTarget = '${args.target}'`), 'index.html has native build target injected', { target: args.target }),
    check(!index.includes('__SDS_BUILD_TARGET__'), 'index.html has no unreplaced build-target token'),
    check(!existsSync(swPath), 'native build does not emit sw.js'),
    check(index.includes('serviceWorkerDisabledTargets.includes(buildTarget)'), 'service worker registration is gated by build target'),
    check(!hasRootRelativeAssetUrls(index), 'index.html has no root-relative asset URLs'),
    check(!hasRootRelativeAssetUrls(about), 'about.html has no root-relative asset URLs'),
    check(hasRelativeAssetUrls(index), 'index.html emits relative asset URLs for native shells'),
    check(hasRelativeAssetUrls(about), 'about.html emits relative asset URLs for native shells'),
    check(mainBundle.includes(expectedWorkerBase), 'main bundle contains configured worker base', { expectedWorkerBase }),
    check(mainBundle.includes('getApiBase') || mainBundle.includes('sds-worker'), 'main bundle includes runtime network configuration'),
  ];

  const result = {
    capturedAt: new Date().toISOString(),
    target: args.target,
    dist: args.dist,
    mainBundle: mainBundlePath.replace(ROOT, '').replace(/^[\\/]/, ''),
    ok: checks.every((c) => c.ok),
    checks,
  };

  console.log(JSON.stringify(result, null, 2));

  const outPath = resolve(ROOT, args.out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(result, null, 2));

  if (!result.ok) process.exit(1);
}

run().catch((err) => {
  console.error('[NATIVE-PREFLIGHT] fatal:', err);
  process.exit(1);
});
