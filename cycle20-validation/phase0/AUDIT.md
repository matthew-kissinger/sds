# Cycle 20 Phase 0 — Recon + Assumption Audit

> Captured 2026-05-04. Optical artifacts in this directory.

## TL;DR

- Pixel Forge / Kiln CLI works on real SDS GLBs **after two install fixes** (see "Install gotchas").
- 5 of 6 documented bugs in current runtime impostor confirmed analytically; Bug 6 (anchor mismatch) likely refuted by reading the math, will be confirmed optically in Phase 2 Layer E.
- **Q2 verdict: 16 hemi-y atlases for production**, locked here. Optical simulation + AAA shipping precedent + parallax research all converge.
- **Phase 2 spec refined** based on Phase 0 research: parallax depth offset and depth-discard ghost suppression promoted to must-have (highest-leverage changes per Brucks 2014 / Far Cry 6 / Halen 2022).

## Install gotchas (Pixel Forge on Windows + this repo)

**Gotcha 1 — bun + Playwright doesn't work on Windows.** `bun run packages/cli/src/index.ts kiln bake-imposter ...` spawns Chromium successfully (we see `<launched> pid=NNN`), but Playwright's CDP-pipe handshake never completes within its 180s window. Workaround: invoke via Node + tsx instead — `./node_modules/.bin/tsx packages/cli/src/index.ts ...`. Both bakes succeeded with this workaround, sub-minute each. Possibly worth filing upstream with Pixel Forge.

**Gotcha 2 — Phase 1 must bake from `_originals/` not `assets/models/trees/`.** SDS Draco-compresses runtime tree GLBs via `scripts/compress-glbs.mjs`; Pixel Forge's bake harness loads via Three.js `GLTFLoader` without a `DRACOLoader` instance, so it errors on Draco-compressed payloads. The uncompressed canonical sources sit at `assets/_originals/models/trees/*.glb`. Phase 1's `tools/bake-tree-impostors.mjs` must point there.

**Verified outputs (tree1):**
- `tree1-16.png` (2048×2048, 4×4 atlas) + `.normal.png` + `.depth.png` + `.json` ✓
- `tree1-32.png` (4096×2048, 8×4 atlas) + `.normal.png` + `.depth.png` + `.json` ✓
- Both sidecars match Kiln schema: `version: 1`, `colorLayer: baseColor`, `normalSpace: capture-view`, `auxLayers: [albedo, normal, depth]`, `bgColor: transparent`, `edgeBleedPx: 2`. Visual check on the atlas + aux layers confirms tile orientation matches sidecar metadata (top row = elevation 85°, bottom row = elevation 5°; columns advance 90° azimuth in the 16-bake / 45° in the 32-bake).

## Six-bug audit (current runtime impostor at `js/octahedral-impostor-material.js` + `_bakeOctahedralImpostor` at `js/TerrainBuilder.js:1459`)

### Bug 1 — Not octahedral, it's lat/lon. **CONFIRMED.**
Vertex shader at `js/octahedral-impostor-material.js:88-96` computes `azimuth = atan(dirObj.z, dirObj.x)` and `elevation = asin(dirObj.y)`, then divides each by uniform-sized cells. That's a lat/lon grid, not Brucks octahedral encoding. (Pixel Forge's lat/lon layout is the same shape, so this isn't fixed by the Cycle 20 swap — both the old and new pipelines use lat/lon. The Phase 2 win comes from per-tile metadata + barycentric blend + parallax, not encoding change. See "Future work" below.)

### Bug 2 — 4×4 grid is coarse. **CONFIRMED.**
`COLS = 4, ROWS = 4` at `js/TerrainBuilder.js:1481`. Industry minimum-acceptable is 64 (Brucks 2014); shipped titles use 9-25 angles + parallax. Phase 2 ships 16 with parallax, putting SDS in line with Ghost of Tsushima (Sucker Punch, GDC 2021).

### Bug 3 — Single-tile pick (no blend). **CONFIRMED.**
Comment at `js/octahedral-impostor-material.js:9` admits this: "single-tile picker (no 3-tile blend) — escalation to a 3-tile blend is a Phase 4 polish item if the visible step is unacceptable." Vertex shader takes `floor(azimuth / step)` to integer-index a single tile. Phase 2 ships barycentric 3-tile blend.

