# Trailer post copy - v2.6.1 web beta

> DRAFT for Matt; edit freely, post manually. Upload map, titles,
> descriptions, and Discord posts for the two trailer cuts. Files referenced
> live in `tools/trailer/output/` (gitignored media).

## Upload map

| Platform | Video | Thumbnail |
|---|---|---|
| YouTube (standalone trailer) | `sds-v2.6.1-youtube.mp4` (89.9s, 327 MB) | `thumb-yt-carve.jpg` (recommended), `thumb-yt-island.jpg` or `thumb-yt-clean.jpg` as alternates |
| Your Discord (announcement) | `sds-v2.6.1-discord.mp4` (23s, 17.5 MB, attaches inline) | none needed |
| Three.js Discord showcase | `sds-v2.6.1-discord.mp4` (same file) | none needed |

All audio is the game's own soundtrack (first-party, CC BY-SA 4.0). No OBS
audio, no third-party recordings, nothing Content ID can match.

## YouTube

**Title (recommended)**

> Sheep Dog Sim v2.6 web beta trailer - herd up to 5,000 sheep in your browser

**Title (shorter alternate)**

> Sheep Dog Sim v2.6 beta trailer

**Description**

```
Sheep Dog Sim is a free browser herding sim. You are the dog.

The v2.6 web beta covers three public scenes (Home Field, Rolling Hills, Open Country), solo modes from a calm 30-sheep pasture up to 5,000-sheep chaos, 2-4 player online rooms, leaderboards, mobile controls, and gamepad support. No install, no signup, no ads.

Play: https://sheepdogsim.com
Source: https://github.com/matthew-kissinger/sds

Everything here is real gameplay or in-engine camera work from the current build. The music is the game's own soundtrack. Built with Three.js.

0:00 Rolling Hills at dusk
0:13 Home Field, a round start to finish
0:34 Solo Chaos, 5,000 sheep
0:47 5,000 spawn in on Rolling Hills
0:55 Open Country
1:12 What is in the v2.6 beta
1:18 A real victory
```

## Three.js Discord showcase thread (update post)

Attach `sds-v2.6.1-discord.mp4`. The thread's last update post was v1.0
(2025-12-02), so this covers the whole v1.0 to v2.6 arc. Written to match
Matt's prior posts in that thread: "Update!" opener, plain section headers
with colons, bare `thing - detail` lines, concrete numbers, links at the
bottom. (Matt's own posts use an opener exclamation mark; that is his idiom,
kept deliberately.)

```
Update! v2.6 web beta is out. A lot has changed since v1.0:

Worlds and modes:
Three public scenes now - Home Field (flat fenced pasture), Rolling Hills (180m island at dusk), Open Country (380m island with a multi-stage portal objective)
Solo Chaos - 5,000 sheep, up from the old 1,000 cap
Bark is a core skill - directional steering, cooldown, taught in the tutorial
A fourth island exists but stays in the lab until it is ready

Rendering:
WebGPURenderer is the default desktop path now (Three.js r185, WebGL fallback)
Far trees are octahedral impostors selected by a GPU compute cull pass
New art pass - fence kit, gate, farmhouse, hybrid grass default
First load went from 8.8s to 0.9s at 20 Mbps

Multiplayer:
Moved off WebRTC onto Cloudflare Workers + Durable Objects
60Hz authoritative server sim with client prediction - the same deterministic sim code runs in the browser and in the Durable Object
MessagePack delta protocol - only the sheep that changed go over the wire
Leaderboards, with ranked runs split from practice

The clip is 23 seconds of real gameplay from the current build. Full trailer: <YouTube link>

Play: https://sheepdogsim.com/
itch.io: https://matthewkissinger.itch.io/sheep-dog-sim
Source: https://github.com/matthew-kissinger/sds
```

## Checklist before posting

- YouTube thumbnail upload accepts JPEG under 2 MB; all three candidates
  comply.
- Swap `<link after upload>` in both Discord posts for the real YouTube URL.
- The pre-ship prose greps (`grep -c` for em-dashes, `grep -i` for stale
  framing) pass on this file.
