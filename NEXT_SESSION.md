# Next Session — Cycle 14 (`visuals-foundation`) shader-half shipped; asset swap is the blocker for full close

> Updated 2026-05-03 (autonomous Cycle 14 shader pass: Phase 1 complete, Phases 2/3/4 shader work shipped, asset-dependent steps surfaced as Matt-blockers). **Active plan: [`docs/cycle-14-plan.md`](docs/cycle-14-plan.md).** The shader half of every phase landed in this session — heightfield-Y unified, grass got a gust-envelope wind + sun-aligned SSS, trees got a leaf-wind shader, rocks got fresnel rim-light. The asset half (Quaternius MegaKit GLBs for trees + rocks, new `ScatterSystem`, hero-card re-renders) is **Matt-gated** because the GLB downloads + browser playtest can't be done autonomously. 158/158 vitest pass; sim-baseline byte-identical; production build clean (main 751 KB / 222 KB gzip — +7 KB from shader patches). Last closed cycle: [`docs/archive/cycles/cycle-12-plan.md`](docs/archive/cycles/cycle-12-plan.md). Cold-start agents: read this page top-to-bottom, then [`docs/cycle-14-plan.md`](docs/cycle-14-plan.md), then the three research dossiers in `docs/research-*-2026-05.md`. Earlier cycles: [`docs/archive/cycles/cycle-11-plan.md`](docs/archive/cycles/cycle-11-plan.md), [`docs/archive/cycles/cycle-10-plan.md`](docs/archive/cycles/cycle-10-plan.md).

## Where the project stands (2026-05-02)

- **`sheepdogsim.com` is live with v1.0.0** on Cloudflare Pages + Worker + DO + D1. Cycle 12 shipped four hotfix-class polish phases on main (1 A8 drift, 2 UI variants, 4 Mac research, 6 leaderboard fix). Two carryover phases (3 cinematic videos, 5 CF Analytics + manual playtest) are Matt-gated and rolled into Cycle 13.
- **Cycle 12 (`post-v1-polish`) closed 2026-05-02.** Headlines:
  - **Phase 1 — A8 stress drift fix.** GLB shared-material trap (same class as Cycle 11) was applied to trees + rocks. `clearTrees`/`clearRocks` were disposing geometry+material on near-tree/rock InstancedMeshes whose geo+mat are SHARED with the cached GLB models, invalidating the cache and forcing re-upload on next swap. Tagged near-tree/rock InstancedMeshes with `userData.sharedFromGlbCache` so clearers skip dispose; far-tree billboards keep their per-swap MeshBasicMaterial dispose path. Optional per-subsystem `renderer.info` instrumentation added behind `window.__sdsSwapDriftLog`. New `tests/swap-drift-glb-guard.spec.js` (5 cases) pins the contract.
  - **Phase 2 — Button.js variants.** Added `ghost` + `danger` variants and a `size: sm|md|lg` prop. Migrated 3 raw `<button>` sites in SettingsPanel. Mode-shaped HUD extraction documented as N/A (HUD branches by platform + multiplayer, not mode). Rest of the 60 raw buttons across the codebase stay as their specialized components on purpose (Toggle, TabButton, KeyBindButton, PresetButton, MenuOption, icon-circular).
  - **Phase 4 — Mac bug research doc.** Browserbase no-go for Safari (Chromium-only). Sky shader missing precision declaration — likely cause of rainbow horizon-banding under WebKit-on-Metal. White-ground suspect narrowed to terrain inline ShaderMaterial / grass GLSL / fog chunk. Pending Matt's `__sdsDiag` capture.
  - **Phase 6 — Leaderboard data-visibility + filter UX (closed 2026-05-02 prior to this session).** Worker validates `mode=`, slow→fast fallback, per-mode dispatch. Migration 0005 applied. Frontend filters disclosure + Clear-filters action. 25 new vitest cases.
- **149/149 vitest pass** (was 136/136; +5 from `tests/swap-drift-glb-guard.spec.js`, +8 from `tests/shader-precision.spec.js`). Production build clean (739 KB main / 218 KB gzip; matches Cycle 11 baseline). Sim-baseline byte-identical through Cycles 5-12.

