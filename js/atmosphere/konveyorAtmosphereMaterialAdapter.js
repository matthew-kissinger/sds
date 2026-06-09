// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// [P3-KONVEYOR] Thin domain config; shared boilerplate lives in
// js/world/createKonveyorAdaptedMaterial.js.
import { createKonveyorMaterialAdapter } from '../world/createKonveyorAdaptedMaterial.js';

const adapter = createKonveyorMaterialAdapter({
  flagParam: 'konveyorAtmosphere',
  factoriesGlobal: '__sdsKonveyorAtmosphereMaterialFactories',
  summaryGlobal: '__sdsKonveyorAtmosphereMaterialAdapter',
});

export const shouldApplyKonveyorAtmosphere = adapter.shouldApply;
export const createKonveyorAtmosphereMaterial = adapter.createMaterial;
