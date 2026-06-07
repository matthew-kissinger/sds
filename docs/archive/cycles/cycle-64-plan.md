# Cycle 64 - wolf-coast-foundation

> Drafted 2026-06-06 after Cycle 63 (`collision-stutter-profile`) closed as `v2.2.2`. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Status: NOT STARTED.** This is the first cycle of the Survival / Wolf Coast campaign. It ships the foundation only - the new non-circular boundary primitive and a walkable Wolf Coast island. Survival mode, wolves, the day/night loop, co-op, and the survival leaderboard are later cycles (65-68); see "Campaign context" below. Do not pull that scope forward.

## Goal

Add **Wolf Coast**, a boot-shaped island roughly 3.3 km^2 with a 120 m mountain, banking curved coastlines, and forest / tall-grass / light-tree biome bands, playable in the existing modes (Just Play, Solo). Getting there requires one genuinely new engine primitive: a **`coastline` boundary kind** that expresses an arbitrary concave shoreline, because today the only island boundary is a circle (`{kind:'island', center, radius, falloff}`) and a boot is not a circle.

Before: every island is a disc. The deterministic sim (`shared/BoundaryCollision.js`) only knows `rect` and `island`. A non-circular island is impossible.

After: scenes can declare `boundary: {kind:'coastline', points:[...], falloff}`. The client predictor and the Worker authoritative sim both derive an identical signed-distance field (SDF) from the polygon at load and steer sheep/dog off the shore with the same smoothstep force the circle used. Wolf Coast ships on this, walkable and readable, and lands the hardest, highest-risk engineering item of the whole campaign behind a real test vehicle.

## Campaign context (do not implement here)

The full Survival campaign is ~5 cycles. This plan is **Cycle 64 only**. The rest, for orientation:

- **Cycle 65** - day/night cycle (enable the existing [`js/atmosphere/DayNightCycle.js`](../js/atmosphere/DayNightCycle.js)) + the dry survival loop (`shared/survivalSim.js`, `shared/survivalMode.js`, phase clock, fast-forward, pen accounting, bankruptcy, progression) + survival HUD variant. Solo/client first.
- **Cycle 66** - wolves + the survival bark. `shared/wolves.js` (seeded spawn, target, pursuit, grapple), escalation, `WolfRenderer` reusing the render-only [`js/Wolf.js`](../js/Wolf.js). Resolve the bark verb: the existing [`shared/BarkImpulse.js`](../shared/BarkImpulse.js) is a forward cone, not the radial repel the survival brief assumes.
- **Cycle 67** - co-op. Worker `GameSim` hosts the survival tick; wolves + phase clock join the MessagePack frame (additive wire migration story); survival rooms (2-4 dogs); run state persisted in the DO for reconnect.
- **Cycle 68** - survival leaderboard (a new D1 migration `0008_*.sql`; it needs a 4-D rank tuple + `partySize` and cannot reuse the 1-D solo/counting columns) + end screen + balance.

## How to read this plan

This doc fixes the *shape* of the changes, not the implementation choices. The coastline algorithm has already been spiked - see "Architecture / shared changes" and [`../tools/coastline-boundary-spike.mjs`](../tools/coastline-boundary-spike.mjs) + the report in `cycle64-validation/coastline/spike-report.json`. The SDF approach is decided; the phase work is to port it cleanly and wire it through every consumer without breaking the rect/island paths.

## R&D already done (the spike)

A throwaway benchmark ([`tools/coastline-boundary-spike.mjs`](../tools/coastline-boundary-spike.mjs)) compared three representations against the engine's exact island force math. Findings:

- **Winner: precomputed SDF grid.** Build a signed-distance field from the polygon once at load; per tick, one bilinear distance sample + a 4-tap gradient. O(1) per entity regardless of vertex count or concavity.
- **Cost (5000 sheep):** ~0.58 ms/tick, 3.5x the analytic circle, comfortably under a ~1 ms budget (collision alone is ~1.7 ms). The rejected per-tick-polygon approach was 2.5 ms and distribution-sensitive.
- **Build cost at real scale** (bbox 2550x2100 m, 77-pt coast): 16-27 ms one-time at 12-16 m grid resolution (92-161 KiB). Per-tick cost is resolution-independent.
- **Deterministic:** the build is `+ - * / sqrt` + even-odd ray cast (IEEE-754 spec-pinned across V8/JSC/SpiderMonkey per [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md)), Float32 storage; two builds are byte-identical (proven). No new determinism risk beyond what the boid sim already relies on.
- **Parity:** vs an analytic circle on a 64-gon, mean direction error 0.28 deg, 99.1% on/off agreement. Zero sheep escaped a 600-tick outward-pressure storm.
- **Architecture decision (do not prebake the field):** the **polygon is the prebaked artifact**. It is tiny, inlines in the SceneDef, and both client and Worker build the SDF from it identically at load. Prebaking the SDF binary would reintroduce the wall that the Worker cannot fetch binaries; Blender (if ever used) is for terrain art only and does not change the runtime. Full reasoning in the plan-mode R&D file.

