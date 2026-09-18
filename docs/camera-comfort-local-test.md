<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (c) 2026 Matthew Kissinger -->

# Local test plan: camera and movement comfort

The reasoning and the measurements are in `camera-and-movement-comfort.md`. This
file is only the procedure: what to run, what to look at, in what order, and
what would count as a problem. Nothing here has been committed, pushed or
deployed, and nothing has been posted to issue #90.

The ordering is by risk, not by importance. The first three sections are the
ones most likely to be wrong, because they are where a machine cannot reach a
verdict. Everything a machine could settle has been settled and is listed in
section 7 so you do not spend attention on it.

## 0. Start it

Test the production build, not the dev server: this is a presentation change and
the dev server does not build the same bundle.

```bash
npm run build && npm run preview
```

That serves on `http://localhost:4173`. It is already verified to boot to the
title screen with no console errors on this machine, so if it does not, that is
itself the finding.

The dev server (`npm run dev`, port 5173) is faster to iterate on if you want to
change a number and feel the difference, and both are in `.claude/launch.json`
so the Browser pane can start either by name. That file is untracked tooling
rather than part of the change.

## 1. The question the whole change exists to answer

Play a full 25-sheep run in the **Follow** camera, at the default settings
(Reduce motion off, Follow camera turning on Gentle). Play it the way a player
would, not the way someone testing a camera would: chase a breakaway, reverse
hard, circle the flock, drive them to the gate.

The reporter's complaint was that rapid turning spins the camera. So the only
question that matters here is whether that still happens, and the honest way to
ask it is to try to provoke it rather than to avoid it:

- Whip the stick or the keys back and forth as fast as you can while running.
- Run a tight circle around a single sheep for ten seconds.
- Reverse direction at full sprint, repeatedly.
- Run straight at the camera, then straight away from it.

What should happen: the camera's bearing lags behind the dog and never exceeds
25 degrees a second, so a fast course change is absorbed rather than followed.
Small course corrections should not move the camera at all - there is a 20
degree dead zone, and that is deliberate. The horizon should stay level at all
times and the view should never tip toward straight down.

What would be a finding: any moment the world appears to roll or swing about the
view, any snap or jump, any sense that the camera is chasing you rather than
following, or simply that it still makes you feel unwell. The last one is the
one that matters most and no test in the suite can produce it.

**Compare against the deployed game** at sheepdogsim.com in another tab, on the
same run. The change is meant to be a large improvement on a specific axis, and
if it is not obviously better back to back then the judgement behind it is wrong
somewhere, whatever the measurements say.

## 2. Whether it is still a good game to play

This is the risk that the comfort work created rather than the one it fixed, and
it is easier to miss because nothing about it looks broken.

The dog no longer accelerates instantly. Commanded speed ramps at 34 m/s² up and
45 down from a 3.5 m/s launch, the commanded direction turns under a lateral
acceleration limit, and turn authority falls off when you ask for a course
change far off the dog's momentum. The intent is weight; the risk is sludge.

- Does the dog feel responsive, or does it feel like it is on ice or in treacle?
- Does a quick tap of a direction still do something immediate?
- Can you still place the dog precisely where a sheep needs pressure, or does
  the ramp make fine positioning fight you?
- Does sprinting still feel like a gear change?
- The sprint release used to pop. It should now ease. Run to exhaustion and let
  the stamina run out: the drop to walking speed should be smooth, and the
  0.22 s of stamina that costs should not be noticeable as a loss of control.

The game's feel was described as already decent, so the bar is not "acceptable",
it is "as good or better". If any of this is worse, say so plainly - the ramps
are the most tunable thing in the change and nothing depends on the exact
numbers.

## 3. Mobile, on a real phone

Not the desktop responsive view. Section 4 of the plan document argues mobile is
where the problem is worst, and mobile is the one platform none of the automated
evidence covers: every existing capture is desktop Chromium with touch
emulation.

Serve the build on your network and open it on the phone:

```bash
npm run build && npm run preview -- --host
```

- Portrait and landscape, and rotate mid-run. The framing changes between them
  (26 m back / 14 m up in landscape, 32.5 / 17.5 in portrait). The rotation
  should ease rather than cut.
- The touch stick: 48 px radius, 0.06 dead zone, with the origin re-anchored
  under your thumb if you drag past the rim. Does it track your thumb? Does it
  feel dead near centre, or twitchy?
- Whether the comfort improvement survives the smaller screen and the shorter
  viewing distance, which is where vection is strongest.
- Frame rate. The conditioning layer and the one euro filter are new per-frame
  work on the input path.

## 4. The settings, which are the accessibility surface

Open Settings on the title screen.

- **Follow camera turning** should read Off / Gentle / Quick, default Gentle,
  with a helper line quoting a rate: *turning at up to 25 degrees a second*.
  Try all three in a run. Off is a fixed bearing that arms when Follow is
  entered; it should still be playable, and you should still be able to re-aim
  it by pressing the camera key twice.
