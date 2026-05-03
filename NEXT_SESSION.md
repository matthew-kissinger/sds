# Next Session — Cycle 14 (`visuals-foundation`) Phases 1–4 SHIPPED + DEPLOYED; three known visual issues remain before Phase 5

> Updated 2026-05-03 (autonomous close pass + two empirical-fix hotfix iterations after deploy + post-review issue logging). **Active plan: [`docs/cycle-14-plan.md`](docs/cycle-14-plan.md).** Live on [sheepdogsim.com](https://sheepdogsim.com). What shipped: heightfield-Y unification (P1), grass gust-envelope wind + sun-aligned fake-SSS (P2), EZ-Tree build-time bake + leaf-wind shader + InstancedMesh2 per-instance culling (P3), Quaternius MegaKit rocks with fresnel rim-light + new [`js/ScatterSystem.js`](js/ScatterSystem.js) (P4). Two post-deploy hotfixes landed: (a) **InstancedMesh2 entity API uses `quaternion` not Euler `rotation`** — caught by CI e2e smoke; fixed via `setFromEuler` / `setFromAxisAngle` at the 3 InstancedMesh2 callsites (commit `a41f9a6`). (b) **Trees rendered as white-pillar skeletons in first deploy** — EZ-Tree's preset `bark.tint: 0xFFEAB1` is a near-white texture-modulator; with `bark.textured: false` it became the full albedo. Plus `branch.children: 4/2/0` + `leaves.count: 10` was too sparse. Re-baked with per-recipe brown bark + relaxed children to 6/4/2 + leaves.count to 28 (oak 36); now reads as lush mixed forest (commit `39f44fb`). **🟡 Three known visual issues remain (must fix before Phase 5 hero cards):** (1) trees still don't have *enough* leaves at typical play-camera distance; (2) some trees float above terrain in RH/OC; (3) **rocks look like broken mesh shards** — Quaternius MegaKit needs replacing (Kenney Nature Kit, KayKit Forest, or pixel-forge custom). Details + fix-paths in the "Known visual issues" section below. **What's Matt-gated:** the three fixes above + Phase 5 hero-card re-renders → v1.1.0 tag. **158/158 vitest pass; sim-baseline byte-identical; production build clean (main 815 KB / 241 KB gzip); CI Mac Safari smoke green.** Last closed cycle: [`docs/archive/cycles/cycle-12-plan.md`](docs/archive/cycles/cycle-12-plan.md). Cold-start agents: read this page top-to-bottom, then [`docs/cycle-14-plan.md`](docs/cycle-14-plan.md), then the three research dossiers in `docs/research-*-2026-05.md`. Earlier cycles: [`docs/archive/cycles/cycle-11-plan.md`](docs/archive/cycles/cycle-11-plan.md), [`docs/archive/cycles/cycle-10-plan.md`](docs/archive/cycles/cycle-10-plan.md).

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
- **Phase 3 — Trees ✅ FULLY SHIPPED + visually verified.** Five commits to land cleanly:
  - **Leaf-wind shader patch** (`ec0b902`): `_patchTreeWindMaterial()` + `_setupTreeWind()` on `TerrainBuilder` — `onBeforeCompile` that replaces `<project_vertex>` so wind is applied AFTER per-tree instance rotation. Wind weight = `smoothstep(0.25, 1.0, posY01)²` (vertical fraction up the tree from bbox min to max). Gust-envelope + 2-octave sway math mirroring grass at 0.18 amplitude. Direction synced from `grassSystem`. Idempotent via WeakSet guard.
  - **EZ-Tree build-time bake** (`a469a00`): [`tools/bake-trees.mjs`](tools/bake-trees.mjs) (Node driver) + [`tools/bake-trees/bake.html`](tools/bake-trees/bake.html) (Playwright harness) generate stylized GLBs from `@dgreenheck/ez-tree@1.1.0` at build time. `npm run bake-trees` then `npm run compress-glbs`. Three seeded recipes (Aspen, Oak, Pine "Medium"); per-recipe normalize to 1m height so existing placement scale-variance ranges work unchanged. Located at [`assets/models/trees/`](assets/models/trees/); old `Resource_Tree*.glb` deleted.
  - **InstancedMesh2 per-instance frustum culling** (`9f025f8`): dropped `THREE.InstancedMesh` for `@three.ez/instanced-mesh@0.3.15` on both the near (full mesh) and far (impostor) tree paths. Out-of-frame instances skip vertex shader execution. Bundle +57 KB raw / +17 KB gzip from `@three.ez/instanced-mesh` + `bvh.js`. LOD-pool unification deferred to Cycle 15 (needs trunk-only + leaves-only impostor bakes).
  - **Hotfix 1 — InstancedMesh2 entity API uses `quaternion`, not Euler `rotation`** (`a41f9a6`). First deploy hit a fatal `TypeError: Cannot read properties of undefined (reading 'copy')` in `createTrees`. Caught by CI e2e smoke (`tests/e2e/smoke.spec.ts:76`). Root cause: `@three.ez/instanced-mesh` entities passed to the `addInstances` callback expose `position` + `quaternion` + `scale`. SDS's placement records use `THREE.Euler` (existing `THREE.InstancedMesh` + `dummy.rotation.copy(euler)` convention). Fix: `obj.quaternion.setFromEuler(inst.rotation)` at near-tree + far-impostor sites; `obj.quaternion.setFromAxisAngle(_Y_AXIS, …)` for ScatterSystem's Y-only random rotation.
  - **Hotfix 2 — brown bark + full canopy** (`39f44fb`). Second deploy showed trees rendering as tall white-trunk skeletons. EZ-Tree's preset `bark.tint: 0xFFEAB1` (cream) is designed to MODULATE a bark texture; with `bark.textured: false` it became the full albedo. Plus `branch.children: 4/2/0` + `leaves.count: 10` was too sparse to read as canopy. Fix: per-recipe brown bark (aspen `0x7a5a3a`, oak `0x5a3a26`, pine `0x4a3525`) + relax `children` to `6/4/2` + `leaves.count: 28` shared (oak gets 36 for the full broad-canopy hero look). Final per-tree sizes after Draco/Meshopt: tree1 201 KB / 4804 tris, tree2 589 KB / 17224 tris, pine 109 KB / 856 tris — **899 KB across 3 GLBs** (was 284 KB pre-hotfix). Visually verified via [`tools/probe.mjs`](tools/probe.mjs) before pushing.
  - **Sharp edge surfaced**: `scripts/compress-glbs.mjs` reads from the `assets/_originals/` BACKUP, not the current file. After re-baking, `rm assets/_originals/models/trees/*.glb` is required to invalidate the cache before re-compression — otherwise fresh recipe content gets overwritten by recompression of the old backup. Documented in `39f44fb` commit message; future polish is to teach compress-glbs to detect a newer-mtime-than-backup and re-back-up automatically.
- **Phase 4 — Rocks + ScatterSystem ✅ FULLY SHIPPED.** Three pieces:
  - **Fresnel rim-light shader** (commit `42c9f63`): `_patchRockMaterial()` + `_setupRockShader()` on `TerrainBuilder` — `onBeforeCompile` injection after `<emissivemap_fragment>` that adds `pow(1 - max(dot(viewDir, normal), 0), 2) * uRimColor * 0.35` to `totalEmissiveRadiance`. The dossier's "single biggest AAA tell for stylized rocks." `uRimColor` is plumbed from `atmosphere.sun.light.color` per-frame so rim hue tracks sunrise/sunset.
  - **Quaternius MegaKit rocks**: `Rock_Medium_1/2/3.gltf` from the CC0 [Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html), converted via `gltf-transform optimize --texture-size 128`. Each rock ~46 KB, total ~140 KB at [`assets/models/rocks/`](assets/models/rocks/). Old `Resource_Rock_*.glb` deleted. The rim-light shader patch auto-applies via `_setupRockShader` walking child materials.
  - **ScatterSystem** ([`js/ScatterSystem.js`](js/ScatterSystem.js), ~330 LoC) — sibling to GrassSystem. Bridson-style Poisson-disk sampler within a circular area (cell-based spatial hash, 30-attempt fallback), minDist 4m desktop / 6m mobile, cap 2200 / 800 instances. Yellow-flower oversampling: 5% of base samples × 5–8 flowers in a 1.5m radius around each (the Ghibli-meadow eye-anchor pattern). Weighted-random variant assignment per dossier ratio: ~60% pebbles, ~25% small flora, ~15% mushrooms. 9 prop variants from MegaKit at [`assets/models/scatter/`](assets/models/scatter/) (3 pebbles, 2 mushrooms, 2 clovers, 2 flowers; ~450 KB total). Each variant gets its own InstancedMesh2 → per-instance frustum culling skips ~75% of scatter cost from any single camera direction. Flora-only leaf-wind shader patch via dependency-injection hook (mushrooms + pebbles stay still); wind direction + uTime shared with trees + grass for whole-world coherence. `userData.sharedFromGlbCache` tags + remove-from-scene-only dispose preserve Cycle 11+12 A8 invariants. Wired into TerrainBuilder.createScatter() (called after createTrees in scene init); clearScatter integrated into rebuildEnvironment + dispose paths.
- **Phase 5 — Hero card re-render — Matt-blocked.** Needs interactive `freeFly()` posing + `npm run cinema --shot=…` runs against the polished world. The shader shipping above is meaningful polish, but Matt should playtest before pinning hero cards: the new wind / SSS / rim-light may push framing decisions in different directions than the in-progress drafts. Cycle 13 Phase 1's `freeFly` + `snapshotPose` helpers are still ready to use.

### Known visual issues from 2026-05-03 playtest review (must fix before Phase 5 hero cards)

Captured at the end of the cycle-14 docs-alignment session via [`tools/probe.mjs`](tools/probe.mjs) + Matt's eyeball review. These are the things that will show up on hero cards if they're not fixed first — pin them down before posing OG cards.

1. **Trees still don't have enough leaves.** The brown-bark + relaxed-children + leaves.count=28/36 hotfix (commit `39f44fb`) was a big lift over the white-skeleton state, but at the typical play-camera distance trees still read as "moderately leaved" rather than "lush canopy." Rolling Hills probe shows visible branch structure on several mid-ground trees. Try: bump `leaves.count` further (40+), bump `leaves.size`, raise `branch.children: { 0: 6, 1: 4, 2: 2 }` toward `{ 0: 7, 1: 5, 2: 3 }` (closer to EZ-Tree default) for more leaf-cluster anchor points. Sharp edge: re-baking requires `rm assets/_originals/models/trees/*.glb` first to invalidate the compress-glbs backup cache.
2. **Some trees float above terrain.** Spotted in the Rolling Hills + Open Country probes. Theory list to investigate: (a) far-tree cross-billboard quads on slopes — the impostor's flat 2D quad placed at terrainY may extend above ground when the slope is steep behind the camera-facing direction; (b) horizon-zone trees (radius >400m, on the flat skirt at y=0) — `meshSampleY` should return 0 there, but if the heightfield's smoothstep falloff produces slightly negative values at the boundary, trees might be placed at slight negative Y while the mesh renders at 0; (c) the bake-harness `tree.position.y = -bbox.min.y * s` lift surviving GLTFExporter into a non-zero `modelBboxMinY` after the load-time bake, which would compound with `baseOffset * t.scale` to lift trees. Verify with the probe — capture closer-in Solo screenshots to identify which zone(s) the floaters cluster in.
3. **Rocks look like broken mesh shards, not rocks.** Per Matt's review, the Quaternius MegaKit `Rock_Medium_1/2/3.gltf` assets render as faceted geometric fragments — possibly because (a) the 128px diffuse texture downsample is too aggressive for the rock surface detail the asset was authored for, (b) the meshes have flat-shading-incompatible vertex normals, or (c) the rocks were never meant to be normalized to 0.2m native (`ROCK_NATIVE_HEIGHT`) — the silhouette breaks down at that scale. **Decision needed**: either source different stylized rock assets (Kenney Nature Kit, Poly Pizza CC0 search, or a different Quaternius pack) OR commission custom rocks in pixel-forge. Documented in the rocks-research dossier as a real next-step.

### Carry-forward work (Phase 5 + visual fixes, Matt-gated for direction)

Phases 1–4 code is fully closed and live, but the three known visual issues above need a fix pass before Phase 5 hero cards land. Order of operations:

1. **Fix trees + rocks first** (one or two iteration sessions):
   - Re-bake trees with denser canopy. `rm assets/_originals/models/trees/*.glb && npm run bake-trees && npm run compress-glbs`. Verify via `node tools/probe.mjs http://localhost:4173 rolling-hills`.
   - Diagnose floating trees by inspecting `_groundY` return values in the suspect zones, or by adding a debug overlay that draws each tree's `placementY` vs the actual terrain mesh Y.
   - Replace rock assets — either swap to a different CC0 pack (Kenney Nature Kit, KayKit Forest, hand-picked Poly Pizza items) or kick off a pixel-forge custom asset cycle.
2. **Phase 5 hero cards.** Open in browser → `?cinematic=1` → start Solo Extreme → `await __sdsCinema.freeFly()` → pose → `snapshotPose()` → paste into [`tools/cinematic/shot-list.mjs`](tools/cinematic/shot-list.mjs) → `npm run cinema --shot=og-rh-sunset` (and the two siblings). Render the four cinematic videos. Tag v1.1.0.

### Visual review tooling shipped during Cycle 14

If anything in the deployed world reads as "off," these tools exist to triage without depending on a live human eye:

- **[`tools/probe.mjs <baseUrl> <scene>`](tools/probe.mjs)** — minimal Playwright harness. Loads the cinematic URL, sleeps 45s for full init, dumps the canvas via `toDataURL('image/png')` to `tools/playtest/probe/<scene>.png`. Captures page-errors + warnings + failed network requests. Bypasses Playwright's flaky `page.screenshot` (which times out under continuous WebGL animation).
- **[`tools/playtest-screenshots.mjs`](tools/playtest-screenshots.mjs)** — six-shot scene sweep harness (Field/RH/OC × noon/sunset). Currently the camera poses inside it use `__sdsCinema.startSolo` + `setSun` + `setCameraPose`; first-pass capture cycle hit the cinema-init-timing edge so the harness is rougher than `probe.mjs`. Useful as a starting point for a real cinematic capture pass.
- **[`tools/inspect-glb.mjs <path>`](tools/inspect-glb.mjs)** + **[`tools/inspect-glb-three.mjs <path>`](tools/inspect-glb-three.mjs)** — GLB bbox + pivot inspectors. The first uses `@gltf-transform/core` (fast, but quantized values for meshopt-compressed GLBs); the second uses Three.js GLTFLoader + a `self`/`ProgressEvent` polyfill to dequantize. The Cycle 14 pivot+scale audit (commit `ea9547a`) was caught by these inspectors before reaching the browser.

Both `tools/playtest/` and inspector outputs are gitignored (regenerable on demand).

### Tuning knobs surfaced for first-playtest adjustments

Eyeball the deploy at sheepdogsim.com and flag what reads as off — these knobs are 1-line tweaks:

| Looks off? | Knob | File | Default |
| --- | --- | --- | --- |
| Trees too tall / too short | `normalizeHeight` per recipe | [`tools/bake-trees.mjs`](tools/bake-trees.mjs) | 1.0 |
| Trees rattle too much / too still | `_treeWind.uWindStrength` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.6 desktop / 0 mobile |
| Tree bark color wrong | `bark.tint` per recipe | [`tools/bake-trees.mjs`](tools/bake-trees.mjs) | brown 0x4a–0x7a range |
| Rocks too big / too small | `ROCK_NATIVE_HEIGHT` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.2m |
| Rocks float / sink | `ROCK_Y_SCALE` (matches scale.y multiplier) | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.7 |
| Rim-light too strong / dull | `_rockShader.uRimStrength` | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) | 0.35 |
| Scatter density sparse / dense | `minDist` | [`js/ScatterSystem.js`](js/ScatterSystem.js) | 4m desktop / 6m mobile |
| Yellow-flower clusters wrong | `oversampleFraction` | [`js/ScatterSystem.js`](js/ScatterSystem.js) | 0.05 |
| Specific scatter prop sized wrong | `targetHeight` in `PROP_VARIANTS` | [`js/ScatterSystem.js`](js/ScatterSystem.js) | per type (10–40cm) |

