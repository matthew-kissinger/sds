# Cycle 4 Plan — Foundation for Rolling Hills + Pastoral Aesthetic + User Camera

> Cycle 4 Phase A planning artifact, written 2026-04-24. Originated as `~/.claude/plans/mellow-brewing-catmull.md` and ported into the repo on close-out so the working tree carries the intent that drove the parallel batch. Read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first if you are a cold-start agent picking up Phase B.

This is the **Phase A plan**. Phase A shipped as 11 parallel worktrees and PRs (Units B, C, D, F, G, H, I, J, K, L, M). Phase B is a sequential follow-up by the user — see [`cycle-4-phase-b.md`](cycle-4-phase-b.md). Splitting the work this way kept the parallel units mergeable in any order without conflicts and pushed all the y-sample regression surface into a single sequential PR.

## Context

Sheep Dog Simulator was on Three.js 0.181 with a flat-plane terrain and a fixed isometric camera. Cycle 3 shipped the scene-as-data system — `shared/scenes/types.js` already declared `terrain.heightScale`, `grass.colors`, `sky.preset`, `fog`, but no consumer read them yet. The Rolling Hills scene literally had `heightScale: 0 // Rendered flat until BiomeBuilder gets height displacement` ([shared/scenes/rolling-hills.js:45](../shared/scenes/rolling-hills.js)).

User wanted:
1. **Rolling hills implemented properly** (heightfield terrain) — critical for biome variety.
2. **Open-field herding scene** (no perimeter fences, gates on terrain features) — "Free Shepherd"-style pastoral feel.
3. **User-controlled camera** — current isometric makes the dog look small/distant; need a close-up follow cam plus a free orbit cam, while preserving the classic isometric as the default.
4. **Modernization** — Three.js 0.184, GLB compression, grass polish, dead-code cleanup.
5. **Reuse Terror in the Jungle's atmosphere primitives** — sibling repo on Three.js 0.184 has a Hosek-Wilkie sky shader, preset system, and baked-height provider that port well.

**Phase A (this batch) ships the foundation as parallel units: standalone modules, asset pipeline, schema, polish, camera. Phase B (sequential follow-up by user) integrates the heightfield into TerrainBuilder/GrassSystem/sheep/dog and wires Atmosphere into the render path.** Splitting it this way keeps the parallel work mergeable in any order without conflicts.

## Aesthetic direction

Pastoral English-countryside herding sim. Warm, slightly desaturated palette. Soft golden-hour or dusk lighting on new biomes; light retune of Home Field so it harmonizes without disorienting returning players. Grass colors: warm yellow-greens at the base, deeper olive in the mid, hay-tipped tops. Fog: thin, warm, distance haze. Hosek-Wilkie analytic sky for accurate atmospheric scattering.

Reference: free-shepherd-style aesthetic (failed WebFetch — used genre conventions). Hosek-Wilkie sky from Terror in the Jungle drives 80% of the look.

## Work units (11 parallel)

Each unit is a separate worktree+PR. File ownership is non-overlapping where possible; flagged exceptions noted. Merge order at the bottom.

### Unit B — Deps + asset pipeline
**Files:** `package.json`, `package-lock.json`, `scripts/compress-glbs.mjs` (new), `scripts/bake-heightmap.mjs` (new), `assets/sheep.glb` and `assets/sheepdog/*.glb` and `assets/mountain*.glb` (regenerated), `public/terrain/field.r32f` (new flat baseline), `public/terrain/rolling-hills.r32f` (new fBm), `public/terrain/open-country.r32f` (new fBm), `public/terrain/*.json` (manifests with bounds + version).
**Change:** Bump `three` 0.181 → 0.184. Add devDeps: `@gltf-transform/cli`, `@gltf-transform/core`, `@gltf-transform/functions`, `simplex-noise`. Two new Node scripts. Regenerate GLBs with Draco + Meshopt (gltfpack equivalent via gltf-transform). Bake three R32F heightmaps (3-octave ridged fBm, 6m amplitude for hills, flatten 40m around farmhouse).
**Conflicts:** None — owns package.json fully. (A+B merged per Plan agent — lockfile conflict avoided.)
**Smoke:** `npm install && npm test && npm run build`. Spot-check GLB sizes shrunk and `public/terrain/*.r32f` exist with correct byte length (1024×1024×4 = 4194304).

### Unit C — Scene schema typedefs
**Files:** `shared/scenes/types.js` only.
**Change:** Add `terrain.heightmapUrl?: string`, `terrain.version?: number`. Refine `GrassDef.colors` to a typed `{base, mid, tip}` object. Widen `SkyDef.preset` enum: `'pastoral-noon' | 'dusk' | 'overcast' | 'dawn' | 'golden-hour'`. JSDoc only — no runtime code change.
**Conflicts:** None.
**Smoke:** `npm run build` (Vite type-check via JSDoc).

