// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { mulberry32 } from '../../shared/Random.js';
import { isProductionWebGpuActive } from '../rendering/webgpuRuntimeMode.js';

const FLAG_PARAM = 'webgpuRocks';
const RENDERER_PARAM = 'renderer';

export const WEBGPU_ROCK_PLACEMENT_SEED_OFFSET = 0x526f636b;

function getWindowSearch() {
    if (typeof window === 'undefined') return '';
    return window.location?.search ?? '';
}

export function shouldApplyWebGpuRockPlacement(search = getWindowSearch()) {
    const params = new URLSearchParams(search);
    return isProductionWebGpuActive()
        || (params.get(FLAG_PARAM) === '1'
        && (
            params.get(RENDERER_PARAM) === 'webgpu'
            || params.get('visualGolden') === '1'
        ));
}

export function createWebGpuRockPlacementRng({
    search = getWindowSearch(),
    sceneDef = null,
    defaultRng = Math.random,
} = {}) {
    if (!shouldApplyWebGpuRockPlacement(search)) {
        return {
            rng: defaultRng,
            summary: {
                kind: 'rock-placement-rng',
                applied: false,
                reason: 'flag-disabled',
            },
        };
    }

    const sceneSeed = sceneDef?.terrain?.seed;
    if (!Number.isFinite(sceneSeed)) {
        return {
            rng: defaultRng,
            summary: {
                kind: 'rock-placement-rng',
                applied: false,
                reason: 'missing-scene-seed',
            },
        };
    }

    const seed = (sceneSeed + WEBGPU_ROCK_PLACEMENT_SEED_OFFSET) >>> 0;
    return {
        rng: mulberry32(seed),
        summary: {
            kind: 'rock-placement-rng',
            applied: true,
            reason: null,
            sceneId: sceneDef.id,
            sceneSeed,
            seed,
            seedOffset: WEBGPU_ROCK_PLACEMENT_SEED_OFFSET,
            rng: 'mulberry32(sceneSeed + Rock)',
        },
    };
}
