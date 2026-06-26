# SDS Homestead Playfield Pack Report

Date: 2026-06-25

## Decision

The one-off farmhouse generations are rejected as a direction. They remain reference-only evidence and must not be promoted into SDS runtime assets.

Use Kiln's first-class Packs workflow for the next broader SDS asset pass:

- Kiln app inspected at `http://localhost:5273`.
- Proper surface: Packs -> plan/review/edit -> lock -> run -> progress board -> compose.
- New locked pack: `sds-homestead-playfield-pack-v1`.
- Pack tag: `sds-homestead-playfield`.
- Status: `complete`.
- Generation IDs: 13 generated outputs, all `ok`.
- Pack palette: `sds-pastoral-survival-v1`.
- Every item also carries `paletteId=sds-pastoral-survival-v1` and `optimizedPalette=true`.

## Why The One-Off Farmhouse Is Not Good Enough

The earlier farmhouse candidates were generated as isolated assets, not as part of an SDS pack contract. Candidate B used the palette API path and had acceptable basic metrics, but the visual read was too generic and blocky. It does not establish a coherent SDS homestead asset language.

Rejected/reference-only artifacts:

- `cycle105-validation/farmhouse-ground-candidates/sds-farmhouse-candidate-20260625-a.glb`
- `cycle105-validation/farmhouse-ground-candidates/sds-farmhouse-candidate-20260625-a-views.png`
- `cycle105-validation/farmhouse-ground-candidates/sds-farmhouse-candidate-20260625-b-palette.glb`
- `cycle105-validation/farmhouse-ground-candidates/sds-farmhouse-candidate-20260625-b-palette-views.png`

## Locked Pack Contents

Total planned outputs: 13. The farmhouse, hay bale cluster, and wildflower/weed clump rows each request two variants through `count`.

| Asset row | Count | Role | Category | Key constraints |
| --- | ---: | --- | --- | --- |
| Farmhouse landmark variant | 2 | building | architecture | Squat SDS silhouette, porch/chimney/door accent, stone base, Y=0 pivot, named `Farmhouse_*` nodes, `ShadowProxy`, <=3000 tris, one palette material |
| Small pasture utility shed | 1 | building | architecture | Not a second farmhouse, Y=0 pivot, named `Shed_*` nodes, <=1500 tris, one palette material |
| Hay bale cluster | 2 | fill | prop | Three compact bales, dry hay plus rope tan, gameplay-readable, <=600 tris, instancing-friendly |
| Pasture water trough with bucket | 1 | prop | prop | Box-collider friendly, named `Trough_Root/Bucket`, <=900 tris |
| Crate stack | 1 | prop | prop | Strong cube silhouettes, no tiny handles, stable `CrateStack_Root`, <=700 tris |
| Barrel and rope coil | 1 | prop | prop | Squat barrel, iron hoops, no thin curves, named `BarrelRope_Root`, <=900 tris |
| Log pile and stump | 1 | fill | prop | Bark shadow and cut worn wood faces, collision ignored unless promoted, <=800 tris |
| Low stone marker cluster | 1 | fill | environment | Visual accent only unless collider parity is proven, <=700 tris |
| Wildflower and weed clump | 2 | fill | environment | No alpha cards, no grass-field replacement, curated instanced patches only, <=350 tris |
| Blank pasture signpost | 1 | prop | prop | No text or symbols, named `Signpost_Root`, <=500 tris |

## Generated Pack Run

Approved run started: `2026-06-25T22:02:38.376Z`
Completed: `2026-06-25T22:12:16.082Z`

Generated review artifacts are staged under:

- `cycle105-validation/homestead-playfield-pack-v1/glb/`
- `cycle105-validation/homestead-playfield-pack-v1/views/`
- `cycle105-validation/homestead-playfield-pack-v1/provenance/`
- `cycle105-validation/homestead-playfield-pack-v1/source/`
- `cycle105-validation/homestead-playfield-pack-v1/homestead-playfield-pack-v1-contact-sheet.png`

The staged artifacts started as review candidates only. After actual-scene review, Matt approved `01-farmhouse-a`; it is now integrated locally as `assets/models/Farm house.glb`. Matt has since approved the remaining pack assets for this branch. Production copies for the accepted props and accents now live under `assets/models/homestead/` and are placed scene-appropriately by `js/world/homesteadPlayfieldProps.js`.

## Technical Inspection Summary

All 13 generations returned `ok`, have no animations, and are within the requested triangle budgets. The embedded texture payloads are tiny palette PNGs where present, not large texture stacks. Several outputs still need visual and authoring review before runtime use because Kiln added extra props, extra materials, or slightly below-ground pivots.

