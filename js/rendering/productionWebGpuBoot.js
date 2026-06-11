// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import {
    createWebGpuNodeMaterialFactoryGlobals,
    createWebGpuNodeMaterialFactorySuite,
    summarizeWebGpuNodeMaterialFactorySuite,
} from '../webgpuNodeMaterialFactorySuite.js';
import {
    DEFAULT_SKY_FOG_SAMPLE_PRESET,
    createAtmosphereFrame,
} from '../atmosphere/skyFogSamplePacket.js';
import { DEFAULT_SCENE_ID, getSceneById } from '../../shared/scenes/index.js';
import { setWebGpuModules } from '../world/webgpuModules.js';

let cachedWebGpuModules = null;

function resolveWebGpuModuleUrl() {
    if (import.meta.env?.DEV && typeof location !== 'undefined') {
        return new URL('/assets/vendor/three/three.webgpu.min.js', location.origin).href;
    }
    const webGpuModulePath = './vendor/three/three.webgpu.min.js';
    return new URL(webGpuModulePath, import.meta.url).href;
}

async function loadWebGpuThree() {
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

export async function preflightProductionWebGpuDevice(state = null) {
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

function installWebGpuProductionFactoryGlobals(webGpuModules, {
    sceneId = DEFAULT_SCENE_ID,
    state = null,
} = {}) {
    const atmosphereFrame = resolveSceneSkyFog(sceneId);
    const factorySuite = createWebGpuNodeMaterialFactorySuite(webGpuModules, {
        atmosphereFrame,
        skyFog: atmosphereFrame,
    });
    const globals = createWebGpuNodeMaterialFactoryGlobals(factorySuite);
    for (const [name, value] of Object.entries(globals)) {
        window[name] = value;
    }
    const summary = summarizeWebGpuNodeMaterialFactorySuite(factorySuite);
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

export async function createProductionWebGpuSceneManagerOptions(state = null, options = {}) {
    const webGpuModules = await loadWebGpuThree();
    const { WebGPURenderer } = webGpuModules;
    // Cycle 81: expose the three.webgpu namespace so GrassSystem + TreePlacement can
    // build the compute-cull render path (TSL compute + indirect draw) without a
    // static three/tsl import in js/ (the WebGL bundle stays clean). Unconditional on
    // the WebGPU boot - it only runs when WebGPU is the active renderer anyway.
    setWebGpuModules(webGpuModules);
    if (state) {
        state.moduleLoaded = true;
        state.moduleSource = 'assets/vendor/three/three.webgpu.min.js';
    }
    if (options.installFactoryGlobals) {
        installWebGpuProductionFactoryGlobals(webGpuModules, {
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
            renderer.domElement.dataset.productionWebGpu = '1';
            if (state) {
                state.rendererCreated = true;
                state.rendererClassName = renderer.constructor?.name ?? null;
            }
            return renderer;
        },
    };
}

export async function createProductionWebGpuGameOptions(urlParams, state = null) {
    if (state) {
        state.startedAt = new Date().toISOString();
        state.sceneId = urlParams.get('scene') ?? DEFAULT_SCENE_ID;
    }

    const sceneManagerOptions = await createProductionWebGpuSceneManagerOptions(state, {
        installFactoryGlobals: true,
        sceneId: urlParams.get('scene'),
    });
    if (state) {
        state.enabled = true;
        state.route = 'renderer-webgpu-production';
    }

    return {
        sceneManagerOptions,
        beforeInit: async (gameInstance) => {
            installProductionWebGpuLightingBridge(gameInstance.sceneManager, state);
        },
    };
}

export async function recordProductionWebGpuBoot(gameInstance, state = null) {
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
        terrainFactoryApplied: terrainBuilder?.webgpuTerrainMaterialSummary?.applied === true,
        grassFactoryApplied: grassSystem?.webgpuGrassBladeMaterialSummary?.applied === true,
        sheepFactoryApplied: sheepSystem?.webgpuSheepMaterialSummary?.applied === true,
        nativeTreeInstancing: terrainBuilder?.webgpuNativeTreeInstancingSummary?.ok === true,
        nativeRockInstancing: terrainBuilder?.webgpuNativeRockInstancingSummary?.ok === true,
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
            terrainFactory: terrainBuilder?.webgpuTerrainMaterialSummary ?? null,
            grassFactory: grassSystem?.webgpuGrassBladeMaterialSummary ?? null,
            meadowFactory: grassSystem?.webgpuMeadowQuadMaterialSummary ?? null,
            sheepFactory: sheepSystem?.webgpuSheepMaterialSummary ?? null,
            nativeTreeInstancing: terrainBuilder?.webgpuNativeTreeInstancingSummary ?? null,
            nativeRockInstancing: terrainBuilder?.webgpuNativeRockInstancingSummary ?? null,
        },
        checks,
        ok: Object.values(checks).every(Boolean),
    });
    state.error = state.ok ? null : 'production-webgpu-gates-failed';
}

export function installProductionWebGpuLightingBridge(sceneManager, state = null) {
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
    // Cycle 90: same light direction as always (zero shading change), but
    // positioned far enough out to carry a shadow camera. The WebGL scene
    // light has cast shadows since the beginning; the WebGPU bridge never
    // did, which is why every WebGPU desktop scene shipped shadow-less.
    const SHADOW_DISTANCE = 260;
    const dirLen = Math.hypot(1.5, 2.2, 3.0);
    directional.position.set(
        (1.5 / dirLen) * SHADOW_DISTANCE,
        (2.2 / dirLen) * SHADOW_DISTANCE,
        (3.0 / dirLen) * SHADOW_DISTANCE,
    );
    if (!sceneManager.isMobile) {
        // Shadow camera is configured here but DISABLED by default: the
        // depth pass measured field/practice down from 144 to 48 FPS median
        // (hundreds of per-chunk casters for shadows a fully-grassed pasture
        // barely shows). Day-loop scenes (initWorld._tickDayLoop) flip
        // castShadow on and recenter the box on the dog - sparse island
        // grass makes terrain the receiver there, so the shadows actually
        // read, at a cost NSL absorbs (72 FPS median at full quality,
        // cycle90-validation/jitter-after-*.json).
        // Tight box + 1024 map: +-120m/2048 measured 2x worse on NSL.
        directional.castShadow = false;
        directional.shadow.mapSize.set(1024, 1024);
        directional.shadow.camera.near = 0.5;
        directional.shadow.camera.far = 600;
        directional.shadow.camera.left = -70;
        directional.shadow.camera.right = 70;
        directional.shadow.camera.top = 70;
        directional.shadow.camera.bottom = -70;
        // Cycle 91 P1: bias scales with the world size of one shadow texel,
        // so a future per-tier map size or extent change keeps acne and
        // peter-panning balanced instead of inheriting magic constants tuned
        // for 1024px / +-70m (texelWorld 140/1024 ~ 0.137).
        const texelWorld = (directional.shadow.camera.right - directional.shadow.camera.left)
            / directional.shadow.mapSize.x;
        const REFERENCE_TEXEL_WORLD = 140 / 1024;
        const biasScale = texelWorld / REFERENCE_TEXEL_WORLD;
        directional.shadow.bias = -0.0005 * biasScale;
        directional.shadow.normalBias = 0.04 * biasScale;
        directional.userData.shadowConfigured = true;
    }
    sceneManager.getScene().add(ambient);
    sceneManager.getScene().add(directional);
    sceneManager.getScene().add(directional.target);
    // Day-loop scenes recenter the shadow frustum on the dog each frame
    // (initWorld._tickDayLoop); everything else keeps the origin-centered
    // box, mirroring the WebGL light's behavior.
    sceneManager.webgpuSunLight = directional;
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
