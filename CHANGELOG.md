# Changelog

All notable changes to Sheep Dog Sim are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/).

## [3.0.0] - Unreleased

### Added

- A clean-room TypeScript client focused on one field, one dog and one herding
  goal, with 25, 75 and 200 sheep configurations.
- WebGPU-first rendering with forced WebGL2 fallback through the same Three.js
  TSL material implementations.
- Keyboard, gamepad and touch input, Classic and Follow cameras, remapping,
  reduced motion and quality controls.
- Local personal bests plus optional fail-soft solo-time boards under a
  server-random or player-edited name.
- Procedural, reproducible sheep, dog, fences, farm structures, foliage,
  terrain, grass, atmosphere and original synthesized audio.
- Public architecture, contribution, security, asset-license and launch
  documentation under AGPL-3.0-or-later.

### Changed

- The version 3 score client is isolated to the `field-v3` partition and exact
  flock sizes 25, 75 and 200. It does not import the version 2 network client.
- Release workflows build and verify an exact commit, keep preview scores away
  from production, and retain an explicit version 2 rollback branch and tag.

### Removed

- The version 2 client, including multiplayer UI, room flows, scene and mode
  rosters, compatibility layers, browser-global bridges, duplicated renderer
  materials and the public 5,000-sheep path.

The complete version 2 source remains available from `v2.6.4` and
`release/2.x`.

## [2.6.4] - 2026-07-26

### Fixed

- The Survival day/phase chip and Skip to Dusk control no longer appear on Home Field or any other non-survival scene.
- Home Field keeps its ambient sun and farmhouse-lamp progression without inheriting Survival phases, wolves, economy, gate scheduling, or HUD controls.

### Validation

- A registry-wide ownership test proves Newsheepdogland is the only scene allowed to initialize the Survival day loop.
- Chromium gameplay proof confirms Home Field reaches an active three-sheep Just Play round with no Survival run, day loop, day/phase chip, or Skip to Dusk element.
- `npm test`, `npm run build`, `npm run lint`, and `npm run typecheck` pass.

## [2.6.3] - 2026-07-26

### Changed

- Play now enters every public scene through one painted, single-flight loading transaction instead of exposing partial scene construction or accepting overlapping starts.
- The public web game uses the stable WebGL renderer. WebGPU remains available only through an explicit developer query for diagnostics.
- Gameplay music streams from its first playback request instead of blocking startup on full-track decoding or opening a metadata request that Chromium aborts and retries; only the selected track and dog bark are prepared before a round.
- Sandbox and local two-player starts now use the same loading and failure-recovery contract as solo play.
- The CPU flock path removes per-frame allocation and duplicated neighbor, fence, obstacle, dog-distance, and interpolation work without changing deterministic shared simulation contracts.

### Fixed

- Removed duplicate pregame dog/flock construction, duplicate audio ownership, stale music transitions, and sandbox deep-link scene races that made Play appear to loop or stall.
- Mobile high-count solo play no longer requires a second confirmation after Play.
- Local versus fences support east/west gates, local rounds create their intended flock, and local scores no longer enter online leaderboards.

### Validation

- A new production-preview harness measures loading-cover paint, real dog movement, a two-second stable frame window, long tasks, renderer identity, requests, audio, console errors, and machine quiescence.
- Current-build WebGL matrices passed 26/26 desktop cold cases, 26/26 phone/touch cases, 9/9 sandbox/local cases, 4/4 gamepad cases, 4/4 warm-navigation cases, and same-page restart while verifying the live scene, mode, selected dog, and active sheep count.
- The explicit WebGPU diagnostic reproduced the rejected path at 14.301 seconds to input and 21.482 seconds to settled gameplay.

## [2.6.2] - 2026-07-07

### Changed

- Controller navigation now works on the entrance menu and first-run tutorial offer, with Start/A confirming the active menu choice.
- Active solo play now supports camera zoom through laptop ArrowUp/ArrowDown keys and standard gamepad A/B buttons.
- The guided tutorial starts on Home Field from a close Follow camera behind the dog, then teaches camera switching and zoom from that readable framing.

### Fixed

- The first-run tutorial offer is treated as the active controller menu surface while visible, preventing controller confirm from falling through to the underlying Play button.
- Bark hint and bark meter chrome stand down during the tutorial so the bottom tutorial prompt stays readable.

### Validation

- `npm test`, `npm run build`, `npm run typecheck`, focused controller/camera/UI specs, and production-preview Playwright probes passed.
- Browser probes verified tutorial-offer controller accept, Start-to-play, ArrowUp/ArrowDown zoom, gamepad A/B zoom, and close tutorial Follow framing.

## [2.6.1] - 2026-06-30

### Fixed

- Counting Sheep no longer trips WebGPU validation on 5,000-capacity flocks. Large WebGPU sheep instance matrices now use storage-backed attributes, keeping Round 1 Incremental and Exponential starts to one visible sheep instead of corrupting the scene with a bright centered render artifact.
- Returning from Counting Sheep to the menu now clears counting round state before the backdrop scene rebuild, so later non-counting starts cannot inherit the 5,000-sheep counting ceiling.

### Validation

- `npm test`, `npm run build`, `npm run lint`, and `npm run test:e2e -- tests/e2e/smoke.spec.ts --project=chromium --grep-invert @local-only` passed.
- Local production WebGPU Playwright proof passed for Counting Sheep Incremental and Exponential on Rolling Hills and Home Field, with screenshots showing no centered/grounded sun artifact and no WebGPU validation errors.

## [2.6.0] - 2026-06-30

### Added

- Public `/support` and `/privacy` pages are now part of the web build and sitemap.
- Settings expose a telemetry opt-out for nonessential product events.
- Beta release notes and leaderboard-season planning document the v2.6.0 web beta posture.

### Changed

- Public copy now centers the beta around three public scenes: Home Field, Rolling Hills, and Open Country.
- Newsheepdogland remains a gated lab and is no longer presented as a public beta scene, sitemap entry, or indexed scene page.
- Pause/settings surfaces now keep source, support, privacy, and telemetry controls available without carrying source text in the active-play HUD.

### Fixed

- Public lobby discovery now requests lobby listings directly through `NetworkManager.requestPublicLobbies()`.
- First-session tutorial offer spacing is safer on compact and mobile layouts.

### Validation

- `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e -- --project=chromium`, `git diff --check`, and GitHub Actions deploy validation passed for the beta release set.

## [2.5.0] - 2026-06-28

### Added

- Bark is now a core skill with stronger hybrid directional/radial sheep steering through the deterministic shared bark primitive.
- Bark readiness and cooldown are visible on desktop and mobile, with a subtle world-space sound-wave cone when bark fires.
- Short, calm, dog-specific bark sounds are bundled for runtime use and documented with source/license details.

### Changed

- The first-session tutorial now teaches move, sprint, camera, bark, and a 3-sheep intro goal before routing players toward Quick 25.
- Leaderboards now prioritize easy scored boards, surface active/scored board counts, and keep Newsheepdogland out of the public picker while it remains a sandbox.
- Completion flow now separates unranked practice from ranked runs, highlights score/save feedback, and offers clearer next actions.

### Fixed

- The first-run tutorial offer now sits above the React overlay host and can be clicked reliably.

### Validation

- `npm test`, `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test:e2e -- --project=chromium`, `git diff --check`, installed-Chrome bark/tutorial/leaderboard/NSL audits, and bark audio duration checks passed.

## [2.4.0] - 2026-06-26

### Added

- Launch-readiness program covering repo docs, SEO/site content, release-candidate proof, native/Steam readiness, itch/portal planning, and final review.
- Isolated PR preview multiplayer backend: preview Worker `sds-worker-preview`, preview D1 `sds-db-preview`, preview-only `JWT_SECRET`, and CI proof that preview deploys do not touch production D1.
- Current launch copy sources under `docs/launch/` for web, itch, Steam, portals, social copy, and final review.
- Fresh WebGPU scene captures for README/site heroes plus 1200x630 Open Graph/Twitter cards under `assets/scenes/`.

### Changed

- Three.js runtime dependency moved to r185 and the render migration was validated against SDS WebGPU/WebGL surfaces.
- Kiln-backed asset work promoted into the live game: accepted fence kit, authored gate, refreshed tree1/tree2 candidates, hybrid grass default, farmhouse, homestead props, and sparse natural accents.
- Foliage LOD/panning-density tuning now uses explicit consolidated-tree distance profiles while keeping `shared/` placement data untouched.
- Public repo, press, and launch docs now describe the current game, deployment posture, and release lanes instead of older r184/Cycle 83/native `2.2.0` state.

### Validation

- Release-candidate validation is recorded in `cycle108-validation/`.
- Native/Steam validation is recorded in `cycle109-validation/`.
- Itch/portal/final launch review status is recorded in `cycle110-validation/`.
- Fresh scene media capture proof is recorded in `cycle110-validation/scene-media-refresh/`.

### Notes

- Steam public submission, paid platform actions, and third-party portal submissions remain separate follow-up decisions.

## [2.3.4] - 2026-06-12

### Fixed

- Newsheepdogland streamed-foliage prewarm now skips Three's WebGL `compileAsync`, avoiding a teardown race where the CI smoke loop could hit `currentProgram.isReady` after a menu return and same-scene restart. WebGPU still keeps the async prewarm path.

### Validation

- `npm test -- tests/foliage-streaming.spec.js tests/ui/GameHUD.smoke.spec.tsx`, `npm test`, `npm run lint`, `npm run build`, and `npm run test:e2e -- --project=chromium --grep-invert='@local-only'` passed.

## [2.3.3] - 2026-06-12

### Fixed

- The desktop bark cue auto-dismiss timer no longer calls stale React state after the loading-handoff refactor, keeping first-run gameplay and CI smoke navigation crash-free.

### Validation

- `npm test`, `npm run lint`, `npm run build`, and `npm run test:e2e -- --project=chromium tests/e2e/smoke.spec.ts` passed.

## [2.3.2] - 2026-06-12

### Fixed

- Desktop bark cue timing now waits until the loading handoff is complete before starting its 9 second dismiss timer, so slow first loads cannot hide the PC bark hint behind the loading surface.

### Validation

- `npm test`, `npm run lint`, and `npm run build` passed.
- Production-local Chromium proof showed desktop `Bark Space` with `loading:false`, bark-key dismissal persisted, mobile kept one visible Bark button, and the desktop cue stayed suppressed on mobile.

## [2.3.1] - 2026-06-12

### Changed

- Bark now steers affected sheep through a short, decaying acceleration intent instead of directly injecting velocity. The response keeps sheep under their ordinary movement speed envelope while still biasing them along the dog's facing direction.

### Added

- Desktop play now shows a lightweight, dismissible bark cue using the current bark keybinding. Mobile keeps the existing visible bark button and does not render the desktop cue.

### Validation

- `npm test`, `npm run lint`, `npm run build`, and `npm run test:integration` passed.
- Production-preview probes verified desktop bark discoverability, bark cue dismissal, mobile bark discoverability, and live sheep speed remaining under the normal cap after bark.

## [2.3.0] - 2026-06-09

The release where the hardening program becomes player-visible: the game
teaches you to herd, remembers what you have done, finishes its settings,
loads in under a second, and runs multiplayer on a load-tested delta
protocol.

### Added

- First-run tutorial: a guided sixty seconds on Home Field (move, sprint,
  swap the camera, pen three sheep). Skippable, offered once, localized in
  English, Spanish, Japanese, Portuguese, and Chinese.
- Nine achievements (first pen, each island's classic round, Solo Chaos,
  one and five nights survived, a competitive win, all five dogs), with
  dog badges on the menu.
- Settings completion: full key rebinding, gamepad support with rebinding,
  colorblind mode, and a language selector.
- Share and invite surfaces: lobby invite URLs that drop a friend straight
  into the room, plus score sharing.
- Crash reporting (client errors beacon with full stack traces), WebGL
  context-loss recovery, and a service-worker update toast so an open tab
  is offered new versions instead of staying stale.
- Windows Electron distributor path with installer, portable, and unpacked
  artifacts, app identity, generated Windows icons, logs/crash paths, and
  signing-ready local build posture.
- Packaged desktop proof commands for explicit WebGL and true production
  WebGPU, including native window resize, fullscreen, pointer lock, audio
  unlock, storage, gamepad API, Worker health, authenticated WebSocket, and
  sheep startup motion checks.

### Changed

- Multiplayer wire protocol v3: the server sends only the sheep whose wire
  record changed, with a full keyframe every second and per-client
  soft-degrade for older clients. Late-round bandwidth drops to 43% of the
  old full-snapshot cost; never worse than the old cost by construction.
- Clients that stop keeping up (256 KB socket backlog for ~4 s) are evicted
  through the normal grace and host-migration path instead of stalling the
  room.
- First load: the entrance is visible in 0.9 s at 20 Mbps, down from 8.8 s
  (resource hints let the UI front-run the world download).
- Worker logging is structured JSON with tick-health monitoring, and D1
  migration state is self-managed by the deploy pipeline.

