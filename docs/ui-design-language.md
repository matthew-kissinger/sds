# SDS UI Design Language

> Cycle 49 (`pastoral-vision`), Phase 1. The written north star for the Pastoral UI/UX rework program (Cycles 49-52). It defines the calm-pastoral / painterly look the implementation cycles build toward. Color names here are intent; the real `@theme` tokens land in Phase 2. The look is reviewed on the standalone `/gallery` route (Phase 3 onward), since headless WebGPU does not composite.

This document supersedes the zen-boids entrance direction from the entrance/UI spike ([`../cycle45-validation/entrance-ui-spike.md`](../cycle45-validation/entrance-ui-spike.md)). The drifting-boid attract field is retired as the default entrance (the code is kept, archived behind a flag, in Cycle 50). The new entrance is an instant lightweight menu on a painterly pastoral backdrop.

## Principles

1. **The world carries the spectacle; the UI stays quiet.** The 3D scenes (golden-hour Rolling Hills, the open ocean of Open Country) are the color and drama. The UI is a calm warm frame around them, never competing for attention.
2. **Instant over impressive.** First paint is a fast, light menu, not a heavy scene. Nothing the player waits on at entry. The 3D world loads only when they commit to a scene.
3. **Alive but unhurried.** Motion is gentle and slow, the pace of dusk. Every animation has a reduced-motion path that collapses to calm and still.
4. **One palette, one type system, one set of surfaces.** Every screen reads from the same tokens. No per-component hex, no second styling era. A new screen composes existing primitives and tokens, it does not invent its own look.
5. **Reads as a herding game.** Where the UI shows imagery, it is pasture, dusk, sheep, and dog, not abstract shapes. The entrance especially should be unmistakably this game at a glance.
6. **Honest feedback.** Loading and progress reflect real work, smoothed so they feel calm rather than mechanical.

## Mood

Calm pastoral, painterly, herding at dusk. The anchor is the Rolling Hills hero scene at golden hour: warm low sun, long soft shadows, sage-green slopes, a dusty-gold sky fading to rose and lavender at the horizon. The feeling is the quiet end of a working day on one fenced pasture and two islands, not a flashy arcade title screen.

Touchstones: golden-hour light, hand-painted storybook landscapes, soft watercolor washes, warm frosted glass like morning haze. The opposite of neon, dark slate, and hard sci-fi chrome.

## Palette

A warm golden-hour palette. Names below are the intent; Phase 2 lands them as `--color-*` tokens in `css/main.css` and mirrors them in `tokens.ts`. Representative hex is a starting point for the gallery, not final.

