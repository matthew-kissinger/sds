# Cycle 104 - impostor-and-nsl-burndown

> Drafted 2026-06-16, re-scoped from the `golden-determinism-and-launch-prep` stub after the intersession NSL takedown + impostor work. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/). Working notes that seeded this cycle: [`burndown-notes.md`](burndown-notes.md).

## Goal

Fix the far-tree impostor render path across the three live scenes and bound the Newsheepdogland regression so a launch cycle can follow. Today Home Field renders no far impostors at all (it is the lone non-consolidated scene, so every treeline tree draws as LOD0 per chunk, melting the draw count), the Rolling Hills / Open Country far impostors are lit by a hardcoded `brightness=6` magic that silently compensates a ~3.4x impostor-sun underlight, and NSL is switched off with no written diagnosis. After this cycle: Home Field gets far-tree impostors like the islands, the impostor relight is fed the same sun the LOD0 leaves get (the magic multiplier retired for a derived, documented constant), all three live scenes' distant trees are signed off on-device, NSL's regressions are enumerated with a re-enable bar, and the render-path harness gains an on-device runtime-confirmation layer so the next path divergence is caught on purpose. User-visible: Home Field's distant treeline reads correctly and stops thrashing draw calls; the islands' far trees keep their approved look on a principled footing.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots in, acceptance criteria), **not the implementation choices**. Where it suggests a technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the sub-problem before writing code.
- **Measure on the actual hardware target** (RTX 3070 desktop) before committing to a technique. The impostor look + the production-WebGPU boot gate are only provable on-device.
- **Pick the simplest thing that meets the bar.** If the simple version reads correctly, ship it; escalate only on demonstrated need.

**GPU contention note.** A separate concurrent effort owns the RTX 3070 for perf testing. The paired on-device phase (Phase 5) waits for that GPU to free up AND for Matt. The autonomous phases (1-4) need no GPU and can run while perf testing continues. Do not add perf/timing to any harness work this cycle - that lane belongs to the other effort; this cycle's harness stays categorical.

## Open questions to resolve before writing code

1. **Q1: Home Field far-impostor route - Option A or Option B?**
   - **Option A:** enable the existing per-chunk native impostor route for Home Field (the latlon kiln), which also requires loading LOD1 for non-consolidated production-WebGPU scenes and satisfying the `impostorGroupsOk` runtime assertions so the boot gate stays green ([`TreePlacement.js`](../js/world/TreePlacement.js) ~829, [`productionWebGpuBoot.js`](../js/rendering/productionWebGpuBoot.js):206).
   - **Option B:** extend the consolidated octahedral cull to flat scenes via a `SceneDef` opt-in flag, so Home Field gets the same far-impostor band the islands do and the per-chunk draw fan-out collapses directly.
   - **DECIDED (Matt, 2026-06-16): B.** The Cycle 101 durable lesson is that the consolidated cull is pure data-compaction and loading-agnostic - only the far-impostor *enable* was streaming-coupled. Home Field is all-cold (no `streamedZones`), so it would arm the band from the cold registry exactly like Rolling Hills and Open Country (`armAllColdFarImpostors`, gated on no-streamedZones + `hwTier !== 'low'`). That makes B an enable-hook add, not the forklift the burndown note feared, and it gives one impostor look across all scenes. **Confirm with a Phase 1 + Phase 2 spike before committing**, per the spike-risky-primitives rule; if the cull genuinely assumes island geometry, fall back to A.

2. **Q2: impostor sun-intensity fix - how to retire `brightness=6`?**
   - **DECIDED (Matt, 2026-06-16):** feed the impostor relight the same directional intensity the LOD0 leaf receives (the production bridge directional, ~1.1*PI), sourced from one place, then re-derive the residual brightness multiplier empirically (expect ~1.7) and keep only that as a single named constant with an inline derivation comment. No magic 6, no second source of truth for the sun.