### Unit D — Heightfield runtime module
**Files:** `shared/terrain/Heightfield.js` (new), `shared/terrain/index.js` (new), `tests/heightfield.spec.js` (new).
**Change:** Pure ES module + JSDoc. `class Heightfield` with `static async load(url, manifest) → Heightfield`, `sample(x, z) → number` (bilinear), `normal(x, z) → {x,y,z}` (finite differences, ε=1m), `getRawArray()`. Pattern from [terror-in-the-jungle/src/systems/terrain/BakedHeightProvider.ts](../../X/games-3d/terror-in-the-jungle/src/systems/terrain/BakedHeightProvider.ts) but TS → JS. Vitest tests: known fBm output, bilinear interpolation correctness, edge sampling, normal direction sanity.
**Conflicts:** None — new directory. NOT wired to consumers yet (Phase B).
**Smoke:** `npm test` runs new spec.

### Unit F — Open-country scene
**Files:** `shared/scenes/open-country.js` (new), `shared/scenes/index.js` (one import + one registry line).
**Change:** New biome. Bounds ±150m (larger than Home Field's ±100). NO perimeter fences (no `pasture` walls — gates float on terrain). Three free-standing gates spaced across the field. Sheep spawn scattered (`spreadRadius: 80`, `count: 200`). `terrain.heightmapUrl: '/terrain/open-country.r32f'`, `terrain.heightScale: 5`, `terrain.version: 1`. `sky.preset: 'golden-hour'`. `fog: { color: '#e8d8b8', near: 250, far: 800 }`. `grass.colors: { base: '#7a8a4e', mid: '#a8b870', tip: '#d8d088' }`. Allowed modes: cooperative, timed.
**Conflicts:** Unit F's `index.js` registry edit and Unit B's `public/terrain/open-country.r32f` bake are linked — F merges *after* B.
**Smoke:** `npm run build && npm run dev:client`, hit `http://localhost:3000/?scene=open-country`, verify scene loads (visual heightfield deferred to Phase B; this just verifies sim/registry path).

### Unit G — Procedural mountain module (standalone)
**Files:** `js/ProceduralMountains.js` (new), `js/shaders/proceduralMountainsShader.js` (new — inline GLSL via template literal).
**Change:** `class ProceduralMountains` with `addToScene(scene, { innerRadius, outerRadius, peakHeight, sunDir })`. Ridged-FBM displaced ring-plane (~64 radial × 128 circumferential). Vertex shader does the displacement using inline Ashima simplex noise. Fragment: snow above height threshold, rock below, aerial perspective blend toward fog color. NOT wired into TerrainBuilder yet — pure module exposure.
**Conflicts:** None.
**Smoke:** `npm run build` — module compiles, no consumers.

### Unit H — TerrainBuilder polish (dead-code delete)
**Files:** `js/TerrainBuilder.js` only.
**Change:** Delete `createGrassLegacy()` at lines 433–597 (165 lines, never called). That's it. Per recon, the "frustum-cull self-contradiction" at line 818 is intentional manual LOD at lines 1140–1202 — leave it alone. Poisson tuning deferred to Phase B (better with K+I rendered).
**Conflicts:** None.
**Smoke:** `npm test && npm run build && npm run dev:client`, `?scene=field`, verify game still renders identically.

### Unit I — GrassSystem polish
**Files:** `js/GrassSystem.js` only.
**Change:** Four additive tweaks — (a) per-blade hash hue variation in vertex shader: `hue += hash(instanceID) * 0.04`. (b) Rim-light on tips in fragment: `pow(dot(viewDir, blade_up), 4.0) * tipColor * 0.6`. (c) Replace LOD stub at lines 932–951 with real per-chunk instance-count scaling (50% at >40m, 25% at >80m). (d) Read `sceneGrass.colors.base/mid/tip` (already passed to constructor) into the existing baseColor/midColor/tipColor uniforms instead of hardcoded defaults.
**Conflicts:** None. Constructor already accepts `sceneGrass`.
**Smoke:** `npm run build && npm run dev:client`, `?scene=field`, verify grass still renders, hue variation visible at close range.

### Unit J — Atmosphere module (port from Terror in the Jungle)
**Files:** `js/atmosphere/HosekWilkieSky.js` (new), `js/atmosphere/skyShader.glsl.js` (new), `js/atmosphere/skyPresets.js` (new), `js/atmosphere/Atmosphere.js` (new).
**Change:** Port [HosekWilkieSkyBackend.ts](../../X/games-3d/terror-in-the-jungle/src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts) to JS+JSDoc. Port the GLSL shader verbatim (it's already vanilla GLSL). Port [ScenarioAtmospherePresets.ts](../../X/games-3d/terror-in-the-jungle/src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts) — extract presets matching the SkyDef enum from Unit C (pastoral-noon, dusk, overcast, dawn, golden-hour). Add fog multiplier table from [WeatherAtmosphere.ts](../../X/games-3d/terror-in-the-jungle/src/systems/environment/WeatherAtmosphere.ts). Top-level `class Atmosphere { constructor(scene), applyPreset(presetName), updateSun(elevation, azimuth) }`. NOT wired to main.js or SceneManager — Phase B.
**Conflicts:** None — all new files in new directory.
**Smoke:** `npm test && npm run build` — module compiles, no runtime consumers.

### Unit K — Scene aesthetic config
**Files:** `shared/scenes/field.js`, `shared/scenes/rolling-hills.js`.
**Change:** Light retune for Home Field — set `grass.colors: { base: '#5a7a3e', mid: '#8aa860', tip: '#c4d68c' }`, soften `fog: { color: '#cfd9e8', near: 220, far: 700 }`, `sky.preset: 'pastoral-noon'`. Full pastoral on Rolling Hills — set `terrain.heightmapUrl: '/terrain/rolling-hills.r32f'`, `terrain.version: 1`, dusk-warm `grass.colors: { base: '#6a7038', mid: '#9a9858', tip: '#e8c878' }`, `sky.preset: 'dusk'`, denser warm `fog: { color: '#d8b888', near: 180, far: 600 }`.
**Conflicts:** Logical dep on Unit C (must merge first — uses widened SkyDef enum) and Unit B (heightmap URLs reference baked files). Land after C and B.
**Smoke:** `npm run build && npm run dev:client`, hit `?scene=field` and `?scene=rolling-hills`, verify both load without console errors. Visual atmosphere change waits for Phase B (Atmosphere wiring).

### Unit M — User-controlled camera system
**Files:** `js/CameraController.js` (new), `js/SceneManager.js` (extract camera state, leave pass-throughs), `js/InputHandler.js` (right-mouse-drag handler + `C` hotkey for cycle), `js/MobileControls.js` (two-finger drag gesture for free-cam yaw), `js/GamepadManager.js` (right-stick X → yaw delta), `js/main.js` (instantiate CameraController, route updates), `js/components/SettingsPanel.js` or equivalent (3-way camera mode picker).
**Change:** Extract all camera-related state from SceneManager into `class CameraController`. Three modes:
- **Classic** (default): preserves current isometric exactly. Distance 80, height 60, no rotation.
- **Follow** (NEW close-up cinematic): distance=22, height=11, lookAtHeight=1.5, lookAhead=`4 * speedNorm` along dog facing, yawLagTau=0.35s, posLagTau=0.15s. Frame-rate-independent smoothing using same `1 - Math.pow(1 - alpha, dt*60)` pattern.
- **Free** (yaw + zoom orbit): mouse-drag (right-button + move) on desktop, two-finger drag on mobile, right-stick on gamepad. Pitch fixed at Follow's pitch. Existing zoom retained. Snap freeYaw to Follow yaw on mode switch (no jump-cut).

`CameraController` API: `setMode(CameraMode.X)`, `applyYawDelta(rad)`, `setZoom(d)`, `update(dogPos, dogFacing, dt)`, `transformMovement(dir)`, `setCompetitiveDirection(dir)`, `reset()`. SceneManager keeps `getCamera()` (used widely), and gets thin pass-throughs for legacy methods (`setCompetitiveCameraPosition`, `transformMovementForCompetitive`, etc.) so main.js call sites don't need rewriting. Settings UI: 3-way radio. Hotkey `C` cycles modes.

**Conflicts:** Largest unit by file count, but no other unit touches any of these files (verified). M lands last to minimize rebase pressure.
**Smoke:** `npm run build && npm run dev:client`, manually cycle through Classic/Follow/Free with `C`, drag to rotate in Free mode, verify dog stays framed in Follow.

### Unit L — Documentation
**Files:** `docs/cycle-4-plan.md` (new — content of this plan), `docs/cycle-4-phase-b.md` (new — Phase B integration plan), `DECISIONS.md` (Cycle 4 entry), `ARCHITECTURE.md` (camera section, atmosphere section, heightfield section), `NEXT_SESSION.md` (Phase A → Phase B handoff).
**Change:** Documentation only. Lands last so it reflects reality.
**Conflicts:** None.
**Smoke:** `npm run build` (verifies no broken markdown links if Vite is configured to scan).

## Merge order

```
1. B               — deps + assets (everything downstream may reference)
2. C               — schema (K depends on enum)
3. D, G, J         — pure new modules (any order, parallel)
4. F               — uses B's open-country.r32f, edits scenes/index.js
5. K               — uses C's enum + B's heightmap URLs
6. H               — TerrainBuilder dead-code delete
7. I               — GrassSystem polish (reads K's grass.colors)
8. M               — camera refactor (largest, lands last to absorb any rebases)
9. L               — docs reflect merged reality
```

## Phase B (out of scope, follows Phase A)

Single sequential PR, NOT another /batch. Reasons: shared regression surface (y-sample bugs make dog float, sheep sink, grass clip), and many consumers touch the files Phase A's M/H/I just rewrote.

Phase B work:
1. **TerrainBuilder vertex displacement** from `Heightfield` (~30 LOC at TerrainBuilder.js:291).
2. **GrassSystem y-sample** so blades sit on terrain (existing constructor extension).
3. **OptimizedSheep + Sheepdog y-clamp** (per-step heightfield sample for boid + dog).
4. **Atmosphere wiring** — instantiate in main.js, call `atmosphere.applyPreset(scene.sky.preset)` from scene-load path; SceneManager loses its hardcoded `scene.background` + `scene.fog`.
5. **ProceduralMountains wiring** — TerrainBuilder calls `new ProceduralMountains().addToScene(...)`, replacing the prop ring.
6. **Slope-modulated sheep speed** (`max(0.6, 1 - slope.y * 2)`).
7. **Prop placement on terrain** — trees/rocks/fences query `Heightfield.sample` once at placement.
8. **Camera y-clamp** in Follow/Free — sample heightfield to keep camera above ground.

Full sequential plan: [`cycle-4-phase-b.md`](cycle-4-phase-b.md).

## E2e test recipe (per unit)

Workers run from their isolated worktree:

```bash
# Always run:
npm install
npm test                          # vitest unit + sim baseline
npm run build                     # vite build, catches import/JSX errors

# For units that touch the render path (B, F, H, I, K, M):
npm run dev:client &
sleep 5
curl -s http://localhost:3000/ | grep -q "Sheep Dog" && echo "PASS"
pkill -f "vite --port 3000" || pkill -f vite
```

Playwright e2e is configured but lacks baseline screenshots — skip for this batch. If `npm test` in a `shared/`-touching unit triggers `tests/sim-baseline/` failures, regenerate fixtures with `UPDATE_FIXTURES=true npm test` ONLY after manually verifying the sim diff is intentional.

## Worker prompt template

Each spawned agent received a self-contained prompt. The shared template:

```
You are implementing Cycle 4 Unit <ID> for Sheep Dog Simulator
(C:\Users\Mattm\X\games-3d\sds, on branch main, Three.js game).

# Goal
<one sentence>

# Files you own — touch ONLY these
- <absolute path>
- <absolute path>

# Files you MUST NOT touch
<list of "shared but not yours" files relevant to this unit's neighbors>

# Dependencies (these units must merge before you start)
<list of unit IDs, or "none">

# Design constraints
<2-5 bullets specific to this unit>

# Reference
<files to read first to understand patterns>
- For ports from Terror in the Jungle: C:\Users\Mattm\X\games-3d\terror-in-the-jungle\<path>

# Out of scope (do NOT do — belongs to Phase B)
<critical for D, G, J, which are intentionally unwired>

# Acceptance
- All existing tests pass: npm test
- New tests (if applicable): <test names>
- Build clean: npm run build
- Visual smoke (if render path): dev server boots, /?scene=<id> loads

After finishing:
1. Invoke Skill tool with skill: "simplify"
2. Run npm test, npm run build (fix failures)
3. Visual smoke if applicable
4. Commit, push, gh pr create with descriptive title
5. End your final message with: PR: <url>
```

## Verification

Each unit's worker handles its own verification per the e2e recipe. After all units merge:
1. `npm install && npm test && npm run build` clean from a fresh checkout.
2. Boot `npm run dev:client`, cycle through `?scene=field`, `?scene=rolling-hills`, `?scene=open-country`. All three load, sim runs, sheep flock, dog moves.
3. Cycle camera modes (`C` key). Classic looks identical to today. Follow frames the dog cinematically (clearly visible against background). Free orbits with right-mouse-drag.
4. Aesthetic check: Home Field looks softer/warmer but recognizable. Rolling Hills is dusk-toned. Open Country is golden-hour with no fences.
5. Phase B begins as a separate PR by the user. See [`cycle-4-phase-b.md`](cycle-4-phase-b.md).
