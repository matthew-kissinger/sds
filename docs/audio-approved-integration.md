# Approved recordings

The owner selected Mixkit's “Little birds singing in the trees” (17) and
“Medium size dog walking pant” (58). The former generated birds and panting,
crowd murmur and farmhouse chime have been removed. Existing baas, bells, barks,
footsteps and short game cues are preserved.

## Rights and reproducibility

[Mixkit Sound Effects Free License](https://mixkit.co/license/#sfxFree) permits
incorporating these sounds in video-game end products. It prohibits distributing
the recordings on their own or with source files. They are not AGPL assets.
`assets/audio/licensed/` is ignored, including originals and prepared runtime files.
Do not force-add that directory or include it in a source archive.

The owner approved the running mix and authorized commit, push and deployment on
2026-09-07. CI, preview and production builds acquire the originals directly from
Mixkit, verify source hashes and prepare the files before building. Only the game
artifact is uploaded; licensed files remain excluded from source distribution.
A new checkout must run `node tools/prepare-approved-audio.mjs --download` with
FFmpeg installed before tests or build. Downloads fail closed on changed sources.

Download the originals using the normal Download Free SFX controls:

- [Birds](https://mixkit.co/free-sound-effects/bird/): “Little birds singing in the trees”,
  save as `assets/audio/licensed/sources/mixkit-17.wav`.
- [Dog](https://mixkit.co/free-sound-effects/dog/): “Medium size dog walking pant”,
  save as `assets/audio/licensed/sources/mixkit-58.wav`.

Run `node tools/prepare-approved-audio.mjs` (or `--download` to acquire originals). The manifest records original and
runtime SHA-256 digests, byte sizes, license, direct source URLs and recipe.
Original birds are 16-bit stereo WAV; panting is 24-bit stereo WAV. Both are
44.1 kHz. Prepared files use lossless FLAC at the original sample rate and channel
count. No lossy re-encoding, denoising, loudness compression or pitch change is used.
FLAC reduces transfer without discarding samples after the documented edits.

## Playback

Birds have a 150 ms entrance, 600 ms tail and twelve seconds of silence after each
8.33-second phrase. Panting uses a 200 ms linear overlap at the wrap. Two streamed
voices replace four. The existing single graph owns unlock, bus controls, spatial
pant position, pause, visibility, restart and disposal. Gain changes settle over
roughly a few seconds, avoiding rapid changes with each simulation tick.

Healthy walking has no panting. Pant gain begins after 12 percent stamina loss,
increases with exertion, and fades as stamina recovers. The original quiet source
is preserved; final mix audibility requires owner listening. The short bird take
still repeats, even with its quiet gap. A longer recording may eventually be
preferable if the repetition becomes noticeable.

Technical checks establish playback and lifecycle behavior, not subjective
quality. Final owner approval concerns the running mix, including ten minutes of
idle listening and ordinary play. The owner has approved this mix and authorized production deployment.

Bitexact container output suppresses encoder-version metadata; the approved PCM
is unchanged. Tests verify the resulting runtime file sizes and SHA-256 digests.

## Footstep review amendment

The owner accepted the revised footsteps and requested commit, push and deployment.
The existing generated footstep originals are preserved under assets/audio/sources.
`node tools/prepare-footsteps.mjs` produces filtered mono FLAC files, with no further
lossy encoding. The scheduler uses lower gain and 0.82-0.86 playback rates.
Birds and panting are unchanged. These footstep files are repository-owned media,
not Mixkit recordings, and can accompany their recipes in source control.
