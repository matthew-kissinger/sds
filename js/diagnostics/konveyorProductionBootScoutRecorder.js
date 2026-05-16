export async function createProductionBootScoutOptions(urlParams) {
    const state = window.__sdsG?.productionBootScout;
    if (!state) return {};
    state.startedAt = new Date().toISOString();
    state.testNoCanvas = urlParams.get('testNoCanvas') === '1';
    state.sceneBodyRequested = urlParams.get('konveyorProductionSceneBody') === '1';
    state.nativeInstancingRequested = urlParams.get('konveyorNativeInstancing') === '1';
    state.sceneLoopRequested = urlParams.get('konveyorProductionLoopScout') === '1';
    state.rafLoopRequested = urlParams.get('konveyorProductionRafScout') === '1';
    state.gameplayStartRequested = urlParams.get('konveyorProductionGameplayScout') === '1';
    if (!state.testNoCanvas && !state.gameplayStartRequested) {
        state.ok = false;
        state.error = 'testNoCanvas-or-gameplay-scout-required';
        return { blocked: true };
    }
    if (state.gameplayStartRequested && !state.sceneBodyRequested) {
        state.ok = false;
        state.error = 'scene-body-required-for-gameplay-scout';
        return { blocked: true };
    }
    if ((state.sceneLoopRequested || state.rafLoopRequested) && !state.sceneBodyRequested) {
        state.ok = false;
        state.error = 'scene-body-required-for-loop-scout';
        return { blocked: true };
    }

    try {
        const { createKonveyorProductionWebGpuSceneManagerOptions } = await import('../rendering/konveyorProductionWebGpuBoot.js');
        const installFactoryGlobals = state.sceneBodyRequested || state.gameplayStartRequested;
        const sceneManagerOptions = await createKonveyorProductionWebGpuSceneManagerOptions(state, {
            installFactoryGlobals,
            sceneId: urlParams.get('scene'),
        });
        let beforeInit = null;
        if (state.gameplayStartRequested) {
            const { installKonveyorProductionWebGpuLightingBridge } = await import('../rendering/konveyorProductionWebGpuBoot.js');
            beforeInit = async (gameInstance) => {
                installKonveyorProductionWebGpuLightingBridge(gameInstance.sceneManager, state);
            };
        }
        return {
            sceneManagerOptions,
            beforeInit,
            sceneBodyRequested: state.sceneBodyRequested,
        };
    } catch (err) {
        state.ok = false;
        state.error = String(err?.message || err);
        return { blocked: true };
    }
}

async function recordProductionBootScout(gameInstance) {
    const state = window.__sdsG?.productionBootScout;
    if (!state || !gameInstance) return;
    const sceneManager = gameInstance.sceneManager;
    const rendererReady = await sceneManager.whenRendererReady?.();
    const renderer = sceneManager.getRenderer?.();
    const renderStatus = sceneManager.getRenderStatus?.() ?? null;
    Object.assign(state, {
        completedAt: new Date().toISOString(),
        diagnosticBoot: window.__sdsG?.r === true,
        rendererMode: window.__sdsRendererMode ?? null,
        rendererReady,
        rendererClassName: renderer?.constructor?.name ?? state.rendererClassName ?? null,
        rendererIsWebGpu: renderer?.isWebGPURenderer === true || renderer?.constructor?.name === 'WebGPURenderer',
        rendererSetup: sceneManager.rendererSetup ?? null,
        renderStatus,
        sceneManagerScene: sceneManager.getScene?.()?.isScene === true,
        sceneManagerCamera: sceneManager.getCamera?.()?.isPerspectiveCamera === true,
    });
    state.bootShellOk = state.rendererMode?.effective === 'webgpu-production-boot-scout'
        && state.diagnosticBoot === false
        && (state.testNoCanvas === true || state.gameplayStartRequested === true)
        && state.rendererReady === true
        && state.rendererIsWebGpu === true
        && state.rendererSetup?.rendererMode === 'non-webgl'
        && state.renderStatus?.mode === 'async'
        && state.renderStatus?.rendererReady === true
        && state.renderStatus?.rendererReadyError === null
        && state.sceneManagerScene === true
        && state.sceneManagerCamera === true;
    state.ok = state.bootShellOk === true && state.sceneBodyRequested !== true;
    if (!state.ok && state.sceneBodyRequested !== true) {
        state.error = 'production-boot-shell-gates-failed';
    }
}

