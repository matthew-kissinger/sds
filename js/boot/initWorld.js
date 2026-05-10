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

/**
 * @param {object} game SheepDogSimulation instance.
 * @param {(step: string, detail?: string) => void} [logStep]
 */
export async function buildSceneBody(game, logStep = (s) => console.log(`[BUILD] ${s}`)) {
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
        // can query it per-tick. Field has no obstacles (rect-scene path
        // skips island trees) so the empty-set guard preserves baseline.
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
        await game.terrainBuilder.addFarmHouse();

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
                corral: game.currentScene.corral || null
            }
        );

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

        // Cycle 5+: anime water for island scenes.
        // Built after structures and hidden in non-island scenes.
        if (game.currentScene.boundary?.kind === 'island') {
            logStep('Building anime water');
            try {
                const { createAnimeWater } = await import('../water/AnimeWater.js');
                const scene = game.sceneManager.getScene();

                const water = createAnimeWater({
                    boundary: game.currentScene.boundary,
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
        logStep('Creating sheepdog');
        const sheepdog = new Sheepdog(0, -30, 'jep', game.heightfield);
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

    } catch (error) {
        console.error('[BUILD] Fatal error during scene build:', error);
        throw error;
    }
}
