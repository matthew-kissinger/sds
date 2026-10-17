# Spreading oak (Kiln)

One open-grown oak, the treeline's: a short, thick bole flared into five
buttress roots that twists a little and splits low, at 2.7 m, into five heavy
limbs; six secondary branches; and a broad crown of nine lobes, each a core
with overlapping leaf clusters over its upper surface, 56 clusters in all, so
the outline scallops and there are sky pockets between the lobes with wood
showing in them. The treeline instances it in every one of its stands. The
owner's scope, 2026-10-17: one tree type and one variant for now.

**Whether it ships is one constant.** `TREE_SOURCE` in
`app/src/scene/treeline/source.ts` is `'procedural'` or `'kiln'`. `Treeline`
reads it; with `'kiln'` the game loads this GLB (`treeline/kilnTree.ts`) and
draws it in place of the sculpted procedural oak, in the same 139 stands of
`assets/treeline/manifest.json`, with the same boxes, yaws and sky gaps. The
value changes only after the owner's look review on the production build and a
hub timing receipt, in its own commit. In a `'procedural'` build none of the
Kiln oak reaches `dist/`: not this file, not its loader and not its two
materials. `Treeline` reaches them only through `KilnTreeline`, which the
constant leaves unreachable, and the code both oaks share (`TreelineMeshes`)
calls none of them: it takes the Kiln oak as one builder
(`treeline/kilnOak.ts`, of the shape in `treeline/oakRoles.ts`). The asset
lab's `Tree (Kiln)` subject mounts it whatever the constant says,
`Tree (procedural)` mounts the shipped oak at the same target and frame, and
`node tools/treeline-lab-capture.mjs` takes the standard views of both into
`captures/treeline/<label>/` (gitignored).

## What is authored, and what is baked

