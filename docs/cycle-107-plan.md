# Cycle 107 - seo-site-content-refresh

> Drafted 2026-06-26 as the second launch-readiness cycle. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md), confirm Cycle 106 is closed or intentionally skipped, then read this doc top-to-bottom.

## Goal

Cycle 107 updates what search engines, link previews, scene pages, manifests, and public HTML say about Sheep Dog Sim. Before this cycle, site SEO copy is functional but dated, fragmented, and partly contradicted by the current product. After this cycle, `sheepdogsim.com` should present one coherent launch pitch across page titles, descriptions, social cards, structured data, scene pages, `llms.txt`, manifest metadata, and sitemap dates.

## Autonomy contract

Continue autonomously into Cycle 108 if all acceptance gates pass and no hard stop fires. This cycle may update public site metadata and static content, but it must not publish external store pages or submit URLs to search consoles without explicit user approval.

## Scope decisions

1. **D1: One copy matrix drives every surface.** Do not hand-edit unrelated blurbs in five voices. Write the source-of-truth matrix first, then propagate it.
2. **D2: SEO is accurate product packaging, not keyword stuffing.** Avoid deceptive tags, irrelevant keywords, or claims that the shipped game cannot support.
3. **D3: Scene pages stay static-entry SEO aids.** Keep them aligned with actual scene availability and current product naming.
4. **D4: Social images must be current.** Use gameplay captures or current approved visuals, not old placeholder images.
5. **D5: No deploy-only fixes.** Build and local verification must pass before any production deployment is considered.

## Phase shape rules

Each phase is autonomous. If a content choice is subjective, choose the conservative wording and record it for the Cycle 110 human review packet rather than stopping.

## Phase 1 - SEO content matrix (~3hr, autonomous)

**Independently testable.** This phase prevents scattered copy edits.

1. Re-check current official SEO guidance for titles, snippets/meta descriptions, structured data, and sitemaps before editing.
2. Write `docs/launch/seo-content-matrix.md` with canonical product name, short pitch, long pitch, home title/description, about title/description, each scene page's title/description, social-card text, FAQ items, and no-go claims.
3. Record the target search intent in plain language: browser sheep herding game, free web game, multiplayer sheepdog game, survival island herding, mobile/gamepad browser game.
4. Mark every subjective or business-positioning decision that should be reviewed in Cycle 110.

**Acceptance (EARS):**

- When Phase 1 ships, then `docs/launch/seo-content-matrix.md` shall contain home, about, scene, manifest, social, FAQ, and no-go copy sections.
- When Phase 1 ships, then the matrix shall identify the canonical product name and at least three accepted short-description variants.
- If current official SEO guidance conflicts with an older SDS SEO doc, then Phase 1 shall record the newer guidance and supersede the old doc.

## Phase 2 - Static metadata and structured content (~4hr, autonomous)

**Depends on:** Phase 1.

1. Update `index.html`, `about.html`, `public/scenes/*.html`, `public/manifest.webmanifest`, `public/llms.txt`, and `js/utils/seo.js` from the matrix.
2. Remove stale or contradictory claims: Newsheepdogland experimental copy, old biome counts, old sheep-count limits, stale release/version references, and placeholder SEO language.
3. Keep canonical URLs, Open Graph/Twitter tags, structured data, and FAQ copy internally consistent.
4. Update `public/sitemap.xml` `lastmod` values for changed public pages.

**Acceptance (EARS):**

- When Phase 2 ships, then `index.html` and `about.html` shall use the matrix title and meta description or shall document any deliberate page-specific deviation.
- When Phase 2 ships, then every `public/scenes/*.html` page shall have a current title, description, canonical URL, Open Graph image, and JSON-LD block.
- When Phase 2 ships, then `public/manifest.webmanifest` and `public/llms.txt` shall no longer describe the game with old peaceful-meadow-only or experimental-NSL copy.
- If `public/sitemap.xml` lists a changed page, then that page's `lastmod` shall be updated to the cycle close date.

## Phase 3 - Social images and preview assets (~4hr, autonomous)

