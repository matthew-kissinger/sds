# 11 - Typography and screen-anchored labels

Two things share this file because they share a failure. `spec/06` asks that "Typography and menus feel like the game: painterly, warm, unhurried. No stock component library look." The shipped game asked for a face it did not carry, so it drew the interface in whatever serif the reader's operating system happened to own, and it wrote the labels that float over the field at a rate lower than it drew them. Both are the same mistake in different clothes: naming a thing and then not owning it.

## The interface face

**Piazzolla**, by Juan Pablo del Peral at Huerta Tipografica, SIL Open Font License 1.1. Shipped as one subsetted variable `woff2` at `app/public/fonts/piazzolla-ui.woff2`, 26,228 bytes, baked from `assets/fonts/Piazzolla[opsz,wght].ttf` by `tools/subset-font.py`.

It is chosen over four other measured candidates for one reason the others could not match: it carries a live **optical-size axis** spanning 8 to 30, and this interface spans 10 px to 88 px. The same face is therefore drawn with the sturdier, wider, more open letterforms an 11 px HUD label needs and the finer, tighter ones an 88 px title wants, from one file, with no second weight to download and nothing to keep in step by hand. The axis costs 9.4 KB over pinning it. Faustina was smaller (13.8 KB), Gelasio was an exact metric clone of Georgia, Literata had the largest x-height, and Source Serif 4 matched Georgia's metrics to 99.0% - and all four are one optical size stretched across a range they were not cut for. Lora was disqualified by measurement rather than taste: it ships `tnum` but neither `lnum` nor `onum`, so its old-style figures bounce on the baseline and no feature setting can stop them.

Rules that follow from that choice, and are not negotiable without re-measuring:

- **The weight range is 400 to 700**, because the interface uses 400, 500, 600 and 700. Baking a narrower range is a silent substitution at the three 700 selectors.
- **The optical range is 8 to 30**, and the browser drives it through `font-optical-sizing: auto`, which is the initial value. Nothing may set `font-optical-sizing: none` or pin `opsz` through `font-variation-settings`; either turns the reason for the choice off. Measured in Chrome against the shipped file, one string at 10 px sets 139.0 px wide with the axis live and 135.0 px pinned - the axis is doing 3% of extra width where it is needed - and the two agree exactly at 30 px and above, where the range clamps.
- **`font-variant-numeric: tabular-nums lining-nums`** wherever digits change in place, and `lining-nums` is not decoration. The fallback stack reaches Georgia, whose figures are old-style by default; a timer that swaps between a face with lining figures and one with bouncing ones reads as a broken timer rather than a font change.
- **Word spacing is corrected in CSS, not in the font.** Piazzolla sets a tight space by design: 0.188 em at `opsz` 8 falling to 0.153 em at `opsz` 30, against Georgia's 0.241 em and Times' 0.250 em. That is a reasonable fit for continuous prose and a poor one for an interface made almost entirely of two- and three-word labels standing alone - at 13 px "About the game" closed up into something the eye reads as one word. `--herd-word-space: .065em` on `body` and on the static shell headline corrects it, em-based so it tracks the size, and deliberately short of the full difference because the optical axis is already opening the space at the small sizes where the problem is worst. The reduced-data branch sets it to `normal`, because it corrects Piazzolla and Georgia's own space needs no help. The alternative was editing the space glyph's advance in the bake; Piazzolla carries no Reserved Font Name, so that is permitted, but it hides a typographic decision inside a binary and leaves the project shipping a Piazzolla nobody can reproduce from upstream. Fitting belongs in the stylesheet.
- **The character set is Latin-1 printable plus thirteen punctuation and symbol codepoints**, one of which is the nameplate rosette `◆`. Anything the interface draws that is not in `CODEPOINTS` in `tools/subset-font.py` renders from the fallback, at the wrong colour and weight, and the bake has to be re-run.
- **The bake is deterministic.** `tools/subset-font.py --check` fails if the committed `woff2` does not match a fresh bake byte for byte, which is what `npm run check:font-bake` is for. `recalcTimestamp=False` is load-bearing: without it fontTools stamps `head.modified` on save and two bakes of one source stop matching. Subsetting happens before axis instancing, because instancing first leaves `gvar` entries for glyphs the subsetter then removes and raises `KeyError`.

