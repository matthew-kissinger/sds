# 14 - Score cards and weekly boards

How a finished run becomes a link someone can post, and how a week of runs
gets its own board beside the all-time one.

Multiplayer and the flock-tending mode stay behind this
(`spec/10-roadmap.md`). Nothing here changes `sim/`, the trace fixtures,
or which times are legal.

## What a shared link has to do

A player finishes a run, or opens one of their old runs, and sends a link.
The post, on X, Discord, iMessage, Slack, Facebook or anywhere else that
reads Open Graph, shows:

- the time
- the flock size, 25, 75 or 200
- their rank on the all-time board, and their rank in the week that run
  belongs to
- their name
- a way to play that same flock size

The game page cannot do this. Crawlers read the first HTML response and do
not run the client. `index.html` has one static description, so a query
string on the game URL unfurls as the game in general and never as a time.

The link is therefore its own page, drawn by the Worker from the submission
row. The numbers on the card are the numbers the board would give. A link
cannot claim a rank the row does not hold.

## The link

`GET /c/<id>.<sig>` is the page. `GET /c/<id>.<sig>.png` is the image the
page's `og:image` points at.

`id` is `score_submissions.id`. `sig` is base64url HMAC-SHA256 of
`card:<id>` under `JWT_SECRET`, verified with the worker's Web Crypto before
any read. A wrong signature is a 404, the same as an unknown id. The secret
never reaches the client. `POST /api/score` and `GET /api/my-scores` return
`sharePath` for rows that belong to the caller. An old worker that omits
`sharePath` leaves the client with nothing to share, and the run still
displays.

The id stays in the path so the page can be cached and so a person can see
which run it is. The signature is what stops a stranger enumerating ids and
opening every slower run that never made the public board. Sharing the link
is what publishes that run. Anomaly-flagged rows 404. They are already
hidden from the board (`spec/12-my-times.md`); a card would put them back.

`/r/*` stays reserved for rooms (`spec/03-multiplayer.md`). Cards do not
borrow it.

The asset layer currently runs the Worker first only for `/api/*`
(`wrangler.toml`, `app/cloudflare.config.ts`). A card path would otherwise
fall through to `index.html` and unfurl as the game. The same change adds
`/c/*` to both `run_worker_first` lists and to the tests that pin them.

## What the page says

One page, both ranks. There is not a separate weekly link.

The title is the time and the flock size: `1:17.9 · 25 sheep`. The
description leads with the week, then all-time:
`3rd of 40 in the week of 12 Oct. 12th of 248 all-time.`
`og:site_name` is `Sheepdog Sim`. `twitter:card` is `summary_large_image`.
`og:image` is 1200 by 630. The sentences stay at that length. No hype, no
emoji, no exclamation mark.

The rank is the one `spec/12` already defines: one plus the number of
players whose best on that board is strictly faster than this time. The
all-time board is the board that ships. The week board is the same
membership — `field-v3`, the four solo slugs, anomaly rows excluded, that
flock size — restricted to submissions whose `submitted_at` falls in the UTC
week that contains this row. Monday 00:00 UTC opens the week. A player's
faster run in the same week counts ahead of their slower one, exactly as
all-time does. The week is named from the run, not from the day someone
opens the link, so a run from last month still says last month.

The page a person opens recomputes both ranks. The PNG is allowed to be up
to ten minutes behind (`Cache-Control: public, max-age=600`), and the social
sites will cache it longer than that. The sentence on the page is the live
one. Chasing a platform's cache is out of scope.

The image is a PNG the Worker rasterizes. SVG is not reliable as `og:image`.
It uses Piazzolla, the face the game already ships (`spec/11-typography.md`),
from the font source already in the repo. The background is one of three
baked stills of the field, chosen from the submission id so a link does not
change picture, with an editable capture recipe and a provenance line. It is
not a WebGPU frame rendered on the request. The type sits on a tight
translucent panel, warm paper over the still. The rasterizer does not blur
the still behind the type, so the panel is opaque enough to read. The panel
stays inside the center 630-pixel square of the 1200 by 630 frame, which is
the crop some text apps keep. The image shows Sheepdog Sim, the time, the
flock size, the name and both ranks. The picture drops the field sizes
(`of 40`, `of 248`). Those stay in the description and on the finish panel.

