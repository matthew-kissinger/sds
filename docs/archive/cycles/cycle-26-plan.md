# Cycle 26 — Player-facing layer (UX / design / engagement / marketing / community)

> Drafted 2026-05-07 after Mac white-hue fix landed on `main`
> ([`b5ff6ef`](https://github.com/matthew-kissinger/sds/commit/b5ff6ef) —
> ACES → Neutral tone mapping on Mac platforms). This cycle deliberately
> pivots away from the rendering / foliage / atmosphere depth-stack the
> Cycles 18-25 polish program lived in, and toward the **player-facing
> layer**: how the game looks the first 30 seconds, how easy it is to
> share, and how anyone outside the dev loop finds it.
>
> **Scope is intentionally soft.** Locked down at `/cycle-start` with
> Matt — until then, this doc is a menu of areas, not a phase plan.

## Goal

Stop building more world-rendering tech. Start making the game easier
to **find, try, share, and remember**.

The atmospheric LUT, 8×4 impostor re-bake, and camera state-machine
collapse remain in BACKLOG and will not be picked up here unless Matt
explicitly redirects.

## Areas of focus (menu — not phases)

Pick from these at `/cycle-start`. Each is independently shippable and
sized to a few hours / a day; the cycle bundles whichever set lands.

### 1. UX / UI

- **Practice Paddock / Open Meadow (no-pressure entry mode).** A
  fourth tile alongside Classic / Extreme / Insane / Chaos (or under
  a "Just play" header above them). ~30 sheep, no timer, no fail
  state. A toggleable hint layer (W/A/S/D · Shift · S to whistle)
  that auto-dismisses after 8s OR first whistle. Never modal, never
  blocking. localStorage `sds:hasPlayed` flag so first-time visitors
  see a "New here? Try [name] →" suggestion that stays out of the
  way of anyone clicking another mode. Full atmosphere on — it's
  the best ad the game has. Name TBD.
- Onboarding: lightweight first-run pointer-tour overlay, gentle
  pointer-guided walkthrough of mode → scene → dog → play.
  Skip-able. localStorage gates re-show. Distinct from Practice
  Paddock above — this is the start-screen tour; that is the
  no-pressure play mode. They complement.
- HUD review pass: stamina bar, sheep counter, objective banner,
  camera mode chip — read each on three scenes × three resolutions
  (mobile portrait, tablet, desktop) and fix what overlaps or fights
  for the same edge.
- Settings panel polish: group, label, default-explanation tooltips.
- Mobile gestures: pinch-zoom feel, tap-vs-drag thresholds,
  bottom-bar reachability.
- Loading-state polish: the shimmer-skeleton overlay (cycle-25-F)
  is a starting point, not a finish line.
- Error / disconnect toasts: MP reconnect grace already exists
  (cycle-24); surface its state to the player.

### 2. Visual design

- Title screen identity: logo lockup, type pairing, motion title.
  Currently the start screen reads as "engineer's prototype." Aim
  for "this is a real game."
- Scene postcards (shipped v2.0.1) audit — do all three read as
  *places* a player wants to visit?
- Color / type / spacing tokens: pin a small design-system in CSS
  vars so future screens ship coherent.
- Favicons + OG image refresh.
- In-game UI illustration pass (icons, buttons, mode pills).

### 3. User engagement

- Daily / weekly micro-challenge surface (e.g. "today's seed: corral
  500 in 90s"). Doesn't require backend changes — seedable from a
  date hash.
- Dog progression / collection cosmetic loop. Lightweight — name
  history, scene history, time-played counters that feel earned.
- Replays: capture the last successful run as a 10-second WebM the
  player can save / share.
- Share-card on round-end: SVG composited "I just corraled X sheep
  in Y seconds on Z scene" image to download / share.

### 4. Marketing assets

- 30-second hero trailer. Capture via the existing cinema runner
  (note: cinema runner has the deferred 30s font-wait timeout — fix
  *or* keep using Playwright MCP for one-offs).
- 3–5 short-form clips (15s / 9:16 vertical) tuned for TikTok /
  Reels / Shorts: dog-running-into-flock, sprint dolly-zoom, scene
  swap, golden-hour OC pan.
- Animated GIFs (lossy) for Reddit / forum posts — keep under 5 MB.
- Press kit: refresh `PRESSKIT.md` with the current screenshots,
  v2.0+ feature list, and the new ScenePicker hero stills.
- Steam-style capsule art draft (even if no Steam release planned —
  the format forces decisive composition).

#### Working agreement for the media session

Division of labor when we run the actual capture session:

- **Claude prepares before the session.** Researched shot manifest
  with: shot ID + filename, scene + time-of-day + sun position,
  camera mode (Follow/Free/Classic) + suggested distance/yaw, dog
  pose intent, sheep state (paused / herding / scattered), aspect
  ratio (16:9 still, 9:16 vertical, 1:1 square, 1200×630 OG), what
  the shot is for (hero trailer beat / Reddit GIF / OG card / Steam
  capsule / SEO meta). All in a `cycle26-validation/shot-list.md`
  before pairing the browser.
- **Matt drives the browser.** Click into scene, free-fly camera to
  the framing Claude described, position the dog, say "snap" or
  "start recording" / "stop." Doesn't do creative decision-making
  during the session — Claude already chose ToD / sun / framing
  intent.
- **Captures save to `assets/marketing/captures/cycle26/raw/`** with
  the filename Claude pre-defined.
- **Reviewed end-of-session.** Walk the manifest together, mark
  each as `kept` / `redo` / `skip`. Re-shoot the redos in a second
  pass.
- **Editing pass after.** Trailers + vertical clips need a real
  NLE (DaVinci Resolve, CapCut, etc.) — those are Matt's job. GIF
  output from the recorder is final-form for Reddit/Discord drops.
- **Cinematic-runner fix is parallel work.** If the runner is fixed
  during the cycle, automated batch capture takes over from the
  manual session for the OG-card refresh.

### 5. SEO

- `<title>` and meta tags per route / scene-deeplink.
- Open Graph + Twitter card per scene + per shared replay.
- Structured data (`schema.org/VideoGame`) on the landing page.
- `sitemap.xml` + `robots.txt` review (currently default).
- Lighthouse SEO audit + fix the obvious wins.
- Page-load perf: Largest Contentful Paint of the start screen on
  cold load (currently main bundle 837 KB / 250 KB gzip — investigate
  splitting the React overlay from the Three.js bundle).
- Canonical URLs for shared invite-room links.

### 6. Community building

- Devlog channel: pick a venue (a `/devlog` route on the site, or a
  Substack, or just a `DEVLOG.md` updated weekly + linked from the
  start screen). Make the work visible.
- One-time launch posts to: r/threejs, r/webgames, r/IndieDev, HN
  Show. Each needs its own framing.
- Discord or community-tab embed on the site.
- Feedback funnel: in-game "send feedback" button → form → inbox or
  Linear / GitHub issues.
- Streamer / YouTuber outreach list — small creators who play
  weird-web-game content.

### 7. Polishes / fixes / perf

This is the catch-all for things that don't belong in a feature
cycle. Each is independently triagable:

- **Mac white-hue fix verification.** Shipped 2026-05-07. Confirm with
  Matt's actual M4 Max + macOS Tahoe device after deploy.
- The five v1.4.0 playtest items still un-revisited (Classic-overhead
  trees, sprint exit, OC HUD, MP modes, tree tris).
- Heightfield amplitude bug — still standing across ~14 cycles.
- Cinema runner `page.screenshot` 30s font-wait timeout.
- Audio: the `AudioManager` try/catch wrap from Cycle 24 was a
  defense; investigate whether real Safari now gets footstep sound.
- Bundle-size investigation: `main` is 837 KB gzipped 250 KB — what
  splits cleanly?
- Any small bug surfaced by Mac-fix playtest or in-the-wild reports.

### 8. (Possible) WebGPU / new tech

Stays parked unless Matt explicitly opts in. The point of this cycle
is the player-facing layer; tech spikes belong in a different cycle
shape.

## What's NOT in scope

Everything in BACKLOG that's not in the list above stays parked. In
particular:

- Aerial-perspective LUT / atmospheric truth (parked from cycle-25).
- 8×4 impostor atlas re-bake + padded mips.
- Camera state-machine collapse.
- 6 fresh tree variants + landmark trees.
- Heightfield amplitude root fix (touches sim-baseline).

These are real "Cycle of their own" deliverables. They are not
abandoned — they're waiting for a cycle that's about world-rendering,
not the player-facing layer.

## Open questions (resolve at /cycle-start)

1. **Which areas?** Likely a mix from §1 + §4 + §5 + §7 — UX polish
   + marketing assets + SEO + lingering fixes. Matt picks at
   `/cycle-start`.
2. **Ship cadence?** Per-area push (lots of small `v2.x.y` bumps)
   vs single end-of-cycle ship. v2.0.1 pattern (ship as you finish
   each independent thing) probably right for this cycle's shape.
3. **Devlog venue?** On-site `/devlog`, Substack, or just a
   `DEVLOG.md`. Pick one before doing the §6 launch posts so they
   can link to it.
4. **Community ToS / moderation?** If Discord, who moderates?
   Defer §6 community-tab work if the answer is unclear.

## Frozen files

All [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) entries apply. In
addition, this cycle should not touch:

- `js/SceneManager.js` tone-mapping branch (just shipped — verify
  before iterating).
- `shared/*` boid-sim path (no sim-baseline regen).
- `js/shaders/HeightFogPatch.js` (the no-op foundation stays a
  no-op until a future world-rendering cycle picks it up).

## What NOT to do

- Don't turn this into "Cycle 25 part 2." The polish program is
  closed; new world-rendering work belongs in its own cycle.
- Don't build a CMS / blog engine for the devlog. A markdown file
  served as a route is fine for n=10 posts.
- Don't auto-deploy marketing / outreach pushes — those are
  irreversible. Matt sends.
- Don't add analytics tracking that wasn't there. If we need
  metrics, propose a privacy-respecting plan first.
- Don't bloat the bundle chasing UI polish. Bundle-size delta is a
  validation criterion for every UI change in this cycle.

## References

- [`docs/cycle-25-plan.md`](cycle-25-plan.md) — predecessor (closed
  as v2.0.0)
- [`docs/wake-state-2026-05-06.md`](wake-state-2026-05-06.md) —
  what landed v2.0.0
- [`CHANGELOG.md`](../CHANGELOG.md) — `[2.0.0]` + `[2.0.1]` +
  `[2.0.2]` deferred items
- [`docs/polish-program.md`](polish-program.md) — original 6-cycle
  polish program (mostly absorbed into v2.0.0)
- [`docs/BACKLOG.md`](BACKLOG.md) — full deferred list
- [`PRESSKIT.md`](../PRESSKIT.md) — current marketing kit baseline
