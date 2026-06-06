# Wolf asset

> Added Cycle 61 Phase 6. The wolf is an **asset-only** drop-in: it is sourced,
> loaded, animated, and documented as ready, but it is wired into **no game
> mode** this cycle. No wolf AI, no wolf in the deterministic sim, no wolf on
> the wire. This doc is the handoff for the future predator mode that will use
> it.

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
- The raw export is tiny in model units (about 0.055 units tall), so the loader
  fits the wolf to a target world height (default 1.1 metres, a touch taller
  than the roughly 1 metre dog read) via a `Box3` measurement at construction.
  Pass `{ scale }` to pin an explicit scale instead.

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

## Design intent for the future predator mode

When a predator-bearing mode is built, the wolf becomes a live antagonist. The
intended shape:

- **Behavior:** the wolf prowls the pasture, picks a target, and chases, which
  scatters the flock (the opposite pressure to the dog's gather). It reads as a
  threat the player has to manage, not a thing to ignore.
- **Bark repel (the Cycle 61 link):** Cycle 61 Phase 4 added a deterministic
  bark impulse that drives sheep forward along the dog's facing. The bark is
  emitted as an event, by design a superset that a future wolf reacts to: the
  same bark event repels the wolf (the wolf flees the bark origin, and its
  `Idle_HitReact_*` or a flee gait sells the recoil). So the bark already gives
  the player the tool to push the wolf off the flock. No wolf reacts to bark
  this cycle (no wolf is in any mode), but the event the next mode needs is
  already there.
- **Determinism and the wire (the next cycle's work, not this one):** to work in
  multiplayer co-op the wolf's chase and flee must be deterministic, so it would
  become a `shared/WolfAI.js` module (pure, no DOM, no Three.js), ticked
  identically by the Worker authoritative sim and the client predictor, with the
  wolf's state added to the wire as an additive field. That is a deliberate
  future-cycle scope, with its own deterministic-sim and wire migration story
  (see `.claude/rules/shared-sim.md` and `.claude/rules/multiplayer.md`). It is
  explicitly out of scope for Cycle 61. `js/Wolf.js` is render-only and imports
  nothing from `shared/`, so it stays a clean client asset until that cycle.

## What this cycle did not do

- Did not place a wolf in any scene or mode (asset-only).
- Did not add wolf AI, a wolf to the sim, or a wolf wire field.
- Did not make the bark affect a wolf (no wolf exists in a mode to affect). The
  bark-repel reaction is documented intent above, inherited by the next mode.
