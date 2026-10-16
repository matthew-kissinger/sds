# Spike: texture atlas versus procedural surface, on a barn wall

Branch `experiment/surface-atlas`. Experimental, not for merge. Started
2026-10-16 from the owner's question: would procedural textures and texture
atlases be smarter for the farmhouse, the barn, the fence, the gate and the
trees? The assessment at the time was that the game's TSL materials already
ARE the gradient-mapped, per-pixel procedural path spec/05 allows, that the
scene sits at 27 to 29 draw calls against a budget of 100 so atlases buy no
batching, and that the diagonal shading on the Kiln house's walls is a
per-vertex channel defect and not a limit of the approach. This spike tests
that claim on one asset with measurements rather than leaving it as an
opinion.

## The win condition, fixed before anything was built

One barn wall, board and batten, three panels side by side in the asset lab,
same geometry, same banded base colour (`BARN` through the shared toon ramp),
same eave shade from the surface channel:

- **A, procedural.** The surface modulation (boards, battens, grain drift,
  weathering) computed per pixel in TSL from the panel's own coordinates.
- **B, atlas.** The SAME modulation, evaluated once at bake time into one cell
  of a KTX2 atlas (four cells: barn boards, barn boards with painted extras,
  limewash, slate, so the atlas mechanics - cell insets, repeats inside a
  cell, mip bleed - are exercised honestly), sampled through a second UV set
  because `TEXCOORD_0` carries the surface channels. The content is identical
  to A; what differs is the delivery mechanism, so any difference seen is the
  mechanism's.
- **B+, atlas with painted extras.** B's cell with detail a shader would not
  compute cheaply per pixel: knots and nail heads. The one honest advantage of
  a texture is authored detail, so it gets its own panel rather than being
  mixed into the mechanism comparison.

The atlas path wins if EITHER holds:

1. The owner judges B or B+ better than A side by side at both the Classic
   distance (about 90 m) and a 3 m close-up, with no visible seam, bleed or
   mip blur; or
2. B costs less on the hub (frame or GPU time at the lab's spike subject, one
   panel at a time), stays under the artifact budget (spec/08: under 8 MB
   first load, of which 3.2.1 already uses 8.5 MB uncompressed on disk), and
   adds no draw call.

If neither holds, the answer is "procedural stays", and the spike's value is
the measured reasons.

Numbers from this workstation are not evidence (AGENTS.md measurement lanes):
frame times come from the hub only. Everything else here (bytes, texture
memory, draw calls, differences measured in captures) is machine-independent.

## What was built

- `lab/src/spike/boardMath.ts`: the surfaces as plain arithmetic (barn boards,
  the same with painted extras, limewash, slate), no dependency on three.
- `lab/src/spike/boardSurface.ts`: the TSL twin of `barnBoards`, line for line
  from the same constants.
- `tools/bake-surface-atlas.mjs`: bundles the math with esbuild (as
  `bake-grass.mjs` bundles the layout), evaluates it per texel into a 2048 by
  2048 RGBA8 atlas of four 1024 cells (256 texels a metre), builds the 12-level
  mip chain, writes `assets/spike/surface-atlas.ktx2` (Zstandard
  supercompression, linear transfer, read by three's KTX2Loader without a
  transcoder), a PNG for the eye and a manifest. 2.8 s, byte-deterministic.
- `lab/src/SurfaceSpike.tsx`: the lab part. A flat 8 by 4 m panel facing +z on
  the farmhouse pad; `uv` carries the game's surface channels (kind, metres
  below the eave), `uv1` the cell coordinate. A: the banded `BARN` base times
  `barnBoardsNode` times the eave shade, through `makeToonMaterial`. B and B+:
  the same with the atlas sample in place of the node, inset half a texel
  inside the cell, repeated with `fract`, sampled with explicit gradients of
  the continuous coordinate so the repeat seam cannot spike the mip level.
  `?spike=a|b|bplus` mounts one panel at the subject's target so one camera
  can be put on each in turn.
- `lab/src/subjects.ts`: the "Surface spike" subject.
- `tools/surface-spike-capture.mjs`: the same five views on each panel, both
  backends, plus the row; `tools/surface-spike-metrics.mjs`: numbers from the
  frames. Captures under `captures/spike/2026-10-16/` (gitignored):
  `<backend>/<a|b|bplus|all>/*.png`, `compare/*.png` for side by side.

Kiln was not used in this spike, so there is no Kiln feedback from it.

## Measurements

**The asset.** 2048 by 2048, four cells, 12 mip levels.

| | bytes |
| --- | ---: |
| KTX2 on the wire (zstd) | 254,468 |
| PNG of level 0 | 96,149 |
| GPU, RGBA8 with mips | 22,369,620 |
| GPU, Basis UASTC with mips (estimate; needs an encoder the repo lacks) | 5,592,405 |

For scale: the whole 3.2.1 artifact is 8,501,460 bytes on disk and the Kiln
house is 190 kB. One atlas at this density is the size of the house on the
wire and a hundred times it on the GPU.