async function recordProductionSceneBodyScout(gameInstance) {
    const state = window.__sdsG?.productionBootScout;
    if (!state?.sceneBodyRequested || !gameInstance) return;
    const sceneManager = gameInstance.sceneManager;
    state.sceneBody = {
        requested: true,
        ok: false,
        startedAt: new Date().toISOString(),
    };

    try {
        if (state.gameplayStartRequested) {
            await gameInstance.waitForInitialization();
        } else {
            const { installKonveyorProductionWebGpuLightingBridge } = await import('../rendering/konveyorProductionWebGpuBoot.js');
            installKonveyorProductionWebGpuLightingBridge(sceneManager, state);
            await gameInstance.init();
            gameInstance.isInitialized = true;
        }

        const scene = sceneManager.getScene?.();
        const suppressedWebglOnlyObjects = [];
        scene?.traverse?.((child) => {
            if (child?.isInstancedMesh2 === true) {
                suppressedWebglOnlyObjects.push({
                    name: child.name ?? '',
                    type: child.type ?? null,
                    childCount: child.children?.length ?? 0,
                });
                child.visible = false;
            }
        });

        const renderResult = state.gameplayStartRequested
            ? true
            : await sceneManager.render();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const renderer = sceneManager.getRenderer?.();
        const canvas = renderer?.domElement ?? null;
        const terrainBuilder = gameInstance.terrainBuilder;
        const grassSystem = terrainBuilder?.grassSystem ?? null;
        const sheepSystem = gameInstance.gameState?.optimizedSheepSystem ?? null;
        const renderStatus = sceneManager.getRenderStatus?.() ?? null;
        const terrainSummary = terrainBuilder?.konveyorTerrainMaterialSummary ?? null;
        const grassBladeSummary = grassSystem?.konveyorGrassBladeMaterialSummary
            ?? grassSystem?.grassMaterial?.userData?.konveyorGrassBladeMaterialSummary
            ?? null;
        const meadowSummary = grassSystem?.konveyorMeadowQuadMaterialSummary ?? null;
        const sheepSummary = sheepSystem?.konveyorSheepMaterialSummary
            ?? sheepSystem?.material?.userData?.konveyorSheepMaterialSummary
            ?? null;
        const nativeTreeInstancing = terrainBuilder?.konveyorNativeTreeInstancingSummary ?? null;
        const nativeRockInstancing = terrainBuilder?.konveyorNativeRockInstancingSummary ?? null;

        const checks = {
            bootShellOk: state.bootShellOk === true,
            factorySupply: state.factorySupply?.ok === true,
            lightingBridge: state.webGpuLightingBridge?.ok === true,
            initialized: gameInstance.isInitialized === true,
            rendererReady: renderStatus?.rendererReady === true
                && renderStatus?.rendererReadyError === null,
            asyncRender: renderStatus?.mode === 'async'
                && renderStatus?.inFlight === false
                && renderStatus?.lastError === null,
            renderSucceeded: renderResult !== false,
            canvasAttached: canvas?.isConnected === true
                && canvas?.dataset?.konveyorProductionBootScout === '1',
            scenePopulated: (scene?.children?.length ?? 0) >= 10,
            webglOnlyInstancedMesh2Suppressed: state.nativeInstancingRequested === true
                ? suppressedWebglOnlyObjects.length === 0
                : suppressedWebglOnlyObjects.every((entry) => entry.type === 'InstancedMesh2'),
            nativeTreeInstancing: state.nativeInstancingRequested !== true || nativeTreeInstancing?.ok === true,
            nativeRockInstancing: state.nativeInstancingRequested !== true || nativeRockInstancing?.ok === true,
            terrainFactoryApplied: terrainSummary?.applied === true,
            grassFactoryApplied: grassBladeSummary?.applied === true
                && (meadowSummary == null || meadowSummary?.applied === true),
            sheepFactoryApplied: sheepSummary?.applied === true,
        };

        state.sceneBody = {
            ...state.sceneBody,
            completedAt: new Date().toISOString(),
            sceneId: gameInstance.currentScene?.id ?? null,
            sceneName: gameInstance.currentScene?.name ?? null,
            renderStatus,
            renderResult,
            canvas: {
                width: canvas?.width ?? null,
                height: canvas?.height ?? null,
                clientWidth: canvas?.clientWidth ?? null,
                clientHeight: canvas?.clientHeight ?? null,
                dataset: canvas ? { ...canvas.dataset } : null,
            },
            scene: {
                childCount: scene?.children?.length ?? null,
                hasTerrain: !!terrainBuilder?.terrainMesh,
                hasGrassSystem: !!grassSystem,
                hasSheepSystem: !!sheepSystem,
                suppressedWebglOnlyObjects,
            },
            materials: {
                atmosphere: window.__sdsKonveyorAtmosphereMaterialAdapter ?? null,
                terrain: terrainSummary,
                grassBlade: grassBladeSummary,
                meadow: meadowSummary,
                sheep: sheepSummary,
                nativeTreeInstancing,
                nativeRockInstancing,
            },
            checks,
            ok: Object.values(checks).every(Boolean),
        };
        state.ok = state.bootShellOk === true
            && state.sceneBody.ok === true
            && state.sceneLoopRequested !== true
            && state.rafLoopRequested !== true
            && state.gameplayStartRequested !== true;
        if (!state.ok) {
            state.error = state.sceneLoopRequested === true
                || state.rafLoopRequested === true
                || state.gameplayStartRequested === true
                ? null
                : 'production-scene-body-gates-failed';
        }
    } catch (err) {
        state.error = String(err?.message || err);
        state.sceneBody = {
            ...state.sceneBody,
            completedAt: new Date().toISOString(),
            error: state.error,
            ok: false,
        };
        state.ok = false;
    }
}

