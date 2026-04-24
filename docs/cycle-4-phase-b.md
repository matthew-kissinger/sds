# Cycle 4 Phase B — Heightfield + Atmosphere Integration

> Written 2026-04-24 alongside the Phase A close-out. Read [`cycle-4-plan.md`](cycle-4-plan.md) first for the Phase A context. Phase A shipped 11 parallel units; Phase B is the sequential follow-up that wires the standalone modules into the render path.

## **Phase B is a single sequential PR by the user — NOT a parallel batch.**

This is loud and clear because the temptation to fan it out is real. Don't. Reasons:

1. **Shared regression surface.** Every item touches the y-axis. A bad Heightfield sample makes the dog float, the sheep sink, and grass clip simultaneously. Diagnosing that across three concurrent worktrees is a nightmare.
2. **Many consumers touch files Phase A just rewrote** (`SceneManager.js` post-Unit-M, `TerrainBuilder.js` post-Unit-H, `GrassSystem.js` post-Unit-I). Sequencing avoids constant rebases.
3. **Atmosphere wiring is destructive** — SceneManager loses its hardcoded `scene.background` and `scene.fog`. A botched merge silently regresses every biome.
4. **Sim-baseline fixtures may need regeneration** once slope-modulated sheep speed lands. Doing that under merge pressure is asking for a wrong baseline.

Run it as one PR. Verify each step manually before moving to the next. The e2e recipe (`npm test && npm run build && npm run dev:client`) plus a quick `?scene=field`, `?scene=rolling-hills`, `?scene=open-country` cycle catches almost everything.

## Pre-requisites from Phase A

All Phase A units (B, C, D, F, G, H, I, J, K, M) merged on main. Specifically:

- **`shared/terrain/Heightfield.js`** exists with `static async load(url, manifest)`, `sample(x, z)`, `normal(x, z)`, `getRawArray()` (Unit D).
- **`public/terrain/{field,rolling-hills,open-country}.r32f`** + matching `.json` manifests are baked and present (Unit B).
- **`shared/scenes/{field,rolling-hills,open-country}.js`** carry `terrain.heightmapUrl`, `terrain.version`, `sky.preset`, `fog`, and typed `grass.colors` (Units C, F, K).
- **`js/atmosphere/Atmosphere.js`** exposes `constructor(scene)`, `applyPreset(presetName)`, `updateSun(elevation, azimuth)` and the GLSL shader compiles in isolation (Unit J).
- **`js/ProceduralMountains.js`** exposes `addToScene(scene, opts)` (Unit G).
- **`js/CameraController.js`** owns camera state and exposes `update(dogPos, dogFacing, dt)`; `SceneManager` keeps `getCamera()` plus pass-throughs (Unit M).

## Sequential work items

### 1. TerrainBuilder vertex displacement from Heightfield

**Files touched:** `js/TerrainBuilder.js` (~30 LOC near the existing terrain mesh construction, ~line 291). Optionally a new helper file if the displacement loop reads cleaner standalone — author's call.

**Description:** Async-load the scene's heightmap (if `sceneDef.terrain.heightmapUrl` is set), construct a `Heightfield`, and displace each vertex of the terrain plane along Y by `heightfield.sample(vx, vz) * sceneDef.terrain.heightScale`. Recompute normals after displacement (`geometry.computeVertexNormals()`). Keep the flat-plane fallback path for scenes without a heightmap (none ship today, but the code shouldn't crash if `heightmapUrl` is absent).

**Pre-requisites from Phase A:** Unit D (Heightfield), Unit B (baked .r32f files), Unit C (heightmapUrl in schema), Unit K (heightmapUrl values on rolling-hills + field).

