# Cycle 30 — heightfield-unify

> Cold-start: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) → this doc → [`../CLAUDE.md`](../CLAUDE.md) / [`../AGENTS.md`](../AGENTS.md). Prior cycles: [`archive/cycles/`](archive/cycles/).

## Goal

After 14 cycles of layered defenses around the heightfield Y contract, collapse the visible-surface lookup to **one** source: triangle-interp against the terrain mesh's captured vertex grid. Eliminate the `+ 0.05m` "defensive lift" fallback in [`Heightfield.meshSampleY`](../shared/terrain/Heightfield.js) (Cycle 9 Phase 5, carried for compatibility through Cycle 14). After Cycle 30, every `surfaceY` / `meshSampleY` call returns triangle-interp against a bound `displacedHeights` grid; constructing a Heightfield without a mesh grid and then asking for a visual Y is a hard error, not a silent +0.05 patch.

User-visible difference: **none** at runtime — `displacedHeights` is set on every render path today, so the fallback only fires in tests. The win is contract clarity: one algorithm for visible terrain Y, one place that owns the displacement math (Heightfield, not TerrainBuilder), and the last "patches masking patches" knot from the polish program is gone.

## How to read this plan

This doc fixes the *shape* of the changes (where the algorithm lives, the migration story for the fallback, acceptance criteria), not the implementation choices. Each phase is **fully autonomous**: ship without pairing.

## Open questions to resolve before writing code

1. **Q1: When `meshSampleY` is called with no bound grid, throw or fall back to raw `sample()`?** Author lean: **throw**. The whole point of `meshSampleY` is "give me the Y the renderer drew." If no grid is bound, the answer isn't "approximately bilinear" — the answer is "you asked the wrong API." A throw forces every consumer to be explicit about sim-Y vs visual-Y. The current callers (Sheepdog, OptimizedSheep, GrassSystem, TerrainBuilder._groundY) all guard with `if (this.heightfield)` before calling, so a throw never fires at runtime — only in tests that forget to bind a grid. Resolved: **throw**.
2. **Q2: Should `bakeMeshGrid` live as an instance method or a static factory?** Author lean: **instance method on Heightfield**. Mutates `this.displacedHeights` via `setMeshGrid` and reads `this.worldSize` / `this.peakHeight` / `this.sample`. Returns the `Float32Array` for the caller to read (TerrainBuilder needs the array to write mesh vertex Z). Resolved: **instance method, returns the displacedHeights array**.

## Architecture / shared changes

**One algorithm, one home.** Today the terrain mesh's vertex Y math is split:

- [`scripts/bake-heightmap.mjs`](../scripts/bake-heightmap.mjs) writes the texel grid (R32F + manifest JSON).
- [`Heightfield.sample`](../shared/terrain/Heightfield.js) bilinearly samples that grid, multiplied by `peakHeight`.
- [`TerrainBuilder.createTerrain`](../js/TerrainBuilder.js) loops over `(segments+1)²` mesh vertices, samples per-vertex with a square-radial smoothstep falloff over the last 20m, writes results into both the mesh and a sibling `displacedHeights` Float32Array, then hands the array to `Heightfield.setMeshGrid`.
- [`Heightfield.meshSampleY`](../shared/terrain/Heightfield.js) triangle-interps that grid for visual placement.

After Cycle 30, the per-vertex sample-and-falloff loop lives **on Heightfield** (`bakeMeshGrid({ segments, size })`); TerrainBuilder calls it once and reads the returned array to write mesh vertex Z. There's one place to read the algorithm, one place to test it, and "build a mesh grid for me" becomes trivially callable from tests / future Worker / future tools without dragging in Three.js.

## Phase shape rules

A cycle has **≤ 8 phases**. Each phase is fully autonomous OR fully paired. Each phase has a single sharp goal and ≤ 4 hours of work.

## Acceptance criteria — EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/) so the lines are testable by construction:

