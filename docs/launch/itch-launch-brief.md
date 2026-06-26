# itch Launch Brief - Sheep Dog Sim

Status: ready for Matt review; do not publish until Cycle 110 approval.

## Current Build

- Command: `npm run build:itchio`
- Result: pass on 2026-06-26
- Output path: `dist/`
- Output size: 47,389,494 bytes across 222 files
- Largest files:
  - `assets/main-CvF-fMVX.js` - 650,194 bytes
  - `assets/three-CFVCzKWw.js` - 628,824 bytes
  - `assets/basis_transcoder-VXdx5NbI.wasm` - 527,333 bytes

## Page Copy

Use:

- `docs/itchio-submission.md` for dashboard fields.
- `docs/itch-description/sheep-dog-sim.md` for the Markdown description.
- `itchio-description.txt` for a plain-text paste fallback.

## Title

`Sheep Dog Sim`

## Short Description

Free browser herding game with solo challenges, survival wolves, 2-4 player rooms, mobile controls, and flocks up to 5,000 sheep.

## Tags

Preferred itch tag set:

```text
simulation, casual, browser, 3d, multiplayer, animals, dog, sheep, herding, open-source
```

## Screenshots

Fresh launch captures are ready:

- `assets/scenes/entrance/field.webp`
- `assets/scenes/entrance/rolling-hills.webp`
- `assets/scenes/entrance/open-country.webp`
- `assets/scenes/entrance/newsheepdogland.webp`

Optional later additions:

- Multiplayer room screenshot if it clearly shows the feature.
- Large-flock mode screenshot if it reads better than the current Home Field capture.

## Upload Path

Manual dashboard upload:

1. Run `npm run build:itchio`.
2. Zip the contents of `dist/`.
3. Upload as the HTML build for `sheep-dog-sim`.
4. Keep fullscreen enabled and auto-start disabled.
5. Smoke-test the uploaded iframe and fullscreen button.

Butler path, if configured:

```bash
butler push dist <itch-user>/sheep-dog-sim:html5
```

Replace `<itch-user>` with the real itch account before use.

## Publication Status

`after-human-review`

The build, copy, and four-scene screenshots are ready. Publication still needs Matt to approve the dashboard update and uploaded build smoke.

## Rollback

If the new itch upload regresses:

- Restore the previous itch upload/channel in the dashboard.
- Point players to `https://sheepdogsim.com`.
- Keep the failed upload private until fixed.

## Sources

- itch HTML5 upload docs: https://itch.io/docs/creators/html5
- itch creator quality guidelines: https://itch.io/docs/creators/quality-guidelines
- itch butler docs: https://itch.io/docs/butler/
