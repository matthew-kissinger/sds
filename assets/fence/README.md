# Mortised oak fence kit

Owner direction, 2026-10-17: author a visibly better Kiln kit, retain procedural surfaces and three draws, preview the complete perimeter and pen beside the buildings, align the farmhouse with its fence, and correct the barn's roof ends.

**The owner approved this look and requested runtime adoption on 2026-10-17.** FenceLine now uses the Kiln kit for the entire field and pen. The lab consumes the same component and builder. Release and deployment identity are recorded in STATUS.md. The previous procedural fence remains only as a load-failure fallback and a lab comparison.

## Design and construction

The owner rejected the first sample as too close to the existing fence. This revision has pointed, tapered square-hewn posts; mortised broad rails with worn arrises and slight sag; substantial top and middle rails with a low kick rail; and shared corner posts with short knee braces. Single pointed gate strainers replace doubled piers and blue bands. The matched gate leaves have swept tops descending from the tall hinge stile to the meeting stile, compression braces and hinge straps.

One GLB supplies two normalised profiles (post along Y, rail along X) and named straight, corner and gate assemblies. The root extras.fenceKit declares v1. Assembly groups carry fenceModule and fenceLeaves; parts carry fenceStock, fencePart and fenceLeaf. Metadata is distributed below Kiln's 4 KiB node limit. These are assembly data in metres, not collision definitions.

app/src/scene/fence/fenceKit.ts validates the GLB. app/src/scene/fence/fenceField.ts reads FIELD_FENCE_SECTIONS and the exact HOME_FIELD bounds/gate: the full 200 by 200 m perimeter plus attached three-sided pen, with no duplicate front rail. Bays fit between terrain-sampled posts. Perimeter runs split at the pen attachments before subdivision, giving each junction one shared post, three incident bays and no leftover post nearby. Gate strainers stand outside the eight-metre mouth; the leaves share clearance solved over their sampled swing arcs.

Reversed outlines share the stock buffers. The existing instance builders draw posts and rails separately; animated leaves remain in the rail buffer's small tail. A pooled shadow is the third draw. Static shadow positions are stored once; 25 gate-only poses form a 7.5-degree arc table interpolated without per-frame geometry/material allocations. Leaf-tip chord error is under 9 mm before terrain projection. The unit test sweeps every gate vertex across the committed terrain through 49 closing poses, checks clearance above 2 cm, reopening and unchanged-update skips. Completion motion in a real production run and hub timing qualification remain open.

## Surfaces and cost

The flat GLB preview colours are discarded. The game's single TSL timber implementation supplies grain, bands, worn edges and foot stains, with an oak palette, a 4 mm contour and no gate paint. No texture images, atlas, baked directional light or renderer-specific fork.

Review exposed an existing coordinate defect: grain, head highlights and foot-height terms used positionLocal after instancing. They now use positionGeometry per spec/05; positionLocal remains for vertex displacement. This intentionally corrects the existing fence's surface placement too. Default style retains its previous colours, 9 mm outline and gate-paint values.

The GLB is 21,932 bytes and its example assemblies total 1,960 triangles. Whole-field instance/triangle counts come from the latest capture receipt, not the example count. There are three asset submissions: posts, rails/leaves, pooled shadows. The isolated frame also submits a fullscreen background triangle. API receipts distinguish that fourth draw; render-target memory counters are not fence texture-image counts.

The oak bands and contour colour live in the master PALETTE. The GLB is preloaded alongside the other cold scene assets, before interaction. Its preview materials are discarded; posts and rails use the same procedural TSL implementation on both backends. No lab module reaches the production bundle. Draw count is established. Faster frame times, startup and physical-phone performance are not claimed; no hub qualification has run for this revision.

## Review

Run npm run lab. Choose Fence kit (Kiln) for the homestead, Fence perimeter (Kiln) for the whole outline, straight/corner/gate detail subjects, Fence previous for comparison, or Fence kit alone (Kiln) for isolation. Gate open / Gate closed exercises the swing. Larger aerial camera ranges exist in the lab only; fog-heavy aerials are layout diagnostics, not art evidence.

