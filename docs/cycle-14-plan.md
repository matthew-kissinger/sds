# Cycle 14 — `code-health-and-perf-foundation`

> Drafted 2026-05-02 in the same session that closed Cycle 13's pure-code work. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Lay structural foundations that unblock the next year of feature work. Five threads converge: (1) trim the 741 KB main bundle by ~150 KB so cold-loads on mobile feel snappy, (2) extract scattered gameplay tuning into one canonical module so future tuning passes don't archaeology-hunt, (3) start splitting the 3000-line `main.js` so cycle-on-cycle cognitive load stops climbing, (4) backfill unit-test coverage on the four core gameplay modules that have none today (regressions silently sneak through `sim-baseline` because it only catches deterministic-frame drift), and (5) run a focused WebGPU spike on Open Country chaos mode to find out whether the 2025-late ecosystem maturation (Three.js r171 + Safari 26 WebGPU shipped) makes a Cycle 15-16 migration credible.

User-visible difference between before and after: faster cold-load on mobile (Phase 1), no behavioral change for the rest. The WebGPU spike (Phase 5) produces a research doc, not shipped code.

## How to read this plan

This doc fixes the *shape* of the changes — what to move where, what contracts to pin, what acceptance looks like — **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code. Three.js is on r184+; the bundling/instancing/WebGPU stories evolved late 2025. What was "the" solution Cycle 12 may not be optimal now.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing. Use the existing `__sdsStressTestSwaps` harness for swap-cost regressions and the `oc-perf` Playwright spec for frametime baselines.
- **Pick the simplest thing that meets the budget** rather than the most impressive. The structural threads (1, 2, 3) are intentionally low-risk — don't yak-shave them into a full architecture rewrite.

## Open questions to resolve before writing code

