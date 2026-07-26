// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Scene-body construction extracted from `main.js` in Cycle 28 Stream B1.
 *
 * Runs once per scene-load: loads models, builds terrain + grass + rocks
 * + trees + structures + corral effect + anime water + sheepdog +
 * sheep flock. Side-effects mutate `game.*` members exactly as the
 * original `_buildSceneBody` method did — only the file the code lives
 * in changed.
 *
 * Listener teardown rides on `game._sceneAbort.signal` so
 * `disposeScene()` can clean up cleanly.
 */

import * as THREE from 'three';

import { Heightfield } from '../../shared/terrain/Heightfield.js';
import { Sheepdog } from '../Sheepdog.js';
import { resolveSceneEnclosure } from '../StructureBuilder.js';
import { resolveAssetUrl } from '../utils/assetUrl.js';
import { log as probeLog } from '../diagnostics/glProbe.js';

/**
 * Cycle 91 Phase 5: client-side heightfield cache, keyed by resolved URL.
 * The parsed data is read-only at runtime (heightfield contract), so
 * same-scene restarts and revisits share one instance and skip the fetch +
 * parse. A failed load is evicted so the next attempt retries. The fetch
 * counter is probe-checkable (acceptance: a same-scene restart re-fetches 0
 * times).
 */
const _heightfieldCache = new Map();
export const heightfieldCacheDiag = { fetches: 0, hits: 0 };
function loadHeightfieldCached(url) {
    let promise = _heightfieldCache.get(url);
    if (promise) {
        heightfieldCacheDiag.hits += 1;
        return promise;
    }
    heightfieldCacheDiag.fetches += 1;
    promise = Heightfield.load(url);
    promise.catch(() => _heightfieldCache.delete(url));
    _heightfieldCache.set(url, promise);
    return promise;
}
if (typeof window !== 'undefined') window.__sdsHeightfieldCache = heightfieldCacheDiag;

/** Maps the existing logStep boundary labels to friendly per-stage keys. */
const STAGE_KEYS = {
    'Loading 3D models': 'models',
    'Models loaded': '_modelsVerify',
    'Loading heightfield': 'heightfield',
    'Creating terrain': 'terrain',
    'Creating grass': 'grass',
    'Adding environment details': 'rocks',
    'Creating trees': 'trees',
    'Adding mountains': 'mountains',
    'Adding farm house': 'farmHouse',
    'Adding homestead props': 'homesteadProps',
    'Loading fence models': 'fenceModels',
    'Building structures': 'structures',
    'Building anime water': 'water',
    'Creating sheepdog': 'sheepdog',
    'Creating sheep flock': 'flock',
    'Scene body complete': '_end',
};

/**
 * Cycle 45 Phase 1: turn the ordered logStep marks into per-stage durations.
 * A stage's duration is the gap from its own mark to the next mark, so the
 * existing build-step labels double as timing boundaries with zero new
 * instrumentation in the call sites. `impostorMs` is a subset of `trees`
 * (kiln-impostor load inside createTrees), surfaced separately so Phase 3
 * can tell tree-placement cost from impostor-load cost.
 */
function summarizeLoadStages(marks, impostorMs) {
    const stages = {};
    for (let i = 0; i < marks.length - 1; i++) {
        const key = STAGE_KEYS[marks[i].label] ?? marks[i].label;
        if (key.startsWith('_')) continue;
        stages[key] = (stages[key] ?? 0) + Math.round(marks[i + 1].t - marks[i].t);
    }
    if (Number.isFinite(impostorMs) && impostorMs > 0) {
        stages.impostors = Math.round(impostorMs);
    }
    if (marks.length > 1) {
        stages.total = Math.round(marks[marks.length - 1].t - marks[0].t);
    }
    return stages;
}

function createLazyWolfPack(config) {
    let pack = null;
    let loading = null;
    let disposed = false;

    const load = () => {
        if (disposed) return Promise.resolve(null);
        if (pack) return Promise.resolve(pack);
        if (!loading) {
            loading = import('../gamestate/wolfPack.js')
                .then(async ({ WolfPack }) => {
                    if (disposed) return null;
                    const realPack = new WolfPack(config);
                    pack = realPack;
                    await realPack.init();
                    if (disposed) {
                        realPack.dispose();
                        pack = null;
                        return null;
                    }
                    return realPack;
                })
                .catch((err) => {
                    console.warn('[WOLF] lazy wolf pack load failed:', err?.message || err);
                    return null;
                });
        }
        return loading;
    };

    return {
        get wolves() { return pack?.wolves ?? []; },
        get count() { return pack?.count ?? 0; },
        get night() { return pack?.night ?? false; },
        init() { return load(); },
        spawnNight(day, sheep) { void load().then(realPack => realPack?.spawnNight(day, sheep)); },
        update(dt, sheep, dog) { pack?.update(dt, sheep, dog); },
        repel(x, z, radius, secs) { return pack?.repel(x, z, radius, secs); },
        retreatAll() { pack?.retreatAll(); },
        dispose() {
            disposed = true;
            pack?.dispose();
            pack = null;
        },
    };
}

