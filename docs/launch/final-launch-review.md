# Final Launch Review - Sheep Dog Sim v2.4.0

Historical Cycle 110 review packet. Superseded for current beta release work by [`release-checklist.md`](release-checklist.md) and [`v2.6.0-beta-release-notes.md`](v2.6.0-beta-release-notes.md).

Status: Matt approved web deploy/tag/repo updates after the fresh in-game screenshot pass. This packet remains the launch audit trail and post-launch verification checklist.

## Candidate

- Version: `v2.4.0`
- Base commit during proof: `172f41cc783fbed863f436f64d2d2c7ec5b7247e`
- Latest prior tag: `v2.3.4`
- Current describe during proof: `v2.3.4-33-g172f41cc-dirty`

## Target Status

| Target | Status | Evidence | Human Decision |
|---|---|---|---|
| Web production | Approved for deploy | Deploy targets are healthy; local RC validation passed; fresh media captured. | Verify GitHub Deploy and live pages after push. |
| SEO/site content | Approved for deploy | SEO tests passed; sitemap/metadata updated locally; fresh WebGPU hero/social captures are local. | Verify live metadata after deploy. |
| itch.io | Approved for page update, not uploaded by this repo commit | `npm run build:itchio` passed; copy and screenshots refreshed; `dist/` is 47,389,494 bytes. | Upload/smoke when itch credentials/workflow are available. |
| Steam/native | Yellow private proof, red public submission | `desktop:dist`, `proof:webgl`, and `proof:webgpu` passed; artifacts are unsigned. | Decide Steam Direct fee, signing, assets, support/privacy URLs, store page. |
| Newgrounds | Yellow | HTML5 ZIP model is plausible; no upload made. | Decide whether to submit after itch smoke. |
| CrazyGames | Yellow/red | Current build may fit total size guidance, but SDK/quality/multiplayer integration work remains. | Defer until after SDK-specific cycle. |
| Poki | Red | Current build is much larger than Poki's recommended small web-game size guidance. | Skip for this launch. |
| Kongregate | Yellow | Current docs show developer approval and portal flow. | Defer to later human-reviewed submission. |
| Y8 | Yellow | Upload/iframe path exists; ads/monetization choices need review. | Defer to later human-reviewed submission. |
| GitHub metadata | Green | Repo description, homepage, topics already align; no remote changes made. | Optional future copy tweak only. |
| Screenshots/social assets | Green for web/itch, yellow for Steam | Fresh WebGPU scene captures exist for hero/README images and 1200x630 OG/Twitter cards. Steam capsules/trailer still need separate store art. | Approve Steam art direction later. |

## Validation Summary

Passed:

- `npm test -- tests/seo.spec.js`
- `npm run lint`
- `npm run build`
- `npm run media:capture-launch -- --base-url=http://127.0.0.1:4173/`
- `npm test`
- `npm run typecheck`
- `npm run build:itchio`
- `npm run native:check`
- `npx playwright test --project=chromium --grep-invert @local-only --reporter=line`
- `npm run desktop:dist`
- `npm --prefix native/desktop-electron run proof:webgl`
- `npm --prefix native/desktop-electron run proof:webgpu`
- `git diff --check`

Known validation note:

- Full local `npm run test:e2e` exceeded the command timeout; the repo's documented Chromium release e2e lane passed afterward.

## Web Deploy Readiness

Production and preview targets are healthy:

- `https://sheepdogsim.com/`
- `https://sheepdogsim.com/about`
- scene pages under `/scenes/`
- `https://sheepdogsim.com/sitemap.xml`
- `https://sheepdogsim.com/robots.txt`
- `https://sds-worker.matt-m-kissinger.workers.dev/healthz`
- `https://sds-worker-preview.matt-m-kissinger.workers.dev/healthz`

The candidate content is local. To publish after review, merge/push the reviewed non-doc changes to `main` and verify the Deploy workflow.

## Itch Readiness

Ready after human review:

- Build target passed.
- Dashboard copy refreshed.
- Description copy refreshed.
- Plain-text fallback refreshed.
- Fresh 16:9 screenshots and 1200x630 social cards captured.

Still needed:

- Approve final itch text.
- Upload and smoke-test iframe/fullscreen.
- Keep previous itch upload available for rollback.

## Steam/Native Readiness

Native proof is green:

- Setup: `SheepDogSimulator-2.4.0-setup-x64.exe`, 134,038,407 bytes, unsigned.
- Portable: `SheepDogSimulator-2.4.0-portable-x64.exe`, 133,710,734 bytes, unsigned.
- Packaged WebGL proof: green.
- Packaged WebGPU proof: green.

Public Steam submission remains blocked:

- Steam Direct fee/app creation.
- Signing decision.
- Final capsules and screenshots.
- Trailer decision.
- Support URL and privacy URL.
- Install/uninstall pass.
- Pricing/free-to-play decision.
- Store page human review.

Recommendation: `wait-for-signing-and-assets`.

## Portal Strategy

Priority order:

1. Publish/refresh itch after review.
2. Consider Newgrounds after itch smoke.
3. Defer CrazyGames until SDK and multiplayer-invite expectations are scoped.
4. Skip Poki for this launch.
5. Defer Kongregate and Y8 until after launch week unless there is a specific distribution reason.

## Human Decisions Recorded

- `v2.4.0` version approved.
- README/press/SEO/launch copy approved for web deploy.
- Fresh screenshots/social assets approved for web/itch use.
- Web deploy/tag/repo launch updates approved.
- Itch page update approved in principle; upload still requires dashboard access and post-upload smoke.

## Remaining Human Decisions

- Decide whether Steam is worth the $100 fee and support burden.
- Decide signed vs unsigned Windows distribution.
- Approve support URL/email and privacy URL.
- Approve Steam capsules/screenshots/trailer direction.
- Decide whether Newgrounds/Y8/Kongregate are worth manual submissions.
- Decide whether to create custom Steam capsule art beyond current scene captures.

## Publish Steps After Approval

Web:

```bash
git status --short
npm run build
npm test
npm run lint
npm run typecheck
npx playwright test --project=chromium --grep-invert @local-only --reporter=line
git tag -a v2.4.0 -m "release: v2.4.0"
git push origin v2.4.0
```

Then push/merge the reviewed commit to `main`, watch Deploy, and verify live pages.

Itch:

```bash
npm run build:itchio
```

Zip/upload `dist/` contents or use butler:

```bash
butler push dist <itch-user>/sheep-dog-sim:html5
```

Steam:

- Do not submit until Cycle 109 blockers are resolved.
- If approved, create/pay for app, upload a private depot, test privately, submit store presence, submit build, and hold Coming Soon.

## Rollback Notes

- Web: revert the launch commit and push to `main`; verify Deploy.
- Worker: use Wrangler deployment rollback if only Worker behavior regresses.
- Itch: restore the prior upload/channel in the itch dashboard.
- Steam: do not release publicly until private depot and store review are complete.
- Tags: do not delete or rewrite a public tag without explicit correction approval.

## Review Entry Points

- `docs/launch/release-candidate.md`
- `docs/launch/release-checklist.md`
- `docs/launch/itch-launch-brief.md`
- `docs/launch/steam-store-brief.md`
- `docs/launch/portal-target-matrix.md`
- `docs/native-desktop-package-cycle-109.md`
- `docs/native-store-steam-readiness-checklist.md`
