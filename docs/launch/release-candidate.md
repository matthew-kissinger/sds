# Sheep Dog Sim v2.4.0 Release Candidate

Historical Cycle 108/110 release-candidate packet. Superseded for current beta release work by [`release-checklist.md`](release-checklist.md) and [`v2.6.0-beta-release-notes.md`](v2.6.0-beta-release-notes.md).

Status: green for local candidate proof; approved for web deploy/tag after fresh media capture.

## Candidate

- Version: `v2.4.0`
- Current base commit: `172f41cc783fbed863f436f64d2d2c7ec5b7247e`
- Current describe during proof: `v2.3.4-33-g172f41cc-dirty`
- Latest public tag before candidate: `v2.3.4`

## Validation

Green:

- `npm test -- tests/seo.spec.js`
- `npm run lint`
- `npm run build`
- `npm test` after web rebuild and SEO string trim
- `npm run typecheck`
- `npm run build:itchio`
- `npm run native:check`
- `npx playwright test --project=chromium --grep-invert @local-only --reporter=line`

Notes:

- The first full `npm test` found a bundle-ratchet overage from expanded runtime SEO strings. The fix reduced runtime string weight and did not raise bundle fixtures.
- Full local `npm run test:e2e` exceeded the 10 minute command window. The repo's documented release e2e lane passed in Chromium with `@local-only` excluded.

## Deployment

Production Pages, production Worker, preview Worker, sitemap, robots, and key scene pages are reachable. The v2.4.0 candidate is approved for web deploy/tag after Cycle 110 review and the fresh screenshot pass.

Production deploy notes:

- `deploy.yml` ignores markdown-only and `docs/**` changes.
- The candidate includes non-doc files, so a reviewed merge/push to `main` should trigger the deploy workflow.
- A manual `workflow_dispatch` remains available for an explicit deploy from the reviewed commit.

## Known Risks

- Steam/native publication is not yet green; Cycle 109 must verify current packaged artifacts, signing posture, and store requirements.
- Itch copy and portal strategy are recorded in Cycle 110; itch upload still needs dashboard execution and smoke.
- Fresh 16:9 hero images and 1200x630 social cards were captured from WebGPU gameplay for web/README/itch use. Bespoke Steam capsule art is still separate store work.
- No public tag or GitHub release has been created.

## Manual Review Checklist

- Review README, press kit, changelog, SEO pages, and launch copy for product positioning.
- Review Cycle 109 Steam/native recommendation before paying any Steam Direct fee or uploading a depot.
- Review Cycle 110 itch and portal matrix before publishing external pages.
- Approve or change the `v2.4.0` version number before tagging.
- Confirm Steam capsule assets, support URL, and privacy URL before store submission.

## Supporting Reports

- `cycle108-validation/release-version-decision.md`
- `cycle108-validation/local-validation.md`
- `cycle108-validation/deploy-targets.md`
- `cycle108-validation/artifacts.md`
- `cycle108-validation/close-report.md`
- `cycle110-validation/scene-media-refresh/report.json`