### Fixed

- A room that came back full after a server eviction locked out the very
  players whose seats were persisted in it; a rejoin that re-proves a
  persisted identity now reclaims its seat (genuinely new joiners still get
  the room-full refusal).
- Crash stacks posted to the event endpoint were truncated to 256
  characters (and could be cut into invalid JSON); the stack cap is now
  4,096 with always-valid storage.
- Recovering multiplayer clients (reconnect or dropped frame) received a
  keyframe that could not chain into the next delta, stalling state updates
  for up to a second; unicast keyframes are now basis-aligned.
- Host-migration logs always claimed the original host reclaimed the room.
- Startup flock visuals now move from the first playable moments in both WebGL
  and WebGPU instead of reading as a half-frozen first frame.
- Native Electron resize now keeps viewport, canvas, and camera aspect aligned
  to the resized window.
- Listener leaks across scene swaps (verified by a 50-swap heap soak).

### Validation

- Full vitest suite green, production build clean, worker typecheck clean,
  sim-baseline fixtures byte-identical throughout.
- 100-room concurrent load test: 0 desyncs across 208,000 server ticks.
- DO-eviction chaos harness: 32/32 checks including the full-room rejoin
  contract (`tools/loadtest/chaos-results-rejoinfix-2026-06-09.json`).
- Post-hoc fence reviews of the delta protocol, sim tie-break, and shared/
  refactors recorded in `docs/hardening/review-dossiers-2026-06-09.md`.

### Notes

- Steam/store release remains a separate prep cycle: signing policy,
  install/uninstall QA, depot dry-run, metadata, screenshots/capsules,
  controller/cloud-save policy, and release-channel decisions are still open.
- Real-device mobile validation is tracked in Cycle 86 Phase 3 and blocked
  only on hardware access; Chromium mobile emulation passes.

## [2.2.12] - 2026-06-09

### Fixed

- Newsheepdogland now loads survival HUD, pen containment, minimap, and skip
  controls in parallel, and defers the heavy wolf renderer import until after
  the scene body is complete, so the first Play path reaches game activation
  instead of spending the readiness window in serialized boot wiring.

### Validation

- `git diff --check`, full `npm test`, `npm run lint`, and `npm run build`
  passed locally.
- `npx playwright test tests/e2e/smoke.spec.ts --project=chromium
  --project=firefox --project=webkit` passed locally.
- `npx playwright test --project=chromium --grep-invert='@local-only'` passed
  locally, matching the GitHub Deploy E2E command.
- `npx playwright test tests/e2e/scene-swap-stability.spec.ts -g "open
  country objective" --project=chromium` passed locally for the updated
  Open Country helper path.

## [2.2.11] - 2026-06-09

### Fixed

- Newsheepdogland's default grass field now stays on the homestead and grazing
  corridor with a bounded clump budget, so hosted Chromium can enter the
  survival run instead of spending the first Play window building scenery.

### Validation

- `git diff --check`, focused cache/tree/scene Vitest, full `npm test`,
  `npm run lint`, `npm run build`, focused Newsheepdogland Chromium E2E, and
  the full Chromium Playwright smoke command passed locally.

## [2.2.10] - 2026-06-09

### Fixed

- Entrance Play now waits for the engine instance and initialization before
  committing the default Newsheepdogland run, so a fast React entrance cannot
  drop an early click while the renderer and critical assets are still booting.

### Validation

- `git diff --check`, focused tree/cache Vitest, full `npm test`,
  `npm run lint`, `npm run build`, focused Newsheepdogland Chromium E2E, and
  the full Chromium Playwright smoke command passed locally.

## [2.2.9] - 2026-06-09

### Fixed

- Newsheepdogland's default cold-start tree budget is now a true first-session
  homestead corridor instead of a broader island forest pass, so Play reaches
  the survival run on slow hosted Chromium without leaving the player stuck on
  stale loading/game state.

### Validation

- `git diff --check`, focused tree/cache Vitest, full `npm test`,
  `npm run lint`, `npm run build`, focused Newsheepdogland Chromium E2E, and
  the full Chromium Playwright smoke command passed locally.

## [2.2.8] - 2026-06-09

### Fixed

- Newsheepdogland's default tree placement now stays on the playable
  foot/homestead corridor, cutting the hosted Chromium cold-build stall before
  survival systems mount.
- Entrance Play now awaits one scene build and one game start instead of racing
  a `scene-swap-end` listener against a fallback start call.

### Validation

- `git diff --check`, focused tree/cache Vitest, full `npm test`,
  `npm run lint`, `npm run build`, focused Newsheepdogland Chromium E2E, and
  the full Chromium Playwright smoke command passed locally.

## [2.2.7] - 2026-06-09

### Fixed

- Newsheepdogland's default cold-start tree budget is now bounded to the
  actual foot and lower-leg play corridor, avoiding a multi-minute hosted
  Chromium scene-build stall before the first survival run starts.

### Validation

- Full `npm test`, `npm run lint`, `npm run build`, and Chromium Playwright
  smoke passed locally after the scene budget change.

## [2.2.6] - 2026-06-09

### Changed

- Newsheepdogland is now the default URL-less scene, matching the entrance's
  flagship survival world instead of dropping new sessions back to Rolling
  Hills.
- The first Play click now paints the loading surface before the heavy
  Newsheepdogland scene rebuild starts, so the button no longer reads as stale
  or ignored during production loading.

### Fixed

- Returning from Newsheepdogland to the menu now tears down survival-only
  runtime surfaces before the entrance remounts, then starts a fresh survival
  run when Play is clicked again.
- Entrance dog selection now reads the canonical `selectedDog` key before the
  older `sds.last-dog` key, aligning the entrance with the actual game-start
  path.
- Production cache policy now treats `/sw.js`, entrance renders, and terrain
  binaries as mutable network-first assets with short Cloudflare Pages TTLs.

### Validation

- Full `npm test`, `npm run lint`, and `npm run build` passed locally.
- Chromium Playwright smoke passed, including the Newsheepdogland Play -> pause
  -> Main Menu -> Play regression.
- Local production preview confirmed the loading surface appears after Play.

## [2.2.5] - 2026-06-09 (Cycle 84 - Mobile WebGPU primary hotfix)

### Fixed

- Newsheepdogland now stays on the production WebGPU path on WebGPU-capable
  mobile browsers instead of rewriting the first Play click to `renderer=webgl`.
- Mobile Newsheepdogland terrain now covers the off-origin homestead/play area,
  so the sheepdog spawns on the terrain surface instead of snapping to the
  water/skirt height.

### Changed

- WebGPU is documented as the primary/default renderer on capable browsers,
  with explicit `?renderer=webgl` preserved as the fallback escape hatch.
- Mobile WebGPU uses the coastline grass/tree compute-cull path for
  Newsheepdogland, keeping the flagship scene on the consolidated render path.

### Validation

- Targeted WebGPU scene, grass, terrain, and render-cost tests passed.
- Full `npm test`, `npm run lint`, and `npm run build` passed locally.
- Mobile-emulated browser proof passed from the normal entrance with one Play
  click: `webgpu-production`, no WebGL fallback URL params, 3200 m mobile
  coastline terrain mesh, grass/tree compute-cull active, and sheepdog y
  matching the terrain surface at the homestead.
- Chromium Playwright smoke/mobile-asset subset passed locally. Full local
  `npm run test:e2e` was attempted but exceeded a 3-minute command timeout.

## [2.2.4] - 2026-06-09 (Cycle 83 - Wolves, bark, and night polish)

### Changed

- Sheepdog barks now carry farther: sheep react inside the existing forward cone
  out to 24 m, and wolves flee out to 45 m for 2 seconds.
- Wolves are larger and more threat-readable in survival and the `?wolf=1`
  harness, with a grey-wolf material palette applied to the CC0 Quaternius rig.
- Newsheepdogland night is darker, with the visual sun below the horizon at the
  existing survival `NIGHT_T = 0.80`.
- The day/night sun arc now eases between keyframes, and co-op survival visuals
  smoothly approach the Worker-authoritative survival clock instead of snapping.

### Fixed

- The bark command now resumes/unlocks Web Audio from the bark gesture before
  playing the sheepdog bark, so the bark sound and gameplay effect are wired
  together more reliably.
- The sun billboard fades to zero below the horizon instead of lingering as a
  visible night sun.

### Validation

- Targeted bark, wolf, Worker survival, atmosphere, sun-disc, day-loop,
  Newsheepdogland scene, and co-op atmosphere sync tests passed.
- Full `npm test`, `npm run lint`, and `npm run build` passed locally.
- Browser proof covered the `?wolf=1` harness, Newsheepdogland survival bark
  effects at medium/long range, and morning/day/dusk/night luma with
  `sunY=-0.13917` and billboard intensity `0` at `t=0.80`.
- Chromium smoke e2e passed locally after the final rebase. The full local
  cross-browser e2e sweep still has current-main selector/WebKit issues
  documented in PR #60.

## [2.2.3] - 2026-06-09 (Cycle 82 - Newsheepdogland feel and hero)

### Added

- Newsheepdogland is now the first entrance world, with a new WebGPU homestead,
  pen, grass, trees, and sea capture as the default hero image.
- Repeatable Cycle 82 proof tools for the Newsheepdogland entrance hero capture
  and 3070 production-build steady-state profile.

### Changed

- Newsheepdogland survival pacing is shorter and clearer: the scene day is now
  360 seconds, first night arrives about 187 seconds into a fresh run, surviving
  dawns add 6 sheep, a 45% night loss ends the run, and wolves wait 1.6 seconds
  between kills.
- Root page metadata, preload, Open Graph, Twitter, and structured-data imagery
  now lead with Newsheepdogland and describe the survival island directly.
- The mobile entrance wraps the Newsheepdogland survival tagline and keeps the
  fullscreen prompt below the top title/actions.
- The live two-client co-op survival integration test derives its night advance
  from the scene day length instead of hard-coding the prior 600-second day.

### Fixed

- The Newsheepdogland desktop WebGPU flagship keeps the homestead pinned to the
  pen, rejects transient quality-governor false floors, and renders grass on
  both far-from-origin and near-origin scenes.

### Validation

- `npm test`, `npm run build`, and `git diff --check` passed.
- Focused survival, farmhouse-pin, render-cost, SEO, and entrance-family tests
  passed.
- Production-build 3070 steady-state profile passed 5/5 foreground runs at full
  quality (`qualityIndex 0`, `webgpu-production`, no fallback/errors, worst p95
  7.0 ms, worst p99 7.1 ms).
- Live local two-dog co-op survival proof passed against Wrangler with both
  clients synced into the same night/wolf state.
- Desktop/mobile entrance proof passed with the Newsheepdogland image loaded,
  preloaded, and exposed as the root OG image.

## [2.2.2] - 2026-06-06 (Cycle 63 - Collision stutter profile)

### Added

- Repeatable collision-storm profiling via `npm run perf:collision`, gated by
  `?collisionProbe=1`, with frame timing, collision sub-timing, pair counts,
  cell occupancy, and CPU-throttle support for mobile-class probes.

### Changed

- Sheep-to-sheep hard-body resolution now uses a bounded dense typed-array grid
  when scene bounds are available, preserving the deterministic sparse-grid
  output while reducing collision resolver cost in dense flock contact.
- Worker authority, client prediction, and the sim-baseline harness now pass the
  same scene bounds into the shared resolver.

### Validation

- `npm test`, `npm run lint`, `npm run build`, and release-safe Chromium
  Playwright passed.
- Dense-vs-sparse unit coverage proves pair counts, moved sheep, positions, and
  velocities stay equivalent.
- Production-preview probes did not reproduce 200-sheep PC stutter as collision
  CPU cost, but did reduce resolver time at 1000/5000 sheep.

## [2.2.1] - 2026-06-06 (Cycle 62 - Sheep collision feel)

### Changed

- Sheep now separate from nearby active sheep through a deterministic
  spatial-hash hard-body pass shared by solo/client prediction, the
  authoritative Worker sim, and the sim-baseline harness.
- Dog-to-sheep body contact now uses collision constants sized closer to the
  visible sheep mesh, reducing heads/backs sliding through the dog during
  close contact.
- Collision-corrected sheep render positions now snap before instance-matrix
  rewrite so visual contact follows resolved physics instead of trailing
  through another body.

### Validation

- `npm test -- tests/entity-collision.spec.js` passed.
- `npm test -- tests/sim-baseline/harness-parity.spec.ts` passed.
- `npm test -- tests/sim-baseline/baseline.spec.ts` passed after intentional
  fixture regeneration.
- `npm run lint`, full `npm test`, and `npm run build` passed.
- Main bundle characterization ratchet accepted at `561 KiB` for the client
  collision resolver.
- `npx playwright test --project=chromium --grep-invert='@local-only'` passed.
- A targeted `?cinematic=1` browser proof confirmed overlapping sheep/dog
  setups resolve outside physics and rendered collision thresholds with no
  console errors.

## [2.2.0] - 2026-06-03 (Forward license transition)

### Added

