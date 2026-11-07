# Anonymous game counts

A small funnel for the owner: how far a page load gets, on what kind of device, in which language, how the game ran, and whether a language was offered, chosen and kept. It uses the `events` table and the `/api/event` route that already exist, with no new binding, secret or third party.

## Why the table was empty

`/api/event` in `worker/src/index.ts` is the only code that writes to `events`. The version 2 client called it (the `game_completed` style events, and the crash beacon from `ErrorBoundary`). The clean-room client, `fe930f0a` on 2026-08-24, removed all of that and replaced nothing, and at `d48874ec` no file under `app/`, `sim/`, `tools/` or `lab/` calls the route. Only `tests/worker/event-props-cap.spec.ts` does. So nothing is broken, the route is simply unused: anything arriving after version 3 went live could only come from a version 2 tab left open or a stale cached client.

So the table holds version 2 rows only. This query shows what they hold:

```bash
npx wrangler d1 execute sds-db --remote --command "SELECT name, COUNT(*) AS n, MIN(created_at) AS first_at, MAX(created_at) AS last_at FROM events GROUP BY name ORDER BY last_at DESC"
```

## What is sent

One POST per event, from `app/src/funnel/funnel.ts`. Every event carries:

| Field | Value |
| --- | --- |
| `ui` | The interface language, such as `id` |
| `browser` | The browser's language tag, such as `id-ID`, or `other` if it does not look like one |
| `device` | `phone`, `tablet` or `desktop`, from whether the pointer is coarse and the short side of the window |
| `country` | Added by the Worker from `request.cf.country`. A client cannot set it |

| Event | When | Extra fields |
| --- | --- | --- |
| `funnel_load` | The page's code started, once per load | `source`: `default`, `saved` or `url` |
| `funnel_ready` | The field became ready | `load`, `renderer`, `tier` |
| `funnel_play` | A round started | `flock`, `mode` |
| `funnel_moved` | The first real push of the stick, a key or a gamepad during a round. A resting thumb or a drifting stick does not count | `flock`, `mode` |
| `funnel_complete` | A round finished | `flock`, `mode` |
| `funnel_graphics_lost` | The renderer stopped and could not continue | |
| `funnel_hidden` | The page was first hidden, by switching app or tab or by closing it. It may come back | The same as `funnel_left` |
| `funnel_left` | The page went away (`pagehide`) | `phase`, `elapsed`, `sheep`, `frame`, `renderer`, `tier`, `flock`, `mode` |
| `language_offered` | The title screen offered a language | `offered` |
| `language_chosen` | A player chose a language | `from`, `to`, `via`: `title`, `settings` or `offer` |
| `language_declined` | A player turned the offer down | `offered` |

Each `funnel_*` stage is sent once per page load, so these count how far loads get, not how often anyone plays.

Times and amounts are only ever sent as these buckets:

| Field | Means | Values |
| --- | --- | --- |
| `load` | From navigation to the field being ready. A page loaded in a background tab reads long, because a hidden page draws no frames | `<5s`, `5-10s`, `10-20s`, `20-40s`, `>40s` |
| `renderer` | The backend the renderer settled on | `webgpu`, `webgl2`, or `pending` before it has |
| `tier` | The quality tier in force at that moment, after any demotion and whether chosen or automatic | `high`, `medium`, `low`, or `pending` |
| `phase` | Where the player was. `playing` includes paused. `title` means no run started on this load, and `returned` means back at the title after one | `title`, `playing`, `complete`, `returned` |
| `elapsed` | From the most recent run's start, pauses included. With no run, from the page's start, so `phase` of `title` shows how long someone waited before giving up | `<15s`, `15-30s`, `30-60s`, `1-2m`, `2-5m`, `5-10m`, `>10m` |
| `sheep` | Sheep in, as a share of the flock | `none`, `<25%`, `25-50%`, `50-75%`, `>75%`, `all` |
| `frame` | Median gap between animation frames since the field became ready or, once a run starts, since that run started. `none` means the page never got that far | `<20ms`, `20-33ms`, `33-50ms`, `50-100ms`, `100-250ms`, `>250ms`, `none` |

`renderer` and `tier` ride on the leaving events as well as on `funnel_ready` because rows are not linked, and a frame time means little without its tier.

**How `frame` is measured.** One `requestAnimationFrame` callback, separate from the render loop and the simulation. It uses the timestamp the browser passes in, so no clock is read per frame, and it adds to a small fixed array of counts, so it allocates nothing and keeps no list of samples. It stops if the renderer is lost.

