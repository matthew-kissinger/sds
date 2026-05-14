import { loadScene as loadSceneDef } from '../../shared/scenes/index.js';

export const DIAGNOSTIC_ROCK_PLACEMENT_SCENE_ID = 'field';
const DIAGNOSTIC_ROCK_PLACEMENT_MAX_ROCKS = 6;

const ROCK_SAMPLES = [
    { type: 'rock1', sourceIndex: 12, x: -172.5, z: -136.25, scale: 6.85, rotationX: 0.08, rotationY: 0.35, rotationZ: -0.04, formationScale: 0.92 },
    { type: 'rock1', sourceIndex: 31, x: -118.75, z: 154.5, scale: 8.2, rotationX: 0.16, rotationY: 2.1, rotationZ: 0.09, formationScale: 1.04 },
    { type: 'rock2', sourceIndex: 54, x: 158.0, z: -122.0, scale: 11.6, rotationX: 0.11, rotationY: 1.25, rotationZ: -0.13, formationScale: 0.88 },
    { type: 'rock2', sourceIndex: 77, x: 232.5, z: 206.0, scale: 14.4, rotationX: 0.22, rotationY: 3.62, rotationZ: 0.07, formationScale: 1.18 },
    { type: 'rock3', sourceIndex: 109, x: -344.0, z: 282.25, scale: 22.5, rotationX: 0.19, rotationY: 4.4, rotationZ: -0.16, formationScale: 0.95 },
    { type: 'rock3', sourceIndex: 144, x: 408.5, z: -318.0, scale: 31.0, rotationX: 0.27, rotationY: 5.55, rotationZ: 0.15, formationScale: 1.22 },
];

function rockSample(sample) {
    return {
        sourceIndex: sample.sourceIndex,
        type: sample.type,
        production: {
            x: sample.x,
            z: sample.z,
            scale: sample.scale,
            rotationX: sample.rotationX,
            rotationY: sample.rotationY,
            rotationZ: sample.rotationZ,
            scaleY: 0.7,
            scaleZ: 1.2,
            radius: Number((sample.scale * 1.2).toFixed(3)),
            colliderRadius: Number((sample.scale * 0.55).toFixed(3)),
            isObstacle: sample.formationScale >= 0.8,
        },
    };
}

export function createDiagnosticRockPlacementPlan({
    sceneId = DIAGNOSTIC_ROCK_PLACEMENT_SCENE_ID,
    maxRendered = DIAGNOSTIC_ROCK_PLACEMENT_MAX_ROCKS,
} = {}) {
    const sceneDef = loadSceneDef(sceneId);
    const samples = ROCK_SAMPLES.slice(0, maxRendered).map(rockSample);

    return {
        ok: samples.length > 0,
        sceneId: sceneDef.id,
        seed: sceneDef?.terrain?.seed ?? 0,
        source: 'diagnostic-rock-placement-transform-samples',
        productionReference: 'js/world/RockPlacement.js rockInstances transform contract',
        obstacleContract: 'recorded-only-not-wired-to-shared/SceneObstacles',
        generatedRocks: null,
        sampledRocks: samples.length,
        types: [...new Set(samples.map((sample) => sample.type))].sort(),
        samples,
    };
}
