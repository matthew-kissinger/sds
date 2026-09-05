// SPDX-License-Identifier: AGPL-3.0-or-later
// Production-build art review. No editor code is imported into the game.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo } from './probe-lib.mjs';
import { collectBuiltFiles } from './playtest-profile-receipt.mjs';
import { renderArtReview, compareReports } from './art-review-report.mjs';

const args = process.argv.slice(2);
const option = (name, fallback = '') => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const validLabel = (label) => /^[a-z0-9][a-z0-9_-]*$/i.test(label);
const label = option('label', new Date().toISOString().replace(/[^a-z0-9]/gi, '-'));
const baseline = option('compare');
if (!validLabel(label) || (baseline && !validLabel(baseline))) throw new Error('Labels require letters, numbers, hyphens or underscores.');
const seconds = Number(option('seconds', '60'));
if (!Number.isFinite(seconds) || seconds < 1) throw new Error('--seconds must be positive.');
const output = join(repo, 'captures', 'profiling', label);
if (existsSync(output)) throw new Error(`Candidate already exists: ${label}. Use a new label to preserve evidence.`);
const baselinePath = join(repo, 'captures', 'profiling', baseline, 'report.json');
if (baseline && !existsSync(baselinePath)) throw new Error(`Baseline report missing: ${baseline}`);
const scenarios = option('scenarios', [
  'art-classic-webgpu', 'art-follow-webgpu', 'art-follow-webgl2',
  'art-phone-high-webgpu', 'art-phone-low-webgl2', 'art-landscape-low-webgl2',
].join(','));
if (scenarios.split(',').some((name) => !name.startsWith('art-'))) throw new Error('Use art- scenarios for isolated art review.');

async function run(script, arguments_ = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...arguments_], { cwd: repo, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

// Always rebuild: a candidate must not silently capture a stale dist directory.
if (await run('node_modules/typescript/bin/tsc', ['-b'])) throw new Error('TypeScript build failed.');
if (await run('node_modules/vite/bin/vite.js', ['build'])) throw new Error('Production build failed.');
const releaseExit = await run('tools/release-hardening-probe.mjs');
mkdirSync(output, { recursive: true });
const inventory = JSON.parse(readFileSync(join(repo, 'tools/art-review-sources.json'), 'utf8'));
const sources = inventory.map((system) => ({
  ...system,
  files: system.files.map((file) => {
    const bytes = readFileSync(join(repo, file));
    return { file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }),
}));
writeFileSync(join(output, 'sources.json'), JSON.stringify(sources, null, 2));
const profileExit = await run('tools/playtest-profile.mjs', [
  `--label=${label}`, `--seconds=${seconds}`, `--scenarios=${scenarios}`, `--port=${option('port', '5320')}`,
]);
const report = JSON.parse(readFileSync(join(output, 'report.json'), 'utf8'));
const previous = baseline ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
const comparison = previous ? compareReports(previous, report) : [];
const sourceStable = sources.every((system) => system.files.every(({ file, sha256 }) =>
  createHash('sha256').update(readFileSync(join(repo, file))).digest('hex') === sha256));
const review = {
  label, baseline: baseline || null, duration: seconds, releaseExit, profileExit, sourceStable,
  buildFiles: collectBuiltFiles(join(repo, 'dist')), comparison,
  artVerdict: 'UNREVIEWED', physicalMobile: 'NOT_TESTED',
  note: 'Browser emulation shares the host GPU. Stills are not frame-locked; compare composition, not pixel differences. Motion strips are not motion acceptance.',
};
writeFileSync(join(output, 'review.json'), JSON.stringify(review, null, 2));
writeFileSync(join(output, 'index.html'), renderArtReview(report, previous, review, sources));
console.log(`Art review: ${join(output, 'index.html')}`);
process.exitCode = releaseExit || profileExit || !sourceStable || comparison.some((row) => !row.comparable) ? 1 : 0;