- `LICENSE-ASSETS` for CC BY-SA 4.0 asset licensing.
- `LICENSING.md` documenting the forward-only split between code and assets.
- Visible AGPL source notices on the about page, start/loading flow, and in-game HUD.
- Green native-shell proof scaffolds for Windows Electron and Capacitor Android.

### Changed

- Source code for `v2.2.0` and later is now AGPL-3.0-or-later.
- Non-code assets for `v2.2.0` and later are now CC BY-SA 4.0.
- Root package metadata now reports version `2.2.0` and license
  `AGPL-3.0-or-later`.
- Native preflight now validates the actual Vite entry bundle referenced by
  `dist/index.html`.

### Validation

- `npm run lint`, `npm test`, and `npm run build` passed.
- `npm run native:check` passed.
- Windows Electron packaged proof passed for gameplay, explicit WebGL, and true
  production WebGPU.
- Capacitor Android debug APK proof passed on an API 35 emulator for gameplay,
  touch input, and explicit WebGL. Explicit Android WebGPU fell back cleanly to
  WebGL with `webgpu-adapter-unavailable`.

## [2.1.10] - 2026-05-28 (Cycle 42 - WebGPU material parity)

Patch release for WebGPU scene-material parity after the Cycle 41 sun/water fix.

### Added

- Repeatable Cycle 42 WebGL/WebGPU material-lock runner via
  `npm run validation:cycle42-material-lock`.
- Repeatable octahedral tree-impostor proof via
  `npm run validation:cycle42-octahedral-proof`.

### Changed

- WebGPU sky now paints a warm sun body plus hot core before the outer corona,
  so the sun reads less like a faded moon and closer to the WebGL painterly
  reference.
- WebGPU grass now avoids the prior brown/double-darkened look and separates
  more clearly from terrain in low-sun scenes.
- WebGPU water is darker blue, with a masked sun-glint path instead of a
  broad purple wash.
- The explicit production WebGPU tree-impostor route now uses octahedral v2;
  rollback remains `?renderer=webgpu&konveyorNativeTreeImpostors=latlon`.
- Dev dependency hygiene resolves the low-risk `tmp` and `qs` advisories.

### Validation

- `npm test` - 54 passed files, 1 skipped; 499 specs passed, 7 skipped.
- `npm run lint` - clean.
- `npm run build` - clean with existing Vite warnings.
- `npx playwright test tests/e2e/smoke.spec.ts --project=chromium --reporter=line`
  - 2 passed.
- `npx playwright test --project=chromium --grep-invert @local-only --reporter=line`
  - 6 passed.
- `npm run validation:cycle42-material-lock` - passed; contact sheet recorded
  at `cycle42-validation/screenshots/cycle42-material-contact-sheet.png`.
- `npm run validation:cycle42-octahedral-proof` - passed.

### Notes

- The material-lock runner still reports six low-sun actor/Open Country
  material-parity classifications for manual review; the contact sheet is the
  approval artifact.
- Android proof was blocked locally by no authorized ADB device. BrowserStack
  iOS water proof was blocked locally by missing credentials.
- A remaining transitive `uuid` advisory through Google/BrowserStack tooling is
  carried as separate maintenance work.

## [2.1.9] - 2026-05-27 (Cycle 41 - WebGPU painterly parity)

Patch release for the WebGPU sun, sky, and water art-direction follow-up.

### Added

- Repeatable Cycle 41 WebGL/WebGPU art-lock matrix via
  `npm run validation:cycle41-art-lock`.
- Local contact-sheet proof at
  `cycle41-validation/screenshots/cycle41-webgl-webgpu-contact-sheet.png`.

### Changed

- WebGPU sun billboard now reads as a larger warm sun mass without the
  previous tiny pale-dot presentation.
- WebGPU sky material now receives live Hosek-Wilkie sky colors through node
  uniforms and uses a darker, less washed-out painterly response.
- WebGPU water now uses a broad sun-path glint plus ripple glint, with
  linearized sun and palette colors.
- `Atmosphere.setSun()` now preserves the existing axis when callers update
  only elevation or only azimuth.
- Main bundle characterization ratchet accepted at `593 KiB` for the added
  renderer material controls and art-lock support.

### Validation

- Cycle 41 WebGL/WebGPU art-lock matrix:
  `cycle41-validation/runtime/art-lock-matrix.json` (`ok=true`) and the
  contact sheet above.
- `npm test` - 54 passed files, 1 skipped; 498 passed specs, 7 skipped.
- `npm run lint` - clean.
- `npm run build` - clean with existing Vite large-chunk/dynamic-import
  warnings.
- `npx playwright test tests/e2e/smoke.spec.ts --project=chromium --reporter=line`
  - 2 passed.
- `npx playwright test --project=chromium --grep-invert @local-only --reporter=line`
  - 6 passed.

### Notes

- Full all-project `npm run test:e2e` is not the Cycle 41 release gate; it
  includes local-only slow specs. Use the grep-inverted Chromium command above
  for release-safe e2e.
- Mobile/iOS water proof, octahedral tree production promotion, and Open
  Country paired two-client playtest remain deferred.

## [2.1.8] - 2026-05-22 (Cycles 39-40 - sun coherence and tree lab)

Patch release for the sun/sky rebuild follow-through and a PC-only lab route
for Pixel Forge v2 octahedral tree impostors.

### Added

- Lab-only WebGPU octahedral tree-impostor route behind
  `?renderer=webgpu&konveyorNativeTreeImpostors=octahedral`.
- Additive Pixel Forge v2 octahedral sidecars for `tree1` and `tree2`, staged
  beside the existing v1 tree assets without changing production defaults.
- Runtime summaries now report tree-impostor sidecar layout/version so proof
  captures can distinguish v1 `latlon` / `hemi-y` from v2 `octahedral`.

### Changed

- Water glint now receives the atmosphere frame sun color each update; WebGL
  routes it through `uSunColor`, and WebGPU routes it through a live node
  uniform.
- Cloud highlight/rim chroma now comes from the atmosphere-provided sun color
  instead of separate amber literals.
- The visible sun disc was tuned to read as an actual small sun in gameplay
  captures, not just a brighter sky patch at the sun location.
- Cycle 39 sun ownership is preserved: the billboard owns the disc, while the
  sky shader owns the broad aureole and horizon glow.

### Validation

- Cycle 39 final gameplay baseline:
  `cycle39-validation/screenshots/phase5-painterly-final/` locally contains
  the 12-PNG matrix.
- Cycle 40 desktop WebGPU sun/water/cloud matrix:
  `cycle40-validation/screenshots/sun-water-cloud-matrix/`.
- Octahedral lab proof:
  `cycle40-validation/runtime/octahedral-tree-lab-proof.json` locally records
  nonblank renders, zero fatal page errors, active v2 sidecars, tile variation
  across camera poses, and no production default switch.
- `npm run build` - clean, main bundle stayed within the existing `mainKB=592`
  ratchet.
- `npm test` - 54 passed files, 1 skipped; 498 passed specs, 7 skipped.
- `npm run lint` - clean.

### Notes

- Android/iOS proof is deferred by Cycle 40 instruction.
- Octahedral tree impostors are lab-only in this release; the current v1
  `latlon` / `hemi-y` sidecars remain the production contract.

## [2.1.7] - 2026-05-20 (Cycle 38 - WebGPU visual recovery)

Patch release covering the first-principles WebGPU visual repair after
review of the v2.1.6 tree-placement build showed darkened grass contact,
unreadable sun, sheep wool reading as a flat body, and out-of-sync sun glint
on water. Pairs with a minor zen-UI cleanup on the start-screen sandbox
pickers.

### Fixed

- WebGPU grass contact now has shadow-disabled geometry-deformation
  evidence. Dog contact changes 0.961% of the test crop and sheep contact
  0.992%; grass coordinate source is
  `instanceWorldOffset-instanced-attribute` with
  `overlapMode=dominant-contact-capped-vector` and `maxDisplacement=0.95`.
- WebGPU sheep gait fixed via fixed-phase constrained leg motion. Wool now
  reads as wool on the body silhouette without corrupting non-body colors.
- Sun/atmosphere ownership split: the sky owns broad glow + horizon warmth;
  `SunBillboard` owns the readable disc + near halo. Sun clipped-white
  percentages: Field 0.059, Rolling Hills 0.059, Open Country 0.1443.
- Open Country `golden-hour` preset retuned lower to stop the over-bright
  sky/atmosphere read at horizon poses.

### Changed

- Sandbox-setup decorative emojis removed from `FieldConfig` custom shape
  entry and the three `SCENE_OPTIONS` scene buttons (pencil + sheaf-of-rice
  + water-wave + evergreen). Aligns the start screen with the "no
  decorative emojis in zen UI" rule already applied to PlayerIdentitySetup.
  Functional UI glyphs (language flags, settings tab symbols, fence-editor
  tool palette) intentionally untouched.

### Validation

- Desktop installed-Chrome WebGPU visual recovery proof:
  `cycle38-validation/runtime/desktop-webgpu-visual-recovery-proof.json`
  (`ok=true` across sun, sheep, water, and tree-occluded regressions).
- Grass interaction evidence:
  `cycle38-validation/runtime/desktop-webgpu-grass-interaction-evidence.json`.
- First-principles spike rationale:
  `docs/archive/research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md`.
- `npm test` - 476 passed / 7 skipped.
- `npm run lint` - clean.
- `npm run build` - clean.
- Targeted Chromium e2e smoke - 2 specs passed.

### Notes

- Phone (Android + iOS) validation for the WebGPU visual recovery is
  deferred to Cycle 38 mobile-readiness closeout; the desktop proof above is
  not Android or iOS acceptance evidence.
- Water grid/alignment lines + sticky sun-glint sync on PC remain open
  Cycle 38 follow-ups.

## [2.1.6] - 2026-05-16 (Cycle 38 - tree placement readability)

Patch release for the Cycle 38 tree layout after review showed clumped,
undersized trees in WebGPU/mobile captures.

### Changed

- Tree placement now applies deterministic cross-zone canopy spacing after the
  seeded candidate pass, so nested near/mid/far/horizon zones no longer stack
  multiple trees on the same spot.
- Tightened per-scene tree scale jitter floors so the remaining trees read as
  production trees instead of small saplings.

### Validation

- `npm run probe:tree-placement` - zero canopy-overlap pairs in Field, Rolling
  Hills, and Open Country.
- Desktop installed-Chrome WebGPU tree-occluded screenshot proof:
  `cycle38-validation/runtime/desktop-webgpu-tree-placement-after.json`.
- `npm test` - 472 passed / 7 skipped.
- `npm run lint`
- `npm run build` - clean production build, main bundle ratchet intentionally
  accepted at `591 KiB`.

## [2.1.5] - 2026-05-16 (Cycle 38 - WebGPU tree-impostor packet)

Renderer and vegetation release packet for the Konveyor WebGPU track. This
keeps WebGPU progressive with WebGL fallback, ships the Cycle 38 tree evidence
and tooling, and keeps the Android WebGPU matrix honest as over budget.

### Added

- Explicit Cycle 38 WebGPU tree route behind
  `?konveyorNativeTreeImpostors=1`, with close native LOD0, mid
  branch-preserving native LOD1, and far lat/lon-hemi Kiln impostor quads.
- Dynamic WebGPU impostor tile plumbing and executable lab proof via
  `npm run probe:webgpu-impostor-lab`.
- Render-cost reporting, Android WebGPU perf harnesses, dog-sprint camera
  harnesses, and Cycle 38 desktop/Android screenshot matrices under
  `cycle38-validation/`.

### Changed

- Rebuilt tree LOD assets to preserve branch structure in the mid tier instead
  of leaving detached-looking foliage at gameplay camera distances.
- Tuned WebGPU foliage, grass, terrain, sheep, and water material adapters for
  the Cycle 38 proof packet.
- Updated repo-facing docs, README, and release checklist to describe
  progressive WebGPU, the opt-in tree route, and the remaining Android budget
  blocker without calling the mobile path ready.

### Fixed

- WebGPU Kiln impostors no longer read as black/no-texture quads; the node
  material now has a foliage lighting floor and ambient tint clamp so atlas
  color survives runtime relighting.
- Mobile tree routing no longer treats the broken all-distance impostor read as
  production default behavior.

### Validation

- `npm test` - 469 passed / 7 skipped.
- `npm run build` - clean production build, main chunk within ratchet.
- Desktop installed-Chrome WebGPU three-tier tree matrix:
  `cycle38-validation/runtime/desktop-webgpu-tree-impostors-three-tier-matrix.json`.
- Connected Android WebGPU three-tier tight matrix:
  `cycle38-validation/runtime/android-webgpu-tree-impostors-three-tier-tight-matrix.json`.

### Notes

- Android WebGPU remains budget-red in the full Cycle 38 pose matrix. This is
  not a mobile-ready release claim.
- True octahedral tree impostors remain future work; the shipped route is
  lat/lon-hemi impostor plumbing plus native close/mid geometry containment.

## [2.1.4] - 2026-05-10 (Cycle 32 - Apple platform water validation)

