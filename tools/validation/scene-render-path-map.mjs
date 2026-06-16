// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Scene render-path map - a STATIC, no-browser, no-perf diagnostic.
 *
 * Purpose (from docs/burndown-notes.md "the custom harness"): stop discovering
 * per-scene render-path divergences by accident. The Home Field impostor gap
 * (it is the only non-consolidated scene, so it gets no far impostors on the
 * default production path) was found by eye in the stats profiler. This map
 * makes that kind of divergence something we read off a table on purpose.
 *
 * SCOPE BOUNDARY: this tool is deliberately NOT a perf harness. It does not
 * launch the game, does not time anything, does not read frame rate, draw-call
 * cost, or sustained-play metrics. Those belong to the separate perf effort and
 * are kept out so the two never contend for the GPU or step on each other.
 * What this reports is CATEGORICAL render-path structure derived purely from the
 * SceneDef: which foliage route a scene takes, whether it gets far impostors on
 * the default production path, its loading shape, renderer pin, and tree source.
 *
 * It imports the real SceneDefs (shared/scenes/ is Node-safe; the Worker imports
 * the same modules), so the structural facts are not guessed. The one routing
 * predicate it needs - usesConsolidatedTreeCull - lives in a THREE-importing
 * render module (js/world/TreePlacement.js) that a pure-Node script cannot load,
 * so it is mirrored here as a one-liner with a SOURCE pointer. The mirror is
 * locked against the real predicate by tests/scene-render-path-map.spec.js, so
 * it cannot drift silently.
 *
 * A second layer - on-device runtime confirmation (did the predicted path
 * actually materialize: impostor groups present y/n, production-WebGPU boot gate
 * pass/fail) - is scaffolded below but NOT implemented this pass. It is also
 * structural-only (still no timing) and will run on-device, off the perf agent's
 * schedule, when we pick up the impostor burn-down.
 *
 * Usage:
 *   node tools/validation/scene-render-path-map.mjs            # print the table
 *   node tools/validation/scene-render-path-map.mjs --json     # also write JSON
 *   node tools/validation/scene-render-path-map.mjs --runtime  # (scaffold notice)
 */

import { writeFile } from 'node:fs/promises';
import { argv } from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { listScenes } from '../../shared/scenes/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_OUT = resolve(__dirname, 'scene-render-path-map.json');

// --- Routing predicates -----------------------------------------------------
// Each mirrors a single real gate. Keep these one-liners; the moment one needs
// to grow, import the real thing instead. tests/scene-render-path-map.spec.js
// asserts these against the canonical js/ sources per scene.

// Display-only. createGameState synthesises {kind:'rect', ...bounds} for scenes
// that ship only the legacy `bounds` field (shared/scenes/types.js boundary
// typedef). Home Field is the only such scene today.
function effectiveBoundaryKind(s) {
  if (s.boundary?.kind) return s.boundary.kind;
  if (s.bounds) return 'rect';
  return 'none';
}

// SOURCE: usesConsolidatedTreeCull, js/world/TreePlacement.js:592
//   `return kind === 'coastline' || kind === 'island' || sceneDef?.consolidatedTrees === true;`
// Reads RAW boundary.kind (NOT the rect-synthesised kind) plus the Cycle 104
// Phase 2 `consolidatedTrees` opt-in flag, matching the real predicate. Home
// Field now sets the flag (Option B), so it is consolidated despite its rect
// boundary. Locked against the real predicate by tests/scene-render-path-map.spec.js.
function consolidatedTreeCull(s) {
  const kind = s.boundary?.kind;
  return kind === 'coastline' || kind === 'island' || s.consolidatedTrees === true;
}

// SOURCE: createNativeTreeInstancedMeshes, js/world/TreePlacement.js:604-620 +
//   resolveWebGpuNativeTreeImpostorRoute, js/world/TreePlacement.js:543.
// On the default production path no `?webgpuNativeTreeImpostors` flag is set, so
// `impostorRoute.active` is false and per-chunk scenes get NO kiln impostor.
// Consolidated (island/coastline) scenes get far impostors from the cull path
// instead. So "far impostors on the default prod path" == consolidatedTreeCull.
function farImpostorsOnDefaultProd(s) {
  return consolidatedTreeCull(s);
}

