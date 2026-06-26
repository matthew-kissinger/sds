# Cycle 6 - Farmhouse and Ground Accent Batch Spec

Date: 2026-06-25  
Branch: `codex/three-r185-upgrade`  
Status: specification only; no live farmhouse, rock, or scatter asset replacement is authorized by this document.

Correction 2026-06-25: the initial one-off farmhouse generations are rejected/reference-only. The active path is the locked Kiln pack `sds-homestead-playfield-pack-v1`, documented in `cycle105-validation/homestead-playfield-pack-report.md`, and it must be reviewed or edited before it is run.

## Goal

Start the broader SDS palette asset refresh with the smallest useful environment batch after fence and trees: rebuild or repack the farmhouse landmark, then add only curated low-density ground accents that improve homestead readability without reviving the old broad scatter layer.

## Current Runtime Surface

The live farmhouse is loaded from `assets/models/Farm house.glb` by `TerrainBuilder.loadModels()` and the preload list in `GameAssetLoader`. `TerrainBuilder.addFarmHouse()` places a clone at the active scene's `farmHouse.position`, scales it at `1.0`, offsets by the cached model base Y, rotates by the scene override or the Home Field default, then disables `castShadow` on every farmhouse mesh because the current single monolithic caster produced a large square shadow in the dog-following shadow box.

Current measured asset shape from `cycle105-validation/runtime-asset-cost-audit.md`:

| Asset | File | Tris | Upload verts | Meshes / prims | Materials | Textures | Minimum texture GPU | Decision |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Farmhouse | 646 KiB | 2,047 | 4,052 | 1 / 1 | 1 | 1 PNG 1024 | ~5.46 MiB | Geometry is fine; texture is oversized and the material direction predates the SDS palette. |

The old meadow scatter layer is not live. `TerrainBuilder` explicitly records that the previous sub-metre ScatterSystem was removed because pebbles, mushrooms, clovers, and flowers were too small at gameplay camera distance and had visible performance cost without enough visual payoff. Existing files under `assets/models/scatter/` are static reference assets only.

Rocks are live, cheap, and already instanced through the current rock placement path. They should not be included in this first replacement batch unless the work includes collider-footprint parity proof.

## SDS Palette Direction

Use the existing locked `sds-pastoral-survival-v1` palette from `cycle105-validation/fence-kiln-spec.md`.

Key colors for this batch:

| Role | Hex | Use |
|---|---|---|
| Weathered warm wood | `#8b6a45` | Door, beams, porch, crates |
| Cut worn wood | `#a68158` | Trim, exposed plank edges |
| Bark shadow | `#4e3a2b` | Deep wood grooves, underside shadow |
| Dark iron | `#383735` | Hinges, latch, tool metal |
| Rope tan | `#c1a36d` | Sacks, lashings, trim accents |
| Hay dry | `#d6b65e` | Hay bales, straw, dry grass accents |
| Packed earth | `#7b6045` | Worn path, mud, foundation grime |
| Stone cool | `#7d8580` | Foundation stones, well edge |
| Cream marker | `#ead8aa` | Small readable trim highlights |
| Signal red | `#b24f3f` | Rare door or cloth accent only |

Material rules:

- Prefer solid materials, vertex color, bevels, and readable geometry over bitmap-heavy PBR.
- Keep all materials rough and non-metallic except small hardware.
- Avoid a one-note brown house by balancing warm wood, cool stone, cream trim, and a rare muted accent.
- Do not use dense alpha cards for broad meadow noise.

## Batch 1 Targets

### A. Farmhouse Landmark

Purpose: replace or repack the current farmhouse as a coherent SDS palette landmark with lower texture cost and a shadow strategy that does not recreate the square-shadow bug.

Candidate constraints:

| Budget | Target |
|---|---|
| File size | <= 350 KiB preferred, <= 500 KiB hard cap |
| Geometry | <= 3,000 triangles, <= 6,000 upload vertices |
| Mesh/primitives | <= 6 visible primitives |
| Materials | <= 4 visible materials |
| Textures | 0 preferred; otherwise one <= 512 atlas with recorded GPU estimate |
| Pivot | Origin at ground-footprint center, minY = 0 before runtime placement offset |
| Scale | Reads correctly at runtime scale `1.0` without compensating code |
| Naming | Stable nodes such as `Farmhouse_Root`, `Farmhouse_Body`, `Farmhouse_Roof`, `Farmhouse_Porch`, `Farmhouse_Door`, `Farmhouse_ShadowProxy` |
| Shadows | No monolithic visible mesh may cast; any restored shadow must use a simple proxy and pass NSL/Home Field screenshot proof |
| Collision | No gameplay collision change unless a future plan adds explicit proxy integration |

