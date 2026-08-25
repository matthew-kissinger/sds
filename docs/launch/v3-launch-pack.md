# Sheepdog Sim launch pack

This packet is the owner-facing launch sequence for version 3.0. It does not
replace automated release checks. A release is ready only when every required
receipt below points at the exact candidate commit.

## Release promise

Sheepdog Sim is one calm field, one dog and one goal: guide every sheep
through the gate. The first release includes solo runs for 25, 75 and 200 sheep,
optional player names, global best-time boards, local personal bests, desktop
and touch controls, WebGPU with WebGL2 fallback, and offline play when the score
service is unavailable.

Multiplayer and the 5,000-sheep experiment are not part of version 3.0.

## Required launch frames

Capture each frame from the exact release build at 2560 by 1440 unless another
size is named. Keep the browser chrome out of the image. Do not stage gameplay
with debug controls or query parameters other than a fixed seed.

1. `01-title-field.png`: title, 25 selected, optional player identity visible,
   full gate and farm composition readable.
2. `02-first-herd.png`: dog beginning to move the 25-sheep flock, with the gate
   visible enough to explain the goal.
3. `03-grass-contact.png`: dog and sheep crossing the grass, showing body
   interaction without clipping, rings or snapping.
4. `04-gate-approach.png`: a flock moving toward both fully opened gate leaves.
5. `05-retirement-pasture.png`: sheep entering the attached three-sided pasture,
   with the shared field rails legible.
6. `06-complete-25.png`: completion panel, submitted name, time and global rank.
7. `07-classic-200.png`: the full 200-sheep composition at the normal camera.
8. `08-mobile-title.png`: 390 by 844 title view with safe areas and touch targets.
9. `09-mobile-play.png`: 390 by 844 active touch play with no clipped controls.
10. `10-webgl2.png`: WebGL2 fallback frame with visual parity to the hero view.

Retain one uncompressed PNG master for every frame. Web delivery copies may be
encoded as WebP or AVIF from a committed recipe. Record the release commit,
seed, viewport, device scale factor, renderer and capture command beside them.

## Open Graph card

Create `app/public/og/sheepdog-sim.png` at 1200 by 630 from the accepted title
or gate-approach frame. Keep the dog, flock and open gate in the centre-safe
area. Use only this copy:

> Sheepdog Sim
>
> Every sheep through the gate

The source must be a committed SVG or HTML composition plus the real game
capture. The exported image is a build artifact with a reproducible command.
Verify it at 600 by 315 and as a small link preview before release.

Create `docs/launch/media/sheepdog-sim-github.jpg` at 1280 by 640 from the same
release build. Keep it below 1 MB for the GitHub repository social preview.

## Owner video shot order

Target 24 to 35 seconds. Record native gameplay at 60 fps, then edit without
speed ramps that disguise the real interaction.

1. Two seconds on the live title field.
2. Select 25 and press Play.
3. Move through the flock and bark once.
4. Hold on grass and wool response for three seconds.
5. Drive the flock toward the fully opened gate.
6. Show several sheep crossing into the attached pasture.
7. Cut to the final sheep and completion pull-back.
8. Hold long enough to read the time, name and leaderboard placement.
9. End on `Sheepdog Sim` and `sheepdogsim.com`.

Use game audio for the primary cut. A captioned silent version is required for
autoplay feeds. Do not use unlicensed music.

## Social copy

### Primary post

Sheepdog Sim is a clean-room rebuild of my browser herding game.

One dog. One field. 25, 75 or 200 sheep. Guide every sheep through the gate,
then compare your time on the solo leaderboard.

It runs in the browser and the source is AGPL-3.0-or-later.

https://sheepdogsim.com

### Technical post

I rebuilt Sheepdog Sim because years of reasonable additions had turned the
old codebase into something I could no longer hold in my head.

Version 3 keeps the part I cared about: deterministic herding in one carefully
made field. The client is TypeScript, React, Three.js and TSL, with one material
path across WebGPU and WebGL2. The source is AGPL-3.0-or-later.

https://github.com/matthew-kissinger/sds

### Short post

Sheepdog Sim is live. Herd 25, 75 or 200 sheep through one very open gate.
Names are optional. Solo times are ranked. The source is open.

https://sheepdogsim.com

## Final proof matrix

| Surface | Required proof |
| --- | --- |
| 25 sheep | New identity, completion, score submit, rank read, replay |
| 75 sheep | Completion, first score on the V3 board, rank read |
| 200 sheep | Completion, score submit, stable frame pacing |
| Identity | Random name without a prompt, custom rename, persistence after reload |
| Offline | Play, complete and save local best with score service blocked |
| Desktop | Keyboard controls, both camera modes, audio unlock, pause and reset |
| Mobile | Touch movement, bark, sprint, safe areas, orientation and resume |
| Rendering | WebGPU and forced WebGL2 use the same scene and material path |
| Accessibility | Keyboard focus, visible focus state, labels, reduced motion |
| Static site | Canonical, sitemap, robots, manifest, OG and source links |
| Service worker | V2 caches retire and a reload reaches the exact V3 build |
| Rollback | Immutable V2 Pages URL and `release/2.x` commit recorded |

## Release order

1. Freeze the candidate commit.
2. Run the full unit, build, lint, bundle and release-surface gates.
3. Complete the browser and device proof matrix.
4. Capture final media from that same commit.
5. Verify the score API partition without adding disposable public records.
6. Push the candidate and verify the non-production Pages preview artifact.
7. Verify the audio source ledger and accept the running-game mix by ear.
8. Obtain owner approval for the exact production commit and backend change.
9. Deploy the score-service compatibility change first and verify health.
10. Deploy Pages, verify the release receipt, then tag `v3.0.0`.
11. Publish the GitHub release and social posts only after live verification.

If either deployment fails, stop. Roll back only the failed surface, verify the
known-good URL, and do not publish launch copy until the site and board agree.
