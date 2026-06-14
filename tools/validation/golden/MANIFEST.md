# Golden baseline manifest

Baselines for `tools/validation/screenshot-golden.mjs` (run `--diff` to check, `--baseline`
to re-pin). 12 cells: field / rolling-hills / open-country, each at sun 0.5 + 0.85, camera
follow (zoom 25) + classic (zoom 60). Captured under WebGPU (d3d11 ANGLE), seeded PRNG +
fixed camera + paused sim for determinism.

## Re-pins

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
