# Electron readiness — research, no code

> Drafted Cycle 10 Phase 7 (2026-04-27). Research-only doc; **no implementation in this cycle**. Captures the path forward toward a downloadable build of Sheep Dog Sim. Decision matrix at the end.

## Why this doc exists

Sheep Dog Sim ships today as a Cloudflare Pages web app at `sheepdogsim.com`. This doc maps the gap between the live web build and a packaged desktop build (Windows / macOS / Linux), so when the project is ready to pursue a downloadable, the technical surface is already understood.

Current scope: enumerate hard dependencies, asset paths, bundle size, file-protocol gotchas, window/full-screen behavior, offline leaderboard UX, update channels, code-signing costs, and pick a packager.

## 1. Hard dependencies on the live Worker

The web build talks to a Cloudflare Worker for: JWT-issued auth, room lobby/create/join, leaderboard read+write, websocket multiplayer relay, and (post-Cycle-10 Phase 6) score submission. Hardcodes to verify before packaging:

- `js/NetworkManager.js` — search for any literal `sds-worker.matt-m-kissinger.workers.dev` (currently routed via relative `/api/*` on the production domain; verify before packaging).
- `js/GameState.js` — leaderboard submission path uses a relative URL today, which `file://` cannot resolve.
- `worker/src/RoomDO.ts` — websocket URL is constructed client-side; needs an explicit base URL in Electron.

**Recommendation.** Introduce a build-time env (`SDS_WORKER_BASE`) read in `vite.config.js` and exposed via `import.meta.env.SDS_WORKER_BASE`. Default to relative for web; absolute for Electron. Solo modes degrade gracefully when the worker is unreachable (queue submissions for next online launch).

## 2. Asset paths

`vite.config.js:43` already supports relative paths under the `BUILD_TARGET=itchio` flag (`base: './'`). Reuse the same toggle for an `electron` target. No code change needed beyond adding `'electron'` to the conditional.

```
const isItchio = process.env.BUILD_TARGET === 'itchio'
const isElectron = process.env.BUILD_TARGET === 'electron'
// base: (isItchio || isElectron) ? './' : '/'
```

Verify after first packaged build:
- `index.html` script src paths resolve from `file://` (Vite emits relative paths under `base: './'`, so this should be free).
- `/assets/...` references in CSS background-image rules. The CSS is bundled, so this is also free with relative base.
- Service worker (`sw.js`) — disable in Electron (see §4).

## 3. Bundle size

Current asset payload (verified 2026-04-27):
- `assets/images/sds-zoomedin-play.png` — 3.7 MB
- `assets/images/sds-zoomedout.png` — 3.5 MB
- `assets/images/sds-dog-selection.png` — 3.3 MB
- `assets/images/sds-menu.png` — 3.4 MB
- `assets/images/seo/*.png` — 3 × ~150 KB
- Total `/assets/images/` — 14 MB

JS bundle (post-build):
- `assets/main-*.js` — ~720 KB (212 KB gzip)
- `assets/three-*.js` — ~614 KB (155 KB gzip)
- Total minified+gzipped — ~370 KB

Plus 3D models (`assets/models/`) — separate audit needed.

**Targets.**
- WebP / AVIF conversion of the four 3+ MB PNGs. Lossless WebP typically 40-60% smaller; AVIF 60-80%. Quality 85 JPEG for the OG cards is also acceptable since they're marketing-only.
- Aim sub-3 MB total `/assets/images/` for download. Realistic with WebP at quality 80.
- Three-shake the `three` import surface — current usage is broad (we use ShaderMaterial, BufferGeometry, InstancedMesh, etc.) so probably <10% reducible without re-architecting.

## 4. `file://` protocol gotchas

Verified gotchas for an Electron BrowserWindow loading from `file://`:

- **Service workers don't register on `file://`.** Disable `serviceWorkerPlugin` for the Electron target. Lose offline-cache asset preloading; gain in offline gameplay anyway because everything is local.
- **`fetch()` to `file://` paths is blocked** by default in Chromium. Asset loading via `<script>`/`<img>`/`<audio>` works; explicit `fetch()` does not. Audit the codebase for `fetch(...)` calls — JSON config loads, model manifest fetches, anything that isn't `<img src>` or audio. Convert to bundled imports for Electron.
- **WebGL2 + Web Audio + Pointer Lock** all work on `file://` in Electron 30+.
- **`localStorage` works** but is partitioned per-origin, so `file://` and `https://sheepdogsim.com` will not share scores.

## 5. Window / full-screen

Existing Fullscreen API usage in `js/MobileControls.js` (and triggered from React via the keyboard hotkey) calls `requestFullscreen()` on `document.documentElement`. In Electron, this maps to `BrowserWindow.setFullScreen(true)` automatically — no code change. The mobile-controls path is desktop-irrelevant, so consider gating on `process.versions?.electron`.

Default window size: 1280×720 minimum, resizable, with persisted last-state via `electron-window-state`. Hide menu bar (`Menu.setApplicationMenu(null)`) for the game build.

## 6. Offline leaderboard UX

When the worker is unreachable, the desktop build should NOT block solo play. Sketch:

