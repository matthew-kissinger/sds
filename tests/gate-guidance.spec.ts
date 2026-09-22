// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// The gate cue, swept through whole turns rather than sampled at corners.
//
// The mapping this replaced placed the cue from the gate's PROJECTED point on
// the perimeter of an inset rectangle, and a corner-sampling spec was exactly
// why its three defects survived: every one of them only shows up when you
// walk a bearing continuously.
//
//   1. It did not move. Over a full turn on a 390x844 phone, 29 of the 31
//      bearings at which the cue was shown put it on one of two x values.
//   2. It teleported. At the gate directly behind the camera the projected
//      point crosses the camera axis, the code fell back to a hard `dx = 1`,
//      and the cue jumped 245 px for one degree of turn.
//   3. It was furniture. A 76 degree vertical lens on a 0.46 aspect is only
//      +/-20 degrees across, so the gate is off screen for 85% of a turn.
//
// The replacement then had a fourth, found by an owner looking at the screen
// rather than at a sweep: it placed the cue from the GROUND bearing, which is
// not the angle the opening subtends on screen. A rig that looks down
// foreshortens the forward axis in the image and leaves the sideways one
// alone, so the needle pointed up to 39.7 degrees away from the opening, and
// 180 degrees away inside five metres of the gate. `the needle and the
// opening` below is the spec for that, and it is written against the
// PROJECTION rather than against any pitch, so no camera mode is special.
//
// So the sweeps here are the spec. Anything that reintroduces a discontinuity
// or a pinned rail fails, whatever the value at any single bearing.

import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3, Vector4 } from 'three/webgpu';
import { aimAtGate, gateScreenAngle, type GateAim } from '@app/ui/gateProjection';
import { buildGateOpeningGeometry } from '@app/scene/gateOpeningGeometry';
import { cameraViewProfile } from '@app/camera/viewProfile';

const VIEWPORTS: ReadonlyArray<readonly [number, number, string]> = [
  [390, 844, 'phone portrait'],
  [844, 390, 'phone landscape'],
  [568, 320, 'small phone landscape'],
  [768, 1024, 'tablet portrait'],
  [1440, 900, 'desktop'],
  [2560, 1440, 'wide desktop'],
];

/** The 44 px token, centred on the cue. */
const HALF = 22;

/**
 * Everything already nailed to the field, read straight off UiStyles: s5 is
 * 20 px and target is 45 px. The cue is the only thing on the HUD that moves,
 * so it is the only thing that can collide, and it has to clear all of this at
 * every bearing rather than at the four it is easy to check.
 */
function furniture(
  width: number, height: number,
): ReadonlyArray<readonly [string, number, number, number, number]> {
  const items: Array<readonly [string, number, number, number, number]> = [
    ['the sheep counter', 20, 20, 94, 94],
    ['the clock', 20, 100, 102, 118],
    ['the stamina bar', width / 2 - 78, 20, width / 2 + 78, 46],
    ['Pause', width - 65, 20, width - 20, 65],
  ];
  if (width < 600 || height < 500) {
    items.push(
      ['the stick', 28, height - 132, 124, height - 36],
      ['Bark', width - 120, height - 128, width - 28, height - 36],
      ['Sprint', width - 202, height - 116, width - 126, height - 40],
      ['Camera', width - 108, height - 214, width - 36, height - 142],
    );
  } else {
    items.push(['the keyboard reminder', 20, height - 78, 320, height - 20]);
  }
  return items;
}

/** The mapping on its own, at a bearing chosen rather than measured. */
function aimAt(bearing: number, width: number, height: number): GateAim {
  // A clip behind the lens, so visibility never colours the placement test.
  return aimAtGate({ x: 0, y: 0, w: -1 }, bearing, width, height, 60);
}

/**
 * The shipped follow rig with the dog standing `distance` from the gate and
 * turning on the spot. The heading is the sweep variable; the bearing is then
 * MEASURED off the camera exactly as the game measures it, because the rig
 * sets the camera back along the heading and the two are not the same angle.
 */
