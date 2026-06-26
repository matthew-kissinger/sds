# SEO Content History

Status: superseded by the Cycle 107 SEO refresh.

The old 2025 SEO changelog described an early metadata pass, placeholder social images, and GitHub Pages-era assumptions that no longer match the production site. Current launch SEO source of truth is:

- `docs/launch/seo-content-matrix.md`
- `index.html`
- `about.html`
- `public/scenes/*.html`
- `public/manifest.webmanifest`
- `public/llms.txt`
- `public/sitemap.xml`
- `js/utils/seo.js`
- `tests/seo.spec.js`

## Current Policy

- Use accurate product copy, not keyword stuffing.
- Keep public scene pages aligned with actual playable scenes.
- Keep Open Graph and Twitter images on shipped assets unless a new shipped social-card asset is created.
- Update sitemap `lastmod` when public page metadata changes.
- Keep old SEO plans historical; do not treat them as implementation authority.