- **Sky / backdrop (the golden-hour gradient).** `pasture-dawn` warm apricot high in the sky (around #f6d8a8), `pasture-gold` soft gold mid (around #f0b878), `pasture-dusk` dusty rose low (around #d99a8f), settling into a faint lavender horizon (around #b9a6c4). These drive the entrance backdrop and any large warm field behind glass.
- **Land.** `meadow` warm sage green (around #8aa66a) for healthy pasture, `hill-shadow` a deeper cooler green for slopes in shade (around #4f6b52). Used in the entrance hill silhouettes and any pastoral illustration.
- **Surfaces (warm glass).** `glass-warm` a warm translucent off-white (warm white at low alpha over the backdrop), `glass-warm-border` a soft warm hairline, `scrim-warm` a gentle warm darkening for modal backdrops. Warm, never cold slate.
- **Text.** `ink` a warm near-black espresso (around #2b2620) for text on light surfaces, `ink-soft` a muted warm brown for secondary text, `cream` a warm off-white (around #f7f1e6) for text on dark or photographic surfaces.
- **Accent.** `accent-meadow` a warmed meadow green (a softer, slightly golder green than the current emerald) as the primary action color, with `accent-gold` a low-sun gold as the secondary highlight. Existing semantic colors (danger, warn, success, info) stay but warm slightly to sit in the palette.
- **Per-scene accents.** Keep the existing per-scene accent idea (Rolling Hills, Open Country, Home Field) but re-tune each to a warm golden-hour reading of that biome.

The discipline: a converted component reads `tokens.pastoral.*`, never a raw hex. Phase 2 adds these additively so the live look does not change until Cycles 50-52 migrate components onto them.

## Typography

A full pastoral type system: a warm display face paired with a clean humanist text face, self-hosted and subset, used consistently across the UI.

- **Display (titles, screen headers, the game title).** Lead proposal: **Fraunces**, a soft old-style display serif with a painterly warmth (variable, with optical-size and softness axes, SIL Open Font License, self-hostable). Carries the storybook-pasture character. Used for the title, screen headings, and large numbers (timer, sheep count) where character helps.
- **Text / UI (body, labels, buttons, dense readouts).** A clean warm humanist sans for legibility at small sizes. Candidates to compare on the gallery: Inter (neutral, dense-UI-proven), Nunito Sans or Mulish (softer and warmer). Lead: Inter for legibility, with a warmer humanist sans as the alternative if the UI wants more softness.
- **Scale and weight.** A modest type scale (roughly 0.8 / 1 / 1.25 / 1.6 / 2.5 / clamp for the title). Display in a heavier optical weight for titles, regular for headings. Text face at regular and medium only. Generous line-height for the calm feel.
- **Loading.** Fonts are self-hosted woff2, subset to the glyphs the UI uses, with the display face preloaded. Font-display strategy (swap versus optional) and the exact faces are confirmed on the gallery and wired in Cycle 50. Until a face loads, fall back to a system serif (display) and system sans (text) so there is no invisible-text flash.

The actual faces are a taste call confirmed by eyeballing the gallery, not committed blind here.

## Motion

Gentle, slow, ease-out, reduced-motion-first.

- **Pace.** A touch slower and softer than the current 160-320ms tokens. Screen transitions and reveals favor a calm ease-out over a snappy spring. Nothing pops.
- **Ambient.** The entrance backdrop drifts on a long loop (sky gradient shift over roughly 20-40s, a whisper of mote drift, a hint of parallax on pointer). Ambient motion is decorative and always optional.
- **Functional.** Menu screen transitions keep the existing Motion layer (the keyed `motion.div` in `AnimatePresence`) but re-tuned to the calm pace. The scene-card slide stays on Motion.
- **Loading.** The loading bar fills from real build-stage marks (`summarizeLoadStages` in `js/boot/initWorld.js`), eased so it animates continuously and never visibly stalls or jumps, and starts partly filled when idle-prefetch has pre-paid assets. Detailed in the entrance/loading spec (Phase 5).
- **Reduced motion.** Every ambient and transition path honors `prefers-reduced-motion` via the existing `useReducedMotion` hook and the `main.css` reduced-motion block. With reduce-motion on, the backdrop is a still painterly frame, transitions collapse to near-instant, and the loading bar fills without the easing flourish.

## Surfaces

Airy warm glass over warm backdrops, like morning haze, not dark frosted slate.

- **Glass panels.** Warm translucent off-white at low alpha, soft blur, a warm hairline border, and a soft low shadow. They sit lightly over the golden-hour backdrop and let its warmth through.
- **Cards and tiles.** The scene and mode tiles keep the accent-framed selectable surface, re-tuned to warm glass with the per-scene accent as the active frame.
- **Modals and scrims.** A gentle warm scrim behind modals, not a hard black overlay. The loading cover is a warm pastoral surface, not a dark blurred box.
- **Depth.** Soft and shallow. One or two gentle shadow steps, no harsh drop shadows or hard edges.

## Entrance

An instant lightweight menu on a painterly pastoral backdrop. No heavy 3D at entry: no WebGPU renderer, no `buildSceneBody`, no attract field. The 3D world appears only when the player commits to a scene (Cycle 50 builds the handoff).

- **Backdrop.** A layered 2D / CSS / SVG painterly pastoral scene: a golden-hour sky gradient that slowly drifts, soft rolling-hill silhouette layers with a light parallax on pointer move, a faint drift of dusk motes, and a small dog-and-sheep silhouette on the ridge so it reads unmistakably as this game. Reduced-motion collapses it to a still painterly frame. Cheap to render and composites headlessly, so it previews on the gallery.
- **Foreground.** The game title (display face) and the scene picker float over the backdrop on warm glass. The picker is the primary control. Choosing a scene commits and streams the real scene in.
- **Why not the boids.** The drifting-boid field read as abstract birds, disconnected from herding, and the heavy-scene-behind-the-menu approach made entry slow. The instant menu fixes both: it is unmistakably the game and it is fast.

The full entrance and loading behavior (commit-to-build, idle prefetch, in-engine crossfade, the loading screen) is specified in the entrance/loading spec (Phase 5) and built in Cycle 50.

## Anti-goals

- **No dark slate or cold glass.** The surfaces are warm. No charcoal panels, no cold blue-grey frosted glass.
- **No neon or gamer-chrome.** No high-saturation accents on near-black, no hard sci-fi edges.
- **No heavy 3D at entry.** The entrance is 2D and instant. The WebGPU world is the reward for picking a scene, not the loading screen.
- **No abstract attract field as the entrance.** The drifting boids are retired as default. If they return, it is as a deliberate future feature, not the front door.
- **No literal skeuomorphism.** Painterly and warm, not wood-grain panels or felt textures.
- **No AI-slop prose anywhere player-facing.** No em-dashes, no exclamation marks, no hype words (amazing, stunning, blazing), no emoji. Concrete numbers over adjectives. Matt's voice.
- **No per-component hex or one-off styling.** Everything reads from the shared tokens and primitives.

---

**References.** Program plan: the Matt-approved Pastoral UI/UX rework (Cycles 49-52). This cycle's plan: [`cycle-49-plan.md`](cycle-49-plan.md). Research the program draws from: [`../cycle45-validation/entrance-ui-spike.md`](../cycle45-validation/entrance-ui-spike.md). Prose rules: [`../.claude/rules/prose-and-voice.md`](../.claude/rules/prose-and-voice.md). Palette and type land as tokens in Phase 2; the look is reviewed on the `/gallery` route from Phase 3.
