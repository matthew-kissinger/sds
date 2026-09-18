<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (c) 2026 Matthew Kissinger -->

# Camera and movement comfort

Plan for issue #90, "'Reduce motion' does not prevent motion sickness in the
secondary camera view". Written 2026-09-17 against `003389fb`.

The reporter is right. This document records what was measured, why it makes
people ill, what comparable games do, and a staged fix that protects the herding
balance, the deterministic fixtures and the published leaderboard times.

**The short version.** Over a scripted two-minute herding run the Follow camera
rotates 5,204 degrees, averaging 44 deg/s and peaking at 373, spending 38% of
the run above the rate people describe as comfortable. Three mechanisms produce
that: the camera's yaw chases the dog's facing with no rate ceiling, the aim
point swings independently of it, and camera-relative input closes a feedback
loop in which holding one key rotates the world forever. Separately, the rig
takes its height from the ground beneath itself, so it heaves through 1.64 m at
0.1 to 0.2 Hz, which is the most nauseogenic frequency there is. Reduce motion
touches none of it.

Fixing the camera alone takes the same run to about 1,400 degrees, peaking at
exactly its 25 deg/s cap, with no time above 35, and frames the dog **nearer**
screen centre than it is framed today. Because it is better on both axes it is a
defect fix rather than a setting, and it should ship as the default for everyone.
That figure is approximate on purpose. The recommended dead zone and the
hysteresis rule both moved after it was taken, and section 3 explains which
numbers in this document are comparable with which.

**Four things I got wrong along the way**, all corrected in place below and all
worth naming because each is a plausible-sounding instinct.

- **Narrowing the portrait field of view** would make portrait worse, not better.
  Portrait is already the narrowest horizontal view in the game.
- **A yaw dead zone does not need to be a screen fraction.** In the rig
  recommended here it does not move the dog on screen at all.
- **Giving the dog realistic inertia does not reduce total rotation.** Measured
  both ways over an identical script, the difference is 4%. A lag-follow camera
  converges, so it rotates by whatever total its subject rotates. Movement work
  is still worth doing, and the user asked for it directly, but it is a *feel*
  change and must not be allowed to delay the fix for issue 90.
- **The touch stick should get smaller, not larger.** I twice argued for
  enlarging it and for exposing a size setting. Re-anchoring the origin under the
  thumb removes the reach problem that a larger radius was solving, and once reach
  is solved a smaller radius is strictly better.

There is a fifth item that is not a mistake so much as a trap, and it is worth
reading before any of the numbers below: **the scripted acceptance driver cannot
evaluate any of this.** It pulse-width-modulates the stick 8.3 times a second,
because cutting the stick is its only way to arrive somewhere slowly, so any
change that rate-limits the intent destroys its control strategy rather than
measuring a cost to a player. Section 3.8 and stage 1 both turn on this.

## 1. What the reporter said

Issue #90 reports that with **Reduce motion** enabled the Follow camera still
causes severe motion sickness, naming view bobbing, inertia and smoothing. The
attached 31-second clip shows ordinary play: one dog crossing open grass, no
unusual input.

Two of the three named causes are real and one is a misreading. There is no
weapon sway and no camera bob in Follow; the gait bob lives on the dog, not the
camera. What the clip shows is the camera **yawing**, constantly, far above the
published comfort range. The reporter identified the feeling correctly and
reasonably guessed at the mechanism.

The claim that Reduce motion does not help is exactly true. See section 6.

## 2. What the code does

The Follow rig in [followFraming.ts](../app/src/camera/followFraming.ts) sits
20 m behind and 7.5 m above the dog and tracks the dog's **heading** with an
exponential smoother, time constant 0.35 s, with **no ceiling on angular rate**.

It also has a fourth degree of freedom that turns out to matter as much as the
yaw. The aim point is smoothed separately, on a 0.08 s constant, toward the dog
plus a look-ahead along the dog's own direction. So the camera's position and
the point it looks at rotate independently, and what the player sees is the
difference between them. Section 3.7 is about what that costs.

The rig takes its height from `groundY` sampled **under the rig**, not under the
dog and not from the world datum, so it rides whatever terrain happens to be
beneath the camera. Section 3.6 is about what that costs.

The dog's heading is slewed in [step.ts](../sim/step.ts) at `DOG_TURN_RATE = 8`
per second, converging a 90-degree turn in about 0.35 s. The camera's yaw lag
and the dog's turn rate are the same speed, so the camera is effectively
hard-locked to the dog's facing. Whatever the dog does, the world does.

[IntentResolver.tsx](../app/src/input/IntentResolver.tsx) reads the live camera
forward every frame while in Follow and uses it as the movement basis. That
closes a loop: input turns the dog, the dog turns the camera, the camera
redefines the input, which turns the dog further.

There is **no manual camera control anywhere in the game**. No mouse look, no
right stick, no touch look, in either mode. The camera is fully automatic and
the player cannot stop, slow or counteract it. Section 5 explains why that alone
is a guideline violation.

## 3. What was measured

**Read this before any table below.** The *before* figures in this document all
come from one probe over one scripted two-minute herding run, so they are
directly comparable with each other and with the after-figures taken by that same
probe. The after-figures are not all comparable with each other. Three separate
probes contributed to this document, on two different input scripts, and their
baselines differ: the shipped rig measures 5,204 degrees on one script and 2,112
on the other. **Never compare a number from one script against a number from the
other.** Each table below says which one it is on.

The recommended configuration has also moved since several of those probes ran,
most recently to a 20-degree dead zone and again when section 3.11 added
hysteresis. So no number here is a receipt for the rig as finally specified.
Section 10 makes producing that single receipt table the first deliverable, and
section 12 explains why it matters more than it sounds like it should.



All figures come from probes run against the real `sim/` and the real camera
rigs, in node, at the fixed 60 Hz tick. The probes were removed after
measurement; section 10 proposes committing the useful ones.

### 3.1 The dog has no inertia

| Behaviour | Measured |
| --- | --- |
| Reach 90% of top speed from rest | 0.050 s |
| Stop from 25 m/s | 0.133 s, coasting 0.42 m |
| Reverse velocity 180 degrees at speed | 0.017 s, one tick |
| Complete a 90-degree turn at speed | 0.033 s, 0.4 m of arc |

`DOG_ACCELERATION = 40` reads like 40 m/s² but is not an acceleration. In
`applyAcceleration` it is the rate constant of an exponential approach, so it
means a time constant of 1/40 s. The dog reaches full speed in a twentieth of a
second and reverses inside a single tick. It pivots on the spot with no turning
radius at all.

The dog only *appears* to turn over half a second because the renderer smooths
its visual heading separately. The physics has already finished.

This is the engine driving everything else. A camera cannot gracefully follow a
subject that changes direction instantaneously.

### 3.2 The camera rotates enormously in ordinary play

Over a scripted two-minute herding run that pens all 25 sheep, driven by
world-space input so the feedback loop of section 3.4 is not even involved:

| Rig | Total rotation | Average | Peak | Above 60 deg/s | Above 35 deg/s |
| --- | --- | --- | --- | --- | --- |
| Shipped Follow | 5,204 deg | 44 deg/s | 373 deg/s | 25 s (21%) | 46 s (38%) |

Fourteen full revolutions in two minutes. For more than a third of the run it
exceeds the upper bound of what people describe as comfortable, and the peak is
above the rate at which participants have withdrawn from laboratory studies.

This is a competent run. It is not a player fighting the controls.

### 3.3 Why it is that fast: the closed form

Both of those rates fall straight out of the constants. Two exponential
smoothers in series, driven by a constant angular offset, settle at a constant
rate:

```
omega_sustained = delta / (tau_yaw + tau_heading)
```

`tau_yaw` is 0.35 s from [feel.ts](../app/src/camera/feel.ts) and `tau_heading`
is 0.125 s, the sim's heading slew at `DOG_TURN_RATE = 8`. A held reversal gives
180 / 0.475 = 379 deg/s. A held quarter turn gives 90 / 0.475 = 189 deg/s. The
measured 349 and 202 sit just under those, so this is the mechanism rather than
a curve fitted after the fact.

The same equation rules out both of the obvious one-line fixes.

**Damping alone cannot work.** Holding a reversal to 35 deg/s requires the two
time constants to sum to 5.1 s. Even at `tau_yaw = 4` s the camera still sweeps
44 deg/s, and by then it lags so far behind that the player is steering a dog
they cannot see. Comfort and responsiveness trade against each other along this
curve, and no point on it satisfies both.

**A rate clamp alone cannot work either.** A clamp bounds the peak, which is
worth having, but it does not remove the offset that is driving the sweep. The
camera simply grinds at the clamp for as long as the input is held, so a
1,048-degree burst becomes 1,048 degrees of unbroken sweep at exactly the clamp
rate. Longer exposure, same direction, no relief.

The offset itself has to stop existing. That is what the yaw dead zone, the
approach gate and the input latch in stage 2 are for. Each removes a class of
sustained offset instead of slowing the response to it.

### 3.4 Camera-relative input makes it self-sustaining

Holding a single key, with the shipped camera-relative basis:

| Input held | Camera rotation | Sustained rate |
| --- | --- | --- |
| Reverse, 3 s | 1,048 deg | 349 deg/s, does not stop |
| Turn right, 6 s | 1,215 deg | 202 deg/s, does not stop |

These do not converge. Holding a direction spins dog and camera together
indefinitely. Latching the input basis instead of resampling it every frame cuts
the same key sequence from 3,828 deg to 542 deg, and turns "hold right" into
exactly 90 degrees of camera movement, once.

A related symptom of this same loop is already in [STATUS.md](../STATUS.md):
sustained camera-relative turns once collapsed the chase distance from 20 m to
3.43 m. That was fixed in `9cbd128b` by smoothing the tracking centre separately
from the orbit. The loop itself was never addressed, only its distance symptom.

### 3.5 Elevation alone does not fix it

Raising the rig to 24 m back and 16 m up, a 34-degree look-down, while leaving
the yaw law unchanged, still peaks at 390 deg/s and still rotates 3,755 deg over
the held-key sequence.

The converse is true as well, and the sweep in stage 3 has the numbers: once the
yaw law *is* fixed, moving the rig anywhere between the shipped 20 m back and
32 m back changes total rotation by 5%. Elevation is worth doing, but for a
different quantity than the one being complained about. It cuts ground optic
flow by up to 47% and frames the dog nearer screen centre. Neither of those is
rotation, and rotation is what makes people ill.

### 3.6 The rig heaves over terrain

Follow sets its height from the ground **under the rig**, so it rides the
terrain: 1.64 m of vertical travel at up to 0.97 m/s, oscillating around 0.1 to
0.2 Hz, with pitch wobbling about 2.5 degrees at up to 4 deg/s. Classic, which
is world-locked, measures 0.00 m.

I first recorded this as a minor item. It is not. That oscillation frequency is
the single worst one in the human response curve.

Diels and Howarth measured visually induced motion sickness across optical flow
from 0.025 to 1.6 Hz with 24 participants and found it **peaked at 0.2 to
0.4 Hz**, concluding that frequencies in that band should be avoided. Physical
motion sickness incidence peaks in the same place, near 0.167 to 0.2 Hz
(O'Hanlon and McCauley; Golding et al. nauseated 12 of 12 subjects at 0.2 Hz
against 8 of 12 at 0.1 Hz and 7 of 12 at 0.4 Hz, with time to endpoint of
11.2 minutes against 18.0 and 20.2). A 2025 meta-analysis of 97 studies names
visual oscillation as one of three factors that consistently make sickness
worse.

So the rig is oscillating vertically through 1.64 m, at the most nauseogenic
frequency that exists, on straight runs, with no player input causing it, while
Classic measures 0.00 m and draws no complaints. Xbox Accessibility Guideline
117 covers this case in as many words: avoid any repetitive up-and-down
on-screen movement except that which is core to gameplay. This is not core to
gameplay, and Classic proves it.

It is also still the cheapest item on the list to remove. World-locking the rig
height touches no sim math and needs no new setting.

### 3.7 Deliberate abuse, and a defect in the first candidate

A candidate rig assembled from the stages below was then run against inputs
chosen to break it: reversing every 0.5 s, sprint-reversing every 0.3 s,
rotating the stick steadily, and holding a circling input.

The worst case for the shipped rig turns out not to be violent input at all. It
is a stick rotated slowly, which is exactly what circling a flock looks like. At
15 deg/s of stick rotation the shipped camera averages 241 deg/s and peaks at
581 deg/s, spending 91% of the run above 60 deg/s. Mashing the stick faster than
the dog can commit to a direction is comparatively mild, because successive
direction changes cancel before the camera commits to either.

The candidate held everywhere except under sustained reversal, where it still
averaged 66 deg/s and peaked at 166 deg/s despite a 35 deg/s clamp. The clamp
was being applied to the wrong quantity.

The rig has two independently smoothed parts: an orbit yaw that decides where
the camera stands, and an aim point that decides what it looks at. Clamping the
orbit bounds the first only. What the player actually sees is the direction from
camera to aim, and the aim is smoothed separately at 0.08 s, so it swings
sideways whenever the dog reverses. A camera standing perfectly still can still
whip its view across the screen.

Rate-limiting the composed look direction, then rebuilding the aim along the
limited bearing, makes the clamp mean what it says:

| Rig, under sustained reversal | Average | Peak | Above 60 deg/s | Above 35 deg/s |
| --- | --- | --- | --- | --- |
| Clamp on the orbit only, 35 deg/s | 66 deg/s | 166 deg/s | 40% | 97% |
| Clamp on the look direction, 35 deg/s | 35 deg/s | 35 deg/s | 0% | 49% |
| Clamp 25 deg/s, 20-degree dead zone, 28 m back and 20 m up | 25 deg/s | 25 deg/s | 0% | 0% |

The third row puts every one of these adversarial inputs entirely inside the
comfort band, and the dog never leaves the middle 13% of the screen while it
does so. That is the configuration stages 2 and 3 should target.

Frame rate does not change the result. The same scenario at 30, 60 and 144 Hz,
and at a deliberately spiky frame time, produces 449, 458, 451 and 412 degrees
of rotation.

Sweeping the input-latch threshold over the held-key sequence, 45 and 60 degrees
behave best: 45 degrees re-latches 13 times for 360 degrees of total camera
movement, 60 degrees re-latches 9 times for 305 degrees. Below 30 degrees it
re-latches on stick noise. At 90 degrees the basis goes stale and the eventual
corrections grow again.

