// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// [P3-KONVEYOR] Thin domain config; shared boilerplate lives in
// js/world/createKonveyorAdaptedMaterial.js.
import { createKonveyorMaterialAdapter } from './createKonveyorAdaptedMaterial.js';

const adapter = createKonveyorMaterialAdapter({
    flagParam: 'konveyorTerrain',
    factoriesGlobal: '__sdsKonveyorTerrainMaterialFactories',
    summaryGlobal: '__sdsKonveyorTerrainMaterialAdapter',
});

export const shouldApplyKonveyorTerrain = adapter.shouldApply;
export const createKonveyorTerrainMaterial = adapter.createMaterial;