## Where the face is declared, and why it is not in the token module

`app/index.html`, in the document head, in one `<style>` block. `app/src/ui/tokens.ts` is the only styling authority for everything else and deliberately does not re-emit `--herd-font`.

The static shell paints its 48 px headline before any bundle has parsed. If the family were declared by `UiStyles`, that headline would render in a system stack and then reflow the moment React mounted - a second, later, larger shift than the font swap this file exists to avoid. Two declaration sites would also be two things to keep in step. So the head owns the family and the token module owns everything else, and `tokens.ts` carries a comment pointing here.

The preload carries `crossorigin` even though the font is same-origin. A font preload without it is fetched in a different CORS mode from the `@font-face` request that follows, and the file downloads twice.

## Two families, because the axis is live

`--herd-font` for running text; `--herd-display-font` for the four display selectors (the static shell headline, the loading card lockup, `.herd-title`, `.herd-panel__title`). They differ only in their fallback.

A metric-matched fallback is the standard answer to a visible font swap, and it cannot be done once for a face with a live optical size. Measured against Georgia, Piazzolla's mean lowercase advance runs +3.49% at `opsz` 8 and -3.32% at `opsz` 30. One `size-adjust` tuned for display (96.68%) leaves small text **worse** than no adjustment at all: +7.05% at `opsz` 8 against +3.49% unadjusted. So display type gets `'Piazzolla Display Fallback'` - `local('Georgia')` with `size-adjust: 96.68%` and the ascent, descent and line-gap overrides that hold the line box at Piazzolla's 1.110 / -0.310 / 0 - and running text keeps plain Georgia.

Matching display is the side worth matching. The static shell headline is the only text that paints before the bundle exists; one 48 px centred line 3% adrift moves visibly, and the same 3% on an 11 px label does not. `local('Georgia')` deliberately fails to match on Android, where no Georgia is installed, and the stack falls through to the unadjusted entry and the system serif - which is right, because the adjustment was measured against Georgia and means nothing without it.

`font-display: swap`, never `block` or `optional`. `block` hides the loading card's own progress text for up to three seconds on the reader whose connection is worst. `optional` means a first-time player on a slow connection never sees the face at all, which is the whole design withheld from exactly the people who reach the game through a browser because they have nothing else.

A reader who has asked for `prefers-reduced-data: reduce` keeps a plain system serif and never fetches the file. The media query sits on both the preload and the `--herd-font` declaration, because a font is fetched only when something asks to draw a glyph in it: suppressing the request means never naming the family. That branch takes no `size-adjust` either - nothing is going to swap, and a permanent 3% shrink is a real cost paid for an event that will not happen.

## Self-hosted, always

No Google Fonts CDN, no third-party font host. Three reasons, each sufficient on its own.

Cache partitioning landed in Chrome 86 in October 2020, so a visitor who loaded the same font on another site does not get it from cache here; the cross-site reuse that once justified a CDN no longer exists. A CDN request discloses the reader's IP address to a third party, and the Landgericht Munchen I found exactly that unlawful without consent on 20 January 2022 in case 3 O 17493/20. And a third-party host is a render-blocking dependency on infrastructure this project does not control, in a game whose loading budget is measured in `spec/08`.

The font sources live in `assets/fonts/` with `OFL.txt` and a `README.md` recording designer, retrieval date, output digest, axes and character set, the same ledger every other asset in `assets/` carries. OFL 1.1 is compatible with this project's AGPL-3.0-or-later: the licences cover different works, and the OFL's only conditions here are that the licence travels with the font and that the reserved name is not applied to a modified version. The subsetted file keeps the name Piazzolla and is a subset rather than a modification, so it ships as Piazzolla with the licence beside it.

## Screen-anchored labels

The gate cue and the sheep nameplate are DOM drawn over the canvas, not text drawn in it. That is deliberate and it is a resolution decision, not a convenience: `app/src/scene/autoTier.ts` caps the canvas device pixel ratio between 0.8 and 1.5, chosen from a measured p95 of 14.0 ms against 7.1 ms. DOM composites at the device's own ratio, which is 3 on the phone where the defect was reported. In-canvas text would be roughly a third of the resolution on the exact device that complained.