## Open questions to resolve before writing code

1. **Q1: SDF grid resolution?** Author lean: **12 m** (`falloff` 30 m is 2.5 cells across, ~161 KiB, ~27 ms build). Drop to 16 m if the Worker room-create build cost needs trimming. The same value MUST be used on client and Worker for determinism, so fix it on the boundary def (`cellSize`).
2. **Q2: Static sky preset for Wolf Coast?** Author lean: **`dusk`** (previews the survival night mood, distinct from the other biomes). Render-only, trivially changed later.
3. **Q3: Pen vs corral this cycle?** Existing Solo modes need a herding destination. Author lean: place the toe enclosure as the scene's **`corral`** so Solo works now, AND add the additive **`pen`** field at the same bounds as inert data for survival to consume later. They coexist; only `corral` is wired this cycle.
4. **Q4: Coastline vertex count?** Author lean: **60-80 points** for believable banking curves (the spike's 77-pt coast built in 27 ms at 12 m). The renderer may subdivide for visuals; the sim consumes the authored list.
5. **Q5: Heightmap pixel resolution vs CDN budget?** A 2550 m island at 1024 px is ~4 MB R32F (2.5 m/px); 1536 px is ~9 MB. Author lean: **bake at 1024 px**, re-evaluate in P3 if the mountain relief reads blocky. Flag the file size in P3's report.

## Architecture / shared changes

**New primitive: `shared/CoastlineField.js`** (pure, deterministic, no DOM / no Three.js / no `js/` imports). Port from the spike. Public surface:

- `buildCoastlineField(points, { cellSize, falloff })` -> `{ data: Float32Array, width, height, minX, minZ, cellSize, falloff }`. Signed distance per cell (positive inside), built with even-odd ray cast + min-segment-distance. Stored Float32.
- `sampleSignedDistance(field, x, z)` -> bilinear sample (clamped to edges).
- `coastlineAvoidance(entity, field, config)` -> `Vector2D` steering force, structurally identical to `calculateIslandAvoidance`: smoothstep over `[0, falloff]` of the signed distance, steered along the SDF gradient (the inward direction), then normalize -> `* maxSpeed*forceMultiplier` -> subtract velocity -> `limit(maxForce*2.5)`.
- `applyHardCoastlineConstraint(entity, field, config)` -> push position inward along the gradient when signed distance `< margin` (mirrors the radial hard clamp).

**Field caching (build once, never per tick):** keep a module-level `WeakMap<points[], field>` in `CoastlineField` (or `BoundaryCollision`); `getCoastlineField(boundary)` builds on first use and reuses thereafter. Keyed on the points array identity so the shared frozen SceneDef object is never mutated. Eager-build at `createGameState` / scene load so the ~20 ms cost is paid at init, not on a tick. **Confirm in P6 it is built once, not per-tick or per-join on the Worker.**

**The `coastline` boundary kind** added to the `Boundary` union in `shared/scenes/types.js`:

```
{ kind: 'coastline', points: Array<{x:number,z:number}>, falloff: number, cellSize?: number }
```

`rect` and `island` math is **not edited** - coastline is a new dispatch branch everywhere, so existing sim-baselines stay byte-identical.

## Consumer surface (verified by grep - the full list a `coastline` kind must satisfy)

Sim-critical (must be correct):

- [`shared/BoundaryCollision.js`](../shared/BoundaryCollision.js) - `asBoundary`, `boundaryAsRect` (44), and the 3 dispatchers `calculateBoundaryAvoidance` (64), `calculateBoundaryAvoidanceWithGate` (182), `applyHardBoundaryConstraints` (356).
- [`shared/index.js`](../shared/index.js) - `boundaryToBounds` (192) **throws on unknown kind** and is called by `createGameState` (213); add the coastline -> bbox case or sim init crashes. `resolveBoundary` (170) passes the boundary through unchanged (no edit).
- [`shared/EntityCollision.js`](../shared/EntityCollision.js) - `finiteCollisionBounds` (71) island case; add coastline -> bbox.
- [`worker/src/GameSim.js`](../worker/src/GameSim.js) - consumes the shared boundary functions; inherits coastline if the shared layer handles it. Verify no direct `.radius` reads.
- [`js/OptimizedSheep.js`](../js/OptimizedSheep.js) - client sheep hard clamp (1962) + force (2132); route through `CoastlineField`.
- [`js/Sheepdog.js`](../js/Sheepdog.js) - dog clamp (919); route through `CoastlineField`.
- [`js/GameState.js`](../js/GameState.js) - spawn safe-radius (136); handle coastline (bbox inset or field).
- [`tests/sim-baseline/harness.js`](../tests/sim-baseline/harness.js) - mirror the Worker boundary handling.

Render / visual (degrade gracefully or bbox approximation, must not crash):

- [`js/boot/initWorld.js`](../js/boot/initWorld.js) - **latent crash at 330-331** (reads `boundary.radius`/`.falloff` unconditionally in a probe log); guard for coastline.
- [`js/GrassSystem.js`](../js/GrassSystem.js) - radial density falloff (1432); add a coastline path (SDF-driven) or bbox fallback. Note: the shoreline grass cull (`meshSampleY < SHORELINE_Y_MIN`) is already shape-agnostic and needs no change.
- [`js/water/AnimeWater.js`](../js/water/AnimeWater.js) - shore gradient center/radius (209); derive from bbox (foam is already heightfield-driven via `uHasHeight`).
- [`js/world/rockPlacementPlan.js`](../js/world/rockPlacementPlan.js) - `islandBoundary` null for coastline (59, 97); acceptable graceful degradation this cycle or add support.
- Diagnostics ([`js/boot/debugProbes.js`](../js/boot/debugProbes.js), [`js/diagnostics/webgpuDiagnostic.js`](../js/diagnostics/webgpuDiagnostic.js), [`js/diagnostics/sceneManagerWebGpuProof.js`](../js/diagnostics/sceneManagerWebGpuProof.js)) - already fall back to a default island; coastline scenes skip these probes. Leave as-is, just confirm no crash.

## Phase 1 - Coastline SDF primitive + tests (~4hr)

**Independently testable. No frozen file touched (new module).** Port the spike's winning SDF into a real shared module.

1. Create [`shared/CoastlineField.js`](../shared/CoastlineField.js) with the surface in "Architecture" above. Pure, `+ - * / sqrt` + even-odd ray cast only, Float32 storage, WeakMap field cache.
2. Create [`tests/coastline-field.spec.js`](../tests/coastline-field.spec.js).

**Acceptance (EARS):**

- When `tests/coastline-field.spec.js` runs, then containment from the field shall match `isPointInPolygon` ground truth on a known boot polygon at sampled points.
- When a field is built twice from the same points, then the two `Float32Array`s shall be byte-identical.
- When `coastlineAvoidance` is sampled in the falloff band against an analytic circle on a 64-gon, then mean force-direction error shall be < 1.0 deg and on/off agreement shall be > 98%.
- When a flock with outward velocity is simulated for 600 ticks against the field with hard clamp, then zero entities shall finish outside the polygon.

## Phase 2 - Wire `coastline` into the deterministic core (~4hr, FENCE)

**Depends on Phase 1.** Add the kind and route every shared consumer through the field. Do not edit rect/island math.

1. [`shared/scenes/types.js`](../shared/scenes/types.js) - add the `CoastlineBoundary` typedef to the `Boundary` union (additive).
2. [`shared/BoundaryCollision.js`](../shared/BoundaryCollision.js) - coastline branch in `asBoundary`, `boundaryAsRect`, and the 3 dispatchers, calling `CoastlineField`.
3. [`shared/index.js`](../shared/index.js) - `boundaryToBounds` coastline -> bbox of points.
4. [`shared/EntityCollision.js`](../shared/EntityCollision.js) - `finiteCollisionBounds` coastline -> bbox.
5. Extend boundary unit tests for the coastline branch.

**Migration story:** rect + island dispatch and math are byte-identical (no edits); coastline is a new `else if`. No existing scene uses `coastline`, so all existing sim-baseline fixtures stay byte-identical (verified, not regenerated - the new fixture lands in P7 with the scene). `boundaryToBounds` gains a case (previously threw).

**Acceptance (EARS):**

- When a coastline boundary is passed to `calculateBoundaryAvoidance`, `calculateBoundaryAvoidanceWithGate`, and `applyHardBoundaryConstraints`, then each shall return a finite steering force / constrained position via `CoastlineField`.
- When a coastline boundary is passed to `boundaryToBounds`, then it shall return the polygon bbox instead of throwing.
- When the existing sim-baseline suite runs after this phase, then all current fixtures shall stay byte-identical.
- When `npm run lint` runs over `shared/**`, then the deterministic-import rule shall pass (no DOM / Three.js / `js/` imports in `CoastlineField`).

## Phase 3 - Boot heightmap bake (~3hr, tool only, parallel with P1/P2)

**Depends on the points module only.** Author the coastline polygon once as a shared module and bake terrain from it.

1. Create the points module (e.g. [`shared/scenes/wolf-coast.coast.js`](../shared/scenes/) exporting the `points` array), the single source of truth imported by both the baker and the SceneDef.
2. Extend [`scripts/bake-heightmap.mjs`](../scripts/bake-heightmap.mjs): add `--boundary coastline --points <module-or-json>` (mask terrain toward `seaLevel` outside the polygon via signed-distance smoothstep, mirroring the existing island falloff) and a procedural mountain (`--peakX --peakZ --peakRadius`, Gaussian/cone added before the mask).
3. Bake `public/terrain/wolf-coast.bin` + manifest (worldSize ~2550, peakHeight ~120).

**Acceptance (EARS):**

- When `npm run bake-heightmaps` (or the documented one-off command) runs for wolf-coast, then `public/terrain/wolf-coast.bin` and its `.json` manifest shall exist with `worldSize` ~2550 and `peakHeight` ~120.
- When two bakes run with the same seed and points, then the output `.bin` shall be byte-identical.
- While outside the coastline polygon, the baked height shall equal `seaLevel`.
- When P3 finishes, then the plan or the manifest shall record the baked file size in MiB (the CDN-budget number from Q5).

## Phase 4 - Wolf Coast SceneDef + pen field + registration (~4hr)

**Depends on P2 (coastline kind) + P3 (points module, heightmap).**

1. [`shared/scenes/types.js`](../shared/scenes/types.js) - add the additive `PenDef` typedef + optional `pen` field (data/visual only this cycle; safe-zone semantics are Cycle 65).
2. Create [`shared/scenes/wolf-coast.js`](../shared/scenes/): id `wolf-coast`, name `Wolf Coast`, `boundary` coastline (import the points module + `falloff`, `cellSize` from Q1), `terrain` (heightmapUrl, heightScale ~120, zones scaled to the bbox), `sky` (Q2), `grass` (grassRadius scaled, conifer-friendly colors), `woodsZones` (forest band density ~2.5 + light-tree band ~0.5), `treeProfile` conifer lean, `sheepSpawn` clustered in the foot lowland, `corral` at the toe (Q3), `pen` at the same bounds (Q3), `farmHouse`, `allowedModes` the existing modes (NOT survival), `defaultCamera 'follow'`.
3. Register in [`shared/scenes/index.js`](../shared/scenes/index.js).

**Acceptance (EARS):**

- When `loadScene('wolf-coast')` is called, then it shall return a SceneDef with a `coastline` boundary and not throw.
- When the polygon area is measured (shoelace), then it shall be 3.0-3.6 km^2 and the report shall record the value.
- When the mountain summit, house/pen, forest, tall-grass, and foot-lowland landmark coordinates are tested, then each shall fall inside the polygon.
- While Wolf Coast is loaded, `allowedModes` shall not include any survival mode (survival is Cycle 65+).

## Phase 5 - Tall-grass shore band (~3hr)

**Depends on P4.** Add per-zone grass height (the band directly south of the forest, z ~150-350).

1. [`shared/scenes/types.js`](../shared/scenes/types.js) - additive `grass.tallZones: [{minX,maxX,minZ,maxZ,heightMul}]`.
2. [`js/GrassSystem.js`](../js/GrassSystem.js) - per-clump blade-height multiplier when inside a `tallZone`; add the coastline density path (or bbox fallback) at the radial-falloff site (1432).
3. Apply a `tallZones` entry on Wolf Coast.

**Acceptance (EARS):**

- While inside a declared `tallZone`, grass blade height shall be scaled by `heightMul` versus the same scene's base height.
- When Wolf Coast grass renders near the shore, then density shall fall to zero at the waterline (via the existing `meshSampleY` cull, confirmed unchanged).
- If `tallZones` is absent on a scene, then grass height shall be unchanged (byte-identical behavior for existing scenes).

## Phase 6 - Client integration + render consumers + browser smoke (~4hr)

**Depends on P2 + P4.** Make the client predictor and renderer correct for coastline, then prove it in a browser.

1. Route client sim clamps through `CoastlineField`: [`js/OptimizedSheep.js`](../js/OptimizedSheep.js) (1962, 2132), [`js/Sheepdog.js`](../js/Sheepdog.js) (919), [`js/GameState.js`](../js/GameState.js) (136).
2. Guard [`js/boot/initWorld.js`](../js/boot/initWorld.js) 330-331 (no `.radius` on coastline).
3. [`js/water/AnimeWater.js`](../js/water/AnimeWater.js) - bbox-derived center/radius for the deep/shallow gradient.
4. [`js/world/rockPlacementPlan.js`](../js/world/rockPlacementPlan.js) - coastline handling or graceful null.
5. Make Wolf Coast reachable from the entrance (world list / `familiesForWorld` in [`js/world/worlds.ts`](../js/world/worlds.ts)).
6. Browser smoke via preview with `SDS_SUPPRESS_BROWSER_OPEN=1`: load Wolf Coast in Just Play; dog + sheep move; sheep pushed at the shore turn back and none escape; desktop + mobile 390 px; zero console errors. Close every tab/listener after (browser-probe hygiene).

**Acceptance (EARS):**

- When Wolf Coast loads in Just Play, then the dog and sheep shall be controllable and the scene shall render without console errors.
- If a sheep is driven into the shore, then it shall be turned back by the falloff force and the hard clamp, never leaving the land polygon.
- When the field is built on the client, then it shall be built once at scene load (not per tick), confirmed via a probe/log.
- When the browser smoke completes, then a screenshot proof (desktop + mobile) shall be saved under `cycle64-validation/`.

## Phase 7 - Sim-baseline + full validation (~3hr)

**Depends on all prior phases.**

1. Add a Wolf Coast coastline fixture `tests/sim-baseline/__fixtures__/coastline-wolf-coast-60hz.json` (NEW, net-additive). The existing 9 fixtures MUST stay byte-identical (the explicit fence acceptance: proves rect/island paths unchanged).
2. Run `npm test`, `npm run lint`, `npm run build` (accept the bundle ratchet for the new module + scene, record the value in `tests/refactor-baseline/__fixtures__/bundle-sizes.json`), worker `tsc`, and `tests/sim-baseline/harness-parity.spec.ts`.

**Acceptance (EARS):**

- When the sim-baseline suite runs, then the existing 9 fixtures shall be byte-identical and the new `coastline-wolf-coast-60hz.json` shall pass.
- When `tests/sim-baseline/harness-parity.spec.ts` runs, then the Worker-mirror harness and the shared sim shall produce identical coastline traces.
- When `npm test`, `npm run lint`, and `npm run build` run, then all shall pass.
- When `npm run build` grows `main-*.js`, then `bundle-sizes.json` shall be updated with the measured value and this plan shall record the rationale.

## Dependencies

```
Phase 1 (primitive) ─┐
                     ├─ Phase 2 (fence wire) ─┐
Phase 3 (bake) ──────┘ (points module shared) ├─ Phase 4 (scene) ─┬─ Phase 5 (grass band) ─┐
                                              │                    └─ Phase 6 (client+smoke)─┤
                                              └────────────────────────────────────────────┴─ Phase 7 (validation)
```

Phase 1 and Phase 3 can run in parallel (Phase 3 needs only the authored points module). Phase 2 needs Phase 1. Phase 4 needs Phase 2 + the points module + the baked heightmap. Phases 5 and 6 both need Phase 4 and can run in parallel. Phase 7 is last.

## Frozen files (cycle-specific authorization)

The durable fence is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). This cycle is **authorized** to touch these, each with the migration story above:

