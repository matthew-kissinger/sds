import { mulberry32 } from '../../shared/Random.js';
import { isKonveyorProductionWebGpuActive } from '../rendering/konveyorRuntimeMode.js';

const FLAG_PARAM = 'konveyorRocks';
const RENDERER_PARAM = 'renderer';

export const KONVEYOR_ROCK_PLACEMENT_SEED_OFFSET = 0x526f636b;

function getWindowSearch() {
    if (typeof window === 'undefined') return '';
    return window.location?.search ?? '';
}

export function shouldApplyKonveyorRockPlacement(search = getWindowSearch()) {
    const params = new URLSearchParams(search);
    return isKonveyorProductionWebGpuActive()
        || (params.get(FLAG_PARAM) === '1'
        && (
            params.get(RENDERER_PARAM) === 'webgpu'
            || params.get('visualGolden') === '1'
        ));
}

export function createKonveyorRockPlacementRng({
    search = getWindowSearch(),
    sceneDef = null,
    defaultRng = Math.random,
} = {}) {
    if (!shouldApplyKonveyorRockPlacement(search)) {
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

    const seed = (sceneSeed + KONVEYOR_ROCK_PLACEMENT_SEED_OFFSET) >>> 0;
    return {
        rng: mulberry32(seed),
        summary: {
            kind: 'rock-placement-rng',
            applied: true,
            reason: null,
            sceneId: sceneDef.id,
            sceneSeed,
            seed,
            seedOffset: KONVEYOR_ROCK_PLACEMENT_SEED_OFFSET,
            rng: 'mulberry32(sceneSeed + Rock)',
        },
    };
}
