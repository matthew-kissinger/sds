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
//   `return kind === 'coastline' || kind === 'island';`
// Reads RAW boundary.kind (NOT the rect-synthesised kind), matching the real
// predicate: Home Field has no `boundary`, so this is false for it.
function consolidatedTreeCull(s) {
  const kind = s.boundary?.kind;
  return kind === 'coastline' || kind === 'island';
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

export { classifyScene, consolidatedTreeCull, farImpostorsOnDefaultProd, effectiveBoundaryKind };

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

// --- Runtime-confirmation scaffold (NOT implemented this pass) ---------------
// On-device, genuine-WebGPU, structural-only. Confirms the static prediction
// actually materialized at runtime:
//   - impostor groups present y/n  (TreePlacement summary `impostorGroupsOk`)
//   - production-WebGPU boot gate pass/fail  (productionWebGpuBoot state.ok)
// It does NOT time anything. It would reuse the genuine-WebGPU launch path from
// tools/validation/screenshot-golden.mjs (installed Chrome, headed,
// assertWebGpuEngaged), load each scene once, read the structural facts, tear
// down. Deferred so it runs off the perf agent's schedule (one GPU at a time).
function runtimeConfirmNotice() {
  return [
    'Runtime confirmation is scaffolded but not implemented this pass.',
    'It is on-device + structural-only (no timing), and reuses the genuine-WebGPU',
    'launcher in tools/validation/screenshot-golden.mjs. Run it during the impostor',
    'burn-down, off the perf agent\'s GPU schedule. See the header for the contract.',
  ].join('\n');
}

// --- Main -------------------------------------------------------------------

async function main() {
  const args = new Set(process.argv.slice(2));
  const scenes = listScenes();
  const rows = scenes.map(classifyScene);

  if (args.has('--runtime')) {
    console.log(runtimeConfirmNotice());
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
