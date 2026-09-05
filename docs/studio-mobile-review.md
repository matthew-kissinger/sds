# Responsive Studio review — 2026-09-05

Owner report: Customize controls overflow phone screens and obscure the dog.

## Change

- Portrait phones use a bottom panel capped at42% of the screen (maximum360px).
  Landscape and larger screens use a side panel capped at38% (maximum360px).
- A shared viewport calculation centers/scales the dog and sheep in the clear
  preview space. Camera presets and orbit remain available. Closing Studio
  clears the projection offset; gameplay framing is otherwise unchanged.
- Mobile camera presets use a compact select. Long preview names truncate
  within the toolbar. Smaller coat/breed cards use two columns; editing content
  scrolls independently beneath the persistent category tabs and Close control.
- Grid minimum widths no longer push naming controls outside the panel. The
  registry scrolls only its chip grid instead of jumping the editor past names.
- Safe-area padding,44px controls,16px text inputs, a shared dialog boundary,
  Escape, contained Tab navigation and focus restoration support touch/keyboard.
- Visual viewport resize/scroll lifts the portrait panel above a mobile keyboard.
  This contract is browser-emulated; physical iOS/Android keyboard behavior still
  needs device validation.

## Evidence

Before: `captures/studio-mobile-before/` records the overflowing toolbar at
320/390px and registry content at320px. Initial fixes exposed clipping within the
667px landscape panel; the probe now checks panel bounds, not only screen bounds.

Six camera projection cases pass, including portrait, short landscape, tablet
and desktop. Full suite passed94 files/719 tests, plus focused customization and
camera checks after the final adjustments. Lint, TypeScript/build and release
probe pass. Final build `index-Bq-a9SiU.js`:623,633 gzip JS bytes and5,773,849
estimated transfer bytes. No new runtime assets, materials or draw calls.

Browser probe: `tools/studio-layout-probe.mjs`, sizes320x568,390x844,667x375,
844x390,768x1024 and1440x900. Checks every category, six mobile camera presets,
long dog name retention, sheep naming, portrait-to-landscape resize, Escape/focus
restoration, control overflow and runtime errors. The later probe also emulates
the visual-viewport keyboard resize contract.

Independent review requested safe-area and dialog fixes; both are incorporated.
Six-size WebGPU and forced-WebGL2 captures pass in
`captures/studio-mobile-accepted-webgpu/` and `captures/studio-mobile-accepted-webgl2/`.
The final naming-first reorder and landscape keyboard avoidance are checked
separately in `captures/studio-naming-final/`; earlier renderer captures precede
only those two UI adjustments. The independent review accepted the dog composition
and compact controls; requested safe-area, focus and naming fixes are incorporated.
Owner subsequently approved this revision and requested commit, push and deploy.
The exact-commit Pages workflow records publication and live identity; the
captures above remain the local review evidence, not physical-device receipts.
