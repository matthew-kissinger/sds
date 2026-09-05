// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Static Phase 7 release boundaries. Run after `npm run build`.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const repo = resolve(import.meta.dirname, '..');
const dist = join(repo, 'dist');
const MIB = 1024 * 1024;
const INITIAL_JS_GZIP_LIMIT = 1.5 * MIB;
const FIRST_LOAD_LIMIT = 8 * MIB;
const PAGE_PARAMS = new Set(['seed', 'debug']);
const COMPRESSIBLE = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt']);

function filesUnder(root) {
  const result = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) result.push(...filesUnder(path));
    else result.push(path);
  }
  return result;
}

function fail(message) {
  throw new Error(message);
}

if (!existsSync(dist)) fail('dist is absent; run npm run build first');

const distFiles = filesUnder(dist);
const jsFiles = distFiles.filter((path) => extname(path) === '.js');
const jsGzipBytes = jsFiles.reduce((sum, path) => sum + gzipSync(readFileSync(path)).byteLength, 0);
const estimatedTransferBytes = distFiles.reduce((sum, path) => {
  const bytes = readFileSync(path);
  return sum + (COMPRESSIBLE.has(extname(path)) ? gzipSync(bytes).byteLength : bytes.byteLength);
}, 0);
if (jsGzipBytes >= INITIAL_JS_GZIP_LIMIT) {
  fail(`initial JS gzip ${jsGzipBytes} exceeds ${INITIAL_JS_GZIP_LIMIT}`);
}
if (estimatedTransferBytes >= FIRST_LOAD_LIMIT) {
  fail(`first-load transfer estimate ${estimatedTransferBytes} exceeds ${FIRST_LOAD_LIMIT}`);
}

const appFiles = filesUnder(join(repo, 'app', 'src'))
  .filter((path) => /\.(ts|tsx)$/.test(path));
const playerParamReads = [];
for (const path of appFiles) {
  const source = readFileSync(path, 'utf8');
  if (!source.includes('window.location.search') && !source.includes('window.location.href')) continue;
  for (const match of source.matchAll(/(?:searchParams|URLSearchParams\([^)]*\))\.(?:get|set)\(['"]([^'"]+)['"]/g)) {
    playerParamReads.push({ file: relative(repo, path), name: match[1] });
  }
}
const unsupportedParams = playerParamReads.filter(({ name }) => !PAGE_PARAMS.has(name));
if (unsupportedParams.length > 0) {
  fail(`unsupported player-page URL params: ${JSON.stringify(unsupportedParams)}`);
}

const secretPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /test-secret-that-is-long-enough-for-hmac/,
];
for (const path of [...appFiles, ...distFiles]) {
  const source = readFileSync(path, 'utf8');
  if (secretPatterns.some((pattern) => pattern.test(source))) {
    fail(`client-visible secret signature in ${relative(repo, path)}`);
  }
}

const recipeManifests = [
  'assets/terrain/manifest.json',
  'assets/grass/manifest.json',
  'assets/scatter/manifest.json',
  'assets/treeline/manifest.json',
];
for (const name of recipeManifests) {
  const manifest = JSON.parse(readFileSync(join(repo, name), 'utf8'));
  if (typeof manifest.recipe !== 'string' || !existsSync(join(repo, manifest.recipe))) {
    fail(`${name} has no runnable in-repo recipe`);
  }
}

// Runtime character recipes are source assets too. Validate their declared
// LF-normalized encoding, rather than platform-dependent checkout bytes.
const dogAsset = JSON.parse(readFileSync(join(repo, 'assets/dog/procedural-manifest.json'), 'utf8'));
const farmerAsset = JSON.parse(readFileSync(join(repo, 'assets/farmer/source-digests.json'), 'utf8'));
if (dogAsset.license !== 'AGPL-3.0-or-later' || farmerAsset.license !== 'AGPL-3.0-or-later'
  || dogAsset.licenseFile !== 'LICENSE' || !existsSync(join(repo, 'LICENSE'))
  || dogAsset.digestEncoding !== 'UTF-8 with LF line endings'
  || farmerAsset.encoding !== 'UTF-8 with LF line endings') fail('character source provenance is incomplete');
