# 06 - UX, UI, and game juice

All new. Nothing from the sds UI layer carries over as code; a handful of tuned feel constants carry over as numbers.

## UX flows

- **Boot**: page load fades from a palette-matched color card straight into the field (one suspense boundary, all-cold load). Title floats over the live field with Play, the flock-size choice (25 / 75 / 200), and a quiet `Running as <name>` line with Edit. A friendly server-random name arrives in the background. Play is never disabled by identity or score-network state. Under five seconds from navigation to herding on a mid-range phone. No scene picker, no multi-stage loading choreography, no entrance product.
- **Solo**: Play drops the title away and gives you the dog. Client-local sim works offline. Finish shows time and personal best immediately. Online success adds a quiet rank and the leading times; online failure says the local time is safe and leaves every completion action usable.
- **Interruptions**: pause is instant and local. Losing the score service never pauses play, queues a modal or asks the player to retry.
- **Settings**: one small panel. Audio sliders, quality (auto / high / low), input remap, colorblind-safe dog marker toggle, reduced motion. Nothing else.

## UI principles

- React TSX only, in `app/src/ui/`. Subscribes to the same zustand store as the scene. Zero window globals, zero event-bridge glue, zero polling (the entire sds GameBridge pattern is forbidden).
- A design-token module (color, spacing, type scale, z-index, motion durations) is the ONLY styling authority, written before the first component. `useReducedMotion` respected from day one. Both were the only parts of sds's UI that converged correctly; start there.
- In-game HUD is nearly nothing: sheep-penned count (fills as a soft pictogram row or radial), optional timer (off by default; the zen default is no clock on screen), stamina as a subtle ring around or under the dog, not a bar in a corner. Every HUD element must justify existing against the Calm pillar.
- Touch-first layout: thumb-reachable controls, 44 px minimum targets, the same minimal HUD. Virtual stick + bark button on touch; keyboard/mouse and gamepad on desktop. Input produces one normalized intent shape consumed identically everywhere.
- Typography and menus feel like the game: painterly, warm, unhurried. No stock component library look.

## Carried feel constants (numbers, not code)

- Camera Follow mode: yaw lag tau 0.35 s, position lag tau 0.15 s, aim lag tau 0.08 s (separate aim smoothing kills look-ahead jitter), speedNorm tau 0.1 s, posK capped 0.3/frame, frame-rate-independent smoothing `1 - exp(-dt/tau)`. Ridge clamp: sample 7 points camera-to-dog, clamp Y above max + clearance.
- Camera modes: Classic (top-down, world-axis WASD) and Follow (low cinematic). Classic input stays world-axis; camera-relative from above disorients. Free-orbit is a debug-only extra.
- Grass interaction: oriented rounded-rect SDF in entity-local frame (never a world-axis ellipse), radius 1.02, strength 0.58; dog footprint halfLen 1.16 / halfWid 0.48 / falloff 0.68; sheep scale x1.25 / z1.45. Wind: three rotated noise octaves, variation 0.35-0.65 (one octave reads as a coherent wavefront; three average into flow).
- Bark config: `sim/` DEFAULT_BARK_CONFIG (spec/02), consumed identically by sim and presentation.

## Game juice (a first-class system, not garnish)

Owned by `app/src/scene/juice/` + audio hooks; driven by sim events and per-instance agitation state. Each item ships through the same critic loop as assets, judged in motion:

- **Sheep life**: gait bob with per-instance phase, ear flicks, tail wiggle, wool jiggle on direction change, startle ripple propagating through neighbors when the dog surges, head-down grazing when calm, tiny hop over the gate threshold.
- **Dog feel**: lean into turns, run cycle kicks up dust motes, sit + head tilt when idle 5 s, bark visualized as a soft expanding ring that bends grass.
- **Field response**: grass parting wakes behind every body, wildflowers spring back with overshoot, birds lift from the hero tree on the first bark.
- **Progress moments**: each penned sheep is a soft chime + a wisp of motion at the counter; the final sheep triggers the gate swinging closed, a slow camera pull-back, warm bloom lift, and the flock settling to graze. Completion is a sigh, not a firework.
- **Micro-transitions**: every UI element eases (tokened durations, 150-300 ms, reduced-motion honored). Nothing pops or teleports, in-world or in-UI.

## Forbidden

- Any second UI technology generation. If a component pattern changes, migrate all of it in one PR (sds ran three generations glued by 47 globals).
- HUD churn per frame through React state; HUD numbers read the store transiently.
- Exclamation marks, hype copy, or emoji in player-facing text. The voice is quiet and concrete.
- Dark-pattern retention anything: no streaks, no badges, no popups.
