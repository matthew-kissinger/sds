# 00 - Vision and burn-down charter

## What Sheepdog Sim 3 is

A zen, painterly, cel-shaded herding game. One fenced pasture at golden hour. One verb set: move, sprint, bark. One goal: guide every sheep through the gate into the pen. Three flock sizes (25, 75, 200) as the only difficulty axis. Version 3.0 is single-player with local personal bests and optional online solo times. Desktop and mobile ship together. Rendering is WebGPU-first with an automatic WebGL2 fallback inside the same renderer.

Sheepdog Sim 3 succeeds if a first-time player is herding sheep within five seconds of page load, if the field looks like a painting in motion, and if the codebase stays small enough that one person can hold it in their head.

## What Sheepdog Sim 3 is not

Sheepdog Sim 3 is defined as much by its cut list as its feature list. These are decisions, not a backlog:

- No biomes, islands, mountains, day/night survival, or wolves. One field.
- No mode roster. Flock size is a config value, not a mode. There shall be no `if (gameMode === ...)` branch anywhere in this codebase.
- No dog roster. One dog, authored and animated beautifully.
- No sandbox, fence editor, shape editor, achievements, capture mode, replay system, attract mode, or tutorial state machine.
- No i18n in v1. English only.
- No dual render paths. One renderer (WebGPURenderer), one material authoring language (TSL). A parallel material implementation for any backend is a spec violation.
- No streaming, impostors, or LOD apparatus. The field loads all-cold before first interaction.
- No scene picker or entrance flow. The game boots into the field.
- No multiplayer or network dependency for play in version 3.0. The solo-times
  service is optional and fail-soft. A failed identity, submission or board read
  never blocks Play, completion or the local personal best.
- No 5,000-sheep player path in version 3.0. Scale work remains a separate
  experiment until it completes through the pen and passes real-device review.

## Why a clean room

The version 2 client grew to roughly 275 client files and 72,000 lines of JavaScript orbiting a 3,561-line god object, with four game-start paths, three coexisting interface generations glued by roughly 47 window globals, 44 duplicated WebGPU material files, and mode branches across 31 files. Each step was individually reasonable. The lesson is not "we wrote bad code," it is "accretion without a fence becomes the architecture." This specification therefore names the failure modes explicitly so contributors do not rebuild the same shapes with new names.

What survives in version 3.0: the deterministic sim math (the herding feel itself), the tuned feel constants, and the scene-as-data plus bake-at-build-time pipeline ideas. The multiplayer backend research remains documented for later work but is not part of the launch application or deployment. See spec/02 through spec/04.

## Relationship to version 2

- Version 3 was built in a separate clean-room repository, then imported into
  this public repository as the new client. The complete version 2 history,
  `v2.6.4` tag and `release/2.x` rollback branch remain available.
- Version 3.0 replaces the client at sheepdogsim.com only after exact-commit
  release approval. It gets a new
  server-random leaderboard identity on first contact. Version 2 score rows do
  not migrate: version 3 submits only to the `field-v3` score partition.
- The retained score Worker and shared version 2 service code are isolated from
  the version 3 application. Version 3 does not import them.
- The clean-room source and this repository are AGPL-3.0-or-later under the same
  copyright holder.

## Experience pillars

Every phase, asset, and system is judged against these four, in order:

1. **Calm.** The game never yells. No timers ticking in red, no failure states, no punishment. Tension comes from the flock's skittishness, relief from watching them settle. Sound, motion, and UI all bias toward softness.
2. **Painterly.** Every frame should read as a hand-made image: confident shapes, a disciplined palette, cel-shaded light with painterly texture underneath. If a screenshot could pass for concept art, it is done.
3. **Alive.** The field breathes. Grass bends around bodies, wool jiggles, ears flick, dust kicks, the light leans. Juice is a first-class system with its own spec (spec/06).
4. **Immediate.** Page load to herding in under five seconds on a mid-range phone. The UI is nearly invisible.

## Success criteria for the spec phase

- An agent cold-starting from this repo can build phase 0 of the roadmap without asking a single question answered somewhere in spec/.
- Every "forbidden" item names the sds failure mode it prevents, so the rule survives contact with a persuasive-sounding shortcut.
