# Next Session — Cycle 32 (`mp-island-scenes` placeholder)

> **Updated:** 2026-05-09
> **For:** Cycle 32
> **Pickup priority:** Cycle 32 plan is **scaffolded only** at [`docs/cycle-32-plan.md`](docs/cycle-32-plan.md). Goal + phases need to be filled in. Top candidate is `mp-island-scenes` (Rolling Hills + Open Country in multiplayer; sim-deterministic; needs sim-baseline regen story) — rename the slug if Matt picks a different scope. Run `/cycle-start` once the plan is fleshed out.

Cold-start orientation: read [`AGENTS.md`](AGENTS.md), then [`CLAUDE.md`](CLAUDE.md), then the cycle plan top-to-bottom. The Cycle 31 close notes in [`docs/BACKLOG.md`](docs/BACKLOG.md) document the Matt-pickup items waiting on the just-shipped public-surface deploy.

## Cycle 31 close summary (autonomous run, 2026-05-09)

All 6 phases shipped end-to-end across 8 commits on `main` (1 doc-patch + 6 phase commits + 1 version bump). Pre-execution research spike caught two plan errors (broken `requestIdleCallback` modal-defer step + nonexistent `public/about.html` references) before any code shipped — Phase 1 trimmed from ~45m to ~25m as a result.

