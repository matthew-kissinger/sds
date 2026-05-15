import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT_PATH = 'cycle36-validation/runtime/tree-refresh-baseline.json';
const EZ_TREE_PACKAGE_URL = 'https://registry.npmjs.org/@dgreenheck%2Fez-tree/latest';
const EZ_TREE_MAIN_PACKAGE_URL = 'https://raw.githubusercontent.com/dgreenheck/ez-tree/main/package.json';
const EZ_TREE_CHANGELOG_RAW_URL = 'https://raw.githubusercontent.com/dgreenheck/ez-tree/main/CHANGELOG.md';

const RECIPE_SEEDS = {
  ash: { small: 27, medium: 39, large: 51 },
  aspen: { small: 11, medium: 23, large: 41 },
  oak: { small: 5, medium: 17, large: 53 },
};

const UPSTREAM_EZ_TREE = {
  npmLatestObserved: '1.1.0',
  npmObservedAt: '2026-05-15',
  mainPackageVersionObserved: '1.1.0',
  changelogUrl: 'https://github.com/dgreenheck/ez-tree/blob/main/CHANGELOG.md',
  npmUrl: 'https://www.npmjs.com/package/@dgreenheck/ez-tree',
  unreleasedCandidateChanges: [
    'custom rounded normals for softer leaf shading',
    'corrected branch growth force direction',
    'stratified child branch and leaf placement to reduce spirals and clumping',
  ],
};

function parseArgs(argv) {
  const args = {
    outPath: DEFAULT_OUT_PATH,
    refreshUpstream: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--refresh-upstream') {
      args.refreshUpstream = true;
    } else if (arg.startsWith('--out=')) {
      args.outPath = arg.slice('--out='.length);
    } else if (!arg.startsWith('--')) {
      args.outPath = arg;
    }
  }

  return args;
}

function extractUnreleasedChanges(changelog) {
  const match = /## \[Unreleased\]([\s\S]*?)(?=\n## \[|\s*$)/.exec(changelog);
  if (!match) return [];

  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}

function isTreeRefreshCandidateChange(change) {
  return /\b(bark|branch|branches|growth|leaf|leaves|tree)\b/i.test(change);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response.text();
}