- **Event-driven**: `When [trigger], the [system] shall [response].`
- **State-driven**: `While [precondition], the [system] shall [response].`
- **Unwanted-event**: `If [unwanted], then the [system] shall [response].`

Each line is **grep-testable**. The `/cycle-close` reconciliation hook walks every Acceptance line and tries to grep its predicate against shipped commits + test output.

## Phase 1 — `Heightfield.bakeMeshGrid({ segments, size })` helper (~1.5hr)

**Independently testable.** Adds the new algorithm without changing any consumer; existing fallback path remains intact through Phase 2.

1. **Add instance method** on [`Heightfield`](../shared/terrain/Heightfield.js): `bakeMeshGrid({ segments, size })` returns `Float32Array` of length `(segments+1)²` and calls `this.setMeshGrid(...)` internally.
2. **Algorithm** (mirrors [`TerrainBuilder.createTerrain` lines 651–676](../js/TerrainBuilder.js)):
   - For each vertex `(ix, iy)` on the `(segments+1)²` grid covering `size × size` centred on origin:
     - Compute world `(worldX, worldZ)` from `(ix, iy)`.
     - Call `this.sample(worldX, worldZ)` (raw heightfield bilinear, peak-multiplied).
     - Compute `radial = max(|worldX|, |worldZ|)` (square radial falloff matches the visible mesh).
     - Apply smoothstep falloff over the last 20m of `this.worldSize`: `falloff = 1` for `radial ≤ worldSize/2 - 20`, smoothstep-decreasing to `0` at `radial ≥ worldSize/2`.
     - Write `h * falloff` into `displacedHeights[iy * (segments+1) + ix]`.
