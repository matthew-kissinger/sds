// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Post-first-interactive foliage streaming (Cycle 87 Phase 2).
 *
 * The Cycle 85 first-session hardening bounded the Newsheepdogland cold-path
 * tree zones and grass radius to the homestead corridor so the entrance Play
 * click stays fast on slow hosts. This module restores the rest of the island
 * AFTER the scene is interactive: one idle-scheduled wave per zone rect in
 * `sceneDef.terrain.streamedZones`, scattered deterministically with a
 * per-wave salted PRNG, built additively onto the existing tree arrays so
 * scene teardown (clearTrees/dispose) needs no new paths.
 *
 * Scheduling: armed from buildSceneBody (the wolf lazy-load pattern), starts
 * on the QualityGovernor warmup-complete signal (bounded by
 * FALLBACK_START_DELAY_MS, so streaming never reads as a cold-load frame
 * spike), then one requestIdleCallback per
 * wave with a macrotask yield between the scatter and the mesh build. The
 * whole pipeline aborts via the scene's AbortController (`game._sceneAbort`),
 * so an in-flight wave never builds into a disposed scene.
 *
 * Determinism: each wave scatters with mulberry32(seed ^ fnv1a(waveName)) -
 * independent of the cold stream (which stays byte-identical) and stable
 * across runs for the same scene. Streamed candidates inside any cold-path
 * zone rect are rejected, and the canopy-overlap pass is seeded with every
 * already-accepted tree (cold + earlier waves).
 *
 * Diagnostics ride `window.__sdsFoliageStreaming` for the Phase 4 probe.
 */

import { generateTrees } from '../../shared/TreePlacement.js';
import { mulberry32 } from '../../shared/Random.js';
import {
    buildAdditiveTreeMeshes,
    buildColdImpostorMeshes,
    cullTreesForScene,
    enableConsolidatedFarImpostors,
    loadColdImpostorAtlas,
    reserveConsolidatedTreeCapacity,
    retireColdImpostorWave,
    toTreeInstancesByType,
} from './TreePlacement.js';
import { getSceneManager } from '../GameBridge.js';
import { TIER_PRESETS } from '../HardwareTier.js';

/** Cycle 88 Phase 4: arming is signal-based - the streamer starts when the
 * QualityGovernor reports its warmup window closed (the fixed 6.5s timer it
 * replaces existed only to outwait that window). This fallback timer bounds
 * the wait so a missing governor (load failure, headless harness) can never
 * stall streaming forever. */
export const FALLBACK_START_DELAY_MS = 10_000;

/** Cycle 87 Phase 4: zone rects larger than this split into quadrant
 * sub-waves (recursively, depth-capped) so a single scatter slice stays
 * small even on slow hosts. The Poisson walk costs by rect area; measured
 * ~85ms per 2.7M m^2 on the reference desktop, so 1.5M m^2 keeps reference
 * slices ~25-45ms and slow-host slices bounded. Canopy spacing holds across
 * sub-rect borders because every sub-wave checks against all prior trees. */
export const MAX_WAVE_AREA_M2 = 1_500_000;
const MAX_SPLIT_DEPTH = 2;

function splitRect(name, rect, depth = 0) {
    const area = (rect.maxX - rect.minX) * (rect.maxZ - rect.minZ);
    if (area <= MAX_WAVE_AREA_M2 || depth >= MAX_SPLIT_DEPTH) {
        return [{ name, zoneRect: rect }];
    }
    const midX = (rect.minX + rect.maxX) / 2;
    const midZ = (rect.minZ + rect.maxZ) / 2;
    const quads = [
        { minX: rect.minX, maxX: midX, minZ: rect.minZ, maxZ: midZ },
        { minX: midX, maxX: rect.maxX, minZ: rect.minZ, maxZ: midZ },
        { minX: rect.minX, maxX: midX, minZ: midZ, maxZ: rect.maxZ },
        { minX: midX, maxX: rect.maxX, minZ: midZ, maxZ: rect.maxZ },
    ];
    return quads.flatMap((q, i) => splitRect(`${name}.q${i}`, q, depth + 1));
}

