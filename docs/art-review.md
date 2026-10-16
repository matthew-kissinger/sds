# Production art iteration

Run `npm run review:art -- --label=trees-baseline` before changing art. The
command rebuilds production, runs the release-surface check, then captures
Classic and Follow views, native WebGPU and forced WebGL2, and portrait
and landscape phone emulation at high/low quality. The flock stays at 200.

Open `captures/profiling/trees-baseline/index.html`. Review the scene beside its
neighbors against `spec/05-art-direction.md`; source owners and SHA-256 hashes
are included for trees, sky/clouds/sun, lighting and neighboring assets. No
editor or review code enters the runtime bundle. Existing labels are protected
from overwriting.

Change one system, then run
`npm run review:art -- --label=trees-candidate --compare=trees-baseline`.
The report shows images side by side, performance percentiles, draw and triangle
counts, failed gates and matching-settings checks. Positive p95 deltas mean
slower frames. A mismatch disables the delta; an absent scenario is a mismatch.
Keep GPU load and machine conditions comparable; matching settings alone cannot
prove hardware or thermal equivalence.

For a quick smoke pass use `--seconds=5` and optionally
`--scenarios=art-follow-webgpu,art-follow-webgl2,art-phone-low-webgl2`.
Use a unique label for each run. The default 60 seconds is required by the
performance contract; a short pass cannot close that gate. The wrapper exits
nonzero on release/profiler failures, changing source files, or incomparable
settings. Reports remain available after measured gate failures.

The production art workload holds the normal forward input for the sample
window; it is not the stripped development deterministic driver. Renderer
counts come from browser instrumentation installed by the probe itself.
Camera state, grounding diagnostics and a production beauty camera remain unavailable;
beauty is excluded from the default scenarios. Those limitations cannot close
the corresponding release acceptance lines.

Phone captures use browser emulation on the host GPU, not physical mobile
hardware. Stills are not frame-locked, and the three motion samples do not
replace continuous motion review. Art starts UNREVIEWED and physical mobile
starts NOT_TESTED regardless of measured gates. Have a separate critic inspect
desktop and phone composition, tree silhouettes, shadow color, cloud masses,
sun direction, readable sheep/dog and motion. Record at most five iterations,
owner choice and unresolved issues in STATUS.md. Validate representative real
phones before claiming mobile acceptance; support for every phone is not an
achievable guarantee.

Editable sources remain in the repository. Any new runtime asset requires its
source or deterministic recipe, provenance, license and digest. Captures and
receipts stay under ignored `captures/`; do not commit them. The probe closes
its browser contexts and preview server. No deployment is performed.

## What owns what

Change the owner, not the symptom:

- `tools/bake-sculpted-trees.mjs` owns crown proportions and connected wood.
  Run it to rebuild the committed geometry; `--check` verifies the output.
- `tsl/palette.ts` owns tree, bark, cloud and sky colors.
- `tsl/sky.ts` owns the cloud masses and the sun disc.
- `Atmosphere.tsx` and `PostProcessing.tsx` own haze and high-tier bloom.
- No generated concept image is loaded by the game.

Low geometry counts and passing code tests do not establish art acceptance or
physical-phone performance. Current direction lives in `STATUS.md`, and the
asset polish plan is `spec/13-asset-lab.md`.

# Hub hardware measurements

The hub is the timing lane and this PC is the functional lane; `AGENTS.md`
states the rule and its preflight thresholds. What follows is how to drive the
probe.

`tools/hub-presentation-probe.mjs` can run against a copy of the built game (`app/.cloudflare/output/v0/workers/default/assets`, copied to the hub as `dist`)
in a private Linux directory. Copy its four helpers alongside it:
`art-render-counters.mjs`, `playtest-profile-receipt.mjs`,
`screenshot-analysis.mjs` and `harness-stubs.mjs`. Pass `--playwright=` with
an existing installation's absolute `index.mjs` path; the tool neither installs
dependencies nor modifies that installation. Pass `--chrome=` if the system
Chrome path differs. Use the active desktop session's display credentials for
headed hardware rendering.

Run `--backend=webgpu`, then `--backend=webgl2` serially. Add `--viewport=phone`
for a 390x844 DPR3 low-tier emulation; this still uses the laptop GPU and must
never be reported as physical-phone performance. The default run is 60 seconds
with 200 sheep and normal keyboard input. The server binds to loopback on an
ephemeral port, score endpoints are mocked, and browser/server close on exit.

The default input wanders the dog around its spawn, which keeps the homestead
170 m away and out of Classic's frame, so a receipt for a building change
measures almost none of the building. Add `--drive=homestead` to walk the dog
to the north fence between house and barn and hold it there, with both in
frame for the whole minute; run it with `--camera=classic` and again with
`--camera=follow`, which looks at the pair from ground level. Keep the default
run as well: it is the like-for-like against every earlier receipt.

Each receipt includes all served-file hashes, actual renderer/driver identity,
frame samples, readiness, and before/during/after CPU/GPU activity. Inspect the
activity samples for competing work before accepting measurements. The tool's
draw count covers the final 250 ms window, not the whole run. Startup is local
transfer, not a 4G loading result. Retain failed launches and budget failures.