3. **Q3: NSL burn-down scope this cycle - diagnose, or fix?**
   - **DECIDED (Matt, 2026-06-16): diagnose + bound only.** Phase 4 produces the findings doc + re-enable bar + the harness rows that prove or disprove each suspected regression. The actual NSL fixes scope as their own cycle (105+) once the regressions are enumerated. This keeps 104 inside the 8-phase / ~2-week envelope and avoids reopening the WebGPU-flagship perf fight mid-cycle.

## Architecture / shared changes

**Q1 = Option B (decided 2026-06-16).** Add one optional field to the `SceneDef` schema ([`shared/scenes/types.js`](../shared/scenes/types.js), frozen - authorized for Phase 2 only):

- `consolidatedTrees?: boolean` (top-level) - opt a non-island/coastline scene into the consolidated compute-cull + far-impostor band. Absent => current behavior (every existing scene byte-identical).

Migration story: additive optional field, the cheap fence case. `usesConsolidatedTreeCull(sceneDef)` broadens from `kind === 'coastline' || kind === 'island'` to also return true when `sceneDef.consolidatedTrees === true`. Home Field's def sets the flag. Consumers updated in the same phase: [`usesConsolidatedTreeCull`](../js/world/TreePlacement.js):592, the harness mirror + lock spec ([`scene-render-path-map.mjs`](../tools/validation/scene-render-path-map.mjs), [`scene-render-path-map.spec.js`](../tests/scene-render-path-map.spec.js)), and [`tree-cull-gate.spec.js`](../tests/tree-cull-gate.spec.js) (the `field` expectation flips false -> true; record the intentional flip in Phase 2 Acceptance). Gates on the structural flag, never a scene id (scene-and-render.md).

## Phase 1 - Harness runtime-confirmation layer (~3hr, autonomous)

**Status: DONE 2026-06-16.** `deriveRuntimeRow` (pure) + `runRuntimeLayer` (lazy-playwright, reuses the screenshot-golden.mjs launcher) added to [`scene-render-path-map.mjs`](../tools/validation/scene-render-path-map.mjs); 5 derivation unit tests in the lock spec (8/8 green); static path intact; no-timing grep returns 0. On-device run is Phase 5.

**Independently testable.** Builds the measurement tool the Home Field fix (Phase 2) is validated against, with no GPU dependency in its acceptance.

1. **Build the `--runtime` layer** of [`scene-render-path-map.mjs`](../tools/validation/scene-render-path-map.mjs): reuse the genuine-WebGPU launcher from [`screenshot-golden.mjs`](../tools/validation/screenshot-golden.mjs) (installed Chrome, headed, `assertWebGpuEngaged`), load each scene once, read **structural** facts only - impostor groups present y/n (from the `TreePlacement` summary / `builder.trees` group metadata) and the production-WebGPU boot-gate result. No timing, no frame rate, no draw-call cost.
2. **Unit-test the extraction logic** against a fixture page-object so the row shape is locked without the GPU. The on-device run itself is exercised in Phase 5.

**Acceptance (EARS):**

- When Phase 1 ships, then `node tools/validation/scene-render-path-map.mjs --runtime` shall load each scene and emit a per-scene structural row carrying impostor-groups-present and boot-gate-result, and shall read no frame-timing metric (`grep -i 'fps\|frameTime\|drawCall\|performance.now' tools/validation/scene-render-path-map.mjs` returns 0 in the runtime path).
- When the extraction logic runs against the committed fixture, then `npm test` shall pass a spec asserting the runtime row shape.
- While the perf effort holds the GPU, the autonomous acceptance above shall pass without launching a real browser.

## Phase 2 - Home Field far-impostor fix (~4hr, autonomous code; on-device verify is Phase 5)

**Depends on:** Phase 1 (uses the harness to confirm the row flips).

