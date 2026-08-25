# Audio source ledger

All 17 MP3 files in this directory were generated for Sheepdog Sim with the account
owner's ElevenLabs subscription. The initial set was generated on 2026-08-22.
They contain no sampled or
downloaded third-party recordings. The exact prompt, model, output format,
duration, loop intent, processing, byte size, and SHA-256 digest for every file
are recorded in `manifest.json`.

The source recipe is the repository-independent generator shipped with the
Codex `threejs-audio-generator` skill:

```text
python threejs_audio_asset.py sfx --prompt <manifest prompt> \
  --duration <manifest duration target> \
  --prompt-influence <manifest value> \
  --output-format mp3_44100_128 [--loop] --out <manifest file>
```

The runtime synthesizes the pentatonic progress phrase, completion resolve, and
UI tones with Web Audio oscillators. Those sounds therefore have source code,
not opaque media files. Generated media remains subject to the account owner's
ElevenLabs plan and terms; confirm redistribution rights before a public launch.

The independently controlled birds, leaves, crowd, pant, farmhouse chime,
footfall, huff, gate and fence sources received deterministic
FFmpeg loudness passes. Exact targets are recorded per asset in the manifest:

```text
ffmpeg -i <source>.mp3 -af loudnorm=I=<target>:TP=<peak>:LRA=7 \
  -codec:a libmp3lame -b:a 128k <normalized>.mp3
```

The complete media set is 1,255,526 bytes. Runtime code keeps birds, leaves,
crowd murmur, farmhouse chime and dog pant independently
controllable, while short events remain separate one-shots. The old mixed
meadow foundation bed was removed so none of those layers can double.

The generated insects loop was removed from both the runtime and this ledger
after owner playtesting identified a continuous non-animal buzz. Its isolation
receipt is under `captures/audio/buzz-isolation/`; no animal source changed.

The original wind loop was replaced after Matt identified a second buzz near
00:10 in the running-game capture. Forensics matched the mix to a harmonic comb
embedded near the middle of that source, rather than to a loop seam, duplicate
playback, sheep, or bell audio. Matt rejected the replacement after its rough
high-frequency opening repeated at 00:01 and 00:21. The wind layer is therefore
removed from runtime, manifest and shipped media rather than subjected to a
third speculative generation. Candidate and rejection evidence remains under
`captures/audio/task1-owner-review/` and
`captures/audio/task1-wind-replacement-fatigue/`; no other audio source changed.