Run node tools/fence-kit-capture.mjs UNIQUE_LABEL for desktop/portrait-phone captures on genuine WebGPU and forced WebGL2, reference comparison, full outline, detail, closed gate, silhouette and video. It checks source stability/API submissions and closes its browser/server. Captures stay under ignored captures/fence-kit/. Latest integrated review: full-field-4. Phone composition uses the high tier on the host GPU and is not phone performance evidence.

A hot high-to-low WebGPU switch in full-field-1 produced a depth-format pipeline error; that failed receipt is retained. Later high-tier receipts pass both backends. This lab issue does not establish a production failure.

The independent advisory critic confirmed a distinct design, continuous joints and grounded construction; the swept gate is the strongest improvement. Corrected coordinates removed the dipped-paint post bands. Grain remains restrained at these distances. The owner accepted the lab look. Production-build independent review found continuous, readable joints and no backend mismatch; strict spec/05 verdict remains ITERATE: silhouette 8, ramp 8, palette 8, painterly conviction 7, gameplay readability 8, screenshot test 7, life unjudged. More low-frequency grain/value variation is an optional refinement; the approved look is preserved. The supplemental production gate review confirms the clear mouth, readable folded leaves and continuous joins in Classic/Follow on both backends and aspects, with no new change recommended. Stills do not establish closing motion or moving-shadow acceptance.

## Provenance and reproduction

Original recipe and geometry by Matthew Kissinger under AGPL-3.0-or-later (LICENSE), authored with Kiln 1.3.0 (MIT). No external mesh, texture or animation. Kiln is a build tool, not a game dependency. The ledger pins LF-normalised recipe/source-chain SHA-256 and raw GLB bytes. A fresh-directory bake reproduced the GLB byte-for-byte.

    kiln render assets/fence/fence-kit.kiln.js --out assets/fence/fence-kit.glb
    node tools/record-fence-kit.mjs
    node tools/record-fence-kit.mjs --check
    npx vitest run tests/fence-kit.spec.ts tests/fence-layout.spec.ts tests/fence-batching.spec.ts

The owner's CLI is node C:/Users/Mattm/X/kiln-oss/dist/cli.mjs. The ignored managed workspace captures/fence-kit/authoring retains immutable programs. Current program: p_969267fecfff. Saved project asset a_bea2a209716446979e33a0dd8f829764, revision r_bec5a00393e149f7b024db67af461605, a child of the first sample.

## Runtime verification

Run node tools/fence-runtime-capture.mjs UNIQUE_LABEL, or add --gate for the gate approach. This serves the production build, follows the normal title/Play and A/W/C controls with 200 sheep, captures Classic/Follow at desktop and portrait aspect on WebGPU and forced WebGL2, and matches browser API submissions against the three batch signatures derived from the exact client builder. It closes its probe browser/server. Receipt directories: captures/fence-kit/runtime-1 and runtime-gate-1.

The complete field submits 189 post instances, 605 rail/gate instances and one pooled shadow: 81,416 triangles including reversed hulls and shadows, in exactly three fence draws. Both production sets have 40 to 53 total frame draws across sampled title, spawn, homestead and gate-approach views, zero captured console/page/request failures, and unchanged build digests. The gate set records the NVIDIA RTX 3070 hardware context and verifies the requested backend in the actual app. This is draw-budget and functional evidence, not a performance timing qualification. GLB adds 21,932 raw asset bytes. Main JS is 2,438.24 kB raw / 676.07 kB gzip in this local build. 36 focused tests across five suites, focused lint, client build and lab typecheck pass; the model allow-list and source ledger cover this fourth runtime GLB explicitly.

Hub timings, physical-device qualification and completed-run gate-motion acceptance remain open. The owner approved shipping the fence and homestead fixes on 2026-10-17; release evidence is recorded in STATUS.md and docs/history/status-log.md.
