# Cycle 117 Phase 6: the island pasture, looked at

> Captured 2026-07-26 against `3273bd9c` plus one uncommitted edit (the D29 column tune, below), on the production WebGPU path. Every session reported `window.__sdsG.productionWebGpu.ok === true`, `__sdsRendererMode.effective === 'webgpu-production'` and `sceneManager.renderer.isWebGPURenderer === true`, on installed Chrome, headed, `--use-angle=d3d11 --enable-gpu --enable-unsafe-webgpu --ignore-gpu-blocklist`. Nothing here is a WebGL frame.

Harnesses, all new and all read-only against production:

| File | What it does |
|---|---|
| [`island-recon.mjs`](island-recon.mjs) | one boot, dumps terrain, structures, cue state, network |
| [`approach-los.mjs`](approach-los.mjs) | node-side line-of-sight solver over the shipped bake |
| [`island-probe.mjs`](island-probe.mjs) | the shot list, one page re-posed per shot |
| [`island-diagnostics.mjs`](island-diagnostics.mjs) | AABBs, post grounding, scatter, retirement drive |

Frames in [`probe/before/`](probe/before/) (as shipped) and [`probe/after/`](probe/after/) (with the tune). `probe/diagnostics.json` and `probe/recon.json` carry the numbers.

---

## What is right

| # | Claim | Evidence | What is actually there |
|---|---|---|---|
| 1 | Fence posts self-ground per piece | `diagnostics.json` `fenceRuns` | All 35 post instances across 5 runs sit within **0.013 m** of `_groundY` at their own (x, z). Worst gap +0.013 m, best 0.000. No floating posts anywhere. |
| 2 | Rails span the true slope | `before/09-fence-worst-side`, `before/10-fence-west-run`, `before/11-fence-south-run` | The worst run (north edge, x 56 to 68, dropping 28.20 to 24.84 m over 9 m) reads as a hillside fence, which is what it is. Rails meet posts, no holes under the bottom rail, the bays kink at the joints the way a real post-and-rail fence does. **Deliberate, not broken.** |
| 3 | No lightning | `diagnostics.json` `zaps` | `corral-retired` fired **0** times across a 12-second retirement drive with 9 sheep crossing. `gate-retired` fired 0 (correct: a pen scene retires inside the barrier and the cue reads crossings through `createPenCrossingObserver`, which counted **9 pulses**). |
| 4 | No flag pillar, no zap object | `diagnostics.json` `suspicious` | A full scene-graph traverse for `/zap\|lightning\|bolt\|flag\|pillar\|corral\|diamond\|octahedron/` returns **nothing**. |
| 5 | D28: the floating diamond is gone | `before/30-from-behind`, `before/31-from-below`, `before/40-classic-overview` | Confirmed in exactly the framings Cycle 116 caught it in, including from behind the pen and from below the slope. The only `depthTest: false` mesh left in the scene is `HosekWilkieSkyDome`. |
| 6 | The competitive cone is untouched | `git show 3273bd9c -- js/Sheepdog.js` | The cycle's diff touches `distanceIndicator` only; the single `playerIcon` line in the diff is context, not a change. `createPlayerIcon` / `updatePlayerIcon` / `removePlayerIcon` are byte-identical. |
| 7 | `scatterKeepOut` works | `diagnostics.json` `near` | **0** trees and **0** rocks inside the 36 x 36 m pen rect. Three trees within 8 m of it, all outside: (26.11, -98.39), (26.74, -73.12), (61.23, -50.31). |
| 8 | Sheep settle inside, they do not pile or teleport | `probe/50-retire-after.png` | 9 sheep stand in a loose group against the south fence, spaced, upright. The rest are pressed against the **outside** of the west and south fences, which is the barrier doing its job (0 wall entries). |
| 9 | The gate leaves swing INTO the pen, and clip nothing | `diagnostics.json` `gateNodes`, `before/06-gate-plan` | Both leaves occupy z -63.30 to -57.90 against a fence line at z = -58. They swing **5.30 m inward** and **0.10 m outward**, so neither is in the approach path. Left leaf x 53.90 to 55.82 (post at 56), right leaf 44.18 to 46.10 (post at 44): neither reaches a fence stub. Phase 4's "swings up to ~1.5 m outward past the fence line" has the sign backwards; the real number is 0.10 m out and 5.30 m in. |
| 10 | Impostors and the basis transcoder | `recon.json` `matchedRequests`, `diagnostics.json` `impostors` | See item 8 in the defect-free section below. All four sub-claims pass. |
| 11 | The pasture reads as a place from above | `before/06-gate-plan`, `before/14-pasture-wide`, `before/41-dusk-pasture` | From a 3/4 elevation it is unmistakably an enclosure with one mouth and a worn apron outside it. At golden hour it is genuinely good. |

