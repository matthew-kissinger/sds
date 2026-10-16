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

## The outline hull at the eave

An adversarial review of this branch found the next defect in the same
envelope. The roof looked like it was "hanging off" the house, and the wall
corners seemed to vanish from just above the eave. Both were the outline hull,
not the bake, the ramp or the channels. The review refuted each of those with
measurements:
- **Winding:** every triangle's winding agrees with its normal, and DoubleSide
  changes no house pixel over 21 bearings.
- **Eave shade band:** setting eaveGain to 1 moves about 1 px.
- **Channel splits:** none mixes on-slope and off-slope values.
- **Shadows:** there is no shadow map, and the cast mesh touches only ground
  pixels.

`roofHull` (`farmhouse/hull.ts`) builds the Kiln envelope from `KILN_ROOF` with
two numbers that belong to the code-built roof:
- **The eave sits too far out.** The hull puts its eave SLAB x ay (about
  0.10 m) outside the structural line. `KILN_ROOF` corrected the slab offset
  vertically but not horizontally, so the hull's eave stood at z 5.127 against
  the slab edge at 5.03, before the outline's own 0.09 push.
- **The underside hangs too low.** The hull closes its section 0.26 m below
  the eave (`FASCIA`, the code-built fascia board), while the Kiln slab's cut
  edge is about 0.15 m deep (its lowest point is y 5.19).

So a ledge in the outline colour hung under and outside both long eaves. It was
widest at the corners, and from slightly above it painted over the top of each
wall corner.

The fix is at the layer that owns it:
- `RoofSpec` gains an optional `eaveDepth`, which `roofHull` reads in place of
  `FASCIA`. It is 0.15 for `KILN_ROOF`.
- `KILN_ROOF.eaveOverhang` is 0.2, which puts the hull's eave on the slab's
  lower outer corner (z 4.88). The review's scratch test showed 0.35 still
  hung a line below the slab.
- `RoofSpec` also gains an optional `bow`, read by `slopeOf` and `roofHull`
  alike. `roofHull` bowed the slope by rise x 0.055 even with `sag` 0, which
  sank the envelope below the flat Kiln slab mid-slope and hid the rake's
  outline along the middle of each verge. `KILN_ROOF` sets it to 0. The
  code-built roofs keep `BOW` and are unchanged.

Luminance down a pixel column across the front eave in the Classic framing
(`07-from-field`, bearing -2.76, 90 m, 37 m up), top to bottom:

| Column | Backend | Before | After |
| --- | --- | --- | --- |
| x 870 | WebGL2 | slate 165, 141, 184, **92, 92**, 185, wall 214 | slate 165, 141, 92, wall 213 |
| x 870 | WebGPU | slate 165, 153, **92, 92**, 154, wall 214 | slate 165, 131, 92, wall 213 |
| x 800 | WebGL2 | slate 155, 138, 156, **92, 92, 92**, wall 219 | slate 155, 138, 115, 163, 203, wall 219 |
| x 800 | WebGPU | slate 155, 140, 177, **92, 92, 92**, wall 209 | slate 155, 140, 104, 189, 212, wall 219 |

The two- and three-pixel ledge is gone. What remains is the one-pixel outline
on the slab's own edge, which is the line the outline is for. Frames are under
`captures/farmhouse/2026-10-16/hull/{before,after}/{webgl,webgpu}/kiln-house/`
(front, east gable, field), with `hull/compare-*.png`. Neither backend logged a
console error.

**KILN_ROOF is a hand copy of the recipe's roof numbers, and it drifted.**
These are the second and third envelope numbers found wrong on this branch. The
first-principles version is to have the bake describe its roof. The recipe
would write the slab's eave and verge corners into the GLB extras, beside
`surfaceChannels`. `kilnHouse.ts` would read them, and the envelope would be
derived from them rather than copied. That is the open follow-up. It is also a
Kiln feedback item: the roof helpers' eave and verge geometry does not reach
the GLB.

## The floor and the pad

The hall floor fought the terrain. `createGableShell` builds its floor as a
0.18 m slab whose top is the house's y = 0, and the cluster stands the house on
one terrain sample at its centre (`farmhouse/cluster.ts`, `stand`). The baked
heightfield under the footprint is flat: sampled every 0.25 m it reads the pad
level (-0.616) to within 0.42 mm inside the walls and 2.7 mm across the whole
footprint. So the deck and the ground were one plane, and the terrain showed
through the floor in streaks.

**The floor now stands one 150 mm step above the yard** (`FLOOR_LIFT` in the
recipe). The fix is in the recipe because the recipe authors the floor; lifting
at the pad or `stand` would lift the walls with it and open a gap under every
wall, and a loader offset would be a correction to an asset made in code. What
moves with the deck:

- The porch step and the front threshold stone finish at the deck's level, so
  the door has no lip. The threshold now runs from the wall's outer face (where
  the step meets it) to the deck's edge on the wall centreline: it used to
  reach 80 mm into the hall, and two coplanar tops fight for depth.
