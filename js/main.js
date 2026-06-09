// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';
// Cycle 27 Phase C: React imports moved to a runtime dynamic import in
// onGameComplete (the only main.js code path that touches React). Static
// imports kept React + react-dom in the critical-path bundle even though
// they're only needed at game-end. Lazy now → smaller main.js, React
// loads in parallel with App.js's lazy chunk.
import { SceneManager } from './SceneManager.js';
import { GameState } from './GameState.js';
import { GameTimer } from './GameTimer.js';
import { TerrainBuilder } from './TerrainBuilder.js';
import { StructureBuilder } from './StructureBuilder.js';
import { InputHandler } from './InputHandler.js';
import { MobileControls } from './MobileControls.js';
import { Sheepdog } from './Sheepdog.js';
import { PerformanceMonitor } from './PerformanceMonitor.js';
import { MenuController } from './MenuController.js';
import { AudioManager } from './AudioManager.js';
import { GameAssetLoader } from './GameAssetLoader.js';
import { NetworkManager } from './NetworkManager.js';
import { MultiplayerState } from './MultiplayerState.js';
import { Vector2D } from './Vector2D.js';
import { setGameInstance, emitGameEvent } from './GameBridge.js';
import { loadScene, listScenes, DEFAULT_SCENE_ID } from '../shared/scenes/index.js';
import { Heightfield } from '../shared/terrain/Heightfield.js';
import { COUNTING_GAME_MODE } from '../shared/countingModes.js';
import { applyBarkImpulse, DEFAULT_BARK_CONFIG } from '../shared/BarkImpulse.js';
import { Atmosphere } from './atmosphere/index.js';
import { updateSceneMetadata } from './utils/seo.js';
// Cycle 17 Phase 7: local-multiplayer modules dynamic-imported in
// startLocalGame() so they only ship when the user actually picks Local Mode.
// Keeps ~860 LoC out of the main bundle for the 99% of users who never use it.
import { captureFramebufferSample, isProbeEnabled, log as probeLog, drainGlErrors } from './diagnostics/glProbe.js';
import { isCinematicMode, isUiHidden, getRequestedSun } from './cinematic-url.js';
import { resolveAssetUrl } from './utils/assetUrl.js';
import { startReplay as runStartReplay, stopReplay as runStopReplay } from './utils/replay.js';
import { WebVitalsMonitor } from './boot/WebVitalsMonitor.js';
import { installStressTestHarness, installMpProbe } from './boot/debugProbes.js';
import { BackdropReveal } from './effects/BackdropReveal.js';
import { installMpEventHandlers, handleMultiplayerGameState as runMpStateHandoff } from './boot/initNetwork.js';
import { buildSceneBody } from './boot/initWorld.js';
import { disposeScene as runDisposeScene } from './boot/loadScene.js';
import { shouldBootAttract } from './boot/bootAttract.js';
import {
    showCompletionOverlay as renderCompletionOverlay,
    showLocalCompletionOverlay as renderLocalCompletionOverlay,
    disposeCompletionOverlay
} from './boot/completionOverlay.js';
import {
    formatTime as fmtTime,
    loadBestScore as readBestScore,
    saveBestScore as writeBestScore,
    saveTimedModeScore as writeTimedModeScore,
    getBestScoreText as readBestScoreText
} from './utils/scoreStorage.js';
// installCinemaApi (three.js-dependent) is dynamic-imported only when
// `?cinematic=1` is set, keeping it out of the main bundle.

// Cycle 23 Phase E: cinematic-flag strip on invite-hash join. If a user
// lands on `?cinematic=1#/r/ABC123`, the cinematic flag would leak
// `preserveDrawingBuffer: true` into a normal MP play session. Strip it
// from location.search BEFORE SceneManager constructs (which reads the
// flag synchronously). The hash itself is consumed by App.js's
// useEffect later in this module's bootstrap.
(function stripCinematicOnInvite() {
    if (typeof location === 'undefined') return;
    if (!location.hash || !location.hash.startsWith('#/r/')) return;
    const sp = new URLSearchParams(location.search);
    if (sp.get('cinematic') !== '1') return;
    sp.delete('cinematic');
    const newSearch = sp.toString();
    const newUrl = `${location.pathname}${newSearch ? '?' + newSearch : ''}${location.hash}`;
    history.replaceState(null, '', newUrl);
    console.log('[CINEMA] Stripped ?cinematic=1 from invite-hash URL — preserveDrawingBuffer stays off for guests.');
})();

function emitRendererModeTelemetry(gameInstance = null) {
    const rendererMode = window.__sdsRendererMode ?? null;
    if (!rendererMode) return;
    const productionWebGpu = window.__sdsG?.productionWebGpu ?? null;
    import('./telemetry.js').then(({ emitEvent }) => {
        emitEvent('renderer_mode_resolved', {
            requested: rendererMode.requested ?? '',
            effective: rendererMode.effective ?? '',
            fallbackReason: rendererMode.fallbackReason ?? '',
            webgpuApiAvailable: rendererMode.webgpuApiAvailable === true,
            productionWebGpu: rendererMode.productionWebGpu === true,
            productionOk: productionWebGpu?.ok === true,
            devicePreflightOk: productionWebGpu?.devicePreflight?.ok === true,
            sceneId: gameInstance?.currentScene?.id ?? window.__currentSceneId ?? '',
        });
    }).catch(() => {});
}

/**
 * Main simulation controller - Enhanced with mobile controls support
 * Uses separate modules for different responsibilities
 */
