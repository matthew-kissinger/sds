# Cycle 83 - Wolves, Bark, and Newsheepdogland Night Polish

> Drafted and closed 2026-06-09. The two feature branches landed as draft PRs
> first (`#59` wolf/bark feel, `#60` night arc), then merged together to `main`
> for the player-visible `v2.2.4` release closeout.
>
> Release proof: tag `v2.2.4` at `936531f`; Deploy run `27206254394` green;
> live Pages root 200 with `/assets/main-DVswN68n.js`; live bundle contains
> `range:24`, wolf repel/bark flee tuning, and the internal night preset;
> direct Worker `/healthz` 200 with `{"ok":true,"worker":"sds-worker"}`.

## Status

Closed. Cycle 82 was already closed when this cycle started. This plan
authorized the narrow shared-sim bark/wolf tuning in PR 1 and the visual-only
day-night polish in PR 2. The final `main` closeout ships both together as
`v2.2.4`.

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
- Darken the Newsheepdogland night read, put the visual sun below the horizon at
  the existing `NIGHT_T = 0.80`, smooth day/night keyframe interpolation, and
  make co-op survival visuals smoothly approach Worker `survival.t`.

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
- Atmosphere tests pin the internal `night` preset, the below-horizon sun at
  `NIGHT_T`, the zero-intensity sun billboard below the horizon, and smooth
  co-op visual time sync.
- Browser proof covers morning/day/dusk/night luma and sun direction, with
  night at `t=0.80` darker than dusk/day and `sunY < 0`.

## Out Of Scope

- The feature PRs themselves carried no version bump, release tag, changelog
  entry, deploy, or live proof; the final `main` closeout handles the release.
- No replacement wolf from a paid, NC, or unverifiable source.
- No changes to the day-clock phase timing; PR 2 stayed visual-only.
