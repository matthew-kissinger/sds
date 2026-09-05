# Gate opening guidance

The opening marker is an original deterministic in-repository recipe in
`app/src/scene/gateOpeningGeometry.ts`, rendered by `GateOpeningMarker.tsx`.
Both sources are editable and licensed AGPL-3.0-or-later, matching this project.
No downloaded model, texture, or generated image is used.

Two terrain-sampled painted brackets leave the opening centre clear. The mesh
contains 16 triangles in one draw and uses existing gate-paint and sheep-wool
palette colours through TSL. Depth testing remains enabled. A brief opacity fade
responds to camera visibility; reduced motion switches directly. The terrain
visibility test is a bounded approximation and does not test object occlusion.

This is a local review candidate. Runtime visibility, visual quality, backend
parity and physical mobile performance still require running-build review.

Source SHA-256 digests are recorded in `source-digests.json`.