### 3.8 Slowing the dog down does not help, and the test cannot settle it

The most attractive-sounding recommendation from the locomotion research is a
speed-dependent turn-radius limit on the commanded direction, applied in the
input layer. The physics behind it is sound. A real dog at 15 m/s at its
measured friction limit turns on a 17.6 m radius, so a 90-degree turn takes
1.84 seconds and 27.6 m of arc. The game's dog does the same turn in 0.033
seconds and 0.4 m of arc, roughly seventy times tighter. Capping the commanded
heading rate at `lateral acceleration / speed` would bound the camera's yaw
demand at source, which is exactly where the theory says to bound it.

Measured against the scripted acceptance run, it does not work:

| Turn limit | Completion | Total camera rotation, calm rig |
| --- | --- | --- |
| None (shipped dog) | 117.5 s | 1,624 deg |
| 4.0 g | 232.9 s | 2,916 deg |
| 2.5 g | did not complete | 5,469 deg |
| 1.3 g (a real dog) | did not complete | 6,527 deg |

Completion time doubles, and **total camera rotation goes up, not down**,
because the run lasts longer and the dog spends it arcing. The comfort rate is
unaffected either way: every row is still capped at 25 deg/s with no time above
35.

Two caveats, and they matter in opposite directions.

The first is that a wider sweep came back **non-monotonic**: a flat 720 deg/s
cap completed in 204.7 s while a looser-sounding 360 deg/s cap did not complete
at all, and an 8.2 g friction limit finished in 140.6 s while a tighter-binding
12.2 g did not. That pattern is not a property of the dog. It is the scripted
driver, which is a bang-bang controller written against an instantaneous dog and
which oscillates and stalls when its commands acquire any lag. Its own header
says so: a stall is the driver being bad at herding. **So these runs cannot tell
us what a turn limit does to a human player, and no amount of further sweeping
against this oracle will.** That question needs playtesting.

The second is the useful half. Whatever a turn limit is for, it is not for
comfort. The camera fix in stages 2 and 3 already reaches zero time above
35 deg/s with the dog completely untouched. Dog weight is therefore a **feel**
change, to be judged on feel, and it must not be bundled with the fix for issue
90 or allowed to delay it.

### 3.9 Two constants that do not behave the way their names suggest

**The dog's visual heading limit is frame-rate dependent.**
`DOG_HEADING_STEP_LIMIT = 0.14` in
[dogMotion.ts](../app/src/scene/dog/dogMotion.ts) is clamped per *frame*, not
per second, in
[headingSmoothing.ts](../app/src/scene/flock/headingSmoothing.ts). That is
8.02 degrees a frame: 481 deg/s at 60 Hz and **962 deg/s on a 120 Hz Android
phone**. The same helper smooths the sheep, so the flock inherits it.

This is not a simple units bug, and the naive fix would regress something real.
The comment on that clamp explains that a per-frame limit is deliberate: after a
long or throttled frame, spending all the elapsed time in one displayed rotation
is itself a visible snap. A per-frame cap bounds that snap; a per-second cap
would let a 0.1 s frame rotate 8 degrees at once. The correct form does both,
clamping the step to the smaller of `maxRate * dt` and a fixed snap ceiling. The
sustained rate then stops depending on the display, and the anti-snap behaviour
survives. This was found twice independently, from the camera side and from the
input side, which is worth saying because the two reach it by different routes:
the camera tracks this variable, so on a 120 Hz phone the camera's own input
spins twice as fast as it does on the desktop the constant was tuned on.

**`MAX_POSITION_K = 0.3` is inert.** Solving `1 - exp(-dt/tau) = 0.3` puts the
binding point at 18.7 fps for the Follow position constant and 8.7 fps for
Classic's. The code comment says roughly 22 fps. Either way it is a crash guard
that never engages at a playable frame rate, and it should not be counted as a
comfort mechanism. `MAX_FRAME_DT = 0.1`, by contrast, is correct and sufficient:
`requestAnimationFrame` is paused in background tabs, so a tab restore delivers
one large delta rather than a spike train, and that clamp covers it.

### 3.10 The end stop: a Follow camera whose yaw never moves

Setting the cap to zero and the look-ahead to zero freezes the camera's bearing
while its position still tracks the dog. The result is the strongest single
number in this document:

| Landscape rig, 26 m / 14 m | Total rotation | Worst dog position | Time off screen | Completion |
| --- | --- | --- | --- | --- |
| Shipped Follow | 5,204 deg | 0.19, 0.25 | 0% | 117.5 s |
| Cap 25 deg/s, look-ahead 4 m | 1,624 deg | 0.15, 0.10 | 0% | 117.5 s |
| **Cap 0, look-ahead 0** | **119 deg** | **0.08, 0.11** | **0%** | **117.5 s** |

Rotation falls to 2.3% of what ships today, an average of 1 deg/s, and the
residual is only the camera translating while it looks at a moving dog. The dog
never leaves the middle 8% of the screen in landscape or 16% in portrait, which
is **better framing than any rotating variant**, because the rig still follows
the dog's position and only its bearing is pinned. Completion time is identical,
because the camera does not affect play.

This is the Untitled Goose Game and Kirby answer arrived at from measurement: an
elevated three-quarter view on a fixed compass bearing. It also means
camera-relative input collapses into world-axis input, so the feedback loop of
section 3.4 cannot exist at all in this mode.

It matters for a second reason. Xbox's Camera Comfort feature tag is
store-facing and requires that an automatic camera effect either not be used or
be adjustable **to zero**: a reduced setting does not qualify. This variant is
that end stop, and it is reachable inside Follow, so a player who likes the
Follow framing does not have to give it up to get a still camera.

### 3.11 The case the rate cap does not cover: weaving

Every receipt proposed so far is a total, an average, a peak, or a percentage of
time above 60 deg/s. For a rig hard-capped at 25 deg/s that last one is 0% by
construction, which makes it an unfalsifiable receipt rather than a passing one.
The case those numbers miss is the one herding produces most: not a spike, but a
**sustained oscillation**.

A player working a flock weaves. Flank left, flank right, flank left, at
something like half a hertz down to a fifth of a hertz. That is not an unusual
manoeuvre, it is the core verb of the game, and it drives the camera's tracking
error back and forth across the dead zone continuously.

The yaw law is a first-order lag, so its response is known in closed form.
`|H(f)| = 1 / sqrt(1 + (2*pi*f*tau)^2)`, and at tau 1.0 s the corner sits at
0.159 Hz, which is the bottom edge of the sickness band:

| Weave frequency | Passed through at | Camera amplitude after a 20 deg dead zone | Peak yaw rate |
| --- | --- | --- | --- |
| 0.2 Hz | 62% | 15.6 deg | 19.6 deg/s |
| 0.3 Hz | 47% | 11.7 deg | 22.1 deg/s |
| 0.4 Hz | 37% | 9.2 deg | 23.2 deg/s |

Two things follow, and the second is the uncomfortable one.

**Total rotation from weaving alone is 1,500 to 1,700 degrees over two minutes**,
which is more than the 1,430 degrees the whole herding run costs on the same
script. And **the rate cap never engages.** At every frequency in the band the demanded rate lands between
19 and 24 deg/s, just under the 25 deg/s ceiling. The cap is not what is
protecting the player here, so a receipt that only reports peak rate and time
above a threshold will report a clean pass on the single most provocative thing
the camera does.

It is also all in the wrong band. Section 3.6 world-locks the rig height
specifically to get 0.1 to 0.2 Hz oscillation off the vertical axis. Leaving the
identical band on the yaw axis would be a strange place to stop, because the
rotational axis is the one the threshold work says is roughly two and a half
times more provocative.

**The fix is hysteresis on the dead zone, not a lower cap.** Lowering the cap
does not help, since the cap is not binding. Widening the dead zone uniformly
costs framing on real turns. What separates a weave from a turn is that a weave
*reverses*: use a small threshold, about 15 degrees, to keep rotating the way the
camera is already rotating, and a much larger one, 35 to 40 degrees, to start
rotating the other way. A genuine sustained turn is unaffected because it never
asks for a reversal. A weave has to pay the larger threshold on every flank
change, and stops driving the camera at all.

**One caveat on the numbers above.** They are arithmetic on the linearised law,
not probe output, and they treat the loop as open, which slightly overstates the
amplitude because the camera's own rotation reduces the error it is chasing. The
direction of the result is not in doubt, but the magnitudes want measuring, which
is why section 10 adds two receipts specifically for this: **maximum degrees of
yaw in any rolling ten-second window**, and **band power of the yaw rate between
0.2 and 0.4 Hz**. Neither can be satisfied by construction the way "0% above
60 deg/s" can.

## 4. Mobile makes every one of these worse

The reporter's clip is desktop, but the user reports this is most acute on
phones. The code explains why.

**The stick is on the small side, but that is not the defect.** At 0.16 to
0.18 mm per CSS pixel on current phones, `STICK_RADIUS = 56` in
[touch.ts](../app/src/input/touch.ts) is 9.0 to 10.1 mm of thumb travel from
centre to full deflection. That sits just above the Game Accessibility
Guidelines phone minimum of 9.6 mm and well below its stated ideal of 24 mm, and
shipped competitors measure 11.9 to 14.6 mm. So it is short of comfortable
rather than wrong, and every small thumb movement is a large direction command
on a surface where micro-corrections are constant. The right number comes from a
device, not from a document; stage 5 says how to get it.

**The dead zone does not rescale, and that is the defect.**
`TouchControls.tsx` passes `deflection` straight through once it clears
`DEADZONE = 0.16`, so effort jumps from 0 to 0.16 at the threshold and nothing
between those values is reachable. The slow, deliberate walk that makes herding
calm cannot be held on a phone at all. Worse, 0.16 at a 56 px radius is 1.4 to
1.8 mm, a figure inherited from physical thumbsticks where a dead zone exists to
reject spring-return error and mechanical slop. A touchscreen has neither. It
only needs to reject finger tremor and panel jitter, commonly filtered at around
0.5 mm, so the threshold is roughly three times larger than it needs to be while
also being applied in the way that costs the most.

**Portrait's wide lens is load-bearing and has to stay.** `cameraViewProfile`
blends the vertical field of view up to 76 degrees in portrait. The instinct is
to narrow it, since wide lenses increase peripheral optic flow. That instinct is
wrong here, and the arithmetic says why.

What governs rotational discomfort is the *horizontal* field, because yaw sweeps
content sideways. Converting with `hFOV = 2 atan(tan(vFOV/2) * aspect)`:

| Orientation | Vertical FOV | Aspect | Horizontal FOV | A 35 deg/s sweep |
| --- | --- | --- | --- | --- |
| Landscape 16:9 | 45 deg | 1.78 | 72.7 deg | 48% of screen width per second |
| Phone portrait | 76 deg | 0.46 | 39.5 deg | 89% of screen width per second |
| Portrait at a 45-degree lens | 45 deg | 0.46 | 21.6 deg | 162% of screen width per second |

Portrait is already the narrowest view in the game at 40 degrees horizontal, and
the tall vertical framing is the only thing keeping it that wide. Narrowing the
vertical field narrows the horizontal field with it: at 45 degrees vertical, a
single 35 deg/s sweep would carry more than a full screen width every second.
Holding 60 degrees horizontal in portrait would instead require a 103-degree
vertical lens.

The real consequence is the opposite of a lens change. A narrow horizontal field
magnifies every degree of yaw, so portrait simply cannot afford yaw. That argues
for the dead zone and the clamp being *tighter* in portrait, not for a different
field of view.

**A correction, because I got this wrong twice.** I first wrote that the portrait
lens should be narrowed, which is backwards. I then wrote that the yaw dead zone
must be authored as a fraction of screen width, because a fixed angle would
leave the dog 18% off centre in landscape and 37% in portrait. That is also
wrong, and measurement settles it.

It is only true of a rig whose aim point chases the dog's velocity. In the rig
recommended here the aim is rigidly attached to the view bearing, `aim = centre
+ forward * lead`, so the camera always looks straight down its own axis. The
dog therefore sits where `lead` and `distance` put it, and nothing else moves
it. Sweeping the dead zone from 0 to 45 degrees over the two-minute run:

| Dead zone | Total rotation | Dog, mean horizontal offset | Dog, worst offset |
| --- | --- | --- | --- |
| 0 deg | 1,983 deg | 0.025 | 0.135 |
| 15 deg | 1,430 deg | 0.026 | 0.136 |
| 30 deg | 1,138 deg | 0.030 | 0.137 |
| 45 deg | 1,018 deg | 0.036 | 0.143 |

Rotation halves. Framing does not move. The same sweep in portrait behaves
identically. **The dead zone is a pure rotation control with no framing cost,
and a plain angle in degrees is the right way to author it.**

The look-ahead is the framing control, and it is equally clean in the other
direction. Sweeping it from 0 to 10 m changes total rotation by exactly nothing,
1,430 degrees at every value, because the aim cannot rotate independently of the
bearing. All it does is slide the dog down the frame, from 0.01 above centre at
zero lead to 0.31 below it at 10 m.

Two controls, two effects, no interaction. That is the property worth protecting
in the implementation.

What remains true from the field-of-view arithmetic is the part that matters for
the rate cap. A narrow horizontal lens magnifies every degree of yaw, so the
same 25 deg/s sweeps 34% of the screen width per second in landscape and 63% in
portrait. Portrait cannot afford yaw. It is also where the dead zone starts to
cost something real: at a 39.5-degree horizontal lens, a 20-degree divergence
between travel and bearing puts the direction the dog is running almost at the
frame edge, so the player stops being able to see where they are going. That is
the constraint on how wide the dead zone may go, not framing.

**There is no camera authority at all.** Desktop at least has a keyboard and the
option of adding one. On touch, the player has a stick, sprint, bark, camera
toggle and pause. Nothing lets them stop the rotation.

## 5. Why this makes people ill

Camera rotation is a far stronger trigger than camera translation, and the
research is specific enough to design against.

**Rotational optic flow crosses the sickness threshold far sooner.** Terenzi and
Zaal (NASA Ames / San José State, AIAA SciTech 2020) held optic flow constant
across conditions and found mean onset thresholds of 1.035 for translation
against **0.415 for rotation** (p < 0.001), replicated in the accelerating
conditions. Their mechanism: at constant translational velocity there is
theoretically no visual-vestibular conflict, because otoliths sense only
acceleration, whereas the semicircular canals do register constant angular
velocity, so constant-velocity rotation actively generates conflict. Roll versus
yaw was not significant, so the finding transfers.

