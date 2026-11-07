# Static page screenshots

Frames of the running game, used on the about, support, herding guide,
multiplayer and Indonesian pages. They are our own picture of the client. No
third-party asset is in them beyond what the game itself ships and records.

License: AGPL-3.0-or-later, under the repository `LICENSE`, as project-authored
output of the running game. The typeface in the frames keeps its SIL Open Font
License 1.1 (`assets/fonts/README.md`). Provider: none, the game renders each frame
and the browser encodes it. Captured 2026-11-05 and 2026-11-06.

Nothing here reaches the game. The game page references them only as
`screenshot` URLs in its JSON-LD, so a player's first load does not fetch them.

## How a frame is made

`tools/capture-site-shots.mjs` plays the game with the keyboard and touch input
a player has, then re-encodes each frame through the browser's own WebP encoder
at 1000 pixels wide and quality 0.8.

- `field-25`, `flock-200`, `flock-200-field` and `touch-controls` come from the
  production build, at seed `20260821`, with WebGL2 forced and the score API
  blocked. `flock-200-field` is the `flock-200` round with the interface hidden,
  so the Indonesian page shows no English text. `touch-controls` is browser
  touch emulation at 844 by 390. It shows the layout and says nothing about how
  the game runs on a phone (`AGENTS.md`, measurement lanes).
- `studio` is the Studio's dog tab with the Blue Merle coat chosen, from the same
  production build.
- `studio-id` and `touch-controls-id` are the same frames with `--lang=id`, so the
  Indonesian page shows Indonesian controls. They need the language work, and were
  taken from a trial merge with `claude/i18n-v3-83f7ef`, whose text is still to go
  through an independent review. Recapture them if that text changes.
- `coop-round` and `multiplayer-room` come from `npm run coop:built`, two local
  browsers in a disposable room. The invite link in `multiplayer-room` reads
  `localhost` for that reason, and the page says so. No capture connects to
  production.

Frames vary between runs because the render loop is not locked to the capture.
A recapture is a visual decision. The committed files are the ones the pages use.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `app/public/shots/field-25.webp` | 66,340 | `1f7b934688ef216717e6b86e2815a21676515000cbb20a500bc00ae8d6f6721f` |
| `app/public/shots/flock-200.webp` | 74,642 | `1000346bfa1bb5e091c76d766620275902f31d2321474d74721596c943a8e385` |
| `app/public/shots/flock-200-field.webp` | 72,196 | `8ecedc85fda0719e864c5222ce5294d192f7e4791af98353cfdddf46fbdf0ac5` |
| `app/public/shots/touch-controls.webp` | 46,266 | `da47a468320e543ac3d1c51aeb721540b695a6b7c2a83ae0f33bf35f1b32c171` |
| `app/public/shots/studio.webp` | 50,384 | `9e32321739022f51e2e98a0a10f5e5e4aae99ecd5fd2117adc09251ca0ee1eab` |
| `app/public/shots/studio-id.webp` | 51,360 | `fc0a0711383fa9fc459940941068dced28408e15eb4892e0f1cdb5f72fa1eb42` |
| `app/public/shots/touch-controls-id.webp` | 46,132 | `828dbcdacaa20e9053e6b2082eecb953a2a48a0c2f182aaf4e098298f4252b33` |
| `app/public/shots/coop-round.webp` | 67,358 | `497801e2d8167330d69a985327100a2c1c3d7fd0f1e3fd5378ff6f6d9834d3a0` |
| `app/public/shots/multiplayer-room.webp` | 17,138 | `ce9834e600a8455bab49727b19046683ee814e1d4d978554c9b02a7565bf9e09` |