// SOURCE: shared/scenes/types.js TerrainDef.streamedZones + scene-and-render.md
//   "Scene loading stages". streamedZones present => streamed; else all-cold.
function loadingShape(s) {
  return s.terrain?.streamedZones ? 'streamed' : 'all-cold';
}

// SOURCE: shared/scenes/types.js SceneDef.renderer (Cycle 71 WebGL pin).
function rendererPin(s) {
  return s.renderer === 'webgl' ? 'webgl-pin' : 'global';
}

// SOURCE: shared/scenes/types.js SceneDef.placementManifest (Cycle 45).
function treeSource(s) {
  return s.placementManifest ? 'baked-manifest' : 'runtime-scatter';
}

function classifyScene(s) {
  return {
    id: s.id,
    name: s.name,
    boundaryKind: effectiveBoundaryKind(s),
    consolidatedTreeCull: consolidatedTreeCull(s),
    farImpostorsDefaultProd: farImpostorsOnDefaultProd(s),
    loadingShape: loadingShape(s),
    renderer: rendererPin(s),
    treeSource: treeSource(s),
    perimeterFence: s.perimeterFence === false ? 'off' : 'on',
    objective: s.objective ? 'roundup-multistage' : 'corral-entry',
    dayNight: s.dayNight?.enabled ? 'yes' : '-',
    survival: s.survival ? 'yes' : '-',
    prewarmShaders: s.prewarmShaders ? 'yes' : '-',
    defaultCamera: s.defaultCamera ?? 'classic',
    // Modes axis (pure data; no perf). Sheep-count ladder per scene.
    soloLadder: (s.soloLadder ?? []).map(r => ({ id: r.id, count: r.count, ranked: !!r.ranked })),
    allowedModes: s.allowedModes ?? [],
  };
}

export { classifyScene, consolidatedTreeCull, farImpostorsOnDefaultProd, effectiveBoundaryKind, deriveRuntimeRow };

// --- Table rendering --------------------------------------------------------

function bool(v) { return v ? 'Y' : 'N'; }

function pad(str, width) {
  const s = String(str);
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

function renderTable(rows) {
  const cols = [
    ['scene', r => r.id, 16],
    ['boundary', r => r.boundaryKind, 10],
    ['cull', r => bool(r.consolidatedTreeCull), 5],
    ['farImp', r => bool(r.farImpostorsDefaultProd), 7],
    ['loading', r => r.loadingShape, 10],
    ['renderer', r => r.renderer, 10],
    ['trees', r => r.treeSource, 16],
    ['fence', r => r.perimeterFence, 6],
    ['objective', r => r.objective, 18],
    ['survival', r => r.survival, 9],
  ];
  const header = cols.map(([h, , w]) => pad(h, w)).join(' ');
  const sep = cols.map(([, , w]) => '-'.repeat(w)).join(' ');
  const body = rows.map(r => cols.map(([, fn, w]) => pad(fn(r), w)).join(' ')).join('\n');
  return `${header}\n${sep}\n${body}`;
}

function renderModes(rows) {
  return rows.map(r => {
    const ladder = r.soloLadder.length
      ? r.soloLadder.map(x => `${x.id}:${x.count}${x.ranked ? '' : '(unranked)'}`).join('  ')
      : '(default ladder)';
    return `  ${pad(r.id, 16)} ${ladder}`;
  }).join('\n');
}

// --- Runtime-confirmation layer (on-device; structural-only, NO timing) ------
// Confirms the static prediction actually materialized at runtime:
//   - production-WebGPU boot gate pass/fail  (window.__sdsG.productionWebGpu.ok
//     + window.__sdsRendererMode.effective - the screenshot-golden.mjs signals)
//   - far-impostor groups present y/n  (the consolidated cull registry's far
//     instance count, or a per-chunk tree group tagged hybridRole far-impostor)
// Reads NO frame-rate / timing / draw-cost metric. Reuses the genuine-WebGPU
// launcher pattern from tools/validation/screenshot-golden.mjs (installed Chrome,
// headed, --enable-unsafe-webgpu) against a running dev server on RUNTIME_BASE_URL.
// playwright is lazy-imported inside runRuntimeLayer so the static path and the
// lock spec (which import only the pure helpers) never pull it in.

const RUNTIME_BASE_URL = (typeof process !== 'undefined' && process.env?.SDS_RUNTIME_BASE_URL)
  || 'http://localhost:3000/';
const RUNTIME_LAUNCH_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];

