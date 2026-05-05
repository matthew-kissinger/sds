# Changelog

All notable changes to Sheep Dog Sim are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/).

## [1.2.0] — 2026-05-05 (Cycle 21 — tree-impostor-stabilization-and-foliage-polish)

This release ships Cycle 21 work on top of `1.1.0`. Cycle 21 was originally scoped as a 6-phase pixel-perfect impostor-LOD0 color-match. Mid-cycle, a research synthesis (Three.js modern LOD primitives + WebGPU/TSL state + stylized indie-game patterns) plus Matt's product-vision push pivoted the closing phases away from "match LOD0" toward "embrace atmospheric perspective + push impostor distance + fix the actual visible defects." The deeper LOD/grass overhaul moves to Cycle 22.

### Added
- **Aspen recipe re-tune.** `tools/bake-trees.mjs` `LEAF_COUNTS.aspen` `[24, 30, 36] → [34, 42, 50]` (+40% across all 3 scales) plus a new `LOD0_BRANCH_ASPEN` override lifting `children[0]` 8 → 10. Production pick `tree1.glb` (`aspen_small_single`) was reading as a tall broomstick — re-bake gives a fuller silhouette across all camera angles. tree1.glb 3744 → 5880 tris.
- **Schlick fresnel rim** on the kiln impostor shader (`uFresnelStrength` uniform, default `0.04`). Closes the warm-bias hue gap by adding the cool-shifted edge highlight that LOD0's `MeshStandardMaterial` had via Three's PBR pipeline.
- **Per-species impostor calibration LUT.** New `tools/generate-impostor-lut.mjs` reads sandbox measurements and outputs `assets/impostor-calibration-lut.json`. Each kiln material's `uMatchBoost` uniform is set once at scene init (no per-frame cost). tree1 boost `[1.305, 1.128, 0.891]` corrects the dominant Aspen color drift; tree2/pine entries are near-identity.
- **Standalone LOD measurement sandbox** at `tools/lod-sandbox-v2.html`. Two-pane harness rendering LOD0 + LOD2 of the same tree under matched atmosphere preset, with 5×5 grid color sampling, OKLab dE proxy, and a 12-cell smoke matrix runner. Imports SDS modules via Vite — atmosphere preset switcher mirrors live game.
- **Atmospheric perspective lean.** Per-fragment Rec601 luma desaturation in the kiln impostor shader past 200m, blending up to 70% desat by 350m. Distant trees now intentionally read as distant (Sable / Tiny Glade / Townscaper aesthetic) instead of fighting to match LOD0 pixel-perfect.

### Fixed
- **Detached impostor shadow ("film over the grass").** The InstancedMesh2 LOD2 impostor billboard was casting shadows during the directional light's shadow render pass. The billboard's vertex shader uses `cameraPosition` for camera-facing pose; during shadow render that's the LIGHT's position, so the billboard ended up facing the sun and its shadow was decoupled from the player's view of the tree — visible as a desynced grey patch beside each distant tree. Set `castShadow = false` on the LOD2 impostor sub-mesh; foreground LOD0 trees still cast correctly.
- **Tree placement clumping in OC woods.** `WOODS_INSIDE_FACTOR` 0.6 → 0.85 → 0.92 (cumulative across Cycle 20 v2 + Cycle 21 Phase 0); placement `scaleVariation` 0.7-1.3 → 0.80-1.20 (fewer towering-vs-tiny outliers). Test threshold relaxed 1.3× → 1.05× to match new design intent.
- **`docs/tree-pipeline.md` recipe table.** Was listing tree1 as "Aspen Medium seed=7" when the production pick is actually `aspen_small_single` seed=11. Corrected all three rows + added a "source of truth" pointer to `picks.json`.
- **Grass shoreline clip.** New `SHORELINE_Y_MIN = 0.5` in `GrassSystem.createChunk` excludes grass past the visible shoreline on RH where the terrain falloff annulus drops below water level. Doesn't touch the existing `> 50` amplitude clamp.