**How to read `funnel_left` against `funnel_hidden`.** `pagehide` is unreliable on phones: switching to another app only hides the page, and the system may later kill it with no further event. So `funnel_left` undercounts how many phone players left. `funnel_hidden` overcounts, because the page may come back and go on to finish. The truth lies between, and a row in either describes that one moment. `funnel_hidden` was not in the owner's request and is an addition from this branch: it can be dropped by removing its listener.

**Not sent:** a token, running name, stored id, per-visit id, user agent or anything else that links one event to another. `player_id` stays null because the client sends no token. The Worker stores no IP address here. Each row does have a server timestamp, so in a very quiet hour two rows with the same country and browser language could be guessed to be one page load. Nothing in the table can confirm it. A browser sending Do Not Track or Global Privacy Control sends nothing. `app/public/privacy.html` describes this, and a change here changes that page.

`node tools/i18n-probe.mjs selection` closes a page mid-run with a real server behind it and confirms `funnel_left` arrives, because Playwright's interception does not see a request from a page going away. That was Chromium on this PC. Whether the same holds in a phone's browser or an app's in-app browser is not established, which is the other reason both events exist.

Sending is fire and forget: a failure is ignored, never retried and never shown. An English player's page load adds two of these requests by the time the title is up, about 110 bytes of JSON each, and at most two more as the page goes away. The sends on leaving use `keepalive`, so they can outlive the page.

## Reading it

How far loads get, by device and interface language:

```sql
SELECT json_extract(props, '$.device') AS device, json_extract(props, '$.ui') AS ui, name, COUNT(*) AS n
FROM events
WHERE name LIKE 'funnel_%' AND created_at >= datetime('now', '-30 days')
GROUP BY device, ui, name
ORDER BY device, ui, n DESC;
```

Whether a language is offered and chosen, and from where:

```sql
SELECT name, json_extract(props, '$.offered') AS offered, json_extract(props, '$.to') AS chosen, json_extract(props, '$.via') AS via, COUNT(*) AS n
FROM events
WHERE name LIKE 'language_%'
GROUP BY name, offered, chosen, via;
```

Whether it is kept. There is no id to follow one player, so this compares totals: a later load with `source` of `saved` and a non-English `ui` is a player who kept a language, and `language_chosen` with `to` of `en` is one who went back.

```sql
SELECT json_extract(props, '$.ui') AS ui, json_extract(props, '$.source') AS source, COUNT(*) AS n
FROM events
WHERE name = 'funnel_load'
GROUP BY ui, source;
```

The country and browser language of a load, which is the question behind all of this:

```sql
SELECT json_extract(props, '$.country') AS country, json_extract(props, '$.browser') AS browser, json_extract(props, '$.ui') AS ui, COUNT(*) AS n
FROM events
WHERE name = 'funnel_load'
GROUP BY country, browser, ui
ORDER BY n DESC;
```

How long the load took, on phones, by renderer and tier:

```sql
SELECT json_extract(props, '$.renderer') AS renderer, json_extract(props, '$.tier') AS tier, json_extract(props, '$.load') AS load, COUNT(*) AS n
FROM events
WHERE name = 'funnel_ready' AND json_extract(props, '$.device') = 'phone'
GROUP BY renderer, tier, load;
```

Where phones were when they left, and how the game was running:

```sql
SELECT name, json_extract(props, '$.phase') AS phase, json_extract(props, '$.elapsed') AS elapsed, json_extract(props, '$.sheep') AS sheep, COUNT(*) AS n
FROM events
WHERE name IN ('funnel_hidden', 'funnel_left') AND json_extract(props, '$.device') = 'phone'
GROUP BY name, phase, elapsed, sheep;

SELECT json_extract(props, '$.tier') AS tier, json_extract(props, '$.frame') AS frame, COUNT(*) AS n
FROM events
WHERE name IN ('funnel_hidden', 'funnel_left') AND json_extract(props, '$.device') = 'phone'
GROUP BY tier, frame;
```

Whether starting a run led to moving the dog is `funnel_moved` against `funnel_play` in the first query above.

## Open for the owner

- **Old rows.** Rows from version 2 may hold a `player_id` and, in crash events, a user agent. The privacy page describes the new counts, not those. Keep or delete them.
- **Retention.** Nothing deletes rows. Each load writes up to about eight small rows, so this is not urgent; a periodic delete is a later decision.
- **Open route.** `/api/event` takes unauthenticated writes, as it always has, but only under the names in `worker/src/eventProps.ts`, with caps on size and a rate-limit bucket of its own, so counts cannot spend what a sign-in or a score card needs. Junk rows under those names are still possible; if the counts look wrong, this is the first thing to check.
