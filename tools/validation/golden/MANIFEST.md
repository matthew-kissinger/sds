# Golden baseline manifest

Baselines for `tools/validation/screenshot-golden.mjs` (run `--diff` to check, `--baseline`
to re-pin). 6 cells: field / rolling-hills / open-country, each at sun 0.5 + 0.85, camera
classic (zoom 60). Captured on the genuine WebGPU path (installed Chrome channel, headed,
d3d11 ANGLE) with a fail-closed guard (`assertWebGpuEngaged`) that refuses to write a golden
if the session demotes to WebGL. Determinism comes from the world-axis classic camera, a
seeded PRNG, and the `visualGolden` frozen grass clock. The follow (close-up) cells were
dropped in Cycle 103: the follow camera tracks the dog and the sim settles by wall-clock, so
their framing was not reproducible run-to-run.

## Re-pins

- **2026-06-15 (Cycle 103).** First genuinely-WebGPU baseline. The prior set was captured
  through headless bundled Chromium, which has no `navigator.gpu`, so it silently demoted to
  WebGL: every "WebGPU" golden before this was actually a WebGL frame, and the WebGPU impostor
  material was never rendered (the 2026-06-14 note's "Captured under WebGPU" was the intended
  path, not the actual one). Cycle 103 P1 switched the harness to the installed Chrome channel,
  headed, with WebGPU enabled, and added `assertWebGpuEngaged` (fails closed, exits nonzero,
  writes no PNG if the renderer is not WebGPU) so a WebGL frame can never be re-pinned again.
  These goldens reflect the Cycle 103 impostor work: the shared foliage-lighting rig (P2,
  impostor calibrated to the LOD0 PBR leaf) and the octahedral fold-seam fix (P3, 64/64
  round-trip). Resolution stays 128px (P4: the 256px re-bake breaks the tree1 octahedral bake).
  The matrix is classic-only (6 cells); the follow cells were non-deterministic (follow camera
  tracks the dog, sim settles by wall-clock; the self-check put Open Country follow below 0.95
  SSIM, and a naive sim-freeze regressed the classic cells by freezing a pre-settle transient).
  Re-adding follow cells needs a deterministic fixed-dt sim-step affordance (BACKLOG). The
  classic cells cover the >200m octahedral impostor band (Rolling Hills ~61, Open Country ~204
  impostors). The on-device visual sign-off (crossfade seam, the `FOLIAGE_RIG.directWrap` canopy
  knob, Home Field latlon) is the remaining Phase 6 step before commit.

- **2026-06-14 (Cycle 97).** Re-baselined to the post-Cycle-95 shipped look. The prior
  baselines (2026-05-16) were obsolete: the Cycle 91 tree/camera rework reframed the follow
  shots and Cycle 92 changed the impostor look, so every cell diffed near-zero SSIM against
  the stale set. Look-approval was delegated to Matt's prod validation per his "ship it, I
  test in prod" directive (see `DECISIONS.md`, Cycle 97). The dead `konveyorRocks` codename
  param was removed from the harness URL (no `js/`/`shared/` consumer since the Cycle 87
  konveyor retirement), so the baselines reflect the default production rock path.
  Newsheepdogland is not yet in the matrix: its streamed foliage + 14s cold load make a
  single-frame headless capture non-deterministic; NSL goldens need a streaming-aware capture
  (wait for `wavesDone === planned`) as a follow-up.

- **2026-05-16 (Cycle 25 Phase A).** Initial baseline.
