// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// [P3-KONVEYOR] Thin domain config; shared boilerplate lives in
// js/world/createKonveyorAdaptedMaterial.js.
import { createKonveyorMaterialAdapter } from './world/createKonveyorAdaptedMaterial.js';

const adapter = createKonveyorMaterialAdapter({
    flagParam: 'konveyorSheep',
    factoriesGlobal: '__sdsKonveyorSheepMaterialFactories',
    summaryGlobal: '__sdsKonveyorSheepMaterialAdapter',
    controlsUserDataKeys: ['konveyorSheepMaterialControls'],
});

export const shouldApplyKonveyorSheep = adapter.shouldApply;
export const createKonveyorSheepMaterial = adapter.createMaterial;
