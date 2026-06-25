# Cycle 105 - three-r185-and-asset-pipeline

> Drafted 2026-06-25 after the upstream Three.js r185 release unblocked the old Cycle 96 carryover. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Cycle 105 exists to turn the newly published Three.js r185 release and the SDS/Kiln asset-pipeline findings into controlled, attributable work. Before this cycle, the active pickup state still said r185 was blocked and mixed the next work with golden-determinism and launch-prep leftovers; after this cycle, SDS shall either ship a verified r185 dependency bump or record the blocker, and the fence/tree asset work shall have explicit Kiln-backed specifications, quality gates, and accept/defer decisions. This cycle does not absorb the old launch-prep or deterministic-golden scope; those remain parked until deliberately reactivated.

## How to read this plan

This doc fixes the shape of the changes: where evidence is recorded, which work is authorized, and which gates make the upgrade or asset replacement acceptable. It does not require a specific implementation until each phase reaches its acceptance checks.

Each agent picking up a phase should:

- Research current best practice for the specific sub-problem before writing code.
- Measure on the actual hardware target when the phase claims runtime or visual performance.
- Keep r185 dependency work separate from art rebakes so failures and visual changes stay attributable.

## Resolved scope decisions before writing code

1. **D1: Cycle 105 replaces the old golden-determinism-and-launch-prep stub.** The old stub was never authored, and r185 is no longer blocked. Golden determinism, NSL launch prep, and version bump work are deferred outside this cycle unless Matt explicitly reopens them.
2. **D2: r185 and asset rebakes can share the cycle but not a blended change.** The r185 dependency bump must be validated independently before any asset replacement lands.
3. **D3: Kiln dogfood is authorized for internal asset production.** Use Kiln, including admin palette/pack setup, for staged SDS candidate assets and palette work. Production deploys, public marketplace publication, and remote release operations still need a separate explicit OK.
4. **D4: Dog and sheep assets stay.** Do not spend this cycle replacing the dog or sheep. The wolf can be evaluated, but is not the first replacement target.
5. **D5: Everything else can be evaluated as an asset-quality/perf target.** Fence, trees, grass, rocks, farmhouse, scatter props, and other non-core-creature assets may be audited for quality and runtime cost. Do not assume grass is acceptable until draw calls and perf are measured.
6. **D6: A custom impostor pipeline is not first implementation scope.** This cycle may gather evidence and write a spec, but the first tree path is better source tree candidates rebaked through the current octahedral/KTX2 pipeline. Build a custom SDS/Kiln impostor baker only if recorded evidence proves the current baker blocks acceptable quality or workflow control.
7. **D7: Visual approval is paired.** Surface PC previews or in-game candidates to Matt when a candidate needs taste/playtest judgment; do not replace live visual assets without that approval.
8. **D8: Move fast on this branch, but keep attribution legible.** The r185 dependency work is accepted locally, but full e2e/CI should gate merge. Asset specs, candidate bakes, and accepted replacements can continue on this branch if that keeps momentum, but commits should keep dependency/render patches, specs, candidate staging, and live asset replacements separable.

## Streamlined larger-cycle goal map

Cycle 105 is the kickoff cycle inside the larger SDS r185 + Kiln Asset Renewal program. The detailed phases below remain the acceptance gates for this branch; use this goal map to decide what to chip away at next and what belongs in a later cycle.

### Cycle 1 - r185 Render Foundation

Goal: Finish the Three.js r185 dependency and render migration as its own reviewable change, with npm, test, build, e2e, and migration evidence recorded before live art replacement begins.

Goal: Keep the upstream Three.js clone as local research only, and reuse r185 example findings as design or authoring references without importing from `examples/three-r185` into SDS runtime code.

### Cycle 2 - SDS Kiln Palette + Fence Kit

Goal: Create the SDS Kiln palette and asset pack for stylized pastoral survival assets before generating production candidates, so fence, farmhouse, scatter, trees, rocks, and grass-adjacent assets share one art direction.

