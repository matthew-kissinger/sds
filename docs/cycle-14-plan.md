# Cycle 14 — `visuals-foundation`

> Drafted 2026-05-02. Replaces an earlier draft of Cycle 14 that focused on bundle/test/WebGPU foundations — those threads pushed to Cycle 15+. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom, then the three research dossiers in this directory ([`research-grass-2026-05.md`](research-grass-2026-05.md), [`research-trees-2026-05.md`](research-trees-2026-05.md), [`research-rocks-and-scatter-2026-05.md`](research-rocks-and-scatter-2026-05.md)).

## Goal

Lift the visual quality from "indie tech demo" to "AAA browser game" through four sequenced visual fixes: (1) eliminate the long-standing **Heightfield Y mismatch** that makes grass/trees/rocks float intermittently, (2) modernize **grass wind + rendering** so the field reads as zen-cinematic rather than jittery-noisy, (3) replace **trees** with stylized Ghibli-feel assets and a proper leaf shader + LOD pipeline, (4) replace **rocks** + add a new **ground-scatter system** (pebbles, sticks, mushrooms, wildflowers) for "alive meadow" feel. Then re-render the v1.1.0 hero cards on a polished surface.

User-visible difference between before and after: the world *looks* AAA — no floating props, no jittery grass, no flat foliage, no empty meadows. Same gameplay, different planet.

## How to read this plan

This doc fixes the *shape* of the changes — what to swap, what contracts to pin, what acceptance looks like — **not the implementation choices**. The three [research dossiers](research-grass-2026-05.md) capture 2024-2026 best practices the cycle is built on; cite them, don't re-derive.

Each agent picking up a phase should:

- **Read the relevant research dossier first.** Each phase below references its dossier; that's where the technique inventory + reference-implementation links live.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing to a technique. Use the existing `__sdsStressTestSwaps` harness for swap-cost regressions and the `oc-perf` Playwright spec for frametime baselines.
- **Pick the simplest thing that lifts the visual quality.** Each phase's "Recommended path for SDS" in the dossier is the conservative-yet-modern starting point — escalate only on demonstrated gap.
- **Sim baseline must remain byte-identical** — visual changes are vertex-shader and asset swaps; nothing in this cycle should touch sim physics. If `sim-baseline` fails, that's the bug, don't regenerate.

## Open questions to resolve before writing code

1. **Q1 (Phase 1): How aggressive should the heightfield-Y unification be?** Author lean: **add a new `Heightfield.meshSampleY()` method**, leave existing `sample()` untouched (sim depends on it byte-identical), migrate visual consumers (grass, trees, rocks, sheep, dog) to the new method. Keep `surfaceY()` as a thin wrapper for backward compat. This is the conservative path; the alternative (rewriting `sample` itself) risks sim-baseline breakage.
2. **Q2 (Phase 2): Grass shader — port to TSL now or stay GLSL?** Author lean: **stay GLSL.** The Bezier+gust math from [`research-grass-2026-05.md`](research-grass-2026-05.md) ports to either; rewriting in TSL adds WebGPU-migration scope creep. TSL conversion belongs to the WebGPU spike (deferred to Cycle 15).
3. **Q3 (Phase 3): Tree assets — Quaternius MegaKit, Stylized Tree Pack, or 150+ LowPoly?** Author lean: **MegaKit** — it pairs with the rocks pack from the same author for visual coherence and is bundled-CC0. Audit 4-5 hero trees that match the cozy-game feel; reject any that look too cartoony.
4. **Q4 (Phase 4): ScatterSystem — sibling to GrassSystem or bolt onto it?** Author lean: **sibling.** Per the rocks dossier, "the timing/wind/LOD coupling will hurt" if grafted onto grass. New file [`js/ScatterSystem.js`](../js/ScatterSystem.js) following the GrassSystem instancing pattern.
5. **Q5 (Phase 5): Hero card framing — re-derive in-browser via `__sdsCinema.freeFly()` or pin in `shot-list.mjs`?** Author lean: **pin in shot-list.mjs.** Cycle 13 Phase 1 added `freeFly` + `snapshotPose` for live posing, then ship the resulting coords back into the shot config so `npm run cinema --shot=...` is reproducible. Cycle 13's shipped og-rh-sunset.webp was hand-captured; replacing it with a cinema-runner render means future asset refreshes don't require remembering this exact pose.

