# Cycle 6 — Trees as obstacles + woods density + Open Country portal

> Drafted 2026-04-25 after Cycle 5 (Island + Woods) closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycles: [`cycle-5-plan.md`](cycle-5-plan.md), [`cycle-4-hardening.md`](cycle-4-hardening.md).

## Goal

Make the islands' trees and rocks **real**. Today they're decoration — the Cycle 5 playtest specifically called out that sheep and dog clip through trunks. Cycle 5 shipped the primitives ([`shared/SceneObstacles.js`](../shared/SceneObstacles.js), [`shared/Random.js`](../shared/Random.js)) but no consumer wiring. Cycle 6 wires them up: lift Poisson tree placement into `shared/` with a seeded PRNG, query the kdbush index from `MovementPhysics`/`GameSim` per tick, push entities out of overlapping circles, and bias placement density inside `woodsZones`. Same pass replaces the Open Country coastal pen with a magical portal trigger zone consistent with Rolling Hills' lightning-zap retirement effect.

User-visible difference between before and after: sheep and dog visibly route around individual trunks; Open Country's woods read as dense clusters rather than uniform sparse trees; Open Country's objective is a portal animation matching Rolling Hills' tone.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots in, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point — research and measure before committing.

Each phase agent should:

- **Research current best practice** for the specific sub-problem (Poisson-disk variants, kdbush radius-query patterns, GLSL portal shaders) before writing code.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) using `PerformanceMonitor`. The per-tick obstacle-query budget is **≤ 0.4ms desktop / ≤ 1.5ms mobile** — verify before merging Phase 2.
- **Pick the simplest thing that meets the budget.** If three lines of inline math read correctly, ship that — escalate only on demonstrated need.

## Open questions to resolve before writing code

