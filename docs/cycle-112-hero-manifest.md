# Cycle 112 Phase 8 - hero shot manifest

> Written 2026-07-25. The manifest and the candidates are the agent's half of Phase 8, per the media-prep working preference and the precedent in [`../tools/hero-capture.mjs`](../tools/hero-capture.mjs); the beauty pass stays Matt's.
>
> **These candidates are now installed** as the shipped art in `assets/scenes/entrance/` and `assets/scenes/social/`, on Matt's instruction to carry the plan through. Re-shooting any of them is a re-run of the harness plus [`../tools/install-hero-candidates.mjs`](../tools/install-hero-candidates.mjs) `--write`; the originals are in git history.
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

**t = 0.70** for three of the four; Rolling Hills runs brighter at 0.66 (29 deg) because at 0.70 its dog went to a silhouette against dark dusk grass. Two earlier passes overshot in both directions and are worth not repeating: 0.28 gave a night sky (same elevation, dawn side, cold), and 0.72 to 0.73 gave a navy post-sunset one.

## The four shots

Poses below are what the harness computed and captured, so they can be typed straight into `__sdsCinema.setCameraPose()` for a live re-pose.

### 1. Home Field - `field`

| | |
|---|---|
| Mode | classic (200 sheep) |
| Sun | t = 0.70, elevation 19.0 deg, 63 deg off-axis |
| Camera | `{ x: -75.1, y: 3.0, z: -86.5 }` |
| Aim | `{ x: 0, y: 10, z: 116 }` (the pen, gate at z=100) |
| Dog | `{ x: -67.5, z: -77.6 }` |
| Files | `field__entrance__1920x1080.png`, `field__social__1200x630.png` |
| Purpose | Entrance backdrop (the first-visit default per D5) + og:image |

Dog 5.39% of frame height, flock at 60m, nearest tree 115m. **The strongest of the four.** Dog reads clearly against the grass in the near-left third, flock legible across the mid-frame, treeline and pen fence closing the horizon, generous sky, no seam.

### 2. Rolling Hills - `rolling-hills`

| | |
|---|---|
| Mode | classic |
| Sun | t = 0.66, elevation 29.4 deg, 79 deg off-axis |
| Camera | `{ x: -92.7, y: 33.0, z: -77.5 }` |
| Aim | `{ x: 110, y: 22.2, z: 60 }` (the corral) |
| Dog | `{ x: -86.4, z: -67.1 }` |
| Files | `rolling-hills__entrance__1920x1080.png`, `rolling-hills__social__1200x630.png` |
| Purpose | Entrance backdrop + og:image |

Dog 3.96%, flock at 70m, nearest tree 121m. Took the most work of the four, and two attempted fixes are recorded so they are not retried:

- **A -12 degree yaw nudge made it worse**, putting a trunk mid-frame and the dog under a canopy. Reverted to the pure flock-to-destination line.
- **The dog's lateral offset is +5m here, mirrored from the other three.** At -4m it landed directly under a trunk, dark on dark, with the trunk running through it.

The sun is also brighter than the shared 0.70 on purpose: this island's dusk grass is dark enough to swallow a black-and-white dog.

### 3. Open Country - `open-country`

| | |
|---|---|
| Mode | classic |
| Sun | t = 0.70, elevation 19.0 deg, 42 deg off-axis |
| Camera | `{ x: 0.9, y: 20.9, z: -89.0 }` |
| Aim | `{ x: 0, y: 25.2, z: 295 }` (the portal, past the z=50 roundup zone) |
| Dog | `{ x: -3.1, z: -78.0 }` |
| Files | `open-country__entrance__1920x1080.png`, `open-country__social__1200x630.png` |
| Purpose | Entrance backdrop + og:image |

Dog 3.91%, nearest tree 89m. **The old hero's defect (camera inside a tree) is gone.** The scattered spawn is the weak point: 50 sheep spread over a 380m island do not gather into a readable mid-frame mass the way Home Field's do. If the flock still reads thin, run the shot on a higher rung of the ladder rather than moving the camera.

### 4. Newsheepdogland - `newsheepdogland`

