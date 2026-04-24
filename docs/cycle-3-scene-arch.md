# Cycle 3 Track 3 — Scene / Biome Architecture

> Depends on Track 1 (cleanup). Shares a delivery beat with Track 2 (UI shell). Converges on "Rolling Hills ships as a scene-definition file with no core sim changes."

## Problem

[`cycle-2-todo.md`](cycle-2-todo.md) § "Roadmap beyond Cycle 2" lists: rolling hills, river crossings, moorland, canyon runs, forest clearings, plus weather and time-of-day layered on top. Today, the "fenced valley" is built imperatively in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) (1,697 lines). Gameplay bounds, gate position, and pasture are hardcoded constants in [`shared/index.js` `createGameState`](../shared/index.js). Grass density and color are hardcoded in [`GrassSystem.js`](../js/GrassSystem.js).

Adding a second biome by forking any of those files is a trap. Every biome after that forks the fork.

## Target shape — scenes as data

One biome = one file. The file is a declarative scene definition, consumed by both the client renderer and the shared sim.

### Scene definition

`shared/scenes/valley.json` (or `.ts` for typing):

```ts
interface SceneDef {
  id: string;                    // "valley"
  name: string;                  // "Fenced Valley" (i18n key OK)
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
│   ├── index.ts              # registry: loadScene(id), listScenes()
│   ├── valley.ts             # current fenced valley, parity with today
│   ├── rolling-hills.ts      # Track 3 ships this
│   └── types.ts              # SceneDef + related types
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

`TerrainBuilder.js` becomes the "terrain implementation," not the "valley implementation." It reads zones, seed, and height from its argument. No behavior change for the valley — `valley.ts` captures the current constants.

### Worker side — authoritative bounds

[`worker/src/GameSim.js`](../worker/src/GameSim.js) today hardcodes boundary logic and pasture geometry. Change it to import the scene def:

```ts
import { loadScene } from '@sds/shared/scenes';

class GameSim {
  constructor(room, sceneId = 'valley') {
    this.scene = loadScene(sceneId);
    // bounds, gate, pasture all come from this.scene
  }
}
```

Room creation payload gains a `sceneId` field. Legacy rooms default to `"valley"`.

## Migration plan

### Step 1 — Capture the valley as data (no behavior change)

1. Create `shared/scenes/types.ts` with `SceneDef`.
2. Create `shared/scenes/valley.ts` by extracting every hardcoded valley constant from `TerrainBuilder.js`, `GrassSystem.js`, `shared/index.js`, `GameSim.js` into a single literal.
3. Create `shared/scenes/index.ts` with a tiny registry (`{ valley }` for now).
4. Wire `BiomeBuilder` to build from `valley.ts`.
5. Wire `GameSim` to read bounds from `valley.ts`.
6. `TerrainBuilder.js` unchanged in behavior; it now receives its constants from the scene def instead of defining them.

**Exit criterion:** Solo Classic looks and plays identically. No player-visible change. Tests green.

### Step 2 — Ship Rolling Hills

1. New file `shared/scenes/rolling-hills.ts`. Larger bounds, higher terrain variance, no fence perimeter (natural hill-bowls form the enclosures), different grass palette, scattered trees instead of edge-dense, dusk sky.
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

- [ ] `shared/scenes/valley.ts` exists and captures every hardcoded valley constant.
- [ ] `shared/scenes/types.ts` defines `SceneDef`.
- [ ] `shared/scenes/index.ts` exposes a registry with at least `valley` and `rolling-hills`.
- [ ] `js/scene/BiomeBuilder.js` builds a scene from a `SceneDef`.
- [ ] `worker/src/GameSim.js` reads bounds/gate/pasture from the scene def (via `sceneId` in room settings).
- [ ] Rolling Hills is playable end-to-end and shipped live.
- [ ] `TerrainBuilder.js`, `GameSim.js`, `NetworkManager.js` did not gain biome-specific branches.
- [ ] `docs/adding-a-biome.md` explains how to ship biome #3.

## Open questions for user

1. **Scene format — JSON or TS?** TS lets types catch errors at build time and allows inline helpers (e.g. `generateZones(seed)`). JSON is mod-friendly. Recommendation: **TS for shipped scenes, JSON-shape for sandbox sharing.**
2. **Rolling Hills fencing — natural or placed?** Recommendation: **natural** — validates that the scene schema supports unfenced biomes, which unlocks moorland / open ranges later.
3. **Scene picker thumbnails.** Render a static 1024×576 screenshot of each biome (tool in Track 2 already lines up: `tools/render-dog-thumbs.mjs` extended to `tools/render-scene-thumbs.mjs`).
