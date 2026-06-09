// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';
import { createContextLossRecovery, watchWebGpuDeviceLost } from './webglContextRecovery.js';

export function createProductionWebGLRendererOptions({ isIOS = false, isCinematic = false } = {}) {
    return {
        antialias: !isIOS,
        powerPreference: 'high-performance',
        stencil: false,
        alpha: false,
        preserveDrawingBuffer: isCinematic,
        failIfMajorPerformanceCaveat: false,
    };
}

export function createProductionWebGLRenderer(options = {}) {
    return new THREE.WebGLRenderer(createProductionWebGLRendererOptions(options));
}

export function safeGetWebGLContext(renderer) {
    if (!renderer || typeof renderer.getContext !== 'function') return null;
    try {
        return renderer.getContext();
    } catch (_) {
        return null;
    }
}

export function readWebGLRendererInfo(renderer) {
    const gl = safeGetWebGLContext(renderer);
    const info = {
        mode: gl ? 'webgl' : 'non-webgl',
        hasContext: !!gl,
        vendor: null,
        renderer: null,
        version: null,
        maxVertexUniforms: null,
        maxFragmentUniforms: null,
        maxTextureSize: null,
    };
    if (!gl) return info;

    const debugInfo = gl.getExtension?.('WEBGL_debug_renderer_info') ?? null;
    if (debugInfo) {
        info.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        info.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    }
    info.version = gl.getParameter(gl.VERSION);
    info.maxVertexUniforms = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
    info.maxFragmentUniforms = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);
    info.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    return info;
}

export function installWebGLContextHandlers(renderer, logger = console, options = {}) {
    const gl = safeGetWebGLContext(renderer);
    const element = renderer?.domElement;
    if (!gl || !element || typeof element.addEventListener !== 'function') return false;

    // P4-CTX-RESTORE: guard double-install. configureProductionRenderer can
    // run again against the same long-lived renderer (in-process scene
    // rebuilds keep the canvas alive); one recovery state machine per canvas.
    if (element.dataset?.sdsCtxRecovery === '1') return true;
    if (element.dataset) element.dataset.sdsCtxRecovery = '1';

    const recovery = options.recovery
        ?? createContextLossRecovery({ rendererKind: 'webgl', logger });

    element.addEventListener('webglcontextlost', (event) => {
        logger.error?.('[WEBGL] Context lost!', event);
        // preventDefault tells the browser we want webglcontextrestored.
        event.preventDefault();
        recovery.onContextLost();
    });

    element.addEventListener('webglcontextrestored', () => {
        logger.log?.('[WEBGL] Context restored');
        // Three.js re-uploads what it can, but baked-once render targets
        // (far-tree billboard bakes) stay invalid - reload for a clean world.
        recovery.onContextRestored();
    });
    return true;
}

export function chooseToneMapping({ toneOverride = null, platform = '', userAgent = '' } = {}) {
    // Apple Metal/ANGLE paths wash the cool fog/water palette under ACES, so
    // Neutral remains the default there unless a URL override asks otherwise.
    const isApplePlatform = /Mac|iPhone|iPad|iPod/.test(platform || userAgent || '');
    let value;
    if (toneOverride === 'aces') value = THREE.ACESFilmicToneMapping;
    else if (toneOverride === 'neutral') value = THREE.NeutralToneMapping;
    else if (toneOverride === 'linear') value = THREE.LinearToneMapping;
    else if (toneOverride === 'none') value = THREE.NoToneMapping;
    else value = isApplePlatform ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;

    const name = value === THREE.NeutralToneMapping ? 'Neutral'
        : value === THREE.ACESFilmicToneMapping ? 'ACESFilmic'
        : value === THREE.LinearToneMapping ? 'Linear'
        : 'None';

    return {
        value,
        name,
        isApplePlatform,
        override: toneOverride,
    };
}

export function configureProductionRenderer(renderer, {
    width,
    height,
    isMobile = false,
    devicePixelRatio = 1,
    toneOverride = null,
    platform = '',
    userAgent = '',
    logger = console,
} = {}) {
    if (renderer?.debug) renderer.debug.checkShaderErrors = true;
    renderer?.setSize?.(width, height);

    const webglInfo = readWebGLRendererInfo(renderer);
    if (webglInfo.hasContext) {
        if (webglInfo.vendor) logger.log?.('[WEBGL] Vendor:', webglInfo.vendor);
        if (webglInfo.renderer) logger.log?.('[WEBGL] Renderer:', webglInfo.renderer);
        logger.log?.('[WEBGL] Version:', webglInfo.version);
        logger.log?.('[WEBGL] Max Vertex Uniforms:', webglInfo.maxVertexUniforms);
        logger.log?.('[WEBGL] Max Fragment Uniforms:', webglInfo.maxFragmentUniforms);
        logger.log?.('[WEBGL] Max Texture Size:', webglInfo.maxTextureSize);
    }

    const contextHandlersInstalled = installWebGLContextHandlers(renderer, logger);

    // P4-CTX-RESTORE: the WebGPU path has no contextlost event; the live
    // GPUDevice's `lost` promise is the equivalent signal. The production
    // boot only preflights a throwaway device, so watch the real one here.
    const deviceLostWatchInstalled = renderer?.isWebGPURenderer === true
        ? watchWebGpuDeviceLost(renderer, { logger })
        : false;

    if (renderer?.shadowMap) {
        if (isMobile) {
            renderer.shadowMap.enabled = false;
            logger.log?.('[PERF] Shadows disabled on mobile for performance');
        } else {
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
    }

    if (typeof renderer?.setPixelRatio === 'function') {
        if (isMobile) {
            renderer.setPixelRatio(1);
            logger.log?.('[PERF] Mobile detected: forcing devicePixelRatio to 1');
        } else {
            renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        }
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const toneMapping = chooseToneMapping({ toneOverride, platform, userAgent });
    renderer.toneMapping = toneMapping.value;
    renderer.toneMappingExposure = 1.0;
    logger.log?.(`[TONEMAP] ${toneMapping.isApplePlatform ? 'Apple' : 'non-Apple'} platform - ${toneMapping.name}${toneOverride ? ` (override=${toneOverride})` : ''}`);

    renderer.sortObjects = true;
    renderer.autoClear = true;

    return {
        rendererMode: webglInfo.mode,
        webglInfo,
        contextHandlersInstalled,
        deviceLostWatchInstalled,
        toneMapping: {
            name: toneMapping.name,
            isApplePlatform: toneMapping.isApplePlatform,
            override: toneMapping.override,
        },
        shadowsEnabled: renderer?.shadowMap?.enabled ?? null,
        pixelRatio: isMobile ? 1 : Math.min(devicePixelRatio, 2),
    };
}