1. **Q1: Where does the gameplay-constants module live — `shared/`, `js/`, or a new `js/constants/`?** Author lean: `js/constants/` for client-only tuning (UI z-index, audio cooldowns, LOD thresholds), and `shared/constants/` for anything the worker also reads (sheep counts per mode, score-anomaly floors). Rationale: the existing `shared/` directory is already the source of truth for cross-process schemas; tuning that lives only on the client doesn't belong there.
2. **Q2: For the main.js split, which responsibility comes out first — `GameLoop`, `SwapCoordinator`, or `InitOrchestrator`?** Author lean: `SwapCoordinator` first. It's the most self-contained (Cycle 11 already extracted `_buildSceneBody` and `disposeScene`, so `swapScene` + `rebuildScene` + `restartToMenu` already factor out cleanly), and the `__sdsStressTestSwaps` harness gives us a pre-existing perf gate to catch regressions. `GameLoop` is bigger; `InitOrchestrator` would force decisions about how-much-to-split that are best deferred until we have one extraction under our belt.
3. **Q3: WebGPU spike — Open Country chaos mode, or a synthetic 5000-instanced-cube benchmark?** Author lean: chaos mode on the actual game. A synthetic benchmark proves WebGPU is faster than WebGL2 on instanced draws (we already know that's true). What we don't know is whether *our specific shaders, our specific GLB asset pipeline, our specific scene-swap teardown* port cleanly. Spike on the real thing.
4. **Q4: Coverage thresholds for Phase 4 — strict numeric (e.g. `% statement >= 70`) or qualitative ("each public method has at least one test")?** Author lean: qualitative. We're trying to pin behavior, not chase coverage metrics. The test suite already has 149 specs that nobody fights with; adding a numeric gate would create the wrong kind of pressure.

These don't block Phase 1 (bundle slim is purely additive); resolve before Phases 2-5 to keep scope honest.

## Architecture / shared changes

**Phase 2 introduces a new module pattern: tuning constants by domain.** The shape is:

```
js/constants/
  ui.js          — z-index, animation durations, color tokens
  audio.js       — cooldowns, volume defaults
  rendering.js   — LOD distances, fog density caps, fade curves
  gameplay.js    — re-exports from shared/constants/gameplay.js
shared/constants/
  gameplay.js    — sheep counts per mode, score anomaly floors, durations
```

Why a new directory rather than appending to existing files: the alternative (cramming into `js/SandboxConfig.js` and `js/FieldConfig.js`) was already considered Cycle 8 and rejected — those files are *scene config*, not tuning constants. They configure a particular scene's terrain and gates; they don't own (and shouldn't own) "how loud is the bleat sound" or "what's the LOD fade distance."

**Phase 3 (main.js split) does NOT introduce a new pattern** — it extracts existing logic into co-located files using the same module style as `js/SceneManager.js`, `js/GameState.js`, etc. The goal is reducing main.js, not introducing a framework.

## Phase 1 — Bundle slim via named THREE imports + chunk splits (~3-4hr)

**Independently testable.** Mechanical change with a single perf gate (bundle size). Highest-leverage P1 from the Cycle 13 audit.

The 741 KB main bundle's largest culprit is wildcard `import * as THREE from 'three'` across 15+ files — defeats Vite/Rollup tree-shaking, drags the entire Three.js library in even though we use ~30% of its surface area. Bundle agent estimate: 100-150 KB savings on main.

1. **Inventory wildcard imports.** Grep `import \* as THREE from 'three'` across `js/` and `shared/`. Expect ~15-20 hits. List them with file:line.
2. **For each file, replace wildcard with named imports.** Read the file, find every `THREE.X` reference, build the named-import list at the top. Common members: `Scene`, `Mesh`, `Color`, `Vector3`, `Quaternion`, `BufferGeometry`, `Float32BufferAttribute`, `InstancedMesh`, `ShaderMaterial`, `MeshBasicMaterial`, `FogExp2`, `Group`, `Object3D`. Don't introduce a new alias namespace; just import the names.
3. **Audit `three/addons` and `three/examples` imports.** These should already be named, but check. If `EffectComposer`, `GLTFLoader`, `KTX2Loader`, etc. are statically imported but not always used, dynamic-import them per the bundle agent's recommendation.
4. **Add `manualChunks` review to `vite.config.*`.** It's already configured (the build warning is generic, not a missing-config flag), but verify the split is `react` / `three` / `three-addons` / `i18n` / app. Tighten if needed.
5. **Optional: lazy-load i18n chunk.** ~20 KB main savings if i18next loads on first language-selector interaction instead of cold boot.
6. **Optional: defer start-screen-only components into separate chunks** ([`MobileControls.js`](../js/MobileControls.js), [`FenceEditor.js`](../js/components/FenceEditor.js), [`SandboxSetup.js`](../js/components/StartScreen/SandboxSetup.js), [`SandboxConfig.js`](../js/SandboxConfig.js) — ~60 KB combined). Manual-chunk gate: only trigger if the React route reaches them.

**Acceptance:** Production build clean. Main bundle ≤ 600 KB (target -150 KB; settle for -100 KB if -150 isn't reachable without behavioral risk). Three chunk size unchanged or slightly smaller (named imports don't shrink it directly, but tree-shaking of unused addons might). All 149 vitest specs pass. `npm run dev` and the production site smoke-test identical visually on Field + RH + OC.

**Hard stop:** any visual regression on the 5 sky presets — those are baseline.

## Phase 2 — Centralize gameplay tuning constants (~2-3hr)

**Depends on:** Q1 resolution.

Constants are scattered across 15+ files per the Cycle 13 audit. Tuning passes today require archaeology. Goal: one canonical home each.

1. **Create [`shared/constants/gameplay.js`](../shared/constants/gameplay.js)** with exports for:
   - `MODE_SHEEP_COUNTS = { classic: 200, extreme: 1000, insane: 3000, chaos: 5000 }` (currently in [`GameState.js:804-807`](../js/GameState.js))
   - `MP_SHEEP_COUNT_OPTIONS = [200, 250, 500, 1000]` (currently in [`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts) allow-list)
   - `SCORE_ANOMALY_FLOORS = { ... }` (currently in [`worker/src/d1.ts`](../worker/src/d1.ts))
2. **Create [`js/constants/audio.js`](../js/constants/audio.js)** for sheep bleat / dog bark / score sound cooldowns (currently in [`AudioManager.js:95-98`](../js/AudioManager.js)).
3. **Create [`js/constants/rendering.js`](../js/constants/rendering.js)** for LOD distances (`lodDecimateMid: 200`, `lodDecimateFar: 280`, `grassFadeEnd: 260`, `FAR_LOD_DIST: 400`), fog density placeholders, atmospheric perspective tint values.
4. **Create [`js/constants/ui.js`](../js/constants/ui.js)** for z-index tokens — currently 5+ inline values across [`GamepadManager.js:345`](../js/GamepadManager.js), [`MobileControls.js:293`](../js/MobileControls.js), [`MobileControls.js:487`](../js/MobileControls.js), [`ExtremeTuningPanel.js:116`](../js/ExtremeTuningPanel.js).
5. **Migrate consumers one file at a time.** For each constant moved, update all readers; commit per logical group so `git bisect` stays useful.
6. **No behavior change.** `sim-baseline` must remain byte-identical. Add to `tests/scene-obstacles.spec.js` or a new `tests/constants-contract.spec.js` a sanity check that re-imports each constant module and asserts the canonical values.

**Acceptance:** All migrated constants live in `js/constants/` or `shared/constants/`. No file-local duplicates remain. Sim-baseline byte-identical. 149/149 vitest pass plus any new constant-contract specs.

## Phase 3 — Extract `SwapCoordinator` from main.js (~6-8hr)

**Depends on:** Q2 resolution. Phase 1 + 2 land first (cleaner diff base).

[`js/main.js`](../js/main.js) is 3192 lines. Cycle 11 extracted `_buildSceneBody` and `disposeScene` already; `swapScene`, `rebuildScene`, `restartToMenu`, the `__sdsStressTestSwaps` harness, and the swap-event emission sequence all factor cleanly. Estimated 600-800 lines moved out.

1. **Read carefully.** Grep `swapScene\|rebuildScene\|restartToMenu\|disposeScene\|_buildSceneBody\|_sceneRebuilding\|scene-swap-` and map every reference site.
2. **Design the boundary.** `SwapCoordinator` should own: the scene-swap event lifecycle, `_sceneRebuilding` flag, `AbortController` recycling, MP guest hard-reload fallback decision. It should NOT own: `SceneManager` itself, GLB cache, atmosphere construction. Those stay where they are; `SwapCoordinator` *coordinates* their dispose+rebuild.
3. **Extract to [`js/SwapCoordinator.js`](../js/SwapCoordinator.js)** with constructor `(game)` taking the simulation instance. Public methods: `swapScene(toId, opts)`, `rebuildScene(sceneDef)`, `restartToMenu()`, `disposeScene()`. The `window.__sdsStressTestSwaps` harness moves with it.
4. **Update main.js** to instantiate `this.swapCoordinator = new SwapCoordinator(this)` and delegate. The 4 legacy callsites (ScenePicker, App.handleStartSandbox, ensureSceneMatchesRoom, App.handleMainMenu) keep using `game.swapScene(...)` via a thin facade method — no API change.
5. **Add unit tests** at [`tests/swap-coordinator.spec.js`](../tests/swap-coordinator.spec.js): event-emission ordering, `_sceneRebuilding` guard semantics, the dispose-order contract (this is the high-risk surface that `swap-drift-glb-guard` catches one slice of).

**Acceptance:** main.js shrinks by 600-800 lines. All Cycle 11 + 12 tests still pass. `__sdsStressTestSwaps(5)` reports drift unchanged from current baseline (geometries, textures, programs all within ±5%). New `swap-coordinator.spec.js` adds at least 8 specs.

**Hard stop:** any new GLB shared-material disposal regression — Cycle 11 + 12 already paid for that lesson; the [`tests/swap-drift-glb-guard.spec.js`](../tests/swap-drift-glb-guard.spec.js) contract must keep passing.

## Phase 4 — Test coverage on gameplay core (~6-8hr)

**Depends on:** Q4 resolution. Independent of Phases 1-3 but easier after Phase 2 (constants are centralized → tests don't pin magic numbers).

Per the Cycle 13 audit: [`GameState.js`](../js/GameState.js) (1269 lines), [`Sheepdog.js`](../js/Sheepdog.js) (1297 lines), [`OptimizedSheep.js`](../js/OptimizedSheep.js) (2107 lines), [`NetworkManager.js`](../js/NetworkManager.js) (621 lines), worker [`RoomDO.ts`](../worker/src/RoomDO.ts) (620 lines), [`LobbyDO.ts`](../worker/src/LobbyDO.ts) all have effectively zero unit-test coverage. Sim-baseline catches deterministic frame drift but won't catch e.g. a regression in `GameState.submitScoreToLeaderboard` payload shape, or a new bug in `RoomDO` storage hydration.

Don't try to hit a coverage number. Pick the highest-risk surfaces and pin them.

1. **[`tests/game-state.spec.js`](../tests/game-state.spec.js).** Mode-switch state transitions; score-submission payload shape (mode, sheepCount, sceneId, clientStartedAt, clientFinishedAt all present); retirement counter increments; competitive vs cooperative scoring branches.
2. **[`tests/sheepdog.spec.js`](../tests/sheepdog.spec.js).** Stamina state machine: `canStartSprint(stamina)` vs `canContinueSprint(stamina)` (Cycle 7 carry-forward — these are split for a reason). Heightfield-Y-lift integration. Boundary clamp under island scenes.
3. **[`tests/network-manager.spec.js`](../tests/network-manager.spec.js).** WS reconnect loop semantics. MessagePack codec round-trip. `createRoom` payload includes `sheepCount`. `roomSettings` propagation.
4. **[`tests/worker-room-do.spec.ts`](../tests/worker-room-do.spec.ts).** `RoomMeta.sheepCount` allow-list validation (`{200, 250, 500, 1000}`, reject 999, reject 1001). Storage hydration with missing `sceneId`/`sheepCount` falls back to defaults. `STALE_MS` threshold semantics.
5. **[`tests/player-identity.spec.js`](../tests/player-identity.spec.js).** localStorage corruption recovery (parse error → regenerate). ID collision handling. Quota-exceeded silent failure (currently the try/catch swallows; this test pins the contract that we *want* it to swallow vs. surface an error).

**Acceptance:** Each new spec file has ≥ 6 cases. Total vitest count climbs from 149 → ≥ 180. No false-positive flakes — run the suite 5× locally before commit.

## Phase 5 — WebGPU spike (research only, ~6-10hr)

**Depends on:** Q3 resolution. Independent of all other phases.

The Cycle 4 "decided against WebGPU" call is stale. Three.js r171 (Oct 2025) marked WebGPURenderer production-ready with auto-WebGL2 fallback. Safari 26 (Sept 2025) shipped WebGPU on macOS Tahoe / iOS / iPadOS. Browser coverage now ~95%. Reported 2-10× perf gains on draw-call-heavy scenes — directly relevant since chaos mode (5000 sheep) is currently the perf ceiling.

This phase produces a **research doc + a throwaway branch**, not shipped code. Goal: answer "does Cycle 15-16 want to be the migration?"

1. **Survey.** Read the migration guides:
   - https://www.utsubo.com/blog/webgpu-threejs-migration-guide
   - https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/
   - https://github.com/mrdoob/three.js/wiki/Migration-Guide
   - Three.js gpgpu birds example + https://github.com/jtsorlinis/BoidsWebGPU + https://webgpu.github.io/webgpu-samples/?sample=computeBoids
2. **Throwaway branch.** Create `spike/webgpu-oc-chaos`. Don't commit to main. Ports needed:
   - Three.js renderer: `import * as THREE from 'three/webgpu'`, `await renderer.init()`.
   - Custom shaders → TSL. The sheep + grass + sky + cloud + terrain shaders are the long pole. Start with sheep (we just touched it; we know the shape).
   - `EffectComposer` (if any) → `RenderPipeline`.
   - GLB load path (Three.js `GLTFLoader` works, but mesh material conversion may need touch).
3. **Measure.** Same hardware target (RTX 3070 desktop). Frametime budget on Open Country chaos with 5000 sheep, P50 + P95. Compare to current WebGL2 baseline from `tests/e2e/oc-perf.spec.ts`.
4. **Bonus measurement.** GPU-driven flocking via TSL `instancedArray` — replace the current CPU boid tick with two compute passes (velocity + position). This is where the 5-10× ceiling lift would come from. If Step 3 shows even a 2× draw-call win, the compute-flocking story compounds it.
5. **Write [`docs/webgpu-spike-2026-05.md`](webgpu-spike-2026-05.md):**
   - Frametime numbers WebGL2 vs WebGPU (P50, P95).
   - Frametime numbers with vs without GPU flocking.
   - Migration cost estimate (cycles).
   - Top 3 risks (Safari fallback parity, custom shader port complexity, EffectComposer cost).
   - Recommendation: greenlight Cycle 15-16 migration / defer / dead-end.

**Acceptance:** Research doc shipped. Spike branch deletable. Decision in NEXT_SESSION on whether Cycle 15 picks up the migration.

## Phase 6 — Polish (optional, ~1-2hr)

Skip if any of Phases 1-5 ran long. These don't move the cycle's needle — they're scoping bait.

1. **PNG → WebP** for the four hero/background images > 1 MB in `assets/images/`. Save 3-4 MB on disk. Manual `npx sharp ...` one-off; commit the WebPs and update the references.
2. **Dog thumbnails to WebP** — 5 PNGs at 1.6 MB total. Re-render via `npm run cinema -- --kind=dog --headed` (already produces WebP + PNG fallback per [`run.mjs`](../tools/cinematic/run.mjs)). Update DogSelection if needed.
3. **Bump GitHub Actions Node 20 deprecation.** `actions/checkout@v4`, `actions/setup-node@v4`, `cloudflare/wrangler-action@v3` get forced to Node 24 by 2026-06-02. Mechanical version bump.

## Dependencies

```
Phase 1 (bundle slim)          — independent; do first (cleanest diff base)
Phase 2 (constants)            — depends on Q1; do after Phase 1
Phase 3 (SwapCoordinator)      — depends on Q2 + Phases 1+2 landed
Phase 4 (core test coverage)   — depends on Q4; can parallel Phase 3
Phase 5 (WebGPU spike)         — depends on Q3; fully independent, throwaway branch
Phase 6 (polish)               — optional, last
```

Phases 1, 5 are fully parallelizable from cycle start. Phases 3 + 4 can run in parallel after Phases 1 + 2 land.

## Frozen files (cycle-specific additions)

- [`tests/sim-baseline/`](../tests/sim-baseline/) — baseline fixtures; never regenerate during this cycle. The whole point of Phases 1-3 is no behavior change; if `sim-baseline` fails, *that's the bug*, don't paper over it by re-baking.
- [`shared/MovementPhysics.js`](../shared/MovementPhysics.js) — the `updateMovement` obstacle-composition contract was deliberately set Cycle 6. Don't refactor as part of any test-coverage backfill.

## Hard stops

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure — escalate, don't regenerate. Phases 1-3 must be behavior-preserving.
3. Bundle size *increases* in Phase 1 — that means the named-import refactor missed something; investigate, don't ship.
4. `__sdsStressTestSwaps(5)` reports >5% texture/geometry/program drift after Phase 3 — the SwapCoordinator extraction broke the disposal contract. Revert and redo.
5. Phase 5 spike accidentally shipping to main — keep it on `spike/webgpu-oc-chaos`. The research doc is the deliverable.

## What NOT to do during this cycle

- **Don't migrate to WebGPU** — Phase 5 is a spike, not a migration. The decision lives in NEXT_SESSION after the research doc lands.
- **Don't introduce a new scene** — three is the right number per project rules.
- **Don't split main.js into 5 files in one PR** — Phase 3 extracts ONE responsibility (SwapCoordinator). The remaining responsibilities wait for Cycle 15+.
- **Don't add coverage for the sake of coverage.** Phase 4 picks the highest-risk surfaces. If a module is well-served by sim-baseline + integration tests, leave it.
- **Don't re-trigger the cinema runner** without `--shot=<id>` — committed OG/dog/PWA assets re-render with sub-pixel-different WebP encoding and create diff noise.
- **Don't tag `v1.2.0`** — this cycle is structural; player-visible changes don't warrant a tag bump. `v1.1.0` from Cycle 13 is the active release.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] Phase 1 — Main bundle ≤ 600 KB. Production build clean. No visual regression.
- [ ] Phase 2 — All migrated constants live in `js/constants/` or `shared/constants/`. No file-local duplicates. Sim-baseline byte-identical.
- [ ] Phase 3 — main.js shrinks ≥ 600 lines via `SwapCoordinator` extraction. `__sdsStressTestSwaps(5)` drift unchanged.
- [ ] Phase 4 — vitest count ≥ 180. New specs cover GameState, Sheepdog, NetworkManager, RoomDO, playerIdentity.
- [ ] Phase 5 — Research doc shipped at [`docs/webgpu-spike-2026-05.md`](webgpu-spike-2026-05.md) with frametime numbers + go/no-go recommendation.
- [ ] Phase 6 — (Optional) — picked items shipped or explicitly deferred to BACKLOG.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] Live on sheepdogsim.com via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/cycle-13-plan.md`](cycle-13-plan.md) — prior cycle plan
- [`docs/archive/cycles/`](archive/cycles/) — past cycle plans
- [Three.js WebGPU migration guide](https://www.utsubo.com/blog/webgpu-threejs-migration-guide) — Phase 5 starting point
- [TSL field guide (Maxime Heckel)](https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/) — Phase 5 shader-port reference
- [BoidsWebGPU](https://github.com/jtsorlinis/BoidsWebGPU) + [WebGPU computeBoids](https://webgpu.github.io/webgpu-samples/?sample=computeBoids) — Phase 5 GPU-flocking reference