| | |
|---|---|
| Mode | survival (the island's own mode, see below) |
| Sun | t = 0.70, elevation 19.0 deg, 114 deg off-axis |
| Camera | `{ x: 240.2, y: 13.2, z: -1122.1 }` |
| Aim | `{ x: 610, y: 15.6, z: -1000 }` (the homestead gate, mountain beyond) |
| Dog | `{ x: 250.8, z: -1122.3 }` |
| Files | `newsheepdogland__entrance__1920x1080.png`, `newsheepdogland__social__1200x630.png` |
| Purpose | og:image and the scene page. Entrance-gated per D19, so the least urgent |

Both blockers found in the first pass are resolved.

1. **The HUD leak was a real bug and is fixed.** `?ui=off` and `cinema.hideUI()` both set `display:none` on `#react-overlay` alone, which missed the five chips that mount straight to `document.body`: the day/night chip, the survival summary, the minimap, the skip-to-dusk button and the stats chip. All five rendered into the first Newsheepdogland frame. Now a `data-sds-ui="hidden"` attribute on `<html>` drives a CSS rule against `[data-sds-overlay]`, which each chip tags itself with. CSS rather than an imperative sweep because the survival chips mount when the scene loads, long after `?ui=off` runs at init.
2. **The survival lock is correct, not a bug.** `startSolo` returns 10 sheep on this island whatever mode is passed, because Survival *is* Newsheepdogland's mode: you start with a small flock and grow it each day you survive. So the shot pulls in tight (46m to the flock rather than 80m) and frames for ten sheep instead of pretending to a flock the mode never has.

## What the harness measures, and what it does not

Per shot it reports `dogFrameHeightPct`, `dogNdc`, `nearestTreeM`, `sunElevationDeg` and `sunOffAxisDeg`. Against the D8 acceptance lines:

- **"dog occupying at least 3% of frame height"** - measured by projecting the dog's height through the camera. All eight frames pass: 3.77% to 5.39%.
- **"no foreground object occluding more than 15% of the frame"** - **not measured as stated.** `nearestTreeM` measures the distance to the closest tree instance, which catches the actual defect the line was written for. **It has a known blind spot:** it only sees instances in `_treeCullRegistry`, and an early Rolling Hills frame with a trunk cutting the near field still reported 145m. Treat a large value as "no consolidated tree near", not "frame clear". A real coverage percentage needs a depth pass this harness does not have.
- **"horizon seam"** - fixed in Phase 6 and absent from all eight frames.

## Known interaction with the current entrance layout

The shipped entrance panel occupies roughly the lower-centre 45% of the frame (x 410-1030, y 508-870 at 1440x900). The D8 brief puts the dog in the near third, which lands it at NDC (-0.28, -0.47) - **behind that panel**. On the live entrance today the dog and the near half of the flock are covered.

This was left as-is rather than re-shot, deliberately. Cycle 113 replaces the entrance with Direction A, so a hero re-framed to dodge today's panel would be framed against a layout that is about to be deleted. The brief was written for the new entrance, and the frames satisfy it. Re-check the composition once 113's layout is real; if the dog still lands under a panel, the fix is `dogLateral` (currently -4m, roughly -9m would clear the present one) rather than a new brief.

Worth noting the heroes are a strict improvement regardless: the review's complaint about Home Field was that the dog was roughly four pixels. It is now 5.39% of frame height even where partly occluded.

## Open question for the pass

**Should the sun disk be in frame?** The brief says "low sun off-axis" without saying whether the disk itself should appear. At t=0.70 it sits blown-out in the upper right on Home Field and Open Country (43 to 59 degrees off-axis, inside the ~39 degree half-FOV), and out of frame on Rolling Hills and Newsheepdogland (over 100 degrees). Pushing it out of frame everywhere means either a later t, which cools the sky toward navy, or yawing the camera off the flock-to-destination line, which costs the composition. This is a taste call, not a measurement.

## Remaining steps in Phase 8

1. Beauty pass on all four, Matt driving. `__sdsCinema.freeFly()` then `snapshotPose()` is the documented workflow for re-posing live.
2. Re-cut `assets/scenes/social/` from the same session so the og:image matches what the entrance shows.
3. Update `public/scenes/*.html` with the new imagery.
4. Confirm `index.html`'s `<link rel=preload>` still points at the right hero.
