# Cycle 105 Phase 4 - SDS Kiln Fence Rebake Spec

Updated: 2026-06-25

## Phase Goal

Create the SDS Kiln palette and first fence-kit asset specification before generating production candidates. This phase does not replace `assets/models/Fence_Kit-v1.0.0.glb`; it defines the measured contract a candidate must beat before live integration.

## Current Fence Evidence

Command:

```bash
npx gltf-transform inspect assets/models/Fence_Kit-v1.0.0.glb --format md
```

File:

- `assets/models/Fence_Kit-v1.0.0.glb`
- Size: 692,936 bytes
- Last modified locally: 2026-06-11 07:27:00

glTF overview:

- Version: 2.0
- Generator: `glTF-Transform v4.3.0`
- `extensionsUsed`: `EXT_meshopt_compression`, `KHR_draco_mesh_compression`, `KHR_mesh_quantization`, `KHR_texture_transform`
- `extensionsRequired`: `EXT_meshopt_compression`, `KHR_draco_mesh_compression`, `KHR_mesh_quantization`
- Scene: `FenceKit`
- Root name: `Fence_Post`
- Bounds: min `[-0.72, -0.22, -0.47]`, max `[0.72, 3.90003, 0.47]`
- Render vertex count: 2,448
- Upload vertex count: 507
- Upload naive vertex count: 507
- Animations: none

Mesh summary:

| Mesh | Mesh Primitives | GL Primitives | Vertices | Attributes | Instances | Size |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| 0 | 1 | 32 | 36 | normal, position, texcoord | 1 | 768 B |
| 1 | 1 | 32 | 36 | normal, position, texcoord | 1 | 768 B |
| 2 | 1 | 12 | 24 | normal, position, texcoord | 1 | 456 B |
| 3 | 1 | 48 | 52 | normal, position, texcoord | 1 | 1.12 KB |
| 4 | 1 | 180 | 116 | normal, position, texcoord | 1 | 2.94 KB |
| 5 | 1 | 256 | 128 | normal, position | 1 | 3.07 KB |
| 6 | 1 | 32 | 36 | normal, position, texcoord | 1 | 768 B |
| 7 | 1 | 112 | 79 | normal, position, texcoord | 2 | 1.94 KB |

Material summary:

| Material | Instances | Textures | Alpha |
| --- | ---: | --- | --- |
| `FenceWood` | 1 | base color, normal, metallic/roughness | opaque |
| `FenceCapWood` | 2 | base color, normal, metallic/roughness | opaque |
| `RailWood` | 1 | base color, normal, metallic/roughness | opaque |
| `GatePostWood` | 1 | base color, normal, metallic/roughness | opaque |
| `GateCapWood` | 1 | base color, normal, metallic/roughness | opaque |
| `GateRingMetal` | 1 | none | opaque |
| `ArchWood` | 1 | base color, normal, metallic/roughness | opaque |

Texture summary:

| Slot | Instances | Mime | Resolution | Stored Size | Minimum GPU Size |
| --- | ---: | --- | --- | ---: | ---: |
| metallic/roughness | 6 | PNG | 512x512 | 92.27 KB | 1.4 MB |
| base color | 6 | PNG | 512x512 | 419.32 KB | 1.4 MB |
| normal | 6 | PNG | 512x512 | 151.1 KB | 1.4 MB |

Current verdict:

- The current fence geometry is already cheap: 507 uploaded vertices and about 704 triangles by local inspector.
- The weakness is material and texture discipline: 7 materials and three 512 PNG maps for a small repeated kit.
- The candidate should reduce material slots and texture memory first; higher-poly styling is acceptable only if it remains inside the budgets below.

## Runtime Contract To Preserve

The runtime loads the kit once from `js/FencePresets.js` and looks up exact node names:

- `Fence_Post`
- `Fence_Rail`
- `Gate_Post`
- `Gate_Arch`

Required authoring contract:

- The four wrapper nodes above must exist at identity transform.
- `Fence_Post` origin must be ground-contact center.
- `Gate_Post` origin must be ground-contact center.
- `Fence_Rail` must be centered at origin, 1.0 world unit long before runtime scale, and use local +X as its long axis.
- `Fence_Rail` must remain visually valid when runtime scales X to match post spacing.
- `Gate_Arch` must keep a stable origin compatible with the current `createGateStructure()` placement path.
- All visible meshes must be opaque. No alpha-tested foliage cards, transmissive materials, animation, or hidden high-cost authoring leftovers.
- Existing fallback procedural fence behavior must remain untouched.

Current runtime placement assumptions:

- Standard post spacing: 5.0 world units.
- Rails are placed at heights 0.5, 1.2, and 1.9.
- `rail.userData.railSpan.geomAxis` is `x`, so terrain sloping expects local +X.
- Gate groups are surfaced as a rigid unit so posts and arch stay coplanar on slopes.

If a candidate cannot preserve this contract, it must be staged as a separate experiment and must not replace `assets/models/Fence_Kit-v1.0.0.glb`.

## SDS Kiln Palette

Palette name: `SDS Pastoral Survival v1`

Palette goal: stylized pastoral assets with enough warmth for a cozy pasture and enough muted survival contrast to avoid a toy-plastic read.

| Role | Hex | Use |
| --- | --- | --- |
| Weathered warm wood | `#8b6a45` | Primary fence, crates, posts |
| Cut worn wood | `#a68158` | Exposed cuts, rails, highlights |
| Bark shadow | `#4e3a2b` | Bark, deep wood grooves |
| Dark iron | `#383735` | Hinges, rings, tool metal |
| Rope tan | `#c1a36d` | Rope, lashings, light trim |
| Lichen olive | `#6f7f4c` | Moss, muted vegetation accents |
| Grass mid | `#5f8d4e` | Ground vegetation reference |
| Grass dark | `#385a3d` | Vegetation shadow reference |
| Hay dry | `#d6b65e` | Straw, dry grass, hay bales |
| Packed earth | `#7b6045` | Dirt, worn paths, underside grime |
| Stone cool | `#7d8580` | Rocks, foundations |
| Cream marker | `#ead8aa` | Small readable gameplay-safe highlights |
| Signal red | `#b24f3f` | Rare accent only, not a dominant color |
| Water shadow | `#436b73` | Future damp/water-adjacent accents |

Material principles:

- Prefer flat or lightly vertex-colored stylized materials over bitmap-heavy PBR.
- Use rough, non-metallic materials for wood and stone.
- Reserve metalness for small hardware only.
- Keep visible color variation in geometry, vertex color, or shared low-cost material choices before adding textures.
- Avoid one-note green/brown output by balancing wood warmth, cool stone, dry hay, and muted vegetation colors.

## SDS Kiln Pack

Pack name: `SDS Pastoral Survival Foundation`

Pack goal: one coherent source pack for the first replacement wave, starting with fence and later expanding into farmhouse, scatter, trees, rocks, and grass-adjacent assets.

Local Kiln records:

- Data directory: `C:/Users/Mattm/X/kiln/kiln-studio/.localdata`
- User: `dev-admin`
- Palette: `sds-pastoral-survival-v1`
- Pack: `sds-pastoral-survival-foundation`
- Pack tag: `sds-pastoral-survival-fo`
- Pack status: `locked`
- Pack item count: 12
- Generation count: 0

The local pack is locked only. No generation jobs have been fired, and no candidate GLB has been accepted.

Initial pack rows:

| Asset ID | Category | Status | Notes |
| --- | --- | --- | --- |
| `sds-fence-post-v1` | fence | first target | Must map to `Fence_Post` wrapper |
| `sds-fence-rail-v1` | fence | first target | Must map to `Fence_Rail`, 1m local +X |
| `sds-gate-post-v1` | fence | first target | Must map to `Gate_Post` wrapper |
| `sds-gate-arch-v1` | fence | first target | Must map to `Gate_Arch` wrapper |
| `sds-fence-collision-v1` | fence proxy | metadata first | Simple proxy dimensions, not live physics integration yet |
| `sds-farmhouse-foundation-v1` | structure | later | Palette continuity target |
| `sds-scatter-crate-v1` | scatter | later | Low material count |
| `sds-scatter-barrel-v1` | scatter | later | Low material count |
| `sds-hay-bale-v1` | scatter | later | Check sheep readability |
| `sds-rock-set-v1` | rocks | later | Compare against current rock budgets |
| `sds-tree-source-set-v1` | trees | later | Source candidate before impostor decision |
| `sds-grass-clump-v1` | grass | later | Evaluate only after grass perf audit |

Generation prompt seed:

```text
Create a modular stylized pastoral survival fence kit for Sheep Dog Simulator. Use the SDS Pastoral Survival v1 palette. Output one clean game-ready GLB with four exact wrapper nodes named Fence_Post, Fence_Rail, Gate_Post, and Gate_Arch. Use simple readable low-poly geometry, stable ground pivots, opaque materials, shared wood and metal materials, and no animation. Fence_Rail must be 1.0 unit long, centered at origin, and aligned along local +X so the game can scale it between posts. Avoid baked bitmap texture detail unless it is clearly necessary; prefer solid materials, vertex color, bevels, silhouette, and hand-shaped geometry. Include simple collision proxy dimensions in metadata or a candidate report.
```

Negative prompt / rejection guidance:

```text
No realistic photogrammetry, no foliage alpha cards, no noisy PBR texture stack, no unique material per piece, no hidden authoring meshes, no non-uniform wrapper transforms, no incorrect node names, no rail length other than 1.0, no rail long axis other than +X, no animation.
```

## Candidate Budgets

Hard budgets:

| Budget | Target | Hard Stop |
| --- | ---: | ---: |
| Optimized GLB file size | <= 180 KB | > 300 KB |
| Materials | <= 2 | > 3 |
| Textures | 0 | > 1 |
| Texture resolution | none | > 256x256 |
| Texture GPU memory | 0 MB | > 0.35 MB |
| Render vertices | <= 3,500 | > 5,000 |
| Upload vertices | <= 1,500 | > 2,500 |
| Mesh primitives | <= 4 visible canonical pieces | > 8 without written reason |
| Alpha materials | 0 | any |
| Animations | 0 | any |

Texture exception:

- A candidate may use one 256x256 or smaller WebP/KTX2-style shared texture only if a no-texture candidate fails visually and Matt approves the tradeoff.
- A normal map is not allowed for the first fence candidate unless a later report proves it is visually decisive and still under budget.

Collision proxy requirement:

- Phase 5 must report simple proxy dimensions for post, rail, gate post, and gate arch.
- Preferred proxy format for the report is JSON-like dimensions in world units.
- Optional hidden `_COLLISION` nodes are allowed only if the runtime ignores them and `gltf-transform inspect` proves they do not add visible draw cost.
- No live collision/runtime behavior changes are authorized by Phase 4.

Optimization requirement:

- Inspect every candidate with `npx gltf-transform inspect`.
- Run cleanup with glTF Transform as needed: `dedup`, `prune`, `weld`, and intentional meshopt or Draco compression.
- Candidate reports must include file size, materials, textures, vertex counts, node contract status, pivot status, collision proxy status, and rejection/acceptance verdict.

## Files Allowed Later If A Candidate Is Accepted

Phase 4 allows no runtime replacement. Later phases may touch these files only after the candidate report and approval gate exist:

- `assets/models/Fence_Kit-v1.0.0.glb`
- `js/FencePresets.js`, only if a deliberate contract change is approved
- Any asset hash, manifest, or validation fixture that directly names the accepted fence file
- `cycle105-validation/fence-candidate-report.md`

## Phase 4 Acceptance State

- Current GLB metrics are recorded above from `gltf-transform inspect`.
- The SDS Kiln palette and pack direction are defined above.
- Replacement budgets for material count, texture cost, file size, naming, pivots, draw-call shape, and collision proxies are defined above.
- No committed runtime fence asset is replaced in this phase.
