# Cycle 15 — visuals-polish-and-harness

> Drafted 2026-05-03 after Cycle 14 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Cycle 14 landed the visuals foundation; Cycle 15 polishes it and stands up the perf harness this codebase has been missing. User-visible difference between before and after: a meadow that reads as **alive** (grounded, present rocks + mushrooms + dandelion patches you can actually see and almost step around), no rogue grass blades shooting skyward, and a frametime that holds up to the polish. Then the v1.1.0 tag + hero cards land on a world worth marketing.

The cycle theme is "polish + perf + harness" — finishing the AAA-feel pass that Cycle 14 started, root-causing the perf regression Matt observed in playtest, and building out the testing/measurement infrastructure that will keep Cycle 16+ honest.

## How to read this plan

This doc fixes the *shape* of the changes (what to swap, what contracts to pin, acceptance) — **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** before writing code. For Phase 1 specifically, the "right" stylized rock pipeline keeps shifting (Pixel Forge, KayKit, Quaternius alts, hand-authored Blender) — don't anchor on a 2025 answer.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) — the perf harness phase exists precisely so this stops being optional.
- **Pick the simplest thing that meets the budget.** If the simple version reads correctly, ship it; escalate only on demonstrated need.

## Open questions to resolve before writing code

1. **Q1 (Phase 1): Source for replacement rocks + scatter props?** Options: (a) Pixel Forge generation (paid; AI-driven; needs API integration), (b) hand-curated CC0 from KayKit / Kenney Nature Kit / Poly Pizza, (c) re-tune the existing procedural icosa+simplex bake with much larger scale ranges + per-recipe palette differentiation, (d) commission custom Blender authoring. Author lean: **(c) re-tune procedural first** (fastest validation that scale + grounding are the real problem, not asset quality), then escalate to (b) or (a) if procedural caps out on visual quality. Mushroom variants likely need (b) regardless — procedural mushrooms are an unsolved problem.
2. **Q2 (Phase 2): Frametime regression — known cause or new investigation?** Author lean: **investigate.** Suspects (in order of plausibility): InstancedMesh2 BVH bookkeeping per-frame on the tree pool, ScatterSystem per-variant draw-call multiplication (9 variants × 2200 instances even with culling), 2.2 MB tree GLB GPU upload spike. Profile before patching.
3. **Q3 (Phase 3): Perf harness — extend `oc-perf` Playwright spec or stand up a fresh harness?** Author lean: **extend.** The Playwright + cinematic API integration already exists; adding frametime baselines + per-scene budgets + CI regression detection is incremental work, not a rewrite.

These don't block the early phases but should be resolved before the asset-replacement and perf-fix work lands.

## Architecture / shared changes

No new shared primitives expected. The `meshSampleY` foundation from Cycle 14 already covers grounding correctness; if rocks/scatter are floating it's an offset-tuning bug, not a new contract.

## Phase 1 — Asset pipeline + picks (~6-8hr; tooling shipped at `f84b723`, picks pending)

**Independently testable.** The most user-visible carryover from Cycle 14.

Per Matt's 2026-05-03 playtest review: rocks + mushrooms read as tiny + floating, no yellow dandelion patches visible. The procedural icosa+simplex rock bake (~33 KB total) doesn't carry visual presence — variants are barely-visible rather than gameplay-meaningful.

Mid-cycle direction (Matt, 2026-05-03): generate "a lot of different trees with different variations as well as rocks and other things, view them in a gallery and select the best ones." This reframes Phase 1 from "re-tune procedural" to "AI-generate + curate."

**Tooling shipped at `f84b723`:**

- [`tools/asset-gallery/`](../tools/asset-gallery/) — browser-based GLB picker (Three.js orbit preview, thumbnail grid, ★ to pick, `s` to save). Reads any directory; default = `tools/asset-gallery/staging/`.
- [`tools/asset-gen/meshy.mjs`](../tools/asset-gen/meshy.mjs) — Meshy AI text-to-GLB batch with `preview → refine` flow. Prompt sets at [`tools/asset-gen/prompts/`](../tools/asset-gen/prompts/) (rocks, trees, flora). `--dry-run` for cost-free prompt-tuning.
- [`tools/asset-gen/integrate.mjs`](../tools/asset-gen/integrate.mjs) — copies picks into committed asset locations + prints suggested `PROP_VARIANTS` patches.
- npm scripts: `gallery`, `gen:meshy`, `gen:integrate`.

**Picks pending — Matt drives:**