Player-visible fix for iPhone Safari water rendering. Rolling Hills and Open
Country water no longer depend on a per-frame depth pre-pass that could collapse
into a solid foam-white surface on Apple/WebGL paths.

### Added

- BrowserStack Automate real-device water canary:
  `npm run test:ios-water` drives Safari on `iPhone 15 Pro Max / iOS 17`,
  starts Rolling Hills Solo Classic, captures `ios-water.png`, writes
  `ios-water-sample.json`, and fails if sampled water pixels are near
  `#eaf6ff`.
- Manual GitHub workflow `.github/workflows/browserstack-ios-water.yml` for the
  same canary. It stays `workflow_dispatch` while the BrowserStack account is on
  the free proof tier.
- Water shoreline unit tests covering foam at the shoreline, non-foam water past
  the foam band, and deep-water color trend.
- `glProbe` water sampling under `?debug=gl` via
  `window.__sdsDiag.waterSample` / `waterSamples[]`.

### Changed

- `AnimeWater` now derives shoreline foam and shallow/deep color from the
  scene's circular `boundary` and `boundary.falloff`, not screen depth.
- WebGL extension smoke now checks the actual remaining water requirement
  (`OES_texture_float_linear`) instead of depth-pre-pass-only float render-target
  assumptions.
- Cross-platform testing docs now treat real iOS Safari as the water-regression
  gate; Playwright WebKit remains useful but is not a real-device substitute.

### Removed

- `js/water/DepthPrePass.js` and the SceneManager render-loop depth pre-pass.
  Water no longer samples `uDepthTex`, `uResolution`, `uCameraNear`, or
  `uCameraFar`.

### Validation

- `npm test` - 300 passed / 7 skipped.
- `npm run build` - clean production build.
- `npm run test:e2e -- --project=chromium --grep-invert @local-only` - 6 passed.
- `IOS_WATER_BASE_URL=https://sheepdogsim.com npm run test:ios-water` - passed
  on BrowserStack iPhone 15 Pro Max / iOS 17 / Safari with sampled average
  RGB `[26, 44, 11]`, `nearFoamWhite: false`.

### Notes

- BrowserStack Local on this Windows workstation hit an `EBUSY` lock opening
  `C:\Users\Mattm\.browserstack\BrowserStackLocal.exe`. Public URL mode works
  cleanly; use the GitHub workflow / Linux runner for the next local-build
  tunnel proof before paying for an Automate plan.
- No shared deterministic sim files or sim-baseline goldens changed.

## [2.1.3] - 2026-05-09 (Cycle 31 - public-surface)

Public-facing surface pass. The site is the same game; the search-engine
and discoverability surface around it is now real.

### Added

- Three per-scene landing pages: [`/scenes/home-field.html`](public/scenes/home-field.html),
  [`/scenes/rolling-hills.html`](public/scenes/rolling-hills.html),
  [`/scenes/open-country.html`](public/scenes/open-country.html).
  Plain HTML, scene-scoped JSON-LD VideoGame schema, "Play this scene"
  CTAs that hand the user back into the SPA on the right scene.
- Devlog scaffold at [`/devlog/`](public/devlog/) + two seed entries
  written in player voice (Cycle 30 + Cycle 29 close summaries).
  Each entry has its own JSON-LD `Article` schema.
- Visible bottom-center footer on the homepage with internal links to
  About / Scenes / Devlog / Source / Press kit. Hidden on mobile to
  avoid competing with the joystick.
- `<main id="seo-content">` crawler-content block in `index.html`,
  visually hidden via standard sr-only clip pattern. Gives crawlers
  real semantic body content so the Google snippet stops substituting
  the welcome modal text.
- `<noscript>` fallback block with prose + about/source links.

### Changed

- Sitemap moved from repo root to [`public/sitemap.xml`](public/sitemap.xml)
  so Vite copies it into `dist/`. Production was previously serving
  the SPA shell with `Content-Type: text/html` for `/sitemap.xml`
  because the file never reached the deployed bundle. Sitemap also
  expanded from 2 → 8 URLs (homepage + about + 3 scenes + devlog index
  + 2 entries), all `lastmod`'d to 2026-05-09.
- GitHub repository topics: dropped `durable-objects` (subsumed by
  `cloudflare-workers`) and `messagepack` (internal protocol detail);
  added `multiplayer` and `simulation` for higher discoverability.

### Removed

- 18-language `<meta name="keywords">` stuffing. Google ignores meta
  keywords entirely; the multilingual cram looked low-quality in
  view-source. Keyword discovery flows through the JSON-LD schemas +
  the new crawler-content block.

### Notes

- Internal: `js/components/index.js` modal-mount defer was deliberately
  NOT touched. The original Cycle 31 plan proposed wrapping the React
  mount in `requestIdleCallback`, but that path was tried in Cycle 27
  and abandoned because Chromium starves idle callbacks during WebGL
  boot. The current `setTimeout(0)` defer is the working pattern;
  the new `<main>` crawler block carries the SEO load on its own.

### Post-deploy hotfixes (same day, after Search Console crawl surfaced two issues)