**Vection is the causal factor, and it accumulates.** Nooij et al. (2017)
rotated a visual surround in yaw at 60 deg/s; vection gain accounted for 48% of
the variance in sickness, while optokinetic nystagmus was not a significant
predictor. Terenzi and Zaal measured the angular vection time constant at
**3.78 s**, against 1.82 s for translation. Perceived self-rotation therefore
builds over roughly four seconds of sustained turning. This is precisely what
the feedback loop in section 3.4 produces: rotation that never stops.

**The numbers to design against.**

| Value | Source |
| --- | --- |
| Sustained 20 deg/s is enough to induce uneasiness | Terenzi and Zaal 2020 |
| Preferred rotation speed 15 to 35 deg/s; uncomfortable above | Farmani and Teather |
| Participants withdrew at 100 deg/s and at 200 deg/s | Farmani and Teather |
| Mitigation threshold set at 25 deg/s, described as slightly conservative | Farmani and Teather |
| Nauseogenic window around 30 to 60 deg/s in drum studies | Hu et al. |
| Rotational optic flow thresholds significantly below translational, 0.415 against 1.035 | Terenzi and Zaal 2020 |
| Rotational vection builds over a 3.78 s time constant, against 1.82 s for translation | Terenzi and Zaal 2020 |
| Visually induced sickness peaks at 0.2 to 0.4 Hz of oscillation | Diels and Howarth 2013 |
| Physical sickness incidence peaks near 0.167 to 0.2 Hz | O'Hanlon and McCauley; Golding et al. |

Two of those rows matter more than the rest. Rotation is the provocative axis,
by a factor of about two and a half against translation, which is why the yaw
is the headline. And the oscillation band is narrow and specific, which is why
the terrain heave in section 3.6 turned out to be the second item on the list
rather than a footnote.

The shipped camera averages 44 deg/s across a real run, spends 38% of it above
35 deg/s, and peaks at 373 deg/s. It sits above the rate at which participants
withdrew from a laboratory study, during normal play, for extended periods. The drum-study finding that symptoms peak near 60 deg/s and fall above
it does not exonerate this: that decline happens because vection breaks down in
a featureless drum at extreme speed, whereas a structured scene with a stable
horizon sustains vection much higher.

**Scene density scales it.** Terenzi and Zaal found optic flow linear in
particle density, with thresholds falling as density rose. Yawing past dense
near-field grass, flowers, fence posts and sheep is measurably worse than
yawing over open ground. A low camera puts maximum near-field detail in the
periphery. This is the mechanism behind the 47% optic-flow reduction that the
elevation sweep in stage 3 measures, and it is the honest reason to raise the
rig once the yaw is fixed.

**Field of view is not the lever people assume.** The guidelines suggest about
60 degrees for a television and 90 for a monitor as viewing angles, which reads
like an argument for narrowing the game's 76-degree portrait lens. It is not:
section 4 works the arithmetic and portrait is already the narrowest *horizontal*
view in the game. What the density result does say is that the periphery is
where the harm is, which argues for moving the camera away from the grass rather
than for cropping the frame.

**Losing control amplifies it.** Can I Play That summarises that active play
produces less visually induced motion sickness than passive play, and that the
problem cases are "moments where the player is not in control of the camera".
In Follow, every moment is one of those.

**Two published guidelines name this exact behaviour.** Game Accessibility
Guidelines lists as a trigger "changing where the character is looking without
the player's input", and says to provide an option to turn it off. Xbox
Accessibility Guideline 117 asks whether a game will "automatically change
camera view or angle (for example, camera auto-centering)" and requires
"the ability to disable automatic camera movement". Sheepdog Sim currently
offers no such option in any mode.

## 6. Reduce motion never reaches the camera

Audited every reader of the flag. It changes the camera-mode blend duration, the
completion pull-back, dog secondary motion, flock motion scale, bark pulse, bird
lift, ground dust, post-processing warmth and bloom, and audio transients.

It touches **no** Follow constant: not the yaw time constant, not the position
or aim smoothing, not the look-ahead, not the height, not the pitch, not the
terrain heave. The one mode that makes people ill is the one mode the setting
does not affect. The reporter's title is a precise bug report.

## 7. What comparable games do

- **Journey.** John Nesky's "50 Camera Mistakes" (GDC 2014): the camera should
  *drift* behind moving players, with yaw following the **direction of
  movement**, slowly. To reframe, "slide sideways to frame the avatar" rather
  than pivoting; to include a nearby target, move back or sideways instead of
  rotating; limit any angle change to about 90 degrees. When the player runs at
  the camera, pull it closer rather than swinging it around. Journey was
  explicitly built to be playable by people who get sick from dynamic cameras.
- **Abzu.** Solves each degree of freedom separately, dead-zones the pitch, and
  describes yaw as "pulled along like a leash" rather than locked to facing.
  Every constraint runs through a critically damped spring specifically to avoid
  speed hitches, and the camera is predictive so releasing the stick leaves it
  already aligned.
- **Untitled Goose Game, A Short Hike, Kirby and the Forgotten Land.** Elevated
  three-quarter views with fixed or authored yaw. Reversing direction never
  rotates the view.
- **Lonely Mountains: Downhill.** High follow camera targeting "an imaginary
  future position of the rider", not the rider.
- **Sable, Stray, Lil Gator Game.** The cautionary cases: all three drew motion
  sickness reports traced to low, close, narrow-field-of-view chase cameras.
  Sable shipped a patch whose note says the camera now follows more smoothly "to
  prevent some cases of motion sickness", then added a field-of-view slider.
- **Sea of Thieves.** The closest published precedent for a parameterised
  auto-rotating camera, and the model to copy: **Auto Centre Camera** on or off,
  **Auto Centre Delay** in seconds before it begins to move, and **Auto Centre
  Speed** as an explicit rate. A toggle, a dead time and a rate cap. Its shipped
  defaults are the whole feature **off**, with a delay of 2.0 seconds and a speed
  of 180 when it is switched on. Two caveats before copying it. The delay has
  changed since launch, so published figures disagree between 2.0 and 3.0. And
  it was not built for comfort at all: it exists so a player using a single
  analogue stick does not have to re-centre the camera by hand. Cite it as the
  shape Microsoft itself uses to illustrate "the ability to disable automatic
  camera movement", not as a validated comfort design. The transferable part is
  that the camera waits seconds of sustained off-centre movement before it
  rotates. Sheepdog Sim waits zero.
- **The Last of Us Part II.** A dedicated *Motion Sickness* settings category:
  camera shake, motion blur, dolly zoom, field of view, **camera distance**, and
  a persistent centre dot.
- **God of War Ragnarök.** A *Motion Reduction* section separating **Camera
  Shake** (short, high-frequency movement) from **Ambient Camera Sway** (slow,
  looping movement), plus a persistent centre dot. Its follow camera also
  refuses backward input as a direction source: running at the camera moves the
  character without rotating the view, which is the same rule as the approach
  gate in stage 2.
- **Marvel's Spider-Man 2.** **Swing Camera Motion** scales "the amount of roll,
  pitch, and field of view changes while swinging": a magnitude scalar on the
  traversal camera's own rotation, the nearest analogue to scaling follow yaw.
  Insomniac also abandoned a true follow camera for traversal, because a camera
  that tracks a fast-turning subject was not shippable at any damping value.
- **Tchia.** Ships auto-centring as an explicit **Camera Assistance** toggle.
- **The textbook rule.** Haigh-Hutchinson, *Real-Time Cameras*, sets out the
  same separation the fix depends on: the camera's orientation is a distinct
  problem from its position, and automatic reorientation must be rate-limited
  and gated on a minimum deviation rather than driven continuously by the
  subject. It also warns specifically against deriving orientation from a
  subject's facing when facing can change faster than the camera can follow,
  which is precisely the shipped law.
- **Super Mario 64.** The canonical ratio for a follow camera that never makes
  anyone ill: automatic yaw runs at roughly an eighth of the rate the player
  gets when they turn the camera themselves. Automatic rotation is slow enough
  to read as the world settling, not as the camera moving.
- **Ubisoft, Game AI Pro 3.** The previous-view-matrix rule: evaluate each
  frame's camera against the *previous frame's* view, not against the world, so
  the quantity being damped is the change the player actually perceives. This is
  the general form of the defect in section 3.7, where clamping the orbit missed
  the rotation the player was seeing.
- **Herding games.** Every serious sheepdog game offers a high or top-down
  option, because reading a flock needs the elevated view.

The shared rules: yaw follows velocity lazily and never facing; running toward
the camera does not swing it round; translate before rotating; higher and
farther beats low and close; rate-limit what the player perceives rather than
what the rig computes; wait before reorienting at all; and let the player turn
the assistance off.

Classic already satisfies all of these, which is exactly why nobody reports
sickness in it.

## 8. The plan

Ordered by measured benefit per unit of risk. Stages 2, 3 and 4 are the fix for
issue 90 and are independent of everything else here; they can ship on their own
and should. Stage 1 is numbered first because it is where the movement work
belongs in the code, not because it goes first in time.

### The smallest thing worth shipping first

The stages below are a lot of work and the player base is live, so it is worth
naming the smallest increment that is defensible on its own. It is four changes,
none of which needs a new setting, a spec amendment or any contact with `sim/`:

1. **World-lock the rig altitude.** Removes 1.64 m of terrain heave at 0.1 to
   0.2 Hz, which is the single most nauseogenic frequency band there is, and it
   is a one-line change to where `groundY` is sampled.
2. **Delete the speed-scaled look-ahead.** `lead = lookAhead * speedNorm` means
   every velocity change throws the aim point, and the sprint-release clamp is a
   10 m/s velocity step in one tick. Setting the lead to a constant costs
   nothing and removes a whole class of pop.
3. **Latch the input basis.** Cuts the feedback loop, measured at 3,828 degrees
   down to 542 on the held-key sequence. One file.
4. **Stop Reduce motion from shortening the camera-mode blend**, from section 9.
   It is a two-character change to a ternary, it makes an accessibility setting
   stop doing the opposite of its name, and it is the one fix here that helps
   most the exact player who went looking for help.

Those four carry the largest measured wins in the document and between them touch
three files. Everything after that is the yaw law and the setting, then the input
conditioning, then the animation. Doing them in that order means each increment
is separately defensible and separately revertible, which matters more than usual
with players on the live build.

### Stage 1. Give the dog weight (input layer, no sim change)

**Order this after stages 2 to 4, not before them.** I originally had it first,
on the reasoning that the one-tick reversal is the root cause of everything.
Section 3.8 disproves the comfort half of that, and the design work below
confirms it from the other direction: measured over an identical input script,
total dog-heading rotation is 8,625 degrees today and 8,278 degrees with the
full weight model. That is a 4% difference. A lag-follow camera converges, so in
steady state it rotates by whatever total the thing it follows rotates. **The
controller cannot fix total rotation. Only the basis latch and the camera's own
dead zone can.**

What it does buy for comfort is narrower and worth stating exactly: it gives the
tracked signal a **bounded derivative**. The dog's velocity direction can never
rotate faster than 270 deg/s, and never faster than 248 deg/s at full run or
149 deg/s at sprint. Today it can rotate 180 degrees in one tick. That is the
property that makes a camera rate cap a cap rather than a debt the camera repays
later as a snap. Everything else in this stage is feel, which is what the user
asked for, and it must not be allowed to hold up the fix for issue 90.

The place to do it is the **intent** in `app/src/input`, before it reaches the
sim. Smoothing the intent preserves onset latency; smoothing the rendered
transform destroys it. `sim/` stays byte-identical for any given input sequence,
so the fixtures in `tests/fixtures/` cannot move.

#### The model

Keep two pieces of state in the input layer: a commanded **speed** in m/s and a
commanded **unit direction**. Rate-limit both. Three rules do the work.

**1. Direction rate limit, at constant lateral acceleration.**

```
omega(v) = clamp(A_LAT / v, 40 deg/s, 270 deg/s),   A_LAT = 65 m/s^2
```

One crossover, derived rather than declared: 65 / 4.712 = 13.79 m/s. Below that
the dog pivots at a flat 270 deg/s; above it the turn radius is constant at
v squared over 65. Slow is nimble, fast is committed.

| Dog speed | Turn rate | Turn radius |
| --- | --- | --- |
| Up to 13.79 m/s | 270 deg/s | up to 2.93 m |
| 15 m/s, full run | 248 deg/s | 3.46 m |
| 25 m/s, sprint | 149 deg/s | 9.62 m |

**A_LAT was 28, and the playtest that found it wrong is worth recording.** At 28
the run circle was 8.0 m. `SHEEP_FLEE_RADIUS` is 8 m. The dog's turning circle
was the pressure zone exactly, so no correction near a sheep could be made
without leaving the zone that was making it, and every adjustment became an arc
out and back while the flock drifted. This section originally justified that
number against the size of the FIELD - "an 8 m circle is 4% of the field, so
flanking stays possible" - which is the wrong yardstick, and picking the wrong
yardstick is how a number that unbalances the game survives review. Herding is
played against the flee radius, not against the field.

65 is the most that can be spent while `A_LAT / v` still governs at a full run:
the 270 deg/s ceiling takes over at 70.7, and past that the law at running speed
becomes a flat rate rather than a radius. It puts a run inside the 5 m
`SHEEP_PERCEPTION_RADIUS` and leaves a sprint outside the 8 m flee radius, so
sprint stays a gear for closing distance rather than a way to corner inside the
flock. The turning radius is pinned against both sim constants by name in
`tests/input-conditioning.spec.ts`, so a later retune of either one has to
confront this relationship rather than silently break it.

Relaxing the conditioning this far is available only because the camera no
longer depends on the input being gentle: it is bounded independently by its own
bearing rate cap and view budget. The conditioning had been paying twice for a
protection the rig now provides for itself, and the turning was the payment.

**2. Turn authority, which produces braking and skids with no state machine.**
Commanded effort is scaled by the angle between the command and the dog's
current momentum: full below 45 degrees, zero above 135, linear between, and
restored below 3 m/s where there is no momentum worth respecting. A 90-degree
corner therefore costs half effort, so the dog sheds speed into it. A reversal
costs all of it, so the dog brakes, and the turn cap widens as it slows, and it
powers out on an arc. This replaces the Mario 64 skid gate I proposed earlier
with something continuous, and it is better: there is no threshold to chatter
against and no latched state to get stuck in.

