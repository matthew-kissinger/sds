# Cycle 5 — Island + Woods

> Drafted 2026-04-25 after Cycle 4 Hardening landed clean. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Cycle 4 history: [`cycle-4-hardening.md`](cycle-4-hardening.md), [`cycle-4-phase-b.md`](cycle-4-phase-b.md), [`cycle-4-plan.md`](cycle-4-plan.md).

## Goal

Give Rolling Hills and Open Country distinct game loops by introducing a shared **island boundary** primitive (water-bounded play area) and treating trees in Open Country as navigable terrain rather than decoration.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, scene schema, where new code slots into the existing module map) and the *acceptance criteria* per phase, **not the implementation choices**. Several pieces — water rendering, boid tuning at the bigger island scale, tree-collider data structure — have multiple legitimate solutions. Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem (water shaders, large-area boid optimization, navigation around static obstacles, etc.) before writing code. The Three.js + WebGL ecosystem has evolved fast; what was "the" solution in 2024 may not be optimal in 2026.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing. The repo already has `PerformanceMonitor` + per-system triangle breakdown — use it.
- **Pick the simplest thing that meets the budget** rather than the most impressive. If a single textured plane reads as water, ship it; if it doesn't, escalate to a wave shader. Don't escalate prophylactically.

The phase outlines below describe **what** each step lands and **how it integrates** with the rest of the codebase. Where they suggest a specific technique, treat it as a starting point for research, not the final answer.

After Cycle 5, the three scenes have clearly different registers:

| Scene | Boundary | Goal | Register |
|---|---|---|---|
| **Field** | Rectangular fence | Through gate into pen | Pastoral / classic — unchanged |
| **Rolling Hills** | Island (water) | Into corral | Patience + navigation; find the goal |
| **Open Country** | Island (water) | Through gate into pen | Wilderness round-up; flush sheep from the woods |

The shared piece is the island boundary in `shared/MovementPhysics.js` + `shared/BoundaryCollision.js`. The differentiation between the two new scenes is what's *inside* the island: Rolling Hills is open meadow with a single corral; Open Country is rolling meadow that gives way to woodland zones the sheep can wander into.

## Architecture decisions (research spike, 2026-04-25)

Load-bearing decisions made after the Phase 1 research spike. Treat as fence-frozen for the duration of Cycle 5 — reopening requires explicit user re-authorization.

### Sim / render collision split

- **Sim collisions** (sheep + dog vs world) run on both client and Worker for multiplayer determinism. The Worker has no camera. Camera-frustum culling is **not** valid for sim — all collisions are camera-agnostic.
- **Render-only effects** (grass interaction, particle emission, audio attenuation, mesh draw calls) **may** be camera-culled. The existing 3-quad far-tree impostor swap at 250m is the canonical example and stays.

### Proxy collider primitive: SceneObstacles

Visual meshes are decoration; the sim sees only logical shapes. Lives in `shared/SceneObstacles.js` so the Worker imports the same data without pulling Three.js geometry types.

| Object | Proxy shape |
|---|---|
| Tree trunk | 2D circle `{x, z, radiusXZ}` |
| Rock | 2D circle `{x, z, radiusXZ}` |
| Building (farmhouse) | AABB |
| Fence | line segment (existing handling preserved) |
| Water | boundary primitive (radial island force), **not** a mesh-level collider |

Trees and rocks index into a **`kdbush`** (static k-d tree, ArrayBuffer-transferable, ~1.4kb gzipped, deterministic if input is canonically sorted by `(x, z)`). Buildings are a small AABB array, brute-forced. Per-tick cost on RTX 3070: <0.1ms total; on mid-tier mobile: <0.4ms.

**Why not three-mesh-bvh?** Wrong tool — BVH-build is multi-second on hundreds of thousands of triangles, traversal-order isn't documented as deterministic across V8 versions, and this is a 2D-circle problem, not a 3D-triangle-raycast problem.

### Water rendering: anime / cel-shaded

Single `ShaderMaterial` (no Reflector, no second scene render). Stack:

- Shared depth render-target at SceneManager level (half-res on mobile, `highp` depth sampler for iOS precision parity)
- Two-band depth color (shallow turquoise → deep navy) via depth-diff sampling
- **Sharp** shoreline foam via depth-diff + `step()` (anime hard-edge — explicitly *not* `smoothstep`), modulated by scrolling voronoi so the edge breathes
- Painted ripples: 2 octaves animated simplex noise, `step()`-quantized into albedo (no normal map)
- Cel sparkles: quantized Blinn `step()` masked by high-frequency simplex (twinkle in patches, not uniform)
- Fog match via Three.js `<fog_fragment>` chunk → atmosphere already drives `scene.fog` color → free
- Pure `ShaderMaterial`, skip `<colorspace_fragment>`, author colors in linear, write `gl_FragColor` raw (avoids tonemap double-apply)

Cost: ~0.35ms desktop, ~1.3ms mobile (half-res depth). Alternative (`examples/jsm/objects/Water.js`) rejected — Reflector pass costs ~3-6ms on Adreno 730, blowing the mobile budget for an effect (reflections) we don't need.

References: [Codrops 2025 stylized water](https://tympanus.net/codrops/2025/03/04/creating-stylized-water-effects-with-react-three-fiber/), [romulolink/threejs-water-shader-with-foam](https://github.com/romulolink/threejs-water-shader-with-foam), [Daniel Ilett — Stylised Water in URP](https://danielilett.com/2020-04-05-tut5-3-urp-stylised-water/) (algorithm-level, language-agnostic).

## Decisions (was: open questions)

Locked 2026-04-25.

| # | Question | Decision | Rationale |
|---|---|---|---|
| Q1 | Rolling Hills corral placement | **Off-centre at `{x: 50, z: 30}`** with tall flag/pillar for visibility; CorralCompass HUD kicks in when off-screen | Off-centre rewards exploration; flag prevents the "where is it" dead-end |
| Q2 | Open Country pen placement | **Coastal (north shore)** — keep existing gate at `gate.position.z = 130`, pasture at `centerZ = 145` | "Drive sheep from forest to coastal pen" reads cleanly; pen anchors compass |
| Q3 | Tree-as-obstacle resolution | **Per-trunk via kdbush** (see Architecture decisions) | Static obstacles + 2D-circle math = kdbush is optimal; ~1.4kb dep |
| Q4 | Water behaviour at shore | **Soft inward force inside falloff zone, hard clamp at `radius`** | Falls naturally out of radial smoothstep; consistent with rect margin model |
| Q5 | Dog and water | **Same rules as sheep** — water-bounded for all entities | Keeps playfield definition simple; no "dog can swim" feature creep |
| Q6 | Open Country camera default | **`defaultCamera: 'follow'`** matching Rolling Hills | Follow makes woodland depth read; Classic top-down loses too much

## Architecture: shared boundary primitive

Today, `shared/scenes/types.js` has `bounds: { minX, maxX, minZ, maxZ }` baked in as the only boundary shape. `BoundaryCollision.calculateBoundaryAvoidance` reads it directly.

Cycle 5 introduces a discriminated `boundary` field on `SceneDef`:

```js
// existing (rect)
boundary: { kind: 'rect', minX: -100, maxX: 100, minZ: -100, maxZ: 100 }

// new (island)
boundary: { kind: 'island', center: { x: 0, z: 0 }, radius: 90, falloff: 15 }
```

For backwards compatibility, if `boundary` is absent we synthesise `{ kind: 'rect', ...scene.bounds }`. Field stays on `rect`; Rolling Hills and Open Country migrate to `island`.

The contract `BoundaryCollision.calculateBoundaryAvoidance(entity, boundary, config)` switches on `boundary.kind`. Worker `GameSim.js` and `shared/index.js createGameState` consume the same function — no client-only logic.

Heightmap re-bake (`scripts/bake-heightmap.mjs`) gains a `--boundary island --radius N --falloff M` set of flags. The bake applies a smoothstep radial falloff so terrain altitude drops below sea level outside `radius - falloff`. Keeps the existing `peakHeight` / `seed` knobs.

A single `WaterPlane` lives in `TerrainBuilder` next to `createTerrain` — solid colour + scene fog + tiny normal-map ripple via existing atmosphere uniforms. No reflections in v1; revisit if the visual feels flat.

## Phase 1 — Shared foundation (~4 hr — revised post research spike)

**Independently testable. Land before all other phases.**

### Fence authorization

This phase modifies frozen files (per [INTERFACE_FENCE.md](INTERFACE_FENCE.md)). Authorization scope:

- **`shared/scenes/types.js`** — add optional `boundary: { kind: 'rect' | 'island', ... }` field. Backwards-compat: if `bounds` present and `boundary` absent, synthesise `{ kind: 'rect', ...scene.bounds }` in `createGameState`. Field stays on `bounds` this phase.
- **`shared/BoundaryCollision.js`** — function signatures change from `(entity, bounds, gate, config)` to `(entity, boundary, gate, config)`. Internal dispatch on `boundary.kind`. **Rect path math preserved bit-identical** to keep sim-baselines stable.
- **`shared/MovementPhysics.js`** — minimal: consumes new boundary via dispatch; rect path unchanged.
- **`shared/index.js`** — `createGameState` returns `gameState.boundary` alongside `gameState.bounds` (compat).

Consumers updated in this phase: `worker/src/GameSim.js` (3 call sites: lines 355, 517, 548), `tests/sim-baseline/harness.js` (2 call sites: lines 200, 237; line 298 also passes `gameState.bounds` — verify whether it needs to migrate).

**Sim-baseline acceptance:** harness rect path must produce bit-identical traces to the pre-Phase-1 captures. If baselines fail, the rect dispatch is broken — **fix the dispatch, do not regenerate fixtures**.

### Sub-tasks (~4 hr total)

1. **Schema (~30m)** — Extend `shared/scenes/types.js` JSDoc with the discriminated `boundary` field. Add backwards-compat synthesis in `createGameState` ([shared/index.js](../shared/index.js)). Field stays on `bounds`; Rolling Hills + Open Country migrate in Phases 2/3.

2. **BoundaryCollision API (~60m)** — Rename `calculateBoundaryAvoidanceWithGate(entity, bounds, ...)` → `calculateBoundaryAvoidanceWithGate(entity, boundary, ...)`. Same for `applyHardBoundaryConstraints`. Internal dispatch on `boundary.kind`:
   - **`'rect'`:** existing math, byte-for-byte preserved. **No smoothstep upgrade** — rect today is linear `(margin - distance) / margin`; keep it that way to protect baselines. If we want to align rect with island feel later, that's a separate cycle with explicit baseline regen.
   - **`'island'`:** new branch. Radial distance from `boundary.center`. Inside `radius - falloff`: zero force. Between `radius - falloff` and `radius`: smoothstep-ramped inward force toward center. At `radius`: hard clamp via `applyHardBoundaryConstraints`'s island branch.

3. **Call site updates (~30m)** — 3 sites in `worker/src/GameSim.js`, 2-3 sites in `tests/sim-baseline/harness.js`, `createGameState` field name. Plus audit fence-collision logic for any direct `bounds` coupling and migrate alongside (R9).

4. **Heightmap bake (~90m)** — Extend `scripts/bake-heightmap.mjs` with `--boundary island --radius N --falloff M --seaLevel S` (default `seaLevel = -2`). Apply radial smoothstep falloff using the same math shape as the existing farmhouse-area falloff (line 119–121: `t * t * (3 - 2 * t)`). Existing default behaviour (no flag) unchanged. After landing: re-run `npm run bake-heightmaps` — should produce identical r32f files for all three scenes (Phases 2/3 will swap the flags later).

5. **SceneObstacles primitive (~45m)** — New `shared/SceneObstacles.js` with `buildSceneObstacles(scene)` returning `{ trees, rocks, buildings }` where trees/rocks are `kdbush` instances and buildings is `AABB[]`. **Canonical sort by `(x, z)` before kdbush build** for cross-V8 determinism. Tree/rock entries shaped `{x, z, radiusXZ}`. Phase 1 can ship empty stubs; Phase 3 populates trees, Phase 2 populates corral structure. Add `kdbush` to `package.json` (~1.4kb). Document the sort-then-build contract in `INTERFACE_FENCE.md`.

6. **Anime water shader (~60m)** — `js/water/AnimeWater.js`. Single `ShaderMaterial`, `UniformsUtils.merge([UniformsLib.fog, custom])`, `material.fog = true`, `<fog_pars_fragment>` + `<fog_fragment>` chunks injected. Components per the Architecture-decisions stack (depth two-band, sharp `step()` foam, simplex ripples, cel sparkles, `highp sampler2D` on depth uniform). Stub renders in Field at zoom-out for fog-match validation; Phase 2/3 enables per-scene with `boundary.kind === 'island'`.

7. **Depth render-target plumbing (~30m)** — `js/SceneManager.js` owns a single `WebGLRenderTarget` with `depthTexture` (declared `highp`). Half-res on mobile via `setSize(w/2, h/2)`. Render scene-without-water once per frame; water samples in main pass. Add line item to `PerformanceMonitor` breakdown. HMR teardown handler so the renderer-bound depth texture doesn't leak across reloads.

8. **Z-fighting fix (~15m)** — Water plane at `y = -0.05`, terrain material gets `polygonOffset: true, polygonOffsetFactor: 1` at the falloff edge. Visual verify on Field (stub water) at maximum zoom-out — no shimmer at any camera angle.

9. **Tests (~30m)** — `tests/island-boundary.spec.js`: entity at `(95, 0)` on `radius=90 falloff=15` island gets pushed inward; entity at `(50, 0)` unaffected; rect path unchanged for Field's `bounds`. `tests/scene-obstacles.spec.js`: `buildSceneObstacles` produces stable kdbush ordering across two builds with identical input (deterministic-sort assertion).

### Acceptance

- 76+ vitest specs pass (74 existing + 2 new) — no baseline regen required
- Sim-baseline traces bit-identical to pre-Phase-1 captures
- `npm run bake-heightmaps` produces identical r32f files (no flag changes for existing scenes yet)
- Field loads and plays identically (visual + functional)
- Stub anime water plane renders fog-matched in Field (visual check at multiple atmosphere presets)
- iOS Safari visual: foam edge sharp, no precision divergence vs desktop
- Production build clean
- `kdbush` added to `package.json`, bundle delta ≤ 2kb gzipped

### Confirm before Phase 1 starts

- **R10 audited 2026-04-25:** No prerequisite needed for Phase 1. Client (`js/GameState.js OptimizedSheepSystem`) and Worker (`worker/src/GameSim.js generateInitialSheepPositions`) use entirely different sheep-spawn paths and never both run for the same game (Worker authoritative in MP, client solo only). The seeded-RNG concern surfaces in Phase 3 instead — see R10 in the Risks table below.

## Phase 1.5 — Boid behaviour at island scale (~1.5 hr, gates Phase 2 + 3)

The current boid tuning (separation distance, neighbour radius, max speed, cohesion strength) was set for a 200×200 m rectangular field with ~200 sheep. Rolling Hills's 180 m island is similar; Open Country's 300 m island is **2.25× the area** with the same sheep count. Without re-tuning, expect:

- **Cohesion under-reaches** — flocks fragment into too many small groups across the bigger area.
- **Separation over-fires** — sheep spread thin and never form recognisable mobs.
- **Boundary repulsion conflicts with island falloff** — the soft inward island force interferes with the existing edge-repulsion, can produce circling.

Don't guess at numbers. The agent picking this up should:

1. **Research current best practice** for boid simulations at this scale. Reynolds's original paper is 1987; there's been a lot of work since on multi-resolution flocking, perception-radius scaling, and neighbour selection (k-nearest vs radius). Start from current literature, not from the existing tuning.
2. **Profile current behaviour** on Rolling Hills + Open Country with the new boundary in place but stock boid params. Note specifically: cluster count over time, average flock size, mean speed, frequency of full-flock-vs-shore collisions.
3. **Tune iteratively** with the existing `tests/sim-baseline/` as a regression backstop for *Field* (which keeps stock params). New scenes get scene-specific overrides on `FlockingAlgorithms` config — add a `flocking` field to `SceneDef` so Field stays untouched.
4. **Acceptance** is qualitative: "the flock reads as a single coherent group on Rolling Hills's 180 m island, and as 2-3 loose groups on Open Country's 300 m woodland." Numbers are secondary; if a playtest video looks right, the tuning is right.

Land this **after** Phase 1 (need the island boundary in place to tune against) and **before** Phases 2 + 3 ship (because both depend on the flocking feeling right). Output is one PR that adds the `flocking` scene-def override and ships per-scene tuning numbers.

## Phase 2 — Rolling Hills as island (~3 hr)

**Depends on Phase 1.** All client-side; sheep boundary picks up the island automatically via shared sim.

1. **Re-bake `rolling-hills.r32f`** with `--boundary island --radius 90 --falloff 15 --peakHeight 6 --seed 1`. The island is centred at origin with peak height 6 m, falling to sea level past 75 m radius (with smoothstep until 90 m). Diameter ~180 m fits comfortably inside the existing playArea zone (-100..100).
2. **Scene def:** [shared/scenes/rolling-hills.js](../shared/scenes/rolling-hills.js). Replace `bounds` with `boundary: { kind: 'island', center: { x: 0, z: 0 }, radius: 90, falloff: 15 }`. Add `defaultCamera: 'follow'` (Q6 confirmed). Replace `gate + pasture` with `corral: { center: { x: 50, z: 30 }, radius: 6 }` (Q1: off-centre, north-east of island origin).
3. **Corral build:** [TerrainBuilder.js](../js/TerrainBuilder.js) reads `scene.corral` and calls `FencePresets.createPenStructure` + `createGateStructure` anchored at the corral centre. Existing pen structure reused — no new mesh work. Add a tall flag/pillar so the corral is findable from the far shore.
4. **Win condition:** [shared/GameStateValidation.js](../shared/GameStateValidation.js) gains a `corral` branch. Existing pasture-containment math reused — just point at `corral.center, corral.radius` instead of the rectangular `pasture`. Falls back to gate-passage when `scene.corral` absent (Field unchanged).
5. **Wayfinding HUD:** new component `js/components/GameHUD/CorralCompass.js`. Renders an arrow on the screen edge pointing at the corral when off-screen, plus distance label. Append to the same HUD layer as `SheepCounter` / `MobileHUD`. Mobile-friendly (corner badge, not centre).
6. **Default camera mode** wired through [SettingsPanel.js loadCameraMode](../js/components/StartScreen/SettingsPanel.js): if no localStorage preference, fall back to `scene.defaultCamera || 'classic'`.
7. **Atmosphere tune:** Rolling Hills currently runs `dusk` preset with warm fog. Confirm dusk reads correctly with water (sky horizon → water colour match should already work post-Hardening). Adjust fog colour/distance if water plane introduces a visible mismatch.

**Acceptance:** scene loads, sheep stay on the island and avoid the shore softly, dog can't leave the island, corral is visible with a flag, herding sheep into the corral fires the win event, off-screen corral renders an HUD compass arrow. Rolling Hills no longer has the field-style perimeter fence.

## Phase 3 — Open Country as woods + island (~4 hr)

**Depends on Phase 1.** Phase 2 is independently shippable; this phase doesn't depend on it.

1. **Re-bake `open-country.r32f`** with `--boundary island --radius 150 --falloff 30 --peakHeight 5 --seed 42`. Larger island than Rolling Hills (300 m diameter vs 180 m) — gives the woods room to read as terrain.
2. **Scene def:** [shared/scenes/open-country.js](../shared/scenes/open-country.js). Replace `bounds` with `boundary: { kind: 'island', center: { x: 0, z: 0 }, radius: 150, falloff: 30 }`. Set `perimeterFence: false` stays (no fence). Add `defaultCamera: 'follow'`. Keep `gate + pasture` at the north shore (`gate.position.z = 130`, `pasture.centerZ = 145`) — Q2 confirmed: pen at the shoreline reads cleanly. The pen anchors the player's compass and gives the woods a "rough country" register.
3. **Woods zones:** add a new field `woodsZones: [{ center, radius, density }]` to the scene def. Two or three woodland clusters scattered across the island. [TerrainBuilder.createTrees](../js/TerrainBuilder.js) reads these and biases tree placement: high density inside woods zones, low density elsewhere, none in the immediate pen footprint. Existing Poisson-disk rejection logic stays for tree-on-rock and tree-on-pen exclusions.
4. **Trees as obstacles:** trees in woods zones become navigable obstacles for sheep + dog via the **SceneObstacles** primitive scaffolded in Phase 1 (Q3 decision: per-trunk via kdbush). API contract:
   - **Authoritative placement lifted into `shared/`** (R7): the Poisson-disk tree placement currently in [TerrainBuilder.createTrees](../js/TerrainBuilder.js) needs a deterministic `shared/TreePlacement.js` core that both client (for visual mesh placement) and Worker (for collision data) call with the same scene seed. Client wraps the result for visual; Worker calls `buildSceneObstacles` over the same point list.
   - **Collision query** is `kdbush.within(x, z, queryRadius)` per sheep per tick, scoped to perception radius (~30m). Static trees → build kdbush once at scene load. Canonical sort `(x, z)` before build (Phase 1 contract).
   - **Push-out math** lives in [shared/MovementPhysics.js](../shared/MovementPhysics.js): for each tree returned, if `dist(entity, tree) < entity.radius + tree.radiusXZ`, apply outward repulsion. Deterministic, runs identically on client and Worker.
   - **Acceptance:** sheep + dog navigate around individual trees without clipping in playtest; per-tick collision overhead ≤ 0.4 ms on RTX 3070 / ≤ 1.5 ms on mid-tier mobile (revised down from original plan budget — kdbush is faster than the worst-case data structure the budget assumed).
5. **Win condition:** keeps the existing gate-passage + pasture-containment from Field. No new branch needed.
6. **Atmosphere tune:** Open Country runs `golden-hour` preset. With the woods adding visual density, the existing FogExp2 density may need a slight pull-in so far trees don't read full-strength against bright sky. Tune in playtest, not blindly.
7. **Sheep distribution at spawn:** existing `sheepSpawn.pattern: 'scattered'` already spreads them. With woods present, some sheep will spawn inside woodland — that's the intended starting state ("flush them out of the trees"). No change needed unless playtest reveals stuck sheep.

**Acceptance:** scene loads, ~150 m diameter island with 2-3 visible woodland clusters, sheep navigate around individual trees without clipping, dog navigates around trees, sheep can be herded through the woods to the coastal pen, win event still fires on gate-passage. No fence around the perimeter — water replaces it.

## Phase 4 — Polish (~2 hr, optional)

These are nice-to-haves once Phases 1-3 land. Skip any that don't move the needle in playtest.

1. **Water shader v1.5:** subtle wave displacement (~5 cm amplitude, slow phase) + gentle horizontal foam ring at the shoreline driven by terrain-vs-sea-level distance. No reflections. Keeps the budget low.
2. **Shoreline audio:** quiet wave loop, attenuated by distance from nearest shore. Optional ambient layer in `AudioManager`.
3. **Bird/ambient SFX:** different birds for Rolling Hills (gulls? curlew?) vs Open Country (wood pigeons? jays?). Light differentiation.
4. **Mini-map:** if the woods make orientation hard, a corner mini-map showing the island silhouette + dog/sheep/pen positions. Don't build until playtest says it's needed.
5. **Pen/corral lighting:** subtle warm light at the pen at dusk (Rolling Hills) and golden hour (Open Country) to draw the eye. Existing atmosphere lighting may already do this — check first.

## What NOT to do

- **Don't add a fourth scene yet.** The whole point of Cycle 5 is finishing the loops on the three we have.
- **Don't rearchitect the camera or atmosphere systems.** Both are settled post-Cycle 4.
- **Don't add per-tree LOD work** (octahedral impostors etc.). That's [`cycle-4-hardening.md`](cycle-4-hardening.md) § 4 — defer until 3-quad billboards demonstrably fail in playtest.
- **Don't move sim logic out of `shared/`.** Tree colliders + island boundary both live in `shared/` so the Worker sim stays in lockstep.
- **Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed.** Phase 1 will alter sheep boundary behaviour for Rolling Hills + Open Country — the *baseline scene is Field*, which keeps `kind: 'rect'`, so baselines should still pass. If they don't, that's a sign Phase 1 broke the rect path — fix the bug, don't regenerate fixtures.

## Success criteria (cycle close)

- [ ] All three scenes load and play through to completion without console errors.
- [ ] Rolling Hills feels meaningfully different from Field — players self-report navigation/discovery as the dominant verb.
- [ ] Open Country feels like a wilderness — sheep meaningfully use the woods (hide there, scatter through them).
- [ ] No regressions on Field (`rect` boundary preserved, gate-passage win condition preserved).
- [ ] 74+ vitest specs pass (≥2 new for island boundary).
- [ ] Production build clean.
- [ ] Live on sheepdogsim.com via GH Actions.

## Risks + tasks

Surfaced from the 2026-04-25 research spike. Each risk has an owning phase and a concrete acceptance line.

| # | Risk | Severity | Phase | Task |
|---|---|---|---|---|
| R1 | API signature breakage cascade — `BoundaryCollision` rename touches 3 GameSim sites + 2-3 harness sites + `createGameState` field | High | 1 | All call sites updated in same PR; sim-baseline must be bit-identical post-merge — fix dispatch if not, do not regen |
| R2 | Win-condition refactor undersized — there is no "pasture-containment" function to reuse; corral is new code | Medium | 2 | Spec `updateSheepCorralRetirements` mirroring `updateSheepRetirements`; trigger = "sheep enters corral radius" (Q1 confirms off-centre placement) |
| R3 | `kdbush` determinism across V8 — must canonical-sort input | Medium | 1 | Sort by `(x, z)` before kdbush build in `buildSceneObstacles`; stability spec in `tests/scene-obstacles.spec.js`; document the contract in [INTERFACE_FENCE.md](INTERFACE_FENCE.md) under "deterministic sim core" |
| R4 | Water plane z-fighting at shoreline (coplanar with terrain falloff at y=0) | Medium | 1 | Plane at `y = -0.05`, terrain mat `polygonOffset: true, polygonOffsetFactor: 1` at falloff edge; visual verify on Field at all zoom levels |
| R5 | Depth pre-pass cost not in original budget — anime water needs scene depth | Medium | 1 | Single SceneManager-level `WebGLRenderTarget`, half-res on mobile; line item in `PerformanceMonitor`; HMR teardown handler |
| R6 | iOS depth precision divergence — foam thickness varies without explicit `highp` | Low (visual) | 1 | Declare `uniform highp sampler2D uDepthTexture`; iOS Safari visual check before phase close |
| R7 | Obstacle data drift between client (Poisson placement) and Worker (no Three.js) | High (silent) | 3 | Lift Poisson-disk core into `shared/TreePlacement.js`; client + Worker call same generator with same seed; obstacle list flows from there into `buildSceneObstacles` |
| R8 | Heightmap bake closer to ~80 lines than "a few flags" — flatten zones, falloff math, default seaLevel | Low (scope) | 1 | Sub-task budgeted at 90m; existing farmhouse falloff (line 119–121) is the math template |
| R9 | Fence collision may couple to legacy rect `bounds` | Medium | 1 | Audit fence collision call sites; migrate alongside boundary refactor or document independence |
| R10 | Tree-placement RNG divergence between client + Worker — when Poisson placement lifts into `shared/` (R7), both sides must produce identical positions; raw `Math.random()` in `shared/` will diverge across V8 instances | High (silent) | 3 | Lift `mulberry32` from [tests/sim-baseline/harness.js:46-55](../tests/sim-baseline/harness.js) into `shared/Random.js`; new `shared/TreePlacement.js` accepts an explicit seed (scene.seed); both client + Worker call it with same seed; add a determinism spec asserting two builds with same seed produce identical kdbush ordering. **Audited 2026-04-25:** today's `generateInitialSheepPositions` uses raw `Math.random()` but is fine because client (`js/GameState.js OptimizedSheepSystem`) and Worker (`worker/src/GameSim.js`) use entirely different sheep-spawn paths — they never both spawn for the same game (Worker is authoritative in MP, client only runs solo). The drift only becomes a real risk when both sides independently generate the *same* dataset, which Phase 3 introduces with tree placement. |

## References

- [`shared/scenes/types.js`](../shared/scenes/types.js) — schema
- [`shared/BoundaryCollision.js`](../shared/BoundaryCollision.js) — where the island branch slots in
- [`shared/MovementPhysics.js`](../shared/MovementPhysics.js) — sheep/dog movement, calls into BoundaryCollision
- [`shared/index.js`](../shared/index.js) — createGameState, consumed by Worker
- [`scripts/bake-heightmap.mjs`](../scripts/bake-heightmap.mjs) — heightfield generator
- [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) — terrain mesh, trees, where WaterPlane + corral builds slot in
- [`js/components/GameHUD/`](../js/components/GameHUD/) — where CorralCompass lands
