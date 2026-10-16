# The Kiln farmhouse's surface channels, 2026-10-16

Release 2, the Kiln farmhouse item. The authored house in
`assets/house/farmhouse.kiln.js` is the owner's design and is unchanged: same
plan, massing, roof, openings and interior. What changed is the contract
between the bake and the game's backdrop shader, which Release 1 had left to a
guess. `FARMHOUSE_SOURCE` stays `'procedural'`; the flip is a separate commit
after the owner's look review and a hub receipt.

## The contract, read from the code

The farmhouse cluster draws walls, slate, timber and dressings with one shared
TSL graph, `buildSharedSurfaceBase` in `app/src/scene/farmhouse/surfaceMaterial.ts`.
It reads the vertex attribute `uv` (glTF TEXCOORD_0) as two numbers that are
not texture coordinates. Openings (`makeOpeningMaterial`) and lamps
(`makeLampMaterial`) read neither.

`uv.x`, unitless, a selector:

- Read as `baseUvWeight * uv.x` to mix the primary and secondary band sets.
  Weight 1 on `roof` (0 house slate `ROOF`, 1 barn slate `BARN_ROOF`) and on
  `dress` (0 stone `DRESS`, 1 chimney `MASONRY`). Weight 0 on `wall`, `timber`,
  `barn`.
- On `dress` it also gates the half-metre course joints: `stoneJoint * uv.x`.
- Range in use: exactly 0 or 1.

`uv.y`, metres, two meanings selected by material:

- Eave shade, every skin: `1 - smoothstep(0.46, 0.52, uv.y)` darkens by
  `eaveGain` - 0.79 limewash, 0.84 timber, 0.82 barn, 1 (no effect) slate and
  dress. So on walls and timber `uv.y` is metres below the roof edge over the
  face, with a 0.46 m band at 0. The procedural builders write 0 at the edge,
  the height of the wall at the footing, and 9 (`OPEN_SKY`) where no edge is
  over the face (`farmhouse/parts.ts`).
- Slate only (`roofWeight` 1): `onSlate = smoothstep(-0.5, -0.1, uv.y)`, the
  sky-occlusion ramp on `uv.y` (eave tone to 0.9 m, mid by 1.45 m, ridge from
  2.6 to 3.2 m), and course lines at `fract(uv.y / 0.95 + wander)` where the
  normal's `|y|` is 0.22 to 0.45 or more. So on slate `uv.y` is metres up the
  slope from its eave, and -1 means "not a slope, leave it plain"
  (`farmhouse/roof.ts` marks fascia, rake boards, caps and small planes so).
- Damp course and stone course lines use world height, not `uv`.

## What the loader fabricated in Release 1

`channelV` in the Release 1 `kilnHouse.ts` took `uv.x` from the material name
and `uv.y` from world height alone: `max(0, 5.8 - y)` for every limewash
vertex, `(y - eaveY) / sin(pitch)` clamped to [0, 7.36] for every slate
vertex, and 9 for timber, stone and masonry. Measured on the Release 1 bake
(`tmp/evidence.mjs`, not committed):

| Face | Release 1 guess | Baked now |
| --- | --- | --- |
| Porch roof, top faces | 0.00 to 0.00 (one flat slab) | 0.00 to 1.87 |
| Main slab, top faces | 0.00 to 7.36 | 0.00 to 7.36 |
| Main slab, cut edges (fascia line, verges, ridge) | 0.00 to 7.36 (courses) | -1 (plain) |
| Main slab, undersides | 0.00 to 7.16 (courses) | -1 (plain) |
| Gable outer faces above 8 m | 0.00 (whole triangle in the band) | metres below the verge, rake-parallel |
| Porch posts and tympanum | 9 (no band) | metres below the porch slopes |

The main slope was right by construction. Everything below or beside it was
not, which is the collapse the owner saw.

## What the bake now writes

`writeSurfaceChannels`, at the end of `build()` in the recipe, sets TEXCOORD_0
on every mesh from the recipe's own parts:

- Limewash, exterior faces: a vertical ray from each vertex to the underside of
  the main roof slabs above it. Signed: negative where a face runs up inside a
  slab (hidden), 9 indoors and where no slab is over the face. Timber does the
  same against the main slabs and the porch slopes. A face is exterior when a
  2 cm step along its normal lands outside the walls' outer faces.
