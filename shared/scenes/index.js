/**
 * Scene registry. One entry per biome file. Consumers call loadScene(id)
 * to get a SceneDef; unknown ids throw so typos surface loudly.
 *
 * Adding a biome: create shared/scenes/<id>.js exporting a SceneDef,
 * then register it here.
 */

import { field } from './field.js';
import { rollingHills } from './rolling-hills.js';

/** @type {Record<string, import('./types.js').SceneDef>} */
const SCENES = {
    field,
    'rolling-hills': rollingHills
};

export const DEFAULT_SCENE_ID = 'field';

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
