# Cross-platform testing

Living doc for the SDS test matrix. Updated 2026-05-10 after Cycle 32 Apple-platform water validation shipped.

## Current Matrix

| Layer | Browsers | OS/device | Trigger | Command/workflow |
|---|---|---|---|---|
| Vitest unit + sim baseline | n/a | local/CI | every push | `npm test` |
| Playwright E2E + WebGL probe | Chromium, Firefox, WebKit | Ubuntu/local | every push | `npm run test:e2e` |
| Real macOS Safari smoke | Safari | macOS-latest | nightly + manual | `.github/workflows/macos-safari.yml` |
| Real iOS Safari water canary | Safari | BrowserStack iPhone 15 Pro Max / iOS 17 | manual + release validation | `npm run test:ios-water` |

`webkit` is Playwright's bundled WebKit binary. It is useful, but it is not a substitute for real Safari on Apple hardware. Cycle 32 adds the real iOS row because the Rolling Hills water bug reproduced on an iPhone while desktop CI stayed green.

## BrowserStack iOS Water Canary

The committed config is secret-free:

- `browserstack.yml` selects `iPhone 15 Pro Max / iOS 17 / Safari`.
- `playwright.browserstack.config.ts` runs only `tests/browserstack/ios-water.spec.ts`.
- `tools/browserstack/run-ios-water.mjs` loads credentials from `.env.local` locally or from `BROWSERSTACK_USERNAME` / `BROWSERSTACK_ACCESS_KEY` in CI.
- `.github/workflows/browserstack-ios-water.yml` is `workflow_dispatch` only while the account is on the free proof tier.

Local run:

```bash
npm run test:ios-water
```

This default local mode starts BrowserStack Local so the real iPhone can reach the local Vite server. On the Windows workstation used for Cycle 32 closeout, BrowserStack Local failed with an `EBUSY` lock on `C:\Users\Mattm\.browserstack\BrowserStackLocal.exe`; public URL mode below still passed. If the lock repeats, use the GitHub workflow / Linux runner for the local-build tunnel proof instead of burning free minutes locally.

Optional public URL run:

```bash
$env:IOS_WATER_BASE_URL='https://sheepdogsim.com'
npm run test:ios-water
```

The canary opens `/?scene=rolling-hills&debug=gl&cinematic=1&ui=off&sun=0.55`, starts Solo Classic through the cinematic test API, frames the shoreline, and attaches:

- `ios-water.png`
- `ios-water-sample.json`

Artifacts are written under `browserstack-artifacts/ios-water/` locally and uploaded by the manual GitHub workflow. The folder is gitignored because it is generated evidence, not source.

The failure condition is a sampled water-region average near `#eaf6ff`, the solid foam-white failure seen on iPhone Safari.

## Runtime GL Probe

`?debug=gl` installs `window.__sdsDiag` and `window.__sdsCaptureSample(label)`. Cycle 32 extended the sampler with:

- `window.__sdsDiag.waterSample`
- `window.__sdsDiag.waterSamples[]`
- `avg` RGB
- `nearFoamWhite`

Use it in DevTools after a frame is visible:

```js
window.__sdsCaptureSample('manual-water-check')
window.__sdsDiag.waterSample
```

## Local Commands

```bash
npm test
npm run build
npm run test:e2e -- --project=chromium --grep-invert @local-only
node tests/safari-smoke/run.mjs
npm run test:ios-water
```

The raw Chromium project includes `@local-only` perf probes that are hardware/noise sensitive and not part of the normal release smoke. CI and release validation use the grep-inverted command above. Cycle 32 closeout fixed the CI web-server path so `npm run dev` starts Wrangler through `npx wrangler` inside `worker/`; deploy run `25619016791` passed the Linux Chromium job after that fix.

`tests/safari-smoke/run.mjs` only does useful work on macOS with Safari automation enabled.

## Triage Rules

Most cross-browser rendering bugs are shader/driver support gaps, not game-logic failures. Triage in this order:

1. Reproduce locally with `npm run test:e2e -- --project=<browser>`.
2. Check the GL snapshot attached to the failing test.
3. Run `?debug=gl` and capture `window.__sdsDiag`.
4. For water regressions, run `npm run test:ios-water` before guessing from WebKit emulation.

Apple-facing render paths must not add a per-frame render-to-texture shader dependency unless a real-device gate exists for that path. For Cycle 32, the rule is recorded here rather than in `.claude/rules/*` because those files are frozen without explicit authorization.

## Tooling Notes

| Tool | Use case | Status |
|---|---|---|
| GitHub Actions `macos-latest` + `safaridriver` | Real macOS Safari smoke | In use |
| Playwright Chromium / Firefox / WebKit | Cross-engine desktop smoke | In use |
| BrowserStack Automate Playwright iOS | Real iOS Safari canary | Added Cycle 32, manual dispatch while free |
| `glProbe` water sample | Runtime pixel diagnostic | Added Cycle 32 |
| Argos / Chromatic / Percy | Broad visual diff service | Deferred |
| Sentry-style runtime error capture | Production browser/OS alarms | Deferred |