Two rules hold a screen-anchored label still. They are written here because only the gate cue was found breaking them; the nameplate keeps its own projection, and a shared module for one caller would be an abstraction pretending to a second.

**Sample every frame.** The camera moves every frame, so a point projected at a lower rate holds position and then hops, and the hop size varies with how the sampling beats against the frame interval. That reads as jitter, and it reads worst where frame pacing is least even, which is a phone. The gate cue previously projected at 20 Hz.

**Do not round.** A whole-pixel transform quantises motion to steps a device pixel ratio of 3 magnifies to three device pixels. Sub-pixel transforms are composited rather than laid out, so the precision is free. `gateProjection.ts` previously rounded x and y to integers.

One more rule comes from the same defect. **No CSS transition on a transform that is written every frame** - a 150 ms interpolation retargeted every frame never lands; it trails the camera and rubber-bands, and that is what the transition was doing to the gate cue. Opacity keeps its transition, because opacity changes on state and not on camera motion.

A third rule used to sit here: digits that change in place needed `tabular-nums` and a `min-width` in `ch`, because a badge centred under `translate(-50%, -100%)` re-centres itself every time its distance readout loses or gains a digit. The gate cue no longer carries digits - see `spec/06` - so the rule has nowhere left to apply and is recorded rather than required. The nameplate's text does not change in place.

Position goes straight to the element; the store carries only what a reader can see in words. The store has 74 selector call sites across 16 files, so publishing a position sixty times a second would run roughly 4,400 selectors a second to move one token. `GateGuidance` writes the transform and `--gate-angle` per frame, writes opacity and `--gate-range` only when they have moved by more than a quarter of a percent, and calls `setState` only when `onScreen` or `obscured` changes. Those two booleans are now the whole of `store.gateIndicator`: it used to carry x, y, angle and distance as well, refreshed only when a coarse key changed, which is a stale value waiting for a second reader. The terrain-occlusion walk stays at 20 Hz, because it answers a slow boolean rather than a position.

## Interface text standing on the field

The title screen draws its identity row and its two footer links straight onto the grass, with no card behind them. That is three separate constraints, and getting two of them right is what made the third visible.

**Contrast is measured against the field, not against the paper.** `--herd-ink-soft` is a legitimate tone on a panel and fails everywhere off one: sampled against the actual title-screen render it holds 4.19:1 on light grass and 2.73:1 where a cloud shadow crosses, so it misses the 4.5:1 AA floor for small text on the good pixels and the 3:1 large-text floor on the bad ones. `--herd-ink` holds 5.61:1 at its worst point on the same frame. There is no softer tone that survives: the lightest ink that clears 4.5:1 against the darkest grass sampled is `#40372c`, already 68% of the way from soft to full ink and indistinguishable from it. So text over the field is full ink, and hierarchy on that row is carried by the underline instead of by tone.

**The halo is a token, not a literal.** `--herd-halo` is three tight stops rather than one wide blur, because an 18px shadow spreads too thin to lift 13px type off moving grass. It is in `tokens.ts` with the rest of the styling authority.

**A `<button>` does not inherit it.** The user-agent stylesheet sets `text-shadow: none` on `button`, and `text-shadow` does not inherit past that reset, so `Edit` was the one word on the identity row with no ground under it while every word beside it had one - at identical colour, size and weight. Measured, not guessed: `getComputedStyle` on the button returned `textShadow: "none"` against the span's three stops. Anything using `--herd-halo` on a button has to set it explicitly, and `.herd-text-button` does.

## What was removed, and why it is not coming back

`@pmndrs/glyph` and the 1,384,672-byte `sheep-font.font.glb` it baked. The glyph billboard was replaced by the DOM nameplate in `50757dae` to beat the canvas DPR cap, and the bake pipeline was left behind: nothing loaded the `.glb`, and it shipped to `dist/` anyway. Removing it, `tools/bake-font.mjs`, the orphaned Alice TTFs and the `overrides` block that existed only to reconcile glyph's r3f peer range took 8 packages out of the lockfile.