async function recordProductionSceneLoopScout(gameInstance) {
    const state = window.__sdsG?.productionBootScout;
    if (!state?.sceneLoopRequested || !gameInstance) return;

    const sceneManager = gameInstance.sceneManager;
    const grassSystem = gameInstance.terrainBuilder?.grassSystem ?? null;
    const frameCount = 12;
    const deltaTime = 1 / 60;
    const startedAt = new Date().toISOString();
    const grassTimeStart = grassSystem?.time ?? null;
    const frameSamples = [];

    try {
        for (let i = 0; i < frameCount; i++) {
            const frameStart = performance.now();
            const renderResult = await gameInstance.runFrame(deltaTime);
            await new Promise(resolve => requestAnimationFrame(resolve));
            const renderStatus = sceneManager.getRenderStatus?.() ?? null;
            frameSamples.push({
                index: i,
                frameStep: 'SheepDogSimulation.runFrame',
                renderResult,
                renderStatus,
                elapsedMs: Number((performance.now() - frameStart).toFixed(2)),
            });
        }

        const renderStatus = sceneManager.getRenderStatus?.() ?? null;
        const grassTimeEnd = grassSystem?.time ?? null;
        const checks = {
            sceneBodyOk: state.sceneBody?.ok === true,
            asyncRender: renderStatus?.mode === 'async'
                && renderStatus?.inFlight === false
                && renderStatus?.lastError === null,
            framesRendered: frameSamples.length === frameCount
                && frameSamples.every((sample) => sample.renderResult !== false),
            grassAdvanced: grassTimeStart == null
                || (grassTimeEnd ?? grassTimeStart) > grassTimeStart,
            noFrameErrors: frameSamples.every((sample) => sample.renderStatus?.lastError === null),
            sharedFrameStep: frameSamples.every((sample) => sample.frameStep === 'SheepDogSimulation.runFrame'),
        };

        state.sceneLoop = {
            requested: true,
            startedAt,
            completedAt: new Date().toISOString(),
            frameCount,
            deltaTime,
            grassTimeStart,
            grassTimeEnd,
            performanceFrameCount: gameInstance.performanceMonitor?.frameCount ?? null,
            frameStep: 'SheepDogSimulation.runFrame',
            frameSamples,
            renderStatus,
            checks,
            ok: Object.values(checks).every(Boolean),
        };
        state.ok = state.bootShellOk === true
            && state.sceneBody?.ok === true
            && state.sceneLoop.ok === true
            && state.rafLoopRequested !== true;
        if (!state.ok) {
            state.error = state.rafLoopRequested === true
                ? null
                : 'production-scene-loop-gates-failed';
        }
    } catch (err) {
        state.error = String(err?.message || err);
        state.sceneLoop = {
            requested: true,
            startedAt,
            completedAt: new Date().toISOString(),
            error: state.error,
            ok: false,
        };
        state.ok = false;
    }
}

