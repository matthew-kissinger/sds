# Next Session — Cycle 31 (`public-surface`)

> **Updated:** 2026-05-09
> **For:** Cycle 31
> **Pickup priority:** Cycle 31 scope locked: **`public-surface`** — fix the broken Google snippet (player-name modal leaks through as the search description), the broken production sitemap (file lives in repo root not `public/`, served as SPA fallback), and the empty-body crawler problem (`<body>` is two `<div>`s + scripts so Googlebot's renderer sees the modal first). Six autonomous phases. Audit findings + 30-day Cloudflare RUM data + per-query search ranking pulled 2026-05-09 are folded into [`docs/cycle-31-plan.md`](docs/cycle-31-plan.md). Voice-sensitive prose drafts (per-scene pages + devlog seed entries) land in cycle and Matt reviews at close.

Cycle 31 plan: [`docs/cycle-31-plan.md`](docs/cycle-31-plan.md). Cold-start orientation: read [`AGENTS.md`](AGENTS.md), then [`CLAUDE.md`](CLAUDE.md), then the cycle plan top-to-bottom — the **Audit findings** section in the plan is the load-bearing context.

## Cycle 30 close summary (autonomous run, 2026-05-09)

All 3 phases shipped end-to-end across 4 commits on `main`:

| Phase | Commit | Module |
|---|---|---|
| 1 — `Heightfield.bakeMeshGrid` helper | [`83cb451`](https://github.com/matthew-kissinger/sds/commit/83cb451) | [`shared/terrain/Heightfield.js`](shared/terrain/Heightfield.js) |
| 2 — `TerrainBuilder` consumes `bakeMeshGrid` | [`37e5c54`](https://github.com/matthew-kissinger/sds/commit/37e5c54) | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) |
| 3 — Delete `+0.05m` defensive lift + codify | [`a19a8e3`](https://github.com/matthew-kissinger/sds/commit/a19a8e3) | [`shared/terrain/Heightfield.js`](shared/terrain/Heightfield.js), [`tests/heightfield-mesh-y.spec.js`](tests/heightfield-mesh-y.spec.js), [`DECISIONS.md`](DECISIONS.md) |

Net change: visible-terrain-Y math has one home (`Heightfield.bakeMeshGrid`); Cycle 9 Phase 5's defensive `+0.05m` fallback in `meshSampleY` is removed; `meshSampleY` now throws a remediation-named error when called without a bound mesh grid. `js/TerrainBuilder.js`: 1,387 → 1,362 LOC (-25). Sim/physics keep using raw `sample()` — the split between sim-Y (deterministic) and visual-Y (mesh-aligned) stays intact.

## Validation gates at close

- `npm test` — **297 / 304 pass** (7 skipped are e2e/flow). Was 290 / 297 pre-cycle; +7 new specs all under `Heightfield.bakeMeshGrid — algorithm`.
- `npm run build` — clean, 4.10s. `mainKB=575` / `threeKB=603` (refactor-baseline `bundle-sizes.json` fixture flat).
- `npx eslint shared/` — exit 0.
- Refactor-baseline `terrain-mesh-hash` byte-identical for all 3 scenes (the Phase 2 refactor is byte-equivalent at the mesh level).
- Cycle-close reconcile hook hit the `## Acceptance criteria — EARS format` template-explainer header before the actual Success criteria block (same regex collision Cycle 29 logged); walked acceptance manually.

## Pickup priority for Cycle 31

Scope is **`public-surface`** — locked after a 2026-05-09 audit run. Plan at [`docs/cycle-31-plan.md`](docs/cycle-31-plan.md). Highlights:

- **Phase 1** — Crawler-content block + modal-mount defer in [`index.html`](index.html). The load-bearing fix; ships first so the rest compounds on a clean snippet.
- **Phase 2** — Drop the 18-language `<meta name="keywords">` stuffing.
- **Phase 3** — Three per-scene static landing pages under `public/scenes/` — voice-sensitive prose, Matt reviews at close.
- **Phase 4** — Move [`sitemap.xml`](sitemap.xml) from repo root to `public/`, expand with new URLs.
- **Phase 5** — `public/devlog/` scaffold + two seed entries (Cycle 30 + Cycle 29 rewritten in player voice). Voice-sensitive.
- **Phase 6** — Visible homepage `<footer>` with internal links + GitHub repo topics.

Total ~4hr autonomous. Player-visible delta warrants `v2.1.3` bump at close (matches the userversion already shipped to itch on 2026-05-09).

**Audit numbers (2026-05-09 pulse):**

- Cloudflare RUM last 30d: 330 page loads, 0 external referrers, ~11/day. US 290 / SG 30 / DE 10. GitHub: 4★ / 1 fork.
- Search: `sheep dog sim` ranks #4 (behind Come Bye Steam + 2 itch listings). `site:sheepdogsim.com` returns only the homepage.
- Snippet on Google: still leaking the welcome modal text + showing the OLD cached title.
- `https://sheepdogsim.com/sitemap.xml` returns the SPA's index.html instead of XML.

Carried-over Cycle-31 candidates that did NOT make this scope (deferred to Cycle 32 or later):

- **MP island scenes** (Rolling Hills + Open Country in multiplayer; sim-deterministic; needs sim-baseline regen story). Top candidate for Cycle 32.
- **`CYCLE_TEMPLATE.md` regex-collision fix** — small fence-touched cleanup that could attach as Phase 0 of any cycle. Cycle-29 + 30 + 31 all log a manual workaround.
- **Bespoke pixel-forge rocks**, **octahedral impostors v2**, **cross-module polygon-spawn dedup**, **build-time `displacedHeights` bake**.

## Already in place (alignment foundation through Cycle 30)

- [`tests/refactor-baseline/`](tests/refactor-baseline/) characterization-test harness pattern — Cycle 30's Phase 2 mesh-refactor was validated against the existing `terrain-mesh-hash` golden. Same pattern for any future TerrainBuilder change.
- [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) mandates EARS Acceptance + ≤ 8 phases + EMERGENCY_STOPS reference. **Note:** the reconcile-hook regex collision against the "## Acceptance criteria — EARS format" explainer header is still open; cycle-31 work that touches the template can address it as Phase 0.
- [`.claude/hooks/cycle-close-reconcile.mjs`](.claude/hooks/cycle-close-reconcile.mjs) auto-evaluates testable predicates at cycle close (when its regex matches — see template note above).
- [`.claude/skills/cycle-doc-dream/SKILL.md`](.claude/skills/cycle-doc-dream/SKILL.md) on hand if doc drift accumulates mid-cycle.
- [`shared/terrain/Heightfield.js`](shared/terrain/Heightfield.js) `bakeMeshGrid` (Cycle 30): callable from any consumer that has a heightfield + wants a triangle-interp-ready mesh grid (TerrainBuilder, tests, future Worker that loads scenes).

## Hard stops (cycle-specific — full durable list at [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md))

Drawn from [`docs/cycle-31-plan.md`](docs/cycle-31-plan.md):

1. **Visible UI regression on the canvas / mobile joystick / first-frame load.** This cycle is "make Google see the page differently"; if a sighted player notices a difference (other than the optional Phase 6 footer), abort the offending phase. The sr-only block must stay invisible to non-crawlers.
2. **Modal-defer breaks first-visit name flow.** Phase 1's `requestIdleCallback` wrap on the welcome modal must not leave first-visit users staring at a blank canvas for >500ms.
3. **Cloudflare Pages deploy serving SPA fallback for `/sitemap.xml` post-Phase-4.** Means the file move didn't take. Re-verify it's at `public/sitemap.xml`, not `public/sitemap.xml/index.html` or similar.
4. **Voice rejection at cycle-close.** If Matt rejects a draft scene/devlog page's prose at close, the page does NOT ship — defer to Cycle 32 carryover.
5. **Sim or render code touched.** Public-surface only. Any commit touching [`shared/`](shared/) or [`js/main.js`](js/main.js) per-frame loop is a cycle-31 hard stop.

## Durable rules

See [`.claude/rules/`](.claude/rules/) for durable project rules. Cycle-31-specific scope guards live in [`docs/cycle-31-plan.md`](docs/cycle-31-plan.md)'s "What NOT to do" section once it's drafted.

## Repo state at handoff

- Cycle 30 closed clean (pending push by Matt — autonomous run committed locally, will trigger fresh deploy on push).
- 297/304 vitest specs pass (7 skipped).
- Production build: `mainKB=575` / `threeKB=603` (refactor-baseline fixture flat).
- Last deploy on `main`: cycle-29 close commit shows `failure` in `gh run list` but only the **E2E (Chromium)** Playwright job failed — Worker + Pages both deployed successfully and the site is live. Carryover from Cycle 29 close, not introduced by Cycle 30. Cycle 30's close commit triggers a new run.
- `npx eslint shared/` zero errors.
- Working tree dirty after the close commit lands (the 4 Cycle 30 commits + this close commit are local and unpushed at the time this NEXT_SESSION line is written).

## Cycle 30 carryover (none)

All 3 Cycle 30 phases shipped. Two items the plan deliberately deferred:

- **Build-time `displacedHeights` bake** into [`scripts/bake-heightmap.mjs`](scripts/bake-heightmap.mjs) — would let the Worker pre-load the mesh grid without recomputing. Speculative until MP island scenes lands.
- **Inline / delete [`TerrainBuilder._groundY`](js/TerrainBuilder.js)** — it's a one-liner now, but [`.claude/rules/scene-and-render.md`](.claude/rules/scene-and-render.md) treats it as the named entry point. Inlining is a separate decision.

Both filed in [`docs/BACKLOG.md`](docs/BACKLOG.md) Cycle 30 entry under "Carryover deliberately deferred."

## Reference table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-31-plan.md`](docs/cycle-31-plan.md) — `public-surface` (6 phases, ~4hr autonomous, voice-sensitive prose reviewed at close) |
| Latest closed cycle | [`docs/archive/cycles/cycle-30-plan.md`](docs/archive/cycles/cycle-30-plan.md) |
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
| Heightfield (Cycle 30) | [`shared/terrain/Heightfield.js`](shared/terrain/Heightfield.js) — `bakeMeshGrid` + `meshSampleY` (throws if no grid bound) |

## Running locally

```
npm run dev    # Vite (:3000) + wrangler (:8787)
npm test       # vitest, ~1.5s full run (297 specs + 7 skipped)
npm run lint   # ESLint on shared/ (deterministic boundary)
npm run build  # production build
```

URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl`, `?cinematic=1`, `?ui=off`, `?sun=0.5`, `?perfMode=1`, `?tier=low|med|high`, `?tonemap=aces|neutral|linear|none`.