### Impostors, end to end (the loose end from `d75a7546`)

All confirmed in one real-WebGPU session, `recon.json` and `diagnostics.json`:

- **(a)** `http://localhost:3000/assets/vendor/basis/basis_transcoder.js` and `…/basis_transcoder.wasm` are both fetched, from the vendored path. No `basis_transcoder-<hash>.js` anywhere in the request log.
- **(b)** `.ktx2` atlases load **and decode**: `assets/models/trees/octahedral/tree{1,2}.imposter.ktx2` plus their `.normal.ktx2`, and the resulting textures are live on the impostor materials as **compressed** 2048 x 2048 with `format 36492` (`COMPRESSED_RGBA_BC7_UNORM`). A failed transcode would leave an uncompressed RGBA texture or none.
- **(c)** **No** `.imposter*.png` fallback is fetched. The only `.imposter*` requests are the two `.json` manifests and the `.ktx2` pairs.
- **(d)** **Zero** console errors in every session (recon, 27-shot probe, diagnostics). The only warnings are the two long-standing ones (`Multiple instances of Three.js`, the `renderAsync()` deprecation) plus four aborted music `.mp3` fetches, none KTX2-related.
- Far trees render: 55 far impostor instances on Rolling Hills, visible as tree silhouettes across the island in `before/42-far-trees`. They do not vanish.

---

## Defects

### 1. THE OPEN GATE LEAVES HANG IN THE AIR, up to 1.85 m

`after/43-leaf-float-left`, `after/44-leaf-float-right`. This is the clearest defect in the set and it is not subtle: from inside the pen you can see grass and daylight under the whole length of both leaves, and the fence rail behind passes **below** the leaf's bottom rail.

The gate assembly is one rigid group placed at `_groundY(50, -58) = 27.86`. The leaves are rigid children of it, so their bottom edge is a constant `y = 28.16` everywhere along their length. They swing 5.30 m into ground that falls away:

| point | ground | leaf bottom | gap |
|---|---|---|---|
| hinge (56, -58) | 28.22 | 28.16 | -0.06 (buried, fine) |
| (55.3, -61) | 27.12 | 28.16 | **1.04 m** |
| tip (54.0, -63.3) | 26.31 | 28.16 | **1.85 m** |
| tip (46.1, -63.3) | 26.46 | 28.16 | **1.70 m** |

Phase 4 fixed exactly this class of bug for the fence (posts self-ground per piece, rails span the true slope) and the gate did not get the same treatment, because on Home Field it cannot show: `field.bin` has `peakHeight 0`. This is the third grounding defect only an island could expose, and the commit message names two.

It is also what those "blank cream slabs" in `before/07-gate-from-inside` and `before/09-fence-worst-side` are. They are not posts. They are the floating leaves seen near face-on.

### 2. THE NORTHERN APPROACH HAS A CUE DEAD ZONE, roughly 25 m to 60 m out

`before/25-cue-60m`, `before/26-cue-45m`, `before/27-cue-25m`. At 60 m and 45 m from the gate the frame contains **no cue at all**: no column (`columnOpacity` is 0 at or inside 60 m by construction), no ground arc (it is on the far side of a crest), and no screen-edge chevron (`onScreen` reads true, so `showCompass` is false). At 25 m you get one fence rail and the tip of one gate post over the ridgeline.

The cause is the site, and it is measurable. `approach-los.mjs` solves the minimum eye height that clears every intervening ridge:

```
d= 70 bearing=  0  cam(50, 12)  ground=11.61  minEye=40.00  (=28.4m above local ground)
d= 90 bearing=  0  cam(50, 32)  ground= 4.70  minEye=42.84  (=38.1m above local ground)
d=120 bearing=  0  cam(50, 62)  ground= 5.03  minEye=47.16  (=42.1m above local ground)
```

