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
 * START_DELAY_MS after arming (covers the QualityGovernor warmup so streaming
 * never reads as a cold-load frame spike), then one requestIdleCallback per
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
    cullTreesForScene,
    toTreeInstancesByType,
} from './TreePlacement.js';

/** Delay from arming (scene body complete) to the first wave. Covers the
 * QualityGovernor 6s warmup window so wave cost never folds into it. */
export const START_DELAY_MS = 6500;

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
 * Plan the streaming waves for a scene def. Pure; used by tests.
 *
 * @param {import('../../shared/scenes/types.js').SceneDef} sceneDef
 * @returns {Array<{name: string, zoneRect: object}>}
 */
export function planFoliageWaves(sceneDef) {
    const streamed = sceneDef?.terrain?.streamedZones;
    if (!streamed) return [];
    // Same near-to-far vocabulary order as the cold scatter's ZONES table.
    const order = ['nearField', 'midField', 'farField', 'horizon'];
    const waves = [];
    for (const name of order) {
        if (streamed[name]) waves.push({ name, zoneRect: streamed[name] });
    }
    // Any non-standard zone names append after the known order, sorted for
    // determinism.
    for (const name of Object.keys(streamed).sort()) {
        if (!order.includes(name)) waves.push({ name, zoneRect: streamed[name] });
    }
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
        zones: { [wave.name]: wave.zoneRect, playArea: sceneDef?.terrain?.zones?.playArea },
        excludeRects: coldExclusionRects(sceneDef),
        existingTrees,
        rockPositions: builder.rockPositions,
    });
    return cullTreesForScene(builder, flat);
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
 * @param {{signal?: AbortSignal, startDelayMs?: number}} [opts]
 * @returns {{planned: number, diag: object} | null} null when inert.
 */
export function armFoliageStreaming(game, opts = {}) {
    const sceneDef = game?.currentScene;
    const builder = game?.terrainBuilder;
    if (!sceneDef || !builder) return null;
    const waves = planFoliageWaves(sceneDef);
    if (waves.length === 0) return null;

    const signal = opts.signal ?? game._sceneAbort?.signal ?? null;
    const startDelayMs = opts.startDelayMs ?? START_DELAY_MS;

    const diag = {
        sceneId: sceneDef.id,
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
                // Canopy spacing respects everything already placed: cold
                // trees + every earlier wave (builder.treeInstances is the
                // cumulative flat list).
                const existing = builder.treeInstances || [];
                const streamed = scatterWave(builder, sceneDef, wave, existing);
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
                }
                const buildMs = Math.round(performance.now() - t1);

                diag.perWave.push({ name: wave.name, trees: streamed.length, meshes, scatterMs, buildMs });
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
            // gating (inert without grass.streamed / zero per-tier clumps /
            // visual-golden runs).
            if (!signal?.aborted && builder.grassSystem?.buildStreamedGrass) {
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

    const timer = setTimeout(run, startDelayMs);
    signal?.addEventListener?.('abort', () => {
        clearTimeout(timer);
        diag.aborted = true;
    }, { once: true });

    return { planned: waves.length, diag };
}
