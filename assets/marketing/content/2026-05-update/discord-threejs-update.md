# Three.js Discord Update Draft

Asset to attach:

```text
assets/marketing/og/og-rh-sunset.webp
C:\Users\Mattm\X\games-3d\sds\assets\marketing\og\og-rh-sunset.webp
```

Do not attach the older screenshots under `assets/images/` or historical `cycle*-validation/` folders for this update. They show previous visual states and should be treated as archive/reference material, not current promotion.

## Post

Quick Sheep Dog Sim update for the Three.js channel. I posted this here months ago when it was mostly "can I make a sheepdog push a boid flock around in WebGL without it feeling terrible?"

It has gotten a little out of hand since then. Still a browser game, still very much Three.js, still open source, but the old post makes it look like a smaller prototype than it is now.

Play: https://sheepdogsim.com/
GitHub: https://github.com/matthew-kissinger/sds

The current shape:

- Sheep Dog Island is basically the identity of the game now: heightfield terrain, shoreline water/foam, grass, trees, fog, time-of-day lighting, sheep wandering around the island edge, dog trying to keep the whole situation from becoming abstract art.
- Open Country is the larger weird mode: gather the flock first, then drive them toward a portal.
- Rendering is still Three.js/WebGL. Sheep and grass are GPU-instanced, with a lot of browser-specific rendering work because the constraints are the point.
- Mobile controls, menus, settings, sandbox, leaderboards, and local 2-player have all been rebuilt since the old post.
- Backend moved to Cloudflare Pages + Workers + Durable Objects + D1. Leaderboards are scene-scoped now.
- I added real iOS Safari validation because WebGL water on iPhones became a whole side quest.

Caveats, because this is a dev update and not a victory lap:

- Multiplayer has been migrated to the Cloudflare Worker/Durable Object stack, but I have not done a proper paired MP playtest since the latest island-scene/objective migration. Automated tests are green; MP is still in "trust, but actually playtest it" territory.
- I am still working through perf/capture polish. The game is playable, but there are presentation and optimization rough edges. Trees are next on my list: latest EZ-Tree update, re-bake, and spacing review so the island does not get visually clumped.
- I am using one current image for this update because the video capture pass was not good enough yet. I would rather post one honest screenshot than a bad trailer.
- Very open to criticism, especially the Three.js/browser stuff: mobile perf, controls, readability, render choices, scene density, anything that looks like I am fighting the platform instead of using it well.

Attached image is the current Sheep Dog Island look. Older screenshots are basically archaeological at this point, so I am keeping this one image-only for now and saving clips/devlog for after the optimization, tree, and capture pipeline pass.
