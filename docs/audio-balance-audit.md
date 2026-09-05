# Calm soundscape audit

2026-09-05. Added by owner request during the active presentation/feel goal.

## Requested outcome

Latest integrated receipt: `captures/audio/combined-final-mix/` includes the
distance-dependent crowd filter. The 200-sheep running mix captured19.979 s with
no runtime/network errors, -37.2 LUFS integrated and -15.7 dBFS true peak.
These are technical capture results, not a listening verdict. The previous
10-minute recording predates that filter; owner listening at normal saved
volume settings remains part of the combined playtest.

Reduce the fatiguing wind-like whoosh and excessive sheep noise. Make the field
pleasant and alive over a long session, with space between sounds. Preserve clear
dog, movement and progress feedback. This is lane 9 of the active work plan.

## Copy-ready lane goal

Analyze and refine the existing Sheepdog Sim soundscape into a calm, spacious
pastoral mix: identify and soften the reported wind-like whoosh, give sheep
calls natural quiet intervals across 25, 75 and 200 sheep, and preserve clear
dog and gameplay feedback. Deliver a reviewable before/after listening comparison,
including a 10-minute fatigue recording, with bounded mobile/PC audio cost and
explicit listening and device-validation results. Do not equate quieter meter
readings with an aesthetically accepted result.

## Baseline findings before the candidate mix

- `assets/audio/README.md` records removal of both the insect loop and dedicated
  wind loop after owner rejection. `app/src/audio/assets.ts` currently ships five
  continuous layers: birds, leaves, crowd, farmhouse chime and pant. No dedicated
  wind source is registered. The reported whoosh must be isolated in the running
  version; do not assume a wind file is responsible or restore rejected sources.
- `environment.ts` raises leaves to `0.68 * treelineNear`. Leaves are nonspatial
  in `soundscape.ts`, so their position-dependent gain still fills the soundstage.
  Birds are also nonspatial. These are candidates for isolation, not an auditory
  diagnosis made from code.
- `scheduler.ts` allows a foreground baa every 28 ticks, or 0.467 seconds at
  60 Hz. Individual sheep wait longer, but 200 independently eligible sheep can
  keep the global interval saturated. Clips last about 1.36–1.65 seconds, before
  pitch adjustment. This permits overlapping, nearly continuous foreground calls.
- `oneShotVoices.ts` caps flock one-shots at six. That cap limits concurrency,
  not perceived busyness. The separate crowd loop is not counted in that cap.
- `environment.ts` keeps crowd gain at `0.15 + agitation * 0.25`, including calm
  moments. It is spatialized at the flock center but never naturally rests.
- `soundscape.ts` has no distance low-pass for the crowd layer, despite the
  distance-filtered murmur described in `spec/07-audio.md`. Its 14.04-second
  source loops at 0.991 playback rate. Rate offsets prevent synchronized seams,
  but do not remove repetition within an individual source.
- Agitated calls can duck ambience. `graph.ts` applies a 2.5 dB duck with a
  45 ms attack and return by 340 ms. Frequent calls may create audible pumping;
  confirm by listening before changing the envelope.

These findings establish scheduling/mixing risks, not an auditory diagnosis.

## Current candidate and remaining analysis

The working source now contains a first balance pass. `scheduler.ts` spaces
foreground calls by roughly 3.5–6 seconds when calm and 2–4.5 seconds at maximum
agitation, using seeded variation rather than a regular pulse. Individual sheep
eligibility can make the actual gaps longer. Call gain is reduced, while stable
voice identity and proximity selection remain.

`environment.ts` lowers the maximum leaf level from 0.68 to 0.25 and gives the
crowd layer slow, unequal phrases with quiet gaps instead of an always-present
bed. `soundscape.ts` adds fixed high/low-pass filters to leaves and crowd. These
are candidate mix changes. The crowd low-pass now gradually moves from 1,300 Hz
within 20 m to 650 Hz at 100 m, using the existing filter with a 250 ms smoothing
time. Both camera/listener movement and flock movement update it. A graph test
checks near/far recovery and verifies that movement creates no additional filters
or panners. This closes the implementation gap, not the listening acceptance.