Re-baking trees: edit recipes, then **`rm assets/_originals/models/trees/*.glb && npm run bake-trees && npm run compress-glbs`** (the `_originals` rm is the sharp edge surfaced in `39f44fb` — required to invalidate the compress-glbs backup cache).

### Cycle 15+ candidates surfaced during Cycle 14

- **Tree LOD-pool unification.** Per-instance dynamic switch from full GLB mesh → cross-billboard impostor based on camera distance (currently a static spatial split at 400m radial from world origin). Requires authoring trunk-only and leaves-only impostors since EZ-Tree splits each tree into trunk + leaves children with separate materials, and the current cross-billboard bake is a single combined billboard. The plumbing is in place via `@three.ez/instanced-mesh` `addLOD(geometry, material, distance)` API — once the per-mesh impostors exist, it's a one-liner.
- **Render-texture interactors + critically-damped trample recovery for grass.** Phase 2 deferred this — needs per-blade render-target ping-pong state. Pairs naturally with the WebGPU spike since TSL maps cleanly onto compute shaders for this.
- **WebGPU spike** (originally on Cycle 15 docket; the Phase 2 grass + Phase 3 tree shader math both port cleanly to TSL when the migration kicks off).
- **[Procedural Instanced Forest](https://discourse.threejs.org/t/procedural-instanced-forest-high-performance-real-trees/88610)** (red-reddington, Dec 2025) as an alternative to EZ-Tree if higher tree-count scenes become a priority — 2,800 trees in 8 draw calls at 60fps mid-range desktop.
- **ScatterSystem polish.** The current Bridson Poisson sampler uses unseeded `Math.random` — switch to a seeded RNG (mulberry32 via `shared/Random.js`) so scatter is byte-identical across machines + scene swaps. Also: tune `oversampleFraction` and the variant weights after Matt's first playtest in case the alive-meadow density reads too sparse / too dense on the various scenes.

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
