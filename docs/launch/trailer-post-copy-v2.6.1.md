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

## Your Discord (announcement channel)

Attach `sds-v2.6.1-discord.mp4`. Last announcement was v2.3.0, so this one
carries everything since.

```
v2.6 web beta is live at https://sheepdogsim.com

It has been a while since v2.3.0, so here is what landed since:

- Bark is a core skill now: directional steering, a visible cooldown, a sound-wave cone when it fires, and its own step in the tutorial (v2.5).
- The beta centers on three public scenes: Home Field, Rolling Hills, and Open Country. The fourth island stays in the lab until it is ready (v2.6).
- New art pass on the pasture: fence kit, gate, farmhouse, homestead props, and a hybrid grass default. The runtime moved to Three.js r185 (v2.4).
- Leaderboards now lead with the easy scored boards, and ranked runs are split from unranked practice (v2.5).
- Support and privacy pages, a telemetry opt-out in settings, and a public lobby discovery fix (v2.6, v2.6.1).

The clip is 23 seconds of real gameplay from the current build. Longer cut on YouTube: <link after upload>.
```

## Three.js Discord (showcase)

Attach `sds-v2.6.1-discord.mp4`.

```
Sheep Dog Sim, a browser herding sim where you are the dog. Three.js r185 on the WebGPURenderer path (WebGL fallback), flocks up to 5,000 instanced sheep, a compute cull pass driving tree LOD with octahedral impostors past 200m, and a deterministic sim shared between the browser and a Cloudflare Durable Object for 2-4 player rooms.

Play: https://sheepdogsim.com
Source: https://github.com/matthew-kissinger/sds

Trailer cut from real gameplay; longer version on YouTube: <link after upload>.
```

## Checklist before posting

- YouTube thumbnail upload accepts JPEG under 2 MB; all three candidates
  comply.
- Swap `<link after upload>` in both Discord posts for the real YouTube URL.
- The pre-ship prose greps (`grep -c` for em-dashes, `grep -i` for stale
  framing) pass on this file.
