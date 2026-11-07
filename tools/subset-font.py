# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 Matthew Kissinger
#
# The interface font recipe. Subsets Piazzolla to the characters this client
# actually draws and ships it as one variable woff2.
#
#   npm run bake:font          rebake into app/public/fonts/
#   npm run check:font-bake    verify the committed files are byte-identical
#
# Three files. piazzolla-ui.woff2 is what every page loads. piazzolla-ui-latin1.woff2
# holds the accented Latin that Spanish, Portuguese, French and German need, and
# piazzolla-ui-cyrillic.woff2 the Russian alphabet, each behind a unicode-range in
# UiStyles, so a page that draws none of those characters never fetches them.
#
# Two axes survive the bake. `wght` spans 400-700 because UiStyles uses all
# four of those weights, and synthesising the missing ones smears the stems.
# `opsz` stays live across 8-30 so the 10px flock counter and the 48px+ title
# draw from optical cuts made for those sizes rather than one cut stretched
# across the whole range; `font-optical-sizing: auto` then costs nothing to use.
# Pinning opsz would save about 9 KB and throw that away.

import hashlib
import io
import sys
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets' / 'fonts' / 'Piazzolla[opsz,wght].ttf'
OUTPUT = ROOT / 'app' / 'public' / 'fonts' / 'piazzolla-ui.woff2'
LATIN1_OUTPUT = ROOT / 'app' / 'public' / 'fonts' / 'piazzolla-ui-latin1.woff2'
CYRILLIC_OUTPUT = ROOT / 'app' / 'public' / 'fonts' / 'piazzolla-ui-cyrillic.woff2'

# Printable ASCII, plus every non-ASCII character the client draws. The two
# rotation arrows the settings panel uses (U+27F2, U+27F3) are absent from
# Piazzolla and keep falling back to a system face, as they already do.
CODEPOINTS = (
    list(range(0x20, 0x7F))
    + [
        0x00A0,  # no-break space
        0x00B7,  # middot, the separator in HUD and menu rows
        0x2013, 0x2014,  # en and em dash
        0x2019,  # right single quote, the apostrophe in prose
        0x201C, 0x201D,  # curly double quotes
        0x2022,  # bullet
        0x2026,  # ellipsis
        0x2039, 0x203A,  # single angle quotes, the pager chevrons
        0x25C6,  # black diamond, the nameplate rosette
    ]
)

# The Latin-1 Supplement without the two the base file has, plus French oe and
# German low quotes. These ranges must match the unicode-range in UiStyles.
LATIN1_CODEPOINTS = [c for c in range(0xA1, 0x100) if c != 0xB7] + [0x152, 0x153, 0x178, 0x201A, 0x201E]
# The Russian alphabet and the numero sign.
CYRILLIC_CODEPOINTS = [0x401, *range(0x410, 0x450), 0x451, 0x2116]

WEIGHT_RANGE = (400, 700)
OPTICAL_RANGE = (8, 30)


def bake(codepoints: list[int]) -> bytes:
    # Without this fontTools stamps head.modified with the current time on
    # save, and two bakes of the same source stop matching byte for byte.
    font = TTFont(SOURCE, recalcTimestamp=False)

    options = Options()
    # lnum and tnum are what let the HUD ask for steady lining figures; onum
    # and pnum keep the text default available for prose.
    options.layout_features = ['kern', 'liga', 'calt', 'tnum', 'lnum', 'onum', 'pnum']
    options.notdef_outline = False
    options.drop_tables += ['DSIG']

    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)

    # Narrow the axes only after subsetting. Instancing first leaves gvar
    # entries for glyphs the subsetter then removes, and it raises KeyError.
    instantiateVariableFont(
        font,
        {'wght': WEIGHT_RANGE, 'opsz': OPTICAL_RANGE},
        inplace=True,
        updateFontNames=False,
    )

    font.flavor = 'woff2'
    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue()


def main() -> int:
    if not SOURCE.exists():
        print(f'Source font missing at: {SOURCE}', file=sys.stderr)
        return 1

    for output, codepoints in (
        (OUTPUT, CODEPOINTS),
        (LATIN1_OUTPUT, LATIN1_CODEPOINTS),
        (CYRILLIC_OUTPUT, CYRILLIC_CODEPOINTS),
    ):
        baked = bake(codepoints)
        digest = hashlib.sha256(baked).hexdigest()

        if '--check' in sys.argv:
            if not output.exists():
                print(f'Committed font does not exist: {output}', file=sys.stderr)
                return 1
            current = output.read_bytes()
            if current != baked:
                print(
                    f'Committed font {output.name} differs from a fresh bake.\n'
                    f'  committed: {len(current)} bytes, sha256 '
                    f'{hashlib.sha256(current).hexdigest()}\n'
                    f'  rebaked:   {len(baked)} bytes, sha256 {digest}\n'
                    'Run: npm run bake:font',
                    file=sys.stderr,
                )
                return 1
            print(f'Font {output.name} is current: {len(current)} bytes, sha256 {digest}')
            continue

        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(baked)
        print(f'Wrote {output.relative_to(ROOT)}: {len(baked)} bytes, sha256 {digest}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