The rule that follows: **in-canvas text is for text that belongs to the world**, which this game currently has none of. Anything a player reads as interface is DOM, at the device's own pixel ratio, in the interface face.

## Receipts

`tools/label-jitter-probe.mjs` drives the real game in the real build, holds a run and a turn together so the projected point is sweeping for the whole sample, and reports the mean absolute second difference of each label's screen position - jerk, in CSS pixels per frame squared - along with the fraction of frames on which the label did not move at all. Every run is on one machine against `dist`.

The throttle matters and the repo's `MID_MOBILE_PROFILE` rate of 4 does not bite on a fast workstation: it produced 7.0 ms frames against the desktop case's 6.9 ms, which is a narrow viewport and not a phone. `--cpu=8` produces 27.8 ms frames, about 36 fps, which is. These are the numbers from there, and the gate samples in both runs measured an identical 27.8 ms, so they compare like for like.

| gate cue, 390x844 at 8x | jerk x | jerk y | stalled |
| --- | --- | --- | --- |
| before | 1.261 px | 0.866 px | 50.6% |
| after | 0.100 px | 0.074 px | 0.0% |

Twelve times less, and across four runs of the fixed code the x figure sat between 0.079 and 0.100 px, so that is the effect and not a lucky sample. The stalled fraction is the defect stated plainly: the cue held still for half the frames and then hopped. It is now written every frame and never stalls. The desktop case moves the same way, 0.479 px to 0.007 px with 87.4% stalled going to 0.0%.

## The nameplate hypothesis, and why it was dropped

The sheep nameplate was expected to have the same defect in a different form: it damps toward `sim.positions`, which is the fixed tick pose, while the mesh under it is drawn at the interpolated pose. That predicts the badge and the animal drifting apart and back together with every uneven frame.

Three variants were measured at 8x, where the phone actually lives:

| nameplate, 390x844 at 8x | jerk y | frame | normalised to 27.7 ms |
| --- | --- | --- | --- |
| shipped: raw tick pose, damped | 0.439, 0.462, 0.615 px | 27.7 - 27.8 ms | 0.44 - 0.62 px |
| interpolated pose, no damp | 2.123 px | 21.0 ms | 3.69 px |
| interpolated pose, damped | 0.631 px | 20.9 ms | 1.11 px |

The hypothesis was wrong, and the shipped code is the best of the three. Jerk from smooth motion goes as the square of the frame interval, so the two alternatives have to be scaled up to the shipped runs' frame time before they can be compared; both land well outside the shipped code's own spread even after that.

The reason is the tick-to-frame ratio. Above the tick rate, `interpolationAlpha` saturates at 1 and the interpolated pose is a clean staircase, which is why both alternatives measure five times BETTER than the shipped code on the 145 fps desktop - a case nobody complained about. Below it, at 36 fps, a 60 Hz tick lands one tick on some frames and two on others, the alpha is itself noisy, and a badge reading it inherits that noise. The damp is a frame-rate-independent low-pass and takes it out; reading raw positions through that filter turns out to cost less than reading a noisy alpha.

So the nameplate is untouched. The correctness argument for it - that a label should sit on the pose the animal is DRAWN at, not one it is not standing on - is real and is not what the owner reported; buying it would cost 2.4 times the jerk on the symptom that was reported. If it is ever revisited, the thing to fix first is the alpha, in `presentationBuffers.ts`, where every reader would get it.

Three runs of unchanged nameplate code at matched frame times gave 0.439, 0.462 and 0.615 px, so this measurement carries roughly a sixth of its value in run-to-run spread and a reading has to clear that before it means anything. The gate cue's does, by an order of magnitude. The nameplate alternatives clear it in the wrong direction.

## Open

The title is set in Piazzolla at `clamp(44px, 8.5vw, 88px)` with 0.035 em of tracking and the face's own kerning active (measured: 576 px against 577 px unkerned). Optical ink gaps across "Sheepdog Sim" run 0.075 to 0.125 em about a mean of 0.099, and the two loosest pairs are both a capital S against a following stem. Whether that wants hand-kerning is a judgement for an eye on the rendered title rather than for this measurement, which conflates serif extent with optical fit in a serif face. Nothing else is waiting on it.
