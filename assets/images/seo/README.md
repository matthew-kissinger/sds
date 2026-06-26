# SEO Image Notes

Status: historical holding folder.

Current public social metadata uses shipped social-card captures under `assets/scenes/social/*.webp`. Page heroes, README images, and the entrance carousel use the matching 16:9 captures under `assets/scenes/entrance/*.webp`. `assets/marketing/` and most of `assets/images/` are excluded from the production dist copy, so do not point public metadata at files in this folder unless the Vite copy rules are updated and a build proves the files ship.

Current shipped hero captures:

- `assets/scenes/entrance/newsheepdogland.webp`
- `assets/scenes/entrance/field.webp`
- `assets/scenes/entrance/rolling-hills.webp`
- `assets/scenes/entrance/open-country.webp`

Current shipped social cards:

- `assets/scenes/social/newsheepdogland.webp`
- `assets/scenes/social/field.webp`
- `assets/scenes/social/rolling-hills.webp`
- `assets/scenes/social/open-country.webp`

Refresh with `npm run media:capture-launch` against a production preview, verify `cycle110-validation/scene-media-refresh/report.json`, update `docs/launch/seo-content-matrix.md`, and run `npm run build`.
