# Adding a Biome

> Shipping a new scene (biome) is a data change, not a code fork. This doc covers the minimal path for a variant that reuses the current renderer, and points at the extension seams for visual differentiation.

## The current shape (Cycle 3 Track 3)

- `shared/scenes/types.js` — `SceneDef` JSDoc typedef. Source of truth for the schema.
- `shared/scenes/<id>.js` — one file per biome. Exports a single `SceneDef`.
- `shared/scenes/index.js` — registry. Add a new biome here.
- Consumed by:
  - `shared/index.js createGameState` — sim bounds / gate / pasture / sheep count default to the scene.
  - `worker/src/GameSim.js` — loads the scene via `room.sceneId || DEFAULT_SCENE_ID` in the constructor. Explicit bounds pass through to the existing simulation.
  - `js/main.js` — picks the scene (URL param `?scene=<id>` for now; scene picker UI lands in Track 2).
  - `js/TerrainBuilder.js` — zones and farm-house placement come from the scene when provided.
  - `js/GrassSystem.js` — `clumpsPerChunk` comes from the scene when provided.

## The simplest new biome: a sim variant

The renderer still hardcodes mountains, trees, rocks, fences, and the flat terrain mesh. Until that changes, a new biome that doesn't risk visual chaos should keep `bounds` identical to Home Field and differentiate through simulation data: sheep count, spawn pattern, difficulty modifier, gate/pasture positions.

Three steps:

**1. Create `shared/scenes/<id>.js`:**

```js
/** @type {import('./types.js').SceneDef} */
export const tightFlock = {
    id: 'tight-flock',
    name: 'Tight Flock',
    description: 'Sheep spawn clustered near the gate. Fast finish, little margin.',

    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    gate: { position: { x: 0, z: 100 }, width: 8 },
    pasture: { centerZ: 115, minX: -30, maxX: 30, minZ: 102, maxZ: 130 },

    sheepSpawn: {
        pattern: 'clustered',
        count: 120,
        spreadRadius: 10,
        centerX: 0,
        centerZ: 60
    },

    allowedModes: ['cooperative', 'timed'],
    defaultMode: 'timed',
    difficultyModifier: 0.8
};
```

Sim-critical fields (`bounds`, `gate`, `pasture`, `sheepSpawn`) are required. Everything else is optional; omit and the renderer falls back to Home Field defaults.

**2. Register it in `shared/scenes/index.js`:**

```js
import { tightFlock } from './tight-flock.js';

const SCENES = {
    field,
    'rolling-hills': rollingHills,
    'tight-flock': tightFlock
};
```

**3. Test it:**

- Local: open `http://localhost:3000/?scene=tight-flock`. The console logs `[SCENE] Loaded "Tight Flock" (tight-flock) from URL param` on successful load.
- MP: the room creation payload will need a `sceneId` field — picker UI in Track 2 wires this. Until then, the Worker falls back to `DEFAULT_SCENE_ID = 'field'`.

## The next step: visual differentiation

A biome that *looks* different (Rolling Hills with actual hills, Moorland with heather instead of grass, Canyon with rock walls) needs the renderer to consume more of the scene schema. These extension points are in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) and [`js/GrassSystem.js`](../js/GrassSystem.js):

- `terrain.heightScale` → drive terrain mesh displacement. Today `TerrainBuilder.createTerrain()` ignores this; wiring it up is ~20 lines in `createTerrain`.
- `grass.colors` → drive `GrassSystem.config.baseColor` / `midColor` / `tipColor`. One place.
- `grass.wind` → `GrassSystem.config.windStrength` / `windSpeed`.
- `props[]` → a `PropSet` list that `StructureBuilder` / `TerrainBuilder` consume to place mountains, trees, rocks declaratively. Today these placements are hardcoded in `TerrainBuilder`'s giant methods — this is the biggest refactor of the three.
- `sky.preset` → swap `SceneManager`'s light + skybox setup based on preset.
- `fog` → `scene.fog = new THREE.Fog(...)`.

Pick the smallest subset that differentiates your biome. A Rolling Hills that only sets `terrain.heightScale = 8` and `grass.colors` is meaningfully different visually.

## What the scene file should NOT contain

- **Weather state.** Rain, snow, fog banks are runtime effects layered on top of any scene, not part of the scene def. Deferred to a future Weather track.
- **Time-of-day transitions.** Dusk→night is a runtime cycle, not a scene switch.
- **Dynamic props.** Animated windmills, NPCs, flowing water — these need their own systems; the scene def stays static.
- **Procedural generation.** A scene file is a literal object. Procedural biomes are a separate extension (Cycle 5 territory).

## What happens to solo / sandbox?

- **Solo mode** uses `js/FieldConfig.js` (`FIELD_SIZES`, `FIELD_SHAPES`) which is independent of `SceneDef` today. The scene picker UI (Track 2) will either (a) harmonize solo to use `SceneDef`, or (b) solo keeps picking a field shape + size, with the scene only applying to MP rooms. Decision open — see `docs/cycle-3-scene-arch.md` § "Open questions for user" #3.
- **Sandbox** is its own config system with URL-shareable lz-string payloads. Not affected by biome additions; may consume biomes later as a base preset.

## Success checklist for a new biome

- [ ] File created in `shared/scenes/<id>.js`, exports a `SceneDef`.
- [ ] Registered in `shared/scenes/index.js`.
- [ ] `npm run build` green.
- [ ] `npm test` green (sim-baseline tests don't need updating unless the biome changes default bounds).
- [ ] Playtest via `?scene=<id>` URL param — scene loads, console logs the switch.
- [ ] If the biome has different bounds, verify the hardcoded renderer props (mountains, fences) don't look broken. If they do, either keep bounds identical or schedule the renderer parameterization work before shipping.
