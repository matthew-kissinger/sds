// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// [P3-WEBGPU] Thin domain config; shared boilerplate lives in
// js/world/createWebGpuAdaptedMaterial.js.
import { createWebGpuMaterialAdapter } from './createWebGpuAdaptedMaterial.js';

const adapter = createWebGpuMaterialAdapter({
    flagParam: 'webgpuTerrain',
    factoriesGlobal: '__sdsWebGpuTerrainMaterialFactories',
    summaryGlobal: '__sdsWebGpuTerrainMaterialAdapter',
});

export const shouldApplyWebGpuTerrain = adapter.shouldApply;
export const createWebGpuTerrainMaterial = adapter.createMaterial;
