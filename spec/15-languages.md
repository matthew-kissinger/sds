# 15 - Languages

Added 2026-11-06 at the owner's direction. It replaces the "English only" line in `spec/00-vision.md`.

This is one game at one address, by the owner's decision. It opens in English and a player can change that in one tap.

## What does not change

A language changes words. It changes no gameplay, simulation, input, multiplayer protocol, room service, save, score, leaderboard, running name or score card. `https://sheepdogsim.com/` keeps its English title, description and canonical. Every existing URL keeps working, and no language gets an address of its own for the game. Standalone pages about the game, such as `/id/` and the guide pages, are separate documents that link in with `?lang=`.

## Which language a page shows

1. `?lang=<code>` if it names a language this build has. It sets and saves the language, then leaves the address.
2. The saved choice.
3. English.

**The browser's language never switches the interface and never redirects anyone**, by the owner's decision. It only decides whether the title screen offers a language.

Choosing a language saves it under `sheepdog.language.v1` and changes the interface without a reload, because a reload would throw away a run in progress. `<html lang>` follows the interface, for screen readers and the right CJK glyph forms. The page title, description and canonical do not move.

`?lang=` exists so a link can open the game in a language, for example from a page about the game in that language. It creates no separate page: the canonical is still `/`, and there is no `hreflang`, by the owner's decision. Leaving the address means a later choice in the picker survives a reload. It keeps `seed` and `debug`. `lang` is the third and last documented query parameter (`AGENTS.md`, tripwire 6), and `tools/release-hardening-probe.mjs` allows exactly those three.

## Choosing

- **On the title screen**, with Customize, Settings and Times: a drawn globe and the current language's name. It is a native select, so a phone opens its own list, and every language is written in its own script. Someone who cannot read the current language can still find their own. The list draws in the system face, because a browser measures every option of a select, and naming Piazzolla there fetched both on-demand fonts for every English player until a probe caught it.
- **In Settings**, the first row, where the note about review also appears.
- **An offer**, once. If this player has made no choice and their browser's first language the game knows is not English, one small line under Play offers that language in that language, with a yes and a no. It sits in the card's flow below the start action, so it cannot cover it, and ignoring it costs nothing. An offer that arrives once Play can be pressed waits for the next time the title is drawn or the next load, because appearing moves Play. Turning it down is remembered under `sheepdog.language-offer-declined.v1`. A browser in English, or in a language the game lacks, is offered nothing.

## The mechanism

No library. `app/src/i18n/store.ts` is one small zustand store and a `{hole}` replacer, using `Intl.PluralRules` and `Intl.DateTimeFormat`, which the browser already has. i18next and react-i18next are what version 2 used, and they are not justified here: this game needs string lookup, named holes and two plural forms, while those packages add roughly 15 KB gzipped to every English player for features nothing would call (tripwire 10). They also assume a provider around the tree, and non-React code here (the score controller, the room client, the boot progress) writes interface text too.

Dictionaries are flat JSON in `app/src/i18n/locales/`, because reviewers, Node scripts and the client all read them without a loader:

- `en.json` is imported by the store and ships in the main bundle. Its strings replaced the literals that were there, so an English player's bytes barely move, and English needs no extra request for words, no wait and no asynchronous step: `startLocale` returns null and the first render is as synchronous as it was.
- Every other language is its own chunk from a dynamic `import()`, fetched only by someone shown that language or offered it. The first render waits for it for at most 1.5 s, because a static shell is already on screen; after that the game starts in English and changes language when the chunk lands. A failed chunk leaves a working English game. A dictionary must never be able to keep someone from playing.

Interface text reads `useT()`. Code outside React uses `translate()`. Messages the score service or the room service send as codes stay codes, and `app/src/multiplayer/notices.ts` turns them into text; the protocol is unchanged.

### What stays English

- `/about`, `/support` and `/privacy`. The title links to the first two are marked `(EN)`, and the privacy links say so. An unreviewed translation of a statement about data is a risk with no upside.
- The head of `/`, by direction.
- Score cards at `/c/*` and their unfurl text, drawn by the Worker.
- `/r/owner`, which only the owner sees.
- Running names and sheep names. Running names come from the service and are unchanged. The sheep and dog names are an authored list of proper names, the same in every language. The Korean fork translated them; that was not taken, so a sheep has one name everywhere.
- The brand, in Latin, in every language.
- The names of the studio's other sites under "More from Instrukt Labs", and the static shell shown before the game's code runs, whose wording is the page's English head and body.