- **Reduce motion** should say *Steadier camera, softer effects.* and add
  *Following your system setting.* until you choose for yourself. Turn it on:
  the turning row should disable itself, show Off, and explain why rather than
  overwriting your stored choice. Turn Reduce motion back off and your own value
  should return.
- With Reduce motion on, everything should be slower and calmer, never faster.
  This had a real defect in it this round and the fix is worth confirming by
  hand: **finish a run with Reduce motion on, then press restart.** The camera
  used to freeze for the whole results screen and then lurch. It should now keep
  tracking the dog through the results screen and return without a step.

## 5. The transitions, which is where the defects were

Every blocker found this round was a transition rather than a steady state, so
these are worth doing deliberately even though a player would hit them by
accident.

- Swap Classic and Follow with the camera key, repeatedly, and swap again
  mid-swap. It should turn around, not jump.
- Swap while running, while stationary, and while running straight down-field
  away from the camera. Down-field is the case where the two framings are
  half a turn apart and it is the one that used to flip the horizon.
- Open and close Customize, including opening it in the middle of a camera swap.
  Change tabs and presets, and drag the orbit. **Two-finger drag on touch** - a
  second finger used to swing the orbit violently.
- Finish a run, then restart. Then finish a run and return to the title instead.
- Change flock size, which replaces the simulation under the camera.
- Background the tab mid-run for thirty seconds and come back.

In none of these should the horizon roll, the view tip toward vertical, or the
picture jump.

## 6. What to send back

For anything that feels wrong, what settings you were on, which camera, what you
were doing, and phone or desktop. "It still turns too much on Quick" is
actionable. So is "Gentle is too slow to see where I am going", which is the
opposite finding and equally likely.

If it is good, the remaining work is the AGENTS.md gate: WebGPU and WebGL2
receipts on desktop and mobile, and offering the reporter on issue #90 a build.
The draft reply for that thread is section 12 of the plan document and has two
placeholders in it that need the final measured numbers.

## 7. What is already settled, so you can skip it

These are machine-checked and do not need your attention:

- `tsc --noEmit` clean; `eslint .` clean; production build succeeds.
- 844 of 845 tests pass. The one failure is `tests/audio-manifest.spec.ts` and
  it is pre-existing - see the caveat below.
- The simulation is untouched: `git diff --stat sim/ tests/fixtures/` prints
  nothing and neither tree has an untracked file. No committed trace moved.
- The composed view, measured over 4,014 configurations per turning profile -
  21 scenarios crossed with three profiles, 30/60/144 Hz, and frames past the
  delta cap - peaks at exactly 90.000 deg/s with Reduce motion off and 60.000
  with it on, comes no nearer than 45.0 degrees to either pole, and holds its
  roll at 2.78e-16 rad. No input found rolls the horizon or turns the view
  faster than the one budget that governs it.
- Nothing turns the view faster with Reduce motion on than off.

The one red test is the missing licensed audio, which predates this work, is
unrelated to it, and which you have already reviewed and set aside. It is also
why `npm run probe:release` reports nothing: it stops on the same missing file
before it measures anything, so there is no renderer receipt or frame-time
percentile in this candidate. STATUS.md carries the detail. Nothing about it is
a question for this pass.

## 8. Numbers that are arithmetic or judgement, not motion

Listed so nothing in this change is presented as tuned when it was reasoned. Any
of them may be wrong in a way only playing can reveal, and section 1 and 2 above
are how you would find out.

| Number | Value | What it rests on |
| --- | --- | --- |
| Composed view rotation budget | 90 deg/s | Chosen. Sits above the 25 deg/s gameplay rig and below what a panel entry used to allow. Its own docblock says it is pending a motion review. |
| Follow turning rates | 25 and 40 deg/s | Gentle fitted against scripted routes and closed-form rotation totals. Quick is a proposal scaled from it. |
| Turning dead zones | 20 and 25 degrees | Paired to the rates at roughly a fixed ratio, by argument rather than measurement. |
| Default turning value | Gentle | Judgement. Off measures 119 degrees of total rotation over a two-minute run against 5,204 on the rig it replaces, and frames the dog better. |
| Conditioner ramps | 34 / 45 m/s², 3.5 m/s launch | Fitted against scripted routes, not against a player. |
| Lateral acceleration limit | 28 m/s² | Same. |
| Turn authority window | 45 to 135 degrees | Same. |
| Touch stick radius | 48 px | Derived from panel pixel pitch. No thumb has been measured against it. |
| Touch dead zone | 0.06 | About 0.49 mm of travel, against a general figure for finger tremor. |
| Completion nadir bound | 45 degrees | A degeneracy limit, derived. The framing it produces is not. |

The scripted acceptance driver cannot substitute for section 1 or 2, and the
reason is recorded in STATUS.md: it regulates speed by cutting the stick back to
centre, so it switches the stick on and off about four times a second rather
than holding a deflection, and no ramp or filter in the input path reaches a
steady state under that. Nothing in that receipt is a verdict on the controls.
