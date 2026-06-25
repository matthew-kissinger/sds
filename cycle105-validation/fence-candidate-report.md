# Cycle 105 Phase 5/6 - Fence Candidate Report

Updated: 2026-06-25

## Phase Goal

Produce, inspect, and visually review fence candidates from the SDS Kiln palette/pack workflow, then replace `assets/models/Fence_Kit-v1.0.0.glb` only after Matt approves a candidate.

## Accepted Candidate - 2026-06-25

Generation ID: `sds-fence-kit-candidate-20260625-c`

Accepted staged candidate:

- `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-c-runtime.glb`

Live replacement:

- `assets/models/Fence_Kit-v1.0.0.glb`

Visual approval:

- Matt approved the candidate C review preview on 2026-06-25 with "looks good".
- Matt approved the actual-scene fence read on 2026-06-25, then flagged the gate as floating in the Home Field scene.
- The floating/stretched gate was an integration bug: `js/FencePresets.js` still stretched the small Kiln `Gate_Arch` module across the full 8m gate opening, and the visual threshold pad sat too high above the grass.
- The post-only gate fallback was not visually sufficient, so a separate budgeted Kiln gate GLB was generated and integrated as `assets/models/Gate_Assembly-v1.0.0.glb`.
- `js/FencePresets.js` now loads `Gate_Assembly-v1.0.0.glb` and places that proper gate first; the two-post/no-header path remains only as a load-failure fallback.
- Matt approved the proper gate GLB in the actual scene on 2026-06-25 with "looks good i think".
- Preview proof: `cycle105-validation/fence-candidate-c-preview-gallery.png`
- Preview scene: `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-c-three-span-preview.glb`
- Actual-scene proof before gate fix: `cycle105-validation/fence-actual-scene-field.png`
- Actual-scene proof after gate fix: `cycle105-validation/fence-actual-scene-field-gate-grounded.png`
- Actual-scene proof after removing the stretched gate span: `cycle105-validation/fence-actual-scene-field-gate-ground-posts.png`
- Close actual-scene proof after removing the stretched gate span: `cycle105-validation/fence-actual-scene-field-gate-ground-posts-close2.png`
- Actual-scene proof with the approved proper Kiln gate GLB: `cycle105-validation/fence-actual-scene-field-gate-kiln-budget.png`

Candidate C source workflow:

- Kiln Studio local service path: `runGenerate()`
- Kiln data dir: `C:/Users/Mattm/X/kiln/kiln-studio/.localdata`
- User: `dev-admin`
- Model: `google:gemini-3.5-flash`
- Palette: `sds-pastoral-survival-v1`
- Pack: `sds-pastoral-survival-foundation`
- Pack tag: `sds-pastoral-survival-fo`
- Category: `environment`
- Prompt ID: `sds-fence-kit-candidate-c-fence-spans`
- Live SDS replacement: yes, after visual approval

Gate assembly candidate workflow:

- Kiln generation ID: `88374939-72cf-4ad0-95b0-33502b06a2d4`
- Prompt ID: `sds-gate-assembly-budget-20260625-b`
- Model: `google:gemini-3.5-flash`
- Palette: `sds-pastoral-survival-v1`
- Raw generated triangles: 720
- Raw draw count after Kiln optimize: 10
- Raw materials/textures: 3 opaque materials, 0 textures
- Runtime postprocess: baked world transforms, merged by material, welded duplicate vertices, kept no-extension GLB for clean validation.
- Live SDS replacement: `assets/models/Gate_Assembly-v1.0.0.glb`

Candidate C generation metrics:

- Status: ok
- Latency: 162,122 ms
- Tool calls: `kiln_list_primitives`, `kiln_validate`, `kiln_render`, `kiln_screenshot`, `kiln_submit`
- Raw generated triangles: 920
- Material count after palette snap: 1
- Raw draw count after Kiln optimize: 53

