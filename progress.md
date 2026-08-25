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

## Verification follow-up

- Physical-device and remaining launch-media receipts.

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

## Release record

- Matt clarified on 2026-08-24 that the accepted audio is the earlier
  ElevenLabs-generated MP3 asset set, not the procedural WAV replacement. Keep
  the rejected insect and wind loops absent and require owner listening for any
  future source replacement.
- Matt selected the Fox hybrid and requested the production cutover on
  2026-08-24. Pull request 86 merged after both required GitHub lanes passed.
- The Worker deployed first without a migration, then Pages deployed with an
  exact live `release.json` receipt and analytics verification.

## 2026-08-24 loading-card centering correction

- The loading card and invisible title card previously occupied separate rows
  in the boot grid, which pulled the loading state above the vertical center.
- Both states now share grid cell `1 / 1`, so the loading card is centered on
  both axes while the title state remains centered after readiness.
- Matt approved the vertically centered desktop and mobile loading states and
  authorized documentation, commit, push and production deployment.

## 2026-08-24 mobile controls, portrait camera and adaptive quality candidate

- Reproduced the reported Follow-camera failure at 390 x 844: the dog was
  completely absent in one rapid-turn baseline frame while the same route was
  stable in landscape.
- Kept deterministic dog movement and stamina tuning unchanged. Portrait Follow
  now blends to a wider vertical lens, a higher and slightly farther seat, and
  a shorter look-ahead. Classic and landscape retain the established framing.
- Replaced the hidden stick-edge sprint gesture with an independent hold-to-
  sprint button. A two-pointer browser probe held steering and Sprint together,
  observed stamina fall from 100 to 77, and confirmed release cleanup.
- Added a small top-center dog stamina bar on desktop and mobile. It reads the
  live sim through refs rather than causing a React render each frame.
- Added a compact `200 / 200` count treatment. The 390 x 844 browser probe
  verified the worst label stays inside the sheep progress circle.
- Expanded Auto to high, medium and low tiers. Phones start no higher than
  medium, weak devices cap at low, low uses 0.8 DPR and 42% grass, and a passive
  five-second frame-budget window can only demote Auto after six seconds of
  gameplay warmup. Manual quality remains authoritative.
- Post-change portrait and landscape 200-sheep captures had no page, request or
  model-load errors. The rapid portrait sequence kept the dog visible in all
  sampled frames. Matt approved the local candidate and authorized commit,
  push and production deployment.
- Corrected dog paint coordinates from Three's post-deformation `positionLocal`
  to undeformed `positionGeometry`. The blaze, nose, eyes, socks, tail tip and
  coat mottle now stay attached to the same anatomy while head nod, body bob,
  lean and roll deform the rendered mesh. Focused shader, presentation and
  motion tests passed, and the local production preview was rebuilt.
- Removed the farmhouse ground overlay entirely: both yard dirt patches, the
  cart drive, wheel ruts and footing aprons are gone, leaving pasture directly
  beneath the house and barn. The pen floor is a separate mesh/material and was
  not changed, so it remains the scene's only exposed dirt. The removal also
  deletes one startup shader, one draw call and its dead geometry recipe.
- Balanced the two shared cheek-ruff lobes in the procedural sheep recipe. The
  formerly oversized side lobe no longer repeats as extra head fluff on every
  animal, while small height and depth differences keep the fleece hand-shaped.
  This changes no triangle, instance or draw-call counts. A geometry regression
  now pins the two outer reaches and widths, and focused sheep, presentation and
  shader-budget tests passed alongside typecheck and the production build.
- Narrowed the upper four rings of each procedural sheep leg by roughly 12 to
  15 percent while preserving the accepted hoof footprint and stance. At peak
  stride an exposed leg now reads as a tapered limb instead of a full dark slab.
  A new asset regression caps the upper-leg width and pins the broader hoof;
  focused asset, terrain-contact, presentation and shader-budget tests passed.
  The required browser-client movement pass rendered gameplay without console
  errors, and a separate three-frame close motion check covered the full-stride
  silhouette before the local preview was handed back for owner playtesting.
- Replaced the symmetric sheep sine gait after two owner reviews found both
  cadence-tuned versions increasingly reverse-treadmill-like. Each diagonal
  pair now spends 34 percent of its cycle planted and sweeping backward under
  the translating body, then 66 percent visibly lifted and recovering forward.
  This asymmetric timing is the actual synchronization fix: ordinary walking
  holds residual planted-foot slip below 15 percent while staying below 1.8
  cycles per second. Owner review then found the vertical motion read as
  stomping and the airborne leg appeared to fold forward. The explicit 2.4 cm
  body bounce is now removed, hoof clearance is reduced from 0.72 to 0.52 of
  stride, and walk stride is widened from 0.15 m to 0.18 m. The middle leg now
  tucks rearward only during airborne recovery while the shoulder and hoof keep
  their established paths. CPU and TSL use the same authored gait curve;
  terrain sampling follows both leg pairs rather than assuming they are exact
  sine opposites. All 29 focused direction, cadence, contact, shader-budget and
  asset checks pass, as do typecheck, production build and the required browser
  movement pass. A ten-frame close stride check completed without browser
  errors. Matt approved this final gait in the local candidate and authorized
  the release.
