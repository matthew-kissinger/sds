# Cycle 45 - entry-load-and-grass-feel

> Drafted 2026-05-28, re-scoped from the `paired-parity-and-proofs` scaffold. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Make entering a scene feel deliberate and fast, and make grass deform like a body. Today the game boots straight into Rolling Hills behind the menu, scene picks auto-load with no clear gate, each scene load runs more procedural generation than it needs, and the grass press around the dog and sheep reads as a thin tip-only silhouette rather than a body-shaped dent. After this cycle, the player chooses a scene before the world builds (with the existing load overlay covering the first build), the single heaviest *measured* load cost is moved to a build-time bake, and the dog and sheep flatten grass into a clean oval dent that parts cleanly on both sides. The cycle is autonomous to implement; two phases carry a paired taste check at close (scene-entry feel, grass deform).

## How to read this plan

This doc fixes the *shape* of the changes (where new code slots in, acceptance criteria), not the implementation choices. Where it names a technique, treat it as a starting point for research, not the final answer. Each phase agent should measure on the actual target (RTX 3070 desktop, mid-tier mobile) before committing, and pick the simplest thing that meets the budget.

The honest-first ordering matters here: **Phase 1 measures before Phase 3 bakes.** We do not build a bake pipeline for a 30ms win. The heightfield is already baked; the runtime progen left is grass-chunk placement, tree Poisson scatter, rock formations, and tree-impostor baking on cache miss. Phase 1 tells us which of those is the real hog.

## Open questions to resolve before writing code

1. **Q1: Should scene and game-mode be chosen together at the pre-load gate, or scene first then mode (as today)?** Author lean: keep them separate. The pre-load gate selects the *scene* only; mode/dog selection stays where it is. Choosing both at once is a bigger UX rework and belongs in optional Phase 5, not the core fix.
2. **Q2: Is any baked placement sim-visible?** If tree or rock positions feed `shared/SceneObstacles.js` (sheep collision / boundary avoidance), then a placement manifest becomes the deterministic source of truth shared by Worker and client, and changing it requires sim-baseline regeneration with explicit acceptance. Author lean: Phase 1 confirms which placements are sim-visible; Phase 3 treats any sim-visible manifest as deterministic sim data (regen fixtures, record acceptance) and any render-only manifest as a free bake.
   - **RESOLVED (Phase 3, 2026-05-28): render-only.** The Worker has zero references to `generateTrees` / `buildSceneObstacles` / `.obstacles`; obstacles are built client-side only in `js/boot/initWorld.js`; the sim-baseline harness attaches no obstacles; and Field's trees all sit >=120m from origin while sheep are bounded to +/-100m, so they are physically unreachable by the sim. The Field tree-placement bake is therefore a free render-only bake. No `tests/sim-baseline/*.json` fixtures regenerated. This supersedes `cycle45-validation/load-baseline.md:45`, which had assumed trees feed `SceneObstacles` and would need regen. See `cycle45-validation/phase3-results.md`.

## Phase 1 - Load-time measurement (autonomous, ~2hr)

**Independently testable, gates Phase 3.** We cannot pick what to bake until we know where the time goes. The numbers floated in research were estimates; this phase replaces them with measurements on the RTX 3070 target.

1. **Extend the existing telemetry.** Add a per-stage breakdown to the `scene_swapped` event payload in [`js/main.js`](js/main.js) (currently emits `{ from, to, elapsedMs }` at the swap site). Stages: heightfield fetch+parse, terrain mesh build, grass init, tree placement, tree-impostor bake (and whether it was a cache hit), rock placement, water, flock.
2. **Instrument the load orchestrator.** Time each stage in [`js/boot/initWorld.js`](js/boot/initWorld.js) and thread the breakdown into the event.
3. **Dev-only summary.** Log the per-stage breakdown to console in dev so a human can read it without a telemetry backend.
4. **Capture a baseline.** Record measured load times for all three scenes (Home Field, Rolling Hills, Open Country) on the desktop target, cold and warm (impostor cache hit vs miss), into a validation artifact.

