# Trailer shot script - v2.6.1 web beta

Production record for the two v2.6.1 beta cuts. Deliverables live in
`tools/trailer/output/` (gitignored media); everything needed to rebuild them
is committed code plus Matt's raw OBS takes.

| Cut | File | Length | Spec | Size |
|---|---|---|---|---|
| Discord | `tools/trailer/output/sds-v2.6.1-discord.mp4` | 23.0s | 1080p30 H.264 + AAC | 17.5 MB (bitrate-capped under the 25 MB attachment limit) |
| YouTube | `tools/trailer/output/sds-v2.6.1-youtube.mp4` | 89.9s | 1080p30 H.264 + AAC | 327 MB master |

Machine-readable version of everything below: `tools/trailer/output/cuts-manifest.json`
(regenerate with `node tools/trailer/assemble.mjs --cut=both --manifest-only`).

Thumbnails: `tools/trailer/output/thumb-yt-*.jpg`, composed from HUD-safe
crops of the footage by `node tools/trailer/thumbnail.mjs`. Post copy (titles,
descriptions, Discord posts): `docs/launch/trailer-post-copy-v2.6.1.md`.

## Source material

### Hand-played OBS session (2026-07-01, 17:44-17:54)

Matt on the keyboard, 1080p60 NVENC MKV, HUD on. Raw files stay in `~/Videos`
(also searched: `tools/trailer/output/raw/`). Scrub log with exact in/out
points is the `TAKE_CLIPS` table in `tools/trailer/assemble.mjs`; contact
sheets used for the scrub are in `tools/trailer/output/review/raw-sheets/`.

| Take | Content | Used |
|---|---|---|
| `17-44-01.mkv` (159s) | Home Field Solo Classic (200), dusk into night, ends on a real Victory card (2:39, achievement toast confirms the mode) | dusk drive, tight cluster, night pen, victory |
| `17-47-34.mkv` (24s) | Home Field Solo Chaos (5,000) at noon | rejected: freezedetect found 0.2-0.9s spawn hitches across the take |
| `17-49-53.mkv` (32s) | Home Field Solo Chaos (5,000) at dusk | close carpet sweep, carve wide (scans freeze-clean) |
| `17-51-21.mkv` (47s) | Rolling Hills Solo Chaos (5,000) at round start, camera far out | island-wide spawn ring (crop-zoomed, see gaps) |
| `17-54-01.mkv` (47s) | Open Country Solo Extreme (600) at dusk, roundup stage | woods drive, free-cam aerial with the ring |
| `17-52-38.mkv`, `17-53-38.mkv` | Loading screens, one with a Spotify window | rejected |

Same-day recordings at 07:06 and 15:03-15:26 are other games entirely and were
excluded after contact-sheet review.

### Scripted scenic orbitals

Captured by `tools/trailer/capture.mjs --video` (in-page Mediabunny recorder,
webgpu-production renderer, clean canvas, no HUD). Grass density, tree LOD,
and the compute cull follow the cinematic camera via the `lodFocus` hook (see
Pipeline below). Per-clip validation is in `tools/trailer/output/manifest.json`.

| Clip | Shot |
|---|---|
| `rh-island-establish` | Path camera approaching Rolling Hills over water at dusk |
| `rh-orbital` | Orbit over a staged 1,000-sheep flock at dusk |
| `field-orbital` | Noon orbit of Home Field centred past the pen and gate |
| `oc-orbital` | Golden-hour sweep of the Open Country island |

## Cut structures

### Discord (23.0s)

| Global time | Beat | Source |
|---|---|---|
| 0.0-2.8 | Island approach, title overlay | `rh-island-establish` |
| 2.8-5.6 | Close chaos sweep at dusk | `chaos-dusk-sweep` |
| 5.6-7.8 | Dusk drive behind the flock | `field-dusk-drive` |
| 7.8-10.0 | Woods drive at dusk | `oc-woods-drive` |
| 10.0-12.6 | 5,000 spawning around the island | `rh-island-spawn` |
| 12.6-14.8 | Dusk chaos carve | `chaos-dusk-carve` |
| 14.8-17.0 | Golden-hour island sweep | `oc-orbital` |
| 17.0-20.2 | Night pen into the Victory card | `field-victory` |
| 20.2-23.0 | End slate | card |

### YouTube (89.9s)

