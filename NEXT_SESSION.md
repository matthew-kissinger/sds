# Next Session - Cycle 105 (`three-r185-and-asset-pipeline`)

> **Updated:** 2026-06-25
> **For:** Cycle 105
> **Pickup priority:** Start larger Cycle 2 in [`docs/cycle-105-plan.md`](docs/cycle-105-plan.md): create the SDS Kiln palette/pack direction, inspect the current fence GLB, and define fence rebake budgets before any live asset replacement.

## Goal

Cycle 105 is the kickoff for the larger SDS r185 + Kiln Asset Renewal program. The program goal is to move SDS onto the current Three.js release and rebuild the non-core asset set around a coherent SDS Kiln palette, measured runtime budgets, and Matt-approved PC visual/playtest gates while keeping sheep and dog stable. Cycle 1 has the r185 dependency/render foundation locally implemented; the next chip-away target is Cycle 2, the SDS Kiln palette and fence kit.

## Streamlined Cycle Map

- **Cycle 1 - r185 Render Foundation:** finish and merge the Three.js r185 dependency/render migration as an attributable change, with local research evidence and no live art replacement mixed in.
- **Cycle 2 - SDS Kiln Palette + Fence Kit:** create the SDS Kiln palette/pack direction, inspect the current fence GLB, define fence budgets, bake staged fence candidates, and integrate only after Matt visual approval.
- **Cycle 3 - Runtime Asset Cost Audit:** measure current non-core assets before rebaking them, including fence, trees, grass, rocks, farmhouse, scatter props, and other repeated or player-visible assets.
- **Cycle 4 - Trees, Source Quality, and Impostor Decision:** evaluate Kiln, EZ-Tree, compatible free stylized sources, and `dedekpo/stylized-scene` inspiration before changing the impostor pipeline.
- **Cycle 5 - Grass and Ground Readability:** measure grass draw-call/perf cost and decide whether it stays, gets tuned, or gets replaced under the SDS palette direction.
- **Cycle 6 - Broader SDS Asset Pack:** refresh remaining accepted environment assets in small, reviewable batches after fence and tree workflow decisions prove out.
- **Cycle 7 - Merge Readiness and Mainline Shepherding:** keep commits separable and close each larger cycle with a clear ship, reject, or defer decision.

## Detailed Phase Mapping

- **Phase 1 - r185 release and migration audit (autonomous):** local evidence exists at `cycle105-validation/r185-release-audit.md`; this belongs to larger Cycle 1.
- **Phase 2 - r185 dependency bump and render gates (autonomous):** local branch resolves `three@0.185.0`; render patches and verification evidence are recorded in `cycle105-validation/r185-release-audit.md`; this belongs to larger Cycle 1.
- **Phase 3 - r185 examples adoption memo (autonomous):** local evidence exists at `cycle105-validation/three-r185-example-notes.md`; this supports larger Cycles 1, 4, and 5.
- **Phase 4 - Kiln fence rebake specification (autonomous):** document the current fence GLB cost, define replacement budgets, and specify the first SDS Kiln palette/pack before live asset churn; this starts larger Cycle 2.
- **Phase 5 - Fence candidate bake and staging (autonomous):** produce and inspect Kiln candidates under validation paths only; this continues larger Cycle 2.
- **Phase 6 - Fence visual approval and integration (paired):** accept or reject the best candidate with Matt before any runtime replacement; this closes the first larger Cycle 2 replacement path.
- **Phase 7 - Tree source and impostor decision (paired):** compare better source trees from Kiln/EZ-Tree/free compatible sources/external inspiration, then decide whether current octahedral/KTX2 baking is enough or a future custom baker is justified; this starts larger Cycle 4 after the render foundation is stable.

## Parked Scope

- Golden-determinism follow-cell work remains parked.
- NSL launch-prep, NSL-as-default, version bump, itch/devlog/social, and S24+ launch pass remain parked.
- Dog and sheep replacement is parked; those assets stay for this cycle.
- Wolf replacement is not first priority, but can be evaluated later if evidence says it is a real quality/perf issue.
- Pixel Forge edits and a custom impostor baker are not implementation scope unless Phase 7 records a proven blocker and a later plan authorizes them.

## Durable Rules

Read [`AGENTS.md`](AGENTS.md), [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md), and [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) before modifying code or assets. This cycle does not authorize `shared/` edits or sim-baseline regeneration.

## Current Local State

The upstream Three.js research clone is local at `examples/three-r185/` and is research-only. It must not be imported by SDS runtime code. The copy-paste goal scratchpad `three-r185-asset-goals.txt` is local user-facing scratch content, not cycle scope.

Current local validation artifacts:

- `cycle105-validation/r185-release-audit.md`
- `cycle105-validation/three-r185-example-notes.md`

## Matt Alignment - 2026-06-25

- Use the recommended evidence/clone hygiene: track the two small Cycle 105 markdown evidence files, keep the local `examples/three-r185/` clone out of git.
- Accept the local r185 dependency/render patch as branch-ready; full e2e/CI still gates merge.
- Use Kiln heavily for new SDS assets, including an SDS palette/pack via admin.
- First asset target is the fence kit. Broader asset refresh is allowed for everything except dog and sheep. Grass, trees, rocks, farmhouse, scatter, and other props are open to evaluation based on quality and perf.
- Trees need a real candidate pass. Compare Kiln-generated candidates, the existing EZ-Tree path, compatible free stylized assets, and external inspiration such as `dedekpo/stylized-scene`; decide from GLB metrics, screenshots, and playtest feel.
- Surface PC previews or in-game candidates to Matt for visual approval before replacing live assets.
- It is acceptable to keep moving on this branch, but keep commits separable enough that r185, specs, staged candidates, and live replacements remain reviewable.