There is a ridge at (50, -48) at 30.15 m, **2.3 m higher than the gate itself**, 10 m outside the mouth, and a bigger NW spine at (10, -10) = 35.6. From due north you cannot see the gate at eye height from anywhere between about 20 m and 190 m out. Only the bearing-40 approach (from the east, `before/03-approach-east-70m`) has a clean low sight line, and that is not the direction the flock comes from: sheep spawn at (-30, -30), west-north-west of the gate.

The site was chosen by scanning 36 x 36 boxes and scoring **interior relief plus relief across the opening**. Both criteria were met (4.94 m interior, 0.41 m across the mouth). Neither criterion asks whether you can see the gate while you are driving sheep at it. That is the gap.

The column is what saves it, and this is a strong argument for the tune in item 4: the column top clears every ridge from every stand-off distance (`minEye` 13.2 at 70 m out against ground 11.6, i.e. a 1.6 m eye).

### 3. THE CUE'S ON-SCREEN TEST PROJECTS A POINT 24 m UNDERGROUND on Rolling Hills

`js/effects/GateColumn.js:341`:

```js
_projected.set(descriptor.position.x, CUE_PROJECT_HEIGHT_M, descriptor.position.z);
```

`CUE_PROJECT_HEIGHT_M = 4` is an **absolute world Y**, not "4 m above the destination's ground". Home Field's gate ground is 0, so there it means what it says. Rolling Hills' gate ground is **27.86**, so the cue projects a point 23.9 m inside the hill, and every `onScreen` / `showCompass` / `near` answer on the island is computed from it.

Measured, from `probe/before/probe-report.json`:

| shot | dog to gate | gate in frame | `onScreen` | `showCompass` | `ndcY` |
|---|---|---|---|---|---|
| `07-gate-from-inside` | 12.0 m | yes, filling the frame | **false** | **true** | -4.74 |
| `27-cue-25m` | 25.0 m | yes | **false** | **true** | -1.26 |
| `30-from-behind` | 12.0 m | yes | **false** | **true** | +0.82, `behind` |
| `31-from-below` | 80.0 m | yes | **false** | **true** | +0.15, `behind` |

So the HUD chevron is pinned on while the player is standing in the gate mouth, and `near` (D13 state 2) can never resolve true on the island. The column and the arc are unaffected: both key off distance only, which is exactly the reason `GateColumn.js` gives for not letting `columnOpacity` read the projection. The fix is one line (`groundY(x, z) + 4`), it belongs to Cycle 116's module, and it will also be wrong on Open Country, whose corral is not at y = 0 either.

### 4. D29: the column was a hairline. Tuned. (fixed here)

`before/20-column-190m` is the evidence: at 190 m the column is a **2-pixel** pale sliver, half behind a treetop, reading as a distant radio mast. Cycle 116's "reads more like a pole than a warm beacon" understates it.

The diagnosis is that the taper threw away all the girth exactly where it was needed. `COLUMN_TAPER = 0.12` converged the 1.68 m base radius to 0.20 m at the top, and the top is the **only** part that clears the ridge and the canopy at the ranges the far state exists for.

Changed, in `js/effects/GateColumn.js` only, no new geometry and no light:

| constant | was | now | why |
|---|---|---|---|
| `COLUMN_TAPER` | 0.12 | **0.45** | Still converges, so there is no hard ring against the sky, but the top half stays a column instead of a wire. This is the change that did the work. |
| `COLUMN_RADIUS_PER_WIDTH` | 0.14 | **0.22** | Girth is the one lever that buys angular size at range and costs the near state nothing (the column is fully faded inside 60 m). Rolling Hills' 12 m mouth goes from a 1.68 m radius to 2.64 m. |
| `COLUMN_MIN_RADIUS` | 0.9 | **1.2** | Same reason, for narrow destinations. |
| `COLUMN_MAX_RADIUS` | 2.4 | **3.2** | Open Country's 60 m gather zone still clamps; the spec's `radius < width / 4` bound has 15 m of room. |
| `GATE_COLUMN_OPACITY` | 0.3 | **0.42** | The weak lever, and worth recording why. The blend is additive, so against a bright sky the column can only move a pixel toward white. Measured at 190 m: raising 0.3 to 0.42 moved the brightest column pixel from rgb(229,215,216) to rgb(233,222,225) against a sky of rgb(190,173,206), i.e. about **4 luma**. It buys fill where the column crosses dark terrain, not contrast against sky. |

