# Sheep Dog Sim Launch Checklist

Use this after Matt approves the Cycle 110 final launch packet. Approval was recorded on 2026-06-26 after the fresh WebGPU screenshot pass.

## Pre-Tag Verification

```bash
git status --short
npm run build
npm test
npm run lint
npm run typecheck
npm run build:itchio
npm run native:check
npx playwright test --project=chromium --grep-invert @local-only --reporter=line
```

If native desktop publication is approved:

```bash
npm run desktop:dist
npm --prefix native/desktop-electron run proof:webgl
npm --prefix native/desktop-electron run proof:webgpu
```

## Tag

```bash
git tag -a v2.4.0 -m "release: v2.4.0"
git push origin v2.4.0
```

## GitHub Release

1. Open GitHub Releases for `matthew-kissinger/sds`.
2. Draft a release for tag `v2.4.0`.
3. Use `docs/launch/v2.4.0-release-notes.md` as source copy.
4. Attach desktop artifacts only if Cycle 109 says they are approved for distribution.
5. Publish only after production deploy is green.

## Production Deploy Verification

The normal production deploy runs from `main` unless the change is docs-only.

```bash
gh run list --workflow Deploy --limit 5
```

Verify after deploy:

```bash
powershell -NoProfile -Command "Invoke-WebRequest https://sheepdogsim.com/ -UseBasicParsing | Select-Object StatusCode"
powershell -NoProfile -Command "Invoke-WebRequest https://sheepdogsim.com/sitemap.xml -UseBasicParsing | Select-Object StatusCode"
powershell -NoProfile -Command "Invoke-WebRequest https://sds-worker.matt-m-kissinger.workers.dev/healthz -UseBasicParsing | Select-Object StatusCode,Content"
```

Also inspect the deployed HTML for the new `v2.4.0` SEO copy and scene metadata.

## Itch Update

1. Run `npm run build:itchio`.
2. Upload the generated `dist/` contents using the existing itch page workflow.
3. Use `docs/launch/itch-launch-brief.md` as source copy.
4. Verify the itch page launches and starts a solo game in browser.
5. Keep the previous upload available until the new upload is smoke-tested.

## Steam Continuation

Do not continue unless Cycle 109 is approved.

Required before submission:

- Steam Direct fee paid by Matt.
- Store capsules and screenshots approved.
- Support and privacy URLs confirmed.
- Signing/install/uninstall posture approved.
- Depot upload tested privately.
- Store page reviewed by Matt before submission.

## Rollback

Web rollback options:

```bash
gh run list --workflow Deploy --limit 10
```

- Revert the launch commit and push to `main` to redeploy the prior bundle.
- If only Worker behavior regresses, use Wrangler deployment rollback for `sds-worker`.
- If only itch regresses, restore the previous itch upload/channel state in the itch dashboard.
- Do not delete the `v2.4.0` tag after public release unless Matt explicitly approves a tag correction.