async function resolveUpstreamEzTree(refreshUpstream) {
  const staticObservedAt = UPSTREAM_EZ_TREE.npmObservedAt;
  const upstream = {
    ...UPSTREAM_EZ_TREE,
    observedFrom: 'static-verified-repo-note',
    sourceUrls: {
      npmLatest: EZ_TREE_PACKAGE_URL,
      mainPackage: EZ_TREE_MAIN_PACKAGE_URL,
      changelogRaw: EZ_TREE_CHANGELOG_RAW_URL,
    },
  };

  if (!refreshUpstream) return upstream;

  const observedAt = new Date().toISOString();
  try {
    const [pkg, mainPkg, changelog] = await Promise.all([
      fetchJson(EZ_TREE_PACKAGE_URL),
      fetchJson(EZ_TREE_MAIN_PACKAGE_URL),
      fetchText(EZ_TREE_CHANGELOG_RAW_URL),
    ]);

    const unreleasedChanges = extractUnreleasedChanges(changelog);
    return {
      ...upstream,
      npmLatestObserved: pkg.version ?? upstream.npmLatestObserved,
      npmObservedAt: observedAt,
      mainPackageVersionObserved: mainPkg.version ?? upstream.mainPackageVersionObserved,
      unreleasedChanges,
      unreleasedCandidateChanges: unreleasedChanges.filter(isTreeRefreshCandidateChange),
      observedFrom: 'live-npm-and-github-changelog',
      fallbackStaticObservedAt: staticObservedAt,
    };
  } catch (error) {
    return {
      ...upstream,
      npmObservedAt: observedAt,
      observedFrom: 'static-after-live-refresh-failed',
      refreshError: error.message,
      fallbackStaticObservedAt: staticObservedAt,
    };
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
}

function rel(path) {
  return relative(ROOT, path).replace(/\\/g, '/');
}

function fileStats(path) {
  const abs = resolve(ROOT, path);
  if (!existsSync(abs)) {
    throw new Error(`Missing required tree artifact: ${path}`);
  }
  return {
    path: rel(abs),
    bytes: statSync(abs).size,
  };
}

function parseTreePick(name) {
  const match = /^([a-z]+)_([a-z]+)_([a-z]+)(?:_lod1)?\.glb$/.exec(name);
  if (!match) {
    return null;
  }
  const [, species, scale, billboard] = match;
  return {
    species,
    scale,
    billboard,
    seed: RECIPE_SEEDS[species]?.[scale] ?? null,
  };
}

function compactPick(pick) {
  if (!pick) {
    return null;
  }
  return {
    sourcePath: pick.path,
    name: pick.name,
    canonicalName: pick.canonicalName,
    role: pick._role,
    tris: pick.tris,
    bbox: pick.bbox,
    recipe: parseTreePick(pick.name),
  };
}

function summarizeSidecar(treeId) {
  const sidecar = readJson(`assets/models/trees/${treeId}.imposter.json`);
  return {
    path: `assets/models/trees/${treeId}.imposter.json`,
    version: sidecar.version,
    angles: sidecar.angles,
    tilesX: sidecar.tilesX,
    tilesY: sidecar.tilesY,
    tileSize: sidecar.tileSize,
    atlasWidth: sidecar.atlasWidth,
    atlasHeight: sidecar.atlasHeight,
    axis: sidecar.axis,
    layout: sidecar.layout,
    hemi: sidecar.hemi,
    worldSize: sidecar.worldSize,
    yOffset: sidecar.yOffset,
    colorLayer: sidecar.colorLayer,
    normalSpace: sidecar.normalSpace,
    textureColorSpace: sidecar.textureColorSpace,
    auxLayers: sidecar.auxLayers,
    bbox: sidecar.bbox,
    source: {
      path: sidecar.source?.path ? rel(sidecar.source.path) : null,
      bytes: sidecar.source?.bytes ?? null,
      tris: sidecar.source?.tris ?? null,
    },
  };
}

function summarizeMaterialProof(path, treeId) {
  if (!existsSync(resolve(ROOT, path))) {
    return null;
  }
  const proof = readJson(path);
  return proof.files
    .filter((entry) => entry.path.includes(`/trees/${treeId}`))
    .map((entry) => ({
      group: entry.group,
      path: entry.path,
      materialNames: entry.materials?.map((material) => material.name) ?? entry.beforeMaterialNames ?? [],
      replacementStrategy: entry.replacement?.strategy ?? null,
      replacedMaterials: entry.replacement?.replacedMaterials ?? null,
      missingTargets: entry.replacement?.missingTargets ?? null,
    }));
}

async function main() {
  const args = parseArgs(process.argv);
  const packageJson = readJson('package.json');
  const packageLock = readJson('package-lock.json');
  const installedPackage = existsSync(resolve(ROOT, 'node_modules/@dgreenheck/ez-tree/package.json'))
    ? readJson('node_modules/@dgreenheck/ez-tree/package.json')
    : null;
  const picks = readJson('tools/asset-gallery/picks.json');
  const activeTreeIds = picks.picks
    .filter((pick) => /^tree\d+\.glb$/.test(pick.canonicalName))
    .map((pick) => pick.canonicalName.replace(/\.glb$/, ''))
    .sort();

  const trees = activeTreeIds.map((treeId) => {
    const lod0Pick = picks.picks.find((pick) => pick.canonicalName === `${treeId}.glb`);
    const lod1Pick = picks.picks.find((pick) => pick.canonicalName === `${treeId}_lod1.glb`);
    const runtimeGlbs = [
      fileStats(`assets/models/trees/${treeId}.glb`),
      fileStats(`assets/models/trees/${treeId}_lod1.glb`),
    ];
    const originals = [
      fileStats(`assets/_originals/models/trees/${treeId}.glb`),
      fileStats(`assets/_originals/models/trees/${treeId}_lod1.glb`),
    ];
    const impostorAtlases = [
      fileStats(`assets/models/trees/${treeId}.imposter.png`),
      fileStats(`assets/models/trees/${treeId}.imposter.normal.png`),
      fileStats(`assets/models/trees/${treeId}.imposter.depth.png`),
    ];
    return {
      id: treeId,
      picks: {
        lod0: compactPick(lod0Pick),
        lod1: compactPick(lod1Pick),
      },
      runtimeGlbs,
      originals,
      impostorAtlases,
      impostorSidecar: summarizeSidecar(treeId),
      materialOwnership: summarizeMaterialProof('cycle36-validation/runtime/material-ownership.json', treeId),
      materialReplacement: summarizeMaterialProof('cycle36-validation/runtime/material-replacement-proof.json', treeId),
    };
  });

  const totals = {
    runtimeGlbBytes: trees.flatMap((tree) => tree.runtimeGlbs).reduce((sum, file) => sum + file.bytes, 0),
    originalGlbBytes: trees.flatMap((tree) => tree.originals).reduce((sum, file) => sum + file.bytes, 0),
    impostorAtlasBytes: trees.flatMap((tree) => tree.impostorAtlases).reduce((sum, file) => sum + file.bytes, 0),
  };

  const upstreamEzTree = await resolveUpstreamEzTree(args.refreshUpstream);
  const baseline = {
    capturedAt: new Date().toISOString(),
    contract: 'konveyor-tree-refresh-baseline',
    sourceOfTruth: {
      picksPath: 'tools/asset-gallery/picks.json',
      picksSavedAt: picks.savedAt,
      activeTreeIds,
    },
    ezTree: {
      declared: packageJson.devDependencies?.['@dgreenheck/ez-tree'] ?? null,
      lockfile: packageLock.packages?.['node_modules/@dgreenheck/ez-tree']?.version ?? null,
      installed: installedPackage?.version ?? null,
      peerThree: installedPackage?.peerDependencies?.three ?? null,
      upstream: upstreamEzTree,
    },
    currentDecision: {
      verdict: 'do-not-rebake-yet',
      reason: 'SDS already resolves the latest npm release; upstream main contains relevant unreleased visual changes that need a measured gallery, impostor, material, visual, latency, and perf pass before replacing shipped assets.',
      acceptedInputSurface: 'artifact-backed evaluation only',
    },
    acceptanceBeforeAssetReplacement: [
      'run normal cache-invalidation tree rebake flow',
      're-run GLB compression and compare runtime/original bytes',
      're-run Kiln impostor bake if silhouette, canopy, trunk, or material output changes',
      'refresh material ownership and replacement proofs',
      'review gameplay/capture cameras for visible clumping or blocked action',
      'run tree asset, impostor sidecar, visual, latency, perf, build, native, lint, and test gates relevant to the accepted change',
    ],
    totals,
    trees,
  };

  mkdirSync(dirname(resolve(ROOT, args.outPath)), { recursive: true });
  writeFileSync(resolve(ROOT, args.outPath), `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    outPath: args.outPath,
    refreshUpstream: args.refreshUpstream,
    ezTreeObservedFrom: upstreamEzTree.observedFrom,
    activeTreeIds,
    totals,
  }));
}

main().catch((error) => {
  console.error('[TREE-REFRESH-BASELINE] fatal:', error);
  process.exit(1);
});
