# Cycle 112 Phase 8 - hero shot manifest

> Written 2026-07-25, before pairing. Per the media-prep working preference and the precedent in [`../tools/hero-capture.mjs`](../tools/hero-capture.mjs), the agent writes the manifest and the candidates; the beauty pass is Matt's. Nothing in this pass overwrote `assets/scenes/`.
>
> Candidates: `cycle112-validation/heroes/` (gitignored). Harness: [`../tools/hero-capture-cycle112.mjs`](../tools/hero-capture-cycle112.mjs). Measurements: `cycle112-validation/heroes/measurements.json`.

## The brief (D8)

One composition, four times: **dog large in the near third, flock settled and readable mid-frame, destination visible on the horizon, low sun off-axis, generous sky, horizon seam lifted.** Calm rather than tense, per D2.

Every camera below is derived from scene geometry rather than hand-guessed, so the composition holds if a scene moves:

- **Forward** runs from the live flock centroid to that scene's destination, so camera, dog, flock and destination read as one line into the frame.
- **Camera** sits behind the rear-most sheep plus a clearance, capped per scene.
- **Dog** goes 11m in front of the camera and 4m to one side.
- **Pitch is solved, not aimed.** For a point at elevation `phi`, its NDC y is `tan(phi - pitch) / tan(vfov/2)`, so the harness sets `pitch = phi_dog - atan(-0.45 * tan(vfov/2))` and the dog lands in the lower third by construction. All eight frames come out at NDC y between -0.47 and -0.50.
- **Camera height** clamps above the ridge in the near 60m, capped at +12m.

## Sun

`?sun=` and `cinema.setSun()` are a **time of day**, not an elevation: 0 midnight, 0.5 noon, 0.75 sunset. Measured on Home Field:

| t | sun elevation | fog (linear, pre tone-map) | reads as |
|---|---:|---|---|
| 0.25 | 7 deg | 0.075, 0.062, 0.070 | dawn, cold and dim |
| 0.30 | 19 deg | 0.095, 0.123, 0.155 | morning, still blue |
| 0.50 | 70 deg | 0.115, 0.255, 0.582 | noon |
| 0.70 | 19 deg | 0.270, 0.171, 0.116 | golden, warm |
| 0.75 | 8 deg | 0.233, 0.138, 0.098 | low golden |

**t = 0.70** for all four. Two earlier passes overshot in both directions and are worth not repeating: 0.28 gave a night sky (same elevation, dawn side, cold), and 0.72 to 0.73 gave a navy post-sunset one.

## The four shots

Poses below are what the harness computed and captured, so they can be typed straight into `__sdsCinema.setCameraPose()` for a live re-pose.

### 1. Home Field - `field`

| | |
|---|---|
| Mode | classic (200 sheep) |
| Sun | t = 0.70, elevation 19.0 deg, 59 deg off-axis |
| Camera | `{ x: -56.1, y: 3.0, z: -68.6 }` |
| Aim | `{ x: 0, y: 10, z: 116 }` (the pen, gate at z=100) |
| Dog | `{ x: -49.1, z: -59.2 }` |
| Files | `field__entrance__1920x1080.png`, `field__social__1200x630.png` |
| Purpose | Entrance backdrop (the first-visit default per D5) + og:image |

Dog 5.39% of frame height, flock at 50m, nearest tree 89m. **The strongest of the four.** Dog reads clearly against the grass in the near-left third, flock legible across the mid-frame, treeline and pen fence closing the horizon, generous sky, no seam.

### 2. Rolling Hills - `rolling-hills`

| | |
|---|---|
| Mode | classic |
| Sun | t = 0.705, elevation 17.4 deg, 104 deg off-axis |
| Camera | `{ x: -89.8, y: 27.1, z: -61.9 }` |
| Aim | `{ x: 110, y: 22.2, z: 60 }` (the corral) |
| Dog | `{ x: -78.3, z: -59.6 }` |
| Files | `rolling-hills__entrance__1920x1080.png`, `rolling-hills__social__1200x630.png` |
| Purpose | Entrance backdrop + og:image. Currently the `<link rel=preload>` hero in `index.html` |

