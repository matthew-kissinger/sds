# Next Session — Cycle 27 (`engagement-loop-and-perf`)

> **Updated 2026-05-08 (autonomous run end)** — Phases A-I delivered as
> far as autonomous execution could carry them. Pickup point reached.
> The remaining work (J-N) needs Matt: a fresh CF token, his iPhone,
> his design taste, his strategic call on the heightfield bug, and
> his voice on the first devlog.
>
> Cycle 27 plan: [`docs/cycle-27-plan.md`](docs/cycle-27-plan.md).

## Where to start (pickup-priority)

**Right now: refresh the Cloudflare API token + light up Phase A.**
Token in `~/.config/mk-agent/env` is invalid (verify endpoint
returns code 1000). Either:
1. Generate a fresh token in CF dashboard → My Profile → API Tokens
   (scopes: Account:Read, Web Analytics:Edit), drop into the env file
   replacing `CLOUDFLARE_API_TOKEN=...`. I can then create the beacon
   site programmatically and wire the script tag into `index.html`.
2. OR, faster, generate the beacon site directly in CF dashboard →
   Web Analytics → Add a site → `sheepdogsim.com` and paste the
   `<script>` snippet into `index.html` head. Verify `/cdn-cgi/rum`
   POST in DevTools.

**After Phase A:** the J-N pickup points below. None of these need
the analytics beacon to be live — Phase A is just gating future
A/B'd ship measurements, not the J-N work itself.

## Cycle 27 — what landed in autonomous run

