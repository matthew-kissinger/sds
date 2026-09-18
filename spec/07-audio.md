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

Owner decision (2026-09-07): omit leaf rustle after isolated listening identified
its mechanical, wispy texture. Keep the existing birds as the ambient bed.
The previously rejected dedicated wind and insect loops also remain absent.
This overrides those layers in the original ambient-bed description above.

Owner listening decision (2026-09-07, superseding the preceding source choice):
use Mixkit 17 birds and Mixkit 58 panting for local integration review. Preserve
the existing three baa variations. Omit the rejected crowd murmur and farmhouse
wind chime; six spatial baa voices represent the flock without a continuous bed.
Bird phrases include quiet gaps; panting follows exertion and stamina recovery.
These two licensed recordings are a scoped exception to the CC0/owned rule below
for the game end product. Their license prohibits source-file redistribution:
keep both originals and prepared files out of git. Owner approved the running mix and deployment on 2026-09-07. Builds acquire
hash-verified originals and publish only the game artifact, never source media.

## Mixing rules

- Master ducking: events duck the ambient bed by 2-3 dB, never silence it.
- Flock voice cap: at most 6 concurrent baas, chosen by proximity + agitation. The distance-filtered crowd murmur that once stood in for the rest is omitted by the owner listening decision above and nothing replaces it: six spatial voices are the flock.
- Everything routes through group buses (ambient / flock / dog / world / ui) with per-bus sliders in settings.
- Loudness discipline: integrated level sits low; the loudest moment (completion resolve) peaks gently. No moment should make a listener reach for the volume key.
- Reduced-motion setting also softens audio transients (accessibility posture is one toggle, both senses).
- The listener is the camera, and the camera is two rigs, so each rig's geometry is a mixing constant and moving the listener off the camera invalidates every constant in this rule and the three that follow it. Spatial sources use the inverse distance model with one reference distance per rig rather than a distance set in absolute metres, interpolated on the camera's own Classic-to-Follow weight. Classic did not move: its eye still stands 53.24 m from a source at the dog, so it keeps what the mix was approved at, 18 m on the one-shots and 20 m on the pant. The Follow eye went from 21.05 m to 29.10 m in landscape, which costs a source at the dog 2.14 dB on the one-shots and 1.96 dB on the pant, so the Follow end carries 24.9 and 27.65. One-shot panners are refDistance 18 to 24.9, maxDistance 180 to 249, rolloff 0.7; the pant, the only spatial loop, is 20 to 27.65, 190 to 263, rolloff 0.65. A one-shot keeps the reference it was built with, because it cannot outlive a swap; the pant is retuned in place, because it can. Landscape is what the Follow end fits: at the dog the one-shots hold to 0.005 dB and the pant to 0.00 dB, against -0.14 and -0.13 dB in portrait.
- One reference serving both rigs is a different rule, not a simplification of this one, and it does not hold. It is what the round before this shipped, and it made every diegetic source 2.30 to 2.68 dB louder in Classic - the camera the game loads in - 2.41 dB at the dog and 2.27 dB on the pant.
- The fit is aimed at the near field, which is where the distance scales with the rig. Running the scheduler's own selection rule over clustered flocks puts 98.4% of chosen baas inside the 34 m agitation radius, and weighting the one-shot classes by their cadences and command gains puts about three quarters of the flow at the dog itself. In Follow, sources past that radius come out up to 3.06 dB louder than they were, 3.32 dB in portrait, which is roughly 7% of the flow under the same weighting. A second fitted parameter narrows it - 25.8 m at rolloff 0.92 halves the field-wide mean, 2.35 dB to 1.11 dB - but moves the weighted residual only from 0.33 to 0.12 dB in landscape while taking portrait from 0.37 to 0.39 dB, so one reference per rig is what ships. It is a near-field fit and not a listener move, and only a listener move is exact.
- Flock voice selection reads a ground-plane distance, so it takes the rig's stand-off rather than its eye-to-dog, and it rides the same per-rig blend. Classic keeps the 0.015 it ships with at its 34.71 m stand-off. Follow's stand-off went from 20 m to 26 m, a factor of 1.3, and the camera-distance term `1 / (1 + c * d^2)` is unchanged when c is divided by the square of it: 0.015 / 1.69 = 0.00888. Over 20,000 seeded clustered flocks at 25, 75 and 200 sheep, against the sheep the approved mix picks, the blend agrees 100% in Classic and 95.0 to 96.0% in Follow, where one constant for both rigs agreed 98.3% of the time in Classic. Portrait's stand-off factor is 32.5 / 24 = 1.354 and would want 0.00818; one constant cannot hold both orientations and landscape is the majority of play.

## Asset provenance

Same recipe rule as visual assets: every sample has an in-repo provenance note (recorded, synthesized in-repo, or licensed with the license file committed). CC0/owned sources only. Suno-generated material is acceptable for the pentatonic phrase and ambience beds if it wins the critic loop; provenance still recorded.

## Critic loop

Audio deliverables are judged by a critic agent against: does the field sound alive with your eyes closed, does agitation read audibly before it reads visually, does 10 minutes of idle listening stay pleasant (no fatiguing loops, no obvious repeats), and does the completion resolve land emotionally. Recordings for the loop are captured from the running game, not auditioned as bare files.
