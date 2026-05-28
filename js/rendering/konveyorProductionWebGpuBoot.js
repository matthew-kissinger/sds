import {
    createKonveyorNodeMaterialFactoryGlobals,
    createKonveyorNodeMaterialFactorySuite,
    summarizeKonveyorNodeMaterialFactorySuite,
} from '../konveyorNodeMaterialFactorySuite.js';
import {
    DEFAULT_SKY_FOG_SAMPLE_PRESET,
    createAtmosphereFrame,
} from '../atmosphere/skyFogSamplePacket.js';
import { DEFAULT_SCENE_ID, getSceneById } from '../../shared/scenes/index.js';

let cachedWebGpuModules = null;

function resolveWebGpuModuleUrl() {
    if (import.meta.env?.DEV && typeof location !== 'undefined') {
        return new URL('/assets/vendor/three/three.webgpu.min.js', location.origin).href;
    }
    const webGpuModulePath = './vendor/three/three.webgpu.min.js';
    return new URL(webGpuModulePath, import.meta.url).href;
}

async function loadKonveyorWebGpuThree() {
    if (cachedWebGpuModules) return cachedWebGpuModules;
    cachedWebGpuModules = await import(/* @vite-ignore */ resolveWebGpuModuleUrl());
    return cachedWebGpuModules;
}

function resolveSceneSkyFog(sceneId) {
    const sceneDef = getSceneById(sceneId) ?? getSceneById(DEFAULT_SCENE_ID);
    const presetName = sceneDef?.sky?.preset ?? DEFAULT_SKY_FOG_SAMPLE_PRESET;
    return createAtmosphereFrame({
        presetName,
        fogNear: sceneDef?.fog?.near ?? 18,
        fogFar: sceneDef?.fog?.far ?? 74,
    });
}

export async function preflightKonveyorProductionWebGpuDevice(state = null) {
    const gpu = navigator.gpu;
    const preflight = {
        ok: false,
        adapterAvailable: false,
        deviceAvailable: false,
        reason: null,
    };

    try {
        if (!gpu || typeof gpu.requestAdapter !== 'function') {
            preflight.reason = 'webgpu-unavailable';
            return preflight;
        }

        const adapter = await gpu.requestAdapter();
        preflight.adapterAvailable = !!adapter;
        if (!adapter || typeof adapter.requestDevice !== 'function') {
            preflight.reason = 'webgpu-adapter-unavailable';
            return preflight;
        }
        preflight.adapterFeatures = adapter.features ? Array.from(adapter.features).sort() : [];
        preflight.adapterInfo = adapter.info ? { ...adapter.info } : null;
        preflight.adapterLimits = adapter.limits ? {
            maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
            maxBindGroups: adapter.limits.maxBindGroups,
            maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
            maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
            maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
        } : null;

        const device = await adapter.requestDevice();
        preflight.deviceAvailable = !!device;
        if (!device) {
            preflight.reason = 'webgpu-device-unavailable';
            return preflight;
        }

        device.destroy?.();
        preflight.ok = true;
        return preflight;
    } catch (err) {
        preflight.reason = 'webgpu-device-request-failed';
        preflight.error = String(err?.message || err);
        return preflight;
    } finally {
        if (state) {
            state.devicePreflight = preflight;
            if (!preflight.ok) state.fallbackReason = preflight.reason;
        }
    }
}

function installKonveyorProductionFactoryGlobals(webGpuModules, {
    sceneId = DEFAULT_SCENE_ID,
    state = null,
} = {}) {
    const atmosphereFrame = resolveSceneSkyFog(sceneId);
    const factorySuite = createKonveyorNodeMaterialFactorySuite(webGpuModules, {
        atmosphereFrame,
        skyFog: atmosphereFrame,
    });
    const globals = createKonveyorNodeMaterialFactoryGlobals(factorySuite);
    for (const [name, value] of Object.entries(globals)) {
        window[name] = value;
    }
    const summary = summarizeKonveyorNodeMaterialFactorySuite(factorySuite);
    if (state) {
        state.factoryGlobalsInstalled = true;
        state.factorySupply = {
            ...summary,
            sceneId,
            skyFogPreset: atmosphereFrame.presetName,
            atmosphereFrame,
            ok: summary.groupCount === 8 && summary.factoryCount >= 18,
        };
    }
    return { globals, summary, skyFog: atmosphereFrame, atmosphereFrame };
}

export async function createKonveyorProductionWebGpuSceneManagerOptions(state = null, options = {}) {
    const webGpuModules = await loadKonveyorWebGpuThree();
    const { WebGPURenderer } = webGpuModules;
    if (state) {
        state.moduleLoaded = true;
        state.moduleSource = 'assets/vendor/three/three.webgpu.min.js';
    }
    if (options.installFactoryGlobals) {
        installKonveyorProductionFactoryGlobals(webGpuModules, {
            sceneId: options.sceneId,
            state,
        });
    }

    return {
        createRenderer({ isIOS }) {
            const renderer = new WebGPURenderer({
                antialias: !isIOS,
                alpha: false,
            });
            renderer.domElement.dataset.konveyorProductionWebGpu = '1';
            if (state) {
                state.rendererCreated = true;
                state.rendererClassName = renderer.constructor?.name ?? null;
            }
            return renderer;
        },
    };
}

