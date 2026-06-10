// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// [P3-WEBGPU] Thin domain config; shared boilerplate lives in
// js/world/createWebGpuAdaptedMaterial.js.
import { createWebGpuMaterialAdapter } from './world/createWebGpuAdaptedMaterial.js';

const adapter = createWebGpuMaterialAdapter({
  flagParam: 'webgpuImpostors',
  factoriesGlobal: '__sdsWebGpuImpostorMaterialFactories',
  summaryGlobal: '__sdsWebGpuImpostorMaterialAdapter',
  controlsUserDataKeys: ['webgpuImpostorMaterialControls'],
});

export const shouldApplyWebGpuImpostors = adapter.shouldApply;
export const createWebGpuImpostorMaterial = adapter.createMaterial;
