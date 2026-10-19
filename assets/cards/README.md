# Score-card stills

Three frames of the version 3 field, used as the background of a shared run
(`spec/14-score-cards.md`). The Worker draws the glass and the type on top.
It does not render the field to answer a request.

The frames are our own picture of the shipping client. No third-party asset
is in them. The type on the card is Piazzolla, SIL OFL, the face already
recorded in `assets/fonts/README.md`. The file the Worker reads is a byte
copy at `app/public/fonts/piazzolla-card.ttf`.

## How a frame is made

`tools/capture-card-plates.mjs` runs the production build at seed `20260821`,
hides the interface, drives the dog toward the flock, and takes four cinema
stills at 1440 by 810. `low` is not shipped: that angle has no sheep.
`tools/bake-card-plates.mjs` scales the other three to 1200 by 630 JPEG.
They are the same 16:9, so the bake is a scale and not a crop.

A rebake is a visual decision. The committed JPEGs are the ones a card uses.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `app/public/cards/flank.jpg` | 137,376 | `a3ea6ced8f99ce04acafd03e3b426db8056b5119134306fee7c2cda6e9feaa2e` |
| `app/public/cards/across.jpg` | 135,163 | `fb9e3e21ef35bfc71d287c47ddc495820835b419437e54d0f94446b7f5e06632` |
| `app/public/cards/wide.jpg` | 159,229 | `284543657b90e972ce3736045e48b1392c80c79f2c73b5b3244a92e665bb1d49` |

`flank` and `across` leave the open grass on the right. `wide` leaves it on
the left. The submission id picks the frame, so one link keeps one picture.
The panel is drawn on that open side and kept inside the center square.