class SheepDogSimulation {
    constructor(options = {}) {
        // Initialize all modules
        this.sceneManager = new SceneManager(options.sceneManagerOptions);
        this.gameState = new GameState();
        this.gameTimer = new GameTimer();
        // Optional local developer capture. Production and ordinary local
        // play keep this null so completion UX stays score/navigation-only.
        this.replayRecorder = null;
        // Scene selection: ?scene=<id> URL param (pre-UI). Invalid ids fall back to default.
        const requestedSceneId = new URLSearchParams(location.search).get('scene');
        const validSceneIds = listScenes().map(s => s.id);
        const activeSceneId = requestedSceneId && validSceneIds.includes(requestedSceneId)
            ? requestedSceneId
            : DEFAULT_SCENE_ID;
        this.currentScene = loadScene(activeSceneId);
        if (activeSceneId !== DEFAULT_SCENE_ID) {
            console.log(`[SCENE] Loaded "${this.currentScene.name}" (${activeSceneId}) from URL param`);
        }
        // Cycle 8 Phase 3: track active sceneId on gameState + window so the
        // leaderboard submission path can include it as a partition key.
        this.gameState.sceneId = activeSceneId;
        if (typeof window !== 'undefined') window.__currentSceneId = activeSceneId;
        // Cycle 46 Phase 1: boot-time zen attract field. On a plain open (no
        // explicit scene/room/sandbox/cinematic/test intent) the app paints a
        // cheap drifting-boid field as first frame instead of building the
        // hero scene; the picker overlay floats on top and the real scene
        // streams in on the first pick. Any deep-link that needs a built scene
        // opts out: ?scene=, an #/r/ room invite, an #s/ sandbox config, or the
        // ?autostart / ?testNoCanvas / ?cinematic harness flags. `_attractMode`
        // flips true in init() once the field actually mounts; rebuildScene
        // clears it when the first real scene is built.
        this._bootAttract = shouldBootAttract({
            hash: typeof location !== 'undefined' ? location.hash : '',
            search: typeof location !== 'undefined' ? location.search : '',
            cinematic: isCinematicMode(),
        });
        this._attractMode = false;
        // Cycle 52 P1: the in-engine scene-reveal scaffold. A RevealLayer is any
        // object with beginCrossfade() / setOpacity(a) / update(dt) / dispose();
        // the renderer holds it over the freshly built scene and ramps its
        // opacity to 0 in runFrame, an in-engine dissolve with no DOM cover.
        // Generalized from the Cycle 46 zen-attract dart field (retired in Cycle
        // 51 P7); Cycle 52 P2 plugs the menu backdrop into the same seam.
        // `_revealActive` arms the per-frame ramp; `_keepRevealLayer` tells
        // disposeScene to spare the layer through teardown; `_attractPrefetchPromise`
        // is the idle GLB warm-up the first build awaits.
        this._revealLayer = null;
        this._revealActive = false;
        this._keepRevealLayer = false;
        this._revealT = 0;
        this._revealDur = 0.8;
        this._attractPrefetchPromise = null;
        // Cycle 26 v2.1.0: per-scene SEO meta (title + OG + Twitter) for
        // deep-link sharing previews. Plain opens keep index.html's entrance
        // metadata; only an explicit valid ?scene= should replace it.
        if (requestedSceneId && validSceneIds.includes(requestedSceneId)) {
            updateSceneMetadata(activeSceneId);
        }
        // Cycle 5+: propagate discriminated boundary if the scene declares one.
        // Field stays on legacy bounds; Rolling Hills + Open Country migrate
        // to island in Phases 2/3.
        if (this.currentScene.boundary) {
            this.gameState.setBoundary(this.currentScene.boundary);
        }
        // Cycle 5+: apply scene-specific flocking override if present (Phase 1.5).
        if (this.currentScene.flocking) {
            this.gameState.setFlockingOverride(this.currentScene.flocking);
        }
        // Cycle 5+: corral replaces gate+pasture for island scenes that have one.
        if (this.currentScene.corral) {
            this.gameState.setCorral(this.currentScene.corral);
        }
        // Cycle 7 Phase 3: multi-stage objective (gather → drive → portal).
        // Only OC sets this; RH/Field leave it null and run the standard
        // single-stage retirement flow.
        if (this.currentScene.objective) {
            this.gameState.setObjective(this.currentScene.objective);
        }
        // Cycle 7: forward scene's sheepSpawn so islands can override the
        // tight bounds-derived defaults with a wider/clustered distribution.
        if (this.currentScene.sheepSpawn) {
            this.gameState.setSheepSpawn(this.currentScene.sheepSpawn);
        }
        this.heightfield = null; // Loaded async in init() before createTerrain.

        // Cycle 10 Phase 1: AbortController-tracked window listeners
        // registered inside init() (corral-retired, objective-stage-changed,
        // corral-ascend-top). disposeScene().abort() tears them down so old
        // PortalEffect / CorralZapPool references don't fire after a swap.
        // Created here so init() can attach to it on first run.
        this._sceneAbort = new AbortController();

        // Atmosphere takes over scene.fog + adds a Hosek-Wilkie sky dome.
        // Construction MUST happen after SceneManager so the scene exists; the
        // initial preset comes from the loaded scene def.
        const initialPreset = this.currentScene.sky?.preset ?? 'pastoral-noon';
        this.atmosphere = new Atmosphere(this.sceneManager.getScene(), {
            initialPreset,
            enableClouds: true,
            enableDayNight: !!this.currentScene.dayNight?.enabled,
            // Cycle 23 Phase A1: scene-level fog override (linear THREE.Fog).
            // Field/RH/OC each ship explicit `fog: { color, near, far }`. Falls
            // back to FogExp2 default when sceneDef omits.
            sceneFog: this.currentScene.fog ?? null,
        });
        this.atmosphere.bindAmbientLight(this.sceneManager.ambientLight);
        // Cycle 65: opt-in day/night sun arc when the scene declares it.
        if (this.currentScene.dayNight?.enabled) {
            this.atmosphere.startDayNightCycle({
                secondsPerDay: this.currentScene.dayNight.secondsPerDay,
                initialT: this.currentScene.dayNight.initialT,
            });
        }

        this._sunBillboard = null;

        this.terrainBuilder = new TerrainBuilder(this.sceneManager.getScene(), this.sceneManager.isMobile, this.currentScene);
        this.structureBuilder = new StructureBuilder(this.sceneManager.getScene());
        this.inputHandler = new InputHandler();
        this.performanceMonitor = new PerformanceMonitor();
        const urlParams = new URLSearchParams(location.search);
        this.qualityGovernor = null;
        const sceneTier = this.sceneManager.getTier?.();
        const initialDeviceTier = !this.sceneManager.isMobile
            ? 'high'
            : sceneTier === 'high'
                ? 'high'
                : sceneTier === 'med'
                    ? 'mid'
                    : 'low';
        this.performanceMonitor.setDeviceTier(initialDeviceTier);
        this.performanceMonitor.setQualityState({
            deviceTier: initialDeviceTier,
            qualityIndex: 0,
            fallbackReason: null,
        });
        import('./perf/QualityGovernor.js').then(({ QualityGovernor }) => {
            this.qualityGovernor = new QualityGovernor({
                performanceMonitor: this.performanceMonitor,
                isMobile: this.sceneManager.isMobile,
                tier: sceneTier,
                adapterLimits: window.__sdsG?.productionWebGpu?.devicePreflight?.adapterLimits ?? null,
                autoFallback: urlParams.get('qualityAutoFallback') === '1',
                onQualityStateChange: (state) => this.applyQualityState(state),
            });
            this.performanceMonitor.setDeviceTier(this.qualityGovernor.deviceTier);
            const state = this.qualityGovernor.getState();
            this.performanceMonitor.setQualityState(state);
            this.applyQualityState(state);
        }).catch(() => {});

        // Cycle 8 Phase C: perf harness hook. When `?perfMode=1` is set,
        // expose `window.__perfHarness` so Playwright (or a manual page
        // probe) can sample frametime + render stats without touching
        // the game's UI. Off by default — the in-game P-key panel is
        // the interactive path. The harness is intentionally tiny:
        // ready-check, current-metrics snapshot, fixed-window sampling.
        // Per-system breakdowns (obstacle-query timing, etc.) can be
        // layered on later by widening PerformanceMonitor.
        if (urlParams.get('perfMode') === '1') {
            const perfMon = this.performanceMonitor;
            const gameStateRef = this.gameState;
            // Cycle 15 Phase 3: expose renderer so the perf harness can read
            // WebGLRenderer.info per-system without depending on cinematic=1
            // (which flips preserveDrawingBuffer and biases the numbers).
            const sceneManagerRef = this.sceneManager;
            const gameInstanceRef = this;
            Object.defineProperty(window, '__sdsRenderer', {
                configurable: true,
                get() { return sceneManagerRef?.getRenderer?.() ?? null; }
            });
            window.__perfHarness = {
                isReady: () => {
                    const sheep = gameStateRef.getSheep?.() || [];
                    return perfMon.isEnabled && sheep.length > 0 && perfMon.frameCount > 0;
                },
                getMetrics: () => ({ ...perfMon.metrics, frameCount: perfMon.frameCount }),
                setCameraPose(poseId = 'default') {
                    this._cameraPose = poseId;
                    const cc = sceneManagerRef.getCameraController?.();
                    if (poseId === 'follow-close') {
                        cc?.setMode?.('follow');
                        cc?.setZoom?.(cc.minDistance);
                    } else if (poseId === 'classic-max' || poseId === 'horizon-terrain-seam') {
                        cc?.setMode?.('classic');
                        cc?.setZoom?.(cc.maxDistance);
                    } else if (poseId === 'tree-occluded') {
                        cc?.setMode?.('follow');
                        cc?.setZoom?.(Math.max(cc.minDistance, 16));
                    } else if (poseId === 'shoreline-glint') {
                        cc?.setMode?.('classic');
                        cc?.setZoom?.(Math.min(cc.maxDistance, 110));
                    }
                    return this._cameraPose;
                },
                setSystemIsolation(systemId = 'full') {
                    this._systemIsolation = systemId;
                    gameInstanceRef._perfSystemIsolation = systemId;
                    const terrain = gameInstanceRef.terrainBuilder;
                    const grassMeshes = Array.from(terrain?.grassSystem?.chunks?.values?.() ?? [])
                        .map((chunk) => chunk?.mesh)
                        .filter(Boolean);
                    const groups = {
                        terrain: [terrain?.terrainMesh, terrain?.terrainSkirtMesh].filter(Boolean),
                        grass: grassMeshes,
                        trees: Array.isArray(terrain?.trees) ? terrain.trees : [],
                        rocks: Array.isArray(terrain?.rocks) ? terrain.rocks : [],
                        water: [gameInstanceRef._animeWater?.mesh].filter(Boolean),
                        sheep: [gameInstanceRef.gameState?.optimizedSheepSystem?.instancedMesh].filter(Boolean),
                        structures: Object.values(gameInstanceRef.structureBuilder?.structures ?? {}).flat(),
                        atmosphere: [
                            gameInstanceRef.atmosphere?.sky?.getMesh?.(),
                            gameInstanceRef.atmosphere?.cloudLayer?.getMesh?.(),
                            gameInstanceRef._sunBillboard?.mesh,
                        ].filter(Boolean),
                    };
                    if (!this._visibilitySnapshot) this._visibilitySnapshot = new WeakMap();
                    const remember = (obj) => {
                        if (obj && !this._visibilitySnapshot.has(obj)) {
                            this._visibilitySnapshot.set(obj, obj.visible !== false);
                        }
                    };
                    const setVisible = (list, visible) => {
                        for (const obj of list) {
                            remember(obj);
                            obj.visible = visible;
                        }
                    };
                    if (systemId === 'full') {
                        for (const list of Object.values(groups)) {
                            for (const obj of list) {
                                if (this._visibilitySnapshot.has(obj)) {
                                    obj.visible = this._visibilitySnapshot.get(obj);
                                }
                            }
                        }
                        return this._systemIsolation;
                    }
                    const selected = String(systemId).replace(/-only$/, '');
                    for (const [name, list] of Object.entries(groups)) {
                        setVisible(list, name === selected);
                    }
                    return this._systemIsolation;
                },
                getCostReport(frameTimes = null) {
                    return perfMon.getCostReport({
                        renderer: sceneManagerRef?.getRenderer?.(),
                        sceneId: window.__currentSceneId ?? 'unknown',
                        cameraPose: this._cameraPose ?? 'default',
                        qualityState: gameInstanceRef.qualityGovernor?.getState?.() ?? {},
                        frameTimes: frameTimes ?? undefined,
                    });
                },
                getVisualProbe() {
                    return gameInstanceRef.getCycle38VisualProbe?.() ?? null;
                },
                setCollisionProbeEnabled(enabled = true) {
                    return gameInstanceRef.gameState?.optimizedSheepSystem
                        ?.setCollisionProbeEnabled?.(enabled === true) ?? false;
                },
                placeCollisionProbeCluster(options = {}) {
                    return gameInstanceRef.gameState?.optimizedSheepSystem
                        ?.placeCollisionProbeCluster?.(options) ?? null;
                },
                getCollisionProfile() {
                    const profile = gameInstanceRef.gameState?.optimizedSheepSystem
                        ?.getCollisionProfile?.() ?? null;
                    return profile ? { ...profile } : null;
                },
                setSun(t = 0.5) {
                    const value = Number(t);
                    if (!Number.isFinite(value) || !gameInstanceRef.atmosphere?.setSun) return null;
                    const clamped = Math.max(0, Math.min(1, value));
                    gameInstanceRef.atmosphere.setSun({ elevation: clamped * Math.PI * 0.5 });
                    return clamped;
                },
                setDogDrive(state = {}) {
                    const dir = state.direction ?? {};
                    const x = Number(dir.x);
                    const z = Number(dir.z);
                    gameInstanceRef._perfDogDrive = {
                        active: state.active !== false && Number.isFinite(x) && Number.isFinite(z),
                        direction: { x, z },
                        sprint: state.sprint !== false,
                    };
                    return gameInstanceRef._perfDogDrive;
                },
                setDogPose(state = {}) {
                    const x = Number(state.x);
                    const z = Number(state.z);
                    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
                    const dog = gameInstanceRef.gameState?.getSheepdog?.();
                    if (!dog) return false;
                    dog.position.x = x;
                    dog.position.z = z;
                    if (state.resetVelocity !== false) {
                        dog.velocity?.set?.(0, 0);
                        dog.targetVelocity?.set?.(0, 0);
                    }
                    const surfaceY = gameInstanceRef.heightfield?.surfaceY?.(x, z)
                        ?? gameInstanceRef.terrainBuilder?.sampleTerrainHeight?.(x, z)
                        ?? 0;
                    if (dog.mesh?.position) {
                        dog.mesh.position.set(x, surfaceY, z);
                    }
                    if (Number.isFinite(state.rotation)) {
                        dog.currentRotation = state.rotation;
                        dog.targetRotation = state.rotation;
                        if (dog.mesh) dog.mesh.rotation.y = state.rotation;
                    }
                    gameInstanceRef.sceneManager?.updateCamera?.(dog, 1 / 60);
                    return true;
                },
                clearDogDrive() {
                    gameInstanceRef._perfDogDrive = null;
                    return true;
                },
                reset() {
                    perfMon.reset();
                    this._samples = [];
                    this._stop = 0;
                    this._lastSampleTime = null;
                    return true;
                },
                startSampling(durationMs = 8000) {
                    this._samples = [];
                    this._stop = Date.now() + durationMs;
                    this._lastSampleTime = performance.now();
                    const tick = (now) => {
                        if (Date.now() >= this._stop) return;
                        const frameTime = Math.max(0, now - (this._lastSampleTime ?? now));
                        this._lastSampleTime = now;
                        this._samples.push({
                            t: now,
                            frameTime,
                            drawCalls: perfMon.metrics.drawCalls,
                            triangles: perfMon.metrics.triangles,
                            estimatedTriangles: perfMon.metrics.estimatedTriangles,
                            activeSheep: perfMon.metrics.activeSheepCount,
                            collision: this.getCollisionProfile(),
                        });
                        requestAnimationFrame(tick);
                    };
                    requestAnimationFrame(tick);
                    return durationMs;
                },
                getSummary() {
                    const samples = this._samples || [];
                    if (samples.length === 0) return null;
                    const frameTimes = samples.map(s => s.frameTime).sort((a, b) => a - b);
                    const pct = (p) => frameTimes[Math.min(frameTimes.length - 1, Math.floor((p / 100) * frameTimes.length))];
                    return {
                        sampleCount: samples.length,
                        avgFrameTime: frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length,
                        p50FrameTime: pct(50),
                        p95FrameTime: pct(95),
                        p99FrameTime: pct(99),
                        maxFrameTime: frameTimes[frameTimes.length - 1],
                        avgDrawCalls: samples.reduce((a, s) => a + s.drawCalls, 0) / samples.length,
                        avgTriangles: samples.reduce((a, s) => a + s.triangles, 0) / samples.length,
                        avgEstimatedTriangles: samples.reduce((a, s) => a + s.estimatedTriangles, 0) / samples.length,
                        avgActiveSheep: samples.reduce((a, s) => a + s.activeSheep, 0) / samples.length,
                        collision: this._summarizeCollision(samples),
                        costReport: this.getCostReport(frameTimes),
                        cameraPose: this._cameraPose ?? 'default',
                        systemIsolation: this._systemIsolation ?? 'full',
                    };
                },
                _summarizeCollision(samples) {
                    const collisionSamples = samples.map(s => s.collision).filter(Boolean);
                    if (collisionSamples.length === 0) return null;
                    const avg = (key) => collisionSamples.reduce((sum, s) => sum + (s[key] || 0), 0) / collisionSamples.length;
                    const max = (key) => collisionSamples.reduce((value, s) => Math.max(value, s[key] || 0), 0);
                    const sorted = (key) => collisionSamples
                        .map(s => s[key] || 0)
                        .sort((a, b) => a - b);
                    const pct = (values, p) => values[Math.min(values.length - 1, Math.floor((p / 100) * values.length))] || 0;
                    const sheepMs = sorted('sheepCollisionMs');
                    const dogMs = sorted('dogCollisionMs');
                    const rewriteMs = sorted('rewriteMs');
                    const updateMs = sorted('totalUpdateMs');
                    return {
                        sampleCount: collisionSamples.length,
                        avgSheepCollisionMs: avg('sheepCollisionMs'),
                        p95SheepCollisionMs: pct(sheepMs, 95),
                        maxSheepCollisionMs: max('sheepCollisionMs'),
                        avgDogCollisionMs: avg('dogCollisionMs'),
                        p95DogCollisionMs: pct(dogMs, 95),
                        maxDogCollisionMs: max('dogCollisionMs'),
                        avgRewriteMs: avg('rewriteMs'),
                        p95RewriteMs: pct(rewriteMs, 95),
                        maxRewriteMs: max('rewriteMs'),
                        avgTotalUpdateMs: avg('totalUpdateMs'),
                        p95TotalUpdateMs: pct(updateMs, 95),
                        maxTotalUpdateMs: max('totalUpdateMs'),
                        avgPairChecks: avg('pairChecks'),
                        maxPairChecks: max('pairChecks'),
                        avgPairs: avg('pairs'),
                        maxPairs: max('pairs'),
                        avgMoved: avg('moved'),
                        maxMoved: max('moved'),
                        maxCellOccupancy: max('maxCellOccupancy'),
                        maxDogCorrections: max('dogCorrections'),
                        maxDogRepushCorrections: max('dogRepushCorrections'),
                    };
                },
            };
            console.log('[PERF] __perfHarness installed. Call window.__perfHarness.startSampling() to capture.');
        }

        // Cycle 60 Phase 1: dependency-free on-screen perf chip for tablet /
        // playtest baselines. `?stats=1` enables and persists to localStorage
        // `sds.show-stats`; `?stats=0` clears it. No CDN (unlike the P-key
        // Stats.js panel), so it works offline on a LAN tablet.
        {
            let showStats = false;
            try {
                const q = urlParams.get('stats');
                if (q === '1') { localStorage.setItem('sds.show-stats', '1'); showStats = true; }
                else if (q === '0') { localStorage.removeItem('sds.show-stats'); showStats = false; }
                else { showStats = localStorage.getItem('sds.show-stats') === '1'; }
            } catch (_) { showStats = urlParams.get('stats') === '1'; }
            if (showStats) {
                const sm = this.sceneManager;
                const gs = this.gameState;
                import('./perf/StatsChip.js').then((m) => m.mountStatsChip(() => {
                    const info = sm?.getRenderer?.()?.info?.render;
                    const sheep = gs?.getSheep?.();
                    return {
                        draws: info?.calls ?? 0,
                        tris: info?.triangles ?? 0,
                        sheep: Array.isArray(sheep) ? sheep.length : 0,
                    };
                })).catch(() => {});
            }
        }

        if (urlParams.has('grassInteractionProof')) {
            import('./diagnostics/grassInteractionProofHarness.js')
                .then((m) => m.installGrassInteractionProofHarness(this));
        }

        // Cycle 17 Phase 1: lightweight diagnostic surface for the
        // mobile-probe harness. URL `?probeRender=1` exposes
        // window.__sds.cameraController + scene-manager so the harness
        // can max-zoom the classic camera and read render.info without
        // depending on `?cinematic=1` (which flips preserveDrawingBuffer).
        if (urlParams.get('probeRender') === '1') {
            const sm = this.sceneManager;
            const cc = this.sceneManager.getCameraController?.();
            window.__sds = window.__sds || {};
            window.__sds.cameraController = cc;
            window.__sds.sceneManager = sm;
            window.__sds.maxZoom = () => cc?.setZoom?.(cc.maxDistance);
            console.log('[PROBE] window.__sds installed (probeRender=1)');
        }
        // Cycle 20 v5: ALWAYS expose a thin debug surface so playwright /
        // dev-tool consumers can sample LOD0 vs impostor pixel colors
        // without the cinematic flag's preserveDrawingBuffer side-effect.
        // Read-only references; no mutation hooks.
        window.__sds = window.__sds || {};
        window.__sds.gameInstanceRef = this;
        window.__sds.sceneManagerRef = this.sceneManager;
        window.__sds.atmosphereRef = this.atmosphere;
        window.__sds.terrainBuilderRef = this.terrainBuilder;
        this.webVitalsMonitor = new WebVitalsMonitor();
        this.gameAssetLoader = new GameAssetLoader();
        this.menuController = new MenuController(this.sceneManager);

        // Cycle 24 Phase 1: install MP probe immediately after MenuController
        // creation so e2e specs can read it even when later constructor steps
        // (AudioManager etc.) throw on engines like Playwright-WebKit which
        // doesn't expose AudioContext. Probe only needs the NetworkManager,
        // which lives on menuController. Gated on ?perfMode=1 OR ?mpProbe=1.
        this.networkManager = this.menuController.networkManager;
        try {
            if (urlParams.get('perfMode') === '1' || urlParams.get('mpProbe') === '1') {
                installMpProbe(this);
            }
        } catch (e) {
            console.warn('[MP-PROBE] install failed (non-fatal):', e?.message);
        }

        // Cycle 24 Phase 1: AudioManager construction throws on
        // Playwright-WebKit (no AudioContext exposed) and historically has
        // surfaced as an opaque "game won't load" symptom on Safari profiles
        // with audio disabled. Failing the whole constructor over audio is
        // the wrong call — the game runs fine silently. Catch + log so
        // setGameInstance() and React mount complete normally.
        try {
            this.audioManager = new AudioManager(this.sceneManager.getCamera());
        } catch (e) {
            console.warn('[AUDIO] AudioManager init failed; running silent:', e?.message);
            this.audioManager = null;
        }
        this.multiplayerState = new MultiplayerState();
        
        // Create mobile controls with sceneManager and audioManager
        this.mobileControls = new MobileControls(this.sceneManager, this.audioManager);
        
        // Add mobile class to body if touch device detected
        if (this.mobileControls.getIsTouchDevice()) {
            document.body.classList.add('is-mobile');
            // Mobile UI now handled by React components
        }
        
        // Connect mobile controls to input handler and scene manager
        this.inputHandler.setMobileControls(this.mobileControls);
        this.sceneManager.setMobileControls(this.mobileControls);

        // Connect gamepad manager to scene manager
        this.sceneManager.setGamepadManager(this.inputHandler.getGamepadManager());

        // Wire camera controller to all input sources + restore persisted mode.
        this.cameraController = this.sceneManager.getCameraController();
        this.inputHandler.setCameraController(this.cameraController);
        this.mobileControls.setCameraController(this.cameraController);
        // Cycle 6 Phase 5: per-scene camera memory. Lookup order:
        //   1. camera-mode-${sceneId}     (per-scene override, this scene's last value)
        //   2. scene.defaultCamera        (scene's first-visit default)
        //   3. camera-mode                (legacy global fallback — start-screen panel writes this)
        //   4. CLASSIC                    (final default in CameraController)
        // Cycle 5 only had #3 → scene.defaultCamera only fired on first-ever
        // visit; once a user picked Classic anywhere, RH + OC silently broke.
        const sceneCameraKey = `camera-mode-${this.currentScene.id}`;
        try {
            const perScene = localStorage.getItem(sceneCameraKey);
            if (perScene) {
                this.cameraController.setMode(perScene);
            } else if (this.currentScene.defaultCamera) {
                this.cameraController.setMode(this.currentScene.defaultCamera);
            } else {
                const legacy = localStorage.getItem('camera-mode');
                if (legacy) this.cameraController.setMode(legacy);
            }
        } catch (_) { /* localStorage may be unavailable */ }
        window.addEventListener('camera-mode-set', (e) => {
            if (e?.detail) this.cameraController.setMode(e.detail);
        });
        // Persist in-game mode changes to the per-scene key. The 'C' hotkey
        // dispatches camera-mode-changed; the SettingsPanel writes the legacy
        // global key on start-screen change. Both writes are kept for back-compat.
        window.addEventListener('camera-mode-changed', (e) => {
            if (!e?.detail) return;
            try { localStorage.setItem(sceneCameraKey, e.detail); } catch (_) { /* ignore */ }
        });
        
        // Connect performance monitor and game state to input handler
        this.inputHandler.setPerformanceMonitor(this.performanceMonitor);
        

        
        // Set up pause functionality
        this.setupPauseHandling();
        
        // Set up start screen callback
        this.menuController.setGameStartCallback((mode, roomData, singlePlayerMode) => {
            if (mode === 'local') {
                // roomData is actually localConfig for local mode
                this.startLocalGame(roomData);
            } else {
                this.startGame(mode, roomData, singlePlayerMode);
            }
        });
        
        // Pass audio manager to modules that need it
        this.gameState.setAudioManager(this.audioManager);
        this.menuController.setAudioManager(this.audioManager);
        
        // Animation timing
        this.lastTime = performance.now();
        this._lastFrameTickAt = this.lastTime;
        this._frameWatchdogId = null;
        
        // Multiplayer state — networkManager is now assigned earlier (right
        // after MenuController creation, alongside the MP probe install) so
        // engines that throw later in the constructor (e.g. Playwright-WebKit
        // which has no AudioContext) still expose probe + nm to React/tests.
        this.isMultiplayer = false;
        this.otherPlayers = new Map(); // playerId -> Sheepdog instance
        this.playerWasMoving = false; // Track movement state from previous frame
        // Per-frame render-loop scratch (hoisted to kill allocations in runFrame).
        // The grass-interaction gather, the interaction-entity wrapper list, the
        // perf-visible-counts breakdown, and the MP input payload all run every
        // frame over up to 5,000 sheep; reusing these buffers keeps the hot path
        // allocation-free. None of the consumers retain these across frames:
        // GrassSystem.updateInteractors copies fields into typed arrays
        // synchronously, and NetworkManager.sendPlayerInput msgpack-encodes the
        // payload synchronously before returning.
        // Site 1 — grass candidate gather. Pooled {sheep, d2} slots; sorted in
        // place by distance-to-dog then read up to sheepLimit (identical to the
        // old filter().filter().sort().slice()).
        this._grassCandidates = []; // live slots this frame (length reset each frame)
        this._grassCandidatePool = []; // backing pool of reusable {sheep, d2} slots
        // Hoisted comparator (was an inline closure allocated per sort call).
        this._grassCandidateCmp = (a, b) => a.d2 - b.d2;
        // Site 2 — interaction-entity wrappers. The array is reused (length reset
        // each frame); the per-sheep wrappers (with nested {x,y,z}) are pooled,
        // as are the single player slot and the remote-dog slots.
        this._interactionEntities = [];
        this._grassSheepSlotPool = []; // reusable sheep wrappers: { position:{x,y,z}, type, facingDirection }
        this._grassPlayerSlot = { position: null, type: 'player', currentRotation: 0 };
        this._grassDogSlotPool = []; // reusable remote-dog wrappers: { position, type:'dog', currentRotation }
        // Site 3 — perf visible-counts scratch. Reused arrays + one reused stats
        // object replace the fresh Object.values().flat()/filter() literals.
        this._perfStructureScratch = []; // flattened structure objects
        this._perfVisibleCounts = {
            Terrain: 0, Trees: 0, Rocks: 0, Mountains: 0, Grass: 0,
            Structures: 0, Sheep: 0, Water: 0, Atmosphere: 0,
        };
        // Site 4 — MP input payload. Reused object with persistent nested
        // direction/clientPosition (safe: sendPlayerInput consumes it
        // synchronously via msgpack encode before returning).
        // `clientPosition` is non-null only on the stop frame, so the payload's
        // slot toggles between `_mpClientPos` and null; the object itself lives
        // here so the reference survives null frames.
        this._mpClientPos = { x: 0, z: 0 };
        this._mpInputPayload = {
            direction: { x: 0, z: 0 },
            sprint: false,
            timestamp: 0,
            clientPosition: null,
        };
        // Reused snapshot of the pre-transform movement direction (only read by
        // the competitive-mode debug log, synchronously, same frame).
        this._dbgOriginalDir = { x: 0, z: 0 };
        this.serverIsInterpolatingToClient = false; // Track when server is interpolating to our position
        this.competitiveStructuresCreated = false; // Track if we've built competitive structures
        
        // Client-side prediction and interpolation for multiplayer
        this.serverDogPosition = { x: 0, z: 0 };
        this.serverDogRotation = 0;
        this.lastServerUpdate = 0;
        this.interpolationSpeed = 2.5; // Reduced for smoother movement
        
        // Competitive mode audio state
        this.endgameMusicPlaying = false;

        // Local 2-player mode
        this.isLocalMultiplayer = false;
        this.localInputHandler = null;
        this.localMultiplayerManager = null;
        this.twoPlayerCamera = null;
        this.sheepdog2 = null;
        this.sheepdogMesh2 = null;

        // Set game instance BEFORE init() so GameBridge works during initialization
        // This is critical - Sheepdog needs getTerrainBuilder() during init()
        setGameInstance(this);
        // Cycle 57 P3: the fallback (non-React) and local-2p completion
        // overlays call window.gameInstance.restartToMenu() inline; expose the
        // instance so those buttons fire (and tear down their overlay via the
        // Phase 2 teardown). React paths close over `game` directly.
        if (typeof window !== 'undefined') window.gameInstance = this;
        console.log('[GAME] GameBridge initialized early in constructor');

        // Cycle 24 Phase 1: `?testNoCanvas=1` skips heavy 3D init + the
        // animate loop so two-tab MP e2e tests can run without GPU/CPU
        // contention. NetworkManager + React menu still mount normally. The
        // flag is for tests only — production has no codepath that would
        // ever opt in.
        const _testNoCanvas = urlParams.get('testNoCanvas') === '1';

        // Initialize the simulation
        this.isInitialized = false;
        if (_testNoCanvas) {
            console.log('[TEST] testNoCanvas=1 — skipping init() + animate()');
            this.isInitialized = true;
        } else {
            Promise.resolve()
                .then(() => options.beforeInit?.(this))
                .then(() => this.init())
                .then(() => {
                    this.isInitialized = true;
                    console.log('[GAME] Game initialization complete, starting animation loop');
                    if (urlParams.get('autostart') === '1') {
                        this.menuController.selectSolo('jep', urlParams.get('mode') || 'classic');
                    }
                }).catch((error) => {
                    console.error('[GAME] Game initialization failed:', error);
                });
            this.animate();
            this.startFrameWatchdog();
        }
    }
    
    setupPauseHandling() {
        // Register pause callback with input handler
        this.inputHandler.onPauseToggle((isPaused) => {
            // Propagate pause state to timer
            this.gameTimer.setPaused(isPaused);

            // Propagate pause state to game state
            this.gameState.setPaused(isPaused);
        });
    }