async function recordProductionRafLoopScout(gameInstance) {
    const state = window.__sdsG?.productionBootScout;
    if (!state?.rafLoopRequested || !gameInstance) return;

    const sceneManager = gameInstance.sceneManager;
    const grassSystem = gameInstance.terrainBuilder?.grassSystem ?? null;
    const frameCount = 12;
    const startedAt = new Date().toISOString();
    const grassTimeStart = grassSystem?.time ?? null;
    const frameSamples = [];
    let previousTimestamp = null;

    try {
        await new Promise((resolve, reject) => {
            const tick = async (timestamp) => {
                const index = frameSamples.length;
                const deltaTime = previousTimestamp == null
                    ? 1 / 60
                    : Math.min(0.1, Math.max(0, (timestamp - previousTimestamp) / 1000));
                previousTimestamp = timestamp;
                const frameStart = performance.now();

                try {
                    const renderResult = await gameInstance.runFrame(deltaTime);
                    const renderStatus = sceneManager.getRenderStatus?.() ?? null;
                    frameSamples.push({
                        index,
                        frameStep: 'SheepDogSimulation.runFrame',
                        scheduler: 'requestAnimationFrame',
                        timestampMs: Number(timestamp.toFixed(2)),
                        deltaTime: Number(deltaTime.toFixed(5)),
                        renderResult,
                        renderStatus,
                        elapsedMs: Number((performance.now() - frameStart).toFixed(2)),
                    });

                    if (frameSamples.length >= frameCount) {
                        resolve();
                        return;
                    }
                    requestAnimationFrame(tick);
                } catch (err) {
                    reject(err);
                }
            };
            requestAnimationFrame(tick);
        });

        const renderStatus = sceneManager.getRenderStatus?.() ?? null;
        const grassTimeEnd = grassSystem?.time ?? null;
        const checks = {
            sceneBodyOk: state.sceneBody?.ok === true,
            sceneLoopOk: state.sceneLoopRequested !== true || state.sceneLoop?.ok === true,
            asyncRender: renderStatus?.mode === 'async'
                && renderStatus?.inFlight === false
                && renderStatus?.lastError === null,
            framesRendered: frameSamples.length === frameCount
                && frameSamples.every((sample) => sample.renderResult !== false),
            grassAdvanced: grassTimeStart == null
                || (grassTimeEnd ?? grassTimeStart) > grassTimeStart,
            noFrameErrors: frameSamples.every((sample) => sample.renderStatus?.lastError === null),
            sharedFrameStep: frameSamples.every((sample) => sample.frameStep === 'SheepDogSimulation.runFrame'),
            rafScheduler: frameSamples.every((sample) => sample.scheduler === 'requestAnimationFrame'),
            monotonicTimestamps: frameSamples.every((sample, index) => (
                index === 0 || sample.timestampMs >= frameSamples[index - 1].timestampMs
            )),
        };

        state.sceneRafLoop = {
            requested: true,
            startedAt,
            completedAt: new Date().toISOString(),
            frameCount,
            grassTimeStart,
            grassTimeEnd,
            performanceFrameCount: gameInstance.performanceMonitor?.frameCount ?? null,
            frameStep: 'SheepDogSimulation.runFrame',
            scheduler: 'requestAnimationFrame',
            frameSamples,
            renderStatus,
            checks,
            ok: Object.values(checks).every(Boolean),
        };
        state.ok = state.bootShellOk === true
            && state.sceneBody?.ok === true
            && (state.sceneLoopRequested !== true || state.sceneLoop?.ok === true)
            && state.sceneRafLoop.ok === true;
        if (!state.ok) {
            state.error = 'production-raf-loop-gates-failed';
        }
    } catch (err) {
        state.error = String(err?.message || err);
        state.sceneRafLoop = {
            requested: true,
            startedAt,
            completedAt: new Date().toISOString(),
            error: state.error,
            ok: false,
        };
        state.ok = false;
    }
}

