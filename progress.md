Original prompt: Make the solo-times leaderboard accessible before play, with optional player names, while keeping production unchanged until owner playtest approval.

## 2026-08-24 sourced full-tree candidate lane

- Owner review rejected the EZ-Tree, Kenney and FabinhoSC constructions. They
  are excluded from this candidate and no rejected source or runtime reference
  remains.
- Two complete CC0 silhouettes from mehrasaur's Fox Trees Pack are preserved:
  broad `tree-spreading.obj` and natural `tree-round.obj`. Their original wood
  and foliage are baked in one normalized frame, with only a 5% or 7.5%
  downward foliage tuck to bury the branch junction.
- Runtime uses Herd TSL canopy and wood materials, deterministic whole-tree
  proportional variation, three instanced geometry draws plus one pooled
  shadow draw, zero textures and zero runtime model loads.
- Owner selected a Round and Spreading hybrid as the one shipped family.
  Final placement has 139 trees, no shrubs, no exposed root runs and a 2.6049
  metre minimum conservative same-belt crown gap. The source shell is buried
  at contact and the trunk has a positive base flare.
- The final runtime submits three instanced geometry draws and 94,798 triangles
  before pooled shadows. WebGPU, WebGL2, Follow, Classic and phone captures
  completed without page, request or model-load errors.

## 2026-08-22 corrective playtest pass

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
- Remote Pages QA exposed a 43.98px transformed Settings target on phone
  portrait. The shared interaction token now carries a 1px safety margin.

## Verification pending

- Matt's owner playtest and exact-SHA production approval.

## Verification complete

- Lint and client plus Worker typechecks passed.
- All 77 test files and 613 tests passed after the Fox hybrid import.
- Production build, discovery gate, and release probe passed.
- The release probe verifies the exact two CC0 Fox source digests, local
  license snapshot, baked runtime family and absence of model files in `dist`.
- Responsive UI probe passed desktop, tablet, phone portrait, phone landscape,
  and reduced-motion cases with no errors, overflow, or undersized controls.
- The required web-game browser client opened the Times dialog successfully.
- Desktop and phone leaderboard screenshots were visually inspected.
- Isolated Worker deployment, Pages deployment, random-name registration,
  rename, and all three real staging boards passed remotely.

## Release hold

- Do not merge or deploy production until Matt completes the playtest and approves the exact candidate SHA.
- Matt accepted the current audio on 2026-08-24. Do not regenerate or replace it.
