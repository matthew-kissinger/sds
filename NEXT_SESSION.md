# Next Session - Cycle 105 (`three-r185-and-asset-pipeline`)

> **Updated:** 2026-06-25
> **For:** Cycle 105
> **Pickup priority:** Review the current scene-fit packyard and accent previews from `sds-homestead-playfield-pack-v1`, then decide accept, tune placement/scale/density, or reject the remaining prop groups. The review sweep already covers every current scene where the pack plausibly fits: Home Field and NSL get farmyard props, while Rolling Hills and Open Country only get sparse natural accents such as rocks, flowers, and log/stump. `01-farmhouse-a` is approved and integrated locally as `assets/models/Farm house.glb`; all remaining pack props and landscape accents are still review-only. Continue the open `sds-hybrid-v1` grass accept/tune/reject review. The live `tree1`/`tree2` replacements are approved in Home Field; the third approved ash candidate remains reserve-only until a placement/species cycle authorizes it.

## Goal

Cycle 105 is the kickoff for the larger SDS r185 + Kiln Asset Renewal program. The program goal is to move SDS onto the current Three.js release and rebuild the non-core asset set around a coherent SDS Kiln palette, measured runtime budgets, and Matt-approved PC visual/playtest gates while keeping sheep and dog stable. Cycle 1 has the r185 dependency/render foundation locally implemented. Cycle 2 now has a palette, locked local Kiln pack, fence spec, one rejected staged fence candidate, one approved fence-first candidate integrated as the live runtime fence asset, and one approved budgeted proper gate GLB integrated as the live runtime gate. Matt approved the fence read and the proper gate in the actual scene. NSL now uses the accepted fence GLB kit and hierarchy-preserving authored gate GLB without the old overlapping procedural homestead gate; the authored left/right leaf pivots close back to `0` instead of rotating the whole asset. Cycle 3 has a measured runtime asset cost audit at `cycle105-validation/runtime-asset-cost-audit.md`. Cycle 4 has selected, rebaked, locally integrated, tested, and Home Field-approved two refreshed leafAtlas EZ-Tree replacements. Cycle 5 has a grass/ground redesign brief, cross-scene WebGPU foliage motion proof, a panning LOD contact sheet, and a measured opt-in `sds-hybrid-v1` grass candidate with cross-scene still and motion evidence. The grass candidate is not yet production-accepted because Matt still needs to review the cross-scene contact sheet / actual scene feel and record accept, tune, or compare-cleaned-current. Cycle 6 now has a completed Kiln pack run, `sds-homestead-playfield-pack-v1`, for homestead playfield assets using `sds-pastoral-survival-v1`; all 13 generations returned `ok`, candidates 10/11/12 have no-ground refined rebakes, `01-farmhouse-a` is approved and integrated locally as the live farmhouse asset, and the remaining prop/accent candidates have scene-fit diagnostic previews across Home Field, NSL, Rolling Hills, and Open Country.

## Streamlined Cycle Map

- **Cycle 1 - r185 Render Foundation:** finish and merge the Three.js r185 dependency/render migration as an attributable change, with local research evidence and no live art replacement mixed in.
- **Cycle 2 - SDS Kiln Palette + Fence Kit:** create the SDS Kiln palette/pack direction, inspect the current fence GLB, define fence budgets, bake staged fence candidates, and integrate only after Matt visual approval.
- **Cycle 3 - Runtime Asset Cost Audit:** measured current non-core assets before rebaking them, including fence, trees, grass, rocks, farmhouse, scatter props, and other repeated or player-visible assets.
- **Cycle 4 - Trees, Source Quality, and Impostor Decision:** aim to replace the current tree set, but only after refreshed Kiln/EZ-Tree/free-source candidates beat the current trees on GLB metrics, runtime cost, in-scene look, and impostor bake quality.
- **Cycle 5 - Grass and Ground Redesign:** redesign the grass/ground layer from first principles, comparing a cleaned-up current shader path against a simpler or hybrid SDS-specific path with measured draw calls, frame timing, camera-motion readability, dog/sheep response, herd visibility, and PC visual review.
- **Cycle 6 - Broader SDS Asset Pack:** refresh remaining accepted environment assets in small, reviewable batches after fence and tree workflow decisions prove out; `01-farmhouse-a` is the first approved live replacement from the pack, while prop/accent placement is still under review.
- **Cycle 7 - Merge Readiness and Mainline Shepherding:** keep commits separable and close each larger cycle with a clear ship, reject, or defer decision.