    /**
     * Wait for game initialization to complete (models loaded, terrain built)
     * Critical for iOS Safari where asset loading is slower
     */
    waitForInitialization() {
        return new Promise((resolve) => {
            if (this.isInitialized) {
                resolve();
                return;
            }

            // Poll every 100ms until initialized
            const checkInterval = setInterval(() => {
                if (this.isInitialized) {
                    clearInterval(checkInterval);
                    console.log('[GAME] Initialization complete, proceeding with game start');
                    resolve();
                }
            }, 100);
        });
    }

    async init() {
        const logStep = (step, details = '') => {
            console.log(`[INIT] ${step}${details ? ': ' + details : ''}`);
        };

        try {
            logStep('Starting initialization', `mobile=${this.sceneManager.isMobile}`);

            // Start progressive asset loading for SEO performance. First-run-only;
            // not repeated on scene swaps.
            logStep('Loading critical assets');
            await this.gameAssetLoader.loadCriticalAssets();

            // Cycle 46 Phase 1: zen attract field as first paint. Skip the
            // heavy per-scene construction (sun billboard + buildSceneBody)
            // entirely and mount the cheap drifting-boid field instead; the
            // picker overlay (React) is already live on top. Picking a scene
            // routes through swapScene, which disposes the field and streams
            // the real scene in. The dev `[LOAD]` summary (logged inside
            // buildSceneBody) therefore does not fire at startup.
            if (this._bootAttract) {
                this._enterAttractMode();
                logStep('Boot entrance mode', 'scene build deferred to the Play commit');
            } else {
                // Per-scene construction. Cycle 11 Phase 1 extracted this body
                // into buildSceneBody so rebuildScene() can reuse it.
                await this.createSunBillboard(this.currentScene.sky?.preset ?? 'pastoral-noon');
                await buildSceneBody(this, (label, detail) => { logStep(label, detail); this._reportLoadStep(label); });

                // Set grass instance count for performance monitoring
                this.performanceMonitor.setGrassInstanceCount(this.terrainBuilder.getGrassInstanceCount());

                // Register per-system triangle estimates for the PERF overlay.
                this.registerSystemTriangleCounts();

                // Cycle 74 P1: prewarm the heavy WebGPU pipeline compile off the
                // blocking first render (covers the deep-link / boot-scene path).
                await this._prewarmShadersIfOptedIn(this.currentScene);
            }

            // First-run-only: setup persistent input listeners (mouse wheel).
            // Not repeated on scene swaps — the renderer canvas persists.
            logStep('Setting up controls');
            this.sceneManager.setupMouseControls();

            // Cycle 11 Phase 1: stress test harness. Always installed (small);
            // call from DevTools as `await window.__sdsStressTestSwaps(5)`.
            installStressTestHarness(this);

            // Cycle 10 Phase 3: cinematic capture infrastructure. First-run-only;
            // installCinemaApi() is itself idempotent (early-out on window.__sdsCinema).
            // Cycle 17 Phase 7: dynamic-import keeps the three.js-dependent
            // cinema surface out of main.js for non-cinematic users.
            if (isCinematicMode()) {
                const { installCinemaApi } = await import('./cinematic.js');
                installCinemaApi(this);
                const sunT = getRequestedSun();
                if (sunT != null && this.atmosphere?.setSun) {
                    this.atmosphere.setSun({ elevation: sunT * Math.PI * 0.5 });
                }
            }
            if (isUiHidden()) {
                const overlay = document.getElementById('react-overlay');
                if (overlay) overlay.style.display = 'none';
            }

            logStep('Initialization complete!');

        } catch (error) {
            console.error('[INIT] Fatal error during initialization:', error);
            throw error;
        }
    }

    // _buildSceneBody extracted to js/boot/initWorld.js#buildSceneBody.

    // -------- Scene lifecycle: in-process swap + teardown --------
    // swapScene and restartToMenu run in-process for solo / sandbox /
    // start-screen (dispose + rebuild against the persistent renderer);
    // multiplayer still hard-reloads because rooms lock the scene at creation.
    // disposeScene wires the AbortController teardown for scene-coupled window
    // listeners (the leak class flagged in cycle-10-plan.md) so swaps don't
    // leak; rebuildScene reconstructs the scene body via
    // initWorld.buildSceneBody.

    /**
     * Canonical scene-transition entry point.
     *
     * Solo / sandbox / start-screen: dispose + rebuild in-process against the
     * persistent renderer; URL updated via history.replaceState. Multiplayer
     * hard-reloads via location.href (rooms lock the scene at creation).
     *
     * @param {string} toId  Target scene id (e.g. 'field', 'rolling-hills').
     * @param {{ hash?: string, f?: boolean }} [opts]  hash: raw hash
     *   payload to preserve across an MP reload (no leading '#'), e.g.
     *   's/<encoded>' or '/r/<code>'. f bypasses the same-scene no-op
     *   for entrance Play, where a fresh run needs scene-owned HUD/survival state.
     * @returns {Promise<void>}  In-process branch resolves when the rebuild
     *   completes; the MP hard-reload branch returns a never-resolving Promise
     *   because the page is reloading. Callers fire-and-forget — do not await.
     */
    async swapScene(toId, opts = {}) {
        if (!toId) {
            console.warn('[SWAP] swapScene called with no toId; ignoring');
            return;
        }
        const fromId = this.currentScene?.id;
        if (fromId === toId && !opts.hash && !this._attractMode && !opts.f) {
            // Same-scene no-op (no opts.hash payload to honor). In attract mode
            // the scene def is loaded but its body was never built, so a pick
            // of the default scene must still fall through and build it.
            return;
        }

        // Cycle 11 Phase 1 Q1: solo + sandbox + start-screen-pre-game hit
        // the in-process path; multiplayer falls back to hard reload. RoomDO
        // doesn't broadcast scene-specific state mid-game, but rooms lock the
        // scene at creation, so guests don't initiate cross-scene swaps. The
        // gate keeps WS state intact for the rare edge case.
        const isMp = this.isMultiplayer || this.gameState?.gameMode === 'multiplayer';
        if (isMp) {
            console.log(`[SWAP] swapScene(${toId}) — MP client, falling back to hard reload`);
            location.href = this._buildSwapUrl(toId, opts);
            return new Promise(() => {});
        }

        // Cycle 46 Phase 2: out of the zen attract field, let the idle GLB
        // prefetch finish before building so the build reuses the warmed dog +
        // sheep + fence caches (models/fenceModels stages drop to ~0, no double
        // fetch). The field keeps drifting during this await — no black frame.
        if (this._attractMode && this._attractPrefetchPromise) {
            try { await this._attractPrefetchPromise; } catch {}
        }

        // Cycle 46 Phase 2 / Cycle 52 P1: when a reveal layer is armed it is kept
        // through teardown and dissolved over the streaming scene in-engine (no
        // DOM cover). This pre-build arm is the legacy path; the boot reveal
        // (Cycle 52 P2) arms its backdrop layer post-build instead. Inert unless a
        // reveal layer is present and the caller did not opt out (`noCrossfade`).
        const revealArmed = this._attractMode && !opts.noCrossfade && !!this._revealLayer;
        if (revealArmed) {
            this._keepRevealLayer = true;
            this._revealActive = true;
            this._revealT = 0;
            this._revealDur = 0.8;
            this._revealLayer.beginCrossfade();
            if (typeof window !== 'undefined') window.__sdsAttractCrossfadeActive = true;
        }

        console.log(`[SWAP] swapScene(${fromId} -> ${toId}) — in-process`);
        emitGameEvent('scene-swap-start');
        const t0 = performance.now();

        try {
            const newSceneDef = loadScene(toId);
            await this.disposeScene();
            // Layer survived teardown (above) for the dissolve; release the
            // guard now so any later dispose cleans up a lingering layer.
            this._keepRevealLayer = false;
            const swapBuildResult = await this.rebuildScene(newSceneDef);

            // Cycle 52 P2: the boot reveal arms its backdrop layer post-build
            // (the DOM loading surface covered the build; the in-engine dissolve
            // is the hand-off from that surface to the live scene). Held at full
            // opacity here; the UI calls beginRevealRamp() when it uncovers.
            if (opts.revealBackdrop) {
                await this._armRevealLayer(opts.revealBackdrop);
            }

            // Build done: stop suppressing the DOM overlay (the dissolve itself
            // runs in runFrame and needs no cover). `_revealActive` stays armed
            // so runFrame ramps the layer out, then disposes it.
            if (revealArmed && typeof window !== 'undefined') {
                window.__sdsAttractCrossfadeActive = false;
            }

            // Update the URL bar only on success. If rebuildScene threw, the
            // user's URL still reflects the original scene — they reload and
            // land on the working scene.
            history.replaceState(null, '', this._buildSwapUrl(toId, opts));

            const elapsed = Math.round(performance.now() - t0);
            console.log(`[SWAP] complete in ${elapsed}ms`);
            emitGameEvent('scene-swap-end');

            // Cycle 11 Phase 5: telemetry.
            try {
                import('./telemetry.js').then(({ emitEvent }) => {
                    emitEvent('scene_swapped', {
                        from: fromId || null,
                        to: toId,
                        elapsedMs: elapsed,
                        stages: swapBuildResult?.stages ?? null,
                    });
                });
            } catch {}
        } catch (err) {
            // Q2: option (a) — half-built scene is unrecoverable; throw the
            // document away. The catch path keeps URL intact (replaceState
            // never fired) so reload lands on the original scene.
            console.error('[SWAP] in-process swap failed; falling back to reload:', err);
            emitGameEvent('scene-swap-error');
            location.href = this._buildSwapUrl(toId, opts);
            return new Promise(() => {});
        }
    }

    /**
     * Build the URL for a scene swap, preserving any explicit hash payload.
     * Mirrors the pre-Cycle-10 URL-build logic in ScenePicker.switchScene,
     * handleStartSandbox, and ensureSceneMatchesRoom so all four callsites
     * produce byte-identical URLs to today's hard-reload paths.
     */
    _buildSwapUrl(toId, opts = {}) {
        const url = new URL(location.href);
        if (toId === DEFAULT_SCENE_ID) {
            url.searchParams.delete('scene');
        } else {
            url.searchParams.set('scene', toId);
        }
        if (opts.hash) {
            url.hash = opts.hash;
        }
        // No opts.hash: leave existing hash untouched (matches ScenePicker's
        // pre-Cycle-10 behaviour of not setting url.hash).
        return url.toString();
    }

    /**
     * Drain scene-coupled GPU + listener state. Cycle 11 Phase 1 fills out
     * the full ordering: events -> effects -> actors -> structures -> water
     * before atmosphere -> terrain -> atmosphere
     * -> sun billboard -> state drain -> renderer cache. Each disposer wraps
     * in try/catch with warn logs so a single subsystem failure doesn't
     * abort the rest of the teardown.
     */
    async disposeScene() {
        // Body extracted to js/boot/loadScene.js#disposeScene.
        await runDisposeScene(this);
    }

    /**
     * Cycle 11 Phase 1: in-process scene rebuild. Sets currentScene + game
     * state side-effects (mirroring the constructor lines 180-213), recreates
     * atmosphere + sun billboard (disposeScene tore them down), points
     * terrainBuilder at the new sceneDef, then runs buildSceneBody.
     *
     * Caller (swapScene) catches throws and falls back to location.href.
     * Sets `_sceneRebuilding = false` only on success — animate()'s
     * early-out remains armed if the rebuild errors.
     */
    async rebuildScene(sceneDef) {
        if (!sceneDef) throw new Error('rebuildScene called with null sceneDef');
        console.log(`[SWAP] rebuildScene(${sceneDef.id}) — building`);

        // 1. Currentscene side-effects (mirror constructor lines 180-213).
        this.currentScene = sceneDef;
        this.gameState.sceneId = sceneDef.id;
        if (typeof window !== 'undefined') window.__currentSceneId = sceneDef.id;
        // Cycle 26 v2.1.0: refresh per-scene SEO meta on swap.
        updateSceneMetadata(sceneDef.id);
        if (sceneDef.boundary) this.gameState.setBoundary(sceneDef.boundary);
        if (sceneDef.flocking) this.gameState.setFlockingOverride(sceneDef.flocking);
        if (sceneDef.corral) this.gameState.setCorral(sceneDef.corral);
        if (sceneDef.objective) this.gameState.setObjective(sceneDef.objective);
        if (sceneDef.sheepSpawn) this.gameState.setSheepSpawn(sceneDef.sheepSpawn);

        // 2. Recreate scene-coupled subsystems disposed in disposeScene().
        const initialPreset = sceneDef.sky?.preset ?? 'pastoral-noon';
        this.atmosphere = new Atmosphere(this.sceneManager.getScene(), {
            initialPreset,
            enableClouds: true,
            enableDayNight: !!sceneDef.dayNight?.enabled,
            sceneFog: sceneDef.fog ?? null,
        });
        this.atmosphere.bindAmbientLight(this.sceneManager.ambientLight);
        // Cycle 65: opt-in day/night sun arc when the scene declares it.
        if (sceneDef.dayNight?.enabled) {
            this.atmosphere.startDayNightCycle({
                secondsPerDay: sceneDef.dayNight.secondsPerDay,
                initialT: sceneDef.dayNight.initialT,
            });
        }

        await this.createSunBillboard(initialPreset);

        // 3. Repoint terrainBuilder at the new sceneDef. The instance persists
        //    so its GLB models cache (modelsLoaded) is preserved.
        this.terrainBuilder.setSceneDef(sceneDef);

        // 4. Run the same body init() uses on first run. Cycle 51 P6: forward
        //    each build-step mark to the scene-load progress signal so the
        //    pastoral loading bar fills from real per-stage cost (the world-first
        //    Play builds the armed scene through here).
        const sceneBuildResult = await buildSceneBody(this, (label, detail) => {
            console.log(`[BUILD] ${label}${detail ? ': ' + detail : ''}`);
            this._reportLoadStep(label);
        });

        // 5. Re-register triangle estimates for the new scene.
        this.performanceMonitor.setGrassInstanceCount(this.terrainBuilder.getGrassInstanceCount());
        this.registerSystemTriangleCounts();

        if (window.__sdsG?.productionWebGpu?.enabled) {
            const productionWebGpu = await import('./rendering/konveyorProductionWebGpuBoot.js');
            await productionWebGpu.recordKonveyorProductionWebGpuBoot(this, window.__sdsG.productionWebGpu);
        }

        // 5b. Cycle 74 P1: prewarm the heavy WebGPU pipeline compile off the
        //     blocking first render (covers the menu -> Play -> swapScene path).
        await this._prewarmShadersIfOptedIn(sceneDef);

        // 6. Re-apply cinematic sun if requested (lazy getters in __sdsCinema
        //    re-resolve atmosphere automatically; just need to honour ?sun=).
        if (isCinematicMode()) {
            const sunT = getRequestedSun();
            if (sunT != null && this.atmosphere?.setSun) {
                this.atmosphere.setSun({ elevation: sunT * Math.PI * 0.5 });
            }
        }

        this.lastTime = performance.now();
        this._sceneRebuilding = false;

        // Cycle 46 Phase 1: a real scene is now built — leave attract mode.
        // (disposeScene already tore down the zen field on the way in.)
        this._attractMode = false;
        if (typeof window !== 'undefined') window.__sdsAttractActive = false;

        // Cycle 45 Phase 1: hand the per-stage load breakdown back to swapScene
        // so it rides the scene_swapped telemetry payload.
        return sceneBuildResult;
    }

    /**
     * Cycle 74 P1: prewarm the heavy WebGPU pipeline compile off the blocking
     * first render. The Cycle 72 spike proved newsheepdogland's ~83-95s cold
     * WGSL->DXIL compile TDR-crashes the tab when it lands lazily on the first
     * renderAsync; routing it through renderer.compileAsync (Dawn's async
     * pipeline creation) keeps the GPU-process watchdog from firing and surfaces
     * the cost under the loading bar. Opt-in per scene via SceneDef.prewarmShaders
     * so the live WebGPU scenes are untouched; WebGPU-only (WebGL compiles are
     * cheap and lazy is fine there, so the explicit fallback stays byte-identical);
     * try/caught so a failure falls through to the status-quo lazy compile. Called
     * from both build paths (init() first build + rebuildScene swap).
     * See docs/cycle-74-plan.md.
     */
    async _prewarmShadersIfOptedIn(sceneDef) {
        if (!sceneDef?.prewarmShaders) return;
        const renderer = this.sceneManager?.getRenderer?.();
        if (!renderer?.isWebGPURenderer || typeof renderer.compileAsync !== 'function') return;
        await this.sceneManager.whenRendererReady?.();
        this._reportLoadStep('Optimizing shaders');
        try {
            const prewarmStart = performance.now();
            await renderer.compileAsync(
                this.sceneManager.getScene(),
                this.sceneManager.getCamera(),
            );
            const compileAsyncMs = Math.round(performance.now() - prewarmStart);
            console.log(`[PREWARM] compileAsync ${sceneDef.id} ${compileAsyncMs}ms`);
            if (typeof window !== 'undefined') {
                window.__sdsPrewarm = { scene: sceneDef.id, compileAsyncMs, ok: true };
            }
        } catch (err) {
            console.warn('[PREWARM] compileAsync failed; lazy compile fallback:', err?.message || err);
            if (typeof window !== 'undefined') {
                window.__sdsPrewarm = { scene: sceneDef.id, ok: false, error: String(err?.message || err) };
            }
        }
    }

    async createSunBillboard(initialPreset) {
        const { SunBillboard } = await import('./effects/SunBillboard.js');
        this._sunBillboard = new SunBillboard(this.sceneManager.getScene());
        probeLog('sunBillboard.created', { initialPreset });
    }

    /**
     * Cycle 46 Phase 1 / Cycle 51 P7: enter boot-entrance mode. On a plain open
     * the heavy per-scene build is deferred; the world-first React entrance
     * (js/components/entrance/) covers the canvas and the armed scene streams in
     * on the Play commit. Arms attract mode (runFrame drives only the orbit
     * camera + atmosphere, no game logic) and idle-prefetches the
     * scene-independent GLB caches so the first build streams faster. Cycle 51
     * retired the drifting-dart attract field that used to fill the canvas here;
     * the opaque entrance makes it redundant.
     */
    _enterAttractMode() {
        this._attractMode = true;
        if (typeof window !== 'undefined') window.__sdsAttractActive = true;
        this.menuController.updateCinematicCamera?.();

        // Cycle 46 Phase 2: warm the scene-independent GLB caches while the
        // field idles so the first pick streams faster (acceptance: post-pick
        // stream below the Phase-1 baseline).
        this._prefetchSceneAssets();
    }