- **Q1: Open Country objective — coastal pen, portal, or both?** **Resolved → portal trigger zone** (option b from NEXT_SESSION; reopens Cycle 5's Q2 which had locked the coastal pen, deliberately revisited after playtest). Replace the north-shore pen with a corral-style trigger + animated swirling vortex visual. Reuse the `CorralZapEffect` pool pattern with portal-specific GLSL.
- **Q2: Tree trunk obstacle radius — fixed or per-mesh?** **Resolved → fixed 1.8m**. Matches the NEXT_SESSION estimate, simpler, and per-mesh adds determinism surface area for marginal visual gain. Trees are 12–22m mesh-scale; trunks read as ~1.5–2.5m visually so 1.8m is a defensible average.
- **Q3: Rock obstacles — include all rocks, only large ones, or build bespoke pixel-forge rock assets first?** **Open — author lean: bespoke pixel-forge rocks.** Today's rocks come from `addEnvironmentDetails` clusters with scale variation 0.6–1.4. Including the smallest as colliders feels noisy; excluding them by scale threshold is a hack. The cleaner path is to author 2-3 purpose-made rock assets in [`C:/Users/Mattm/X/games-3d/pixel-forge`](file:///C:/Users/Mattm/X/games-3d/pixel-forge) (LLM-authored Three.js → GLB pipeline already in place) at sizes that read clearly as obstacles, then place those instead of the current cluster system. **If pixel-forge authoring slips this cycle**, fall back to: include only rocks with `scale >= 0.8` as colliders, keep smaller rocks as decoration.

These don't block Phase 1. Q3 must resolve before Phase 2's rock-collision wiring.

## Architecture / shared changes

This cycle introduces one new shared module and modifies one schema field's consumer:

- **New: `shared/TreePlacement.js`** — pure function `generateTrees(scene, rng) → TreeInstance[]`. Takes the scene def + a seeded `mulberry32` PRNG, returns canonically-sorted tree placements. Consumed by client `TerrainBuilder.createTrees` (for visual mesh spawn) and by Worker `GameSim` init (for obstacle data). Identical seed → identical output across V8 instances. The Poisson-disk loop currently in [`js/TerrainBuilder.js:607`](../js/TerrainBuilder.js) lifts wholesale.
- **`woodsZones` consumer** — `shared/TreePlacement.js` reads `scene.woodsZones` (schema already defined in [`shared/scenes/types.js:143`](../shared/scenes/types.js)) and biases sample density: 2–3× nominal density inside any zone, 0.5–0.7× outside if zones are present. Outside-the-zones logic only applies when zones are non-empty so Field/Rolling Hills (no zones) stay unchanged.
- **`SceneObstacles` wiring contract.** Build order: `TreePlacement.generateTrees(scene, rng)` → `addEnvironmentDetails` (rocks) → `buildSceneObstacles({ trees, rocks, buildings })`. The bundle is attached to `gameState.obstacles` (solo) and `gameSim.obstacles` (MP). Per-tick, `GameSim` queries within ~30m of each entity. The byte-preserved rect/legacy paths in [`shared/BoundaryCollision.js`](../shared/BoundaryCollision.js) are not touched — Cycle 5's sim-baseline contract holds.

## Phase 1 — Lift tree placement to `shared/TreePlacement.js` (~2hr)

**Independently testable.** This phase has no behavioral change for users — same trees, same positions on solo (modulo seed) — but unlocks Phase 2 (MP determinism) and Phase 3 (woods bias).

1. **Create [`shared/TreePlacement.js`](../shared/TreePlacement.js).** Export `generateTrees(scene, rng) → TreeInstance[]` and `generateRocks(scene, rng) → RockInstance[]` (rocks may be deferred to Phase 2 pending Q3). `TreeInstance = { x, z, type: 'tree1'|'tree2'|'pine', scale, rotationY, radiusXZ }`.
2. **Lift Poisson-disk loop** from [`js/TerrainBuilder.js:607-840`](../js/TerrainBuilder.js) verbatim, replacing every `Math.random()` with `rng()` (passed in from caller). Preserve the up-to-100-attempt retry that fixed the Cycle 5 island-zero-trees bug.
3. **Apply canonical sort** (`canonicalSort` from [`shared/SceneObstacles.js:54`](../shared/SceneObstacles.js)) before returning.
4. **Wire client.** [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) gains a `treeInstances` field set from `generateTrees(scene, mulberry32(scene.terrain.seed))`. The mesh-spawning loop iterates `treeInstances` instead of running its own placement.
5. **Determinism spec.** New file `tests/tree-placement.spec.js`: same seed → identical sequence; canonical sort produces stable order; output count within ±5% of pre-cycle output for Field/Rolling Hills/Open Country.
6. **Sim-baseline check.** Run `npm test` — `tests/sim-baseline/` fixtures must still pass since the sim doesn't yet read trees.

**Acceptance:**
- All 99 existing vitest specs pass + new determinism spec.
- Solo Field, Rolling Hills, Open Country render with trees in the same general distribution as Cycle 5 (within ~5% count, no obvious gaps).
- `seed=42` produces bit-identical `TreeInstance[]` in Node and Chrome (manual verify with a `console.log(JSON.stringify(...))` cross-check).

## Phase 2 — Wire `SceneObstacles` into the sim (~2hr)

**Depends on:** Phase 1 (for MP determinism). Solo could theoretically ship without Phase 1, but doing so creates a sim/visual drift trap on the next island scene.

1. **Build the obstacle set after placement.** In [`js/main.js`](../js/main.js) (solo) and `worker/src/GameSim.js` init (MP), call `buildSceneObstacles({ trees: treeInstances.map(t => ({ x: t.x, z: t.z, radiusXZ: 1.8 })), rocks: rockInstances.map(...), buildings: [] })`. Attach to `gameState.obstacles` / `this.obstacles`.
2. **Per-tick query — sheep.** In [`worker/src/GameSim.js:460-534`](../worker/src/GameSim.js) (the sheep-update block where `flockingForce`, `fleeForce`, `gateForce`, `boundaryForce` are summed into `sheep.acceleration`), insert:
   ```js
   if (this.obstacles.trees.length > 0) {
       const nearbyTrees = this.obstacles.queryTrees(sheep.position, 30);
       const nearbyRocks = this.obstacles.queryRocks(sheep.position, 30);
       const treeForce = obstacleAvoidance(sheep.position, sheep.radius ?? 0.6, nearbyTrees, { strength: 1.0 });
       const rockForce = obstacleAvoidance(sheep.position, sheep.radius ?? 0.6, nearbyRocks, { strength: 1.0 });
       sheep.acceleration.add(new Vector2D(treeForce.x + rockForce.x, treeForce.z + rockForce.z));
   }
   ```
   The `length > 0` guard preserves Field's bit-identical sim path (sim-baseline contract).
3. **Per-tick query — dog.** Same shape inserted near [`worker/src/GameSim.js:322-327`](../worker/src/GameSim.js).
4. **Tune strength.** Start at 1.0, raise/lower in playtest. The push-out math in [`shared/SceneObstacles.js:137`](../shared/SceneObstacles.js) is linear-with-overlap, so strength scales the magnitude.
5. **Performance check.** With `PerformanceMonitor`, capture per-tick cost on Open Country (~380m radius, expected dense tree count). Budget: **≤ 0.4ms desktop / ≤ 1.5ms mobile**. If over, reduce query radius or precompute per-cell candidate lists.
6. **Sim-baseline check.** Field has no trees so its baseline must still match. Rolling Hills + Open Country baselines (if they exist) will shift — regenerate **only** after confirming the diff comes from obstacle force and nothing else.

**Acceptance:**
- Sheep and dog visibly route around individual trunks in solo Rolling Hills + Open Country playtest. No clipping.
- No fluttering / oscillation against tree edges (if it occurs, lower strength or add velocity-relative dampening).
- Field sim-baseline passes byte-identical.
- Per-tick budget met on both targets.

## Phase 3 — Woods zones with biased density (~1hr)

**Depends on:** Phase 1.

1. **Read `scene.woodsZones`** in `shared/TreePlacement.js`.
2. **Bias the Poisson sampler.** Inside any `WoodsZoneDef` AABB, lower the min-distance threshold (denser); outside (only when zones are non-empty), raise it (sparser). Suggested factors: inside = 0.6× nominal min-distance, outside = 1.4×.
3. **Update Open Country scene def.** Add 2-3 wood clusters as the Cycle 5 plan originally called for. Place them away from the coastal portal zone and the main play paths.
4. **Visual check.** In playtest, woods should read as recognizably denser canopy, not just slightly more trees.

**Acceptance:**
- Open Country has 2-3 visually distinct dense woods, surrounded by sparser open ground.
- Field and Rolling Hills (no `woodsZones`) render unchanged — count and positions stable.
- Determinism spec from Phase 1 still passes.

## Phase 4 — Open Country portal (parallel with 1-3, ~2.5hr)

**Depends on:** nothing — runs in parallel with Phases 1-3. Touches scene def + new visual module, not the sim core.

1. **Replace the coastal pen** in Open Country's scene def with a `corral`-style def (radius ~10m) at a visually striking offshore-looking location (cliff edge, north shore). Drop `gates`/`pasture` for this scene.
2. **Author [`js/effects/PortalEffect.js`](../js/effects/PortalEffect.js).** Reuse the `CorralZapEffect` pool pattern. Visual: tinted ring shader (cool cyan-purple gradient) + vertical column of upward-streaking particles + low-frequency rotation. ~80 lines GLSL or less.
3. **Sheep retirement animation.** When a sheep enters the portal trigger, ascend through the column (~22m, ease-out cubic, scale to zero, vanish — same shape as `CorralZapEffect` but vertical-into-portal instead of struck-by-bolt).
4. **HUD compass arrow.** Reuse Rolling Hills' `CorralCompass` pattern pointing to the portal off-screen.
5. **Audio (optional).** If easy, swap the Rolling Hills lightning-crack sound for a softer chime. Skip if it adds time.

**Acceptance:**
- Open Country's objective reads clearly as "guide sheep to the portal."
- Portal is visually distinct from Rolling Hills' lightning corral but consistent in tone.
- Sheep retire cleanly through the portal animation; no stuck states.

## Phase 5 — Polish (optional, ~2hr)

Nice-to-haves once Phases 1-4 land. Skip whichever doesn't move the needle in playtest.

1. **Boid retune for island scale (#5 from NEXT_SESSION, ~1.5hr).** Open Country at 760m diameter is ~4.5× Rolling Hills meadow area (π·380² / π·180² = 4.46). Cohesion likely under-reaches → flocks fragment. Tune `scene.flocking` for Open Country specifically; keep Rolling Hills + Field as-is unless playtest demands otherwise.
2. **`defaultCamera` localStorage semantics (#6 from NEXT_SESSION, ~30min).** Today the saved `camera-mode` always wins. Switch to per-scene last-mode in localStorage (key `camera-mode-${sceneId}`), falling back to `scene.defaultCamera` on first visit per scene.

## Dependencies

```
Phase 1 → Phase 2 + Phase 3 (parallel after 1) → Phase 5 polish
Phase 4 (Open Country portal) runs in parallel with all of the above
```

Phase 1 must land first. Phases 2 and 3 are independent of each other once Phase 1 ships. Phase 4 has no code-level dependency on the others.

## Frozen files (cycle-specific additions)

These files require explicit task-brief authorization to modify within this cycle. The durable fence list is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md); items below are cycle-specific.

- [`shared/BoundaryCollision.js`](../shared/BoundaryCollision.js) — Cycle 5's byte-preserved rect path is the contract that lets `tests/sim-baseline/` fixtures hold bit-identical. Don't touch.
- [`shared/MovementPhysics.js`](../shared/MovementPhysics.js) — pure-functions library. New force composition belongs in the **call site** (`GameSim.js` / client equivalent), not inside `updateMovement`. Don't add obstacle-aware logic here.
- [`tests/sim-baseline/`](../tests/sim-baseline/) fixtures — do not regenerate without escalating. Phase 2's `if (obstacles.trees.length > 0)` guard preserves Field's path. If a baseline diff appears, investigate the source before regenerating.

## Hard stops

Surface to the user, do not proceed:

1. **Frozen-file change without scope authorization** — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. **Sim-baseline test failure on Field** — Field has zero trees, the obstacle path should be free. If Field baselines diverge, something is wrong with the guard. Don't regenerate, escalate.
3. **Per-tick obstacle-query cost > budget** (0.4ms desktop / 1.5ms mobile) — surface the measurement, don't ship over budget.
4. **Determinism spec failure** — if `mulberry32(seed)` produces different sequences in Node vs Chrome, the whole MP-island story collapses. Stop and investigate.
5. **Visual regression** — Field tree placement count or distribution shifting >5% from Cycle 5 means the Poisson lift drifted. Fix or revert before adding scope.

## What NOT to do during this cycle

- **Don't introduce a generic "physics body" abstraction.** Trees are circles; rocks are circles; buildings are AABBs; that's enough for now. YAGNI applies hard here.
- **Don't add new scenes.** Three is the right number. Both Cycle 4 and Cycle 5 said this; it remains true.
- **Don't move sim logic out of `shared/`.** Trees-as-obstacles work belongs in `shared/SceneObstacles.js` (already there) and `shared/TreePlacement.js` (new).
- **Don't blow up `main.js`.** The wiring change in Phase 2 should be ≤ 30 lines added there. If it's growing, extract to a helper, don't spread it.
- **Don't pre-optimize the kdbush.** It's already O(log N + k) and rebuilt once per scene load. Per-tick query overhead is the hot path; build cost is not.
- **Don't add rock obstacles before Q3 resolves.** If pixel-forge bespoke rocks are the path, they need to be authored before wiring. Don't ship a half-step that we tear out two days later.
- **Don't regenerate sim-baseline fixtures** unless the diff is fully understood and from a known cause (the obstacle force, nothing else).

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] All phases shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] All vitest specs pass (Cycle 5 closed at 99/99; Phase 1 adds the determinism spec, others may add more).
- [ ] Production build clean.
- [ ] Live on sheepdogsim.com via GH Actions.
- [ ] Sheep and dog visibly route around tree trunks in playtest on Rolling Hills + Open Country (no clipping, no fluttering).
- [ ] Open Country woods read as recognizably denser canopy than open ground.
- [ ] Open Country's portal objective is clear and the retirement animation plays cleanly.
- [ ] Per-tick obstacle-query cost within budget on RTX 3070 desktop and a mid-tier mobile target.
- [ ] Field sim-baseline still passes byte-identical (the Cycle 5 contract holds).

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/cycle-5-plan.md`](cycle-5-plan.md) — what shipped last cycle, including the primitives this cycle consumes
- [`shared/SceneObstacles.js`](../shared/SceneObstacles.js) — kdbush index + `obstacleAvoidance` math (built Cycle 5)
- [`shared/Random.js`](../shared/Random.js) — `mulberry32` seeded PRNG (built Cycle 5)
- [`C:/Users/Mattm/X/games-3d/pixel-forge`](file:///C:/Users/Mattm/X/games-3d/pixel-forge) — LLM-authored Three.js → GLB asset pipeline (candidate for bespoke rocks per Q3)
