// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// [P3-WEBGPU] Thin domain config; shared boilerplate lives in
// js/world/createWebGpuAdaptedMaterial.js.
import { createWebGpuMaterialAdapter } from './world/createWebGpuAdaptedMaterial.js';

const adapter = createWebGpuMaterialAdapter({
    flagParam: 'webgpuSheep',
    factoriesGlobal: '__sdsWebGpuSheepMaterialFactories',
    summaryGlobal: '__sdsWebGpuSheepMaterialAdapter',
    controlsUserDataKeys: ['webgpuSheepMaterialControls'],
});

export const shouldApplyWebGpuSheep = adapter.shouldApply;
export const createWebGpuSheepMaterial = adapter.createMaterial;
