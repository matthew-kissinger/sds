// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 118 Phase 5. A clock you can photograph.
 *
 * The water animated off TSL `time` - which is `frame.time`, the renderer's own
 * clock, advanced on every renderer.render() regardless of anything main.js
 * does. Two consequences:
 *
 *   1. Pausing the sim did not stop the surface, so no capture of the same pose
 *      could ever come back byte-identical.
 *   2. The `timeSec` main.js had been passing to AnimeWater#update since Cycle
 *      5 was dropped on the floor on the node path - the controls block simply
 *      had no branch for it - so "fixing" the main.js clock alone would have
 *      changed nothing.
 *
 * These specs pin all three halves of the fix: the uniform exists and the
 * controls drive it, the accumulator stops under pause, and main.js drives the
 * accumulator rather than the wall clock.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DoubleSide, MeshBasicNodeMaterial, TSL } from 'three/webgpu';

import { createAnimeWater } from '../js/water/AnimeWater.js';
import { createWebGpuWaterNodeMaterialFactories } from '../js/water/webgpuWaterNodeMaterialFactories.js';
import { advanceWaterClock } from '../js/water/waterSurfaceModel.js';

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

function createHeightTexture() {
  const texture = new THREE.DataTexture(
    new Float32Array([0, 0.25, 0.5, 1]),
    2,
    2,
    THREE.RedFormat,
    THREE.FloatType
  );
  texture.needsUpdate = true;
  return texture;
}