**Validation:** `npm run build && npm run dev:client`, hit `?scene=rolling-hills`. Terrain visibly undulates. `?scene=field` shows subtle bumps (or remains flat if field's heightScale is 0). No console errors. Z-fighting check: walk the dog over a hilltop — no flicker.

### 2. GrassSystem y-sample

**Files touched:** `js/GrassSystem.js` only.

**Description:** GrassSystem's constructor already accepts the scene def. Extend it to also accept (or load) the same `Heightfield` instance from step 1. For each grass clump position, set `clumpY = heightfield.sample(clumpX, clumpZ)`. Pass this Y into the existing per-clump uniform / instance attribute. Blades draw at terrain height instead of y=0.

**Pre-requisites:** Step 1 must land first so the Heightfield is in memory and shared. (Or: GrassSystem loads its own copy — simpler but doubles memory. Author's call; one-shared-instance is preferred.)

**Validation:** `?scene=rolling-hills`, grass blades follow the terrain undulation. No clipping at hilltops, no floating grass in valleys. Per-frame cost unchanged (sample is O(1) bilinear, only run at clump-spawn).

### 3. OptimizedSheep + Sheepdog y-clamp

**Files touched:** `js/OptimizedSheep.js`, `js/Sheepdog.js`. (Possibly `shared/MovementPhysics.js` if y-clamp lives there for shared sim parity — see step 6.)

**Description:** Per-step (per sim tick, not per render frame), clamp each sheep's Y and the dog's Y to `heightfield.sample(x, z)` plus a small offset (sheep belly height ~0.3m, dog body height ~0.4m — measure with the GLB anchor). Sheep instance Y attribute updates via `setMatrixAt`. Dog mesh sets `position.y` directly.

**Pre-requisites:** Step 1 (Heightfield exists in memory), Steps 2 (precedent for sharing the heightfield).

**Validation:** Dog walks up a hill, stays glued to terrain. Sheep flock onto a rise without sinking or floating. Visual smoke at all three scenes. Watch for jitter at chunk boundaries (bilinear should be C0 continuous, no jitter expected).

### 4. Atmosphere wiring

**Files touched:** `js/main.js` (instantiate `Atmosphere`), `js/SceneManager.js` (REMOVE hardcoded `scene.background` and `scene.fog`), scene-load path (call `atmosphere.applyPreset(sceneDef.sky.preset)` and apply `sceneDef.fog`).

**Description:** In `main.js`, after `SceneManager` is constructed, instantiate `const atmosphere = new Atmosphere(sceneManager.scene)`. On every scene load (initial boot + any future scene swap), call `atmosphere.applyPreset(sceneDef.sky.preset)`. Apply `sceneDef.fog` directly to the THREE.Scene's fog. Delete the hardcoded sky/fog setup in SceneManager — the Atmosphere module is now the single source of truth.

**Pre-requisites:** Unit J (Atmosphere module), Unit M (SceneManager refactor; this step touches code that Unit M just touched, hence sequential), Units C+K (sky.preset present on all scenes).

**Validation:** `?scene=field` shows pastoral-noon sky. `?scene=rolling-hills` shows dusk. `?scene=open-country` shows golden-hour. Fog colors match the scene def. No console errors about missing presets. SceneManager no longer references `scene.background` / `scene.fog` directly.

**Watch for:** SceneManager's recent Unit-M refactor may have moved or renamed the sky/fog setup. Re-read SceneManager carefully before deleting; the sky/fog code may now live elsewhere.

### 5. ProceduralMountains wiring into TerrainBuilder

**Files touched:** `js/TerrainBuilder.js` only.

**Description:** Replace the existing prop-ring mountain placement with a single `new ProceduralMountains().addToScene(scene, { innerRadius, outerRadius, peakHeight, sunDir })` call. `sunDir` comes from the Atmosphere preset (Atmosphere should expose a `getSunDirection()` getter, or pass it explicitly from main.js). Remove the GLB-based mountain instances.

**Pre-requisites:** Unit G (ProceduralMountains), Step 4 (Atmosphere wired so sunDir is reachable).

**Validation:** All three scenes render a mountain ring with snow caps + rock + aerial perspective. No legacy GLB mountains visible. Performance: should be cheaper (one displaced ring vs. ~12 instanced GLBs).

### 6. Slope-modulated sheep speed in shared/MovementPhysics.js

**Files touched:** `shared/MovementPhysics.js` only.

**Description:** Sheep moving uphill should slow down. Use `heightfield.normal(x, z)` (or pass the slope vector in from the caller) and apply `speedMultiplier = max(0.6, 1 - slope.y * 2)` where `slope.y` is the dot of the up-vector with the terrain normal scaled appropriately. Floor at 0.6 so sheep don't stall on cliffs.

**Pre-requisites:** Steps 1 and 3. The Heightfield must be reachable from the sim layer (which currently has no THREE dependency; the heightfield module is in `shared/terrain/` precisely so the sim can use it).

**Validation:** Sheep visibly slow climbing the rolling-hills slopes, recover speed downhill. **`tests/sim-baseline/` will likely fail** because flock trajectories change. Manually verify the new behavior is intentional, then regenerate fixtures with `UPDATE_FIXTURES=true npm test`. Diff the new fixture vs. old — slopes should add deterministic offsets, not chaotic noise.

### 7. Prop placement on terrain

**Files touched:** `js/TerrainBuilder.js` (trees / rocks / fence-post placement). Possibly `js/StructureBuilder.js` if fences live there.

**Description:** Currently props are placed at y=0. Query `heightfield.sample(propX, propZ)` once at placement time and set `propY` accordingly. Cheap — one bilinear sample per prop, only at scene load. Fences should follow the terrain along their span (sample at each segment endpoint, deform the fence mesh — or use multiple short segments).

**Pre-requisites:** Step 1.

**Validation:** Trees, rocks, fences sit on the ground at all three scenes. No floating fenceposts. Fence segments visibly follow undulation in `?scene=rolling-hills`.

### 8. Camera y-clamp in Follow/Free

**Files touched:** `js/CameraController.js` only.

**Description:** Follow and Free modes can dip the camera below terrain when the dog is at a low elevation surrounded by hills. Sample `heightfield.sample(camera.position.x, camera.position.z)` and clamp `camera.position.y >= terrainY + minClearance` (suggest 1.5m). Classic mode doesn't need this — its 60m height is well above any 6m hills.

**Pre-requisites:** Step 1. Unit M's CameraController is the file being modified.

**Validation:** Walk the dog into valleys in `?scene=rolling-hills` while in Follow mode. Camera never clips through terrain. Free mode orbiting around a hilltop dog stays above ground.

## After Phase B lands

- Update `ARCHITECTURE.md` with the post-integration state (sky/fog now owned by Atmosphere; props sit on terrain; sim depends on Heightfield).
- Update `docs/adding-a-biome.md` with the new fields biomes are expected to fill (heightmap manifest, sky preset, grass colors).
- Run a full playtest at all three scenes, all three camera modes, online MP. Watch for sim drift between client prediction and server authoritative state — slope-modulated speed must apply identically on both sides.
- Consider whether Phase A's `tests/sim-baseline/` fixtures need a versioning scheme so downstream cycles don't accidentally compare against pre-slope baselines.

## Risks worth surfacing now

- **Heightfield must load before sim ticks.** Today's boot is synchronous; adding an async fetch to the critical path needs a "loading" state or a pre-warmed cache. Address in step 1.
- **MP joiners with mismatched scenes** (the open question carried forward from Cycle 3) get even more visibly wrong with terrain displacement. Either fix the renderer scene-reactivity in this cycle or document the user-facing implication.
- **R32F textures aren't universally supported on mobile WebGL.** The bake script should also emit a fallback (R16F or quantized R8 + scale factor in the manifest) if mobile testing reveals support gaps. Phase A's Unit B should have addressed this; if not, it's a Phase B follow-up.
- **Sim-baseline regeneration is one-way.** Once you regenerate fixtures in step 6, the old behavior is gone. Be sure step 6's diff is intentional before committing the new fixtures.