/** FNV-1a 32-bit hash for wave-name salting. */
export function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/**
 * Plan the streaming waves for a scene def. Pure; used by tests. Each zone
 * yields one or more sub-waves (large rects quad-split, Phase 4); every wave
 * carries its parent `zone` plus a zero-based `zoneIndex` for tier gating.
 *
 * @param {import('../../shared/scenes/types.js').SceneDef} sceneDef
 * @param {{maxZones?: number}} [opts] Tier gate: stream only the first
 *   `maxZones` zones (default all).
 * @returns {Array<{name: string, zone: string, zoneIndex: number, zoneRect: object}>}
 */
export function planFoliageWaves(sceneDef, opts = {}) {
    const streamed = sceneDef?.terrain?.streamedZones;
    if (!streamed) return [];
    const maxZones = opts.maxZones ?? Infinity;
    // Same near-to-far vocabulary order as the cold scatter's ZONES table;
    // any non-standard zone names append after, sorted for determinism.
    const order = ['nearField', 'midField', 'farField', 'horizon'];
    const zoneNames = [
        ...order.filter((name) => streamed[name]),
        ...Object.keys(streamed).sort().filter((name) => !order.includes(name)),
    ];
    const waves = [];
    zoneNames.forEach((zone, zoneIndex) => {
        if (zoneIndex >= maxZones) return;
        for (const sub of splitRect(zone, streamed[zone])) {
            waves.push({ ...sub, zone, zoneIndex });
        }
    });
    return waves;
}

/**
 * Cold-path exclusion rects: every cold `terrain.zones` rect except playArea
 * (playArea is a gameplay bound, not a placement zone).
 */
export function coldExclusionRects(sceneDef) {
    const zones = sceneDef?.terrain?.zones ?? {};
    return Object.entries(zones)
        .filter(([name]) => name !== 'playArea')
        .map(([, rect]) => rect);
}

function yieldMacrotask(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function idleSlot(signal) {
    return new Promise((resolve) => {
        if (signal?.aborted) { resolve(); return; }
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => resolve(), { timeout: 2000 });
        } else {
            setTimeout(resolve, 200);
        }
    });
}

/**
 * Scatter one wave. Sync CPU work; bounded by the per-wave zone rect.
 *
 * @returns {Array} streamed TreeInstance[] for this wave (post scene culls).
 */
export function scatterWave(builder, sceneDef, wave, existingTrees) {
    const seed = sceneDef?.terrain?.seed ?? 0;
    const rng = mulberry32((seed ^ fnv1a(`foliage-wave:${wave.name}`)) >>> 0);
    const flat = generateTrees(sceneDef, rng, {
        // Key by the PARENT zone name: the scatter's ZONES table (minDist /
        // scale per zone) only knows the standard vocabulary, while sub-waves
        // carry quad-split names like 'nearField.q2'.
        zones: { [wave.zone ?? wave.name]: wave.zoneRect, playArea: sceneDef?.terrain?.zones?.playArea },
        excludeRects: coldExclusionRects(sceneDef),
        existingTrees,
        rockPositions: builder.rockPositions,
    });
    return cullTreesForScene(builder, flat);
}