// Pure: map the raw in-page reads to a structural row. GPU-free, unit-tested by
// tests/scene-render-path-map.spec.js. Keep all browser IO out of here.
function deriveRuntimeRow(sceneId, raw) {
  const bootGate = raw?.bootGate ?? {};
  const gateOk = bootGate.ok === true && bootGate.effective !== 'webgl';
  const imp = raw?.impostors ?? {};
  const groups = raw?.groups ?? {};
  const farInstances = Number(imp.farInstances ?? 0) || 0;
  const cullRegistry = Number(imp.registry ?? 0) || 0;
  const farImpostorGroups = Number(groups.farImpostorGroups ?? 0) || 0;
  const readError = imp.error ?? groups.error ?? null;
  const present = farInstances > 0 || farImpostorGroups > 0;
  return {
    scene: sceneId,
    bootGate: gateOk ? 'pass' : 'FAIL',
    effective: bootGate.effective ?? null,
    reason: gateOk ? null : (bootGate.reason ?? null),
    // null = could not read (a structural read errored), not "absent".
    impostorsPresent: readError ? null : present,
    farInstances,
    cullRegistry,
    farImpostorGroups,
    readError,
  };
}

// On-device: the in-page structural reads. Eval bodies mirror screenshot-golden.mjs.
async function runtimeReads(page) {
  const bootGate = await page.evaluate(() => ({
    ok: window.__sdsG?.productionWebGpu?.ok === true,
    effective: window.__sdsRendererMode?.effective ?? null,
    reason: window.__sdsG?.productionWebGpu?.error ?? window.__sdsRendererMode?.fallbackReason ?? null,
  }));
  const impostors = await page.evaluate(() => {
    try {
      const tb = window.gameInstance?.terrainBuilder ?? window.__sds?.sceneManager?.terrainBuilder;
      const reg = tb?._treeCullRegistry;
      let registry = 0, farInstances = 0;
      if (reg && reg.size) {
        registry = reg.size;
        for (const e of reg.values()) {
          const fm = e?.far?.mesh ?? e?.farController?.mesh ?? e?.farMesh ?? null;
          farInstances += Number(fm?.count ?? fm?.instanceCount ?? 0) || 0;
        }
      }
      return { registry, farInstances };
    } catch (err) { return { error: String(err?.message || err) }; }
  });
  const groups = await page.evaluate(() => {
    try {
      const tb = window.gameInstance?.terrainBuilder ?? window.__sds?.sceneManager?.terrainBuilder;
      let farImpostorGroups = 0;
      const scan = (node, depth) => {
        if (!node || depth > 6) return;
        const role = node.userData?.hybridRole ?? node.hybridRole;
        if (role === 'far-impostor') farImpostorGroups += 1;
        for (const k of (node.children ?? [])) scan(k, depth + 1);
      };
      scan(tb?.trees, 0);
      return { farImpostorGroups };
    } catch (err) { return { error: String(err?.message || err) }; }
  });
  return { bootGate, impostors, groups };
}

