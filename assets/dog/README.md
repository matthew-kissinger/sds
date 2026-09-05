# Owned skinned collie

The border collie retains its original editable loft anatomy and coat presets.
`app/src/scene/dog/dogGeometry.ts` assembles the sections in `dogParts.ts` and
`dogSkin.ts` assigns normalized anatomical skin weights. `dogRigDefinition.ts`
authors a real 22-bone parent hierarchy with pelvis, spine, chest, neck, head,
ears, tail and three joints per leg. Coat and outline are `SkinnedMesh` objects
sharing one `Skeleton`; native TSL skinning transforms both positions and normals
on WebGPU and WebGL2. Coat markings use undeformed anatomy coordinates.

Animation is an editable procedural bone-pose recipe, not imported binary clips.
`dogGait.ts` authors diagonal trot, run and paired sprint timing with backward
stance, raised forward recovery and bounded stride. `dogRig.ts` blends idle,
sitting, quick get-up, accepted-bark head response, turn banking and tail/ear
motion. Fixed-length two-bone leg solvers target the terrain. During stance,
world-space contact locks hold paws in place; impossible reaches clamp instead
of stretching limbs. Sharp accelerations, reversals and steep slopes still
require visual review for contact loss at that reach limit.

`Dog.tsx` reads simulation state without changing it. Pause freezes pose clocks;
a new simulation resets pose and contact state. Reduced motion keeps locomotion
while reducing secondary animation. Outline width uses the live projection.
The existing 15 m/s run, 25 m/s sprint, collision, bark and input semantics stay
owned by the deterministic simulation.

All source is owned by Matthew Kissinger under AGPL-3.0-or-later (`LICENSE`).
No external mesh, texture or animation download is used. The source ledger pins
geometry, weights, hierarchy, pose recipes and materials by SHA-256 over UTF-8
text normalized to LF, so checkout line endings do not invalidate provenance.
After reviewing an intentional source change, update or check the ledger:

```bash
node tools/record-dog-asset.mjs
node tools/record-dog-asset.mjs --check
```

The geometry contains 1,696 triangles. The dog uses two body draws and one pooled contact-shadow draw; existing stamina
and dust feedback are separate. There are no per-frame geometry rebuilds or
new textures. Bone matrices use Three.js's normal internal skinning buffers.
`tests/dog-rig.spec.ts` validates weights, bind pose, actual CPU-skinned foot
contact, gait phases, pause/reset and outline projection. Rendering on both
backends, close-up movement, every coat, phone views and sustained performance
remain production-build review gates; passing mathematical tests is not visual
acceptance of the rig.

Iteration 2 refines the tapered muzzle, calm almond eyes, asymmetric folded ears,
continuous chest volume, wrist contour and fuller sole footprint. Classic coat
shadow/outline reuse the existing warm dog tones. The 22-joint bind hierarchy and
contact solver are unchanged; two wrist rings add 24 triangles.

Iteration 3 extends stop-to-nose length from 0.260 to 0.360 m and narrows the
cheek from 0.392 to 0.364 m across. Twelve-sided chest sections broaden the
lower brisket without lowering it. Eight-sided forelegs and paws resolve the
carpal pad, sloped pastern, raised knuckles and rounded toe roll; the largest
paw width is 0.174 m, with unchanged sole centers and baseline. This adds 368
triangles over iteration 2, with no extra bones, materials or draws. The face
masks follow the longer muzzle and a gently rising outer eyelid. These are
source changes awaiting production visual review, not an acceptance claim.

Iteration 4 corrects proportions after front/profile review. The skull moves
0.14 m toward the shoulder and 0.20 m upward; neck/head/ear bind pivots move with
the mesh. Stop-to-nose length returns to 0.300 m while retaining the taper.
Rib underside rises 0.10 m and waist 0.13 m with unchanged topline, exposing
more leg and a clearer abdominal tuck. Wrist half-width falls from 0.088 to
0.077 m. Rounded chest and toe profiles, all sole contacts, 22 bones and
1,640 triangles remain. Anatomical paint coordinates invert the head reshape,
preserving eye size and coat identity. Production review is still required.

Iteration 5 is the final bounded model pass in this review loop. One 12-sided
section supports the shoulder-to-neck transition (+24 triangles); neck-base
half-width falls 0.370 to 0.345 m and depth 0.360 to 0.345 m. Collar boundaries
slope with the neck, collar strength drops 0.74 to 0.58 relative to the initial
review, and bib coverage narrows from a 0.300 to 0.235 m outer half-width. Cream
bands mix 18 percent toward their existing midtone; custom coat shadows mix
10 percent toward their own midtone. The eye's upper aperture trims the rim
and iris together. Carpal half-width is 0.072 m with a smoother forward offset.
Rig, soles, solver, texture and draw counts are unchanged. Final running-build
review must record remaining art risks rather than imply automated acceptance.

Owner-requested correction after the capped review: slim only the upper chest
and neck-base torso. Shoulder half-width is 0.405 m; the next sections taper
through 0.355, 0.305 and 0.290 m. Their half-depths are 0.325, 0.310, 0.285 and
0.290 m, with centers raised to preserve their previous topline. Lower-section
exponent 0.95 removes the earlier broad underside bulge. Head, legs, rig, soles,
materials and 1,664-triangle count are unchanged. This is the owner's bounded
proportion revision, awaiting their visual review.

Further owner correction moves both complete foreleg chains and mesh/contact
origins 0.14 m forward, supporting the chest while preserving limb lengths and
sole height. Eye height compression relaxes from 1.85 to 1.45, removes its slope
and opens the upper aperture. Turning recovery now retains the actual planted
foot's lift-off offset before blending toward the authored swing path; the old
path snapped a turned stance foot back onto its straight-ahead lateral line.
Two tests inspect actual skinned sole continuity at lift-off for opposite turn
directions. Held WA/WD movement still needs running-build video review; tests
do not establish every acceleration, heading or foot reach case visually.

Chest-paint integrity fix: `dogBodyMask` is authored directly from mesh part
ranges and restricts collar/bib paint to the continuous body loft. Forward
forelegs retain their owner-approved position without inheriting white chest
patches. Socks, eyes and other markings remain unchanged. One scalar vertex
attribute adds no geometry, materials, textures or draws; the regression checks
real torso and overlapping foreleg vertices.

Owner-priority foreleg attachment repair: the buried seed moves upward to
y 1.22 m and backward to z 0.36 m, followed by a second embedded shoulder
section at y 1.12 m. The upper arm emerges through a smaller 0.115 m half-width
section instead of the previous 0.148 m cap-like swell. Shoulder skin now uses
the same chest/neck weights as adjacent torso vertices at the root and blends
into upper-leg influence over y 0.86–1.15 m. Forward paw locations and limb
lengths are unchanged. Two added 8-sided sections cost 32 triangles total.
A geometric regression ray-tests both complete upper attachment rings and cap
centers against the actual CPU-skinned torso (34 vertices across 20 idle/gait/
turn poses). This proves embedded roots for those poses; front/profile/hero
rendering remains necessary to judge the visible normal and outline transition.

Owner-requested tail/hind-leg refinement: middle tail sections lose roughly
22–23 percent of vertical half-depth and 12–13 percent of half-width; root,
terminal tip, length and droop path stay fixed. Peak hock rearward excursion
falls from 0.162 to 0.118 m (27 percent), distributed through adjacent sections
0.088/0.130/0.056 to 0.068/0.100/0.044 m. Stifle and pastern endpoints, skeleton,
feet, gait, front attachment and 1,696 triangles remain unchanged.