1. Use `sql.js` (SQLite-in-WebAssembly) for a local solo-records DB. ~700 KB cost; acceptable for a desktop build.
2. Schema mirrors a subset of `worker/migrations/*.sql` — `local_runs` table with `mode, scene_id, sheep_count, score, completed_at`.
3. On startup, if online + last-sync was >60s ago, replay queued runs to the worker.
4. Leaderboard view shows local-best regardless of online state; global tab grays out with "offline — last synced X ago" when worker unreachable.

This is one of the bigger code changes. Defer until post-v1.0 unless a packaged build is imminent.

## 7. Update channel

Two reasonable paths:

- **electron-updater + GitHub Releases.** Free hosting, unlimited bandwidth. Auto-update via NSIS installer (Windows) / DMG (macOS) / AppImage (Linux). Standard pattern; the most-trodden path. ~30 minutes to wire up given the Tauri-or-electron-builder skeleton.
- **electron-updater + Cloudflare R2.** R2 has zero egress, so unlimited downloads are cheap. CDN cache. Slightly more setup; same client code.

**Recommendation:** GitHub Releases for v1.x, migrate to R2 if download volume justifies it.

## 8. Code-signing

Costs to ship signed:

| Platform | Certificate | Annual cost | Required? |
|---|---|---|---|
| Windows | EV cert (DigiCert / Sectigo) | $300-500/yr | No, but unsigned builds get SmartScreen warnings forever |
| macOS | Apple Developer Program | $99/yr | Yes — Gatekeeper blocks unsigned by default |
| Linux | None | $0 | No |

**v1.0 strategy.** Ship Linux + Windows-unsigned + macOS-signed. Buy the EV cert when the project earns it (or when SmartScreen friction is hurting downloads).

## 9. Decision matrix — packager

| Criterion | Tauri (Rust) | Electron | Neutralino |
|---|---|---|---|
| Bundle size | ~10 MB | ~150 MB | ~3 MB |
| Memory footprint | ~50 MB idle | ~200 MB idle | ~20 MB idle |
| Backend language | Rust | Node.js | None (just web) |
| Native API surface | Excellent (Tauri 2.0) | Vast | Minimal |
| WebView | OS native (WebView2 / WebKit / WebKitGTK) | Bundled Chromium | OS native |
| Cross-platform consistency | Lower (WebKit on macOS ≠ Chrome) | High (everywhere is Chromium) | Lower |
| Ecosystem maturity | Growing (2024-2026) | Massive | Small |
| Code-signing tools | First-class | First-class | Limited |
| Auto-update | Built-in (Tauri 2) | electron-updater | Manual |

**Key risk for Tauri.** macOS WebKit's WebGL2 implementation has had historical Safari-style quirks (cf. Cycle 9 macOS Safari debug). Sheep Dog Sim is GPU-heavy; testing it on macOS WebKit is a gating step before committing to Tauri. The `?debug=gl` probe ([js/diagnostics/glProbe.js](../js/diagnostics/glProbe.js)) is the right tool for that audit.

**Recommendation:** **Tauri 2.0** if the Cycle-9 macOS rendering bug is environment-specific (not a WebKit issue); **Electron** if it turns out to be a WebKit issue. Either way, the web-app code is largely unchanged — the choice mostly affects bundle size, memory, and code-signing UX.

If decision is deferred and a desktop build is needed urgently, **Electron is the safer default** for a game with non-trivial WebGL needs.

## 10. Phased rollout sketch (no commitment)

1. **Spike (1-2 days).** Tauri 2.0 cargo-create-tauri-app skeleton + `BUILD_TARGET=electron` Vite build + sanity-test on Windows + macOS + Linux (check WebGL2, audio, fullscreen, input).
2. **Worker URL plumbing (½ day).** `SDS_WORKER_BASE` env var + relative-vs-absolute switch.
3. **Service-worker gate (½ day).** Disable in Electron build.
4. **Image optimization (1 day).** WebP/AVIF conversion + quality audit.
5. **Offline leaderboard (2-3 days).** sql.js + local schema + sync queue.
6. **Code-signing setup (1 day).** Apple Developer enrollment + macOS notarization config.
7. **Update channel (½ day).** GitHub Releases + electron-updater wiring.
8. **First packaged release (1 day).** End-to-end: build, sign, package, distribute.

Total spike-to-v1.0-electron: ~7-10 person-days, gated on the WebKit-WebGL spike outcome.

## What's NOT in this cycle

- No code, no `package.json` deps added, no Tauri/Electron skeleton.
- Decision between Tauri vs Electron not finalized (waits on macOS WebKit spike).
- Offline leaderboard schema not designed in detail.
- Apple Developer enrollment not started.

## Links

- [Tauri 2.0 docs](https://v2.tauri.app/) — official, up-to-date as of 2026.
- [electron-builder](https://www.electron.build/) — packaging + auto-update.
- [WebGL2 support matrix](https://caniuse.com/webgl2) — for verifying packager WebView.
- [Cycle 9 macOS Safari debug recipe](../NEXT_SESSION.md) — relevant to the Tauri-vs-Electron decision.
- [vite.config.js:43](../vite.config.js) — existing `BUILD_TARGET=itchio` relative-base toggle to extend.