A missing or flagged run is a short 404 in the same voice, with a link back
to the game and generic Open Graph tags so a dead post does not unfurl as an
error from the host.

## Play this field

The card's action is `Play 25 sheep`, `Play 75 sheep` or `Play 200 sheep`.
It goes to `/play/25`, `/play/75` or `/play/200`.

That path is not a query parameter. `spec/01` caps the game's player query
parameters at `seed` and `debug`. The 2026-10-20 multiplayer plan removes the
unimplemented `room` query from the earlier text; invites will use `/r/*`.
The single-page-application fallback already serves `index.html` for
an unknown path, so `/play/25` needs no Worker route. The client reads the
path once, at boot, and calls the existing `startGame` with that flock size.
Any other `/play/` value is ignored and the title comes up at 25, which is
the default today. `seed` and `debug` still work as query parameters beside
the path.

The same change amends the URL paragraph in `spec/01` to name these three
paths. The release probe that forbids extra query parameters stays as it is.
The path gets its own test.

`og:url` is the card, not `/play/25`. The post opens the card. Play is the
step after that. Pointing `og:url` at the game would drop the time off the
unfurl.

## Where Share sits

Two places, one path:

- The completion panel, once `POST /api/score` has returned `sharePath` for
  the run just finished. If the submit failed, the time is still there and
  Share is absent. Play is never blocked on it.
- Each run on My times, once that row includes `sharePath`.

Where `navigator.share` exists, the button uses it with the title, the
sentence, and the absolute card URL. The sentence on a run that just
finished is `4:35.9 with 25 sheep. 9th of 27 this week.` A new personal best
puts `New best.` in front of that. An older run names the week by its
Monday: `4:58.2 with 25 sheep. 11th of 27 in the week of 12 Oct.` Otherwise
the button copies that sentence and the absolute URL together, and the
control says `Link copied`. That line replaces itself. It is not a toast,
and there is no retry prompt (`spec/06`). Cancelling the share sheet leaves
the button.

The public board does not gain a Share button in this change. A best is a
submission, so the same path can be added later without a new URL shape.

## The weekly board

The week is a filter on `submitted_at`, computed on the server. It is not a
`game_mode` the client posts. The old daily modes take a date string from
the client, and that string is forgeable. A weekly mode of that shape would
be the same hole. Every existing row already has a server timestamp, so no
migration and no backfill are required.

`GET /api/leaderboard` gains an optional `week`. Absent, the response is the
all-time board the client already requests, unchanged. `week=current`
resolves on the worker clock. `week=2026-W43` is that ISO week, Monday UTC.
Anything else is a 400. The limit stays 100.

The solo times panel gains two states beside the flock size: All-time and
This week. This week requests `week=current`. An empty week says `No times
yet this week.` A previous week is a step back to that `week` value, not a
calendar. My times does not grow a date column for this. The week is named
on the card. `spec/12` keeps the list ordered by time.

`boardRank` and `boardPlayers` stay the all-time standing. The week of that
submission comes back beside them as `weekRank`, `weekPlayers` and
`weekLabel`, optional the same way the all-time pair is optional. A worker
that has not been deployed yet still draws the sections, bars and deltas.

## What this change refuses

- No new verb, no mode flag, no change to a legal time or to the all-time
  membership.
- No accounts, and no share that waits on registration. Registration already
  happens behind the title. If it has not finished, there is no card, and
  the run is kept locally as it is today.
- No prize, streak or achievement attached to the weekly board. The week is
  a second ranking of the same runs.
- No reset and no delete of all-time rows.
- No multiplayer lobby, invite or NPC on this page. Those are the next
  slice, and party links stay on `/r/*`.
