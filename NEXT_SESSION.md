# Next Session - Cycle 32 (`apple-platform-validation` leading | `mp-island-scenes` alternative)

> **Updated:** 2026-05-09 (Apple-platform-validation work elevated above prior `mp-island-scenes` lead after iPhone water-render bug surfaced)
> **For:** Cycle 32
> **Pickup priority:** **Apple-platform validation harness has been elevated as Cycle 32's leading candidate.** An iPhone screenshot landed showing Rolling Hills water rendering as solid `#eaf6ff` off-white. Same bug class hit Mac Safari + iPhone in prior cycles; reactive single-device patches narrowed it to water-only but didn't close the structural gap. User explicitly called for proper engineering, not patchwork. Full analysis at [`docs/apple-water-bug-research-2026-05-09.md`](docs/apple-water-bug-research-2026-05-09.md). Cycle-32 plan ([`docs/cycle-32-plan.md`](docs/cycle-32-plan.md)) has a new "Priority elevation" section near the top with proposed phase shape (~2-3 day cycle). At `/cycle-start`, confirm Goal paragraph, decide if `apple-platform-validation` is the cycle's primary or runs alongside `mp-island-scenes`, route Phase 0 (iPhone SE if it boots, else LambdaTest free 60min), and pick Track A1 (rearchitect water without depth pre-pass) vs A2 (capability check + degrade).

Cold-start orientation: read [`AGENTS.md`](AGENTS.md), then [`CLAUDE.md`](CLAUDE.md), then the cycle plan top-to-bottom. The Cycle 31 close notes in [`docs/BACKLOG.md`](docs/BACKLOG.md) document the Matt-pickup items waiting on the just-shipped public-surface deploy.

## Cycle 31 close summary (autonomous run, 2026-05-09)

All 6 phases shipped end-to-end across 8 commits on `main` (1 doc-patch + 6 phase commits + 1 version bump). Pre-execution research spike caught two plan errors (broken `requestIdleCallback` modal-defer step + nonexistent `public/about.html` references) before any code shipped - Phase 1 trimmed from ~45m to ~25m as a result.

