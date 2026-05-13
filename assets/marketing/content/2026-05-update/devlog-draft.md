# Devlog Draft — Sheep Dog Sim, May 2026

## Working Title

Sheep Dog Sim Update: The Tiny Three.js Herding Prototype Got Out of Hand

## Opening

Sheep Dog Sim started as a small Three.js experiment: a dog, a flock, a pasture, and the question of whether real-time boid herding could actually feel good in a browser instead of just being a fun demo gif.

The current build is a lot closer to the game I kept circling around in my head. The old flat field is still in there, but Sheep Dog Island has become the thing that finally feels like the visual identity: heightfield terrain, shoreline water, grass, trees, rocks, fog, time-of-day lighting, and sheep spilling around the edge of the island while the dog tries to make sense of the mess.

Open Country pushes the same systems into a larger space with a round-up-to-portal objective. It is still a sheepdog game, just with more strange little browser-game ambition than the first version admitted.

## What Is New

- Sheep Dog Island is now the default visual identity.
- Open Country has a multi-stage objective: gather sheep first, then drive them to the portal.
- Shoreline foam is driven by the visible heightfield instead of a depth-prepass path that broke on iOS Safari.
- The HUD was reorganized into layout slots so objective text, score pills, camera mode, and mobile controls stop fighting each other.
- Leaderboards are now scene-scoped instead of mixing incompatible scene/mode results.
- Completion telemetry and score-error logging now go through the Worker/D1 stack, so failures are visible.
- The Cloudflare stack now carries the public game: Pages frontend, Worker API, Durable Objects for rooms, D1 for persistence.

## Technical Notes

The rendering path is still Three.js/WebGL. Sheep and grass use GPU instancing, and the terrain/world systems have been iterated heavily around browser constraints rather than moving to a different engine. The current direction is to keep the stack understandable, shippable, and easy to validate instead of chasing a bigger-engine rewrite every time something gets hard.

The multiplayer backend is no longer the original setup. It has been migrated to Cloudflare Workers and Durable Objects, with shared deterministic simulation modules used by both the browser and the Worker. That said, the newest Open Country multiplayer objective still needs a proper paired playtest. The automated tests cover the contracts, but I am not calling that fully re-certified until it has been played end-to-end with two clients.

## Media Slots

Status: image-led for now. The first automated video captures did not pass quality validation, so do not use the generated MP4s in this devlog. Regenerate clips only after the optimization pass, latest accepted EZ-Tree update, tree re-bake/compression/impostor pipeline, and tree-spacing review are complete. Older screenshots in `assets/images/` and `cycle*-validation/` are historical/reference material and should not be used as current devlog media unless deliberately recaptured.

Hero:

- `assets/marketing/og/og-rh-sunset.webp`

Deferred clip targets:

- Sheep Dog Island angled orbit with dog and flock readable.
- Low dog pass where the dog crosses screen space cleanly.
- Wide herding arc with natural flank/drive movement.

Future body images:

- Sheep Dog Island dog-action still.
- Open Country portal poster.
- Field grass-scale fallback.

## Close

There is still a lot to validate and polish, especially the newest multiplayer island-scene work. I also want another optimization/tree/capture pass before pretending I have proper trailer material.

But the game is no longer just a tech demo with a flock. It has scenes, modes, progression hooks, a real public build, browser validation, and enough of its own identity that it is worth showing again.

Play: https://sheepdogsim.com/

Source: https://github.com/matthew-kissinger/sds
