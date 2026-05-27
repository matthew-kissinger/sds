# End-to-end tests

Playwright-based smoke tests that exercise the current Geckos-based
production path. This harness exists so future agents working on the
Cloudflare Workers backend retry have a reference point and can extend it
(two-browser coop tests, score submission + leaderboard read-back, etc.)
before touching production.

## One-time setup

From repo root:

```bash
npm install
npx playwright install chromium
```

The `npx playwright install chromium` step downloads the Chromium binary
into the per-user Playwright cache. On Windows that lives at
`%LOCALAPPDATA%\ms-playwright\`. It is not committed.

Worker-side deps also need to be present so `npm run dev` can start
Wrangler alongside Vite:

```bash
cd worker && npm install && cd ..
```

## Running

```bash
npm run test:e2e           # headless run
npm run test:e2e:headed    # run with a visible browser
npm run test:e2e:ui        # Playwright UI mode for interactive debugging
```

The `webServer` block in `playwright.config.ts` will boot `npm run dev`
if nothing is listening on port 3000 yet. If you already have `npm run dev`
running in another terminal, Playwright reuses it (`reuseExistingServer: true`).

Release validation should use the Chromium smoke lane and exclude local-only
workstation probes:

```bash
npx playwright test --project=chromium --grep-invert @local-only --reporter=line
```

`npm run test:e2e` runs the broader local suite across configured projects and
can include slow `@local-only` specs; do not use a timeout there as proof that
release smoke failed.

## Debugging

- `npx playwright test --headed` runs with a visible Chromium window.
- `npx playwright test --debug` pauses at each step with the inspector.
- `npx playwright test --ui` opens the Playwright UI for watching traces
  and rerunning individual tests.

Failed runs retain:

- `test-results/<test-name>/trace.zip` - open with
  `npx playwright show-trace test-results/<test-name>/trace.zip`
- `test-results/<test-name>/test-failed-*.png` - screenshot at failure
- `test-results/<test-name>/video.webm` - video of the run

## Where artifacts go

Defined in `playwright.config.ts`:

- `outputDir: 'test-results/'` - traces, screenshots, videos (gitignored).
- HTML report is written to `playwright-report/` when the `html` reporter
  runs (CI only by default; add `--reporter=html` locally to generate).

Both directories are in `.gitignore`.

## Windows notes

- Paths use forward slashes in configs; Playwright handles the
  translation to Windows-native paths internally.
- The dev server boots via `concurrently`, which in turn shells out to
  `vite` and `node --watch`. Make sure your shell can run both - WSL is
  not required.
- `vite.config.js` has `server.open: true`, which normally pops a browser
  tab. Playwright's `webServer` runs with stdout/stderr piped, so the
  popped tab is harmless (it goes to the default browser, not to the
  Playwright-controlled Chromium instance).
- If port 3000 or 8787 is occupied by a previous aborted run, kill the
  process (`netstat -ano | findstr :3000` then `taskkill /PID <pid> /F`)
  before retrying.

## How to add a new test

1. Drop a `*.spec.ts` file into `tests/e2e/`.
2. Import from `@playwright/test`:
   ```ts
   import { test, expect } from '@playwright/test';
   ```
3. Prefer text-based selectors (`page.getByText`, `page.getByRole`) over
   CSS queries - the app uses Tailwind + inline styles, so class
   selectors are brittle. The only stable CSS hook today is
   `#canvas-container canvas`.
4. If you need `data-testid`, coordinate with the component owner first -
   there is no data-testid infra in the app yet.
5. For multiplayer flows that need two browsers, use Playwright's
   contexts API:
   ```ts
   const a = await browser.newContext();
   const b = await browser.newContext();
   const pageA = await a.newPage();
   const pageB = await b.newPage();
   ```

## Known limitations and brittleness

- **Selectors are text-based and locale-sensitive.** The smoke test
  assumes English. If the browser locale picked by i18next is non-en,
  `getByText(/Solo Play/i)` will miss. The default fallback is `en`, so
  this is OK in CI-style headless runs, but if you set
  `--browser locale=...` it could break.
- **First-run vs returning user.** The first test handles both the
  identity setup screen and the main menu; the second test only handles
  identity setup by clicking "Anonymous". If localStorage was populated
  by a previous run Playwright uses a fresh context, so identity setup
  should always be visible on first navigation. If that ever changes,
  revisit the `if (await anonymousButton.isVisible(...))` branch.
- **Asset loading time.** The solo game canvas appears only after the
  game loads GLB models and compiles shaders. The 60s timeout on canvas
  visibility is generous but can still flake on cold file system caches
  or slow CI. Bump the timeout rather than tightening it.
- **Console error allowlist.** `IGNORED_CONSOLE_PATTERNS` in
  `smoke.spec.ts` is deliberately permissive - we filter out Geckos /
  WebRTC noise because the local Geckos server may or may not be running
  cleanly depending on environment. When extending this harness for the
  CF Workers retry, tighten this list to avoid masking real protocol
  errors on the new transport.
- **No multiplayer coverage.** This file is a placeholder for the
  C-retry track. Two-client tests belong in a separate spec file
  (`multiplayer.spec.ts`) that can be wired up once the Worker +
  Durable Object stack is running under `wrangler dev`.
- **Flag for future agents:** the two tests here only verify the happy
  path up to "canvas is visible and sized". They do NOT verify that
  sheep move, that the retired counter increments, or that the pause
  menu opens. Those are next steps for a real playtest harness and
  should be added before the Workers migration ships.

## Status

Harness is scaffolded and attempts a real end-to-end run. See the parent
PR description for the most recent run output. If you see unexpected
breakage on a fresh clone, the most likely causes in order are:

1. `worker/node_modules` missing - run `cd worker && npm install`.
2. Chromium not installed - run `npx playwright install chromium`.
3. Port 3000 already in use - kill the occupying process.
4. Vite `server.open: true` popping a browser on your default monitor -
   harmless, close it.
