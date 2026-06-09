# Sheep Dog Sim — Press Kit

A free, browser-based herding game where you guide your sheepdog across four biomes: a flat pasture, rolling sunset hills, a wild island with a magical portal, and a boot-shaped survival island with wolves after dark. Zen, satisfying, no microtransactions, no signup.

## Tagline

**Herd 5,000 sheep in your browser. No install. Free to play. Source-readable under AGPL-3.0.**

## Headline features

- **Four biomes:** Home Field (flat starter pasture), Rolling Hills (180 m sunset island with corral), Open Country (380 m island with multi-stage gather→drive→portal objective), Newsheepdogland (boot-shaped survival island with a homestead pen, day/night cycle, and wolves after dark).
- **Six modes:** Practice (30 sheep, no timer), Classic (200), Extreme (1,000), Insane (3,000), Chaos (5,000), plus 2–4 player multiplayer co-op + competitive + timed.
- **Authoritative 60 Hz multiplayer:** Cloudflare Workers + Durable Objects + D1, MessagePack-over-WebSocket state frames, adaptive jitter buffer.
- **5 languages:** auto-detected via i18next — English, Spanish, Portuguese, Japanese, Simplified Chinese. (Community PRs welcome for more.)
- **Mobile-capable web controls:** touch joystick, responsive HUD, gamepad support, and PWA installability. Native mobile store releases are still proof-level work, not a current launch claim.
- **Cinematic visuals:** Hosek-Wilkie analytic sky with day/night presets, parallax cloud layer, anime-style water with sun-glint, hundreds of thousands of grass blades with directional wind, real obstacle-aware boid flocking.

## Why it exists

A relaxed, no-stakes corner of the modern web. Most casual games push notifications, ads, or energy meters — Sheep Dog Sim has none of that. Open the URL, herd some sheep, close the tab.

The codebase is also deliberately easy to read — ~10k lines of vanilla JavaScript on the client, ~600-line TypeScript Cloudflare Worker on the server, deterministic boid + physics modules shared byte-identically by both. Forkable in an afternoon.

## Quick facts

- **Studio:** solo developer, Matthew Kissinger.
- **Engine:** vanilla JavaScript + Three.js 0.184 (no game engine, no JSX, no codegen, no wasm).
- **Backend:** Cloudflare Pages + Worker + Durable Objects + D1.
- **License:** [AGPL-3.0-or-later](LICENSE) source code, [CC BY-SA 4.0](LICENSE-ASSETS) assets. Free to play; forks and hosted modifications must preserve attribution and publish corresponding source. Earlier releases retain the terms recorded in their historical artifacts; see [LICENSING.md](LICENSING.md).
- **Platforms:** Web (any modern browser), PWA-installable on mobile, full gamepad support on desktop.
- **Languages:** English, Spanish, Portuguese, Japanese, Simplified Chinese.

## URLs

- **Play:** [sheepdogsim.com](https://sheepdogsim.com)
- **About:** [sheepdogsim.com/about](https://sheepdogsim.com/about)
- **Source / contact:** [github.com/matthew-kissinger/sds](https://github.com/matthew-kissinger/sds)

## Screenshots & social cards

Current 1920×1080 WebGPU scene captures:

- [`assets/scenes/entrance/newsheepdogland.webp`](assets/scenes/entrance/newsheepdogland.webp). Newsheepdogland survival island, the sheepdog on the dusk shore facing the mountain. Default public social image.
- [`assets/scenes/entrance/field.webp`](assets/scenes/entrance/field.webp) — Home Field with the sheepdog and flock in grass.
- [`assets/scenes/entrance/rolling-hills.webp`](assets/scenes/entrance/rolling-hills.webp) — Rolling Hills shoreline capture.
- [`assets/scenes/entrance/open-country.webp`](assets/scenes/entrance/open-country.webp) — Open Country with the sheepdog facing the portal objective.

Older 1200×630 social-card assets remain under [`assets/marketing/og/`](assets/marketing/og/) for historical release material.

Legacy in-game screenshots also still in [`assets/images/`](assets/images/):
- `sds-zoomedout.png` — overhead pasture shot
- `sds-zoomedin-play.png` — gameplay, sheep + dog mid-herd
- `sds-menu.png` — start screen with biome picker
- `sds-dog-selection.png` — dog breed select

Reuse policy: screenshots, video captures, and excerpts from this press kit may be used in articles, reviews, social posts, and academic discussion under fair-use conventions. Please credit "Sheep Dog Sim by Matthew Kissinger" with a link to [sheepdogsim.com](https://sheepdogsim.com).

## Creator bio

Matt Kissinger — solo developer building games and tools at the intersection of generative AI and creative web tech. Sheep Dog Sim is one of several browser-first projects shipped with TypeScript + Three.js + Cloudflare. Reach out: [matt.m.kissinger@gmail.com](mailto:matt.m.kissinger@gmail.com).

## Press contact

Email: [matt.m.kissinger@gmail.com](mailto:matt.m.kissinger@gmail.com) — usually within 48h.