Candidate C postprocess:

1. Removed metallic/roughness texture data and kept one tiny SDS palette base-color texture.
2. Joined child meshes per required runtime wrapper where this preserved names and pivots.
3. Stripped signboard meshes from `Gate_Arch` so the optional gate content no longer dominated the fence read.
4. Extracted `Fence_Rail` to one repeatable unit-length rail module.
5. Scaled `Fence_Post` to support the runtime rail stack heights used by `js/FencePresets.js`.
6. Built a separate three-span preview GLB for visual approval while keeping the runtime GLB to the four required modules.

Accepted live GLB inspection:

Commands:

```bash
npx gltf-transform validate assets/models/Fence_Kit-v1.0.0.glb
npx gltf-transform inspect assets/models/Fence_Kit-v1.0.0.glb --format md
node tools/inspect-glb-three.mjs assets/models/Fence_Kit-v1.0.0.glb
npx gltf-transform validate assets/models/Gate_Assembly-v1.0.0.glb
npx gltf-transform inspect assets/models/Gate_Assembly-v1.0.0.glb --format md
node tools/inspect-glb-three.mjs assets/models/Gate_Assembly-v1.0.0.glb
npx vitest run tests/fence-presets.spec.js
npm test
npm run build
```

Overview:

- File size: 41,224 bytes
- Version: 2.0
- Generator: `glTF-Transform v4.4.0`
- `extensionsUsed`: none
- `extensionsRequired`: none
- Scene: `PastoralFenceKit`
- Root name: `PastoralFenceKit`
- Bounds: min `[-0.65943, -0.04962, -0.24]`, max `[0.65943, 2.21907, 0.24]`
- Render vertex count: 2,208
- Upload vertex count: 1,020
- Upload naive vertex count: 1,020
- Three.js inspector triangle count: about 736
- Animations: none
- `gltf-transform validate`: no errors, warnings, infos, or hints
- `tests/fence-presets.spec.js`: passed; covers authored gate placement, vertical rotation/scaling, and the no-stretched-header fallback.
- `npm test`: passed on 2026-06-25 after the proper gate GLB integration.
- `npm run build`: passed on 2026-06-25 after the proper gate GLB integration.

Gate assembly live GLB inspection:

- File size: 39,096 bytes
- Version: 2.0
- Generator: `glTF-Transform v4.4.0`
- `extensionsUsed`: none
- `extensionsRequired`: none
- Root name: `Gate_Assembly`
- Bounds: min `[-4.24, 0, -0.24]`, max `[4.24, 2.20781, 3.53412]`
- Render vertex count: 2,160
- Upload vertex count: 1,341
- Three.js inspector triangle count: about 720
- Mesh count / draw shape: 3 meshes, one per material
- Materials: `Gate_Wood`, `Gate_Cut_Wood`, `Gate_Dark_Iron`
- Textures: 0
- Animations: none
- `gltf-transform validate`: no errors, warnings, infos, or hints

Actual-scene gate proof:

- Screenshot: `cycle105-validation/fence-actual-scene-field-gate-kiln-budget.png`
- Probe URL: `http://localhost:3000/?scene=field&mode=classic&autostart=1&probeRender=1&cinematic=1&ui=off`
- Runtime gate position: `{ x: 0, y: 0, z: 100 }`
- Runtime gate metrics: 3 meshes, 720 triangles, 3 named materials, 0 textures
- Runtime gate bounds: minY approximately `0`, maxY `2.2078`
- Runtime scene names: `Gate_Assembly: 1`, `Gate_Wood: 1`, `Gate_Cut_Wood: 1`, `Gate_Dark_Iron: 1`, `Gate_Arch: 0`

Meshes:

| Mesh | GL Primitives | Vertices | Instances | Size |
| --- | ---: | ---: | ---: | ---: |
| `Mesh_Fence_Post_Runtime` | 156 | 218 | 1 | 7.91 KB |
| `Mesh_Fence_Rail_Runtime` | 48 | 96 | 1 | 3.36 KB |
| `Mesh_Gate_Post_Runtime` | 240 | 332 | 1 | 12.06 KB |
| `Mesh_Gate_Arch_Runtime` | 292 | 374 | 1 | 13.72 KB |

Materials and textures:

| Material | Instances | Textures | Alpha |
| --- | ---: | --- | --- |
| `PaletteMaterial001` | 4 | baseColorTexture | opaque |

| Texture | Slot | Resolution | Stored Size | Minimum GPU Size |
| --- | --- | --- | ---: | ---: |
| `PaletteBaseColor` | baseColorTexture | 32x4 PNG | 126 B | 700 B |

Accepted candidate budget check:

| Budget | Phase 4 Target | Phase 4 Hard Stop | Candidate C Runtime | Result |
| --- | ---: | ---: | ---: | --- |
| Optimized GLB file size | <= 180 KB | > 300 KB | 41,224 B | pass |
| Materials | <= 2 | > 3 | 1 | pass |
| Textures | 0 | > 1 | 1 | hard pass, target miss |
| Texture resolution | none | > 256x256 | 32x4 | pass |
| Texture GPU memory | 0 MB | > 0.35 MB | 700 B | pass |
| Render vertices | <= 3,500 | > 5,000 | 2,208 | pass |
| Upload vertices | <= 1,500 | > 2,500 | 1,020 | pass |
| Mesh primitives | <= 4 visible canonical pieces | > 8 without written reason | 4 | pass |
| Alpha materials | 0 | any | 0 | pass |
| Animations | 0 | any | 0 | pass |

Texture note:

The accepted runtime candidate keeps one 32x4 palette texture. It still misses the zero-texture target, but it is far below the hard texture-memory limit and is a deliberate palette lookup rather than a detail texture stack.

## Other Generated Assets

Only fence-related assets were generated in this pass. Kiln pack definitions now describe future SDS assets such as farmhouse, scatter, trees, rocks, and grass-adjacent pieces, but no non-fence production candidates were generated or staged.

Provider attempt `sds-fence-kit-candidate-20260625-b` failed with a provider 503 before a usable GLB was persisted.

## Rejected Candidate A Summary

Generation ID: `sds-fence-kit-candidate-20260625-a`

Source workflow:

- Kiln Studio local service path: `runGenerate()`
- Kiln data dir: `C:/Users/Mattm/X/kiln/kiln-studio/.localdata`
- User: `dev-admin`
- Model: `google:gemini-3.5-flash`
- Palette: `sds-pastoral-survival-v1`
- Pack: `sds-pastoral-survival-foundation`
- Pack tag: `sds-pastoral-survival-fo`
- Category: `environment`
- Prompt ID: `sds-fence-kit-candidate`
- Live SDS replacement: no

Generated Kiln files:

- `C:/Users/Mattm/X/kiln/kiln-studio/.localdata/generations/sds-fence-kit-candidate-20260625-a/model.glb`
- `C:/Users/Mattm/X/kiln/kiln-studio/.localdata/generations/sds-fence-kit-candidate-20260625-a/model.code.js`
- `C:/Users/Mattm/X/kiln/kiln-studio/.localdata/generations/sds-fence-kit-candidate-20260625-a/provenance.json`
- `C:/Users/Mattm/X/kiln/kiln-studio/.localdata/generations/sds-fence-kit-candidate-20260625-a/views.png`

Staged SDS validation files, ignored by git:

- `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a.glb`
- `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a-views.png`
- `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a-normalized.glb`
- `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a-normalized-lite.glb`
- `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a-joined.glb`

Final staged candidate for review:

- `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a-joined.glb`
- Size: 48,664 bytes

Staged variant verdicts:

