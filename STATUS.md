# Sheepdog Sim 3 release status

Updated 2026-08-24. This file records candidate evidence, not a production
deployment claim.

## Candidate state

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
- Production has not been changed. Worker and Pages deployment each require
  owner approval of the same full release-candidate commit SHA.
- Player-facing branding is `Sheepdog Sim`. The `3.0.0` number is retained only
  in package, migration and release records.

## Passed evidence before public import

- 51 test files and 327 tests passed in the clean-room candidate.
- Lint, TypeScript, production build and release-surface probe passed.
- The 17 runtime audio files rebuild byte-identically from original,
  dependency-free synthesis recipes.
- WebGPU and forced WebGL2 foliage captures matched with four foliage draws,
  276,110 submitted triangles, no textures and no external models.
- Standalone grass WebGL2 motion evidence found no sharp seam, rhythmic
  stationary annulus or snapping wake trail after the distance-sampled wake
  fix. The integrated game still needs the same running-build probe.

## Clean SDS candidate evidence

- Lint passed. Client and Worker TypeScript checks passed.
- 77 test files and 610 tests passed.
- Root and Worker dependency audits report zero vulnerabilities.
- Gitleaks 8.30.1 scanned 12.50 MB with no findings. Direct runtime and build
  dependencies report MIT, ISC, Apache-2.0 or dual MIT/Apache licensing.
- The production build contains 232 modules. Initial JavaScript is 579,858
  gzip bytes. Estimated first transfer is 5,760,560 bytes across 35 files,
  below the 8 MiB release limit.
- The audio bake reproduced 17 files and 2,784,342 bytes exactly.
- Owner accepted the current audio on 2026-08-24. Keep the procedural runtime
  set unchanged; the reduced foreground-audio fallback is not needed.
- The deterministic simulation produced 23,563 identical bytes through the
  independent esbuild and Vite bundles.
- Actual WebGPU and forced WebGL2 running-game captures passed at 1,600 by
  1,000 with four foliage draws and no runtime errors.
- Desktop, tablet, phone portrait, phone landscape and reduced-motion UI probes
  passed with no clipped content or controls below 44 CSS pixels. This is
  Chromium touch emulation, not a physical-device receipt.
- The title-screen times dialog passed those same layouts with keyboard focus,
  Escape-to-close and focus restoration. Its preview data is mocked so browser
  probes cannot create identities or write public scores.
- The integrated grass motion critic passed native WebGPU and forced WebGL2 at
  automatic Low and player-forced High settings. It could not reproduce the
  rhythmic annulus, wake snapping or diagonal dark lane.
- The 1,200 by 630 site card and 1,280 by 640 GitHub social preview were
  regenerated from the production bundle on actual WebGPU without score writes.
  The GitHub JPEG is 273,355 bytes.
- Canonical pages, JSON-LD, Open Graph, Twitter cards, robots, sitemap, legacy
  redirects and social-image dimensions pass the discovery gate. Production
  verification also requires the existing Cloudflare Web Analytics beacon.
- A local owner playtest is active at `http://127.0.0.1:5316`. Production stays
  unchanged until the owner accepts the exact candidate.

## Open release gates

- Complete the desktop, mobile, offline-score and service-worker transition
  matrix in `docs/launch/v3-launch-pack.md`.
- Complete a physical iOS or Android playtest. Browser touch emulation already
  covers portrait and landscape layout, joystick, bark, camera and pause.
- Capture the remaining final launch screenshot set from the accepted commit.
- Foliage reached its five-iteration review limit without a visual acceptance.
  The final technical pass was stable, but the hero crown still reads flatter
  than the grass, the east-fence hedge is not legible in captures, and sway is
  difficult to read. This is an explicit screenshot-quality launch risk.
- After production approval, update the stale GitHub description/topics,
  redirect `www.sheepdogsim.com` and `sds-frontend.pages.dev` to the apex, and
  submit the sitemap in Google Search Console and Bing Webmaster Tools.

## Open questions

- Whether the owner accepts the current foliage as a version 3.0 launch risk or
  defers the launch for a separate art-direction pass.
