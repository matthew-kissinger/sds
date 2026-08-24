# 05 - Art direction: cel-shaded painterly zen

herd should look like a landscape painting that learned to move. Cel-shaded light for clarity and charm; painterly texture and color for warmth; zen restraint in everything.

## The reference bar (described, since there is no single comp)

Hold work against these qualities, not against any one game:

- **Ghibli meadows**: rolling green fields with wind you can see, big soft clouds, warm haze at the horizon. Grass reads as brushstroke masses, not photoreal blades.
- **Breath of the Wild / Genshin ramp discipline**: two-to-three band toon shading with a soft terminator, colors that stay saturated in shadow (shadows shift hue toward cool, never toward gray or black).
- **Alto's Odyssey calm**: a restrained palette per moment, silhouette-first composition, gradients doing atmospheric work.
- **A Short Hike / Tunic friendliness**: chunky, confident low-poly shapes with zero anxiety about polycount. Charm over fidelity.

If a raw screenshot could pass for concept art of a cozy pastoral game, the bar is met.

## Rendering the look (all TSL)

- **Toon ramp**: custom TSL lighting with 2-3 quantized bands, softened band edges (smoothstep width ~0.05), warm key from the golden-hour sun, cool sky-tinted ambient. Rim light on sheep and dog for silhouette pop against grass.
- **Painterly surface**: hand-painted-style albedo (authored or gradient-mapped), subtle painted-noise breakup in large flats so nothing reads as vector-flat. No photoreal texture sources, no PBR metalness anywhere.
- **Outlines**: tasteful and thin. Inverted-hull or normal/depth-edge post pass on hero objects (sheep, dog, fence, house); the grass and terrain go outline-free. Outline color is a darkened warm tone of the surface, never pure black.
- **Palette**: one master palette module (`app/src/tsl/palette.ts`), every material samples from it. Sun-warmed greens and golds, cream wool, rust-red barn accents, dusty blue sky. Programmatic palette shifts stay possible because nothing hardcodes color outside the module.
- **Post**: subtle vignette, gentle bloom on the sun and window glow, one film-grain-free color grade. Post is seasoning, not the dish.

## The critic loop

Every visual deliverable passes a harsh-critic gate before it counts as done (prompts in spec/prompts/). The loop:

1. Builder agent produces the asset/scene state and captures screenshots from the game's actual cameras (the two gameplay distances, plus one beauty angle), at both desktop and phone aspect.
2. A separate critic agent, primed to be genuinely harsh, judges against the reference bar above and the checklist in `spec/prompts/harsh-critic.md`. It scores silhouette, ramp discipline, palette cohesion, readability at gameplay distance, and "would this frame pass for concept art."
3. Anything below wowed loops back with specific, actionable notes. The critic never accepts "good enough for now."
4. Cohesion pass: assets are also judged IN the scene next to their neighbors, because painterly styles die by mixed provenance (sds's world mixed procedural, purchased, and photoreal-textured assets and never converged).

## Hard rules

- Silhouette first: every asset must read as itself in flat black. If the sheep's silhouette is ambiguous, no shading will save it.
- Consistent light direction everywhere; baked directional cues in textures are forbidden.
- Saturated shadows (hue-shifted), never gray mud.
- No photoreal textures, no mixed art provenance, no asset ships without the critic gate.
- Readability beats richness: at Classic camera height the flock must part visually into individual sheep, and the dog must be findable in under a second.
