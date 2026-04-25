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

## Open questions to resolve before writing code

1. **Rolling Hills corral placement:** centre of the island (visible from anywhere → easier wayfinding) or off-centre (harder, more discovery)? Author lean: off-centre at first, with a tall flag/pillar for visibility, and the wayfinding compass kicks in when off-screen.
2. **Open Country pen placement:** keep the existing gate+pen at one edge of the island (north shore feels natural), or move it inland? Author lean: keep at shore — the contrast of "drive sheep from forest to coastal pen" reads cleanly.
3. **Tree-as-obstacle resolution:** small radial collision per trunk, OR a coarse per-tree-cluster repulsion field? Trade-off: per-trunk is more honest but ~200 trunks × N sheep collision each tick; per-cluster is cheaper but sheep can clip into individual trees. Author lean: per-trunk, but only for trunks within ~30m of any sheep (proximity gate).
4. **Water behaviour at shore:** sheep hard-clamp at shoreline (clean), soft inward force only (sheep can wade slightly), or visible "panic and turn back" animation (cinematic)? Author lean: soft inward force inside the falloff zone, hard clamp at the actual water edge.
5. **Dog and water:** can the dog wade or is it also water-bounded? Author lean: same rules as sheep — keeps the playfield definition simple.
6. **Camera default:** Rolling Hills already pencilled in for Follow camera. Open Country same? Author lean: yes, Follow makes the woodland feel work; Classic top-down loses too much depth in a wooded scene.

These are tagged in the relevant phases below as **Q1**–**Q6**. None block scaffolding the shared boundary primitive (Phase 1).

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

## Phase 1 — Shared foundation (~2 hr)

**Independently testable.** Land before Phases 2 and 3 because they both consume it.

1. **Scene schema:** add `boundary: { kind: 'rect' | 'island', ... }` to [shared/scenes/types.js](../shared/scenes/types.js). Keep `bounds` as a deprecated alias for now (synthesise `boundary: { kind: 'rect', ...bounds }` when only `bounds` is present).
2. **BoundaryCollision:** extend [shared/BoundaryCollision.js](../shared/BoundaryCollision.js) with an `island` branch. Force is radial: if `dist(p, center) > radius - margin`, push toward `center` with magnitude proportional to encroachment. Mirror the existing rect implementation's smoothstep — no hard discontinuity until the actual `radius`. Hard clamp at `radius` (entity cannot exit the island). All `BoundaryCollision`/`MovementPhysics` callers fall through unchanged for `kind: 'rect'`.
3. **createGameState + GameSim:** [shared/index.js](../shared/index.js) and [worker/src/GameSim.js](../worker/src/GameSim.js) read `scene.boundary` (with backwards-compat fallback). No new tests beyond the existing sim baseline — but **rerun `npm test` after this lands** because the baseline traces are sensitive.
4. **Heightmap bake support:** extend [scripts/bake-heightmap.mjs](../scripts/bake-heightmap.mjs) to accept `--boundary island --radius N --falloff M`. The bake applies a smoothstep falloff to existing height samples so they drop to a configurable `seaLevel` (default `-2`) outside the falloff zone. Existing rect-bake behaviour preserved when flag absent.
5. **Water rendering:** new method `TerrainBuilder.createWater(scene)`, disabled when `scene.boundary.kind !== 'island'`. **Research first** — there are at least three credible approaches for our budget (single fog-tinted plane; Three.js `Water` from `examples/jsm/objects/Water.js`; custom shader with sampled noise + horizon-matched fog). Each has different costs on mid-tier mobile and different visual reads. The agent picking this up should benchmark 2-3 options against `PerformanceMonitor` on a real device before choosing. The non-negotiables: (a) horizon colour must match the atmosphere preset like the terrain shader does post-Hardening, (b) ≤ 0.5 ms frame budget on RTX 3070, (c) no z-fighting against terrain at the shoreline. Beyond those, pick the option that reads best in playtest. [TerrainBuilder.js](../js/TerrainBuilder.js).
6. **Test coverage:** add a vitest spec asserting an entity at `(95, 0)` on a `radius=90, falloff=15` island gets pushed inward, and an entity at `(50, 0)` is unaffected. New file `tests/island-boundary.spec.js`.

**Acceptance:** all existing 74 specs pass + 2 new ones; `npm run bake-heightmaps` still produces field/rolling-hills/open-country r32f files; visiting Field still works identically.

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
4. **Trees as obstacles:** trees in woods zones become navigable obstacles for sheep + dog. **Research first** — collision against ~200 tree trunks for ~200 sheep at 60 Hz is 40k checks/tick worst case; the data structure matters. Candidates include (a) per-trunk collider with naive O(N×M) and proximity early-out, (b) spatial hash grid sized to neighbour radius, (c) BVH (Three.js `three-mesh-bvh` is mature and widely used in 2026), (d) precomputed Voronoi navmesh per scene. The agent picking this up should benchmark on a target device before choosing — the right answer depends on tree count and movement query patterns, both of which differ from the boid neighbour query. Wherever the data lives, the API contract is: `TerrainBuilder._exposeTreeColliders()` returns the collider set, [shared/index.js createGameState](../shared/index.js) hands it to the sim, and [shared/MovementPhysics.js](../shared/MovementPhysics.js) consumes it deterministically (so the Worker sim stays in lockstep). Acceptance: sheep + dog navigate around individual trees without clipping in playtest, and the per-tick collision overhead is ≤ 1 ms on RTX 3070 / ≤ 3 ms on mid-tier mobile.
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

## References

- [`shared/scenes/types.js`](../shared/scenes/types.js) — schema
- [`shared/BoundaryCollision.js`](../shared/BoundaryCollision.js) — where the island branch slots in
- [`shared/MovementPhysics.js`](../shared/MovementPhysics.js) — sheep/dog movement, calls into BoundaryCollision
- [`shared/index.js`](../shared/index.js) — createGameState, consumed by Worker
- [`scripts/bake-heightmap.mjs`](../scripts/bake-heightmap.mjs) — heightfield generator
- [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) — terrain mesh, trees, where WaterPlane + corral builds slot in
- [`js/components/GameHUD/`](../js/components/GameHUD/) — where CorralCompass lands
