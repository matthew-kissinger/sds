# Threshing barn (Kiln)

A three-bay timber barn under a gambrel, boarded in rust-red on a stone sill
wall: cart doors in the middle bay of the south wall standing open on their
hinges, a threshing floor and two framed bents behind them with a lantern hung
inside the door, lofts over both side bays with hay in them, a hay door under a
hood high in the west gable with one leaf swung out, a lit loft window in the
east gable, a stable door with its upper leaf hooked back, shut winnowing doors
on the north side, and a louvred cupola with a weathervane over the east mow.

**Whether it ships is one constant.** `BARN_SOURCE` in
`app/src/scene/farmhouse/barnSource.ts` is `'procedural'` or `'kiln'`,
independently of `FARMHOUSE_SOURCE`. `Farmhouse` reads it; with `'kiln'` the game
loads this GLB (`farmhouse/kilnBarn.ts`) and welds it into the cluster in place
of the procedural barn, lean-to, cart-door hood, cupola, plinth and openings.
The value changes only after a hub timing receipt, as for the house, and the
grass is re-baked in the same commit (below). In a `'procedural'` build this file
does not reach `dist/`. The asset lab's `Barn (Kiln)` subject mounts it whatever
the constant says, `Barn (procedural)` mounts the code-built barn at the same
target and frame, and `node tools/barn-lab-capture.mjs` takes the standard views
of both into `captures/barn/<label>/` (gitignored).

## What is authored, and what is baked