**Draw calls and bindings.** One panel on the farmhouse pad with terrain and
grass: 18 draw calls for A, 18 for B. B adds one texture (18 to 19). No draw
call changes either way, as expected: batching is by band set already.

**Frames.** Centre crops holding the panel; luminance 0..255; "sharp" is the
variance of a 3 by 3 Laplacian (edge energy), WebGPU. WebGL2 is within noise.

| view | diff A-B mean | pixels differing >8 | sharp A | sharp B | sharp B+ |
| --- | ---: | ---: | ---: | ---: | ---: |
| Classic, 90 m | 0.42 | 1.4% | 1846.9 | 1841.6 | 1841.2 |
| three-quarter, 20 m | 0.53 | 1.7% | 613.1 | 599.2 | 600.2 |
| close, 3 m | 2.13 | 5.8% | 15.6 | 4.9 | 5.2 |
| close, 3 m oblique | 1.32 | 3.9% | 47.3 | 36.4 | 36.9 |
| close, 1.5 m | 2.39 | 9.8% | 12.5 | 2.1 | 2.2 |

Reading it:

- **At 90 m and 20 m the two are the same picture.** Mean differences under
  one level, edge energy within half a percent (and dominated by the grass).
  Nothing an atlas does is visible at the distances the game's cameras use.
- **At 3 m and closer the atlas is softer.** B keeps a third of A's edge
  energy at 3 m and a sixth at 1.5 m: the grain streaks and the batten shadow
  lines blur, because 256 texels a metre is under the screen's density there
  (about 440 pixels a metre at 3 m and 880 at 1.5 m, at 1600 wide). Matching
  A at 1.5 m would need about four times the texel density and sixteen times
  the memory: a 4096 cell per 4 m of wall, the four-cell atlas at 8192 square,
  268 MB RGBA8 or 67 MB UASTC. A costs the same at every distance.
- **No seam, no bleed.** The half-texel inset and the explicit gradients hold
  at the cell boundary in every view; the oblique 3 m view shows no mip line.
  That is the mechanics working as designed, not an advantage: the procedural
  panel has nothing to get right there.
- **The repeat.** B's 8 m panel shows its 4 m cell twice, the same board tone
  sequence in the same order. A shows it too, but only because its twin was
  made periodic to match the cell; a real procedural material reads world
  position and never repeats. One more point to A on any wall longer than a
  cell.
- **B+, the painted extras.** Knots and nail heads read at 1.5 m, are specks
  at 3 m, and do not exist at 20 m or 90 m (sharp B+ equals sharp B at every
  distance). The detail a texture carries well is detail the game's cameras
  never reach, and spec/05 asks for masses, not detail.
- **What a texture cannot carry.** The eave shade had to stay in the shader
  for all three panels: it is a function of the vertex channel (metres below
  the roof edge), that is, of the geometry, and the farmhouse's whole surface
  contract is geometry-dependent shading (eave band, damp course, slate
  courses up the slope, masonry courses by height). An atlas would need those
  terms computed anyway, so it replaces part of the shader, not the shader.

**Cost on the GPU.** Not measured on the hub in this spike. The shader side
is a few dozen operations a pixel for A (two sines, two hashes, a handful of
steps; the shipped farmhouse surface already runs four painted fields and is
within budget) against one trilinear fetch with 4x anisotropy for B. A barn
wall covers one to two percent of a frame at the Classic distance, so neither
is measurable at frame level; what B adds that IS measurable is the GPU
allocation (22 MB RGBA8, or 5.6 MB with an encoder we do not have), a 250 kB
download and a Zstandard decode in wasm at boot. To take the hub number
anyway, on the hub:

```
node tools/surface-spike-capture.mjs --backend webgpu --variants a,b
```

writes `captures/spike/<date>/webgpu/<a|b>/counters.json` with the lab's
frame interval per variant; a GPU-time figure would need timestamp queries
the lab does not have.

## Recommendation

**Procedural stays.** The atlas path meets neither win condition:

1. Side by side it is not better. It is the same picture at 90 m and 20 m and
   a softer one at 3 m and 1.5 m, with a repeat the procedural surface does
   not have. B+ adds detail that is invisible from every gameplay camera.
2. It is not cheaper. Zero draw calls saved, one texture binding added, 5.6
   to 22 MB of GPU memory and a boot-time decode added, against a per-pixel
   saving too small to measure on a wall.

The question underneath the owner's ("would atlases make the barn and house
look better?") has a different answer: richer surfaces come from the TSL
materials themselves, which is where the barn's board-and-batten relief, the
limewash drift and the slate courses already live, and which the Kiln barn
work can extend. Revisit textures only for an asset that needs authored,
non-geometric detail at close range; none of the game's cameras go there.

Side effect worth keeping from this branch: the lab now gates its loop on
both the renderer stage and `sceneReady`, because the game store outlives a
hot reload of the lab tree (`lab/src/LabApp.tsx`); that one line goes to
`main` on its own.