- The back door's reveal, which showed the deck's raw edge, gets the same stone
  sill.
- The door leaf hangs over the deck, so it stands on it and is shortened by the
  lift under the same lintel (2.37 m, was 2.52).
- The stair rises from the deck: twelve equal risers of 0.226 m to the ceiling,
  was 0.238 from the pad.
- The ground-floor fittings (`ON_DECK`: table, benches, settle, dresser, the
  parlour's table and chair, the hearth and the fire) stand on the deck.

What does not move: the walls, the corner and porch posts, the door frame, the
partitions and the chimney breast. They still start at 0 and run through the
deck, so the house stays seated on the ground.

Why 0.15 and not 0.12, which was the porch step's authored height: the game lays
its cast shadows as an alpha slab 0.12 m above the ground
(`farmhouse/shadows.ts`, `LIFT`), and the house's own shadow starts under its
footprint. A deck at 0.12 was coplanar with that slab and striped across the
hall in the lab. At 0.03 the slab stood 90 mm above the deck and darkened the
whole hall floor, which no capture had flagged. At 0.15 the deck occludes it.

Measured in the lab, not guessed, on the share of pixels that are the terrain's
green (G - R > 4) in three frames:
- `10-hall`, which stands in the hall and frames the whole deck: rows 200 to 900.
- `09-doorway`, from 9.5 m: the floor seen through the door.
- `07-from-field`, the Classic camera's line at about 90 m: a box on the door.

| Lift | Hall, WebGL2 | Hall, WebGPU | Doorway | From the field |
| --- | --- | --- | --- | --- |
| 0 | 19.39% | 3.87% | 0.00% | 0.00% |
| 1 cm | 0.28% | 0.28% | 0.00% | - |
| 3 cm | 0.24% | 0.24% | 0.00% | 0.00% |
| **15 cm** | **0.00%** | **0.00%** | **0.00%** | **0.00%** |

The doorway and far-view boxes read clean at every lift in a still frame. Only
the hall view tells the lifts apart. The residue at 1 and 3 cm was the grass:
tufts stood up through the floor because the grass bake did not cut the
buildings. That is fixed in the grass bake, not the house (below). The 15 cm
captures are taken over the grass baked for the Kiln house, which is what
ships once the constant flips.

## Grass under the buildings

`tools/bake-grass.mjs` had two authorities, HOME_FIELD and the terrain pads.
The farmhouse and barn pads are thinned farmyard, which is right for a yard,
but nothing cut the buildings themselves, so tufts grew inside them. The bake
now reads a third authority, the one spec/04 names ("structures get ... declared
scatter keep-out rects"): `farmhouse/plan.ts` and `source.ts`, bundled through
esbuild as the other two are.

The bake hard-cuts the footprints that ship. Each is an oriented rectangle in
its building's own frame (`HOUSE_AT`/`YAW`, `BARN_AT`/`BARN_YAW`, the wing
through `offsetStand`), using the existing `cutRim`:

- **`'procedural'`:** the range's walls plus the plinth's 0.22 m, the wing the
  same way, the porch's covered ground and the lean-to.
- **`'kiln'`:** the Kiln house's outer walls (19.15 by 9.15; its thresholds lie
  inside them) and its porch out to the posts.
- **Either way:** the barn plus plinth, and its lean-to.

The porch, lean-to and plinth sizes moved from function bodies into `plan.ts`
(`PORCH`, `LEANTO_DEPTH`, `PLINTH_OUT`, `KILN_PORCH`), so the geometry and the
bake read one number.

The coupling to the source constant is deliberate. Flipping `FARMHOUSE_SOURCE`
changes which ground is under a building, so the flip requires a grass rebake
in the same commit. The manifest records `farmhouseSource`, and
`tests/grass-bake.spec.ts` fails, naming the rebake, when the two disagree.
That is the discipline the bake already applies to the terrain seed. The
manifest's format version is unchanged; the byte layout did not move.

Tufts each cut removed, from the bake's own count (candidates the rest of the
density field kept and the building cut rejected, rim included):

| Footprint | `'procedural'` (committed) | `'kiln'` |
| --- | --- | --- |
| House (range or Kiln walls) | 27 | 30 |
| Wing | 19 | - |
| Porch | 2 | 3 |
| Lean-to | 9 | - |
| Barn | 8 | 7 |
| Barn lean-to | 1 | 2 |

The counts are small because the farmyard pads already thin the grass to 0.2.
Inside the walls, strictly, the old bake had 22 tufts in the range, 14 in the
wing, 7 in the lean-to and 6 in the barn, and 23 inside the Kiln house's
footprint. Both new bakes have none inside any footprint that ships.

The committed bake has 98,258 tufts (was 98,347). The field tier is the same
candidate set less the cut. Its shuffled order changes, and the surround tier
re-rolls, because the shuffle consumes the one seeded stream. The cut runs in
`density()` before placement, so the prefix test holds.

