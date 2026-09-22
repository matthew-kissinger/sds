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
// So the sweeps here are the spec. Anything that reintroduces a discontinuity
// or a pinned rail fails, whatever the value at any single bearing.

import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3, Vector4 } from 'three/webgpu';
import { aimAtGate, gateBearing, type GateAim } from '@app/ui/gateProjection';
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
  const measured = gateBearing(
    forward.x, forward.z, -camera.position.x, -camera.position.z,
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
    expect(gateBearing(0, -1, 0, -1)).toBeCloseTo(0);           // camera and gate agree
    expect(gateBearing(0, -1, 1, 0)).toBeCloseTo(half);         // gate off the right
    expect(Math.abs(gateBearing(0, -1, 0, 1))).toBeCloseTo(Math.PI);
    expect(gateBearing(0, -1, -1, 0)).toBeCloseTo(-half);       // gate off the left
    // And the same four read off a camera that is not axis-aligned.
    expect(gateBearing(1, 0, 0, -1)).toBeCloseTo(-half);
    expect(gateBearing(1, 0, 1, 0)).toBeCloseTo(0);
  });

  it('survives a camera sitting exactly on the gate', () => {
    expect(Number.isFinite(gateBearing(0, 0, 0, 0))).toBe(true);
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