Goal: Rebuild the fence kit first in Kiln because the current fence has weak material and texture discipline for its small geometry payload.

Goal: Accept a fence candidate only after GLB inspection proves stable pivots, clear names, material reuse, low texture cost, simple collision proxy, small file size, and acceptable draw-call shape.

Goal: Accept the fence visually only if it reads as repeatable fence modules and connected fence spans, not as a standalone post, gate, signpost, or arch prop.

### Cycle 3 - Runtime Asset Cost Audit

Goal: Measure the current non-core runtime assets before rebaking them, including fence, trees, grass, rocks, farmhouse, scatter props, and any other repeated or player-visible assets.

Goal: Classify each audited asset as keep, rebuild in Kiln, source elsewhere, optimize in place, or defer, using GLB metrics, draw calls, screenshots, and playtest feel instead of taste alone.

Goal: Keep dog and sheep out of replacement scope, and evaluate wolf only after higher-priority environment assets have evidence.

### Cycle 4 - Trees, Source Quality, and Impostor Decision

Goal: Produce better tree source candidates from Kiln, the existing EZ-Tree path, compatible free stylized assets, and inspiration from `dedekpo/stylized-scene` before changing the runtime impostor pipeline.

Goal: Rebake accepted tree sources through the current octahedral KTX2 impostor pipeline first, then compare side-by-side visual proof against current trees.

Goal: Build a custom SDS/Kiln impostor pipeline only if recorded evidence proves the current Pixel Forge-based baker blocks acceptable tree quality or workflow control.

### Cycle 5 - Grass and Ground Readability

Goal: Audit current grass performance and draw-call cost before deciding whether it stays, gets tuned, or gets replaced.

Goal: Evaluate stylized grass and ground-material ideas against SDS readability, herd visibility, WebGPU performance, and the new SDS palette instead of copying another scene style directly.

### Cycle 6 - Broader SDS Asset Pack

Goal: Use the approved SDS palette and Kiln pack to refresh the remaining accepted environment assets in small, reviewable batches after the fence and tree decisions prove the workflow.

Goal: Integrate each accepted asset only after inspection, optimization, manifest or hash updates, SDS tests, build validation, browser proof, and Matt visual approval where taste or playtest feel matters.

### Cycle 7 - Merge Readiness and Mainline Shepherding

Goal: Keep the r185 upgrade, asset specifications, staged candidates, and live replacements separated enough that each commit can be reviewed, tested, reverted, or shepherded to main independently.

Goal: Close each larger cycle with a clear ship, reject, or defer decision so the effort keeps moving without mixing local research, Kiln candidate staging, and production asset changes.

## Architecture / shared changes

No `shared/` deterministic-sim edits are authorized by this cycle. The r185 work is a render dependency migration. The asset work uses GLB/glTF assets, Kiln authoring, and existing SDS asset integration points. Sim-baseline fixtures must stay byte-identical unless a future cycle explicitly authorizes a deterministic-sim change.

The local upstream Three.js clone lives at `examples/three-r185/` for research only. It is not a product dependency and should not be imported by SDS runtime code.

## Phase shape rules

A cycle has <= 8 phases. Each phase is either fully autonomous or fully paired, has a single sharp goal, and should fit in <= 4 hours.

## Acceptance criteria - EARS format

Every phase's Acceptance section uses EARS notation so the lines are testable by construction:

- When [trigger], the [system] shall [response].
- While [precondition], the [system] shall [response].
- If [unwanted], then the [system] shall [response].

## Phase 1 - r185 release and migration audit (~2hr, autonomous)

**Independently testable.** This phase turns the upstream release into SDS-specific evidence before any dependency bump.

1. Confirm the current npm `three` release, the current `@types/three` release, the SDS dependency versions, and the local upstream clone/tag.
2. Read the r184 to r185 migration guide and diff the r184..r185 examples relevant to SDS.
3. Scan SDS for r185-sensitive surfaces: TSL `positionLocal`, WebGPU clear/alpha behavior, `updateWorldMatrix` / `matrixWorldNeedsUpdate`, removed tiled lighting nodes, loader API deprecations, and compute-cull or terrain shader risk.
4. Write the findings under `cycle105-validation/` with explicit file lists and pass/fail/defer classifications.