    /**
     * Cycle 46 Phase 2: while the zen field idles, prefetch the GLB caches the
     * first scene build needs regardless of which scene is picked — the dog
     * rigs + sheep (TerrainBuilder) and the fence kit (StructureBuilder). Both
     * loadModels() are idempotent (a `modelsLoaded` guard), so the post-pick
     * build reuses the warmed caches instead of re-fetching. swapScene awaits
     * this promise before building, so an early pick pays the load once (no
     * double fetch) and a patient pick pays nothing.
     *
     * Idle-scheduled and best-effort: a failed warm-up just means the build
     * loads normally. One-shot via the stored promise.
     */
    _prefetchSceneAssets() {
        if (this._attractPrefetchPromise) return;
        const run = () => Promise.allSettled([
            this.terrainBuilder?.loadModels?.(),
            this.structureBuilder?.loadModels?.(),
        ]);
        this._attractPrefetchPromise = new Promise((resolve) => {
            const kick = () => { run().then(resolve, resolve); };
            if (typeof window !== 'undefined' && window.requestIdleCallback) {
                window.requestIdleCallback(kick, { timeout: 2500 });
            } else {
                setTimeout(kick, 300);
            }
        });
    }

    /**
     * Cycle 46 Phase 2 / Cycle 52 P1: finish the in-engine dissolve — clear the
     * reveal flags and dispose the reveal layer. Idempotent; safe if the layer
     * was already torn down by a second swap that interrupted the dissolve.
     */
    _endReveal() {
        this._revealActive = false;
        if (typeof window !== 'undefined') {
            window.__sdsAttractCrossfadeActive = false;
            window.__sdsRevealArmed = false;
        }
        try { this._revealLayer?.dispose(); } catch {}
        this._revealLayer = null;
    }

