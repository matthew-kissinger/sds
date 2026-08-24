Original prompt: Make the solo-times leaderboard accessible before play, with optional player names, while keeping production unchanged until owner playtest approval.

## Completed

- Added a title-screen `Times` entry point and a responsive leaderboard panel.
- Added 25, 75, and 200 sheep board tabs.
- Preserved the post-run top-times view and optional-name flow.
- Added controller, public-surface, and responsive browser-probe coverage.
- Configured the pull-request preview to use an isolated preview Worker and D1 database.
- Added Escape-to-close and keyboard-focus restoration for the times dialog.
- Browser QA caught and fixed the first focus-restoration implementation before release.
- Harsh accessibility review caught background focus escape. The title screen is
  now inert while Times is open and focus wraps across all four dialog controls.
- Corrected the release note to distinguish identity-free board reads from the
  app's automatic random running-name registration.

## Verification pending

- Push the candidate and verify the isolated Worker plus Pages preview end to end.
- Inspect the final remote leaderboard screenshots on desktop and mobile.

## Verification complete

- Lint and client plus Worker typechecks passed.
- All 77 test files and 610 tests passed.
- Production build, discovery gate, and release probe passed.
- Responsive UI probe passed desktop, tablet, phone portrait, phone landscape,
  and reduced-motion cases with no errors, overflow, or undersized controls.
- The required web-game browser client opened the Times dialog successfully.
- Desktop and phone leaderboard screenshots were visually inspected.

## Release hold

- Do not merge or deploy production until Matt completes the playtest and approves the exact candidate SHA.