**Acceptance (EARS):**

- When Phase 1 ships, then `cycle105-validation/r185-release-audit.md` shall record `three@0.185.0`, the current `@types/three` latest version, SDS's pre-upgrade dependency versions, and the `examples/three-r185` tag or commit inspected.
- When Phase 1 ships, then `cycle105-validation/r185-release-audit.md` shall list every SDS source file returned by the r185-sensitive scan and classify each as `patch`, `verify`, or `not affected`.
- If the latest npm `three` release is no longer r185, then Phase 1 shall stop and record the new release decision before any dependency bump.

## Phase 2 - r185 dependency bump and render gates (~4hr, autonomous)

**Depends on:** Phase 1.

1. Upgrade SDS from r184 to r185 in the package files.
2. Patch only the SDS render surfaces proven necessary by Phase 1.
3. Re-evaluate the existing shadow override material churn fix against r185 and record whether the fix remains necessary.
4. Run the repo's required dependency/build gates and the r185-specific render/perf gates that Phase 1 names.

**Acceptance (EARS):**

- When Phase 2 ships, then `package.json` and the lockfile shall resolve `three` to `0.185.0` and shall either resolve `@types/three` to an r185-compatible release or record why the current latest types release remains pinned.
- When Phase 2 ships, then `npm test` shall pass with sim-baseline fixture files byte-identical.
- When Phase 2 ships, then `npm run build` shall complete cleanly.
- When Phase 2 ships, then the r185 churn verdict shall be recorded in `cycle105-validation/r185-release-audit.md`.
- When Phase 2 ships with deliberate r185 bundle-size growth, then only `tests/refactor-baseline/__fixtures__/bundle-sizes.json` may be updated after the size verdict is recorded in `cycle105-validation/r185-release-audit.md`.
- If a sim-baseline fixture changes, then the r185 bump shall be reverted or stopped until a separate fence-authorized cycle exists.

## Phase 3 - r185 examples adoption memo (~2hr, autonomous)

**Depends on:** Phase 1. Can run before or after Phase 2.

**Status - shipped 2026-06-25 (autonomous).** Wrote `cycle105-validation/three-r185-example-notes.md`, classifying the new r185 tree/forest/terrain/city/building/clustered-lighting/meshopt/denoise examples as SDS runtime candidates, Kiln authoring references, reference-only, or deferred. Verified no SDS runtime source imports from `examples/three-r185/`.

1. Review the r185 examples and modules that intersect SDS/Kiln: tree/forest/terrain generators, city/building generators, clustered lighting, meshopt clusterizer/simplifier, and WebGPU denoise/reprojection examples.
2. Decide which ideas are candidates for SDS runtime, which are Kiln authoring references, and which are deferred.
3. Keep this as an adoption memo, not runtime code.

**Acceptance (EARS):**

- When Phase 3 ships, then `cycle105-validation/three-r185-example-notes.md` shall name each inspected upstream example or module path and classify it as `adopt`, `adapt in Kiln`, `reference only`, or `defer`.
- When Phase 3 ships, then no SDS runtime source file shall import from `examples/three-r185/`.

## Phase 4 - Kiln fence rebake specification (~3hr, autonomous)

**Depends on:** Phase 1. This phase authorizes the first asset dogfood target without replacing runtime art yet.

**Matt alignment 2026-06-25:** Build the replacement around a custom SDS palette/pack in Kiln. Default visual direction is a stylized pastoral/survival fence kit with better asset discipline than the current runtime GLB: stable pivots, names, material reuse, low texture cost, and simple collision proxies. The fence is the first target, but the same palette/pack can later support farmhouse, scatter, trees, rocks, and grass-adjacent assets.

