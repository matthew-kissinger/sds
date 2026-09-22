# 12 - My times

The "My times" tab of the solo times panel: a player's own completed runs, read
back unaggregated. The public board shows one row per player, so a second and
slower run is recorded and then summarised out of the display; players read
that as the run not having counted, and reported it as such. This tab is the
missing read.

## What was wrong with the first version

It was a flat list of every run, newest first, each row reading `<count> sheep`
and a time. Three defects, all from the same cause:

- A 4:58 run with 200 sheep sat directly above a 0:38 run with 25, and the
  layout invited a comparison between them that means nothing.
- There was no best, no delta and no rank, so a column of absolute numbers
  carried no information about whether the player was getting better.
- The list grew without bound and had no way to be made shorter.

## The shape

One section per flock size, in ladder order, including sizes the player has
never run. An absent section would say nothing; an empty one says the big field
is still open.

Inside a section:

- **Your best**, in display type, with the player's standing on that size's
  public board beneath it.
- **Every run at that size, fastest first.** This is a times screen and the
  first question it answers is how fast the player is. Ordering by date would
  make it a log; the run positions plus the delta carry the progress reading
  anyway.
- **A bar per run**, scaled between the player's best and worst at that size.
  It exists so the shape of a section is readable without reading any number.
- **The gap to their own best**, and **where that run would sit on the board**.

Three rules the layout depends on, all of them in
`app/src/scores/runGroups.ts` and covered by `tests/my-times-grouping.spec.ts`:

**The bar floor is 22%.** A bar proportional to time alone gives the fastest run
a sliver a few pixels wide, which reads as a rendering fault rather than as
"this one is quickest". Flooring the scale leaves the ordering it encodes
unchanged.

**A section whose runs are all the same time has no span to divide by.** That is
a division by zero one keystroke away; every bar is floored instead.

**A section with one run draws no bar, but keeps the column.** One run has
nothing to measure itself against, so a full-length bar would read as slow.
Hiding the cell rather than dropping it keeps the times in one column down the
whole panel, which is what makes three sections scan as one table.

## Collapsing

A section with more than five runs shows five and offers the rest. The control
is a real `<button>` with `aria-expanded` and `aria-controls`, not a
`<details>/<summary>`: the panel's focus trap collects
`button:not(:disabled)` to find its first and last focusable element, and a
`<summary>` is focusable without matching that selector, so a disclosure built
the native way would have let Tab walk out of a modal dialog. It is full width
at the 45-pixel target height, so it is a thumb target on a phone.

Expansion is per size. Opening the 25-sheep history does not open the other two.

## Standing: what the rank means

`boardRank` is **the position that time would hold on that flock size's public
board**, and `boardPlayers` is the size of that board.

The board ranks *players* by their best, so the count behind the rank is the
number of players whose best beats the given time. Two consequences worth
stating, because the alternative readings are both defensible and both wrong
here:

- A player's own best comes back carrying **exactly their board position**. The
  number in their history and the number on the board are the same number,
  arrived at two ways. `tests/worker/player-standings.spec.ts` asserts that
  equality directly rather than trusting it.
- A slower run of their own comes back carrying the position *that run* would
  have held - with their own faster self among the players ahead of it. "This
  one would have placed 41st" is the only reading that stays consistent with
  the board.

Ranking each run against every individual submission was the other option and
was not taken: it makes the denominator grow with how much everyone plays
rather than with how many people play, so the same time gets a worse rank every
week without anyone getting faster.

Membership matches `getLeaderboard` exactly - all four solo slugs at the count,
on the requested scene, flagged submissions excluded. A rank measured against a
different population from the one the board displays would be a different
statistic wearing the board's name, and the player would have no way to tell.

The counting stays in SQLite, one query per ranked count, so what crosses the
wire is the player's own distinct times and not the size of the board. Distinct
times per count are capped at 100; a run past the cap comes back without a rank
and is drawn without one, because a missing rank is not a rank of zero.

## Both fields are optional on the wire

`boardRank` and `boardPlayers` are a later addition to `/api/my-scores`. A
client running against a worker that has not been deployed yet parses runs
without them and simply draws no standing - the sections, bars, deltas and
collapsing all work with nothing from the server but what it already sent. The
layout does not wait on a deploy, and the deploy cannot half-break the layout.

## Open

The tab shows no dates. Submission time is in the data and the first design
carried a "3 days ago" column, which was dropped with the chronological
ordering it belonged to. If runs ever need to be told apart beyond their time -
a season, a rule change, a reset - that is the column to bring back, and it
wants a relative formatter with its own tests rather than a raw timestamp.