## Architecture / shared changes

**Phase 1 introduces `Heightfield.meshSampleY()` + a captured `displacedHeights: Float32Array`.** This is the load-bearing primitive for the rest of the cycle. After [`TerrainBuilder.createTerrain()`](../js/TerrainBuilder.js#L414) computes vertex displacement, it captures the displaced Ys into a Float32Array sized to the terrain mesh vertex grid (385×385 desktop, 257×257 mobile) and hands it to the Heightfield instance. The new method does triangle interpolation against this array — the same interpolation the renderer does, so consumers see exactly the visible ground Y.

**No new dependencies for Phase 2** (grass is shader-only). **Phase 3 adds `@three.ez/instanced-mesh`** for tree LOD. **Phase 4 adds `poisson-disk-sampling`** (or rolls our own — kdbush already has spatial bones we could reuse). **Phase 5 reuses Cycle 13's freeFly helper** — no new code.

## Phase 1 — Heightfield Y unification (~3-4hr)

**Independently testable.** Foundation for Phases 2-4 — they all benefit from props sitting at the right Y.

Per [`docs/BACKLOG.md`](BACKLOG.md) "Heightfield Y full unification" deferred item, plus diagnosis confirmed during Cycle 13 close (sheep visibly intersect grass blade bottoms). Bilinear `Heightfield.sample()` (~1.5m grid) doesn't agree with terrain mesh triangle interp (~10.4m grid on desktop). Inside any 10m quad on a slope, the two diverge — that's why grass/trees/rocks float intermittently.

1. **Capture displaced heights** in [`TerrainBuilder.createTerrain()`](../js/TerrainBuilder.js#L414). After `terrainGeometry.computeVertexNormals()` (~line 458), build `displacedHeights: Float32Array((segs+1) * (segs+1))` where each cell stores the post-displacement, post-falloff Y for that vertex. Store on the heightfield instance.
2. **Add [`Heightfield.meshSampleY(x, z)`](../shared/terrain/Heightfield.js).** Algorithm:
   - Map world (x, z) → grid coords on the (segs+1)² grid (using `terrainSize` not `worldSize`).
   - Identify the quad via `floor(u)`, `floor(v)`.
   - Identify which triangle: `PlaneGeometry` splits each quad along the NW-SE diagonal — if `(u-floor) + (v-floor) < 1` use the NW triangle, else SE.
   - Compute barycentric coords against the 3 vertex Ys; return interpolated Y.
   - If `displacedHeights` not set (worker, tests), fall back to `sample()`.
3. **Update visual consumers** to use `meshSampleY` (or `surfaceY` as the wrapper):
   - [`js/Sheepdog.js:753`](../js/Sheepdog.js#L753) — already uses `surfaceY`; surfaceY now calls meshSampleY internally. No change at call site.
   - [`js/OptimizedSheep.js:692`](../js/OptimizedSheep.js#L692) + [`:753`](../js/OptimizedSheep.js#L753) — same.
   - [`js/GrassSystem.js:874`](../js/GrassSystem.js#L874) — drop the `-0.1` "dip into mesh" hack, switch from `sample()` to `meshSampleY()`. The hack was an explicit workaround for this exact bug; it's now obsolete.
   - [`js/TerrainBuilder.js:666`](../js/TerrainBuilder.js#L666) (trees) — switch `_groundY()` to `meshSampleY()`. Drop the `_groundY()` wrapper if it's no longer needed.
   - [`js/TerrainBuilder.js:1135`](../js/TerrainBuilder.js#L1135) (rocks) — same; drop the explicit `-finalScale * 0.10..0.20` bury hack (or reduce to ~0.05 for a deliberate buried look).
4. **Sim untouched.** Worker [`shared/MovementPhysics.js`](../shared/MovementPhysics.js), worker [`GameSim.js`](../worker/src/GameSim.js), and all uses of raw `sample()` stay byte-identical.
5. **Test.** Add [`tests/heightfield-mesh-y.spec.js`](../tests/heightfield-mesh-y.spec.js) — at least 6 cases pinning meshSampleY against handcrafted micro-grids. Existing [`tests/heightfield.spec.js`](../tests/heightfield.spec.js) stays. Sim baseline must remain byte-identical.

**Acceptance:** No visible floating grass/tree/rock on Field, RH, or OC at any zoom level. Sheep + dog don't visibly intersect grass blade bottoms. `tests/sim-baseline/` byte-identical. New mesh-Y spec adds ≥6 cases; total vitest count climbs from 149 → ≥155.

**Hard stop:** any sim-baseline fixture diff. The split between `sample()` (sim) and `meshSampleY()` (visuals) is the whole point — if sim drifts, the migration crossed the line.

## Phase 2 — Grass modernization (~5-7hr)

**Depends on:** Phase 1 (grass placement Y comes free).

Per [`docs/research-grass-2026-05.md`](research-grass-2026-05.md). Current pain: per-vertex simplex wind reads as jittery, not zen.

1. **Replace wind math** in [`js/GrassSystem.js`](../js/GrassSystem.js) (and the corresponding shader files in [`js/shaders/grass/`](../js/shaders/grass/)). Drop simplex-per-vertex; add 2 octaves of sin/cos in **world space** + a **Worley/ridged gust envelope** scrolling at 1-3 m/s in wind direction. The gust envelope modulates amplitude — this is the single biggest "zen" lever.
2. **Switch to Bezier blade spine.** 4 control points (root → 2 mid → tip), t² weighting on amplitude so the base stays anchored. Preserves blade length under bend; no rubber-band stretch.
3. **Migrate interactor uniforms → render texture.** Currently the per-frame loop in [`GrassSystem.update()`](../js/GrassSystem.js#L1061) writes to `interactorPositions` (220 entries on desktop, 10 mobile) and `interactorData`. Replace with a 64×64 RGBA float texture written once per frame via `texture.image.data` + `texture.needsUpdate = true`. Sample in vertex shader. Removes the per-frame uniform-array bottleneck.
4. **Add critically-damped recovery** for trampling. `c = 2*sqrt(k)`, no overshoot. The "no oscillation" is what makes recovery read as zen.
5. **Add fake-SSS back-lit term** — `pow(saturate(dot(V, -L)), 4) * tipColor * sssStrength`. Hero readability at sunset.
6. **Add tip gradient + curved-shading-normal** for blade-width feel; both are 1-line shader additions per the dossier.

**Acceptance:** Grass at noon reads as a coherent field (gusts breathe across the meadow). Grass at sunset reads with rim-light halo. Trampling under sheep recovers smoothly without spring oscillation. Frametime budget on RTX 3070 / mid-tier mobile within ±5% of current baseline.

## Phase 3 — Tree replacement + leaf shader + LOD pipeline (~6-8hr)

**Depends on:** Phase 1 (no more floating trees). Independent of Phase 2.

Per [`docs/research-trees-2026-05.md`](research-trees-2026-05.md).

1. **Source replacement GLBs** from Quaternius Stylized Nature MegaKit (CC0). Pick 4-5 hero trees that match the cozy-game feel: 2-3 broadleaf variants (replacing tree1, tree2), 1-2 conifer (replacing pine). Drop into `assets/models/trees/`. Compress via existing `npm run compress-glbs` pipeline.
2. **Update the GLB loader path** in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) to point at the new model files. Keep the existing model registry naming (`tree1`, `tree2`, `pine`) so [`shared/TreePlacement.js`](../shared/TreePlacement.js) stays untouched. **Verify `userData.modelBaseYOffset` is computed correctly** for the new pivots — different GLB authoring tools place pivots differently.
3. **Add `@three.ez/instanced-mesh` dependency.** `bun add @three.ez/instanced-mesh`. **Replace tree InstancedMesh sites** with the upgraded class — get per-instance frustum culling, BVH raycast, sorting, LOD for free.
4. **Register existing 3-quad billboard impostor as LOD1** on the same instance pool. Kills the 250m hand-off seam, reuses kdbush colliders. The current near→far swap logic at the 250m boundary becomes a single `setLOD(0|1, distance)` call per frame.
5. **Add leaf wind shader** via `onBeforeCompile` patch on the leaf material. ~30 lines GLSL: 3-octave sin in world space, weighted by `uv.y` (or vertex color R painted in Blender so trunk stays still). Reference: `EZ-Tree`, `douges.dev`, `polygon-wind`.
6. **Optional: fake-SSS back-light ramp** for Ghibli pop on shadow side. Same math as the grass back-lit term.
7. **Verify obstacle radius.** New tree silhouettes may need a different `kdbush` collider radius — check that sheep route around them naturally.

**Acceptance:** Trees on Field, RH, OC all read as cozy-game stylized (Ghibli-leaning). No 250m hand-off seam. Frametime within ±5% of current. Sheep + dog still route around trunks. Visual sweep on each scene at noon + sunset.

## Phase 4 — Rocks + ScatterSystem (~4-6hr)

**Depends on:** Phase 1 (no floating rocks). Independent of Phases 2-3.

Per [`docs/research-rocks-and-scatter-2026-05.md`](research-rocks-and-scatter-2026-05.md).

1. **Source 4-6 replacement rock GLBs** from Quaternius Stylized Nature MegaKit (CC0). Match scale variety to current cluster distribution (small / medium / large).
2. **Drop into `assets/models/rocks/`** + update the GLB loader path. Keep the existing rock-cluster placement code in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) — it's the asset that's swapping, not the placement algorithm.
3. **Add 12 lines of rim-light + base-darken** to the rock material via `onBeforeCompile` (or a new ShaderMaterial). Per the dossier:
   ```glsl
   float rim = pow(1.0 - dot(viewDir, normal), 2.0);
   color += rim * sunColor * 0.3;
   color *= mix(1.0, 0.5, smoothstep(0.3, 0.0, worldY - rockBaseY)); // base darken
   ```
4. **Author new file [`js/ScatterSystem.js`](../js/ScatterSystem.js)** following the [`GrassSystem`](../js/GrassSystem.js) instancing pattern. Constructor: `(scene, isMobile, sceneDef, heightfield, boundary)`. Internals:
   - Poisson-disk sample on the heightfield XZ plane (radius ~0.4m, capped at ~2k samples).
   - Render 4-5 prop variants via `InstancedMesh`: pebble, stick, mushroom, clover-tuft, dandelion. ~70% pebbles/sticks, ~20% small flora, ~10% punctuation clusters per dossier rule of thumb.
   - Cull beyond ~40m camera radius (per-frustum, not per-instance — too cheap to skip).
   - Subtle wind sway on flowers (same pattern as grass, lower amplitude).
5. **Yellow-patch oversampling.** On a subset of Poisson points, oversample 5-8 dandelions in a 1.5m radius — the eye-anchor clusters Ghibli meadows lean on.
6. **Wire into [`main.js`](../js/main.js) scene init.** Construct after GrassSystem; add to `disposeScene` teardown.

**Acceptance:** Each scene's meadow reads as "alive" — pebbles, sticks, flower clusters break up empty grass. Yellow dandelion patches catch the eye. Frametime budget unchanged. ScatterSystem disposable on scene swap (no leak — `__sdsStressTestSwaps(5)` drift unchanged).

## Phase 5 — Hero card re-render (~2-3hr)

**Depends on:** Phases 1-4. Last phase by design — the hero cards should show the polished world, not the in-progress one.

1. **Hero cards** (3 cards):
   - `og-rh-sunset` — Rolling Hills at dusk, Solo Extreme. Cycle 13 hand-captured a version; replace with a freeFly-derived pose that's pinned in [`shot-list.mjs`](../tools/cinematic/shot-list.mjs).
   - `og-field` — Field at golden hour, behind-dog wide.
   - `og-open-country` — OC at near-noon, drone overlook of the island disc + portal pillar.
2. **Workflow per card:** open URL → start Solo Extreme → `await __sdsCinema.freeFly()` → pose with mouse → `__sdsCinema.snapshotPose()` → paste pose into shot-list → `npm run cinema --shot=<id>`. Cycle 13 Phase 1 added the helpers; this just exercises them.
3. **Render the four cinematic videos** (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`). Camera coords already in [`shot-list.mjs`](../tools/cinematic/shot-list.mjs) but iterate framing on the polished world. Each is 6-10s @ 30fps; ~5 min wallclock per shot.
4. **Tag v1.1.0** once all cards + videos land. Bump [`package.json`](../package.json) + [`worker/package.json`](../worker/package.json), append [`CHANGELOG.md`](../CHANGELOG.md), `git tag v1.1.0 && git push origin main --tags`.

**Acceptance:** Three OG cards (≤300 KB each) on the marketing page. Four MP4 videos (each <10 MB) embedded. v1.1.0 tagged and live.

## Dependencies

```
Phase 1 (heightfield-Y unification)   — independent; do FIRST (foundation)
Phase 2 (grass modernization)         — depends on Phase 1
Phase 3 (trees + LOD)                 — depends on Phase 1; parallel to Phase 2
Phase 4 (rocks + ScatterSystem)       — depends on Phase 1; parallel to Phases 2+3
Phase 5 (hero cards + v1.1.0 tag)     — depends on Phases 1-4
```

Phases 2, 3, 4 are fully parallelizable after Phase 1. Phase 5 waits on all.

## Frozen files (cycle-specific additions)

- [`tests/sim-baseline/`](../tests/sim-baseline/) — baseline fixtures; never regenerate during this cycle. Phase 1 explicitly preserves sim by routing visuals through a *new* method while sim keeps `sample()`.
- [`shared/MovementPhysics.js`](../shared/MovementPhysics.js) + [`worker/src/GameSim.js`](../worker/src/GameSim.js) — sim physics is out of scope. The whole cycle is visual-layer.
- [`shared/TreePlacement.js`](../shared/TreePlacement.js) — placement algorithm + Poisson-disk seed; only the GLB *targets* change in Phase 3, not the placement contract.

## Hard stops

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. **Sim-baseline test failure.** Phase 1 explicitly designs around byte-identity; if the suite drifts, the migration leaked into sim. Revert.
3. Frametime regression > 5% on RTX 3070 desktop or mid-tier mobile target. Phases 2-4 are visual upgrades; if they cost frames, escalate (could mean the wrong technique was picked from the dossier).
4. Visual regression on a previously-passing scene — Field's flat play area must still read as flat; Open Country's island shoreline must not get artifacts.

## What NOT to do during this cycle

- **Don't touch sim physics** — the cycle is visuals only.
- **Don't migrate to TSL or WebGPU** — that's deferred Cycle 15 work; the dossiers note where the math ports cleanly when the time comes, but the port is out of scope here.
- **Don't introduce a new scene** — three is the right number.
- **Don't author custom rock GLBs** — Quaternius gets us 80% of the way; bespoke rocks are deferred per BACKLOG Q3.
- **Don't render hero cards before Phase 5** — they should show the polished world, not the in-progress one.
- **Don't rebuild GrassSystem from scratch** — Phase 2 is shader work (wind math, interactor texture), not a rewrite.
- **Don't change the tree placement algorithm** — Phase 3 swaps GLBs only; [`shared/TreePlacement.js`](../shared/TreePlacement.js) is the contract.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] Phase 1 — Heightfield Y unification shipped. No visible floating grass/trees/rocks. Sim-baseline byte-identical. New mesh-Y spec passing.
- [ ] Phase 2 — Grass wind reads as zen-cinematic. Trample recovery smooth. Frametime within ±5% of baseline.
- [ ] Phase 3 — New stylized trees from Quaternius shipped. LOD seam at 250m gone (`@three.ez/instanced-mesh` LOD pool). Leaf wind shader animating. Frametime within ±5%.
- [ ] Phase 4 — New stylized rocks shipped. `js/ScatterSystem.js` populates each scene with pebbles/sticks/mushrooms/wildflowers. Yellow dandelion patches visible. Frametime within ±5%.
- [ ] Phase 5 — Three hero OG cards re-rendered + four cinematic videos shipped. Marketing page updated. `v1.1.0` tagged and live.
- [ ] All vitest specs pass (target ≥155 with new mesh-Y spec).
- [ ] Production build clean.
- [ ] Live on sheepdogsim.com via GH Actions.

## References

- [`docs/research-grass-2026-05.md`](research-grass-2026-05.md) — grass dossier; Phase 2 starting point.
- [`docs/research-trees-2026-05.md`](research-trees-2026-05.md) — tree dossier; Phase 3 starting point.
- [`docs/research-rocks-and-scatter-2026-05.md`](research-rocks-and-scatter-2026-05.md) — rocks + scatter dossier; Phase 4 starting point.
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle template.
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files.
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items (incl. "Heightfield Y full unification" deferred entry that this cycle picks up).
- [`docs/cycle-13-plan.md`](cycle-13-plan.md) — prior cycle plan; partial close, hero cards deferred to Phase 5 here.
- [`docs/archive/cycles/`](archive/cycles/) — past cycle plans.

## What got deferred from this draft

The earlier Cycle 14 draft ("code-health-and-perf-foundation") had six phases focused on bundle slim, gameplay constants, main.js split, test coverage, and a WebGPU spike. Those threads are still real — they got pushed because Matt's playtest of Cycle 13 close exposed visual issues that would block hero card quality regardless of code health. The bundle slim + constants + WebGPU spike threads carry forward to Cycle 15+ as their own focused cycles. The cycle 13 hero card commitment carries forward to Cycle 14 Phase 5.

## Partial-close progress log (2026-05-03 autonomous session)

The shader half of every phase landed in a single autonomous pass. Asset-dependent steps surfaced as Matt-blockers because GLB downloads + browser playtest can't be done autonomously.

| Phase | Shader / structural work | Asset work | Status |
| --- | --- | --- | --- |
| 1 — Heightfield Y unification | `meshSampleY` + grid capture in [`shared/terrain/Heightfield.js`](../shared/terrain/Heightfield.js) + [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) + 9-case [`tests/heightfield-mesh-y.spec.js`](../tests/heightfield-mesh-y.spec.js). Sim-baseline byte-identical. | n/a | ✅ shipped (commit `3796f3c`) |
| 2 — Grass | Gust envelope + 2-octave analytic sway + tip flutter + sun-aligned fake-SSS in [`js/GrassSystem.js`](../js/GrassSystem.js) and [`js/shaders/grass/`](../js/shaders/grass/). | n/a | ✅ shipped (commit `f1e0d78`); render-texture interactors + critically-damped recovery deferred to Cycle 15+ |
| 3 — Trees | `_patchTreeWindMaterial()` + `_setupTreeWind()` on `TerrainBuilder` — `onBeforeCompile` leaf-wind patch on existing tree GLBs. Shared uniforms; idempotent. | Quaternius MegaKit GLB swap + `@three.ez/instanced-mesh` LOD pool unification | ✅ shader shipped (commit `ec0b902`); 🟡 asset swap Matt-blocked |
| 4 — Rocks + scatter | `_patchRockMaterial()` + `_setupRockShader()` — fresnel rim-light + sun-tinted `setRockRimColor()`. | Quaternius MegaKit rocks + new `js/ScatterSystem.js` (Poisson pebbles/sticks/mushrooms/wildflowers + dandelion oversampling) | ✅ rim-light shipped (commit `42c9f63`); 🟡 asset swap + ScatterSystem Matt-blocked |
| 5 — Hero cards + v1.1.0 | n/a (waits on Phases 1–4 polish in browser) | `freeFly()` posing → `shot-list.mjs` pin → `npm run cinema` × 7 + `git tag v1.1.0` | 🟡 Matt-blocked (needs browser playtest) |

**Cycle stats:** 158/158 vitest pass (was 149; +9 from new mesh-Y spec). Production build clean (main 751 KB / 222 KB gzip — +7 KB from shader patches, within noise). Sim-baseline byte-identical (the whole point of routing visuals through `meshSampleY` while sim keeps `sample()`).

**What an agent picking up the asset work needs to know:**

- The shader patches in Phases 3 + 4 walk every `child.material` of every cached GLB at load time. New GLBs pick up the leaf-wind + rim-light patches automatically — no shader code changes when swapping assets.
- Tree placement in [`shared/TreePlacement.js`](../shared/TreePlacement.js) is the contract; only the GLB *targets* in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) `modelPaths.trees` need updating. Same for rocks.
- The 250m near→far billboard impostor seam still exists. Unifying via `@three.ez/instanced-mesh` LOD pool is paired with the asset swap — landing both together gives one coherent visual upgrade rather than two adjacent ones.
- `_treeWind.uWindStrength.value` defaults to 0.6 desktop / 0 mobile. Tune after the asset swap if leaves look too active or too still.
- `_rockShader.uRimStrength.value` defaults to 0.35. Push to 0.5 for a more graphic-novel look, drop to 0.2 for grounded realism.