### Bug 4 — Cylindrical billboard always-vertical. **CONFIRMED.**
Vertex shader at `js/octahedral-impostor-material.js:109-119` builds the quad horizontally aligned to camera azimuth in world space, with object-Y mapped to world-Y. That's a cylindrical billboard regardless of view elevation. The shader's own comment at L102-108 notes this is wrong for high-elevation cameras (canopy stretched into a vertical strip). Cycle 20 keeps this geometry as v1 (anchor + relighting are higher-leverage). Full fix is Cycle 19.5 carryover #2, deferred — square tiles + tilt math required in lockstep.

### Bug 5 — No relighting. **CONFIRMED.**
Fragment shader at `js/octahedral-impostor-material.js:144-148` does `tex.rgb * uColor` with `uColor` being the per-frame sun-tint global. No normal sampling, no `dot(N, sunDir)`. Cycle 19.5 added a sun-luma multiplier inside `setImpostorTint` (commit `5f6e330`) — that lifted brightness at noon but doesn't direct light per-fragment. Phase 2 ships proper per-fragment relighting via the normal aux atlas.

### Bug 6 — Anchor mismatch (LOD0 trunk-base vs LOD2 bbox-center). **REFUTED.**

Updated 2026-05-04 (Phase 1) — confirmed by reading the placement code at `js/TerrainBuilder.js:1098-1114`. The bug doesn't exist for SDS's EZ-Tree GLBs:

- **Both LOD0 and current LOD2 anchor at the same instance translation.**
- `createTrees` computes `placementY = treeY + baseOffset * t.scale` where `baseOffset = userData.modelBaseYOffset ?? 0` and `treeY = this._groundY(t.x, t.z)`. EZ-Tree GLBs from `tools/bake-trees.mjs` have trunk base at GLB-Y=0 (= bbox.min.y, confirmed in all 3 production sidecars: `bbox.min.y == 0`, `bbox.max.y == 1`, `yOffset = 0.5`). Their `modelBaseYOffset` is 0, so `placementY == treeY`.
- LOD0 GLB origin (= trunk base) ⇒ trunk base lands at world Y `placementY` ✓.
- LOD2 quad math at `js/octahedral-impostor-material.js:69-119`: `originLocal.y = trans.y + 0.5*scale`, then quad bottom `vertexWorld.y = originLocal.y + (0 - 0.5)*scale = trans.y`. With `trans.y == placementY`, the quad bottom lands at `placementY` ✓.
- **Same world-Y for both LODs.** The bug as hypothesized in the original plan does not occur for trunk-base GLBs.

The Phase 2 shader's `worldSize` + `yOffset` from sidecar is still cleaner — it makes the anchor explicit in the contract instead of recomputed implicitly from the bbox per bake — but it's a code-clarity win, not a behaviour fix. **Layer E is no longer load-bearing for Bug 6**; it's still worth running as a regression guard against a future GLB-pivot change.

Caveat: if a future tree GLB ships with a non-zero `modelBaseYOffset` (centroid-pivoted GLB), the current LOD2 would misalign by `baseOffset * scale`. The new shader pinning to sidecar `yOffset` instead of `(bbox.min.y + bbox.max.y) * 0.5` is robust against that — keep this in mind during Phase 2 implementation.

## Q2 verdict — 16 hemi-y for production

**Optical simulation evidence (`tools/q2-orbital-sim.mjs`, results in `q2-report.json`):**

| Bake | Tiles | Az step | RMSE median | RMSE max | Max/median ratio |
|---|---|---|---|---|---|
| 16 hemi-y | 4×4 | 90° | 7.41 | 7.59 | **1.024** |
| 32 hemi-y | 8×4 | 45° | 14.86 | 15.15 | **1.019** |

Both produce visually-smooth orbits with proper barycentric blend (ratio ≈ 1, no cardinal step). 16-bake's per-frame Δ is ~½ of 32-bake's because each frame moves through 1/6 of a 90° wedge vs 1/3 of a 45° wedge — that's the geometry of the blend, not a discontinuity. **Both pass the 1.5× threshold trivially.**

Methodology note: my first iteration had a barycentric Triangle B sign error (TR/BR weights swapped) that produced a false 5× spike for 16-bake. The fix at `tools/q2-orbital-sim.mjs:91` derives the weights from the standard area-barycentric formula on the TR-BL diagonal; verified against corner cases. Re-running with the fix gives the smooth ratios above.