**3. Magnitude ramp in the speed domain.** 34 m/s squared up, 45 down, starting
from a 3.5 m/s launch speed on a standing start so the first frame still moves.
Because the ramp is in m/s squared rather than a time constant, walking speeds
arrive in one to two frames and only the top end gains weight.

Two details an implementer must not drop. The ramp must reach **exactly zero**,
not asymptote, because zero is the only input that puts the sim on its
deceleration branch. And on re-press during a coast, the ramp restarts at the
dog's existing momentum projected onto the new direction, not at the launch
speed, or the player gets a brake they never asked for.

#### What it costs, measured

Reversal at full sprint, 180 degrees: 1.43 s and 23.2 m of arc, against 0.02 s
and 0.1 m today. Slowest speed through the turn 3.6 m/s. Peak dog-heading rate
falls from 531 to 239 deg/s.

A 90-degree turn at full run: 0.75 s and 10.3 m of arc, never dropping below
9.8 m/s. A 90-degree turn at a 0.3-effort walk: 0.35 s and 1.4 m. **Close work
is essentially untouched**, which is the point.

Direction latency added, by demanded angle:

| Angle | Walk, 4.5 m/s | Run, 15 m/s | Sprint, 25 m/s |
| --- | --- | --- | --- |
| 5 deg | +0 ms | +17 ms | +50 ms |
| 10 deg | +0 ms | +50 ms | +100 ms |
| 45 deg | +117 ms | +367 ms | +633 ms |
| 180 deg | +650 ms | +1050 ms | +1417 ms |

Read the top two rows first. The continuous small corrections that make up most
of a herding run cost between 0 and 100 ms. The four-figure numbers all belong
to manoeuvres that were physically absurd and are now expensive on purpose.

Onset latency is unchanged. First tick after the press, measured: 2.71 m/s and
0.045 m, against 10.0 m/s and 0.17 m today. Both move on frame one, which is the
threshold that actually governs whether a control feels responsive.

Stopping becomes a coast rather than a halt, scaling with the square of speed:
0.23 m from a walk, 2.51 m from a run, 6.95 m from a sprint. A quarter of a
metre at walking pace still stops the dog where you put it. Seven metres at
sprint is most of the 8 m flee radius, which is the commitment sprint should
carry.

**A side benefit worth naming, and the one trap inside it.** Today the sim
clamps velocity to the walk ceiling the instant a sprint ends, which is a 10 m/s
step in one tick, about 600 m/s squared. That is the pop `feel.ts` already
apologises for in its `SPEED_NORM_TAU` comment. Easing the commanded ceiling out
ahead of the sim's own clamp takes it to 45 m/s squared, measured, with no
`sim/` change. It costs about 0.22 s of extra stamina drain.

The trap is that the eased ceiling has to stay **out of the sprint latch**.
`setSprint(sprint, allSourcesReleased)` in
[intent.ts](../app/src/input/intent.ts) clears the exhaustion flag on
`!sprint || allSourcesReleased`, and the comment three lines down states the
contract it is protecting: an exhausted hold cannot re-arm itself as stamina
regenerates. If the trailing ceiling is fed in as the sprint boolean, the release
edge fires while that boolean is still true, the latch clears, and a player who
exhausts sprint, releases above the walk ceiling and immediately re-presses gets
a free burst. That is a **leaderboard-visible** behaviour change, in a document
whose whole premise is not changing any. Pass the **device** sprint to the latch
and carry the eased ceiling as a separate value. The property is already pinned
by `tests/sprint-release-edges.spec.ts`, so getting this wrong fails a test
rather than shipping, but it is worth knowing before writing the line rather than
after.

#### The leaderboard cost, now measured rather than estimated

My earlier figure of 0.3 to 0.6 s per stop-start was arithmetic. The measured
number is the **steady-state position deficit**, which is the one that matters
because it stops growing:

| Manoeuvre | Deficit | Equivalent |
| --- | --- | --- |
| Standing start then 5 s at full run | 1.85 m behind | 123 ms |
| Standing start then 3 s at sprint | 7.43 m behind | 297 ms |

That is the whole cost, paid once per stop-start rather than per second, plus
the turn table above. Published `field-v3` times were set by a dog that reaches
top speed in 0.083 s. Decide deliberately whether to re-partition the board and
say which it is in the patch note. This remains the one item in the document
that can invalidate something a player already owns.

**Do not use the scripted herding driver to estimate that cost.** Run both ways
across six seeds it swings between 16% faster and 170% slower. Section 3.8 said
the driver could not settle a turn limit; instrumenting its output says why in
one line. Over a 333-second run the driver issues **2,770 starts and 2,770
stops**, 8.3 per second, with the stick held for only 47.3% of ticks. It is
pulse-width-modulating the stick, because `PlayerInputs` has no throttle and
cutting the stick is the driver's only way to arrive somewhere slowly. Its own
header says so. Any change that rate-limits the intent destroys the driver's
sole means of speed regulation, so its completion times measure damage to the
robot rather than cost to a player.

### Stage 2. Make the camera stop chasing facing

In `followFraming.ts` and `feel.ts`:

1. **Drive yaw from smoothed velocity direction, not heading.** Heading is a
   facing; velocity is where the dog is going. The Journey and Abzu rule.
2. **Bolt the aim to the bearing.** Set `aim = centre + forward * lead` instead
   of aiming at the dog plus its velocity. This is the structural move that
   makes everything else hold. The rig then has exactly three degrees of
   freedom, x, z and yaw, and the aim cannot contribute any rotation of its own.
   Without it, a rate cap on the orbit is not a cap on anything the player sees:
   the separately smoothed aim swings on every reversal and measured peaks stay
   near 170 deg/s despite a 35 deg/s clamp (section 3.7). With it, look-ahead
   becomes a pure framing control that costs zero rotation, measured in
   section 4.
3. **Add a yaw dead zone of 20 degrees**, applied to the error rather than the
   output so the step falls continuously to zero at the boundary and cannot
   chatter. The small course corrections that make up most of herding then move
   the camera not at all. A plain angle is correct; it does not need to vary by
   orientation.

   **Not 15, and this is the one place where stage 1 changes a camera number.**
   A dog with a rate-limited direction turns smoothly instead of snapping, which
   holds the camera's tracking error just above a small dead zone for the whole
   duration of a turn. The camera then creeps continuously instead of catching
   up once and settling. Measured over an identical script, with the two
   controllers under the same rig:

   | Rig | Shipped dog | Weighted dog |
   | --- | --- | --- |
   | Cap 25 deg/s, dead zone 20 deg | 2,112 deg total, 15.4 avg | **2,076 deg, 15.2 avg** |
   | Cap 35 deg/s, dead zone 15 deg | 2,140 deg total, 15.6 avg | 3,034 deg, 22.2 avg |

   These four figures are on the **second** script, whose shipped-rig baseline is
   2,112 rather than 5,204. Compare them only with each other. What they
   establish is the pairing, not an absolute total.

   At 25 and 20 the two controllers are equivalent and the camera is never in
   debt against its cap. At 35 and 15 the weighted dog is 42% worse. The pairing
   matters more than either number alone, so if the cap is ever raised, raise the
   dead zone with it.
4. **Give the dead zone direction hysteresis**, about 15 degrees to continue
   turning the way the camera is already turning and 35 to 40 to reverse. Section
   3.11 is the reason: a weaving player drives a sustained 0.2 to 0.4 Hz
   oscillation that sits just under the rate cap, so the cap never engages and
   the usual receipts report a clean pass. Hysteresis removes it without touching
   genuine turns, which never ask for a reversal. Implement it as the threshold
   applied to the error, carrying one bit of state for the current rotation
   direction, cleared whenever the yaw is idle.
5. **Cap the angular rate.** A new `MAX_FOLLOW_YAW_RATE` at 25 deg/s, clamped
   after the smoothing and integrated as `cap * dt`, never as a fixed step per
   frame. Clamping before the smoothing leaks the cap into the time constant;
   clamping per frame makes the effective rate scale with the display.
6. **Hold on approach, and give the hold an exit.** Ramp the yaw response to
   zero as the dog's direction passes about 100 degrees from the camera's
   forward, reaching zero at 120, so there is no threshold to chatter against.
   Above it, do not yaw at all. Let the dog run toward the camera and out again.
   This removes the worst case, the 180-degree reversal.

   **The exit is the part I originally left out, and without it the rule has a
   bad failure mode.** A player fetching a bolted sheep back down the field holds
   a bearing inside that cone for the whole retrieval. With no release condition
   the yaw stays frozen at roughly 180 degrees of error while the rig retreats at
   up to 25 m/s, so the player runs into off-screen space, the frame shows the
   ground behind them, the gate is off camera, and the rig ends up as much as
   28 m outside the fence. That last part is survivable, since the terrain
   footprint is 400 m against a 200 m field, but the rest is not.

   Bound the hold by **displacement, not time**: once the dog has travelled about
   20 m on a bearing still inside the cone, it is a committed run rather than a
   jink, so release the gain and let the rate cap resolve the turn. At full run
   that is 1.3 s, which is far longer than any feint, so reversals and dodges
   still produce exactly zero rotation. A distance threshold is also the right
   unit here because it is what distinguishes the two cases; a timer would cut
   off a slow retrieval and a fast feint at the same moment.

In `IntentResolver.tsx`:

7. **Latch the input basis, re-sampling at 44 degrees.** Sample the camera
   forward when the input direction enters from neutral, hold it while the input
   stays within 44 degrees of where it was sampled, and re-sample when it does
   not. This breaks the feedback loop. Measured effect alone: 3,828 deg down to
   542 deg. Against the capped rig, which already suppresses most of the loop,
   holding one screen direction for six seconds produces 144 deg of yaw on a live
   basis and **70 deg on a latched one**, and the latched case converges while the
   live case never does.

   44 rather than 45 or 60, for a reason that only shows up once the whole input
   path is written down: 45 degrees is exactly the cardinal-to-diagonal step on a
   keyboard, so a threshold at 44 guarantees that adding or releasing the second
   key of a diagonal always re-samples. The section 3.7 sweep found 45 to 60
   about equally good, so this costs nothing and removes an edge case. Below 30
   it re-latches on stick noise. Also re-sample on camera-mode change and on run
   start, both of which are already discrete store events.

   The re-sample is not a discontinuity. It changes the world direction by
   whatever the camera has drifted since the last sample, and that change goes
   through the direction rate limiter in stage 1 like any other input. Before
   stage 1 lands it goes to the sim directly, which is acceptable because it is
   bounded by the threshold.

**Specification conflict to resolve first.** `spec/06` carries "yaw lag tau
0.35 s" as a carried feel constant. Per AGENTS.md this is surfaced, not silently
overridden: amend spec/06 in the same change, recording that the constant was
inherited from a rig whose comfort was never measured and that the new contract
is a rate ceiling plus a dead zone.

### Stage 3. Re-frame the rig higher

The user's instinct is right, with the caveat from section 3.5 that it does not
work alone.

**Elevation is not what fixes the rotation, and the sweep says so plainly.**
Holding the yaw law fixed at a 25 deg/s cap and sweeping the rig from the
shipped 20 m back / 7.5 m up out to 32 m / 24 m moves total rotation over the
two-minute run from 1,675 degrees to 1,591 degrees. Five per cent, across the
entire range. Every configuration peaks at exactly the cap and spends no time
above 35 deg/s.

What elevation actually buys is a different quantity:

| Rig, cap 25 deg/s | Ground optic flow | Worst dog position | Horizon |
| --- | --- | --- | --- |
| 20 m / 7.5 m (shipped framing) | 0.465 | 0.21, 0.10 | in frame, 6.1 deg of sky |
| 22 m / 10 m | 0.412 | 0.19, 0.10 | in frame, 1.6 deg |
| 24 m / 12 m | 0.371 | 0.17, 0.10 | 0.9 deg off the top |
| **26 m / 14 m** | **0.337** | **0.15, 0.10** | **3.0 deg off the top** |
| 28 m / 20 m | 0.290 | 0.13, 0.10 | 10.8 deg off the top |
| 32 m / 24 m | 0.248 | 0.11, 0.09 | 12.5 deg off the top |

Optic flow falls 47% across the sweep and the dog is framed nearer centre at
every step. That is the real case for raising the rig, and it is a good one:
flow magnitude is the translational half of the problem, and the yaw cap does
nothing about it.

**The cost is the horizon, and that cost is not free.** Keshavarz et al. found an
earth-fixed horizon line was the only rest-frame manipulation that significantly
reduced visually induced sickness, while an earth-fixed fixation cross did not,
because the horizon stays visible in peripheral vision and the cross only works
when looked at directly. Above roughly 22 m back and 10 m up, a 45-degree
vertical lens no longer contains the horizon.

The recommendation splits the difference and is chosen for that reason:

- **Landscape: 26 m back, 14 m up, a 26-degree look-down, 45-degree vertical
  lens, look-ahead 4 m.** The top of the frame sits 3.7 degrees below
  horizontal, which on a 200 m field lands on ground about 217 m away, so the
  far fence and the sky above it stay in frame from most positions as a
  world-locked peripheral edge. Optic flow drops 28% and the dog is framed
  better than today.
- **If the horizon is judged to matter more than the flow**, 24 m / 12 m keeps
  it in frame outright and gives up about a third of the flow reduction. There
  is a real argument that it does not matter: the rig people are sick in today
  shows the horizon, at 20 m / 7.5 m and a 16-degree look-down, and shows it
  with 6 degrees to spare. Once the height is world-locked and the pitch is
  constant, the ground plane itself is a stable rest frame filling the whole
  lower frame, which is most of what the horizon result is rewarding.
- **Portrait: 32.5 m back, 17.5 m up, look-ahead 3 m, and keep the 76-degree
  vertical lens.** That is the landscape distance and height multiplied by 1.25,
  chosen so the two orientations share a pitch and read as the same camera, with
  the look-ahead set independently because portrait's tall frame needs less
  downward bias. Measured against the shipped portrait profile it cuts ground
  optic flow by 29% and brings the dog from 0.37 to 0.26 at worst, 0.05 on
  average.
