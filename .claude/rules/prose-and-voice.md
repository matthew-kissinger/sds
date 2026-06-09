# Prose and voice

Durable rules for any agent-written prose that ships to a player-facing surface (itch description, sheepdogsim.com pages, README, devlog entries, CHANGELOG, in-game copy) or to a project doc the user reads (NEXT_SESSION, BACKLOG, cycle plans, memory). No cycle-specific content.

## Punctuation

- **No em-dashes (`—`).** Use periods, commas, parentheses, or hyphens (`-`) instead. Em-dashes read as AI-generated slop and are also not in Matt's writing style. Apply this in prose, list items, table cells, headers, file names, commit messages, and PR descriptions. Code comments inherit this default but enforcement is looser there since code-comment em-dashes don't ship to players.
- **Hyphens over em-dashes** for the same role (joining clauses, parenthetical asides). `Browser-based herding sim. Three biomes, six modes.` not `Browser-based herding sim - three biomes - six modes.`
- **Periods over em-dashes** when the clause stands as its own sentence. `Home Field is a flat fenced pasture. The starter.` not `Home Field is a flat fenced pasture - the starter.`
- **Parentheses over em-dashes** for asides. `Solo Chaos (5,000 sheep, the flock becomes the antagonist).` not `Solo Chaos - 5,000 sheep, the flock becomes the antagonist.`
- **No exclamation marks** in product copy. Matt's existing voice doesn't use them. Same for marketing-bait phrases like "amazing", "incredible", "blazing fast", "next-gen".
- **No emoji** unless the user explicitly asks for them. The zen-UI principle in [`feedback_elegant_engineering.md`](file:///c/Users/Mattm/.claude/projects/C--Users-Mattm-X-games-3d-sds/memory/feedback_elegant_engineering.md) extends to all surfaces.

## Framing precision

The game has **one fenced pasture and three islands** (four biomes, since v2.2.3 added Newsheepdogland). Frame it accurately:

- ✓ "across one fenced pasture and three islands"
- ✓ "four biomes" (broader, a biome covers either the pasture or an island)
- ✓ "three islands" (Rolling Hills, Open Country, and Newsheepdogland are all islands)
- ✗ "four islands" (Home Field is a flat pasture, not an island)
- ✗ "three biomes" (stale pre-v2.2.3 count; Newsheepdogland made it four)

Per-biome:

- **Home Field**: flat fenced pasture, single perimeter pen with a gate. The starter biome.
- **Rolling Hills**: 180-metre island with rolling heightfield, golden-hour mood, lightning-zap corral.
- **Open Country**: 380-metre island with multi-stage gather-and-portal objective.
- **Newsheepdogland**: boot-shaped survival island (~3.2 km^2) with a northern mountain, a homestead pen, a day/night cycle, and wolves after dark. The WebGPU flagship and the default entrance world.

Per-mode (six core, plus Survival on Newsheepdogland):

- **Just Play**: 30 sheep, no timer, no fail state.
- **Solo Classic**: 200 sheep, leaderboard.
- **Solo Extreme**: 1,000 sheep.
- **Solo Insane**: 3,000 sheep.
- **Solo Chaos**: 5,000 sheep. The flock becomes the antagonist.
- **Multiplayer**: 2-4 player co-op, competitive, and timed rooms.
- **Survival**: Newsheepdogland only. Start with a small flock, grow it each day you survive, lose the run if a night thins it past the loss threshold. Score is the peak flock.

Per-dog (five total): Jep, Pip, Sally, Shiloh, George Washington. Different speeds, stamina, and control.

Use these phrasings verbatim or close to them when copy needs to mention a biome, mode, or dog. Don't invent new framing.

## Voice

Matt's prose style on player-facing surfaces (verified against the original itch description, [`PRESSKIT.md`](../../PRESSKIT.md), and [`about.html`](../../about.html)):

- **Conversational, second-person.** "Guide your sheepdog. Get too close and the whole flock scatters."
- **ALL-CAPS section headers** in description-style prose (not Markdown `##`). "FOUR BIOMES", "SIX MODES", "FIVE DOGS", "CONTROLS".
- **Concrete numbers and details.** "180-metre island", "5,000 sheep", "WASD moves, Shift sprints". Not "huge map", "tons of sheep", "responsive controls".
- **Self-deprecating asides allowed.** "There's a leaderboard if you're competitive about sheep." "The sheep don't always cooperate."
- **No hype words.** Don't use "amazing", "incredible", "blazing", "next-gen", "stunning". The numbers carry the weight.
- **Don't oversell open-source-ness.** State it once ("Open source, MIT-licensed. Source: github.com/...") without repeating "free and open" three different ways.

## Pre-ship checklist (any prose intended for a player-facing surface)

Before saving an itch field, deploying a homepage prose change, or shipping a devlog entry:

- `grep -c '—'` on the file or string. Expect `0`.
- `grep -i 'four islands\|three biomes\|two islands'`. Expect no matches (the game is one pasture and three islands, four biomes).
- Section headers use ALL-CAPS plain text or `<h2>`-style HTML, not Markdown `##` (the description field on itch renders Markdown but ALL-CAPS reads more like Matt's own prose).
- No exclamation marks. No emoji.
- Specific numbers where possible (sheep counts, metres, file sizes), not adjectives.

## When to invoke this

This is a **durable rule** (loaded via [`.claude/rules/`](.) in every Claude Code session). No skill invocation needed. If a Claude session is generating prose for any of the in-scope surfaces below and is about to write `—`, "three islands", an exclamation mark, or a hype word, abort and apply this rule.

In-scope surfaces:

- itch.io project page (description, tagline, devlog post)
- sheepdogsim.com (`index.html` seo-content + noscript + footer, `about.html`, `public/scenes/*.html`, `public/devlog/*.html`, `public/llms.txt`)
- [`README.md`](../../README.md), [`CHANGELOG.md`](../../CHANGELOG.md), [`PRESSKIT.md`](../../PRESSKIT.md) (when adding new entries; don't re-edit pre-existing entries unless that's the explicit task)
- Project docs: [`NEXT_SESSION.md`](../../NEXT_SESSION.md), [`docs/BACKLOG.md`](../../docs/BACKLOG.md), [`docs/cycle-N-plan.md`](../../docs/), `.claude/skills/*/SKILL.md`
- Memory: `~/.claude/projects/C--Users-Mattm-X-games-3d-sds/memory/*.md`
- In-game UI strings: [`js/locales/en/index.js`](../../js/locales/en/index.js)

Out of scope (don't auto-rewrite):

- Frozen archives ([`docs/archive/`](../../docs/archive/), `cycle*-validation/`)
- Code comments in `.js` / `.ts` files (em-dashes in code aren't player-visible)
- Test files and fixtures
- Pre-existing prose Matt wrote (his own em-dashes in [`PRESSKIT.md`](../../PRESSKIT.md) etc. are his style choice; only enforce this rule on agent-written additions)

## How this rule got written

Cycle 31 close + post-deploy work shipped a lot of agent-written prose. After review, Matt flagged:

1. Em-dashes everywhere ("AI slop").
2. The itch description framed the game as "three islands" when it's actually one pasture and two islands.
3. The prose lacked his voice in places (e.g. exclamation marks, marketing-style adjectives).

This rule codifies the corrections so future Claude sessions don't drift back into the same shape.