**Industry shipping precedent corroborates 16:**
- Sucker Punch / Ghost of Tsushima (GDC 2021): 4×4 = 16 angles + parallax. Shipped. https://www.gdcvault.com/play/1027033
- Guerrilla / Horizon Forbidden West (GDC 2023, Lindquist Digital Dragons 2023): 3×3 = 9 angles + parallax + dither. Shipped. https://www.guerrilla-games.com/read/vegetation-of-horizon-forbidden-west
- Brucks 2014: parallax ≈ 1-octave angle-count equivalence. https://www.unrealengine.com/en-US/tech-blog/imposters-octahedral-imposters-and-creating-them-with-shader-graph
- Halen et al. HPG 2022 (Table 3): parallax-corrected 32 angles ≈ non-parallax 64 in PSNR. https://diglib.eg.org/handle/10.2312/hpg20221153
- Drobot SIGGRAPH 2021 / Far Cry 6: depth offset "essential — without it would have needed 7×7 instead of 5×5". https://advances.realtimerendering.com/s2021/

**Implication: 16-bake + parallax ≈ 32-bake without parallax in shipped-AAA quality.**

**Verdict: ship 16 hemi-y atlases. Saves ~15 MB across 3 trees (~30 MB → ~15 MB).** Phase 2 Layer F orbital sweep against the real shader is the final check — if a step still shows that parallax can't close, escalate to 32 (one CLI flag flip).

## Phase 2 spec refinement

Promote two items to **must-have** based on Phase 0 research (originally not in the plan):

### 1. Parallax depth offset (highest-leverage change)
For each of the 3 picked tiles, sample the `depth` aux atlas at unmodified UV. Use depth to offset the sample UV along the *capture view direction* (decoded from the tile's `(az, el)`) projected into the tangent plane. Restores apparent 3D rotation that pure barycentric pixel-blend cannot produce — without this, my 2D simulation overstates 16-bake quality (no perspective, no rotation cue).

### 2. Depth-discard ghost suppression
After parallax sampling, compare the 3 tiles' sampled depths. If a tile's depth disagrees with the median by > tunable threshold (start `0.15 × worldSize`), drop its weight to 0 and re-normalise. Eliminates "double-image" ghost during blend. Validated by Brucks 2014 + Drobot 2021.

### 3. Heitz-Neyret 3-tap barycentric (already planned)
The 3-tile barycentric is exactly Heitz & Neyret 2018's hex-tiling — peer-reviewed equivalent of 4-tap quality at 3 samples. Reference: https://hal.archives-ouvertes.fr/hal-01824773.

These are now in the [Phase 2 build spec](../../docs/cycle-20-plan.md#phase-2--runtime-shader-rewrite-3hr).

## Future work surfaced (not this cycle)

- **`pixel-forge-hemi-octahedral-port`** — Guerrilla switched lat/lon→hemi-octahedral mid-Forbidden West for ~15% memory savings at equal horizon-quality; Unity HDRP 2023+ ships hemi-octahedral default. SDS's strictly-low-elevation ground camera makes the win smaller (~10%); upstream change to Pixel Forge required.
- **`stochastic-alpha-lod-crossfade`** — Wyman 2017 JCGT for the LOD2↔LOD0 cross-fade (Cycle 19.5 carryover #3). Cheaper than alpha-blend, used in Horizon FW dithered LOD.
- **`temporal-impostor-accumulation`** — Karis SIGGRAPH 2014 for popping suppression. Used in UE5 Nanite Foliage.
- **Neural impostors / NeRF-trees** — NVIDIA Mueller et al. 2023 wins quality at very low angle count but inference cost is non-trivial on web. Not yet shipped in any browser game I can find. Research-only.

## Outstanding Phase 0 work (deferred — see Layer A + Layer B captures)

The plan calls for two more Phase 0 captures that need an SDS dev harness (single-tree page with grass/sheep/dog disabled, fixed camera poses). These haven't been executed:

- **Layer A — anchor pixel-diff capture** (LOD0 vs LOD2 of single tree at fixed camera pose). Needed to confirm Bug 6 status optically. Mitigation: Phase 2 Layer E (anchor pixel-diff with new shader) covers this — if Bug 6 was real, Layer E demonstrates the fix; if Bug 6 was already-fine, Layer E shows ≤2px alignment.
- **Layer B — current-runtime orbital sweep** (24 frames at 15° azimuth around a single in-game LOD2 impostor). Was meant to be the optical baseline against which Phase 2 Layer F compares. Mitigation: Bugs 3 + 5's analytical confirmation is unambiguous; the visible step + flat lighting are observable in any in-game capture and don't require a controlled harness for AUDIT.md acceptance.

**Recommendation: skip Layer A + Layer B as Phase 0 deliverables.** Phase 2 Layer E + Layer F supersede them. Saves ~1-2hr of harness scaffolding and moves the cycle into Phase 1.
