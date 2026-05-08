# Cycle 27 Phase G — itch.io heightfield diagnosis

**Date:** 2026-05-08
**Status:** Root cause confirmed; speculative fix landed in this branch.
Awaits an itch deploy to verify end-to-end.

## Symptom

On `https://mkvision0.itch.io/sheep-dog-sim`, Rolling Hills + Open
Country scenes render with flat terrain at y=0 from mid-distance
outward — the AnimeWater plane shows through where the heightfield-
displaced terrain skirt would normally hide it, producing a saturated
dark-blue band of "water" mid-distance, especially visible at dusk
sun positions.

`sheepdogsim.com` (Cloudflare Pages, root-served) renders identically-
configured scenes correctly.

## Prior fix attempt — v2.1.2

Hypothesis: itch's `html-classic.itch.zone` CDN had `.r32f` on a
rejected-extension allowlist. Fix: rename `.r32f` → `.bin`, file
format unchanged. Deployed as v2.1.2.

**Outcome:** symptom persisted. Fix addressed the wrong failure mode.

## Actual root cause

Scene definitions declare `heightmapUrl` as an **absolute root path**:

```js
// shared/scenes/rolling-hills.js
heightmapUrl: '/terrain/rolling-hills.bin'
```

On Cloudflare Pages this resolves to `https://sheepdogsim.com/terrain/...`
which is the correct path. On itch's CDN the game is served from
`https://html-classic.itch.zone/html/<build-id>/index.html`. An
absolute-root fetch of `/terrain/<scene>.bin` resolves to
`https://html-classic.itch.zone/terrain/<scene>.bin` — the CDN root,
**not** the build root. That returns 404.

The 404 is caught by the try/catch in `js/main.js` around
`Heightfield.load(...)`, which falls back to `null` heightfield, so
terrain renders flat. The console message "Heightfield load failed;
falling back to flat terrain" is the smoking gun if you have devtools
open.

Vite's `base: './'` setting for `BUILD_TARGET=itchio` rewrites HTML
asset references and bundled-asset URLs, but **does not rewrite raw
strings** in JS source like `'/terrain/X.bin'` — those have to be
resolved through `import.meta.env.BASE_URL` at runtime.

## Fix

`js/main.js` heightfield-load block now resolves the URL through
`import.meta.env.BASE_URL` at fetch-time:

```js
const baseUrl = import.meta.env?.BASE_URL ?? '/';
const heightmapUrl = rawHeightmapUrl?.startsWith('/')
    ? baseUrl + rawHeightmapUrl.slice(1)
    : rawHeightmapUrl;
```

- Cloudflare Pages: BASE_URL=`/` → `/terrain/X.bin` (unchanged)
- itch.io: BASE_URL=`./` → `./terrain/X.bin` (resolves to build root)

Both targets build clean (`npm run build` and `BUILD_TARGET=itchio
npm run build`).

## What this commit does NOT do

- **Verify end-to-end on itch.** Requires Matt to deploy + visually
  inspect Rolling Hills + Open Country at dusk. Build artifact in
  `dist/` after `BUILD_TARGET=itchio npm run build` is what should
  be pushed to itch — usually via `butler push` per Matt's existing
  itch deploy flow.
- **Audit other absolute-path string references for the same bug.**
  Quick audit found `js/utils/seo.js` ogImage paths use absolute root
  paths but those run on cloudflare-served social-share preview
  fetches, not the iframed itch runtime — not affected. If a future
  audit surfaces another `'/asset/X'` string in client code that
  needs to work on itch, it gets the same BASE_URL prefix treatment.

## Hard-stop check

Per cycle plan Hard Stop #4: "Phase G's heightfield diagnosis surfaces
a CDN config change request requiring itch support. That escalates
out of Cycle 27; document and move on."

This bug does NOT escalate to itch support. It's a path-resolution
error in our build, fixable in our codebase. The .r32f→.bin rename
from v2.1.2 was orthogonal (still good practice) but unrelated to
the actual symptom.

## Next step

Matt: `BUILD_TARGET=itchio npm run build && butler push dist/
mkvision0/sheep-dog-sim:html` (or current itch deploy command),
then load the itch page and confirm the dark-blue mid-distance band
is gone on RH + OC.