`barn.kiln.js` is the editable source: a geometry program, read and revised like
any other file here. `barn.glb` is what it bakes to, via
[Kiln](https://github.com/instruktlabs/kiln) (`@instruktlabs/kiln` 1.2.3, MIT),
which is a tool and not a dependency - nothing imports it:

```
kiln render assets/barn/barn.kiln.js --out assets/barn/barn.glb
node tools/record-barn-asset.mjs
```

On the owner's PC `kiln` is the checkout at `C:/Users/Mattm/X/kiln-oss`
(`node C:/Users/Mattm/X/kiln-oss/dist/cli.mjs render ...`, or `KILN_CLI` set to
that `dist/cli.mjs` for the ledger's cold bake). `node tools/record-barn-asset.mjs
--check` re-renders from a scratch directory with no `.kiln/` cache and fails
unless the result is byte-identical to the recorded digest.

## Where it stands

In the procedural barn's box, on purpose: 16.5 by 10.8 m to the boards and a
ridge at 10.5 m are `BARN` in `farmhouse/plan.ts`, and it is authored at the
centre of that footprint with +X along the ridge, -Z out of the cart doors and
+Y up, which is the frame `BARN_AT` (12, 143) and `BARN_YAW` (0.14 rad) place.
So the pad, the yaw and the cast shadow (`BARN`'s box, `farmhouse/shadows.ts`)
are the same for either source.

**Its ground footprint**, in the barn's own frame (metres), which the recipe
writes into the GLB (`extras.footprint`) and `KILN_BARN_FOOTPRINT` in `plan.ts`
repeats for the grass bake:

| Rectangle | x | z | What covers it |
| --- | --- | --- | --- |
| `barn` | -8.33 .. 8.33 | -5.48 .. 5.48 | the walls and the stone sill wall, 0.08 proud of the boards |
| `barn apron` | -3.10 .. 4.00 | -7.50 .. -5.48 | the stone apron under the swing of both cart-door leaves |
| `barn step` | 4.60 .. 6.00 | -5.90 .. -5.48 | the step at the stable door |

The apron's south-east corner is the barn's nearest point to the pasture; at
the barn's yaw it lands on the pad's south edge (z 135) and no further. The
farmer's route passes 2.41 m from the walls, 1.25 m from the nearer open leaf
and 1.02 m from the apron's corner (`tests/barn-kiln.spec.ts`).

**Its section:**

| Level | y (m) | |
| --- | --- | --- |
| Foot | -0.05 | every wall, plinth and step starts a hand's depth under the pad |
| Apron and step | 0.14 | a centimetre under the floor |
| Threshing floor | 0.15 | one step up, as for the house: a floor at the pad's own height fights the ground through the doors |
| Sill wall | 0.55 | where the boards start |
| Eave (wall head) | 4.77 | under the slate's flare |
| Knee | 9.33 | the gambrel's break, 2.9 m off the ridge line |
| Ridge | 10.5 | `BARN.ridgeHeight` |
| Cupola | 10.0 .. 11.5 | its body stands in the slate, between the slab's two faces |
| Cupola apex | 12.45 | the vane runs to 13.4 |

## Why a gambrel

The game's sun is eight degrees up in the north-west and both cameras look
north, so the door elevation and any south-facing slope of ordinary pitch sit
in the shadow band. The procedural barn's plain gable, at this ridge over its
6.2 m walls, is 38.5 degrees and half-lambert 0.35 on the south slope: from the
Classic approach, one dark slab over one dark wall. This roof's planes, south
side, at the barn's yaw:

| Plane | Pitch | Half-lambert | Band |
| --- | --- | --- | --- |
| flare, z 6.0 .. 5.4 | 30.3 | 0.39 | shadow |
| skirt, z 5.4 .. 2.9 | 60.0 | 0.25 | shadow |
| cap, z 2.9 .. 0 | 22.0 | 0.44 | body |

with the shadow band ending at 0.42 behind a terminator 0.07 wide. At 25.8
degrees the cap sat on the terminator's midpoint, half a band; 22 is the
shallowest that still sheds as slate and puts nine-tenths of the body band into
it. The roof carries two values, and the outline says barn before anything else
in it is read.

## How it arrives in this game's painting

Exactly as the farmhouse does (`assets/house/README.md`). The six material names
are band sets - `boards` is the rust-red `barn` set, `slate` the roof set,
`timber`, `stone` (`dress`), `opening` and `lamp` the cluster's own - and two
per-vertex channels ride in TEXCOORD_0, recorded on the root node as
`extras.surfaceChannels` (version 1), the convention the farmhouse recipe
established at 523bd7a5 (in main since PR 121):

| Channel | Surface | Meaning |
| --- | --- | --- |
| `uv.x` | slate | 1: the barn's browner slate (`BARN_ROOF`) inside the shared roof set |
| `uv.x` | every other | 0 |
| `uv.y` | boards, timber | metres below the roof underside directly over the face - a soffit, the ceiling, the hood's or the cupola cap's - so the first 0.46 m is the shadow band under an eave, a verge or the cap. Negative where a face runs up out of sight (a gable top 0.06 m into the slab, the cupola's head 0.08 m into its cap). 9 indoors and where no roof is over the face |
| `uv.y` | slate | metres along the slate from its eave edge, straight across the knee (0 at the eave, 5.693 at the knee, 8.821 at the ridge): the cap of a gambrel is the same roof getting more sky, not a second eave. -1 on slate that is not that surface (the ridge roll, the slab edges, the cupola cap) |
| `uv.y` | stone | 9 |
| both | opening, lamp | 0 |

`writeSurfaceChannels` in the recipe computes them from its own parts: a
vertical ray from just off each exterior face to the first downward-facing
underside over it, after splitting faces where the underside bends (the ridge,
the knee and flare mitres, the hood) and where the roof ends, so the distance is
linear across every triangle. Distances are rounded to the millimetre, which the
shader cannot resolve finer and which lets the export weld shared corners.

**Two more records ride beside the channels.** `extras.outlineEnvelope`
(version 1) is what the outline's inverted hull is grown from
(`farmhouse/hull.ts` `envelopeHull`): the slab's top and underside as one
section across the ridge, extruded between the verges; the walls and the
cupola's body as boxes; the cupola's cap as a pyramid. The game derives the hull
from it rather than from numbers copied into `plan.ts`, and draws the roof half
of the slab only, so the outline's 90 mm push stays inside the slate instead of
hanging a ledge under the eaves. The loader refuses a bake without it.
`extras.footprint` is the table above.

## Cost

**2,350 triangles against a budget of 2,800, and no added draws**: the six sets
weld into buffers the cluster already draws, so it stays at ten. No textures.
By set: timber 1,301, boards 658, opening 301, stone 48, slate 32, lamp 10.
The procedural barn it replaces is 496 triangles, and its outline 194 against
the envelope's 78, so the whole cluster goes from 4,874 to 6,612 triangles with
this barn (8,958 with the Kiln house as well).

## Not in this asset

- No lean-to. The procedural barn has one on its south side; this barn's south
  wall carries the cart doors, the stable door and the apron instead.
- The hay hood and the vane are not in the outline envelope: the hood is a
  triangle of the roof's own upper planes and the verge's outline runs through
  its root.
- The cast shadow is `BARN`'s box, which this barn fills to the centimetre; the
  cupola is not in it, as it is not for the procedural barn.

## Provenance

All source is owned by Matthew Kissinger under AGPL-3.0-or-later (`LICENSE`).
No external mesh, texture or animation is downloaded; the GLB carries no images
and samples no texture. `asset-manifest.json` pins the recipe and the import
chain by SHA-256 over UTF-8 text normalised to LF, and the baked GLB by SHA-256
over its raw bytes.

## Known observations

Kiln's QA pass accepts the bake (`asset.requirements.v1`, 0 glTF errors, 0
warnings) and reports, as an observation, that 38 of its 42 parts could not be
measured for self-intersection because they are not closed solids. They are
not meant to be: a wall is a holed sheet, a soffit is one face. The parts that
overlap on purpose - the cupola sunk into the slate, every wall top run up into
the slab - are joinery.