1. **Resolve Q1 with a spike.** Read the cull arm path; if Option B, confirm the all-cold registry arms Home Field's band. Pick A or B with the harness + a short written rationale in the cycle plan Acceptance.
2. **Implement the chosen route.** Option B: add the `SceneDef` flag (see Architecture), broaden `usesConsolidatedTreeCull`, set the flag on Home Field, update the harness mirror + lock spec + `tree-cull-gate.spec.js`. Option A: enable the per-chunk impostor route + LOD1 load for non-consolidated production-WebGPU scenes + satisfy `impostorGroupsOk`.
3. **Land behind local gates only. Do not push.** The default-prod render-path change for Home Field ships to prod only after Phase 5's on-device boot-gate + look sign-off.

**Acceptance (EARS):**

- When Phase 2 ships, then `node tools/validation/scene-render-path-map.mjs` shall print `field` with cull=Y and farImp=Y.
- When `usesConsolidatedTreeCull(field)` is called, then it shall return true, and `tests/tree-cull-gate.spec.js` + `tests/scene-render-path-map.spec.js` shall be updated to the intentional flip and pass (the `field` non-consolidated assertion is the recorded behavior change).
- While no other scene sets the new flag, the harness rows for rolling-hills / open-country / newsheepdogland shall be unchanged.
- If `npm run build` shows a `main-*.js` bundle over the recorded baseline, then the agent shall stop and surface (durable bundle stop).

## Phase 3 - Principled impostor-sun fix (~3hr, autonomous code; look sign-off is Phase 5)

**Depends on:** nothing (parallel with Phase 2 and Phase 4).

1. **Retire `brightness=6`** in [`webgpuKilnImpostorNodeMaterial.js`](../js/webgpuKilnImpostorNodeMaterial.js): feed the impostor relight the same directional intensity the LOD0 leaf receives (the production bridge directional, ~1.1*PI), sourced from one place via the shared [`foliageLightingRig.js`](../js/world/foliageLightingRig.js).
2. **Re-derive the residual multiplier empirically** (expect ~1.7) and keep only that as a single named constant with an inline derivation comment. Keep `__tuneImpostor` for the Phase 5 on-device pass.

**Acceptance (EARS):**

- When Phase 3 ships, then `grep -c 'uniform(6' js/webgpuKilnImpostorNodeMaterial.js` shall return 0.
- When the impostor relight runs, then its directional intensity shall be sourced from the same value the LOD0 leaf receives (one source of truth for the sun), with the residual multiplier a named constant carrying an inline derivation.
- When `npm test` runs, then `tests/foliage-lighting-rig-parity.spec.js` shall pass (LOD0 leaf look unchanged within 1e-9).

## Phase 4 - NSL regression diagnosis + re-enable bar (~3hr, autonomous, diagnosis only)

**Depends on:** nothing (parallel).

1. **Enumerate the NSL regressions** that caused the takedown: read the NSL render/survival paths, run the static harness against `newsheepdogland`, cross-reference the Cycle 92 / 95 NSL history. For each, write a root-cause hypothesis.
2. **Write the findings + re-enable bar** to `docs/nsl-burndown.md`: each regression, root cause, and an EARS re-enable criterion. No scene or survival code changes this cycle (Q3).

**Acceptance (EARS):**

- When Phase 4 ships, then `docs/nsl-burndown.md` shall list each known NSL regression with a root-cause hypothesis and an EARS re-enable bar.
- When the cycle closes, then `git diff` on the NSL scene + survival source (`shared/scenes/newsheepdogland*.js`, `js/gamestate/survivalRun.js`, the wolf/day-loop modules) shall be empty (diagnosis only).

## Phase 5 - On-device impostor validation + enable + ship (~3hr, paired, GPU-gated)

**Depends on:** Phases 1, 2, 3 landed. Waits for the perf effort to free the RTX 3070 AND for Matt.