| Candidate | Generation ID | Tris | Materials | Textures | Draws | GLB bytes | Pivot | Inspection note |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `01-farmhouse-a` | `36ef2ece-f930-43ce-913b-dcac47e587e5` | 1396 | 1 | 2 / 235 B | 109 | 97636 | base | Cheap enough, but many nodes/draws for a landmark and includes extra porch/scatter details. |
| `02-farmhouse-b` | `9cca74b9-57a1-4d33-ac64-c3ee2ff45d6d` | 1588 | 2 | 2 / 251 B | 122 | 97312 | base | Cheap enough, but uses a second glass material and has a taller chimney/read than A. |
| `03-utility-shed` | `5091400e-75db-4d47-8382-0d0e589d3414` | 956 | 1 | 2 / 251 B | 71 | 78972 | base | Under budget, but contains extra hay/trough/shelf dressing; review as a dressed yard prop. |
| `04-hay-bales-a` | `dd774ab7-e894-42d0-981f-3654767823f2` | 512 | 1 | 2 / 237 B | 37 | 21192 | base | Under budget, but includes pitchfork/ground straw details. |
| `05-hay-bales-b` | `825aa6a1-5df4-4f37-b0de-5662c103657d` | 558 | 4 | 0 / 0 B | 29 | 22820 | base | Under budget, but misses the one-material preference and includes post/rail details. |
| `06-trough-bucket` | `9b221db1-f5d6-4284-aebc-a0c5630b6017` | 840 | 1 | 2 / 251 B | 60 | 49404 | base | Under budget, but reads as trough plus hand pump and water surface, not only trough/bucket. |
| `07-crate-stack` | `41feb0e4-4aa9-4260-995e-eb306bae7dc0` | 680 | 4 | 0 / 0 B | 41 | 19388 | base | Under triangle budget, but misses one-material preference. |
| `08-barrel-rope` | `865c48ae-7e04-4334-9c37-f9ee073d0084` | 892 | 1 | 2 / 241 B | 12 | 33084 | base | Near the triangle cap because the rope coil is detailed; good draw shape. |
| `09-log-pile-stump` | `bf63d3bd-e4e9-489b-b20c-fd5dc0a7114b` | 420 | 1 | 2 / 234 B | 22 | 35188 | base | Cheap and readable, but the axe is a tone/playfield decision. |
| `10-stone-marker` | `d3eb28cf-b462-4ba9-be61-5849773aef0d` | 512 | 3 | 0 / 0 B | 12 | 14104 | base | Cheap draw shape, but uses three materials and reads more as a marker mound than generic rocks. |
| `11-wildflower-a` | `1000fea6-003a-4350-ae4b-1e33fa7759ed` | 316 | 4 | 1 / 121 B | 34 | 21900 | offset | Under budget, but material count and slightly below-ground stones need cleanup if promoted. |
| `12-wildflower-b` | `4a319f3e-db52-4523-91d4-f9d84f69fe90` | 260 | 1 | 2 / 234 B | 22 | 19504 | offset | Under budget and cleaner material shape, but needs pivot/bounds cleanup if instanced. |
| `13-signpost` | `4bf1d79f-17f1-40d3-9f7c-9269a272e48c` | 320 | 1 | 2 / 236 B | 15 | 20064 | offset | Under budget and text-free, but needs pivot/bounds cleanup before live placement. |

## No-Ground Refinement Pass

After visual review, candidates `10`, `11`, and `12` were refined from the generated Kiln source to remove dirt pads, soil bases, lichen bases, and placement rocks that would fight SDS terrain placement. This was an offline source edit and rebake using Kiln's `renderGLB` and `renderCodeViewGrid`; no model call was used and no live SDS runtime asset was replaced.

Refined artifacts:

- `cycle105-validation/homestead-playfield-pack-v1/refined-source/`
- `cycle105-validation/homestead-playfield-pack-v1/refined-glb/`
- `cycle105-validation/homestead-playfield-pack-v1/refined-views/`
- `cycle105-validation/homestead-playfield-pack-v1/homestead-playfield-pack-v1-no-ground-refinements.png`

