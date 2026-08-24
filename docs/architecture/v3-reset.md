# Sheepdog Sim 3 architecture reset

Sheepdog Sim 3 is a clean-room client rebuild of the game previously shipped
from the `sds` repository. It keeps the parts that were proven through play and
removes the accumulated product surface that made the old client difficult to
change safely.

## Why the reset happened

The version 2 client grew through more than one hundred development cycles. Its
individual additions were usually reasonable, but the additions interacted:

- flock sizes became modes with different start paths;
- old and new interfaces remained active together;
- renderer-specific material implementations had to stay visually aligned;
- compatibility layers kept retired systems reachable;
- browser globals and event bridges made ownership unclear;
- validation tools depended on production-only switches.

By the end of that line, a local visual or gameplay change could require edits
across unrelated systems. The problem was cumulative architecture, not one bad
feature or one bad decision.

## What survived

The rebuild retains the work that had clear evidence behind it:

- the deterministic fixed-step flock simulation and tuned herding feel;
- the field dimensions, pen behavior, dog movement, bark impulse and cameras;
- build-time terrain and placement recipes;
- browser-first input across keyboard, gamepad and touch;
- performance measurement, deterministic fixtures and production probes;
- the existing public project identity, domain and release history.

The simulation was moved behind a strict boundary. It imports no renderer,
React, DOM or network code. The game presents one field through one application
entrypoint and one renderer-material system.

## What version 3.0 cuts

The initial version 3.0 release is intentionally smaller:

- one field;
- one goal, which is to guide every sheep into the attached pen;
- move, sprint and bark;
- 25, 75 or 200 sheep;
- local personal best times;
- optional global solo times under a server-random or player-edited name;
- desktop and mobile controls;
- WebGPU with WebGL2 fallback through the same renderer path.

Multiplayer and the 5,000-sheep GPU experiment are separate future product
decisions. Their earlier implementations remain available in version 2 tags
and repository history, but they do not belong in the version 3.0 runtime or
deployment graph. The solo-times client is deliberately smaller than the old
network layer: it registers an optional name, submits completed 25, 75 and 200
sheep runs, and reads those three boards. Registration and every score request
are fail-soft, so a slow or unavailable service never blocks Play or local
completion.

## Architectural fences

The rebuild uses several explicit constraints because each one prevents a
failure observed in version 2:

1. Flock size is data, not a mode flag.
2. The frame loop is a short ordered set of systems.
3. Simulation code has no rendering, browser or network dependency.
4. Player interface and scene read the same state store.
5. Materials use one TSL implementation for both renderer backends.
6. Retired interfaces and compatibility aliases are removed with their callers.
7. Production contains no validation-only control path.
8. Every runtime asset has an editable source or reproducible in-repository
   recipe and a documented license.
9. Deterministic fixtures change only through an explicit recorded decision.
10. A release artifact identifies its exact source commit.

## Migration boundary

Version 3 is imported into the public `sds` repository as a curated source
snapshot. The public repository keeps the complete version 2 history and tags.
The clean-room implementation history remains separate so the public branch can
show the product boundary clearly instead of carrying local review artifacts.

The import includes runtime source, deterministic fixtures, required tests,
asset sources and recipes, and concise public documentation. It excludes local
captures, profiling archives, agent handoff notes, environment files, generated
build output and deferred backend implementations.

The existing Worker receives one bounded score-partition change before the
version 3 Pages cutover. A Worker-only allow-list recognizes `field-v3` with
exactly 25, 75 and 200 sheep. Version 3 then reuses only the established
register, rename, score and leaderboard endpoints. Its rows are isolated from
version 2 by `scene_id = 'field-v3'`; no schema migration, shared simulation
definition, room route, WebSocket or Durable Object changes. Play and local
times have no Worker dependency, and rollback does not require removing score
rows.

## Future work

Future features must earn their way back into the product through a written
contract and a complete ownership path. The small solo-times integration is the
model: an isolated data partition and a dedicated `app/src/scores` boundary,
not a route back to the version 2 multiplayer client.

The test for any addition is simple: it must make the one-field herding game
better without weakening the boundaries that made the rebuild necessary.
