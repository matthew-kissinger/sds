# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 Matthew Kissinger
#
# The interface font recipe. Subsets Piazzolla to the characters this client
# actually draws and ships it as one variable woff2.
#
#   npm run bake:font          rebake into app/public/fonts/
#   npm run check:font-bake    verify the committed file is byte-identical
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

WEIGHT_RANGE = (400, 700)
OPTICAL_RANGE = (8, 30)


def bake() -> bytes:
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
    subsetter.populate(unicodes=CODEPOINTS)
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

    baked = bake()
    digest = hashlib.sha256(baked).hexdigest()

    if '--check' in sys.argv:
        if not OUTPUT.exists():
            print(f'Committed font does not exist: {OUTPUT}', file=sys.stderr)
            return 1
        current = OUTPUT.read_bytes()
        if current != baked:
            print(
                'Committed font differs from a fresh bake.\n'
                f'  committed: {len(current)} bytes, sha256 '
                f'{hashlib.sha256(current).hexdigest()}\n'
                f'  rebaked:   {len(baked)} bytes, sha256 {digest}\n'
                'Run: npm run bake:font',
                file=sys.stderr,
            )
            return 1
        print(f'Font is current: {len(current)} bytes, sha256 {digest}')
        return 0

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(baked)
    print(f'Wrote {OUTPUT.relative_to(ROOT)}: {len(baked)} bytes, sha256 {digest}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