| Path | Size | Materials | Textures | Pivot / Naming Status | Collision Status | Verdict |
| --- | ---: | ---: | ---: | --- | --- | --- |
| `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a.glb` | 57,452 B | 1 | 2 | required names present, wrapper transforms fail, arch axis fails | not recorded | rejected as raw candidate |
| `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a-normalized.glb` | 42,568 B | 1 | 2 | wrapper transforms pass, arch axis pass | not recorded | rejected for texture count |
| `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a-normalized-lite.glb` | 42,304 B | 1 | 1 | wrapper transforms pass, arch axis pass | not recorded | rejected for draw-call shape |
| `cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a-joined.glb` | 48,664 B | 1 | 1 | wrapper transforms pass, arch axis pass | dimensions recorded below | accepted for Phase 6 review |

## Generation Metrics

Kiln generation result:

- Status: ok
- Latency: 129,736 ms
- Tool calls: `kiln_list_primitives`, `kiln_validate`, `kiln_render`, `kiln_screenshot`, `kiln_submit`
- Generated triangles: 1,108
- Structural warnings: 0
- Raw material count before palette snap: 7
- Material count after palette snap: 1
- Raw draw count before postprocess: 36
- Instanceability grade: A

## Postprocess Steps

The raw generated GLB was good enough to continue but not good enough to use directly:

- Required node names existed: `Fence_Post`, `Fence_Rail`, `Gate_Post`, `Gate_Arch`.
- The named wrapper nodes had preview-layout translations, which would shift cloned pieces in SDS.
- `Gate_Arch` initially spanned local Z, while `js/FencePresets.js` scales gate arch width along local X.
- The raw model used 26 mesh primitives and 36 draw calls across the full kit.

Staged postprocess:

1. Reset `Fence_Post`, `Fence_Rail`, `Gate_Post`, and `Gate_Arch` wrappers to identity transforms.
2. Rotated `Gate_Arch` child geometry so the arch spans local X.
3. Removed the metallic/roughness texture and set material constants.
4. Joined same-material child meshes under each wrapper, reducing the kit to four visible meshes.

These changes are staged only in `cycle105-validation/fence-candidates/`; the live runtime asset is unchanged.

## Final GLB Inspection

Commands:

```bash
npx gltf-transform inspect cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a-joined.glb --format md
node tools/inspect-glb-three.mjs cycle105-validation/fence-candidates/sds-fence-kit-candidate-20260625-a-joined.glb
```

Overview:

- Version: 2.0
- Generator: `glTF-Transform v4.4.0`
- `extensionsUsed`: none
- `extensionsRequired`: none
- Scene: `PastoralFenceKit`
- Root name: `PastoralFenceKit`
- Bounds: min `[-1.17, -0.03, -0.241]`, max `[1.17, 2.43411, 0.28042]`
- Render vertex count: 3,324
- Upload vertex count: 1,183
- Upload naive vertex count: 1,183
- Three.js inspector triangle count: about 1,108
- Animations: none

Meshes:

| Mesh | GL Primitives | Vertices | Instances | Size |
| --- | ---: | ---: | ---: | ---: |
| `Mesh_Post_Body` | 232 | 204 | 1 | 7.92 KB |
| `Mesh_Rail_Body` | 60 | 120 | 1 | 4.2 KB |
| `Mesh_GPost_Body` | 328 | 337 | 1 | 12.75 KB |
| `Mesh_Arch_PillarL` | 488 | 522 | 1 | 19.63 KB |

Materials:

| Material | Instances | Textures | Alpha |
| --- | ---: | --- | --- |
| `PaletteMaterial001` | 4 | baseColorTexture | opaque |

Textures:

| Texture | Slot | Resolution | Stored Size | Minimum GPU Size |
| --- | --- | --- | ---: | ---: |
| `PaletteBaseColor` | baseColorTexture | 32x4 PNG | 121 B | 700 B |

## Runtime Contract Check

