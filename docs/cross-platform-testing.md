# Cross-platform testing

Living doc for the SDS test matrix. Updated 2026-04-27 (Cycle 9 Phase 3).

## What runs where

| Layer | Browsers | OS | Trigger | Workflow |
|---|---|---|---|---|
| Vitest unit + sim baseline | n/a | Ubuntu | every push | `deploy.yml` job `test` |
| Playwright E2E + WebGL probe | Chromium, Firefox, WebKit | Ubuntu | every push (after `test`) | `deploy.yml` job `e2e` |
| Real macOS Safari smoke | Safari (real) | macOS-latest | nightly + `workflow_dispatch` | `macos-safari.yml` |

`webkit` is Playwright's bundled WebKit binary. It's not the same as macOS Safari (different JS engine wrapper, no Metal/ANGLE backend). Real Safari + Metal is the unique surface that the macOS workflow covers.

## Running locally

```bash
npm test                            # vitest only
npx playwright install --with-deps  # one-time
npm run test:e2e                    # all three browsers
npx playwright test --project=chromium  # one browser
npx playwright test --project=webkit    # webkit only
node tests/safari-smoke/run.mjs     # only does anything on macOS
```

## What a Safari-smoke run produces

Per scene, `tests/safari-smoke/out/` will contain:

- `<scene>.png` — full-page screenshot
- `summary.json` — for each scene: URL, status, GL renderer info, GL extensions list, and `window.__sdsDiag` (the in-page diagnostic probe; see Phase 9.4 work)

Compare against a Chromium baseline (run the same probe locally with `?debug=gl` in Chrome devtools and dump `window.__sdsDiag`).

## When to lift cross-browser failures

Most cross-browser bugs are not regressions in the project itself — they're shader/extension support gaps in a specific engine. Triage:

1. **Reproduce locally** by running `npm run test:e2e -- --project=<browser>`.
2. **Check the GL snapshot** attached to the failing test (look for missing extensions, lower `MAX_FRAGMENT_UNIFORM_VECTORS`, vendor info).
3. **Triage by surface area:**
   - Terrain shader (`js/TerrainBuilder.js`) — usually FBM precision.
   - Sky shader (`js/atmosphere/skyShader.glsl.js`) — usually cloud FBM or sun disc.
   - Water (`js/water/DepthPrePass.js`) — render-target alloc, depth-stencil format support.

## Tooling notes (2026-04 reference)

| Tool | Use case | Cost |
|---|---|---|
| GitHub Actions `macos-latest` + `safaridriver` | Real macOS Safari in CI | Free for public repos |
| Playwright (Chromium / Firefox / WebKit) | Cross-engine smoke + headless | Free |
| Playwright trace viewer | Post-mortem on flaky runs | Free |
| BrowserStack Live | Manual sessions on real iOS / Android Safari, old versions | ~$29/mo |
| LambdaTest | Same as BrowserStack, sometimes cheaper | ~$15/mo |
| Argos / Chromatic / Percy | PR visual diffs as a service | Free tier → paid |
| Sentry | Production runtime errors per browser/OS | Free tier (5k events/mo) |
| Cloudflare RUM | Web Vitals per browser/OS in production | Free with Pages |

We're using GH Actions + Playwright + safaridriver today. iOS Safari is the next-largest gap; defer to BrowserStack ad-hoc until traffic justifies a subscription.

## Adding a new check

- Add a Playwright spec under `tests/e2e/` — it runs on all three Playwright projects automatically.
- Add a Safari-only check by extending `tests/safari-smoke/run.mjs`.
- Add a vitest baseline if it's a sim-correctness invariant (no rendering involved).
