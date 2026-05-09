# Cycle 31 — public-surface

> Drafted 2026-05-09 after Cycle 30 closed and a public-visibility audit surfaced concrete fixable bugs in how Google sees sheepdogsim.com. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

The site looks "sloppy and generic" in Google because the player-name modal is leaking through as the search snippet, the production sitemap is broken, only the homepage is indexed, and Google's cached title is stale. This cycle fixes the **mechanical SEO surface** so the search result reads as a curated, multi-page indie game — not a single-page modal-first SPA — and gives crawlers real internal pages to follow. User-visible difference: the Google snippet for `sheep dog sim` stops showing "Welcome to Sheep Dog Sim! Choose how you'd like to be known…" and starts showing the meta-description copy; per-scene landing pages start appearing in `site:sheepdogsim.com`; the about + devlog pages become discoverable. **No marketing voice / external posting in scope** — that's Matt-pickup, separate from this autonomous cycle.

## Audit findings (the why)

The public-visibility pulse run on 2026-05-09 found:

- **Cloudflare RUM, last 30d:** 330 page loads. 0 external referrers (all direct + own-domain internal nav). ~11 hits/day. US 290 / SG 30 / DE 10.
- **Search ranking:** `sheep dog sim` ranks #4 (behind Come Bye Steam + 2 itch listings). `sheep dog sim browser game free` ranks #1. `site:sheepdogsim.com` returns **only the homepage** — about + everything else not indexed.
- **Snippet bug root cause:** `<body>` is server-empty (`<div id="canvas-container">` + `<div id="react-overlay">` + scripts). When Googlebot renders JS, the first visible text is [`PlayerIdentitySetup`](../js/components/StartScreen/PlayerIdentitySetup.js) ("Choose how you'd like to be known: Custom Name…"). Google overrides the (well-written) meta description with that modal text because it's what the page visibly is.
- **Stale Google cache:** the result still shows the old "SheepDog Simulator - Realistic Browser Herding Game | Free WebGL Simulation" title; current HTML has a different title. Google hasn't recrawled in a while.
- **Production sitemap is broken:** [`sitemap.xml`](../sitemap.xml) lives in repo root, not [`public/`](../public/), so Vite never copies it to `dist/`. The URL `https://sheepdogsim.com/sitemap.xml` returns the SPA's index.html (Cloudflare Pages SPA fallback) instead of XML. [`public/robots.txt`](../public/robots.txt) points to a non-existent sitemap.
- **Sitemap thinness:** only 2 URLs (`/` + `/about.html`) anyway, no scene URLs, no language variants.
- **Other surface bugs:** `<meta name="keywords">` is stuffed with 18 languages of the same term (Google ignores; smaller engines may treat as low-quality signal). No `<noscript>` fallback. About page has zero crawler-discoverable inbound links from homepage HTML.

What's already good (don't redo): meta description copy, three layered JSON-LD schemas (VideoGame + FAQPage + WebApplication), 18 hreflang locales, OG/Twitter cards, theme/manifest/PWA setup, HTTPS + canonical. The bones are solid; this cycle fixes the visible leaks.

## How to read this plan

This doc fixes the *shape* of the changes (where new HTML pages slot in, what gets injected into `<body>`, sitemap structure), not the prose copy details — voice-sensitive prose lands as drafts in this cycle and Matt edits at close if it doesn't feel right. Each phase is **fully autonomous**; copy review happens once at cycle-close, not per phase.

## Open questions to resolve before writing code