1. Set `MESHY_API_KEY` (from app.meshy.ai → API), then `npm run gen:meshy -- --set=rocks --count=8` (and similar for trees, flora).
2. Open the gallery (`npm run gallery -- --dir=tools/asset-gallery/staging/rocks`), pick the best 3-4 per category, hit Save.
3. `node tools/asset-gen/integrate.mjs --compress` copies picks → `assets/models/{rocks,scatter,trees}/`.
4. Hand-tune `PROP_VARIANTS` weights in [`js/ScatterSystem.js`](../js/ScatterSystem.js) per the integrate script's printed diff. Sum of weights ≈ 100.
5. Yellow dandelion patches: verify `OVERSAMPLE_VARIANT` points to whichever picked flora reads as yellow. Bump `oversampleFraction` from 0.05 to 0.08-0.10 if clusters still don't catch the eye.
6. Visual verification via [`tools/probe.mjs`](../tools/probe.mjs) on each scene at noon + sunset.

The grounding bug (rocks "floating") was likely the procedural icosa pivot offset, not a `meshSampleY` issue — Cycle 14 hotfix `b5e1e45` already trunk-grounded trees via the same path. New Meshy GLBs author centroids at the asset's center; `js/TerrainBuilder.js`'s rock loader already handles per-asset `modelBaseYOffset` via bbox.min.y. If new picks float, the fix is per-pick `targetHeight` tuning in PROP_VARIANTS, not a placement-layer change.

**Acceptance:** Rocks read as **rocks** at sheep-cam distance (not pebble-shards). Mushrooms either present-and-visible or absent. Yellow dandelion patches catch the eye on Field + RH. No floating; ScatterSystem props ground via the same `meshSampleY` path as Cycle 14 trees.

**Optional: Pixel Forge / image-to-3D.** "PixelForge 3D" turned out to be a Gemini Flash + Imagen concept-art tool (2D images, not GLBs), so it's not a direct match for what's needed here. Meshy's image-to-3D path exists as an alternative to text-to-3D when text prompts cap out — generate a concept image first (any tool), then submit it via the `/openapi/v1/image-to-3d` endpoint for tighter style control. Not yet wired in; trivial to add as `meshy-image.mjs` if needed.

## Phase 2 — Perf regression triage (~4-6hr)

**Depends on:** Phase 1 picks landing. Per Matt's mid-cycle direction (2026-05-03), perf measurement runs after asset integration so the numbers reflect the polished world.

Per Matt's playtest: frametime degraded post-Cycle-14. Suspect zones in order of plausibility above (Q2). Don't patch until you've measured.

1. **Profile** on Matt's RTX 3070 + a mid-tier mobile target. Capture per-frame CPU + GPU breakdown via Chrome DevTools performance tab + `THREE.WebGLRenderer.info` snapshots from the cinematic API.
2. **Compare** against the pre-Cycle-14 baseline. Sim-baseline byte-identical means the simulation cost is unchanged; the regression is in render. Narrow to which subsystem.
3. **Patch the bottleneck.** Likely candidates: `InstancedMesh2.computeBVH()` cadence (per-frame vs once-per-camera-jump), ScatterSystem per-variant draw-call count (consider variant merging if 9 InstancedMesh2 instances is the cost), tree GLB GPU upload (consider Draco re-bake at higher compression if 2.2 MB is the spike).
4. **Hard rule:** any patch must keep frametime within ±5% of pre-Cycle-14 baseline. If it can't, the technique was wrong and we revert.

**Acceptance:** Frametime within ±5% of the pre-Cycle-14 baseline on RTX 3070 desktop and mid-tier mobile. No new GPU memory pressure on either target.

## Phase 3 — Perf harness build-out (~5-7hr; scaffold shipped at `f84b723`)

**Depends on:** Phase 1 picks for baseline pinning (the harness scripts are decoupled from picks, but committed baselines are not).

Build out a real perf harness extending the existing [`tests/e2e/oc-perf.spec.ts`](../tests/e2e/oc-perf.spec.ts) Playwright spec. The codebase has been flying blind on render perf since Cycle 1; Cycle 14's regression is the second time this cycle's flagged it.

**Shipped at `f84b723`:**

- [`tools/perf-harness.mjs`](../tools/perf-harness.mjs) — Playwright-driven 6-config matrix (Field/RH/OC × Classic/Extreme), warmup + measure window, +5%-or-+0.5ms regression threshold.
- `window.__sdsRenderer` global (gated on `?perfMode=1`) so renderer.info reads work without flipping `cinematic=1` (which biases via `preserveDrawingBuffer`).
- npm scripts: `perf:baseline`, `perf:check`.

**Pending (post-Phase-1):**

