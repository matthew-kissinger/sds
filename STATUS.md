# Sheepdog Sim 3 release status

Updated 2026-08-24 with the approved loading, launch-media and audio-restoration
follow-up. The deployed `release.json` remains the authority for production
commit identity.

## Production state

- Version 3 client source, deterministic simulation, procedural assets, tests
  and public documentation have been curated into the SDS release branch.
- Version 2 remains recoverable from the annotated `v2.6.4` tag, the pushed
  `release/2.x` branch at `d5c38469`, and immutable Pages deployment
  `https://7cea2cd2.sds-frontend.pages.dev`.
- Multiplayer and the 5,000-sheep player path are absent from the version 3
  client. Solo-time boards use only the isolated `field-v3` partition.
- Solo times are reachable from the title screen and after a completed run.
  No name entry is required: the service assigns a random running name unless
  the player chooses Edit, and the board read path does not require identity.
- Version 3 is live at `https://sheepdogsim.com`. `release.json` is the
  authority for the exact deployed source commit and artifact digest.
- The production Worker was deployed first without a D1 migration. Health and
  all three `field-v3` leaderboard read paths returned HTTP 200 before Pages
  was cut over.
- Player-facing branding is `Sheepdog Sim`. The `3.0.0` number is retained only
  in package, migration and release records.
- The owner selected the CC0 Fox Trees Pack Round and Spreading hybrid for the
  shipped treeline. The final field contains 139 trees outside the fence, no
  understory shrubs and no exposed root runs.

## Passed evidence before public import

- 51 test files and 327 tests passed in the clean-room candidate.
- Lint, TypeScript, production build and release-surface probe passed.
- The 17 runtime audio files are pinned by size and SHA-256 in a source ledger.
- WebGPU and forced WebGL2 foliage captures matched with four foliage draws,
  276,110 submitted triangles, no textures and no external models.
- Standalone grass WebGL2 motion evidence found no sharp seam, rhythmic
  stationary annulus or snapping wake trail after the distance-sampled wake
  fix. The integrated game still needs the same running-build probe.

## Clean SDS candidate evidence

- Lint passed. Client and Worker TypeScript checks passed.
- 77 test files and 613 tests passed after the Fox hybrid import.
- Root and Worker dependency audits report zero vulnerabilities.
- Gitleaks 8.30.1 scanned 12.50 MB with no findings. Direct runtime and build
  dependencies report MIT, ISC, Apache-2.0 or dual MIT/Apache licensing.
- The production build contains 231 modules. Initial JavaScript is 612,634
  gzip bytes. Estimated first transfer is 5,768,165 bytes across 35 files,
  below the 8 MiB release limit.
- The procedural replacement passed deterministic bake checks but was not
  owner-accepted for sound character. Treat its inclusion in the public
  cutover as a release regression, not an approved audio decision.
- The deterministic simulation produced 23,563 identical bytes through the
  independent esbuild and Vite bundles.
- Actual WebGPU and forced WebGL2 running-game captures passed at 1,600 by
  1,000 with four foliage draws and no runtime errors.
- The selected Fox hybrid passed its final running-game capture with three
  foliage geometry draws, 94,798 submitted triangles before shadows and a
  WebGPU p95 frame time of about 7 ms.
- Desktop, tablet, phone portrait, phone landscape and reduced-motion UI probes
  passed with no clipped content or controls below 44 CSS pixels. This is
  Chromium touch emulation, not a physical-device receipt.
- The title-screen times dialog passed those same layouts with keyboard focus,
  Escape-to-close and focus restoration. The local probe data is mocked so
  repeated layout checks cannot create identities or write public scores.
- The isolated Pages and Worker preview passed a real mobile interaction: a
  random running name was assigned, renamed to `Preview Shepherd`, and the 25,
  75 and 200 boards each returned HTTP 200. No staging scores were submitted.
- The integrated grass motion critic passed native WebGPU and forced WebGL2 at
  automatic Low and player-forced High settings. It could not reproduce the
  rhythmic annulus, wake snapping or diagonal dark lane.
- The 1,200 by 630 site card and 1,280 by 640 GitHub social preview were
  regenerated from the production bundle on actual WebGPU without score writes.
  The GitHub JPEG is 273,355 bytes.
- Canonical pages, JSON-LD, Open Graph, Twitter cards, robots, sitemap, legacy
  redirects and social-image dimensions pass the discovery gate. Production
  verification also requires the existing Cloudflare Web Analytics beacon.
- Pull request 86 passed Client CI, the isolated score-service preview and the
  Pages preview before merge. The owner then requested the production cutover.

## Post-release follow-up evidence

### Approved follow-up release