async function runRuntimeLayer() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: RUNTIME_LAUNCH_ARGS });
  const rows = [];
  try {
    for (const scene of listScenes()) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      try {
        const url = new URL(RUNTIME_BASE_URL);
        url.searchParams.set('perfMode', '1');
        url.searchParams.set('probeRender', '1');
        url.searchParams.set('renderer', 'webgpu');
        url.searchParams.set('scene', scene.id);
        url.searchParams.set('ui', 'off');
        await page.goto(url.toString(), { waitUntil: 'load', timeout: 90_000 });
        await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 30_000 });
        await page.evaluate(() => window.__sdsCinema.waitReady(90_000));
        await page.evaluate(() => { window.__sdsCinema.startSolo?.('jep', 'classic'); });
        await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 90_000 });
        rows.push(deriveRuntimeRow(scene.id, await runtimeReads(page)));
      } catch (err) {
        rows.push({ scene: scene.id, bootGate: 'ERROR', readError: String(err?.message || err) });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return rows;
}

function renderRuntimeTable(rows) {
  const cols = [
    ['scene', r => r.scene, 16],
    ['bootGate', r => r.bootGate ?? '?', 9],
    ['effective', r => r.effective ?? '-', 10],
    ['impostors', r => (r.impostorsPresent == null ? '?' : bool(r.impostorsPresent)), 10],
    ['farInst', r => String(r.farInstances ?? 0), 8],
    ['note', r => r.readError ?? r.reason ?? '', 44],
  ];
  const header = cols.map(([h, , w]) => pad(h, w)).join(' ');
  const sep = cols.map(([, , w]) => '-'.repeat(w)).join(' ');
  const body = rows.map(r => cols.map(([, fn, w]) => pad(fn(r), w)).join(' ')).join('\n');
  return `${header}\n${sep}\n${body}`;
}

// --- Main -------------------------------------------------------------------

async function main() {
  const args = new Set(process.argv.slice(2));
  const scenes = listScenes();
  const rows = scenes.map(classifyScene);

  if (args.has('--runtime')) {
    console.log('Scene render-path map - RUNTIME confirmation (on-device; structural-only, no timing)');
    console.log(`Base URL: ${RUNTIME_BASE_URL}  (needs a running dev server + installed Chrome with WebGPU)\n`);
    try {
      const rows = await runRuntimeLayer();
      console.log(renderRuntimeTable(rows));
      console.log('\nimpostors=Y confirms far-impostor groups materialized; bootGate=pass');
      console.log('confirms the production-WebGPU path engaged (no silent WebGL demotion).');
    } catch (err) {
      console.error('\nRuntime layer could not run. This path is on-device: it needs a dev');
      console.error('server on the base URL and installed Chrome with WebGPU (set');
      console.error('SDS_RUNTIME_BASE_URL to override the URL).');
      console.error(`Cause: ${err?.message || err}`);
      process.exitCode = 1;
    }
    return;
  }

  console.log('Scene render-path map (static; no browser, no perf)\n');
  console.log(renderTable(rows));
  console.log('\nLegend:');
  console.log('  cull   = usesConsolidatedTreeCull (boundary.kind island|coastline)');
  console.log('  farImp = far impostors present on the DEFAULT production path');
  console.log('           (non-consolidated scenes only get impostors under');
  console.log('           ?webgpuNativeTreeImpostors, so farImp == cull)');
  console.log('\nModes (sheep-count ladder per scene; data only, no perf):');
  console.log(renderModes(rows));
  console.log('\nNotes:');
  console.log('  - Home Field (field) is the sole non-consolidated scene: boundary');
  console.log('    is legacy `bounds` (synthesised rect), so cull=N and farImp=N.');
  console.log('    This is finding 1 in docs/burndown-notes.md.');
  console.log('  - newsheepdogland stays registered + reachable via ?scene=; the');
  console.log('    entrance Play button is disabled (Coming soon). Its render-path');
  console.log('    row is still characterised here for the NSL burn-down.');

  if (args.has('--json')) {
    await writeFile(JSON_OUT, JSON.stringify({ generatedBy: 'scene-render-path-map.mjs', scenes: rows }, null, 2));
    console.log(`\nWrote ${JSON_OUT}`);
  }
}

// Run main only on direct invocation, not when imported (the lock spec
// tests/scene-render-path-map.spec.js imports classifyScene + the mirrors).
const isDirectRun = import.meta.url === pathToFileURL(argv[1] ?? '').href;
if (isDirectRun) {
  main().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