function waitForProductionScoutCondition(predicate, { timeoutMs = 10_000, label = 'condition' } = {}) {
    const startedAt = performance.now();
    return new Promise((resolve, reject) => {
        const tick = () => {
            try {
                if (predicate()) {
                    resolve(true);
                    return;
                }
            } catch (err) {
                reject(err);
                return;
            }
            if (performance.now() - startedAt >= timeoutMs) {
                reject(new Error(`timed out waiting for ${label}`));
                return;
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

async function recordProductionGameplayStartScout(gameInstance) {
    const state = window.__sdsG?.productionBootScout;
    if (!state?.gameplayStartRequested || !gameInstance) return;

    const sceneManager = gameInstance.sceneManager;
    const startedAt = new Date().toISOString();
    state.gameplayStart = {
        requested: true,
        startedAt,
        ok: false,
    };

    try {
        await gameInstance.waitForInitialization();
        await waitForProductionScoutCondition(() => (
            gameInstance.menuController?.hasGameStarted?.() === true
            && gameInstance.gameMode === 'solo'
            && gameInstance.sheepdogMesh?.isObject3D === true
            && (gameInstance.gameState?.getSheep?.()?.length ?? 0) > 0
        ), { timeoutMs: 12_000, label: 'production gameplay start' });

        const grassSystem = gameInstance.terrainBuilder?.grassSystem ?? null;
        const perfMon = gameInstance.performanceMonitor;
        const grassTimeStart = grassSystem?.time ?? null;
        const frameCountStart = perfMon?.frameCount ?? 0;
        const frameSampleTarget = 60;
        await waitForProductionScoutCondition(() => (
            (perfMon?.frameCount ?? 0) >= frameCountStart + frameSampleTarget
        ), { timeoutMs: 12_000, label: 'normal animation-loop frames' });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const renderer = sceneManager.getRenderer?.();
        const canvas = renderer?.domElement ?? null;
        const scene = sceneManager.getScene?.();
        const sheep = gameInstance.gameState?.getSheep?.() ?? [];
        const grassTimeEnd = grassSystem?.time ?? null;
        const frameCountEnd = perfMon?.frameCount ?? null;
        const frameTimeSamples = (perfMon?.frameTimeHistory ?? [])
            .slice(-frameSampleTarget)
            .map((value) => Number(value.toFixed(2)));
        const sortedFrameTimes = [...frameTimeSamples].sort((a, b) => a - b);
        const percentile = (p) => sortedFrameTimes.length === 0
            ? null
            : sortedFrameTimes[Math.min(sortedFrameTimes.length - 1, Math.floor((p / 100) * sortedFrameTimes.length))];
        const frameTimeSummary = {
            sampleCount: frameTimeSamples.length,
            avgMs: frameTimeSamples.length > 0
                ? Number((frameTimeSamples.reduce((sum, value) => sum + value, 0) / frameTimeSamples.length).toFixed(2))
                : null,
            p50Ms: percentile(50),
            p95Ms: percentile(95),
            p99Ms: percentile(99),
            maxMs: sortedFrameTimes.length > 0 ? sortedFrameTimes[sortedFrameTimes.length - 1] : null,
        };
        const renderStatus = sceneManager.getRenderStatus?.() ?? null;
        const checks = {
            bootShellOk: state.bootShellOk === true,
            sceneBodyOk: state.sceneBody?.ok === true,
            testNoCanvasDisabled: state.testNoCanvas === false,
            initialized: gameInstance.isInitialized === true,
            menuGameStarted: gameInstance.menuController?.hasGameStarted?.() === true,
            soloModeStarted: gameInstance.gameMode === 'solo'
                && gameInstance.singlePlayerMode === 'classic',
            sheepdogInScene: gameInstance.sheepdogMesh?.isObject3D === true
                && scene?.children?.includes?.(gameInstance.sheepdogMesh) === true,
            sheepFlockReady: sheep.length > 0,
            normalAnimationLoopAdvanced: typeof frameCountEnd === 'number'
                && frameCountEnd >= frameCountStart + frameSampleTarget,
            frameTimingSampled: frameTimeSummary.sampleCount >= Math.min(30, frameSampleTarget)
                && frameTimeSamples.every(Number.isFinite),
            grassAdvanced: grassTimeStart == null
                || (grassTimeEnd ?? grassTimeStart) > grassTimeStart,
            asyncRender: renderStatus?.mode === 'async'
                && renderStatus?.rendererReady === true
                && renderStatus?.rendererReadyError === null
                && renderStatus?.lastError === null,
            canvasAttached: canvas?.isConnected === true
                && canvas?.dataset?.konveyorProductionBootScout === '1',
            noInitError: state.error == null,
        };

        state.gameplayStart = {
            requested: true,
            startedAt,
            completedAt: new Date().toISOString(),
            scheduler: 'normal-animation-loop',
            autostart: new URLSearchParams(location.search).get('autostart') === '1',
            mode: gameInstance.gameMode ?? null,
            singlePlayerMode: gameInstance.singlePlayerMode ?? null,
            frameCountStart,
            frameCountEnd,
            frameSampleTarget,
            frameTimeSummary,
            frameTimeSamples,
            grassTimeStart,
            grassTimeEnd,
            sheepCount: sheep.length,
            renderStatus,
            checks,
            ok: Object.values(checks).every(Boolean),
        };
        state.ok = state.bootShellOk === true
            && state.sceneBody?.ok === true
            && state.gameplayStart.ok === true;
        if (!state.ok) {
            state.error = 'production-gameplay-start-gates-failed';
        }
    } catch (err) {
        state.error = String(err?.message || err);
        state.gameplayStart = {
            ...state.gameplayStart,
            completedAt: new Date().toISOString(),
            error: state.error,
            ok: false,
        };
        state.ok = false;
    }
}

export async function recordProductionBootScoutSequence(gameInstance) {
    await recordProductionBootScout(gameInstance);
    await recordProductionSceneBodyScout(gameInstance);
    await recordProductionSceneLoopScout(gameInstance);
    await recordProductionRafLoopScout(gameInstance);
    await recordProductionGameplayStartScout(gameInstance);
}