/**
 * @param {object} game SheepDogSimulation instance.
 * @param {(step: string, detail?: string) => void} [logStep]
 * @returns {Promise<{ stages: Record<string, number> }>}
 */
export async function buildSceneBody(game, logStep = (s) => console.log(`[BUILD] ${s}`)) {
    // Cycle 45 Phase 1: record a timestamp at every build-step boundary, then
    // forward to the caller's logger. Wrapping the param keeps the 15 call
    // sites untouched.
    const marks = [];
    const baseLogStep = logStep;
    logStep = (label, detail) => {
        marks.push({ label, t: performance.now() });
        baseLogStep(label, detail);
    };
    if (game?.terrainBuilder) game.terrainBuilder._sdsImpostorMs = 0;
    try {
        // Cycle 91 Phase 5: kick the heightfield fetch off FIRST so it rides
        // in parallel with the model loads instead of serializing after them.
        // Scene defs use absolute-root paths; resolveAssetUrl rebases them
        // under Vite's BASE_URL so itch.io builds (where the game runs from a
        // /html/<build-id>/ subpath) fetch from the build root instead of the
        // CDN root. Cached per URL: the parsed Float32Array is read-only at
        // runtime (heightfield contract), so same-scene restarts and revisits
        // skip the fetch + parse entirely.
        const heightmapUrl = resolveAssetUrl(game.currentScene.terrain?.heightmapUrl);
        const heightfieldPromise = heightmapUrl ? loadHeightfieldCached(heightmapUrl) : null;

        // Load all 3D models first (idempotent — cached after first run).
        logStep('Loading 3D models');
        await game.terrainBuilder.loadModels();

        // Cycle 25 Phase D: impostor calibration LUT fetch + bind
        // removed alongside uMatchBoost. The asset file
        // assets/impostor-calibration-lut.json may still exist on
        // disk; nothing references it.

        // Verify critical models loaded (especially on iOS)
        const animalModels = Object.keys(game.terrainBuilder.models.animals || {})
            .filter(k => !k.endsWith('_animations'));
        logStep('Models loaded', `animals: ${animalModels.join(', ') || 'NONE'}`);

        if (animalModels.length === 0) {
            throw new Error('No animal models loaded! Check model paths and network.');
        }

        // Await the heightfield (fetch started at the top of this build, in
        // parallel with the models) BEFORE building terrain so displacement
        // and downstream y-clamps share the same instance.
        if (heightmapUrl) {
            logStep('Loading heightfield', heightmapUrl);
            try {
                game.heightfield = await heightfieldPromise;
                console.log(`[TERRAIN] Heightfield loaded: ${game.heightfield.width}x${game.heightfield.height}, peakHeight=${game.heightfield.peakHeight}m`);
            } catch (err) {
                console.warn('[TERRAIN] Heightfield load failed; falling back to flat terrain:', err);
                game.heightfield = null;
            }
        }
        game.terrainBuilder.setHeightfield(game.heightfield);
        // GameState propagates heightfield to OptimizedSheepSystem when the flock spawns.
        game.gameState.heightfield = game.heightfield;
        // Camera controller also samples the heightfield for Follow/Free clamps.
        if (game.cameraController?.setHeightfield) {
            game.cameraController.setHeightfield(game.heightfield);
        }
        // Structure builder surfaces fences/gates/flags onto the terrain
        // so they don't sit at y=0 (buried in heightmapped scenes).
        if (game.structureBuilder?.setHeightfield) {
            game.structureBuilder.setHeightfield(game.heightfield);
        }

        // Create terrain and environment
        logStep('Creating terrain');
        game.terrainBuilder.createTerrain();

        logStep('Creating grass');
        await game.terrainBuilder.createGrass();

        // Rocks BEFORE trees so the tree placer can read rockPositions
        // and reject candidates that would spawn on top of a formation.
        logStep('Adding environment details');
        await game.terrainBuilder.addEnvironmentDetails();

        logStep('Creating trees');
        await game.terrainBuilder.createTrees();

        // Cycle 6 Phase 2: build the SceneObstacles bundle once trees +
        // rocks have been placed. Attached to gameState so sheep + dog
        // can query it per-tick. Field's trees all sit outside the +/-100
        // play area, so its bundle is effectively empty for gameplay; the
        // build runs uniformly across scenes (one code path).
        {
            const { buildSceneObstacles } = await import('../../shared/SceneObstacles.js');
            const treeInstances = game.terrainBuilder.treeInstances || [];
            const rockPositions = game.terrainBuilder.rockPositions || [];
            const trees = treeInstances.map(t => ({ x: t.x, z: t.z, radiusXZ: t.radiusXZ }));
            const rocks = rockPositions
                .filter(r => r.isObstacle)
                .map(r => ({ x: r.x, z: r.z, radiusXZ: r.colliderRadius }));
            game.gameState.obstacles = buildSceneObstacles({ trees, rocks, buildings: [] });
            console.log(`[OBSTACLES] ${trees.length} trees, ${rocks.length} rocks (filtered from ${rockPositions.length})`);
        }

        // Cycle 88 Phase 2: island-wide impostor cold coverage. Kicked off
        // here (right after trees + rocks exist): one synchronous scatter
        // chunk behind the swap overlay (~0.3-0.5s reference; NO yields -
        // see buildColdFoliageCoverage's doc for the SwiftShader starvation
        // lesson), then a detached atlas-fetch + mesh-build continuation.
        // Awaited at its own stage just before scene-body-complete for the
        // scatter/cache contract only. The cold impostor mesh build and far
        // LOD arm continue through coverage.impostorsReady and diagnostics on
        // window.__sdsFoliageColdCoverage; first-interactive never waits on
        // network atlas work.
        let coldCoveragePromise = null;
        if (game.currentScene?.terrain?.streamedZones) {
            coldCoveragePromise = import('../world/foliageStreaming.js')
                .then(({ buildColdFoliageCoverage }) => buildColdFoliageCoverage(game))
                .catch((err) => {
                    console.warn('[FOLIAGE] cold coverage failed (keeping the bare-island cold path):', err);
                    return null;
                });
        }

        logStep('Adding mountains');
        await game.terrainBuilder.addMountains();

        // Add farm house
        logStep('Adding farm house');
        const farmHouse = await game.terrainBuilder.addFarmHouse(game.currentScene);

        // Cycle 115 Phase 5: the porch lantern comes on after sundown. The
        // material split (js/world/farmhouseMaterialRoles.js) parked the lamp
        // materials on the root's userData; the atmosphere drives their
        // emissive intensity off the sun's elevation. Unconditional, because
        // passing nothing is how a scene with no farmhouse clears the previous
        // binding. Resolves to a no-op on Rolling Hills and Open Country, which
        // ship no farmhouse at all.
        game.atmosphere?.bindDuskLamps?.(farmHouse?.userData?.duskLampMaterials);

        logStep('Adding homestead props');
        await game.terrainBuilder.addHomesteadPlayfieldProps(game.currentScene);

        // Load fence GLB models before building structures
        logStep('Loading fence models');
        await game.structureBuilder.loadModels();

        // Create structures using new modular system. Scenes can opt
        // out of the perimeter fence (e.g. Open Country) — flag lives
        // on the scene def.
        logStep('Building structures');
        // Cycle 117 P4: the scene's own enclosure - its pen box and the one gate
        // in it - resolved ONCE and used twice. StructureBuilder raises the fence
        // and the swing gate on the heightfield here; the PenBarrier below makes
        // that same box solid. One resolver is what keeps the visible gap and the
        // passable gap from drifting apart.
        //
        // Rolling Hills sets `perimeterFence: false` and, since P2, no `corral`,
        // so without an enclosure it falls through to `buildGateAndPenOnly` and
        // stands Home Field's gate at (0, 100) - 100m INSIDE the 180m island -
        // with a pen fence behind it.
        const enclosure = resolveSceneEnclosure(game.currentScene);
        game.structureBuilder.buildSinglePlayerStructures(
            game.gameState.getBounds(),
            game.gameState.getGate(),
            game.gameState.getPasture(),
            {
                perimeterFence: game.currentScene.perimeterFence !== false,
                corral: game.currentScene.corral || null,
                enclosure,
            }
        );

        // Cycle 66 P2: the pen is a real barrier and it is the objective. A
        // per-frame containment makes the fence solid (gate-only entry, sealed
        // at night on a day-loop scene, dog + sheep collide) and retires sheep
        // that come through the gate: a calm settle walk to a spot inside, no
        // zap, no teleport. main.js ticks it after the shared sheep sim.
        //
        // Cycle 117 P2 HOISTED this out of the day-loop block below, rather than
        // widening that block's predicate. That block also builds DayLoop, the
        // day/night chip, skipToDusk, the survival run, the minimap and the
        // wolves, so admitting Rolling Hills into it would hand the island a day
        // loop it must not have. Both of its pen consumers - createLazyWolfPack
        // and the day-loop's `home` count - read `game._penBarrier`, so the
        // barrier has to exist before it runs.
        //
        // Cycle 67 P6: SOLO only. In co-op the DO runs the barrier
        // authoritatively and the client renders the corrected sheep from the
        // broadcast (initNetwork.driveCoopSurvival). Competitive and timed are
        // multiplayer modes, so they never reach here either - which is what
        // keeps a mid-island fence from standing across the competitive
        // pastures.
        //
        // The import stays dynamic so `shared/PenBarrier.js` never lands in the
        // eagerly loaded main chunk.
        const penDef = game.currentScene.pen || null;
        // The scene's destination shape, for the client retirement dispatch.
        // Set HERE rather than beside `setCorral` in main.js because this is the
        // one path that runs for both a cold boot and a scene rebuild - the same
        // reason the gate cue is constructed here - so it is one assignment
        // instead of two `if (sceneDef.X)` lines that drift apart. disposeScene
        // clears it, so a swap away from a pen scene does not inherit one.
        if (game.gameState) game.gameState.pen = penDef;
        if (enclosure && !game.isMultiplayer) {
            const { PenBarrier } = await import('../gamestate/penContainment.js');
            game._penBarrier = new PenBarrier(enclosure.pen, enclosure.gate);
        } else {
            game._penBarrier = null;
        }

        // Cycle 65: the day loop. Only on scenes that opt into it
        // (Newsheepdogland). Its enclosure went up with every other scene's
        // above; the DayLoop + the day/night HUD chip are created here, and a
        // per-frame runner is stashed on the game for the main loop to call.
        if (game.currentScene.dayNight?.dayLoop && game.currentScene.gate) {
            const pen = penDef;
            const needsSurvivalRun = Boolean(game.currentScene.survival && !game.isMultiplayer);
            const needsMinimap = Boolean(game.currentScene.survival && Array.isArray(game.currentScene.boundary?.points));
            const [
                { DayLoop },
                chip,
                survivalRunModule,
                minimapModule,
                { createSkipToDusk },
            ] = await Promise.all([
                import('../gamestate/dayLoop.js'),
                import('../components/GameHUD/DayNightChip.js'),
                needsSurvivalRun ? import('../gamestate/survivalRun.js') : Promise.resolve(null),
                needsMinimap ? import('../components/GameHUD/Minimap.js') : Promise.resolve(null),
                import('../effects/skipToDusk.js'),
            ]);

            const dayLoop = new DayLoop({ initialT: game.currentScene.dayNight.initialT });
            game.dayLoop = dayLoop;

            // Cycle 66 P3: the survival run economy (start flock, +growth/day,
            // death on a 33%+ night loss, score = peak flock). Client-side; it
            // drives off the day-loop phase. Newsheepdogland declares `survival`;
            // other day-loop scenes run the soft Cycle 65 loop unchanged.
            if (needsSurvivalRun) {
                const { SurvivalRun } = survivalRunModule;
                game._survivalRun = new SurvivalRun(game.currentScene.survival);

                // Cycle 66 P4: the night wolves. A client-only predator layer that
                // hunts sheep left outside the pen at night and feeds kills into
                // the survival economy. Spawn/despawn ride the day-loop nightfall /
                // dawn transitions below; movement + kills tick from main.js after
                // the sheep sim + pen containment. The glTF loads in the background
                // (fire-and-forget) so it never delays the scene paint - spawnNight
                // no-ops until it is ready, well before the first ~10-minute night.
                game._wolfPack = createLazyWolfPack({
                    scene: game.sceneManager.getScene(),
                    groundY: (x, z) => (game.terrainBuilder?._groundY ? game.terrainBuilder._groundY(x, z) : 0),
                    pen: game._penBarrier,
                    onKill: () => game._survivalRun?.recordKill(),
                    seed: (game.currentScene.terrain?.seed ?? 7) >>> 0,
                });
            } else {
                game._survivalRun = null;
                game._wolfPack = null;
            }

            chip.mountDayNightChip();
            game._unmountDayNightChip = chip.unmountDayNightChip;
            // Cycle 67 P6: expose the chip update + summary so co-op survival can
            // drive the HUD from the DO broadcast (initNetwork), since the local
            // _tickDayLoop does not run in MP.
            game._updateDayNightChip = chip.updateDayNightChip;
            game._showSurvivalSummary = chip.showSurvivalSummary;

            // Cycle 66 P7: the survival minimap (island layout from the coastline
            // polygon + live dog / flock / wolf markers). Survival scenes with a
            // coastline boundary only; updated each frame from _tickDayLoop below.
            if (needsMinimap) {
                minimapModule.mountMinimap({
                    points: game.currentScene.boundary.points,
                    pen: game.currentScene.pen || null,
                });
                game._updateMinimap = minimapModule.updateMinimap;
                game._unmountMinimap = minimapModule.unmountMinimap;
            } else {
                game._updateMinimap = null;
                game._unmountMinimap = null;
            }

            // Cycle 65 P7: the skip-to-dusk cutscene (on-screen button + F key).
            game._skipToDusk = createSkipToDusk(game);

            let acc = 0;
            let home = 0;
            let first = true;
            game._tickDayLoop = (dt) => {
                const dn = game.atmosphere?.dayNight;
                if (!dn) return;
                // Cycle 90: recenter the scene light's shadow frustum on the
                // dog. Day-loop islands are far larger than the +-120m shadow
                // box and the world origin sits in open water, so an
                // origin-pinned frustum means no shadows anywhere on land.
                // The light is the WebGPU lighting bridge's directional
                // (productionWebGpuBoot); x/z snap to the shadow-map texel
                // grid so the moving frustum doesn't shimmer the whole map.
                const sunLight = game.sceneManager?.webgpuSunLight ?? null;
                if (sunLight?.userData?.shadowConfigured) {
                    const dog = game.gameState?.getSheepdog?.();
                    if (dog?.position) {
                        if (!game._sunShadowFollowOffset) {
                            // First tick of a day-loop run: shadows on. The
                            // bridge ships them off because small grassed
                            // scenes pay the depth pass for shadows they
                            // can't show; teardown flips them back off.
                            sunLight.castShadow = true;
                            game._sunShadowFollowOffset = {
                                x: sunLight.position.x - sunLight.target.position.x,
                                y: sunLight.position.y - sunLight.target.position.y,
                                z: sunLight.position.z - sunLight.target.position.z,
                            };
                        }
                        const off = game._sunShadowFollowOffset;
                        const texel = (sunLight.shadow.camera.right - sunLight.shadow.camera.left)
                            / (sunLight.shadow.mapSize.x || 2048);
                        const tx = Math.round(dog.position.x / texel) * texel;
                        const tz = Math.round(dog.position.z / texel) * texel;
                        // Cycle 91 P1: the snap quantizes to ~0.14m steps, so a
                        // standing or slow dog produces the same (tx, tz) for many
                        // frames; skip the light/target writes (and the matrix
                        // update they force) until the snapped cell changes.
                        if (tx !== off.lastTx || tz !== off.lastTz) {
                            off.lastTx = tx;
                            off.lastTz = tz;
                            sunLight.position.set(tx + off.x, off.y, tz + off.z);
                            sunLight.target.position.set(tx, 0, tz);
                            sunLight.target.updateMatrixWorld();
                        }
                    }
                }
                const t = dn.getT();
                // Cycle 66 P2: the pen containment authoritatively tracks who has
                // been herded through the gate and retired inside; prefer its
                // count. Fall back to a throttled radius scan only when there is
                // no containment (e.g. a day-loop scene without a pen).
                if (game._penBarrier) {
                    home = game._penBarrier.pennedCount;
                } else {
                    acc += Number.isFinite(dt) ? dt : 0.016;
                    // Throttle the pen membership scan to ~4Hz; it is O(activeSheep).
                    if (first || acc >= 0.25) {
                        first = false;
                        acc = 0;
                        home = 0;
                        const sheep = game.gameState?.sheep;
                        if (pen && sheep) {
                            const cx = pen.center.x, cz = pen.center.z, r2 = pen.radius * pen.radius;
                            for (let i = 0; i < sheep.length; i++) {
                                const p = sheep[i]?.position;
                                if (!p) continue;
                                const dx = p.x - cx, dz = p.z - cz;
                                if (dx * dx + dz * dz <= r2) home++;
                            }
                        }
                    }
                }
                const total = game.gameState?.optimizedSheepSystem?.activeCount
                    ?? (game.gameState?.sheep?.length ?? 0);
                const state = dayLoop.update(t, home, total);
                game.structureBuilder?.setPenGateOpen?.(state.gateOpen);
                game.structureBuilder?.updateGate?.(dt);

                // Cycle 66 P3: drive the survival economy off the day phase.
                const run = game._survivalRun;
                if (run) {
                    const ev = run.onPhase(state.phase);
                    if (ev?.type === 'nightfall') {
                        // Dusk -> night: the wolves come out. Pack escalates per day.
                        game._wolfPack?.spawnNight(run.day, game.gameState?.sheep);
                    } else if (ev?.type === 'survived') {
                        // Dawn: wolves retreat; release the penned flock to graze,
                        // then grow +N for surviving the night.
                        game._wolfPack?.retreatAll();
                        game._penBarrier?.releaseAll?.(game.gameState?.sheep);
                        game.gameState?.growSurvivalFlock?.(run.growth);
                        // [P3-ACHIEVE-DATA] Achievement seam: ev.day is the NEW
                        // day after dawn, so this run has survived ev.day - 1
                        // nights. Fire-and-forget; never blocks the day loop.
                        import('../achievements/index.js').then(({ recordEvent }) => {
                            recordEvent('survival-night-survived', {
                                nightsSurvived: ev.day - 1,
                                sceneId: game.currentScene?.id || 'newsheepdogland',
                            });
                        }).catch((err) => console.warn('[ACHIEVEMENTS] survival record failed:', err));
                    } else if (ev?.type === 'death') {
                        game._wolfPack?.retreatAll();
                        if (game.gameState) game.gameState.gameActive = false;
                        // Cycle 66 P6: post the peak-flock score to the survival
                        // leaderboard (newsheepdogland / survival partition).
                        try {
                            if (typeof window !== 'undefined' && window.submitGameScore) {
                                window.submitGameScore('survival', ev.score, {
                                    gameMode: 'survival',
                                    sceneId: game.currentScene?.id || 'newsheepdogland',
                                    sheepCount: ev.score,
                                    day: ev.day,
                                });
                            }
                        } catch (err) { console.warn('[SURVIVAL] score submit failed:', err); }
                        chip.showSurvivalSummary({
                            day: ev.day,
                            score: ev.score,
                            sceneId: game.currentScene?.id || 'newsheepdogland',
                            onRestart: () => { try { location.reload(); } catch { /* noop */ } },
                        });
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('survival-run-ended', {
                                detail: { score: ev.score, day: ev.day },
                            }));
                        }
                    }
                    chip.updateDayNightChip({ ...state, t, day: run.day, flock: run.flock });
                } else {
                    chip.updateDayNightChip({ ...state, t });
                }

                // Cycle 66 P7: feed the minimap live positions (it self-throttles).
                if (game._updateMinimap) {
                    const dp = game.sheepdog?.position;
                    game._updateMinimap({
                        dt,
                        dog: dp ? { x: dp.x, z: dp.z } : null,
                        sheep: game.gameState?.sheep,
                        wolves: game._wolfPack?.wolves,
                    });
                }
                game._skipToDusk?.tick(dt);
            };
        } else {
            game.dayLoop = null;
            game._tickDayLoop = null;
            game._skipToDusk = null;
        }

        // Cycle 5+: corral retirement effect. Listens for 'corral-retired'
        // events dispatched by GameState's retirement loop. Cycle 6 Phase 4
        // adds the persistent 'portal' variant for Open Country.
        //
        // Cycle 117 P4 retired the OTHER variant: the lightning bolt that fired
        // when a sheep crossed Rolling Hills' invisible 8m corral radius (D15).
        // The island is a fenced pasture now, so nothing on it retires at a
        // radius and nothing zaps; Open Country's portal is the only corral
        // visual left, so this branch no longer has an else. The effect module
        // js/effects/CorralZapEffect.js stays on disk for one more cycle so the
        // pasture can be reverted without a restore - it is simply never
        // constructed, which is also what lets Rollup drop its chunk.
        if (game.currentScene.corral) {
            const corral = game.currentScene.corral;
            if (corral.effect === 'portal') {
                const { PortalEffect } = await import('../effects/PortalEffect.js');
                const groundY = game.terrainBuilder._groundY
                    ? game.terrainBuilder._groundY(corral.center.x, corral.center.z)
                    : 0;
                game._portalEffect = new PortalEffect(
                    game.sceneManager.getScene(),
                    corral.center,
                    groundY
                );
                // Cycle 7 Phase 3: portal starts dimmed when the scene
                // has a multi-stage objective (gather → drive). Wakes
                // up on the stage transition with a tween-to-full.
                if (game.currentScene.objective) {
                    game._portalEffect.intensity = 0;
                    game._portalEffect.setIntensity(0);
                    window.addEventListener('objective-stage-changed', (e) => {
                        if (e?.detail?.stage === 'drive' && game._portalEffect) {
                            game._portalEffect.setIntensity(1);
                        }
                    }, { signal: game._sceneAbort.signal });
                }
                window.addEventListener('corral-retired', () => {
                    if (game._portalEffect) game._portalEffect.pulse();
                }, { signal: game._sceneAbort.signal });

                // Cycle 7 Phase 3 / Q6: round-up zone ground decal —
                // terrain-conformed cyan ring at the zone center while
                // stage is 'roundup', fades out on transition. Built
                // as a custom triangle strip with per-vertex Y sampled
                // from the heightfield so the ring follows the ground
                // instead of being clipped by hills (a flat-Y ring at
                // 30m radius gets eaten by terrain variation).
                if (game.currentScene.objective) {
                    const zone = game.currentScene.objective.roundupZone;
                    const segments = 96;
                    const innerR = zone.radius - 0.6;
                    const outerR = zone.radius;
                    const positions = new Float32Array((segments + 1) * 2 * 3);
                    const indices = [];
                    const sampleY = (x, z) => {
                        if (game.terrainBuilder._groundY) return game.terrainBuilder._groundY(x, z);
                        return 0;
                    };
                    for (let i = 0; i <= segments; i++) {
                        const theta = (i / segments) * Math.PI * 2;
                        const cos = Math.cos(theta);
                        const sin = Math.sin(theta);
                        const innerX = zone.x + innerR * cos;
                        const innerZ = zone.z + innerR * sin;
                        const outerX = zone.x + outerR * cos;
                        const outerZ = zone.z + outerR * sin;
                        const innerY = sampleY(innerX, innerZ) + 0.08;
                        const outerY = sampleY(outerX, outerZ) + 0.08;
                        const idx = i * 6;
                        positions[idx + 0] = innerX;
                        positions[idx + 1] = innerY;
                        positions[idx + 2] = innerZ;
                        positions[idx + 3] = outerX;
                        positions[idx + 4] = outerY;
                        positions[idx + 5] = outerZ;
                        if (i < segments) {
                            const a = i * 2;
                            const b = a + 1;
                            const c = a + 2;
                            const d = a + 3;
                            indices.push(a, b, c, b, d, c);
                        }
                    }
                    const decalGeo = new THREE.BufferGeometry();
                    decalGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    decalGeo.setIndex(indices);
                    decalGeo.computeVertexNormals();
                    const decalMat = new THREE.MeshBasicMaterial({
                        color: 0x00d4d4,
                        transparent: true,
                        opacity: 0.75,
                        side: THREE.DoubleSide,
                        depthWrite: false,
                    });
                    const decal = new THREE.Mesh(decalGeo, decalMat);
                    decal.renderOrder = 4;
                    game.sceneManager.getScene().add(decal);
                    game._roundupZoneDecal = decal;
                    window.addEventListener('objective-stage-changed', (e) => {
                        if (e?.detail?.stage === 'drive' && game._roundupZoneDecal) {
                            game._roundupZoneDecal.visible = false;
                        }
                    }, { signal: game._sceneAbort.signal });
                }
            }
        }

        // Cycle 116 Phase 2: THE gate cue construct site. One call, no scene
        // guard, on the one path that runs for both a cold boot and a rebuild.
        // Unconditional on purpose: bindGateCue disposes whatever the previous
        // scene left and resolves the new descriptor itself, so a scene that
        // declares no destination CLEARS the cue instead of inheriting one. The
        // `if (sceneDef.X)` shape in main.js's rebuild is what strands a
        // previous scene's fixtures, and this is the same lesson
        // `bindDuskLamps` above learned.
        //
        // Lazily imported like every other effect in this file, which also
        // keeps the cue and the descriptor out of the measured main-*.js
        // ratchet. Its own try/catch: a cue that fails to load must not take
        // the scene build down with it.
        try {
            const { bindGateCue } = await import('../effects/GateColumn.js');
            bindGateCue(game);
        } catch (err) {
            console.warn('[CUE] bind:', err);
        }

        // Cycle 5+: anime water for island scenes. Cycle 64: coastline scenes
        // (Newsheepdogland) get water too - the boot sits in the sea.
        // Built after structures and hidden in flat/rect scenes.
        const _waterKind = game.currentScene.boundary?.kind;
        if (_waterKind === 'island' || _waterKind === 'coastline') {
            logStep('Building anime water');
            try {
                const { createAnimeWater } = await import('../water/AnimeWater.js');
                const scene = game.sceneManager.getScene();

                const water = createAnimeWater({
                    boundary: game.currentScene.boundary,
                    // Cycle 35 Phase 6: bind the heightfield so foam tracks the
                    // visible water-terrain interface instead of the geometric
                    // outer boundary. Field's water-init guard short-circuits
                    // before this point so the null case is non-island only.
                    heightfield: game.heightfield || null,
                    size: game.sceneManager.isMobile ? 3200 : 4000,
                    y: -0.05,
                    segments: game.sceneManager.isMobile ? 32 : 64,
                    // Cycle 90: coastline scenes get a real shallow band along
                    // the shore; radial-boundary islands keep the tuned 0.82
                    // depth floor (a lower floor there reads as a turquoise
                    // disc around the whole island).
                    minDepthT: game.currentScene.boundary?.kind === 'coastline' ? 0.45 : undefined,
                });
                scene.add(water.mesh);
                game.sceneManager.setWater({
                    mesh: water.mesh,
                    water,
                });
                game._animeWater = water;  // for per-frame uTime updates
                probeLog('water.created', {
                    size: game.sceneManager.isMobile ? 3200 : 4000,
                    segments: game.sceneManager.isMobile ? 32 : 64,
                    boundaryKind: _waterKind,
                    // radius/falloff exist on island only; coastline reports undefined.
                    boundaryRadius: game.currentScene.boundary.radius,
                    boundaryFalloff: game.currentScene.boundary.falloff,
                });
            } catch (err) {
                console.error('[WATER] Init failed; island will render without water.', err);
                probeLog('water.failed', { error: String(err?.message || err) });
            }
        }

        // Verify jep model before creating sheepdog
        if (!game.terrainBuilder.models.animals['jep']) {
            throw new Error('Jep model not available - cannot create sheepdog');
        }

        // Create sheepdog (but don't add to scene yet in pre-game state)
        // Cycle 64: scenes may override the spawn (Newsheepdogland's origin is the
        // instep bay = water); existing scenes omit dogSpawn -> (0, -30).
        logStep('Creating sheepdog');
        const preDogSpawn = game.currentScene?.dogSpawn ?? { x: 0, z: -30 };
        const sheepdog = new Sheepdog(preDogSpawn.x, preDogSpawn.z, 'jep', game.heightfield);
        game.sheepdog = sheepdog;
        game.sheepdogMesh = sheepdog.createMesh();
        game.gameState.setSheepdog(sheepdog);

        // Connect audio manager to sheepdog
        sheepdog.setAudioManager(game.audioManager);

        // Create optimized sheep flock (visible during start screen)
        logStep('Creating sheep flock');
        game.gameState.createSheepFlock(game.sceneManager.getScene());

        // Cycle 88 Phase 2: settle the cold scatter/cache before the scene
        // reads as complete. Stage-attribution reality (comment fixed Cycle 91
        // Phase 5): the scatter is ONE synchronous chunk that runs when the
        // dynamic import above settles - its CPU cost lands inside whichever
        // awaited stage is active at that moment, not here. This 'Cold
        // impostor coverage' mark therefore measures only the scatter/cache
        // remainder still outstanding at scene-body end; visual impostor build
        // and far LOD readiness are separate diagnostics on the coverage.
        if (coldCoveragePromise) {
            logStep('Cold impostor coverage');
            await coldCoveragePromise;
        }

        logStep('Scene body complete');
        if (game._wolfPack?.init) {
            setTimeout(() => { game._wolfPack?.init?.(); }, 1000);
        }

        // Cycle 87 Phase 2: stream the deferred foliage zones in after
        // first-interactive (lazy import keeps the streamer out of the cold
        // path; inert when the scene declares no terrain.streamedZones).
        if (game.currentScene?.terrain?.streamedZones) {
            import('../world/foliageStreaming.js')
                .then(({ armFoliageStreaming }) => armFoliageStreaming(game))
                .catch((err) => console.warn('[FOLIAGE] streamer load failed:', err));
        }

        // Cycle 45 Phase 1: per-stage load breakdown. The dev console summary
        // (sorted heaviest-first) is the human-readable artifact; the returned
        // `stages` rides the scene_swapped telemetry payload via swapScene.
        const stages = summarizeLoadStages(marks, game?.terrainBuilder?._sdsImpostorMs);
        if (import.meta.env?.DEV) {
            const breakdown = Object.entries(stages)
                .filter(([k]) => k !== 'total')
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => `${k} ${v}ms`)
                .join(', ');
            console.log(`[LOAD] ${game?.currentScene?.id ?? '?'} total ${stages.total ?? 0}ms | ${breakdown}`);
        }
        return { stages };

    } catch (error) {
        console.error('[BUILD] Fatal error during scene build:', error);
        throw error;
    }
}