### Changed
- **Spherical impostor billboard with world-up lock.** Cylindrical (Y-axis only) was foreshortening at high pitch — Classic camera at 45° pitch drew impostors at 71% height. Spherical-with-up-lock orients against `(worldUp × viewDir)` so the quad always faces the camera in 3D without rolling on yaw.
- **Frustum-sized impostor quad.** Sized to the bake bounding sphere (`boundsRadius * 1.02`) matching Pixel Forge's `bake.ts` exactly. Previous code used `worldSize = max(bbox dims)` which drew the tree at ~70% of true size.
- **Foliage lighting recipe.** Half-Lambert wrap + hemispheric ambient with albedo-tinted ground bounce + optional subsurface lift (default 0). Replaces pure Lambert (which read grey at distance).
- **Impostor LOD swap distance pushed 100m → 200m.** Foreground/midground stays geometric (LOD0); impostors only fill the deepest fog band where atmospheric perspective is doing 60-80% of the visual work anyway. Eliminates the prior 100m hard cliff that surfaced the impostor color/sampling gaps.
- **Atlas mipmaps disabled, anisotropy 8.** Cross-tile bleed from box-mip averaging across 4×4 lat-lon atlas neighbours produced sparkle-glint at distance. Disabling mips fixes the worst case; aniso 8 keeps texture sharp at high-pitch foreshortening. Half-texel UV clamp inside tiles prevents bilinear from reaching across tile boundaries.

### Known limitations
- **Impostor texture undersampling at extreme zoom + high pitch.** Without mipmaps, fragments hitting 5-15 screen pixels of a 512px tile can still alias. Mostly hidden behind the new 200m LOD2 distance + atmospheric desaturation. Cycle 22 will replace LOD1 with a meshoptimizer-simplified geometry tier that pushes geometric LOD further out before impostors take over.
- **`tree1_lod1.glb` etc. exist in `assets/models/trees/` but are not consumed.** They were baked via EZ-Tree leaf-count halving which produced a visibly worse silhouette than LOD0. Cycle 22 will re-bake LOD1 using `meshoptimizer` geometric simplification — preserves silhouette, decimates triangles.
- **Impostor calibration LUT is per-species only**, not per `(scene, ToD, distance)`. Per-distance residual exists (Aspen dE doubles between 150m → 250m) but the Phase 5 atmospheric desaturation now masks it.

## [Unreleased] — 2026-05-04 (Cycle 19.5 polish; on top of `1.1.0`)

### Fixed
- **Octahedral impostor shader compile (Linux SwiftShader).** Vertex shader used a local `mvPos` symbol while the auto-injected Three.js `<fog_vertex>` chunk references `mvPosition` — NVIDIA drivers ignored the undeclared identifier silently, but Linux SwiftShader hard-failed and the e2e console-error guard turned the v1.1.0 deploy red. Renamed local to `mvPosition`. Same root cause was killing the LOD2 mesh on permissive drivers too, so trees disappeared past 100 m on every machine — close-up trees rendered, distant trees did not.
- **Trunk LOD2 ANGLE warning silenced.** Replaced the shared 3-vert empty geometry with a per-trunk attribute-matching empty (clones the source geometry's attribute schema with zero-length buffers). ANGLE no longer complains "Vertex buffer is not big enough for the draw call" when the active trunk material binds attributes the shared empty didn't supply.
- **`UniformsUtils.merge` warning** in `octahedral-impostor-material.js` — switched to a literal-spread of `THREE.UniformsLib.fog` so the runtime-baked atlas texture isn't passed through `cloneUniforms` (which can't clone render-target textures).

### Performance
- **Per-instance frustum culling for trees + rocks.** Trees were on `InstancedMesh2` with default `perObjectFrustumCulled = true` but no spatial index; rocks were on plain `THREE.InstancedMesh` (whole-mesh AABB only — every rock submitted regardless of view direction). Migrated rocks to `InstancedMesh2` and added `computeBVH({ margin: 0 })` post-`addInstances` for both. Verified on RTX 3070 OC island: looking at island = 358 draw calls, looking 180° away = 193, looking at sky = 34 — ~90 % reduction at the extreme.

### Changed
- **ScatterSystem removed.** Pebbles, mushrooms, clovers, single flowers — sub-metre detail props that were too small to read at gameplay camera distances and contributed measurable draw cost without a payoff. `js/ScatterSystem.js` deleted, all `createScatter` / `clearScatter` wiring stripped from `TerrainBuilder.js` and `main.js`. Grass remains as the meadow primitive; rocks remain as the obstacle silhouette. Scene-swap regression spec retains the heightfield-ref check on the GrassSystem (same shape, different captured object).
- **Octahedral impostor brightness lift.** Bake lighting `0.30 + 0.55` → `0.70 + 1.20` (`AmbientLight + DirectionalLight`, `1.40× → 1.90×`) so impostors live in the same exposure band as a sunlit LOD0 tree. Added a sun-luma-driven 1.0×–1.2× multiplier inside `setImpostorTint` so impostors track time-of-day brightness instead of sitting at flat bake exposure. The 100 m LOD2 → LOD0 swap reads as a smooth exposure step instead of a brightness pop.

