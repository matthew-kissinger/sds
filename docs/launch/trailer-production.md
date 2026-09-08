# Launch trailer and stills

## Current edit — September 8, 2026

The owner's third review cut is a warm, 42.5-second introduction to being a
sheepdog, knowing the flock and bringing it home. It replaces the earlier
real-time captures. All nine shots fill 1920 × 1080 without browser chrome or
letterbox bands. The captions use ordinary game language, with no flock-size
statistics. A 15-second teaser and six complementary PNG/JPEG stills accompany
the trailer. Public posting remains the owner's action.

The selected soundtrack is **BossaBossa by Kevin MacLeod**. The gallery also
retains Bossa Antigua and Carefree for comparison, plus a silent master. The
new exports contain music only: live game audio was excluded because its
real-time Web Audio clock cannot follow an offline capture. The decoded final
0.35 seconds of the selected master and teaser are digital silence. This
removes game sounds from the ending; it does not identify the sound the owner
heard in the earlier mix. Owner listening decides the musical result.

Review: http://127.0.0.1:5488/?revision=3

Outputs: ignored `captures/trailer/deliverables/`, with `sheepdog-sim-v3-*.mp4`
filenames. The selected upload is `sheepdog-sim-v3-C-bossa-piano.mp4`.

## Shot decisions

| Sequence | Intent and current treatment |
| --- | --- |
| Opening | Normal full-effort movement through a dense part of a 200-sheep flock, then a gradual bend. Start later in the run so the dog is immediately visible; the sheep visibly divide. |
| Flock response | Retained overhead view of the flock responding, with no count caption. |
| Names | Higher camera, looking over sheep backs rather than under their bodies. Actual pointer hover changes between three off-center sheep: Sage, Yarrow and Morris. |
| Dog Studio | Normal coat changes, including the softer, rounder eye recipe. Keep controls visible. |
| Flock Studio | 200 sheep, normal breed/color changes and multiple actual name hovers. The native picker now uses the preview cursor coordinates even when the Studio orbit overlay handles pointer events. |
| Approach, entry, completion | Three excerpts from one completed 25-sheep game. Gradual analog steering and effort act through the normal input reader. Sheep enter the gate and the game completes normally. |
| Ending | A brief flyover before the game title and playable address. |

The user approved the walking control, softer eyes, performance work and HUD
for release. The first release is `b14e11e1f529f249d4a9c67a564492f92c64d74c`.
The final Studio name retake uses the local production build containing picker
fix `d1f144988eff5615c688f3ff82b9ac3acd3ca6e5`. Its normal-input desktop WebGPU,
touch emulation and forced WebGL2 checks are in `local-hover.json`. Release
evidence and the separate critical review are summarized in `STATUS.md`.

## Capture method and limits

`tools/trailer/offline.mjs` stops the application's automatic render loop and
advances its normal frame subscribers and shader clock by exactly 1/60 second
for every output frame. It waits for the GPU, then captures the full viewport
into a 60 fps H.264 stream. Render time may exceed wall-clock playback time;
this is a filming technique, not a real-time performance benchmark.

The tools inject capture access locally, stage only presentation cameras, and
feed normal gamepad input. They do not write sheep positions, simulation
constants, completion flags or score state. Uncaptured portions can advance
without GPU drawing, but completion presentation is warmed with rendering
enabled. No capture mode, dependency or query parameter ships in the client.
All identity/score requests receive a local 503 during filming and checks.

The herding run and its replay matched all 18,178 checked simulation frames,
including the first entry at frame 13,007 and normal full completion. This is
a seeded input replay receipt, not a claim that all independent grazing shots
are pixel-identical on every machine. Synthetic gamepad input and touch
emulation do not establish physical-device validation.

Source timing is checked on decoded frame presentation timestamps, avoiding
H.264 B-frame packet reordering. All shot frames must be spaced 16.667 ms apart.
The finished exports are H.264, square-pixel 1080p60; non-silent choices have AAC.
The gallery checks all cuts, music switching and its phone layout. Separate
visual review checks composition and readable gameplay; codec checks cannot
judge music taste or the owner's final creative preference.

Receipts: `offline-film-report.json`, `offline-herding-report.json`,
`verification.json`, `local-hover.json` and `live-controls.json` under
`captures/trailer/`. Keep generated media, downloaded music and browser
profiles ignored. The gallery and local preview servers intentionally remain
available for owner review; capture browsers close after each run.

## Music provenance

These are copyrighted works offered under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/),
not public-domain recordings. Include the selected credit in the upload text.

| Choice | Official source |
| --- | --- |
| Selected piano bossa | [BossaBossa — Kevin MacLeod](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600055) |
| Alternative bossa | [Bossa Antigua — Kevin MacLeod](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1700069) |
| Playful acoustic alternative | [Carefree — Kevin MacLeod](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400037) |

Selected credit: “BossaBossa” by Kevin MacLeod (incompetech.com), licensed under
CC BY 4.0. Excerpt edited and faded for this trailer. Link the official source
and license. Download receipts/digests are in `music-receipts.json`; generated
`POSTING-NOTES.md` and the review gallery carry all three credits.

No procedural music was made. Earlier Suno CLI attempts returned
`auth_expired`; the trailer uses the licensed recordings above.