| Refined candidate | Source edit | Tris | Materials | Textures | GLB bytes | Bounds/pivot | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| `10-stone-marker-no-ground` | Removed `BaseMound` and `BaseGrass`; lifted rotated small stones/tufts above Y=0. | 432 | 4 | 0 | 11708 | bbox y=[0.007, 1.113], base pivot | Placement-ready review candidate. |
| `11-wildflower-a-no-ground` | Removed `SoilBase`, `Rock1`, and `Rock2`; lifted blade/flower pivots above Y=0. | 274 | 5 | 0 | 15612 | bbox y=[0.002, 0.618], base pivot | Placement-ready review candidate; material count can be collapsed if promoted in quantity. |
| `12-wildflower-b-no-ground` | Removed `Stone1`, `Stone2`, and `LichenBase`; lifted blade/flower/wheat pivots above Y=0. | 208 | 5 | 0 | 12524 | bbox y=[0.008, 0.603], base pivot | Placement-ready review candidate; material count can be collapsed if promoted in quantity. |

## Scene Placement Review

Candidates `10`, `11`, and `12` first had diagnostic SDS scene-placement previews, driven by opt-in local manifests and `?assetReview=1`. The original NSL farmhouse manifest hid the then-live farmhouse and mounted `01-farmhouse-a` at the scene farmhouse position for approval. After Matt approved it, `01-farmhouse-a` replaced the live farmhouse asset. The scene-fit sweep kept the approved live farmhouse visible, excluded reserve farmhouse variant B from default review, and placed the remaining pack props only where they fit: farmyard props in Home Field and NSL, sparse natural accents in Rolling Hills and Open Country. Those approved placements are now live runtime placements; the diagnostic manifests remain as evidence only.

Review artifacts:

- `cycle105-validation/homestead-playfield-pack-v1/scene-review/field-manifest.json`
- `cycle105-validation/homestead-playfield-pack-v1/scene-review/newsheepdogland-manifest.json`
- `cycle105-validation/homestead-playfield-pack-v1/scene-review/field-packyard-manifest.json`
- `cycle105-validation/homestead-playfield-pack-v1/scene-review/newsheepdogland-packyard-manifest.json`
- `cycle105-validation/homestead-playfield-pack-v1/scene-review/rolling-hills-accents-manifest.json`
- `cycle105-validation/homestead-playfield-pack-v1/scene-review/open-country-accents-manifest.json`
- `cycle105-validation/homestead-playfield-pack-v1/scene-review/field.png`
- `cycle105-validation/homestead-playfield-pack-v1/scene-review/newsheepdogland.png`
- `cycle105-validation/homestead-playfield-pack-v1/scene-review/field-packyard.png`
- `cycle105-validation/homestead-playfield-pack-v1/scene-review/newsheepdogland-packyard.png`
- `cycle105-validation/homestead-playfield-pack-v1/scene-review/rolling-hills-accents.png`
- `cycle105-validation/homestead-playfield-pack-v1/scene-review/open-country-accents.png`
- `cycle105-validation/homestead-playfield-pack-v1/scene-review/contact-sheet.png`
- `cycle105-validation/homestead-playfield-pack-v1/scene-review/summary.json`

Runtime proof summary:

- WebGPU stayed on `webgpu-production` in Home Field, NSL, Rolling Hills, and Open Country review captures.
- Home Field mounted the 3 refined no-ground assets with `minY=0` and 432 / 274 / 208 triangles.
- The original NSL approval preview mounted 4 review assets: `01-farmhouse-a` plus the 3 refined no-ground accents.
- The NSL farmhouse preview hides 1 existing farmhouse object, places `01-farmhouse-a` at `{ x: 640, z: -956 }`, scales it to 7m tall, keeps its base on sampled terrain at `y=3.5753`, and reports 109 meshes / 1396 triangles / 1 material in the pack inspection.
- The NSL refined accents mount on heightmapped terrain with `minY` equal to sampled terrain height at each placement.
- The scene-fit sweep mounted 11 review assets each in Home Field and NSL packyard contexts: utility shed, both hay bale clusters, trough/bucket, crate stack, barrel/rope, log/stump, signpost, stone marker, and two wildflower clumps.
- The scene-fit sweep mounted only 4 natural accents each in Rolling Hills and Open Country: stone marker, two wildflower clumps, and log/stump. Farmhouse, shed, hay, trough, crate, barrel, and signpost are intentionally not placed in those scenes by default.
- The latest `summary.json` reports `ok=true` for all four scene-fit manifests. Diagnostic review draw calls were 476 for Home Field packyard, 870 for NSL packyard, 124 for Rolling Hills accents, and 153 for Open Country accents.
- `02-farmhouse-b` is available as the optional `newsheepdogland-farmhouse-b` reserve comparison route, but it is not included in the default scene-fit sweep because `01-farmhouse-a` is the approved live farmhouse.
- The live review URL for NSL is `http://localhost:3000/?renderer=webgpu&scene=newsheepdogland&mode=survival&autostart=1&perfMode=1&probeRender=1&cinematic=1&assetReview=1&assetReviewManifest=%2Fcycle105-validation%2Fhomestead-playfield-pack-v1%2Fscene-review%2Fnewsheepdogland-manifest.json&ui=off`.
- The current packyard review URL for NSL is `http://localhost:3000/?renderer=webgpu&scene=newsheepdogland&mode=survival&autostart=1&perfMode=1&probeRender=1&cinematic=1&assetReview=1&assetReviewManifest=%2Fcycle105-validation%2Fhomestead-playfield-pack-v1%2Fscene-review%2Fnewsheepdogland-packyard-manifest.json&ui=off`.

