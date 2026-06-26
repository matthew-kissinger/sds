# Steam Store Brief - Sheep Dog Sim

Status: draft for Matt review. Public Steam submission is blocked until signing, assets, support/privacy URLs, install/uninstall proof, and Steam account actions are complete.

## Product

- Title: `Sheep Dog Sim`
- Candidate version: `v2.4.0`
- Platform to list first: Windows only
- Build path: Electron desktop package
- Public website: `https://sheepdogsim.com`
- Source: `https://github.com/matthew-kissinger/sds`

## Short Description

Herd sheep across four browser-born 3D scenes, from a quiet starter pasture to a survival island with wolves after dark.

## Long Description

Sheep Dog Sim is a 3D herding game about reading flock motion, cutting off escapes, and driving sheep home with a fast border-collie-style dog.

Play quiet practice runs, chase leaderboard times, push huge flocks in extreme solo modes, or survive Newsheepdogland after dark when wolves start thinning the flock. Online rooms support 2-4 player co-op and competitive herding through the same Cloudflare backend used by the web version.

The desktop build packages the current web game into a Windows app. It supports keyboard and mouse, gamepad input, local settings, fullscreen, WebGL by default, and explicit WebGPU on supported hardware.

## Tags and Categories

Suggested tags:

- Simulation
- Casual
- Arcade
- Physics
- Third Person
- Animals
- Multiplayer
- Co-op
- Competitive
- Family Friendly

Suggested categories/features to claim only after review:

- Single-player
- Online co-op
- Online PvP
- Shared/Split Screen PvP only if current local multiplayer UX is manually confirmed
- Full controller support only if Steam/controller test pass is run

Do not claim Steam Cloud, Steam Achievements, Steam Leaderboards, Steam Workshop, Steam Trading Cards, or Steam Networking in the first submission.

## Screenshots

Needed before submission:

- Home Field practice with dog, sheep, and pen visible.
- Rolling Hills golden-hour herding with HUD visible.
- Open Country portal/gathering screenshot.
- Newsheepdogland survival/wolves screenshot.
- Multiplayer room or in-game co-op screenshot, only if the Steam build is intended to advertise online multiplayer.

Steam review expects gameplay screenshots, not concept art or marketing-text images.

## Capsule and Library Assets

Required assets from Steamworks docs:

- Header capsule: 920x430
- Small capsule: 462x174
- Main capsule: 1232x706
- Vertical capsule: 748x896
- Library capsule: 600x900
- Library header: 920x430
- Library hero: 3840x1240
- Library logo: 1280 wide and/or 720 tall, transparent PNG

Current status: blocked. Existing scene captures are useful references, but final Steam capsule art needs approved key art and a legible logo treatment.

## Trailer

Status: human-required.

Recommendation: do not block Coming Soon on an elaborate trailer if the page can launch with strong screenshots, but capture a short honest gameplay trailer before public release if Steam is a serious channel.

## Controller Notes

Gamepad support exists in the web/native app, but Steam controller claims need a final controller pass from the packaged build. Until that pass is done, keep controller language conservative.

## Save and Cloud Policy

Current saves/settings are local browser/Electron storage. Do not claim Steam Cloud. If users need cross-device progress later, design and test Steam Cloud or account-code recovery as a separate feature.

## Privacy and Support

Blocked until Matt approves:

- Privacy policy URL covering telemetry, multiplayer identity, leaderboard submissions, Worker logs, and crash/log handling.
- Support URL or support email for Steam players.

## Review Risks

- Unsigned Windows binaries may trigger trust friction.
- Steam page must not describe web-only features that are not in the Windows build.
- Store screenshots and capsules must accurately show current gameplay.
- External links inside the Steam description should be avoided.
- Multiplayer should be described as Cloudflare-backed online rooms, not Steam networking.
- If the game is listed as free, the pricing/revenue expectations should be deliberate.

## Publication Status

`blocked`

Reason: current packaged app proof is green, but public Steam submission still requires paid/account actions, final assets, signing/support/privacy decisions, install/uninstall proof, and Matt review.