function shotFromRig(
  heading: number, width: number, height: number, distance = 60, obscured = false,
): { aim: GateAim; px: number; py: number } {
  const view = cameraViewProfile(width / height);
  const camera = new PerspectiveCamera(view.fov, width / height, 0.1, 2000);
  const fx = Math.sin(heading), fz = -Math.cos(heading);
  // Gate at the origin; at heading zero the dog is looking straight at it.
  const dog = new Vector3(0, 0, distance);
  camera.position.set(
    dog.x - fx * view.follow.distance, view.follow.height, dog.z - fz * view.follow.distance,
  );
  camera.lookAt(dog.x + fx * view.follow.lookAhead, 1.6, dog.z + fz * view.follow.lookAhead);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const clip = new Vector4(0, 1.2, 0, 1)
    .applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  const forward = camera.getWorldDirection(new Vector3());
  const measured = gateScreenAngle(
    forward.x, forward.y, forward.z,
    -camera.position.x, 1.2 - camera.position.y, -camera.position.z,
  );
  return {
    aim: aimAtGate(clip, measured, width, height, distance, obscured),
    px: width / 2 + (clip.x / clip.w) * (width / 2),
    py: height / 2 - (clip.y / clip.w) * (height / 2),
  };
}

function aimFromRig(
  heading: number, width: number, height: number, distance = 60, obscured = false,
): GateAim {
  return shotFromRig(heading, width, height, distance, obscured).aim;
}

/** Every 1 degree of a full turn, so no discontinuity can hide between samples. */
function sweep(width: number, height: number, distance = 60): GateAim[] {
  return Array.from({ length: 361 }, (_, i) => aimFromRig(
    ((i % 360) * Math.PI) / 180, width, height, distance,
  ));
}

/** Signed turn from a to b, taking the short way round. */
function delta(a: number, b: number): number {
  let step = b - a;
  while (step > Math.PI) step -= 2 * Math.PI;
  while (step < -Math.PI) step += 2 * Math.PI;
  return step;
}

describe('which way the gate is', () => {
  it('reads ahead as up, right as right, behind as down and left as left', () => {
    const half = Math.PI / 2;
    // A level camera down -z: the screen basis is world right and world up,
    // so the four readings are the four they have to be by inspection.
    expect(gateScreenAngle(0, 0, -1, 0, 1, -100)).toBeCloseTo(0);
    expect(gateScreenAngle(0, 0, -1, 100, 0, 0)).toBeCloseTo(half);
    expect(Math.abs(gateScreenAngle(0, 0, -1, 0, -1, 100))).toBeCloseTo(Math.PI);
    expect(gateScreenAngle(0, 0, -1, -100, 0, 0)).toBeCloseTo(-half);
    // And the same four read off a camera that is not axis-aligned.
    expect(gateScreenAngle(1, 0, 0, 0, 1, 0)).toBeCloseTo(0);
    expect(gateScreenAngle(1, 0, 0, 0, 0, -100)).toBeCloseTo(-half);
  });

  it('reads an opening the camera has overflown as below, not ahead', () => {
    // Pitched down 30 degrees, opening 10 m out on the ground 12 m below: the
    // camera axis has already passed over it, so it is under frame centre.
    const down = -Math.sin(Math.PI / 6), ahead = -Math.cos(Math.PI / 6);
    expect(Math.abs(gateScreenAngle(0, down, ahead, 0, -12, -10)))
      .toBeGreaterThan(Math.PI / 2);
    // The same opening a hundred metres out is still above it.
    expect(Math.abs(gateScreenAngle(0, down, ahead, 0, -12, -100)))
      .toBeLessThan(Math.PI / 2);
  });

  it('survives a camera sitting exactly on the gate', () => {
    expect(Number.isFinite(gateScreenAngle(0, 0, 0, 0, 0, 0))).toBe(true);
    // And a camera pointed straight down, where the ground basis vanishes.
    expect(Number.isFinite(gateScreenAngle(0, -1, 0, 3, -4, 5))).toBe(true);
  });

  it('puts the token up, right, down and left for those four bearings', () => {
    const [up, right, down, left] = [0, 0.5, 1, 1.5]
      .map((turn) => aimAt(turn * Math.PI, 390, 844));
    expect(up!.y).toBeLessThan(down!.y - 400);
    expect(Math.abs(up!.x - down!.x)).toBeLessThan(1);
    expect(right!.x).toBeGreaterThan(left!.x + 300);
    expect(Math.abs(right!.y - left!.y)).toBeLessThan(1);
  });
});