- **Phase 4 sky-banding fix shipped post-close** (commit `04e62e7`, 2026-05-02). `precision highp float;` + `precision highp int;` declared at source in [`js/atmosphere/skyShader.glsl.js`](js/atmosphere/skyShader.glsl.js), [`js/atmosphere/cloudShader.glsl.js`](js/atmosphere/cloudShader.glsl.js), and the grass vertex shaders. 1/255 hash dither at sky's final fragment write to break 8-bit color quantization on the horizon gradient. Verification on Matt's actual Mac (via `gh workflow run macos-safari.yml`) is the only outstanding item.

- **Cycle 13 Phase 1 partial — cinema runner unblock + first hero card (2026-05-02).** Three issues from yesterday's `og-rh-sunset` first-pass capture fixed: (1) only 24/1000 sheep had spawned at fixed `settleMs=4500` — added [`__sdsCinema.waitForFlockSize(target, timeoutMs)`](js/cinematic.js) that polls the optimized sheep system until the target is reached; (2) React HUD reappeared after `startSolo()` despite `?ui=off` — re-assert `hideUI()` after `startSolo` and again before screenshot in [`tools/cinematic/run.mjs`](tools/cinematic/run.mjs); (3) added [`__sdsCinema.freeFly()` + `lockFly()` + `snapshotPose()`](js/cinematic.js) so Matt can in-browser pose with OrbitControls (suspends gameplay camera via [`SceneManager.updateCamera`](js/SceneManager.js) gate) and read paste-ready coords. **First hero card shipped at [`assets/marketing/og/og-rh-sunset.webp`](assets/marketing/og/og-rh-sunset.webp)** (86 KB, 1200×630, hand-captured via the `captureFrame` 1200×630 one-liner). Hero card *posing workflow* is reproducible; the pose is *not* yet pinned in [`shot-list.mjs`](tools/cinematic/shot-list.mjs) — Cycle 14 Phase 5 re-derives + pins all three OG cards on the polished world.

- **Cycle 13 Phase 5 leaderboard scene-as-classification — deferred to Cycle 14+** (was open Q1-Q3). Matt's playtest of the freeFly posing exposed visual issues (floating grass/trees/rocks, jittery wind, unpolished foliage) that block hero card quality. Pivot 2026-05-02: spend Cycle 14 fixing visuals first, then re-render hero cards on a polished surface.

- **Cycle 14 (`visuals-foundation`) drafted with three research dossiers** (2026-05-02 end of session):
  - [`docs/cycle-14-plan.md`](docs/cycle-14-plan.md) — five phases: heightfield-Y unification (foundation), grass modernization, tree replacement + leaf shader + LOD pipeline, rocks + new ScatterSystem, hero card re-render + v1.1.0 tag. Phases 2-4 parallelizable after Phase 1.
  - [`docs/research-grass-2026-05.md`](docs/research-grass-2026-05.md) — Bezier blade spine + gust envelope + scrolling wind texture + render-texture interactors + critically-damped recovery + fake-SSS. Reference: False Earth, Ghost of Tsushima, Codrops Fluffiest Grass.
  - [`docs/research-trees-2026-05.md`](docs/research-trees-2026-05.md) — Quaternius Stylized Tree Pack (CC0) + cross-quad leaves + `@three.ez/instanced-mesh` LOD + Blender vertex-color wind weights. Reference: douges.dev Fluffy Trees, Codrops Fractals to Forests.
  - [`docs/research-rocks-and-scatter-2026-05.md`](docs/research-rocks-and-scatter-2026-05.md) — Quaternius MegaKit rocks + new `ScatterSystem` (Poisson sample, instanced pebbles/sticks/mushrooms/wildflowers) + rim-light shader + yellow-patch flower oversampling. Reference: KayKit Forest, ghibli-grass demo.
  - The earlier Cycle 14 draft (bundle slim, gameplay constants, main.js split, test coverage, WebGPU spike) carries forward to Cycle 15+ — those threads are still real, just unblocked-by-but-not-blocking the visual fixes.