| Phase | Commit | Module |
|---|---|---|
| 0 — plan patch after spike | [`879409c`](https://github.com/matthew-kissinger/sds/commit/879409c) | [`docs/archive/cycles/cycle-31-plan.md`](docs/archive/cycles/cycle-31-plan.md) |
| 1 — crawler-content `<main>` + sr-only CSS | [`f540941`](https://github.com/matthew-kissinger/sds/commit/f540941) | [`index.html`](index.html), [`css/main.css`](css/main.css) |
| 2 — drop multilingual meta-keywords | [`61cd8db`](https://github.com/matthew-kissinger/sds/commit/61cd8db) | [`index.html`](index.html) |
| 3 — per-scene static landing pages | [`68fe4d9`](https://github.com/matthew-kissinger/sds/commit/68fe4d9) | [`public/scenes/`](public/scenes/) ×3 |
| 5 — devlog scaffold + 2 seed entries | [`44e3cd4`](https://github.com/matthew-kissinger/sds/commit/44e3cd4) | [`public/devlog/`](public/devlog/) ×3 |
| 4 — sitemap fix + expansion | [`1125062`](https://github.com/matthew-kissinger/sds/commit/1125062) | [`public/sitemap.xml`](public/sitemap.xml) |
| 6 — visible footer + GitHub topics | [`65a36a9`](https://github.com/matthew-kissinger/sds/commit/65a36a9) | [`index.html`](index.html), [`css/main.css`](css/main.css), GitHub repo topics |
| version bump + CHANGELOG | [`27f8bd7`](https://github.com/matthew-kissinger/sds/commit/27f8bd7) | [`package.json`](package.json), [`CHANGELOG.md`](CHANGELOG.md) |

Net change: site has real semantic body content for crawlers (sr-only `<main id="seo-content">` block + `<noscript>` fallback), three new per-scene landing pages with scene-scoped JSON-LD VideoGame schemas, two devlog seed entries with `Article` schemas, fixed sitemap (root → `public/`, 2 → 8 URLs), visible internal-link footer on the homepage, and a refreshed GitHub repo topics list. Player-visible delta → bumped `2.1.2 → 2.1.3`.

## Validation gates at close

- `npm test` — **297 / 304 pass** (7 skipped are e2e/flow). Flat vs Cycle 30 baseline; no sim-touched code.
- `npm run build` — clean, ~4.1s. `mainKB ≈ 589` / `threeKB ≈ 617`. CSS gained ~1KB from the `.seo-only` and `#site-footer` rules.
- `npx eslint shared/` — exit 0.
- `gh api repos/matthew-kissinger/sds/topics --jq '.names | length'` returns 20; includes all 5 acceptance-required (`webgl`, `threejs`, `multiplayer`, `simulation`, `cloudflare-workers`).
- Cycle-close reconcile hook hit the same regex collision as Cycle 29 + 30 (the "## Acceptance criteria — EARS format" template explainer header parses before the actual Success criteria block); walked acceptance manually.

## Matt-pickup waiting on the v2.1.3 deploy

Both items defer to Matt; not in scope for any autonomous Cycle 32 work:

1. **Submit to Google Search Console for re-indexing.** Once the `2.1.3` deploy is live, request indexing for `/`, `/about.html`, `/scenes/home-field.html`, `/scenes/rolling-hills.html`, `/scenes/open-country.html`, `/devlog/`, `/devlog/cycle-30-heightfield-unify.html`, `/devlog/cycle-29-gamestate-decomp.html`. Forces a recrawl + cache refresh; the stale cached title clears within 1–7 days typically.
2. **Paste itch.io description copy** from [`docs/itch-description/sheep-dog-sim.md`](docs/itch-description/sheep-dog-sim.md) into the itch project page's Description + Short Description fields. Optional devlog post body is in the same file.

## Carryover candidates for Cycle 32

In rough priority order — Matt picks at `/cycle-start`:

- **MP island scenes** (Rolling Hills + Open Country in multiplayer; sim-deterministic; needs sim-baseline regen story). Top candidate; placeholder slug already set.
- **Modal copy rewrite** — if post-deploy the Google snippet *still* substitutes the modal text after recrawl (1-7 days typical), rewrite [`js/locales/en/index.js:388-389`](js/locales/en/index.js) (`identity.welcome` + `identity.chooseIdentity`) so they don't read as "page content." UX-touching change, low-risk, ~30m of work. Defer until the recrawl signal is in.
- **`CYCLE_TEMPLATE.md` regex-collision fix** — `/cycle-close` reconcile hook hits the "## Acceptance criteria — EARS format" template explainer first and can't parse the actual Success criteria block. Cycle 29, 30, 31 all logged the manual workaround. Small fence-touched cleanup that could attach as Phase 0 of any cycle.
- **Bespoke pixel-forge rocks**, **octahedral impostors v2**, **cross-module polygon-spawn dedup**, **build-time `displacedHeights` bake into [`scripts/bake-heightmap.mjs`](scripts/bake-heightmap.mjs)**.

## Already in place (alignment foundation through Cycle 31)

- [`tests/refactor-baseline/`](tests/refactor-baseline/) characterization-test harness pattern.
- [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) mandates EARS Acceptance + ≤ 8 phases + EMERGENCY_STOPS reference. Note: reconcile-hook regex collision still open.
- [`.claude/hooks/cycle-close-reconcile.mjs`](.claude/hooks/cycle-close-reconcile.mjs) auto-evaluates testable predicates at cycle close (when its regex matches).
- [`.claude/skills/cycle-doc-dream/SKILL.md`](.claude/skills/cycle-doc-dream/SKILL.md) on hand if doc drift accumulates mid-cycle.
- [`shared/terrain/Heightfield.js`](shared/terrain/Heightfield.js) `bakeMeshGrid` (Cycle 30): callable from any consumer that has a heightfield + wants a triangle-interp-ready mesh grid (TerrainBuilder, tests, future Worker that loads scenes).
- Public-surface foundation (Cycle 31): `<main id="seo-content">` + `.seo-only` CSS class + `<noscript>` block in [`index.html`](index.html); per-scene + devlog static-page pattern under [`public/scenes/`](public/scenes/) and [`public/devlog/`](public/devlog/) — adding new entries is a single new HTML file + a sitemap line.

## Hard stops

Drawn from durable [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) + whatever Cycle 32 plan adds when its phases are filled in.

## Durable rules

See [`.claude/rules/`](.claude/rules/) for durable project rules. Cycle-32-specific scope guards live in [`docs/cycle-32-plan.md`](docs/cycle-32-plan.md)'s "What NOT to do" section once it's drafted.

## Repo state at handoff

- Cycle 31 close commit landed; main is at v2.1.3.
- 297/304 vitest specs pass (7 skipped).
- Production build: `mainKB ≈ 589` / `threeKB ≈ 617`.
- Working tree clean after the close commit.
- Last deploy on `main` (cycle-30 close commit) shows `failure` only because of the E2E (Chromium) Playwright job — Test + Pages + Worker + Perf all green. Pre-existing carryover from Cycle 29, accepted at Cycle 31 close. The cycle-31 close commit will trigger a fresh deploy run.

## Reference table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-32-plan.md`](docs/cycle-32-plan.md) — `mp-island-scenes` placeholder (scaffold only; needs Goal + Phases filled in) |
| Latest closed cycle | [`docs/archive/cycles/cycle-31-plan.md`](docs/archive/cycles/cycle-31-plan.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Closed cycles + deferred | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Slash commands | [`.claude/commands/`](.claude/commands/) — `/cycle-start`, `/cycle-close`, `/validate` |
| Hooks | [`.claude/hooks/`](.claude/hooks/) — `check-acceptance.mjs` (Stop) + `cycle-close-reconcile.mjs` |
| Skills | [`.claude/skills/`](.claude/skills/) — `cycle-doc-dream` |
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
