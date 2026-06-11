// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Newsheepdogland - the survival island (renamed from Wolf Coast in Cycle 66).
 * A boot-shaped island roughly 3.2 km^2 with a 120 m mountain in the north leg,
 * banking curved coastlines, and forest / tall-grass / light-tree biome bands.
 * The first scene on the `coastline` boundary kind (an arbitrary concave
 * shoreline the radial `island` kind cannot express).
 *
 * The coastline polygon, the heightmap mask, and the sim SDF all come from the
 * same NEWSHEEPDOGLAND_POINTS array (shared/scenes/newsheepdogland.coast.js) so
 * the rendered coast cannot drift from the sim boundary. Heightmap baked by:
 *   node scripts/bake-heightmap.mjs --scene newsheepdogland --boundary coastline \
 *     --points shared/scenes/newsheepdogland.coast.js --size 1024 --worldSize 3300 \
 *     --peakHeight 12 --mountainHeight 120 --peakX -616 --peakZ 1110 \
 *     --peakRadius 520 --seaLevel -3 --coastFalloff 50 --seed 7 \
 *     --out public/terrain/newsheepdogland.bin
 *
 * @type {import('./types.js').SceneDef}
 */
import { NEWSHEEPDOGLAND_POINTS } from './newsheepdogland.coast.js';
import { SURVIVAL_RUN_DEFAULTS } from '../survival/tuning.js';