- The 17 actual ElevenLabs-generated MP3 assets from commit `6380fe64` are
  restored without changing the audio graph, buses or scheduler. This
  is the earlier 1,255,526-byte set the owner preferred, with the rejected
  insects and wind loops still absent.

- The blank post-React paper wash is replaced by an immediate loading card.
  Its percentage is derived from observed terrain, grass, treeline and scatter
  bytes plus renderer initialization, capability measurement, mounted scene,
  shader compilation and the first presented frame. It cannot publish 100%
  before the field has drawn.
- `npm run probe:boot` now measures the public DOM contract and records named
  `herd:boot:*` performance marks without relying on the retired debug readout.
- Two final cold probes reached Play-ready in 2,299 to 2,371 ms on desktop and
  5,009 to 5,175 ms under 4x CPU plus 9 Mbps mobile emulation. The honest
  progress card reached `Field ready` without page, request or response errors,
  but both results miss the 2,000 ms desktop target and the mobile result is 9
  to 175 ms over its 5,000 ms target. This remains a measured post-release
  optimization risk rather than an unreported pass.
- The candidate passes lint, client and Worker TypeScript, dependency audits,
  production build and 78 test files with 627 tests. The build contains 234
  modules and 614,466 gzip bytes of initial JavaScript. Its estimated first
  transfer is 4,009,011 bytes after restoring the smaller MP3 source set.
- The Open Graph image and GitHub social preview now use a reproducible
  200-sheep Follow-camera gameplay capture. The GitHub JPEG is 221,312 bytes.
  The capture forces the real WebGL2 fallback because first-context headless
  WebGPU screenshots can return a clear canvas; gameplay uses the same TSL
  material path on both backends.
- React Three Fiber is now named in the README and package keywords. The
  repository topic remains a separate metadata follow-up.
- The loading card and title state share the same boot-grid cell, keeping the
  loading card vertically and horizontally centered. Desktop 1,440 by 900 and
  mobile 390 by 844 screenshots passed owner review.
- Portrait Follow uses a wider lens, higher seat and shorter look-ahead. The
  packaged 390 by 844, 200-sheep probe kept the dog framed, held the joystick
  and dedicated Sprint button together, drained stamina from 100 to 76 and fit
  `200 / 200` inside the progress circle. Desktop movement, bark, pause and
  resume also completed without console, page, request or response errors.
- Dog markings now remain attached through vertex deformation; farmhouse dirt
  remains only inside the pen; sheep cheek wool and upper-leg widths are
  balanced; and the asymmetric gait plants backward, recovers forward and
  folds the airborne leg rearward without the rejected body stomp. Matt
  approved the local candidate and authorized commit, push and deployment.
- The restored MP3 runtime passed the production-preview audio lifecycle probe:
  one graph, gesture unlock, five non-duplicated loops, pause/resume, restart,
  visibility, mute/volume and positional bark all passed with no media errors.

### Customizer Studio, Screen-Space Heritage Nameplates and Working Dog Naming

- Added Customizer Studio to personalize working collie coat presets, dog naming, and flock breed variety.
- Working collie can be named by the player, defaulting to "Pip" with 20 authentic British working sheepdog names in a roll ledger. Persisted to `localStorage` under `herd.customization.v1`.
- Implemented unified Screen-Space Heritage Nameplates with 100% native vector Retina typography (Alice serif font, walnut border `#282016`, gold rosettes `◆`, and downward chevron pin) anchored via 3D camera projection. Resolves mobile DPR downsampling blur without Three.js texture upload overhead.
- Features dual-envelope tracking hysteresis (0.055 NDC acquisition, 0.110 NDC retention, 250ms dropout grace window), harmonic spring arrival (\(k=260, c=18\)), organic pasture bobbing, and full mobile touch parity (tap-to-pin for 4s, tap-to-dismiss).
- Flock breeds supported: Suffolk, Cheviot, Herdwick, Kerry Hill, Badger Face, Moorit, and Balwen.
- 81 test files and 649 unit tests pass. Lint, client TypeScript, Worker TypeScript, and production build pass with zero errors and zero warnings. Initial JavaScript bundle is 627.54 kB gzip.


- Complete the desktop, mobile, offline-score and service-worker transition
  matrix in `docs/launch/v3-launch-pack.md`.
- Complete a physical iOS or Android playtest. Browser touch emulation already
  covers portrait and landscape layout, joystick, bark, camera and pause.
- Capture the remaining final launch screenshot set from the accepted commit.
- Update the stale GitHub description/topics,
  redirect `www.sheepdogsim.com` and `sds-frontend.pages.dev` to the apex, and
  submit the sitemap in Google Search Console and Bing Webmaster Tools.

## Open questions

- None for the production cutover. Physical-device and final launch-media
  receipts remain follow-up evidence.