## Detailed Phase Mapping

- **Phase 1 - r185 release and migration audit (autonomous):** local evidence exists at `cycle105-validation/r185-release-audit.md`; this belongs to larger Cycle 1.
- **Phase 2 - r185 dependency bump and render gates (autonomous):** local branch resolves `three@0.185.0`; render patches and verification evidence are recorded in `cycle105-validation/r185-release-audit.md`; this belongs to larger Cycle 1.
- **Phase 3 - r185 examples adoption memo (autonomous):** local evidence exists at `cycle105-validation/three-r185-example-notes.md`; this supports larger Cycles 1, 4, and 5.
- **Phase 4 - Kiln fence rebake specification (autonomous):** shipped; evidence exists at `cycle105-validation/fence-kiln-spec.md`; this started larger Cycle 2.
- **Phase 5 - Fence candidate bake and staging (autonomous):** shipped; evidence exists at `cycle105-validation/fence-candidate-report.md`; ignored candidate files live under `cycle105-validation/fence-candidates/`; the first candidate passed technical staging but failed visual review, and the second fence-first candidate passed technical staging.
- **Phase 6 - Fence visual approval and integration (paired):** approved. Candidate C is integrated locally and the actual-scene fence read is approved. A separate proper gate GLB, `assets/models/Gate_Assembly-v1.0.0.glb`, replaces the temporary side-post marker path; `js/FencePresets.js` loads that gate first and keeps the old marker only as fallback.
- **Phase 7 - Tree source and impostor decision (paired):** approved. Browser-reviewed leafAtlas EZ-Tree candidates are accepted: `aspen_small_double_lowcanopy_green` is live `tree1`, `oak_medium_single` is live `tree2`, and `ash_small_double` is an approved reserve candidate. Current Kiln/Pixel Forge latlon and octahedral KTX2 bakes are sufficient for now. Matt approved the actual Home Field scene read, with follow-up notes for fast-pan/cross-scene LOD distribution and first-principles grass/ground redesign.
- **Cycle 5 - Grass and Ground Redesign:** open. The r185 coordinate-sync repair is done, but the grass redesign is not production-accepted. Matt likes `sds-hybrid-v1` visually. It is a measured opt-in candidate with sparse blades and a one-draw-call hybrid ground contact read. It cuts Rolling Hills grass-only estimated grass triangles from about 1.45M to 0.65M in follow-close and 1.70M to 0.69M in classic-max; live captures report 76 ground-contact instances for dog plus 75 sheep in one draw call. The Rolling Hills perf/wiring/build slice passes focused material tests, full `npm test`, production build, and diff-check. Cross-scene still proof now compares default versus `sds-hybrid-v1` across Home Field, Rolling Hills, Open Country, and NSL at follow-close and classic-max poses, with visible grass triangle estimates down about 51-58% and the hybrid contact overlay staying at one draw call. Cross-scene WebGPU dog-sprint motion proof passes in all four scenes with zero >50ms spikes. Remaining grass work is Matt PC review of `cycle105-validation/grass/hybrid-cross-scene-contact-sheet.png` and an explicit accept, tune, or compare-cleaned-current decision.

## Parked Scope

- Golden-determinism follow-cell work remains parked.
- NSL launch-prep, NSL-as-default, version bump, itch/devlog/social, and S24+ launch pass remain parked.
- Dog and sheep replacement is parked; those assets stay for this cycle.
- Wolf replacement is not first priority, but can be evaluated later if evidence says it is a real quality/perf issue.
- Pixel Forge edits and a custom impostor baker are not implementation scope unless Phase 7 records a proven blocker and a later plan authorizes them. Cycle 4 should not assume the old Pixel Forge path is the right long-term answer; it should compare it against Kiln-native production needs and actual impostor output quality.

