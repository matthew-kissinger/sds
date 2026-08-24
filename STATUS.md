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
- Production has not been changed. Worker and Pages deployment each require
  owner approval of the same full release-candidate commit SHA.

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

## Open release gates

- Run all tests, lint, client and Worker typechecks, build, release probe,
  license scan, secret scan and dependency audits from a clean checkout of the
  public candidate.
- Capture one genuine WebGPU receipt and one forced WebGL2 receipt from the
  integrated game. A WebGPU test that falls back is not a WebGPU receipt.
- Complete the desktop, mobile, offline-score and service-worker transition
  matrix in `docs/launch/v3-launch-pack.md`.
- Create and verify the 1200 by 630 Open Graph image from the accepted game
  build, then capture the final launch screenshot set from that same commit.
- Owner audio listen: laptop speakers, headphones and one complete 25-sheep
  run. If bark or sheep calls read as conspicuously synthetic, ship the reduced
  foreground-audio fallback rather than restoring provider media.
- Foliage reached its five-iteration review limit without a visual acceptance.
  The final technical pass was stable, but the hero crown still reads flatter
  than the grass, the east-fence hedge is not legible in captures, and sway is
  difficult to read. This is an explicit screenshot-quality launch risk.

## Open questions

- Whether the owner accepts the current foliage as a version 3.0 launch risk or
  defers the launch for a separate art-direction pass.
- Whether the original synthesized foreground animal calls pass the owner
  listening gate or use the documented reduced fallback.