Measured result, same camera, same ToD, same dog distance:

| distance | column width before | after |
|---|---|---|
| 190 m (row y=310) | **2 px** | **8 px** |
| 120 m (row y=240) | 0 px (nothing above the tree) | **7 px** |
| 85 m (row y=250) | 8 px | **17 px** |

Look at `before/20` against `after/20`, `before/21` against `after/21`, `before/42` against `after/42`. At 190 m it now reads as a standing mark above the treeline. At 70 m (`after/22-column-70m`) `columnFade` has already taken it to 0.352 of peak and it is a soft translucent bar behind a tree: not obnoxious.

**What I did not fix, deliberately:** it reads pale, not warm. `tests/gate-cue-column.spec.js:452-454` pins the column's colour to `GATE_CUE_WARM_LINEAR`, which is declared in `js/world/gateThreshold.js` and shared with the arc and the post rim, and I was scoped to `GateColumn.js`. The deeper point is that **an additive surface cannot read warm against a bright daytime sky** at any opacity: the add is positive-only, so more of it moves the pixel toward white, not toward orange. If D29 wants warmth rather than presence, the lever is the blend mode or a darker sky, not this file. At dusk (`before/41`, `after/42`) it already reads cream-warm against the pink horizon, which is the same surface doing the same thing over a darker backdrop.

### 5. The island terrain is near-black under the grass (pre-existing, worse than "worth recording")

Every frame in `probe/before/`. The ground plane reads as near-black with lime-green grass blades standing on it, while the trees on the same ground are lit normally. Cycle 116 noted this in one line as "not investigated". At the framings this cycle cares about it is the dominant look problem on the scene: the new fence and the new pasture are sitting on what looks like scorched earth.

It is **not** introduced by this cycle. The pre-Cycle-116 golden (`probe/old-golden-rolling-hills__sun05__classic__zoom60.png`) is just as dark. It is also not a probe artifact: `perfMode`, `probeRender` and `visualGolden` are the same flags the standing golden harness uses, and the Home Field cells at the same flags are a normal mid-green.

### 6. A tree stands in the gate approach

`before/26-cue-45m`, `before/05-gate-oblique-ne`. The tree at (61.23, -50.31), 7.7 m north of the north fence and 11 m east of the gate axis, is outside `scatterKeepOut`'s inflated box (correctly, by the flag's own rule) but sits in the sight line for a player closing on the gate from the north-east. It blocks the gate in two of the framings. The keep-out is a box around the pen; there is no keep-out for the approach funnel that `gateApproachRect` already computes.

### 7. Nine of forty went in

`diagnostics.json` `retire`. I parked 40 sheep in a 11 m x 8 m block centred on (51, -55), 3 m outside a 12 m gate, and walked the dog from z = -42 to z = -56 behind them over 12 seconds. **9 crossed, all within the first 2 seconds**, and the count never moved again; the other 31 broke sideways and ended up pressed against the outside of the west and south fences.

My drive is crude (the dog is teleported down a straight line, not steered), so this is not a claim that the gate is too hard. It is a recorded observation that the flock's first instinct at a 12 m mouth with a dog directly behind it is to split around the fence rather than funnel, and it is worth one real play session before the cycle closes.

---

## The goldens

`npm run validation:screenshots -- --diff`, run **before** the column tune, read before anything was re-baselined.

| cell | SSIM | verdict |
|---|---|---|
| `field__sun085__classic__zoom60` | **0.7807** | fail |
| `field__sun05__classic__zoom60` | **0.7708** | fail |
| `rolling-hills__sun085__classic__zoom60` | **0.3470** | fail |
| `rolling-hills__sun05__classic__zoom60` | **0.3707** | fail |
| `open-country__sun085__classic__zoom60` | **0.9450** | fail |
| `open-country__sun05__classic__zoom60` | **0.9558** | pass |

Mean 0.6950, 5 of 6 below the 0.95 gate. **The delta is not confined to what this cycle changed**, and the reason is a finding of its own.