export async function createKonveyorProductionWebGpuGameOptions(urlParams, state = null) {
    if (state) {
        state.startedAt = new Date().toISOString();
        state.sceneId = urlParams.get('scene') ?? DEFAULT_SCENE_ID;
    }

    const sceneManagerOptions = await createKonveyorProductionWebGpuSceneManagerOptions(state, {
        installFactoryGlobals: true,
        sceneId: urlParams.get('scene'),
    });
    if (state) {
        state.enabled = true;
        state.route = 'renderer-webgpu-konveyor-production';
    }

    return {
        sceneManagerOptions,
        beforeInit: async (gameInstance) => {
            installKonveyorProductionWebGpuLightingBridge(gameInstance.sceneManager, state);
        },
    };
}

export async function recordKonveyorProductionWebGpuBoot(gameInstance, state = null) {
    if (!state || !gameInstance) return;
    await gameInstance.waitForInitialization();
    const sceneManager = gameInstance.sceneManager;
    const rendererReady = await sceneManager.whenRendererReady?.();
    const renderer = sceneManager.getRenderer?.();
    const renderStatus = sceneManager.getRenderStatus?.() ?? null;
    const terrainBuilder = gameInstance.terrainBuilder ?? null;
    const grassSystem = terrainBuilder?.grassSystem ?? null;
    const sheepSystem = gameInstance.gameState?.optimizedSheepSystem ?? null;
    const atmosphereFrame = gameInstance.atmosphere?.getFrame?.({
        sunBillboard: gameInstance._sunBillboard,
    }) ?? state.factorySupply?.atmosphereFrame ?? null;
    const checks = {
        rendererMode: window.__sdsRendererMode?.effective === 'webgpu-production',
        rendererReady: rendererReady === true
            && renderStatus?.rendererReady === true
            && renderStatus?.rendererReadyError === null,
        rendererIsWebGpu: renderer?.isWebGPURenderer === true
            || renderer?.constructor?.name === 'WebGPURenderer',
        asyncRender: renderStatus?.mode === 'async'
            && renderStatus?.lastError === null,
        factorySupply: state.factorySupply?.ok === true,
        lightingBridge: state.webGpuLightingBridge?.ok === true,
        terrainFactoryApplied: terrainBuilder?.konveyorTerrainMaterialSummary?.applied === true,
        grassFactoryApplied: grassSystem?.konveyorGrassBladeMaterialSummary?.applied === true,
        sheepFactoryApplied: sheepSystem?.konveyorSheepMaterialSummary?.applied === true,
        nativeTreeInstancing: terrainBuilder?.konveyorNativeTreeInstancingSummary?.ok === true,
        nativeRockInstancing: terrainBuilder?.konveyorNativeRockInstancingSummary?.ok === true,
    };
    Object.assign(state, {
        completedAt: new Date().toISOString(),
        sceneId: gameInstance.currentScene?.id ?? state.sceneId ?? null,
        rendererClassName: renderer?.constructor?.name ?? state.rendererClassName ?? null,
        rendererIsWebGpu: checks.rendererIsWebGpu,
        renderStatus,
        currentSceneId: gameInstance.currentScene?.id ?? null,
        atmosphereFrame,
        atmosphereDiagnostics: {
            presetName: atmosphereFrame?.presetName ?? null,
            sunBillboard: atmosphereFrame?.sunBillboard ?? null,
            skyMaterialMode: atmosphereFrame?.sky?.materialMode ?? null,
            cloud: atmosphereFrame?.cloud ?? null,
            atmosphereDrawCount: atmosphereFrame?.atmosphereDrawCount ?? null,
        },
        sceneBody: {
            terrainFactory: terrainBuilder?.konveyorTerrainMaterialSummary ?? null,
            grassFactory: grassSystem?.konveyorGrassBladeMaterialSummary ?? null,
            meadowFactory: grassSystem?.konveyorMeadowQuadMaterialSummary ?? null,
            sheepFactory: sheepSystem?.konveyorSheepMaterialSummary ?? null,
            nativeTreeInstancing: terrainBuilder?.konveyorNativeTreeInstancingSummary ?? null,
            nativeRockInstancing: terrainBuilder?.konveyorNativeRockInstancingSummary ?? null,
        },
        checks,
        ok: Object.values(checks).every(Boolean),
    });
    state.error = state.ok ? null : 'production-webgpu-gates-failed';
}

export function installKonveyorProductionWebGpuLightingBridge(sceneManager, state = null) {
    const { AmbientLight, DirectionalLight } = cachedWebGpuModules ?? {};
    if (typeof AmbientLight !== 'function' || typeof DirectionalLight !== 'function') {
        if (state) {
            state.webGpuLightingBridge = {
                ok: false,
                reason: 'webgpu-light-constructors-unavailable',
            };
        }
        return null;
    }

    const ambient = new AmbientLight(0xffffff, 0.75 * Math.PI);
    const directional = new DirectionalLight(0xffffff, 1.1 * Math.PI);
    directional.position.set(1.5, 2.2, 3.0);
    sceneManager.getScene().add(ambient);
    sceneManager.getScene().add(directional);
    const proof = {
        source: 'production-webgpu-lighting-bridge',
        proofOnlyBridge: true,
        ambientAdded: sceneManager.getScene().children.includes(ambient),
        directionalAdded: sceneManager.getScene().children.includes(directional),
        ok: sceneManager.getScene().children.includes(ambient)
            && sceneManager.getScene().children.includes(directional),
    };
    if (state) state.webGpuLightingBridge = proof;

    return {
        dispose() {
            sceneManager.getScene().remove(ambient);
            sceneManager.getScene().remove(directional);
        },
        proof,
    };
}
