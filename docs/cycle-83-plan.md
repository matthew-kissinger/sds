# Cycle 83 - Wolves, Bark, and Newsheepdogland Night Polish

## Status

Active for PR 1: `codex/cycle83-wolf-bark-feel`.

Cycle 82 is closed. This plan authorizes the narrow shared-sim changes in this
branch only. PR 2 (`codex/cycle83-night-arc`) handles visual day-night polish as
an independent branch and does not need to touch shared simulation files.

## Scope

- Make wolves threat-readable in the live survival scene and in `?wolf=1`.
- Keep the Quaternius CC0 animated wolf rig, but fix the runtime material and
  scale read. The official Quaternius Ultimate Animated Animal Pack page was
  checked on 2026-06-09 and marks the pack as CC0 and untextured, and the
  current runtime `assets/models/Wolf.glb` inspect shows no textures. No paid,
  NC, or unverifiable replacement asset is accepted for this branch.
- Make the bark audible and reliable by using the existing audio files and
  unlocking/resuming Web Audio directly from the bark command.
- Tune bark feel to Medium/Long: sheep reach is 24 m inside the existing forward
  cone; wolves flee within 45 m for 2.0 s.

## Shared-Sim Authorization

Authorized shared changes:

- `shared/BarkImpulse.js`: `DEFAULT_BARK_CONFIG.range` changes from 12 m to
  24 m. The cone and strength stay unchanged. This intentionally changes the
  bark sim-baseline fixture and only that fixture.
- `shared/survival/tuning.js`: `WOLF_TUNING.fleeRepelRadius` changes from 22 m
  to 45 m and `WOLF_TUNING.barkRepelSecs` changes from 1.6 s to 2.0 s. This is
  survival-only wolf state, not the normal sheep tick.

Do not touch `shared/scenes/types.js` in this cycle.

## Acceptance

- Unit tests pin the new bark range and wolf repel constants.
- Worker bark tests prove a medium-distance sheep is affected by bark.
- Worker survival tests prove a wolf roughly 40 m from the dog flees on bark.
- The sim-baseline diff is limited to
  `tests/sim-baseline/__fixtures__/bark-impulse-60hz.json`, because bark range
  is an intentional shared-sim feel change.
- Browser proof covers `?wolf=1` and Newsheepdogland survival at night with
  readable wolves, bark audio context/play evidence, sheep at medium range, and
  wolf repel at long range.

## Out Of Scope

- No version bump, release tag, changelog entry, deploy, or live proof in these
  feature PRs.
- No replacement wolf from a paid, NC, or unverifiable source.
- No changes to the day-clock phase timing; PR 2 is visual alignment only unless
  visual-only fixes prove insufficient.