    /**
     * Cycle 52 P2: arm the in-engine backdrop reveal. Loads the armed world's
     * entrance backdrop (the same webp the menu showed), builds a fullscreen
     * BackdropReveal quad over the freshly built scene at full opacity, and
     * holds it. The dissolve does not start here: beginRevealRamp() (called the
     * moment the DOM loading surface hands off) starts the ramp, so the whole
     * dissolve is visible rather than running behind the cover.
     *
     * No silent fallback: if the backdrop fails to load, log loudly and leave
     * the layer unarmed so the scene shows instantly via the UI's hand-off,
     * never a blank in-engine cover that masks the failure.
     *
     * @param {string} url backdrop image URL (assets/scenes/entrance/<id>.webp).
     */
    async _armRevealLayer(url) {
        if (typeof window === 'undefined' || !url) return;
        let texture;
        try {
            texture = await new THREE.TextureLoader().loadAsync(url);
        } catch (err) {
            console.error('[REVEAL] backdrop load failed; showing scene instantly:', url, err);
            return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        const layer = new BackdropReveal(this.sceneManager.getScene(), texture);
        layer.update(0, this.sceneManager.getCamera());
        this._revealLayer = layer;
        this._revealActive = false; // hold at full opacity until the UI hands off
        window.__sdsRevealArmed = true;
        window.__sdsAttractCrossfadeActive = true; // suppress the DOM swap cover
    }

    /**
     * Cycle 52 P2: start the in-engine dissolve. Called once the DOM loading
     * surface uncovers so the full ramp is visible. No-op if nothing is armed.
     */
    beginRevealRamp() {
        if (!this._revealLayer) return;
        this._revealActive = true;
        this._revealT = 0;
        if (typeof window !== 'undefined') window.__sdsRevealArmed = false;
    }

    /**
     * Cycle 52 P2: skip the dissolve (reduced-motion, or any caller that wants
     * an instant reveal). Disposes the armed layer immediately.
     */
    skipReveal() {
        this._endReveal();
    }

    /**
     * Cycle 51 P6: publish the current build-step label so the pastoral loading
     * surface can fill its bar from real per-stage progress. A bare event over
     * the existing GameBridge bus (the label rides a window global) keeps the
     * stage -> friendly-label + weight table on the UI side, out of the main
     * chunk. No-op outside the browser.
     */
    _reportLoadStep(label) {
        if (typeof window === 'undefined') return;
        window.__sdsLoadStep = label;
        emitGameEvent('scene-load-step');
    }

    /**
     * Cycle 46 Phase 1: when boot mounted the zen attract field instead of a
     * scene, stream the current (default) scene in before gameplay starts so
     * startGame / startLocalGame / startSandboxGame run against a built world.
     * No-op once a real scene exists. Resolves when the scene is ready.
     */
    async _ensureSceneBuiltForStart() {
        if (!this._attractMode) return;
        // Starting a game (not returning to the menu backdrop): skip the dart
        // dissolve and ride the standard SceneSwapOverlay swap so the darts
        // don't float over the opening gameplay frame.
        await this.swapScene(this.currentScene?.id ?? DEFAULT_SCENE_ID, { noCrossfade: true });
    }

    /**
     * Cycle 57 P2: dispose + rebuild the current scene, yielding two frames
     * first so the SceneSwapOverlay cover paints before the synchronous build
     * seizes the main thread (otherwise the rebuild reads as a freeze). Shared
     * by restartToMenu and restartSameMode.
     */
    async _disposeAndRebuildCurrentScene() {
        const sceneDef = this.currentScene;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await this.disposeScene();
        await this.rebuildScene(sceneDef);
    }

    /**
     * Return to start screen on the current scene without changing scenes.
     * Single-player: in-process menu re-mount, no audio cut, no canvas flash.
     * Multiplayer: hard reload (rooms lock the scene at creation).
     */
    async restartToMenu() {
        // Cycle 11 Phase 1: in-process menu remount. Same-scene dispose +
        // rebuild keeps audio context, renderer, and React root alive — no
        // canvas flash, no audio cut. React's App listens for
        // 'scene-restart-to-menu' to swap StartScreen back in.
        const isMp = this.isMultiplayer || this.gameState?.gameMode === 'multiplayer';
        if (isMp) {
            console.log('[SWAP] restartToMenu — MP client, hard reload');
            window.location.reload();
            return new Promise(() => {});
        }

        console.log('[SWAP] restartToMenu() — in-process menu remount');
        // Cycle 57 P2: the completion overlay lives in its own <body> root the
        // React StartScreen remount can't reach; tear it down here so the menu
        // doesn't open under a stale overlay.
        disposeCompletionOverlay();
        emitGameEvent('scene-swap-start');

        try {
            await this._disposeAndRebuildCurrentScene();

            // Cycle 85: the rebuild above re-mounts survival gameplay surfaces
            // for the backdrop scene, but we are returning to the StartScreen.
            // Tear them back down so the menu is inert; entrance Play forces a
            // rebuild and re-mounts the run surfaces cleanly.
            this._wolfPack?.dispose?.();
            this._unmountDayNightChip?.();
            this._unmountMinimap?.();
            this._tickDayLoop = this.dayLoop = this._wolfPack = this._survivalRun =
                this._penContainment = this._unmountDayNightChip = this._unmountMinimap =
                this._updateMinimap = null;

            // Reset gameplay flags — but NOT gameMode/competitiveGates,
            // which the menu wants to remember for "Play Again" UX.
            if (this.gameState) {
                this.gameState.gameActive = false;
                this.gameState.gameCompleted = false;
                this.gameState.sheepRetired = 0;
            }

            emitGameEvent('scene-swap-end');
            emitGameEvent('scene-restart-to-menu');
        } catch (err) {
            console.error('[SWAP] restartToMenu failed; reloading:', err);
            emitGameEvent('scene-swap-error');
            window.location.reload();
            return new Promise(() => {});
        }
    }

    /**
     * Cycle 57 P3: "Play Again" — replay the same mode in place without a menu
     * round-trip. Disposes the completion overlay, rebuilds a fresh world (the
     * same dispose+rebuild the menu->Play flow relies on for a clean flock),
     * then starts the same mode. MP rooms lock the scene and sandbox config
     * isn't retained at the overlay, so both fall back to the menu.
     */
    async restartSameMode() {
        const isMp = this.isMultiplayer || this.gameState?.gameMode === 'multiplayer';
        if (isMp || this.gameMode === 'sandbox' || this.singlePlayerMode === 'sandbox') {
            return this.restartToMenu();
        }

        const spMode = this.singlePlayerMode || 'classic';
        // Cycle 59 (Counting Sheep): replay the counting curve under its own
        // mode, not 'solo'. spMode already carries the curve for counting.
        const replayMode = this.gameMode === COUNTING_GAME_MODE ? COUNTING_GAME_MODE : 'solo';
        console.log('[SWAP] restartSameMode() — replay', replayMode, spMode);
        disposeCompletionOverlay();
        emitGameEvent('scene-swap-start');

        try {
            await this._disposeAndRebuildCurrentScene();
            // Hold the cover through startGame so the dog + flock are in place
            // before it fades; no menu flash (we never emit scene-restart-to-menu).
            await this.startGame(replayMode, null, spMode);
            emitGameEvent('scene-swap-end');
        } catch (err) {
            console.error('[SWAP] restartSameMode failed; reloading:', err);
            emitGameEvent('scene-swap-error');
            window.location.reload();
            return new Promise(() => {});
        }
    }

    /**
     * Cycle 59 (Counting Sheep): the player explicitly banks the run. Counting
     * never auto-completes (checkCompletion is bypassed for round-based modes),
     * so this is the single end-of-run path: freeze the sim, stop the timer, and
     * show the counting summary which submits the counted total. Idempotent - a
     * second call (HUD button + pause-menu entry can both fire) is a no-op once
     * gameCompleted is set. Unpausing, when banked from the pause menu, is the
     * React caller's job (it calls handleResume first, like restart does).
     */
    bankCountingScore() {
        const gs = this.gameState;
        if (!gs || gs.gameMode !== COUNTING_GAME_MODE) return;
        if (!gs.gameActive || gs.gameCompleted) return;

        gs.gameCompleted = true;
        gs.gameActive = false;

        const counted = gs.sheepRetired || 0;
        const round = gs.countingState?.round ?? 0;
        const finalTime = this.gameTimer.stop();
        console.log(`[COUNTING] Banking run: counted=${counted}, round=${round}, time=${finalTime}`);

        this.showCompletionOverlay('counting', { counted, round, finalTime });
        this.mobileControls.disable();
    }

    /**
     * One-shot: ask each system for its triangle estimate and push it
     * into PerformanceMonitor. Called at the end of init; safe to call
     * again after a terrain/grass rebuild (values overwrite by name).
     * Display-only, so failures are swallowed.
     */
    registerSystemTriangleCounts() {
        try {
            const perf = this.performanceMonitor;
            const { Terrain, Trees, Rocks, Mountains } = this.terrainBuilder.getTriangleBreakdown();
            perf.addSystemTriangles('Terrain', Terrain);
            perf.addSystemTriangles('Trees', Trees);
            perf.addSystemTriangles('Rocks', Rocks);
            perf.addSystemTriangles('Mountains', Mountains);

            const grassSystem = this.terrainBuilder.grassSystem;
            if (grassSystem) {
                perf.addSystemTriangles(
                    'Grass',
                    grassSystem.getVisibleTriangleEstimate?.() ?? grassSystem.getTotalTriangleEstimate()
                );
            }

            perf.addSystemTriangles('Structures', this.structureBuilder.getTotalTriangleEstimate());

            const sheepSystem = this.gameState.optimizedSheepSystem;
            if (sheepSystem) {
                perf.addSystemTriangles('Sheep', sheepSystem.getTotalTriangleEstimate());
            }
            this.updatePerformanceVisibleCounts();
        } catch (error) {
            console.warn('[PERF] Failed to register system triangle counts:', error);
        }
    }

    applyQualityState(state = {}) {
        this._qualityState = { ...state };
        this.terrainBuilder?.applyQualityState?.(state);
        this.terrainBuilder?.grassSystem?.applyQualityState?.(state);
        this._animeWater?.setQualityState?.(state);
        this.gameState?.optimizedSheepSystem?.setAnimationRate?.(state.sheepAnimationRate);
    }

    getCycle38VisualProbe() {
        const grass = this.terrainBuilder?.grassSystem;
        const waterMaterial = this._animeWater?.material;
        const sheepSystem = this.gameState?.optimizedSheepSystem;
        const atmosphereFrame = this.atmosphere?.getFrame?.({ sunBillboard: this._sunBillboard }) ?? null;
        const treeImpostorRuntimeSamples = Array.isArray(this.terrainBuilder?.trees)
            ? this.terrainBuilder.trees
                .map((tree) => tree?.userData?.konveyorNativeTreeImpostor)
                .filter(Boolean)
                .slice(0, 12)
            : [];
        return {
            sceneId: this.currentScene?.id ?? window.__currentSceneId ?? 'unknown',
            renderer: window.__sdsRendererMode?.effective ?? null,
            qualityState: this.qualityGovernor?.getState?.() ?? this._qualityState ?? {},
            atmosphere: atmosphereFrame ? {
                presetName: atmosphereFrame.presetName,
                sunDirection: atmosphereFrame.sunDirection,
                sunPhysicalDirection: atmosphereFrame.sunPhysicalDirection,
                sunVisualDirection: atmosphereFrame.sunVisualDirection,
                sunColor: atmosphereFrame.sunColor,
                sunBillboard: atmosphereFrame.sunBillboard,
            } : null,
            terrain: this.terrainBuilder?.konveyorTerrainGeometryBudget ?? null,
            trees: {
                native: this.terrainBuilder?.konveyorNativeTreeInstancingSummary ?? null,
                impostorRuntime: this.terrainBuilder?.konveyorNativeTreeInstancingSummary?.impostor ?? null,
                impostorRuntimeSamples: treeImpostorRuntimeSamples,
                lodBias: this.terrainBuilder?.konveyorQualityState?.treeLodBias ?? 0,
                materialSummary: this.terrainBuilder?.konveyorTreeRockMaterialSummary ?? null,
                groundingSample: this.terrainBuilder?.konveyorTreeGroundingSample ?? [],
            },
            water: {
                present: !!this._animeWater?.mesh,
                worldSpaceHeightfield: waterMaterial?.userData?.konveyorWaterWorldSpaceHeightfield === true,
                sunCameraGlint: waterMaterial?.userData?.konveyorWaterSunCameraGlint === true,
                glintMode: waterMaterial?.userData?.konveyorWaterGlintMode ?? null,
                glintGain: waterMaterial?.userData?.konveyorWaterGlintGain ?? null,
                sunColorSource: waterMaterial?.userData?.konveyorWaterSunColorSource ?? null,
                sunColor: waterMaterial?.userData?.konveyorWaterNodeUniforms?.sunColor?.value?.toArray?.()
                    ?? waterMaterial?.uniforms?.uSunColor?.value?.toArray?.()
                    ?? null,
                sparkleScale: this._animeWater?.qualitySparkleScale ?? 1,
            },
            grass: {
                present: !!grass,
                interactorCount: grass?.interactorCount ?? 0,
                maxInteractors: grass?.config?.maxInteractors ?? 0,
                interactorSample: grass?.getInteractorSample?.(8) ?? [],
                qualityDistanceScale: grass?.qualityDistanceScale ?? 1,
                qualityDensityScale: grass?.qualityDensityScale ?? 1,
                materialSummary: grass?.konveyorGrassBladeMaterialSummary ?? null,
                interactorContract: grass?.grassMaterial?.userData?.konveyorGrassBladeInteractors ?? null,
            },
            sheep: {
                count: sheepSystem?.sheepCount ?? 0,
                animationRate: sheepSystem?.animationUpdateRate ?? 1,
                materialSummary: sheepSystem?.konveyorSheepMaterialSummary ?? null,
                animationContract: sheepSystem?.material?.userData?.konveyorSheepAnimation ?? null,
                woolContract: sheepSystem?.material?.userData?.konveyorSheepWool ?? null,
            },
            dog: {
                present: !!this.sheepdog?.mesh,
                position: this.sheepdog?.mesh?.position
                    ? {
                        x: +this.sheepdog.mesh.position.x.toFixed(3),
                        y: +this.sheepdog.mesh.position.y.toFixed(3),
                        z: +this.sheepdog.mesh.position.z.toFixed(3),
                    }
                    : null,
                velocity: this.sheepdog?.velocity
                    ? {
                        x: +this.sheepdog.velocity.x.toFixed(3),
                        z: +this.sheepdog.velocity.z.toFixed(3),
                    }
                    : null,
                rotation: Number.isFinite(this.sheepdog?.currentRotation)
                    ? +this.sheepdog.currentRotation.toFixed(3)
                    : null,
            },
        };
    }

    updatePerformanceVisibleCounts() {
        try {
            const tb = this.terrainBuilder;
            const gs = tb.grassSystem?.getStats?.() ?? {};
            const visibleBreakdown = tb.getVisibleTriangleBreakdown?.(this.sceneManager?.camera) ?? null;
            const isolation = this._perfSystemIsolation ?? 'full';
            const systemVisible = (system) => isolation === 'full' || isolation === `${system}-only`;
            if (visibleBreakdown) {
                this.performanceMonitor?.addSystemTriangles?.('Terrain', systemVisible('terrain') ? visibleBreakdown.Terrain : 0);
                this.performanceMonitor?.addSystemTriangles?.('Trees', systemVisible('trees') ? visibleBreakdown.Trees : 0);
                this.performanceMonitor?.addSystemTriangles?.('Rocks', systemVisible('rocks') ? visibleBreakdown.Rocks : 0);
                this.performanceMonitor?.addSystemTriangles?.('Mountains', systemVisible('mountains') ? visibleBreakdown.Mountains : 0);
            }
            if (tb.grassSystem?.getVisibleTriangleEstimate) {
                this.performanceMonitor?.addSystemTriangles?.('Grass', systemVisible('grass') ? tb.grassSystem.getVisibleTriangleEstimate() : 0);
            }
            const sheepSystem = this.gameState.optimizedSheepSystem;
            const sheepVisible = systemVisible('sheep') && sheepSystem?.instancedMesh?.visible !== false;
            const sheepTriangles = sheepVisible ? (sheepSystem?.getTotalTriangleEstimate?.() ?? 0) : 0;
            this.performanceMonitor?.addSystemTriangles?.('Sheep', sheepTriangles);
            // Flatten structures into reused scratch (replaces a fresh
            // Object.values().flat() + two .some()/.filter() arrays each frame).
            // Mirrors Array.flat() depth-1: array values spread, non-arrays pushed.
            const structureObjects = this._perfStructureScratch;
            structureObjects.length = 0;
            const structureMap = this.structureBuilder?.structures;
            if (structureMap) {
                for (const key in structureMap) {
                    if (!Object.prototype.hasOwnProperty.call(structureMap, key)) continue;
                    const val = structureMap[key];
                    if (Array.isArray(val)) {
                        for (let i = 0; i < val.length; i++) structureObjects.push(val[i]);
                    } else {
                        structureObjects.push(val);
                    }
                }
            }
            let structuresAnyVisible = false;
            let structures = 0;
            for (let i = 0; i < structureObjects.length; i++) {
                if (structureObjects[i]?.visible !== false) {
                    structuresAnyVisible = true;
                    structures++;
                }
            }
            const structuresVisible = systemVisible('structures') && structuresAnyVisible;
            this.performanceMonitor?.addSystemTriangles?.(
                'Structures',
                structuresVisible ? this.structureBuilder.getTotalTriangleEstimate() : 0
            );
            let terrain = 0;
            if (tb.terrainMesh && tb.terrainMesh.visible !== false) terrain++;
            if (tb.terrainSkirtMesh && tb.terrainSkirtMesh.visible !== false) terrain++;
            const treeGroups = Array.isArray(tb.trees)
                ? tb.trees.filter((obj) => obj?.visible !== false).length
                : (systemVisible('trees') ? (tb.konveyorNativeTreeInstancingSummary?.renderedInstanceMeshes ?? 0) : 0);
            const rockGroups = Array.isArray(tb.rocks)
                ? tb.rocks.filter((obj) => obj?.visible !== false).length
                : (systemVisible('rocks') ? (tb.konveyorNativeRockInstancingSummary?.renderedInstanceMeshes ?? 0) : 0);
            // `structures` counted above during the flatten pass.
            const grassChunks = systemVisible('grass') ? (gs.chunksVisible ?? 0) : 0;
            const water = this._animeWater?.mesh?.visible === false ? 0 : (this._animeWater?.mesh ? 1 : 0);
            const skyMesh = this.atmosphere?.sky?.getMesh?.();
            const cloudMesh = this.atmosphere?.cloudLayer?.getMesh?.();
            const sunMesh = this._sunBillboard?.mesh;
            let atmosphere = 0;
            if (skyMesh?.visible !== false) atmosphere++;
            if (cloudMesh?.visible !== false) atmosphere++;
            if (sunMesh?.visible !== false) atmosphere++;
            const sheep = sheepVisible ? (this.gameState.getSheep?.()?.length ?? 0) : 0;
            // Reuse the stats object; setVisibleCountsBySystem spreads into a new
            // object synchronously, so mutating our copy next frame is safe.
            const counts = this._perfVisibleCounts;
            counts.Terrain = terrain;
            counts.Trees = systemVisible('trees')
                ? (tb.treeInstances?.length ?? tb.konveyorNativeTreeInstancingSummary?.treeInstances ?? 0)
                : 0;
            counts.Rocks = systemVisible('rocks')
                ? (tb.konveyorRockPlacementPlan?.totalRocks ?? tb.konveyorNativeRockInstancingSummary?.rockInstances ?? 0)
                : 0;
            counts.Mountains = systemVisible('mountains') ? (tb.mountains?.filter?.((obj) => obj?.visible !== false).length ?? 0) : 0;
            counts.Grass = systemVisible('grass') ? (gs.visibleClumps ?? gs.totalClumps ?? 0) : 0;
            counts.Structures = structures;
            counts.Sheep = sheep;
            counts.Water = water;
            counts.Atmosphere = atmosphere;
            this.performanceMonitor?.setVisibleCountsBySystem?.(counts);
            this.performanceMonitor?.setEstimatedDrawCalls?.(
                terrain + treeGroups + rockGroups + grassChunks + structures + water + (sheep > 0 ? 1 : 0) + atmosphere
            );
        } catch {}
    }
    
    async startGame(mode = 'solo', roomData = null, singlePlayerMode = 'classic') {
        // Wait for initialization to complete (critical for iOS Safari)
        if (!this.isInitialized) {
            console.log('[GAME] Waiting for initialization to complete...');
            await this.waitForInitialization();
        }

        // Cycle 46 Phase 1: if still on the zen attract field, stream the
        // current scene in before gameplay runs against a built world.
        await this._ensureSceneBuiltForStart();

        console.log(`Starting game in ${mode} mode`, {
            roomCode: roomData?.roomCode || 'none',
            playerCount: roomData?.players?.length || 0,
            roomData: roomData,
            singlePlayerMode: singlePlayerMode
        });

        // Store mode for future reference
        this.gameMode = mode;
        this.roomData = roomData;
        this.isMultiplayer = mode === 'multiplayer';
        this.singlePlayerMode = singlePlayerMode;
        
        // Get the selected dog type from the start screen
        const selectedDogType = this.menuController.getSelectedDog();
        console.log(`Selected dog type: ${selectedDogType}`);

        // Dogs other than jep load on demand (Cycle 45 Phase 3). Ensure the
        // selected rig is in the registry before constructing the dog.
        await this.terrainBuilder.loadAnimal(selectedDogType);

        // In multiplayer, remote players may run any rig. Warm the rest in the
        // background so updateOtherPlayer finds them ready; the remote-dog path
        // guards on model presence until each arrives, so this stays off the
        // local dog's critical path.
        if (this.isMultiplayer) {
            void this.terrainBuilder.preloadAllDogs();
        }

        // Remove the old sheepdog and its indicator from scene if it exists
        if (this.sheepdog) {
            this.sheepdog.removeDistanceIndicator();
        }
        if (this.sheepdogMesh) {
            this.sceneManager.remove(this.sheepdogMesh);
        }

        // Create new sheepdog with selected type. Cycle 64: scenes may override
        // the spawn (Newsheepdogland's origin is water); pre-64 scenes omit it.
        const soloDogSpawn = this.currentScene?.dogSpawn ?? { x: 0, z: -30 };
        const sheepdog = new Sheepdog(soloDogSpawn.x, soloDogSpawn.z, selectedDogType, this.heightfield);
        this.sheepdog = sheepdog;
        this.sheepdogMesh = sheepdog.createMesh();
        this.gameState.setSheepdog(sheepdog);

        // Connect audio manager to new sheepdog
        sheepdog.setAudioManager(this.audioManager);

        // Set as local player and create distance indicator
        sheepdog.setAsLocalPlayer();

        // Add new sheepdog to scene when game starts
        this.sceneManager.add(this.sheepdogMesh);
        
        // Enable mobile controls if on touch device
        if (this.mobileControls.getIsTouchDevice()) {
            this.mobileControls.enable();
        }
        
        // Start the game state (this will set the correct sheep count)
        // For multiplayer games, we'll set the specific game mode (competitive/timed) later when we have the data
        this.gameState.startGame(mode, null, singlePlayerMode, { skipVisibleFlockReset: true });

        // Reset terrain builder to default bounds (in case switching from sandbox)
        if (this.terrainBuilder) {
            this.terrainBuilder.setDynamicBounds(
                this.gameState.bounds,
                this.gameState.pasture
            );
        }

        // Check if we need to recreate the sheep flock after the mode handoff
        if (this.gameState.needsFlockRecreation) {
            console.log('Recreating sheep flock for mode start');
            this.gameState.recreateSheepFlock(this.sceneManager.getScene());
            this.gameState.needsFlockRecreation = false; // Reset flag
            // Refresh sheep triangle estimate for the PERF overlay.
            this.registerSystemTriangleCounts();
        }

        // Store the intended game mode for later use
        if (roomData?.gameMode) {
            this.gameState.setGameMode(roomData.gameMode);
        }
        
        // Reset timer
        this.gameTimer.reset();
        
        // Start countdown timer for timed mode
        if (roomData?.gameMode === 'timed') {
            this.gameTimer.startCountdown(3 * 60 * 1000); // 3 minutes
            console.log('[TIMER] Started 3-minute countdown for timed mode');
            
            // UI updates for timed mode now handled by React components
            // Initialize best score display
            this.updateBestScoreDisplay();
        } else {
            // UI updates for other modes now handled by React components
        }
        
        // Reset competitive audio state
        this.endgameMusicPlaying = false;
        
        // Start appropriate gameplay music
        if (this.audioManager.isMusicReady()) {
            this.audioManager.playGameplayMusic();
        }

        // Optional local developer replay capture (?devClip=1 on localhost).
        this._startReplay();

        // Initialize multiplayer if needed
        if (mode === 'multiplayer' && roomData) {
            console.log(`Multiplayer room: ${roomData.roomCode || roomData.code || 'unknown'} with ${roomData.players?.length || 0} players`);
            // Enable 2x speeds for multiplayer
            this.sheepdog.setMultiplayerSpeeds(true);
            this.setupMultiplayer();
            
            // Configure UI for racing/timed mode if needed
            if (roomData.gameMode === 'racing' || roomData.gameMode === 'timed') {
                console.log(`Setting up ${roomData.gameMode} mode UI`);
                this.multiplayerState.setGameMode(roomData.gameMode, roomData.players?.length || 0);
                this.gameState.setGameMode(roomData.gameMode);
                this.gameState.setCurrentPlayerId(this.networkManager?.getPlayerId());
                
                // Set timer mode for timed games
                if (roomData.gameMode === 'timed') {
                    this.gameTimer.setCountdownMode(true, 180); // 3 minutes = 180 seconds
                    console.log('[TIMER] Timer set to countdown mode (3 minutes)');
                }
                
                // Set audio manager to competitive mode (also for timed)
                this.audioManager.setGameMode('competitive');
                const modeLabel = roomData.gameMode === 'timed' ? '[TIMED]' : '[RACING]';
                console.log(`${modeLabel} Audio manager set to competitive mode`);

                // Process initial game state if provided (contains competitive gates, etc.)
                if (roomData.initialGameState) {
                    console.log(`${modeLabel} Processing initial game state for ${roomData.gameMode} mode`);
                    this.handleMultiplayerGameState(roomData.initialGameState);
                }
            } else {
                this.audioManager.setGameMode('multiplayer');
                
                // Reset camera to default position for cooperative multiplayer
                this.sceneManager.resetCameraToDefault();
            }
            
            // Send dog type to server
            if (this.networkManager) {
                console.log(`Sending dog type to server: ${selectedDogType}`);
                this.networkManager.sendDogType(selectedDogType);
            }
        } else if (mode === 'multiplayer') {
            console.log('Multiplayer mode but no room data available');
            // Enable 2x speeds for multiplayer
            this.sheepdog.setMultiplayerSpeeds(true);
            this.setupMultiplayer();
            
            // Set audio to multiplayer mode
            this.audioManager.setGameMode('multiplayer');
            
            // Reset camera to default position (cooperative mode assumption)
            this.sceneManager.resetCameraToDefault();
            
            // Send dog type to server
            if (this.networkManager) {
                console.log(`Sending dog type to server: ${selectedDogType}`);
                this.networkManager.sendDogType(selectedDogType);
            }
        } else {
            // Hide multiplayer UI for solo mode
            this.multiplayerState.hide();
            this.audioManager.setGameMode('solo');

            // Reset camera to default position for solo mode
            this.sceneManager.resetCameraToDefault();
        }
    }

    /**
     * Start a sandbox game with custom configuration
     * @param {string} dogType - Selected dog type
     * @param {Object} sandboxConfig - SandboxConfig instance
     */
    async startSandboxGame(dogType, sandboxConfig) {
        // Wait for initialization to complete (critical for iOS Safari)
        if (!this.isInitialized) {
            console.log('[SANDBOX] Waiting for initialization to complete...');
            await this.waitForInitialization();
        }

        // Cycle 46 Phase 1: if still on the zen attract field, stream the
        // current scene in before the sandbox runs against a built world.
        await this._ensureSceneBuiltForStart();

        console.log('[SANDBOX] Starting sandbox game', {
            dogType,
            sheepCount: sandboxConfig.sheep?.count,
            fieldSize: sandboxConfig.field?.size,
            preset: sandboxConfig.preset,
            customFences: sandboxConfig.fences?.length || 0
        });

        // Store mode for future reference
        this.gameMode = 'sandbox';
        this.isMultiplayer = false;
        this.singlePlayerMode = 'sandbox';

        // Store sandbox config
        this.sandboxConfig = sandboxConfig;

        // Remove the old sheepdog and its indicator from scene if it exists
        if (this.sheepdog) {
            this.sheepdog.removeDistanceIndicator();
        }
        if (this.sheepdogMesh) {
            this.sceneManager.remove(this.sheepdogMesh);
        }

        // Get dog start position from config
        const dogStart = sandboxConfig.dog?.startPosition || { x: 0, z: -30 };

        // Ensure the selected rig is loaded (dogs other than jep load on
        // demand — Cycle 45 Phase 3).
        await this.terrainBuilder.loadAnimal(dogType);

        // Create new sheepdog with selected type at configured position
        const sheepdog = new Sheepdog(dogStart.x, dogStart.z, dogType, this.heightfield);
        this.sheepdog = sheepdog;
        this.sheepdogMesh = sheepdog.createMesh();
        this.gameState.setSheepdog(sheepdog);

        // Connect audio manager to new sheepdog
        sheepdog.setAudioManager(this.audioManager);

        // Set as local player and create distance indicator
        sheepdog.setAsLocalPlayer();

        // Add new sheepdog to scene when game starts
        this.sceneManager.add(this.sheepdogMesh);

        // Enable mobile controls if on touch device
        if (this.mobileControls.getIsTouchDevice()) {
            this.mobileControls.enable();
        }

        // Start sandbox game state (this applies all the config)
        this.gameState.startSandboxGame(sandboxConfig);

        // Cycle 8 Phase 4: skip rect-bounds/structure/terrain rebuild on
        // island scenes — the scene owns its heightfield, corral, fences (or
        // lack thereof), and pasture. The rest of the function still handles
        // sheep flock recreation + timer setup, which both apply.
        const islandScene = sandboxConfig.sceneId && sandboxConfig.sceneId !== 'field';

        if (!islandScene) {
            // Rebuild structures with sandbox configuration
            const bounds = this.gameState.bounds;
            const gate = this.gameState.gate;
            const pasture = this.gameState.pasture;
            const customFences = this.gameState.getCustomFences();
            const borderPoints = this.gameState.borderPoints;
            const fieldShape = this.gameState.fieldShape;

            console.log('[SANDBOX] Building structures with:', {
                bounds,
                fieldShape,
                borderPoints: borderPoints?.length || 0,
                gatePosition: gate.position,
                gateWidth: gate.width,
                pasture
            });

            // Clear and rebuild structures for sandbox
            this.structureBuilder.buildSandboxStructures(bounds, gate, pasture, customFences, borderPoints, fieldShape);

            // Update terrain builder with dynamic bounds AND rebuild trees/rocks
            // This ensures they respect the new field boundaries
            if (this.terrainBuilder) {
                await this.terrainBuilder.rebuildEnvironment(bounds, pasture);
            }
        } else {
            console.log(`[SANDBOX] Island scene ${sandboxConfig.sceneId}: scene owns terrain + structures, skipping sandbox rebuild`);
        }

        // Check if we need to recreate the sheep flock due to count change
        if (this.gameState.needsFlockRecreation) {
            console.log('[SANDBOX] Recreating sheep flock due to count change');
            this.gameState.recreateSheepFlock(this.sceneManager.getScene());
            this.gameState.needsFlockRecreation = false;
        }
        // Terrain, structures and sheep may have been rebuilt - refresh PERF overlay.
        this.registerSystemTriangleCounts();

        // Reset timer based on sandbox rules
        this.gameTimer.reset();
        const rules = sandboxConfig.rules;

        if (rules?.timerEnabled) {
            if (rules.timerMode === 'countdown') {
                this.gameTimer.startCountdown(rules.timeLimit * 1000);
                console.log(`[SANDBOX] Started ${rules.timeLimit}s countdown timer`);
            } else {
                this.gameTimer.start();
                console.log('[SANDBOX] Started count-up timer');
            }
        } else {
            // No timer - still track time but don't display prominently
            this.gameTimer.start();
            console.log('[SANDBOX] Timer running (hidden)');
        }

        // Hide multiplayer UI
        this.multiplayerState.hide();
        this.audioManager.setGameMode('solo');

        // Reset camera to default position
        this.sceneManager.resetCameraToDefault();

        // Mark start screen as inactive (same pattern as normal game start)
        this.menuController.isActive = false;
        this.menuController.gameStarted = true;

        // Fade out menu music and start gameplay music
        if (this.audioManager) {
            this.audioManager.fadeOutCurrentMusic(800);
            setTimeout(() => {
                if (this.audioManager.isMusicReady()) {
                    this.audioManager.playGameplayMusic();
                }
            }, 900);
        }

        // Optional local developer replay capture (?devClip=1 on localhost).
        this._startReplay();

        console.log('[SANDBOX] Game started successfully');
    }

    /**
     * Start a local 2-player game
     * @param {Object} localConfig - Configuration from LocalModeSetup
     */
    async startLocalGame(localConfig) {
        // Wait for initialization to complete
        if (!this.isInitialized) {
            console.log('[LOCAL] Waiting for initialization to complete...');
            await this.waitForInitialization();
        }

        // Cycle 46 Phase 1: if still on the zen attract field, stream the
        // current scene in before the 2-player game runs against a built world.
        await this._ensureSceneBuiltForStart();

        console.log('[LOCAL] Starting local 2-player game:', localConfig);

        // Cycle 17 Phase 7: load local-MP modules on demand. ~860 LoC kept
        // out of main.js for non-LocalMode users.
        const [
            { LocalMultiplayerManager },
            { LocalInputHandler },
            { TwoPlayerCamera },
        ] = await Promise.all([
            import('./LocalMultiplayerManager.js'),
            import('./LocalInputHandler.js'),
            import('./TwoPlayerCamera.js'),
        ]);

        // Store mode
        this.gameMode = 'local';
        this.isMultiplayer = false;
        this.isLocalMultiplayer = true;

        // Initialize local multiplayer manager
        this.localMultiplayerManager = new LocalMultiplayerManager();
        this.localMultiplayerManager.initialize(localConfig.mode, {
            player1Dog: localConfig.player1Dog,
            player2Dog: localConfig.player2Dog,
            totalSheep: 200
        });

        // Create local input handler
        this.localInputHandler = new LocalInputHandler();
        this.localInputHandler.onPauseToggle((isPaused) => {
            this.gameTimer.setPaused(isPaused);
            this.gameState.setPaused(isPaused);
        });

        // Remove old sheepdog if exists
        if (this.sheepdog) {
            this.sheepdog.removeDistanceIndicator();
        }
        if (this.sheepdogMesh) {
            this.sceneManager.remove(this.sheepdogMesh);
        }
        if (this.sheepdog2) {
            this.sheepdog2.removeDistanceIndicator();
        }
        if (this.sheepdogMesh2) {
            this.sceneManager.remove(this.sheepdogMesh2);
        }

        // Ensure both selected rigs are loaded (dogs other than jep load on
        // demand — Cycle 45 Phase 3).
        await this.terrainBuilder.loadAnimal(localConfig.player1Dog);
        await this.terrainBuilder.loadAnimal(localConfig.player2Dog);

        // Create Player 1 sheepdog (WASD)
        const p1StartX = localConfig.mode === 'versus' ? -30 : -15;
        this.sheepdog = new Sheepdog(p1StartX, -30, localConfig.player1Dog, this.heightfield);
        this.sheepdogMesh = this.sheepdog.createMesh();
        this.sheepdog.setAudioManager(this.audioManager);
        this.sheepdog.setPlayerInfo('player1', this.localMultiplayerManager.player1.color);
        this.sceneManager.add(this.sheepdogMesh);
        this.gameState.setSheepdog(this.sheepdog);
        this.gameState.setSheepdog2(null); // Clear any previous second dog

        // Create Player 2 sheepdog (Arrow Keys)
        const p2StartX = localConfig.mode === 'versus' ? 30 : 15;
        this.sheepdog2 = new Sheepdog(p2StartX, -30, localConfig.player2Dog, this.heightfield);
        this.sheepdogMesh2 = this.sheepdog2.createMesh();
        this.sheepdog2.setAudioManager(this.audioManager);
        this.sheepdog2.setPlayerInfo('player2', this.localMultiplayerManager.player2.color);
        this.sceneManager.add(this.sheepdogMesh2);
        this.gameState.setSheepdog2(this.sheepdog2); // Set second dog for sheep behavior

        // Set sheepdogs in manager
        this.localMultiplayerManager.setSheepdogs(this.sheepdog, this.sheepdog2);

        // Make player icons larger and more visible for local mode
        if (this.sheepdog.playerIcon) {
            this.sheepdog.playerIcon.scale.set(2.5, 2.5, 2.5);
            this.sheepdog.playerIcon.position.y = 3.5; // Higher above dog
            this.sheepdog.playerIcon.userData.originalY = 3.5;
        }
        if (this.sheepdog2.playerIcon) {
            this.sheepdog2.playerIcon.scale.set(2.5, 2.5, 2.5);
            this.sheepdog2.playerIcon.position.y = 3.5;
            this.sheepdog2.playerIcon.userData.originalY = 3.5;
        }

        // Initialize two-player camera
        this.twoPlayerCamera = new TwoPlayerCamera(this.sceneManager.getCamera());
        this.twoPlayerCamera.setImmediate(this.sheepdog.position, this.sheepdog2.position);

        // Start game state
        this.gameState.startGame('solo', null, 'classic');
        this.gameState.gameMode = 'local';

        // Build structures based on mode
        if (localConfig.mode === 'versus') {
            // Versus mode: two gates on opposite sides
            const versusGates = this.localMultiplayerManager.setupVersusGates(this.gameState.getBounds());
            this.structureBuilder.buildCompetitiveStructures(
                this.gameState.getBounds(),
                versusGates
            );
            console.log('[LOCAL] Built versus structures with 2 gates');
        } else {
            // Co-op and Timed: single gate at north (or corral for Cycle 5+ island scenes)
            this.structureBuilder.buildSinglePlayerStructures(
                this.gameState.getBounds(),
                this.gameState.getGate(),
                this.gameState.getPasture(),
                {
                    perimeterFence: this.currentScene.perimeterFence !== false,
                    corral: this.currentScene.corral || null
                }
            );
        }

        // Reset timer
        this.gameTimer.reset();
        if (localConfig.mode === 'timed') {
            this.gameTimer.startCountdown(3 * 60 * 1000); // 3 minutes
            console.log('[LOCAL] Started 3-minute countdown for timed mode');
        }

        // Set up score callbacks
        this.localMultiplayerManager.onScoreUpdate = (p1Score, p2Score) => {
            console.log(`[LOCAL] Scores - P1: ${p1Score}, P2: ${p2Score}`);
        };

        this.localMultiplayerManager.onGameComplete = (result) => {
            console.log('[LOCAL] Game complete!', result);
            this.showLocalCompletionOverlay(result);
        };

        // Hide multiplayer UI
        this.multiplayerState.hide();
        this.audioManager.setGameMode('solo');

        // Mark start screen as inactive
        this.menuController.isActive = false;
        this.menuController.gameStarted = true;

        // Start music
        if (this.audioManager) {
            this.audioManager.fadeOutCurrentMusic(800);
            setTimeout(() => {
                if (this.audioManager.isMusicReady()) {
                    this.audioManager.playGameplayMusic();
                }
            }, 900);
        }

        // Optional local developer replay capture (?devClip=1 on localhost).
        this._startReplay();

        console.log('[LOCAL] Game started successfully');
    }

    /**
     * Show completion overlay for local multiplayer
     */
    showLocalCompletionOverlay(result) {
        // Body extracted to js/boot/completionOverlay.js#showLocalCompletionOverlay.
        renderLocalCompletionOverlay(this, result);
    }

    setupMultiplayer() {
        // NetworkManager already available from constructor
        if (!this.networkManager) {
            console.error('NetworkManager not available');
            return;
        }
        
        // Show multiplayer UI
        this.multiplayerState.show();
        
        // Set up network event handlers
        installMpEventHandlers(this);
        
        // Initialize multiplayer UI with current room data
        if (this.roomData && this.roomData.players) {
            this.multiplayerState.updatePlayers(this.roomData.players, this.networkManager.getPlayerId());
        }
        
        console.log('Multiplayer mode initialized');
    }
    
    handleMultiplayerGameState(serverState) {
        // Body extracted to js/boot/initNetwork.js#handleMultiplayerGameState
        // (imported as `runMpStateHandoff` to avoid shadowing this method).
        runMpStateHandoff(this, serverState);
    }

    update(deltaTime) {
        // Skip update if not initialized yet
        if (!this.isInitialized) {
            return;
        }
        
        // Check if game is paused
        const isPaused = this.inputHandler.isPausedState();
        
        // Handle gamepad pause input
        if (this.inputHandler.getGamepadManager().isPausePressed()) {
            this.inputHandler.togglePause();
        }

        // Cycle 60 P4: in-game controller buttons. Y cycles the camera mode
        // (parity with the C key); X banks a Counting Sheep run from the pad.
        // bankCountingScore() guards its own mode/active/completed state.
        const gamepad = this.inputHandler.getGamepadManager();
        if (gamepad.wasJustPressed('Y') && !this.menuController.isMenuActive()) {
            this.sceneManager.getCameraController()?.cycleMode?.();
        }
        if (gamepad.wasJustPressed('X') && this.gameMode === COUNTING_GAME_MODE) {
            this.bankCountingScore();
        }
        // Cycle 60 P6: SELECT opens the opt-in playtest note box (no-op unless
        // the playtest toolkit is enabled via ?notes=1 / ?stats=1).
        if (gamepad.wasJustPressed('SELECT')) {
            window.dispatchEvent(new CustomEvent('sds-open-note'));
        }

        // Update start screen camera if active
        if (this.menuController.isMenuActive()) {
            this.menuController.updateCinematicCamera();
        } else if (this.isLocalMultiplayer && this.localInputHandler && !this.localInputHandler.isPausedState()) {
            // --- LOCAL 2-PLAYER MODE ---
            this.updateLocalMultiplayer(deltaTime);
        } else if (!isPaused) {
            // Handle gamepad zoom controls
            this.sceneManager.handleGamepadZoom();

            // Right-stick X drives Free-mode camera yaw at gamepadYawScale rad/s.
            const gp = this.inputHandler.getGamepadManager();
            if (gp && gp.isConnected()) {
                const rx = gp.getRightStickX();
                if (rx !== 0) {
                    this.cameraController.applyYawDelta(rx * this.cameraController.gamepadYawScale * deltaTime);
                }
            }

            // Handle input only when game is active and not paused
            let movementDirection = this.inputHandler.getMovementDirection();
            let wantsSprint = this.inputHandler.isSprinting();
            const sheepdog = this.gameState.getSheepdog();

            // Cycle 61 P3/P4: player bark command. Space + the mobile button feed
            // consumeBark(); gamepad RB is edge-polled like the Cycle 60 buttons.
            // triggerPlayerBark() is cooldown-gated (the single bark gate) and
            // returns true only when it actually fires. On a fired bark we drive
            // the deterministic sheep impulse locally for solo; multiplayer sends
            // the bark edge to the authoritative DO instead (P5 reads
            // _barkFiredThisFrame into the next playerInput payload).
            const barkPressed = this.inputHandler.consumeBark() || gamepad.wasJustPressed('RB');
            const barkFired = barkPressed && !!sheepdog && sheepdog.triggerPlayerBark();
            if (barkFired && !(this.isMultiplayer && this.networkManager)) {
                applyBarkImpulse(this.gameState.getSheep(), sheepdog.position,
                    sheepdog.getBarkForward(), DEFAULT_BARK_CONFIG);
            }
            // Cycle 66 P5: the bark also scares wolves - a radial repel with a
            // longer reach than the forward sheep cone, breaking their pursuit.
            // Client-only (survival is solo); it never touches the deterministic
            // sheep-cone math in shared/BarkImpulse.js, so sim-baselines stay
            // byte-identical.
            if (barkFired && this._wolfPack) {
                this._wolfPack.repel(sheepdog.position.x, sheepdog.position.z);
            }
            this._barkFiredThisFrame = barkFired;

            // Store original direction for debugging (reused object — only read
            // synchronously by the competitive-mode log below).
            const originalDirection = this._dbgOriginalDir;
            originalDirection.x = movementDirection.x;
            originalDirection.z = movementDirection.z;
            
            // Transform movement direction for competitive mode camera orientation
            movementDirection = this.sceneManager.transformMovementForCompetitive(movementDirection);
            const forcedDrive = this._perfDogDrive;
            if (forcedDrive?.active) {
                const x = Number(forcedDrive.direction?.x);
                const z = Number(forcedDrive.direction?.z);
                if (Number.isFinite(x) && Number.isFinite(z)) {
                    movementDirection = new Vector2D(x, z);
                    wantsSprint = forcedDrive.sprint !== false;
                }
            }
            
            // Debug log transformation in competitive mode
            if (this.sceneManager.competitiveCameraDirection && movementDirection.magnitude() > 0) {
                console.log(`[INPUT] Input transform: original(${originalDirection.x.toFixed(2)}, ${originalDirection.z.toFixed(2)}) -> transformed(${movementDirection.x.toFixed(2)}, ${movementDirection.z.toFixed(2)}) for ${this.sceneManager.competitiveCameraDirection} camera`);
            }
            
            // Update sheepdog's awareness of nearby sheep for barking
            sheepdog.updateNearSheepStatus(this.gameState.getSheep());
            
            // Handle input based on mode
            if (this.isMultiplayer && this.networkManager) {
                // --- MULTIPLAYER LOGIC WITH CLIENT-SIDE PREDICTION ---
                
                // Use server's authoritative sprint state for prediction when available
                const serverSprintState = this.getServerSprintState();
                const actualSprintState = serverSprintState !== null ? serverSprintState : wantsSprint;
                
                // 1. PREDICT: Run local simulation for our dog for instant feedback
                sheepdog.move(movementDirection, this.gameState.getBoundary(), deltaTime, actualSprintState);
                
                const isMovingNow = movementDirection.magnitude() > 0 || wantsSprint;

                // 2. SEND: Send input if moving now, OR if we just stopped moving.
                // Reuse a persistent payload (with persistent nested direction +
                // clientPosition). Safe: sendPlayerInput consumes it synchronously
                // (msgpack-encodes before returning), so mutating it next frame
                // can't alter an already-sent value. Same shape/values as before:
                // clientPosition is the position object only when stopping, else null.
                if (isMovingNow || this.playerWasMoving || this._barkFiredThisFrame) {
                    const payload = this._mpInputPayload;
                    payload.direction.x = movementDirection.x;
                    payload.direction.z = movementDirection.z;
                    payload.sprint = wantsSprint;
                    payload.timestamp = performance.now();
                    // Cycle 61 P5: carry the one-shot bark edge to the authoritative
                    // DO, which applies the impulse + broadcasts. A standing bark
                    // forces this send even when the dog is not moving.
                    payload.bark = this._barkFiredThisFrame;
                    // Send client position when stopping for server reconciliation
                    if (!isMovingNow && this.playerWasMoving) {
                        const cp = this._mpClientPos;
                        cp.x = sheepdog.position.x;
                        cp.z = sheepdog.position.z;
                        payload.clientPosition = cp;
                    } else {
                        payload.clientPosition = null;
                    }
                    this.networkManager.sendPlayerInput(payload);
                }
                
                // Update the state for the next frame
                this.playerWasMoving = isMovingNow;

                // 3. RECONCILE: Skip reconciliation only when server is interpolating to our position
                if (!this.serverIsInterpolatingToClient) {
                    this.reconcileWithServerState(deltaTime);
                }
                
                // In multiplayer, server controls sheep behavior
                // Client only handles rendering
            } else {
                // --- SINGLE-PLAYER LOGIC (Unchanged) ---
                sheepdog.move(movementDirection, this.gameState.getBoundary(), deltaTime, wantsSprint);
            }
            
            // Start timer on first actual movement
            if (movementDirection.magnitude() > 0 && !this.gameTimer.isRunning()) {
                this.gameTimer.start();
            }
            
            // Update camera to follow sheepdog (pass render deltaTime for
            // frame-rate-independent smoothing - see SceneManager.updateCamera).
            // Cycle 65: suspended while the skip-to-dusk cutscene re-aims it.
            if (!this._cutsceneActive) {
                this.sceneManager.updateCamera(sheepdog, deltaTime);
            }

            // Drive atmosphere (sky + clouds + day/night, when enabled).
            // Camera position is synced AFTER the camera update so the sky
            // dome rides above whatever pose the controller settled on.
            if (this.atmosphere) {
                this.atmosphere.syncCamera(this.sceneManager.getCamera().position);
                this.atmosphere.update(deltaTime);
            }

            // Cycle 65: drive the homestead day loop from the day/night clock
            // (gate open/close by phase + HUD). No-op on non-day-loop scenes.
            // Cycle 67 P6: solo only - in co-op the DO owns the day clock + run and
            // the client drives the HUD from the broadcast (initNetwork).
            if (!this.isMultiplayer) this._tickDayLoop?.(deltaTime);
        }

        // Update other players with interpolation for smooth movement
        if (this.isMultiplayer && !isPaused) {
            for (const remoteDog of this.otherPlayers.values()) {
                // When the server is interpolating toward this client's stop position,
                // blend over a fixed number of frames instead of reusing the normal
                // distance-proportional lerp (which can visually pop on a sudden stop).
                if (remoteDog._blendFramesRemaining && remoteDog._blendFramesRemaining > 0) {
                    const total = remoteDog._blendTotalFrames || 8;
                    const t = 1 - (remoteDog._blendFramesRemaining / total);
                    remoteDog.position.x = remoteDog._blendStartPos.x
                        + (remoteDog.targetPosition.x - remoteDog._blendStartPos.x) * t;
                    remoteDog.position.z = remoteDog._blendStartPos.z
                        + (remoteDog.targetPosition.z - remoteDog._blendStartPos.z) * t;
                    remoteDog._blendFramesRemaining--;
                } else {
                    const interpolationFactor = Math.min(this.interpolationSpeed * 2 * deltaTime, 1.0);

                    // Interpolate position
                    remoteDog.position.x += (remoteDog.targetPosition.x - remoteDog.position.x) * interpolationFactor;
                    remoteDog.position.z += (remoteDog.targetPosition.z - remoteDog.position.z) * interpolationFactor;
                }

                // Interpolate rotation
                let rotationDiff = remoteDog.targetRotation - remoteDog.currentRotation;
                while (rotationDiff > Math.PI) rotationDiff -= 2 * Math.PI;
                while (rotationDiff < -Math.PI) rotationDiff += 2 * Math.PI;
                remoteDog.currentRotation += rotationDiff * remoteDog.turnSpeed * deltaTime;

                // Update the 3D mesh with the interpolated values
                if (remoteDog.mesh) {
                    remoteDog.mesh.position.set(remoteDog.position.x, 0, remoteDog.position.z);
                    remoteDog.mesh.rotation.y = remoteDog.currentRotation;
                }

                // Tick the skeletal animation mixer and state machine so the
                // remote dog cycles idle/walk/run clips based on its velocity.
                // `animate()` alone only handles the player-icon overlay.
                if (remoteDog.targetVelocity) remoteDog.targetVelocity.set(0, 0);
                remoteDog.updateAnimationSystem(deltaTime);
                remoteDog.animate(deltaTime);
            }
        }

        // Update timer (respects pause state internally)
        // Skip for local multiplayer - handled in updateLocalMultiplayer
        if (!this.isLocalMultiplayer) {
            this.gameTimer.update();
        }

        // Update sheep behaviors (only if not paused)
        // In multiplayer mode, this handles visual behavior based on server state
        // Skip for local multiplayer - handled in updateLocalMultiplayer
        if (!isPaused && !this.isLocalMultiplayer) {
            this.gameState.updateSheepBehaviors(deltaTime);
            const updateSurvival = this.gameState.gameActive && !this.isMultiplayer;
            // Cycle 59 (Counting Sheep): once the active batch is fully penned,
            // bring the next batch online. Self-guards to a no-op for every
            // non-counting mode, so standard runs are untouched.
            this.gameState.advanceCountingRound();
            // Cycle 66 P2: client-side pen containment + pen-entry retirement.
            // Runs after the shared sheep sim has moved the flock (and after the
            // dog moved earlier this frame), before render. Day-loop scenes only;
            // a no-op everywhere else.
            // Cycle 67 P6: solo only. In co-op the DO runs the pen authoritatively
            // and the client renders the corrected sheep from the broadcast.
            if (updateSurvival && this._penContainment) {
                // Always pass the dog: it collides with the fence whether or not
                // the round is "active" (the fence is a physical barrier).
                this._penContainment.update(
                    this.gameState.sheep,
                    this.sheepdog ?? null,
                    this.dayLoop?.gateOpen ?? true,
                    deltaTime
                );
            }
            // Cycle 66 P4: tick the night wolves AFTER the sheep sim + pen
            // containment so they read final sheep positions and pen membership
            // (a wolf never kills a sheep the same frame it crossed the gate to
            // safety). Survival scenes only; a no-op everywhere else.
            // Cycle 67 P6: solo only. In co-op the DO runs the wolves and the
            // client renders them from the broadcast (initNetwork WolfRenderer).
            if (updateSurvival && this._wolfPack) {
                this._wolfPack.update(deltaTime, this.gameState.sheep, this.sheepdog ?? null);
            }
        }

        // Sheep velocity-based extrapolation (multiplayer only). After behaviors
        // have run, override active sheep positions with server_base + vx*elapsed
        // so late/dropped packets don't cause a backward snap or freeze. Runs
        // after updateSheepBehaviors so client-side flocking drift doesn't win.
        if (this.isMultiplayer && !isPaused) {
            const sheepList = this.gameState.getSheep();
            const sheepSystem = this.gameState.optimizedSheepSystem;
            if (sheepList && sheepSystem && typeof sheepSystem.forceUpdateSheepPositions === 'function') {
                const now = performance.now();
                const MAX_EXTRAP = 0.5; // seconds - cap to prevent runaway drift
                const THRESHOLD = 0.033; // seconds - ~1.5 frames at 20Hz server rate
                let anyExtrapolated = false;
                for (const sheep of sheepList) {
                    if (!sheep || sheep.isRetiring || sheep.state === 2) continue;
                    if (!sheep._netBaseTs) continue;
                    const elapsed = Math.min((now - sheep._netBaseTs) / 1000, MAX_EXTRAP);
                    if (elapsed > THRESHOLD) {
                        sheep.position.x = sheep._netBaseX + sheep._netVx * elapsed;
                        sheep.position.z = sheep._netBaseZ + sheep._netVz * elapsed;
                        anyExtrapolated = true;
                    }
                }
                if (anyExtrapolated) {
                    sheepSystem.forceUpdateSheepPositions();
                }
            }
        }
        
        // Update UI (only when game is active and not paused)
        if (!isPaused) {
            this.gameState.updateUI();
            
            // Stamina UI now handled by React components
        }
        
        // Check for game completion (only when game is active and not paused)
        // In multiplayer mode, rely on server completion events instead of client-side checking
        if (!isPaused && !this.isMultiplayer && !this.gameState.gameCompleted) {
            if (this.gameState.checkCompletion()) {
                console.log('[OK] Single player completion confirmed! Showing completion overlay...');
                const finalTime = this.gameTimer.stop();
                this.showCompletionOverlay('single', { finalTime });
                this.mobileControls.disable();
            }
        }
    }
    
    startFrameWatchdog() {
        if (this._frameWatchdogId != null) return;
        this._frameWatchdogId = window.setInterval(() => {
            const now = performance.now();
            if (now - (this._lastFrameTickAt ?? now) < 120) return;
            if (!this.gameState?.gameActive && !this._attractMode && !this._sceneRebuilding) return;

            const deltaTime = Math.min((now - this.lastTime) / 1000, 0.05);
            this.lastTime = now;
            this._lastFrameTickAt = now;
            const renderInFlight = this.sceneManager.renderStatus.inFlight;
            const frameResult = this.runFrame(deltaTime, { skipRender: renderInFlight });
            if (frameResult && typeof frameResult.catch === 'function') {
                frameResult.catch((err) => {
                    console.error('[RENDER] Watchdog frame step failed:', err);
                });
            }
        }, 50);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const currentTime = performance.now();
        const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.05);
        this.lastTime = currentTime;
        this._lastFrameTickAt = currentTime;

        const renderInFlight = this.sceneManager.renderStatus.inFlight;
        const frameResult = this.runFrame(deltaTime, { skipRender: renderInFlight });
        if (frameResult && typeof frameResult.catch === 'function') {
            frameResult.catch((err) => {
                console.error('[RENDER] Frame step failed:', err);
            });
        }
    }