**Files touched:** `js/main.js` (telemetry payload), `js/boot/initWorld.js` (stage timing), a new `cycle45-validation/load-baseline.md`.

**Acceptance (EARS):**

- When a scene loads, then the `scene_swapped` event payload shall include a per-stage `stages` breakdown (grep `js/main.js` for `stages`).
- When a scene loads in dev, then the console shall log per-stage load milliseconds covering at least grass, trees, impostors, and rocks.
- When Phase 1 ships, then `cycle45-validation/load-baseline.md` shall record cold and warm load times for Home Field, Rolling Hills, and Open Country on the desktop target, naming the single heaviest stage.
- When Phase 1 ships, then `npm test` shall pass.

## Phase 2 - Scene-select-before-load gate (autonomous build, paired taste at close, ~3hr)

**Independent of Phases 1/3/4, can run in parallel.** Boot currently calls `loadScene(activeSceneId)` in [`js/main.js`](js/main.js) (~line 110) before the menu appears, defaulting to `DEFAULT_SCENE_ID` (Rolling Hills, [`shared/scenes/index.js:23`](shared/scenes/index.js)). The picker then appears over an already-built world, and picking a card auto-swaps. This phase flips that: the player chooses a scene, then the world builds.

1. **Defer the initial build.** Hold the first `loadScene` until the picker confirms a scene (respect `?scene=` deep links by treating them as a pre-confirmed choice and skipping the gate).
2. **Boot-sequence extraction.** The pre-load gate is a boot-sequence change, which the render rules permit. Do not touch the per-frame update loop or mode dispatch.
3. **Overlay covers first build.** Ensure the already-mounted `SceneSwapOverlay` ([`js/components/App.js:1148`](js/components/App.js)) is visible during the initial build, not only on later swaps.
4. **Guard test.** Add a spec asserting `loadScene` does not run until a scene is confirmed (and that a `?scene=` deep link still loads directly).

**Files touched:** `js/main.js` (boot gate), `js/components/App.js` and/or `js/components/StartScreen/ScenePicker.js` (gate UI + overlay coverage), a new spec under `tests/`.

**Acceptance (EARS):**

- When the game boots cold with no `?scene=` param, then the scene picker shall render before the scene world is built.
- When the game boots with a valid `?scene=` deep link, then that scene shall load directly without the picker gate.
- While the initial scene is building, the `SceneSwapOverlay` shall be visible.
- If no scene has been confirmed, then `loadScene` shall not have been invoked (asserted by a spec under `tests/`).
- When Phase 2 ships, then `npm test` shall pass.

**Paired close criterion:** Matt confirms the cold-boot entry feels deliberate (pick, then load) and the overlay reads correctly.

## Phase 3 - Bake the measured load hog (autonomous, ~3hr)

**Depends on Phase 1.** Move only the heaviest *measured* stage to build time. Do not bake everything on principle.

1. **Pick the target from Phase 1's baseline.** Most likely candidates: a placement manifest (grass chunks / trees / rocks baked to per-scene JSON), and/or guaranteeing Kiln impostor coverage so the runtime cross-billboard fallback never fires.
2. **New bake script.** Follow the `tools/bake-*.mjs` convention (`bake-rocks`, `bake-trees`, `bake-tree-impostors` already exist). A placement bake replays the seeded generator once at build time and writes deterministic positions.
3. **SceneDef wiring (fence-authorized, see Frozen files).** If a manifest needs a scene pointer, add an *optional* `placementManifest` field to [`shared/scenes/types.js`](shared/scenes/types.js) with a default. Scenes without it fall back to runtime progen unchanged.
4. **Determinism guard.** Per Q2: if the baked placement is sim-visible (feeds `shared/SceneObstacles.js`), the manifest becomes shared deterministic data; regenerate sim-baseline fixtures and record acceptance here. If render-only, no sim impact.

**Files touched:** new `tools/bake-placement.mjs` (or impostor-coverage equivalent), `shared/scenes/types.js` (optional field, fence-authorized), the runtime loader in `js/world/` that consumes the manifest, baked artifacts under `public/` or `assets/`, possibly `tests/sim-baseline/*.json` (only if sim-visible).