## Durable Rules

Read [`AGENTS.md`](AGENTS.md), [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md), and [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) before modifying code or assets. This cycle does not authorize `shared/` edits or sim-baseline regeneration.

## Current Local State

The upstream Three.js research clone is local at `examples/three-r185/` and is research-only. It must not be imported by SDS runtime code. The copy-paste goal scratchpad `three-r185-asset-goals.txt` is local user-facing scratch content, not cycle scope.

Current local validation artifacts:

- `cycle105-validation/r185-release-audit.md`
- `cycle105-validation/three-r185-example-notes.md`
- `cycle105-validation/fence-kiln-spec.md`
- `cycle105-validation/fence-candidate-report.md`
- `cycle105-validation/runtime-asset-cost-audit.md`
- `cycle105-validation/tree-source-impostor-report.md`
- `cycle105-validation/grass-ground-redesign-brief.md`
- `cycle105-validation/foliage-fastpan-lod-report.md`
- `cycle105-validation/farmhouse-ground-batch-spec.md`
- `cycle105-validation/homestead-playfield-pack-report.md`
- `cycle105-validation/runtime-asset-audit-field.png`
- `cycle105-validation/foliage-fastpan/contact-sheet/lod-handoff-contact-sheet.png`
- `cycle105-validation/grass/hybrid-cross-scene-contact-sheet.png`
- `cycle105-validation/homestead-playfield-pack-v1/scene-review/contact-sheet.png`
- `cycle105-validation/homestead-playfield-pack-v1/scene-review/summary.json`

Current local ignored candidate artifacts:

- `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a-joined.glb`
- `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a-views.png`
- `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-c-runtime.glb`
- `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-c-three-span-preview.glb`
- `cycle105-validation/fence-candidate-c-preview-gallery.png`
- `cycle105-validation/fence-actual-scene-field.png`
- `cycle105-validation/fence-actual-scene-field-gate-grounded.png`
- `cycle105-validation/fence-actual-scene-field-gate-kiln-budget.png`
- `cycle105-validation/tree-source-survey/review-gallery.html`
- `cycle105-validation/tree-source-survey/tree-source-metrics.csv`
- `cycle105-validation/tree-source-survey/live-tree-refresh-metrics.json`
- `cycle105-validation/tree-source-survey/*-contact.png`
- `cycle105-validation/tree-source-survey/ez-leafAtlas-candidates/*.glb`
- `cycle105-validation/tree-actual-scene/field-classic-max.png`
- `cycle105-validation/tree-actual-scene/field-tree-occluded.png`
- `cycle105-validation/tree-actual-scene/manifest.json`
- `cycle105-validation/tree-actual-scene/review-summary.json`

Candidate A artifacts are rejected evidence. Candidate C runtime and preview artifacts are the accepted source evidence for the live fence replacement. The gate budget candidate is accepted as `assets/models/Gate_Assembly-v1.0.0.glb`.

One-off farmhouse candidate artifacts under `cycle105-validation/farmhouse-ground-candidates/` are rejected/reference-only. The active broader asset path is the locked and completed Kiln pack `sds-homestead-playfield-pack-v1`, documented in `cycle105-validation/homestead-playfield-pack-report.md`. `01-farmhouse-a` is approved and integrated locally as the live farmhouse asset; the remaining prop and accent candidates are still review-only.

Tree browser-gallery approval covers all three highlighted candidates. Only the first two are integrated in live runtime assets because Cycle 105 does not authorize `shared/` placement/species edits for a new `tree3` slot. Matt approved the Home Field actual-scene read for the live two-slot replacement.

## Matt Alignment - 2026-06-25