## Type

Nothing here adds to an English player's load. Piazzolla's base file is unchanged, byte for byte, and its faces in `app/index.html` are untouched.

| Script | Languages | How |
| --- | --- | --- |
| Basic Latin | Indonesian, Malay | The base file already has it |
| Accented Latin | Spanish, Portuguese, French, German | `piazzolla-ui-latin1.woff2`, 16,624 bytes, on demand |
| Cyrillic | Russian | `piazzolla-ui-cyrillic.woff2`, 16,928 bytes, on demand |
| Hangul, kana, Han | Korean, Japanese, Chinese | The system's own face, chosen by `lang` |

The two on-demand files sit behind a `unicode-range` in `UiStyles`, so a browser fetches one only when the page draws a character inside its range. A leaderboard name with an accent is the one way an English page can ask for a file, and that page then shows the right letter for 16 KB.

**No CJK font ships.** `lang` has to be right for these, because Han glyphs differ between the three. Digits and Latin in those pages stay Piazzolla. The Korean fork ships a 176,492-byte Noto Serif KR subset of the characters it uses; that is about seven times the whole interface font for one language, and it cannot cover names players type, so it would still fall back for them. The cost of the choice is that CJK text is usually a system sans next to a Latin serif. A reviewer in those languages may reasonably want to revisit the look.

Wide letter-spacing is for Latin capitals. `UiStyles` narrows it for CJK, sets `word-break: keep-all` for Korean and strict line-breaking for Japanese and Chinese.

## Honesty about translation

A language ships after an independent review by a reader who did not write it, working from its review pack. A native speaker's read is welcome but not required (owner's decision, 2026-11-06). `reviewed` in `app/src/i18n/locales.json` records a native read, and until it is true Settings says on screen that no native speaker has checked the language and links to the issue list. An independent review does not change that note, which stays true. Nothing on the site calls a translation professional or official. No copy may claim the game works on a phone until that is established on a real device. Saying touch controls exist is a fact and is allowed. A test holds the dictionaries to this.

`docs/translations/review-pack/<code>.md` lists every string with where it appears and where it came from. `node tools/i18n-review-pack.mjs --check` fails when a pack is out of date.

## Adding a language

No right-to-left language is supported, because the layout has never been checked in one.

1. Add it to `app/src/i18n/locales.json`, and to `LocaleCode` and `DICTIONARIES` in the client. The registry's order is the picker's order.
2. Copy `locales/en.json` and translate it. `app/src/i18n/context.json` says where each string appears and how wide it may be.
3. If its letters are outside the three Latin and Cyrillic files and it is not a CJK script, extend `tools/subset-font.py` and the `unicode-range` in `UiStyles`.
4. Regenerate the review pack with `node tools/i18n-review-pack.mjs`, and check layout with `node tools/i18n-probe.mjs layout --locales <code>`.

A language ships complete or not at all: `tests/i18n-dictionaries.spec.ts` fails on a missing key, a changed placeholder or a label too wide for its control, and TypeScript fails first. So every new interface string has to be translated into every shipped language in the change that adds it. That is the running cost of each language.

A language with more than two plural categories, such as Russian, gets its other categories through `.other`, so it writes counted strings in a form correct for any number (`Овец: {count}`).

## Checks

- `tests/i18n-dictionaries.spec.ts`, `tests/i18n-resolve.spec.ts`, `tests/funnel.spec.ts`, `tests/worker/event-country.spec.ts`
- `node tools/i18n-probe.mjs selection`: the order above in a browser, that nothing redirects, the offer, and which files each language fetches
- `node tools/i18n-probe.mjs layout [--long]`: every screen at 320 px and up, and the offer against Play, with `--long` lengthening German by 40% to stand in for a longer language. No shipped language has a finding. `--long` does: a language that long would need shorter words for the touch Sprint and Camera buttons, the Studio tabs and one multiplayer button, and the check says so when it is added
- `node tools/i18n-probe.mjs cost --base <dir>`: what an English player downloads against an earlier build

Phone emulation checks composition and layout. It is not a phone (`AGENTS.md`), so none of these establish that the game works on one.

How far players get, and whether a language was offered and kept, is in `docs/operations/funnel.md`.