**Acceptance (EARS):**

- When Phase 3 ships, then the targeted scene's `scene_swapped` elapsedMs shall measurably drop versus the Phase 1 baseline, recorded in `cycle45-validation/`.
- When the bake runs, then its output script (`tools/bake-placement.mjs` or equivalent) shall exist and be wired into the build.
- If the baked placement is sim-visible, then the sim-baseline fixtures shall be regenerated with the decision recorded in this Acceptance section; otherwise they shall be untouched.
- When Phase 3 ships, then `npm run build` shall be clean and baked artifacts shall be committed.
- When Phase 3 ships, then `npm test` shall pass.

**Phase 3 results (2026-05-28, full writeup in [`../cycle45-validation/phase3-results.md`](../cycle45-validation/phase3-results.md)):**

- **Scope shipped:** both levers from Phase 1's scope decision - lazy-load the 4 unused dog rigs (the `models` stage, Phase 1's #1 hog) and bake Field's tree placement to `public/placement/field.json` (Field's `trees` stage, ~500ms).
- **trees stage:** 489ms cold / 532ms warm (Phase 1) -> **31ms** live post-bake. Isolated Node CPU: full +/-800 scatter 169.2ms -> parse+rock-reject 0.38ms (168.8ms removed from the main thread).
- **total field swap:** ~1904ms warm (Phase 1) -> **430ms** live, with `models`/`fenceModels` at 0ms (dog lazy-load + cache).
- **bake:** 1359-tree full scatter -> 371-tree manifest, treeline clamped to 430m (`maxRadius` 429.949, inside Matt's 380-450m band). Reproducibility guarded by `tests/placement-manifest.spec.js`.
- **Q2 -> render-only:** sim-baseline fixtures untouched (the "otherwise" branch above). Confirmed live: `GET /placement/field.json -> 200`, no fallback warning, no console errors.
- **bundle ratchet:** main 534 -> 536 KiB re-baseline (growth is the dog lazy-load's static wiring, not the bake's dynamic-imported loader); recorded in `DECISIONS.md`. **Flagged for Matt's review.**
- **Not captured:** visual treeline taste review (preview tab runs `visibilityState: hidden`, so WebGPU does not composite and screenshots time out). Treeline *radius* is geometrically proven; the *look* wants Matt's eyeball.

## Phase 4 - Grass body-deform tuning (autonomous build, paired taste at close, ~3hr)

**Independent, can run in parallel.** The interaction in [`js/world/konveyorGrassBladeNodeMaterial.js`](js/world/konveyorGrassBladeNodeMaterial.js) already uses an oriented oval footprint (dog 1.65m x 0.78m, sheep 0.72m x 0.56m, lines 66-97). The reported problem: the press reads as a tip-only silhouette ring rather than a body dent. Two suspected causes: (a) lateral splay is tip-weighted via `contactBendPower` (line 47/160), so only blade tips fan out while bases stay; (b) the push direction is radial-from-center (line 71), not the oval's surface normal, so on the long sides it bends off-axis.

1. **Carry bend down the blade.** Re-balance so the displacement lays the full blade over (base-to-tip), not only the tip band, while keeping the wind response intact.
2. **Oval-normal push.** Compute splay from the body-oval surface normal rather than pure radial-from-center, so both sides part cleanly along the body shape.
3. **Re-tune laydown + falloff band.** Make the central dent read as a pressed body, with the falloff band tight enough to look like a footprint, not a soft halo.
4. **Validate with the proof harness.** Use `window.__sdsGrassProof` ([`js/diagnostics/grassInteractionProofHarness.js`](js/diagnostics/grassInteractionProofHarness.js)) to pose the dog and a sheep at fixed positions; capture before/after screenshots via preview. Do NOT decompose GrassSystem (cohesion rule).

**Files touched:** `js/world/konveyorGrassBladeNodeMaterial.js` (interaction math + constants), possibly `js/world/konveyorGrassNodeMaterialFactories.js` (default constants), before/after screenshots under `cycle45-validation/grass/`.

**Acceptance (EARS):**

- When Phase 4 ships, then the splay direction shall be derived from the body-oval normal rather than pure radial-from-center (grep `js/world/konveyorGrassBladeNodeMaterial.js` for the new derivation marker).
- While an entity overlaps grass, the displacement shall lay the full blade over (base-to-tip), not only the tip band.
- When the proof harness runs at a fixed dog-and-sheep pose, then it shall produce a before/after screenshot pair under `cycle45-validation/grass/`.
- When Phase 4 ships, then `npm test` shall pass (grass material adapter specs green).

**Paired close criterion:** Matt confirms the dog and sheep press reads as a body-shaped dent that parts cleanly on both sides.

## Phase 5 - Polish (optional, ~2hr)

Nice-to-haves once Phases 1-4 land. Skip any that do not move the needle in playtest.

- Scene preview thumbnails in the picker so the pre-load choice is informed.
- A progress affordance on the load overlay (stage label or bar), now that Phase 1 exposes stage timings.
- Scene-plus-mode combined selection at the gate (revisits Q1).

## Dependencies

```
Phase 1 (measure) ----> Phase 3 (bake)
Phase 2 (entry gate)  [parallel, independent]
Phase 4 (grass feel)  [parallel, independent]
Phase 5 (polish)      [after 1, 2; optional]
```

Phase 3 is the only hard dependency: it must read Phase 1's baseline before choosing what to bake. Phases 2 and 4 can run any time, including in parallel with Phase 1.

## Frozen files (cycle-specific authorization)

- **[`shared/scenes/types.js`](shared/scenes/types.js)** - Phase 3 may add an *optional* `placementManifest` field with a default. This is the additive "cheap case" per [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). Migration story: scenes without the field fall back to runtime procedural placement, so no existing scene or consumer breaks; the field is read only by the new manifest loader. Authorized for Phase 3 only.
- **[`tests/sim-baseline/*.json`](../tests/sim-baseline/)** - Phase 3 only, and only if Q2 resolves to "placement is sim-visible." Regenerate with explicit acceptance recorded in Phase 3. If placement is render-only, these stay untouched. **RESOLVED: Q2 is render-only (see Open Questions), so these were not touched.**

No other fence files are authorized this cycle. The deterministic sim cores (`MovementPhysics`, `BoundaryCollision`, `FlockingAlgorithms`, etc.) are not touched.

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific additions:

1. If Phase 3 baking changes a sim-visible placement and the sim-baseline diff is not understood, abort the phase. Do not regenerate fixtures to make tests pass (see [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md)).
2. If Phase 2's pre-load gate increases cold-boot time-to-first-interaction versus the Phase 1 baseline, stop. The entry fix must not regress perceived load.
3. If Phase 4's grass tuning regresses grass frame time on the mid-tier target, stop and revert the shader change. Body-deform realism does not justify a framerate regression.

## What NOT to do during this cycle

- Do not decompose `GrassSystem.js` or `OptimizedSheep.js` (cohesion rule, [`DECISIONS.md`](../DECISIONS.md)). Phase 4 tunes the node material; it does not split the system.
- Do not pull in the paired C/D/E buckets (WebGPU painterly parity, mobile/real-device proofs, multiplayer playtest). Those are carried forward to [`BACKLOG.md`](BACKLOG.md) for a later paired cycle.
- Do not bake before measuring. Phase 1 gates Phase 3.
- Do not bump the version. v2.1.10 stands unless Matt calls a release.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When the game boots cold, the player shall pick a scene before the world builds (Phase 2, paired confirm).
- [ ] When Phase 3 closes, the targeted scene's measured load shall be lower than the Phase 1 baseline.
- [ ] When Phase 4 closes, the dog and sheep grass press shall read as a body-shaped dent per Matt's taste check.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - plan template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) - pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items
- [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - grass / heightfield / scene-load discipline
- [EARS notation](https://kiro.dev/docs/specs/) - testable acceptance lines