3. **Write spec** at [`tests/heightfield-mesh-y.spec.js`](../tests/heightfield-mesh-y.spec.js) (additive, don't break existing tests). Cover:
   - Smooth field with `size = worldSize` reproduces `sample()` at vertex points (no falloff).
   - Smooth field with `size > worldSize` shows the smoothstep falloff at the edge.
   - Returned array length is `(segments+1)²`.
   - `setMeshGrid` was actually called (verified by `meshSampleY` switching paths).
   - Grid produced by `bakeMeshGrid` and grid produced by hand-rolling the same algorithm match byte-for-byte.

**Acceptance (EARS):**

- When Phase 1 ships, then `git ls-files shared/terrain/Heightfield.js` shall show `bakeMeshGrid` as a defined instance method.
- When Phase 1 ships, then `npm test` shall pass with at least 5 new specs under `Heightfield.bakeMeshGrid` describing the algorithm.
- While `displacedHeights` is null and `bakeMeshGrid` has not been called, the existing `meshSampleY` fallback path shall still return `sample(x, z) + 0.05` (no behaviour change to existing fallback in this phase).
- If `bakeMeshGrid` is called with `segments < 1` or `size <= 0`, then `Heightfield` shall throw `RangeError`.

## Phase 2 — `TerrainBuilder.createTerrain` consumes `bakeMeshGrid` (~1hr)

**Depends on:** Phase 1.

1. **Refactor** the displacement loop at [`js/TerrainBuilder.js:646–686`](../js/TerrainBuilder.js): replace the in-place vertex sampling + smoothstep + `displacedHeights` Float32Array build + `setMeshGrid` call with:
   - `const displacedHeights = this.heightfield.bakeMeshGrid({ segments: terrainSegments, size: terrainSize });`
   - One thin loop: `for (let i = 0; i < positions.count; i++) positions.setZ(i, displacedHeights[i]);`
   - Keep `positions.needsUpdate = true; terrainGeometry.computeVertexNormals();`.
2. **Verify** the inner-loop `sample(worldX, worldZ)` and the smoothstep math agree with the new helper — they must, because Phase 1 lifted them verbatim.
3. **Refactor-baseline**: confirm [`tests/refactor-baseline/`](../tests/refactor-baseline/) terrain-mesh-related fixtures (if any) still pass byte-identical. If `terrain-mesh-hash.json` exists and drifts even one byte, the refactor introduced a bug — abort and diagnose, do not regenerate.

**Acceptance (EARS):**

- When Phase 2 ships, then `wc -l js/TerrainBuilder.js` shall return at least 15 fewer lines than the pre-cycle baseline (the inline displacement loop is gone).
- When Phase 2 ships, then `grep -n "displacedHeights\[i\] = y" js/TerrainBuilder.js` shall return zero matches (the per-vertex Float32Array write moved to Heightfield).
- When `npm run build` runs after Phase 2, production build shall be clean and bundle sizes shall stay within ±2 KiB of the pre-cycle main + three baselines (575 / 603 KiB).
- When `npm test` runs after Phase 2, all vitest specs shall pass with no fixture regeneration.
- If a refactor-baseline fixture (e.g. `terrain-mesh-hash.json`) drifts, then the phase shall abort; do not regenerate.

## Phase 3 — Delete the +0.05 fallback + migrate tests + codify (~1.5hr)

**Depends on:** Phase 2.

1. **Replace fallback in [`Heightfield.meshSampleY`](../shared/terrain/Heightfield.js)**:
   - Old: `if (!grid) return this.sample(x, z) + 0.05;`
   - New: `if (!grid) throw new Error('Heightfield.meshSampleY: no mesh grid bound. Call setMeshGrid or bakeMeshGrid before asking for visual Y.');`
2. **Update JSDoc** on `meshSampleY` and `surfaceY` — drop the "Falls back to `sample(x, z) + 0.05` when no mesh grid has been set" / "still useful as a defensive default" sentences. The new contract is: visual-Y requires a grid; sim-Y uses `sample()` directly.
3. **Migrate the fallback-using spec** at [`tests/heightfield-mesh-y.spec.js:164`](../tests/heightfield-mesh-y.spec.js): replace "falls back to sample + 0.05" with "throws when no mesh grid is bound" + a positive sibling test "falls through correctly once `bakeMeshGrid` is called". Existing positive tests stay untouched.
4. **DECISIONS.md entry** — append a date-stamped new entry codifying the post-Cycle-30 contract: "Heightfield.meshSampleY requires a bound mesh grid; Cycle 9 Phase 5's defensive +0.05m lift is removed in Cycle 30."
5. **CHANGELOG.md** — under the unreleased / current-development section, one bullet noting the Cycle 9 Phase 5 patch is removed (internal cleanup, no player-visible change).

**Acceptance (EARS):**

- When Phase 3 ships, then `grep -n "+ 0.05" shared/terrain/Heightfield.js` shall return zero matches.
- When Phase 3 ships, then `grep -n "Cycle 9 Phase 5" shared/terrain/Heightfield.js` shall return zero matches (doc comment updated).
- When `meshSampleY` is called with no bound grid, then `Heightfield` shall throw an `Error` whose message names `meshSampleY` and the remediation (`setMeshGrid` / `bakeMeshGrid`).
- When Phase 3 ships, then [`DECISIONS.md`](../DECISIONS.md) shall contain a new entry dated 2026-05-09 (or later) referencing the heightfield-unify cycle and the removal of the defensive lift.
- When `npm test` runs at Phase 3 close, all vitest specs shall pass.
- When `npm run build` runs at Phase 3 close, production build shall be clean.

## Dependencies

```
Phase 1 → Phase 2 → Phase 3
```

Strictly serial. Phase 1 adds the new algorithm without changing any consumer (the +0.05 fallback is still intact). Phase 2 retargets the only runtime consumer (TerrainBuilder) to use the new algorithm. Phase 3 is the deletion + contract codification, and depends on Phase 2 having proven the runtime path is fine.

## Frozen files (cycle-specific additions)

[`shared/terrain/Heightfield.js`](../shared/terrain/Heightfield.js) is **not** in [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) (only the deterministic-sim cores are). No fence-authorization needed for this cycle — but the rule [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) "Heightfield single source of truth" applies: the contract that "anything placing visible geometry on the ground goes through `_groundY`, not raw `sample`" stays intact post-cycle.

The deterministic-sim cores ([`shared/MovementPhysics.js`](../shared/MovementPhysics.js), [`shared/BoundaryCollision.js`](../shared/BoundaryCollision.js), [`shared/FlockingAlgorithms.js`](../shared/FlockingAlgorithms.js), [`shared/GameStateValidation.js`](../shared/GameStateValidation.js), [`shared/Vector2D.js`](../shared/Vector2D.js)) are **untouched** by this cycle — sim doesn't read heightfield Y at all today.

## Hard stops

Durable hard stops apply on every cycle — see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). The cycle-specific stops below add discipline for this cycle's risks:

1. **Refactor-baseline fixture drift.** If [`tests/refactor-baseline/`](../tests/refactor-baseline/) goldens drift even one byte after Phase 2, abort the phase. Do not regenerate. The Phase 2 refactor is supposed to be byte-identical at the mesh level (same algorithm, same inputs, same outputs).
2. **Sim-baseline drift.** Sim does not read heightfield Y today. If [`tests/sim-baseline/`](../tests/sim-baseline/) drifts, something else changed — abort and diagnose.
3. **Bundle regression.** If `main-*.js` or `three-*.js` exceeds the pre-cycle baseline by more than 2 KiB, abort. The change should net ≤ 0 (less code).
4. **Visible-terrain regression.** If anyone notices "trees float" / "grass underground" / "dog walks through hill" mid-cycle, the bake helper's algorithm diverges from TerrainBuilder's pre-refactor loop. Abort, byte-diff the two arrays, fix.

## What NOT to do during this cycle

- **Don't bake `displacedHeights` into [`scripts/bake-heightmap.mjs`](../scripts/bake-heightmap.mjs)'s build-time output.** That's tempting (it would let the worker pre-load the mesh grid without recomputing) but the worker doesn't read heightfield Y today, and adding a build-time output without a current consumer is speculative scope. Future MP island scenes (Cycle 31 candidate) can revisit.
- **Don't migrate sim consumers to `meshSampleY`.** Per [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) "Heightfield single source of truth" + the existing JSDoc on `meshSampleY`: sim/physics use `sample()` so behaviour stays decoupled from render-time mesh resampling. Don't touch this.
- **Don't delete `_groundY` in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js).** It's a one-liner today, but [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) names it as the entry point for visible-geometry ground placement. Inlining `meshSampleY` everywhere is a separate decision; this cycle keeps `_groundY` as the named seam.
- **Don't auto-bump version.** Internal cleanup, no player-visible change. Version bumps are explicit and reviewed.
- **Don't expand to MP island scenes mid-cycle.** That's the Cycle 31 candidate; out of scope here.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item.

- [ ] When the cycle closes, all 3 phases shall be shipped or explicitly deferred to Cycle 31's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass (290 + new specs from Phase 1 + Phase 3 migration).
- [ ] When `npm run build` runs at cycle close, production build shall be clean with `main-*.js` ≤ 575 KiB and `three-*.js` ≤ 603 KiB (no bundle regression).
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When `grep -n "+ 0.05" shared/terrain/Heightfield.js` runs at cycle close, it shall return zero matches.
- [ ] When `grep -n "displacedHeights\[i\] = " js/TerrainBuilder.js` runs at cycle close, it shall return zero matches (the per-vertex write moved to Heightfield).

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) — pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-9-plan.md`](archive/cycles/cycle-9-plan.md) — origin of the +0.05m defensive lift (Phase 9.5)
- [`docs/archive/cycles/cycle-14-plan.md`](archive/cycles/cycle-14-plan.md) — `meshSampleY` triangle-interp foundation (Phase 1)
- [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) — Heightfield single-source-of-truth contract
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
