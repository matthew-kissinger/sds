# Walk-in farmhouse

A farmhouse you can stand in front of and, eventually, walk into: a door on its
hinges, a porch over the step, reveals with real depth, and a hall, fireplace
and stair behind the front wall. It exists so the question "can the farmer go
inside" has an answer that is not "model it twice".

**Whether it ships is one constant.** `FARMHOUSE_SOURCE` in
`app/src/scene/farmhouse/source.ts` is `'procedural'` or `'kiln'`. `Farmhouse`
reads it; with `'kiln'` the game loads this GLB (`farmhouse/kilnHouse.ts`, the only
GLB the runtime loads) and welds it into the cluster in place of the procedural
range, wing, porch and stack. It stands on the same pad at the same yaw either
way. The value changes only after a hub timing receipt shows no load-time or
frame-time regression: build once per value, probe both. In a `'procedural'`
build no model reaches `dist/`. The asset lab's `House (Kiln)` subject mounts the
Kiln source whatever the constant says, so the two can be flipped between with
the camera held.

## What is authored, and what is baked

`farmhouse.kiln.js` is the editable source: a geometry program, read and revised
like any other file here. `farmhouse.glb` is what that program bakes to, via
[Kiln](https://github.com/instruktlabs/kiln) (`@instruktlabs/kiln` 1.2.3, MIT).
Kiln is not a dependency of this repository - nothing imports it, and the game
does not need it to run. It is a tool that turns the recipe into the artifact:

```
kiln render assets/house/farmhouse.kiln.js --out assets/house/farmhouse.glb
```

That bake is deterministic, and the ledger tests the claim rather than making
it. `node tools/record-house-asset.mjs --check` re-renders from a scratch
directory - which has no `.kiln/` cache to answer from - and fails unless the
result is byte-identical to the recorded digest.

## How a GLB arrives in this game's painting

The look here does not live in the asset. It lives in `farmhouse/bands.ts`,
which solves backwards through the tone map and the grade so `palette.ts` can
author the sRGB a screenshot should contain, and in a channel convention a glTF
file has no way to carry: `uv.x` names *which* surface a triangle is, and `uv.y`
carries a distance in metres - below a roof edge on a wall, up the slope on
slate. A baked UV would be meaningless to it.

So `app/src/scene/farmhouse/kilnHouse.ts` does not import a look, it reconstructs one. Each
of the seven material names in the GLB is the name of a farmhouse band set, and
that binding is the whole interface: `limewash` is `wall`, `slate` is `roof`,
`stone` and `masonry` are the two `dress` channels, and so on. The loader bakes
each node's world matrix, derives `uv.x` from the material it was authored
against and `uv.y` from world position, and sorts 282 mesh nodes into one list
per band set, which `farmhouse/cluster.ts` welds into the cluster's own buffers. The shipped `makeFarmhouseSurfaceMaterial` then draws it. No new
shader, no texture, nothing sampled.

The cost of that: **3,440 triangles and no added draws** (the six band sets weld
into buffers the cluster already draws), no textures. For comparison,
the entire shipped procedural cluster - house, cross wing, two lean-tos, porch,
barn, cupola, outshot, cart-door hood, all 23 openings and the smoke plume -
measures 4,874 triangles. One building with an interior and a storey inside it
is seven tenths of the whole homestead, which is the trade this route asks you
to accept.

## Provenance

All source is owned by Matthew Kissinger under AGPL-3.0-or-later (`LICENSE`).
No external mesh, texture or animation is downloaded; the GLB carries no images
and samples no texture. `asset-manifest.json` pins the recipe and the import
chain by SHA-256 over UTF-8 text normalised to LF, so checkout line endings do
not invalidate provenance, and pins the baked GLB by SHA-256 over its raw bytes,
because a binary has no line endings to normalise.

After an intentional change to the recipe, re-bake and re-record:

```
kiln render assets/house/farmhouse.kiln.js --out assets/house/farmhouse.glb
node tools/record-house-asset.mjs
```

`--check` verifies the ledger and the cold bake without writing either.

## The section

Stated once, because an elevation that promises a storey the inside does not
have is the fault this asset had on its first pass:

| Level | From | To | What is there |
| --- | --- | --- | --- |
| Ground | 0 | 2.86 | Hall with the fire and the front door, parlour past the partition |
| First | 2.86 | 5.80 | Three bedrooms off a railed landing, reached by the stair through the well |
| Loft | 5.80 | ridge | Roof space, one light in each gable, reached by a hatch over the landing |

The windows are placed from that table and not the other way round. A
first-floor sill at 3.5 m stands 640 mm over its own floor and its head at
4.85 m leaves most of a metre to the wall head.

## Known observations

Kiln's structural pass reports overlapping solids where parts are deliberately
embedded in one another - shelves in the dresser carcass, logs in the fire,
the chimney shoulder in its shaft, the tympanum behind the porch slopes. Those
are joinery, not faults. It also samples only 64 of 729 overlapping pairs, so
the pass is evidence and not a proof.

What it did catch, on a part no view sheet would have shown: the porch tympanum
was a twisted prism with its underside wound into the solid, because the back
face was stored already-reversed and the rim then paired the wrong corners.
`triangleGable` builds both faces from one outline now.

## Corrected on review, 2026-10-15

Four faults an owner's eye found that no structural pass would have:

- **The gable wall appeared to break through the roof.** It did not; it was
  exactly coplanar with it. The gable triangles were handed the roof's own span
  and rise, so their sloping top edge and the slate's top face both finished at
  y 10.72 and z-fought the length of the pitch, as a bright stripe a hand's
  breadth in from the verge. The triangles are built to a plane 200 mm below the
  slate's top face now - inside the slab, touching neither surface.
- **The eaves hid the first floor.** A 1.15 m overhang on this pitch buys a
  1.23 m drop, which put the eaves edge at 4.44 m and the first-floor window
  heads at 5.05: the roof hung down past the top of the windows. The overhang is
  450 mm, the heads came down to 4.85, and the eaves clear them by 338 mm.
- **The corners had holes in them.** `createGableShell` builds every wall on its
  centreline, so the long walls stopped 275 mm short of the end walls' outer
  face and left a 275 mm square column of nothing at each corner, full height,
  with a double-lapped overlap beside it. One post per corner closes it flush.
- **There was no first floor.** The deck and the stair were right and everything
  that made the deck a floor was missing, so eight windows opened onto a lid
  with a 4.9 m void over it. See the section above.