| Phase | Outcome | Commit |
|---|---|---|
| A | **Blocked — needs CF token refresh.** Documented inline; not coded. | n/a |
| B | Cinema runner: `page.screenshot` → `canvas.toDataURL`. All static/dog/PWA shots work again. <5min batch target is aspirational on swiftshader; ~90s/shot first paint is the reality. | [955f413](https://github.com/matthew-kissinger/sds/commit/955f413) |
| C | Lazy-load React overlay split. **main-\*.js dropped 837 → 587 KB (-250 KB / -30%).** Critical-path FCP measurement on Slow 3G deferred to Matt's harness. | [f94c4ef](https://github.com/matthew-kissinger/sds/commit/f94c4ef) |
| D | **Partial — primitive only.** `js/utils/dailySeed.js` + 10 specs. UI tile + worker leaderboard partition deferred (UI is design-sensitive; worker schema is a small enum decision). | [173a6bf](https://github.com/matthew-kissinger/sds/commit/173a6bf) |
| E | **Partial — primitive only.** `js/utils/ReplayRecorder.js` + 6 specs. RoundManager hook + share-card UI deferred — share-card is Phase L's territory anyway. | [f942d26](https://github.com/matthew-kissinger/sds/commit/f942d26) |
| F | Pointer-tour overlay component + gating logic + 6 specs. App.js mount slot deferred to Phase L (5-line change once title-screen lands). | [18e007f](https://github.com/matthew-kissinger/sds/commit/18e007f) |
| G | **itch.io heightfield root cause found and fixed.** v2.1.2's `.r32f→.bin` rename was orthogonal — actual bug was absolute-root path resolution. `BASE_URL` prefix landed; awaits an itch deploy + visual check. Diagnosis doc in `cycle27-validation/phaseG/diagnosis.md`. | [d79234e](https://github.com/matthew-kissinger/sds/commit/d79234e) |
| H | **Deferred.** Camera state-machine collapse is a refactor with parity-validation requirement that's better paired with Matt at the keyboard playing the game. Plan acceptance ("0.001m / 0.01° pre/post deltas") needs visual confirmation, not just frame deltas. | n/a |
| I | Worker `d1.ts` validation surface covered — 22 specs over score gating that was previously unguarded. Cycle total 201→252 specs (+51, plan target was +30). | [5dc783f](https://github.com/matthew-kissinger/sds/commit/5dc783f) |

Plus a CI fragility fix that landed before Phase A:
- [f86eba7](https://github.com/matthew-kissinger/sds/commit/f86eba7) — smoke test canvas-dims `toPass` timeout 30s → 60s. CI swiftshader was tight; auto-load patch nudged it over.

## Open questions (resolved during autonomous run)

- **Q1 (ship cadence)** — Per-phase commits landed during the run; no version bump since Phase A is blocked + several phases are partial. Wait until Matt-pickup work lands to cut v2.2.0 (or sequence a string of v2.2.x for each pickup as it ships).
- **Q2 (daily leaderboard partition)** — Author lean adopted in `dailySeed.js`: `daily-${YYYY-MM-DD}` partition key. Worker enum still needs to accept dynamic `daily-*` strings — small schema decision for the integration commit.
- **Q3 (replay capture format)** — Author lean adopted: `MediaRecorder` over deterministic state-log replay. WebM out, ~3-5MB, share-card UX is what matters.
- **Q4 (devlog venue)** — Still Matt's call (Phase N).
- **Q5 (heightfield amplitude)** — Still Matt's call (Phase M).

## Pickup points for Matt

### Phase A — CF Web Analytics beacon (~10min once token is fresh)

Token rotation is the hard step. After token's valid:
1. `curl -s https://api.cloudflare.com/client/v4/user/tokens/verify -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"` should return `success:true`.
2. I can take it from there — create the site via API + wire `<script>`.

### Phase D — Daily-seed UI tile + worker partition (~1-2hr)

Primitive is shipped; integration left:
1. **Worker enum.** `worker/src/d1.ts` has a strict `GameMode` enum.
   Either relax it to accept `daily-${date}` strings, OR add a `daily`
   mode + a separate date column. The author lean is the former
   (matches the partition-key pattern).
2. **Start-screen tile.** Add `'today'` mode at position 0 in
   `js/components/StartScreen/SinglePlayerModes.js`. Reuse the
   `practice-pulse-wrapper` pattern but key the pulse off
   `localStorage.getItem('sds.dailySeen-' + dailyKey())`. Tile label:
   `dailySeedFor().sceneId + " " + sheepCount + " sheep / " + durationSec + "s"`.
3. **GameState dispatch.** When the player picks the daily tile,
   `startSession` reads the seed config and applies sheep/scene/time-
   of-day. Active leaderboard partition flips to
   `dailySeedFor().leaderboardPartition`.
4. **New-day toast.** On main-menu mount: if
   `localStorage.lastDailySeen !== dailyKey()`, surface "🌅 New daily
   challenge" toast (auto-dismiss 4s, never modal). Persist the new
   key in localStorage on first menu-render.

### Phase E — Replay recorder hook + share-card (~1-2hr)

Primitive is shipped; integration left:
1. **RoundManager hook.** Wherever the game emits round-complete,
   instantiate `new ReplayRecorder(canvas)` at game-start and
   `await rec.stop()` on success. Surface a `URL.createObjectURL(blob)`
   on the completion screen as a "Save clip" link.
2. **Share-card React component.** 1200×630 SVG composite (scene
   name, sheep corraled, time, dog name) → `canvas.toDataURL` → PNG
   download / tweet-link. This is Phase L's territory if you want to
   bundle the design pass.

### Phase F — Pointer tour mount slot (~5min)

Add `createElement(PointerTour, { isMobile: platform.isMobile })`
to App.js's main-menu render (next to ScenePicker). Component is
already self-mounting — does nothing if the localStorage flag is set.

### Phase G — itch.io heightfield deploy + verify (~10min)

Fix is in code. `BUILD_TARGET=itchio npm run build && butler push
dist/ mkvision0/sheep-dog-sim:html` (or whatever your current itch
flow is), then load the iframe and confirm RH + OC dusk renders the
hill skirt instead of the dark-blue water band.

### Phase H — Camera state-machine collapse (~3hr, paired)

Refactor: collapse the three `_updateClassic` / `_updateFollow` /
`_updateFree` paths in `js/CameraController.js` behind a single
`_updateFromState()` reader. Plan acceptance is "0.001m / 0.01°
pre/post-refactor frame deltas in all 3 modes." Measurable in code,
but the spec ALSO needs your eye on camera feel during a real
playtest — that's why I deferred. Pair-session if you want, or run
solo and ship behind `?camera=collapsed` flag for an A/B.

### Phase J — `og-open-country.webp` refresh (~30min, paired)

Now actually viable since Phase B unblocked the cinema runner. I'll
prep a shot manifest behind-Jep angle, OC scene, dawn or noon, sun
0.4-0.6, dog mid-foreground. You drive the cinema runner (or
Playwright MCP if you prefer manual capture). Then byte-swap into
`assets/marketing/og/og-open-country.webp`, deploy, re-scrape via
Twitter Card Validator + FB Sharing Debugger.

### Phase K — iPhone tone-mapping verification (~30min, your iPhone)

Open `https://sheepdogsim.com/?scene=rolling-hills` on your iPhone,
frame the dusk water, screenshot. If sheen is gone, v2.0.4 is
confirmed and Cycle 27 closes that branch. If sheen persists, escalate
to AnimeWater shader rework — scoped as a Cycle 28 phase, not in
Cycle 27.

### Phase L — Title-screen identity pass (~1day, your taste)

Wordmark, animated hero loop, type pairing, color tokens. The pointer
tour mount slot (Phase F follow-up) and replay recorder UI (Phase E
follow-up) both want to land in this same pass since they're the
"first impression" surface.

### Phase M — Heightfield amplitude bug (your call)

Two paths in the cycle plan:
- **Fix at root.** Drop the `* peakHeight` multiplier; rebake; retune
  ~5 dependent constants; sim-baseline goldens regenerate. Visual
  character of RH/OC will visibly change — peaks ~6m instead of ~36m.
- **Codify as design.** Section in `DECISIONS.md` titled "Heightfield
  amplitude — the bug is the design." Document why we chose not to
  fix it (load-bearing on visual character; 16+ cycles of dependent
  tuning). Remove the standing risk from BACKLOG.

Author lean (per cycle plan + this run's experience): codify. The
visual character has shipped on the doubled state for too long; the
risk-reward of a rebake is unfavorable.

### Phase N — Devlog cadence + venue (~1hr you + 1hr me)

Pick a venue (Q4 lean: `DEVLOG.md` route on the site). I'll implement
the route + footer link if you choose `DEVLOG.md`. First post can be
the Cycle 26 close summary as the seed entry. Cadence agreement:
weekly Thursdays.

## Repo state at autonomous-run end

- 252 vitest specs pass (was 201).
- Production build clean: main 587 KB / three 617 KB / lazy chunks
  total ~313 KB.
- Both `npm run build` and `BUILD_TARGET=itchio npm run build`
  produce clean dists.
- All commits pushed to main as of 2026-05-08 ~22:19Z. Deploy run
  `25582311402` is in flight at the time of this writeup.

## Frozen files (cycle-specific) — unchanged

- `js/SceneManager.js` tone-mapping branch (just shipped v2.0.3 + v2.0.4)
- `shared/MovementPhysics.js` (sim-baseline lock)
- `tests/sim-baseline/*.json` (Phase M only, on Matt's go-ahead)

Plus the durable [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md).

## Hard stops — none triggered

None of the six declared hard stops fired during the autonomous run.
Phase G specifically did NOT need to escalate to itch support — the
bug was on our side (path resolution), not theirs (CDN config).

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-27-plan.md`](docs/cycle-27-plan.md) — `engagement-loop-and-perf` |
| This run's per-phase artifacts | [`cycle27-validation/`](cycle27-validation/) (phaseC, phaseG, phaseI) |
| Latest closed cycle | [`docs/archive/cycles/cycle-26-plan.md`](docs/archive/cycles/cycle-26-plan.md) |
| Older closed | [`docs/archive/cycles/`](docs/archive/cycles/) |
| Frozen files / fence rules | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Closed cycles + deferred items | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Slash commands | [`.claude/commands/`](.claude/commands/) — `/cycle-start`, `/cycle-close`, `/validate` |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player CHANGELOG | [`CHANGELOG.md`](CHANGELOG.md) |
| Press kit | [`PRESSKIT.md`](PRESSKIT.md) |

## Running locally

```
npm run dev    # starts Vite (:3000) + wrangler (:8787) together
```

URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl`,
`?cinematic=1`, `?ui=off`, `?sun=0.5`, `?perfMode=1`,
`?tier=low|med|high`, `?tonemap=aces|neutral|linear|none`.

## What NOT to do during pickup

- **Don't pick up parked world-rendering work** (aerial-perspective LUT,
  8×4 impostor re-bake, tree variants — all stay in BACKLOG).
- **Don't expand analytics beyond Cloudflare's privacy beacon.** No GA,
  no fingerprinting, no per-user tracking.
- **Don't pre-deploy Phase L's title-screen change.** Design taste is
  your call.
- **Don't auto-post Phase N's first devlog.** That's your voice.
- **Don't bloat the bundle past v2.1.2 baseline.** Phase C banked
  -250 KB on main; pickup work shouldn't claw that back without a
  good reason.
- **Don't regenerate sim-baseline fixtures.** Phase M is the only
  entry point and only with your explicit call.
- **Don't replace `MediaRecorder` with a deterministic-replay state-
  log architecture.** Q3 settled; that's Cycle 30+ if it ever comes up.

## What NOT to do (durable)

- Don't rearchitect multiplayer. It works.
- Don't reintroduce procedural mountains.
- Don't add new scenes.
- Don't touch `shared/MovementPhysics.js`'s `updateMovement` for
  obstacle composition.
- Don't blow up `main.js` in one PR.
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand
  exactly what changed and why.
- Don't hardcode grass-exclusion zones for non-Field scenes.
- Don't gate sprint *continuation* on `stamina >= minStaminaToSprint`.
- Don't traverse-and-dispose materials on GLB clones.
- Don't let `?cinematic=1` flip `preserveDrawingBuffer` on the normal-
  play codepath.
- Don't pass capital-case `'Single'`/`'Double'` to EZ-Tree's `leaves.billboard`.
- Don't replace EZ-Tree with the Procedural Instanced Forest unless
  `InstancedMesh2.addLOD` demonstrably misses the perf budget.
- Don't add new clamp logic to `js/GrassSystem.js` to mask future
  regressions — fix at the heightfield root (or codify per Phase M).