const characterSources = [...dogAsset.sources,
  ...Object.entries(farmerAsset.sha256).map(([path, sha256]) => ({ path, sha256 }))];
if (dogAsset.sources.length < 10 || Object.keys(farmerAsset.sha256).length !== 4) fail('character source ledger is incomplete');
for (const source of characterSources) {
  if ((!source.path.startsWith('app/src/scene/') && source.path !== 'tools/record-dog-asset.mjs')
    || source.path.includes('..')) fail('invalid character source path');
  const bytes = readFileSync(join(repo, source.path), 'utf8').replaceAll('\r\n', '\n');
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== source.sha256) fail(`character source digest mismatch: ${source.path}`);
}

const audioManifest = JSON.parse(readFileSync(join(repo, 'assets/audio/manifest.json'), 'utf8'));
for (const asset of audioManifest.assets) {
  const path = join(repo, 'assets/audio', asset.file);
  if (!existsSync(path)) fail(`audio source absent: ${asset.file}`);
  const bytes = readFileSync(path);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (asset.byteSize !== bytes.byteLength || asset.sha256 !== digest) {
    fail(`audio ledger mismatch: ${asset.file}`);
  }
}

const foliageManifest = JSON.parse(
  readFileSync(join(repo, 'assets/treeline/procedural-manifest.json'), 'utf8'),
);
if (
  foliageManifest.version !== 7
  || foliageManifest.id !== 'authored-sculpted-oak-family-v1'
  || foliageManifest.license !== 'AGPL-3.0-or-later'
  || foliageManifest.runtime !== 'baked-procedural-geometry-threejs-tsl'
  || foliageManifest.activeCandidate !== 'sculpted-oak-family'
  || foliageManifest.field?.externalModels !== 0
  || foliageManifest.field?.sourceModels !== 0
  || foliageManifest.field?.textures !== 0
  || foliageManifest.field?.treeInstances !== 139
  || foliageManifest.field?.shrubInstances !== 0
  || foliageManifest.field?.draws !== 3
  || !(foliageManifest.field?.submittedTrianglesBeforeShadows < 400_000)
) {
  fail('foliage ledger is not the authored sculpted oak family within its field budget');
}
if (!Array.isArray(foliageManifest.sources) || foliageManifest.sources.length !== 1) {
  fail('foliage source ledger must contain exactly the authored oak recipe');
}
for (const source of foliageManifest.sources) {
  if (
    source.id !== 'sculpted-oak-recipe'
    || source.author !== 'Matthew Kissinger'
    || source.license !== 'AGPL-3.0-or-later'
    || source.licenseFile !== 'LICENSE'
    || !existsSync(join(repo, 'LICENSE'))
    || source.source !== 'tools/bake-sculpted-trees.mjs'
    || source.generated !== 'assets/treeline/sculpted-oak-family.json'
    || foliageManifest.recipe?.authoring !== source.source
  ) {
    fail(`unapproved foliage source entry: ${String(source.id)}`);
  }
  for (const [pathKey, digestKey] of [
    ['source', 'sha256'],
    ['generated', 'generatedSha256'],
  ]) {
    const relativePath = source[pathKey];
    const absolutePath = join(repo, ...relativePath.split('/'));
    if (!existsSync(absolutePath)) fail(`foliage source absent: ${relativePath}`);
    const digest = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
    if (!/^[a-f0-9]{64}$/.test(source[digestKey]) || digest !== source[digestKey]) {
      fail(`foliage source digest mismatch: ${relativePath}`);
    }
  }
  const geometry = JSON.parse(readFileSync(join(repo, source.generated), 'utf8'));
  if (
    geometry.id !== foliageManifest.activeCandidate
    || geometry.provenance?.source !== source.source
    || geometry.provenance?.sha256 !== source.sha256
    || geometry.provenance?.license !== source.license
    || geometry.geometry?.foliage?.triangles !== foliageManifest.geometry?.crownTriangles
    || geometry.geometry?.wood?.triangles !== foliageManifest.geometry?.trunkTriangles
    || (geometry.geometry.foliage.triangles + geometry.geometry.wood.triangles) * 139
      !== foliageManifest.field.submittedTrianglesBeforeShadows
  ) fail('baked foliage geometry does not match its authoring ledger');
}
for (const path of [
  foliageManifest.placement,
  foliageManifest.recipe?.assembly,
  ...(foliageManifest.recipe?.geometry ?? []),
  ...(foliageManifest.recipe?.materials ?? []),
]) {
  if (typeof path !== 'string' || !existsSync(join(repo, ...path.split('/')))) {
    fail(`procedural foliage source absent: ${String(path)}`);
  }
}
const builtExternalModels = distFiles.filter((path) => {
  const lower = path.toLowerCase();
  if (lower.endsWith('.font.glb')) return false;
  return ['.glb', '.gltf', '.obj', '.mtl'].includes(extname(lower));
});
if (builtExternalModels.length > 0) {
  fail(`external model entered dist: ${builtExternalModels.map((path) => relative(dist, path))}`);
}

