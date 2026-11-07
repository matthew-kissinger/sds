# Public discovery and analytics

This is the release contract for search, social previews, repository metadata
and aggregate site analytics. It does not authorize a production deployment.

## Canonical public surface

- Game: `https://sheepdogsim.com/`
- About: `https://sheepdogsim.com/about`
- Support: `https://sheepdogsim.com/support`
- Privacy: `https://sheepdogsim.com/privacy`
- Herding guide: `https://sheepdogsim.com/herding-guide`
- Multiplayer: `https://sheepdogsim.com/multiplayer`
- Indonesian page: `https://sheepdogsim.com/id/`
- Sitemap: `https://sheepdogsim.com/sitemap.xml`
- Social image: `https://sheepdogsim.com/og/sheepdog-sim-v2.png`

The secondary pages are flat HTML files so the Worker's static assets keep the
same extensionless, no-trailing-slash URLs already used in production, as Pages
did. Redirects, canonical elements, Open Graph URLs and sitemap entries must all
agree. `/id/` is the one exception, a directory with its own `index.html`.

`/id/` is a standalone page beside the game, not a translation of it. `/` keeps its
English head, and there is no `hreflang` between them, by the owner's decision.
The check and `tests/public-pages.spec.ts` fail on any `hreflang`.

`?lang=` addresses answer with `/`'s own HTML, whose canonical is `/`. That canonical is
the control, and it is a hint a search engine may overrule, since the page renders in
another language. `/id/`'s links into the game carry `rel="nofollow"` so the page passes
nothing to them, which does not keep them out of search: a known address can be crawled
without a link. If one shows up in results, add `Disallow: /*?lang=` to
`app/public/robots.txt`. That passes the checks here and has not been tried against a
search engine.

## Withdrawing `/id/` from search

To take `/id/` out of search and leave everything else alone, make these three changes in
one commit:

1. In `app/public/id/index.html`, set the robots meta to `noindex, follow`.
2. Remove its `<url>` entry from `app/public/sitemap.xml`.
3. Remove its line from `app/public/llms.txt`.

Leave the page and the links to it in place, because a crawler has to reach the page to
read the `noindex`. `scripts/verify-public-discovery.mjs` and `tests/public-pages.spec.ts`
accept this state and fail on half of it: `noindex` while still in the sitemap, or out of
the sitemap while still indexable. It ships by the ordinary release steps in
`deployment.md`, and undoing it is the same three changes in reverse.

To undo the whole release instead, use "A bad release on the Worker" in `deployment.md`:
`npx wrangler rollback <version-id> --name sds-worker`, or dispatch `Deploy` with the
previous good SHA.

Run this after every production build:

```powershell
npm run check:discovery
```

It requires the analytics beacon in the built page. The production workflow
repeats the check against the live domain.

## Analytics boundary

The Cloudflare Web Analytics beacon is Cloudflare's snippet for the
`sheepdogsim.com` site, committed once in each HTML page. Do not add a second
beacon to a page, and never use the token the retired Pages injection carried; the check
requires exactly one beacon with the committed token. Which site and token is
which is recorded in `docs/operations/deployment.md`. The analytics surface
measures aggregate page visits and load performance. It does not send
movement, controls, flock state, completion events or player names. The game's own
anonymous counts are separate, go to the Worker and carry no player name; see
`docs/operations/funnel.md`.

After a production deployment, confirm:

1. Every HTML page contains one `beacon.min.js` script, with the token from
   `app/index.html`. Nothing injects one for us; see `docs/operations/deployment.md`.
2. Browser network tools show a successful request to a `cdn-cgi/rum`
   endpoint.
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
2. Inspect and request indexing for the canonical URLs.
3. Import the verified property into Bing Webmaster Tools and submit the same
   sitemap.
4. Validate the home page in Google's Rich Results Test.
5. Recheck indexed titles and descriptions after crawlers revisit the site.

Submission helps discovery but does not guarantee ranking or immediate updates.

## GitHub launch metadata

Use this repository description after the client cutover:

> Open-source browser sheep herding game. Guide 25, 75 or 200 sheep solo, in co-op or shared-flock competitive for two to four players, with keyboard, gamepad or touch controls. Three.js, React, WebGPU with WebGL2 fallback, and optional solo leaderboards. AGPL-3.0-or-later.

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
multiplayer
mobile-game
gamepad
cloudflare-workers
open-source-game
agpl
```

Multiplayer shipped in 3.8, so keep the `multiplayer` topic. Leave WebSocket,
Durable Object and deferred-mode topics off the public repository. Upload
`docs/launch/media/sheepdog-sim-github.jpg` as the repository social preview
after the owner accepts the card.