| Requirement | Result | Evidence |
| --- | --- | --- |
| Exact `Fence_Post` node | pass | Found, wrapper transform identity |
| Exact `Fence_Rail` node | pass | Found, wrapper transform identity |
| Exact `Gate_Post` node | pass | Found, wrapper transform identity |
| Exact `Gate_Arch` node | pass | Found, wrapper transform identity |
| `Fence_Rail` local +X span | pass | Rail child X range `[-0.495, 0.495]` |
| `Fence_Rail` 1.0 unit length | pass | Wrapper bbox size X = `1.0` |
| `Gate_Arch` local +X span | pass | Arch child X range `[-1.16, 1.16]` |
| Opaque materials only | pass | One opaque material |
| No animations | pass | `gltf-transform inspect` found none |
| No live asset replacement | pass | `assets/models/Fence_Kit-v1.0.0.glb` unchanged |

Wrapper transforms:

```json
{
  "Fence_Post": { "translation": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
  "Fence_Rail": { "translation": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
  "Gate_Post": { "translation": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
  "Gate_Arch": { "translation": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] }
}
```

## Budget Check

| Budget | Phase 4 Target | Phase 4 Hard Stop | Candidate | Result |
| --- | ---: | ---: | ---: | --- |
| Optimized GLB file size | <= 180 KB | > 300 KB | 48,664 B | pass |
| Materials | <= 2 | > 3 | 1 | pass |
| Textures | 0 | > 1 | 1 | hard pass, target miss |
| Texture resolution | none | > 256x256 | 32x4 | pass |
| Texture GPU memory | 0 MB | > 0.35 MB | 700 B | pass |
| Render vertices | <= 3,500 | > 5,000 | 3,324 | pass |
| Upload vertices | <= 1,500 | > 2,500 | 1,183 | pass |
| Mesh primitives | <= 4 visible canonical pieces | > 8 without written reason | 4 | pass |
| Alpha materials | 0 | any | 0 | pass |
| Animations | 0 | any | 0 | pass |

Texture note:

The candidate still uses one tiny 32x4 palette base-color texture. This is not a bitmap detail stack and is far below the hard texture-memory limit, but it misses the zero-texture target. A later vertex-color bake can remove the final texture if Matt wants the stricter target before integration.

## Collision Proxy Dimensions

No live collision integration is included. These proxy dimensions are recorded for review and future implementation.

```json
{
  "Fence_Post": {
    "type": "box",
    "size": [0.2924, 1.4477, 0.2924],
    "center": [0.02, 0.7238, 0.02]
  },
  "Fence_Rail": {
    "type": "box",
    "size": [1.0, 0.0723, 0.124],
    "center": [0.0, 0.0062, 0.0]
  },
  "Gate_Post": {
    "type": "box",
    "size": [0.5226, 1.8627, 0.5067],
    "center": [-0.035, 0.9314, 0.0271]
  },
  "Gate_Arch": {
    "type": "box",
    "size": [2.34, 2.4341, 0.4],
    "center": [0.0, 1.2171, -0.041]
  }
}
```

## Candidate A Verdict

Candidate `sds-fence-kit-candidate-20260625-a-joined.glb` passed technical staging, but failed Phase 6 visual review on 2026-06-25.

Matt rejection reason: it reads like a post and a gate, not a fence.

Decision: do not integrate candidate A. At the time of this rejection, the live runtime asset `assets/models/Fence_Kit-v1.0.0.glb` remained unchanged. Candidate C later replaced the live runtime asset after separate visual approval.

Follow-up constraints used for candidate C:

- The primary read must be a repeatable fence kit, not a gate, signpost, or arch prop.
- Include a straight rail segment that looks correct when repeated into a continuous run.
- Include post, corner, and end-cap modules only as support pieces for the fence run.
- Treat a gate as optional secondary content; it must not dominate the asset silhouette.
- Preview at least three connected fence spans before Phase 6 approval.
