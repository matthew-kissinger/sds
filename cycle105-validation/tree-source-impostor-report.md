# Cycle 105 Tree Source and Impostor Report

Date: 2026-06-25

## Verdict

The refreshed EZ-Tree `leafAtlas` candidates are the right Cycle 4 tree source path for now.

`aspen_small_double_lowcanopy_green` is accepted as the live `tree1` replacement. `oak_medium_single` is accepted as the live `tree2` replacement. Matt also approved `ash_small_double` in the browser candidate gallery, but it stays as an approved reserve candidate because adding a third live tree species requires `shared/` placement changes that Cycle 105 does not authorize.

Matt reviewed the accepted replacements in the actual Home Field scene and approved the look. Caveats recorded from that review: fast panning still exposes LOD/impostor distribution questions that should be tested across Field, Rolling Hills, Open Country, and NSL; grass collision interaction with dog/sheep looked broken on the probe/browser route and should become a Cycle 5 grass-readability fix or investigation.

The current Kiln/Pixel Forge impostor path stays in use for this pass. A custom SDS/Kiln-native impostor baker is not justified yet: the accepted candidates rebaked through the current latlon and octahedral paths, KTX2 encoding succeeded, and the resulting runtime GLBs remain inside the existing tree budgets. The bake notes below keep the current limitations visible for a later scoped pipeline cycle.

## Evidence

- Browser review gallery: `cycle105-validation/tree-source-survey/review-gallery.html`
- Candidate metrics: `cycle105-validation/tree-source-survey/tree-source-metrics.csv`
- Live replacement metrics: `cycle105-validation/tree-source-survey/live-tree-refresh-metrics.json`
- Contact sheets: `current-live-contact.png`, `ez-staging-contact.png`, `ez-leafAtlas-contact.png`, `dedekpo-public-contact.png`, `legacy-free-contact.png`
- Accepted source candidates: `cycle105-validation/tree-source-survey/ez-leafAtlas-candidates/`
- Accepted runtime shortlist: `cycle105-validation/tree-source-survey/shortlist-runtime-glbs/`
- Candidate impostor bakes: `cycle105-validation/tree-source-survey/impostor-bakes/`
- Actual-scene review screenshots: `cycle105-validation/tree-actual-scene/field-classic-max.png`, `cycle105-validation/tree-actual-scene/field-tree-occluded.png`
- Actual-scene probe manifest: `cycle105-validation/tree-actual-scene/manifest.json`
- Actual-scene review summary: `cycle105-validation/tree-actual-scene/review-summary.json`

## Source Refresh

The latest published `@dgreenheck/ez-tree` package is `1.1.0`. The local `../ez-tree` main branch matched `origin/main` at `48dc193515135cff2b33515c47f0a8703b977e63`.

For source evaluation, a separate local worktree was built from the newer `origin/leafAtlas` branch at `6e5fd44b9ff2e829c0fb7ced846cb5c3fe8abe50`. That branch adds atlas-based leaf texture support and caller-supplied bark/leaves maps. SDS baked 20 LOD0 candidates from that branch with `SDS_EZ_TREE_ROOT=C:\Users\Mattm\X\games-3d\ez-tree-leafAtlas`.

Kiln remains the primary SDS dogfood path for authored props and pack direction. No callable Codex Kiln text-to-3D generator was available in this thread, so this phase used the current Kiln/Pixel Forge CLI for LOD/impostor validation and used EZ-Tree `leafAtlas` as the stronger biological tree source path.

`dedekpo/stylized-scene` is useful reference material for stylized runtime composition, canopy grouping, grass/wind, and WebGPU/TSL direction. It is not a drop-in SDS tree source because its tree is a runtime R3F/TSL assembly built from a trunk GLB plus instanced canopy meshes.

## Candidate Decisions

