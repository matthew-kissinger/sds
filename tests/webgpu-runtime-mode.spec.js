// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { afterEach, describe, expect, it } from 'vitest';

import {
    isProductionWebGpuActive,
    shouldApplyWebGpuRendererFlag,
    shouldUseWebGpuProductionNativeInstancing,
} from '../js/rendering/webgpuRuntimeMode.js';

function setProductionWebGpuWindow() {
    globalThis.window = {
        location: { search: '?renderer=webgpu&webgpuProduction=1' },
        __sdsRendererMode: { effective: 'webgpu-production' },
        __sdsG: { productionWebGpu: { enabled: true } },
    };
}

afterEach(() => {
    delete globalThis.window;
});

describe('webgpu runtime mode gates', () => {
    it('keeps explicit per-subsystem flags working', () => {
        expect(shouldApplyWebGpuRendererFlag('?renderer=webgpu&webgpuGrass=1', 'webgpuGrass')).toBe(true);
        expect(shouldApplyWebGpuRendererFlag('?renderer=webgpu&diagnostic=1', 'webgpuGrass')).toBe(false);
        expect(shouldApplyWebGpuRendererFlag('?renderer=webgl&webgpuGrass=1', 'webgpuGrass')).toBe(false);
    });

    it('lets the production WebGPU route apply all WebGpu renderer adapters', () => {
        setProductionWebGpuWindow();

        expect(isProductionWebGpuActive()).toBe(true);
        expect(shouldApplyWebGpuRendererFlag('', 'webgpuGrass')).toBe(true);
        expect(shouldApplyWebGpuRendererFlag('', 'webgpuWater')).toBe(true);
        expect(shouldUseWebGpuProductionNativeInstancing()).toBe(true);
    });

    it('lets the guarded native tree impostor route enter native instancing without changing defaults', () => {
        expect(shouldUseWebGpuProductionNativeInstancing(
            '?renderer=webgpu&webgpuNativeTreeImpostors=octahedral',
        )).toBe(true);
        expect(shouldUseWebGpuProductionNativeInstancing(
            '?renderer=webgl&webgpuNativeTreeImpostors=octahedral',
        )).toBe(false);
    });
});
