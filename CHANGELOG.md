# Changelog

All notable changes to Sheep Dog Sim are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/).

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
