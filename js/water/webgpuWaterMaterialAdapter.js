// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// [P3-WEBGPU] Thin domain config; shared boilerplate lives in
// js/world/createWebGpuAdaptedMaterial.js.
import { createWebGpuMaterialAdapter } from '../world/createWebGpuAdaptedMaterial.js';

const adapter = createWebGpuMaterialAdapter({
    flagParam: 'webgpuWater',
    factoriesGlobal: '__sdsWebGpuWaterMaterialFactories',
    summaryGlobal: '__sdsWebGpuWaterMaterialAdapter',
    controlsUserDataKeys: ['webgpuWaterMaterialControls'],
});

export const shouldApplyWebGpuWater = adapter.shouldApply;
export const createWebGpuWaterMaterial = adapter.createMaterial;