- **Portrait gets the horizon for free, and landscape does not.** The 76-degree
  lens still leaves 11.4 degrees of sky above the frame's top edge at that
  elevation, and would still leave 5.1 degrees at a 33-degree look-down. The
  constraint that limits how high landscape can go simply does not apply here,
  which is another reason not to narrow the portrait lens.
- Keep it clearly distinct from Classic, which is 54 m at 50 degrees.

Measured, with the aim bolted to the bearing:

| Portrait rig, cap 25 deg/s | Pitch | Sky above frame | Dog, worst | Dog, mean | Optic flow |
| --- | --- | --- | --- | --- | --- |
| Shipped, 24 m / 10.5 m, lead 4.5 | 21.2 deg | 16.8 deg | 0.37, 0.14 | 0.070 | 0.377 |
| 26 m / 18 m, lead 4 | 32.9 deg | 5.1 deg | 0.30, 0.17 | 0.059 | 0.313 |
| **32.5 m / 17.5 m, lead 3** | **26.6 deg** | **11.4 deg** | **0.26, 0.10** | **0.050** | **0.267** |

The dog sits further off centre in portrait than in landscape in every row, 0.26
against 0.16, and that is inherent: a 39.5-degree horizontal lens magnifies the
same tracking lag. It is still an improvement on what ships.

If the owner would rather have the flow reduction than the horizon, 28 m / 20 m
is the alternative and the fence becomes the only rest frame. That is a
judgement call about the image, not about the measurements.

Measured over the full two-minute herding run, which pens all 25 sheep in every
configuration below:

| Landscape rig | Total rotation | Average | Peak | Above 60 deg/s | Above 35 deg/s | Worst dog position |
| --- | --- | --- | --- | --- | --- | --- |
| Shipped | 5,204 deg | 44 deg/s | 373 deg/s | 21% | 38% | 0.19, 0.25 |
| 24 m / 16 m, cap 35, clamp on the orbit only | 2,148 deg | 18 deg/s | 137 deg/s | 2% | 16% | 0.13, 0.14 |
| 24 m / 16 m, cap 35, clamp on the look direction | 2,047 deg | 17 deg/s | 35 deg/s | 0% | 6% | 0.18, 0.14 |
| 28 m / 20 m, cap 25, clamp on the look direction | 1,574 deg | 13 deg/s | 25 deg/s | 0% | 0% | 0.13, 0.10 |
| **26 m / 14 m, cap 25, clamp on the look direction** | **1,624 deg** | **14 deg/s** | **25 deg/s** | **0%** | **0%** | **0.15, 0.10** |

The recommended row spends no time at all above the comfort threshold, and its
peak is exactly its cap. Total rotation falls by 69%. The last two rows are
within 3% of each other on every column, which is the same result as the
elevation sweep above: once the yaw law is right, the height is an image
decision.

Portrait, at the same screen-fraction dead zone of 7.4 degrees:

| Portrait rig | Total rotation | Average | Peak | Above 35 deg/s | Worst dog position |
| --- | --- | --- | --- | --- | --- |
| Shipped | 5,204 deg | 44 deg/s | 373 deg/s | 38% | 0.38, 0.13 |
| **26 m / 18 m, cap 25** | **1,879 deg** | **16 deg/s** | **25 deg/s** | **0%** | **0.37, 0.06** |
| 26 m / 18 m, cap 18 | 1,494 deg | 13 deg/s | 18 deg/s | 0% | 0.50, 0.06 |

Portrait wants the same 25 deg/s cap, not a tighter one. At 18 deg/s the camera
falls behind far enough that the dog drifts halfway to the screen edge, which on
a phone reads as having lost it. At 25 deg/s the dog sits no further off centre
than it already does today while the rotation drops by 64%.

The dog is framed better, not worse, everywhere: the elevated rigs hold it
nearer screen centre than the shipped one does and none of them approaches an
edge.

### Stage 4. Steady the vertical

On the evidence in section 3.6 this is not a polish item. It is the second
largest win in the document and the cheapest to take.

Take the rig height from the ground under the **dog**, smoothed on a long time
constant, instead of the ground under the rig. Better still, world-lock it the
way Classic does and let the ridge clamp be the only terrain term. Keep that
clamp for line of sight. At 14 to 18 m of elevation on a field with 4.67 m of
relief it will effectively never engage, so the heave disappears rather than
being attenuated.

Attenuation is not good enough here. The target is 0.00 m, because the harm is
tied to the frequency rather than the amplitude, and a smaller oscillation at
0.2 Hz is still an oscillation at 0.2 Hz. Classic is the existence proof that
the game plays fine without any of it.

While in here, hold the pitch fixed as well. The 2.5 degrees of pitch wobble
comes from the same source, and an unchanging pitch is what lets the top of the
frame act as a stable horizon reference.

### Stage 5. Fix the control surface, on all three devices

Touch is where the damage is, but the fix touches the gamepad and the keyboard
too, and the guiding rule is spec/06's: one normalised intent shape, consumed
identically everywhere. Two devices should not feel different because their
dead-zone code was written at different times.

#### Shared, in `axis.ts`

**A radial dead zone with rescale, outer saturation, and one response curve.**

```
m = |v|
if m <= dz: zero
scaled = min(1, (m - dz) / (sat - dz))
v *= curve(scaled) / m          where curve(x) = 0.5x + 0.5x^3
```

Radial, never per-axis: an axial dead zone snaps to the compass points, which is
visibly wrong for an animal. The curve applies to **analogue devices only**.
Half travel then commands 0.3125 effort, which lands the existing 30% walk band
at exactly the midpoint of thumb or stick travel. That is a landmark a player can
feel, and it is the reason to pick that curve over any other.

#### Touch

| Constant | Now | Proposed | Physical |
| --- | --- | --- | --- |
| `STICK_RADIUS` | 56 px | **48 px** | 7.7 to 8.6 mm |
| `DEADZONE` | 0.16 | **0.06** | 1.4-1.8 mm down to about 0.49 mm |
| Saturation | none | **0.92** | 44 px |
| Origin | fixed | **re-anchoring** | base trails the thumb |

**The dead zone is the defect.** Effort currently jumps from 0 to 0.16 at the
threshold and the band below is unreachable, so the slow deliberate walk that
makes herding calm cannot be held on a phone at all. Rescaling fixes it. Shrinking
it to 0.06 is the second half: 1.4 mm is a figure inherited from physical
thumbsticks, where a dead zone rejects spring-return error and mechanical slop. A
touchscreen has neither. It only needs to reject finger tremor and panel jitter,
commonly filtered at about 0.5 mm.

**I had the radius backwards.** I first guessed 90 to 110 px, then revised to
"raise it modestly and expose a stick-scale setting". Both were wrong, and the
thing that makes them wrong is **origin re-anchoring**: if the pointer travels
past the radius, move the origin along the pointer direction so the distance is
exactly the radius. The base follows the thumb, so the stick can never saturate
in a way that needs re-seating, and reach stops being a function of the radius at
all. Once reach is solved, a smaller radius is strictly better, because it takes
less travel to saturate at no cost. 48 px matches the Material 48 dp target
module and puts full deflection inside the measured secondary-thumb band in every
grip. It also removes the case for a stick-size setting, and for a handedness
mirror: the zone already accepts touch-down anywhere in the left half at any
height and re-anchors from there.

The resulting travel-to-speed map, which is the thing to check on a device:

| Thumb travel | Run speed | Sprint speed |
| --- | --- | --- |
| 6 px, 1.0 mm | 0.6 m/s | 1.0 m/s |
| 24 px, 4.1 mm | **4.8 m/s** | 8.1 m/s |
| 44 px, 7.5 mm | 14.9 m/s | 24.8 m/s |

**Filter with a 1-euro filter, not a fixed low-pass.** Drag latency is detectable
at 6 to 10 ms and a browser game on a 60 Hz panel has already spent 50 to 80 ms
end to end, so there is no headroom for a fixed window. The 1-euro filter is
speed-adaptive: a 1.2 Hz minimum cutoff gives a 133 ms time constant on a resting
thumb, and a 500 px/s drag raises it to about 26 Hz, a 6 ms constant, under the
detection floor. Beta is the one constant to tune on hardware; start it at 0.05
and raise it only if a slow drag still lags. Add no prediction.

**Feed every coalesced sample through the filter, in order, and write only the
last.** I previously said to read `getCoalescedEvents().at(-1)` and discard the
rest. That is wrong once the filter is adaptive, because the filter's cutoff is a
function of an estimated speed, and the speed estimate needs the intermediate
samples to be accurate. Use `event.timeStamp` for each delta. It costs about two
extra multiplies per frame. `pointerrawupdate` is still the wrong tool: a virtual
stick reads a position, not a path.

**Sprint stays a dedicated button. I was wrong to want it folded into
deflection.** Apple's guidance for handheld games does recommend building sprint
into drag distance, and the underlying point, that effort should be continuous
from the stick, is exactly right and is delivered in full by the rescale above,
for the first time. But pairing *full travel* with *sprint* specifically is bad
here for three reasons. The stamina exhaustion latch needs an unambiguous release
edge and a visible held-and-exhausted state, which a button has and a rim does
not. Every hard turn at full effort would become a sprint, which is the one thing
the turn-authority rule in stage 1 exists to discourage. And it is a shipped
control on a live player base.

For the same reason touch needs no walk modifier: the rescaled, curved stick
already puts the walk band at half travel, so a touch equivalent of hold-to-walk
would duplicate a control that now exists inside the stick.

#### Gamepad

The only device that already had the dead zone right. Two changes.

- `DEADZONE` 0.22 to **0.18**. Published guidance is 0.1 to 0.2 for a physical
  stick and up to 0.25 for a worn one. 0.18 still rejects the 0.1 resting drift
  the existing test pins, with a 1.8x margin, and returns 4% of travel to the
  player. Do not go to the touch value: unlike a touchscreen, a physical stick has
  spring return, wear and recentring error.
- Add **saturation at 0.95**, because a worn stick often cannot reach the gate rim
  in the diagonals, and full effort must not require a perfect corner.

Both existing assertions in `gamepad-input.spec.ts` stay green.

#### Keyboard

Digital input has no analogue magnitude, and the magnitude ramp in stage 1 *is*
the analogue: a key press is a step command at effort 1, and the ramp turns it
into a continuous rise over 0.34 s, so a tap produces a 1.71 m dart and a hold
produces a run. Nothing further is needed and nothing should be added.

One change only: normalise the summed key vector to unit length and scale it by
the effort explicitly, rather than relying on `worldFromAxis` clamping the
root-two diagonal. The observable result is identical today; the point is that the
conditioner in stage 1 needs the effort handed to it rather than recovered from a
clamp. `WALK_EFFORT` stays at 0.3, it is a spec/06 contract, and digital input
bypasses the response curve. Applying the curve to it would silently turn 30%
effort into 13.6%.

#### Warning from the closest analogue

Sky: Children of the Light is a calm, painterly, third-person mobile game from the
same design lineage, and its automatic camera repositioning during ordinary
movement generates recurring motion-sickness complaints and repeated requests for
a camera the game does not move by itself. The complaint is the same one in issue
90, on the same platform, in a game built on the same pillar.

### Stage 6. Let the animation express the new weight

**Say the uncomfortable thing first: none of this will reduce motion sickness.**
Vection is driven by whatever the eye reads as the background, and the dog is a
small foreground object at screen centre. Its gait frequency contributes close
to nothing. I found no study showing that calmer character animation reduces
visually induced sickness, and the mechanism argues against it. The 5,204
degrees of camera yaw and the 1.64 m of terrain heave are the complaint. This
stage is about the game feeling good, which the user asked for separately and
which is worth doing on its own terms.

**Two items in this stage are owned by nobody unless this stage takes them.**
The frame-rate-dependent heading limit in section 3.9 lives in the dog rig, so it
belongs here, and the fix is to express it as a rate in radians per second and
multiply by the frame delta at the call site, keeping a separate fixed ceiling
for the anti-snap behaviour the original comment is protecting. Lowering the
constant while leaving it per-frame does not fix it; it just picks a different
wrong number for 120 Hz hardware. And any normalisation of acceleration for a
pitch or crouch cue has to be derived from the ramp that actually ships, which is
a constant 34 m/s squared up and 45 down, not from a time constant. Deriving it
from a time constant that no longer exists clips the launch cue to full through
the entire ramp, which erases precisely the gradation the cue is there to show.

The good news is that the gait's foundations are already right. Against Maes et
al.'s regressions on five Belgian malinois across 486 sequences, the game's
stride frequency at 15 m/s is 3.08 Hz against a real 2.6 to 3.9 Hz, and the
implied stride length is 4.87 m against a measured 4.94 m. Those match. The
breaks are elsewhere, and each one is in the presentation layer.

- **The dog banks the wrong way, and has since it shipped.** This is the one
  outright defect in the rig, and it is worth stating first because it is free
  to fix. In [dogRig.ts](../app/src/scene/dog/dogRig.ts), the pelvis and chest
  take `motion.roll * 0.35` and `motion.roll * 0.6` on `rotation.z`. The sign of
  `motion.roll` follows the turn, positive when the dog steers toward local
  `+x`. A positive `rotation.z` in three.js tilts the top of a bone toward `-x`;
  I checked it rather than trusting the convention, and an Euler of `(0, 0, 0.5)`
  maps `(0, 1, 0)` to `(-0.479, 0.878, 0)`. So the dog leans **out** of its
  turns, like a motorcyclist falling over. The chest and head are inverted the
  same way on `rotation.y`, at `-0.22` and `-0.4`, so they yaw away from the
  direction of travel too. None of this is visible today only because the whole
  effect is clamped to about 7 degrees, of which the pelvis sees 2.4 and the
  chest 4.1. Fix the sign at the same time as raising the clamp, and rename the
  field so no call site can silently inherit the old convention.
- **Banking is also an order of magnitude too small.** That 7-degree clamp
  corresponds to 0.12 g of lateral acceleration, which is a straight line. Real
  dogs sustain 0.6 to 1.3 g and lean 30 to 55 degrees, with fore-limb lean
  measured at 56.3 degrees at the friction limit. Games routinely exaggerate
  past physical lean; this one is far under it. Drive the bank from
  `atan(lateral acceleration / g)` rather than from a turn-rate multiplier, so
  it stays correct if the movement layer is ever retuned, and gate it off below
  about 4 m/s so a standing pivot does not lean. Roughly 30 degrees is the right
  ceiling, and it is set by the rig rather than by biology: the two-bone solver
  has 0.857 m of fore-limb reach against a 0.851 m rest span, so beyond that the
  inside knee locks straight. Lower the root by about 0.1 m at full bank to buy
  the reach back, which is also what a real animal does.
