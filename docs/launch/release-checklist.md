# Sheep Dog Sim Launch Checklist

Use this after Matt approves a web release action. The current web release target is the `v2.6.3` web beta hotfix.

## Pre-Tag Verification

Bundle note: the support/privacy pages plus settings and pause-menu disclosure links intentionally ratchet the lazy `other` chunk-family budget from 690 KiB to 692 KiB for the beta disclosure surface.

```bash
git status --short
npm run build
npm test
npm run lint
npm run typecheck
npx playwright test --project=chromium --grep-invert @local-only --reporter=line
```

Optional checks, only if the corresponding channel is explicitly reopened:

```bash
npm run build:itchio
npm run native:check
```

If native desktop publication is approved:

```bash
npm run desktop:dist
npm --prefix native/desktop-electron run proof:webgl
npm --prefix native/desktop-electron run proof:webgpu
```

## Tag

```bash
git tag -a v2.6.3 -m "release: v2.6.3"
git push origin v2.6.3
```

## GitHub Release

1. Open GitHub Releases for `matthew-kissinger/sds`.
2. Draft a release for tag `v2.6.3`.
3. Use `docs/launch/v2.6.3-play-start-performance-release-notes.md` as source copy for this hotfix.
4. Do not attach desktop artifacts unless Matt explicitly approves native distribution.
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

Also inspect the deployed HTML and game flow for the `v2.6.3` beta hotfix claims: three public scenes, immediate monotonic loading cover, one-click mobile high-count starts, stable public WebGL, streamed music without restarts, sandbox/local starts, controller/touch/keyboard input, Newsheepdogland gated lab, support/privacy pages, public lobby discovery, and leaderboard posture.

## Itch Update

Deferred for the `v2.6.3` web beta hotfix. Do not upload or publish unless Matt explicitly reopens itch.

If reopened:

1. Run `npm run build:itchio`.
2. Upload the generated `dist/` contents using the existing itch page workflow.
3. Use `docs/launch/itch-launch-brief.md` as source copy.
4. Verify the itch page launches and starts a solo game in browser.
5. Keep the previous upload available until the new upload is smoke-tested.

## Steam Continuation

Do not continue during the `v2.6.3` web beta hotfix. Steam remains a long-term target only.

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
- If only itch regresses after a separately approved itch upload, restore the previous itch upload/channel state in the itch dashboard.
- Do not delete the `v2.6.3` tag after public release unless Matt explicitly approves a tag correction.