- [`shared/scenes/types.js`](../shared/scenes/types.js) - additive `CoastlineBoundary` (P2), `PenDef`/`pen` (P4), `grass.tallZones` (P5). All optional additions with defaults; no rename/removal; existing scenes unaffected.
- [`shared/BoundaryCollision.js`](../shared/BoundaryCollision.js) - new coastline dispatch branch (P2). Rect/island math unedited.
- [`shared/index.js`](../shared/index.js) - `boundaryToBounds` coastline case (P2).
- [`shared/EntityCollision.js`](../shared/EntityCollision.js) - `finiteCollisionBounds` coastline case (P2).
- [`shared/terrain/Heightfield.js`](../shared/terrain/Heightfield.js) - **NOT modified.** A new baked `.bin` is pure data; the sampler is unchanged.
- [`tests/sim-baseline/__fixtures__/`](../tests/sim-baseline/__fixtures__/) - **net-additive only** (P7). New coastline fixture added; the existing 9 are asserted byte-identical, never regenerated.
- [`tests/sim-baseline/harness.js`](../tests/sim-baseline/harness.js) - mirror coastline boundary handling (P2/P7).

## Hard stops

Durable stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific:

1. **If any existing sim-baseline fixture changes, stop.** The rect/island paths must stay byte-identical; a diff there means coastline leaked into a shared code path. Fix the leak, do not regenerate.
2. **If the client and Worker coastline fields ever differ**, stop. Both must build from the same points with the same `cellSize`; a mismatch desyncs co-op (and Cycle 67 depends on this being right).
3. **If the SDF is built per-tick** (not once at load), stop and fix the cache. The ~20 ms build is a load-time cost only.
4. **Do not prebake the SDF to a binary or bundle it into the Worker.** The polygon is the artifact; the field is built from it. (Reasoning in the R&D file.)
5. **Do not pull survival scope forward.** No wolves, no day/night loop, no survival mode, no leaderboard, no wire changes this cycle. Wolf Coast ships playable in existing modes only.
6. **If Phase 1 + Phase 2 overrun**, split the cycle: ship the `coastline` primitive + a minimal placeholder scene as Cycle 64 and slip the full Wolf Coast scene (P4-P6) to Cycle 65, rather than cramming.

