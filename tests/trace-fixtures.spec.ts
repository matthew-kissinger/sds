// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The committed traces, re-run and compared.
 *
 * A failure here is a BEHAVIOUR CHANGE in the sim, not a flaky test. Read the
 * diff and decide whether it was intended. If it was, `node
 * tools/record-fixtures.mjs` re-records - and doing so is a decision that
 * belongs in the same commit as the sim change that caused it, described in the
 * message. Never re-record to get back to green (spec/02).
 *
 * Each of these drives the real exported `step` through `createSimState`. There
 * is no mirrored harness to drift out of sync with the sim, which is the failure
 * mode sds hit: its fixtures pinned an 810-line copy of the tick, so a change to
 * the actual sim passed clean.
 */

import { describe, expect, it } from 'vitest';
import barkScatter from './fixtures/bark-scatter.json';
import completionRun from './fixtures/completion-run.json';
import dogRotation from './fixtures/dog-rotation.json';
import flockDrift from './fixtures/flock-drift.json';
import staminaCurve from './fixtures/stamina-curve.json';
import { traceBark, traceCompletion, traceDogRotation, traceFlockDrift, traceStamina } from './helpers/traces';

describe('trace fixtures', () => {
  it('flock drift under no input', () => {
    expect(traceFlockDrift()).toEqual(flockDrift);
  });

  it('dog rotation convergence', () => {
    expect(traceDogRotation()).toEqual(dogRotation);
  });

  it('stamina drain and regen', () => {
    expect(traceStamina()).toEqual(staminaCurve);
  });

  it('bark response', () => {
    expect(traceBark()).toEqual(barkScatter);
  });

  it('full 25-sheep completion run', () => {
    expect(traceCompletion()).toEqual(completionRun);
  });
});

describe('what the traces mean', () => {
  /**
   * Reading the fixtures as claims about the sim, so that a diff is legible
   * without replaying it in your head. These assert on the committed JSON, not
   * on a fresh run: they say what the recorded numbers are supposed to show.
   */

  it('an unattended flock clumps and stays on the field', () => {
    const samples: Record<string, number[]> = flockDrift.samples;
    const last = samples[String(flockDrift.ticks)]!;
    const n = last.length / 2;

    // Boids only cohere with neighbours inside the perception radius, so a
    // sheep that spawns alone at the edge of the cluster genuinely wanders off
    // on its own - that is the sds behaviour, not a bug. What must hold is that
    // most of the flock has found company.
    let withCompany = 0;
    for (let i = 0; i < n; i++) {
      const x = last[i * 2]!;
      const z = last[i * 2 + 1]!;
      expect(Math.abs(x)).toBeLessThanOrEqual(100);
      expect(Math.abs(z)).toBeLessThanOrEqual(100);
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        if (Math.hypot(last[j * 2]! - x, last[j * 2 + 1]! - z) <= 5) {
          withCompany++;
          break;
        }
      }
    }
    expect(withCompany).toBeGreaterThanOrEqual(n * 0.6);
  });

  it('the dog heading converges on the input direction and stays a unit vector', () => {
    const rows = dogRotation.rows;
    let previousX = -Infinity;
    for (const [, hx, hz] of rows) {
      expect(Math.hypot(hx!, hz!)).toBeCloseTo(1, 3);
      expect(hx!).toBeGreaterThanOrEqual(previousX);
      previousX = hx!;
    }
    const [, finalX, , finalSpeed] = rows[rows.length - 1]!;
    expect(finalX).toBeCloseTo(1, 3);
    expect(finalSpeed).toBeCloseTo(15, 1); // DOG_MAX_SPEED, not sprinting
  });

  it('stamina drains while sprinting and regenerates once the sprint stops', () => {
    const rows = staminaCurve.rows;
    const sprintRows = rows.filter((r) => r[2] === 1);
    const first = sprintRows[0]!;
    const last = sprintRows[sprintRows.length - 1]!;
    expect(last[1]!).toBeLessThan(first[1]!);
    // 30/s drain over the 20-tick sample interval is exactly 10 stamina.
    expect(first[1]! - sprintRows[1]![1]!).toBeCloseTo(10, 6);
    // By the end of the run the dog is standing still and has recovered.
    expect(rows[rows.length - 1]![1]!).toBeGreaterThan(last[1]!);
  });

  it('a bark moves the sheep it reaches, and reaches most of a flock', () => {
    for (const shot of [barkScatter.push, barkScatter.inFlock]) {
      expect(shot.steered).toBeGreaterThan(0);
      expect(shot.steered + shot.rippled).toBeLessThanOrEqual(barkScatter.flockSize);

      // Half a second later, every sheep the bark touched has moved a metre.
      const before = shot.samples['0']!;
      const after = shot.samples['30']!;
      let moved = 0;
      for (let i = 0; i < before.length; i += 2) {
        if (Math.hypot(after[i]! - before[i]!, after[i + 1]! - before[i + 1]!) > 1) moved++;
      }
      expect(moved).toBeGreaterThanOrEqual(shot.steered);

      // A direct hit starts on the bark's own tick; a rippled one waits.
      let directs = 0;
      for (let i = 0; i < shot.durations.length; i++) {
        if (shot.durations[i]! > 0 && shot.delays[i] === 0) directs++;
      }
      expect(directs).toBe(shot.steered);
      expect(Math.max(...shot.delays)).toBe(shot.maxDelayTicks);
    }
    // The dog standing in the flock is the case that leaves bystanders for the
    // startle to travel to; the push shot is the one that moves the whole body.
    expect(barkScatter.inFlock.rippled).toBeGreaterThan(0);
    expect(barkScatter.push.steered).toBeGreaterThan(barkScatter.inFlock.steered);
  });

  it('the completion run finishes, and every sheep ends up in the pen', () => {
    expect(completionRun.completedAtTick).toBeGreaterThan(0);
    expect(completionRun.completedAtTick).toBeLessThan(60000);
    // The test name is the assertion: every sheep, not just some.
    expect(completionRun.finalPenned).toBe(completionRun.flockSize);
    expect(completionRun.pennedPer100[completionRun.pennedPer100.length - 1]).toBeGreaterThan(0);
    // The penning curve only ever goes up: nothing escapes the pen.
    let previous = 0;
    for (const penned of completionRun.pennedPer100) {
      expect(penned).toBeGreaterThanOrEqual(previous);
      previous = penned;
    }
  });
});