**Depends on:** Phase 1. Can run in parallel with Phase 2 after copy decisions are stable.

1. Inventory current Open Graph/Twitter images and validate that referenced files exist in the built site.
2. Capture or generate current 1200x630 social images for the home page and the most important scene pages. Prefer real gameplay captures when they clearly show the product.
3. Store source notes and final files under the existing public asset structure, or document why existing images remain acceptable.
4. Update metadata references only after image dimensions, file size, and browser loading are verified.

**Acceptance (EARS):**

- When Phase 3 ships, then `cycle107-validation/social-image-report.md` shall list every Open Graph/Twitter image URL, source file, dimensions, and file size.
- When Phase 3 ships with new images, then each new image shall be reachable from a production build output path.
- If a social image is reused, then the report shall explain why it still represents the current game.

## Phase 4 - SEO regression checks (~3hr, autonomous)

**Depends on:** Phases 2-3.

1. Add or update lightweight tests/scripts that assert the most important metadata is present and stale phrases are absent.
2. Run `npm run build` and any existing HTML/SEO-related tests.
3. If a dev or preview server is used, set `SDS_SUPPRESS_BROWSER_OPEN=1`, close agent-launched tabs, and stop listeners after proof.
4. Write `cycle107-validation/seo-close-report.md`.

**Acceptance (EARS):**

- When Phase 4 ships, then a validation artifact shall prove no public SEO file contains stale launch terms identified in `docs/launch/seo-content-matrix.md`.
- When Phase 4 ships, then `npm run build` shall pass.
- When Phase 4 ships, then `cycle107-validation/seo-close-report.md` shall record the exact validation commands and any manual checks.

## Phase 5 - Production readiness note (~1hr, autonomous)

**Depends on:** Phase 4.

1. Record whether the SEO changes require a production Pages deploy, and whether the normal `main` deploy workflow will perform it.
2. Record post-deploy checks for Cycle 108: fetch home/about/scene pages, verify social metadata, verify sitemap/robots, and inspect CDN image URLs.
3. Update `NEXT_SESSION.md` to point at Cycle 108 when the cycle closes.

**Acceptance (EARS):**

- When Phase 5 ships, then `cycle107-validation/seo-close-report.md` shall include a production-deploy checklist for Cycle 108.
- When Phase 5 ships, then `NEXT_SESSION.md` shall identify Cycle 108 as the next cycle unless a hard stop is active.

## Dependencies

```
Phase 1 -> Phase 2 + Phase 3 -> Phase 4 -> Phase 5
```

## Frozen files (cycle-specific additions)

None. This cycle does not authorize `shared/`, sim-baseline, migration, or process-doc edits beyond normal cycle-close updates to `NEXT_SESSION.md`.

## Hard stops

Durable hard stops apply on every cycle; see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific stops:

1. If copy claims a feature, platform, player count, performance target, or release status that the current build does not support, then remove the claim or stop.
2. If social metadata references missing images or broken canonical URLs, then do not close the cycle.
3. If external account access is needed for Google Search Console, Bing Webmaster Tools, social debugger cache purges, or store pages, then record the action for Cycle 110 and continue without account changes.

## What NOT to do during this cycle

- Do not submit sitemaps, publish social posts, or update external store pages.
- Do not make gameplay changes to satisfy SEO copy.
- Do not create generated keyword pages or thin content.
- Do not run headed perf or screenshot captures while leaving browser tabs/processes open.

## Success criteria (cycle close)

- [ ] When Cycle 107 closes, all public site metadata shall follow `docs/launch/seo-content-matrix.md`.
- [ ] When Cycle 107 closes, `npm run build` shall pass.
- [ ] When Cycle 107 closes, `cycle107-validation/seo-close-report.md` shall list post-deploy checks for Cycle 108.

## References

- [`docs/cycle-106-plan.md`](cycle-106-plan.md)
- [`docs/cycle-108-plan.md`](cycle-108-plan.md)
- [`docs/launch/`](launch/)
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md)