- Exterior faces that cross z = 0 (the main ridge) or x = 3.5 (the porch apex)
  are split there, so the distance is exactly linear across every triangle;
  without it a gable triangle whose three corners all touch the rake reads 0
  everywhere. 26 triangles, 3,440 to 3,466.
- Slate: metres up the slab's largest upward face from its lowest edge; -1 on
  every other face. Largest, not most upward: on this 47 degree pitch the cut
  face at the ridge points up more steeply than the slope.
- Stone and masonry: 9, with `uv.x` 1 on masonry. Openings and lamps: 0.
- The root node's extras carry `surfaceChannels` (version 1, attribute
  TEXCOORD_0), because every Kiln part already has box UVs in TEXCOORD_0.

`kilnHouse.ts` copies the channels across and throws on a GLB without the
record or a mesh without TEXCOORD_0, naming it. `loadKilnHouse` still logs and
falls back to the procedural house, as before. `tests/farmhouse-kiln.spec.ts`
asserts every gable vertex against the slab underside to 1 mm, the porch
slopes reaching 1.87 m, both refusals, and the masonry selector.

One game-side mapping defect was fixed alongside: `KILN_ROOF` in
`farmhouse/plan.ts`, the outline's envelope, was HOUSE with trimmed eaves
(18.6 by 8.6, eave at 5.8). Its flat underside stood 0.36 m proud of both
gables and the inverted hull drew it as a dark line across each gable at the
wall head, in the Release 1 captures too. It is now the roof as built, ending
at the gable faces.

## The floor and the pad

The hall floor fought the terrain. `createGableShell` builds its floor as a
0.18 m slab whose top is the house's y = 0, and the cluster stands the house on
one terrain sample at its centre (`farmhouse/cluster.ts`, `stand`). The baked
heightfield under the footprint is flat: sampled every 0.25 m it reads the pad
level (-0.616) to within 0.42 mm inside the walls and 2.7 mm across the whole
footprint. So the deck and the ground were the same plane, and the terrain
showed through the floor in streaks.

The fix is in the recipe, because the recipe authors the floor:
`shell.floor.position.y += FLOOR_LIFT`, `FLOOR_LIFT = 0.03`. Only the slab moves.
The walls, corner posts, porch posts, step and threshold still start at 0, so
the house stays seated on the ground and nothing outside changes; the deck now
bears on the wall footings. The pad or `stand` was the other candidate, but
lifting there lifts the walls with the floor and leaves a 3 cm gap under every
wall on a flat pad. A loader offset would have been a correction to an asset
in code. Nothing else in the house had an upward face at 0: the threshold top
is 0.075, the step 0.12, the hearth 0.09, and the faces that do sit at 0 (wall
and post feet) face down. Furniture legs, the stair's first riser and the
partitions now start 3 cm inside the deck, which is unseen. The back door's
reveal shows the deck's edge as a 3 cm lip at the wall's centreline, where
there is no threshold stone.

Measured in the lab, not guessed. A new `10-hall` view stands in the hall
(2.2 m from the centre, 1.7 m up) with the whole deck in frame; the share of
the floor (rows 200 to 900) whose colour is the terrain's green rather than
the boards':

| Lift | WebGL2 | WebGPU |
| --- | --- | --- |
| 0 | 19.39% | 3.87% |
| 1 cm | 0.28% | 0.28% |
| 3 cm | 0.24% | 0.24% |

The residue at 1 and 3 cm is the stems of the grass blades below (see below),
not the terrain. 1 cm was already clean at that range; 3 cm was chosen for the
far camera. With a 24-bit depth buffer and near 0.5 m (`App.tsx`), the resolvable
step is about z^2 / (0.5 x 2^24): 1 mm at the Classic camera's 90 m, 1 cm at
290 m. A 1 cm lift would start to fight again within the field's far reach; 3
cm holds to about 500 m. From the field (`07-from-field`) the deck is a few
pixels through the door, and the frame is unchanged apart from the wind in
the grass.

Found while measuring, not fixed: the game's grass is not cleared from under
the house, so blades stand up through the floor. Only the open door shows the
inside today, and only close to; it belongs to the grass layer
(`app/src/scene/grass/`), which the code-built house shares.