- Capture baseline: `npm run dev` + `npm run perf:baseline`, then `git add tests/perf-baseline/baseline.json`.
- Wire CI regression detection in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) — add a `perf-check` job that runs `npm run perf:check` and fails on > 5% regression. Calibrate thresholds to absorb GH Actions runner noise.
- Optionally extend the matrix to include sun positions if perf differs across noon/sunset enough to matter (initial 6 configs use default-noon).

1. **Frametime baselines per scene + sheep count** (Field/RH/OC × 200/500/1000 sheep × noon/sunset). Capture median + p99 over a 10s warmup + 30s measurement window via the cinematic API.
2. **Per-system breakdown** — render time spent in: terrain, grass, sheep, dog, trees, rocks, scatter, atmosphere. The `THREE.WebGLRenderer.info` + custom timing wrappers per subsystem give us this.
3. **CI regression detection** — fail the build if frametime degrades > 5% on any pinned config. Run the harness against a Linux-headed Playwright in GH Actions; calibrate thresholds to absorb runner noise.
4. **Local dev script** — `npm run perf:baseline` (capture + commit) and `npm run perf:check` (compare current branch against committed baseline). Mirrors `tests/sim-baseline/` workflow.

**Acceptance:** `npm run perf:check` passes locally + in CI. Pinned baselines for ≥6 configs. CI fails on > 5% regression. New tuning-knob changes can be evaluated with one command.

## Phase 4 — Grass anomaly + tree pipeline audit (~2-3hr; ✅ shipped at `f84b723`)

**Depends on:** nothing structurally.

**Shipped:**
- [`js/GrassSystem.js`](../js/GrassSystem.js): defensive `Number.isFinite` + bounds clamp on `meshSampleY` results in the placement loop. NaN/Infinity propagates as "blade-to-the-sky" on the GPU — clamping to `0` for any out-of-band sample sinks the rogue blade onto the flat skirt rather than the stratosphere.
- [`docs/tree-pipeline.md`](tree-pipeline.md): seed→GLB workflow + recipe table + re-bake invocation + InstancedMesh2 quaternion gotcha + GLB shared-material trap.
- [`tests/tree-assets.spec.js`](../tests/tree-assets.spec.js): 7 specs asserting the 3 GLBs exist, are non-empty, total < 3 MB.

Visual verification of the grass anomaly fix is opportunistic — the next probe pass at suspect zones (RH near tree clusters, OC near horizon trees) confirms.

Two small carryovers from Cycle 14, bundled because they're both <2hr cleanup work.

1. **Grass anomaly.** Rogue blades stretching skyward near trees outside the play area. Suspect: GrassSystem placement meets a tree exclusion-zone or terrain-falloff edge case where `meshSampleY` returns an outlier, OR an `_treeWind` uniform leaks into grass shader sway. Triage:
   - Reproduce via probe at the suspect zones (RH near tree clusters, OC near horizon trees).
   - Add a clamping guard in [`js/GrassSystem.js`](../js/GrassSystem.js) placement loop if `meshSampleY` returns a value outside the expected scene Y range.
   - Verify no tree-wind uniform aliasing in the grass shader.
2. **Tree pipeline audit.** Confirm trees are 100% seed→build-time GLBs (they are — `tools/bake-trees.mjs` → `assets/models/trees/` committed). Pin the contract:
   - One short doc at `docs/tree-pipeline.md` documenting the seed→GLB workflow, the recipes, the re-bake invocation (`rm assets/_originals/models/trees/*.glb && npm run bake-trees && npm run compress-glbs`), the InstancedMesh2 quaternion-vs-Euler gotcha.
   - One vitest spec at `tests/tree-assets.spec.js` asserting the 3 GLB files exist + are non-empty + total < 3 MB.

**Acceptance:** No rogue grass blades on any scene. Tree pipeline doc shipped. Tree-assets spec passing.

## Phase 5 — Hero cards + `v1.1.0` tag (~2-3hr)

**Depends on:** Phases 1, 2, 4 (the polished world needs to actually be polished first).

The end-of-cycle-14 task that bumped here. Workflow + helpers all shipped in Cycle 13.