| Global time | Beat | Source | Caption |
|---|---|---|---|
| 0.0-7.0 | Island approach | `rh-island-establish` | title overlay |
| 7.0-13.0 | Dusk flock orbit | `rh-orbital` | ROLLING HILLS |
| 13.0-18.5 | Noon pasture orbit | `field-orbital` | HOME FIELD |
| 18.5-25.0 | Dusk drive | `field-dusk-drive` | gather line |
| 25.0-29.5 | Tight cluster | `field-cluster-drive` | |
| 29.5-34.5 | Night pen at 84 percent | `field-pen-night` | night line |
| 34.5-39.2 | Close chaos sweep at dusk | `chaos-dusk-sweep` | SOLO CHAOS |
| 39.2-47.2 | Dusk carve wide | `chaos-dusk-carve` | |
| 47.2-55.2 | Island spawn ring | `rh-island-spawn` | ROLLING HILLS, SOLO CHAOS |
| 55.2-61.2 | Golden island sweep | `oc-orbital` | OPEN COUNTRY |
| 61.2-67.7 | Woods drive | `oc-woods-drive` | SOLO EXTREME |
| 67.7-72.9 | Aerial with the roundup ring | `oc-aerial-ring` | ring line |
| 72.9-78.4 | Beta status card | card | |
| 78.4-84.9 | The real Victory, 2:39 | `field-victory` | |
| 84.9-89.9 | End slate | card | |

All on-screen text was written to `.claude/rules/prose-and-voice.md`: no
em-dashes, no exclamation marks, ALL-CAPS headers, concrete numbers, three
public scenes framing. The full string inventory is in
`tools/trailer/assemble.mjs` (title overlay, nine lower-thirds, three cards).

## Pipeline

1. **Scenic capture**: `node tools/trailer/capture.mjs --shot=<ids> --video`.
   Shot list as data in `tools/trailer/shots.mjs`. The runner poses camera and
   sun through `window.__sdsCinema` (`?cinematic=1&ui=off`), steps the sim one
   frame at a time, and records the canvas in-page with Mediabunny (hardware
   H.264, module injected from `node_modules`, never bundled). A frame-dump
   plus ffmpeg fallback exists behind `--recorder=frames`.
2. **Culling follows the lens**: `js/cinematic.js` exposes a `lodFocus`
   Vector3; when set, `js/main.js` uses it instead of the dog position as the
   LOD and cull centre, and the capture runner re-runs
   `updateGrassAnimation()` synchronously against the cinematic camera each
   posed frame. This fixed the popping trees and thin grass Matt flagged in
   the first scripted batch.
3. **Conform and assembly**: `node tools/trailer/assemble.mjs --cut=both`.
   Cuts the keeper beats from the raw MKVs into 1080p30 masters
   (`output/clips/`), renders overlay PNGs with sharp, then one ffmpeg
   filter_complex per cut: trim, concat, act-boundary fades, music bed.
4. **Polish layer** (in the same filter graph): captions alpha-fade in over
   0.45s while sliding up 36px into place, then fade out; gameplay segments
   get a mild uniform grade (contrast 1.03, saturation 1.09; cards stay
   untouched); the music bed is loudness-normalized to -14 LUFS.
5. **Freeze gate**: every candidate clip is scanned with ffmpeg
   `freezedetect=n=0.003:d=0.2` before it can ship. This is what retired the
   noon chaos take.

## Audio and licensing

The only audio is the game's own soundtrack (`assets/sounds_compressed/
music_start.mp3`, first-party, CC BY-SA 4.0 per `LICENSE-ASSETS`). OBS take
audio is dropped everywhere: Spotify was open during the session, so desktop
audio bleed cannot be ruled out, and none of it is needed.

## Known gaps and honest notes

- **Newsheepdogland does not appear.** Beta posture is three public scenes;
  the fourth stays in the lab until its re-enable bar clears.
- **The noon chaos take was retired after review.** Matt flagged freeze
  frames in the cut; freezedetect confirmed 0.2-0.9s spawn hitches across
  both windows of `17-47-34.mkv` (5,000 sheep spawning in). The chaos act now
  runs entirely on the freeze-clean dusk take.
- **The Rolling Hills spawn wides are crop-zoomed.** That take was recorded
  windowed (browser chrome and taskbar visible), so the clean 1920x910 band is
  scaled up at a cost of about 9 percent off each side and a slight softness.
  Worth it; nothing else shows 5,000 sheep and the whole island in one frame.
- **The night beats are dark.** Home Field Classic runs dusk into night in
  real time; the pen and victory happen at night because that is when the run
  finished. Kept for honesty, trimmed short for pacing.
- **No Open Country completion on film.** The session had no portal-retire
  take; the cut covers Open Country with the orbital, the woods drive, and the
  roundup-ring aerial instead. The win beat belongs to Home Field Classic.
- **Scenic grass wind pans on wall clock**, so it moves subtly slower in
  captured frames than in live play. Water was fixed (explicit sim-time
  update); grass wind was accepted as invisible at trailer pacing.
- **The Discord cut is bitrate-capped** (7.5 Mbps VBV) to stay under the 25 MB
  attachment limit; dense-grass shots carry visible encoder softness that the
  YouTube master does not have.
- **puppeteer-capture fallback was not built.** The Mediabunny primary plus
  the frame-dump fallback covered every shot; the third recorder stays out
  until something needs it.

## Posting

Matt posts both cuts manually (his voice, his accounts). Nothing in this
pipeline uploads anywhere.