    runFrame(deltaTime, options = {}) {
        // Cycle 11 Phase 1: hard early-out while disposeScene/rebuildScene is
        // mid-flight. Renderer + scene + camera persist across swaps, so a
        // single render keeps the canvas alive under the SceneSwapOverlay.
        // Game-logic update path is skipped — half-disposed references would
        // otherwise crash the rAF loop.
        if (this._sceneRebuilding) {
            // Cycle 46 Phase 2 / Cycle 52 P1: the legacy pre-build reveal HOLDS
            // the last menu frame (no render) through the build until the dissolve
            // below takes over. The boot reveal (Cycle 52 P2) arms its backdrop
            // layer post-build and does not suppress here; normal swaps render
            // under the SceneSwapOverlay as before.
            if (this._revealActive || options.skipRender) return false;
            try { return this.sceneManager?.render?.(); } catch {}
            return false;
        }

        // Cycle 46 Phase 2 / Cycle 52 P1: advance the in-engine reveal dissolve.
        // The real scene is built and renders via the normal path below; here we
        // ramp the still-mounted reveal layer's opacity to 0 over ~_revealDur,
        // then dispose it. The layer renders on top of the scene, so this is the
        // visible hand-off — an in-engine alpha crossfade, no DOM cover. A guarded
        // mode-dispatch block, not a change to the loop's shape.
        if (this._revealActive) {
            if (!this._revealLayer) {
                this._endReveal();
            } else {
                this._revealT += deltaTime;
                const dur = this._revealDur || 0.8;
                const t = Math.min(this._revealT / dur, 1);
                const eased = 1 - (1 - t) * (1 - t); // ease-out
                this._revealLayer.update(deltaTime, this.sceneManager.getCamera());
                this._revealLayer.setOpacity(1 - eased);
                if (t >= 1) this._endReveal();
            }
        }

        // Cycle 46 Phase 1 / Cycle 51 P7: boot attract mode. Before any scene is
        // built, drive only the orbit camera + atmosphere, then render. The
        // drifting-dart field was retired in Cycle 51 P7; the opaque entrance
        // covers the canvas, so this render just keeps it warm. Skips all
        // game-logic + grass/terrain updates — those subsystems don't exist until
        // the first Play streams a real scene in.
        if (this._attractMode) {
            try {
                this.menuController.updateCinematicCamera?.();
                if (this.atmosphere) {
                    this.atmosphere.syncCamera(this.sceneManager.getCamera().position);
                    this.atmosphere.update(deltaTime);
                }
                return options.skipRender ? false : this.sceneManager.render();
            } catch (err) {
                console.error('[ATTRACT] frame failed:', err);
                return false;
            }
        }

        // Check if game is paused
        const isPaused = this.inputHandler.isPausedState();
        
        // Update grass animation and LOD (only if not paused and initialized)
        if (!isPaused && this.isInitialized) {
            // Gather entities for grass interaction. The entity list and all
            // per-sheep/dog wrappers are reused across frames (hoisted scratch);
            // GrassSystem.updateInteractors copies every field into typed arrays
            // synchronously and retains no reference, so in-place reuse is safe.
            const interactionEntities = this._interactionEntities;
            interactionEntities.length = 0;

            // Add player sheepdog. `currentRotation` (yaw) feeds the
            // grass shader's oriented body footprint so the bend zone follows
            // the dog's facing direction, not a world-axis ellipse.
            if (this.sheepdog && this.sheepdog.mesh) {
                const playerSlot = this._grassPlayerSlot;
                playerSlot.position = this.sheepdog.mesh.position;
                playerSlot.currentRotation = this.sheepdog.currentRotation;
                interactionEntities.push(playerSlot);
            }

            // Add sheep visible in scene (much larger range)
            if (this.gameState && this.gameState.sheep) {
                const camera = this.sceneManager.getCamera();
                const cameraPos = camera?.position;
                if (cameraPos) {
                    const dogPos = this.sheepdog?.mesh?.position;
                    const sheepLimit = Math.max(0, (this.terrainBuilder?.grassSystem?.config?.maxInteractors ?? 10) - 1);
                    // Get active sheep within camera view range, then keep the
                    // nearest sheep to the dog so the bounded WebGPU uniform
                    // packet drives visible grass deformation around gameplay.
                    // Single manual pass into a pooled scratch (replaces
                    // filter().filter().sort().slice() — three throwaway arrays +
                    // a per-call comparator closure every frame over up to 5,000
                    // sheep). Selection stays byte-identical: same state/radius
                    // tests, same distance-to-dog ordering (V8 sort is stable, so
                    // the no-dog case keeps gather order exactly as a () => 0
                    // sort did), same nearest-`sheepLimit` slice.
                    const candidates = this._grassCandidates;
                    candidates.length = 0;
                    const sheep = this.gameState.sheep;
                    const camX = cameraPos.x;
                    const camZ = cameraPos.z;
                    const dogX = dogPos ? dogPos.x : 0;
                    const dogZ = dogPos ? dogPos.z : 0;
                    for (let i = 0; i < sheep.length; i++) {
                        const s = sheep[i];
                        if (!s || !s.position || s.state === 2) continue;
                        const dx = s.position.x - camX;
                        const dz = s.position.z - camZ;
                        if (dx * dx + dz * dz >= 90000) continue; // Within 300 units of camera
                        // Pooled {sheep, d2} slot; grow the pool only when this
                        // frame has more candidates than any prior frame.
                        let slot = this._grassCandidatePool[candidates.length];
                        if (!slot) {
                            slot = { sheep: null, d2: 0 };
                            this._grassCandidatePool[candidates.length] = slot;
                        }
                        slot.sheep = s;
                        if (dogPos) {
                            const adx = s.position.x - dogX;
                            const adz = s.position.z - dogZ;
                            slot.d2 = adx * adx + adz * adz;
                        } else {
                            slot.d2 = 0;
                        }
                        candidates.push(slot);
                    }
                    // Only sort when there's a dog to measure against; with no
                    // dog the old comparator returned 0 for every pair (no-op on
                    // a stable sort), so we preserve gather order by skipping it.
                    if (dogPos) candidates.sort(this._grassCandidateCmp);

                    const sheepCount = Math.min(candidates.length, sheepLimit);
                    for (let i = 0; i < sheepCount; i++) {
                        const cs = candidates[i].sheep;
                        // Pooled sheep wrapper with persistent nested {x,y,z}
                        // (preserves the y:0 ground flatten). Grow the pool lazily.
                        let slot = this._grassSheepSlotPool[i];
                        if (!slot) {
                            slot = { position: { x: 0, y: 0, z: 0 }, type: 'sheep', facingDirection: 0 };
                            this._grassSheepSlotPool[i] = slot;
                        }
                        slot.position.x = cs.position.x;
                        slot.position.z = cs.position.z;
                        // Sheep facingDirection is a scalar angle (radians)
                        // matching the convention in OptimizedSheep.
                        slot.facingDirection = cs.renderFacingDirection ?? cs.facingDirection ?? 0;
                        interactionEntities.push(slot);
                    }
                }
            }

            // Add other players' dogs in multiplayer (type: 'dog' for
            // elongated body footprint). Pooled per-remote-dog wrappers.
            if (this.otherPlayers) {
                let dogIdx = 0;
                for (const [playerId, remoteDog] of this.otherPlayers) {
                    if (remoteDog && remoteDog.mesh) {
                        let slot = this._grassDogSlotPool[dogIdx];
                        if (!slot) {
                            slot = { position: null, type: 'dog', currentRotation: 0 };
                            this._grassDogSlotPool[dogIdx] = slot;
                        }
                        slot.position = remoteDog.mesh.position;
                        slot.currentRotation = remoteDog.currentRotation;
                        interactionEntities.push(slot);
                        dogIdx++;
                    }
                }
            }

            // Update grass with full context
            const camera = this.sceneManager.getCamera();
            const playerPosition = this.sheepdog?.mesh?.position;

            if (this.terrainBuilder) {
                this.terrainBuilder.updateGrassAnimation(
                    deltaTime,
                    camera,
                    playerPosition,
                    interactionEntities
                );

                // Simple LOD system for other objects on mobile only
                if (this.sceneManager.isMobile && playerPosition) {
                    this.terrainBuilder.updateSimpleLOD(playerPosition);
                }
            }

        }

        // Update game logic with deltaTime (this updates sheepdog position).
        // Phase 3: cinema.paused short-circuits gameplay so static OG/portrait
        // shots aren't blurred by sheep motion.
        if (!window.__sdsCinema?.paused) {
            this.update(deltaTime);
        }

        // Update distance indicator for local player AFTER update so position is current
        if (this.sheepdog && this.sheepdog.isLocalPlayer) {
            const camera = this.sceneManager.getCamera();
            const playerPosition = this.sheepdog.mesh?.position;
            if (camera && playerPosition) {
                const cameraDistance = camera.position.distanceTo(playerPosition);
                this.sheepdog.updateDistanceIndicator(cameraDistance, deltaTime);
            }
        }

        // Update performance monitoring (always update for monitoring purposes)
        const renderer = this.sceneManager.getRenderer();
        this.updatePerformanceVisibleCounts();
        this.performanceMonitor.updateMetrics(this.gameState, renderer);
        this.qualityGovernor?.sample?.({
            frameTime: this.performanceMonitor.metrics.lastFrameTime,
            renderer,
            rendererMode: this.performanceMonitor.rendererMode,
            sceneId: this.currentScene?.id,
        });

        // Cycle 5+: animate water uniforms (uTime drives ripples + foam noise)
        const sunDir = this.atmosphere?.getSunDirection?.();
        const sunLightColor = this.atmosphere?.sun?.light?.color;
        if (this._animeWater) {
            this._animeWater.update(performance.now() * 0.001, sunDir, sunLightColor);
        }
        // Cycle 14 Phase 2: feed sun direction to grass for fake-SSS
        // back-light. Same source as water shader so they agree on time
        // of day every frame.
        if (sunDir) {
            this.terrainBuilder?.grassSystem?.setSunDirection?.(sunDir);
        }
        // Cycle 14 Phase 4: feed sun light color to rocks for rim-light
        // tinting. Tracks sunrise/sunset hue without per-rock state.
        // Cycle 17 follow-up: also tint tree-impostor cross-billboards
        // so distant trees follow time-of-day instead of staying frozen
        // at the bake's neutral lighting (Matt's gallery feedback).
        if (sunLightColor) {
            this.terrainBuilder?.setRockRimColor?.(sunLightColor);
            // Cycle 20 Phase 2: kiln impostors do per-fragment relighting,
            // so feed sunDir + ambient color too. The cross-billboard
            // fallback ignores extra args (signature back-compatible).
            // v2 (2026-05-04): also pass light intensities — kiln impostors
            // pre-multiply them in so brightness tracks LOD0's
            // `color * intensity` PBR magnitude across time-of-day presets.
            const ambientColor = this.atmosphere?.ambientLight?.color ?? null;
            const sunIntensity = this.atmosphere?.sun?.light?.intensity ?? 1;
            const ambientIntensity = this.atmosphere?.ambientLight?.intensity ?? 1;
            this.terrainBuilder?.setImpostorTint?.(
                sunLightColor, sunDir, ambientColor,
                sunIntensity, ambientIntensity,
            );
        }
        // Cycle 7 Phase 2e: keep sun disc aligned with the atmosphere's
        // sun direction + color, anchored at a fixed offset from the camera.
        if (this._sunBillboard && sunDir) {
            const sunColor = this.atmosphere?.sun?.light?.color;
            this._sunBillboard.update(this.sceneManager.getCamera(), sunDir, sunColor);
        }

        // Cycle 5+: corral lightning-zap pool / Cycle 6 portal
        if (this._corralZapPool) {
            this._corralZapPool.update(deltaTime);
        }
        if (this._portalEffect) {
            this._portalEffect.update(deltaTime);
        }

        // Render the scene (always render to show pause indicator)
        const renderResult = options.skipRender ? false : this.sceneManager.render();

        // Cycle 9 Phase 4: framebuffer samples to detect the "ground
        // rendered white" failure mode on Safari/Metal. Take two:
        //   - startScreen at frame 240 (~4s after boot, before user clicks
        //     into the game). Captures the start-screen background scene.
        //   - inGame after gameState becomes active and another ~4s have
        //     elapsed since the canvas first showed game-mode (so terrain,
        //     atmosphere, water, sun billboard are all bound).
        // The first run on real Safari (artifact 25023642777) showed the
        // bug doesn't manifest at boot — only after entering gameplay.
        if (isProbeEnabled()) {
            this._probeFrameCount = (this._probeFrameCount || 0) + 1;
            if (!this._probeFbSampledStart && this._probeFrameCount === 240) {
                this._probeFbSampledStart = true;
                try { captureFramebufferSample(this.sceneManager.renderer, 'startScreen'); } catch {}
            }
            if (!this._probeFbSampledInGame && this.gameState.gameActive) {
                this._probeInGameFrameCount = (this._probeInGameFrameCount || 0) + 1;
                if (this._probeInGameFrameCount === 240) {
                    this._probeFbSampledInGame = true;
                    try { captureFramebufferSample(this.sceneManager.renderer, 'inGame'); } catch {}
                }
            }
            // Drain any accumulated GL errors once per second so the diag
            // stream catches OUT_OF_MEMORY / INVALID_FRAMEBUFFER_OPERATION
            // that don't throw.
            if (this._probeFrameCount % 60 === 0) {
                try { drainGlErrors(this.sceneManager.renderer); } catch {}
            }
        }

        // Notify HUD subscribers (replaces setInterval polling in useGameState).
        emitGameEvent('frame');
        return renderResult;
    }
    