/**
 * Cycle 88 Phase 2: island-wide impostor cold coverage. Runs INSIDE the
 * scene-load transition (Q1 decision): scatters every planned wave in ONE
 * synchronous chunk (~0.3-0.5s reference desktop, hidden by the swap
 * overlay), caches the per-wave results for the streamer to reuse (scatter
 * once, build per wave), and places at most tilesX-per-type static
 * cross-billboard InstancedMeshes sourcing the pre-baked kiln albedo atlas
 * - so the first playable frame shows the whole island's tree silhouette
 * at low fidelity instead of a bare island.
 *
 * Deliberately NO yields inside the scatter loop: on software-GL hosts
 * (SwiftShader CI runners) frames take seconds, so a macrotask yield per
 * wave starved a trivial ~0.5s of CPU into ~100s of wall clock and blew
 * every load budget (Deploy runs 27281421931 + 27283224749). Blocking the
 * choked thread for half a second behind the overlay is strictly better.
 *
 * Sparse mode (low tier, Phase 4 / Q3): one generateTrees pass at horizon
 * density over the whole streamed extent under its own salt - coverage
 * without the full-density cache no wave will ever upgrade.
 *
 * The returned promise resolves after the SCATTER (pure CPU, deterministic);
 * the atlas fetch + impostor mesh build run as a DETACHED continuation
 * (`coverage.impostorsReady`), so no network fetch or fetch-vs-timer race
 * can ever gate first-interactive - on software-GPU hosts the main thread
 * blocks long enough that any fetch timeout fires spuriously (the
 * Deploy-run-27281421931 lesson). A wave that lands before its impostors
 * exist records itself in `coverage.retiredWaves` and the build skips it.
 *
 * Failure is soft by contract: a scatter error leaves
 * builder._foliageColdCoverage unset, so the streamer falls back to
 * scattering its own waves exactly as Cycle 87 shipped (bare island, waves
 * materialize); a continuation error just means no impostors appear.
 *
 * @param {object} game SheepDogSimulation instance.
 * @param {{signal?: AbortSignal, tier?: string, sparse?: boolean,
 *          loadAtlas?: (type: string) => Promise<object|null>}} [opts]
 * @returns {Promise<object | null>} diag (also on window.__sdsFoliageColdCoverage), null when inert.
 */