## Re-baking

```
node C:/Users/Mattm/X/kiln-oss/dist/cli.mjs render assets/house/farmhouse.kiln.js --out assets/house/farmhouse.glb
node tools/record-house-asset.mjs
KILN_CLI=C:/Users/Mattm/X/kiln-oss/dist/cli.mjs node tools/record-house-asset.mjs --check
```

The bake is 2.5 s and reproduces byte for byte from a cold directory:
193,888 bytes, SHA-256 `5f93b32a...1376fa`, 283 mesh nodes, 190 meshes,
3,478 triangles (12 are the back door's new sill), 20.05 by 12.30 by 11.87 m,
0 glTF errors or warnings, Kiln QA `accepted`/`pass`. With the floor work taken
out (`FLOOR_LIFT` 0, before the sill and the threshold change) the recipe
baked `eab29911...f25310`, the channels-only bake.

## Evidence

Lab captures, `tools/farmhouse-lab-capture.mjs`, eight standard views per
subject (front, front-west, front-east, porch, east gable, back-west, from the
field at 90 m, silhouette with the ground off) and two close-ups for the floor
(`09-doorway`, `10-hall`), WebGL2 (`?debug=webgl`) and
WebGPU, 1600 by 900. Headless WebGPU drew the frame, so the WebGL2 fallback was
not needed for it. Before the rebase onto 1eabfa34 every WebGPU run logged
one `Async render pipeline creation failed ... [Texture "output"] usage`
error, the code-built house and the Release 1 tree included. That was the
lab mounting with its loop running, fixed on main; the 15 cm and final
captures log none on either backend.

- `captures/farmhouse/2026-10-16/before/{webgl,webgpu}/kiln-house/`: the
  Release 1 bake and loader, from a `git archive` of 86fe175f.
- `captures/farmhouse/2026-10-16/after/{webgl,webgpu}/kiln-house/`: this bake,
  floor included, over the grass baked for the Kiln house.
- `captures/farmhouse/2026-10-16/after/{webgl,webgpu}/house/`: the code-built
  house at the same frames, for context only. The lab gained a
  `House (procedural)` subject so the two share target and frame.
- `captures/farmhouse/2026-10-16/compare/`: before beside after, WebGL2, and
  `porch-*.png` at 3x on the porch.
- `captures/farmhouse/2026-10-16/floor/lift-{0,1cm,3cm,15cm}/{webgl,webgpu}/kiln-house/`:
  the floor views at each lift (`09-doorway`, `10-hall`, and `04-porch` and
  `07-from-field` at 0, 3 and 15 cm), and `floor/compare/` with 0, 1 and 3 cm
  side by side.
- `captures/farmhouse/2026-10-16/grass-cut/{before,after}/webgl/house/` and
  `grass-cut/compare-*.png`: the code-built house over the old and the new
  grass bake.

`captures/` is gitignored; the files are on the owner's PC.

Visible in the comparison: the porch roof gains its own eave ramp and a course
line, and its slab edges go plain; the tympanum and post heads take a band
under the porch slopes; the gables carry a band along the rake instead of none;
the long walls show the eave band under the slab; the line across both gables
is gone.

Verification on this PC: lint, typecheck and `typecheck:lab` clean; the build
exits 0 and ships no model with `'procedural'`; a temporary `'kiln'` build
shipped exactly one, `assets/farmhouse-WGhzLvo6.glb`, digest-equal to the
ledger, and `tests/treeline-assets.spec.ts` passed against it, while
`tests/grass-bake.spec.ts` failed as intended, naming the grass rebake the flip
needs; discovery exit 0.
The full suite: 821 of 822 pass; the one failure, `tests/audio-manifest.spec.ts`,
is environmental: `assets/audio/licensed/` is absent from a fresh worktree.

## For the owner

1. The look review on the production build, desktop and phone, WebGPU and
   WebGL2, with `FARMHOUSE_SOURCE` set to `'kiln'` locally and the grass rebaked
   for it.
2. The hub receipt: build once per value, `tools/hub-presentation-probe.mjs`
   against both `dist/` copies. The kiln arm's main chunk is 2,416.80 kB raw /
   668.44 kB gzip against 2,369.69 / 653.57 for procedural, plus the 193 kB GLB.
3. Then the constant flips, in its own commit, with the grass rebake
   (`node tools/bake-grass.mjs`) that cuts the Kiln footprint instead.

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
| missing capability | export, `createGableRoof` and the GLB bridge | The roof's eave and verge geometry (eave corner, edge depth, oversail) is not available downstream. Only the triangles reach the GLB, so the game's outline envelope (`KILN_ROOF`) is a hand copy of the recipe's numbers, and it drifted twice. A roof helper that stamps its eave and verge lines into the node extras (`kilnSemantic` already names the roles) would let the envelope be derived. Until then the recipe could write them itself beside `surfaceChannels`. |
| fine | QA | 0 glTF errors and warnings, `accepted`/`pass`, before and after. |