| Phase | Commit | Module |
|---|---|---|
| 0 - plan patch after spike | [`879409c`](https://github.com/matthew-kissinger/sds/commit/879409c) | [`docs/archive/cycles/cycle-31-plan.md`](docs/archive/cycles/cycle-31-plan.md) |
| 1 - crawler-content `<main>` + sr-only CSS | [`f540941`](https://github.com/matthew-kissinger/sds/commit/f540941) | [`index.html`](index.html), [`css/main.css`](css/main.css) |
| 2 - drop multilingual meta-keywords | [`61cd8db`](https://github.com/matthew-kissinger/sds/commit/61cd8db) | [`index.html`](index.html) |
| 3 - per-scene static landing pages | [`68fe4d9`](https://github.com/matthew-kissinger/sds/commit/68fe4d9) | [`public/scenes/`](public/scenes/) ×3 |
| 5 - devlog scaffold + 2 seed entries | [`44e3cd4`](https://github.com/matthew-kissinger/sds/commit/44e3cd4) | [`public/devlog/`](public/devlog/) ×3 |
| 4 - sitemap fix + expansion | [`1125062`](https://github.com/matthew-kissinger/sds/commit/1125062) | [`public/sitemap.xml`](public/sitemap.xml) |
| 6 - visible footer + GitHub topics | [`65a36a9`](https://github.com/matthew-kissinger/sds/commit/65a36a9) | [`index.html`](index.html), [`css/main.css`](css/main.css), GitHub repo topics |
| version bump + CHANGELOG | [`27f8bd7`](https://github.com/matthew-kissinger/sds/commit/27f8bd7) | [`package.json`](package.json), [`CHANGELOG.md`](CHANGELOG.md) |

Net change: site has real semantic body content for crawlers (sr-only `<main id="seo-content">` block + `<noscript>` fallback), three new per-scene landing pages with scene-scoped JSON-LD VideoGame schemas, two devlog seed entries with `Article` schemas, fixed sitemap (root → `public/`, 2 → 8 URLs), visible internal-link footer on the homepage, and a refreshed GitHub repo topics list. Player-visible delta → bumped `2.1.2 → 2.1.3`.

## Post-cycle-31 work (same day, 2026-05-09)

Hotfixes after Search Console crawl surfaced two issues + Cloudflare dashboard audit + Search Console actions:

| Commit | What |
|---|---|
| [`0c0d618`](https://github.com/matthew-kissinger/sds/commit/0c0d618) | JSON-LD trailing comma fix in `index.html` `WebApplication` block (pre-existing bug surfaced by Search Console) |
| [`64506ac`](https://github.com/matthew-kissinger/sds/commit/64506ac) | Canonical-URL alignment - Cloudflare Pages auto-strips `.html` and 308-redirects; Cycle 31 shipped `.html` URLs everywhere. Fixed across 9 files (sitemap + about + 3 scenes + devlog index + 2 entries + homepage). |
| [`f0a8822`](https://github.com/matthew-kissinger/sds/commit/f0a8822) | `public/llms.txt` (LLM/AI crawler manifest) + `public/.well-known/security.txt` (RFC 9116) |

**Cloudflare dashboard changes** (out-of-band, not in repo): Crawler Hints + Always Online + 0-RTT + Speed Brain + Cloudflare Fonts + Early Hints all enabled. Verified-good: SSL/TLS Full, HTTP/2 + HTTP/3, no AI bots blocked (Googlebot 352 reqs / ClaudeBot 15 reqs healthy), Bot Fight Mode off (intentional - would break MP), AI Labyrinth off (intentional - we want AI training).

**Search Console actions** (driven via Claude in Chrome MCP): sitemap re-submitted (Couldn't-fetch → Success, 8 pages discovered), "Validate fix" triggered on the JSON-LD parsing error, "Request indexing" sent for all 8 URLs.

**New skill:** [`.claude/skills/cloudflare-management/SKILL.md`](.claude/skills/cloudflare-management/SKILL.md) captures the dashboard navigation patterns + viewport-scale gotcha + the don't-touch list, so future agents can pick up CF audits without re-discovering.

**Live verification (post all fixes):** all 11 URLs return HTTP 200, all 3 homepage JSON-LD blocks parse cleanly, no `.html` 308 redirects.

## Validation gates at close

- `npm test` - **297 / 304 pass** (7 skipped are e2e/flow). Flat vs Cycle 30 baseline; no sim-touched code.
- `npm run build` - clean, ~4.1s. `mainKB ≈ 589` / `threeKB ≈ 617`. CSS gained ~1KB from the `.seo-only` and `#site-footer` rules.
- `npx eslint shared/` - exit 0.
- `gh api repos/matthew-kissinger/sds/topics --jq '.names | length'` returns 20; includes all 5 acceptance-required (`webgl`, `threejs`, `multiplayer`, `simulation`, `cloudflare-workers`).
- Cycle-close reconcile hook hit the same regex collision as Cycle 29 + 30 (the "## Acceptance criteria - EARS format" template explainer header parses before the actual Success criteria block); walked acceptance manually.

## Matt-pickup status

1. ~~**Submit to Google Search Console for re-indexing.**~~ ✓ DONE same day via Claude in Chrome (sitemap re-submitted, "Validate fix" triggered, "Request indexing" for all 8 URLs). Now passive - Google will recrawl over 1-7 days; "Fix validated" email when the JSON-LD warning clears.
2. **Paste itch.io description copy** from [`docs/itch-description/sheep-dog-sim.md`](docs/itch-description/sheep-dog-sim.md) into the itch project page's Description + Short Description fields. Optional devlog post body is in the same file. **Still Matt-pickup.**

## What to watch for in the next 1-7 days

These are passive signals from Google's recrawl. No action required unless something looks off:

- **Search Console → Page Indexing** - new URLs (`/scenes/*`, `/devlog/*`, `/about`) flip from "Discovered – currently not indexed" → "Indexed."
- **Search Console → Sitemaps** - discovered count stays at 8; status stays "Success."
- **Search Console → Unparsable structured data** - the issue clears + you get a "Fix validated" email.
- **Snippet for `sheep dog sim` in incognito search** - should stop showing the welcome modal text and start showing the meta description copy. **If it doesn't change by ~2 weeks post-recrawl, the next move is the modal-copy rewrite (Cycle 32 carryover #2).**
- **`site:sheepdogsim.com`** - should grow from 1 result (homepage only) to 8 (all sitemap entries).

## Carryover candidates for Cycle 32

Full research notes + open questions are in [`docs/cycle-32-plan.md`](docs/cycle-32-plan.md) "Priority elevation" + "Carryover from Cycle 31" sections. Summary in rough priority order - Matt picks at `/cycle-start`:

0. **Apple-platform validation harness** *(elevated 2026-05-09, leading, ~2-3 day cycle)* - rearchitect AnimeWater off the per-frame depth pre-pass dependency that Apple Metal-ANGLE silently fails on, plus stand up real iOS Safari CI via LambdaTest, per-shader unit tests via `headless-gl`, runtime pixel-sampling gate, and a local iPhone SE for live debug if it boots. Full analysis: [`docs/apple-water-bug-research-2026-05-09.md`](docs/apple-water-bug-research-2026-05-09.md). User confirmed: proper engineering, not patchwork.
1. **MP island scenes** *(was leading, demoted to alternative-if-blocked, ~1 cycle)* - RH + OC in multiplayer. Sim-deterministic; needs sim-baseline regen story. Worker DO needs heightfield + objective state machine. Wire-format implications need an audit before phase 1.
2. **Modal-copy rewrite** *(small, ~30m, defer until recrawl signal)* - only if Google's snippet still substitutes the welcome modal text after Cycle 31's recrawl finishes.
3. **`CYCLE_TEMPLATE.md` regex-collision fix** *(tiny, ~15m, fence-touched)* - Cycle 29/30/31 all manual-walked acceptance because of this. Could attach as Phase 0 of any cycle.
4. **Bespoke pixel-forge rocks**, **octahedral impostors v2**, **cross-module polygon-spawn dedup**, **build-time `displacedHeights` bake**, **inline `_groundY`** - see plan for size/shape per item.

## Already in place (alignment foundation through Cycle 31)

- [`tests/refactor-baseline/`](tests/refactor-baseline/) characterization-test harness pattern.
- [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) mandates EARS Acceptance + ≤ 8 phases + EMERGENCY_STOPS reference. Note: reconcile-hook regex collision still open.
- [`.claude/hooks/cycle-close-reconcile.mjs`](.claude/hooks/cycle-close-reconcile.mjs) auto-evaluates testable predicates at cycle close (when its regex matches).
- [`.claude/skills/cycle-doc-dream/SKILL.md`](.claude/skills/cycle-doc-dream/SKILL.md) on hand if doc drift accumulates mid-cycle.
- [`shared/terrain/Heightfield.js`](shared/terrain/Heightfield.js) `bakeMeshGrid` (Cycle 30): callable from any consumer that has a heightfield + wants a triangle-interp-ready mesh grid (TerrainBuilder, tests, future Worker that loads scenes).
- Public-surface foundation (Cycle 31): `<main id="seo-content">` + `.seo-only` CSS class + `<noscript>` block in [`index.html`](index.html); per-scene + devlog static-page pattern under [`public/scenes/`](public/scenes/) and [`public/devlog/`](public/devlog/) - adding new entries is a single new HTML file + a sitemap line.

## Hard stops

Drawn from durable [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) + whatever Cycle 32 plan adds when its phases are filled in.

## Durable rules

See [`.claude/rules/`](.claude/rules/) for durable project rules. Cycle-32-specific scope guards live in [`docs/cycle-32-plan.md`](docs/cycle-32-plan.md)'s "What NOT to do" section once it's drafted.

## Repo state at handoff

- Cycle 31 close commit landed; main is at v2.1.3.
- 297/304 vitest specs pass (7 skipped).
- Production build: `mainKB ≈ 589` / `threeKB ≈ 617`.
- Working tree clean after the close commit.
- Last deploy on `main` (cycle-30 close commit) shows `failure` only because of the E2E (Chromium) Playwright job - Test + Pages + Worker + Perf all green. Pre-existing carryover from Cycle 29, accepted at Cycle 31 close. The cycle-31 close commit will trigger a fresh deploy run.

## Reference table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-32-plan.md`](docs/cycle-32-plan.md) - `apple-platform-validation` leading (elevated 2026-05-09); `mp-island-scenes` alternative |
| Apple water-bug research | [`docs/apple-water-bug-research-2026-05-09.md`](docs/apple-water-bug-research-2026-05-09.md) - bug analysis + proposed engineering fix + tooling decisions |
| Cross-platform tooling matrix | [`docs/cross-platform-testing.md`](docs/cross-platform-testing.md) - updated 2026-05-09 with LambdaTest + `headless-gl` + iPhone SE plans |
| Latest closed cycle | [`docs/archive/cycles/cycle-31-plan.md`](docs/archive/cycles/cycle-31-plan.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Closed cycles + deferred | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Slash commands | [`.claude/commands/`](.claude/commands/) - `/cycle-start`, `/cycle-close`, `/validate` |
| Hooks | [`.claude/hooks/`](.claude/hooks/) - `check-acceptance.mjs` (Stop) + `cycle-close-reconcile.mjs` |
| Skills | [`.claude/skills/`](.claude/skills/) - `cycle-doc-dream` |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player CHANGELOG | [`CHANGELOG.md`](CHANGELOG.md) |
| Press kit | [`PRESSKIT.md`](PRESSKIT.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
| Public-surface entry points (Cycle 31) | [`index.html`](index.html) (`<main id="seo-content">` + `<footer id="site-footer">`), [`public/scenes/`](public/scenes/), [`public/devlog/`](public/devlog/), [`public/sitemap.xml`](public/sitemap.xml) |

## Running locally

```
npm run dev    # Vite (:3000) + wrangler (:8787)
npm test       # vitest, ~1.5s full run (297 specs + 7 skipped)
npm run lint   # ESLint on shared/ (deterministic boundary)
npm run build  # production build
```

URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl`, `?cinematic=1`, `?ui=off`, `?sun=0.5`, `?perfMode=1`, `?tier=low|med|high`, `?tonemap=aces|neutral|linear|none`.
