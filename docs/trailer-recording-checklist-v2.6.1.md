# Trailer Recording Checklist - v2.6.1 beta

Hand-played capture session for the v2.6.1 trailer. You record real gameplay
with OBS; Claude clips the good parts and assembles the two cuts (Discord
~20s, YouTube ~90s) together with the scripted scenic orbitals from
`tools/trailer/capture.mjs`. Mistakes are fine, long takes are fine; the edit
only keeps 4-12 seconds per take.

## One-time setup

1. Serve the current build (or just play https://sheepdogsim.com, same
   version):

   ```powershell
   npm run build
   $env:SDS_SUPPRESS_BROWSER_OPEN='1'; npx vite preview --host 127.0.0.1 --port 4173
   ```

2. Chrome, fullscreen (F11), 1920x1080 display, other tabs closed (they
   compete for GPU).
3. OBS settings:
   - Source: Game Capture or Window Capture on Chrome.
   - Encoder: NVENC H.264 (RTX 3070), CQP 18 (or CBR 40 Mbps or higher).
   - Output: 1920x1080 at 60 fps. Record to MKV, remux to MP4 after
     (File > Remux Recordings) so a crash never eats a take.
   - Game audio on. The cuts add their own music bed, but real bleats and
     barks are useful for the YouTube cut.
4. HUD stays on in played takes. That is fine; it reads as real gameplay.
   The scripted orbitals are the clean-canvas material.
5. Drop finished files in `tools/trailer/output/raw/` (gitignored). Name
   them loosely after the take ids below, e.g. `take-rh-corral-2.mkv`.

## Takes

Roughly 15 minutes of recording total. Multiple attempts per take are
welcome; keep everything, delete nothing.

### Home Field - http://127.0.0.1:4173/?scene=field

| Id | Mode | Dog | Camera | Do this | Length |
|---|---|---|---|---|---|
| `take-field-classic` | Solo Classic (200) | Jep | Follow | Gather the flock, drive it through the gate into the pen, finish a retirement wave. The full starter loop. | 60-90s |
| `take-field-chaos` | Solo Chaos (5,000) | Sally | Follow | Wait for the full carpet to spawn, then sprint (Shift) straight through the middle of the mass and arc back along its edge. The parting wake is the shot. | 30-45s |
| `take-field-chaos-top` | Solo Chaos (5,000) | Sally | Classic (press C) | Same sprint from the top-down camera for the scale read. | 20-30s |

### Rolling Hills - http://127.0.0.1:4173/?scene=rolling-hills

| Id | Mode | Dog | Camera | Do this | Length |
|---|---|---|---|---|---|
| `take-rh-corral` | Solo Hard (200) | Jep | Follow | Gather from spawn, drive over the hills to the corral, get a batch zapped home. The zap and ascent is the payoff; hold the camera on the corral while they retire. | 60-120s |
| `take-rh-extreme` | Solo Extreme (1,000) | your pick | Follow | Sweep behind the mass so it flows over a ridge line at dusk. If you feel like it, one pass in Free cam orbiting the flock. | 45-60s |

### Open Country - http://127.0.0.1:4173/?scene=open-country

| Id | Mode | Dog | Camera | Do this | Length |
|---|---|---|---|---|---|
| `take-oc-full-loop` | Solo Classic (50) or Hard (150) | George Washington | Follow | The whole objective: gather perimeter clusters, hold the roundup zone until the portal wakes, drive north, retire sheep through the portal. This is the money loop; do not rush it. | 2-3 min |
| `take-oc-woods` | any | any | Follow | Drive a cluster through one of the woods zones so trees and shadows sweep past. | 30s |

### Garnish (optional, any scene)

| Id | Do this |
|---|---|
| `take-bark` | A couple of Space barks that visibly scatter a tight flock. Good audio beat. |
| `take-blooper` | Anything that goes wrong. Keep it; devlog gold. |

## Why these dogs

From `js/Sheepdog.js`: Sally is the speed demon (22 m/s, 35 sprint), so she
sells the chaos carve. Jep is the balanced face of the game. George
Washington has the stamina pool for Open Country's long drives.

## What Claude does with the footage

1. Scrub every take, mark in/out points for the best 4-12s beats.
2. Conform to 1080p30 masters, validate first/last frames.
3. Assemble the Discord and YouTube cuts per `tools/trailer/assemble.mjs`
   (captions and cards already follow the prose rules), mixing your takes
   with the scripted scenic orbitals.
4. Write the shot manifest and `docs/trailer-shot-script-v2.6.1.md`.