/**
 * One shot with the camera's PITCH as a free variable, because the pitch is
 * precisely what the law must not contain. Follow looks down 22.5 degrees and
 * Classic 44.9; sweeping both and the ground between them says more than
 * either rig on its own would, and it is what lets the two modes share a line.
 */
function shotAtPitch(
  pitchDeg: number, yawDeg: number, width: number, height: number,
  distance: number, fov = 45,
) {
  const camera = new PerspectiveCamera(fov, width / height, 0.1, 2000);
  const pitch = (pitchDeg * Math.PI) / 180, yaw = (yawDeg * Math.PI) / 180;
  // Camera 14 m up looking down `pitch` along `yaw`; opening on the ground
  // `distance` away up world +z, which is where HOME_FIELD puts it.
  camera.position.set(0, 14, 0);
  camera.lookAt(Math.sin(yaw) * 100, 14 - Math.tan(pitch) * 100, Math.cos(yaw) * 100);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const clip = new Vector4(0, 1.2, distance, 1)
    .applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  const f = camera.getWorldDirection(new Vector3());
  const flat = Math.hypot(f.x, f.z) || 1;
  const ax = f.x / flat, az = f.z / flat;
  return {
    needle: gateScreenAngle(f.x, f.y, f.z, 0, 1.2 - 14, distance),
    /** What the pixels say: frame centre to the projected point. */
    projected: Math.atan2(
      (clip.x / clip.w) * (width / 2), (clip.y / clip.w) * (height / 2),
    ),
    /** What the GROUND bearing said, which is the defect described here. */
    ground: Math.atan2(-az * 0 + ax * distance, az * distance),
    front: clip.w > 0,
  };
}

/** Degrees between two angles, the short way round. */
function apart(a: number, b: number): number {
  return Math.abs((delta(a, b) * 180) / Math.PI);
}

