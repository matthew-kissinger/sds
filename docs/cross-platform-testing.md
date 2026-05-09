# Cross-platform testing

Living doc for the SDS test matrix. Updated 2026-05-09 (Cycle 32 priority elevation: Apple-platform validation harness).

## Current state vs target state

The matrix below is **what we have today**. The Apple-platform-validation work elevated for Cycle 32 (see [`apple-water-bug-research-2026-05-09.md`](apple-water-bug-research-2026-05-09.md)) adds three rows: real iOS Safari via LambdaTest, per-shader unit tests via `headless-gl`, and a frame-end pixel-sampling gate.

## What runs where (today)

| Layer | Browsers | OS | Trigger | Workflow |
|---|---|---|---|---|
| Vitest unit + sim baseline | n/a | Ubuntu | every push | `deploy.yml` job `test` |
| Playwright E2E + WebGL probe | Chromium, Firefox, WebKit | Ubuntu | every push (after `test`) | `deploy.yml` job `e2e` |
| Real macOS Safari smoke | Safari (real) | macOS-latest | nightly + `workflow_dispatch` | `macos-safari.yml` |

`webkit` is Playwright's bundled WebKit binary. It's not the same as macOS Safari (different JS engine wrapper, no Metal/ANGLE backend). Real Safari + Metal is the unique surface that the macOS workflow covers.

**The gap:** real **iOS** Safari has no coverage, the existing Safari smoke harness asserts no JS errors but does not pixel-diff the output, and there are no shader-output unit tests. The 2026-05-09 iPhone water-render bug ([`apple-water-bug-research-2026-05-09.md`](apple-water-bug-research-2026-05-09.md)) sat undetected because all three of those gaps applied at once.

## Planned additions (Cycle 32)

| Layer | Browsers | OS | Trigger | Status |
|---|---|---|---|---|
| Real iOS Safari screenshot test (LambdaTest) | Safari (real iPhone) | iOS via LambdaTest cloud | every PR + nightly | **Planned, Cycle 32 Phase 2** |
| `headless-gl` per-shader unit tests | n/a (Node) | Ubuntu | every push | **Planned, Cycle 32 Phase 1** |
| Frame-end pixel-sampling gate (extends `glProbe`) | runtime, all players | all | runtime, opt-in | **Planned, Cycle 32 Phase 4** |

## Running locally

```bash
npm test                            # vitest only
npx playwright install --with-deps  # one-time
npm run test:e2e                    # all three browsers
npx playwright test --project=chromium  # one browser
npx playwright test --project=webkit    # webkit only
node tests/safari-smoke/run.mjs     # only does anything on macOS
```

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

## Tooling notes (2026-05-09 update)

| Tool | Use case | Cost | Status |
|---|---|---|---|
| GitHub Actions `macos-latest` + `safaridriver` | Real macOS Safari in CI | Free for public repos | In use (Cycle 9) |
| Playwright (Chromium / Firefox / WebKit) | Cross-engine smoke + headless | Free | In use |
| Playwright trace viewer | Post-mortem on flaky runs | Free | In use |
| **LambdaTest Lite** | Real iOS Safari screenshot test in CI + manual sessions | **Free 60min/mo, $15/mo Lite** | **Adopting Cycle 32** |
| BrowserStack Live | Same coverage as LambdaTest, more expensive | ~$39/mo | Skip in favour of LambdaTest |
| **`headless-gl`** (npm) | Per-shader unit tests with synthetic uniforms in Node | Free, open-source | **Adopting Cycle 32** |
| **Inspect.dev** | iOS Safari Web Inspector from Windows over USB | $50/yr personal | **Adopting Cycle 32 if iPhone SE boots** |
| `remotedebug-ios-webkit-adapter` | Free predecessor to Inspect.dev | Free, archived 2020 | Try first; brittle on iOS 16+ |
| Argos / Chromatic / Percy | PR visual diffs as a service | Free tier → paid | Defer; LambdaTest screenshot test covers the immediate need |
| Sentry | Production runtime errors per browser/OS | Free tier (5k events/mo) | Not yet wired |
| Cloudflare RUM | Web Vitals per browser/OS in production | Free with Pages | In use |
| Used iPhone SE + lightning cable | Permanent local test device | Free if user has one | **Currently charging an old SE** to confirm boot |

**2026-05-09 reversal:** the previous note on this page said "defer to BrowserStack ad-hoc until traffic justifies a subscription." The water-render bug photographed on the user's iPhone (see [`apple-water-bug-research-2026-05-09.md`](apple-water-bug-research-2026-05-09.md)) shows that "wait for traffic" is the wrong frame. The bug is reproducible **today** and the fix has a known engineering shape (rearchitect the depth pre-pass dependency); what was missing was the validation surface to catch it in CI. Cycle 32 elevates LambdaTest + `headless-gl` + a local iOS device above the prior "defer" posture.

## Adding a new check

- Add a Playwright spec under `tests/e2e/` — it runs on all three Playwright projects automatically.
- Add a Safari-only check by extending `tests/safari-smoke/run.mjs`.
- Add a vitest baseline if it's a sim-correctness invariant (no rendering involved).