const authoringConcepts = distFiles.filter((path) => {
  const name = relative(dist, path).toLowerCase();
  return name.includes('sheep-silhouette-reference')
    || name.includes('v3-original-foliage-reference');
});
if (authoringConcepts.length > 0) fail('authoring-only concept entered dist');

const forbiddenLaunchSignatures = [
  { name: 'WebSocket client', pattern: /\bWebSocket\b/ },
  { name: 'room flow', pattern: /\broom(?:Code)?\b/i },
  { name: 'five-thousand sheep choice', pattern: /5,000|5000 sheep/i },
  { name: 'GPU flock implementation', pattern: /GpuComputeSim|GpuFlock/ },
  { name: 'browser recording API', pattern: /MediaRecorder/ },
  { name: 'audio capture helper', pattern: /AudioCaptureControl|audio-capture|captureStream/ },
  { name: 'scripted herding driver', pattern: /herding-driver|ScriptedDog|debug=driver/ },
  { name: 'public debug readout', pattern: /DebugReadout|debug-readout|debug=readout/ },
  { name: 'public diagnostic token', pattern: /["'`](?:driver|readout|audio-long|beauty|sheep-outline|sheep-ramp)["'`]/ },
  { name: 'multiplayer title action', pattern: /Play together/ },
];
const launchExecutableFiles = distFiles.filter((candidate) => {
  const extension = extname(candidate);
  return extension === '.js' || extension === '.css' || relative(dist, candidate) === 'index.html';
});
for (const path of launchExecutableFiles) {
  const source = readFileSync(path, 'utf8');
  for (const signature of forbiddenLaunchSignatures) {
    if (signature.pattern.test(source)) {
      fail(`${signature.name} entered ${relative(dist, path)}`);
    }
  }
}

const launchExecutableSource = launchExecutableFiles
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');
for (const required of [
  'sds-worker.matt-m-kissinger.workers.dev',
  'field-v3',
  'soloClassic',
]) {
  if (!launchExecutableSource.includes(required)) {
    fail(`solo-times release signature absent: ${required}`);
  }
}

const result = {
  initialJs: {
    chunks: jsFiles.length,
    gzipBytes: jsGzipBytes,
    limitBytes: INITIAL_JS_GZIP_LIMIT,
  },
  firstLoad: {
    files: distFiles.length,
    rawBytes: distFiles.reduce((sum, path) => sum + statSync(path).size, 0),
    estimatedTransferBytes,
    limitBytes: FIRST_LOAD_LIMIT,
  },
  playerPageParams: [...new Set(playerParamReads.map(({ name }) => name))].sort(),
  recipeManifests: recipeManifests.length,
  characterSourcesVerified: characterSources.length,
  audioAssetsVerified: audioManifest.assets.length,
  foliageSource: foliageManifest.id,
  foliageExternalModels: foliageManifest.field.externalModels,
  builtExternalModels: builtExternalModels.length,
  launchBoundary: 'solo 25/75/200 with local bests and fail-soft online times',
  clientSecretScan: 'clean',
};

console.log(JSON.stringify(result, null, 2));