describe('the needle and the opening', () => {
  /*
   * The whole of the fourth defect, and the only test that looks at the
   * PROJECTION rather than at a bearing. A cue that points somewhere the
   * opening is not is worse than no cue: it is a wrong answer delivered
   * confidently, and an owner spotted it from one screenshot.
   */
  it('points where the opening actually projects, at every pitch a rig can take', () => {
    let worstNeedle = 0, worstGround = { off: 0, pitch: 0, yaw: 0 }, poses = 0;
    for (const [width, height] of VIEWPORTS) {
      for (let pitchDeg = 8; pitchDeg <= 60; pitchDeg += 2) {
        for (let yawDeg = -75; yawDeg <= 75; yawDeg += 3) {
          for (const metres of [12, 25, 45, 80, 140, 210]) {
            const shot = shotAtPitch(pitchDeg, yawDeg, width, height, metres);
            if (!shot.front) continue;
            poses++;
            worstNeedle = Math.max(worstNeedle, apart(shot.needle, shot.projected));
            const off = apart(shot.ground, shot.projected);
            if (off > worstGround.off) {
              worstGround = { off, pitch: pitchDeg, yaw: yawDeg };
            }
          }
        }
      }
    }
    expect(poses).toBeGreaterThan(20000);
    // Exact, not close: the two half-axis scalings differ by the aspect and
    // the projection divides the same aspect back out, so it cancels.
    expect(worstNeedle, `needle off by ${worstNeedle.toFixed(4)} deg`)
      .toBeLessThan(0.001);
    // And the reading it replaced, kept here so the defect cannot come back
    // quietly: a ground bearing written straight to a screen angle. It runs to
    // about 40 degrees at ordinary pitches and to a full reversal once the
    // camera axis has passed over the opening, so this is not a refinement.
    expect(
      worstGround.off,
      `a ground bearing misses by ${worstGround.off.toFixed(1)} deg`
      + ` at pitch ${worstGround.pitch}, yaw ${worstGround.yaw}`,
    ).toBeGreaterThan(90);
  });

  it('turns the same way the opening travels, never against it', () => {
    // Ten degrees of turn walks the opening 26.7 degrees round a landscape
    // frame. The needle has to go with it, at the same rate and the same sign.
    for (const [width, height, name] of VIEWPORTS) {
      let previous: ReturnType<typeof shotAtPitch> | null = null;
      for (let yawDeg = -70; yawDeg <= 70; yawDeg += 1) {
        const shot = shotAtPitch(22.5, yawDeg, width, height, 60);
        if (shot.front && previous?.front) {
          const needle = delta(previous.needle, shot.needle);
          const seen = delta(previous.projected, shot.projected);
          expect(Math.sign(needle), `${name}: needle went the wrong way at ${yawDeg}`)
            .toBe(Math.sign(seen));
        }
        previous = shot;
      }
    }
  });

  /*
   * A token that rides a perimeter at the target's angle overshoots a target
   * INSIDE that perimeter: the needle stays exact, but the token has gone past
   * the opening on its way out to the ellipse, so sighting along the needle
   * from the dial misses. Before the reach was clamped that read as wrong in
   * 32,734 of 391,539 bright on-screen poses across these six viewports, worst
   * on the wide ones, whose ellipse is inset only 30 px and so runs nearly to
   * the frame edge. It is the same complaint as the ground bearing wearing a
   * different hat, and it is worth a test of its own because the needle can be
   * exact while the instrument still reads wrong.
   */
  it('does not overshoot an opening that is inside the ring', () => {
    for (const [width, height, name] of VIEWPORTS) {
      for (const metres of [8, 16, 32, 64, 128, 200]) {
        for (let i = 0; i < 360; i++) {
          const shot = shotFromRig((i * Math.PI) / 180, width, height, metres);
          // Only where a player could read one against the other.
          if (!shot.aim.onScreen || shot.aim.presence <= 0.5) continue;
          const gap = Math.hypot(shot.px - shot.aim.x, shot.py - shot.aim.y);
          const sighted = Math.atan2(shot.px - shot.aim.x, -(shot.py - shot.aim.y));
          if (apart(shot.aim.angle, sighted) < 45) continue;
          /*
           * Either the needle points at the opening or the dial is sitting on
           * it, and there is no third case. The clamp matches the token's
           * RADIUS from the ring's centre rather than its ray, and the ring's
           * centre is off the frame's by up to 48 px where the HUD insets are
           * asymmetric, so a little residual is left by construction: measured
           * at 58.3 px upright, 42.2 landscape and 22.5 on a wide desktop, all
           * inside the 44 px token plus that offset. At those separations the
           * dial and the opening are one thing on the screen.
           */
          expect(
            gap,
            `${name} at ${metres} m, heading ${i}: the needle misses the`
            + ` opening and the dial is ${gap.toFixed(0)} px away from it`,
          ).toBeLessThan(60);
        }
      }
    }
  });

  it('keeps the clamped token inside its budget at every range', () => {
    // The shipped no-jump test sweeps one distance. The clamp is the only
    // thing that can move the token for a reason other than turning, so it
    // gets the same budget asked across the range a run actually covers.
    for (const [width, height, name] of VIEWPORTS) {
      const budget = Math.hypot(width, height) * 0.05;
      for (const metres of [8, 16, 32, 64, 128, 200]) {
        let previous: GateAim | null = null;
        for (let i = 0; i <= 1440; i++) {
          const aim = aimFromRig((i * Math.PI) / 720, width, height, metres);
          if (previous && (aim.presence > 0.02 || previous.presence > 0.02)) {
            const step = Math.hypot(aim.x - previous.x, aim.y - previous.y) / 0.25;
            expect(step, `${name} at ${metres} m: the token moved`
              + ` ${step.toFixed(1)} px for a degree of turn`).toBeLessThan(budget);
          }
          previous = aim;
        }
      }
    }
  });

  it('stays calm everywhere the token can be seen', () => {
    /*
     * The needle is undefined with the opening exactly at frame centre, where
     * which-way has no answer, and inside 0.01 of centre it swings 274 degrees
     * per degree of turn. Nothing reaches it: the fade has the token at
     * nothing out to 0.22, and the opening only comes that close in the last
     * 2 m of a run. This is the assertion that keeps the two facts tied
     * together, so a future fade cannot uncover the singularity by accident.
     */
    for (const [width, height, name] of VIEWPORTS) {
      for (const metres of [4, 8, 16, 32, 64, 128, 210]) {
        let previous: GateAim | null = null;
        for (let i = 0; i <= 720; i++) {
          const aim = aimFromRig((i * Math.PI) / 360, width, height, metres);
          if (previous && (aim.presence > 0.02 || previous.presence > 0.02)) {
            const swing = apart(previous.angle, aim.angle) / 0.5;
            expect(swing, `${name} at ${metres} m: the needle swung`
              + ` ${swing.toFixed(1)} deg per degree of turn`).toBeLessThan(4);
          }
          previous = aim;
        }
      }
    }
  });
});