export async function buildColdFoliageCoverage(game, opts = {}) {
    const sceneDef = game?.currentScene;
    const builder = game?.terrainBuilder;
    if (!sceneDef?.terrain?.streamedZones || !builder) return null;
    const signal = opts.signal ?? game._sceneAbort?.signal ?? null;
    const tier = opts.tier ?? getSceneManager()?.getTier?.() ?? 'med';
    const tierPreset = TIER_PRESETS[tier] ?? TIER_PRESETS.med;
    const sparse = opts.sparse ?? ((tierPreset.foliageStreamWaves ?? Infinity) === 0);

    const diag = {
        sceneId: sceneDef.id,
        tier,
        mode: sparse ? 'sparse' : 'full',
        plannedWaves: 0,
        scatteredWaves: 0,
        trees: 0,
        meshes: 0,
        scatterMs: 0,
        atlasMs: 0,
        buildMs: 0,
        textureBoundAt: 0,
        completedAt: 0,
        aborted: false,
        error: null,
    };
    if (typeof window !== 'undefined') window.__sdsFoliageColdCoverage = diag;

    try {
        const cache = new Map();
        const seed = sceneDef?.terrain?.seed ?? 0;
        if (sparse) {
            const t0 = performance.now();
            const extent = sceneDef.terrain.streamedZones.horizon
                ?? Object.values(sceneDef.terrain.streamedZones).at(-1);
            const rng = mulberry32((seed ^ fnv1a('foliage-cold:sparse')) >>> 0);
            const flat = generateTrees(sceneDef, rng, {
                zones: { horizon: extent, playArea: sceneDef?.terrain?.zones?.playArea },
                excludeRects: coldExclusionRects(sceneDef),
                existingTrees: builder.treeInstances || [],
                rockPositions: builder.rockPositions,
            });
            cache.set('coldCoverage:sparse', cullTreesForScene(builder, flat));
            diag.scatterMs += Math.round(performance.now() - t0);
            diag.plannedWaves = 1;
            diag.scatteredWaves = 1;
        } else {
            const waves = planFoliageWaves(sceneDef);
            diag.plannedWaves = waves.length;
            const existing = [...(builder.treeInstances || [])];
            const tScatter = performance.now();
            for (const wave of waves) {
                if (signal?.aborted) { diag.aborted = true; return diag; }
                const streamed = scatterWave(builder, sceneDef, wave, existing);
                cache.set(wave.name, streamed);
                existing.push(...streamed);
                diag.scatteredWaves += 1;
            }
            diag.scatterMs = Math.round(performance.now() - tScatter);
        }
        const flatAll = [...cache.values()].flat();
        diag.trees = flatAll.length;

        // Cycle 91 Phase 3: size the consolidated tree controllers for the
        // whole island NOW - still behind the load overlay - so wave appends
        // never pay a controller rebuild. Sparse mode never streams waves,
        // so the corridor-sized controllers stay as-is.
        if (!sparse) {
            try {
                reserveConsolidatedTreeCapacity(builder, flatAll);
            } catch (err) {
                console.warn('[FOLIAGE] consolidated capacity reserve failed (waves will grow on append):', err);
            }
        }

        // The cache is live from here: waves can stream off it even if the
        // impostor build below never finishes.
        const coverage = {
            cache,
            ranges: null,
            retiredWaves: new Set(),
            diag,
            impostorsReady: null,
        };
        builder._foliageColdCoverage = coverage;

        // Detached impostor continuation - see the doc comment above.
        coverage.impostorsReady = (async () => {
            try {
                const types = [...new Set(flatAll.map((t) => t.type))];
                const loadAtlas = opts.loadAtlas ?? loadColdImpostorAtlas;
                const tAtlas = performance.now();
                const atlasByType = {};
                await Promise.all(types.map(async (type) => {
                    atlasByType[type] = await loadAtlas(type);
                }));
                diag.atlasMs = Math.round(performance.now() - tAtlas);
                if (signal?.aborted) { diag.aborted = true; return diag; }

                const tBuild = performance.now();
                const waveTrees = [...cache.entries()]
                    .filter(([name]) => !coverage.retiredWaves.has(name))
                    .map(([name, trees]) => ({ name, trees }));
                const built = buildColdImpostorMeshes(builder, waveTrees, atlasByType);
                coverage.ranges = built.ranges;
                diag.buildMs = Math.round(performance.now() - tBuild);
                diag.meshes = built.meshes.length;

                // Late-bind the albedo atlases: visibility follows the
                // network, the scene build never does.
                for (const type of types) {
                    atlasByType[type]?.texturePromise?.then((texture) => {
                        if (!texture || signal?.aborted) return;
                        const mat = built.materialsByType[type];
                        if (!mat) return;
                        mat.map = texture;
                        mat.needsUpdate = true;
                        for (const mesh of built.meshes) {
                            if (mesh.userData.foliageColdImpostor?.type === type) mesh.visible = true;
                        }
                        diag.textureBoundAt = performance.now();
                    });
                }

                // Cycle 91 (Phase 2.5 item 4): once a type's atlas is
                // renderable, the consolidated path gets its far-impostor
                // controller and the LOD0 near gate flips on. Registered
                // AFTER the binding .then above so the material's map is
                // bound before the far mesh first renders. Sparse mode keeps
                // the impostor island with no LOD0 waves (durable low-tier
                // rule), so the chain stays off there.
                if (!sparse) {
                    diag.farImpostorTypes = enableConsolidatedFarImpostors(
                        builder, atlasByType, built.materialsByType, { signal });
                }

                diag.completedAt = performance.now();
                console.log(`[FOLIAGE] cold impostor coverage: ${diag.trees} trees in ${diag.meshes} meshes `
                    + `(${diag.mode}, scatter ${diag.scatterMs}ms, build ${diag.buildMs}ms)`);
            } catch (err) {
                diag.error = String(err?.message || err);
                console.warn('[FOLIAGE] cold impostor build failed (island keeps the cached scatter, no impostors):', err);
            }
            return diag;
        })();

        return diag;
    } catch (err) {
        diag.error = String(err?.message || err);
        console.warn('[FOLIAGE] cold impostor coverage failed (keeping the bare-island cold path):', err);
        return diag;
    }
}

/**
 * Refresh the solo-sim obstacle bundle after a wave lands. Atomic reassign;
 * skipped in multiplayer (the Worker is authoritative there and never knows
 * about trees anyway - keeping MP client prediction's obstacle set identical
 * to the Worker's matters more than streamed trees being solid).
 */