1. **Q1: Hide the crawler-content block visually with `clip-path` or via `aria-hidden + sr-only` pattern?** Author lean: **`clip-path: inset(50%); position: absolute; ...` (sr-only-style hidden)**. `display: none` is treated as low-quality by Google; `visibility: hidden` and `opacity: 0` work but the standard accessibility-friendly sr-only pattern is the cleanest signal. Resolved: **sr-only pattern**. Make sure the block is keyboard-skippable (`aria-hidden="true"` + `tabindex="-1"`) so it doesn't show up in screenreader navigation either — it's there for crawlers, not assistive tech.
2. **Q2: Per-scene landing pages — static HTML files or rendered routes?** Author lean: **static HTML files** (`/scenes/rolling-hills.html`, etc.). The site is a single-page app for gameplay; per-scene SEO pages should be plain HTML with prose + `<a href="/?scene=rolling-hills">Play Rolling Hills</a>` CTA so crawlers see real text and the click hands the user back to the SPA. Three new static files = three new indexed pages with zero SPA complexity.
3. **Q3: Devlog — single static `/devlog/index.html` or per-entry pages?** Author lean: **per-entry static pages** (`/devlog/cycle-30-heightfield-unify.html` etc.) with an index at `/devlog/`. Per-entry pages each get their own JSON-LD `Article` + appear individually in sitemap → multi-page discoverable content site. Two seed entries (Cycle 30 + Cycle 29) is enough to demonstrate the pattern; future cycles append.
4. **Q4: GitHub repo topics — included in this cycle or Matt-pickup?** Author lean: **included** (one `gh api` call, no voice). Topics: `webgl, threejs, multiplayer, cloudflare-workers, simulation, casual-games, browser-game, herding-game, open-source-game, three-js`. Bumps repo discoverability via GitHub topic pages; zero risk.

## Architecture / shared changes

This cycle introduces two new content surfaces that the codebase didn't have before:

1. **Crawler-content block** in [`index.html`](../index.html) — a `<main>` element above the canvas/overlay divs containing the H1 + prose + biome list + `<noscript>` fallback. Visually hidden via sr-only CSS. **This is the load-bearing fix** — once crawlers see real body text, they stop substituting the modal as the snippet.
2. **`public/scenes/` + `public/devlog/` static page tree** — flat HTML files served as-is by Cloudflare Pages, each with their own SEO meta + prose + structured data + a "Play" link back into the SPA. Plain HTML, no React / Vite rendering. Each new file appears in the sitemap and is independently crawlable.

The static pages reuse [`/about.html`](../public/about.html)'s pattern (already shipped — inline `<style>` + Inter font + green theme) so all the auxiliary pages share visual identity without a CSS/JS toolchain.

## Phase shape rules

A cycle has ≤ 8 phases, each fully autonomous OR fully paired. This cycle has 6 autonomous phases. Each phase has a single sharp goal and ≤ 2 hours of work.

## Acceptance criteria — EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/) so the lines are testable by construction:

- **Event-driven**: `When [trigger], the [system] shall [response].`
- **State-driven**: `While [precondition], the [system] shall [response].`
- **Unwanted-event**: `If [unwanted], then the [system] shall [response].`

Each line should be **grep-testable** — the response should be something a script can verify (`curl | grep`, file existence, `gh api` output, etc.).

## Phase 1 — Crawler-content block + modal mount defer (~45min)

**Independently testable.** This is the load-bearing fix; ships first so the rest of the cycle compounds on a fixed snippet.

1. **Add a `<main id="seo-content" aria-hidden="true" tabindex="-1">` block** at the top of [`index.html`](../index.html) `<body>`, before `<div id="canvas-container">`. Contents:
   - One `<h1>Sheep Dog Sim</h1>` (the proper game name + tagline subhead).
   - Two paragraphs of ~150 chars each: the meta-description copy verbatim, then a "Three biomes, six modes, 5,000 sheep, real-time multiplayer" sentence.
   - One `<ul>` with the three biome names + one-line each (Home Field / Rolling Hills / Open Country).
   - One `<ul>` with the six mode names (Just Play / Classic / Extreme / Insane / Chaos / Multiplayer).
   - A `<noscript>` block with a longer prose fallback + visible `<a href="/about.html">Read more about Sheep Dog Sim</a>` link.
2. **Hide visually via sr-only CSS** in [`/css/main.css`](../css/main.css):
   ```css
   .seo-only {
       position: absolute;
       width: 1px;
       height: 1px;
       padding: 0;
       margin: -1px;
       overflow: hidden;
       clip: rect(0, 0, 0, 0);
       white-space: nowrap;
       border: 0;
   }
   ```
   Apply to `<main id="seo-content" class="seo-only">`. Do NOT use `display: none` (Google penalizes).