- **Mobile-footer overlap + sheep/grass fog-color hotfixes shipped post-close** (2026-05-02). Two unrelated user-reported bugs:
  - **Mobile footer overlap.** The "Made by Matthew Kissinger · About / GitHub" credits on the start screen used `position: fixed` and overlapped the mode-selection buttons on short mobile viewports. Fix in [`js/components/App.js`](js/components/App.js): refactored the main-menu layout into a column with a `flex: 1 1 auto` centered region above and a `flex: 0 0 auto` footer below — credits now flow at the bottom and can't overlap. Also switched [`.start-screen-container`](css/components/index-styles.css) and [its mobile variant](css/main.css) from `inset: 0` to `width: 100vw; height: 100dvh` (with `100vh` fallback) so layout matches the visible area when the mobile URL bar shows/hides.
  - **Sheep + grass fog hardcoded to sky-blue.** [`js/OptimizedSheep.js`](js/OptimizedSheep.js) and [`js/GrassSystem.js`](js/GrassSystem.js) ran custom shaders with `fog: false` and hardcoded `fogColor: 0x87CEEB` + linear `fogNear/fogFar`, while everything else uses `scene.fog` (a `THREE.FogExp2` whose color the Atmosphere driver writes per-frame from the sky horizon). Result: on golden-hour Open Country, distant sheep and grass faded to bright sky-blue while the terrain faded to warm gold. Fix: replaced `fogNear`/`fogFar` with `fogDensity`, switched the math to `1.0 - exp(-d*d * z*z)` to match FogExp2, and sync `fogColor` + `fogDensity` from `scene.fog` per frame in each system's `update()`. Also updated the external shader files at [`js/shaders/sheep/fragment.glsl`](js/shaders/sheep/fragment.glsl) and [`js/shaders/grass/fragment.glsl`](js/shaders/grass/fragment.glsl) to mirror the inline fallbacks. **Note for follow-up:** [`js/TerrainBuilder.js:1545`](js/TerrainBuilder.js) and [`:1600`](js/TerrainBuilder.js) still lerp tree foliage base color toward `0x87CEEB` for atmospheric perspective — same conceptual issue, different mechanism (base color, not fog), and harder to fix cleanly. Defer until someone designs the right replacement (sample horizon color and lerp toward that).

## Cycle 14 — what shipped (autonomous shader pass, 2026-05-03)

The active plan is [`docs/cycle-14-plan.md`](docs/cycle-14-plan.md). Five phases were attempted; the shader half of each landed cleanly. Below maps each phase to commit + status.

- **Phase 1 — Heightfield Y unification ✅ shipped** (commit `3796f3c`). New [`Heightfield.meshSampleY(x, z)`](shared/terrain/Heightfield.js) triangle-interpolates against a captured `(segs+1)²` grid of post-displacement Ys. [`TerrainBuilder.createTerrain()`](js/TerrainBuilder.js) captures into a `Float32Array` and hands it via `setMeshGrid()`. Visual consumers (Sheepdog, OptimizedSheep, GrassSystem, trees, rocks, farmhouse) routed through `meshSampleY` either directly or via the thin `surfaceY` / `_groundY` wrappers. The historical 0.05 lift (Cycle 9 Phase 5 mitigation) and the GrassSystem `-0.1` "dip into mesh" hack are gone — replaced with exact mesh Y. Rocks bury reduced from 0.10–0.20 to 0.03–0.06 of finalScale (the larger value was over-correcting for the bilinear-vs-mesh gap that this phase fixes). Worker / tests fall back to `sample(x, z) + 0.05`. **Sim-baseline byte-identical.** New [`tests/heightfield-mesh-y.spec.js`](tests/heightfield-mesh-y.spec.js) adds 9 cases pinning vertex agreement, NW-vs-SE triangle selection, planar-slope exactness, edge clamping, fallback path, and length validation. Vitest 149 → 158.
- **Phase 2 — Grass modernization ✅ shipped** (commit `f1e0d78`). Replaced per-vertex simplex-noise wind with the Cycle 14 dossier playbook in [`js/GrassSystem.js`](js/GrassSystem.js):
  - **Gust envelope** scrolling at ~1.5 m/s along `windDirection`, ~30m wavelength, biased ~30/70 strong/calm (the single biggest "zen" lever per the dossier).
  - Two octaves of analytic low-freq sway in world space (no texture sampling — drops the per-frame noise lookup).
  - Carrier = constant 0.45 lean + gust-modulated sway, t² weight on amplitude (Bezier-spine analogue).
  - Per-blade decorrelator (`gl_InstanceID` hash) so neighbours aren't in lockstep.
  - Tip-only flutter on the top ~35% of blade height — leaf-tip shimmer without whole-blade rattle.
  - Fragment shader fake-SSS: new `uSunDirection` uniform (plumbed from `atmosphere.getSunDirection()` via `setSunDirection()` per frame). `pow(saturate(dot(toCamera, -sunDir)), 4) * tipColor * 0.7 * tipMask` — tight halo on the sun silhouette so rim only fires at sunrise/sunset (matches og-rh-sunset hero composition).
  - External `js/shaders/grass/{desktop-vertex,fragment}.glsl` mirrored as documentation.
  - **Deferred to Cycle 15+:** render-texture interactors and critically-damped trample recovery — both need per-blade state via render-target ping-pong.