1. **Run the harness runtime layer on-device.** Confirm Home Field boots `webgpu-production` (no `production-webgpu-gates-failed`) with far-tree impostors visible beyond the switch distance.
2. **SSIM A/B impostor-vs-LOD0** across a yaw sweep on field + rolling-hills + open-country; agree the bar (Cycle 99 latlon ~0.99 is the reference).
3. **Matt signs off the look** (Home Field's new impostors, Rolling Hills + Open Country after the sun fix). Then push the Home Field enable + the sun fix and confirm the deploy is green.

**Acceptance (EARS):**

- When Phase 5 runs on-device, then Home Field shall boot `webgpu-production` with far-tree impostors beyond the switch distance and no boot-gate failure.
- When the impostor-vs-LOD0 SSIM A/B runs on field / rolling-hills / open-country, then each shall meet the agreed bar.
- When Matt signs off the look, then the Home Field enable + sun fix shall be pushed and the `main` deploy shall go green.

## Dependencies

```
Phase 1 -> Phase 2 ----\
Phase 3 (parallel) ------> Phase 5 (paired, GPU-gated)
Phase 4 (parallel) -----/
```

Phases 2, 3, 4 are autonomous and GPU-free; 3 and 4 run in parallel with the 1->2 chain. Phase 5 is the single paired on-device gate that validates 1+2+3 and ships them. The `d1984b99` harness commit (already local on `main`) is the base for Phase 1.

## Frozen files (cycle-specific authorization)

- **[`shared/scenes/types.js`](../shared/scenes/types.js)** - authorized for **Phase 2 only** (Q1 = Option B, decided 2026-06-16). Change: add the optional `consolidatedTrees?: boolean` field (additive optional, the cheap fence case). Migration + consumer list in the Architecture section.

No other frozen files. `TreePlacement.js`, `webgpuKilnImpostorNodeMaterial.js`, and `foliageLightingRig.js` are normal render files (not on the fence).

## Hard stops

Durable stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)): bundle-size regression, frozen-file change without authorization, visual-golden regression, CI deploy red at close. Cycle-specific additions:

1. **If the Home Field consolidated-cull enable fails the production-WebGPU boot gate on-device (`production-webgpu-gates-failed`), then stop, do NOT push the enable, and surface** - fall back to Option A or revert the flag. This is the primary risk and the reason Phase 2 does not ship to prod before Phase 5.
2. **If the principled sun fix moves the Rolling Hills far-impostor look off the approved Cycle-103 baseline (SSIM A/B regresses vs the shipped `brightness=6` look), then stop and surface before pushing** - the shipped look is the approved baseline.
3. **If broadening `usesConsolidatedTreeCull` drifts the harness lock spec or `tree-cull-gate.spec.js` in a way the phase did not intend, then stop** - do not regenerate assertions to pass.

## What NOT to do during this cycle

- **Don't fix NSL's regressions** (Q3: diagnose + bound only; fixes are 105+).
- **Don't rewrite the public/SEO NSL prose.** The four-biomes / Survival framing is a deliberate hold in Matt's voice; the takedown is entrance-only.
- **Don't add perf, timing, or sustained-play metrics to the harness.** That lane is the concurrent perf effort's; this harness stays categorical so the two never contend for the GPU.
- **Don't auto-push the Home Field enable or the sun fix** before the Phase 5 on-device gate.
- **Don't bump the version or do launch prep.** That is Cycle 105 (`golden-determinism-and-launch-prep`, slid from the 104 stub).

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean and within the bundle baseline.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When the cycle closes, Home Field shall render far-tree impostors on the default production path (harness farImp=Y + on-device confirmation).
- [ ] When the cycle closes, the `brightness=6` magic shall be retired (impostor sun fed the leaf intensity; residual multiplier a documented derived constant).
- [ ] When the cycle closes, the far impostors on field / rolling-hills / open-country shall be signed off on-device.
- [ ] When the cycle closes, `docs/nsl-burndown.md` shall exist with each regression + an EARS re-enable bar.

## References

- [`docs/burndown-notes.md`](burndown-notes.md) - the working notes that seeded this cycle
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - plan template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items
- [EARS notation](https://kiro.dev/docs/specs/) - testable acceptance lines
