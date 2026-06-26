# itch.io Submission Details

Status: refreshed for the v2.4.0 launch candidate on 2026-06-26. Do not publish the itch update until Matt approves the Cycle 110 final launch packet.

## Basic Info

**Title:** Sheep Dog Sim

**Project URL:** sheep-dog-sim (`https://[username].itch.io/sheep-dog-sim`)

**Short description/tagline:**
Free browser herding game with solo challenges, survival wolves, 2-4 player rooms, mobile controls, and flocks up to 5,000 sheep.

**Classification:** Games

**Kind of project:** HTML (browser game)

**Release status:** Released

**Pricing:** Free or pay what you want. Suggested donation can remain `$2.00` if Matt wants tips enabled.

## Upload

Preferred launch path: upload the generated itch build, then also link to `https://sheepdogsim.com` as the canonical always-current site.

Build command:

```bash
npm run build:itchio
```

Upload source:

- `dist/` after `BUILD_TARGET=itchio`
- Zip the contents of `dist/`, not the parent folder, unless the current itch dashboard workflow already expects a parent folder.

Do not upload the normal web or native build to itch. The itch build uses relative asset paths for itch's HTML runtime.

## Embed Options

**Embed in page:** Yes, if uploading ZIP.

**Viewport dimensions:**

- Recommended: 1280 x 720
- Minimum practical fallback: 960 x 540

**Frame options:**

- Mobile friendly: yes
- Automatically start on page load: no
- Fullscreen button: yes
- Enable scrollbars: no
- SharedArrayBuffer support: no

## Page Description

Use `docs/itch-description/sheep-dog-sim.md` as the long description source.

## Genre

Primary: Simulation

Secondary tags/genres: Casual, 3D, Multiplayer, Animals.

## Tags

Itch caps visible tags; prefer this 10-tag set:

```text
simulation, casual, browser, 3d, multiplayer, animals, dog, sheep, herding, open-source
```

Alternates if needed:

```text
webgl, threejs, relaxing, survival, gamepad
```

## AI Generation Disclosure

Answer: Yes - this project was developed with AI assistance. The exact wording should match the current itch disclosure UI.

## Community

Recommended: enable comments. Watch first-week feedback for browser/device failures, especially itch iframe fullscreen and mobile touch behavior.

## Screenshots to Upload

Use the fresh WebGPU gameplay captures:

1. `assets/scenes/entrance/field.webp`
2. `assets/scenes/entrance/rolling-hills.webp`
3. `assets/scenes/entrance/open-country.webp`
4. `assets/scenes/entrance/newsheepdogland.webp`
5. Optional: multiplayer or large-flock mode, only if the screenshot clearly shows the feature.

## Launch Notes

- The canonical site remains `https://sheepdogsim.com`.
- The itch build should be smoke-tested after upload before it is announced.
- If the itch upload regresses, restore the previous upload in the itch dashboard and point players back to the canonical site.
