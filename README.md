# Sheepdog Sim

One dog, one flock, one field. A calm, cel-shaded browser game about guiding
sheep through a pasture gate. Get behind the flock, move patiently and use a
well-timed bark to bring stragglers home.

**[Play Sheepdog Sim](https://sheepdogsim.com)** ·
[Controls and help](https://sheepdogsim.com/support) ·
[Report a bug](https://github.com/matthew-kissinger/sds/issues)

![Sheepdog Sim field and title](app/public/og/sheepdog-sim.png)

## In the field

- Choose a flock of **25, 75 or 200 sheep** and guide every sheep into the pen.
- Move, sprint and bark with keyboard, gamepad or touch controls.
- Switch between the overhead **Classic** camera and the closer **Follow** view.
- Find the entrance through an in-world highlight and an offscreen direction cue.
- Personalize your dog’s coat and name, choose flock breeds and name individual
  sheep in **Studio**. Compact phone controls leave room for the animal preview;
  larger screens use a side panel.
- Explore a golden-hour field with dense grass, authored trees, moving clouds,
  an animated farmhand and a quieter, spatial soundscape.
- Keep local personal bests and optionally compare online solo times for each
  flock size. Edit the running name assigned to your device.

Online identity and score requests are fail-soft. Play, completion and local
personal bests continue when the score service is unavailable.

No account is required to play. This is the single-player version 3 client;
campaign, survival and multiplayer modes are not included.

## Controls

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Move | W A S D or arrows | Left stick | Left joystick |
| Sprint | Shift | Right trigger or A / Cross | Sprint button |
| Bark | Space | B / Circle or X / Square | Bark button |
| Change camera | C | Y / Triangle | Camera button |
| Pause | Escape or pause button | Use the on-screen pause button | Pause button |

After stamina runs out, release Sprint and press again to start another sprint.
Holding it down through recovery does not automatically restart it. Partial
stick movement provides a slower walking pace.

Settings includes keyboard remapping, reduced motion, quality, audio levels and
a colorblind dog marker. In Studio, drag the preview or use the orbit controls;
choose a camera preset to inspect the dog from another angle.

## Run locally

Requirements:

- Node.js 22 or newer;
- a current browser with WebGPU or WebGL2.

```bash
git clone https://github.com/matthew-kissinger/sds.git
cd sds
npm ci
npm run dev
```

Open the local URL printed by Vite.

The client runs without a local score server. To run the full test suite,
including the retained score-service tests, install its dependencies too:

```bash
npm ci --prefix worker
```

Useful commands:

```bash
npm test
npm run lint
npm run typecheck
npm run typecheck:worker
npm run build
npm run preview
npm run probe:boot
npm run probe:release
npm run check:discovery
```

Run `npm run build` before the preview and built-artifact checks. See
[the testing guide](spec/09-testing.md) for validation expectations.
Current evidence and remaining device
or performance limitations are tracked in [STATUS.md](STATUS.md).

## Architecture

The application is split into four deliberate boundaries:

```text
sim/       deterministic fixed-step herding simulation
app/       React Three Fiber, Three.js, input, audio and player interface
assets/    runtime assets plus editable sources and bake manifests
tools/     deterministic bakes, diagnostics and release verification
worker/    retained identity and score service; separate from the v3 client
```

The simulation imports no Three.js, React, DOM or network code. The renderer
uses one TSL material path for WebGPU and WebGL2. Zustand is the shared state
authority for the scene and player interface.

The field is assembled from reproducible source:

- terrain, grass, treeline and scatter placement are deterministic bakes;
- the active treeline is an original, procedurally authored sculpted-oak family,
  baked into instanced geometry with no external model loading;
- sheep, the skinned dog and farmer, fences and farm structures are code-authored;
- material and atmosphere systems are TSL source;
- every audio file is a committed, provenance-tracked source with its provider,
  prompt, processing, duration, size and digest recorded in the audio ledger;
- authoring concepts are retained separately from runtime assets.

Read [the version 3 architecture reset](docs/architecture/v3-reset.md) for what
was retained from version 2, what was removed and why the codebase was rebuilt.
Asset-specific recipes and provenance are documented under [assets/](assets/),
including [trees](assets/treeline/README.md), [dog](assets/dog/README.md),
[farmer](assets/farmer/README.md) and [audio](assets/audio/README.md).

## Release discipline

Production deploys use the manually dispatched
[Pages workflow](.github/workflows/deploy.yml), pinned to a full commit SHA on
`main`. It installs dependencies, runs lint, typechecks, tests and the build,
archives the artifact, then verifies the live release and discovery pages.

Contributor checks additionally cover:

- deterministic fixtures and a running production preview;
- a built-artifact scan that permits only the score REST client and excludes
  rooms, WebSockets, multiplayer, deferred scale and debug code;
- complete 25, 75 and 200 sheep runs on both renderer backends;
- desktop and mobile interaction, layout and audio checks;
- asset source, license, secret and local-artifact checks;
- release and rollback procedures for the static client.

The deployed [release manifest](https://sheepdogsim.com/release.json) records
the source commit and artifact identity. Device coverage and performance numbers
in [STATUS.md](STATUS.md) describe measured configurations, not a guarantee for
every phone or PC. Production publication requires owner approval.

Public builds contain no multiplayer client, room flow, bundled Worker or
5,000-sheep code. Solo-time boards use the existing score service through the
isolated `field-v3` partition. Multiplayer remains a future product decision,
not a dormant launch flag.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md), then read
[AGENTS.md](AGENTS.md) and the relevant document under [spec/](spec/). The spec
is the product contract. When implementation and spec disagree, document the
decision rather than adding a compatibility branch.

Bug reports should include the browser, device, renderer backend, flock size,
seed when known, reproduction steps and console output. Security issues should
follow [SECURITY.md](SECURITY.md).

## License

Source code is licensed under
[GNU AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.html), copyright
Matthew Kissinger.

Runtime and authoring assets are covered by the asset ledger and
`LICENSE-ASSETS`. Do not assume a code license applies to third-party or
generated media. Hosted modified versions must provide corresponding source and
retain the applicable notices.
