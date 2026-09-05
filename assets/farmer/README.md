# Ambient farmer source record

Owned procedural asset for Sheepdog Sim. Copyright (c) 2026 Matthew Kissinger.
License: AGPL-3.0-or-later, under the repository LICENSE. No external models,
textures, motion capture, purchased assets or generative-image geometry inputs.

Editable recipe: `app/src/scene/farmer/geometry.ts`. `buildFarmer()` deterministically
constructs the mesh, vertex colors, thirteen named bones, hierarchy and normalized
skin weights from authored measurements. The merged mesh uses one color-attribute
TSL material, plus a shared-geometry outline and a small contact patch (three draws).
Straw hat, cream work shirt, muted overalls and boots sample the master palette.
There are no downloaded or opaque runtime binaries.

Animation source: `app/src/scene/farmer/animation.ts`. Actual skeletal joints drive
walking, rest, a stooped ground inspection and a hand-to-hat field check. Foot
stance advances with route distance; recovery lifts clear of terrain. Two-link
leg posing samples the same heightfield as the buildings and animals. Essential
locomotion remains under reduced motion; head searching and torso sway are removed.
The posed hip baseline is 1.04 m, below the 1.10 m bind height, leaving knee
reach at stride endpoints. Actual skinned-boot tests cover flat-ground stance;
they do not establish every slope or transition visually.

Route source: `app/src/scene/farmer/route.ts`. A bounded itinerary runs through the
clear yard east of the retirement pasture and across the barn frontage. Building
and fence authorities supply its coordinates. The route is presentation only:
it neither reads nor affects sheep, scores or dog inputs. Pause freezes its clock.

Reproduce: instantiate `buildFarmer()` through the normal `Farmer` scene component.
Verify clearance, bounded motion, rig weights and animation with
`npx vitest run tests/farmer.spec.ts`. `source-digests.json` pins normalized-LF UTF-8
recipe bytes, not platform line endings. Refresh the digest record deliberately
when changing the owned recipe; these are source-integrity hashes, not gameplay
fixtures. Whole-scene visual and renderer acceptance belongs to the integration
review; these tests do not establish appearance, physical-mobile performance or
perfect foot contact in every moving frame.

Iteration 2 replaces the spherical shirt with a shaped 10-sided torso section:
0.29 m waist, 0.42 m chest and 0.14 m neck radii, with a 0.67 depth ratio.
Eight-sided sleeves taper through shoulder and cuff instead of ending in broad
flat caps; their maximum radius is 0.155 m, cuff 0.120 m. Resting elbow flexion
is 0.22 radians (previously 0.12). The shared TSL toon ramp and master palette
remain the lighting/color authority; no new material, draw, texture or joint
is introduced. Hip baseline and leg contact solver are unchanged. These source
changes require the normal-camera visual review before artistic acceptance.