1. Inspect the current fence GLB and record geometry, material, texture, file-size, pivot, naming, and collision requirements.
2. Draft a Kiln prompt/specification using an SDS pasture palette and game-asset constraints.
3. Define acceptance budgets for material count, texture count/resolution, GLB size, draw-call shape, pivots, naming, and collision proxies.
4. Identify the SDS files that would be touched only if a candidate is accepted later.

**Acceptance (EARS):**

- When Phase 4 ships, then `cycle105-validation/fence-kiln-spec.md` shall record the current `assets/models/Fence_Kit-v1.0.0.glb` metrics from `gltf-transform inspect`.
- When Phase 4 ships, then `cycle105-validation/fence-kiln-spec.md` shall define the target material, texture, file-size, naming, pivot, and collision-proxy budgets for the replacement candidate.
- When Phase 4 ships, then no committed runtime fence asset shall be replaced.

## Phase 5 - Fence candidate bake and staging (~4hr, autonomous)

**Depends on:** Phase 4.

**Status - shipped 2026-06-25 (autonomous).** Created local Kiln generation `sds-fence-kit-candidate-20260625-a` from the SDS palette/pack path, staged ignored candidate GLBs under `cycle105-validation/fence-candidates/`, normalized the runtime wrapper contract, reduced the final staged candidate to four canonical meshes, and wrote `cycle105-validation/fence-candidate-report.md`. No live runtime asset was replaced.

1. Use the local Kiln workflow to produce one or more fence candidates from the approved spec.
2. Optimize candidates with the existing GLB/glTF tooling.
3. Stage candidates under validation or asset-review paths, not as live runtime replacements.
4. Compare each candidate against the Phase 4 budgets.

**Acceptance (EARS):**

- When Phase 5 ships, then `cycle105-validation/fence-candidate-report.md` shall list each candidate GLB path, file size, material count, texture count, and pivot/collision status.
- When Phase 5 ships, then every staged candidate shall either meet the Phase 4 budgets or be explicitly rejected in the report.
- If a candidate misses the texture or material budget, then it shall not replace `assets/models/Fence_Kit-v1.0.0.glb`.

## Phase 6 - Fence visual approval and integration (~3hr, paired)

**Depends on:** Phase 5.

**Status - rejected 2026-06-25 (paired).** Matt rejected `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a-joined.glb` because it read like a post and gate rather than a fence. The live runtime asset remains unchanged. The next candidate pass must return to the SDS palette/pack with fence-first constraints: straight repeatable rail spans, support posts, corner/end pieces, and at least three connected spans in preview before another Phase 6 approval attempt.

1. Review the candidate fence in-game or in a representative preview with Matt.
2. If accepted, replace the live fence asset and update any manifests or loader assumptions required by the replacement.
3. If rejected, keep the report and defer without runtime asset churn.

**Acceptance (EARS):**

- When Phase 6 ships with an accepted candidate, then `assets/models/Fence_Kit-v1.0.0.glb` shall be replaced by the approved candidate and the candidate report shall name the accepted path.
- When Phase 6 ships with a rejected candidate, then the live runtime fence asset shall remain unchanged and `cycle105-validation/fence-candidate-report.md` shall record the rejection reason.
- When Phase 6 changes the live fence asset, then `npm test` and `npm run build` shall pass.

## Phase 7 - Tree source and impostor decision (~4hr, paired)

**Depends on:** Phase 3. Runs after the r185 bump is stable if Phase 2 changes runtime rendering.

**Matt alignment 2026-06-25:** Make new and better tree candidates, then evaluate source options before touching the impostor pipeline. Candidate sources include Kiln using the SDS palette, the existing EZ-Tree recipe flow, free/compatible stylized assets, and external inspiration such as `dedekpo/stylized-scene` for WebGPU/TSL stylized grass/tree/wind direction. The outcome should be evidence-based, not pre-decided.

1. Generate or select better source tree candidates using Kiln or the existing in-repo tree bake path.
2. Compare source GLB metrics, silhouettes, and in-game look before touching the impostor baker.
3. For accepted source candidates, rebake through the current octahedral/KTX2 impostor pipeline and capture side-by-side proof against the current tree assets.
4. Decide whether Pixel Forge remains sufficient, whether the 256px tile bug matters, or whether a future custom SDS/Kiln impostor baker needs a separate cycle.

