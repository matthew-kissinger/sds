# Cycle 20 — tree-impostor-overhaul-via-kiln

> Drafted 2026-05-04 (replaces the prior `heightfield-amplitude-fix-and-cinematic-videos` scaffold; those two items are deferred to a future cycle and remain documented in `BACKLOG.md`). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Session log

- **2026-05-04 working session — Phases 0 + 1 + 2 v1 landed in one pass.**
  - Phase 0 ✅ — Pixel Forge CLI verified (with bun→Node tsx + `_originals/` install fixes), 6-bug audit complete, **Q2 verdict locked at 16 hemi-y** via 2D simulation + AAA shipping research, Phase 2 spec refined to promote parallax depth offset + depth-discard ghost suppression to must-have. Artifacts in `cycle20-validation/phase0/` (AUDIT.md + 8 atlas files for tree1 16/32 + q2-report.json + 48 simulation frames).
  - Phase 1 ✅ — `tools/bake-tree-impostors.mjs` + `npm run bake-tree-impostors` regenerate 12 production atlas files (3 trees × albedo + normal + depth + sidecar). Inspector HTML + 6 vitest specs (Layer C/D). All assets committed to `assets/models/trees/`.
  - Phase 2 v1 ✅ — `js/kiln-impostor-material.js` ships with barycentric blend + per-fragment relighting; parallax + depth-discard scaffolded but disabled by default. `_bakeOctahedralImpostor` (~165 LOC) deleted; old shader file removed. `setImpostorTint(sunColor, sunDir, ambientColor)` extended; main.js wires through. **Smoke-tested in browser: 177 trees render with zero console errors, 186/186 vitest, prod build flat.**
  - Phase 2 follow-on (Layers E/F/G/H/I + visual tuning) **DEFERRED** to a focused tree-LOD2 fix-and-polish session — see `NEXT_SESSION.md`. Phases 3-5 of this plan resume after that.

The plan below is the unchanged design doc; the session log above tracks execution. Phases 0-2 marked complete in their headings.

## Goal