- **The dog should be visibly yawed into its turns.** The same study measured
  mean body rotation error at minus 15.9 degrees: the trunk over-rotates
  relative to the direction of travel. Add about 16 degrees of yaw lead,
  distributed along the chain with its own time constant per bone so the head
  reaches full lead in 0.09 s and the pelvis in 0.26 s. The differences between
  consecutive bones then *are* the lateral spine bend, so no second bend
  mechanism is needed. Keep the inverse-kinematics paw targets on the path
  rather than on the trunk yaw, and the feet stay on the travel line while the
  body is angled across it, which is the crab-into-the-turn look real dogs have.
  The head should also counter-roll against the trunk by roughly half the bank
  angle, because dogs stabilise gaze. The Last Guardian's team describe the same
  head-then-neck ordering.
- **Stance share is roughly half of life.** `dogStanceShare` falls to about 0.16
  at 15 m/s against a real 0.25 to 0.33 per limb. A 0.30 duty factor on a 4.9 m
  stride means the body travels 1.47 m over a planted foot. A real dog gets that
  from limb sweep, from the scapula translating over the ribcage, and from the
  spine flexing, not from leg length. `DOG_MAX_PAW_REACH = 0.4` supplies about a
  quarter of it. Raise it toward 0.7 m and add trunk length modulation, roughly
  4 to 6% of body length at gait frequency, plus a scapula slide.
- **Acceleration has no visible cost.** Dogs reach a peak forward acceleration
  of 14.3 m/s2 and pay for it visibly: trunk pitch swings from minus 14 degrees
  at hindlimb touchdown to plus 6 degrees at takeoff, knee height drops 38% in
  the crouch, and the forelimbs carry 43% of body weight accelerating against 56
  to 64% galloping. The game's dog reaches 90% of speed in 0.050 s, which is
  about 27 g, roughly nineteen times a real dog, and shows none of it. Drive
  trunk pitch from a low-passed acceleration signal and drop the centre of mass
  10 to 15% on launch and on braking. This is the cheapest large win in the
  stage.
- **Secondary motion carries the life.** A tail as a damped pendulum opposing
  lateral acceleration, and ears and jowls as a single spring lagging the head
  by 80 to 120 ms, with fast attack and slow settle. Stray's team, working
  without any motion capture, treated the tail, ears and whiskers as the
  carriers of life, and it is the cheapest layer here.
- **Fix the frame-rate dependence while in this file.** Section 3.9 has the
  detail: clamp the heading step to the smaller of a rate times `dt` and a fixed
  snap ceiling, so the sustained rate stops doubling on a 120 Hz phone while the
  anti-snap guard survives.
- **Then make the visual heading smoother nearly transparent.** Today it runs at
  a 0.085 s time constant on top of the sim's own 0.125 s heading slew, which is
  a second lag stacked on a first, and it lags in the wrong direction: the
  measurement says the trunk should be ahead of the path, not behind it. Drop it
  toward 0.045 s and let the yaw lead above supply the character instead.

The method to follow is the one both Overgrowth and The Last Guardian describe
independently: procedural motion layered on authored poses, never instead of
them. Overgrowth drives full interactive locomotion from thirteen keyframes with
pose interpolation, physics-driven secondary motion and terrain inverse
kinematics, which is the closest published match to this rig.

One thing the animation cannot fix. At 25 m/s a dog-sized skeleton needs a 7.9
to 9.6 m stride, which has never been observed in any animal of this size. The
84% airborne figure is the honest consequence of moving a dog at 90 km/h. Either
sprint is accepted as stylised, or it becomes a lower-frequency, longer-flight
gallop, or the speed changes, which is question 2 below.

### Stage 7. Make the accessibility setting true

I previously proposed a three-value camera-turning row. That was wrong, and the
guideline reading is what changes it.

**Everything in stages 2 to 4 ships as the default for every player.** It is not
a setting. A setting implies a trade-off, and the measurements show none: the
capped, elevated, world-locked rig rotates 69% less and frames the dog nearer
screen centre than what ships today. Strictly better on both axes is a bug fix.

That leaves the panel one changed row and one new one.

**Row one: fix the Reduce motion toggle that already exists.** Today it changes
bloom and bird lift and touches no camera constant at all. A toggle that a sick
player finds, enables, and discovers did nothing is worse than no toggle, and it
fails Xbox Accessibility Guideline 117 while appearing to pass. When it is set,
Reduce motion should take the camera to the end stop in section 3.10: yaw cap 0,
look-ahead 0, height world-locked, pitch fixed. That is 119 degrees of rotation
across a two-minute run against 5,204 today, with the dog held inside the middle
8% of the screen.

Going to zero is not optional polish. Xbox's Camera Comfort feature tag is
store-facing and explicit that a slider must reach zero or the effect must have
an off switch; a reduced setting does not qualify. Section 3.10 is that zero,
and it lives inside Follow, so nobody has to abandon the camera they like to get
a still one.

Keep the label **Reduce motion**. It is the exact string iOS, macOS, Windows and
`prefers-reduced-motion` use, so a player who has already set it at the system
level recognises it. Carry the specificity in a helper line, because the real
failure is a player finding the toggle and not believing it will help: "Reduce
motion. Steadier camera, softer effects." Do not name motion sickness in the
interface; the guidelines specifically advise talking about comfort rather than
illness, and it suits the Calm pillar anyway.

**Seed it from the operating system on first run.**
[useReducedMotion.ts](../app/src/ui/useReducedMotion.ts) already reads
`prefers-reduced-motion`, and Xbox Accessibility Guideline 112 endorses exactly
this: meet the guidelines by default, and let platform settings decide what to
relax. The player's own choice wins thereafter.

**Guard the media query, or eight test files break at import.** The test
environment is `node`, so there is no `window` and no `matchMedia`. The store
already guards `localStorage` with a `typeof` check for exactly this reason, and
a new unguarded read in the same load path would take down the store tests, the
input remap tests, keyboard focus, customization, graphics recovery, nameplate,
offline result persistence and quality tier. Guard on
`typeof window !== 'undefined' && typeof window.matchMedia === 'function'` and
default to false.

**Row two: Follow camera turning, with three values.** Sickness thresholds vary
by an order of magnitude between people, and this is the one axis worth exposing
because it is the one that was measured.

| Value | Yaw rate cap | Dead zone | Look-ahead | Measured over the run |
| --- | --- | --- | --- | --- |
| Off | 0 | n/a | 0 m | 119 deg total, dog inside 0.08 |
| **Gentle** (default) | 25 deg/s | 20 deg | 4 m | pending, between 1,138 and 1,430 |
| Quick | 40 deg/s | 25 deg | 5 m | pending, measure before it ships |

The Gentle row is honest about what is and is not known. The dead-zone sweep in
section 4 measured 1,430 degrees at 15 degrees of dead zone and 1,138 at 30, and
20 sits between them, but nothing was measured at exactly 20 and the hysteresis
in section 3.11 will move it again. Quoting an interpolated number as a receipt
is the specific failure section 12 is about, so the cell says pending.

**Quick must never be the old rig, and my first draft of this table made it
exactly that.** I had written "uncapped, tau 0.35, dead zone 0, look-ahead 7",
which is bit-for-bit the shipped constants, and justified it on the grounds that
Quick restores the old turning *speed* and not the old feedback loop. That
justification does not survive contact with the measurement: the 5,000-degree
runs in section 3 were driven with world-space input, so the feedback loop was
not involved in producing them. The rig alone is enough. Shipping that as a menu
row would put the thing that made the reporter ill one click away, labelled as a
speed preference, with no comfort language anywhere near it, in the same release
that answers their issue.

Quick is therefore a **faster capped rig, not an uncapped one**. It keeps the
rate ceiling, the dead zone and the approach hold; only the numbers move. The
dead zone rises with the cap because of the pairing result in stage 2, at
roughly the same ratio, which is why it is 25 and not 20. Both numbers are
proposals and neither ships without being measured the same way Gentle was.

Three further points about the shape of that row. The helper line shows one
sentence for the selected value only, so it costs one line and not three.

That sentence was going to quote a duration - *"a quarter turn takes about four
seconds"* at the 25 deg/s cap, about two at 40 - and this paragraph claimed it
was literal. **It was not, and the error is the same class this round keeps
finding: a contract number asserted from one term of a law that has three.** The
quotient is the rate cap alone, with the dead zone and the 1.0 s approach hold
ahead of it ignored. Driven through the shipped rig, a dog at a full run round a
90 degree corner turns the view's bearing 75.0 degrees at Gentle and 71.2 at
Quick rather than 90, because the bearing settles inside the dead zone instead
of closing it, and reaches 95% of that in 4.17 s and 3.60 s. Turning the view a
full quarter needs a 135 degree course change, and takes 3.87 s and 2.72 s. So
the line would have promised a quarter turn that neither value performs on a
quarter-turn corner, and quoted two seconds for something nearer three.

The line ships quoting the rate instead - *turning at up to 25 degrees a
second* - because that is the one number the rig holds exactly: the same runs
measure 25.00 and 40.00 deg/s of bearing at 30, 60 and 144 Hz in both
orientations. A ceiling stated as a ceiling is true at every course change; a
duration is true at one.

The
latched input basis stays on at every value, because it is a correctness fix and
not a preference. And the label says Follow, because the row does nothing in
Classic and four words is cheaper than a sentence explaining that.

**Couple the two rows by clamping, not by writing.** While Reduce motion is on,
the turning select is disabled, shows Off, and prints its reason beside it:
*Reduce motion is holding this at Off.* The player's own choice sits underneath
and returns the moment they switch Reduce motion off. This is the only
arrangement in which no line of copy on screen can become false. A one-shot
write leaves the Reduce motion helper lying as soon as the player raises
turning, and a toggle that silently flips itself is worse than a disabled
control that explains itself.

**At Off, the player still has camera authority, with no new control.** The
bearing arms to the dog's direction of travel when Follow is entered. Pressing
the camera key twice, Follow to Classic to Follow, re-aims it. Every guideline
in section 5 asks for a way to take control of the camera. That is it, and it
costs nothing.

**Cut the field-of-view slider.** The guidelines do ask for one, and I recommended
it earlier in this document, but the arithmetic in section 4 turned against it.
Portrait is already the narrowest horizontal view in the game at 39.5 degrees,
and lowering the vertical lens narrows the horizontal lens with it, so a slider
mostly offers phone players a way to make their own experience worse. It barely
moves landscape. The pass condition that actually matters, the Camera Comfort
tag's requirement that the effect reach zero, is met by the Off value above.

**Cut the centre dot for now.** The supporting evidence is real but head-mounted
only, with no flat-screen replication I could find, and a permanent mark over a
painterly golden-hour field is a visible art cost. Hold it as the first
escalation if reports continue after the yaw fix ships.

**What not to add.** No camera-comfort section header, no reticle size or colour
menu, no camera-sensitivity row, no separate delay and speed numbers, no
vignette, no motion blur. A dynamic vignette is the wrong image for this field
and replicates in only 4 of 10 studies; once yaw is capped there is nothing left
for it to suppress. The shipped precedents agree: expose one intensity axis, not
three timing knobs.

**Do not default new players into Follow.** Adaptation to this kind of motion is
real and builds over sessions. Classic is the calm first impression, and the
first time a player does switch to Follow, one quiet dismissible line beside the
camera toggle is the right amount of signposting. Not a modal before the field;
that would contradict both Calm and Immediate.

### What the movement work touches, file by file

Recorded here because "input layer only" is a claim, and a claim about blast
radius should be checkable without reading the diff.

**New.** `app/src/input/conditioning.ts` holds the speed ramp, the turn
authority rule, the direction rate limit and the basis latch, as pure functions
over one module-scope state object. It imports values from `@sim/tuning` and
runs no sim code, and it pulls in no THREE, no React and no DOM, so it is
unit-testable in node. `app/src/input/oneEuro.ts` is about forty lines.

Two modules rather than one, because `IntentResolver.tsx` has to stay a short
ordered system and the conditioner has to be testable without a browser.

**Changed.** `axis.ts` gains the shared response curve and dead-zone shaper;
`worldFromAxis` is untouched and its magnitude clamp becomes a safety net, so
`tests/input-axis.spec.ts` stays green without edits. `intent.ts` exposes the
existing exhaustion latch as a function so there is one latch in the app rather
than two. `keyboard.ts` normalises and scales explicitly. `gamepad.ts` takes the
two constants. `touch.ts` becomes the only file that knows the dead zone and the
curve, and `TouchControls.tsx` goes back to owning pixels and nothing else.
`IntentResolver.tsx` takes the frame delta, latches the basis in Follow, and
resets the conditioner when the run changes.

**Outside `app/src/input/`.** `spec/06` has to be amended in the same change,
because AGENTS.md says a change to a contract number amends the spec rather than
silently overriding it. That means the new movement constants, the new touch
radius and dead zone, and an explicit statement that the 30% walk contract is
unchanged and that digital input bypasses the analogue curve. Nothing else.

### One thing considered and declined, recorded so it is not re-litigated

There is exactly one artefact that cannot be fixed from the input layer. The sim
hard-clamps velocity to the walk ceiling after its blend, so the instant it stops
granting sprint the dog drops from 25 to 15 m/s in a single tick, about
600 m/s squared.

The input-layer mitigation in stage 1, easing the commanded ceiling down ahead of
the sim's own clamp, takes that to 45 m/s squared, measured, which is 93% of the
jolt removed with no `sim/` change. The residual case is a sprint refused for a
reason the app cannot anticipate.

Fixing the rest properly means rate-limiting `maxSpeed` inside the sim. That
moves all five trace fixtures, diverges the stamina and completion traces early
and chaotically, and makes every published time on the live `field-v3` partition
incomparable rather than merely shifted. **The recommendation is not to do it.**
It is written down so that the decision is on the record rather than implied by
its absence.

## 9. What else this touches

The camera is not a self-contained subsystem in this codebase. Four things read
its transform for something other than drawing, and two existing behaviours are
already defective in ways the new rig makes worse. None of this is speculative;
every line below was checked against the code.

### The audio listener is the camera

