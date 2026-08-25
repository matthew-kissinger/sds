# Audio source review

Updated 2026-08-24.

## Release decision

The deterministic PCM synthesis set introduced in commit `8106b85e` was a
technically reproducible experiment, not an owner-accepted replacement for the
existing sound assets. It reached the public version 3 cutover because the
release notes incorrectly promoted technical bake acceptance into creative
acceptance.

The local correction restores the 17 ElevenLabs-generated MP3 sources from
commit `6380fe64`. It does not change the audio graph, mixer buses, scheduler,
gesture unlock, lifecycle handling or runtime Web Audio tones.

The restored set contains no wind loop and no insect loop. Those two sources
were removed after owner listening identified repeated buzz and harshness. The
remaining animal, ambience and world sources are restored byte-for-byte.

## Source ledger

`assets/audio/manifest.json` records the provider, model, output format,
generation date, exact prompt, requested duration, prompt influence, processing,
byte size and SHA-256 digest for every MP3. `assets/audio/README.md` records the
generation and FFmpeg normalization commands.

The complete restored media set is 1,255,526 bytes. It was generated with the
account owner's ElevenLabs subscription and contains no sampled or downloaded
third-party recordings. Public redistribution remains subject to the account
plan and ElevenLabs terms.

## Acceptance boundary

Automated checks can prove file identity, decoding, integration, lifecycle and
budgets. They cannot approve sound character. The restored set must be listened
to in the running local game before it becomes a production candidate.
