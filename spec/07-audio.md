# 07 - Audio

A zen game lives or dies on its soundscape. Audio is a v1 pillar with its own critic loop, not a fast-follow. sds barely had audio; there is nothing to lift, which is a gift.

## The soundscape

Layered ambient bed + spatialized events, all through Web Audio (three's AudioListener/PositionalAudio or a thin custom graph; decide in phase 0 spike, one system either way, owned by `app/src/audio/`).

- **Ambient bed (always on, ducked under events)**: warm wind base with slow intensity swell tied to the visual wind octaves, distant songbirds (density falls as the flock agitates, returns as it calms), leaf rustle from the treeline when the camera nears it, soft insect shimmer in the grass at close camera.
- **Flock**: individual baas with per-sheep pitch variation (seeded per instance, so the same sheep always has the same voice), spatially panned, rate scaled by agitation; lamb bleats if the lamb variant ships. A gentle bell on one sheep (the bellwether) as a diegetic flock-position cue.
- **Dog**: footfalls on grass with gait rate, one bark sample set (3-4 takes, round-robin, never machine-gunned; server rate limit doubles as the audio rate limit), panting after sprint, a contented huff when sitting.
- **World**: gate creak on swing, wood knock when sheep brush the fence, the pen chime family (see below), farmhouse ambience (faint wind chime) within radius.
- **Progress**: each penned sheep plays the next note of a slow pentatonic phrase, so filling the pen literally composes a melody; the final sheep resolves the phrase. This is the score system: no looping music track in v1, the field plus the pentatonic progress phrase IS the music. (A composed track can be evaluated later against this baseline; the spec bets that tuned quiet beats a loop.)
- **UI**: soft felt-like taps, one warm confirm, one gentle back. Nothing skeuomorphic-clicky.

## Mixing rules

- Master ducking: events duck the ambient bed by 2-3 dB, never silence it.
- Flock voice cap: at most 6 concurrent baas, chosen by proximity + agitation; the rest are represented by a distance-filtered crowd murmur layer.
- Everything routes through group buses (ambient / flock / dog / world / ui) with per-bus sliders in settings.
- Loudness discipline: integrated level sits low; the loudest moment (completion resolve) peaks gently. No moment should make a listener reach for the volume key.
- Reduced-motion setting also softens audio transients (accessibility posture is one toggle, both senses).

## Asset provenance

Same recipe rule as visual assets: every sample has an in-repo provenance note (recorded, synthesized in-repo, or licensed with the license file committed). CC0/owned sources only. Suno-generated material is acceptable for the pentatonic phrase and ambience beds if it wins the critic loop; provenance still recorded.

## Critic loop

Audio deliverables are judged by a critic agent against: does the field sound alive with your eyes closed, does agitation read audibly before it reads visually, does 10 minutes of idle listening stay pleasant (no fatiguing loops, no obvious repeats), and does the completion resolve land emotionally. Recordings for the loop are captured from the running game, not auditioned as bare files.
