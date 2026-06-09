# Wolf asset

> Added Cycle 61 Phase 6 as an asset-only drop-in. Cycle 66 promoted the wolf
> into the Newsheepdogland survival predator layer; Cycle 83 keeps the same
> vetted CC0 rig and fixes its live scale/material read plus bark-repel feel.

## Source and license

- **Asset:** Wolf, from the Quaternius "Ultimate Animated Animals" pack.
- **Author:** Quaternius (quaternius.com).
- **License:** CC0 1.0 (Creative Commons Zero, public domain). This matches the
  repo's existing Quaternius CC0 rocks, scatter, and flora, and is compatible
  with the AGPL code and CC BY-SA 4.0 asset posture (CC0 imposes no conditions,
  so it can sit inside a CC BY-SA 4.0 asset set without conflict).
- **Pack page:** https://quaternius.com/packs/ultimateanimatedanimals.html
- **Direct model (Poly Pizza mirror of the same Quaternius pack):**
  https://poly.pizza/m/P1gU3Qkr9r
- **Exact GLB downloaded:**
  https://static.poly.pizza/f1d12388-e39b-4157-b32a-646a1d089fc4.glb

CC0 requires no attribution. The credit above is courtesy. Quaternius CC0 is the
only wolf licensing accepted here. A paid Unity-Asset-Store wolf (for example
PolyArt or Malbers) must never land in this public AGPL repo.

### Where the files live

- **Raw source GLB:** `assets/_originals/models/Wolf.glb` (986,712 bytes, the
  pristine FBX2glTF export, kept as the compression source of truth).
- **Runtime GLB:** `assets/models/Wolf.glb` (Draco + meshopt + mesh
  quantization, ~457 KB). Produced by the same pipeline as the dog rigs.

### Re-baking the runtime GLB

The runtime GLB is produced by the standard project pipeline, identical to the
dog rigs (Draco edgebreaker at encodeSpeed 0, then meshopt medium):

```
npm run compress-glbs
```

The script (`scripts/compress-glbs.mjs`) walks `assets/**/*.glb`, backs each
original up to `assets/_originals/` once, and compresses in place. It is
idempotent and skips files already under 70 percent of their original size, so
re-running it leaves the wolf alone once compressed. To force a fresh wolf bake,
delete `assets/models/Wolf.glb`, copy the raw GLB back from
`assets/_originals/models/Wolf.glb`, and re-run the command.

Cycle 83 re-checked the source because the live wolves were too small and read
textureless. The official Quaternius pack page is still the accepted source and
still CC0, but it marks the pack as **not textured**. A runtime GLB inspect on
2026-06-09 also found no texture slots in `assets/models/Wolf.glb`. This branch
therefore keeps the vetted CC0 animated rig and fixes the shipped read in code:
the loader applies a grey-wolf material palette to the four flat materials and
fits by vertical bone height rather than body length.

## The rig

The Quaternius wolf is NOT the PolyArt dog rig. It is a single skinned mesh
(four materials: Main, Main_Light, Eyes_Black, Nose) on its own armature, so it
needs its own clip-name-to-state mapping (the dog's `Walk_F_IP` style names do
not exist here).

The GLB ships 24 animation entries, which are 12 unique clips each listed twice:
once with a bare name (`Idle`, `Walk`, `Gallop`, ...) and once prefixed with
`AnimalArmature|` (an FBX2glTF export artifact). `js/Wolf.js` registers both
names and resolves either, so the duplication is harmless.

### Clip-name-to-state mapping (from the real GLB)

This mapping was read from the actual downloaded GLB (`js/Wolf.js`
`WOLF_ANIMATION_STATES`), not from documentation, so the names are exact.

| Wolf state | Quaternius clip(s) | Clip length | Notes |
|---|---|---|---|
| IDLE | `Idle`, `Idle_2`, `Idle_2_HeadLow` | 3.33s / 3.33s / 4.00s | Cycled as variations, like the dog's `Idle_1..7`. |
| WALK | `Walk` | 1.04s | The walk gait. |
| RUN | `Gallop` | 0.54s | The wolf rig has no separate Run or Trot clip. Gallop is the fast gait, so the speed blend is Walk to Gallop (not Walk to Run to RunFast like the dog). |
| ATTACK | `Attack` | 1.33s | One-shot. Returns to the gait machine when done. |
| DEATH | `Death` | 1.04s | One-shot. Clamps on the last frame and latches the dead state. |

