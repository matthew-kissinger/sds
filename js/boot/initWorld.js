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
import { resolveAssetUrl } from '../utils/assetUrl.js';
import { log as probeLog } from '../diagnostics/glProbe.js';

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

        // Load heightfield (if scene declares one) BEFORE building terrain so
        // displacement and downstream y-clamps share the same instance.
        // Scene defs use absolute-root paths; resolveAssetUrl rebases
        // them under Vite's BASE_URL so itch.io builds (where the game
        // runs from a /html/<build-id>/ subpath) fetch from the build
        // root instead of the CDN root.
        const heightmapUrl = resolveAssetUrl(game.currentScene.terrain?.heightmapUrl);
        if (heightmapUrl) {
            logStep('Loading heightfield', heightmapUrl);
            try {
                game.heightfield = await Heightfield.load(heightmapUrl);
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

        logStep('Adding mountains');
        await game.terrainBuilder.addMountains();

        // Add farm house
        logStep('Adding farm house');
        await game.terrainBuilder.addFarmHouse(game.currentScene);

        // Load fence GLB models before building structures
        logStep('Loading fence models');
        await game.structureBuilder.loadModels();

        // Create structures using new modular system. Scenes can opt
        // out of the perimeter fence (e.g. Open Country) — flag lives
        // on the scene def.
        logStep('Building structures');
        game.structureBuilder.buildSinglePlayerStructures(
            game.gameState.getBounds(),
            game.gameState.getGate(),
            game.gameState.getPasture(),
            {
                perimeterFence: game.currentScene.perimeterFence !== false,
                corral: game.currentScene.corral || null,
                // Scenes with a day-loop homestead gate (Newsheepdogland) build
                // their own gate + pen below via buildHomesteadGate; suppress the
                // FieldConfig default gate+pen so a stray gate doesn't strand in
                // the water at the default origin location.
                homesteadGate: Boolean(game.currentScene.dayNight?.dayLoop && game.currentScene.gate)
            }
        );

        // Cycle 65: the homestead gate + day loop. Only on scenes that opt into
        // the day loop (Newsheepdogland). The gate is grounded via the heightfield set
        // above; the DayLoop + the day/night HUD chip are created here, and a
        // per-frame runner is stashed on the game for the main loop to call.
        if (game.currentScene.dayNight?.dayLoop && game.currentScene.gate) {
            const gd = game.currentScene.gate;
            const pen = game.currentScene.pen || null;
            const needsPenContainment = Boolean(pen?.center && !game.isMultiplayer);
            const needsSurvivalRun = Boolean(game.currentScene.survival && !game.isMultiplayer);
            const needsMinimap = Boolean(game.currentScene.survival && Array.isArray(game.currentScene.boundary?.points));
            const [
                { DayLoop },
                chip,
                penContainmentModule,
                survivalRunModule,
                minimapModule,
                { createSkipToDusk },
            ] = await Promise.all([
                import('../gamestate/dayLoop.js'),
                import('../components/GameHUD/DayNightChip.js'),
                needsPenContainment ? import('../gamestate/penContainment.js') : Promise.resolve(null),
                needsSurvivalRun ? import('../gamestate/survivalRun.js') : Promise.resolve(null),
                needsMinimap ? import('../components/GameHUD/Minimap.js') : Promise.resolve(null),
                import('../effects/skipToDusk.js'),
            ]);

            game.structureBuilder.buildHomesteadGate({
                gate: { x: gd.position.x, z: gd.position.z, width: gd.width, facingDeg: gd.facingDeg },
                pen,
            });
            const dayLoop = new DayLoop({ initialT: game.currentScene.dayNight.initialT });
            game.dayLoop = dayLoop;

            // Cycle 66 P2: the pen is a real barrier + the objective. A
            // client-side per-frame containment makes the fence solid (gate-only
            // entry, sealed at night, dog + sheep collide) and retires sheep that
            // pass through the gate (calm settle, no zap, no teleport). main.js
            // ticks it after the shared sheep sim each frame.
            // Cycle 67 P6: the client-side pen + survival sim run for SOLO only. In
            // co-op the DO is authoritative (run + wolves + pen) and the client
            // renders from the broadcast (see initNetwork.driveCoopSurvival), so
            // skip the local sim entirely in MP.
            if (needsPenContainment) {
                const { PenContainment } = penContainmentModule;
                game._penContainment = new PenContainment(pen, {
                    x: gd.position.x, z: gd.position.z, width: gd.width,
                });
            } else {
                game._penContainment = null;
            }

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
                    pen: game._penContainment,
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
                const t = dn.getT();
                // Cycle 66 P2: the pen containment authoritatively tracks who has
                // been herded through the gate and retired inside; prefer its
                // count. Fall back to a throttled radius scan only when there is
                // no containment (e.g. a day-loop scene without a pen).
                if (game._penContainment) {
                    home = game._penContainment.pennedCount;
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
                game.structureBuilder?.setHomesteadGateOpen?.(state.gateOpen);
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
                        game._penContainment?.releaseAll?.(game.gameState?.sheep);
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
            } else {
                const { CorralZapEffectPool } = await import('../effects/CorralZapEffect.js');
                game._corralZapPool = new CorralZapEffectPool(game.sceneManager.getScene());
                window.addEventListener('corral-retired', (e) => {
                    if (e?.detail && game._corralZapPool) {
                        game._corralZapPool.fire(e.detail);
                    }
                }, { signal: game._sceneAbort.signal });
                // Cycle 7: spark at the top of the bolt when a retiring
                // sheep finishes its upward ascent. Marks the moment of
                // removal cleanly — small particle burst, no new bolt.
                window.addEventListener('corral-ascend-top', (e) => {
                    if (e?.detail && game._corralZapPool) {
                        game._corralZapPool.fireSpark(e.detail);
                    }
                }, { signal: game._sceneAbort.signal });
            }
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

        // Set as local player and create distance indicator (after mesh is created)
        sheepdog.setAsLocalPlayer();

        // Create optimized sheep flock (visible during start screen)
        logStep('Creating sheep flock');
        game.gameState.createSheepFlock(game.sceneManager.getScene());

        logStep('Scene body complete');
        if (game._wolfPack?.init) {
            setTimeout(() => { game._wolfPack?.init?.(); }, 1000);
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