## What NOT to do during this cycle

- Don't add survival mode, wolves, the bark redesign, day/night, co-op, or the survival leaderboard (Cycles 65-68).
- Don't edit the rect or island boundary math. Coastline is purely additive branches.
- Don't make the Worker fetch the heightmap or an SDF binary. The Worker only ever sees the inline polygon.
- Don't reach for Blender / external 3D tools for the terrain this cycle. Extend the procedural baker (per [`feedback_asset_pipeline.md`](file:///c/Users/Mattm/.claude/projects/C--Users-Mattm-X-games-3d-sds/memory/feedback_asset_pipeline.md)); revisit Blender only as a deliberate future decision.
- Don't auto-bump the version. Wolf Coast becoming player-visible is an explicit release call.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to `BACKLOG.md` carryover.
- [ ] When `tests/coastline-field.spec.js` runs, then determinism, parity, and no-escape assertions shall pass.
- [ ] When the sim-baseline suite runs, then the existing 9 fixtures shall be byte-identical and the new coastline fixture shall pass.
- [ ] When Wolf Coast loads in Just Play, then it shall be walkable, sheep shall stay on the land, and the scene shall render with no console errors (desktop + mobile proof saved under `cycle64-validation/`).
- [ ] When the polygon area is measured, then Wolf Coast shall be 3.0-3.6 km^2 with all landmarks inside.
- [ ] When `npm test`, `npm run lint`, and `npm run build` run at cycle close, then all shall pass.
- [ ] When the close commit lands on `main`, then the sheepdogsim.com deploy shall succeed via GH Actions.

## References

- [`tools/coastline-boundary-spike.mjs`](../tools/coastline-boundary-spike.mjs) - the R&D spike (SDF decision, build-cost sweep, parity)
- `cycle64-validation/coastline/spike-report.json` - spike results (gitignored, regenerable via the spike)
- [`shared/BoundaryCollision.js`](../shared/BoundaryCollision.js) - the island force math to mirror
- [`shared/EntityCollision.js`](../shared/EntityCollision.js) - the dense-grid idiom the SDF follows
- [`js/gamestate/polygonSpawn.js`](../js/gamestate/polygonSpawn.js) - existing `isPointInPolygon` / `pointToSegmentDistance` (the geometry to copy into `shared/`)
- [`scripts/bake-heightmap.mjs`](../scripts/bake-heightmap.mjs) - the procedural baker to extend
- [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) - deterministic-sim discipline
- [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - scene/atmosphere/heightfield/grass rules
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files + authorization protocol
- [`docs/archive/cycles/cycle-63-plan.md`](archive/cycles/cycle-63-plan.md) - the prior deterministic-core change (collision), nearest precedent
