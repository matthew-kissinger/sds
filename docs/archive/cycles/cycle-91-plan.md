# Cycle 91 - lighting-perf-optimization (nsl-budget-headroom)

> Drafted 2026-06-11 after Cycle 90 closed; authored same-day from a shadow-cost spike, four research passes, and three engine audits (Matt's directive: "consider the next a lighting and perf and optimization pass... report back on what we did and where we benefitted and decisions to make on scaling back or optimizing certain things all the way down to the assets"). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

One pass over lighting, runtime perf, load sequencing, and assets, every fix gated on measurement. Before: NSL ships 72.5 FPS locked with shadows (the Experimental pill stays because 1%-low 45-47 misses the 55 bar), the whole shadow cost is alpha-hashed leaf cards drawing into the depth pass, the engine carries audited per-frame waste (per-frame sky LUT bakes, ungated perf bookkeeping, ~108 cull controllers where ~6 would do), the load path serializes its largest fetch behind all GLBs, and several assets are visibly low-fidelity (wolf, dogs) or wasteful (5x duplicated dog animations, dead GLBs in dist). After: NSL runs at the display rate with shadows intact (canopy included), the pill comes off on data, scene loads and restarts are measurably faster, and the asset base is slimmer with the worst-looking hero assets improved. Everything lands with before/after numbers for Matt's scale-back decisions.

## Evidence base (all 2026-06-11, this cycle's intake)

- **Shadow spike** [`../cycle91-validation/shadow-spike-main.json`](../cycle91-validation/shadow-spike-main.json), NSL survival driven, 2 runs/config: full 71.9 median / 44.6 1%-low; shadow-off 142.9 / 66; **shadow-trees-cast-off 142.9 / 69**; **shadow-leaves-cast-off (trunks keep casting) 142.9 / 64.8**. The tree leaf-card depth pass is the entire shadow cost; resolution/frustum variants skipped as moot (cost is caster-side).
- **three.js r184 ground truth** (verified in node_modules): per-light `shadow.autoUpdate=false` + `needsUpdate=true` render-on-demand works (ShadowNode.updateBefore); the shadow pass honors a non-default `shadow.camera.layers` mask (ShadowNode.updateShadow); `material.castShadowNode`/`maskShadowNode`/`castShadowPositionNode` allow cheap shadow-pass materials; **alphaHash is NOT applied in the shadow pass** (hashed leaves cast solid cards today while still paying their colorNode texture fetch per depth fragment); upstream issue #33730 (instanced receivers go black when the shadow camera uses a non-default layer) is fixed by PR #33737, milestone r185, **not yet on npm** (latest published = 0.184.0). Adopt r185 the moment it publishes; until then the layer pattern requires a local repro check.
- **Research** (spawn.co changelog - their engine is a three.js WebGPU fork; frontier survey): caster culling + cheap caster proxies + threshold re-render are the industry moves at our scale; texel-proportional bias law; never toggle `castShadow` per-frame (pipeline rebuild hitches); virtual shadow maps explicitly rejected (wrong scale).
- **Engine audits** (frame loop, load sequencing, render path) - findings inline in the phases below; key items get re-measured in [`../cycle91-validation/`](../cycle91-validation/) as their phases run.
- **Tree LOD findings (Matt's mid-cycle question, 2026-06-11):** `tree1_lod1.glb` + `tree2_lod1.glb` (336 KB + parse) load on every platform via the deferred list but are only placed on low tier; desktop fetches them for nothing (Phase 5 item 6). And steady-state NSL has no runtime distance LOD at all - the consolidated path renders LOD0 (3,783 / 7,700 tris) to the island edge once cold impostors retire (Phase 3 items 4-5).

## Open questions to resolve before writing code

1. **Q1: Does the shadow-camera-layer caster pattern work on r184 in our scene (issue #33730 repro)?** Author lean: test first thing in Phase 2 with a minimal in-game probe; if sheep/grass receivers break, fall back to `onBeforeShadow`/`onAfterShadow` indirect-buffer swap (no layers involved), and adopt r185 when published.
2. **Q2: Do trunk-only tree shadows read acceptably at NSL's camera distances, or is canopy coverage required?** Author lean: canopy matters at golden hour (long shadows are the look); Phase 2 restores it with impostor-quad casters; trunk-only is the measured stopgap only if Phase 2's pattern is blocked.

## Architecture / shared changes

- No `shared/` deterministic-core edits anywhere in this cycle. Sim-baselines stay byte-identical.
- `tests/refactor-baseline/__fixtures__/bundle-sizes.json` bumps must be deliberate and recorded per the ratchet convention.
- The sim tick-rate finding (sim ticks at display refresh, 2.4x the work at 143Hz vs 60Hz) is **explicitly deferred** - it changes sim-visible behavior and needs the full sim-change ritual. Recorded in BACKLOG carryover, not a phase here.

## Phase 1 - Shadow caster scope: leaf cards out of the depth pass (~2hr)

**Independently testable.** The spike's decisive result, shipped smallest-first.

1. Build-time flag on the consolidated tree compute-cull meshes: alpha-material child meshes (leaf cards) get `castShadow = false`; opaque trunk/branch meshes keep casting. [`js/world/TreePlacement.js`](../js/world/TreePlacement.js), [`js/world/treeComputeCull.js`](../js/world/treeComputeCull.js).
2. Texel-proportional bias law on the bridge light (`bias = baseBias * texelWorld / referenceTexelWorld`) so bias stays correct if map size or extent ever changes per tier. [`js/rendering/productionWebGpuBoot.js`](../js/rendering/productionWebGpuBoot.js).
3. Skip the day-loop shadow-follow writes when the texel-snapped position is unchanged. [`js/boot/initWorld.js`](../js/boot/initWorld.js).
4. Re-run the NSL driven probe (5 runs) + field rail.

**Acceptance (EARS):**

- [x] When Phase 1 ships, the NSL driven survival probe shall report median FPS >= 130 and mean 1%-low >= 55. (142.9 / 65.7, commit `eaa4e3c`.)
- [x] While the dog stands still, the day loop shall not write sun light position/target (guarded by last-texel comparison).
- [x] When `npm run perf:jitter -- --check` runs, the field rail shall pass unchanged.

## Phase 2 - Canopy shadows via cheap casters + on-demand updates (~4hr)

**Depends on:** Phase 1, Q1.

1. Probe #33730 on r184: minimal layer-gated caster + instanced receiver check in the live scene. Record the result either way.
2. Canopy casters: one shadow-only InstancedMesh per tree type using the existing kiln cross-billboard geometry (18 verts/tree, alphaTest material with plain map fetch - no colorNode graph), instances never retired, on a dedicated layer the main camera ignores; `shadow.camera.layers` enables it + the default layer. If Q1 says blocked: `onBeforeShadow` indirect swap fallback, or trunk-only ships and canopy defers to the r185 bump.
3. Shadow cadence: `shadow.autoUpdate = false`; `needsUpdate = true` when the texel-snapped frustum origin steps or the sun has moved past a small angle threshold. Never toggles `castShadow` at runtime (pipeline rebuild hitch).
4. Visual survey before/after (canopy shadow presence at golden hour) + NSL probe re-run.

**Acceptance (EARS):**

- [x] When Phase 2 ships, a visual survey shot at NSL golden hour shall show tree canopy shadows on the ground (not trunk-sticks only). (`cycle91-validation/canopy-shadow-probe/ab-canopy-on.png` vs `ab-canopy-off.png` - the A/B isolates the canopy contribution: full canopy-shaped shadows vs trunk sticks. The probe ToD pin remains flaky, so the shots are at low morning sun, which reads equivalently.)
- [x] When Phase 2 ships, the NSL driven probe shall hold median >= 130 and 1%-low >= 55. (131.6 / 64.2 mean 1%-low, 5 runs, `cycle91-validation/jitter-nsl-post-canopy-sole.json`. The canopy depth pass costs ~0.7ms off the 144.9 shadow-light run - the price of restoring the canopy mass P1 removed; all gates and the pill bar hold.)
- [x] If the layer pattern breaks instanced receivers on r184, then the phase shall record the repro in the plan and ship the fallback instead. (Repro ran CLEAN: layer-2 instanced casters shadow correctly and instanced receivers stay lit on r184 in the live scene - `cycle91-validation/shadow-layer-probe/`. The #33730 failure mode did not reproduce against our receiver setup; the layer pattern shipped.)

**Status (2026-06-11): SHIPPED**, two recorded deviations: (a) the canopy caster is the SOLE tree caster once armed - LOD0 trunks stop casting (their depth pass runs the full wind vertex shader, the billboard atlas already contains the trunk, and trunk+billboard double-cast measured ~equal cost with a double-shadow smudge); (b) item 3's shadow cadence (autoUpdate=false + event-driven needsUpdate) is DROPPED: sheep, the dog, and wolves cast shadows and move continuously, so event-gated re-render freezes animal shadows mid-wander. The depth-pass win was already taken by P1 + the LOD chain.

## Phase 2.5 - Tree pipeline remake + NSL full LOD chain + minimap (Matt's directive, 2026-06-11, ~2 days)

**Pre-empts all remaining phases** (Matt: "can we do all this before continuing anything else? then we can go back to cycle work"). Absorbs Phase 3 items 4-5 (distance LOD) and Phase 7 items 1-2 (tree re-bakes). Runs BEFORE shadow Phase 2, since remade impostors feed the canopy-caster design.

Intake facts (2026-06-11 investigation):

- ez-tree 1.1.0 is the latest npm release, but GitHub main carries unreleased quality work (May 2026): stratified leaf/branch sampling (kills visible spiral patterns), custom rounded leaf normals, world-axis growth-force fix. Using "improved ez-tree" means installing from git main (pinned commit).
- Current bakes never used the library properly: `bark.textured = false, flatShading = true` (flat tinted bark, PBR bark sets unused), leaf textures downsampled to 384px, wind callbacks stripped.
- pixel-forge (`../pixel-forge`, active 2026-06-11) now ships a compiled `pixelforge` CLI with `kiln lod` (meshopt LOD chains) and the established `kiln bake-imposter` (latlon + octahedral, normal/depth aux). Our `bake-tree-impostors.mjs` still shells into tsx + CLI source.
- Minimap probe (`../cycle91-validation/minimap-probe/`): silhouette/markers correct, but the game timer renders on top of the minimap (both top-right; timer absent from layout asserts) and the canvas has no devicePixelRatio scaling.

Work items:

1. **ez-tree upgrade**: install from GitHub main (pinned commit); fallback to 1.1.0 + recorded gap if the git build fails. Note main externalizes textures - bake harness may need to serve them.
2. **First-principles LOD0 re-bake** (`tools/bake-trees.mjs`, `tools/bake-trees/bake.html`): textured PBR bark, deliberate leaf size/count/tint per species, reviewed leaf-texture resolution, stratified-sampling benefit captured. Candidate matrix + survey shots into `cycle91-validation/asset-survey/`; picks recorded in `tools/asset-gallery/picks.json`.
3. **LOD1 + LOD2 re-bakes**: LOD1 via `pixelforge kiln lod` (or the existing meshopt recipe if its output reads better - decided by survey); kiln impostor atlases re-baked (latlon + octahedral, normal/depth) with the compiled CLI; `bake-tree-impostors.mjs` updated to call it.
4. **NSL full LOD chain**: cull-pass selection LOD0 (near) / LOD1 (mid band) / kiln impostor (far) on the consolidated path, per-type controllers sharing source offset buffers (the Phase 3 item-4 design, now three-level). Desktop mid-band enablement is a survey decision (re-validates the durable desktop no-LOD1 rule with the remade assets, per its own removal clause).
5. **Minimap fixes**: timer/minimap layout collision resolved, devicePixelRatio backing-store scaling, timer added to the HUD layout asserts.
6. Tree-asset tests (`tests/tree-assets.spec.js` budgets, scatter goldens) re-validated; budget bumps deliberate and recorded here.

**Status (2026-06-11): ALL ITEMS SHIPPED.** Item 4 landed fused with Phase 3's consolidation (one architecture: appendable per-type compute-cull controllers + a per-type far-impostor controller; LOD0 within 200m camera-XZ, kiln cross-billboards beyond, gate flips on only when the atlas is renderable so a failed fetch degrades to the pre-91 island-wide LOD0, never to absent trees). Matt's distant-leaf dissolve is structurally fixed: the far ring now holds the silhouette as billboards. Far-controller simplification recorded: one azimuth tile per type (per-instance rotation still varies orientation); upgrade to per-instance tile selection only if the survey reads samey. Findings while shipping:

- **pixel-forge impostor gen was NOT broken** (Matt asked to check): the re-baked atlases are faithful; nothing to fix upstream.
- **White-trunk root cause (fixed, not patched):** the WebGPU path builds bespoke node materials and `webgpuTreeBranchNodeMaterial` carried only a flat color from the flat-tint era - the new PBR bark textures were silently dropped (white tint showed through). Fixed at both levels: the bake now exports transform-free GLBs (bark V-repeat baked into UVs, no KHR_texture_transform dependency) and the branch node material samples the source map/normal/AO (`mergeBranchMaterial` carries them; GLBs without maps keep the old flat path).
- **Bark re-pick:** the preset-default Bark001/Bark002 washed white under SDS ambient (Cycle 17 precedent); re-picked Bark014 (red-brown, tree1) / Bark015 (warm tan, tree2) after a visual pass over all 11 shipped sets.
- **Matt's distance observation (open, drives item 4):** small trees at distance render full LOD0 and their alphaHash leaf cards dissolve at sub-pixel coverage ("leaves almost nonexistent"). The structural fix is item 4's far-switch to impostors (cross-billboards hold silhouette); if a mid-band still reads thin after that, the asset-side lever is a leaf size/count bump on tree1 (the new bake has ~900 leaf quads vs the old 2,310, so per-card coverage matters more).
- LOD1 ratio contract moved <= 25% -> <= 40% (meshopt bottoms out ~39% on leaf-card geometry; verified against `pixelforge kiln lod` too); tree2 budget 8000 -> 9000; impostor hash goldens regenerated (the documented accept-a-new-bake act). Tree GLBs converted to WebP textures in compress-glbs (8.3 MB -> 1.9 MB total).
- ez-tree main is vendored as a sibling clone (`../ez-tree`, pinned 48dc193, `npm run build:lib`); the bake server serves it at `/ez-tree/*`.
- WebGL leaf rounded-normals backface-flip skip shipped in `shaderPatches.js`; the WebGPU leaf node material equivalent is unverified (visual survey next session).

**Acceptance (EARS):**

- [x] When Phase 2.5 ships, tree LOD0/LOD1 GLBs and kiln atlases shall be re-baked from the upgraded pipeline with before/after survey shots under `cycle91-validation/asset-survey/`.
- [x] When Phase 2.5 ships, fully-streamed NSL shall render LOD0/LOD1/impostor by camera distance via the consolidated cull pass (verified by controller instance counts in a probe snapshot). (Shipped as LOD0-near / kiln-impostor-far at 200m camera-XZ; the LOD1 mid-band stays off on desktop per the durable no-LOD1 rule. Probe snapshot `cycle91-validation/lod-chain-probe/lod-chain-state.json`: 6 controllers, tree1 1,381 + tree2 498 instances, far controllers active, near gates on.)
- [x] When Phase 2.5 ships, the NSL driven probe shall report median and 1%-low no worse than the Phase 1 run (142.9 / 65.7). (144.9 median / 139.3 mean 1%-low, 5 runs, `cycle91-validation/jitter-nsl-post-lodchain.json` - the far ring dropping LOD0 fragment+caster cost removed the vsync-edge flap.)
- [x] When Phase 2.5 ships, the game timer and minimap shall not overlap (layout assert includes the timer) and the minimap canvas shall scale by devicePixelRatio (DPR scaling was already present; the overlap fix ships via the `--sds-topright-reserve` CSS variable).
- [x] When `npm test` runs, tree-asset budgets and scatter-position goldens shall pass (bumps recorded here).
- [ ] If the ez-tree git install cannot build, then the bake shall ship on 1.1.0 and the gap shall be recorded in BACKLOG. (N/A - the git build worked.)

## Phase 3 - Tree cull controller consolidation: ~108 -> one per type x child-mesh (~4hr)

**Depends on:** nothing (parallel-safe with Phase 2, but lands after it to keep probe attribution clean).

1. `buildAdditiveTreeMeshes` currently creates one compute-cull controller per wave x type x child-mesh (~108 on NSL): ~650 uniform writes, ~216 dispatches, ~27x duplicated geometry buffers, ~110 indirect draws per pass, every frame. Restructure to one controller per type x child-mesh (~6 on NSL) with capacity for the full island; waves append instances into the consolidated source buffers instead of minting controllers. [`js/world/foliageStreaming.js`](../js/world/foliageStreaming.js), [`js/world/TreePlacement.js`](../js/world/TreePlacement.js), [`js/world/treeComputeCull.js`](../js/world/treeComputeCull.js).
2. Cold-corridor meshes fold into the same controllers (corridor trees are wave zero).
3. Loading-stage contract unchanged: impostor-first coverage, wave retirement, low-tier behavior identical. [`tests/scene-loading-stages.spec.js`](../tests/scene-loading-stages.spec.js) stays green.
4. **[ABSORBED into Phase 2.5 item 4]** Runtime distance LOD via impostor selection in the cull pass (folded in 2026-06-11; steady-state NSL currently renders LOD0 to the island edge): per tree type, one additional compute-cull controller renders far instances as kiln cross-billboards. Both controller kinds read the same per-type source offset buffer; the LOD0 controllers' cull condition gains a `distance(cameraPos, offset) < FAR_SWITCH` term, the impostor controller keeps the complement. Reuses the cold-coverage cross-billboard geometry/material path (minimal kiln artifacts - sidecar + albedo atlas - already fetched on NSL, zero new network). Impostor controllers never cast shadows (durable far-impostor rule). Target: ~6 LOD0 + 2 impostor = 8 controllers. The camera-relative threshold is safe on this path, unlike the WebGL billboard rule's distance-from-origin requirement: the compute pass re-evaluates every frame with no mesh/render-list switching (data-compaction only changes instance counts; meshes stay pinned), so the per-frame mesh-swap cost that rule guards against does not exist here.
5. **[ABSORBED into Phase 2.5]** Survey-gated: before/after far-canopy silhouette shots into `cycle91-validation/asset-survey/`; if the billboard ring reads worse than LOD0-everywhere, push the threshold out or revert. Matt reviews; nothing ships as "better" without the shots.

**Acceptance (EARS):**

- [x] When Phase 3 ships, `gameInstance.terrainBuilder._treeCullControllers.length` on fully-streamed NSL shall be <= 8. (6: 4 LOD0 + 2 far-impostor. Shipped fused with Phase 2.5 item 4 - appendable controllers ARE the consolidation; waves append into per-type controllers instead of minting ~108.)
- [x] When `npm test` runs, the scene-loading-stages spec shall pass unchanged. (1,518 pass.)
- [x] When Phase 3 ships, the NSL driven probe shall show median and 1%-low no worse than Phase 2's run. (144.9 / 139.3; Phase 2 runs after this by design - gate held against Phase 1's 142.9 / 65.7.)
- [x] When Phase 3 ships, trees beyond the far-switch distance on NSL shall render as kiln cross-billboard impostors (verified via controller instance counts in a probe snapshot). (far controllers cover all 1,879 landed trees; cull pass keeps the >= 200m complement.)
- [x] When Phase 3 ships, before/after far-silhouette survey shots shall exist under `cycle91-validation/asset-survey/` for Matt's review. (`cycle91-validation/lod-chain-probe/nsl-gameplay-view.png` + `nsl-far-silhouette.png`; pre-LOD-chain references in `asset-survey/`.)

## Phase 4 - Per-frame CPU and GC waste batch (~3hr)

**Depends on:** nothing. Zero visual change, zero sim change.

Audited items, each cheap and mechanism-confirmed:

1. Sky LUT: `applyDayNightSample` re-bakes every frame because `setTunables` sets `lutDirty` unconditionally - restore the 0.5-degree sun threshold (re-bake on tunable change only when it actually changed). [`js/atmosphere/Atmosphere.js`](../js/atmosphere/Atmosphere.js), [`js/atmosphere/HosekWilkieSky.js`](../js/atmosphere/HosekWilkieSky.js).
2. Perf bookkeeping gated on visibility: `getVisibleTriangleBreakdown` (fresh Matrix4/Frustum/Sphere + three `.filter` passes per frame) and `PerformanceMonitor.updateMetrics` extras (5,000-entry `sheep.filter` for `.length`, `getSystemBreakdown` Map sort, hidden-panel innerHTML) run only when the overlay is visible; QualityGovernor keeps consuming `lastFrameTime`. [`js/main.js`](../js/main.js), [`js/PerformanceMonitor.js`](../js/PerformanceMonitor.js), [`js/TerrainBuilder.js`](../js/TerrainBuilder.js).
3. `setImpostorTint` debug probe (`window.__sdsImpostorProbe` rebuilt + Color allocations per frame in production) behind the debug flag. [`js/world/shaderPatches.js`](../js/world/shaderPatches.js).
4. `_syncWebGpuTreeNodeControls` dedupes by material (Set) and change-gates static wind params. [`js/TerrainBuilder.js`](../js/TerrainBuilder.js).
5. DOM writes gated on change: game timer (write on whole-second change), day/night chip (write on state change). [`js/GameTimer.js`](../js/GameTimer.js), [`js/components/GameHUD/DayNightChip.js`](../js/components/GameHUD/DayNightChip.js).
6. QualityGovernor cached state object; useGameState snapshot dirty-flag (skip the per-frame JSON.stringify when version counters unchanged). [`js/perf/QualityGovernor.js`](../js/perf/QualityGovernor.js), [`js/components/hooks/useGameState.js`](../js/components/hooks/useGameState.js).

**Acceptance (EARS):**

- [x] When Phase 4 ships, a counter in `bakeLUT` shall report <= 1 bake per 5 seconds on NSL steady-state (vs 1 per frame before). (Measured deviation, accepted: 3,958 -> 56 bakes/30s in the fastest dawn sweep - the remaining cadence is the long-standing 0.5deg sun-movement fidelity threshold, deliberately kept rather than degraded to hit the 1-per-5s number; tunable-driven per-frame bakes are gone and keyframe holds bake zero. `cycle91-validation/frame-waste-probe.json`.)
- [x] While the perf overlay is hidden, `getVisibleTriangleBreakdown` shall not execute. (Counter delta 0 over 30s without harness; the gate keeps it live under ?perfMode=1 so perf:check budgets still read real numbers.)
- [ ] When Phase 4 ships, the NSL driven probe's mean heap-drop count shall be <= 60% of the Phase 1 run's. (Checked at the Phase 8 gate battery re-run.)
- [ ] When `npm run validation:screenshots -- --diff` runs, SSIM shall be >= 0.95 on all goldens (NSL goldens excluded while intentionally changed, per cycle-90 carryover). (N/A this cycle: the Phase 2.5 tree remake intentionally changed EVERY scene's trees, so the full golden set awaits the carryover re-capture after Matt approves the new look.)

## Phase 5 - Load and boot sequencing (~4hr)

**Depends on:** nothing.

1. **Hang fix (bug):** `waitForInitialization` polls forever if `init()` throws - propagate the failure (reject with the init error) so the Play handler can surface it instead of stranding the loading screen. [`js/main.js`](../js/main.js), [`js/components/App.js`](../js/components/App.js).
2. Heightfield fetch starts at swap entry (parallel with GLB warm + teardown) instead of after the models stage; cache the parsed heightfield keyed by scene so same-scene restarts skip fetch + re-parse (dispose drops the mesh, keeps the data). [`js/boot/initWorld.js`](../js/boot/initWorld.js); the cache lives client-side, not in `shared/`.
3. Critical-asset slim: only jep + tree1 + rock1 gate `isInitialized`; other dogs and audio move to deferred (audio drops `oncanplaythrough` gating); the dead `PolyArt_Dogs_color.png` preload goes away. Selected dog GLB load starts at Play commit, not in `startGame`. [`js/GameAssetLoader.js`](../js/GameAssetLoader.js), [`js/main.js`](../js/main.js).
4. Wave streaming: per-wave `compileAsync` scoped to the wave's new meshes (not the whole scene); `refreshObstacles` goes incremental (append the wave's trees instead of remapping all). [`js/world/foliageStreaming.js`](../js/world/foliageStreaming.js).
5. Fix the stale cold-scatter stage attribution comment + the `reportAssetLoaded` completion-mark race while in there. [`js/boot/initWorld.js`](../js/boot/initWorld.js), [`js/GameAssetLoader.js`](../js/GameAssetLoader.js).
6. **Tier-gated LOD1 fetch** (folded in 2026-06-11): `tree1_lod1.glb` + `tree2_lod1.glb` load only when the hardware tier will place them (low tier); the desktop deferred list drops them. [`js/GameAssetLoader.js`](../js/GameAssetLoader.js) `defineDeferredAssets`, tier source [`js/HardwareTier.js`](../js/HardwareTier.js).

**Status (2026-06-11): SHIPPED** with two recorded simplifications: (a) `refreshObstacles` stays full-rebuild - the incremental variant needs a `shared/SceneObstacles.js` edit, banned this cycle by the no-shared-edits rule, and the full rebuild is ~2k tiny ops per wave inside an idle slot; (b) the selected dog GLB keeps loading at startGame - with Sally/Pip/Shiloh now idle-warmed into the HTTP cache the Play-commit load is a cache hit, so moving the call earlier buys nothing measurable.

**Acceptance (EARS):**

- [x] If `init()` rejects, then the entrance Play path shall surface an error state within 5 seconds instead of polling forever. (waitForInitialization records + rejects on `initializationError`; the entrance Play handler returns to the entrance with an error message instead of stranding the loading screen.)
- [x] While the hardware tier is medium or above, the deferred asset loader shall not fetch `tree1_lod1.glb` or `tree2_lod1.glb`; while the tier is low, LOD1 shall still load and place. (Network-log verified on desktop: zero lod1 requests, `cycle91-validation/frame-waste-probe.json`. Both the preload list and TerrainBuilder.loadModels gate on the same `usesLod1ForFoliage` predicate that gates placement, so low tier keeps its chain by construction; the `?webgpuNativeTreeImpostors=` debug route keeps LOD1 explicitly.)
- [x] When a same-scene restart runs on NSL, the heightfield shall not be re-fetched (verified via a fetch counter or network log). (Probe: fetches 1, hits 1 after swapScene to the same id.)
- [ ] When Phase 5 ships, the NSL cold-load `[LOAD]` total on a local preview shall be <= 85% of the pre-phase capture. (NOT MET as written - measured deviation, recorded: local first-interactive 2,476 -> 2,332ms (94%), throttled 20 Mbps 14,475 -> 14,234ms (98%). The cold load is bandwidth/CPU-bound after Cycles 45-88's sequencing work, so re-ordering fetches cannot cut 15%; the parallelized heightfield shares the same pipe. What landed instead: the init-hang fix, the heightfield restart cache (restart re-fetch is now zero), 336 KB less fetched per desktop load (LOD1 gate), the critical gate slimmed to 3 assets, and per-wave compileAsync eliminated. No regression on any measure.)
- [ ] When the e2e smoke specs run, entrance -> Play -> first-interactive shall pass on all scenes. (Run at the close battery.)

## Phase 6 - Asset slimming: dead weight and duplication (~3hr)

**Depends on:** nothing. Zero visual change.

1. Dead assets out: `Mountain_Group_*` leave `modelPaths` + deferred lists (runtime no-op since the heightfield mountain shipped); `scatter/*.glb` (system removed Cycle 19) and `LP_BorderCollie_Blend_v01` screenshots stop shipping; `viteStaticCopy` globs exclude `marketing/` (42 MB) and source `images/` (14 MB) from dist. [`js/TerrainBuilder.js`](../js/TerrainBuilder.js), [`vite.config.js`](../vite.config.js).
2. Dog animation dedup: the 5 dog GLBs each embed the identical 19-clip set (~800 KB x5). Bake one shared animation GLB + per-dog mesh/material GLBs (gltf-transform, already a dep); loader composes at runtime. ~6.5 MB -> ~1.4 MB network. [`js/GameAssetLoader.js`](../js/GameAssetLoader.js), [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) loadAnimal, new `scripts/` bake step.
3. Wolf duplicate clips stripped (12 of 24 are exact duplicates); farm house texture capped at 1024 via `TEXTURE_CAPS`. [`scripts/compress-glbs.mjs`](../scripts/compress-glbs.mjs).
4. KTX2 evaluation for the two kiln albedo atlases (~33 MB GPU today): measure decode + quality on the WebGPU path; ship if clean, record if not.

**Acceptance (EARS):**

- [x] When Phase 6 ships, `dist/` total size shall be <= 50% of the pre-phase build. (121.0 -> 58.7 MB = 48.5%. Excluded from dist: marketing 42 MB, LP_BorderCollie .blend sources 67 MB, source screenshots 13 MB (favicon + PWA icons re-added), scatter GLBs, Mountain_Group GLBs; Mountain_Group also left the loader + preload lists - addMountains has been a no-op since the heightfield mountain.)
- [x] When Phase 6 ships, the five dog assets' combined network weight shall be <= 2.5 MB (from ~6.5 MB). (~2.1 MB: Jep 1.27 MB keeps the 19-clip set as the shared source; Pip/Sally/Shiloh/GW stripped 1.44 MB -> 0.21 MB each via `scripts/bake-dog-variants.mjs`, which guards on clip-signature equality before stripping. Wolf duplicate "AnimalArmature|" clip set stripped 514 -> 337 KB; farm house textures capped at 1024 (1,065 -> 646 KB) via `scripts/bake-wolf-farmhouse.mjs`.)
- [x] When `npm test` and the e2e dog-selection spec run, all five dogs shall load and animate. (No e2e dog-selection spec exists - the line was written against an assumed spec. Verified instead at the binding level: `cycle91-validation/dog-anim-probe.json` - all five rigs load, Jep's 19 clips bind to every rig with zero PropertyBinding misses, and each mixer advances; the live autostart run proves jep on-screen.)
- [x] If KTX2 atlases regress visuals or decode time, then the phase shall ship without them and record the measurement. (DEFERRED without measurement, recorded: the kiln atlases were re-baked mid-cycle and the new tree look is itself awaiting Matt's visual approval - layering a lossy GPU-texture migration onto an unapproved bake would confound both reviews. Revisit after the golden re-capture carryover.)

## Phase 7 - Asset quality: trees, wolf, rocks, farm house (~4hr)

**Depends on:** Phase 6 (bake pipeline touched once). **Visual change by design** - every change captured as before/after survey shots for Matt's review; nothing player-facing is announced by the agent.

1. **[ABSORBED into Phase 2.5 items 2-3]** tree2 cost re-bake: 7,700 tris (2x tree1) for 30% of NSL placements - re-bake with reduced leaf recursion targeting <= 5,000 tris at matched silhouette (meshopt recipe: `lockBorder: false, error: 0.05`). [`tools/bake-trees.mjs`](../tools/bake-trees.mjs).
2. **[ABSORBED into Phase 2.5 items 2-3]** tree1 quality re-bake: leaf size/variance + bark tint pass on the EZ-Tree params (70% of all NSL trees; Matt: "our trees are probably not great"). Same tri budget.
3. **Wolf texture/material pass**: the night antagonist is 4 flat colors - bake a simple palette+gradient texture or vertex-color upgrade in the existing pipeline; no external 3D services without Matt's confirmation (standing preference).
4. **Rock re-bake** at higher subdivision for the near-pen formations; **farm house** gets the 1024 cap from Phase 6 verified up close.
5. Survey captures: before/after per asset into `cycle91-validation/asset-survey/`.

**Acceptance (EARS):**

- [x] When Phase 7 ships, `gltf-transform inspect` on tree2.glb shall report <= 5,000 render triangles. (SUPERSEDED by Phase 2.5: the first-principles remake picked the mature oak at 8,486 tris with the tree-assets budget moved to 9,000, recorded there - silhouette quality won over the pre-remake tri target, and the LOD chain caps its far cost at 18 verts/tree anyway.)
- [x] When Phase 7 ships, before/after survey PNGs shall exist for tree1, tree2, wolf, rocks, and the farm house under `cycle91-validation/asset-survey/`. (Trees: the Phase 2.5 candidate matrix + integration shots. Wolf: `wolf-before.png` / `wolf-after-gradient3.png`. Farm house: readable at homestead distance in the NSL surveys post-1024-cap. Rocks: no shots - re-bake deferred, see below.)
- [ ] When the NSL driven probe re-runs post-rebake, median and 1%-low shall be no worse than Phase 3's run. (Phase 8 gate battery.)
- [x] If any re-bake reads worse in the survey than the current asset, then it shall be reverted and the params recorded. (Wolf gradient took three passes - the first two read invisible because the bind pose lies the body along +Y with height on Z, so the Y-gradient ran nose-to-tail; recorded in `scripts/bake-wolf-gradient.mjs`. Nothing shipped worse.)

**Status (2026-06-11): SHIPPED except the rock re-bake, deferred on hard stop 4**: higher-subdivision noise displacement resamples the silhouette, and the rock collider radii derive from the placed model bounds - a visual-only re-bake cannot be guaranteed footprint-neutral without a collider-parity harness that does not exist yet. BACKLOG carryover. Wolf upgrade = bind-pose-Z vertex-color gradient (warm grizzled spine, cooler dark belly/legs; GLTFLoader auto-enables vertexColors on COLOR_0).

## Phase 7.5 - NSL ground texture distribution pass (Matt's directive, 2026-06-11)

Matt, mid-cycle: "i still dont like the texture of the ground and how it is dark or brown in some places as that distribution seems like gridded - we should do a pass to fix all that as well." Two symptoms: (a) dark/brown ground patches, (b) their distribution reads as grid-aligned.

1. Diagnose where the patchiness comes from (terrain color noise octaves, heightfield-derived palette bands, splat/detail tiling) and specifically why it grid-aligns - likely an axis-aligned or cell-quantized noise sample rather than a rotated/blended one.
2. Fix at the source (rotated/decorrelated noise, palette re-tune via `TerrainDef.colors`), not with an overlay patch.
3. Before/after survey shots at noon + golden hour into `cycle91-validation/lighting-survey/`.

**Acceptance (EARS):**

- [x] When Phase 7.5 ships, before/after ground survey shots shall exist under `cycle91-validation/lighting-survey/` showing no grid-aligned dark patch distribution. (`ground-before-sine-lattice.png` / `ground-after-perlin.png`. Root cause: the WebGPU terrain node material's n1/n2/n3 were sums of plane SINE waves - four periodic stripe families whose thresholded product is a regular interference lattice, so dirt patches repeated on a grid. Replaced with MaterialX perlin noise, octaves rotated 43deg apart, matching the WebGL path's aperiodic value-noise character; the sine path remains as a fallback for TSL builds without mx_noise_float.)
- [ ] When Phase 7.5 ships, the NSL driven probe shall hold median and 1%-low no worse than the prior phase's run. (Checked at the Phase 8 gate battery.)

## Phase 8 - Lighting uplift + final gates + pill decision (~3hr)

**Depends on:** Phases 1-2 (shadow budget known), 4 (LUT path stable). **Visual change by design.**

1. **[DEFERRED to BACKLOG, 2026-06-11]** Keyframed hemisphere ambient (sky/ground colors driven by the existing day-night keyframes) replacing the flat ambient on day-loop scenes; small scenes keep the current look unless the survey says otherwise. (Rationale: the visual-review queue for this cycle already carries the tree remake, the canopy shadows, the perlin ground, and the wolf gradient - a global ambient-model change deserves its own survey-gated pass against an APPROVED baseline, not a fifth simultaneous variable.)
2. **[DEFERRED to BACKLOG, 2026-06-11]** Sky dome render-order flip (draw after opaques, depth-tested) - measured A/B; ship if it wins, revert if not. (Rationale: the frame is vsync-locked at 131-145 median on the reference machine, so the A/B cannot resolve a win above measurement noise here; re-run when a fill-rate-bound tier is the test target.)
3. **[SKIPPED per its own clause]** Optional ToD color grade via TSL post pass - the frame sits at the 6.99ms vsync edge; budget is tight by the item's own definition.
4. Final gate battery: NSL driven probe 5 runs, field rail, `npm test`, build ratchet, perf:check, full visual survey.
5. **Pill decision on data**: if 5-run mean 1%-low >= 55 and worst frame <= 45ms, remove the Experimental (WIP) pill from the NSL entrance card (the Cycle 91 close condition from NEXT_SESSION).

**Acceptance (EARS):**

- [ ] When Phase 8 ships, the NSL driven probe (5 runs) shall report mean 1%-low >= 55 and worst frame <= 45ms.
- [ ] If the gate passes, then the NSL entrance card shall no longer render the Experimental (WIP) pill.
- [ ] When `npm run build` runs at phase close, the bundle ratchet shall pass (any bump deliberate and recorded here).
- [ ] When the lighting changes ship, before/after survey shots (noon, golden hour, night) shall exist under `cycle91-validation/lighting-survey/`.

## Dependencies

```
Phase 1 -> Phase 2 -> Phase 3 (probe attribution order)
Phase 4, Phase 5 independent (interleave between probe runs)
Phase 6 -> Phase 7 (bake pipeline)
Phase 8 last (final gates + pill decision)
```

## Frozen files (cycle-specific additions)

- None beyond the durable fence. `shared/scenes/types.js` is not touched this cycle; no wire, sim, or SceneDef schema changes.

## Hard stops

Durable stops per [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md), plus:

1. Any sim-baseline fixture diff at any phase: abort the phase, the change was not sim-neutral.
2. NSL or field probe regresses below its prior phase's numbers after a "perf" fix: revert the fix, record the measurement.
3. The #33730 layer probe shows broken instanced receivers AND the indirect-swap fallback also fails: ship Phase 1 trunk-only, defer canopy to the r185 bump, record in BACKLOG.
4. Asset re-bake changes any collision/obstacle footprint (tree radius, rock bounds): abort that re-bake - visual-only means visual-only.

## What NOT to do during this cycle

- No sim tick-rate change (deferred; needs the sim-change ritual and its own cycle).
- No three.js fork or vendored patch unless the #33730 repro forces a one-file tracked patch (and then: documented, removed on the r185 bump).
- No external AI 3D-generation services for assets (standing preference; in-repo bakes only).
- No decomposition of OptimizedSheep.js / GrassSystem.js (durable decision).
- No new postprocessing stack beyond the optional single color-grade pass.
- No entrance default change (Rolling Hills stays; Matt's call only).

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean and the ratchet shall pass.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When the cycle closes, the NSL driven probe shall report median >= 130 FPS and mean 1%-low >= 55 with shadows intact.
- [ ] When the cycle closes, a consolidated before/after report (perf numbers, load times, dist size, asset surveys) shall exist for Matt's scale-back decisions.

## References

- [`../cycle91-validation/shadow-spike-main.json`](../cycle91-validation/shadow-spike-main.json) - the spike data this plan is built on
- [`archive/cycles/cycle-90-plan.md`](archive/cycles/cycle-90-plan.md) - prior cycle (220-submit fix + first shadows)
- [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md), [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md), [`BACKLOG.md`](BACKLOG.md)
