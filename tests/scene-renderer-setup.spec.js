// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
    chooseToneMapping,
    configureProductionRenderer,
    createProductionWebGLRendererOptions,
    installWebGLContextHandlers,
    readWebGLRendererInfo,
    safeGetWebGLContext,
} from '../js/rendering/sceneRendererSetup.js';
import { SceneManager } from '../js/SceneManager.js';

function createFakeGl() {
    const debugInfo = {
        UNMASKED_VENDOR_WEBGL: 0x9245,
        UNMASKED_RENDERER_WEBGL: 0x9246,
    };
    const values = new Map([
        [debugInfo.UNMASKED_VENDOR_WEBGL, 'Fake Vendor'],
        [debugInfo.UNMASKED_RENDERER_WEBGL, 'Fake Renderer'],
        [0x1F02, 'WebGL 2.0 Fake'],
        [0x8B4A, 1024],
        [0x8B49, 2048],
        [0x0D33, 8192],
    ]);
    return {
        VERSION: 0x1F02,
        MAX_VERTEX_UNIFORM_VECTORS: 0x8B4A,
        MAX_FRAGMENT_UNIFORM_VECTORS: 0x8B49,
        MAX_TEXTURE_SIZE: 0x0D33,
        getExtension(name) {
            return name === 'WEBGL_debug_renderer_info' ? debugInfo : null;
        },
        getParameter(name) {
            return values.get(name) ?? null;
        },
    };
}

function createFakeRenderer(gl = createFakeGl()) {
    const listeners = [];
    return {
        debug: {},
        domElement: {
            addEventListener(type, handler) {
                listeners.push({ type, handler });
            },
        },
        shadowMap: {},
        listeners,
        getContext: () => gl,
        setSize(width, height) {
            this.size = { width, height };
        },
        setPixelRatio(value) {
            this.pixelRatio = value;
        },
    };
}

function createSilentLogger() {
    return {
        lines: [],
        log(...args) {
            this.lines.push(args);
        },
        error(...args) {
            this.lines.push(args);
        },
    };
}

function withBrowserGlobals(values, run) {
    const previous = {
        window: globalThis.window,
        document: globalThis.document,
        navigator: globalThis.navigator,
        location: globalThis.location,
    };
    for (const [key, value] of Object.entries(values)) {
        Object.defineProperty(globalThis, key, {
            configurable: true,
            writable: true,
            value,
        });
    }
    try {
        return run();
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) {
                delete globalThis[key];
            } else {
                Object.defineProperty(globalThis, key, {
                    configurable: true,
                    writable: true,
                    value,
                });
            }
        }
    }
}