async function refreshObstacles(game) {
    if (game.isMultiplayer || game.gameState?.gameMode === 'multiplayer') return;
    const { buildSceneObstacles } = await import('../../shared/SceneObstacles.js');
    const treeInstances = game.terrainBuilder.treeInstances || [];
    const rockPositions = game.terrainBuilder.rockPositions || [];
    const trees = treeInstances.map(t => ({ x: t.x, z: t.z, radiusXZ: t.radiusXZ }));
    const rocks = rockPositions
        .filter(r => r.isObstacle)
        .map(r => ({ x: r.x, z: r.z, radiusXZ: r.colliderRadius }));
    game.gameState.obstacles = buildSceneObstacles({ trees, rocks, buildings: [] });
}

/**
 * Arm the streamer for the just-built scene. Called from buildSceneBody once
 * the scene body is complete. Inert when the scene declares no streamedZones.
 *
 * @param {object} game SheepDogSimulation instance.
 * @param {{signal?: AbortSignal, startDelayMs?: number, tier?: string,
 *          qualityGovernor?: {onWarmupComplete: Function}}} [opts]
 *   startDelayMs bypasses the warmup signal (tests); tier overrides the
 *   SceneManager tier; qualityGovernor overrides game.qualityGovernor.
 * @returns {{planned: number, diag: object} | null} null when inert.
 */
