# Next Session - Cycle 105 (`three-r185-and-asset-pipeline`)

> **Updated:** 2026-06-25
> **For:** Cycle 105
> **Pickup priority:** Move to Cycle 3 runtime asset cost audit, then Cycle 4 tree source/impostor decisions, after the approved Cycle 2 fence/gate commit lands.

## Goal

Cycle 105 is the kickoff for the larger SDS r185 + Kiln Asset Renewal program. The program goal is to move SDS onto the current Three.js release and rebuild the non-core asset set around a coherent SDS Kiln palette, measured runtime budgets, and Matt-approved PC visual/playtest gates while keeping sheep and dog stable. Cycle 1 has the r185 dependency/render foundation locally implemented. Cycle 2 now has a palette, locked local Kiln pack, fence spec, one rejected staged fence candidate, one approved fence-first candidate integrated as the live runtime fence asset, and one approved budgeted proper gate GLB integrated as the live runtime gate. Matt approved the fence read and the proper gate in the actual scene. After the Cycle 2 commit lands, move to measured runtime asset cost audit and tree source/impostor decisions.

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
- **Phase 4 - Kiln fence rebake specification (autonomous):** shipped; evidence exists at `cycle105-validation/fence-kiln-spec.md`; this started larger Cycle 2.
- **Phase 5 - Fence candidate bake and staging (autonomous):** shipped; evidence exists at `cycle105-validation/fence-candidate-report.md`; ignored candidate files live under `cycle105-validation/fence-candidates/`; the first candidate passed technical staging but failed visual review, and the second fence-first candidate passed technical staging.
- **Phase 6 - Fence visual approval and integration (paired):** approved. Candidate C is integrated locally and the actual-scene fence read is approved. A separate proper gate GLB, `assets/models/Gate_Assembly-v1.0.0.glb`, replaces the temporary side-post marker path; `js/FencePresets.js` loads that gate first and keeps the old marker only as fallback.
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
- `cycle105-validation/fence-kiln-spec.md`
- `cycle105-validation/fence-candidate-report.md`

Current local ignored candidate artifacts:

- `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a-joined.glb`
- `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a-views.png`
- `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-c-runtime.glb`
- `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-c-three-span-preview.glb`
- `cycle105-validation/fence-candidate-c-preview-gallery.png`
- `cycle105-validation/fence-actual-scene-field.png`
- `cycle105-validation/fence-actual-scene-field-gate-grounded.png`
- `cycle105-validation/fence-actual-scene-field-gate-kiln-budget.png`

Candidate A artifacts are rejected evidence. Candidate C runtime and preview artifacts are the accepted source evidence for the live fence replacement. The gate budget candidate is accepted as `assets/models/Gate_Assembly-v1.0.0.glb`.

## Matt Alignment - 2026-06-25

- Use the recommended evidence/clone hygiene: track the two small Cycle 105 markdown evidence files, keep the local `examples/three-r185/` clone out of git.
- Accept the local r185 dependency/render patch as branch-ready; full e2e/CI still gates merge.
- Use Kiln heavily for new SDS assets, including an SDS palette/pack via admin.
- First asset target is the fence kit. Broader asset refresh is allowed for everything except dog and sheep. Grass, trees, rocks, farmhouse, scatter, and other props are open to evaluation based on quality and perf.
- The first fence candidate is rejected because it reads as a post/gate prop, not a fence. The second fence-first candidate has an approved fence read, and the separate budgeted Kiln gate has actual-scene approval.
- Trees need a real candidate pass. Compare Kiln-generated candidates, the existing EZ-Tree path, compatible free stylized assets, and external inspiration such as `dedekpo/stylized-scene`; decide from GLB metrics, screenshots, and playtest feel.
- Surface PC previews or in-game candidates to Matt for visual approval before replacing live assets.
- It is acceptable to keep moving on this branch, but keep commits separable enough that r185, specs, staged candidates, and live replacements remain reviewable.
