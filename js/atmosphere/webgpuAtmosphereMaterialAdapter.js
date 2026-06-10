// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// [P3-WEBGPU] Thin domain config; shared boilerplate lives in
// js/world/createWebGpuAdaptedMaterial.js.
import { createWebGpuMaterialAdapter } from '../world/createWebGpuAdaptedMaterial.js';

const adapter = createWebGpuMaterialAdapter({
  flagParam: 'webgpuAtmosphere',
  factoriesGlobal: '__sdsWebGpuAtmosphereMaterialFactories',
  summaryGlobal: '__sdsWebGpuAtmosphereMaterialAdapter',
});

export const shouldApplyWebGpuAtmosphere = adapter.shouldApply;
export const createWebGpuAtmosphereMaterial = adapter.createMaterial;
