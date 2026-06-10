// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// [P3-WEBGPU] Thin domain config; shared boilerplate lives in
// js/world/createWebGpuAdaptedMaterial.js.
import { createWebGpuMaterialAdapter } from '../world/createWebGpuAdaptedMaterial.js';

const adapter = createWebGpuMaterialAdapter({
    flagParam: 'webgpuEffects',
    factoriesGlobal: '__sdsWebGpuEffectMaterialFactories',
    summaryGlobal: '__sdsWebGpuEffectMaterialAdapter',
});

export const shouldApplyWebGpuEffects = adapter.shouldApply;
export const createWebGpuEffectMaterial = adapter.createMaterial;
