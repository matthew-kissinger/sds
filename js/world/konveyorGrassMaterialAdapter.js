// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// [P3-KONVEYOR] Thin domain config; shared boilerplate lives in
// js/world/createKonveyorAdaptedMaterial.js. No summary global, matching the
// historical grass adapter (GrassSystem keeps the summary on the instance).
import { createKonveyorMaterialAdapter } from './createKonveyorAdaptedMaterial.js';

const adapter = createKonveyorMaterialAdapter({
    flagParam: 'konveyorGrass',
    factoriesGlobal: '__sdsKonveyorGrassMaterialFactories',
    summaryGlobal: null,
    controlsUserDataKeys: [
        'konveyorGrassBladeMaterialControls',
        'konveyorMeadowQuadMaterialControls',
    ],
});

export const shouldApplyKonveyorGrass = adapter.shouldApply;
export const createKonveyorGrassMaterial = adapter.createMaterial;