**The baseline is two cycles stale.** `git log -- tools/validation/golden/` puts the last write at `69eb2a1b`, which is the Cycle 116 *probe* commit, before Cycle 116's implementation landed. So the pinned goldens predate the gate cue entirely. The old Open Country golden still has the white `distanceIndicator` diamond at (638, 325) and no column. **Cycle 116 shipped a 44 m world-space object onto all three scenes and never re-baselined.**

Per-cell attribution, by 16x16 block diff against the old golden (`probe/old-golden-*.png`):

- **Open Country**, 23 blocks over delta 25, and every one of them is at (624-640, 96-160), which is where the column stands. Plus the diamond removal. **The whole delta is Cycles 116 and 117, and nothing else moved.**
- **Rolling Hills**, 1346 of 3600 blocks over delta 25. Wholesale, and expected: the tree and rock scatter moved (the corral keep-out became a pen keep-out, the recorded entry `5a5e506c` to `f5985ac9`), the red corral flag is gone, the diamond is gone, and the new pasture is in frame at bottom left. Far impostor instances 61 to 55, consistent with the scatter change.
- **Home Field**, 149 blocks over delta 25, and **the top 20 are all in the flock region (x 650-850, y 250-400), not at the column**. The column contributes less to this cell than the flock does. So Home Field's 0.77 is dominated by the flock landing somewhere else than it did at `69eb2a1b`.

That last one deserves a flag. It is **not** run-to-run noise: after re-baselining, a fresh `--diff` returns **6/6 pass, mean 0.9976** (field 0.9981 / 0.9989, RH 0.9995 / 0.9980, OC 0.9955 / 0.9955), so the classic cells reproduce to three decimal places within a build. The flock genuinely sits differently than it did two cycles ago on a scene this cycle's plan says is untouched. The likely mechanism, stated as a hypothesis rather than a measurement: the harness installs **one global seeded `Math.random`** per cell (`screenshot-golden.mjs:90-116`), so every draw in the whole boot comes off one stream, and any change to how many draws scene construction makes reshuffles everything downstream of it, including sheep spawn. Cycle 117 changed `js/StructureBuilder.js` and the fence build. Worth one look before anyone reads a Home Field golden as a sim regression.

**Re-baselined**, after the tune, with the attribution above. `tools/validation/golden/*.png` (6 files) are modified in the working tree and uncommitted. If the column tune is rejected, the baseline has to be retaken.

---

## Also worth recording

- **The pen interior keeps its grass**, and it looks much better for it. Home Field's pen is bald (Cycle 116 defect 3); Rolling Hills' is a full grass field with a fence round it (`before/13-pasture-interior`). The two scenes now treat the same idea two different ways.
- **The ground arc reads well.** At the 7.5 m radius (`width/2 + GATE_THRESHOLD_GATE_OUTSET_M`) it is a broad tan apron sweeping the approach half only, and in `before/08-fence-worst-run` it reads as a worn track rather than as a decal. Terrain-conformed, no clipping into the slope.
- **The gate posts read a full stop lighter than the fence posts** beside them. Same base colour (`#8b6a45`, `MeshStandardMaterial`, no map) but the gate assembly's posts are 0.72 m square against the fence's slimmer stock, so in direct sun they blow to cream. Cosmetic, low priority, but it is why the gate reads as newer than its fence.
- **`gameState.gate` is non-null on the CLIENT.** The acceptance line "when Rolling Hills loads, `gameState.gate` shall be null" is true of `shared/index.js`'s `createGameState`, which is what `tests/island-pasture.spec.js:88` asserts, and false of `js/GameState.js`, which defaults `this.gate` to Home Field's `(0, 100)` and never nulls it per scene. This is documented at `js/GameState.js:66-69` and the cycle deliberately stands the gate arm down via `this.pen`, so it is correct as built. Recorded only so nobody reads the acceptance line as a claim about the client.
- **Sky and water.** The cel-shaded cobalt water Cycle 118 is aimed at is exactly as `probe/before/06-gate-plan` shows it. The "before" for that cycle will not be a subtle comparison.

## Probe hygiene

Every Playwright page, context and browser closed at the end of every run. `tasklist | grep -i chrome` returns nothing. No preview listener started; the only thing on :3000 is the dev server that was already running and is not mine to stop.