describe('scene renderer setup', () => {
    it('keeps production WebGL options explicit', () => {
        expect(createProductionWebGLRendererOptions({ isIOS: true, isCinematic: true })).toMatchObject({
            antialias: false,
            powerPreference: 'high-performance',
            stencil: false,
            alpha: false,
            preserveDrawingBuffer: true,
            failIfMajorPerformanceCaveat: false,
        });

        expect(createProductionWebGLRendererOptions({ isIOS: false, isCinematic: false })).toMatchObject({
            antialias: true,
            preserveDrawingBuffer: false,
        });
    });

    it('reads WebGL capability information through a guarded context path', () => {
        const renderer = createFakeRenderer();
        expect(safeGetWebGLContext(renderer)).toBeTruthy();
        expect(readWebGLRendererInfo(renderer)).toMatchObject({
            mode: 'webgl',
            hasContext: true,
            vendor: 'Fake Vendor',
            renderer: 'Fake Renderer',
            version: 'WebGL 2.0 Fake',
            maxVertexUniforms: 1024,
            maxFragmentUniforms: 2048,
            maxTextureSize: 8192,
        });

        expect(safeGetWebGLContext({ getContext: () => { throw new Error('no context'); } })).toBeNull();
        expect(readWebGLRendererInfo({})).toMatchObject({
            mode: 'non-webgl',
            hasContext: false,
        });
    });

    it('installs WebGL context handlers only when a WebGL context exists', () => {
        const logger = createSilentLogger();
        const renderer = createFakeRenderer();
        expect(installWebGLContextHandlers(renderer, logger)).toBe(true);
        expect(renderer.listeners.map((listener) => listener.type)).toEqual([
            'webglcontextlost',
            'webglcontextrestored',
        ]);

        const lostEvent = { preventDefaultCalled: false, preventDefault() { this.preventDefaultCalled = true; } };
        renderer.listeners[0].handler(lostEvent);
        expect(lostEvent.preventDefaultCalled).toBe(true);
        expect(installWebGLContextHandlers({ domElement: renderer.domElement }, logger)).toBe(false);
    });

    it('configures common renderer state while keeping WebGL-only hooks guarded', () => {
        const renderer = createFakeRenderer();
        const logger = createSilentLogger();
        const summary = configureProductionRenderer(renderer, {
            width: 1280,
            height: 720,
            isMobile: false,
            devicePixelRatio: 3,
            toneOverride: 'linear',
            platform: 'Win32',
            userAgent: 'Chrome',
            logger,
        });

        expect(renderer.size).toEqual({ width: 1280, height: 720 });
        expect(renderer.pixelRatio).toBe(2);
        expect(renderer.debug.checkShaderErrors).toBe(true);
        expect(renderer.shadowMap.enabled).toBe(true);
        expect(renderer.shadowMap.type).toBe(THREE.PCFSoftShadowMap);
        expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
        expect(renderer.toneMapping).toBe(THREE.LinearToneMapping);
        expect(renderer.toneMappingExposure).toBe(1.0);
        expect(renderer.sortObjects).toBe(true);
        expect(renderer.autoClear).toBe(true);
        expect(summary).toMatchObject({
            rendererMode: 'webgl',
            contextHandlersInstalled: true,
            toneMapping: {
                name: 'Linear',
                isApplePlatform: false,
                override: 'linear',
            },
            shadowsEnabled: true,
            pixelRatio: 2,
        });
    });

    it('preserves the Apple neutral-tonemapping default and mobile perf posture', () => {
        expect(chooseToneMapping({ platform: 'MacIntel' })).toMatchObject({
            value: THREE.NeutralToneMapping,
            name: 'Neutral',
            isApplePlatform: true,
        });
        expect(chooseToneMapping({ platform: 'Win32' })).toMatchObject({
            value: THREE.ACESFilmicToneMapping,
            name: 'ACESFilmic',
            isApplePlatform: false,
        });

        const renderer = createFakeRenderer();
        const summary = configureProductionRenderer(renderer, {
            width: 390,
            height: 844,
            isMobile: true,
            devicePixelRatio: 3,
            platform: 'iPhone',
            logger: createSilentLogger(),
        });

        expect(renderer.pixelRatio).toBe(1);
        expect(renderer.shadowMap.enabled).toBe(false);
        expect(renderer.toneMapping).toBe(THREE.NeutralToneMapping);
        expect(summary.shadowsEnabled).toBe(false);
        expect(summary.pixelRatio).toBe(1);
    });

    it('lets SceneManager consume an explicit renderer factory for proof runs', () => {
        const renderer = createFakeRenderer();
        const appended = [];
        let factoryOptions = null;
        let setupOptions = null;
        const windowValue = {
            innerWidth: 1280,
            innerHeight: 720,
            devicePixelRatio: 1.25,
            addEventListener() {},
        };
        const documentValue = {
            getElementById(id) {
                expect(id).toBe('canvas-container');
                return {
                    appendChild(element) {
                        appended.push(element);
                    },
                };
            },
        };
        const navigatorValue = {
            userAgent: 'Chrome',
            platform: 'Win32',
            maxTouchPoints: 0,
        };
        const locationValue = {
            search: '?tonemap=neutral',
        };

        withBrowserGlobals({
            window: windowValue,
            document: documentValue,
            navigator: navigatorValue,
            location: locationValue,
        }, () => {
            const sceneManager = new SceneManager({
                createRenderer(options) {
                    factoryOptions = options;
                    return renderer;
                },
                configureRenderer(nextRenderer, options) {
                    expect(nextRenderer).toBe(renderer);
                    setupOptions = options;
                    return { rendererMode: 'injected-proof' };
                },
            });

            expect(sceneManager.getRenderer()).toBe(renderer);
            expect(sceneManager.rendererSetup).toEqual({ rendererMode: 'injected-proof' });
        });

        expect(factoryOptions).toEqual({ isIOS: false, isCinematic: false });
        expect(setupOptions).toMatchObject({
            width: 1280,
            height: 720,
            isMobile: false,
            devicePixelRatio: 1.25,
            toneOverride: 'neutral',
            platform: 'Win32',
            userAgent: 'Chrome',
        });
        expect(appended).toEqual([renderer.domElement]);
    });

    it('routes async renderers through renderAsync without overlapping frames', async () => {
        let resolveRender = null;
        const renderer = {
            ...createFakeRenderer(),
            renderCalls: 0,
            renderAsyncCalls: 0,
            render() {
                this.renderCalls += 1;
            },
            renderAsync() {
                this.renderAsyncCalls += 1;
                return new Promise((resolve) => {
                    resolveRender = resolve;
                });
            },
        };
        const appended = [];
        const windowValue = {
            innerWidth: 1280,
            innerHeight: 720,
            devicePixelRatio: 1,
            addEventListener() {},
        };
        const documentValue = {
            getElementById() {
                return {
                    appendChild(element) {
                        appended.push(element);
                    },
                };
            },
        };
        const navigatorValue = {
            userAgent: 'Chrome',
            platform: 'Win32',
            maxTouchPoints: 0,
        };
        const locationValue = { search: '' };

        const sceneManager = withBrowserGlobals({
            window: windowValue,
            document: documentValue,
            navigator: navigatorValue,
            location: locationValue,
        }, () => new SceneManager({
            createRenderer: () => renderer,
            configureRenderer: () => ({ rendererMode: 'non-webgl' }),
        }));

        const first = sceneManager.render();
        const second = sceneManager.render();
        expect(first).toBe(second);
        expect(renderer.renderCalls).toBe(0);
        expect(renderer.renderAsyncCalls).toBe(0);
        expect(sceneManager.getRenderStatus()).toMatchObject({
            mode: 'async',
            inFlight: true,
            lastError: null,
        });
        await Promise.resolve();
        expect(renderer.renderAsyncCalls).toBe(1);

        resolveRender();
        await first;

        expect(sceneManager.getRenderStatus()).toMatchObject({
            mode: 'async',
            inFlight: false,
            lastError: null,
        });
        expect(appended).toEqual([renderer.domElement]);
    });

    it('waits for async renderer initialization before renderAsync', async () => {
        let resolveInit = null;
        const events = [];
        const renderer = {
            ...createFakeRenderer(),
            init() {
                events.push('init-started');
                return new Promise((resolve) => {
                    resolveInit = () => {
                        events.push('init-resolved');
                        resolve();
                    };
                });
            },
            renderAsync() {
                events.push('render-async');
                return Promise.resolve();
            },
        };
        const windowValue = {
            innerWidth: 1280,
            innerHeight: 720,
            devicePixelRatio: 1,
            addEventListener() {},
        };
        const documentValue = {
            getElementById() {
                return { appendChild() {} };
            },
        };
        const navigatorValue = {
            userAgent: 'Chrome',
            platform: 'Win32',
            maxTouchPoints: 0,
        };

        const sceneManager = withBrowserGlobals({
            window: windowValue,
            document: documentValue,
            navigator: navigatorValue,
            location: { search: '' },
        }, () => new SceneManager({
            createRenderer: () => renderer,
            configureRenderer: () => ({ rendererMode: 'non-webgl' }),
        }));

        const renderPromise = sceneManager.render();
        await Promise.resolve();

        expect(events).toEqual(['init-started']);
        expect(sceneManager.getRenderStatus()).toMatchObject({
            mode: 'async',
            inFlight: true,
            rendererReady: false,
        });

        resolveInit();
        await renderPromise;

        expect(events).toEqual(['init-started', 'init-resolved', 'render-async']);
        expect(sceneManager.getRenderStatus()).toMatchObject({
            mode: 'async',
            inFlight: false,
            rendererReady: true,
            rendererReadyError: null,
            lastError: null,
        });
    });
});
