// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// [P3-WEBGPU] Thin domain config; shared boilerplate lives in
// js/world/createWebGpuAdaptedMaterial.js. No summary global, matching the
// historical grass adapter (GrassSystem keeps the summary on the instance).
import { createWebGpuMaterialAdapter } from './createWebGpuAdaptedMaterial.js';

const adapter = createWebGpuMaterialAdapter({
    flagParam: 'webgpuGrass',
    factoriesGlobal: '__sdsWebGpuGrassMaterialFactories',
    summaryGlobal: null,
    controlsUserDataKeys: [
        'webgpuGrassBladeMaterialControls',
        'webgpuMeadowQuadMaterialControls',
    ],
});

export const shouldApplyWebGpuGrass = adapter.shouldApply;
export const createWebGpuGrassMaterial = adapter.createMaterial;