describe('the cue through a whole turn', () => {
  it('never jumps, on any viewport', () => {
    for (const [width, height, name] of VIEWPORTS) {
      const path = sweep(width, height);
      // A phone at 90 deg/s of yaw covers 1.5 degrees per frame at 60 fps, so
      // a step this size is the most a player can be shown in one frame.
      const budget = Math.hypot(width, height) * 0.05;
      let worst = 0, worstAt = -1;
      for (let i = 1; i < path.length; i++) {
        const step = Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
        if (step > worst) { worst = step; worstAt = i; }
      }
      // The old mapping scored 245 px here on a 390 px wide phone, at 180 deg.
      expect(worst, `${name}: worst step ${worst.toFixed(1)} px at ${worstAt} deg`)
        .toBeLessThan(budget);
    }
  });

  it('actually moves rather than pinning to a rail', () => {
    for (const [width, height, name] of VIEWPORTS) {
      const path = sweep(width, height);
      // The old mapping spent 29 of 31 shown bearings on one of two x values.
      const columns = new Set(path.map((a) => Math.round(a.x)));
      expect(columns.size, `${name}: only ${columns.size} distinct x positions`)
        .toBeGreaterThan(60);
      const rows = new Set(path.map((a) => Math.round(a.y)));
      expect(rows.size, `${name}: only ${rows.size} distinct y positions`)
        .toBeGreaterThan(60);
    }
  });

  it('goes round the ring exactly once, in one direction', () => {
    for (const [width, height, name] of VIEWPORTS) {
      const path = sweep(width, height);
      // The ring centre is the middle of the box the path sweeps out.
      const xs = path.map((a) => a.x), ys = path.map((a) => a.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      let turned = 0;
      for (let i = 1; i < path.length; i++) {
        const step = delta(
          Math.atan2(path[i - 1]!.y - cy, path[i - 1]!.x - cx),
          Math.atan2(path[i]!.y - cy, path[i]!.x - cx),
        );
        expect(step, `${name}: the token reversed at ${i} deg`).not.toBe(0);
        expect(Math.sign(step), `${name}: the token reversed at ${i} deg`)
          .toBe(Math.sign(turned || step));
        turned += step;
      }
      expect(Math.abs(turned), name).toBeCloseTo(2 * Math.PI, 3);
    }
  });

  it('fades without a step as the opening crosses the middle of the frame', () => {
    for (const [width, height, name] of VIEWPORTS) {
      const path = sweep(width, height);
      for (let i = 1; i < path.length; i++) {
        expect(
          Math.abs(path[i]!.presence - path[i - 1]!.presence),
          `${name}: presence stepped at ${i} deg`,
        ).toBeLessThan(0.08);
      }
      // It does both things: gone when the gate is centre frame, fully there
      // once the player has turned away from it.
      expect(Math.min(...path.map((a) => a.presence)), name).toBeLessThan(0.02);
      expect(path[180]!.presence, name).toBe(1);
    }
  });

  /*
   * The follow camera looks down, so an opening dead ahead climbs the frame as
   * it gets further away - a third of the way up at 60 m on a phone, and out
   * of the top of a short landscape frame at 215 m, which a dog in a far
   * corner of the 200 m field can just reach. Both halves matter: a token over
   * a gate the player is running straight at is the obstruction that started
   * all this, and a token that snaps on when the gate finally clears the top
   * edge is the pop the whole rewrite exists to remove.
   */
  it('keeps the token down for an opening straight ahead in plain sight', () => {
    for (const [width, height, name] of VIEWPORTS) {
      // 224 m is the furthest a dog can stand from the gate: the field is
      // x and z in -100..100 and the opening is on the north fence at z 100.
      for (let metres = 5; metres <= 224; metres += 1) {
        const shot = shotFromRig(0, width, height, metres);
        // Only judged while the opening is comfortably in shot. Past that it
        // is leaving, and the next test covers how it leaves.
        const room = Math.min(shot.px, width - shot.px, shot.py, height - shot.py);
        if (room < 60) continue;
        expect(shot.aim.onScreen, `${name} at ${metres} m`).toBe(true);
        expect(shot.aim.presence, `${name} at ${metres} m`).toBeLessThan(0.02);
      }
    }
  });

  it('brings the token back gradually as the opening climbs out of the top', () => {
    for (const [width, height, name] of VIEWPORTS) {
      let last: number | null = null;
      for (let metres = 5; metres <= 224; metres += 1) {
        const { presence } = aimFromRig(0, width, height, metres);
        if (last !== null) {
          // A metre of running is roughly an eighth of a second at a sprint.
          expect(Math.abs(presence - last), `${name}: stepped at ${metres} m`)
            .toBeLessThan(0.02);
        }
        last = presence;
      }
    }
  });
});

describe('where the cue is allowed to sit', () => {
  it('clears the HUD and the thumb controls on every viewport', () => {
    for (const [width, height, name] of VIEWPORTS) {
      const path = sweep(width, height);
      const box = (pick: (a: GateAim) => number) => ({
        lo: Math.min(...path.map(pick)), hi: Math.max(...path.map(pick)),
      });
      const x = box((a) => a.x), y = box((a) => a.y);
      // Half a 44 px token off every edge.
      expect(x.lo, `${name} left`).toBeGreaterThanOrEqual(HALF);
      expect(x.hi, `${name} right`).toBeLessThanOrEqual(width - HALF);
      expect(y.lo, `${name} top`).toBeGreaterThanOrEqual(HALF);
      expect(y.hi, `${name} bottom`).toBeLessThanOrEqual(height - HALF);
      for (const aim of path) {
        for (const [what, x0, y0, x1, y1] of furniture(width, height)) {
          const over = Math.min(aim.x + HALF, x1) > Math.max(aim.x - HALF, x0)
            && Math.min(aim.y + HALF, y1) > Math.max(aim.y - HALF, y0);
          expect(over, `${name}: the token sits on ${what}`
            + ` at ${aim.x.toFixed(0)}, ${aim.y.toFixed(0)}`).toBe(false);
        }
      }
    }
  });

  it('leaves the bottom corners to the stick and to Bark in portrait', () => {
    for (const aim of sweep(390, 844)) {
      // Stick rest: 96 px at a 36 px inset, bottom left. Bark: 92 px, right.
      expect(aim.y + 22, `token at ${aim.x}, ${aim.y}`).toBeLessThanOrEqual(844 - 132);
    }
  });

  it('leaves the right-hand edge to the action buttons in landscape', () => {
    for (const aim of sweep(844, 390)) {
      // Camera sits at x 736 to 808, Sprint and Bark below it.
      expect(aim.x + 22, `token at ${aim.x}, ${aim.y}`).toBeLessThanOrEqual(736);
    }
  });
});

describe('what the cue still reports to the rest of the game', () => {
  it('anchors a visible destination and preserves terrain occlusion', () => {
    const camera = new PerspectiveCamera(60, 16 / 9, 0.5, 1200);
    camera.updateMatrixWorld();
    const clip = new Vector4(0, 0, -100, 1)
      .applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    const seen = aimAtGate(clip, 0, 1600, 900, 100);
    expect(seen.onScreen).toBe(true);
    expect(seen.obscured).toBe(false);
    // In frame and dead centre, so the token is not drawn over it.
    expect(seen.presence).toBe(0);
    // A ridge in the way brings it straight back, because now it is a hint.
    const hidden = aimAtGate(clip, 0, 1600, 900, 100, true);
    expect(hidden.obscured).toBe(true);
    expect(hidden.presence).toBe(1);
  });

  it('treats a gate near the viewport edge as visible', () => {
    expect(aimAtGate({ x: -0.94, y: 0, w: 1 }, -1.2, 1600, 900, 20).onScreen).toBe(true);
  });

  it('stays finite with the gate on the camera plane', () => {
    // w of exactly zero makes the projected point NaN. Nothing downstream may
    // see that: the placement never touches it, and the fade is gated behind
    // an onScreen that a NaN comparison cannot pass.
    for (const w of [0, -1e-9, -0.001, -1]) {
      const aim = aimAtGate({ x: 0, y: 0, w }, Math.PI, 390, 844, 20);
      expect([aim.x, aim.y, aim.angle, aim.presence, aim.range].every(Number.isFinite),
        `w = ${w}`).toBe(true);
      expect(aim.onScreen, `w = ${w}`).toBe(false);
      expect(aim.presence, `w = ${w}`).toBe(1);
    }
    // A hair in FRONT of the lens and dead centre is genuinely on screen, and
    // the token belongs faded out there rather than parked on the ring.
    const ahead = aimAtGate({ x: 0, y: 0, w: 0.001 }, 0, 390, 844, 20);
    expect(ahead.onScreen).toBe(true);
    expect(ahead.presence).toBe(0);
  });

  it('draws the range on the rim instead of writing the metres', () => {
    const at = (m: number) => aimAtGate({ x: 0, y: 0, w: -1 }, 0, 390, 844, m).range;
    expect(at(0)).toBe(1);
    expect(at(75)).toBeCloseTo(0.5);
    expect(at(150)).toBe(0);
    expect(at(400)).toBe(0);      // clamped, never negative dash
    expect(at(-5)).toBe(1);       // and never past a closed ring
  });
});

describe('the opening marker in the world', () => {
  it('keeps the opening centre clear and samples every vertex above terrain', () => {
    const groundY = (x: number, z: number) => x * 0.03 + z * 0.01;
    const geometry = buildGateOpeningGeometry(groundY);
    const positions = geometry.getAttribute('position');
    expect(positions.count / 3).toBe(16);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      expect(Math.abs(x)).toBeGreaterThan(2.4);
      expect(positions.getY(i) - groundY(x, z)).toBeGreaterThan(0.07);
      expect(z).toBeGreaterThanOrEqual(98.69);
      expect(z).toBeLessThanOrEqual(102.71);
    }
    geometry.dispose();
  });
});
