import { afterEach, describe, expect, it } from 'vitest';

import {
    isKonveyorProductionWebGpuActive,
    shouldApplyKonveyorRendererFlag,
    shouldUseKonveyorProductionNativeInstancing,
} from '../js/rendering/konveyorRuntimeMode.js';

function setProductionWebGpuWindow() {
    globalThis.window = {
        location: { search: '?renderer=webgpu&konveyorProduction=1' },
        __sdsRendererMode: { effective: 'webgpu-production' },
        __sdsG: { productionWebGpu: { enabled: true } },
    };
}

afterEach(() => {
    delete globalThis.window;
});

describe('konveyor runtime mode gates', () => {
    it('keeps explicit per-subsystem flags working', () => {
        expect(shouldApplyKonveyorRendererFlag('?renderer=webgpu&konveyorGrass=1', 'konveyorGrass')).toBe(true);
        expect(shouldApplyKonveyorRendererFlag('?renderer=webgpu&diagnostic=1', 'konveyorGrass')).toBe(false);
        expect(shouldApplyKonveyorRendererFlag('?renderer=webgl&konveyorGrass=1', 'konveyorGrass')).toBe(false);
    });

    it('lets the production WebGPU route apply all Konveyor renderer adapters', () => {
        setProductionWebGpuWindow();

        expect(isKonveyorProductionWebGpuActive()).toBe(true);
        expect(shouldApplyKonveyorRendererFlag('', 'konveyorGrass')).toBe(true);
        expect(shouldApplyKonveyorRendererFlag('', 'konveyorWater')).toBe(true);
        expect(shouldUseKonveyorProductionNativeInstancing()).toBe(true);
    });

    it('keeps the guarded scout native-instancing route intact', () => {
        expect(shouldUseKonveyorProductionNativeInstancing(
            '?renderer=webgpu&diagnostic=1&konveyorProductionBootScout=1&konveyorProductionSceneBody=1&konveyorNativeInstancing=1',
        )).toBe(true);
    });

    it('lets the guarded native tree impostor route enter native instancing without changing defaults', () => {
        expect(shouldUseKonveyorProductionNativeInstancing(
            '?renderer=webgpu&konveyorNativeTreeImpostors=octahedral',
        )).toBe(true);
        expect(shouldUseKonveyorProductionNativeInstancing(
            '?renderer=webgl&konveyorNativeTreeImpostors=octahedral',
        )).toBe(false);
    });
});