[AudioRoot.tsx](../app/src/audio/AudioRoot.tsx) writes `camera.position`,
`getWorldDirection` and the camera's up vector into the WebAudio listener every
frame, and passes `camera.position` into the flock scheduler. So moving the rig
re-mixes the game.

Three specific consequences. The panner model is inverse distance with
`refDistance: 18`, `maxDistance: 180` and `rolloffFactor: 0.7`, and eye-to-dog
distance goes from about 21 m today to 29 m in landscape and 34 m in portrait.
Every diegetic source therefore moves further past the reference distance and
gets quieter, on a rig change that was not about loudness. A camera that never
rotates, which is what Off and Reduce motion select, means the flock never pans,
so the bellwether stops working as a directional cue. And the scheduler picks
which sheep get voices with a term of `1 / (1 + cameraDistanceSq * 0.015)`, so
raising the rig changes *which* sheep you hear, not merely how loudly.

The decision to make is whether the listener should be the camera at all. Placing
it on the dog, or interpolating between the dog and the eye, decouples the mix
from a rig that is about to move twice. Whichever way it goes it needs a receipt
and an amendment to the audio spec, because getting the camera calm and leaving
the mix silently altered is the kind of mismatch that produces a second bug
report from a different player.

### Sheep picking uses fixed screen-space radii

[useSheepPicker.ts](../app/src/scene/useSheepPicker.ts) pins hover acquisition at
0.055, hover retention at 0.110 and touch tap at 0.160 normalised device
coordinates. Those are angular thresholds, so the number of world metres they
cover depends on the field of view and the eye-to-subject distance, and the
proposed rigs change both. Portrait is the worst case, because it is where the
eye moves furthest and where tapping a specific sheep with a thumb is already
hardest. Derive the thresholds from a target world radius at the active profile
rather than leaving them as constants, and pin the result in the nameplate test.

### Gate guidance, and a probe whose premise the new rule removes

`tools/gate-guidance-probe.mjs` enters Follow, holds the back key for 1.6 s, and
asserts that the gate stays off screen after the camera settles. Under the
approach-hold rule in stage 2 that exact manoeuvre now produces **zero** camera
rotation, so the assertion passes without testing anything. Rewrite it against
Classic for the off-screen case. Separately, the guidance cue reprojects at 20 Hz
with an occlusion walk from the eye, and a higher rig sees more of the field, so
the off-screen cue fires less often at the same time as the yaw dead zone stops
the camera turning toward the gate on small corrections. Whether the cue needs
more weight in Gentle and Off is a judgement call, but it should be a deliberate
one.

### The grass density preset is justified by the old camera

[density.ts](../app/src/scene/grass/density.ts) explains its horizontal-only
spread with the reasoning that "a phone looks at this field from the Classic
camera, almost straight down". The new portrait Follow rig is not that. The
comment is load-bearing for a visual decision on the weakest hardware, so either
the reasoning or the preset has to move, and the surround tier ending at 190 m is
worth re-checking against a rig that can sit outside the fence.

### Two shipped defects the new rig amplifies

**Reduce motion makes the camera transition five times faster.**
[CameraRig.tsx:124](../app/src/camera/CameraRig.tsx) reads
`const step = dt / (reducedMotion ? 0.15 : MODE_BLEND_SECONDS)`, and
`MODE_BLEND_SECONDS` is 0.8. So enabling the accessibility setting compresses the
Classic-to-Follow blend from 0.8 s to 0.15 s. With the elevated rigs that is a
22 m camera move in 0.15 s, on the order of 150 m/s, plus a field-of-view change
in portrait over the same interval. The blend uses `lerpVectors` rather than
`approach`, so `MAX_RIG_SPEED` does not apply to it either. **The setting a sick
player reaches for currently makes the one camera event they will trigger
repeatedly far more violent.** Reduce motion should lengthen that blend, to
something like 1.2 s, and the blended result should be speed-capped. This is
independent of everything else in the plan and should ship with the earliest
increment.

**The Studio blend is an uncapped rotation path.** The customize blend runs at
`dt / 0.4` through `easeInOut` between the Follow eye and a fixed studio bearing.
A worst-case 180-degree bearing difference is roughly 450 deg/s mean and 675
deg/s peak, which is about twice the worst peak measured anywhere in ordinary
gameplay, and it happens on both entry and exit. Everything in stage 2 caps the
gameplay camera and leaves this one alone. Either align before blending, the way
Classic does, or lengthen the blend and cap its angular rate.

### Two probes and one test hard-code constants this change moves

`tools/production-herding-probe.mjs` dispatches synthetic touch events by
multiplying the driver's direction by a literal `56`, against a fixed origin.
With the stick radius at 48 and the origin re-anchoring under the thumb, that
probe saturates every command and its origin drifts out of step with the app's,
so it silently measures full-deflection input only and can never exercise the
partial effort that stage 5 exists to add. Export the radius and have the probe
import it. `tests/input-remap.spec.ts` imports `setTouchStick`, which stage 5
replaces, and it is not in any change list.

### Three tests that will break, and one that should

`tests/camera-framing.spec.ts` has a case that sets the dog's **heading** to a
new direction, leaves its velocity at zero, and then asserts where the rig ends
up. Driving yaw from velocity means that case no longer describes anything: the
yaw never engages, so the rig settles tens of metres from the asserted position.
It is a correct test of the old law and it has to be rewritten to drive velocity,
not deleted quietly.

`tests/input-remap.spec.ts` calls `setTouchStick` with normalised values and
asserts they come back unchanged. Stage 5 replaces that entry point with one that
takes pixels, so both cases need rewriting in pixels, and the repo rule against
keeping a compatibility shim means there is no way to avoid it.

The dog rig tests call `advanceDogMotion` and `pose` **positionally**. Any new
parameter added in the middle of either signature silently reassigns the
arguments after it, which turns into a confusing failure rather than an obvious
one. Append new parameters last, with defaults.

And one that should break but currently cannot: nothing asserts that the camera's
rotation stays inside its cap, because the instrumentation does not exist.

### Where the latched basis actually lives

Stage 2 says to latch the camera forward in `IntentResolver.tsx`. Getting that
value there is not free, and the repo's own rules close the two easy routes. The
Follow framing is constructed inside `CameraRig`'s memo, and the resolver is a
sibling component with no reference to it. A per-frame bearing cannot go through
the store, because per-frame React state is forbidden. It cannot go through a
window global or a bridge singleton either.

What remains is a named module-scope mutable, which is the pattern `intent.ts`
already uses and documents as the sanctioned exception. That is the right answer,
but it is an exception, so it needs naming in the spec rather than appearing in a
diff. The alternative, keeping `camera.getWorldDirection()` as the source, is
simpler and is what the code does today, at the cost of reading a transform that
the mode blend, the completion move and the Studio blend all contribute to. Given
that section 9 shows two of those three are themselves uncapped rotation paths,
reading the framing's own bearing is the better target and the extra plumbing is
worth it.

There is also a gap worth naming plainly: **no file under `tools/` measures
camera rotation at all.** Every yaw figure in this document came from a probe
written for the occasion and then deleted. Committing that probe is the first
item in the next section, and until it exists none of these numbers can be
re-checked by anyone but the person who took them.

## 10. Validation

AGENTS.md requires running-build evidence for presentation changes, and this is
a presentation change judged in motion.

The owner-facing procedure for the local pass is `camera-comfort-local-test.md`,
ordered by risk rather than by importance, together with the list of numbers in
this change that are arithmetic or judgement rather than tuned. This section is
the strategy; that file is what to actually do.

1. **A committed comfort test.** Every number in section 3 came from a probe
   that was then deleted. The useful ones should be committed instead, driving
   the real rigs over the scripted herding route and asserting a ceiling on peak
   and mean camera yaw rate, in the style of the existing `MAX_RIG_SPEED`
   assertion. Assert the peak equals the configured cap, not merely that it sits
   under it, because that is the property that caught the defect in section 3.7
   and a looser assertion would have passed. Add the pathological inputs from
   the same section as fixtures: sustained reversal, slow stick rotation, and a
   held circling input. Run the whole thing at 30, 60 and 144 Hz and at a spiky
   frame time, since section 3.9 shows frame-rate dependence is a live failure
   mode in this codebase and not a hypothetical one. This turns "feels better"
   into something CI can hold.
2. **Motion review on the running production build**, desktop and phone, both
   genuine WebGPU and forced WebGL2. Screenshots cannot judge this; the artefact
   is motion.
3. **A physical phone**, not laptop emulation. STATUS.md already notes that
   physical-mobile acceptance does not follow from emulation, and mobile is
   where the user reports the problem is worst.
4. **Independent review by someone susceptible to motion sickness.** Nesky's
   point that the developer is the worst test subject applies fully here. The
   reporter on issue #90 should be offered a build.
5. **Fixture check, as a receipt and then as a standing test.** Stages 1 and 5
   should leave `tests/fixtures/` untouched, so `git diff --stat sim/
   tests/fixtures/` printing nothing is the one-line receipt for the pull
   request. If a trace moves, something reached `sim/` that should not have, and
   the answer is to revert it rather than re-record. Then make the argument into
   a test: `tests/input-isolation.spec.ts` asserting that no file in `sim/`
   imports from the app, and that neither `tests/helpers/traces.ts` nor
   `tests/helpers/herding-driver.ts` imports from `app/src/input/`. The
   conditioner is not in the fixture path today; a guard test is what keeps a
   later refactor from quietly wiring it in.
6. **Pin the conditioner as a pure function**, in `tests/input-conditioning.spec.ts`:
   a fixed sequence of commands, dog velocities and deltas in, an expected
   sequence out. It must include a variable-delta case at 8.3, 16.7 and 33 ms
   asserting that the same wall-clock command produces the same commanded speed
   and direction. That is the frame-rate-independence check the heading limit in
   section 3.9 currently fails, and writing it for the new code is how the new
   code avoids repeating the old bug.
7. **Commit the measurement harness, not just its conclusions.** Every figure in
   sections 3 and 8 came from a probe that was deleted afterwards. A
   `tools/dog-feel-probe.mjs` that drives the real sim tick by tick with and
   without the conditioner, and prints the speed ramps, coast distances, turn
   milestones and heading-rate distributions, makes the numbers reproducible by
   whoever reviews the change instead of asking them to trust a document.
8. **Measure on device what no literature can answer.** Millimetres per CSS
   pixel on the actual target phones, resting-thumb jitter in millimetres in
   both grips, end-to-end touch-to-photon latency on a mid-tier Android and an
   iPhone under both backends, and frame-time variance over a fifteen-minute
   session on a warm device rather than a cold one. The stick radius and dead
   zone in stage 5 should be set from the first two, and a deflection histogram
   from the live build beats all of it: if players never exceed 0.6 deflection,
   the radius is wrong whatever any paper says.
9. **Watch for the two conflicts this rig can create.** Temporal anti-aliasing
   drives `setViewOffset` for its jitter, and the customize panel already uses
   `setViewOffset` for its own offset, so anything new that wants a screen-space
   offset has to compose with both rather than assume it owns the call. And the
   ridge clamp must not be allowed to become a new heave: give its release a
   long time constant so an engaged-then-released clamp cannot put energy back
   into the 0.2 to 0.4 Hz band that section 3.6 is about.
10. **Two receipts that cannot be satisfied by construction**, from section
    3.11: the maximum degrees of yaw in any rolling ten-second window, and the
    band power of the yaw rate between 0.2 and 0.4 Hz. Every other rotation
    metric proposed here can be passed by a rig that is pinned just under its own
    cap for the whole run, which is exactly what weaving produces. Take both
    against a scripted weave as well as the herding route.
11. **Frame time, as a blocking receipt.** The repo already requires performance
    percentiles, and no rotation metric anywhere in this document would notice a
    regression. Frame-rate instability is an independent sickness trigger, phones
    throttle, and the new framing puts *more* of the field in view on the weakest
    hardware. Take p50, p95 and p99 on a real mid-range phone, both backends,
    both orientations, and treat a regression as blocking rather than noted.
12. **Budget the capture matrix before starting it.** Three turning values, two
    orientations, two backends and two device classes is 24 captures before the
    animation manoeuvres and the reduce-motion comparison. Several committed
    baselines move with this change, including the Follow art profiles under both
    backends, so list what is superseded rather than discovering it during
    review.
13. **Name the rollout and the feedback path, including the fact that there is
    no telemetry.** There is none in the repo, the score payload carries no
    settings, and nothing here adds any. So the only feedback channels are the
    issue thread and the support page, and the go or no-go signal is the
    reporter's own verdict on a pre-ship build. Say that explicitly rather than
    leaving it implied. One ordering matters: persisting the player's camera
    choice, so that Follow players land back in Follow, must not ship before the
    rig fix, or it puts more people into the broken camera automatically.
14. Record receipts in STATUS.md, including before and after yaw-rate figures,
    and note that the earlier camera claims recorded there are superseded.

## 11. Open questions for the owner

1. Should *Off* rather than *Gentle* be the default, given the Calm pillar? The
   measurements make this a genuine choice rather than a rhetorical one: Off
   rotates 119 degrees against Gentle's roughly 1,300 and frames the dog better, and its
   only real cost is that the player cannot see around a corner they are turning
   toward. Gentle is recommended because a camera that never reorients is a
   distinctive design decision rather than a safe default, and the player base
   is live. It is still the owner's call.
2. Is the 25 m/s sprint wanted at all once the dog has weight? It is 90 km/h,
   the gait model visibly strains at it, and it crosses 150 m of field in
   7.3 seconds. Lowering it, or scaling dog and sheep speeds together to
   preserve the documented ratios, is a real option for a calmer game. It is
   also a gameplay decision that moves the fixtures and makes existing
   `field-v3` leaderboard times incomparable, which is why nothing above
   depends on it.
3. Should a manual camera nudge exist at all, on either platform? Every
   guideline cited prefers giving the player some authority over the camera.
   Stage 7 proposes the cheapest possible version, re-arming the bearing by
   pressing the camera key twice, which needs no new control and no new
   settings row. A real nudge would need a control surface on a screen that has
   none to spare.
4. Should Classic remain the default camera on first load? It currently is,
   nothing here changes it, and the adaptation evidence argues for keeping it
   that way.
5. Does the skid gate in stage 1 survive contact with real players? The
   acceptance driver cannot answer this, for the reason in section 3.8, and it
   is the only item in the plan whose value rests on judgement rather than
   measurement.

## 12. Draft reply to issue #90

