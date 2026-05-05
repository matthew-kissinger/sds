# Cycle 3 Track 3 — Scene / Biome Architecture

> Depends on Track 1 (cleanup). Shares a delivery beat with Track 2 (UI shell). Converges on "Rolling Hills ships as a scene-definition file with no core sim changes."

## Problem

[`cycle-2-todo.md`](cycle-2-todo.md) § "Roadmap beyond Cycle 2" lists: rolling hills, river crossings, moorland, canyon runs, forest clearings, plus weather and time-of-day layered on top. Today, the "Home Field" (a flat fenced play area ringed by mountain props — not a true valley, despite early docs calling it that) is built imperatively in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) (1,697 lines). Gameplay bounds, gate position, and pasture were hardcoded in [`shared/index.js createGameState`](../shared/index.js) and [`worker/src/GameSim.js`](../worker/src/GameSim.js); as of Track 3 Step 1 they are captured as data in [`shared/scenes/field.js`](../shared/scenes/field.js) and consumed from there. Grass density, terrain zones, and farm-house placement are still hardcoded in [`GrassSystem.js`](../js/GrassSystem.js) and [`TerrainBuilder.js`](../js/TerrainBuilder.js) — renderer wire-up lands in Step 1b alongside `BiomeBuilder`.

Adding a second biome by forking any of those files is a trap. Every biome after that forks the fork.

## Target shape — scenes as data

One biome = one file. The file is a declarative scene definition, consumed by both the client renderer and the shared sim.

### Scene definition

`shared/scenes/field.js` (JSDoc-typed; `.js` everywhere for zero-build-config parity across client, Worker, and tests):

```ts
interface SceneDef {
  id: string;                    // "field"
  name: string;                  // "Home Field" (i18n key OK)
  description: string;           // i18n key

  // Rendering
  terrain: {
    seed: number;
    size: [number, number];      // world units
    heightScale: number;
    zones: TerrainZone[];        // existing TerrainBuilder zone concept
    colorRamp: string[];         // ground tint stops
  };
  grass: {
    density: number;             // clumps/chunk; current desktop=1800
    colors: string[];
    wind: { strength: number, frequency: number };
    cutoffDistance: number;
  };
  props: PropSet[];              // trees, rocks, bushes, structures
  sky: "noon" | "dusk" | "overcast" | "dawn";
  fog: { color: string, near: number, far: number } | null;

  // Simulation
  bounds: { minX: number, maxX: number, minZ: number, maxZ: number };
  gate: { position: { x: number, z: number }, width: number };
  pasture: { centerZ: number, minX: number, maxX: number, minZ: number, maxZ: number };
  sheepSpawn: {
    pattern: "clustered" | "scattered" | "herded";
    count: number;
    clusterCount?: number;
  };

  // Gameplay
  allowedModes: GameMode[];      // some biomes have unique mode support
  defaultMode: GameMode;
  timeLimit?: number;            // seconds, mode-specific override
  difficultyModifier?: number;   // sheep flock tightness, dog stamina scaling
}
```

### Folder layout

```
shared/
├── scenes/
│   ├── index.js              # registry: loadScene(id), listScenes() — shipped Step 1
│   ├── field.js              # "Home Field" — current flat-with-mountains scene, shipped Step 1
│   ├── rolling-hills.js      # Step 2 ships this
│   └── types.js              # SceneDef JSDoc typedefs — shipped Step 1
├── FlockingAlgorithms.js     # unchanged
├── MovementPhysics.js        # unchanged
├── BoundaryCollision.js      # reads bounds from scene, not hardcoded
├── GameStateValidation.js    # reads gate+pasture from scene, not hardcoded
└── index.js                  # re-exports
```

Key property: the same scene file is loaded on the Worker (for authoritative bounds + sheep spawn) and on the client (for renderer). Byte-identical.

### Client side — `BiomeBuilder`

New: `js/scene/BiomeBuilder.js`. Takes a `SceneDef`, produces a fully-populated `THREE.Scene`. Delegates to the existing primitives:

```
BiomeBuilder(sceneDef)
├── buildTerrain(sceneDef.terrain) ← existing TerrainBuilder logic, parameterized
├── buildGrass(sceneDef.grass)     ← existing GrassSystem, config from sceneDef
├── buildProps(sceneDef.props)     ← existing StructureBuilder, list-driven
├── buildSky(sceneDef.sky)         ← new; small lookup table of sky presets
└── buildFog(sceneDef.fog)
```

`TerrainBuilder.js` becomes the "terrain implementation," not the "field implementation." It reads zones, seed, and height from its argument. No behavior change for the Home Field — `field.js` captures the current constants.

### Worker side — authoritative bounds

[`worker/src/GameSim.js`](../worker/src/GameSim.js) today hardcodes boundary logic and pasture geometry. Change it to import the scene def:

```js
import { loadScene, DEFAULT_SCENE_ID } from '../../shared/index.js';

class GameSimulation {
  constructor(room) {
    this.scene = loadScene(room.sceneId || DEFAULT_SCENE_ID);
    // bounds, gate, pasture, sheepSpawn all come from this.scene
  }
}
```

Room creation payload gains a `sceneId` field. Legacy rooms default to `"field"`.

## Migration plan

### Step 1 — Capture the field as data (sim wire-up, no behavior change) — shipped 2026-04-24