Unique clips present in the GLB but not mapped to a default state (loaded into
the action map, available for a future mode to drive directly):

- `Gallop_Jump` (0.92s), `Jump_ToIdle` (1.33s) - a jump and its landing.
- `Eating` (2.50s) - a prowl-flavoured idle alternative.
- `Idle_HitReact_Left`, `Idle_HitReact_Right` (0.67s each) - flinch reactions,
  useful when the dog's bark repel lands (see design intent below).

### Gait blend and feel constants

`js/Wolf.js` mirrors the dog's speed-driven state machine:

- `WOLF_SPEED_THRESHOLDS` maps planar speed (units per second) to IDLE / WALK /
  RUN, with a hysteresis margin so the gait does not flip-flop at a boundary.
- `WOLF_SPEED_STATE_MAX` scales each gait clip's mixer `timeScale` to the body's
  actual speed, so the legs match the ground speed instead of churning at 1x
  (the same trick as the dog's `SPEED_STATE_MAX`).
- The raw export is tiny in model units, so the loader fits the wolf to a target
  world height (default 1.35 metres, larger than the dog and sheep for threat
  read) using the vertical bone extent at construction. Pass `{ scale }` to pin
  an explicit scale instead.

## How to spawn it (verification harness)

The harness is gated behind the `?wolf=1` URL query flag and is fully
self-contained. It builds its own renderer, scene, camera, lights, ground, and
animation loop, so it touches no game state and can never leak a wolf into a
playable scene.

1. Run the app (dev or preview).
2. Open the app with `?wolf=1`, for example `http://localhost:4173/?wolf=1`.
3. The normal game boot is short-circuited. One wolf loads, plays Idle, then
   runs a scripted speed ramp (idle to walk to gallop and back) so the Walk to
   Gallop gait blend is visible. It periodically fires Attack and, once, Death
   (then revives so the loop continues). A slow turntable shows all sides.

The harness exposes `window.__wolfHarness` for automated probes:

| Field | Meaning |
|---|---|
| `ready` | true once the wolf loaded and the loop is running |
| `error` | the load error string, or null |
| `state()` | the current animation state (IDLE / WALK / RUN / ATTACK / DEATH) |
| `clip()` | the current clip name driving the mixer |
| `speed()` | the current scripted drive speed (units per second) |
| `frames` | rendered-frame count (proves the loop is live) |
| `attackCount` | number of Attack one-shots fired so far |
| `dispose()` | tears the harness down (loop, renderer, canvas, listeners) |

Entry point wiring: `js/main.js` checks `?wolf=1` at the top of its
`DOMContentLoaded` handler and lazily imports `js/diagnostics/wolfHarness.js`,
mirroring the existing `webgpuDiagnostic` short-circuit. The harness module ships
nothing to normal players (it is behind the flag and dynamically imported).

## Survival predator wiring

Newsheepdogland survival now uses this rig as the live night predator:

- **Behavior:** the wolf prowls the pasture, picks a target, and chases, which
  scatters the flock (the opposite pressure to the dog's gather). It reads as a
  threat the player has to manage, not a thing to ignore.
- **Bark repel:** player bark remains the same deterministic sheep cone from
  `shared/BarkImpulse.js`, and survival also scares wolves radially through
  `WolfSim.repel()`. Cycle 83 pins the player-facing feel at a 24 m sheep cone
  and a 45 m wolf repel radius for 2.0 s.
- **Determinism and the wire:** wolf positions and state live in
  `shared/survival/wolves.js`, a pure render-free module used by solo survival
  and the Worker simulation. Client rendering stays in `js/Wolf.js`,
  `js/gamestate/wolfRenderer.js`, and `js/gamestate/wolfPack.js`.

## What Cycle 83 did not do

- Did not replace the CC0 Quaternius wolf with an unverifiable, paid, or
  non-commercial asset.
- Did not change `shared/scenes/types.js` or day-clock phase timing.
- Did not add a version bump, release tag, changelog entry, deploy, or live
  production proof.
