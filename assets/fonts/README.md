# Interface typeface

The client draws every piece of interface text in one typeface: **Piazzolla**,
by Huerta Tipográfica, licensed SIL Open Font License 1.1. The full licence sits
beside this file in `OFL.txt`, and the OFL permits redistribution inside this
AGPL-3.0-or-later project provided the licence travels with the font and the
reserved name is not applied to a modified face. The subset here is unrenamed
and unmodified in outline, so both conditions hold.

## Provenance

| | |
| --- | --- |
| Family | Piazzolla |
| Designer | Juan Pablo del Peral, Huerta Tipográfica |
| Upstream | `https://github.com/google/fonts/tree/main/ofl/piazzolla` |
| Retrieved | 2026-09-21 |
| Source file | `Piazzolla[opsz,wght].ttf`, 624,956 bytes |
| Licence | SIL Open Font License 1.1 (`OFL.txt`) |

## The bake

`tools/subset-font.py` turns the source into `app/public/fonts/piazzolla-ui.woff2`.

```
npm run bake:font          rebake
npm run check:font-bake    verify the committed file is byte-identical
```

The bake is deterministic: `head.modified` is frozen rather than stamped, so a
rebake of an unchanged source reproduces the committed bytes exactly.

| | |
| --- | --- |
| Output | `app/public/fonts/piazzolla-ui.woff2`, 26,228 bytes |
| SHA-256 | `05b752861fa8b81089a359415d71e455dd11b7e0c08f25a4820bd5cf111ec995` |
| Weight axis | 400-700, live |
| Optical axis | 8-30, live |
| Characters | printable ASCII plus U+00A0 U+00B7 U+2013 U+2014 U+2019 U+201C U+201D U+2022 U+2026 U+2039 U+203A U+25C6 |

Both axes stay live for reasons the sizes force. `UiStyles.tsx` uses weights
400, 500, 600 and 700, and a narrower range would leave the browser to
synthesise the rest, which smears stems at the sizes this HUD uses. The optical
axis spans the range the client actually draws, from the 10px flock counter to
the title above 48px, so `font-optical-sizing: auto` selects a cut made for the
size instead of stretching one cut across the whole span. Pinning the optical
axis would save roughly 9 KB and give that up.

The settings panel's two rotation arrows, U+27F2 and U+27F3, are absent from
Piazzolla and continue to fall back to a system face, as they did before.

The font ships exactly as Huerta Tipografica drew it, subset and with both axes
narrowed - no glyph, outline or metric is edited here. The one fitting this
interface needed, opening Piazzolla's tight word space from 0.153-0.188 em
toward Georgia's 0.241 em, is a `word-spacing` declaration in the stylesheet
rather than an edited advance width, so the bake stays reproducible from
upstream and the decision stays where a designer would look for it.
`spec/11-typography.md` has the reasoning.

## Why this replaced a system stack

The client previously declared `ui-serif, Georgia, "Times New Roman", serif` and
downloaded nothing, which resolved to three different typefaces: New York on
Apple platforms, Georgia on Windows, and Noto Serif on Android, where Georgia is
aliased away. `spec/06-ux-ui-juice.md` asks that typography feel like the game
rather than like a stock component library, and a stack that renders as whatever
each platform happens to install cannot meet that. `spec/11-typography.md`
records the contract this font now satisfies.
