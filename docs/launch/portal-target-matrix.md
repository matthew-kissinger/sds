# Portal Target Matrix

Status: Cycle 110 evaluation plus v2.6.0 beta override. No portal submissions were made.

## Summary Recommendation

For the `v2.6.0` beta, prioritize the canonical web build only:

1. `sheepdogsim.com`

After the web beta proves demand, consider:

1. `itch` after Matt review.
2. `Newgrounds` after itch smoke and a portal-specific smoke.
3. `CrazyGames` only after SDK/quality work.

Defer or skip:

- `Poki`: skip for now. SDS is far over Poki's recommended tiny initial/total download guidance.
- `Kongregate`: after human review only; current path requires developer approval and a publishing portal process.
- `Y8`: after human review only; low-cost, but ads/monetization and iframe/upload choices need review.

Do not add portal ad SDKs during the web beta setup. The public brand promise remains free, no signup, no ads, and no microtransactions.

## Matrix

| Target | Submission Model | SDK/API Expectations | External Backend Risk | Packaging | Recommendation |
|---|---|---|---|---|---|
| itch.io | Creator dashboard HTML upload or butler push. | No required SDK. | Low. External HTTPS backend is normal for browser games, but uploaded build needs iframe/fullscreen smoke. | ZIP/push generated `dist/` from `npm run build:itchio`. | `after-human-review` |
| CrazyGames | Reviewed submission with Basic Launch and possible Full Launch path. | Basic Launch can start without SDK; Full Launch requires CrazyGames SDK and integration requirements. Multiplayer has specific SDK expectations. | Medium. SDS uses Cloudflare WebSockets; needs review against CrazyGames multiplayer/invite expectations. | HTML5/WebGL package. Technical docs mention 250 MB total, 1,500 file limit, initial download <= 50 MB, mobile homepage <= 20 MB. | `after-sdk-work` |
| Poki | Curated developer platform; request/access model. | Poki platform integration and quality/performance expectations. | Medium. WebSockets are not inherently impossible, but platform fit is curated. | Strongly size-sensitive; Poki guidance says good web games should keep initial download <= 5 MB and total <= 8 MB. SDS current itch dist is about 47.4 MB. | `skip` |
| Newgrounds | Creator upload; HTML5 ZIP with root `index.html`. | Newgrounds.io optional for medals/scoreboards/auth. | Low-to-medium. External backend should be tested in Newgrounds iframe and with their URL parameters. | ZIP upload; root must contain `index.html`. File size limits may need account limit review. | `after-human-review` |
| Kongregate | Developer application/approval, Developer Portal upload. | Kongregate integration checklist and platform standards; API/analytics/revenue details depend on approval path. | Medium. Multiplayer/WebSocket and external services need portal review. | HTML5/WebGL, iframe option, or upload through Developer Portal after approval. | `after-human-review` |
| Y8 | Public upload page supports HTML5/WebGL, ZIP, iframe URL, or URL. | SDK/ads appear tied to monetization; not required for a basic upload, but monetization needs studio/account setup. | Medium. Iframe URL may keep canonical backend, but ads/SDK and external links need review. | ZIP or iframe URL. Y8 suggests ZIP plus Y8 Storage may improve approval chances. | `after-human-review` |

## Target Notes

### itch.io

Best secondary channel right now. SDS already has an itch build target, and the build passed in Cycle 110. Publish only after Matt reviews the page text and screenshots.

### CrazyGames

Potentially useful for reach, but not a "spray the build" target. The current build is under CrazyGames total size guidance but likely needs portal-specific SDK work, multiplayer invite/status integration, quality review, and possibly a smaller initial download.

### Poki

Not a current fit. The current package is roughly 47.4 MB, while Poki guidance favors much smaller web games. Revisit only if SDS gets a dedicated portal build with aggressive initial-load splitting and a curated conversation.

### Newgrounds

Worth considering after itch. It is community-oriented, accepts HTML5 ZIPs, and does not force the same SDK path as larger portals. Needs iframe smoke, external backend test, screenshots, and content-page polish.

### Kongregate

Current docs show an active developer application and portal process, but this is a heavier account/review path. Treat as a later human-reviewed distribution channel, not launch week.

### Y8

Low-friction upload/iframe option, but monetization/ads/studio choices and quality expectations need Matt review. Use only after itch and Newgrounds unless there is a specific reason to chase Y8 traffic.

## Sources

- itch HTML5 docs: https://itch.io/docs/creators/html5
- itch quality guidelines: https://itch.io/docs/creators/quality-guidelines
- CrazyGames docs: https://docs.crazygames.com/
- CrazyGames requirements intro: https://docs.crazygames.com/requirements/intro/
- CrazyGames technical requirements: https://docs.crazygames.com/requirements/technical/
- CrazyGames multiplayer requirements: https://docs.crazygames.com/requirements/multiplayer/
- Poki developers: https://developers.poki.com/
- Poki web game engine guidance: https://developers.poki.com/guide/web-game-engines
- Newgrounds HTML5 ZIP note: https://www.newgrounds.com/wiki/creator-resources/game-dev-resources
- Newgrounds game submission info: https://www.newgrounds.com/wiki/help-information/content-submission/games-and-movies
- Kongregate submission process: https://blog.kongregate.com/hc/en-us/articles/44205164389005-SUBMISSION-How-do-I-submit-a-game-to-Kongregate-It-s-Easy
- Kongregate submission checklist: https://docs.kongregate.com/docs/submission-checklist-1
- Y8 upload page: https://www.y8.com/upload