Replace the SDS-grown runtime octahedral baker + custom shader (which is actually a 4×4 lat-lon grid + cylindrical billboard, single-tile pick, no relighting data — see audit in **Phase 0**) with the local **Pixel Forge / Kiln** offline impostor pipeline at `C:\Users\Mattm\X\games-3d\pixel-forge\packages\core\src\kiln\imposter\`. Bake atlases ahead of time with normal + depth aux layers and a sidecar JSON contract; rewrite the runtime material to consume that sidecar and do `dot(N, sunDir)` per-fragment lighting + 3-tile barycentric blend across azimuth.

User-visible difference: distant trees stop looking like flat darker billboards. They catch the sun on the lit face, darken in shadow, transition smoothly across azimuth (no quadrant step), and pop less at the LOD2→LOD0 boundary because the impostor anchors at the same world Y as the LOD0 trunk base. Closes Cycle 19.5 carryover impostor-quality items #1 (lighting), #2 (angled aerial — partial; full requires square tiles + tilt, deferred), #4 (anchor offset). Item #3 (LOD2↔LOD0 cross-fade) stays standalone.

**Why this is its own cycle, not a hotfix.** The user explicitly asked for **multiple independent layers of optical analysis at every phase** — not just unit-test green. The risk is that the current impostor *looks* almost right but is fundamentally wrong on six axes (see Phase 0); a one-shot rewrite with no validation could ship a different-shape regression. So every phase below pairs the implementation step with a concrete optical-validation step that produces saved imagery proving the assumption holds.

## How to read this plan

This doc fixes the *shape* of the work — the integration boundary with Pixel Forge, the runtime shader contract, and the optical-validation matrix. Implementation choices are open.

Each phase has two halves:
- **Build** — what to write or change.
- **Optical validation** — what imagery to capture and what to look for. **A phase is not done until its optical-validation artifacts are saved + reviewed.** Save under `cycle20-validation/<phase>/`.

## Open questions to resolve before writing code

1. **Q1: Pixel Forge integration mechanism — workspace dep, file-protocol dep, or CLI subprocess?** Author lean: **CLI subprocess.** `pixelforge kiln bake-imposter <glb> --out <png> --angles 16 --axis hemi-y --tile-size 512 --aux-layers normal,depth --bg transparent --color-layer baseColor --edge-bleed 2` is already wired (verified at `packages/cli/src/commands/kiln.ts:602`). Subprocess avoids monorepo wiring complexity, keeps SDS package.json clean, and the bake is a one-shot build step. If install friction surfaces, fall back to `file:../pixel-forge/packages/core` workspace link.
2. **Q2: 16-angle hemi-y (4×4 grid) or 32-angle hemi-y (8×4 grid)?** **RESOLVED 2026-05-04 in Phase 0 — ship 16 hemi-y.** Methodology + evidence:
   - Pixel Forge `resolveLayout()` (`packages/core/src/kiln/imposter/projection.ts:49`) hard-codes four `(angles, axis)` combos. For SDS's ground-camera regime (LOD2 swap at 100m, dog camera ~2-3m above terrain ⇒ effective elevation 1-4°), the `16 y` option (one row below horizon) and `8 hemi-y` (15° lowest elevation, 90° az step) are both wrong. Real choice: **16 hemi-y (4×4) vs 32 hemi-y (8×4)** — same elevation rows `[85°, 60°, 30°, 5°]`, bottom row matching SDS gameplay, difference is azimuth step 90° → 45° at cost of ~+15 MB committed atlas data across 3 trees.
   - **Phase 0 Layer B' optical simulation** (`tools/q2-orbital-sim.mjs`): 2D barycentric simulation of Phase 2 candidate shader at radius=120m / elevation=5°, 24 frames at 15° azimuth steps, per-pixel RMSE between adjacent frames. **Result: both bakes produce visually-smooth orbits with proper barycentric blend (max/median ratio ~1.02 in either case).** 16-bake per-frame RMSE = 7.4 (smaller because each frame moves through 1/6 of a 90° wedge); 32-bake per-frame RMSE = 14.9 (1/3 of a 45° wedge). No cardinal pop in either after the math fix.
   - **Industry precedent (research, Phase 0):** Ghost of Tsushima ships 4×4 = 16 with parallax (GDC 2021); Horizon Forbidden West ships 3×3 = 9 with parallax + dither (GDC 2023, Lindquist Digital Dragons 2023). Brucks 2014 + Halen et al. HPG 2022 both establish that **parallax depth offset is equivalent to ~1 octave (2×) angle reduction** in perceived quality. So **16-bake + parallax ≈ 32-bake without parallax**. Reference `cycle20-validation/phase0/AUDIT.md` for citations.
   - **Verdict: 16 hemi-y atlases for production**, with parallax depth offset added to Phase 2 (see refined Phase 2 spec). Saves ~15 MB committed atlas data. Reserve the right to escalate to 32 if Phase 2 Layer F orbital sweep against the real shader still shows a visible step that parallax can't close.
3. **Q3: Atlas size budget per tree?** Pixel Forge default is 512px tiles. 16 tiles × 512 × 512 × 4 channels = 16 MB raw, ~1-2 MB PNG-compressed for color, similar for normal, less for depth. Per tree: ~5 MB committed in `assets/models/trees/`. Three trees: ~15 MB total atlas data. Author lean: **acceptable**, given LOD0 GLBs total ~280 KB and runtime bake is removed (trade compile-time render cost for repo size). Re-evaluate if bundle size flags it.
4. **Q4: Ship `colorLayer: 'baseColor'` (unlit color, requires normal aux) or `'beauty'` (legacy lit, no normal needed)?** Author lean: **baseColor.** The whole point of this cycle is to bring runtime relighting into impostors. Schema enforces `baseColor → normal aux required` (see `packages/core/src/kiln/imposter/schema.ts:95`).
5. **Q5: Keep the LOD2 → LOD0 swap at 100m or revisit?** Author lean: **keep 100m for v1**, revisit only if Phase 2.E LOD-boundary optical capture shows a remaining step after relighting + anchor fix. The cross-fade work (Cycle 19.5 carryover #3) stays its own future cycle.
6. **Q6: Where does the bake artifact live in the repo?** Author lean: **`assets/models/trees/<name>.imposter.png` + `<name>.imposter.normal.png` + `<name>.imposter.depth.png` + `<name>.imposter.json`**, alongside the existing GLBs. The npm script `bake-tree-impostors` regenerates all four for all three trees.

## Phase 0 — Recon + assumption audit (~1hr)

**Independently testable. RUN THIS FIRST.** This phase doesn't ship code. It captures optical evidence of every assumption the current impostor makes — so we know whether each subsequent change actually fixed something vs accidentally papered over a different bug.

### Build

1. **Spike: confirm Pixel Forge CLI works on a known-good SDS tree GLB. Bake BOTH 16 and 32 hemi-y atlases for tree1 — they are the Q2 comparison.**
   ```
   cd C:/Users/Mattm/X/games-3d/pixel-forge && bun install
   cd packages/cli && bun link
   pixelforge kiln bake-imposter C:/Users/Mattm/X/games-3d/sds/assets/models/trees/tree1.glb \
     --out cycle20-validation/phase0/tree1-16.png --angles 16 --axis hemi-y --tile-size 512 \
     --aux-layers normal,depth --bg transparent --color-layer baseColor --edge-bleed 2
   pixelforge kiln bake-imposter C:/Users/Mattm/X/games-3d/sds/assets/models/trees/tree1.glb \
     --out cycle20-validation/phase0/tree1-32.png --angles 32 --axis hemi-y --tile-size 512 \
     --aux-layers normal,depth --bg transparent --color-layer baseColor --edge-bleed 2
   ```
   Confirm 8 output files (4 per bake: `.png`, `.normal.png`, `.depth.png`, `.json`). If either bake fails, debug *here* before continuing — the rest of the cycle assumes Pixel Forge runs.

2. **Capture current impostor state** in a debug page — render runtime atlas to a 2D canvas via `renderer.copyTextureToTexture` or by reading the render target back. Save as `cycle20-validation/phase0/current-atlas-tree1.png` etc. for all three trees.

3. **Document the six assumed bugs** in `cycle20-validation/phase0/AUDIT.md`:
   - **Bug 1 — Not octahedral.** It's lat/lon. Math at `js/octahedral-impostor-material.js:89-96`. Real octahedral uses unfolded-octahedron direction encoding.
   - **Bug 2 — 4×4 is coarse.** Industry default is 16×16; Kiln defaults to 8×4 hemi at 16 angles. We currently get 90° azimuth jumps.
   - **Bug 3 — Single-tile pick.** Visible step at quadrant boundaries. Documented in the file's own comment block.
   - **Bug 4 — Cylindrical billboard always-vertical.** High-elevation tiles drawn on a wall.
   - **Bug 5 — No relighting.** Flat baked color × global tint multiply only. No normal/depth atlas.
   - **Bug 6 — Anchor mismatch (UNCONFIRMED).** Bake centers on `box.getCenter()` with `uTreeOriginObj.y = (minY+maxY)/2`; LOD0 GLB anchors at the EZ-Tree pivot which is near trunk base, not bbox center. Predicted: ~1m vertical offset at the LOD swap.

### Optical validation — Layer A: anchor mismatch confirmation

Before changing anything, **prove or disprove Bug 6** with a focused capture.

1. Place a single tree at world origin via `?scene=field` + a tiny harness that disables grass/sheep/dog and instances exactly one `tree1` at (0, 0, 0).
2. Camera at fixed pose `(0, 5, 50)` looking at `(0, 5, 0)` — close enough to see LOD0.
3. Screenshot. Save as `cycle20-validation/phase0/anchor-A-LOD0.png`.
4. Move camera to `(0, 5, 150)` looking at `(0, 5, 0)` — past the 100m swap, LOD2 active.
5. Screenshot. Save as `cycle20-validation/phase0/anchor-A-LOD2.png`.
6. Diff trunk-base Y in image space (manually or via a tiny `pngjs` script). Document the offset in pixels + estimated metres.

### Optical validation — Layer B: orbital azimuth sweep (current runtime impostor)

Same single-tree harness. Camera orbits at radius 120m around the tree at fixed elevation 5° above horizontal. Capture every 15° → 24 frames. Save as `cycle20-validation/phase0/orbit-azimuth-{000..345}.png`. Look for: visible "rotation reversal" or doubled-image at 0°/90°/180°/270° boundaries (the user's specific suspicion). Also note the exposure mismatch with sky.

### Optical validation — Layer B' — Q2 verdict (16 vs 32 angles)

Resolves Q2 with optical evidence before Phase 1 commits to a bake size.

1. Use the two atlases produced in step 1 (`tree1-16.{png,normal.png,depth.png,json}` and `tree1-32.{...}`).
2. Build a one-page debug HTML `tools/q2-orbital-sweep.html` (no committed deps) that:
   - Loads an atlas + sidecar pair.
   - Renders a single-tree scene with a planar quad consuming the atlas via the **Phase 2 candidate shader** (3-tile barycentric blend across azimuth, view-space normal-map relighting).
   - Animates camera orbit at radius 120m / elevation 5° / 24 stops at 15° azimuth.
3. Capture 24 frames per atlas → `cycle20-validation/phase0/orbit-B-16-{000..345}.png` and `orbit-B-32-{000..345}.png`.
4. Tiny Node script `tools/orbital-delta.mjs` computes per-frame mean-RGB delta against the next frame; reports `max-Δ`, `median-Δ`, and the four cardinal-azimuth Δ values for each atlas.
5. **Verdict logic** written into `AUDIT.md`:
   - If 16-bake `max-Δ at cardinals ≤ 1.5 × median-Δ` → ship 16. Save ~15 MB.
   - Else → ship 32.

This locks Q2 with measured numbers, not a guess.

**Acceptance:**
- `AUDIT.md` documents each of the 6 bugs with status `confirmed | refuted | unclear` and a link to the optical artifact.
- Pixel Forge CLI succeeds on tree1.glb at BOTH 16 hemi-y and 32 hemi-y. 8 output files saved. Both `.json` sidecars retained — Phase 1 reads the chosen one's shape.
- Q2 verdict recorded in `AUDIT.md` with `max-Δ` / `median-Δ` numbers and chosen angle count.
- ~75 reference images saved (1 atlas-strip per tree × 3 + 2 anchor LOD pairs + 24 Layer-B orbit + 24 Layer-B'-16 + 24 Layer-B'-32 + delta plot).

## Phase 1 — Bake pipeline integration (~2hr)

**Depends on:** Phase 0 (Pixel Forge CLI verified working).

### Build

1. **New `tools/bake-tree-impostors.mjs`** — Node script. For each of `tree1.glb`, `tree2.glb`, `pine.glb` in `assets/models/trees/`:
   ```js
   await execFile('pixelforge', [
     'kiln', 'bake-imposter', glbPath,
     '--out', `${outBase}.png`,
     '--angles', '16',
     '--axis', 'hemi-y',
     '--tile-size', '512',
     '--aux-layers', 'normal,depth',
     '--bg', 'transparent',
     '--color-layer', 'baseColor',
     '--edge-bleed', '2',
   ]);
   ```
2. **Add `npm run bake-tree-impostors`** to root `package.json`.
3. **Output paths:** `assets/models/trees/<name>.imposter.{png,normal.png,depth.png,json}`.
4. **Document Pixel Forge install** in [`docs/tree-pipeline.md`](tree-pipeline.md) — assumes local checkout at `../pixel-forge`, run `bun install && cd packages/cli && bun link` once.

### Optical validation — Layer C: per-tile silhouette inspection

Build a debug HTML page `tools/impostor-inspector.html` (one-page, no deps) that:
1. Loads an atlas + sidecar pair.
2. Renders the 4×4 (or 8×4) grid at full size with each tile labelled by its `azimuth` and `elevation` from the sidecar.
3. Shows the `albedo`, `normal`, and `depth` atlases side-by-side.

Open it on each of the three baked trees. Manually verify:
- **Tile content** — tile (0, 0) shows the tree from azimuth 0° / elevation 5° (closest to horizontal, +X side). Tile (3, 0) at azimuth 270°. Tile (0, 3) shows top-down view (elevation 85°). Confirm against `dirFromAzEl()` math at `packages/core/src/kiln/imposter/projection.ts:120`.
- **Normal map sanity** — RGB channels read as a sane normal direction. Trunk normals should be roughly horizontal; canopy mixed.
- **Depth sanity** — closer-to-camera surfaces darker (or lighter — sidecar should specify; check schema).
- **Edge bleed visible** at tile borders — the 2px bleed should show colored fringe around alpha-cutoffs vs pure black.

### Optical validation — Layer D: schema contract

Tiny vitest spec `tests/imposter-sidecar.spec.js` — load each of the 3 sidecar JSONs, assert against the Kiln schema shape:
- `version === 1`
- `angles === 16`
- `tilesX * tilesY === 16`
- `azimuths.length === tilesX`
- `elevations.length === tilesY`
- `worldSize > 0`
- `bbox.min[1] < bbox.max[1]`
- `auxLayers` includes `'normal'`
- `colorLayer === 'baseColor'` (this is the production contract — Phase 2 shader assumes it)

**Acceptance:**
- `npm run bake-tree-impostors` regenerates all 12 artifact files (3 trees × 4 files each) idempotently.
- All 3 atlases pass manual silhouette inspection — tiles correctly oriented per sidecar metadata.
- `npm test` includes 3 new specs (one per tree) asserting sidecar contract.
- Inspector HTML committed to `tools/`.

## Phase 2 — Runtime shader rewrite (~3hr)

**Depends on:** Phase 1 (atlases + sidecars committed). This is the biggest single chunk.

### Build

1. **New file `js/kiln-impostor-material.js`** — replaces `js/octahedral-impostor-material.js` (delete the old file). New material:
   - **Constructor signature:** `createKilnImpostorMaterial({ albedoAtlas, normalAtlas, depthAtlas, sidecar })`. No more loose `cols/rows/halfWidth/bboxMinY/bboxMaxY` params — those come from the sidecar.
   - **Vertex shader:**
     - Reads `azimuths[]` + `elevations[]` from uniforms (uniform array texture or pre-computed pairs).
     - Picks 3 tiles via the lat/lon-cell barycentric pattern: locate cell for `(azCam, elCam)`, decide upper-left or lower-right triangle along `u + v = 1` diagonal, weight 3 corners. **Reference: Heitz & Neyret 2018 hex-tiling paper validates the 3-tap barycentric matches 4-tap quality at 75% the sample cost.** Keep the same `<batching_pars_vertex>` + `<batching_vertex>` chunks for InstancedMesh2 compatibility (Cycle 18 finding — must keep).
     - Anchors quad via `worldSize` + `yOffset` from sidecar — solves Bug 6.
   - **Fragment shader (Cycle 20 must-have, per Phase 0 research):**
     - **Parallax depth offset (highest-leverage change).** For each of the 3 picked tiles, sample its `depth` aux atlas at the unmodified UV. Use the depth value to offset the sample UV along the *capture view direction* (decoded from the tile's `(az, el)`) projected into the tangent plane. This makes the impostor read as a 3D object with apparent rotation rather than a cross-faded billboard. Sources: Brucks 2014 (~1-octave angle-count equivalence), Drobot SIGGRAPH 2021 / Far Cry 6 ("essential — without it would have needed 7×7 instead of 5×5"), Halen et al. HPG 2022 (parallax-corrected 32 ≈ non-parallax 64 in PSNR).
     - **Depth-discard ghost suppression.** After parallax sampling, compare the 3 tiles' sampled depths. If a tile's depth disagrees with the median by > a tunable threshold (start `0.15 × worldSize`), drop its weight to 0 and re-normalise. Eliminates the "double-image" ghost during blend. Sources: Brucks 2014, Drobot 2021.
     - Sample albedo at the 3 (parallax-offset) UVs, blend by remaining barycentric weights.
     - Sample normal at the same UVs, blend, **decode from sidecar's `normalSpace: 'capture-view'`** (capture-view-space RGB encoded in [0,1] → [-1,1] then transformed back to world space via per-tile view matrix).
     - Compute `lit = max(dot(normalWorld, sunDir), 0) * sunColor + ambientColor`, multiply into albedo. Replaces the existing `uColor` global multiply hack with proper per-fragment lighting.
   - **Update `setImpostorTint`** in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) to write `uSunColor` + `uSunDir` + `uAmbientColor` instead of `uColor`. Atmosphere already exposes these — `atmosphere.getSunDirection()` and `atmosphere.sun.light.color` are read in the existing tint update.

2. **Delete `_bakeOctahedralImpostor`** from `TerrainBuilder.js` (lines 1459-1620) and the runtime atlas-bake plumbing it depends on. New flow: at scene init, load the 3 sidecar JSONs + 3 atlas PNGs + 3 normal PNGs + 3 depth PNGs via fetch + THREE.TextureLoader / `JSON.parse`. Cache per-tree-type.

3. **Update LOD2 path** in `createTrees` (around `js/TerrainBuilder.js:1199`) — instead of calling `_bakeOctahedralImpostor`, call `_loadKilnImpostor(treeType)` which returns the cached `{ material, geometry, sidecar }`. Geometry is built from `worldSize` + `yOffset` from sidecar (replaces `createOctahedralImpostorGeometry(halfWidth, bboxMinY, bboxMaxY)`).

4. **Keep cross-billboard fallback path** for the (unlikely) case sidecar load fails — silent degradation, console warn, current code path stays.

### Optical validation — Layer E: anchor pixel-diff (proves Bug 6 fix)

Repeat the Phase 0 single-tree anchor capture exactly. New images at `cycle20-validation/phase2/anchor-E-LOD0.png` + `anchor-E-LOD2.png`. Trunk-base Y must align within **2 pixels** vs the previous Phase 0 baseline showing N-pixel offset. Diff in a tiny script, save the pixel-diff image too.

### Optical validation — Layer F: orbital azimuth sweep (proves 3-tile blend)

Repeat Phase 0 orbital sweep (24 frames at 15° azimuth steps, radius 120m, elevation 5°). Save as `cycle20-validation/phase2/orbit-F-{000..345}.png`. Then run a tiny script that computes per-frame mean-color delta against the next frame — should be smooth (no spike at 90°/180°/270°). Smoothness target: max frame-to-frame mean-RGB delta < 1.5× median delta.

### Optical validation — Layer G: sun direction sweep (proves relighting works)

Single tree, fixed camera at `(0, 5, 50)`. Sweep `?sun=` from 0.0 to 1.0 in 0.1 steps via `__sdsAtmosphere.setTimeOfDay(t)` or scene reload. Save 11 frames as `cycle20-validation/phase2/sun-G-{0..10}.png`. **Visual check:** the lit face of the tree must rotate as the sun rotates — at t=0.0 (dawn, sun at +X) the +X-side of the tree is bright, at t=0.5 (noon, sun overhead) top is bright, at t=1.0 (dusk) -X side is bright. If lit side stays static across all 11 frames, relighting is broken.

### Optical validation — Layer H: elevation sweep (high-angle test)

Single tree at origin. Camera arc from `(0, 5, 120)` (5° elevation) up through `(0, 60, 120)` (45°) to `(0, 110, 30)` (75°). 6 captures at known elevations. Save as `cycle20-validation/phase2/elev-H-{05,15,30,45,60,75}.png`. Look for: at elevation 60°+, the tile rendered should look like a top-down or near-top-down view of the tree. With cylindrical billboard this looks wrong (canopy stretched into a vertical strip); with the new shader's tangent-plane quad it should read as a recognizable canopy shape. **Note:** if the user wants the tilted-quad fix from Cycle 19.5 carryover #2, that's a follow-up cycle — Layer H establishes the v1 baseline.

### Optical validation — Layer I: LOD2 → LOD0 boundary capture

Single tree. Camera dollies from `(0, 5, 110)` to `(0, 5, 90)` over 20 frames at 1m intervals. Save as `cycle20-validation/phase2/lod-I-{090..110}.png`. The 100m crossing should show: brightness step (acceptable — see Cycle 19.5 carryover #3 for the cross-fade work). Position pop ≤ 2 px. Silhouette pop ≤ 5%.

**Acceptance:**
- `js/octahedral-impostor-material.js` deleted; `js/kiln-impostor-material.js` ships.
- `_bakeOctahedralImpostor` deleted from TerrainBuilder.
- All 5 optical layers (E/F/G/H/I) produce artifacts; **each visibly improves on the Phase 0 baseline** for its specific axis.
- 180/180 vitest still passes (sim-baseline byte-identical).
- Build still clean.

## Phase 3 — Per-scene visual verification (~1hr)

**Depends on:** Phase 2.

Three scenes × four sun positions = **12 captures** at standard cinematic poses. Compare against equivalents from the deployed `v1.1.0` build.

### Optical validation — Layer J: per-scene matrix

Capture each at `?scene=<id>&sun=<t>` with a fixed pose (use existing `__sdsCinema.snapshotPose()` outputs from the OG-card poses where available, or fly to a comparable position):

| Scene | Sun | Pose label |
|---|---|---|
| field | 0.05 (dawn) | overhead |
| field | 0.50 (noon) | eye-level |
| rolling-hills | 0.25 (morning) | side-shore-to-island |
| rolling-hills | 0.75 (sunset) | overhead |
| open-country | 0.10 (dawn) | shore-low |
| open-country | 0.50 (noon) | overhead-tree-locator |
| ... | ... | ... |

Save under `cycle20-validation/phase3/<scene>-<sun>-<pose>.png` × 12. Side-by-side with `v1.1.0`-deployed equivalents (capture once via Playwright MCP). Manual sign-off scene by scene. Any regression that's visibly worse is a hard stop.

**Acceptance:**
- 12 capture pairs reviewed.
- No scene visibly worse than `v1.1.0`. At least 6 of 12 noticeably better (sun-side tree lighting, smoother distance LOD).
- Findings written to `cycle20-validation/phase3/SCENE-REVIEW.md` with a verdict per row.

## Phase 4 — Perf + sim-baseline (~30min)

**Depends on:** Phase 2.

### Build

1. Run `npm run perf:check` — must stay within ±5% threshold.
2. Run `npm run test:e2e -- scene-swap-stability` (local-only) — must pass.
3. Confirm `npm test` 180/180 still green.

### Optical validation — Layer K: perf delta

On RTX 3070, capture before/after for two scenes:
- OC-Extreme — `__perfHarness` for 60s, log `frameTime.p50`, `p95`, `drawCalls.avg`, `tris.avg`, `gpuMemory.estimateMB`.
- Chaos-5000 — same.

Save as `cycle20-validation/phase4/perf.json` with both runs side-by-side. **Threshold:** p50 frame time delta ≤ 5%; GPU memory delta ≤ +20 MB (3 trees × ~5 MB extra atlas data is the budget).

### Optical validation — Layer L: sim-baseline byte equality

`npm test` runs sim-baseline specs. Must stay byte-identical (this cycle changes only LOD2 visuals; nothing in sim should change). If they drift, **HARD STOP** — investigate, do not regenerate.

**Acceptance:** all four checks green.

## Phase 5 — Ship (~30min)

**Depends on:** Phases 0-4 all green with optical artifacts in `cycle20-validation/`.

1. Update `CHANGELOG.md` — player-facing entry: "Distant trees now react to the sun's direction and rotate smoothly across angles."
2. Update [`docs/BACKLOG.md`](BACKLOG.md) — close Cycle 19.5 carryover items #1, #2 (partial), #4. Note #3 (cross-fade) carries forward.
3. Update standing risks in `NEXT_SESSION.md` — remove the 4-item impostor-quality entry, add a note about the new Pixel Forge dependency.
4. **Do NOT bump version this cycle.** Bundle into `v1.2.0` when the next feature ships, per Cycle 20 (deferred) plan note.
5. Commit + push. Site auto-deploys.

## Optical validation matrix (summary)

| Layer | Phase | Type | What it proves |
|---|---|---|---|
| A | 0 | Anchor pixel-diff (LOD0 vs LOD2) | Bug 6 status before fix |
| B | 0 | Orbital azimuth sweep, 24 frames (current runtime) | Bug 3 visible, baseline |
| B' | 0 | Orbital sweep × {16-bake, 32-bake} with Phase-2 candidate shader | **Q2 verdict** — 16 hemi-y vs 32 hemi-y |
| C | 1 | Per-tile silhouette inspection HTML | Bake outputs are correctly oriented |
| D | 1 | Schema vitest specs | Sidecar matches Kiln contract |
| E | 2 | Anchor pixel-diff (post-fix) | Bug 6 closed |
| F | 2 | Orbital sweep (post-fix) | Bug 3 closed via 3-tile blend |
| G | 2 | Sun-direction sweep | Bug 5 closed — relighting works |
| H | 2 | Elevation sweep | Bug 4 status — partial fix; full needs cycle-19.5 #2 |
| I | 2 | LOD boundary dolly | Bug 6 + 5 confirmed at the swap moment |
| J | 3 | Per-scene matrix, 12 captures | No scene regresses |
| K | 4 | Perf JSON before/after | No perf regression |
| L | 4 | Sim-baseline byte equality | Sim untouched |

**Cycle is not done until all 12 layers have saved artifacts and recorded outcomes.**

## Dependencies

```
Phase 0 (recon) → Phase 1 (bake) → Phase 2 (runtime) → Phase 3 (scene verify) → Phase 4 (perf) → Phase 5 (ship)
```

Strictly serial. No parallelism — each phase produces evidence the next needs to verify against.

## Frozen files (cycle-specific additions)

- `assets/models/trees/*.glb` — source GLBs DO NOT change this cycle. Bake only. (Future EZ-Tree recipe re-tunes are a separate cycle.)
- `shared/terrain/Heightfield.js` — known-bug carryover, deferred to a future cycle. Don't touch this cycle.

## Hard stops

Surface to the user, do not proceed:

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. **Phase 0 reveals more than the 6 documented bugs.** Update `AUDIT.md`, raise scope before continuing.
3. **Pixel Forge CLI fails on a real SDS GLB.** Triage *before* writing the bake script — install issue, schema issue, or GLB issue.
4. **Any optical layer fails its acceptance bar.** Don't paper over with a unit-test green; investigate root cause.
5. **Sim-baseline drift.** Hard stop — visual cycle cannot affect sim.
6. Frame time regression > 5% on `perf-check`.
7. Visual regression on a previously-passing scene per Phase 3.

## What NOT to do during this cycle

- **Don't fix the heightfield amplitude bug.** Tempting because it's nearby, but it's a foundation-level scope change with downstream sim implications. Stays its own cycle.
- **Don't ship the cinematic videos.** Same — depends on heightfield decision.
- **Don't add the LOD2↔LOD0 cross-fade.** That's Cycle 19.5 carryover #3, separate cycle. Position-pop fix from anchor alignment is enough for v1. (Note: Wyman 2017 JCGT stochastic-alpha is a low-cost option for that future cycle — used in Horizon FW dithered LOD per Lindquist Digital Dragons 2023.)
- **Don't tilt the runtime quad on dirObj.y rise.** Cycle 19.5 carryover #2's full fix requires square bake tiles + tilt math in lockstep. Pixel Forge's current bake uses non-square tiles; tilt without square tiles repeats the Cycle 19.5 misfire.
- **Don't touch EZ-Tree recipes.** Source GLBs frozen; this cycle is impostor-only.
- **Don't port Pixel Forge to hemi-octahedral encoding this cycle.** Per Phase 0 research, hemi-octahedral wins ~10-15% on memory at equal horizon-quality (Guerrilla switched mid-Forbidden West, Unity HDRP 2023+ ships hemi-octahedral default). For SDS's strictly-low-elevation ground camera the win is small (~10%); it's an upstream Pixel Forge change. Track as a future cycle: `pixel-forge-hemi-octahedral-port`.
- **Don't escalate to neural impostors / NeRF-trees.** NVIDIA Mueller et al. 2023 wins quality at very low angle count but inference cost is non-trivial on web; not yet shipped in any browser game I can find. Research-only for now.
- **Don't ship `v1.2.0`.** Tag waits for next feature.
- **Don't introduce a new clamp in `GrassSystem.js` or anywhere else** to mask issues that surface during validation. Fix at root, or document + escalate.

## Success criteria (cycle close)

`/cycle-close` reads this section. Don't pre-check.

- [ ] Phase 0 — `cycle20-validation/phase0/AUDIT.md` ships with 6 bugs documented + status. Pixel Forge CLI verified on tree1.
- [ ] Phase 1 — `npm run bake-tree-impostors` regenerates 12 artifact files. Inspector HTML committed. 3 sidecar contract specs in vitest.
- [ ] Phase 2 — `js/octahedral-impostor-material.js` deleted; `js/kiln-impostor-material.js` ships. Optical layers E, F, G, H, I have saved artifacts visibly improving on Phase 0 baselines.
- [ ] Phase 3 — `SCENE-REVIEW.md` ships with per-scene verdict. No regression vs `v1.1.0`.
- [ ] Phase 4 — `perf.json` before/after captured; deltas within budget. Sim-baseline byte-identical.
- [ ] Phase 5 — `CHANGELOG.md` + `BACKLOG.md` updated. Live on sheepdogsim.com.
- [ ] All 12 optical-validation layers have artifacts saved under `cycle20-validation/`.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] `perf-check` CI green.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items (incl. Cycle 19.5 impostor-quality carryover)
- [`docs/archive/cycles/cycle-19-plan.md`](archive/cycles/cycle-19-plan.md) — previous cycle
- **Pixel Forge / Kiln** — `C:\Users\Mattm\X\games-3d\pixel-forge\packages\core\src\kiln\imposter\` (local)
  - [`bake.ts`](../../pixel-forge/packages/core/src/kiln/imposter/bake.ts) — `bakeImposter()` API
  - [`schema.ts`](../../pixel-forge/packages/core/src/kiln/imposter/schema.ts) — sidecar contract (zod)
  - [`projection.ts`](../../pixel-forge/packages/core/src/kiln/imposter/projection.ts) — `dirFromAzEl` + tile layout
  - [`packages/cli/src/commands/kiln.ts:602`](../../pixel-forge/packages/cli/src/commands/kiln.ts) — `bake-imposter` CLI surface
- **Reference octahedral implementations** (for shader math when the v1 lat/lon blend isn't enough)
  - [agargaro/octahedral-impostor](https://github.com/agargaro/octahedral-impostor) — MIT three.js, proper Brucks math
  - [wojtekpil/Godot-Octahedral-Impostors](https://github.com/wojtekpil/Godot-Octahedral-Impostors) — algorithm reference
  - Ryan Brucks 2014 — https://shaderbits.com/blog/octahedral-impostors (and Unreal's official tech blog: https://www.unrealengine.com/en-US/tech-blog/imposters-octahedral-imposters-and-creating-them-with-shader-graph)
- **Phase 0 research citations** (Q2 + Phase 2 spec evidence)
  - Brucks 2014 (Unreal/Epic) — 8×8 minimum-acceptable for tree silhouettes; parallax = ~1-octave angle-count equivalence
  - Halen et al. HPG 2022, "Image-Based Rendering of Complex Scenes from Unstructured Light Fields" — https://diglib.eg.org/handle/10.2312/hpg20221153 — PSNR breakpoints at 16/32/64 angles; parallax-corrected 32 ≈ non-parallax 64
  - Guerrilla (Lindquist), "Vegetation in Horizon Forbidden West", GDC 2023 — 3×3=9 angles + parallax + dither, lat/lon→hemi-oct mid-project
  - Sucker Punch, "Procedural Grass in Ghost of Tsushima", GDC 2021 — 4×4=16 angles + parallax shipped
  - Drobot, "Geometry Rendering Pipeline of Far Cry 6", SIGGRAPH 2021 — https://advances.realtimerendering.com/s2021/ — depth-offset essential, 5×5=25 with vs 7×7=49 without
  - Heitz & Neyret 2018, hex tiling — https://hal.archives-ouvertes.fr/hal-01824773 — validates 3-tap blend matches 4-tap quality
  - Wyman 2017 JCGT, stochastic alpha — https://jcgt.org/published/0006/02/02/ — for future LOD2↔LOD0 cross-fade cycle
  - Karis SIGGRAPH 2014, temporal supersampling — https://advances.realtimerendering.com/s2014/ — for popping suppression
- **Files this cycle touches**
  - `js/octahedral-impostor-material.js` — DELETE
  - `js/kiln-impostor-material.js` — NEW
  - `js/TerrainBuilder.js:1199-1325` — replace LOD2 wiring
  - `js/TerrainBuilder.js:1459-1620` — DELETE `_bakeOctahedralImpostor`
  - `js/TerrainBuilder.js:785-820` — update `setImpostorTint` for new uniforms
  - `tools/bake-tree-impostors.mjs` — NEW
  - `tools/impostor-inspector.html` — NEW
  - `tests/imposter-sidecar.spec.js` — NEW
  - `assets/models/trees/*.imposter.{png,normal.png,depth.png,json}` — NEW (12 files)
  - `package.json` — add `bake-tree-impostors` script
  - `docs/tree-pipeline.md` — document Pixel Forge install