## Re-baking

```
node C:/Users/Mattm/X/kiln-oss/dist/cli.mjs render assets/house/farmhouse.kiln.js --out assets/house/farmhouse.glb
node tools/record-house-asset.mjs
KILN_CLI=C:/Users/Mattm/X/kiln-oss/dist/cli.mjs node tools/record-house-asset.mjs --check
```

The bake is 2.5 s and reproduces byte for byte from a cold directory:
192,980 bytes, SHA-256 `e98cb50a...434315`, 282 mesh nodes, 189 meshes,
3,466 triangles, 20.05 by 12.42 by 11.87 m, 0 glTF errors or warnings, Kiln QA
`accepted`/`pass`. With `FLOOR_LIFT` at 0 the same recipe bakes
`eab29911...f25310`, the channels-only bake, so the lift is the only
difference between the two.

## Evidence

Lab captures, `tools/farmhouse-lab-capture.mjs`, eight standard views per
subject (front, front-west, front-east, porch, east gable, back-west, from the
field at 90 m, silhouette with the ground off) and two close-ups for the floor
(`09-doorway`, `10-hall`), WebGL2 (`?debug=webgl`) and
WebGPU, 1600 by 900. Headless WebGPU drew the frame, so the WebGL2 fallback was
not needed for it. Every WebGPU run logged one `Async render pipeline creation
failed ... [Texture "output"] usage` error, the code-built house and the
Release 1 tree included, so it predates this change; WebGL2 logged none.

- `captures/farmhouse/2026-10-16/before/{webgl,webgpu}/kiln-house/`: the
  Release 1 bake and loader, from a `git archive` of 86fe175f.
- `captures/farmhouse/2026-10-16/after/{webgl,webgpu}/kiln-house/`: this bake,
  floor lift included.
- `captures/farmhouse/2026-10-16/after/{webgl,webgpu}/house/`: the code-built
  house at the same frames, for context only. The lab gained a
  `House (procedural)` subject so the two share target and frame.
- `captures/farmhouse/2026-10-16/compare/`: before beside after, WebGL2, and
  `porch-*.png` at 3x on the porch.
- `captures/farmhouse/2026-10-16/floor/lift-{0,1cm,3cm}/{webgl,webgpu}/kiln-house/`:
  the floor close-ups at each lift (`09-doorway`, `10-hall`; `04-porch` and
  `07-from-field` at 0 and 3 cm), and `floor/compare/` with the three lifts
  side by side.

`captures/` is gitignored; the files are on the owner's PC.

Visible in the comparison: the porch roof gains its own eave ramp and a course
line, and its slab edges go plain; the tympanum and post heads take a band
under the porch slopes; the gables carry a band along the rake instead of none;
the long walls show the eave band under the slab; the line across both gables
is gone.

Verification on this PC: lint, typecheck and `typecheck:lab` clean; the build
exits 0 and ships no model with `'procedural'`; a temporary `'kiln'` build
shipped exactly one, `assets/farmhouse-DeFEL4ID.glb`, digest-equal to the
ledger, and `tests/treeline-assets.spec.ts` passed against it; discovery exit 0.
The full suite: 806 of 807 pass; the one failure, `tests/audio-manifest.spec.ts`,
is environmental: `assets/audio/licensed/` is absent from a fresh worktree.

## For the owner

1. The look review on the production build, desktop and phone, WebGPU and
   WebGL2, with `FARMHOUSE_SOURCE` set to `'kiln'` locally.
2. The hub receipt: build once per value, `tools/hub-presentation-probe.mjs`
   against both `dist/` copies. The kiln arm's main chunk is 2,416.74 kB raw /
   668.33 kB gzip against 2,369.62 / 653.51 for procedural, plus the 193 kB GLB.
3. Then the constant flips, in its own commit.

Suggestions only - nothing below was changed, because the design is the owner's.
A prototype of each was built and looked at in the lab, then reverted:

- The stack leaves the front slope as a 2.8 by 2.5 m shaft, the width of the
  inglenook carried straight up; at 90 m it reads as a pale block near the
  limewash's own value.
- The roof's edges are the slabs' cut faces. There is no fascia, barge board or
  ridge cap, so the verges read as a thin line and the gable slate stops in air.