1. ✅ `shared/scenes/types.js` — `SceneDef` JSDoc typedef.
2. ✅ `shared/scenes/field.js` — every hardcoded sim constant from `shared/index.js` and `worker/src/GameSim.js` captured as data. Renderer constants (zones, farm house, grass density) captured too, for Step 1b consumption.
3. ✅ `shared/scenes/index.js` — `{ field }` registry with `loadScene(id)` and `listScenes()`; re-exported from `shared/index.js`.
4. ✅ `shared/index.js createGameState` now sources defaults from the scene; explicit config fields still override.
5. ✅ `worker/src/GameSim.js` loads the scene (`room.sceneId || DEFAULT_SCENE_ID`) once in the constructor; both `createGameState` and `createCompetitiveGameState` paths read bounds + spawn config from it.

**Result:** zero player-visible change. `npm run build` green, `npm test` 30/30 pass (7 skipped are flow E2E).

### Step 1b — Renderer wire-up (pending)

Not strictly required until Step 2 introduces a second biome, but worth doing alongside it to prove the renderer-side path. `js/scene/BiomeBuilder.js` consumes `SceneDef` and delegates to `TerrainBuilder` / `GrassSystem` / `StructureBuilder` with the scene's `terrain`, `grass`, and `farmHouse` fields. `field.js` already captures these constants; no further data work needed, only code.

### Step 2 — Ship Rolling Hills

1. New file `shared/scenes/rolling-hills.js`. Larger bounds, higher terrain variance, no fence perimeter (natural hill-bowls form the enclosures), different grass palette, scattered trees instead of edge-dense, dusk sky.
2. New mode: sheep spawn as two separated herds; pen is a natural saddle between hills.
3. Scene picker in Track 2 learns about it from the registry.

**Exit criterion:** Rolling Hills is selectable, plays, completes, scores. Zero changes to `GameSim.js`, `FlockingAlgorithms.js`, `MovementPhysics.js`, `NetworkManager.js`.

### Step 3 — Document the extension point

1. Add `docs/adding-a-biome.md` showing how to add a third biome in under 100 lines of new code.
2. Update `ARCHITECTURE.md` scene section.

## Things we are explicitly NOT doing in this track

- **Weather.** Rain, fog banks, snow — deferred to Cycle 4 (Weather track). The `SceneDef` reserves a `weather` field shape but the client ignores it for now.
- **Time-of-day transitions.** Dusk→night cycle is a runtime concern, not a scene-switch concern. Deferred.
- **Dynamic props.** Animated windmills, flowing rivers with collision. Props are static meshes in this track.
- **Procedural biomes.** Rolling Hills is hand-authored, not generated. Procedural-endless is Cycle 5 territory.
- **A new shader per biome.** All biomes share the existing terrain + grass shaders; variance is entirely in data.
- **Mod-friendly URL-shareable scenes.** The sandbox already has URL-share via lz-string. Extending that to full scene defs is a Cycle 4 item once we have > 2 biomes to share.

## Success criteria

- [x] `shared/scenes/field.js` exists and captures every hardcoded Home Field constant. 2026-04-24.
- [x] `shared/scenes/types.js` defines `SceneDef` (JSDoc). 2026-04-24.
- [x] `shared/scenes/index.js` exposes a registry with `loadScene` / `listScenes` / `DEFAULT_SCENE_ID`. 2026-04-24.
- [x] `worker/src/GameSim.js` reads bounds/gate/pasture/spawn from the scene def (via `room.sceneId`). 2026-04-24.
- [ ] `js/scene/BiomeBuilder.js` builds a scene from a `SceneDef`. (Step 1b)
- [ ] Rolling Hills is playable end-to-end and shipped live. (Step 2)
- [ ] `TerrainBuilder.js`, `GameSim.js`, `NetworkManager.js` did not gain biome-specific branches.
- [ ] `docs/adding-a-biome.md` explains how to ship biome #3. (Step 3)

## Decisions recorded

1. **Scene format — JS + JSDoc.** Chose over `.ts` to avoid a new build step. `shared/` is consumed by client (Vite), Worker (wrangler/esbuild), and Node tests; all three handle `.js` with zero config. JSDoc `@typedef` gives IDE types. If strict type-checking becomes valuable later, the annotations transliterate to `.ts` trivially; the other direction is worse.
2. **Naming — `field` / "Home Field", not "valley".** The current scene is a flat fenced play area with mountain props ringing the perimeter — not a true valley. "Field" matches the existing `FIELD_SIZES` / `FIELD_SHAPES` vocabulary in [`js/FieldConfig.js`](../js/FieldConfig.js).

## Open questions for user

1. **Rolling Hills fencing — natural or placed?** Recommendation: **natural** — validates that the scene schema supports unfenced biomes, which unlocks moorland / open ranges later.
2. **Scene picker thumbnails.** Render a static 1024×576 screenshot of each biome (tool in Track 2 already lines up: `tools/render-dog-thumbs.mjs` extended to `tools/render-scene-thumbs.mjs`).
3. **Client FieldConfig + SandboxConfig harmonization.** Today the client has its own `FIELD_SIZES` / `FIELD_SHAPES` for sandbox mode, orthogonal to `SceneDef`. When do we collapse the two? Step 2 may force the issue if the scene picker needs to distinguish "scene" (biome) from "field shape" (square/wide/circle overlay on a scene).