- **Phase 3 — Trees ✅ shader shipped, asset bake pending** (commit `ec0b902`; asset path resolved 2026-05-03). Added `_patchTreeWindMaterial()` + `_setupTreeWind()` on `TerrainBuilder`: an `onBeforeCompile` patch that replaces `<project_vertex>` so wind is applied AFTER per-tree instance rotation (in instance/world space). Wind weight = `smoothstep(0.25, 1.0, posY01)²` where `posY01` is the vertical fraction up the tree from `modelBboxMinY` to `modelBboxMaxY`. Trunk vertices get weight ~0; leaf vertices sway fully. Same gust-envelope + 2-octave sway math as grass, mirrored at lower amplitude (0.18 multiplier). Tip flutter on high-weight verts. Shared uniforms (one set drives every patched tree material); direction synced from `grassSystem` so grass and trees agree on wind. WeakSet guard makes the patch idempotent across scene swaps. **Existing `Resource_Tree1.glb`, `Resource_Tree2.glb`, `Resource_PineTree.glb` now sway.** **Asset path resolved 2026-05-03 to [EZ-Tree](https://github.com/dgreenheck/ez-tree) (MIT NPM library, v1.1.0)** — pivoted away from Quaternius MegaKit after a follow-up research pass. EZ-Tree as a build-time bake is autonomous-actionable; details in "Carry-forward asset work" below.
- **Phase 4 — Rocks ✅ rim-light shader shipped, asset swap + ScatterSystem blocked** (commit `42c9f63`). Added `_patchRockMaterial()` + `_setupRockShader()` on `TerrainBuilder`: an `onBeforeCompile` patch injecting after `<emissivemap_fragment>` that adds `pow(1 - max(dot(viewDir, normal), 0), 2) * uRimColor * 0.35` to `totalEmissiveRadiance`. Per the rocks dossier this is "the single biggest AAA tell for stylized rocks" — silhouettes pop against grass, shadow sides get a stylized sky-bounce lift. `uRimColor` is plumbed from `atmosphere.sun.light.color` via `setRockRimColor()` per frame so rim hue tracks sunrise/sunset. WeakSet idempotency across swaps. **Existing `Resource_Rock_1/2/3.glb` rim now.** Asset swap + new `js/ScatterSystem.js` are **Matt-blocked** below.
- **Phase 5 — Hero card re-render — Matt-blocked.** Needs interactive `freeFly()` posing + `npm run cinema --shot=…` runs against the polished world. The shader shipping above is meaningful polish, but Matt should playtest before pinning hero cards: the new wind / SSS / rim-light may push framing decisions in different directions than the in-progress drafts. Cycle 13 Phase 1's `freeFly` + `snapshotPose` helpers are still ready to use.

### Carry-forward asset work (mix of autonomous-actionable + Matt-gated)

The trees path is now autonomous-actionable thanks to the EZ-Tree pivot — no external download required. Rocks + hero cards remain Matt-gated (Quaternius MegaKit needs manual download for rocks; hero cards need browser playtest).

1. **Trees — autonomous-actionable.** `bun add -D @dgreenheck/ez-tree` ([npm](https://www.npmjs.com/package/@dgreenheck/ez-tree), [GitHub](https://github.com/dgreenheck/ez-tree), MIT, v1.1.0 Jan 2026). Author `tools/bake-trees.mjs` — Node script that imports `Tree`, instantiates 4–5 stylized trees with tuned parameters (target: 2–3 broadleaf replacing tree1/tree2, 1–2 conifer replacing pine), and exports each as a GLB via three.js `GLTFExporter`. Output to `assets/models/trees/`. Wire as `npm run bake-trees` in `package.json`. Run before `npm run compress-glbs`. Update `modelPaths.trees` in [`js/TerrainBuilder.js`](js/TerrainBuilder.js) to the new filenames; verify `userData.modelBaseYOffset` lands the GLB pivot on terrain.
2. **Tree LOD pool — autonomous-actionable** (best done after step 1). `bun add @three.ez/instanced-mesh`. Replace the current `new THREE.InstancedMesh(child.geometry, child.material, instances.length)` with the upgraded class in [`js/TerrainBuilder.js`](js/TerrainBuilder.js) tree creation. Register the existing 3-quad billboard impostor as LOD1 on the same instance pool — kills the 250m near→far seam.
3. **Rocks — Matt-gated** (manual download). Download Quaternius Stylized Nature MegaKit (CC0) from [quaternius.com/packs/stylizednaturemegakit.html](https://quaternius.com/packs/stylizednaturemegakit.html). Cherry-pick 4–6 hero rocks. Drop into `assets/models/rocks/`. Run `npm run compress-glbs`. Update `modelPaths.rocks` in [`js/TerrainBuilder.js`](js/TerrainBuilder.js).
4. **ScatterSystem — Matt-gated on rocks pack** (the same MegaKit download covers pebbles/sticks/mushrooms/wildflowers). Author [`js/ScatterSystem.js`](js/ScatterSystem.js) sibling to GrassSystem. Constructor `(scene, isMobile, sceneDef, heightfield, boundary)`. Internals: Poisson-disk sample on the heightfield XZ plane (radius ~0.4m, capped ~2k samples); render 4–5 prop variants via `InstancedMesh`; ~70% pebbles/sticks, ~20% small flora, ~10% punctuation clusters; cull beyond ~40m camera radius. Yellow-dandelion oversampling on a subset of points (5–8 in 1.5m) for Ghibli eye-anchor clusters. Wire after GrassSystem in scene init; add to `disposeScene` teardown.
5. **Phase 5 hero cards — Matt-gated** (needs browser playtest). Open in browser → start Solo Extreme → `await __sdsCinema.freeFly()` → pose → `snapshotPose()` → paste into [`tools/cinematic/shot-list.mjs`](tools/cinematic/shot-list.mjs) → `npm run cinema --shot=og-rh-sunset` (and the two siblings). Render the four cinematic videos. Tag v1.1.0.

The shader work above is **fully decoupled from the asset work** — once new GLBs land (whether EZ-Tree-baked or Quaternius), they pick up the leaf-wind + rim-light patches automatically (the patches walk every child mesh, regardless of model path).

## Cycle 13 entry points (deferred)

- **Phase 1 cinematic videos** — Cycle 13 unblocked the cinema runner (`waitForFlockSize` + `freeFly` + `snapshotPose` helpers shipped). The hero card *workflow* is reproducible. Final hero card *renders* deferred to Cycle 14 Phase 5 (after world is polished).
- **Phase 2 CF Web Analytics** — still Matt-gated, still ~30 min. Copy beacon `<script>` from CF Pages console into [`index.html`](index.html) head. Independent of Cycle 14 work; can be done anytime.
- **Phase 3 manual playtest sweep** — still Matt-gated. Worth doing on the polished Cycle 14 surface; defer to Cycle 14 Phase 5 close.
- **Phase 4 sky shader precision** — ✅ **shipped 2026-05-02** (commit `04e62e7`). Mac visual confirmation via `gh workflow run macos-safari.yml` is the only outstanding item.
- **Phase 5 leaderboard scene-as-classification** — Matt deferred 2026-05-02 in favor of visuals work. Q1-Q3 still need resolution before code; folds into Cycle 15+ if not earlier.
- **Phase 6 `v1.1.0` tag** — folded into Cycle 14 Phase 5.

Phases 1, 2, 3, 5 are fully parallelizable. Phase 6 waits on Phase 1.

## Cycle 12 surfaces worth knowing

- **A8 acceptance check:** `await window.__sdsStressTestSwaps(5)` from DevTools — should report `< 5%` drift on geometries, textures, programs after the Phase 1 fix.
- **Per-subsystem disposal diagnostics:** set `window.__sdsSwapDriftLog = true` from DevTools, swap a scene, and the console will log Δgeo/Δtex/Δprog deltas after each subsystem teardown step (sceneAbort → effects → sheep → sheepdog → structures → water → terrain → atmosphere → sunBillboard). Off by default; allocation-free.
- **Button variants:** `<Button variant="ghost" size="sm" />` and `<Button variant="danger" size="sm" />` are the new entries on [`js/components/ui/Button.js`](js/components/ui/Button.js). Sizes (`sm/md/lg`) override the responsive defaults.
- **GLB shared-material fence:** any new code that creates an `InstancedMesh` from a cached GLB model's `child.geometry` + `child.material` MUST tag the mesh with `userData.sharedFromGlbCache = true` and rely on remove-from-scene for teardown. Disposing the shared geo/mat invalidates the cache.
- **Mac bug research:** [`docs/mac-bug-research.md`](docs/mac-bug-research.md) has the white-ground hypothesis, sky-banding fix sketch, and Browserbase no-go recommendation.

## Cycle 12 → 13 carryover (deferred items)

Per `BACKLOG.md` Cycle 12 close entry — list here for fast-recall:

1. **Phase 3 cinematic videos.** 4 specs in `tools/cinematic/shot-list.mjs` (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`). Headless WebGL is flaky on Windows; runner works in `--headed`. `oc-portal` has a "Pause until first sheep ascends" inline TODO. Cycle 13 Phase 1.
2. **Phase 5 CF Web Analytics beacon.** Copy `<script>` from CF Pages console → Analytics tab. Cycle 13 Phase 2.
3. **Phase 5 manual playtest.** Solo (5 × 3) + MP (200/250/500/1000 on Field) + leaderboard surface + Cycle 8/9 carry-forward items. Cycle 13 Phase 3.
4. **Mac sky-banding fix.** Force precision highp + 1/255 hash dither in sky/cloud/grass shaders. Cycle 13 Phase 4.
5. **Mac white-ground bug.** Pending Matt's `__sdsDiag` capture from his actual machine. Investigation steps in [`docs/mac-bug-research.md`](docs/mac-bug-research.md).

## Cycle 11 surfaces worth knowing (still relevant)

- **In-process scene swap entry points** ([`js/main.js`](js/main.js)): `swapScene`, `disposeScene`, `rebuildScene`, `_buildSceneBody`, `restartToMenu`. MP guests fall back to hard reload (Q1).
- **SceneSwapOverlay** ([`js/components/ui/SceneSwapOverlay.js`](js/components/ui/SceneSwapOverlay.js)): subscribes to `scene-swap-start`/`-end`/`-error`. 200ms in / 200ms min visible / 200ms out.
- **Telemetry surface** ([`js/telemetry.js`](js/telemetry.js)): `emitEvent(name, props)` — anonymous welcome, JWT-aware, fire-and-forget. 4 events wired.
- **Cinema runner** ([`tools/cinematic/run.mjs`](tools/cinematic/run.mjs)): `npm run cinema -- --shot=<id>` `--headed` `--skip-video` `--no-encode`.
- **Cinema API** ([`js/cinematic.js`](js/cinematic.js)): `pauseSimulation()`, `startSolo(dogId, mode)`, `waitReady(timeoutMs)`, `mountDogShowcase(dogId)`, plus `setSun`, `setCameraPose`, `playPath`, `triggerLightning`.
- **Sky preset fix**: `pastoral-noon` exposure 0.22 → 0.08 in [`js/atmosphere/skyPresets.js`](js/atmosphere/skyPresets.js).
- **Rock placement**: per-rock playarea buffer 20 → 40m + always-buried Y offset in [`js/TerrainBuilder.js`](js/TerrainBuilder.js).

## Running locally

First time on a fresh clone:

```
npm install
cp worker/.dev.vars.example worker/.dev.vars   # sets JWT_SECRET for local
npm run dev:setup                              # applies D1 migrations to local sqlite
```

Every session after that:

```
npm run dev    # starts Vite (:3000) + wrangler (:8787) together
```

To run cinematic captures locally:

```
npm install --save-dev sharp                                    # one-time
choco install ffmpeg  # or scoop install ffmpeg                 # one-time, system
npx playwright install chromium                                  # one-time
npm run cinema -- --skip-video --headed                          # render OG + dog + PWA stills
npm run cinema -- --shot=dog-into-sunset --headed                # iterate single shot
```

Open `http://localhost:3000`. URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl` (probe), `?cinematic=1` (filming infra), `?ui=off` (hide React overlay), `?sun=0.5` (sun position).

### Standing risks (carried into Cycle 13)

- **Sim-baseline fixtures one-way.** Don't regenerate without understanding the diff. Cycles 5-12 left them bit-identical.
- **`?cinematic=1` flips `preserveDrawingBuffer`.** Documented perf hit. Any change letting the flag affect normal play is a Hard Stop.
- **GLB shared-material trap (Cycle 11 + 12 finding).** Any new code creating an `InstancedMesh` from a cached GLB's `child.geometry` + `child.material` must tag with `userData.sharedFromGlbCache = true` and rely on remove-from-scene only.
- **Mac white-ground bug.** Reproduces on Matt's specific Mac, not on GH `macos-latest` Safari. Environmental. Investigation pending Matt's `__sdsDiag` capture.

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-13-plan.md`](docs/cycle-13-plan.md) — five phases, mostly Matt-gated |
| Latest closed cycle | [`docs/archive/cycles/cycle-12-plan.md`](docs/archive/cycles/cycle-12-plan.md) |
| Prior closed cycle | [`docs/archive/cycles/cycle-11-plan.md`](docs/archive/cycles/cycle-11-plan.md) |
| Older cycles | [`docs/archive/cycles/cycle-10-plan.md`](docs/archive/cycles/cycle-10-plan.md), [`docs/archive/cycles/cycle-9-plan.md`](docs/archive/cycles/cycle-9-plan.md), [`docs/archive/cycles/cycle-8-plan.md`](docs/archive/cycles/cycle-8-plan.md), [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md), [`docs/cycle-6-plan.md`](docs/cycle-6-plan.md), [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md) |
| Cycle stub template | [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) |
| Frozen files / fence rules | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Closed cycles + deferred items | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Mac bug research | [`docs/mac-bug-research.md`](docs/mac-bug-research.md) |
| Slash commands | [`.claude/commands/`](.claude/commands/) — `/cycle-start`, `/cycle-close`, `/validate` |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player CHANGELOG | [`CHANGELOG.md`](CHANGELOG.md) |
| Press kit | [`PRESSKIT.md`](PRESSKIT.md) |
| Electron readiness | [`docs/electron-readiness.md`](docs/electron-readiness.md) |
| How to add a biome | [`docs/adding-a-biome.md`](docs/adding-a-biome.md) |

## What NOT to do

- Don't rearchitect multiplayer. It works.
- Don't reintroduce procedural mountains. The right path is a height-displaced skirt.
- Don't add new scenes. Three is the right number.
- Don't touch `shared/MovementPhysics.js`'s `updateMovement` for obstacle composition — Cycle 6 deliberately put obstacle-force composition at the call site.
- Don't blow up `main.js` in one PR. Shrink one responsibility at a time.
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed and why.
- Don't hardcode grass-exclusion zones for non-Field scenes. Gate on `sceneDef?.farmHouse` and `sceneDef?.pasture`.
- Don't gate sprint *continuation* on `stamina >= minStaminaToSprint` — only sprint *start*.
- Don't traverse-and-dispose materials on GLB clones (SkeletonUtils.clone, .clone()) — they share materials with the cache. Cycle 11 + 12 A8 leak class. Tag with `userData.sharedFromGlbCache = true` and remove-from-scene only.
- Don't let `?cinematic=1` flip `preserveDrawingBuffer` on the normal-play codepath.
- Don't re-trigger the cinema runner without `--shot=<id>` during regular dev — committed OG/dog/PWA assets re-render with sub-pixel-different WebP encoding and create diff noise.
- **Cycle 13:** Don't tag `v1.1.0` until Phase 1 (videos) + Phase 4 (sky precision) land cleanly.
