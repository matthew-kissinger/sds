# Next Session - Cycle 64 Wolf Coast foundation (SHIPPED, pending prod playtest + close)

> **Updated:** 2026-06-06
> **For:** Cycle 64 `wolf-coast-foundation`. Plan: [`docs/cycle-64-plan.md`](docs/cycle-64-plan.md).
> **Pickup priority:** Matt's prod playtest of Wolf Coast, then `/cycle-close`. All 7 phases are implemented, validated, and deployed to prod. The reserved tunables (ladder counts, mountain feel, grass density, sky) are a strawman for Matt's in-browser pass; nothing else is open.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-64-plan.md`](docs/cycle-64-plan.md) -> the touched module source.

## Where It Stands

**Cycle 64 is implemented and deployed.** It shipped the foundation only: a new `coastline` boundary kind (an arbitrary concave shoreline) plus the walkable **Wolf Coast** island (boot-shaped, 3.20 km^2 measured, 120 m mountain, foot lowland, tall-grass shore band, conifer woods), playable in the existing Just Play / Solo modes. Survival mode, wolves, day/night, co-op, and the survival leaderboard remain Cycles 65-68 and were not pulled forward.

### What shipped (all 7 phases)

- **P1 - the primitive.** [`shared/CoastlineField.js`](shared/CoastlineField.js): an SDF built once from the inline polygon (even-odd ray cast + min-segment distance, Float32, byte-identical builds), bilinear sample + 4-tap gradient steering, hard clamp with a deepest-interior-point fallback for far-offshore recovery. Tests in [`tests/coastline-field.spec.js`](tests/coastline-field.spec.js) (containment, determinism, <1 deg parity vs a circle, zero-escape storm, concave far-point convergence).
- **P2 - fence wiring.** `coastline` is a new dispatch branch in [`shared/BoundaryCollision.js`](shared/BoundaryCollision.js), [`shared/index.js`](shared/index.js) `boundaryToBounds`, and [`shared/EntityCollision.js`](shared/EntityCollision.js) `finiteCollisionBounds`. Rect/island math untouched -> all 9 existing sim-baselines byte-identical.
- **P3 - the bake.** [`scripts/bake-heightmap.mjs`](scripts/bake-heightmap.mjs) gained `--boundary coastline --points` (masks terrain to sea outside the polygon via the SAME SDF) + a procedural mountain. Polygon authored in [`shared/scenes/wolf-coast.coast.js`](shared/scenes/wolf-coast.coast.js) (provenance: [`tools/author-wolf-coast.mjs`](tools/author-wolf-coast.mjs)). `public/terrain/wolf-coast.bin` = 4.0 MiB (1024 px). Coastline stores absolute metres, manifest `peakHeight: 1`.
- **P4 - the scene.** [`shared/scenes/wolf-coast.js`](shared/scenes/wolf-coast.js) + registration. Inert `pen` coexists with the wired toe `corral`. New additive SceneDef fields: `CoastlineBoundary`, `PenDef`/`pen`, `dogSpawn`, `grass.tallZones`, `grass.grassCenter`.
- **P5 - tall grass + coastline grass.** [`js/GrassSystem.js`](js/GrassSystem.js): SDF-driven density/cull for coastline, a `grassCenter` so the grid sits on the foot play area (584 chunks, not 2017), and a `tallZones` blade-height band.
- **P6 - client + render consumers + browser smoke.** Client clamps/forces ([`js/OptimizedSheep.js`](js/OptimizedSheep.js), [`js/Sheepdog.js`](js/Sheepdog.js)), spawn ([`js/GameState.js`](js/GameState.js)), water ([`js/water/AnimeWater.js`](js/water/AnimeWater.js)), water-aware rocks + trees ([`js/world/rockPlacementPlan.js`](js/world/rockPlacementPlan.js), [`shared/TreePlacement.js`](shared/TreePlacement.js)), boot guard ([`js/boot/initWorld.js`](js/boot/initWorld.js)), entrance carousel ([`js/components/entrance/worlds.ts`](js/components/entrance/worlds.ts) + accent token + dusk-gradient placeholder webp).
- **P7 - sim-baseline + validation.** New `tests/sim-baseline/__fixtures__/coastline-wolf-coast-60hz.json`; the 9 existing fixtures byte-identical. npm test 1032 pass / 0 fail / 7 skip, lint clean, worker tsc clean, build clean (main ratchet 566 -> 573 KiB for the new module + scene, recorded in `bundle-sizes.json`).

### Browser smoke (preview, SDS_SUPPRESS_BROWSER_OPEN=1) - PASSED

Wolf Coast loads in Just Play with zero console errors, renders (dusk sky, foot grassland with tall-grass tufts, conifer woods on land, water at the shore), dog spawns on land and is controllable (drove 172 m on `w`), grass is performant (584 chunks / 202k clumps, vs an initial 708k before the foot-centred grid), and containment is bulletproof: 4 sheep teleported far offshore (including the concave instep side, past the SDF grid) all reeled back inside, zero escapes.

## What To Pick Up Next

1. **Matt's prod playtest** of Wolf Coast on sheepdogsim.com (entrance carousel -> Wolf Coast -> a Solo run). Confirm the feel.
2. **Reserved tunables (paired, not a phase)** - a strawman for Matt's taste pass: the solo ladder counts (3/25/100/300/1000/5000), the 120 m mountain height + radius, the foot grass density (`grassCenter` (350,-1050) / `grassRadius` 650 / `clumpsPerChunk` 950), the `dusk` sky, the tall-grass `heightMul` 1.8, and the coastline polygon silhouette.
3. **A real Wolf Coast entrance hero capture** to replace the dusk-gradient placeholder at `assets/scenes/entrance/wolf-coast.webp` (Matt's media pass per the media-prep convention).
4. **`/cycle-close`** once the playtest confirms - archive the plan, append BACKLOG, scaffold Cycle 65.

## Open Carryover

- **Cycle 63 prod-test** - playtest `v2.2.2` collision feel on sheepdogsim.com (independent of Cycle 64).
- **Survival campaign sequencing** - Cycle 65 day/night + dry loop -> 66 wolves + bark verb -> 67 co-op -> 68 leaderboard. See the campaign-context section in [`docs/cycle-64-plan.md`](docs/cycle-64-plan.md).
- **Bark verb conflict** - the survival brief assumes a radial repel bark, but [`shared/BarkImpulse.js`](shared/BarkImpulse.js) is a forward cone. Resolve in Cycle 66.
- **Tablet draw-call perf** - Wolf Coast's foot grass is 584 chunks (584 grass draw calls), more than Rolling Hills (~88) or Open Country (~333). Acceptable on desktop; watch it on the Tab S9 FE during the playtest. The mountain/leg are deliberately ungrassed (forest + alpine) to keep the count down.
- **No version bump** - the deploy makes Wolf Coast testable on prod at `v2.2.2`. A player-visible release bump + announcement is Matt's explicit call.

## Working Contract

- Deterministic-sim work names shared files, updates all consumers in the same commit, and regenerates sim-baselines only with recorded acceptance. Cycle 64 held the 9 existing fixtures byte-identical and added one coastline fixture.
- The client and Worker must build the coastline field from the same points + `cellSize` (12 m, fixed on the boundary def). A mismatch desyncs co-op (Cycle 67 depends on it).
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-64-plan.md`](docs/cycle-64-plan.md) |
| Coastline primitive | [`shared/CoastlineField.js`](shared/CoastlineField.js) |
| Coastline polygon | [`shared/scenes/wolf-coast.coast.js`](shared/scenes/wolf-coast.coast.js) |
| Wolf Coast scene | [`shared/scenes/wolf-coast.js`](shared/scenes/wolf-coast.js) |
| Coastline R&D spike | [`tools/coastline-boundary-spike.mjs`](tools/coastline-boundary-spike.mjs) + `cycle64-validation/coastline/spike-report.json` |
| Latest closed cycle | [`docs/archive/cycles/cycle-63-plan.md`](docs/archive/cycles/cycle-63-plan.md) |
| Heightmap baker | [`scripts/bake-heightmap.mjs`](scripts/bake-heightmap.mjs) |
| Deterministic-sim rules | [`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
