# Changelog

All notable changes to Sheep Dog Sim are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/).

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