3. **Defer welcome modal mount** in [`js/components/index.js`](../js/components/index.js) (or the React mount entry — confirm path). Wrap the initial mount in `requestIdleCallback` (with `setTimeout(fn, 100)` fallback) so the modal isn't the first DOM Googlebot's renderer captures. The crawler-content block above remains the first visible text in the rendered DOM for the first ~100ms.

**Acceptance (EARS):**

- When Phase 1 ships, then `curl -A "Googlebot" https://sheepdogsim.com/ | grep -E '<h1>Sheep Dog Sim'` shall return at least 1 match.
- When Phase 1 ships, then `curl -A "Googlebot" https://sheepdogsim.com/ | grep -c '<noscript>'` shall return at least 1.
- When Phase 1 ships, then [`index.html`](../index.html) `<body>` shall contain a `<main>` element with id `seo-content` whose first descendant heading is an `<h1>` containing "Sheep Dog Sim".
- While the page is rendered with no JS, `<noscript>` content shall be visible and contain at least 200 characters of prose plus a link to `/about.html`.
- If Phase 1 introduces any visible UI element to keyboard / sighted users beyond the existing canvas + React overlay, then Phase 1 shall abort.

## Phase 2 — Drop the meta-keyword stuffing (~10min)

**Depends on:** nothing.

1. **Replace** the current 18-language `<meta name="keywords" content="...">` line in [`index.html`](../index.html) with **either** a trimmed 8-keyword version (English only, real terms: `sheep dog sim, sheepdog simulator, sheep herding game, browser herding game, free browser game, multiplayer herding, threejs game, casual simulation`) **or** delete the meta-keywords line entirely. Author lean: **delete entirely**. Google ignores meta keywords; the multilingual stuffing is a faint negative signal at smaller engines and looks unprofessional in `view-source:`. Keyword discovery happens via the structured data + body content this cycle is adding anyway.
2. No other changes.

**Acceptance (EARS):**

- When Phase 2 ships, then `grep -c 'name="keywords"' index.html` shall return either `0` or, if kept and trimmed, exactly `1` and the content attribute shall not contain non-ASCII characters.
- When Phase 2 ships, then `grep -c '牧羊犬\|양치기\|سور\|симулятор' index.html` shall return `0` (no leftover multilingual keyword stuffing).

## Phase 3 — Per-scene static landing pages (~2hr)

**Depends on:** Phase 1 (so the homepage is a clean target before adding inbound links). Voice-sensitive: prose drafted in [`PRESSKIT.md`](../PRESSKIT.md) tone; Matt reviews at cycle-close.

1. **Create three new files** under `public/scenes/`:
   - `public/scenes/home-field.html`
   - `public/scenes/rolling-hills.html`
   - `public/scenes/open-country.html`