| Candidate | Metrics | Decision |
| --- | ---: | --- |
| Previous live `tree1.glb` | 326.4 KB, 3592 tris | Replaced by accepted leafAtlas aspen. |
| Previous live `tree2.glb` | 642.0 KB, 8270 tris | Replaced by accepted leafAtlas oak. |
| `aspen_small_double_lowcanopy_green.glb` | 1971.8 KB source, 3616 tris, 205.5 KB runtime | Accepted as live `tree1`; Matt approved in browser gallery. |
| `oak_medium_single.glb` | 2493.7 KB source, 8486 tris, 338.0 KB runtime | Accepted as live `tree2`; Matt approved in browser gallery. |
| `ash_small_double.glb` | 2494.4 KB source, 11072 tris, 339.9 KB runtime shortlist | Visually approved reserve. Not live in Cycle 105 because a `tree3` slot requires shared placement authorization. |
| EZ-Tree main candidates | See metrics CSV | Superseded by leafAtlas candidates after source refresh. |
| Legacy compatible GLBs | 9.1-11.3 KB, 345-552 tris | Rejected for fidelity; useful only as performance reference. |
| `dedekpo/stylized-scene` public tree parts | trunk 99.4 KB / 1854 tris, leaves 32.0 KB / 450 tris | Reference only; runtime assembly does not match SDS GLB contract. |

## Live Replacement Metrics

| Runtime asset | Size | Triangles | Render vertices | Upload vertices | Texture GPU |
| --- | ---: | ---: | ---: | ---: | ---: |
| `tree1.glb` | 205.5 KB | 3616 | 10848 | 3836 | 5.33 MiB |
| `tree1_lod1.glb` | 195.9 KB | 1367 | 4101 | 2149 | 5.33 MiB |
| `tree2.glb` | 338.0 KB | 8486 | 25458 | 13324 | 5.33 MiB |
| `tree2_lod1.glb` | 277.7 KB | 2189 | 6567 | 3953 | 5.33 MiB |

The live replacement keeps the existing two-material/two-mesh tree contract and stays within the existing triangle and total-size test budgets.

## Impostor Bake Decision

The accepted `tree1` and `tree2` replacements were rebaked through both production latlon and octahedral impostor layouts, then KTX2 encoded.

| Asset | Latlon albedo KTX2 | Latlon normal KTX2 | Latlon depth KTX2 | Octa albedo KTX2 | Octa normal KTX2 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `tree1` | 285.0 KB | 437.0 KB | 417.5 KB | 106.8 KB | 170.0 KB |
| `tree2` | 431.8 KB | 593.4 KB | 518.0 KB | 151.2 KB | 214.0 KB |

The current bake path had two operational issues worth preserving:

- A full batch bake initially hit a near-blank octahedral tree2 render race. The script's blank-atlas guard caught it, and targeted reruns for `latlon-hemi-y` and `octahedral` produced healthy atlases.
- The generic `canopy-balanced` validation profile is not a match for SDS production octahedral bakes because it expects a lower max angle count than SDS's 8x8 / 64-direction layout. Validation without that profile is the correct check for this asset set.

These are workflow issues, not enough evidence to build a custom baker in Cycle 105. A future SDS/Kiln-native baker should be scoped only if in-scene proof or repeated bake throughput shows this path blocks quality or production speed.

## Deferred

- Add the approved `ash_small_double` as a third tree species after a small cycle authorizes the required placement/species contract changes.
- Revisit a custom SDS/Kiln-native impostor baker only with a recorded blocker from actual visual proof, bake reliability, or asset throughput.
- Use Kiln text-to-3D for non-biological prop batches next, especially farmhouse, curated scatter, and remaining palette-pack assets.
- Run a distribution-aware fast-pan LOD review across Home Field, Rolling Hills, Open Country, and NSL before assuming the Home Field tree read generalizes to every scene.
- Investigate the broken dog/sheep grass collision visual sync observed on the actual-scene probe route as Cycle 5 grass work.

## Validation

- Matt visual approval: browser gallery approved all three highlighted tree candidates; actual Home Field scene approved for live `tree1` and `tree2`.
- Actual-scene proof summary: 2 screenshots, 0 blocking capture issues, WebGPU production route, 268 Home Field tree instances, 4 rendered tree instancing groups.
- Pass: `npx vitest run tests/tree-assets.spec.js tests/imposter-sidecar.spec.js tests/imposter-octahedral-sidecar.spec.js tests/object-impostor-manifest.spec.js tests/objects-impostor-parity.spec.js tests/impostor-ktx2-parity.spec.js`
- Pass: `npm run build`
- Pass: `npm test`