- Use the recommended evidence/clone hygiene: track the two small Cycle 105 markdown evidence files, keep the local `examples/three-r185/` clone out of git.
- Accept the local r185 dependency/render patch as branch-ready; full e2e/CI still gates merge.
- Use Kiln heavily for new SDS assets, including an SDS palette/pack via admin.
- First asset target is the fence kit. Broader asset refresh is allowed for everything except dog and sheep. Grass, trees, rocks, farmhouse, scatter, and other props are open to evaluation based on quality and perf.
- The first fence candidate is rejected because it reads as a post/gate prop, not a fence. The second fence-first candidate has an approved fence read, and the separate budgeted Kiln gate has actual-scene approval.
- Cycle 3 audit verdict: the accepted fence/gate GLBs are cheap, but the live fence assembly creates hundreds of mesh objects; optimize fence by batching or instancing runtime posts/rails before generating more fence art. Grass and trees are the largest runtime costs. Farmhouse is texture-heavy and a good SDS palette target. Rocks are performant and should be rebuilt only for art direction with collider parity. Old scatter props are not live; future flowers/accent props should be curated, low-density, instanced, and palette/atlas disciplined.
- Trees should be replaced if the evidence supports it. Compare Kiln-generated candidates, a refreshed/latest EZ-Tree path, compatible free stylized assets, and external inspiration such as `dedekpo/stylized-scene`; approve candidates only after GLB metrics, screenshots, runtime cost, impostor quality, and playtest feel beat or clearly improve on the current trees.
- Do not treat the old Pixel Forge bake path as automatically correct. Rebake accepted source candidates, inspect sidecar size and quality, and record whether the current path is sufficient for Kiln-era SDS assets or whether a separate SDS/Kiln impostor baker is justified.
- Surface PC previews or in-game candidates to Matt for visual approval before replacing live assets.
- It is acceptable to keep moving on this branch, but keep commits separable enough that r185, specs, staged candidates, and live replacements remain reviewable.
- Matt approved the three tree source candidates in the browser gallery and approved the live aspen/oak replacements in the actual Home Field scene. Keep the approved ash candidate for a later authorized tree-species/placement pass.
- Next foliage follow-up: fast panning can expose LOD/impostor distribution issues, and Home Field's distribution is not enough to generalize to Rolling Hills, Open Country, and NSL.
- Next foliage follow-up: `cycle105-validation/foliage-fastpan-lod-report.md` captured WebGPU motion proof and attributed the initial Rolling Hills/NSL spike reports to harness/cold-readiness artifacts rather than steady-state LOD cost. A panning contact sheet exists at `cycle105-validation/foliage-fastpan/contact-sheet/lod-handoff-contact-sheet.png`; Matt visual review or targeted density/handoff tuning remains.
- Next grass follow-up: `cycle105-validation/grass-ground-redesign-brief.md` captures the current grass contract, the r185 coordinate repair, and the first `sds-hybrid-v1` candidate. The coordinate repair only fixes sync; the redesign remains open. The `sds-hybrid-v1` Rolling Hills perf/wiring/build slice and cross-scene still/motion proof are validated; Matt PC review and the accept/tune/compare decision remain before production acceptance.
- Next broader asset follow-up: `cycle105-validation/farmhouse-ground-batch-spec.md` scopes Batch 1 to a farmhouse landmark candidate and curated homestead ground accents, and `cycle105-validation/homestead-playfield-pack-report.md` records the corrected Kiln Packs path plus the generated pack evidence. The pack is `sds-homestead-playfield-pack-v1`, tag `sds-homestead-playfield`, status `complete`, with 13 `ok` outputs. `01-farmhouse-a` is approved and integrated locally as `assets/models/Farm house.glb`. Candidates 03-13 now have scene-fit diagnostic proof: Home Field and NSL use packyard props; Rolling Hills and Open Country only use sparse natural accents. Current local gates are green for `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and full `npx playwright test --reporter=list` with 83 passed / 19 skipped after starting `npm run dev:worker` for the local Worker. Matt needs to approve, tune placement/scale/density, or reject those remaining prop groups before any additional live placement integration.