Live runtime integration update:

- Production copies exist under `assets/models/homestead/` for utility shed, hay bales A/B, trough/bucket, crate stack, barrel/rope, log/stump, stone marker, wildflower A/B, and signpost.
- `js/world/homesteadPlayfieldProps.js` maps live placements by scene without touching `shared/` scene definitions.
- Home Field and NSL load 11 packyard props each at 6,092 triangles / 347 meshes, with no failed GLB loads.
- Rolling Hills and Open Country load 4 natural accents each at 1,334 triangles / 82 meshes, with no failed GLB loads.
- Runtime proof screenshots and `summary.json` live under `cycle105-validation/homestead-playfield-pack-v1/live-runtime/`.

Local validation update:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed after dev-gating the local asset-review harness and recording the measured legacy `mainKB` ratchet.
- Remote merge-ref CI later measured the final production prop placement and grass-default bundle ratchet as `mainKB` 634 and `chunkBudgetsKiB.main` 635; the budget fixture is updated to those values as the accepted cost of the approved live prop pack.
- `npm run build` passed.
- `npx playwright test --project=chromium --grep-invert='@local-only' --reporter=list` passed with 7 passed / 2 skipped.
- `npx playwright test --project=mp --grep-invert='@local-only' --reporter=list` passed with 19 passed after starting `npm run dev:worker`.
- Full `npx playwright test --reporter=list` passed with 83 passed / 19 skipped in 13.7 minutes after starting `npm run dev:worker` so the existing Vite client on `:3000` also had a local Worker on `127.0.0.1:8787`.
- A prior full `npm run test:e2e` attempt timed out because Playwright reused the existing Vite server on `:3000` but no Worker was listening on `127.0.0.1:8787`; the trace showed `POST /register` as `ERR_CONNECTION_REFUSED`, and the full rerun passed once the Worker was live.

## Live Farmhouse Integration

Matt approved `01-farmhouse-a` in the actual NSL scene. It now replaces the live runtime asset at `assets/models/Farm house.glb`.

- Source: `cycle105-validation/homestead-playfield-pack-v1/glb/01-farmhouse-a.glb`
- Runtime path: `assets/models/Farm house.glb`
- Validation: `gltf-transform validate` reports no errors, warnings, infos, or hints.
- Inspection: 97.6 KB GLB, 109 mesh nodes, 1396 triangles, one palette material, two 32x4 palette textures totaling 235 B.
- Runtime proof: live NSL capture reports visible `Farmhouse`, 109 meshes, 1396 triangles, `castShadow=0`, and `receiveShadow=109`.
- Shadow policy: farmhouse mesh casting stays disabled in `TerrainBuilder` until a dedicated proxy shadow pass is approved.
- Bundle proof: the local asset-review harness is dev-gated so it does not ship in production. The legacy `mainKB` ratchet is updated from 627 to 628 for the live farmhouse review pass. The final production homestead prop placement module deliberately updates the refactor-baseline budget to `mainKB` 634 and `chunkBudgetsKiB.main` 635 after remote merge-ref CI measured that cost.

## Runtime Use Gates

- Matt reviewed and approved the pack assets for this branch.
- File size, triangle count, materials, textures, bounds, pivots, and warnings were inspected during the pack and no-ground refinement passes.
- Live integration keeps the scene-fit density decisions: farmyard props only in Home Field/NSL, sparse natural accents only in Rolling Hills/Open Country.
- Runtime proof confirms live production placement counts and no failed GLB loads.

## Next Step

Run final post-integration validation, update the PR, and shepherd the branch through remote CI, merge, and deployment. Future prop work should be targeted tuning or a new asset-pack cycle, not more untracked candidate promotion on this branch.
