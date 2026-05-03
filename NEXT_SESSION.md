# Next Session — Cycle 13 partial close; Cycle 14 (`visuals-foundation`) drafted with research dossiers shipped

> Updated 2026-05-02 (end of long working session: Cycle 12 close + post-close hotfixes + Cycle 13 Phase 1 partial + Cycle 14 visuals-foundation drafted with three research dossiers). **Active plan: [`docs/cycle-14-plan.md`](docs/cycle-14-plan.md).** Cycle 13's hero-card work was deferred to Cycle 14 Phase 5 after Matt's freeFly posing exposed long-standing visual issues (floating grass/trees, jittery wind) that should be fixed *before* hero cards land. Cycle 13 Phase 1 (cinema runner unblock — `waitForFlockSize`, `freeFly`, `snapshotPose`) shipped. Last closed: [`docs/archive/cycles/cycle-12-plan.md`](docs/archive/cycles/cycle-12-plan.md). Cold-start agents: read this page top-to-bottom, then [`docs/cycle-14-plan.md`](docs/cycle-14-plan.md), then the three research dossiers in `docs/research-*-2026-05.md`. Earlier cycles: [`docs/archive/cycles/cycle-11-plan.md`](docs/archive/cycles/cycle-11-plan.md), [`docs/archive/cycles/cycle-10-plan.md`](docs/archive/cycles/cycle-10-plan.md).

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

## Cycle 14 entry points (active cycle)

Run `/cycle-start` to orient. The active plan is [`docs/cycle-14-plan.md`](docs/cycle-14-plan.md). Read the three research dossiers at `docs/research-*-2026-05.md` before writing any code on Phases 2-4.

**Recommended order (per the active plan):**

- **Phase 1 — Heightfield Y unification (~3-4hr).** Foundation for all visual work. Add `Heightfield.meshSampleY()` (triangle interp against displaced terrain mesh vertex grid), wire into visual consumers (grass, trees, rocks, sheep, dog), keep raw `sample()` for sim. **Sim baseline must remain byte-identical** — that's the whole design. Eliminates the long-standing intermittent-floating issue documented in BACKLOG. **Foundation; do first.**
- **Phase 2 — Grass modernization (~5-7hr).** Bezier blade spine + scrolling wind texture + Worley/ridged gust envelope + render-texture interactors + critically-damped trample recovery + fake-SSS back-light. Per [`docs/research-grass-2026-05.md`](docs/research-grass-2026-05.md). Pure shader/uniform work; no asset changes.
- **Phase 3 — Tree replacement + leaf shader + LOD pipeline (~6-8hr).** Quaternius Stylized Nature MegaKit (CC0) GLBs replace tree1/tree2/pine. Add `@three.ez/instanced-mesh` for per-instance LOD (existing 3-quad billboard becomes LOD1 on the same pool — kills the 250m hand-off seam). Cross-quad leaves with `onBeforeCompile` wind shader. Per [`docs/research-trees-2026-05.md`](docs/research-trees-2026-05.md).
- **Phase 4 — Rocks + ScatterSystem (~4-6hr).** Quaternius rocks + 12 lines of rim-light/base-darken shader detail. New [`js/ScatterSystem.js`](js/ScatterSystem.js) sibling to GrassSystem: Poisson sample on heightfield → InstancedMesh of pebbles/sticks/mushrooms/wildflowers (~2k cap). Yellow-dandelion oversampling for Ghibli eye-anchors. Per [`docs/research-rocks-and-scatter-2026-05.md`](docs/research-rocks-and-scatter-2026-05.md).
- **Phase 5 — Hero card re-render + v1.1.0 tag (~2-3hr).** Re-derive all 3 OG cards via [`__sdsCinema.freeFly()` + `snapshotPose()`](js/cinematic.js) (Cycle 13 Phase 1 helpers); pin coords back into [`tools/cinematic/shot-list.mjs`](tools/cinematic/shot-list.mjs) so they're reproducible. Render the four cinematic videos. Tag v1.1.0.

Phases 2, 3, 4 are fully parallelizable after Phase 1. Phase 5 waits on all.

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