Dog 4.52%, flock at 70m. Composition is right and the dusk sky is the best of the four. **Two notes for the pass:** the dog is close to a silhouette against dark grass at this time of day, and a trunk sits on the right edge. Both are camera-yaw fixes.

### 3. Open Country - `open-country`

| | |
|---|---|
| Mode | classic |
| Sun | t = 0.70, elevation 19.0 deg, 43 deg off-axis |
| Camera | `{ x: -2.5, y: 22.3, z: -83.8 }` |
| Aim | `{ x: 0, y: 25.2, z: 295 }` (the portal, past the z=50 roundup zone) |
| Dog | `{ x: -6.4, z: -72.8 }` |
| Files | `open-country__entrance__1920x1080.png`, `open-country__social__1200x630.png` |
| Purpose | Entrance backdrop + og:image |

Dog 3.77%, nearest tree 84m. **The old hero's defect (camera inside a tree) is gone.** The scattered spawn is the weak point: 50 sheep spread over a 380m island do not gather into a readable mid-frame mass the way Home Field's do. If the flock still reads thin, run the shot on a higher rung of the ladder rather than moving the camera.

### 4. Newsheepdogland - `newsheepdogland`

| | |
|---|---|
| Mode | survival (forced, see below) |
| Sun | t = 0.70, elevation 19.0 deg, 108 deg off-axis |
| Camera | `{ x: 232, y: 14.5, z: -1169.2 }` |
| Aim | `{ x: 610, y: 15.6, z: -1000 }` (the homestead gate, mountain beyond) |
| Dog | `{ x: 243.7, z: -1168.3 }` |
| Files | `newsheepdogland__entrance__1920x1080.png`, `newsheepdogland__social__1200x630.png` |
| Purpose | og:image and the scene page. Entrance-gated per D19, so the least urgent |

**This is the one that genuinely needs hands.** Two blockers the harness cannot get past:

1. **The solo entry is survival-locked.** `startSolo('jep', mode)` returns 10 sheep on this island whatever mode is passed (`classic`, `hard`, `timed` all tried). Survival is designed to start with a small flock and grow it, so there is no flock to read mid-frame.
2. **The survival HUD renders through `?ui=off` and `cinema.hideUI()`.** The day/flock counter, the "SKIP TO DUSK" chip and the minimap all appear in the frame. A hero cannot ship with those in it.

Either fix the second in code and enter through a co-op or timed room for the flock, or pose this one by hand.

## What the harness measures, and what it does not

Per shot it reports `dogFrameHeightPct`, `dogNdc`, `nearestTreeM`, `sunElevationDeg` and `sunOffAxisDeg`. Against the D8 acceptance lines:

- **"dog occupying at least 3% of frame height"** - measured by projecting the dog's height through the camera. All eight frames pass: 3.77% to 5.39%.
- **"no foreground object occluding more than 15% of the frame"** - **not measured as stated.** `nearestTreeM` measures the distance to the closest tree instance, which catches the actual defect the line was written for. **It has a known blind spot:** it only sees instances in `_treeCullRegistry`, and an early Rolling Hills frame with a trunk cutting the near field still reported 145m. Treat a large value as "no consolidated tree near", not "frame clear". A real coverage percentage needs a depth pass this harness does not have.
- **"horizon seam"** - fixed in Phase 6 and absent from all eight frames.

## Open question for the pass

**Should the sun disk be in frame?** The brief says "low sun off-axis" without saying whether the disk itself should appear. At t=0.70 it sits blown-out in the upper right on Home Field and Open Country (43 to 59 degrees off-axis, inside the ~39 degree half-FOV), and out of frame on Rolling Hills and Newsheepdogland (over 100 degrees). Pushing it out of frame everywhere means either a later t, which cools the sky toward navy, or yawing the camera off the flock-to-destination line, which costs the composition. This is a taste call, not a measurement.

## Remaining steps in Phase 8

1. Beauty pass on all four, Matt driving. `__sdsCinema.freeFly()` then `snapshotPose()` is the documented workflow for re-posing live.
2. Re-cut `assets/scenes/social/` from the same session so the og:image matches what the entrance shows.
3. Update `public/scenes/*.html` with the new imagery.
4. Confirm `index.html`'s `<link rel=preload>` still points at the right hero.