### Known limitations
- **High-altitude impostor billboards** still render the tree's vertical-canopy bake — the runtime quad stays vertical (cylindrical billboard around world-Y). A full spherical billboard would unlock the high-elevation atlas tiles for cinematic / freeFly camera angles, but the bake camera frustum (`halfW = max(x,z) × halfH = y`) needs to switch to square tiles in lockstep — tilting alone distorts the canopy. Tracked for follow-up.

## [1.1.0] — 2026-05-04 (Cycle 18 + Cycle 19 hardening)

This release ships Cycle 18's three independent code-level fixes (visually verified on RTX 3070 in Cycle 19) plus the Cycle 19 Phase 1 hotfix that restored grass-on-terrain across RH and OC.

### Added
- **Octahedral impostors at LOD2.** New runtime atlas baker (16 tiles, 4 azimuth × 4 elevation, 1024×1024 atlas per species, baked once per session). Replaces the cross-billboard at the LOD2 tier when the bake succeeds. Self-contained Three.js — no external dependency. Cross-billboard remains as the fallback when the atlas fails.
- **Per-scene `grassRadius`** schema field on `GrassDef`. Rolling Hills sets 172 m, Open Country sets 372 m. Grass chunk grid expands to fit the wider zone, density-falloff zero point uses `grassRadius` directly, per-chunk clump count rescales so the wider zone doesn't blow the perf budget. Field omits the field — byte-identical placement.