export const newsheepdogland = {
    id: 'newsheepdogland',
    name: 'Newsheepdogland',
    description: 'A boot-shaped island under a low dusk sky. A mountain in the north, a wide foot lowland, and a stone fold at the toe to drive the flock into.',

    // Cycle 64: the coastline boundary. cellSize 12 (the spiked resolution) MUST
    // match the value any future Worker build uses for co-op determinism, so it
    // rides here, not on either consumer. falloff 30m beach band.
    boundary: {
        kind: 'coastline',
        points: NEWSHEEPDOGLAND_POINTS,
        falloff: 30,
        cellSize: 12,
    },

    // Cycle 66 P2: the pen IS the objective. No toe corral, no zap. The fence is
    // a real barrier (js/gamestate/penContainment.js): the dog + sheep collide
    // with it and the only way in is the gate, open by day, sealed at night.
    // Sheep herded through the gate settle and retire inside (the pasture) until
    // morning - the half-side of the square fence ring around `center`.
    pen: {
        center: { x: 640, z: -1000 },
        radius: 30,
    },

    // Cycle 65: the homestead gate on the west edge of the pen, facing the
    // grazing lowland. The day loop swings it open at dawn, closed at night.
    // facingDeg 90 turns the opening to span the north-south pen edge.
    gate: {
        position: { x: 610, z: -1000 },
        width: 12,
        facingDeg: 90,
    },

    // Cycle 65: the dog wakes at the homestead, just outside the gate, ready to
    // herd the flock grazing west across the foot. (Was the lone foot drop in
    // Cycle 64; now it is the homestead doorstep.)
    dogSpawn: { x: 585, z: -1000 },

    sheepSpawn: {
        pattern: 'scattered',
        count: 200,
        spreadRadius: 300,
        // Clustered in the foot lowland, west of the toe corral so there is a
        // real drive across the foot.
        centerX: 250,
        centerZ: -1150,
    },

    perimeterFence: false,

    terrain: {
        seed: 7,
        // Heights are stored as absolute metres in the bake; manifest
        // peakHeight=1, so the displaced mesh reads metres directly.
        heightScale: 1,
        heightmapUrl: '/terrain/newsheepdogland.bin',
        version: 1,
        zones: {
            playArea: { minX: -300, maxX: 700, minZ: -1450, maxZ: -800 },
            // Keep placement on the playable foot/homestead corridor. The
            // mountain and lower leg need a density/LOD pass before they can
            // join the default cold path without making Play feel stuck.
            nearField: { minX: 60, maxX: 400, minZ: -1070, maxZ: -905 },
            midField: { minX: 20, maxX: 440, minZ: -1090, maxZ: -890 },
            farField: { minX: -10, maxX: 470, minZ: -1110, maxZ: -875 },
            horizon: { minX: -30, maxX: 500, minZ: -1125, maxZ: -865 },
        },
        // Cycle 87 Phase 2: the rest of the island streams in AFTER
        // first-interactive (js/world/foliageStreaming.js), one idle wave per
        // zone, so the cold Play click keeps the bounded corridor above while
        // the island fills back in within seconds. These are the pre-trim
        // island rects the Cycle 85 first-session hardening removed from the
        // cold path. Streamed candidates inside the cold rects are rejected,
        // so the two scatters never double-place.
        streamedZones: {
            nearField: { minX: -700, maxX: 900, minZ: -1500, maxZ: 200 },
            midField: { minX: -1100, maxX: 1300, minZ: -1500, maxZ: 900 },
            farField: { minX: -1400, maxX: 1500, minZ: -1600, maxZ: 1500 },
            horizon: { minX: -1700, maxX: 1700, minZ: -1700, maxZ: 1700 },
        },
        // Cycle 90: lifted ground palette. The default terrain greens were
        // tuned for small pastures where dense grass hides the ground; NSL's
        // streamed-annulus grass is sparse, so the bare terrain shows through
        // and the default palette read as near-black patches at noon.
        colors: { base: '#4f7038', mid: '#6e8c4e', high: '#5c7c46', dirt: '#7d6f58' },
    },

    grass: {
        clumpsPerChunk: { desktop: 320, mobile: 180 },
        // Cooler coastal greens than the golden Rolling Hills.
        colors: { base: '#5a6a3a', mid: '#83904f', tip: '#c8cf86' },
        // Newsheepdogland is ~3.2 km^2; the default first-session path only
        // grasses the homestead, grazing lowland, and pen approach. Wider island
        // grass belongs behind a measured LOD pass, not the entrance Play click.
        grassCenter: { x: 250, z: -1080 },
        grassRadius: 560,
        // Cycle 87 Phase 3: the wider island grass streams in after
        // first-interactive as the final foliage wave (the cold path keeps the
        // 560m homestead radius above). Reduced clump density for the annulus;
        // mobile streams no grass (the cold field already runs reduced
        // density there).
        streamed: {
            grassRadius: 1560,
            clumpsPerChunk: { desktop: 140, mobile: 0 },
        },
        // The tall-grass shore band across the foot, just inside the sole.
        tallZones: [
            { minX: -250, maxX: 750, minZ: -1380, maxZ: -1050, heightMul: 1.8 },
        ],
    },

    // Cycle 65 biome character: dense forest pockets, a tree-line windbreak, and
    // a deliberately open grazing pasture so the foot reads as fields-and-woods
    // rather than one mountain on empty ground. Densities: >1 dense, <1 sparse.
    // The central-east foot (the grazing field) is left open on purpose; the
    // west foot (the future homestead) stays light so the dog start is clear.
    // Trees in water are culled by the Cycle 64 coastline SDF, so coastal stands
    // self-trim at the shore.
    woodsZones: [
        // North-foot windbreak: a row of tight stands reads as a tree line
        // dividing the open foot pasture from the wooded leg.
        { center: { x: -150, z: -880 }, radius: 55, density: 2.2 },
        { center: { x: 20, z: -870 }, radius: 55, density: 2.2 },
        { center: { x: 190, z: -875 }, radius: 55, density: 2.2 },
        { center: { x: 360, z: -880 }, radius: 55, density: 2.2 },
        { center: { x: 520, z: -885 }, radius: 55, density: 2.2 },
        // A lone copse on the east foot near the toe, for depth.
        { center: { x: 700, z: -1180 }, radius: 130, density: 0.9 },
        // A light grove southwest of the homestead so the west foot has shape
        // without crowding the dog start.
        { center: { x: -280, z: -1180 }, radius: 110, density: 1.0 },
    ],
    treeProfile: { tree1: 0.7, tree2: 0.3 },
    treeScaleJitter: { min: 0.92, max: 1.3 },

    // Cycle 65 fix: the Home Field farmhouse model, attached to the north side
    // of the pasture pen so the homestead reads as one place (it sat off at the
    // Field default before and read as "no house"). The pen spans z[-1030,-970];
    // the house sits flush against the north fence, porch turned toward the pen
    // and the grazing field beyond. rotationDeg overrides the Field default.
    farmHouse: {
        position: { x: 640, z: -956 },
        // Porch + front door face west, the same way the gate opening faces out
        // over the grazing field (verified in-browser: 270deg turns the door west).
        rotationDeg: 270,
        exclusionArea: { minX: 620, maxX: 660, minZ: -976, maxZ: -936 },
    },

    sky: { preset: 'dusk' },
    // Dusk-tinted fog lifted well past the far shore (the island spans ~3 km) so
    // the horizon reads as soft haze rather than a fog wall over the water. The
    // day/night cycle drives the fog COLOR from the horizon each frame; these
    // near/far distances stay fixed so the huge island never hits a fog wall.
    fog: { color: '#b9a98c', near: 600, far: 2600 },

    // Cycle 65/66: the day/night cycle + the homestead herd-back day loop. You
    // wake at the homestead just after sunrise on day one; the sun arcs over
    // secondsPerDay; dayLoop opts in the gate-by-phase + herd-back-before-dusk
    // controller. The 6-minute day puts the first night a little over 3 minutes
    // in, so survival reaches pressure during a short play session.
    dayNight: { enabled: true, secondsPerDay: 360, initialT: 0.28, dayLoop: true },

    // Cycle 66 P3: this scene is the survival run. Start with startFlock sheep (no
    // count selection); each surviving day the flock grows by `growth`; a night
    // that loses `lossThreshold` or more of the flock ends the run; the score is
    // the peak flock size. The run-economy feel defaults are centralized in
    // shared/survival/tuning.js (Cycle 68 P2); maxFlock is this scene's capacity.
    survival: { ...SURVIVAL_RUN_DEFAULTS, maxFlock: 200 },

    // Cycle 64: a tunable strawman ladder (reserved for Matt's feel pass). The
    // island is large, so it runs a broad span from a 3-sheep Just Play up to
    // the 5000 Chaos signature tier.
    soloLadder: [
        { id: 'practice', count: 3, ranked: false, label: 'Just Play', blurb: 'No timer, no fail state.' },
        { id: 'quick', count: 25, ranked: true, label: 'Quick', blurb: 'A small flock in the foot.' },
        { id: 'classic', count: 100, ranked: true, label: 'Classic', blurb: 'The coast run.' },
        { id: 'hard', count: 300, ranked: true, label: 'Hard', blurb: 'Three hundred across the lowland.' },
        { id: 'extreme', count: 1000, ranked: true, label: 'Extreme', blurb: 'A thousand sheep.' },
        { id: 'chaos', count: 5000, ranked: true, label: 'Chaos', blurb: 'The flock becomes the antagonist.' },
    ],

    allowedModes: ['cooperative', 'competitive', 'timed', 'survival'],
    defaultMode: 'cooperative',
    defaultCamera: 'follow',
    difficultyModifier: 1.2,

    // Cycle 74 P1: opt into the build-tail compileAsync prewarm. Live on the desktop
    // and mobile WebGPU path now that Cycle 84 lifted the scene pin. The Cycle 80 compute-cull
    // collapse - not this prewarm - is what brought the cold load within budget
    // (~506ms in the Cycle 81 production gate, prewarm included); inert on explicit
    // WebGL fallback. Original prewarm measurement: docs/cycle-74-plan.md + cycle74-validation/.
    prewarmShaders: true,
};
