# Cycle 16 — tree-foliage-lod-and-perf

> Drafted 2026-05-03 after Cycle 15 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Cycle 15 baked 28 asset variations into staging and shipped the gallery + integrate pipeline, but tree review surfaced a foundational issue: leaves are 90-96% of all tree triangles and there's no LOD chain — every tree at every distance renders its full ~50k-tri canopy. Cycle 16 fixes that with the proper game-dev tree foliage pipeline (LOD0 mesh / LOD1 reduced / LOD2 billboard impostor), then picks the asset variations on top of the optimized geometry, captures the perf baseline, and ships hero cards + the `v1.1.0` tag.

User-visible difference: distant trees stop costing ~50k tris each (scaled across the OC horizon zone, that was tens of millions of tris/frame), close-up trees stop reading as asymmetric "bare-quadrant" canopies, the meadow lands its long-promised polish (rocks, dandelion patches, mushrooms scaled correctly), and the marketing surface (OG cards + cinematic videos + `v1.1.0` tag) catches up.

## How to read this plan

This doc fixes the *shape* of the tree LOD pipeline and the carryover work — **not the implementation choices**. Each phase suggests a starting technique; agents picking up phases should validate against current best practice (the Three.js + WebGL ecosystem moves fast — the answer that's "right" today might be "second-best" in three months).

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code. Phase 1 specifically: re-read the Cycle 15 closing research notes, check whether `@three.ez/instanced-mesh@latest` has new APIs that supersede `addLOD`, and look at the [Procedural Instanced Forest WebGPU port](https://github.com/pmmathias/birdybird) for ideas before committing to the EZ-Tree path.
- **Measure on real hardware** (RTX 3070 desktop + mid-tier mobile) before committing. The perf harness shipped in Cycle 15 (`npm run perf:baseline` + `npm run perf:check`) is the measurement tool — use it.
- **Pick the simplest thing that meets the budget.** If `leaves.billboard: 'Single'` + lower count + LOD distance cull gets us under the perf budget, ship that and skip billboard impostors. If it doesn't, escalate to impostor authoring (Phase 2).

## Open questions to resolve before writing code

1. **Q1 (Phase 1): Bark color contrast strategy.** Current per-species tints (aspen `0x7a5a3a`, oak `0x5a3a26`, pine `0x4a3525`, ash `0x6e4f30`) read as too contrasting in Matt's review. Three options: (a) tighten to a 0x60-0x70 range so all trees share a brown family, (b) single bark tone across all species and let leaf textures differentiate, (c) per-species but within a tighter range (0x6E to 0x5A). Author lean: **(a) tighten to 0x60-0x70**.
2. **Q2 (Phase 1): Asymmetric canopy fix.** EZ-Tree's seeded angular distribution can cluster children on one quadrant on unlucky seeds. Two options: (a) bump `branch.children` to higher uniform values so angular variance averages out (canopies get denser everywhere), (b) re-roll seeds per recipe until each species comes out symmetric (keeps existing density). Author lean: **(b) re-roll seeds first; bump children only if specific species can't find a balanced seed**.
3. **Q3 (Phase 1): LOD strategy.** Three options laid out in cycle-15 close notes: (A) lower leaf cost only (recipe knobs), (B) `InstancedMesh2.addLOD` chains, (C) vertex-shader cull at distance D, (E) billboard impostor at distance > 120m. Author lean: **A + B + E for the proper pipeline**. C is a clever optimization but not a foundation.
4. **Q4 (Phase 4): Flora rebuild scope.** Existing Quaternius CC0 mushrooms + flowers in `assets/models/scatter/` may just need tuning (oversampleFraction + mushroom targetHeight) rather than full replacement. Author lean: **tune first, replace only if tuning can't get the readability**.

These don't all block Phase 1 (LOD authoring is independent of bark color), but should be resolved before re-baking trees.

## Architecture / shared changes

No new shared primitives expected. The cycle is asset-pipeline + render-loop work; sim and shared/ are out of scope.

## Phase 1 — Tree foliage LOD authoring + recipe re-tune (~5-7hr)

**Independently testable.** The headline phase. Lower per-tree LOD0 cost upfront, wire LOD1 (reduced) for mid-distance, leave LOD2 billboard impostor for Phase 2.

1. **Re-tune the 12 recipes** in [`tools/bake-trees.mjs`](../tools/bake-trees.mjs):
   - Set `leaves.billboard: 'Single'` across the board (4 tris/leaf instead of 8 — instant 50% cut).
   - Lower `leaves.count` from 40-72 → 24-36 across recipes; compensate with `leaves.size` ~30% higher so the canopy still reads dense.
   - Tighten bark tints per Q1 resolution.
   - Re-roll seeds per Q2 resolution until each recipe lands a symmetric canopy (verify via gallery preview).
   - Re-bake: `npm run bake-trees` → re-stages 12 GLBs.
2. **Author LOD1 recipes** — reduced-canopy variants with ~50% of LOD0 leaf count, fewer branch children. Bake into `tools/asset-gallery/staging/trees-lod1/` as a sibling subfolder.
3. **Wire `InstancedMesh2.addLOD`** in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) around line 1077 (where `new InstancedMesh2(...)` is called for tree pools). Each tree GLB has trunk + leaves child meshes — both need their own LOD chains. LOD0 → LOD1 distance ~80m, hysteresis ~10m. (LOD2 billboard added in Phase 2.)
4. **Pick + integrate** via the gallery: `npm run gallery` → pick 3 trees (one slim, one broad, one conifer ideally) → `node tools/asset-gen/integrate.mjs --compress`. Tree picks should match the canonical tree1/tree2/pine slots (sorted by bbox.sy ascending).
5. **Visual verification** via [`tools/probe.mjs`](../tools/probe.mjs) on each scene at noon + sunset.

**Acceptance:** Tree GLBs total < 3 MB committed (the `tests/tree-assets.spec.js` ceiling). Leaves no longer read as asymmetric. Bark color reads coherent across species. Distant trees swap to LOD1 by 80m without visible pop. No regression on `npm test`.

## Phase 2 — Billboard impostor LOD2 (~4-6hr)

**Depends on:** Phase 1 (LOD0/LOD1 must be authored before LOD2 can be baked from them).

1. **Bake billboard impostor textures** at build time. New `tools/bake-impostors.mjs` (Playwright harness pattern same as bake-trees): for each LOD0 tree GLB, render from 8 angles around Y axis, capture each as a WebP texture, pack into a per-tree atlas (~256² per angle, ~5-8 KB total per tree).
2. **Author single-quad LOD2 geometry** — a 1m × 1m plane facing camera, sampling the atlas via screen-aligned billboarding in the shader (vertex-shader rotation around Y so the plane always faces camera).
3. **Wire LOD2 into `addLOD` chain** at distance > 120m, hysteresis ~15m. Pair with the existing tree-leaf-wind shader patch so impostor trees still sway (just sample the atlas + apply the same gust-envelope offset).
4. **Verify perf:** OC horizon view should drop from ~50k tris × ~30 horizon trees = 1.5M tris → ~30 trees × 2 tris = 60 tris. Capture via `__sdsRenderer.info.render.triangles`.

**Acceptance:** Distant trees (>120m) cost ~2 tris each. Impostor texture quality reads cleanly at full resolution from any camera angle. No visible LOD pop with hysteresis tuned.

## Phase 3 — Asset picks + flora tuning (~3-4hr)

**Depends on:** Phase 1 (tree LOD must be authored before tree picks make sense).

1. **Rock picks** — `npm run gallery -- --dir=tools/asset-gallery/staging/rocks`, pick 3, integrate. The 16 rock variations are independent of tree work and could be picked first.
2. **Tree picks** — happens as part of Phase 1 step 4 (after re-tune + LOD bake).
3. **Flora tuning per Q4** — bump `oversampleFraction` in [`js/ScatterSystem.js`](../js/ScatterSystem.js) from 0.05 → 0.10 for visible dandelion clusters. Bump mushroom `targetHeight` from 0.30/0.35m → 0.50m if still reading tiny. Verify via probe on each scene at sheep-cam distance.
4. **Optional flora replacement** — if tuning isn't enough, build `tools/bake-flora.mjs` (cone+sphere mushroom primitives, plane+texture flowers) following the same recipe pattern as bake-rocks. ~3hr if needed.

**Acceptance:** Rocks read as rocks at sheep-cam. Dandelion clusters catch the eye on Field + RH. Mushrooms either readable or removed.

## Phase 4 — Perf baseline + regression triage (~3-4hr)

**Depends on:** Phases 1, 2, 3 (need the polished world for the baseline to be meaningful).

1. **Capture baseline:** `npm run dev` + `npm run perf:baseline` — 6 configs (Field/RH/OC × Classic/Extreme), warmup 3s + measure 15s each, ~15min total.
2. **Commit `tests/perf-baseline/baseline.json`** to pin.
3. **Triage** if any config exceeds the pre-Cycle-14 mental baseline by > 5%. Suspects (in order of plausibility): InstancedMesh2 BVH bookkeeping per-frame, ScatterSystem 9-variant draw-call multiplication, tree GLB GPU upload spike. Profile via Chrome DevTools performance tab + `__sdsRenderer.info` snapshots before patching.
4. **Patch** the bottleneck if found. Hard rule: any patch must hold frametime within ±5%; if it can't, revert.

**Acceptance:** Frametime within ±5% of pre-Cycle-14 baseline on RTX 3070 desktop and mid-tier mobile. `npm run perf:check` passes.

## Phase 5 — Perf:check CI integration (~2-3hr)

**Depends on:** Phase 4 (baseline must exist + be committed first).

1. **Add `perf-check` job** to [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) running `npm run perf:check`. Runs against the committed `tests/perf-baseline/baseline.json`. Calibrate the +5% threshold to absorb GH Actions Linux runner noise — Linux software-WebGL through swiftshader is materially slower than the local Chromium dev workstation, so the absolute numbers in the baseline.json should be Linux-runner numbers, not local numbers. (Likely re-run `perf:baseline` once on a clone-the-runner Docker image.)
2. **Wire perf:check failure** to fail the deploy job (block the push). Optional: add an `[skip-perf]` commit-message escape hatch.

**Acceptance:** CI fails on > 5% regression. Tuning-knob changes can be evaluated with one command.

## Phase 6 — Hero cards + `v1.1.0` tag (~2-3hr)

**Depends on:** Phases 1, 2, 3, 4 (the polished world needs to actually be polished + perf-clean before marketing surface lands).

Workflow + helpers all shipped in Cycle 13. Needs Matt at the keyboard for camera posing.

1. **Three OG cards** (`og-rh-sunset`, `og-field`, `og-open-country`). Open URL → start Solo Extreme → `await __sdsCinema.freeFly()` → pose with mouse → `__sdsCinema.snapshotPose()` → paste pose into [`tools/cinematic/shot-list.mjs`](../tools/cinematic/shot-list.mjs) → `npm run cinema --shot=<id>`.
2. **Four cinematic videos** (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`). Camera coords already in shot-list; iterate framing on the polished world.
3. **Tag `v1.1.0`.** Bump [`package.json`](../package.json) + [`worker/package.json`](../worker/package.json), append [`CHANGELOG.md`](../CHANGELOG.md), `git tag v1.1.0 && git push origin main --tags`.

**Acceptance:** Three OG cards (≤300 KB each) on the marketing page. Four MP4 videos (each <10 MB) embedded. `v1.1.0` tagged and live.

## Dependencies

```
Phase 1 (LOD authoring + re-tune)         — foundation; must land first
Phase 2 (billboard impostor LOD2)         — depends on Phase 1
Phase 3 (asset picks + flora tuning)      — depends on Phase 1 (trees specifically)
Phase 4 (perf baseline + triage)          — depends on Phases 1, 2, 3
Phase 5 (perf:check CI integration)       — depends on Phase 4
Phase 6 (hero cards + v1.1.0)             — depends on Phases 1, 2, 3, 4
```

This is mostly sequential (the tree LOD work gates everything else). Phases 2 + 3 can parallelize after Phase 1 lands. Phase 5 is small and can run any time after Phase 4.

## Frozen files (cycle-specific additions)

- [`tests/sim-baseline/`](../tests/sim-baseline/) — never regenerate during this cycle.
- [`shared/MovementPhysics.js`](../shared/MovementPhysics.js) + [`worker/src/GameSim.js`](../worker/src/GameSim.js) — sim is out of scope.
- [`shared/TreePlacement.js`](../shared/TreePlacement.js) — placement contract; only the GLB targets + LOD chains change, not the placement algorithm.

## Hard stops

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure — escalate, don't regenerate fixtures.
3. Frametime regression > 5% on RTX 3070 desktop or mid-tier mobile — Phases 1, 2, 4 must hold this line.
4. Visual regression on a previously-passing scene.
5. Tree LOD pop visible at typical play distances — hysteresis must be tuned to absorb camera bobble.

## What NOT to do during this cycle

- **Don't touch sim physics** — same boundary as Cycle 14, 15.
- **Don't migrate to TSL or WebGPU** — still deferred. The tree LOD math + leaf shaders port cleanly when the time comes, but the port is its own cycle.
- **Don't replace EZ-Tree with the [Procedural Instanced Forest](https://discourse.threejs.org/t/procedural-instanced-forest-high-performance-real-trees/88610)** unless Phase 1's `addLOD` approach demonstrably fails to hit the perf target. PIF is in the long-tail bucket - interesting, permissively licensed, has WebGPU port, but a different pipeline + aesthetic from the EZ-Tree investment.
- **Don't rebuild flora from scratch** until Q4's tuning-first approach is tried — bumping `oversampleFraction` + `targetHeight` is 5min of code; building `bake-flora.mjs` is 3-4hr.
- **Don't tag `v1.1.0` until Phases 1-4 land cleanly** — the marketing surface has to land on a perf-clean polished world.
- **Don't ship hero cards from a regressed-perf build** — the OG cards are the user's first impression; they have to load fast on a marginal device.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] Phase 1 — Tree LOD0/LOD1 authored. Leaves no longer asymmetric. Bark coherent. Trees swap LOD0→LOD1 at ~80m without visible pop.
- [ ] Phase 2 — Billboard impostor LOD2 shipped. Distant trees cost ~2 tris each.
- [ ] Phase 3 — Rocks + tree picks integrated. Flora tuned (or replaced) so dandelion patches are visible + mushrooms readable.
- [ ] Phase 4 — Frametime within ±5% of pre-Cycle-14 baseline. `tests/perf-baseline/baseline.json` committed.
- [ ] Phase 5 — `perf-check` CI job green. Pinned threshold absorbs runner noise.
- [ ] Phase 6 — Three OG cards + four cinematic videos shipped. `v1.1.0` tagged + live.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] Live on sheepdogsim.com via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle template.
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files.
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items (incl. Cycle 15 carryover entry that this plan picks up).
- [`docs/archive/cycles/cycle-15-plan.md`](archive/cycles/cycle-15-plan.md) — prior cycle plan (visuals polish + harness scaffold).
- [`docs/tree-pipeline.md`](tree-pipeline.md) — Cycle 15's seed→GLB tree pipeline contract (still applies; LOD authoring extends but doesn't replace it).
- [`tools/asset-gallery/README.md`](../tools/asset-gallery/README.md) — bake-and-pick workflow.
- [Procedural Instanced Forest (red-reddington)](https://discourse.threejs.org/t/procedural-instanced-forest-high-performance-real-trees/88610) - alternative path; permissively licensed; vertex-shader leaf cull is a clever trick worth borrowing even if we keep EZ-Tree.
- [@three.ez/instanced-mesh `addLOD` API](https://github.com/agargaro/instanced-mesh) — the LOD primitive Phase 1 wires in.