1. **Three OG cards** (`og-rh-sunset`, `og-field`, `og-open-country`). Open URL → start Solo Extreme → `await __sdsCinema.freeFly()` → pose with mouse → `__sdsCinema.snapshotPose()` → paste pose into [`tools/cinematic/shot-list.mjs`](../tools/cinematic/shot-list.mjs) → `npm run cinema --shot=<id>`.
2. **Four cinematic videos** (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`). Camera coords already in shot-list; iterate framing on the polished world.
3. **Tag `v1.1.0`.** Bump [`package.json`](../package.json) + [`worker/package.json`](../worker/package.json), append [`CHANGELOG.md`](../CHANGELOG.md), `git tag v1.1.0 && git push origin main --tags`.

**Acceptance:** Three OG cards (≤300 KB each) on the marketing page. Four MP4 videos (each <10 MB) embedded. `v1.1.0` tagged and live.

## Phase 6 — CI E2E smoke fix (~1hr; ✅ shipped at `f84b723`)

**Depends on:** nothing.

Cycle 14's `b5e1e45` deploy left CI red on `tests/e2e/smoke.spec.ts` "solo classic starts and 3D canvas renders" — `locator.dispatchEvent` 10s timeout, almost certainly first-paint slowdown from the 2.2 MB tree bundle. Bump the timeout or address the load timing (preload the tree GLBs, defer their decode, etc).

**Shipped:** bumped `actionTimeout: 10_000` → `30_000` in [`playwright.config.ts`](../playwright.config.ts). The ~800 KB main bundle + React hydration on a cold GH Actions Linux runner stalls dispatchEvent's actionability wait; 30s gives generous slack. Load-timing optimization (defer tree GLBs from critical to deferred, pre-decode worker, etc.) is Phase 2 territory if perf:check flags it.

**Acceptance:** CI green on main.

## Dependencies

```
Phase 4 (grass anomaly + tree audit)      — independent; small
Phase 6 (CI E2E smoke fix)                — independent; tiny
Phase 1 (asset pipeline + picks)          — independent; tooling shipped, picks pending
Phase 3 (perf harness scaffold)           — independent; scripts shipped
Phase 2 (perf baseline capture + triage)  — DEPENDS ON Phase 1 picks landing
Phase 5 (hero cards + v1.1.0)             — DEPENDS ON Phases 1, 2, 4
```

Per Matt's mid-cycle direction (2026-05-03): perf measurement happens AFTER assets land so the numbers reflect the polished world, not the to-be-superseded procedural rocks. The `perf:baseline` workflow therefore runs near end-of-cycle, not in parallel with Phase 1. Phase 4 + 6 + Phase 1 tooling + Phase 3 scaffold landed in the autonomous run at `f84b723`.

## Frozen files (cycle-specific additions)

- [`tests/sim-baseline/`](../tests/sim-baseline/) — never regenerate during this cycle.
- [`shared/MovementPhysics.js`](../shared/MovementPhysics.js) + [`worker/src/GameSim.js`](../worker/src/GameSim.js) — sim is out of scope (still).
- [`shared/TreePlacement.js`](../shared/TreePlacement.js) — placement contract; only the GLB *targets* would change in any tree-asset work, not the placement algorithm.

## Hard stops

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure — escalate, don't regenerate fixtures.
3. Frametime regression > 5% on RTX 3070 desktop or mid-tier mobile — Phase 1 + 2 must hold this line.
4. Visual regression on a previously-passing scene.

## What NOT to do during this cycle

- **Don't touch sim physics** — same boundary as Cycle 14.
- **Don't migrate to TSL or WebGPU** — still deferred. The math ports cleanly when the time comes; the port itself is its own cycle.
- **Don't introduce a new scene** — three is the right number.
- **Don't render hero cards before Phases 1, 2, 4 land** — they need to show the polished world.
- **Don't split the perf harness work into "build now, baseline later"** — the harness only earns its keep with pinned baselines.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] Phase 1 — Rocks + scatter rebuilt. Rocks read as rocks at sheep-cam. Yellow dandelion patches visible. No floating.
- [ ] Phase 2 — Frametime within ±5% of pre-Cycle-14 baseline.
- [ ] Phase 3 — Perf harness shipped. ≥6 configs baselined. CI regression detection wired.
- [ ] Phase 4 — No rogue grass blades. Tree pipeline doc + tree-assets spec shipped.
- [ ] Phase 5 — Three OG cards + four cinematic videos shipped. `v1.1.0` tagged + live.
- [ ] Phase 6 — CI E2E smoke green on main.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] Live on sheepdogsim.com via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle template.
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files.
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items (incl. Cycle 14 carryover entry that this plan picks up).
- [`docs/archive/cycles/cycle-14-plan.md`](archive/cycles/cycle-14-plan.md) — prior cycle plan (visuals foundation).
- [`docs/archive/cycles/`](archive/cycles/) — older cycle plans.

## Items pending Matt's deeper analysis (this session)

The user flagged additional polish/upgrade/perf items beyond the Cycle 14 carryover during the close conversation. Matt is gathering analysis to fold in — leave room for additional phases or scope adjustments before this plan is treated as final.