`oak.kiln.js` is the editable source: a geometry program, read and revised like
any other file here. `oak.glb` is what it bakes to, via
[Kiln](https://github.com/instruktlabs/kiln) (`@instruktlabs/kiln` 1.2.3, MIT),
which is a tool and not a dependency - nothing imports it:

```
kiln render assets/treeline/kiln/oak.kiln.js --out assets/treeline/kiln/oak.glb
node tools/record-tree-asset.mjs
```

On the owner's PC `kiln` is the checkout at `C:/Users/Mattm/X/kiln-oss`
(`node C:/Users/Mattm/X/kiln-oss/dist/cli.mjs render ...`, or `KILN_CLI` set to
that `dist/cli.mjs` for the ledger's cold bake). `node tools/record-tree-asset.mjs
--check` re-renders from a scratch directory with no `.kiln/` cache and fails
unless the result is byte-identical to the recorded digest.

The program refuses to bake a tree that would show wood where it should not:
every limb and branch must end at least three quarters of the way inside a
cluster (`requireBuried`), and once a limb or branch has gone into the leaves it
may not come out again between two clusters (`requireCovered`), which is what a
branch tip poking through the crown is. The clusters are geodesic spheres cut
to one edge length (`DETAIL`), and a triangle buried inside another cluster's
drawn surface is dropped (`BURIED`).

After Kiln's exposure bake, the program leaves out every face that no viewer
could see from any direction (`dropUnseen`, under "unseen faces" in the
recipe): 364 of the wood's 1,302 triangles, the limbs and branches inside the
crown, and none of the crown's. A face goes only when the clusters hide it
from every direction it faces, with the clusters taken smaller than drawn by
more than the sway moves one height of a tree against another (0.3 m against
0.24 m at the stand whose box is narrowest for its height) and the face
pushed out past the most the swell carries a leaf (0.4 m against 0.29 m).
The bake still samples the whole tree, so every face that stays keeps the
cavity it had: the crown is bit-identical, the wood keeps every vertex it
still uses as it was, and the fit is unchanged. The root node records the two
allowances (`treeUnseen`), and `tests/tree-kiln.spec.ts` holds the game's
sway and swell inside them.

## Where it stands

The bake is authored in metres, roots at y 0. The loader fits it to the unit
stand the treeline scales into each placement box: the roots' foot to y 0, the
crown's furthest reach across and along to `CROWN_FILL` (0.47, the procedural
crown's own share of the box) less `CROWN_SWELL` (0.016), and the crown's top
to 1 less `CROWN_SWELL`, the room the canopy material's swell may take. The fit
is derived from the bake's bounds, so a re-authored crown re-fits itself. The
treeline sinks every stand 0.28 m into the ground, as it does the procedural
oak, so the buttresses read as roots going in.

## How it arrives in this game's painting

The two material names are the roles, `leaf` the crown and `bark` the wood; the
loader bakes every mesh of a role into one buffer in the tree's frame and
discards Kiln's PBR colours. The asset carries only what does not depend on the
light, recorded on its root node as `extras.treeChannels` (version 1), and the
loader refuses a bake without the record, a mesh without TEXCOORD_0 or
`_CAVITY`, or a crown without TANGENT:

| Channel | Part | Meaning |
| --- | --- | --- |
| `TEXCOORD_0.x` | crown | the cluster's seed in [0, 1), one value per cluster |
| `TEXCOORD_0.x` | wood | 0 |
| `TEXCOORD_0.y` | both | 0 |
| `TANGENT.xyz` | crown | the normal of the lobe the vertex belongs to: the gradient of that lobe's ellipsoid at the vertex, unit length, `w` 1. Not a tangent; nothing normal-maps this asset |
| `_CAVITY` | both | Kiln's exposure bake, 32 rays within 4 m: 1 open, toward 0 enclosed by other clusters |

Every variant of the family is a node marked `extras.treeVariant`; there is
one, `spreading`.

The painting is in the game's two materials
(`app/src/scene/treeline/kilnTreeMaterials.ts`), one opaque material per role,
no texture, no alpha, no extra pass:

- **One mass first.** The crown is lit by a blend of three normals: three
  quarters the whole crown's (the ellipsoid inside its bounds, which the
  loader derives), the rest mostly its lobe's, and a trace of the cluster's
  own. The crown turns from light to shade as one form; its lobes show at
  its outline and where the light turns, its clusters through the cavity in
  its deep folds. (A quarter until the owner's decision of 2026-10-17.)
- **Bands, painted.** The game's three bands, each edge a wide soft ramp. Near
  the camera the ramp is laid down in crisp-edged leaf dabs whose share of the
  light follows the ramp, the way a painter breaks a soft turn into strokes;
  from 40 m the dabs give way to the ramp itself, and by 105 m they are gone.
  Warm yellow-green where lit, a greyed blue-green in shade, a warm olive per
  stand and per cluster.
- **Into the haze.** From 40 m, where the dabs begin to give way, to 160 m the
  crown leans up to 0.4 toward the haze's hue at its own value: the fog's
  colour (`PALETTE.skyHorizon`) at unit luminance, times the crown's own
  luminance. The ring warms into the evening haze without lightening; the
  haze's lightness stays with the shared aerial term and the scene's fog.
  Nearer than 40 m nothing changes. It replaced a settle toward a cool
  blue-green of the oak's own, on the owner's decision of 2026-10-17.
- **The low sun through the crown.** Looking toward the sun, the crown's own
  edge (its envelope's, not every lobe's) takes the light's clear yellow-green.
- **Wood.** The same bands, quieter: close values, a wide edge, a warm
  grey-brown, a warm bounce from the field on the shade side, shade at the root.
- **Motion.** The swell pushes leaf vertices out along their cluster's normal by
  a slow wave, so the outline breathes into soft lumps and never opens a gap
  where the program dropped a buried face. The sway is one offset per height,
  the same in both materials, so wood and leaves move as one.

## Cost

| | Procedural oak | Kiln oak |
| --- | --- | --- |
| Triangles a tree | 924 (crown 560, wood 364) | 9,885 (crown 8,947, wood 938); 10,249 before the unseen faces were left out |
| Across 139 stands, before pooled shadows | 128,436 | 1,374,015 (1,424,611 before) |
| Draws for the treeline | 3 (crowns, wood, pooled shadows) | 3, the same three |
| Textures, transparency, added passes | none | none |
| Download | none | `oak-<hash>.glb`, 363,500 bytes (371,876 before), in a `'kiln'` build only |
| Game JavaScript, gzip | 664,622 bytes, 237 more than `main` (the oak's palette entries and the builder split) | 667,631 bytes |
| Whole frame, high tier, Follow (production art review) | 54 draws, 3,968,047 triangles | 54 draws, 5,213,626 triangles |
| Whole frame, low tier, Classic, phone (production art review) | 29 draws, 2,154,954 triangles | 29 draws, 3,400,533 triangles |

The triangle budget the recipe declares is 10,000. Nothing culls the treeline,
so every tier submits every stand: the 1.25 million triangles the oak adds are
a third more for the whole frame at the high tier and three fifths more at the
low tier. Shader cost, counted in scalar operations with a vec3 operation as
three (the materials' header has the breakdown): per vertex, over Three's own
instancing, the wood about 50 and three sines, the crown about 140 and six
sines; per fragment, the crown about 210 and three sines against about 70 and
two for the procedural canopy, the wood about 75 and none. The only per-stand
data are the matrices both instanced meshes already upload and the stand
attributes the procedural materials already read.

No timing on a development PC is evidence. The hub receipt of 2026-10-17
(`docs/history/status-log.md`) ran both builds on both backends, at the
desktop viewport's high tier and the phone viewport's low tier:

- Frame times were identical in every view, with no frame over 100 ms and the
  same draws.
- The GPU was busy about 3 to 4 points more of the time at the high tier, and
  0 to 2 points more at the low tier.
- Warm boots were unchanged.
- Cold boots, with the driver's shader cache off as on a first visit, were
  unchanged on WebGPU. On WebGL2 they were about 0.4 s slower at the high
  tier, where the two materials' programs take longer to compile.

Both programs compile inside the scene-ready gate (`compileScene.ts`), with
the rest of the scene, before Play is offered. The treeline's meshes are never
frustum-culled, so the gate always includes them, and no gameplay frame waits
on them. The cost trim's receipt (the status log's "Kiln oak cost trim -
2026-10-17") put this oak against the one before its unseen faces were left
out: the same frame times and draws, 50,596 fewer triangles in every view, and
boots within their noise.

So no coarser level of detail is needed on the hub's evidence. Whether a
phone's GPU carries the low tier's extra triangles needs a phone, because the
hub's phone viewport runs the low tier on desktop hardware. If a coarser level
is needed, it comes from this program with a smaller `DETAIL` table (a longer
cluster edge, fewer sides on the wood); none is authored. The cost trim
measured the crown's side of that: 5,000 to 6,000 triangles a tree needs
`DETAIL.frequency` to start at 2 and an edge of 0.55 to 0.6 m, and then the
outline's scallops turn into straight runs and corners from 12 to 34 m.

## Reference

The owner supplied two reference images. They are described here and not
committed:

| File | Bytes | SHA-256 | What it shows | Why it is not in the repository |
| --- | --- | --- | --- | --- |
| `ghibli-oak-reference.webp` | 293,338 | `6f22beaac8c354c8159972b84a8a4fa07543c3b517dd485b1394e23179e5407d` | A painted spreading oak on golden grass: a thick, twisting bole splitting low into heavy limbs, a broad crown of leafy clumps, warm yellow-green light over blue-green shade, a flat treeline on the horizon | Its provenance is unknown. A reference image in the repository needs its provider, date and prompt or licence recorded, and none came with it. The owner can supply them |
| `ghibli-treeline-and-cluster-reference.webp` | 73,052 | `e296222d1c08b0ef3f2ecf31610b2cfa077c5f9aab440e61ea3a5dd8bfd7169d` | A frame from a Studio Ghibli film: rice fields under a treeline, with a dark teal bush in front built of rounded leaf clumps in two or three flat values | A third party's film frame, and the repository is public |

The rejected low-poly concept (`../tree-family-concept.png`) stays where it is.

## Kiln, as used here

Classified as the house and barn work classified theirs (bug, missing
capability, docs gap, fine):

| What | Class | Worked around |
| --- | --- | --- |
| No tree, branch, canopy or cluster helpers | missing capability | The program builds its own geodesic clusters, tubes and Catmull-Rom limbs |
| The cavity bake is a hemisphere about the surface normal; foliage wants sky visibility (how much of the sky a point sees through the crown) | missing capability | Accepted: the materials use it for deep folds only, squared |
| The GLB bridge writes POSITION, NORMAL, TEXCOORD_0, TANGENT and the `_EDGE`/`_CAVITY` scalars and drops any other vertex attribute | missing capability | The lobe normal rides in TANGENT, recorded as such in `treeChannels` |
| An error thrown inside a recipe surfaces from `kiln render` as "Generated asset execution was rejected", with no message or line, and there is no `validate` command | bug | A local dry run of the recipe outside Kiln, to read the error |
| `gameMaterial` defaults to flat shading | fine | Set `flatShading: false`; right for hard-surface work |
| The cold bake is byte-identical, and `programRef` is the recipe's own SHA-256 prefix | fine | |
| The QA report cannot certify part volumes for open shells ("Not manifold") | fine | The crown is a union of clusters with buried faces removed, open by design |
| No step that leaves out the faces no viewer can see, after the bake and keeping its per-vertex values | missing capability | `dropUnseen` in the program: an analytic test against the clusters as ellipsoids, run after `bakeSurfaceAttributes`, giving each part a new geometry |
| A part's geometry can be replaced after `bakeSurfaceAttributes`, and the export, the budget and the QA report all read the replacement | fine | |
| The source check names a refused construct and its line (`DYNAMIC_CODE_ACCESS` for `attribute.array.constructor`) | fine | `new Float32Array`, with any other array type refused |

## Not in this asset

- One variant. The family structure takes more (`treeVariant`) without
  re-homing anything; none is authored.
- No far level of detail (above).
- No shrubs; the placement has none.
- The lab's silhouette view draws its own override material, so it shows the
  crown without the swell and the sway.

## Provenance

All source is owned by Matthew Kissinger under AGPL-3.0-or-later (`LICENSE`).
No external mesh, texture or animation is downloaded; the GLB carries no images
and samples no texture. `asset-manifest.json` pins the recipe and the import
chain by SHA-256 over UTF-8 text normalised to LF, and the baked GLB by SHA-256
over its raw bytes. After an intentional change to the recipe, re-bake and
re-record:

```
kiln render assets/treeline/kiln/oak.kiln.js --out assets/treeline/kiln/oak.glb
node tools/record-tree-asset.mjs
```
