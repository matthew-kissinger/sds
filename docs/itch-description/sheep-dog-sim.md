# itch.io description draft — Sheep Dog Sim

> Draft for Matt's review. itch.io supports basic Markdown + a small whitelist of inline HTML in the project description field. Edit before posting; this is a starting point, not final copy.
>
> **Where it goes:** itch.io project dashboard → Edit game → Description (the long-form field above "Embed options"). The short tagline goes in "Short description or tagline" near the top of the same page.

---

## Short description / tagline (≤ 120 chars)

```
Herd 5,000 sheep across three biomes in your browser, with friends, WebGPU, and WebGL fallback. Free, no install.
```

Variants if you want a different angle:

- `A zen 3D herding game. Three biomes, six modes, 5,000 sheep, real-time multiplayer. Free in your browser.`
- `Border collie. 5,000 sheep. Cloudflare-edge multiplayer. Open the tab and herd. No install, no signup, source-readable.`
- `Three biomes, six modes, real boid flocking, browser-native multiplayer. Source is public under AGPL.`

---

## Long-form description

A free, browser-based **herding sim** where you guide a sheepdog across three hand-built biomes — flat starter pasture, rolling sunset hills, and a wild island with a magical portal. Open the tab, herd some sheep, close the tab. No install, no signup, no microtransactions.

### Three biomes

- **Home Field** — flat fenced pasture, single perimeter pen with a gate. The starter.
- **Rolling Hills** — 180-metre island with rolling heightfield, lightning-zap corral, golden-hour mood. The hero scene.
- **Open Country** — 380-metre island with a multi-stage objective: gather sheep into the round-up zone for 2 seconds, then drive them through a magical portal at the north shore.

### Six modes

- **Just Play** — 30 sheep, no timer, no fail state. The practice paddock.
- **Solo Classic** — 200 sheep, leaderboard.
- **Solo Extreme** — 1,000 sheep.
- **Solo Insane** — 3,000 sheep.
- **Solo Chaos** — 5,000 sheep. The flock becomes the antagonist.
- **Multiplayer** — 2–4 player real-time co-op + competitive + timed rooms, with shareable invite URLs and a sandbox editor.

### What's actually under the hood

- **GPU-instanced sheep** in a single draw call, with custom vertex shaders animating legs and heads per instance.
- **Force-based steering** against real obstacles — sheep and dog route around tree trunks and rocks via a deterministic spatial index, not invisible walls.
- **Authoritative 60 Hz multiplayer** on Cloudflare Workers + Durable Objects + D1, with MessagePack-over-WebSocket state frames and an adaptive jitter buffer.
- **Hundreds of thousands of grass blades** with directional wind, dog-bends-grass interaction, per-scene density tuning, stochastic-dither LOD.
- **Hosek-Wilkie analytic sky** with day/night presets, parallax cloud layer, water with sun-glint.

### Free to play, source-readable, no ads

- **Free.** No ads, no microtransactions, no energy meters, no notifications. Just the game.
- **Open source.** Free to play, source-readable, and forkable under AGPL-3.0; assets are CC BY-SA 4.0. Modified or hosted versions must preserve attribution and publish corresponding source. Source: [github.com/matthew-kissinger/sds](https://github.com/matthew-kissinger/sds).
- **Five languages.** English, Spanish, Portuguese, Japanese, Simplified Chinese — auto-detected via i18next.
- **Mobile controls.** Touch joystick, responsive HUD, gamepad support, and PWA installability are in place; Android WebGPU performance work remains active.

### Native version on the web

For the smoothest experience — including native-resolution displays, lower latency on multiplayer, and the latest hotfixes — the game also lives at **[sheepdogsim.com](https://sheepdogsim.com)**. The itch.io build is the same codebase, packaged as an HTML5 bundle for itch's runtime.

### Source / about / press

- Source: [github.com/matthew-kissinger/sds](https://github.com/matthew-kissinger/sds)
- About: [sheepdogsim.com/about.html](https://sheepdogsim.com/about.html)
- Press kit: [github.com/matthew-kissinger/sds/blob/main/PRESSKIT.md](https://github.com/matthew-kissinger/sds/blob/main/PRESSKIT.md)
- Contact: matt.m.kissinger@gmail.com

---

## Tags (itch metadata field)

Paste into the "Tags" field, comma-separated:

```
3d, animals, atmospheric, browser, casual, dog, herding, multiplayer, open-source, relaxing, sheep, simulation, threejs, webgl, zen
```

(itch caps tags at 10, so trim to taste. If you want max discovery: `casual, simulation, browser, multiplayer, relaxing, atmospheric, animals, 3d, threejs, open-source`.)

## Genre + classification

- **Genre:** Simulation (with Casual / Sports cross-tag)
- **Made with:** Three.js, Vite, Cloudflare Workers
- **Average session:** A few minutes
- **Inputs:** Keyboard, mouse, touchscreen, gamepad
- **Accessibility:** Configurable text size, color blind friendly (no critical state encoded only in colour), keyboard-only playable.
- **Multiplayer:** Server-based networked multiplayer + local multiplayer on same device.

## Devlog post (optional, separate from description)

If you want a short devlog post to flag the new build — itch.io's devlog feed nudges followers/community-feed traffic. Suggested title + body (you'd post this from the project's "Edit game → Devlog" tab):

**Title:** `Heightfield fix shipped to itch — terrain renders correctly on RH and Open Country again`

**Body:**

> The mid-distance dark-blue terrain band on Rolling Hills and Open Country was a path-resolution bug specific to the itch.io HTML5 deploy: scene defs reference heightmap binaries via root-absolute paths (`/terrain/...`), which `sheepdogsim.com` (Cloudflare Pages, root-served) handles fine but itch's `html-classic.itch.zone` CDN serves from a build-id subdirectory, so the fetch hit the wrong root and 404'd. The game then fell back to flat terrain.
>
> Fixed by routing every absolute-root asset path through Vite's `BASE_URL` at runtime via a `resolveAssetUrl` helper. `BUILD_TARGET=itchio` builds now produce `./terrain/...` fetches that resolve relative to the build root, not the CDN root. Same codebase otherwise — internal refactors only since the last itch push (game state decomposition, heightfield API cleanup) — no gameplay changes.

(Skip if you'd rather just push the build silently.)

---

## What's NOT in this draft

- **A "what's new" / "changelog" section.** itch.io's description field is mostly read by first-time visitors. Devlog posts are the better channel for "since the last build" notes — covered above as optional.
- **Pricing widget config.** Project is set free, presumably with optional tip — leave that alone.
- **Cover image / screenshots.** Already in place; not refreshing as part of this push.
- **Embed options / display orientation.** Existing iframe size + landscape preference should stay as-is.