**Acceptance (EARS):**

- When Phase 7 ships, then `cycle105-validation/tree-source-impostor-report.md` shall list each source tree candidate, its GLB metrics, and the decision to accept, reject, or defer.
- When Phase 7 rebakes impostors, then `npm test -- tests/imposter-sidecar.spec.js` shall pass.
- When Phase 7 closes, then `cycle105-validation/tree-source-impostor-report.md` shall state whether the current Pixel Forge-based baker remains in use or whether a future custom baker is justified by recorded evidence.

## Dependencies

Phase 1 gates all implementation. Phase 2 can ship independently after Phase 1. Phase 3 can run in parallel with Phase 2 after Phase 1. Phase 4 can start after Phase 1 and feeds Phase 5. Phase 6 is paired and depends on Phase 5. Phase 7 is paired and should wait until Phase 2 is stable if r185 changes rendering.

Text form:

```
Phase 1 -> Phase 2 + Phase 3 + Phase 4
Phase 4 -> Phase 5 -> Phase 6
Phase 3 + stable rendering -> Phase 7
```

## Frozen files (cycle-specific additions)

None beyond the bundle-size fixture exception recorded in Phase 2. The durable fence in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) remains enough.

No phase in this cycle authorizes edits to `shared/`, `tests/sim-baseline/__fixtures__/`, terrain/scatter refactor-baseline fixtures, `docs/BACKLOG.md`, `DECISIONS.md`, `.claude/commands/`, or `.claude/rules/`. Phase 2 authorizes only the measured `tests/refactor-baseline/__fixtures__/bundle-sizes.json` r185 budget update after the decision is recorded. If later evidence says another frozen file must change, stop and amend the plan with the fence migration story before editing.

## Hard stops

Durable hard stops apply on every cycle; see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific stops:

1. Any r185 sim-baseline fixture diff stops the dependency bump unless a future fence-authorized deterministic-sim cycle is opened.
2. Any r185 production-WebGPU boot failure stops the bump until the render blocker is isolated or the bump is reverted.
3. Any fence candidate that needs more materials or texture memory than the Phase 4 budget cannot replace the live fence asset.
4. Any tree-impostor change that degrades the approved current look without Matt's paired acceptance cannot replace live tree assets.
5. Any desire to edit Pixel Forge or build a custom impostor baker must be converted into a new scoped plan unless Phase 7 records a proven blocker.

## What NOT to do during this cycle

- Do not resume the old Cycle 105 golden-determinism or launch-prep stub inside this plan.
- Do not re-enable NSL in the entrance or make NSL the default world.
- Do not bump versions, write devlog/social copy, or deploy marketing-facing launch content.
- Do not edit `shared/` or regenerate sim-baseline goldens.
- Do not import runtime SDS code from `examples/three-r185/`.
- Do not edit Pixel Forge in this cycle.
- Do not replace live fence or tree assets before their candidate reports and acceptance gates exist.
- Do not combine the r185 dependency bump and asset replacement in one commit; keep attribution clean.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Do not pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When the cycle closes, the r185 status shall be one of: shipped on `three@0.185.0`, reverted with blocker evidence, or explicitly deferred with blocker evidence.
- [ ] When the cycle closes, the fence asset status shall be one of: accepted and integrated, rejected with candidate evidence, or deferred before integration.
- [ ] When the cycle closes, the tree/impostor status shall state whether source-tree improvement, current Pixel Forge baking, or a future custom impostor baker is the next justified path.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) - pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles and deferred items
- [`cycle96-validation/r185-readiness.md`](../cycle96-validation/r185-readiness.md) - historical r185 checklist from when r185 was blocked
- [`docs/tree-pipeline.md`](tree-pipeline.md) - current tree source and impostor bake flow
- [`tools/asset-gallery/README.md`](../tools/asset-gallery/README.md) - current source-asset gallery and integration flow