export function armFoliageStreaming(game, opts = {}) {
    const sceneDef = game?.currentScene;
    const builder = game?.terrainBuilder;
    if (!sceneDef || !builder) return null;
    // Cycle 87 Phase 4: hardware tier gates how much of the island streams.
    // Low tier (mobile-class) gets the near band only and no streamed grass.
    const tier = opts.tier ?? getSceneManager()?.getTier?.() ?? 'med';
    const tierPreset = TIER_PRESETS[tier] ?? TIER_PRESETS.med;
    const waves = planFoliageWaves(sceneDef, { maxZones: tierPreset.foliageStreamWaves ?? Infinity });
    if (waves.length === 0) return null;
    const streamGrass = tierPreset.foliageStreamGrass !== false;

    const signal = opts.signal ?? game._sceneAbort?.signal ?? null;
    const startDelayMs = opts.startDelayMs ?? null;

    const diag = {
        sceneId: sceneDef.id,
        tier,
        planned: waves.length,
        wavesDone: 0,
        startedAt: 0,
        completedAt: 0,
        totalStreamedTrees: 0,
        perWave: [],
        aborted: false,
        error: null,
    };
    if (typeof window !== 'undefined') window.__sdsFoliageStreaming = diag;

    const run = async () => {
        diag.startedAt = performance.now();
        try {
            for (const wave of waves) {
                if (signal?.aborted) { diag.aborted = true; return; }
                await idleSlot(signal);
                if (signal?.aborted) { diag.aborted = true; return; }

                const t0 = performance.now();
                // Cycle 88 Phase 3: the cold coverage pass already scattered
                // every wave (same salts, same existing-tree order) - reuse
                // its cache so the wave pays ~0 scatter. Without coverage
                // (failed or absent) scatter live, exactly as Cycle 87 did:
                // canopy spacing respects everything already placed (cold
                // trees + every earlier wave via builder.treeInstances).
                const existing = builder.treeInstances || [];
                const cached = builder._foliageColdCoverage?.cache?.get(wave.name) ?? null;
                const streamed = cached ?? scatterWave(builder, sceneDef, wave, existing);
                const scatterMs = Math.round(performance.now() - t0);

                if (signal?.aborted) { diag.aborted = true; return; }
                await yieldMacrotask();
                if (signal?.aborted) { diag.aborted = true; return; }

                const t1 = performance.now();
                let meshes = 0;
                if (streamed.length > 0) {
                    const byType = toTreeInstancesByType(builder, streamed);
                    meshes = buildAdditiveTreeMeshes(builder, byType, { label: wave.name });
                    builder.treeInstances = existing.concat(streamed);
                    // Prewarm new WebGPU meshes' pipelines inside the idle slot
                    // so their first visible frame doesn't pay the compile stall.
                    // Three's WebGL compileAsync polls through a timer that can
                    // outlive scene swaps and throw after teardown; WebGL accepts
                    // lazy compile here.
                    // Cycle 91 Phase 5: with the consolidated appendable
                    // controllers a wave normally creates NO new meshes
                    // (meshes === 0) - skip the whole-scene compileAsync that
                    // used to run for every wave.
                    if (meshes > 0) {
                        try {
                            const renderer = builder._resolveComputeRenderer?.()
                                ?? getSceneManager()?.getRenderer?.()
                                ?? null;
                            const camera = getSceneManager()?.getCamera?.() ?? null;
                            if (renderer?.isWebGPURenderer && renderer.compileAsync && camera) {
                                await renderer.compileAsync(builder.scene, camera);
                            }
                        } catch { /* prewarm is best-effort */ }
                    }
                }
                const buildMs = Math.round(performance.now() - t1);

                // Cycle 88 Phase 3: the wave's LOD0 meshes are in the scene -
                // retire the zone's cold impostor instances (zero-scale, no
                // rebuild) so the two representations never double-render.
                const retiredImpostors = retireColdImpostorWave(builder, wave.name);

                diag.perWave.push({ name: wave.name, trees: streamed.length, meshes, scatterMs, buildMs, fromCache: !!cached, retiredImpostors });
                diag.totalStreamedTrees += streamed.length;
                diag.wavesDone += 1;
                console.log(`[FOLIAGE] wave ${wave.name}: +${streamed.length} trees (${meshes} meshes, scatter ${scatterMs}ms, build ${buildMs}ms)`);

                if (streamed.length > 0) {
                    await refreshObstacles(game);
                }
                await yieldMacrotask();
            }
            // Cycle 87 Phase 3: grass streams as the final wave, after every
            // tree wave has landed. GrassSystem.buildStreamedGrass owns the
            // config gating (no grass.streamed / zero per-tier clumps /
            // visual-golden); Phase 4 adds the tier gate here.
            if (!signal?.aborted && streamGrass && builder.grassSystem?.buildStreamedGrass) {
                await idleSlot(signal);
                if (signal?.aborted) { diag.aborted = true; return; }
                const tg = performance.now();
                const grassResult = builder.grassSystem.buildStreamedGrass();
                diag.grass = { ...grassResult, ms: Math.round(performance.now() - tg) };
            }
            diag.completedAt = performance.now();
            console.log(`[FOLIAGE] streaming complete: +${diag.totalStreamedTrees} trees in ${diag.wavesDone} waves`
                + (diag.grass?.built ? `, +${diag.grass.clumps} streamed grass clumps` : ''));
        } catch (err) {
            diag.error = String(err?.message || err);
            console.warn('[FOLIAGE] streaming failed (scene keeps its cold-path foliage):', err);
        }
    };

    // Cycle 88 Phase 4: start on the QualityGovernor's warmup-complete
    // signal (so wave cost never folds into the warmup window), bounded by
    // the fallback timer. An explicit opts.startDelayMs (tests) bypasses the
    // signal and keeps the pure-timer behavior.
    let started = false;
    let timer = null;
    const begin = () => {
        if (started || signal?.aborted) return;
        started = true;
        clearTimeout(timer);
        run();
    };
    if (startDelayMs !== null) {
        timer = setTimeout(begin, startDelayMs);
    } else {
        timer = setTimeout(begin, FALLBACK_START_DELAY_MS);
        const governor = opts.qualityGovernor ?? game.qualityGovernor ?? null;
        governor?.onWarmupComplete?.(begin);
    }
    signal?.addEventListener?.('abort', () => {
        clearTimeout(timer);
        diag.aborted = true;
    }, { once: true });

    return { planned: waves.length, diag };
}
