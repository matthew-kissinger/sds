// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// [P3-KONVEYOR] Thin domain config; shared boilerplate lives in
// js/world/createKonveyorAdaptedMaterial.js.
import { createKonveyorMaterialAdapter } from './world/createKonveyorAdaptedMaterial.js';

const adapter = createKonveyorMaterialAdapter({
  flagParam: 'konveyorImpostors',
  factoriesGlobal: '__sdsKonveyorImpostorMaterialFactories',
  summaryGlobal: '__sdsKonveyorImpostorMaterialAdapter',
  controlsUserDataKeys: ['konveyorImpostorMaterialControls'],
});

export const shouldApplyKonveyorImpostors = adapter.shouldApply;
export const createKonveyorImpostorMaterial = adapter.createMaterial;
