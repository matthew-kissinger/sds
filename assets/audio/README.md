# Audio source ledger

Every shipped audio file is original, deterministic synthesis produced by the
repository's dependency-free Node recipe. No recording, sample library,
provider, model, account, downloaded source, or external encoder is used.

```text
npm run bake:audio
npm run check:audio-bake
```

`tools/bake-audio.mjs` writes all 17 mono PCM WAV files and `manifest.json`.
The check command rebakes into a temporary directory and byte-compares every
file and the ledger. The manifest records the synthesis description, fixed
seed, recipe version, duration, format, sample rate, bit depth, byte size,
SHA-256, peak, RMS level and loop-seam delta for each asset. The files and the
recipe are licensed AGPL-3.0-or-later with the game.

## Runtime matrix

| Category | Files | Loop | Runtime bus |
| --- | --- | --- | --- |
| Meadow | birds, leaves | yes | ambient |
| Flock | crowd, three sheep calls, bell | crowd only | flock |
| Dog | three barks, two footfalls, pant, huff | pant only | dog |
| Field | farmhouse chime, gate creak, fence knock | chime only | world |

The progress phrase, completion resolve and interface tones remain small Web
Audio oscillator voices in `app/src/audio/graph.ts` and
`app/src/audio/tones.ts`. They have no media asset.

The five continuous sources remain independently controllable. The runtime
streams those loops after gesture unlock and decodes the twelve short sounds
sequentially after the scene is ready. It preserves the ambient, flock, dog,
world and interface buses, spatial panning, six-sheep voice cap, 2.5 dB ambient
ducking, reduced-transient behavior, pause and visibility lifecycle, and local
fail-safe startup.

## Deliberate omissions

The insect and wind loops remain absent. Owner playtesting rejected their
continuous buzz and repeating high-frequency texture. The new source set does
not recreate either layer under another name.

## Review evidence

The media ledger test validates every WAV header, duration, digest, recipe and
loop seam. The graph, scheduler, fatigue and lifecycle suites validate the
runtime behavior. `tools/audio-capture.mjs` records the post-bus running-game
mix and measures integrated loudness, loudness range and true peak. Audio still
requires a separate listening critic and owner review because byte identity and
meter values do not establish animal-call quality.
