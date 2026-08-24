# Public discovery and analytics

This is the release contract for search, social previews, repository metadata
and aggregate site analytics. It does not authorize a production deployment.

## Canonical public surface

- Game: `https://sheepdogsim.com/`
- About: `https://sheepdogsim.com/about`
- Support: `https://sheepdogsim.com/support`
- Privacy: `https://sheepdogsim.com/privacy`
- Sitemap: `https://sheepdogsim.com/sitemap.xml`
- Social image: `https://sheepdogsim.com/og/sheepdog-sim.png`

The secondary pages are flat HTML files so Cloudflare Pages keeps the same
extensionless, no-trailing-slash URLs already used in production. Redirects,
canonical elements, Open Graph URLs and sitemap entries must all agree.

Run this after every production build:

```powershell
npm run check:discovery
```

The production workflow repeats the check against the live domain and also
requires the Cloudflare Web Analytics beacon.

## Analytics boundary

Use the existing Cloudflare Pages automatic Web Analytics injection. Do not
commit a beacon token and do not add a second manual beacon. The analytics
surface measures aggregate page visits and load performance. It does not send
movement, controls, flock state, completion events or player names.

After a production deployment, confirm:

1. Each canonical HTML page contains one `beacon.min.js` script.
2. Browser network tools show a successful request to `/cdn-cgi/rum`.
3. Cloudflare Web Analytics begins showing the new release after its normal
   ingestion delay.
4. Gameplay remains complete if the beacon request is blocked.

## Domain consolidation

These Cloudflare changes are production mutations and require owner approval:

1. Add a Bulk Redirect from `sds-frontend.pages.dev` to
   `https://sheepdogsim.com` with status 301, subpath matching, path suffix and
   query-string preservation.
2. Add a proxied `A` record for `www` to `192.0.2.1`.
3. Add a Bulk Redirect from `www.sheepdogsim.com` to
   `https://sheepdogsim.com` with status 301, subpath matching, path suffix and
   query-string preservation.
4. Verify both alternate hosts reach the same apex path in one redirect.

## Search engine launch

After the exact release SHA is live:

1. Submit `https://sheepdogsim.com/sitemap.xml` in Google Search Console.
2. Inspect and request indexing for the four canonical URLs.
3. Import the verified property into Bing Webmaster Tools and submit the same
   sitemap.
4. Validate the home page in Google's Rich Results Test.
5. Recheck indexed titles and descriptions after crawlers revisit the site.

Submission helps discovery but does not guarantee ranking or immediate updates.

## GitHub launch metadata

Use this repository description after the client cutover:

> Open-source browser sheep herding game. Guide 25, 75 or 200 sheep through one field with keyboard, gamepad or touch controls. Three.js, React, WebGPU with WebGL2 fallback, and optional solo leaderboards. AGPL-3.0-or-later.

Use these topics:

```text
sheepdog-sim
sheepdog
herding-game
browser-game
web-game
3d-game
threejs
webgpu
webgl2
typescript
react
simulation
boids
deterministic
single-player
mobile-game
gamepad
cloudflare-pages
open-source-game
agpl
```

Remove multiplayer, WebSocket, Durable Object and deferred-mode topics from the
public repository. Upload `docs/launch/media/sheepdog-sim-github.jpg` as the
repository social preview after the owner accepts the card.