Staging path: keep generated candidates under `cycle105-validation/farmhouse-ground-candidates/` until inspection and Matt review pass. Do not replace `assets/models/Farm house.glb` during candidate generation.

Integration options:

- Preferred minimal runtime change: replace `assets/models/Farm house.glb` only after approval, keeping existing loader paths stable.
- Optional cleanup if bundled with tests: rename the runtime asset to a cleaner `assets/models/Farmhouse.glb` and update every loader/preload reference in the same commit. Do not keep duplicate compatibility paths.

### B. Curated Homestead Ground Accents

Purpose: add a few larger, readable palette accents around the farmhouse, gate traffic line, and fence corners. These should improve place identity and ground read without hiding sheep, dog pathing, fence openings, or gate approach lines.

Allowed first candidates:

- Hay bale pair or small hay stack.
- Water trough or feed trough.
- Feed sacks / crate pair.
- Repaired plank pile or pasture stakes.
- Small flower/thistle clump only as a low-count accent.
- Worn dirt or mud patches as terrain/ground detail, not many mesh props.

Rejected for this batch:

- Broad random meadow scatter.
- Tiny pebbles, mushrooms, or clover distributed across the whole field.
- Dense alpha-card flowers that increase overdraw or hide sheep feet.
- Any scatter that needs `shared/` placement edits.

Candidate constraints:

| Budget | Target |
|---|---|
| Per visible prop variant | <= 500 triangles preferred |
| Materials | 1 per variant preferred; 2 only for clearly visible flowers or metal hardware |
| Textures | Shared palette/atlas only, no unique high-res prop textures |
| Runtime shape | Instanced from first live integration pass |
| Initial live density | Curated patches only, target <= 80 total accent instances in Home Field |
| Draw calls | <= 3 new draw calls for the whole first accent set |
| Placement | Around farmhouse path, fence corners, gate traffic, and outside readable play lines |
| Gameplay | Must not obscure sheep silhouettes, dog path feedback, gate opening, or corral boundary |

## Kiln Prompt Seeds

Farmhouse candidate:

```text
Create a game-ready stylized farmhouse landmark for Sheep Dog Simulator using the SDS Pastoral Survival v1 palette. The asset should read clearly from a third-person gameplay camera as a small pastoral homestead, with warm weathered wood, cool stone foundation, simple cream trim, and one rare muted accent. Use clean low-poly geometry, stable ground pivot, and rough non-metal materials. Prefer solid materials and vertex color over bitmap textures. Include stable node names: Farmhouse_Root, Farmhouse_Body, Farmhouse_Roof, Farmhouse_Porch, Farmhouse_Door, and an optional simple Farmhouse_ShadowProxy. Keep the model grounded at minY 0, centered at the footprint, and suitable for runtime scale 1.0.
```

Ground accent candidate:

```text
Create a small game-ready SDS homestead ground accent set using the SDS Pastoral Survival v1 palette: hay bale pair, water trough, feed sack/crate pair, repaired plank pile, pasture stakes, and one small thistle or flower clump. Make each prop readable from gameplay distance with strong silhouettes and low geometry. Use one shared palette or atlas, stable pivots at ground center, no dense alpha-card meadow scatter, and no unique high-resolution textures. These are curated low-density accents near farmhouse paths, fence corners, and gate traffic, not broad random field scatter.
```

Negative guidance:

```text
Avoid photorealistic PBR, glossy plastic, high-frequency texture noise, oversized texture atlases, tiny unreadable meadow clutter, dense flower carpets, floating pivots, thin stretched boards, open interiors, complex animation, and any prop that requires broad random scatter to look good.
```

## Acceptance Gates

Before any Batch 1 candidate becomes live runtime content:

1. Inspect every candidate GLB with glTF tooling and record file size, triangle count, upload vertices, mesh/primitives, materials, textures, texture GPU estimate, bounds, and pivot.
2. Reject farmhouse candidates that exceed texture budget, have minY below ground, need runtime scale hacks, or recreate the monolithic shadow caster.
3. Reject ground accent candidates that only read as tiny noise at gameplay camera distance.
4. Surface the candidate in a browser or in-scene review for Matt before replacing any live asset.
5. For farmhouse replacement, capture Home Field and NSL screenshots proving placement, scale, and no large square shadow.
6. For ground accents, capture a Home Field gameplay-distance screenshot with sheep present to prove herd readability.
7. If rocks are touched later, run or add a collider-footprint parity harness before asset replacement.
8. Run focused tests for any loader, placement, shadow, or material contract changes.
9. Run `npm run build` before committing runtime asset integration.
10. Do not touch `shared/` or sim-baseline fixtures for this batch.

## Current Decision

Batch 1 should start with a farmhouse candidate and a small curated homestead accent set. Rocks stay unchanged for now. Old scatter stays dead. The first implementation output should be staged candidates and an inspection report, not live runtime replacement.