describe('the water clock is the game clock', () => {
  it('exposes a waterTime uniform the material controls drive from timeSec', () => {
    const factories = createWebGpuWaterNodeMaterialFactories({
      MeshBasicNodeMaterial,
      DoubleSide,
      TSL,
    });
    const heightTexture = createHeightTexture();
    const material = factories.createAnimeWaterMaterial({
      heightTexture,
      heightfield: { worldSize: 400, peakHeight: 0 },
    });

    try {
      const nodes = material.userData.webgpuWaterNodeUniforms;
      expect(nodes.waterTime).toBeTruthy();
      expect(nodes.waterTime.value).toBe(0);

      // This is the branch that did not exist. AnimeWater#update has routed
      // timeSec into these controls the whole time and nothing consumed it.
      material.userData.webgpuWaterMaterialControls.update({ timeSec: 12.5 });
      expect(nodes.waterTime.value).toBe(12.5);

      // A sun-only update must not disturb the clock: water-look.mjs keeps
      // pushing sun state while the sim (and therefore the clock) is frozen.
      material.userData.webgpuWaterMaterialControls.update({
        sunColor: new THREE.Color(1, 0.5, 0.25),
      });
      expect(nodes.waterTime.value).toBe(12.5);

      material.userData.webgpuWaterMaterialControls.update({ timeSec: Number.NaN });
      expect(nodes.waterTime.value).toBe(12.5);
    } finally {
      material.dispose();
      heightTexture.dispose();
    }
  });

  it('leaves no free-running renderer clock in the water node graph', () => {
    const source = stripComments(readSource('../js/water/webgpuAnimeWaterNodeMaterial.js'));

    // The TSL destructure must not pull `time` in at all, and no call site may
    // reference it. Both halves matter: the original substitution was 15 refs
    // across 11 lines, four of which carried two, so replacing the lines and
    // stopping would have left live references behind.
    const destructure = source.match(/const \{[^}]*\} = TSL;/);
    expect(destructure, 'TSL destructure not found').toBeTruthy();
    expect(destructure[0].split(/[\s,{}]+/)).not.toContain('time');
    expect(source).not.toMatch(/(?<![\w.])time\.mul\(/);
    expect(source).toContain('const waterTime = uniform(0);');
    expect(source).toContain('nodes.waterTime.value = state.timeSec;');
  });

  it('holds the clock while the sim is paused and advances it by deltaTime otherwise', () => {
    expect(advanceWaterClock(0, 0.016)).toBeCloseTo(0.016, 9);
    expect(advanceWaterClock(4, 0.5)).toBeCloseTo(4.5, 9);

    // The acceptance line: when the sim is paused, the water surface shall not
    // advance.
    expect(advanceWaterClock(4, 0.5, { paused: true })).toBe(4);
    let clock = 7.25;
    for (let i = 0; i < 120; i += 1) clock = advanceWaterClock(clock, 1 / 60, { paused: true });
    expect(clock).toBe(7.25);

    // A dropped frame or a first frame must not poison it with NaN, and the
    // clock never runs backwards.
    expect(advanceWaterClock(undefined, 0.016)).toBeCloseTo(0.016, 9);
    expect(advanceWaterClock(3, Number.NaN)).toBe(3);
    expect(advanceWaterClock(3, -1)).toBe(3);
  });

  it('gives the water object the clock, so main.js never imports the surface model', () => {
    const water = createAnimeWater({
      boundary: { center: { x: 0, z: 0 }, radius: 180, falloff: 40 },
      size: 16,
      segments: 1,
    });

    try {
      expect(water.clock).toBe(0);
      expect(water.advanceClock(0.5)).toBeCloseTo(0.5, 9);
      expect(water.advanceClock(0.5, { paused: true })).toBeCloseTo(0.5, 9);
      expect(water.clock).toBeCloseTo(0.5, 9);
      expect(water.setClock(12)).toBe(12);
      expect(water.clock).toBe(12);
      expect(water.setClock(Number.NaN)).toBe(0);
    } finally {
      water.dispose();
    }

    // The `main` chunk runs on roughly 1.6 KB of ratchet headroom and the
    // surface model minifies to ~4.7 KB, so a static import from js/main.js
    // would have put it there and tripped a fence-frozen fixture. The clock
    // lives on the water for that reason as much as for tidiness.
    const mainSource = stripComments(readSource('../js/main.js'));
    expect(mainSource).not.toContain('waterSurfaceModel.js');
    // js/diagnostics/glProbe.js also rides `main`, and takes the leaf.
    const probe = stripComments(readSource('../js/diagnostics/glProbe.js'));
    expect(probe).toContain("from '../water/waterPalette.js'");
    expect(probe).not.toContain('waterSurfaceModel.js');
  });

  it('drives that accumulator from main.js instead of the wall clock', () => {
    const main = stripComments(readSource('../js/main.js'));
    const waterUpdate = main.match(/if \(this\._animeWater\) \{[\s\S]*?\n {8}\}/);
    expect(waterUpdate, 'water update block not found in js/main.js').toBeTruthy();
    const block = waterUpdate[0];

    // The wall clock is gone from the water update. performance.now() cannot be
    // paused or pinned, which is the whole reason a capture could not repeat.
    expect(block).not.toContain('performance.now()');
    expect(block).toContain('this._animeWater.advanceClock(deltaTime');
    expect(block).toContain('this._animeWater.update(this._waterClock');
    expect(block).toContain('__sdsCinema?.paused');

    // The sun keeps pushing every frame. Moving the whole block inside the
    // cinema.paused guard would also freeze sunDir/sunColor and break
    // water-look.mjs's setSun flow, so the guard has to be on the clock alone.
    expect(main).toMatch(/const sunDir = this\.atmosphere\?\.getSunDirection/);
    expect(block).toContain('sunDir, sunLightColor');

    // Guard against the wrong-block edit: js/main.js has a rock rim-colour
    // block a few lines down where deltaTime is also in scope, so an edit there
    // compiles and does nothing.
    expect(main).toContain('this.terrainBuilder?.setRockRimColor?.(sunLightColor)');
    expect(main).not.toMatch(/setRockRimColor[\s\S]{0,200}advanceClock/);
  });

  it('gives the capture harness a way to pin the clock before a pose', () => {
    const cinema = readSource('../js/cinematic.js');
    expect(cinema).toContain('setWaterClock(seconds = 0)');
    expect(cinema).toContain('game._animeWater?.setClock?.(seconds)');

    const tool = readSource('../tools/validation/water-look.mjs');
    expect(tool).toContain('PINNED_WATER_CLOCK');
    // Once before the pose settles and once per rAF tick: those ticks run
    // main.js's frame, so a clock left free would advance four times between
    // posing the camera and reading the canvas.
    expect(tool.match(/cinema\.setWaterClock\?\.\(waterClock\)/g)?.length).toBe(2);
  });
});