- The limewash runs straight into the grass with no plinth or base course.
- The porch roof stands on two 150 mm posts with nothing spanning between them.
- The wall's vertical weathering runs are the shared `WALL` preset in
  `surfaceMaterial.ts`, the same "worn and wavy" surface on the code-built
  house; regrading it moves the shipped house too, so it is a material decision.
- The long-wall eave band is 0.46 m under the slab's underside at 5.50 m and
  clears the first-floor heads at 4.85 m. It is the shader's width.

## Kiln feedback

Kiln is `@instruktlabs/kiln` 1.2.3 at `C:/Users/Mattm/X/kiln-oss`, commit
86e369fe, run as `node dist/cli.mjs`. Nothing in it was modified.

**The per-vertex channels are supported only awkwardly.** Evidence: a probe
recipe set a VEC2 `_surface`, a SCALAR `_kind` and a `uv1` on one part and
rewrote `uv` on another. `kiln render` returned `ok: true` with three
`EXPORT_ATTRIBUTE_UNSUPPORTED ... is not preserved by the GLB bridge` warnings,
and the GLB carried POSITION, NORMAL and TEXCOORD_0 only; the rewritten `uv`
came through verbatim, -1 to 10.5. Root and material `userData` came through as
extras. So the channels can be expressed, but only by overloading TEXCOORD_0,
and only a side-band record can say so.

| Kind | Step and file | Finding |
| --- | --- | --- |
| missing capability | bake, `src/geometry-export.ts` (`EXPORTED_GEOMETRY_ATTRIBUTES`, `CUSTOM_EXPORT_ATTRIBUTES`), `src/render.ts` attribute bridge | The legacy bridge exports only `_edge` and `_cavity` besides position, normal, uv and tangent, so an author-named attribute (`_SURFACE`, VEC2) cannot reach the GLB. The game needed exactly that. `src/runtime-three.ts` says the runtime profile keeps "every other underscore attribute", so the two paths disagree. Asked: export author underscore attributes, float, SCALAR to VEC4, as the runtime profile already intends. |
| missing capability | authoring, `createGableShell` / `createGableRoof` / `createGableEndPanel` | The helpers know which faces are wall, gable, eave, verge and ridge but expose that only as node roles (`extras.kilnSemantic`). Per-face facts - distance below the roof edge, up-slope distance - had to be recomputed by raycasting the slabs. A per-face role or a `bakeSurfaceAttributes`-style "distance to roof edge" bake would make this a one-liner. |
| docs gap | `docs/geometry.md` line 92 | "Raw Three.js can carry additional attributes, but check Kiln's export diagnostics" does not say which survive. Learning that TEXCOORD_0 is written as float32 verbatim and unquantized by `kiln render`, and that other attributes are dropped, took `src/geometry-export.ts` and `src/render.ts`. |
| docs gap | `docs/migration.md` line 288 | `userData` exporting as glTF extras, with its 4 KiB per object and `kiln*` reserved prefix (`src/user-data-extras.ts`), is documented only in migration notes, not in the geometry or delivery docs where an author would look. |
| docs gap | `docs/programs.md` | The recipe sandbox's globals are not listed. `THREE.Raycaster`, `Matrix3`, `BufferGeometry.toNonIndexed` were found by trying them. |
| docs gap | workspace, `C:/Users/Mattm/X/kiln/README.md`, `kiln.config.json` | Both point at `./kiln` for the engine, which is not there. The engine and CLI are in `kiln-oss`, named only by `C:/Users/Mattm/X/KILN-WORKSPACES.html`, which sits outside the folder. |
| fine | bake, `kiln render ... --json --detail lean` | Deterministic: a cold bake from a scratch directory reproduced the GLB byte for byte, in about 2.5 s. |
| fine | bake, unsupported-attribute warning | The drop is reported per mesh with a code, as `docs/runtime.md` describes for `KILN_GEOMETRY_POLICY=warn`; `strict` would have failed it. |
| fine | sandbox | `THREE.Raycaster`, double-sided probe meshes, `toNonIndexed` and hand-built `BufferGeometry` all worked inside a recipe, which is what made the bake-side fix possible. |
| fine | QA | 0 glTF errors and warnings, `accepted`/`pass`, before and after. |
