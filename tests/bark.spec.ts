// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The bark, measured.
 *
 * The bark overhaul is a user-ordered design change (STATUS.md "Direction
 * changes"), and a design change needs numbers or it is an opinion. This file
 * is the headless evaluation harness those numbers come from: it stands a clump
 * of sheep at a known distance in front of a known dog, barks, runs the REAL
 * `step`, and asserts on what moved, how far, in which direction and how fast.
 *
 * The four questions it answers, in order:
 *
 *   (a) REACH AND SURGE   mean displacement of cone sheep 30 and 60 ticks after
 *                         the bark, at 10, 20 and 35 m. Decisive means metres,
 *                         not centimetres, and it means them within half a
 *                         second.
 *   (b) RIPPLE            a sheep the cone missed, standing beside one it hit,
 *                         has moved within 30 ticks - and one standing alone
 *                         out of reach has no bark intent at all.
 *   (c) DIRECTION         the displacement points away from the dog. A bark
 *                         that scatters sideways is not a herding tool.
 *   (d) CALM              no sheep ever exceeds its own top speed. The bark
 *                         holds a sheep at a flat sprint; it never throws one.
 *
 * The thresholds are deliberately loose brackets around the measured values,
 * not the values themselves: the exact numbers are pinned by
 * tests/fixtures/bark-scatter.json. What these assertions defend is the DESIGN
 * - if a future tuning pass halves the reach or turns the surge into a drift,
 * this file goes red and says which property broke.
 */

import { describe, expect, it } from 'vitest';
import { startBarkSteering } from '@sim/BarkImpulse';
import { HOME_FIELD } from '@sim/field';
import { createSimState, createTickRng } from '@sim/state';
import { step } from '@sim/step';
import {
  BARK_COOLDOWN_TICKS,
  MAX_SHEEP_SHEEP_PUSH_PER_TICK,
  SHEEP_BARK,
  SHEEP_MAX_SPEED_PER_TICK,
} from '@sim/tuning';
import type { PlayerInputs, SimState } from '@sim/types';

const SEED = 20260821;
const IDLE: PlayerInputs = { direction: { x: 0, z: 0 }, sprint: false, bark: false };
/** Dog stands here for every scenario; sheep are placed relative to it. */
const DOG = { x: 0, z: -60 };

type Point = [number, number];

/**
 * A scene with the sheep exactly where the test wants them: the dog parked at
 * DOG facing +z with no velocity, and `placements` given as offsets from the
 * dog. Everything sits well inside the fence, so no boundary force muddies a
 * measurement.
 */
function scene(placements: readonly Point[]): SimState {
  const state = createSimState(HOME_FIELD, placements.length, SEED);
  const dog = state.dogs[0]!;
  dog.position.set(DOG.x, DOG.z);
  dog.velocity.set(0, 0);
  dog.heading.set(0, 1);
  for (let i = 0; i < placements.length; i++) {
    const s = state.sheep[i]!;
    s.position.set(DOG.x + placements[i]![0], DOG.z + placements[i]![1]);
    s.velocity.set(0, 0);
    s.acceleration.set(0, 0);
  }
  return state;
}

/** Seven sheep packed around a point `d` metres straight ahead of the dog. */
function clumpAt(d: number): Point[] {
  const ring: Point[] = [
    [2.6, 0], [1.3, 2.25], [-1.3, 2.25], [-2.6, 0], [-1.3, -2.25], [1.3, -2.25],
  ];
  return [[0, d], ...ring.map(([ox, oz]) => [ox, d + oz] as Point)];
}

interface Run {
  start: Point[];
  at: Map<number, Point[]>;
  /** Largest sim speed any sheep reached, metres per tick. */
  peakSpeed: number;
  /** Largest single-tick position change any sheep made, metres. */
  peakStep: number;
}

function positions(state: SimState): Point[] {
  return state.sheep.map((s) => [s.position.x, s.position.z] as Point);
}

function run(state: SimState, ticks: number, sampleAt: readonly number[]): Run {
  const rng = createTickRng(SEED);
  const start = positions(state);
  const at = new Map<number, Point[]>();
  let peakSpeed = 0;
  let peakStep = 0;
  for (let t = 1; t <= ticks; t++) {
    const before = positions(state);
    step(state, [IDLE], rng);
    for (let i = 0; i < state.sheep.length; i++) {
      const s = state.sheep[i]!;
      peakSpeed = Math.max(peakSpeed, s.velocity.magnitude());
      peakStep = Math.max(
        peakStep,
        Math.hypot(s.position.x - before[i]![0], s.position.z - before[i]![1]),
      );
    }
    if (sampleAt.includes(t)) at.set(t, positions(state));
  }
  return { start, at, peakSpeed, peakStep };
}

function bark(state: SimState) {
  const dog = state.dogs[0]!;
  return startBarkSteering(state.sheep, dog.position, dog.heading, SHEEP_BARK);
}

function displacement(r: Run, tick: number, i: number): number {
  const now = r.at.get(tick)!;
  return Math.hypot(now[i]![0] - r.start[i]![0], now[i]![1] - r.start[i]![1]);
}

function meanDisplacement(r: Run, tick: number): number {
  let sum = 0;
  for (let i = 0; i < r.start.length; i++) sum += displacement(r, tick, i);
  return sum / r.start.length;
}

/** Cosine between a sheep's displacement and the dog-to-sheep direction. */
function awayDot(r: Run, tick: number, i: number): number {
  const ax = r.start[i]![0] - DOG.x;
  const az = r.start[i]![1] - DOG.z;
  const al = Math.hypot(ax, az) || 1;
  const now = r.at.get(tick)!;
  const dx = now[i]![0] - r.start[i]![0];
  const dz = now[i]![1] - r.start[i]![1];
  const dl = Math.hypot(dx, dz) || 1;
  return (dx * ax + dz * az) / (dl * al);
}

// ---------------------------------------------------------------------------

describe('bark: reach and geometry', () => {
  it('reaches a meaningful slice of a spread flock', () => {
    // The order was 35-45 m. sds shipped 24, which is the whole complaint.
    expect(SHEEP_BARK.range).toBeGreaterThanOrEqual(35);
    expect(SHEEP_BARK.range).toBeLessThanOrEqual(45);
  });

  it('takes the whole cone at once, and nothing behind it', () => {
    // A fan of sheep at 25 m: dead ahead, at the cone edge, and past it. The
    // half-angle is 60 deg, so 1.732 = tan(60) is where the cone stops.
    const state = scene([
      [0, 25],       // on the axis
      [24, 12],      // 63 deg off: outside
      [-24, 12],     // 63 deg off, other side: outside
      [12, 22],      // 29 deg off: inside
      [0, -25],      // directly behind the dog, outside nearRadius
    ]);
    const result = bark(state);
    expect(result.steered).toBe(2);
    expect(state.sheep[4]!.barkSteerTicks).toBe(0);
  });

  it('startles anything at the dog s shoulder, whichever way it faces', () => {
    // nearRadius: inside it the cone test is skipped. A sheep 6 m behind the
    // dog is 180 deg off the facing and still gets shoved, radially backwards.
    const state = scene([[0, -6]]);
    expect(bark(state).steered).toBe(1);
    const s = state.sheep[0]!;
    expect(s.barkSteerZ).toBeCloseTo(-1, 6);
    expect(s.barkSteerX).toBeCloseTo(0, 6);
  });

  it('ignores sheep that are already in the pen', () => {
    const state = scene(clumpAt(15));
    state.sheep[0]!.state = 'penned';
    state.sheep[1]!.state = 'retiring';
    expect(bark(state).steered).toBe(5);
    expect(state.sheep[0]!.barkSteerTicks).toBe(0);
    expect(state.sheep[1]!.barkSteerTicks).toBe(0);
  });
});

describe('bark: (a) the surge', () => {
  /**
   * THE METRIC TABLE. One clump of seven at each distance, one bark, no other
   * input. Measured at the tuning committed in sim/tuning.ts:
   *
   *   distance   mean displacement @30 ticks   @60 ticks   away-dot @60
   *   10 m       2.87 m                        6.37 m      0.98
   *   20 m       2.86 m                        6.18 m      0.99
   *   35 m       2.85 m                        5.66 m      0.99
   *
   * Read that as: half a second after the bark the clump has moved most of a
   * body length, and one second after it has moved a good six metres, at every
   * distance the cone covers. The gentle taper with distance is the duration
   * falloff (see durationAt in BarkImpulse.ts); the surge itself does not taper
   * because a sheep's top speed does not care how far away the dog barked.
   */
  const table = [10, 20, 35];

  it.each(table)('a clump %i m ahead surges metres, not centimetres', (d) => {
    const state = scene(clumpAt(d));
    expect(bark(state).steered).toBe(7);
    const r = run(state, 60, [30, 60]);

    // Half a second: already unmistakably moving.
    expect(meanDisplacement(r, 30)).toBeGreaterThan(2.2);
    // One second: a clump has moved several metres.
    expect(meanDisplacement(r, 60)).toBeGreaterThan(4.8);
    // And not teleported. 60 ticks at the speed cap is 7.2 m; nothing may beat
    // that, and the small margin is the sheep/sheep separation push.
    expect(meanDisplacement(r, 60)).toBeLessThan(60 * SHEEP_MAX_SPEED_PER_TICK + 1);
  });

  it('the push has decayed by the time the cooldown is up', () => {
    // "Surge, then settle." Every intent this bark wrote must be spent before
    // the player can bark again, or two barks stack on one sheep.
    const state = scene(clumpAt(12));
    bark(state);
    const longest = Math.max(...state.sheep.map((s) => s.barkSteerTicks));
    expect(longest).toBeLessThan(BARK_COOLDOWN_TICKS);
    // And it lasts about the second-and-a-quarter the design asks for.
    expect(longest).toBeGreaterThanOrEqual(60);
    expect(longest).toBeLessThanOrEqual(90);
  });

  it('the cooldown is what stops a machine-gun bark', () => {
    const state = scene(clumpAt(12));
    const rng = createTickRng(SEED);
    const barking: PlayerInputs = { direction: { x: 0, z: 0 }, sprint: false, bark: true };
    const dog = state.dogs[0]!;

    step(state, [barking], rng);
    expect(dog.barkCooldownTicks).toBe(BARK_COOLDOWN_TICKS);

    // Held down for the whole cooldown: exactly one more bark lands, on the
    // tick the counter reaches zero.
    let accepted = 0;
    for (let t = 0; t < BARK_COOLDOWN_TICKS; t++) {
      const before = dog.barkCooldownTicks;
      step(state, [barking], rng);
      if (dog.barkCooldownTicks > before) accepted++;
    }
    expect(accepted).toBe(1);
  });
});

describe('bark: (b) the startle ripple', () => {
  /**
   * Two ways to be a bystander: standing past the end of the reach, and
   * standing outside the cone. Both flinch if a sheep the bark hit is close
   * enough; neither does if it is alone.
   */
  const OUT_OF_REACH: Point = [0, 43]; // 43 m: past the 40 m range
  const OFF_THE_CONE: Point = [20, 10]; // 63 deg off the axis
  const ALONE: Point = [60, 5]; // no hit sheep anywhere near

  const placements: Point[] = [
    [0, 38],       // 0 hit: on the axis, inside the reach
    OUT_OF_REACH,  // 1 ripple: 5 m from sheep 0
    [16, 12],      // 2 hit: 53 deg off the axis
    OFF_THE_CONE,  // 3 ripple: 4.5 m from sheep 2
    ALONE,         // 4 untouched
  ];

  it('spreads to bystanders next to a barked sheep, and only to them', () => {
    const state = scene(placements);
    const result = bark(state);
    expect(result.steered).toBe(2);
    expect(result.rippled).toBe(2);
    expect(state.sheep[4]!.barkSteerTicks).toBe(0);
  });

  it('arrives a few ticks late, later the further out it lands', () => {
    const state = scene(placements);
    const result = bark(state);
    // 0.25 ticks per metre: 43 m is 10 ticks, 22.4 m is 5.
    const delay = (i: number) =>
      state.sheep[i]!.barkSteerTicks - state.sheep[i]!.barkSteerDurationTicks;
    expect(delay(0)).toBe(0);
    expect(delay(2)).toBe(0);
    expect(delay(1)).toBe(10);
    expect(delay(3)).toBe(5);
    expect(delay(1)).toBeGreaterThan(delay(3));
    expect(result.maxDelayTicks).toBe(10);
    // "A few ticks", not a beat later: under a fifth of a second.
    expect(result.maxDelayTicks).toBeLessThanOrEqual(12);
  });

  it('nothing happens to a rippled sheep during its delay', () => {
    const state = scene(placements);
    bark(state);
    const s = state.sheep[1]!;
    const rng = createTickRng(SEED);
    for (let t = 0; t < 9; t++) step(state, [IDLE], rng);
    // Still counting down, still above its own duration: no force applied yet.
    expect(s.barkSteerTicks).toBeGreaterThan(s.barkSteerDurationTicks);
  });

  it('bystanders have visibly moved within 30 ticks', () => {
    const state = scene(placements);
    bark(state);
    const r = run(state, 60, [30, 60]);
    // The ripple is a flinch, so it is measured against the sheep that is out
    // of reach entirely rather than against a bare number: both bystanders must
    // clearly outrun the untouched sheep's ambient grazing wander.
    const untouched30 = displacement(r, 30, 4);
    expect(displacement(r, 30, 1)).toBeGreaterThan(untouched30 + 0.4);
    expect(displacement(r, 30, 3)).toBeGreaterThan(untouched30 + 0.4);
    // And it stays a flinch: less than the sheep the cone hit outright.
    expect(displacement(r, 60, 1)).toBeLessThan(displacement(r, 60, 0));
    expect(displacement(r, 60, 3)).toBeLessThan(displacement(r, 60, 2));
  });

  it('a whole flock reacts as one body', () => {
    // The shape of the shot a player actually takes: a settled flock, the dog
    // 10 m behind it, facing up the field. This is the same setup the
    // bark-scatter fixture records, and the claim is that the bark is a flock
    // tool now rather than a per-sheep one.
    const state = createSimState(HOME_FIELD, 25, SEED);
    const rng = createTickRng(SEED);
    for (let t = 0; t < 120; t++) step(state, [IDLE], rng);
    let cx = 0;
    let cz = 0;
    for (const s of state.sheep) {
      cx += s.position.x;
      cz += s.position.z;
    }
    const dog = state.dogs[0]!;
    dog.position.set(cx / 25, cz / 25 - 10);
    dog.velocity.set(0, 0);
    dog.heading.set(0, 1);

    const result = startBarkSteering(state.sheep, dog.position, dog.heading, SHEEP_BARK);
    // Not all 25: a boid only coheres with neighbours inside its perception
    // radius, so a settled flock always has a few sheep that have genuinely
    // wandered off alone (see the flock-drift fixture). Those are out of the
    // cone AND out of ripple range of anything, and they should be untouched.
    // The body of the flock - a strong four-fifths majority - reacts as one.
    // The exact wanderer count is a property of the seeded spawn layout, not of
    // the bark; these floors are what "flock tool" means at any layout.
    expect(result.steered + result.rippled).toBeGreaterThanOrEqual(20);
    expect(result.steered).toBeGreaterThanOrEqual(16);
    // No rippled floor: whether any reachable sheep sits outside the cone but
    // inside ripple range of a hit neighbour is pure spawn-layout accident.
    // The ripple's own behaviour is pinned by the dedicated tests above.
  });
});

describe('bark: (c) direction', () => {
  it('every barked sheep is pushed away from the dog', () => {
    for (const d of [10, 20, 35]) {
      const state = scene(clumpAt(d));
      bark(state);
      const r = run(state, 60, [60]);
      for (let i = 0; i < r.start.length; i++) {
        // 0.87 is 30 degrees. The push blends the dog's facing with the
        // dog-to-sheep radial, so a sheep at the cone edge leans up to about
        // 26 deg toward the facing; nothing may lean further than that.
        expect(awayDot(r, 60, i)).toBeGreaterThan(0.87);
      }
    }
  });

  it('the dog s facing aims the push, it does not only repel', () => {
    // Two sheep the same distance out, one on each side of the axis. Both are
    // pushed away, and both are also carried forward along the dog's facing:
    // that forward lean is what makes bark a steering tool and not a bumper.
    const state = scene([[14, 14], [-14, 14]]);
    bark(state);
    for (const s of state.sheep) {
      const radial = Math.SQRT1_2; // both sit at 45 deg, so radial z is 1/sqrt2
      expect(s.barkSteerZ).toBeGreaterThan(radial);
    }
  });
});

describe('bark: (d) calm', () => {
  it('never moves a sheep faster than a sheep can run', () => {
    for (const d of [10, 20, 35]) {
      const state = scene(clumpAt(d));
      bark(state);
      const r = run(state, 90, []);
      // The sim's own speed. `updateMovement` clamps it, and the bark adds
      // acceleration rather than writing velocity precisely so that clamp keeps
      // owning the result. Powerful, not violent.
      expect(r.peakSpeed).toBeLessThanOrEqual(SHEEP_MAX_SPEED_PER_TICK + 1e-9);
      // Position may move slightly further in a tick than velocity alone: the
      // sheep/sheep separation pass pushes bodies apart, and it has its own cap.
      expect(r.peakStep).toBeLessThanOrEqual(
        SHEEP_MAX_SPEED_PER_TICK + MAX_SHEEP_SHEEP_PUSH_PER_TICK + 1e-9,
      );
    }
  });

  it('leaves the flock still a flock', () => {
    // Not scatter: the clump that arrives is the clump that left. Its spread
    // may loosen, but it must not blow apart.
    const state = scene(clumpAt(20));
    bark(state);
    const r = run(state, 90, [90]);
    const spread = (rows: Point[]) => {
      let cx = 0;
      let cz = 0;
      for (const p of rows) {
        cx += p[0];
        cz += p[1];
      }
      cx /= rows.length;
      cz /= rows.length;
      let worst = 0;
      for (const p of rows) worst = Math.max(worst, Math.hypot(p[0] - cx, p[1] - cz));
      return worst;
    };
    expect(spread(r.at.get(90)!)).toBeLessThan(spread(r.start) * 2.5);
  });
});