- **JSON-LD trailing comma** - pre-existing syntax error in the `WebApplication`
  block of `index.html` (a stray `,` after the `offers` object's closing brace).
  Strict JSON parsers reject it; Google's structured-data parser does the same.
  Surfaced by Search Console as "Unparsable structured data - Parsing error:
  Missing '}' or object member name." Fix in commit
  [`0c0d618`](https://github.com/matthew-kissinger/sds/commit/0c0d618). Also
  verified all 5 new JSON-LD blocks shipped this cycle (3 scenes + 2 devlog
  entries) parse cleanly.

- **Canonical-URL alignment with Cloudflare Pages's `.html`-stripping behaviour** -
  Pages auto-strips `.html` extensions and 308-redirects every `.html` URL to its
  no-extension canonical form. The cycle shipped every canonical / og:url /
  JSON-LD `@id` / sitemap entry / internal anchor pointing at the `.html` form
  → mismatch with the actually-served URL → Search Console would have flagged
  the mismatch on every per-scene + devlog page once it crawled them. Fixed
  before the bad URLs got indexed. Files updated: `public/sitemap.xml` (6 URL
  rewrites), `index.html` + `about.html` (canonical + internal links),
  `public/scenes/*.html` ×3 + `public/devlog/*.html` ×3 (canonical + og:url +
  JSON-LD `@id` + cross-links). Fix in commit
  [`64506ac`](https://github.com/matthew-kissinger/sds/commit/64506ac).

### Public-surface follow-ups (also same day)

- **`/llms.txt`** added at `public/llms.txt` - emerging convention for LLM/AI
  crawlers (Claude, GPT, Gemini, Perplexity). Curated Markdown manifest of
  load-bearing URLs with prose summaries. Per CF AI Crawl Control, ClaudeBot is
  already crawling sheepdogsim.com (15 successful requests / 737 KB transferred);
  this gives it a curated index instead of crawl-discovery.

- **`/.well-known/security.txt`** added per RFC 9116. Cloudflare Security
  Overview surfaced this as a low-severity recommendation. Points security
  researchers at the existing `SECURITY.md` policy. Both in commit
  [`f0a8822`](https://github.com/matthew-kissinger/sds/commit/f0a8822).

- **Cloudflare dashboard changes** (out-of-band, not in this repo): enabled
  Crawler Hints (auto-IndexNow on content changes), Always Online (Wayback
  fallback), 0-RTT Connection Resumption, Speed Brain (predictive prefetch via
  Speculation Rules API), Cloudflare Fonts (proxied Google Fonts), Early Hints
  (HTTP 103). Verified-good (no change needed): SSL/TLS Full, HTTP/2 + HTTP/3,
  no AI bots blocked, Bot Fight Mode off (intentional - would break MP
  WebSocket upgrades), AI Labyrinth off (intentional - we want AI training).

### Search Console actions (same day)

- Submitted the new sitemap. Status flipped from "Couldn't fetch" → **Success**
  with **8 discovered pages**.
- "Validate fix" triggered on the structured-data error → Google queued recrawl;
  email confirmation pending.
- "Request indexing" submitted for all 8 URLs (homepage + about + 3 scenes +
  devlog index + 2 entries). All accepted into the priority crawl queue.

## [2.1.2] — 2026-05-08 (Cycle 26 — itch.io heightfield fix attempt — INCOMPLETE)

> **Note added 2026-05-08 post-deploy:** Matt's verification on the live
> itch deploy showed the visible symptom (dark-blue mid-distance terrain
> band on Rolling Hills + Open Country) is **still present** after the
> .bin rename. The .bin file serves correctly on sheepdogsim.com and the
> rename did dodge the original `.r32f` 403, but the bug isn't resolved.
> See [`NEXT_SESSION.md`](NEXT_SESSION.md) "Known issues" for the
> follow-up investigation paths. Leaving v2.1.2 shipped because it's a
> sensible incremental change either way (some CDN somewhere is fussy
> about `.r32f`); just doesn't close the user-visible bug yet.



Bug fix: heightfield files were failing to load on itch.io's HTML5 host
(`html-classic.itch.zone`) with a 403 because `.r32f` is not on their
allowed-extension list. The game fell back to flat terrain while the
water plane stayed at `y=-0.05`, so the AnimeWater shader rendered over
the now-flat terrain wherever the camera saw past the bounded scene
disc — the visible symptom was a saturated dark-blue band of "terrain"
in mid-distance on Rolling Hills + Open Country. sheepdogsim.com served
the file fine; only the itch deploy was broken.

### Changed
- Renamed binary heightfield files from `.r32f` → `.bin` (file format is
  unchanged — still raw R32F floats — only the extension differs):
  - `public/terrain/{field,rolling-hills,open-country}.r32f` → `.bin`
  - `public/terrain/{field,rolling-hills,open-country}.r32f.json` → `.bin.json`
- Updated `heightmapUrl` in `shared/scenes/rolling-hills.js` and
  `shared/scenes/open-country.js` to point at the new `.bin` paths.
- Updated `npm run bake-heightmaps` script in `package.json` and the
  bake-script docstring in `scripts/bake-heightmap.mjs` to default to
  `.bin` output.
- Doc note in `shared/terrain/Heightfield.js` clarifying the extension
  history + reason.

### Validation
- vitest still 201/201.
- sheepdogsim.com loads the renamed file correctly (CF Pages serves any
  extension).
- itch.io console no longer 403s on heightfield fetch.

## [2.1.1] — 2026-05-08 (Cycle 26 — OG card refresh)

Patch ship: refreshes 2 of 3 social-card images with v2.1.0-era captures
so shared links on Twitter / Facebook / Slack / Discord show the current
art (post-Mac-fix tone mapping, post-Cycle-25 foliage density, post-v2.1.0
per-scene SEO wiring). Open-country card retained from prior cycle.

### Changed
- `assets/marketing/og/og-rh-sunset.webp` — refreshed. New shot: behind-Jep
  cliff overlook on Rolling Hills at dusk (`sun=0.06`), tree framing left,
  flock dispersed along the cliff edge, sun cresting horizon over the
  water. **117 KB** (was 181 KB, -35%). 1200×630.
- `assets/marketing/og/og-field.webp` — refreshed. New shot: behind-Jep
  on Home Field at noon (`sun=0.50`), fence on the left, farmhouse +
  trees mid-frame, ~3000-sheep flock arcing around the dog. **192 KB**.
  1200×630.
- `og-open-country.webp` left untouched — capture session ran out of
  patience, existing Cycle 19 art still serves the deeplink correctly.

### Added
- `public/_headers` — Cloudflare Pages directive setting `Cache-Control:
  public, max-age=300, must-revalidate` on `/assets/marketing/og/*`. Five
  minute edge TTL so future OG refreshes propagate fast (social scrapers
  cache independently — they need explicit re-scrape via
  Twitter/Facebook validators).
- `assets/marketing/captures/cycle26/raw/` — 1920×1080 source PNGs for
  the new cards, kept for re-cropping or alt-aspect derivation.

### Validation
- vitest 201/201 (SEO existence specs still green).
- File sizes within OG-friendly ranges (Twitter 5MB cap, Facebook 8MB).
- OG metadata already pointed at these filenames in
  [`index.html`](index.html) + [`js/utils/seo.js`](js/utils/seo.js) — no
  code changes required, byte-level swap only.

### Post-deploy steps (do not skip)
- **Cloudflare cache purge** — `wrangler pages deployments list
  --project-name=sheepdogsim` then purge OG paths via CF dashboard, OR
  rely on the new 5-min `_headers` TTL to roll forward naturally.
- **Twitter Card Validator** — paste `https://sheepdogsim.com/?scene=field`
  + `?scene=rolling-hills` at https://cards-dev.twitter.com/validator and
  click "Preview card" so Twitter re-scrapes.
- **Facebook Sharing Debugger** — paste same URLs at
  https://developers.facebook.com/tools/debug/ and click "Scrape Again".

## [2.1.0] — 2026-05-08 (Cycle 26 — Practice Paddock + per-scene SEO)

First Cycle-26 minor release: pivots away from world-rendering tech and
toward the player-facing layer. Two slices bundled:

### Added
- **Practice Paddock — "Just Play" mode.** New no-pressure entry tile,
  position 0 in the mode picker (before Classic). 30 sheep, no timer
  pressure, no leaderboard submission, no fail state. Cyan-500 accent
  (`#06b6d4`) — distinct from Classic's emerald. Picks up the
  fourth-tile slot the cycle plan called out as the headline.
- **First-visit pulsing-glow on the Practice tile.** Subtle cyan
  box-shadow keyframe (`practicePulse`, 2.4s ease-in-out infinite) wraps
  the Practice MenuOption when `localStorage.getItem('sds.has-played')`
  is unset. Zero layout shift, zero new strings, points new players
  exactly where to start. Pulse stops the moment the player launches
  any solo run (any mode sets the flag).
- **PracticeHint overlay.** Bottom-center fade-in shown only in
  Practice mode (mounted in `js/components/App.js` HUD). Auto-dismisses
  after 8s OR on first keyboard / pointer / touch input — whichever
  comes first. Self-unmounts after fade-out. Text reflects actual
  controls: "WASD or arrow keys to move · Shift to sprint" (the cycle
  plan's "S to whistle" wording was speculative — no whistle mechanic
  exists in this codebase).
- **Per-scene SEO metadata.** New
  [`js/utils/seo.js`](js/utils/seo.js): `updateSceneMetadata(sceneId)`
  updates `document.title`, `og:title`, `og:description`, `og:image`,
  `og:image:alt`, `twitter:title`, `twitter:description`,
  `twitter:image`, `twitter:image:alt`, and `meta[name=description]`
  using the per-scene `name` + `description` from `shared/scenes/*.js`
  and the existing `og-{field|rh-sunset|open-country}.webp` cards
  under `assets/marketing/og/`. Wired into `main.js` initial scene
  load AND scene-swap path. Canonical URL stays `/` (SPA — no sitemap
  fragmentation).

### Changed
- `js/GameState.js` `SOLO_MODE_SHEEP_COUNT` adds `practice: 30`.
- `js/GameState.js` `submitScoreToLeaderboard` blocks practice mode
  alongside the existing sandbox guard.
- `js/main.js` `showCompletionOverlay` skips score submission when
  `singlePlayerMode === 'practice'`.

### Validation
- vitest 201/201 (was 188; +8 practice-mode contract specs +5
  SEO-meta specs).
- build clean — 835.48 KB main / 250.04 KB gzip (+0.69 KB main /
  +0.18 KB gzip vs v2.0.5).
- Tile order, accent color, localStorage key shape all locked by
  contract tests in `tests/practice-mode.spec.js`.
- Per-scene OG-image existence locked by contract test in
  `tests/seo.spec.js`.

### Notes
- Phase 3 visual design pass deferred per cycle plan (taste calls land
  wrong without sync).
- Lighthouse audit pending post-deploy.
- Visual design pass + community kickoff sequenced after media-session
  shoot.

## [2.0.5] — 2026-05-07 (post-v2.0.4 patch — delete dead AtmosphericDesatPatch)

`AtmosphericDesatPatch` was scheduled for deletion in
[`docs/archive/polish-program.md`](docs/archive/polish-program.md) but only got
neutralized in Cycle 25 Phase B (`uDesatStrength` forced to 0). The
pitch ramp at `js/TerrainBuilder.js` was multiplying the per-frame
strength by `_desatConfiguredStrength = 0` — net behavior identical to
"the patch isn't there." Mobile-low LOD1 + the kiln impostor received
the same zeroed uniforms, so all three tiers were paying for dead code.

### Removed
- **`js/shaders/AtmosphericDesatPatch.js`** — entire 127-line module
  deleted. Was a no-op since v2.0.0.
- **`js/TerrainBuilder.js`** desat plumbing: `_desat` uniform block,
  `_desatConfiguredStrength`, `_desatHighPitchFloor`, the per-frame
  pitch math, the kiln-impostor uniform sync, the `patchMaterialDesat`
  call in `_patchTreeWindMaterial`, the orphaned `smoothstep01` helper,
  and the import line.
- **`js/kiln-impostor-material.js`** desat shader path: three uniform
  declarations, the fragment-shader desat math, three default uniform
  values. Material gets simpler; no behavior change (the math
  multiplied by zero).

### Validation
- vitest 188/188.
- build clean — **834.79 KB main / 249.86 KB gzip** (-2.64 KB main /
  -0.48 KB gzip vs v2.0.4).
- Spot-checked Field + Rolling Hills + Open Country in `npm run dev`:
  no visual change at horizon-level OR overhead camera (the patch was
  doing nothing on desktop, exactly as expected).

## [2.0.4] — 2026-05-07 (post-v2.0.3 patch — extend Apple tone-mapping branch to iOS)

iPhone playtest surfaced a bright-white sheen layered over the water
surface on Field / RH / OC. Same Metal-ANGLE + extended-sRGB pipeline
underneath WebKit as macOS, but the v2.0.3 platform branch only
matched `/Mac/` — and `navigator.platform === 'iPhone'` doesn't.
iPhone was running ACES Filmic, the same curve that washed the Mac.

### Fixed
- **iPhone water sheen at gameplay start.** Extend the Apple-platform
  detection in [`js/SceneManager.js`](js/SceneManager.js) from `/Mac/`
  to `/Mac|iPhone|iPad|iPod/`. iPhone + iPad now get
  `THREE.NeutralToneMapping` like macOS does, eliminating the wash on
  the water's foam, sun-glint, and sparkle terms. Non-Apple platforms
  (Windows / Linux / Android) unchanged.

### Notes
- iPad on iOS 13+ in desktop-site mode reports `navigator.platform`
  as `MacIntel`, so it was already covered by v2.0.3's `/Mac/` branch.
  The new regex covers iPad in mobile-site mode too (belt and braces).
- AnimeWater bypasses the tonemap pipeline entirely (writes
  `gl_FragColor` raw, no `<tonemapping_fragment>` chunk). If the
  Neutral curve isn't enough on iPhone, the structural fix is to plumb
  AnimeWater through the same pipeline — tracked as v2.0.5 contingent
  on Matt's iPhone verification.
- `?tonemap=neutral` URL override already provided per-device A/B
  diagnostic before this patch shipped.

### Validation
- vitest 188/188.
- build clean — 837.43 KB main / 250.34 KB gzip (flat with v2.0.3).

## [2.0.3] — 2026-05-07 (post-v2.0.2 patch — Mac white-hue fix)

Mac users (M-series + recent macOS, all browsers) reported that
loading a scene showed grass-green correctly, then a white hue was
layered over the whole frame as gameplay started. Symptom shape was
the fogged-horizon ACES wash, not the cycle-12 white-terrain class
documented in `docs/archive/research/mac-bug-research.md`.

### Fixed
- **Mac scenes washed white at gameplay start.** ACES Filmic tone
  mapping pushes cool blues — the sky-blue `0x87CEEB` fog color used
  by every scene — toward white on macOS Metal-ANGLE + extended-sRGB
  display output. Once cycle-25-B raised fog far to 900m and
  neutralized `AtmosphericDesatPatch`, distant terrain blended fully
  toward fog color and the camera framing pulled the wash into ~80%
  of vertical pixels once gameplay started. Now: Mac platforms (any
  macOS, all browsers since they all use Metal-ANGLE) get
  `THREE.NeutralToneMapping` (Khronos PBR Neutral, r162+) which
  preserves color identity through the same dynamic range. Non-Mac
  platforms (Windows / Linux / mobile) keep ACES Filmic exactly as
  before.

### Added
- **`?tonemap=aces|neutral|linear|none` URL override** for A/B
  testing. Forces or bypasses the platform branch without a rebuild.
- **`[TONEMAP] platform — curve` console log** at SceneManager init
  so the active tone mapping is visible for diagnosis on any device.

### Validation
- vitest 188/188.
- build clean — 837.40 KB main / 250.33 KB gzip (+0.6 KB for the
  platform-detect logic and override parsing).

## [2.0.2] — 2026-05-06 (post-v2.0.1 patch — closer zoom-in + zoom-bar fix + scene-picker rev2)

### Fixed
- **Mobile zoom bar didn't track the active camera mode.**
  `MobileControls` had a hardcoded 20-150 percentage formula and
  20-150 clamp on its onZoom handler — fine for Classic, broken for
  Follow's 6-45 / Free's 10-70 ranges (the bar saturated at the top
  before the rig hit its actual minimum). Now reads
  `cameraController.getZoomState()` per requestAnimationFrame so the
  bar fill, the clamp, and the step-size all match the active mode's
  range exactly.
- **Follow + Free zoom-in floor too high.** Players couldn't get
  close to the dog. Floors lowered:
    Follow:  desktop 12 → 6, mobile 18 → 10
    Free:    desktop 15 → 10, mobile 24 → 14
  Max distances raised slightly so the cinematic-pull-out range
  doesn't feel cramped:
    Follow:  40 → 45
    Free:    60 → 70

### Changed
- **ScenePicker collapsed to a single hero card.** The 3-card grid in
  v2.0.1 was just bigger 3-button-strip energy. Single component now:
  one hero card, prev/next chevrons inside, dot indicators below,
  arrow-key flip, touch-swipe (40px threshold or fast flick),
  cross-fade between scenes, slide-in on direction. Tap the body to
  load when the visible scene differs from the active one; "Current"
  pill replaces the "Tap to load" hint when active.

### Validation
- vitest 188/188.
- build clean — 836.98 KB main / 250.20 KB gzip (≈ flat vs v2.0.1).

## [2.0.1] — 2026-05-06 (post-v2.0.0 patch — camera + scene picker)

User-reported regressions on the v2.0.0 deploy + scene-picker UX
upgrade.

### Fixed
- **Follow / Free wheel + pinch zoom did nothing.** Pre-Phase-E both
  modes used a hardcoded `FOLLOW_DISTANCE = 22` const for the rig
  distance and ignored `this.distance`. Phase E's per-mode zoom
  ranges + setZoom only updated `this.distance`, so the wheel still
  did nothing visually — but the FOV pull-back ramp DID read
  `this.distance`, ramping FOV 50°→38° on Follow which read as a
  major scale + angle shift. Both `_updateFollow` and `_updateFree`
  now read `this.distance` for the rig distance (with mild height
  scaling so zoom-out doesn't fly the camera flat into the ground)
  and the FOV pull-back has been removed from Follow entirely.
  Sprint dolly-zoom (+2°, 0.4s ease) is retained.
- **Mobile Follow zoom floor too tight.** Phase E set the mobile
  floor at 35 across all modes, but Follow defaults to 22 — the
  mobile floor was clamping Follow zoom to 35 minimum and Free zoom
  to 35 minimum. Mobile floors relaxed: Follow 18, Free 24, Classic
  35 (legacy classic floor preserved).

### Changed
- **Default scene shifted from Home Field to Sheep Dog Island**
  (formerly "Rolling Hills"). The new landing-page scene is the
  island-with-corral that players can also see in MP rooms;
  Home Field stays in the registry as the legacy classic.
  `DEFAULT_SCENE_ID` in `shared/scenes/index.js` updated; sim-baseline
  harness pinned to `sceneId: 'field'` so its gated-pasture fixtures
  stay byte-identical.
- **Rolling Hills renamed to Sheep Dog Island.** Display name only —
  scene id stays `rolling-hills` so existing invite links and
  bookmarks continue to resolve. Description rewritten to lead with
  the island identity.
- **ScenePicker rewritten as a scene-postcard row.** Three hero
  cards (Sheep Dog Island first, then Open Country, then Home Field)
  with scene-specific gradients, custom SVG silhouettes (island /
  mountain ring / farmhouse), NEW badges on Sheep Dog Island + Open
  Country, "Current" pill on the active scene, "Choose your home"
  uppercase header. Single-column stack on mobile, 3-up grid on
  desktop. Replaces the 3-button strip that visually clashed with
  ModeSelection's button grid.

### Validation
- vitest 188/188 (sim-baseline byte-identical thanks to harness pin).
- build clean — 836.86 KB main / 250.17 KB gzip (+0.94 KB vs v2.0.0
  for the new ScenePicker chrome — gradients, SVG silhouettes,
  per-scene metadata).

## [2.0.0] — 2026-05-06 (Cycle 25 — polish-mega-cycle)

The polish-program landing. Eight phases across `meta-cycle-overnight-2026-05-06`,
shipped end-to-end via the meta-cycle execution policy. Builds on
v1.5.0's MP regression coverage; ships the LOD truth, atmospheric
foundation, impostor LOC reduction, camera cinematics, per-scene tree
profiles, and skeleton-loading start-screen polish that the polish
program promised.

User-visible diff at v2.0.0:
- **Trees no longer pop at 80m** on desktop. The LOD seam was the
  thesis target; with med/high tier dropping LOD1 entirely and the
  alphaHash crossfade band at 180-200m, the silhouette holds out to
  the impostor takeover.
- **Distant trees no longer wash to fog-grey.** AtmosphericDesatPatch
  is neutralised; per-scene fog lifted to "horizon haze only"
  (near 220→350, far 700-800→900).
- **Camera reads more cinematic.** Per-mode zoom (Follow 12-40, Free
  15-60, Classic 20-150) persists across sessions. Follow-cam zoom-out
  ramps FOV 50°→38° for slight tele compression. Sprint adds a +2°
  FOV pulse with 0.4s ease — sprint state-changes feel intentional.
- **Scenes feel more distinct.** Per-scene tree distribution profiles
  (Field=70/30 tight English-pasture, OC=40/60 wild-PNW with wider
  scale jitter) layered on top of v1.4.0's per-scene fog colours.
- **Scene swap reads as designed.** Shimmer-skeleton overlay replaces
  the single-spinner pattern.

### Added
- **`tools/validation/`** — durable validation harness for the polish
  program. Four tools: `lod-compare.mjs`, `screenshot-golden.mjs`,
  `input-latency.mjs`, `frame-time-histogram.mjs`. NPM scripts.
- **`HardwareTier`** extensions — `usesLod1ForFoliage` +
  `lod0CrossfadeBand` per tier preset.
- **Per-mode camera zoom + persistence** — `localStorage.sds.cameraZoom.<mode>`.
  Range applies on mode change. Mobile floor 35.
- **`_updateFovCinematics`** — per-frame FOV composer reading sprint
  state through `update(opts)`. Pull-back ramp + dolly-zoom ease.
- **`HeightFogPatch.js` foundation** — exponential-density height-fog
  shader patch. Foundation only; activation across all materials
  deferred (each material's parity needs visual review).
- **`scene.treeProfile` + `scene.treeScaleJitter`** — per-scene tree
  distribution + size-jitter overrides on `SceneDef`.
- **Shimmer-skeleton scene-swap overlay** — designed-loading-state
  pattern replaces the single spinner.

### Changed
- **Tree LOD chain on desktop med/high:** LOD0 0-200m, impostor 200m+.
  Mobile-low keeps the legacy 3-tier chain.
- **`AtmosphericDesatPatch`** neutralised (`uDesatStrength` and
  `_desatConfiguredStrength` forced to 0). File kept on disk for
  back-compat with the kiln impostor + mobile-low LOD1 path.
- **Per-scene fog** — Field/RH/OC retuned `near 220→350, far 700-800→900`.
- **Per-scene tree profiles** — Field 70/30 (jitter 0.85-1.15), RH
  50/50 (default jitter), OC 40/60 (jitter 0.75-1.30).

### Removed
- **`uMatchBoost` calibration plumbing (~120 LOC)** —
  `js/kiln-impostor-material.js` shader uniform + multiplier line +
  uniforms entry; `TerrainBuilder.setImpostorCalibrationLUT` + apply
  loop; `main.js` LUT fetch + bind; `tools/generate-impostor-lut.mjs`
  generator; `assets/impostor-calibration-lut.json` runtime asset.
  Phase B's LOD-seam dissolution removed the structural reason for
  per-(scene, species) calibration.

### Deferred to Cycle 26+
- **Aerial-perspective LUT** (32×32×32 R11G11B10F precomputed
  scattering) — multi-day work; HeightFogPatch.js is the practical
  core, the LUT will layer on top later as a relighting input.
- **8×4 impostor atlas re-bake + padded mips + hybrid trunk-mesh** —
  Pixel Forge multi-hour bake + visual review; existing 4×4 atlas
  stays.
- **Full camera state-machine collapse** (single `_update*` →
  state-machine driven). Game-feel-critical refactor; the additive
  cinematics shipped close most of the user-visible gap.
- **Start screen flow restructure** (Mode → Scene → Dog reorder +
  hero-art ScenePicker + live WebGL DogSelection inset + cinematic
  orbits + tutorial overlay) — multi-day React refactor.
- **6 fresh tree variants** (deciduous-small/medium/large + birch +
  conifer-reintro + fall-color) — recipe iteration + 6 fresh bakes
  + 6 impostor re-bakes (~16-24hr).

### Validation
- vitest 188/188 pass.
- Production build clean.
- Sim-baseline byte-identical (no `shared/MovementPhysics.js` change).
- `tools/validation/lod-compare.mjs` baseline captured at
  `cycle25-validation/phaseA/lod-baseline-field.json`.
- All MP e2e specs (19 total) green on chromium-mp.

## [2.0.0-rc.1] — 2026-05-06 (Cycle 25 partial — meta-cycle overnight)

Release candidate. Partial mega-Cycle 25 — autonomous overnight run on
branch `meta-cycle-overnight-2026-05-06`. Three phases shipped (A, B,
E-minimal), four phases parked with `cycle25-validation/phase{C,D,F,G}/HARDSTOP.md`
each. **Not pushed to origin or production**; gated on Matt's morning
review per [`docs/archive/research/meta-cycle-execution.md`](docs/archive/research/meta-cycle-execution.md).

See [`docs/archive/wake-states/wake-state-2026-05-06.md`](docs/archive/wake-states/wake-state-2026-05-06.md) for
the full wake-state report enumerating shipped/parked/recommended-next.

### Added
- **`tools/validation/`** — durable validation harness for the polish
  program. Four tools: `lod-compare.mjs` (silhouette IoU + dE2000 +
  luma delta), `screenshot-golden.mjs` (12-cell SSIM matrix with
  --capture/--diff/--baseline modes), `input-latency.mjs`
  (synthesised keypress → next-paint), `frame-time-histogram.mjs`
  (drives `__perfHarness.startSampling`). NPM scripts
  `validation:lod / :screenshots / :latency / :perf / :all`.
- **HardwareTier extensions** — `usesLod1ForFoliage` + `lod0CrossfadeBand`
  per tier preset. Mobile-low keeps the meshopt LOD1 chain (perf
  headroom); desktop med/high drops it (silhouette truth).
- **Per-mode camera zoom + persistence** — Follow 12-40, Free 15-60,
  Classic 20-150 (mobile floor 35). `localStorage.sds.cameraZoom.<mode>`
  persists the per-mode value across sessions. Active range applies
  on mode change.

### Changed
- **Tree LOD chain** on desktop med/high tiers: LOD0 0-200m, impostor
  200m+. The 80m LOD1 mid-band is gone. Mobile-low keeps the existing
  3-tier chain.
- **`AtmosphericDesatPatch`** neutralised: `uDesatStrength` forced to 0,
  `_desatConfiguredStrength` forced to 0. The patch was masking the
  LOD1 silhouette mismatch we just removed. File stays on disk for
  back-compat with the kiln impostor + mobile-low LOD1 path; it's a
  per-fragment no-op now. Full file delete deferred until Phase C
  aerial-LUT lands and the kiln impostor stops referencing the
  uniforms.
- **Per-scene fog retuned** from "structural mask" to "horizon haze
  only": near 220→350, far 700-800→900 across field / rolling-hills /
  open-country.

### Parked (HARDSTOP.md per phase)
- **Phase C — atmospheric truth** (aerial-perspective LUT + height-fog
  density patch + THREE.Fog replacement). Scope-too-large for
  autonomous overnight — multi-day-class work.
- **Phase D — impostor parity** (8×4 atlas re-bake + padded mips +
  hybrid trunk-mesh + `uMatchBoost` deletion). Pixel Forge re-bake on
  Windows + visual review is multi-hour work; sky-LUT-coupled
  relighting depends on Phase C.
- **Phase F — start screen UX** (Mode→Scene→Dog flow restructure +
  hero-art ScenePicker + live WebGL DogSelection + scripted background
  orbits + tutorial overlay). Multi-day React refactor; depends on
  Phase E full state machine.
- **Phase G — tree art direction** (6 tree variants + per-scene
  distribution profiles + landmark trees + embedded wind in impostor
  bake). Depends on Phase D atlas pipeline; recipe authoring is
  multi-day.

### Validation
- vitest 188/188 pass.
- Production build clean: 835.92 KB main / 250 KB gzip (+1 KB vs
  v1.5.0 — Phase E per-mode zoom plumbing).
- Sim-baseline byte-identical (no `shared/` core change).

### Tag
- `v2.0.0-rc.1` on `meta-cycle-overnight-2026-05-06` (NOT pushed).
- Phase tags `cycle-25-phase{A,B,E}-complete` on the same branch.
- Matt's morning review decides: merge to main + push tag → triggers
  GH Actions deploy, OR cherry-pick subset → drop the rest.

## [1.5.0] — 2026-05-06 (Cycle 24 — mp-audit-and-test-coverage)

This release codifies the Cycle 23 multiplayer cheap-wins under a Playwright two-tab regression suite, adds a real 15-second reconnect grace window so MP guests can background their phone in an elevator without losing the session, and locks down each player's dog-mesh selection across the full host↔guest path.

### Added
- **15-second reconnect grace** for in-game disconnects. `RoomDO.handlePlayerDisconnect` schedules a per-playerId timeout when the room is in-game; if the player rebinds via `bindSocket` before the timeout fires, the timeout cancels and the sheepdog stays in-world the whole time. Lobby-state disconnects continue to evict immediately. Every grace activation + cancellation logs to RoomDO console for production audit.
- **`window.__sdsMpDrop` + `window.__sdsMpReconnect`** test-only globals. Sibling to `__sdsMpProbe`, gated on `?mpProbe=1` / `?perfMode=1`. Drives the reconnect-grace specs without coupling to the mid-cycle React lobby reflow.
- **Multiplayer dog-selection contract doc** at [`docs/archive/research/multiplayer-dog-selection.md`](docs/archive/research/multiplayer-dog-selection.md). Traces the dogType propagation path across the 11 hops UI → REST `/api/rooms` → `RoomDO` `/init` → WS `setDogType` → broadcast → peer render. Names every field name + every silent-coercion point.
- **6 new MP e2e specs** across 3 files: `tests/e2e/mp/in-game-state.spec.ts` (host-start propagates state, sheepCount, gameMode), `tests/e2e/mp/reconnect-grace.spec.ts` (within-grace retention + reconnect-cancels-eviction), `tests/e2e/mp/dog-selection.spec.ts` (host=pip+guest=sally, default fallback to jep, three-player permutation). All green on chromium-mp; runnable cross-engine via `--project=mp-firefox` / `--project=mp-webkit`.

### Changed
- **`navigateToMultiplayer(page, opts)`** in `tests/e2e/mp/_helpers.ts` accepts an optional `pickDog` arg so two-tab specs can drive the DogSelection screen with a specific id instead of the default-jep pass-through.

### Validation
- vitest 188/188 pass (no delta from v1.4.0 — this cycle is purely additive: new e2e specs + new server behaviour, no `shared/` core change).
- 19 MP e2e specs total green on chromium (10 from Cycle 24 Phase 1 + 9 net-new this cycle), 0 regressed.
- Production build clean.
- Sim-baseline byte-identical (no `shared/MovementPhysics.js` change).

### Deferred to Cycle 25 (polish program)
- Render-texture grass-trample spike — re-evaluate after the aerial-perspective LUT lands so trample displacement composes with height-fog density output.
- WebGPU `?renderer=webgpu` spike — re-evaluate after the impostor 8×4 atlas re-bake; some BatchedMesh-on-WebGPU patterns assume per-instance LOD which the new impostor pipeline makes optional.
- Mid-game scene-swap MP regression spec — `sceneId` is fixed at room creation per `worker/src/RoomDO.ts:188`; in-MP scene swap requires either a dedicated worker route or a host-leaves-and-recreates flow, neither in this cycle's scope.
- Sim-baseline cross-check across two tabs — needs full canvas + input simulation; deferred until Phase A validation infra (Cycle 25) gives us a shared driver pattern.

## [1.4.0] — 2026-05-05 (Cycle 23 — overhead-polish-grass-LOD-and-mp-cap-fix)

This release closes the v1.3.0 playtest gap list: overhead Classic-camera trees no longer fade into a grey fog smear, sprint stops when stamina runs out, the Open-Country HUD camera-mode chip vertical-stacks below the objective banner, far-ring grass on OC drops ~65% of triangle cost via a meadow-quad LOD, and multiplayer hosts can now run Insane (3000) and Chaos (5000) sheep counts when all guests are on desktop.

A novel game-dev trick lands too: when a tree blocks line of sight from camera to dog, its leaves dither into a stochastic curtain so the dog stays trackable through dense forest, no camera mode change required.

### Added
- **Pitch-aware atmospheric desat.** `TerrainBuilder._desat` now scales `uDesatStrength` per-frame by `lerp(1.0, 0.2, smoothstep(25°, 50°, |pitch|))`. Follow-cam (low pitch) keeps full desat to fight far-tree fog smear; Classic-cam overhead drops to 20% so near trees keep their saturation. Closes the "trees look terrible from above" playtest finding without removing Classic.
- **Scene-level fog overrides.** Field/Rolling Hills/Open Country each ship explicit `fog: { color, near, far }` defs; `Atmosphere` now reads them and swaps in a linear `THREE.Fog` instead of the FogExp2 default. Prime fog color from the horizon LUT on first frame so cold-start no longer paints `0xcccccc` grey.
- **Impostor pitch-tilt.** Kiln-impostor billboard interpolates from cylindrical (vertical, low camera pitch) to spherical (camera-facing, high pitch) via `smoothstep(0.2, 0.7, |dirObj.y|)`. Closes Cycle 19.5 carryover #2(b).
- **Camera-to-dog occlusion fade.** New `js/shaders/OccluderFadePatch.js` patches every leaf MeshStandardMaterial with a view-space capsule distance check. Fragments inside a thin capsule between camera and dog hash-discard with the same dither family as the kiln-impostor alphaHash. Trees blocking line-of-sight turn into a stochastic dither curtain so the dog stays visible through dense forest. Per-frame cost is one Vector3.applyMatrix4 (reused scratch) plus a uniform write; per-fragment cost is one length + one smoothstep + one branched hash.
- **HardwareTier service** (`js/HardwareTier.js`). One-shot tier classification at SceneManager init: low / med / high based on `MAX_VERTEX_UNIFORM_VECTORS` plus unmasked GPU vendor regex. Drives per-tier presets (blade count, wind octaves, meadow-quad enable). `?tier=low|med|high` URL override for testing.
- **Grass T4 meadow-quad LOD.** Far-ring grass chunks (>260m from origin) on med/high tiers render as a single 40m × 40m PlaneGeometry per chunk instead of clump-instancing thousands of blades. Material is a procedural noise mix of the scene's grass.base/mid/tip colors. Estimated ~65% triangle reduction on OC-Extreme; Field unaffected (half-extent 210m).
- **MP Insane/Chaos sheep counts.** RoomDO `ALLOWED_SHEEP_COUNTS` extended to `[200, 250, 500, 1000, 3000, 5000]`. Host UI labels options as Classic / Extreme / Insane / Chaos and shows an amber warning when picking >1000 sheep. Worker rejects mobile-UA WebSocket upgrades on those rooms — host gate is enforced server-side.
- **Stamina sprint-exit lock-out.** `Sheepdog.updateStamina` now latches `_sprintLockOut` when stamina depletes mid-sprint; clears when wantsSprint becomes false (Shift release). Layered on the existing canStartSprint vs canContinueSprint split (Cycle 7 settled decision preserved). Closes the v1.3.0 stutter-sprint that visually read as "sprint continues until input stops".

### Changed
- **Default camera order**: cycle visits Follow → Free → Classic on press-C (was Classic → Follow → Free). Default boot stays Follow (Cycle 21 Phase 5 unchanged); Classic is now the third selectable option per playtest direction. Settings UI label and order updated to match.
- **OC HUD vertical stack**: CameraModeIndicator subscribes to objective state and drops below the ObjectiveBanner (top + 88px) when one mounts. Field/RH unchanged.
- **Tree triangle counter** in the perf stats panel: `sumInstancedMeshTriangles` prefers `instancesCount` over `count` so InstancedMesh2 trees report their full allocated count instead of 0 (the dynamically-frustum-culled value at init time).
- **Cinematic-flag strip on invite-hash join**: synchronously strips `?cinematic=1` from the URL when `#/r/<roomCode>` is present, BEFORE SceneManager constructs and reads the flag. Prevents `preserveDrawingBuffer: true` leaking into normal MP play sessions.

### Validation
- vitest 188/188 pass (was 179; +9 new specs in `tests/stamina-sprint-exit.spec.js`). Sim-baseline byte-identical.
- Production build clean; main bundle 832.67 KB / 247.89 KB gzip (cumulative +7.05 KB vs `1.3.0`).
- Cycle 23 phase tags: `cycle-23-base`, `cycle-23-phaseA1-default`, `cycle-23-phaseA2-default`, `cycle-23-phaseB-default`, `cycle-23-phaseC-default`, `cycle-23-phaseD-default`, `cycle-23-phaseE-default`. Iteration artifacts under `cycle23-validation/{phaseA1..F}/`.

### Deferred
- **Heightfield amplitude root fix** (Cycle 19 hotfix workaround still in place; needs Matt's go-ahead before re-bake).
- **Full MP audit + two-tab Playwright harness** → Cycle 24 (`mp-audit-and-test-coverage`).
- **Auto-LOD blade-count extension (D3 as planned)**: clump geometry is shared across chunks; rebuilding for blade scaling requires per-tier alternate geometries — not commensurate with marginal gain. Static tier-preset blade count + existing clump-count auto-LOD already meet the perf target.
- **Pre-baked meadow-quad WebPs** (Q4 plan): shipped as runtime-procedural shader instead of a `tools/bake-meadow-quad.mjs` pipeline. Bake-script remains a Cycle 24+ candidate if visual quality is insufficient.

---

## [1.3.0] — 2026-05-05 (Cycle 22 — stylized-lod-pivot-and-grass-perf)

This release ships Cycle 22's stylized-LOD pivot plus a long-deferred species cull. Distant trees now fade smoothly into the atmosphere instead of popping; grass adjusts itself to maintain smooth framerate; pine trees retired so every scene is a tree1+tree2 mix.

### Added
- **Meshopt-baked LOD1 GLBs.** New `tools/bake-tree-lod1.mjs` script wraps `@gltf-transform/functions.simplify()` with `MeshoptSimplifier`. Replaces the Cycle 16 leaf-count-halved LOD1 (which produced the Cycle 17 visual rejection) with geometric simplification — same leaf count, fewer trunk verts. Runs four variants (aggressive / default / conservative / pristine) saved under `cycle22-validation/phaseA/variants/` for branch-back options. Default lands at `_originals/<name>_lod1.glb`. Tree1 -38% / tree2 -45% bytes; LOD chain re-enabled at 80m.
- **alphaHash stochastic LOD crossfade.** `material.alphaHash = true` on every LOD0+LOD1 leaf MeshStandardMaterial; equivalent screen-space-hashed alpha threshold inline in the kiln impostor (custom ShaderMaterial gets its own dither since Three's auto chunk injection only applies to `MeshStandardMaterial`). Result: LOD0→LOD1 (80m) and LOD1→impostor (200m) handoffs read as smooth density gradients, not hard pop bands.
- **Atmospheric desaturation toward fog.** New `js/shaders/AtmosphericDesatPatch.js` exports a composable `onBeforeCompile` that mixes `gl_FragColor` toward `(luma + 40% fogColor)` over `[uDesatStartM, uDesatEndM]` at `uDesatStrength` weight. Defaults 100m / 320m / 0.6. Single shared uniform set drives LOD0+LOD1 leaves AND the kiln impostor — all three tiers desaturate in lock-step.
- **Grass auto-LOD.** GrassSystem ticks a 60-sample frame-time ring buffer; if the rolling average crosses 18ms, per-chunk clump density scales toward 0.5×. Recovers toward 1.0× under 14ms. Applied at chunk-rebuild time only — no live geometry mutation. Floor 0.5 keeps grass visible under sustained perf trouble.
- **BatchedMesh research doc.** [`docs/archive/research/cycle-22-batchedmesh-research.md`](docs/archive/research/cycle-22-batchedmesh-research.md) — Cycle 23+ migration evaluation. Recommendation: defer (no native per-instance LOD in Three r184; community workaround requires shared vertex arrays, blocking our meshopt simplify pipeline).

### Changed
- **Pine species removed.** Per Matt's directive ("remove pine altogether i dont like it"). Dropped from `TreePlacement` biomes (mixed becomes 50/50 tree1+tree2; the outer pine ring collapses into mixed), all bake scripts, asset specs, the impostor LUT, the asset-gallery pick list, and the dev sandboxes (`lod-sandbox-v2`, `lod-color-match`, `impostor-inspector`). `pine.glb` + `pine_lod1.glb` + `pine.imposter.{png,depth.png,normal.png,json}` archived under `cycle22-validation/phaseA/removed-pine/` then deleted from runtime + originals. Sim-baseline byte-identical (trees are visual-only).

### Fixed
- **LOD pop bands.** alphaHash dither (Cycle 22 Phase B) plus per-fragment desat (Phase C) replace the prior hard alphaTest cutoff at LOD swap distances. Camera dollys through 80m and 200m no longer show the visible LOD-tier discontinuity.

### Performance
- **Grass auto-LOD** scales density at the next chunk rebuild, so sustained sub-56fps episodes self-correct without a manual quality switch.
- **LOD1 80m band.** Restoring LOD1 reduces tris in the 80–200m band (now ~40–55% of LOD0 rather than full LOD0 → impostor cliff at 200m).

### Validation
- vitest 179/179 pass throughout all phases.
- Production build clean; main bundle 821 KB / 246 KB gzip (+9 KB vs `1.2.0` for the new shader patch + LOD1 wiring).
- Cycle 22 phase tags landed: `cycle-22-base`, `cycle-22-phaseA-default`, `cycle-22-phaseB-default`, `cycle-22-phaseC-default`, `cycle-22-phaseD-default`. Phase C variant branches: `cycle-22-phaseC-strength-0.4`, `cycle-22-phaseC-strength-0.8`. Phase A iteration variants under `cycle22-validation/phaseA/variants/{aggressive,default,conservative,pristine}`.

---

## [1.2.0] — 2026-05-05 (Cycle 21 — tree-impostor-stabilization-and-foliage-polish)

This release ships Cycle 21 work on top of `1.1.0`. Cycle 21 was originally scoped as a 6-phase pixel-perfect impostor-LOD0 color-match. Mid-cycle, a research synthesis (Three.js modern LOD primitives + WebGPU/TSL state + stylized indie-game patterns) plus Matt's product-vision push pivoted the closing phases away from "match LOD0" toward "embrace atmospheric perspective + push impostor distance + fix the actual visible defects." The deeper LOD/grass overhaul moves to Cycle 22.

### Added
- **Aspen recipe re-tune.** `tools/bake-trees.mjs` `LEAF_COUNTS.aspen` `[24, 30, 36] → [34, 42, 50]` (+40% across all 3 scales) plus a new `LOD0_BRANCH_ASPEN` override lifting `children[0]` 8 → 10. Production pick `tree1.glb` (`aspen_small_single`) was reading as a tall broomstick — re-bake gives a fuller silhouette across all camera angles. tree1.glb 3744 → 5880 tris.
- **Schlick fresnel rim** on the kiln impostor shader (`uFresnelStrength` uniform, default `0.04`). Closes the warm-bias hue gap by adding the cool-shifted edge highlight that LOD0's `MeshStandardMaterial` had via Three's PBR pipeline.
- **Per-species impostor calibration LUT.** New `tools/generate-impostor-lut.mjs` reads sandbox measurements and outputs `assets/impostor-calibration-lut.json`. Each kiln material's `uMatchBoost` uniform is set once at scene init (no per-frame cost). tree1 boost `[1.305, 1.128, 0.891]` corrects the dominant Aspen color drift; tree2/pine entries are near-identity.
- **Standalone LOD measurement sandbox** at `tools/lod-sandbox-v2.html`. Two-pane harness rendering LOD0 + LOD2 of the same tree under matched atmosphere preset, with 5×5 grid color sampling, OKLab dE proxy, and a 12-cell smoke matrix runner. Imports SDS modules via Vite — atmosphere preset switcher mirrors live game.
- **Atmospheric perspective lean.** Per-fragment Rec601 luma desaturation in the kiln impostor shader past 200m, blending up to 70% desat by 350m. Distant trees now intentionally read as distant (Sable / Tiny Glade / Townscaper aesthetic) instead of fighting to match LOD0 pixel-perfect.

### Fixed
- **Detached impostor shadow ("film over the grass").** The InstancedMesh2 LOD2 impostor billboard was casting shadows during the directional light's shadow render pass. The billboard's vertex shader uses `cameraPosition` for camera-facing pose; during shadow render that's the LIGHT's position, so the billboard ended up facing the sun and its shadow was decoupled from the player's view of the tree — visible as a desynced grey patch beside each distant tree. Set `castShadow = false` on the LOD2 impostor sub-mesh; foreground LOD0 trees still cast correctly.
- **Tree placement clumping in OC woods.** `WOODS_INSIDE_FACTOR` 0.6 → 0.85 → 0.92 (cumulative across Cycle 20 v2 + Cycle 21 Phase 0); placement `scaleVariation` 0.7-1.3 → 0.80-1.20 (fewer towering-vs-tiny outliers). Test threshold relaxed 1.3× → 1.05× to match new design intent.
- **`docs/tree-pipeline.md` recipe table.** Was listing tree1 as "Aspen Medium seed=7" when the production pick is actually `aspen_small_single` seed=11. Corrected all three rows + added a "source of truth" pointer to `picks.json`.
- **Grass shoreline clip.** New `SHORELINE_Y_MIN = 0.5` in `GrassSystem.createChunk` excludes grass past the visible shoreline on RH where the terrain falloff annulus drops below water level. Doesn't touch the existing `> 50` amplitude clamp.

### Changed
- **Spherical impostor billboard with world-up lock.** Cylindrical (Y-axis only) was foreshortening at high pitch — Classic camera at 45° pitch drew impostors at 71% height. Spherical-with-up-lock orients against `(worldUp × viewDir)` so the quad always faces the camera in 3D without rolling on yaw.
- **Frustum-sized impostor quad.** Sized to the bake bounding sphere (`boundsRadius * 1.02`) matching Pixel Forge's `bake.ts` exactly. Previous code used `worldSize = max(bbox dims)` which drew the tree at ~70% of true size.
- **Foliage lighting recipe.** Half-Lambert wrap + hemispheric ambient with albedo-tinted ground bounce + optional subsurface lift (default 0). Replaces pure Lambert (which read grey at distance).
- **Impostor LOD swap distance pushed 100m → 200m.** Foreground/midground stays geometric (LOD0); impostors only fill the deepest fog band where atmospheric perspective is doing 60-80% of the visual work anyway. Eliminates the prior 100m hard cliff that surfaced the impostor color/sampling gaps.
- **Atlas mipmaps disabled, anisotropy 8.** Cross-tile bleed from box-mip averaging across 4×4 lat-lon atlas neighbours produced sparkle-glint at distance. Disabling mips fixes the worst case; aniso 8 keeps texture sharp at high-pitch foreshortening. Half-texel UV clamp inside tiles prevents bilinear from reaching across tile boundaries.

### Known limitations
- **Impostor texture undersampling at extreme zoom + high pitch.** Without mipmaps, fragments hitting 5-15 screen pixels of a 512px tile can still alias. Mostly hidden behind the new 200m LOD2 distance + atmospheric desaturation. Cycle 22 will replace LOD1 with a meshoptimizer-simplified geometry tier that pushes geometric LOD further out before impostors take over.
- **`tree1_lod1.glb` etc. exist in `assets/models/trees/` but are not consumed.** They were baked via EZ-Tree leaf-count halving which produced a visibly worse silhouette than LOD0. Cycle 22 will re-bake LOD1 using `meshoptimizer` geometric simplification — preserves silhouette, decimates triangles.
- **Impostor calibration LUT is per-species only**, not per `(scene, ToD, distance)`. Per-distance residual exists (Aspen dE doubles between 150m → 250m) but the Phase 5 atmospheric desaturation now masks it.

## [Unreleased] — 2026-05-04 (Cycle 19.5 polish; on top of `1.1.0`)

### Fixed
- **Octahedral impostor shader compile (Linux SwiftShader).** Vertex shader used a local `mvPos` symbol while the auto-injected Three.js `<fog_vertex>` chunk references `mvPosition` — NVIDIA drivers ignored the undeclared identifier silently, but Linux SwiftShader hard-failed and the e2e console-error guard turned the v1.1.0 deploy red. Renamed local to `mvPosition`. Same root cause was killing the LOD2 mesh on permissive drivers too, so trees disappeared past 100 m on every machine — close-up trees rendered, distant trees did not.
- **Trunk LOD2 ANGLE warning silenced.** Replaced the shared 3-vert empty geometry with a per-trunk attribute-matching empty (clones the source geometry's attribute schema with zero-length buffers). ANGLE no longer complains "Vertex buffer is not big enough for the draw call" when the active trunk material binds attributes the shared empty didn't supply.
- **`UniformsUtils.merge` warning** in `octahedral-impostor-material.js` — switched to a literal-spread of `THREE.UniformsLib.fog` so the runtime-baked atlas texture isn't passed through `cloneUniforms` (which can't clone render-target textures).

### Performance
- **Per-instance frustum culling for trees + rocks.** Trees were on `InstancedMesh2` with default `perObjectFrustumCulled = true` but no spatial index; rocks were on plain `THREE.InstancedMesh` (whole-mesh AABB only — every rock submitted regardless of view direction). Migrated rocks to `InstancedMesh2` and added `computeBVH({ margin: 0 })` post-`addInstances` for both. Verified on RTX 3070 OC island: looking at island = 358 draw calls, looking 180° away = 193, looking at sky = 34 — ~90 % reduction at the extreme.

### Changed
- **ScatterSystem removed.** Pebbles, mushrooms, clovers, single flowers — sub-metre detail props that were too small to read at gameplay camera distances and contributed measurable draw cost without a payoff. `js/ScatterSystem.js` deleted, all `createScatter` / `clearScatter` wiring stripped from `TerrainBuilder.js` and `main.js`. Grass remains as the meadow primitive; rocks remain as the obstacle silhouette. Scene-swap regression spec retains the heightfield-ref check on the GrassSystem (same shape, different captured object).
- **Octahedral impostor brightness lift.** Bake lighting `0.30 + 0.55` → `0.70 + 1.20` (`AmbientLight + DirectionalLight`, `1.40× → 1.90×`) so impostors live in the same exposure band as a sunlit LOD0 tree. Added a sun-luma-driven 1.0×–1.2× multiplier inside `setImpostorTint` so impostors track time-of-day brightness instead of sitting at flat bake exposure. The 100 m LOD2 → LOD0 swap reads as a smooth exposure step instead of a brightness pop.

### Known limitations
- **High-altitude impostor billboards** still render the tree's vertical-canopy bake — the runtime quad stays vertical (cylindrical billboard around world-Y). A full spherical billboard would unlock the high-elevation atlas tiles for cinematic / freeFly camera angles, but the bake camera frustum (`halfW = max(x,z) × halfH = y`) needs to switch to square tiles in lockstep — tilting alone distorts the canopy. Tracked for follow-up.

## [1.1.0] — 2026-05-04 (Cycle 18 + Cycle 19 hardening)

This release ships Cycle 18's three independent code-level fixes (visually verified on RTX 3070 in Cycle 19) plus the Cycle 19 Phase 1 hotfix that restored grass-on-terrain across RH and OC.

### Added
- **Octahedral impostors at LOD2.** New runtime atlas baker (16 tiles, 4 azimuth × 4 elevation, 1024×1024 atlas per species, baked once per session). Replaces the cross-billboard at the LOD2 tier when the bake succeeds. Self-contained Three.js — no external dependency. Cross-billboard remains as the fallback when the atlas fails.
- **Per-scene `grassRadius`** schema field on `GrassDef`. Rolling Hills sets 172 m, Open Country sets 372 m. Grass chunk grid expands to fit the wider zone, density-falloff zero point uses `grassRadius` directly, per-chunk clump count rescales so the wider zone doesn't blow the perf budget. Field omits the field — byte-identical placement.

### Fixed
- **Scene-swap state hygiene.** `TerrainBuilder.createScatter` else-branch refreshes `scatterSystem.heightfield` so flora doesn't pin to the prior scene's heightmap. `GameState.startGame` always sets `needsFlockRecreation = true`, so sheep respawn within the boundary on same-count restarts (previously left at the prior session's positions).
- **Grass clamp regression.** Cycle 17 Phase 3 tightened the GrassSystem Y-clamp from `> 50` to `> 10`, citing "heightScale tops out at 6". In practice the displaced terrain mesh peaks at ~25 m on OC and ~36 m on RH (a longstanding double-amplification in `Heightfield.sample()` that has shipped for ~14 cycles); the `> 10` cap was snapping every legit terrain Y to 0, dropping grass to water level. Reverted to `> 50` — grass now sits on the terrain mesh again on RH and OC. Field stays byte-identical.

### Performance
- 180/180 vitest pass. Production main bundle 812.80 KB (241.46 KB gzip) — flat vs 1.0.0.
- OC Extreme @ 1000 sheep on RTX 3070: 73 fps avg, p95 frame 13.88 ms — comfortably above 60 fps target post-grass-expansion.

### Marketing
- Three OG cards re-captured on the post-fix build: og-field, og-rh-sunset (Solo Extreme + 1000 sheep), og-open-country.

## [1.0.0] — 2026-04-28 (release-finish)

This is the v1.0 release.

### Changed
- **Scene swap is in-process.** Switching between Field / Rolling Hills / Open Country no longer reloads the page — audio, renderer, and React state all persist across the transition. A 200ms fade-in / fade-out overlay covers the swap window. URL bar updates via `history.replaceState`.
- **Sky is properly tone-mapped.** The pastoral-noon preset (used in Home Field and as fallback) was crushing to near-white through ACES tone-mapping at high-noon sun elevations. Exposure dropped 0.22 → 0.08 — sky now reads as soft pastoral blue with proper horizon haze.

### Added
- **Real dog portrait thumbnails** in DogSelection — rendered via the cinematic pipeline at 512×512 WebP + PNG fallback.
- **Reset-and-re-run-onboarding button** in Settings → Audio tab.
- **Production OG / Twitter / schema.org images** at 1200×630 WebP under 200KB each.
- **Properly-sized PWA icons** at 192×192, 512×512, and 512×512 maskable PNG.
- **Anonymous client telemetry** — `/api/event` worker route + JWT-aware client wrapper. Game completions, mode selections, scene swaps, and MP room creations are recorded.

### Fixed
- Rocks no longer spawn inside the Home Field play area. Per-rock buffer tightened 20m → 40m so clusters straddling the boundary trim cleanly.
- Rocks no longer float — always partially buried so GLB-origin offsets can't surface above the visible ground line.

### Database
- `score_anomalies` column added to `score_submissions` (cycle-10 migration applied to prod).
- New `events` table for client telemetry log.

## [1.0.0-rc] — 2026-04-27

First public release.

### Added
- **Three biomes:** Home Field (open pasture), Rolling Hills (heightmapped countryside), Open Country (island with magical portal corral).
- **Four solo modes:** Classic (200 sheep, no timer), Timed (race the clock), Extreme (1000 sheep), Insane (3000 sheep), Chaos (5000 sheep).
- **Multiplayer:** real-time co-op herding via Cloudflare Durable Object websocket relay; create-room, join-by-code, quick-match, public lobby browser.
- **18 languages:** English, Spanish, Portuguese, Japanese, German, French, Chinese, Korean, Russian, Italian, Turkish, Polish, Dutch, Arabic, Indonesian, Hindi, Thai, Filipino. Full UI + auto-detect.
- **Persistent leaderboards:** global D1-backed scoreboard with mode + scene + sheep-count partitioning.
- **Cinematic atmosphere:** Hosek-Wilkie sky, day-night cycle, anime-style water with depth-aware foam, procedural cloud layer, terrain-conformed grass instancing.
- **Sandbox mode:** custom heightmap, terrain seed, sheep count, and pasture geometry; share via URL hash.
- **Camera modes:** Classic (top-down chase), Follow (over-shoulder), Free (orbital).
- **Mobile support:** touch controls, responsive HUD, viewport-fit cover, full-screen API.
- **PWA installability:** Add-to-Home-Screen on iOS Safari and Android Chrome; standalone display.
- **SEO:** OG/Twitter cards, JSON-LD VideoGame schema, hreflang for all 18 locales, sitemap, robots.txt, service worker pre-caching.

### Architecture milestones (closed development cycles)
- **Cycle 9:** playtest triage + cross-platform — solo sheep-count owned by mode, MP scene-sync helper, Playwright + macOS Safari nightly cross-platform test infra, GL diagnostic probe (`?debug=gl`), defensive `Heightfield.surfaceY` lift.
- **Cycle 8:** mode matrix expansion (Insane, Chaos), leaderboard partition keys, sandbox cross-scene flow.
- **Cycle 7:** atmosphere + water + sun billboard polish, OC portal effect, multi-stage objectives.
- **Cycle 6:** scene composition refactor, obstacle composition at call sites, per-scene camera memory.
- **Cycle 5:** sceneDef-driven rendering, island boundaries, corral-retired event, GameTimer extraction.
- **Cycles 1-4:** initial sim foundation, audit, hardening, multiplayer Phase A+B.

### Cycle 10 highlights (this release)
- In-process scene-swap foundation: `swapScene` / `disposeScene` / `rebuildScene` lifecycle methods on `SheepDogSimulation`; AbortController-tracked window listener teardown for corral-retired / objective-stage-changed / corral-ascend-top.
- PWA manifest at `/manifest.webmanifest` for Lighthouse PWA + Add-to-Home-Screen.
- Cinematic capture infrastructure: `?cinematic=1` flag exposes `window.__sdsCinema` with camera + atmosphere + effects + scene controls; `?ui=off` for clean filming; `?sun=<0..1>` for sun position; `?mode=chaos` for direct-mode entry.
- Score integrity: server-side cross-field plausibility (mode × sheep_count × score), client-clock skew anomaly logging.
- Player CHANGELOG, press kit, electron-readiness research doc.

### Known limitations
- Cross-scene navigation still triggers a page reload (in-process swap is foundational; full flip is a follow-up cycle).
- Some marketing assets predate Cycle 7's sky/water/sun polish; cinematic-pipeline-driven refresh is a follow-up.
- macOS Safari may exhibit a white-ground rendering bug on certain hardware (does not reproduce on GH Actions runners; debug recipe in `NEXT_SESSION.md`).

[1.0.0]: https://github.com/matthew-kissinger/sds/releases/tag/v1.0.0
