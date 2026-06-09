# Sheep Dog Simulator

[![Play now](https://img.shields.io/badge/play-sheepdogsim.com-2563eb?style=for-the-badge)](https://sheepdogsim.com) &nbsp; [![AGPL-3.0 Code](https://img.shields.io/badge/code-AGPL--3.0-22c55e?style=for-the-badge)](LICENSE) &nbsp; [![CC BY-SA 4.0 Assets](https://img.shields.io/badge/assets-CC%20BY--SA%204.0-f97316?style=for-the-badge)](LICENSE-ASSETS) &nbsp; [![Star on GitHub](https://img.shields.io/github/stars/matthew-kissinger/sds?style=for-the-badge&logo=github&color=eab308)](https://github.com/matthew-kissinger/sds)

[![Three.js 0.184](https://img.shields.io/badge/three.js-0.184-black)](https://threejs.org/) [![React 19](https://img.shields.io/badge/react-19-61DAFB)](https://react.dev/) [![Vite 7.3](https://img.shields.io/badge/vite-7.3-646CFF)](https://vite.dev/) [![Tailwind 4.1](https://img.shields.io/badge/tailwind-4.1-38BDF8)](https://tailwindcss.com/) [![Cloudflare Workers + D1](https://img.shields.io/badge/edge-Cloudflare%20Workers%20%2B%20D1-F38020)](https://developers.cloudflare.com/workers/) [![Vitest 4](https://img.shields.io/badge/vitest-4.1-6E9F18)](https://vitest.dev/) [![Tests](https://img.shields.io/badge/tests-passing-22c55e)](tests/)

**Herd up to 5,000 sheep across four biomes in a modern browser, with progressive WebGPU on supported hardware and WebGL fallback everywhere else.** No install, no signup, no ads. Free to play, source-readable, and forkable under AGPL-3.0; hosted or modified versions must publish corresponding source and preserve attribution.

> [Play it now → sheepdogsim.com](https://sheepdogsim.com)

Current WebGPU scene captures:

| Newsheepdogland | Home Field | Rolling Hills | Open Country |
|---|---|---|---|
| ![Sheep Dog Sim Newsheepdogland WebGPU capture with homestead, pen, grass, trees, and sea](assets/scenes/entrance/newsheepdogland.webp) | ![Sheep Dog Sim Home Field capture with the sheepdog and flock in grass](assets/scenes/entrance/field.webp) | ![Sheep Dog Sim Rolling Hills capture with the sheepdog by the shoreline](assets/scenes/entrance/rolling-hills.webp) | ![Sheep Dog Sim Open Country capture with the sheepdog facing the portal objective](assets/scenes/entrance/open-country.webp) |

---

## Why this exists

Most browser 3D games are tech demos with no game inside, or closed-source mobile-clone ports with no tech to learn from. **This is neither.** It's a fully playable 3D game whose source you can read end-to-end, study, fork, and reshape under a license that keeps hosted improvements open.

The whole stack:

- **Client engine:** vanilla JavaScript, Three.js, progressive WebGPU on supported browsers, and WebGL fallback
- **Server:** ~600-line TypeScript Cloudflare Worker with Durable Objects and D1
- **Shared sim:** deterministic boid + obstacle modules imported byte-identically by both
- **Tests:** Vitest 4 coverage for renderer adapters, atmosphere, heightfield, scene-obstacles, island-boundary, tree placement, sim-baseline, refactor-baseline characterization goldens, worker D1 validation, integration harness, practice-mode, SEO, and water shoreline math

If you're learning 3D web games, real-time multiplayer on edge compute, or large-scale boid simulation, this codebase is a rare opportunity to read a complete shipped product instead of yet another minimal example.

---

## What's actually in here

### 🐑 5,000-sheep flocking in a single draw call
- GPU-instanced sheep via Three.js `InstancedMesh` + custom vertex shader (legs and heads animate per-instance)
- Force-based steering on **real obstacles** — sheep + dog actually route around tree trunks, large rocks, and terrain via a deterministic [`kdbush`](https://github.com/mourner/kdbush) spatial index
- Adaptive boid AI: tighter cohesion at higher counts so 5,000 sheep stay readable instead of dissolving into noise

### 🌍 Four hand-built biomes
| Scene | Shape | Hook |
|---|---|---|
| **Home Field** | Flat fenced rect (±100 m) | Single perimeter pen, gate-passage retirement. The starter. |
| **Newsheepdogland** ⭐ | Boot-shaped survival island | Homestead pen, wolves after dark, shorter day/night pressure, and the current WebGPU hero scene. |
| **Rolling Hills** | 180 m island with rolling heightfield | Lightning-zap corral, water + Mediterranean tree mix, golden-hour mood. |
| **Open Country** | 380 m island (~4.2× area) | Multi-stage objective: gather **40 sheep into the round-up zone for 2 sec**, then drive them through a magical portal at the north shore. |

### 🎮 Six gameplay modes
- **Just Play** (Practice Paddock — 30 sheep, no timer, no fail state) — *new in v2.1.0*
- **Solo Classic** (200 sheep, scene-default goal, leaderboard)
- **Solo Extreme** (1,000 sheep)
- **Solo Insane** (3,000 sheep)
- **Solo Chaos** (5,000 sheep — the flock is the antagonist)
- **Survival** (Newsheepdogland — start with 10 sheep, bring them home before wolves thin the flock after dark)
- **Multiplayer:** 2–4 player real-time co-op + competitive rooms + 3-minute timed mode + 2-player local split-screen + sandbox editor with shareable URLs

### ⚡ Authoritative 60 Hz multiplayer on Cloudflare's edge
- Durable Objects host per-room sim — rooms live wherever Cloudflare schedules them, no cold start
- MessagePack-over-WebSocket state frames; client adaptive-jitter-buffer widens automatically as RTT stddev rises
- D1 leaderboards with per-mode best times and a discriminator-based identity (#0001-style tags)
- Reconnect grace window — drop a tab and rejoin within 15 s without losing your run

### 🎨 Cinematic visual layer
- **Progressive WebGPU renderer path** with explicit WebGL fallback and a forced `?renderer=webgl` escape hatch
- **Hosek-Wilkie analytic sky** with day/night presets, parallax cloud layer, shoreline-aware water with sun-glint, billboarded sun disc
- **Hundreds of thousands of grass blades** with directional wind shader, dog-bends-grass-along-its-facing interaction, per-scene density tuning, stochastic-dither LOD
- **Apple-correct tone mapping** — Mac/iPhone/iPad use Neutral instead of ACES so the sky doesn't wash white on Metal-ANGLE
- Per-scene tree LOD + impostor atlases. The WebGPU tree route now has explicit material-parity and octahedral sidecar proof, but it still stays opt-in until mobile frame budgets and transition quality justify making it the default.
- Three camera modes: **Classic** (top-down isometric), **Follow** (cinematic chase with ridge-clearance lift), **Free** (mouse-yaw orbit)

### 🌐 Mobile + i18n + accessibility
- Touch joystick + on-screen sprint button + responsive HUD; PWA-installable from any browser
- Full gamepad support (analog stick + buttons)
- 5 languages: English, Spanish, Portuguese, Japanese, Simplified Chinese ([more contributions welcome](js/locales/))

### 🔬 SEO + share-ready
- Per-scene metadata: `<title>`, `og:image`, `og:title`, `og:description`, `twitter:*` all switch on `?scene=X` deeplink — *new in v2.1.0*
- Schema.org `VideoGame` + `FAQPage` + `WebApplication` structured data
- Lighthouse SEO **100 / 100**

---

## Try it locally in 30 seconds

Requires Node 22+ and a modern browser (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+).

```bash
git clone https://github.com/matthew-kissinger/sds.git
cd sds
npm install
npm run dev:setup      # apply D1 migrations to local sqlite (one-time)
npm run dev            # vite (:3000) + wrangler (:8787) together
```

Then open [http://localhost:3000](http://localhost:3000).

Granular alternatives:
```bash
npm run dev:client     # just Vite (no multiplayer worker)
npm run dev:worker     # just wrangler
npm run dev:lan        # vite --host + wrangler (LAN-accessible — for mobile testing)

npm test               # Vitest suite
npm run test:ios-water # BrowserStack real iOS Safari water canary
npm run build          # production output to dist/
```

URL params for fast scene picking + shoot setup:
- `?scene=field` — Home Field
- `?scene=rolling-hills` — Rolling Hills
- `?scene=open-country` — Open Country
- `?scene=newsheepdogland` — Newsheepdogland survival island (default entrance world)
- `?cinematic=1` — exposes `window.__sdsCinema` for scripted captures + free-fly camera + tone-map override
- `?ui=off` — hide React overlay (canvas-only render)
- `?sun=N` — N in 0..1 (`0.06` = dusk, `0.20` = golden hour, `0.50` = noon)
- `?renderer=webgpu` — request the production WebGPU path where the browser can create a device
- `?renderer=webgl` — force the WebGL fallback path
- `?konveyorNativeTreeImpostors=1` — opt into the Cycle 38 explicit three-tier WebGPU tree route for review

---

## Controls

| Input | Desktop | Mobile |
|---|---|---|
| Move | W A S D / Arrows | Virtual joystick (bottom-left) |
| Sprint | Shift (drains stamina; locks until released after empty) | Sprint button above joystick |
| Camera mode | C (cycles Classic / Follow / Free) | Tap the camera-mode chip on the HUD |
| Zoom | Mouse wheel | Slider (bottom-right) |
| Pause | Escape | Pause button on the HUD |
| Gamepad | Full analog support | — |

Camera modes: **Classic** (high-isometric, world-axis WASD), **Follow** (close cinematic chase, camera-relative WASD, ridge-clearance lift), **Free** (mouse-yaw orbit on top of Follow's pitch). Per-scene preference is remembered in localStorage.

---

## Architecture (one-page version)

```
┌─────────── CLIENT (Cloudflare Pages) ──────────────────────────────────┐
│                                                                         │
│  StartScreen → GameState → OptimizedSheep → SceneManager                │
│       ↓             ↓             ↓              ↓                      │
│  MobileControls  InputHandler   Sheepdog    TerrainBuilder              │
│       ↓             ↓             ↓              ↓                      │
│  AudioManager   GamepadManager  GrassSystem   Atmosphere + Effects      │
│       │             │             │              │                      │
│       │             │             │              ├── HosekWilkieSky     │
│       │             │             │              ├── CloudLayer         │
│       │             │             │              ├── SunBillboard       │
│       │             │             │              ├── PortalEffect       │
│       │             │             │              └── CorralZapEffect    │
│       └─────────────┴──── shared/ deterministic kernels ──────────┐     │
│                       (boid, MovementPhysics, BoundaryCollision,  │     │
│                        TreePlacement, SceneObstacles, scenes/)    │     │
│                                                                   │     │
│                    NetworkManager                                 │     │
│            (WebSocket + MessagePack + fetch, adaptive jitter buffer)    │
└────────────────────────────────┬────────────────────────────────────────┘
                            HTTPS │ WSS
┌────────────────────────────── ▼ ── SERVER (Cloudflare Worker) ─────────┐
│                                                                         │
│  index.ts                                                               │
│    ├── HTTP:  /api/register, /api/rooms, /api/score, /api/leaderboards  │
│    └── WS:    /r/:code/ws → RoomDO                                      │
│         ↓                                                               │
│  RoomDO   — per-room, runs GameSim at 60 Hz, broadcasts state frames    │
│  LobbyDO  — singleton, public lobby list + quick-match + room codes     │
│         ↓                                                               │
│  D1 (sds-db)                                                            │
│    ├── players                  (materialized best per mode + identity) │
│    ├── discriminators           (#0001 allocation)                      │
│    └── score_submissions        (audit trail)                           │
└─────────────────────────────────────────────────────────────────────────┘
```

The `shared/` modules import byte-identically into both client (Vite) and worker (esbuild) — flocking, obstacle queries, boundary collision, tree placement, the multi-stage objective state machine (round-up → drive on Open Country), and scene definitions all live there so solo and multiplayer agree on physics. The sim-baseline tests pin deterministic Field + island-boundary + corral-retirement + objective-stage runs to JSON fixtures and have stayed bit-identical across cycles 5–34.

Full diagrams + network protocol + module-level details: [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Tech stack

**Client:** Three.js 0.184 WebGL/WebGPU renderer paths · React 19.2 · Vite 7.3 · Tailwind 4.1 · @msgpack/msgpack 3 · i18next 25 · lz-string · nipple.js · kdbush

**Server:** Cloudflare Workers · Durable Objects · D1 · wrangler 4

**Shared:** `shared/` deterministic boid + physics + obstacle modules, imported by both runtimes

**Testing:** Vitest 4.1 covering renderer adapters, atmosphere, heightfield, scene-obstacles, island-boundary, tree-placement, sim-baseline, refactor-baseline characterization goldens, worker D1 validation, integration harness, practice-mode contracts, SEO, and water shoreline math. ESLint enforces the `shared/` deterministic boundary (`npm run lint`). Playwright covers browser smoke and perf-baseline harnesses; BrowserStack covers the real iOS Safari water canary.

---

## Current state

We work in numbered cycles; player-visible ships get a `vN.N.N` tag with a CHANGELOG entry. The last cycles delivered everything you see today; here's where the surface is moving right now:

- **`v2.2.3`** (2026-06-09) - Newsheepdogland feel-and-hero release: desktop WebGPU flagship proof on the 3070, shorter survival pressure, validated two-dog survival co-op, and the Newsheepdogland homestead/pen/grass hero as the entrance default.
- **Cycle 54 closed** (2026-06-04) - Windows Electron distributor path: installer/portable/unpacked artifacts, app identity, logs/crash paths, signing-ready posture, packaged WebGL/WebGPU proofs, native resize proof, and Steam/store handoff. Local Steam depot dry-run is plausible; public store submission is still gated on signing policy, metadata, install QA, screenshots/capsules, controller/cloud-save policy, and release-channel decisions.
- **`v2.2.0`** (2026-06-03) - forward-only license transition: current source is AGPL-3.0-or-later, current assets are CC BY-SA 4.0, visible AGPL source notices are in the app, and the first Windows Electron / Capacitor Android native-shell proof is documented.
- **`v2.1.10`** (2026-05-28) - Cycle 42 WebGPU material parity: warmer sun/sky, darker water, and octahedral tree-impostor proof.
- **`v2.1.6`** (2026-05-16) — Cycle 38 tree-placement readability patch: deterministic cross-zone canopy spacing removes stacked tree clumps, and tighter scale jitter keeps production trees from reading as saplings.
- **`v2.1.5`** (2026-05-16) — Cycle 38 WebGPU tree-impostor packet: branch/leaf-preserving tree rebakes, explicit three-tier WebGPU tree route behind `?konveyorNativeTreeImpostors=1`, dynamic impostor tile plumbing, and refreshed desktop/Android proof artifacts. Desktop proof is green; Android WebGPU remains budget-red and is not a mobile-ready claim.
- **`v2.1.4`** (2026-05-10) — real iOS Safari water validation via BrowserStack + shoreline-based water shader, removing the fragile depth pre-pass.
- **`v2.1.3`** (2026-05-09) — public-surface pass: crawler body content, per-scene landing pages, sitemap fix, footer links, and repo topic refresh.
- **`v2.1.1`** (2026-05-08) — OG card refresh: new Rolling Hills dusk + Field farmhouse social-share images. `_headers` cache TTL added so future asset refreshes propagate fast at the CF edge.
- **`v2.1.0`** (2026-05-08) — **Practice Paddock** (30-sheep no-pressure mode at position 0 of the mode picker, with first-visit pulsing-glow nudge gated by `localStorage`) + **per-scene SEO** (`document.title` + full `og:*` + `twitter:*` switch on every scene change).
- **`v2.0.5`** — deleted dead `AtmosphericDesatPatch` machinery (~190 LOC) — final piece of the Cycle 25 polish-program cleanup.
- **`v2.0.4`** — extended Apple tone-mapping branch from Mac to iPhone/iPad to fix the iOS water-sheen wash.
- **`v2.0.3`** — Mac white-hue fix (ACES → Neutral on Mac platforms; the sky-blue fog was pushing toward white through ACES + extended-sRGB on Metal-ANGLE).
- **`v2.0.0`** (Cycle 25 close) — eight-phase polish-mega-cycle: validation infrastructure, LOD truth (drop LOD1 desktop), HeightFogPatch foundation, per-mode camera zoom + persistence, per-scene tree distribution profiles, shimmer-skeleton scene-swap overlay.

[CHANGELOG.md](CHANGELOG.md) has the full per-version log; [docs/BACKLOG.md](docs/BACKLOG.md) keeps per-cycle headlines; [DECISIONS.md](DECISIONS.md) is the chronological "why" record.

---

## Roadmap — where help would move the game

The backend on Cloudflare's edge is solved-as-far-as-it-needs-to-be. The visual layer is now progressively WebGPU-backed on supported browsers while retaining WebGL fallback. Android WebGPU frame budgets and tree representation quality are still active engineering work. **Each item below is a real PR-able piece of work** — issue numbers welcome.

- **Steam/desktop release lane.** The Windows Electron package boots and plays from built web assets in both WebGL and WebGPU. The useful next step is not a new shell; it is release discipline: signing choice, installer/uninstaller QA, Steam depot dry-run, store metadata, capsule/screenshots, controller/cloud-save policy, and a repeatable native preflight.
- **Dynamic weather + time-of-day as gameplay levers.** The Hosek-Wilkie sky already supports dawn/noon/dusk/golden/overcast presets; wiring a `DayNightCycle` driver where sheep flocking tightens at dusk and visibility drops in fog turns atmosphere into mechanic.
- **More multi-stage objectives** beyond Open Country's gather→drive. River crossings, predator-flushing, lost-sheep recovery, scattered sub-flocks at multiple cardinal directions — each unlocked by data in `shared/scenes/*.js` rather than new code paths.
- **Predators + NPCs.** Wolves/strays as obstacle-aware boids using the same `SceneObstacles` index sheep already query. A second AI shepherd that competes or assists.
- **Mod-friendly scene format.** Sandbox already uses lz-string-encoded URLs; growing this to full scene descriptions (heightmap + tree zones + woods clusters + objective def) so a custom biome ships as a link.
- **Production octahedral tree impostors.** Cycle 38 deliberately keeps the WebGPU tree route opt-in while desktop/Android evidence improves. The next useful version is a real view-dependent impostor or hybrid trunk/branch geometry plus impostor canopy, with grounded pivots, tile selection, relighting, LOD transition hysteresis, and screenshot gates before it replaces native LODs on mobile.
- **Competitive seasons + tournaments** once the leaderboard has enough player history to make them meaningful.

---

## Contributing

This codebase is **deliberately easy to read**. Whether you want to mod the game, use it as a reference for a 3D browser project of your own, or ship a PR, here's the recommended reading order:

1. [ARCHITECTURE.md](ARCHITECTURE.md) — module map, render pipeline, network protocol
2. [DEVELOPMENT.md](DEVELOPMENT.md) — local setup, dev servers, mobile testing, mp testing
3. [DECISIONS.md](DECISIONS.md) — chronological "why we made the calls we did"
4. [docs/BACKLOG.md](docs/BACKLOG.md) — per-cycle "what shipped" headlines
5. [docs/INTERFACE_FENCE.md](docs/INTERFACE_FENCE.md) — files where stability matters more than ergonomics
6. [docs/README.md](docs/README.md) — full doc navigation index (Diátaxis-tagged) — start here if you want a full map of the docs tree

### Good first issues — concrete things a PR could fix

- **More languages.** i18n keys live in [js/locales/](js/locales/); PRs add a new directory + JSON files. Today: 5 languages (en, es, ja, pt, zh-CN). Want German? French? Korean? Open a PR.
- **Dog GLB compression** via gltf-transform + Draco. Each dog is 25–40k triangles; five dog models. Trims the bundle.
- **Better Android WebGPU perf.** The Cycle 38 connected-phone matrix is screenshot-valid but budget-red. Reducing Field draw calls, Open Country terrain/tree cost, and sprint-start spikes comes before any mobile-readiness claim.
- **MP joiner renderer sync.** Joiners whose URL-param scene differs from the room's see correct sim but mismatched visuals.
- **LOD2 → LOD0 cross-fade** at the 100 m boundary. The hard pop is visible — alpha-dither / fade across a 5–10 m hysteresis band would soften it.
- **Small-window HUD polish.** Native resize is proven, but very small desktop windows still deserve a dedicated HUD comfort pass before public desktop release.
- **Mod gallery.** If you ship a fork or mod and comply with the AGPL/asset notice requirements, open an issue and we can link it from this README.

### How to ship a PR

1. Fork → clone → branch off `main`
2. `npm install && npm run dev` to confirm it boots locally
3. `npm test` should be green before opening — it runs in ~1.5s
4. Open the PR with a brief description of intent + what you tested
5. Cycle plans live in [docs/cycle-N-plan.md](docs/) — if your work spans a phase or two, it's reasonable to coordinate via an issue first; small PRs don't need to

We use squash-merge with a `[type](scope): summary` first-line convention (see `git log --oneline` for examples).

---

## License

Source code is licensed under [GNU AGPL-3.0-or-later](LICENSE). Non-code assets are licensed under [Creative Commons Attribution-ShareAlike 4.0](LICENSE-ASSETS). See [LICENSING.md](LICENSING.md) for the forward-only transition details.

The in-app notice appears on the about page, the start/loading flow, and the in-game HUD. Modified versions must preserve these notices in reasonably visible locations.

If you build something with this codebase — a fork, a mod, an academic project, a stream — we'd love to hear about it. [Open an issue](https://github.com/matthew-kissinger/sds/issues/new) and we'll link it from this README.

---

## Links

- 🐑 **Play:** [sheepdogsim.com](https://sheepdogsim.com)
- 📦 **Source:** [github.com/matthew-kissinger/sds](https://github.com/matthew-kissinger/sds)
- 📋 **Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md)
- 🛠️ **Dev guide:** [DEVELOPMENT.md](DEVELOPMENT.md)
- 📜 **Decisions log:** [DECISIONS.md](DECISIONS.md)
- 📝 **What's been shipping:** [CHANGELOG.md](CHANGELOG.md)
- 📨 **Press / questions:** [PRESSKIT.md](PRESSKIT.md) · [matt.m.kissinger@gmail.com](mailto:matt.m.kissinger@gmail.com)