    // Legacy mobile UI organization removed - all mobile UI now handled by React components
    
    updateOtherPlayer(dogData) {
        const playerId = dogData.playerId;
        let remoteDog = this.otherPlayers.get(playerId);

        // 1. Create the Sheepdog instance if it's a new player
        if (!remoteDog) {
            // Use dog type from server data, or fall back to 'jep'.
            const dogType = dogData.dogType || 'jep';

            // Dogs other than jep load on demand (Cycle 45 Phase 3). startGame
            // warms every rig in the background for multiplayer, but if this
            // one isn't ready yet, kick a load and skip this update — the dog
            // constructs on the next server tick once the model arrives. A
            // per-player guard stops duplicate loads/dogs across the gap. This
            // is visual-only: the authoritative DO sim and the local predictor
            // never depend on a remote dog's mesh existing, so a rig arriving a
            // frame or two late cannot desync anything.
            if (!this.terrainBuilder.models.animals[dogType]) {
                if (!this._remoteDogLoading) this._remoteDogLoading = new Set();
                if (!this._remoteDogLoading.has(playerId)) {
                    this._remoteDogLoading.add(playerId);
                    this.terrainBuilder.loadAnimal(dogType).finally(() => {
                        this._remoteDogLoading.delete(playerId);
                    });
                }
                return;
            }

            console.log(`[DOG] Creating visualization for new player ${playerId}`);
            console.log(`Creating remote dog with type: ${dogType} for player ${playerId}`);
            remoteDog = new Sheepdog(dogData.x, dogData.z, dogType, this.heightfield);
            
            // Enable 2x speeds for multiplayer
            remoteDog.setMultiplayerSpeeds(true);
            
            // Create its 3D mesh and add it to the scene
            const dogMesh = remoteDog.createMesh();
            this.sceneManager.add(dogMesh);
            
                            // Add player icon for racing mode
                if (this.gameState.gameMode === 'racing' && this.gameState.competitiveGates) {
                const playerGate = this.gameState.competitiveGates.find(gate => gate.playerId === playerId);
                if (playerGate) {
                    remoteDog.setPlayerInfo(playerId, playerGate.color);
                    console.log(`[GAME] Added player icon for ${playerId} with gate color: 0x${playerGate.color.toString(16).toUpperCase()}`);
                }
            }
            
            // Add properties for interpolation
            remoteDog.targetPosition = new Vector2D(dogData.x, dogData.z);
            remoteDog.targetRotation = dogData.rotation;

            // Store the full Sheepdog object in our map
            this.otherPlayers.set(playerId, remoteDog);
        }
        
        // 2. Update the target state for interpolation from server data
        remoteDog.targetPosition.set(dogData.x, dogData.z);
        remoteDog.targetRotation = dogData.rotation;

        // When the server flags that it is catching up to the remote player's
        // stopped position, run a fixed 8-frame blend from where this client
        // currently shows the dog toward the authoritative stop point. If a
        // blend is already active, keep blending toward the latest target.
        if (dogData.interpolatingToClient) {
            const BLEND_FRAMES = 8;
            if (!remoteDog._blendFramesRemaining || remoteDog._blendFramesRemaining <= 0) {
                remoteDog._blendStartPos = {
                    x: remoteDog.position.x,
                    z: remoteDog.position.z
                };
                remoteDog._blendTotalFrames = BLEND_FRAMES;
                remoteDog._blendFramesRemaining = BLEND_FRAMES;
            }
            // Always keep targetPosition current (already updated above); the
            // per-frame blend pass will lerp toward it.
        } else if (remoteDog._blendFramesRemaining) {
            // Server resumed normal updates; drop any lingering blend state.
            remoteDog._blendFramesRemaining = 0;
        }

        // 3. Update animation-driving properties directly
        // This data will be used by remoteDog.animate() in the main loop
        remoteDog.velocity.set(dogData.vx, dogData.vz);
        remoteDog.isSprinting = dogData.sprinting;
        remoteDog.isMoving = remoteDog.velocity.magnitude() > 0.5;
    }
    
    getServerSprintState() {
        // Get the server's authoritative sprint state for prediction
        if (this.networkManager?.lastServerState?.sheepdogs) {
            const mySheepdogData = this.networkManager.lastServerState.sheepdogs.find(
                dog => dog.playerId === this.networkManager.getPlayerId()
            );
            return mySheepdogData?.sprinting ?? null;
        }
        return null;
    }
    
