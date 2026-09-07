# Current local audio candidate

Two approved Mixkit recordings now replace generated birds and panting; crowd and
farmhouse chimes are removed. See [integration and license](../../docs/audio-approved-integration.md).
The manifest is authoritative. The retained ElevenLabs provenance below applies
only to the remaining short effects, not the Mixkit recordings.

# Audio source ledger

The remaining 12 short effects were generated for Sheepdog Sim with the account
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

The retained footfall, huff, gate and fence sources received deterministic
FFmpeg loudness passes. Exact targets are recorded per asset in the manifest:

```text
ffmpeg -i <source>.mp3 -af loudnorm=I=<target>:TP=<peak>:LRA=7 \
  -codec:a libmp3lame -b:a 128k <normalized>.mp3
```

The current 14-file media set is 2,186,181 bytes. Runtime code keeps the approved
birds and pant independently controllable, while 12 short effects remain
separate one-shots. Both licensed FLAC files and their WAV originals are ignored
by git.

## Earlier listening decisions

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

The leaf-rustle loop was removed on 2026-09-07 after owner isolation identified
its repeated mechanical, wispy texture. Birds remain the ambient bed; no
replacement source was added. The removed source and recipe remain in Git history.

Footstep originals are retained in `sources/`; `tools/prepare-footsteps.mjs`
bakes the softer FLAC review candidate. These two files total 49,079 bytes.