Independent code review also caught two correctness defects: an in-flight duck
recovery could override a changed ambient slider, and the 64-sheep sample ignored
the tail of a 75-sheep flock. Slider writes now cancel earlier automation, and
sampling includes both ends of the flock within the same 64-sample budget.
Regression checks cover the active duck/zero-volume sequence and tail movement.
Tone-node end-of-playback disconnection remains a separate lifecycle review item;
scheduled oscillator stops alone do not prove explicit graph cleanup.

The reported whoosh still needs isolation in the running game. Leaf rustle,
loop repetition and mix ducking are plausible contributors, not confirmed
causes. A successful result must soften the texture and reduce fatigue without
removing the sense of an inhabited field. Source replacement, if needed, follows
listening evidence rather than assuming that a dedicated wind loop exists.

Acceptance remains open: capture and compare the candidate with the baseline,
listen to isolated layers, and complete the scenarios and fatigue review below.
Scheduler tests and loudness measurements do not establish a zen aesthetic.

## Captured evidence

- `captures/audio/calm-audio-baseline-200/`: short baseline running mix.
- `captures/audio/calm-audio-candidate-200/`: candidate running mix with stable
  build hashes and no runtime errors.
- `captures/audio/calm-audio-fatigue-200/`: 599.984-second idle recording, one
  running audio context and no runtime errors. Listening acceptance is pending.
- These recordings precede the distance-dependent crowd filter and are historical
  candidate evidence; capture the revised mix before judging its final balance.
- `captures/audio/calm-leaves-isolated-200/` and `calm-leaves-edge-200/`: selected
  leaf source routed through the actual filters, gain and ducking buses while
  other source nodes are silenced by tools-only instrumentation. Both captures
  have stable build hashes and no runtime errors. Their peaks are -50.8 and
  -49.6 dBFS respectively: very quiet in this candidate, not a diagnosis of the
  earlier whoosh. Existing ambient recordings may themselves contain background
  textures, so investigate the bird bed as well as the leaf bed.

The probe starts from fresh browser settings. This does not reproduce any
different saved volume settings in the owner's browser. Audio source counters
measure created nodes, including silenced sources during isolation, not the
number of audible voices. No headphone, speaker or physical-phone listening
acceptance has been established by these receipts.

## Implementation and review tasks

1. Capture the current production mix and isolate existing layers through the
   normal audio buses and tools-only capture path. Verify version/source hashes,
   saved slider levels and camera position. Compare center field versus treeline,
   idle versus herding, and 25/75/200 sheep.
2. Identify the actual whoosh source. Compare softer spectral balance, restrained
   level, gentler envelopes and longer quiet intervals before considering source
   replacement. Keep old rejected wind/insect layers removed. Any replacement
   needs editable recipe/source, provenance, license and digest.
3. Give foreground baas a deliberate density budget and quiet gaps independent
   of flock size, while keeping proximity, agitation and stable sheep voices.
   Avoid rigid metronomic repetition and repeated selection of the same voice.
4. Make distant crowd activity subtle and spectrally distant, allowing calm rests.
   Coordinate it with foreground calls rather than continuously stacking both.
5. Balance birds, leaf rustle, pant, bell, barks, footsteps and chimes together.
   Keep useful gameplay events legible without making the entire game silent.
   Revisit ducking only against captured pumping and event intelligibility.
6. Verify mute, pause/resume, restart, mobile unlock, bus controls, reduced
   transients and bounded voice/lifecycle behavior with focused tests.
7. Capture before/after running-game recordings, including a 10-minute fatigue
   listen using `tools/audio-capture.mjs`. Check quiet idle, active herding and
   completion on headphones and available speakers/devices. Record listening
   limitations; waveform/loudness analysis cannot establish aesthetic acceptance.
8. Use separate audio critique against `spec/07-audio.md`, retain rejected
   iterations, and present a concise listening comparison for owner review.

## Acceptance

Wind-like texture is unobtrusive, with no distracting repeated whoosh/buzz or
pumping; sheep sound alive without a continuous chorus; agitation is readable
without an exhausting loudness/density jump. Long idle listening stays pleasant,
and dog/progress feedback remains clear. Required lifecycle tests pass and audio
cost remains bounded. Listening acceptance remains open until actual recordings
and review support it.