### Fixed
- **Scene-swap state hygiene.** `TerrainBuilder.createScatter` else-branch refreshes `scatterSystem.heightfield` so flora doesn't pin to the prior scene's heightmap. `GameState.startGame` always sets `needsFlockRecreation = true`, so sheep respawn within the boundary on same-count restarts (previously left at the prior session's positions).
- **Grass clamp regression.** Cycle 17 Phase 3 tightened the GrassSystem Y-clamp from `> 50` to `> 10`, citing "heightScale tops out at 6". In practice the displaced terrain mesh peaks at ~25 m on OC and ~36 m on RH (a longstanding double-amplification in `Heightfield.sample()` that has shipped for ~14 cycles); the `> 10` cap was snapping every legit terrain Y to 0, dropping grass to water level. Reverted to `> 50` — grass now sits on the terrain mesh again on RH and OC. Field stays byte-identical.

### Performance
- 180/180 vitest pass. Production main bundle 812.80 KB (241.46 KB gzip) — flat vs 1.0.0.
- OC Extreme @ 1000 sheep on RTX 3070: 73 fps avg, p95 frame 13.88 ms — comfortably above 60 fps target post-grass-expansion.

### Marketing
- Three OG cards re-captured on the post-fix build: og-field, og-rh-sunset (Solo Extreme + 1000 sheep), og-open-country.

## [1.0.0] — 2026-04-28 (release-finish)

This is the v1.0 release.

### Changed
- **Scene swap is in-process.** Switching between Field / Rolling Hills / Open Country no longer reloads the page — audio, renderer, and React state all persist across the transition. A 200ms fade-in / fade-out overlay covers the swap window. URL bar updates via `history.replaceState`.
- **Sky is properly tone-mapped.** The pastoral-noon preset (used in Home Field and as fallback) was crushing to near-white through ACES tone-mapping at high-noon sun elevations. Exposure dropped 0.22 → 0.08 — sky now reads as soft pastoral blue with proper horizon haze.

### Added
- **Real dog portrait thumbnails** in DogSelection — rendered via the cinematic pipeline at 512×512 WebP + PNG fallback.
- **Reset-and-re-run-onboarding button** in Settings → Audio tab.
- **Production OG / Twitter / schema.org images** at 1200×630 WebP under 200KB each.
- **Properly-sized PWA icons** at 192×192, 512×512, and 512×512 maskable PNG.
- **Anonymous client telemetry** — `/api/event` worker route + JWT-aware client wrapper. Game completions, mode selections, scene swaps, and MP room creations are recorded.

### Fixed
- Rocks no longer spawn inside the Home Field play area. Per-rock buffer tightened 20m → 40m so clusters straddling the boundary trim cleanly.
- Rocks no longer float — always partially buried so GLB-origin offsets can't surface above the visible ground line.

### Database
- `score_anomalies` column added to `score_submissions` (cycle-10 migration applied to prod).
- New `events` table for client telemetry log.

## [1.0.0-rc] — 2026-04-27

First public release.

### Added
- **Three biomes:** Home Field (open pasture), Rolling Hills (heightmapped countryside), Open Country (island with magical portal corral).
- **Four solo modes:** Classic (200 sheep, no timer), Timed (race the clock), Extreme (1000 sheep), Insane (3000 sheep), Chaos (5000 sheep).
- **Multiplayer:** real-time co-op herding via Cloudflare Durable Object websocket relay; create-room, join-by-code, quick-match, public lobby browser.
- **18 languages:** English, Spanish, Portuguese, Japanese, German, French, Chinese, Korean, Russian, Italian, Turkish, Polish, Dutch, Arabic, Indonesian, Hindi, Thai, Filipino. Full UI + auto-detect.
- **Persistent leaderboards:** global D1-backed scoreboard with mode + scene + sheep-count partitioning.
- **Cinematic atmosphere:** Hosek-Wilkie sky, day-night cycle, anime-style water with depth-aware foam, procedural cloud layer, terrain-conformed grass instancing.
- **Sandbox mode:** custom heightmap, terrain seed, sheep count, and pasture geometry; share via URL hash.
- **Camera modes:** Classic (top-down chase), Follow (over-shoulder), Free (orbital).
- **Mobile support:** touch controls, responsive HUD, viewport-fit cover, full-screen API.
- **PWA installability:** Add-to-Home-Screen on iOS Safari and Android Chrome; standalone display.
- **SEO:** OG/Twitter cards, JSON-LD VideoGame schema, hreflang for all 18 locales, sitemap, robots.txt, service worker pre-caching.

### Architecture milestones (closed development cycles)
- **Cycle 9:** playtest triage + cross-platform — solo sheep-count owned by mode, MP scene-sync helper, Playwright + macOS Safari nightly cross-platform test infra, GL diagnostic probe (`?debug=gl`), defensive `Heightfield.surfaceY` lift.
- **Cycle 8:** mode matrix expansion (Insane, Chaos), leaderboard partition keys, sandbox cross-scene flow.
- **Cycle 7:** atmosphere + water + sun billboard polish, OC portal effect, multi-stage objectives.
- **Cycle 6:** scene composition refactor, obstacle composition at call sites, per-scene camera memory.
- **Cycle 5:** sceneDef-driven rendering, island boundaries, corral-retired event, GameTimer extraction.
- **Cycles 1-4:** initial sim foundation, audit, hardening, multiplayer Phase A+B.

### Cycle 10 highlights (this release)
- In-process scene-swap foundation: `swapScene` / `disposeScene` / `rebuildScene` lifecycle methods on `SheepDogSimulation`; AbortController-tracked window listener teardown for corral-retired / objective-stage-changed / corral-ascend-top.
- PWA manifest at `/manifest.webmanifest` for Lighthouse PWA + Add-to-Home-Screen.
- Cinematic capture infrastructure: `?cinematic=1` flag exposes `window.__sdsCinema` with camera + atmosphere + effects + scene controls; `?ui=off` for clean filming; `?sun=<0..1>` for sun position; `?mode=chaos` for direct-mode entry.
- Score integrity: server-side cross-field plausibility (mode × sheep_count × score), client-clock skew anomaly logging.
- Player CHANGELOG, press kit, electron-readiness research doc.

### Known limitations
- Cross-scene navigation still triggers a page reload (in-process swap is foundational; full flip is a follow-up cycle).
- Some marketing assets predate Cycle 7's sky/water/sun polish; cinematic-pipeline-driven refresh is a follow-up.
- macOS Safari may exhibit a white-ground rendering bug on certain hardware (does not reproduce on GH Actions runners; debug recipe in `NEXT_SESSION.md`).

[1.0.0]: https://github.com/matthew-kissinger/sds/releases/tag/v1.0.0
