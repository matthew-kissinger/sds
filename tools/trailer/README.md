# Local trailer production

These scripts are filmmaking tools, outside the production client. They use
Playwright with installed Chrome, FFmpeg/FFprobe on PATH, and the normal app.
Run from the repository root after `npm ci`. Outputs go under ignored
`captures/trailer/`; no media, credentials or browser profiles belong in Git.

Read [the production notes](../../docs/launch/trailer-production.md) for shot
intent, truthful-input constraints and music attribution. Source music files
must already be present in `captures/trailer/music/`: `bossabossa.mp3`,
`bossa-antigua.mp3` and `carefree.mp3`, downloaded from the credited sources.

Current pipeline:

```powershell
New-Item -ItemType Directory -Force captures/trailer
node tools/trailer/offline-film.mjs all
node tools/trailer/offline-herding.mjs
node tools/trailer/titles.mjs
node tools/trailer/edit.mjs
node tools/trailer/review-page.mjs
node tools/trailer/serve.mjs
```

With the gallery server running, `node tools/trailer/verify.mjs` checks decoded
source timing, exports and browser playback. `node tools/trailer/live-controls.mjs`
separately checks normal real-time input and Studio selection on desktop,
touch emulation and forced WebGL2. Both scripts close their browsers.

`TRAILER_BASE` overrides the default live site for production-preview checks.
Serve a local production build on port 5489 for client edits; do not record a
development build as a release receipt. The capture tools block identity and
score traffic and never inject simulation positions or completion state.

Selective retakes: `offline-film.mjs flock` (opening), `wide`, `details`,
`studio` (both Studio scenes), `flock-studio`, or `drone`.
`edit.mjs --only=0,4` rebuilds those cut indices and remixes the exports;
`edit.mjs --mix-only` retains all encoded shots. See `edit-decision-list.json`
in the output directory for the complete edit.

The older real-time capture scripts remain as reference recipes. The gallery
uses only the v3 offline exports. Fixed-frame filming is not a live frame-rate
measurement; owner review remains the creative and audio acceptance step.
