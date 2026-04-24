/**
 * Rolling Hills — a harder variant of Home Field.
 *
 * Same play area and fences today (so the renderer's hardcoded mountain/
 * fence placement still fits), but sim-differentiated: larger flock,
 * scattered deeper into the field, dusk sky reserved for when the
 * renderer learns about `scene.sky`. When renderer parameterization is
 * complete (Track 3 Step 3+), this file gains hill displacement, a
 * natural-saddle pen, and scattered trees in place of the fence.
 *
 * @type {import('./types.js').SceneDef}
 */
export const rollingHills = {
    id: 'rolling-hills',
    name: 'Rolling Hills',
    description: 'A larger flock scattered deeper into the field. More sheep, more patience.',

    // Sim — bounds match Home Field so the current rendered perimeter fits.
    // The differentiation is in the spawn + sheep count.
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },

    gate: {
        position: { x: 0, z: 100 },
        width: 8
    },

    pasture: {
        centerZ: 115,
        minX: -30,
        maxX: 30,
        minZ: 102,
        maxZ: 130
    },

    sheepSpawn: {
        pattern: 'scattered',
        count: 250,
        spreadRadius: 45,
        centerX: 0,
        centerZ: -40
    },

    terrain: {
        seed: 1,
        heightScale: 0, // Rendered flat until BiomeBuilder gets height displacement
        zones: {
            playArea: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
            nearField: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
            midField: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 },
            farField: { minX: -600, maxX: 600, minZ: -600, maxZ: 600 },
            horizon: { minX: -800, maxX: 800, minZ: -800, maxZ: 800 }
        }
    },

    grass: {
        clumpsPerChunk: { desktop: 2200, mobile: 900 }
    },

    farmHouse: {
        position: { x: 180, z: 160 },
        exclusionArea: { minX: 140, maxX: 220, minZ: 120, maxZ: 200 }
    },

    sky: { preset: 'dusk' },
    fog: null,

    allowedModes: ['cooperative', 'competitive', 'timed'],
    defaultMode: 'cooperative',
    difficultyModifier: 1.25
};