2. **Each file's structure** (mirror [`public/about.html`](../public/about.html) pattern — inline `<style>` reusing the green Inter theme, single `<main>`, no JS dependency on the SPA):
   - `<title>` — e.g. `Rolling Hills — Sheep Dog Sim` (≤ 60 chars).
   - `<meta name="description">` — scene-specific, ~150 chars (e.g. "Herd up to 5,000 sheep across a 180-metre sunset island. Free, browser-based, no install. Three modes plus multiplayer.").
   - `<link rel="canonical">` to the page itself.
   - JSON-LD `VideoGame` schema scoped to the scene (reuse the homepage's schema as a base, add a `gameLocation` field per scene, add a `mainEntityOfPage` pointing back at homepage).
   - One `<h1>` with the scene name, one tagline subhead, ~250–400 words of scene prose drawn from [`PRESSKIT.md`](../PRESSKIT.md) + [`README.md`](../README.md).
   - **`<a class="play-cta" href="/?scene=<id>">Play <Scene></a>`** — the load-bearing CTA. Hands the user into the SPA on the right scene.
   - Footer link back to `/` and `/about.html`.
3. **Add a small visible `<footer>` block** to [`/about.html`](../public/about.html) AND to each new scene page that lists "Other biomes" with cross-links so crawlers can discover all three pages from any one. Visual style minimal — single line of text with three links.

**Acceptance (EARS):**

- When Phase 3 ships, then `ls public/scenes/{home-field,rolling-hills,open-country}.html` shall list all three files.
- When Phase 3 ships, then `npm run build` shall copy all three files to `dist/scenes/`.
- When `curl https://sheepdogsim.com/scenes/rolling-hills.html` runs, the response shall be HTTP 200 and the body shall contain `<h1>` text with "Rolling Hills".
- For each scene page, the `<a>` to `/?scene=<id>` shall use the matching scene id (`field` for Home Field, `rolling-hills` for Rolling Hills, `open-country` for Open Country).
- When Phase 3 ships, then each scene page shall contain a JSON-LD `<script type="application/ld+json">` block whose parsed JSON has `"@type": "VideoGame"`.
- If any scene page exceeds 600 lines or 60 KiB raw, then Phase 3 shall abort and split — these are SEO landing pages, not novellas.

## Phase 4 — Sitemap fix + expansion (~20min)

**Depends on:** Phase 3 (need the new URLs to list).

1. **Move** [`sitemap.xml`](../sitemap.xml) from repo root to `public/sitemap.xml` so Vite copies it into `dist/`. Delete the root copy after move.
2. **Expand** the sitemap to include:
   - `/` (priority 1.0, changefreq weekly)
   - `/about.html` (priority 0.7, changefreq monthly)
   - `/scenes/home-field.html`, `/scenes/rolling-hills.html`, `/scenes/open-country.html` (priority 0.8, changefreq monthly)
   - `/devlog/` index (priority 0.7, changefreq weekly) — added by Phase 5
   - Each devlog entry — added by Phase 5
3. **Set `lastmod` to today's ISO date** on every entry.
4. **Verify** [`public/robots.txt`](../public/robots.txt)'s sitemap line is `Sitemap: https://sheepdogsim.com/sitemap.xml` (already correct; just confirm).

**Acceptance (EARS):**

- When Phase 4 ships, then `ls public/sitemap.xml` shall succeed and `ls sitemap.xml` (repo root) shall fail (file moved, not copied).
- When Phase 4 ships, then `curl https://sheepdogsim.com/sitemap.xml` (post-deploy) shall return content-type matching `application/xml` or `text/xml`, NOT `text/html`.
- When Phase 4 ships, then `xmllint --xpath 'count(//*[local-name()="url"])' public/sitemap.xml` shall return at least 5.
- If `public/sitemap.xml`'s body contains any `<!DOCTYPE html>` or `<html` strings, then Phase 4 shall abort — that means the move/copy got crossed with the SPA fallback again.

## Phase 5 — Devlog scaffold with two seed entries (~45min)

**Depends on:** nothing (parallel-safe with Phase 3 once Phase 1 lands). Voice-sensitive: prose drafted from cycle-close summaries; Matt reviews at cycle-close.

1. **Create `public/devlog/index.html`** — list page mirroring `public/about.html`'s pattern. Contents:
   - `<h1>Devlog</h1>` + one tagline.
   - Reverse-chronological list of entries with title + date + 2-line teaser + link.
2. **Create `public/devlog/cycle-30-heightfield-unify.html`** — first seed entry. Title: "Polish under the hood: heightfield gets one home" (or similar player-voice rewrite — Matt edits). Body: ~300–500 words rewriting the [Cycle 30 close summary](archive/cycles/cycle-30-plan.md) into player-readable prose. Avoid jargon (no "bakeMeshGrid" / "displacedHeights" — translate to "the terrain math now lives in one place" etc.). End with a link back to homepage.
3. **Create `public/devlog/cycle-29-gamestate-decomp.html`** — second seed entry. Same shape; rewrites Cycle 29's close summary.
4. **Each devlog entry has its own JSON-LD `Article` schema** — author Matthew Kissinger, datePublished, headline, mainEntityOfPage, image (use the relevant og card or `/assets/marketing/og/og-rh-sunset.webp` as default).
5. **Update homepage HTML** (the new `<main id="seo-content">` block from Phase 1) to include a small "Latest devlog" link to `/devlog/` so crawlers discover it.

**Acceptance (EARS):**

- When Phase 5 ships, then `ls public/devlog/{index,cycle-30-heightfield-unify,cycle-29-gamestate-decomp}.html` shall list all three files.
- When `curl https://sheepdogsim.com/devlog/` runs (post-deploy), the response shall be HTTP 200 and contain anchor links to both seed entries.
- When Phase 5 ships, then each devlog entry shall contain a JSON-LD `Article` schema with `@type: "Article"`, `headline`, `author`, `datePublished`, and `mainEntityOfPage` fields.
- If any devlog entry uses cycle-process jargon (e.g. literal references to "EARS", "phase", "BACKLOG.md", "InstancedMesh2") in the visible prose, then the prose shall be rewritten in player voice before close.

## Phase 6 — Internal-link footer + GitHub topics (~25min)

**Depends on:** Phases 1, 3, 5 (so footer can link to real targets).

1. **Add a small visible `<footer>` to homepage** — visible to humans, not in the sr-only block. Single thin line at the bottom of the canvas, fades in after the welcome modal dismisses (so it doesn't clutter the gameplay-first first-frame). Contents: "About · Source · Devlog · Press kit · Scenes" with each as a link. Goal: give crawlers more discoverable internal links AND give returning players a quiet way to discover the new pages without changing the gameplay-first feel.
2. **Add GitHub repo topics** via `gh api`:
   ```
   gh api -X PUT /repos/matthew-kissinger/sds/topics \
     -f names[]=webgl -f names[]=threejs -f names[]=multiplayer \
     -f names[]=cloudflare-workers -f names[]=simulation \
     -f names[]=casual-games -f names[]=browser-game \
     -f names[]=herding-game -f names[]=open-source-game \
     -f names[]=three-js
   ```
3. No other changes.

**Acceptance (EARS):**

- When Phase 6 ships, then [`index.html`](../index.html) shall contain a `<footer>` element with at least 5 anchor links to internal paths.
- When Phase 6 ships, then `gh api /repos/matthew-kissinger/sds/topics --jq '.names | length'` shall return at least 8.
- When Phase 6 ships, then `gh api /repos/matthew-kissinger/sds/topics --jq '.names'` shall include `webgl`, `threejs`, `multiplayer`, `simulation`, and `cloudflare-workers`.
- If the homepage footer obscures more than 32 px of the canvas viewport on desktop or interferes with mobile-touch-area for the joystick, then Phase 6 shall abort and rework.

## Dependencies

```
Phase 1 → Phase 2 (parallel-safe) + Phase 3 + Phase 5 → Phase 4 → Phase 6
```

- Phase 1 ships first (load-bearing snippet fix).
- Phases 2, 3, 5 are parallel-safe; can run in any order after Phase 1.
- Phase 4 depends on Phases 3 + 5 having landed their pages (need URLs to list).
- Phase 6 depends on Phases 1, 3, 5 (footer links to those targets).

## Frozen files (cycle-specific additions)

[`shared/scenes/types.js`](../shared/scenes/types.js) and the deterministic-sim cores stay untouched — this cycle is purely public-facing surface. [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) and the rest of the durable [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) list stay frozen.

No cycle-specific freezes beyond the durable list.

## Hard stops

Durable hard stops apply on every cycle — see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. **Visible UI regression on the canvas / mobile joystick / first-frame load.** This cycle is "make Google see the page differently"; if a sighted player sees a difference (other than the optional Phase 6 footer line), abort the offending phase. The sr-only block must stay invisible to anyone but crawlers.
2. **Modal-defer breaks first-visit name flow.** Phase 1 step 3 wraps the modal mount in `requestIdleCallback`. If real first-visit users start seeing the canvas + nothing-else for >500ms, abort and rework the defer.
3. **Cloudflare Pages deploy starts serving the SPA fallback for `/sitemap.xml` again post-Phase-4.** That means the move didn't take. Re-verify file is in `public/sitemap.xml` (NOT `public/sitemap.xml/index.html` or similar).
4. **Voice rejection at cycle-close.** If Matt rejects a draft scene/devlog page's prose at close, the page does NOT ship — defer to Cycle 32 carryover. Better an unshipped page than a sloppy public page.
5. **GitHub topics rate-limit / scope error.** If `gh api PUT topics` 404s or 403s, surface to Matt; don't retry blindly.

## What NOT to do during this cycle

- **Don't post to Show HN, reddit, or any external channel.** That's Matt's voice + relationships, separate from this cycle. Drafts are fine; submission is Matt-pickup.
- **Don't update the itch.io project description page.** Already drafted at [`docs/itch-description/sheep-dog-sim.md`](itch-description/sheep-dog-sim.md); pasting is Matt-pickup.
- **Don't touch the wordmark / hero card / branding pass.** That's "Phase L — Title-screen identity pass" (already-deferred Matt-paired work). Out of scope.
- **Don't bump version unless this cycle's player-visible delta warrants it.** The crawler-content block + scene pages + devlog ARE player-visible (footer link, scene SEO pages, devlog accessible) — author lean is **bump to v2.1.3** at cycle-close (since that's the userversion already shipped to itch). Confirm at close.
- **Don't auto-submit to Google Search Console.** That requires Matt's Google account login. Surface as Matt-pickup at close: "Open Search Console → Request indexing of /, /about.html, /scenes/*, /devlog/*."
- **Don't expand sitemap to include language-prefixed URLs (`?lang=es`, etc.).** The hreflang declarations already do that work; sitemap-listing them too just bloats the file and we don't have language-specific bodies to back them up.
- **Don't touch [`shared/`](../shared/) or any sim/render code.** Public-surface only.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks Matt to confirm each item.

- [ ] When the cycle closes, all 6 phases shall be shipped or explicitly deferred to Cycle 32's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean and `dist/` shall contain `sitemap.xml`, `scenes/{home-field,rolling-hills,open-country}.html`, and `devlog/{index,cycle-30-heightfield-unify,cycle-29-gamestate-decomp}.html`.
- [ ] When `curl https://sheepdogsim.com/sitemap.xml` runs at cycle close (post-deploy), it shall return content-type `application/xml` (or `text/xml`), NOT `text/html`.
- [ ] When `curl -A "Googlebot" https://sheepdogsim.com/` runs at cycle close, it shall return body content containing `<h1>Sheep Dog Sim</h1>` and a `<noscript>` block with at least 200 characters of prose.
- [ ] When `gh api /repos/matthew-kissinger/sds/topics --jq '.names | length'` runs at cycle close, it shall return at least 8.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions (Pages + Worker green; E2E-Chromium flake pre-existing carryover OK).
- [ ] When Matt reads the per-scene + devlog page prose at close, voice shall feel like the existing PRESSKIT.md / README.md, not auto-generated marketing copy. Pages with rejected voice defer to Cycle 32.

## Matt-pickup at close (not in scope, but tee'd up)

- **Submit to Google Search Console for re-indexing.** Once the snippet fix is live, request indexing for `/`, `/about.html`, `/scenes/*`, `/devlog/*`. Forces a recrawl + cache refresh; the stale cached title clears within 1–7 days typically.
- **Paste itch.io description copy** from [`docs/itch-description/sheep-dog-sim.md`](itch-description/sheep-dog-sim.md) into the itch project page's Description + Short Description fields. Optional devlog post body is in the same file.
- **External submissions** — Show HN draft, /r/WebGames + /r/IndieGaming + /r/threejs posts, Three.js examples gallery submission, HTML5 game directories. Drafts on request; submission is Matt's voice.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) — pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-30-plan.md`](archive/cycles/cycle-30-plan.md) — last closed cycle
- [`docs/itch-description/sheep-dog-sim.md`](itch-description/sheep-dog-sim.md) — itch description draft for Matt-pickup
- [`PRESSKIT.md`](../PRESSKIT.md) + [`README.md`](../README.md) — voice reference for scene + devlog prose
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
