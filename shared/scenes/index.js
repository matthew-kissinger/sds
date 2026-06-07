// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Scene registry. One entry per biome file. Consumers call loadScene(id)
 * to get a SceneDef; unknown ids throw so typos surface loudly.
 *
 * Adding a biome: create shared/scenes/<id>.js exporting a SceneDef,
 * then register it here.
 */

import { field } from './field.js';
import { rollingHills } from './rolling-hills.js';
import { openCountry } from './open-country.js';
import { wolfCoast } from './wolf-coast.js';

/** @type {Record<string, import('./types.js').SceneDef>} */
const SCENES = {
    field,
    'rolling-hills': rollingHills,
    'open-country': openCountry,
    'wolf-coast': wolfCoast
};

// Cycle 25 Phase F (2026-05-06 follow-up): default scene shifted from
// the flat "Home Field" to the island scene (Sheep Dog Island, formerly
// Rolling Hills). Field stays in the registry as the legacy classic scene.
export const DEFAULT_SCENE_ID = 'rolling-hills';

/**
 * @param {string} [id] Scene id; defaults to DEFAULT_SCENE_ID.
 * @returns {import('./types.js').SceneDef}
 */
export function loadScene(id = DEFAULT_SCENE_ID) {
    const scene = SCENES[id];
    if (!scene) {
        throw new Error(
            `Unknown scene id "${id}". Known scenes: ${Object.keys(SCENES).join(', ')}`
        );
    }
    return scene;
}

/** @returns {import('./types.js').SceneDef[]} */
export function listScenes() {
    return Object.values(SCENES);
}

/**
 * Non-throwing scene lookup. Returns the SceneDef when id is known,
 * undefined otherwise. Use for input validation at API boundaries where
 * an unknown id should produce a 400 rather than a 500.
 *
 * @param {string} id
 * @returns {import('./types.js').SceneDef | undefined}
 */
export function getSceneById(id) {
    return SCENES[id];
}
