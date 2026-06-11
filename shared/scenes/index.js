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
import { newsheepdogland } from './newsheepdogland.js';

/** @type {Record<string, import('./types.js').SceneDef>} */
const SCENES = {
    field,
    'rolling-hills': rollingHills,
    'open-country': openCountry,
    'newsheepdogland': newsheepdogland
};

// Cycle 89: default back to Rolling Hills while Newsheepdogland's runtime
// perf is tuned; the survival island stays registered as an experimental
// (WIP) world. Older modes still pin their own scene ids when they need a
// specific biome.
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