**Not posted.** This is outward-facing and the numbers describe work that has
not shipped, so it needs the owner's approval and should go out only once the
change is actually in. It is written for after the fact, in the past tense,
deliberately.

> Thank you for this, and for the clip, which is what made it possible to
> measure rather than guess. You were right, and the title of your issue turned
> out to be literally accurate: Reduce motion did not touch a single camera
> constant. It changed bloom, dust, bird lift and audio, and left the Follow
> camera exactly as it was.
>
> What we measured, running probes against the real simulation at 60 Hz over a
> scripted two-minute herding run:
>
> - The Follow camera rotated 5,204 degrees in those two minutes, about fourteen
>   full revolutions. It averaged 44 degrees per second, peaked at 373, and
>   spent 38% of the run above 35, which is the upper end of what published work
>   describes as comfortable.
> - Holding a single movement key produced rotation that never stopped: 1,048
>   degrees in three seconds of holding reverse. The camera defined which way
>   the movement keys pointed, and the movement turned the camera, so the loop
>   fed itself.
> - The camera took its height from the ground directly beneath itself, so it
>   rode the terrain through 1.64 m of vertical travel at up to 0.97 m per
>   second, oscillating at 0.1 to 0.2 Hz. That is the frequency band the
>   research identifies as the worst one. The Classic camera is world-locked and
>   measures 0.00 m, which is very likely why nobody reports this in Classic.
>
> One correction, and it is not a criticism of the report. There is no weapon
> sway and no camera bob in Follow; the gait bounce is on the dog, not the
> camera. What the clip shows is yaw. You identified the feeling correctly and
> reasonably guessed at the mechanism.
>
> What changed. The Follow camera now takes its bearing from where the dog is
> travelling rather than where it is facing, turns no faster than 25 degrees per
> second, ignores small course corrections, does not turn at all when the dog
> runs back toward the camera, sits higher and further back, and takes its
> height from a fixed level rather than the ground beneath it. Over the same run
> that measured 5,204 degrees it now measures FINAL_TOTAL, averaging FINAL_AVG
> degrees per second, peaking at exactly its limit, with no time at all above 35.
> The dog is framed nearer the centre of the screen than it was before, not
> further from it. Movement input no longer redefines itself every frame.
>
> Reduce motion now reaches the camera. With it on, the camera does not turn on
> its own at all. It holds one bearing and slides to keep the dog framed, which
> measures 119 degrees of rotation over that same run. There is also a new
> Settings row, Follow camera turning, with Off, Gentle and Quick. Gentle is the
> default and Off is the same still camera that Reduce motion selects.
>
> What we are not claiming: sensitivity varies by a wide margin between people,
> and a figure in degrees per second is not a promise about how you will feel.
> The honest position is that numbers which were far outside the published
> comfort range are now inside it, and that Classic remains available for anyone
> who wants no camera rotation of any kind.
>
> If you are willing, we would like to send you a build before this ships and
> hear whether it holds up for you. You are a better test than we are. Either
> way, thank you for filing it properly.

**The placeholders are deliberate and they are the most important thing on this
page.** Four different after-figures for the same two-minute run appear across
the working notes for this change: 1,430 degrees, 1,574, 1,742 and 2,076. They
are not contradictory measurements so much as measurements of four slightly
different rigs, taken before the dead zone was settled at 20 degrees and before
the movement model existed to be measured against. That is a normal state for
work in progress and an unacceptable one for a public reply to a named person who
took the trouble to file a good report.

So: **one receipt table, regenerated by one committed probe against the law as
finally specified, recorded in STATUS.md, and quoted from there.** Nothing
outward-facing quotes a number from anywhere else. The before-figures are safe,
because they measure code that exists and can be re-run today. The after-figures
do not exist yet.

Two notes on tone, against `spec/06`: no exclamation marks, no emoji, and no
claim that the problem is solved for everyone. The last paragraph is the
important one. Offering the reporter a build is also the fourth item in
section 10, so it is a validation step and not just a courtesy.

## Sources

- Terenzi and Zaal, "Rotational and Translational Velocity and Acceleration
  Thresholds for the Onset of Cybersickness in Virtual Reality", NASA Ames /
  San José State, AIAA SciTech 2020.
  <https://ntrs.nasa.gov/api/citations/20200000787/downloads/20200000787.pdf>
- Nooij et al., "Vection is the main contributor to motion sickness induced by
  visual yaw rotation", PLOS ONE 2017.
  <https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0175305>
- Farmani and Teather, viewpoint snapping study, including the rotation speed
  versus nausea table and the 25 deg/s threshold.
- Hu et al., optokinetic drum study, 15 to 90 deg/s.
  <https://pubmed.ncbi.nlm.nih.gov/2730483/>
- Riccio and Stoffregen, postural instability theory of motion sickness, 1991.
- de Vries, Bos, van Emmerik and Groen, "Internal and external Field of View:
  computer games and cybersickness", VIMS 2007.
- Game Accessibility Guidelines, camera movement and simulation sickness items.
  <https://gameaccessibilityguidelines.com/avoid-vr-simulation-sickness-triggers/>
- Xbox Accessibility Guideline 117, motion sickness.
  <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117>
- Can I Play That, "We need to talk about motion sickness".
  <https://caniplaythat.com/2020/12/08/we-need-to-talk-about-motion-sickness/>
- Oculus Best Practices Guide: accelerations, cameras, motion, simulator
  sickness.
- John Nesky, "50 Game Camera Mistakes", GDC 2014.
  <https://www.youtube.com/watch?v=C7307qRmlMI>
- Giant Squid, "Camera Control in ABZU".
  <https://giantsquidstudios.com/Camera-Control-in-ABZU>
- Sea of Thieves accessibility settings.
  <https://www.seaofthieves.com/accessibility>
- The Last of Us Part II accessibility.
  <https://www.playstation.com/en-us/games/the-last-of-us-part-ii/accessibility/>
- God of War Ragnarök accessibility.
  <https://www.playstation.com/en-us/games/god-of-war-ragnarok/accessibility/>
- Marvel's Spider-Man 2 accessibility.
  <https://support.insomniac.games/hc/en-us/articles/46730041467027>
- Pignole, "Third person camera design with free move zone".
  <https://www.gamedeveloper.com/design/third-person-camera-design-with-free-move-zone>
- Megagon Industries on the Lonely Mountains: Downhill camera.
  <https://80.lv/articles/level-game-production-lonely-mountains-downhill>
- Mark Haigh-Hutchinson, *Real-Time Cameras: A Guide for Game Designers and
  Developers*, Morgan Kaufmann 2009, chapters 4 and 7 on camera orientation,
  rate limiting and deviation gating.
- Eric Martel, "Camera Handling in Third-Person Games", Game AI Pro 3 / Ubisoft,
  on evaluating against the previous view matrix.
- Unity Cinemachine documentation, damping-to-time-constant conversion and the
  dead zone / soft zone screen-fraction model.
  <https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/index.html>
- Unreal Engine `USpringArmComponent`, camera lag speed and lag substepping.
  <https://dev.epicgames.com/documentation/en-us/unreal-engine/using-spring-arm-components-in-unreal-engine>
- Game Programming Gems 4, chapter 1.10, critically damped smoothing with a
  maximum rate (`SmoothDampAngle`).

Oscillation frequency and rest frames:

- Diels and Howarth, "Frequency characteristics of visually induced motion
  sickness", Human Factors 2013, 24 participants over 0.025 to 1.6 Hz.
  <https://journals.sagepub.com/doi/10.1177/0018720812469046>
- O'Hanlon and McCauley, motion sickness incidence as a function of the
  frequency and acceleration of vertical sinusoidal motion, 1974.
  <https://pubmed.ncbi.nlm.nih.gov/4821729/>
- Golding et al., motion sickness maximum around the 0.2 Hz frequency range of
  horizontal translational oscillation.
  <https://pubmed.ncbi.nlm.nih.gov/11277284/>
- Keshavarz et al., "Intra-visual conflict in visually induced motion sickness",
  Frontiers in Virtual Reality 2020, on the earth-fixed horizon line.
  <https://www.frontiersin.org/journals/virtual-reality/articles/10.3389/frvir.2020.582095/full>
- Li et al., attentional cueing and motion sickness, 2023.
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC10020407/>
- Systematic review of cybersickness mitigations across 99 papers, Frontiers in
  Virtual Reality 2023, for the replication rates quoted in stage 7.
  <https://www.frontiersin.org/articles/10.3389/frvir.2023.1027552/full>

Dog locomotion:

- Maes et al., "Steady locomotion in dogs: temporal and associated spatial
  coordination patterns", J. Exp. Biol. 211:138, 2008. Five Belgian malinois,
  486 sequences, 0.4 to 10.0 m/s.
  <https://journals.biologists.com/jeb/article/211/1/138/17472>
- Hudson et al., high-speed galloping in the greyhound and the cheetah,
  J. Exp. Biol. 215:2425, 2012.
  <https://journals.biologists.com/jeb/article/215/14/2425/10852>
- Wynn et al., turning performance in dogs, J. Exp. Biol. 225:jeb244435, 2022.
  Median turn radius 3.63 m, limb lean 56.3 degrees, body rotation error
  minus 15.9 degrees.
  <https://journals.biologists.com/jeb/article/225/21/jeb244435/281742>
- Williams et al., "Rapid acceleration in dogs", J. Exp. Biol. 212:1930, 2009.
  <https://journals.biologists.com/jeb/article/212/12/1930/34725>

Controller feel and animation technique:

- Swink, *Game Feel*, and Pichlmair and Johansen's peer-reviewed survey of game
  feel, which frames responsiveness against simulated physicality.
  <https://arxiv.org/abs/2011.09201>
- Celeste, `Player.cs`, for the published acceleration and reversal constants.
  <https://github.com/NoelFB/Celeste/blob/master/Source/Player/Player.cs>
- Super Mario 64, `mario_actions_moving.c`, for the three separate accelerate,
  coast and skid constants and the turnaround threshold.
  <https://github.com/n64decomp/sm64/blob/master/src/game/mario_actions_moving.c>
- Kleanthous, "Rockstar's quest for the ultimate video game horse", GDC 2021.
  <https://www.gamedeveloper.com/design/rockstar-s-quest-for-the-ultimate-video-game-horse>
- Tanaka on The Last Guardian's procedural animation, CEDEC 2017.
  <https://www.gameanim.com/2018/01/24/last-guardian-procedural-animation/>
- Rosen, "An indie approach to procedural animation" (Overgrowth), GDC 2014.
  <https://www.gdcvault.com/play/1020583/Animation-Bootcamp-An-Indie-Approach>

Touch input:

- Sutphin, "Doing thumbstick dead zones right".
  <https://www.gamedeveloper.com/business/doing-thumbstick-dead-zones-right>
- Casiez, Roussel and Vogel, the 1-euro filter, CHI 2012, with the reference
  implementation and tuning procedure. <https://gery.casiez.net/1euro/>
- Ng et al., "Designing for low-latency direct-touch input", UIST 2012.
  <https://dl.acm.org/doi/pdf/10.1145/2380116.2380174>
- MDN on `pointerrawupdate`, on why it buys nothing for a virtual stick.
  <https://developer.mozilla.org/en-US/docs/Web/API/Element/pointerrawupdate_event>
- Game Accessibility Guidelines on touch target size, for the 9.6 mm phone
  minimum and the 24 mm ideal.
  <https://gameaccessibilityguidelines.com/ensure-interactive-elements-virtual-controls-are-large-and-well-spaced-particularly-on-small-or-touch-screens/>

Platform requirements and defaults:

- Xbox Accessibility Guideline 112, meeting the guidelines by default and
  relaxing from platform settings.
  <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/112>
- Xbox accessibility feature tags, for the Camera Comfort pass condition that an
  effect must reach zero.
  <https://learn.microsoft.com/en-us/xbox/accessibility/accessibility-feature-tags>
- WCAG 2.3.3, Animation from Interactions.
  <https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html>
- Sea of Thieves settings, for the Auto Centre defaults.
  <https://seaofthieves.wiki.gg/wiki/Settings>
- Driscoll, frame-rate-independent damping using lerp.
  <https://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/>


## The gate, and why sheep banked off the cheeks

Playtesting this branch surfaced a defect that is not a camera or control
problem at all, and it is recorded here because the diagnosis generalises.

Sheep arriving at the gate slightly wide of centre peeled off the cheek instead
of funnelling in with the flock. The cause is that the gate in v3 is purely
PERMISSIVE. `step.ts` suppresses the fence force for a sheep standing inside the
passage slot, and `boundary.ts` widens that carve-out to `width / 2 + 2` in X.
Inside that window there is no force either way; one metre outside it there is
full fence force at the 1.5 multiplier, directed ALONG the fence. Nothing in the
simulation ever pointed a sheep AT the opening, so a sheep that arrived wide was
not funnelled, it was deflected.

sds solved this and v3's clean-room rewrite dropped it. The original is in
`js/OptimizedSheep.js` before the v3 replacement commit, and its shape is worth
stating exactly, because the obvious implementation is worse than the one sds
actually shipped:

```
dog within fleeRadius * 1.5   AND   gate within 30 m   AND   dot(toGate, toDog) < 0
    -> applyForce(seek(gate) * 0.5)
```

The obvious implementation is a proximity attractor: get near the gate, get
pulled in. That reads as an autopilot and it rewards nothing. The dot product is
what makes sds's version a mechanic instead. It is negative exactly when the dog
lies on the far side of the sheep from the gate - that is, when the player has
already done the flanking work that should make the sheep go in. Press from the
correct side and the flock funnels. Press from the wrong side and the attraction
does not exist. It pays out for a flank the player had to perform, rather than
substituting for one.

This is also the answer to the reasonable worry that 30 m is too generous a
radius. The radius is not what keeps it honest; the arming condition is. A 30 m
radius with no dog nearby, or with the dog on the wrong side, does nothing at
all.

The restored constants are sds's own, in `sim/tuning.ts`. The cost is one trace
fixture: `completion-run` moves from 14112 ticks to 3260, while the other four
re-record byte-identical, which is the evidence that the force is genuinely
inert away from the gate under pressure. That fixture was re-recorded as an
accepted gameplay change under AGENTS.md tripwire 9, on an owner playtest, and
not to make a test pass. The caveat belongs next to the number: it is one seed
driven by one scripted dog, so it indicates direction rather than balance, and
some part of that 14112 is likely the bank-off loop itself rather than the game
having been harder.