    reconcileWithServerState(deltaTime) {
        if (!this.sheepdog || !this.serverDogPosition) return;

        // Get the authoritative position from the server state
        const serverPos = this.serverDogPosition;
        const clientPos = this.sheepdog.position;

        if (serverPos.x === undefined) return;

        // Calculate distance between client prediction and server authority
        const distance = Math.sqrt(
            (clientPos.x - serverPos.x) ** 2 + 
            (clientPos.z - serverPos.z) ** 2
        );

        // Sprint-aware reconciliation to handle speed mismatches
        const serverSprintState = this.getServerSprintState();
        const clientSprintState = this.sheepdog.isSprinting;
        const sprintMismatch = serverSprintState !== null && serverSprintState !== clientSprintState;
        
        // Adjust threshold based on sprint state mismatch
        const reconciliationThreshold = sprintMismatch ? 0.2 : 0.05; // Higher threshold when sprint states differ
        
        if (distance > reconciliationThreshold) {
            // If the distance is very large (e.g., after major lag), snap to the server position
            if (distance > 8.0) { // Higher snap threshold to account for sprint speed differences
                clientPos.x = serverPos.x;
                clientPos.z = serverPos.z;
                console.log('[SYNC] Large correction applied - snapping to server position', { distance, sprintMismatch });
            } else {
                // Use adaptive interpolation speed based on distance and movement state
                const isMoving = this.sheepdog.velocity.magnitude() > 0.1;
                
                // Faster correction when stopped or when sprint states mismatch
                let baseInterpolationSpeed = isMoving ? this.interpolationSpeed : this.interpolationSpeed * 3;
                if (sprintMismatch) {
                    baseInterpolationSpeed *= 2; // Faster correction for sprint mismatches
                }
                
                // Scale interpolation speed by distance (closer = faster correction)
                const distanceScale = Math.min(distance / 2.0, 1.0);
                const adaptiveSpeed = baseInterpolationSpeed * (1 + distanceScale);
                
                const interpolationFactor = Math.min(adaptiveSpeed * deltaTime, 0.5); // Increased max factor
                clientPos.x += (serverPos.x - clientPos.x) * interpolationFactor;
                clientPos.z += (serverPos.z - clientPos.z) * interpolationFactor;
            }
            
            // Update mesh position to match corrected logical position
            this.sheepdog.mesh.position.x = clientPos.x;
            this.sheepdog.mesh.position.z = clientPos.z;
        }

        // Server is also authoritative on stamina
        if (this.networkManager.lastServerState?.sheepdogs) {
            const mySheepdogData = this.networkManager.lastServerState.sheepdogs.find(
                dog => dog.playerId === this.networkManager.getPlayerId()
            );
            if (mySheepdogData?.stamina !== undefined) {
                // Directly set stamina, as prediction for this is less critical than position
                this.sheepdog.stamina = mySheepdogData.stamina;
            }
            if (mySheepdogData?.sprinting !== undefined) {
                this.sheepdog.isSprinting = mySheepdogData.sprinting;
            }
        }
    }
    
    removeOtherPlayer(playerId) {
        const remoteDog = this.otherPlayers.get(playerId);
        if (remoteDog) {
            // Remove player icon if present
            remoteDog.removePlayerIcon();
            
            // Remove the dog's mesh from the scene
            if (remoteDog.mesh) {
                this.sceneManager.remove(remoteDog.mesh);
            }
            // Delete the player from our map
            this.otherPlayers.delete(playerId);
            console.log(`[DOG] Removed visualization for player ${playerId}`);
        }
    }
    
    checkRacingEndgameMusic(winCondition) {
        if (!winCondition || this.gameMode !== 'racing') return;
        
        let shouldPlayEndgameMusic = false;
        
        if (winCondition.type === 'race') {
            // 2-player race: play endgame music when someone is 80% to win threshold
            const endgameThreshold = winCondition.threshold * 0.8; // 80% of win threshold
            shouldPlayEndgameMusic = winCondition.maxScore >= endgameThreshold;
        } else if (winCondition.type === 'highest_score') {
            // 3-4 player mode: play endgame music when 90% of sheep are collected
            shouldPlayEndgameMusic = winCondition.progress >= 0.9;
        }
        
        if (shouldPlayEndgameMusic && !this.endgameMusicPlaying) {
            this.audioManager.playCompetitiveEndgameMusic();
            this.endgameMusicPlaying = true;
            console.log('[AUDIO] Competitive endgame music started');
        }
    }
    
    async createCompetitiveStructures(competitiveGates) {
        console.log('[BUILD] Creating competitive structures with gates:', competitiveGates);
        
        // Don't override the game mode - it's already set correctly (could be 'competitive' or 'timed')
        // this.gameState.setGameMode('competitive');
        
        // Build competitive structures using new modular system
        this.structureBuilder.buildCompetitiveStructures(
            this.gameState.getBounds(),
            competitiveGates
        );
        
        // Recreate trees to avoid competitive pastures
        // Extract pasture areas from competitive gates
        const competitivePastures = competitiveGates.map(gate => gate.pasture);
        console.log('[TERRAIN] Recreating trees to avoid competitive pastures:', competitivePastures);
        this.terrainBuilder.clearTrees();
        await this.terrainBuilder.createTrees(competitivePastures);

        // Cycle 6 Phase 2: rebuild the obstacle bundle now that the tree
        // set has changed (different positions in competitive mode).
        {
            const { buildSceneObstacles } = await import('../shared/SceneObstacles.js');
            const treeInstances = this.terrainBuilder.treeInstances || [];
            const rockPositions = this.terrainBuilder.rockPositions || [];
            const trees = treeInstances.map(t => ({ x: t.x, z: t.z, radiusXZ: t.radiusXZ }));
            const rocks = rockPositions
                .filter(r => r.isObstacle)
                .map(r => ({ x: r.x, z: r.z, radiusXZ: r.colliderRadius }));
            this.gameState.obstacles = buildSceneObstacles({ trees, rocks, buildings: [] });
        }

        // Apply player colors to gates based on current player
        const currentPlayerId = this.networkManager?.getPlayerId();
        if (currentPlayerId) {
            this.sceneManager.initializePlayerColors(competitiveGates, currentPlayerId);
        }
        
        // Add player icons to all sheepdogs (local and remote) for competitive mode
        this.addCompetitivePlayerIcons(competitiveGates);
        
        console.log(`[OK] Created ${competitiveGates.length} competitive gates and pastures`);
    }
    
    /**
     * Update loop for local 2-player mode
     */
    updateLocalMultiplayer(deltaTime) {
        if (!this.localMultiplayerManager || !this.localInputHandler) return;

        const sheepdog1 = this.sheepdog;
        const sheepdog2 = this.sheepdog2;

        if (!sheepdog1 || !sheepdog2) return;

        // Get input for both players
        const p1Direction = this.localInputHandler.getPlayer1Direction();
        const p1Sprint = this.localInputHandler.isPlayer1Sprinting();
        const p2Direction = this.localInputHandler.getPlayer2Direction();
        const p2Sprint = this.localInputHandler.isPlayer2Sprinting();

        const bounds = this.gameState.getBoundary();

        // Get camera distance for distance indicators
        const cameraDistance = this.twoPlayerCamera ? this.twoPlayerCamera.getDistance() : 80;

        // Update Player 1 sheepdog
        sheepdog1.updateNearSheepStatus(this.gameState.getSheep());
        sheepdog1.move(p1Direction, bounds, deltaTime, p1Sprint);
        sheepdog1.animate(deltaTime, cameraDistance); // Animate player icon with camera distance for scaling
        if (sheepdog1.isLocalPlayer) {
            sheepdog1.updateDistanceIndicator(cameraDistance, deltaTime, true);
        }

        // Update Player 2 sheepdog
        sheepdog2.updateNearSheepStatus(this.gameState.getSheep());
        sheepdog2.move(p2Direction, bounds, deltaTime, p2Sprint);
        sheepdog2.animate(deltaTime, cameraDistance); // Animate player icon with camera distance for scaling
        if (sheepdog2.isLocalPlayer) {
            sheepdog2.updateDistanceIndicator(cameraDistance, deltaTime, true);
        }

        // Update two-player camera
        if (this.twoPlayerCamera) {
            this.twoPlayerCamera.update(sheepdog1.position, sheepdog2.position, deltaTime);
        }

        // Update sheep behaviors - pass both dogs for combined scaring
        const sheepState = this.gameState.updateSheepBehaviors(deltaTime);

        // Make sheep react to both dogs
        const sheep = this.gameState.getSheep();
        for (const s of sheep) {
            // Check distance to both dogs and use the closer one for fleeing
            const dist1 = Math.sqrt(
                Math.pow(s.position.x - sheepdog1.position.x, 2) +
                Math.pow(s.position.z - sheepdog1.position.z, 2)
            );
            const dist2 = Math.sqrt(
                Math.pow(s.position.x - sheepdog2.position.x, 2) +
                Math.pow(s.position.z - sheepdog2.position.z, 2)
            );

            // Update the effective dog position for this sheep based on which is closer
            if (dist2 < dist1) {
                s.dogPosition = sheepdog2.position;
            } else {
                s.dogPosition = sheepdog1.position;
            }
        }

        // Handle scoring based on local game mode
        const localMode = this.localMultiplayerManager.localGameMode;

        if (localMode === 'coop') {
            // Co-op: shared gate, count sheep retired
            if (this.gameState.sheepRetired > 0) {
                const currentRetired = this.localMultiplayerManager.player1.score;
                const newlyRetired = this.gameState.sheepRetired - currentRetired;
                for (let i = 0; i < newlyRetired; i++) {
                    this.localMultiplayerManager.recordCoopSheepScored();
                }
            }
        } else if (localMode === 'versus') {
            // Versus: attribute retired sheep to the player whose gate they passed
            const sheep = this.gameState.optimizedSheepSystem?.sheep;
            const mgr = this.localMultiplayerManager;
            if (sheep && mgr.player1Gate && mgr.player2Gate) {
                if (!this._versusCountedSheep) this._versusCountedSheep = new Set();
                for (let i = 0; i < sheep.length; i++) {
                    const s = sheep[i];
                    if ((s.hasPassedGate || s.state === 2) && !this._versusCountedSheep.has(i)) {
                        this._versusCountedSheep.add(i);
                        // Attribute to player based on which pasture the sheep is in
                        const sx = s.position?.x ?? 0;
                        const p1pz = mgr.player1Gate.pasture;
                        const p2pz = mgr.player2Gate.pasture;
                        if (sx >= p1pz.minX && sx <= p1pz.maxX) {
                            mgr.recordSheepScored(mgr.player1.id);
                        } else if (sx >= p2pz.minX && sx <= p2pz.maxX) {
                            mgr.recordSheepScored(mgr.player2.id);
                        } else {
                            // Nearest gate wins the attribution
                            const d1 = Math.abs(sx - mgr.player1Gate.position.x);
                            const d2 = Math.abs(sx - mgr.player2Gate.position.x);
                            mgr.recordSheepScored(d1 <= d2 ? mgr.player1.id : mgr.player2.id);
                        }
                    }
                }
            }
        } else if (localMode === 'timed') {
            // Timed: check time remaining and shared scoring
            this.localMultiplayerManager.checkTimedModeEnd();

            // Update shared score from game state
            if (this.gameState.sheepRetired > 0) {
                const currentScore = this.localMultiplayerManager.player1.score + this.localMultiplayerManager.player2.score;
                const diff = this.gameState.sheepRetired - currentScore;
                if (diff > 0) {
                    // Split new sheep evenly between players for display
                    // (In reality timed mode just shows total)
                    this.localMultiplayerManager.player1.score = Math.floor(this.gameState.sheepRetired / 2);
                    this.localMultiplayerManager.player2.score = Math.ceil(this.gameState.sheepRetired / 2);
                }
            }
        }

        // Check for co-op completion
        if (localMode === 'coop' && this.gameState.sheepRetired >= this.gameState.totalSheep) {
            if (!this.localMultiplayerManager.gameCompleted) {
                this.localMultiplayerManager.completeGame('coop');
            }
        }

        // Update timer display
        this.gameTimer.update(deltaTime);
    }

    /**
     * Add colored player icons to all sheepdogs in competitive mode
     * @param {Array} competitiveGates - Array of competitive gate configurations
     */
    addCompetitivePlayerIcons(competitiveGates) {
        if (!competitiveGates || competitiveGates.length === 0) return;
        
        const currentPlayerId = this.networkManager?.getPlayerId();
        
        // Add icon for local player and set competitive camera position
        if (this.sheepdog && currentPlayerId) {
            const playerGate = competitiveGates.find(gate => gate.playerId === currentPlayerId);
            if (playerGate) {
                this.sheepdog.setPlayerInfo(currentPlayerId, playerGate.color);
                console.log(`[GAME] Added player icon for local player ${currentPlayerId} with gate color: 0x${playerGate.color.toString(16).toUpperCase()}`);
                
                // Set camera position based on player's assigned gate
                this.sceneManager.setCompetitiveCameraPosition(playerGate);
            }
        }
        
        // Add icons for all remote players
        for (const [playerId, remoteDog] of this.otherPlayers.entries()) {
            const playerGate = competitiveGates.find(gate => gate.playerId === playerId);
            if (playerGate && remoteDog) {
                remoteDog.setPlayerInfo(playerId, playerGate.color);
                console.log(`[GAME] Added player icon for remote player ${playerId} with gate color: 0x${playerGate.color.toString(16).toUpperCase()}`);
            }
        }
    }
    

    
    // Replay recording — bodies in js/utils/replay.js.
    _startReplay() { runStartReplay(this); }
    async _stopReplay() { return runStopReplay(this); }

    // Universal completion overlay that works for all game modes
    async showCompletionOverlay(mode, data = {}) {
        // Body extracted to js/boot/completionOverlay.js#showCompletionOverlay.
        await renderCompletionOverlay(this, mode, data);
    }
    
    // Score helpers — bodies live in js/utils/scoreStorage.js. The shims
    // preserve the method names that other modules + React components
    // call against `gameInstance` (formatTime, loadBestScore, etc.).
    formatTime(seconds) { return fmtTime(seconds); }
    loadBestScore() { return readBestScore(); }
    saveBestScore(score) { return writeBestScore(score); }
    saveTimedModeScore(score) { return writeTimedModeScore(score); }
    getBestScoreText() { return readBestScoreText(); }

    updateBestScoreDisplay() {
        // Best score display is handled by React components; this method is
        // preserved for backward compatibility.
        if (this.roomData?.gameMode !== 'timed') return;
        console.log('[GAME] Best score tracking active for timed mode - UI handled by React');
    }
}

// Start simulation when page loads
window.addEventListener('DOMContentLoaded', async () => {
    if (window.__sdsG?.r) {
        import('./diagnostics/webgpuDiagnostic.js')
            .then((m) => m.boot())
            .catch((err) => window.__sdsG.error = err?.message || err);
        return;
    }

    // Cycle 61 Phase 6: `?wolf=1` mounts the standalone wolf verification
    // harness (js/Wolf.js loader + animation state machine) and short-circuits
    // the normal game boot. The wolf is ASSET-ONLY this cycle. It is wired into
    // no game mode; this isolated harness is the only place it renders. Lazily
    // imported so it ships nothing to normal players. See docs/wolf-asset.md.
    if (new URLSearchParams(location.search).get('wolf') === '1') {
        import('./diagnostics/wolfHarness.js')
            .then((m) => m.mountWolfHarness())
            .catch((err) => console.error('[WOLF-HARNESS] mount failed:', err));
        return;
    }

    import('./utils/ScreenshotCapture.js')
        .catch((err) => console.warn('[SCREENSHOT] helper load failed:', err?.message || err));

    const urlParams = new URLSearchParams(location.search);
    let rendererOptions = {};
    let recordProductionWebGpuBoot = async () => {};
    if (window.__sdsG?.productionWebGpu) {
        const productionWebGpu = await import('./rendering/konveyorProductionWebGpuBoot.js');
        try {
            const preflight = await productionWebGpu.preflightKonveyorProductionWebGpuDevice(
                window.__sdsG.productionWebGpu,
            );
            if (!preflight.ok) {
                throw new Error(preflight.reason || 'webgpu-device-unavailable');
            }
            rendererOptions = await productionWebGpu.createKonveyorProductionWebGpuGameOptions(
                urlParams,
                window.__sdsG.productionWebGpu,
            );
            recordProductionWebGpuBoot = (gameInstance) => productionWebGpu.recordKonveyorProductionWebGpuBoot(
                gameInstance,
                window.__sdsG.productionWebGpu,
            );
        } catch (err) {
            window.__sdsG.productionWebGpu.ok = false;
            window.__sdsG.productionWebGpu.error = String(err?.message || err);
            window.__sdsG.productionWebGpu.enabled = false;
            window.__sdsRendererMode.productionWebGpu = false;
            window.__sdsRendererMode.effective = 'webgl';
            window.__sdsRendererMode.fallbackReason =
                window.__sdsG.productionWebGpu.fallbackReason || 'production-webgpu-boot-failed';
            rendererOptions = {};
        }
    }

    const gameInstance = new SheepDogSimulation(rendererOptions);
    // Cycle 46 Phase 1: in attract mode there is no scene body yet, so the
    // WebGPU-boot scene-body gates would record a misleading failure. Defer
    // the first accurate record to rebuildScene() on the first scene pick.
    if (!gameInstance._bootAttract) {
        await recordProductionWebGpuBoot(gameInstance);
    }
    emitRendererModeTelemetry(gameInstance);

    // Delegate menu/network flows from gameInstance to menuController for GameBridge
    gameInstance.startSoloGame = (dogType, singlePlayerMode = 'classic') => {
        gameInstance.menuController.selectSolo(dogType, singlePlayerMode);
    };

    // Note: startSandboxGame is already defined on the class, no need to override

    gameInstance.createRoom = async (playerName, settings, dogType) => {
        return await gameInstance.menuController.createRoom(playerName, settings, dogType);
    };

    gameInstance.joinRoom = async (roomCode, playerName, dogType) => {
        return await gameInstance.menuController.joinRoom(roomCode, playerName, dogType);
    };

    gameInstance.quickMatch = async (playerName, dogType) => {
        return await gameInstance.menuController.quickMatch(playerName, dogType);
    };

    gameInstance.leaveRoom = () => {
        gameInstance.menuController.leaveRoom();
    };

    gameInstance.startMultiplayerGame = () => {
        gameInstance.menuController.startMultiplayerGame();
    };

    gameInstance.selectDog = (dogType) => {
        gameInstance.menuController.selectDog(dogType);
    };

    gameInstance.getSelectedDog = () => {
        return gameInstance.menuController.getSelectedDog();
    };

    gameInstance.getCurrentRoom = () => {
        return gameInstance.menuController.getCurrentRoom();
    };

    gameInstance.isCurrentHost = () => {
        return gameInstance.menuController.isCurrentHost();
    };

    // GameBridge already initialized in constructor (setGameInstance called there).
});
