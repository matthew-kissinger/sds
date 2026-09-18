// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import type { Dog } from '@sim/types';
import { useGameStore } from '@app/state/store';
import { getSheepName } from '@app/game/sheepNames';
import { createFollowFraming } from '@app/camera/followFraming';
import { cameraViewProfile } from '@app/camera/viewProfile';
import { pickRadiiPx } from '@app/scene/useSheepPicker';

/** The touch target spec/06 asks for, as a radius. The picker reads it as a
 *  radius rather than a target width, which is the conservative reading. */
const MIN_TAP_RADIUS_PX = 44;

/** The two canvases the picker's own notes are written against. */
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

describe('screen-space heritage nameplate', () => {
  it('formats sheep and dog names with appropriate ornamentation', () => {
    // Dog name defaults to Pip
    const state = useGameStore.getState();
    const dogName = state.dogName || 'Pip';
    expect(dogName).toBe('Pip');

    // Sheep names are clean without rosettes
    const sheep0 = getSheepName(0, state.customSheepNames);
    expect(typeof sheep0).toBe('string');
    expect(sheep0.length).toBeGreaterThan(0);
    expect(sheep0).not.toContain('◆');
  });

  it('correctly maps 3D NDC to 2D screen coordinates', () => {
    const width = 1440;
    const height = 900;

    // Center of screen (NDC 0, 0)
    const centerX = (0 * 0.5 + 0.5) * width;
    const centerY = (-0 * 0.5 + 0.5) * height;
    expect(centerX).toBe(720);
    expect(centerY).toBe(450);

    // Top-left of screen (NDC -1, 1)
    const topLeftX = (-1 * 0.5 + 0.5) * width;
    const topLeftY = (-1 * 0.5 + 0.5) * height;
    expect(topLeftX).toBe(0);
    expect(topLeftY).toBe(0);

    // Bottom-right of screen (NDC 1, -1)
    const bottomRightX = (1 * 0.5 + 0.5) * width;
    const bottomRightY = (-(-1) * 0.5 + 0.5) * height;
    expect(bottomRightX).toBe(1440);
    expect(bottomRightY).toBe(900);
  });

  it('clips elements behind the camera (ndc.z > 1)', () => {
    const isVisibleInFront = (ndcZ: number) => ndcZ <= 1.0;
    expect(isVisibleInFront(0.5)).toBe(true);
    expect(isVisibleInFront(1.0)).toBe(true);
    expect(isVisibleInFront(1.001)).toBe(false);
    expect(isVisibleInFront(2.5)).toBe(false);
  });

  it('reflects custom dog name updates in real time', () => {
    useGameStore.getState().setDogName('Moss');
    expect(useGameStore.getState().dogName).toBe('Moss');

    useGameStore.getState().setDogName('Shep');
    expect(useGameStore.getState().dogName).toBe('Shep');

    // Reset back to Pip
    useGameStore.getState().setDogName('Pip');
    expect(useGameStore.getState().dogName).toBe('Pip');
  });
});

/**
 * What the nameplate is pointed at, which is the other half of the same screen
 * problem: the plate maps a world point to pixels, and the picker decides which
 * world point that is by measuring a distance on the same glass.
 *
 * Two things went wrong there and the comfort rig made both worse. The
 * thresholds shipped as NDC radii, and an NDC radius is angular, so moving the
 * camera from 20 m back to 26 widened the world each one covered by 38% for no
 * reason a player asked for. And `hypot` on an NDC delta mixes two axes that
 * span different pixel counts: on a 390x844 phone one NDC unit is 195 px across
 * and 422 px down, so the tap region was an ellipse reaching 48 px up the screen
 * and 22 px across it. The fix is that every threshold is a radius in PIXELS,
 * converted from the world radius it covered on the rig that shipped.
 *
 * `pickRadiiPx` is exported and asserted directly. The comparison itself is four
 * inline expressions inside the hook, which needs a canvas and a store to run, so
 * the tests below state the law it has to satisfy and mirror the one line rather
 * than importing it. That is the weaker half of this file and worth knowing: it
 * would not catch a fifth call site added without the conversion.
 */
describe('sheep picker hit region', () => {
  /** A camera at the live Follow pose for a canvas, and the point it looks at. */
  function rigCamera(width: number, height: number): {
    camera: THREE.PerspectiveCamera;
    subject: THREE.Vector3;
  } {
    const view = cameraViewProfile(width / height);
    const framing = createFollowFraming(view.follow);
    const dog = {
      position: { x: 0, z: 0 },
      velocity: { x: 0, z: 12 },
      heading: { x: 0, z: 1 },
    } as unknown as Dog;
    framing.update(1 / 60, dog);
    const camera = new THREE.PerspectiveCamera(view.fov, width / height, 0.1, 2000);
    camera.position.copy(framing.position);
    camera.lookAt(framing.aim);
    camera.updateMatrixWorld(true);
    return { camera, subject: framing.aim.clone() };
  }

  /** Where a world point lands, both the way the picker measures and the way it
   *  used to: pixels off the screen centre, and raw NDC. */
  function offset(camera: THREE.PerspectiveCamera, point: THREE.Vector3,
    width: number, height: number): { px: number; ndc: number } {
    const projected = point.clone().project(camera);
    return {
      px: Math.hypot(projected.x * (width / 2), projected.y * (height / 2)),
      ndc: Math.hypot(projected.x, projected.y),
    };
  }

  it('reaches the same distance across the screen as up it', () => {
    // The property, stated as the thing a thumb does. A sheep the same number of
    // world metres from the cursor is the same number of PIXELS from it whether
    // it lies sideways or up the frame, because a perspective projection covers
    // the same metres per pixel on both axes and the half-extents are what put
    // the NDC delta back into pixels.
    for (const { width, height } of [DESKTOP, PHONE, { width: 844, height: 390 }]) {
      const { camera, subject } = rigCamera(width, height);
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
      const metres = 3;
      const across = offset(camera, subject.clone().addScaledVector(right, metres), width, height);
      const upward = offset(camera, subject.clone().addScaledVector(up, metres), width, height);
      expect(across.px, `${width}x${height}`).toBeCloseTo(upward.px, 6);

      // And the failure mode it replaces, in one number: compared in NDC the
      // same two offsets differ by the canvas aspect, so a portrait tap reached
      // 2.16 times further up the screen than across it.
      expect(across.ndc / upward.ndc).toBeCloseTo(height / width, 6);
    }
  });

  it('clears the minimum touch target on a 390x844 portrait canvas', () => {
    // 47.9 px, which is the whole reason the tap threshold is allowed to be
    // wider than the hover one. Hover does NOT clear it and should not:
    // SHEEP_BODY_RADIUS is 0.78 m, so acquiring at 0.487 m puts the cursor on
    // the animal, and flooring hover at 44 px would leave the plate clinging.
    const phone = pickRadiiPx(PHONE.width / PHONE.height, PHONE.height);
    expect(phone.tap).toBeGreaterThan(MIN_TAP_RADIUS_PX);
    expect(phone.tap).toBeCloseTo(47.92, 1);
    expect(phone.acquire).toBeCloseTo(16.47, 1);
    expect(phone.retain).toBeCloseTo(32.95, 1);
    expect(phone.acquire).toBeLessThan(phone.retain);
    expect(phone.retain).toBeLessThan(phone.tap);

    // A short canvas derives a radius under the target, so the floor is what
    // carries it: a phone held landscape would otherwise tap at 22.6 px.
    const landscapePhone = pickRadiiPx(844 / 390, 390);
    expect(landscapePhone.tap).toBe(MIN_TAP_RADIUS_PX);
  });

  it('is a pixel radius rather than a screen fraction', () => {
    // The distinction that makes the first test mean anything: an NDC threshold
    // is invariant to canvas size, and these are not. Double the canvas and the
    // same world radius is twice as many pixels.
    const phone = pickRadiiPx(PHONE.width / PHONE.height, PHONE.height);
    const doubled = pickRadiiPx(PHONE.width / PHONE.height, PHONE.height * 2);
    expect(doubled.acquire).toBeCloseTo(phone.acquire * 2, 9);
    expect(doubled.retain).toBeCloseTo(phone.retain * 2, 9);
    expect(doubled.tap).toBeCloseTo(phone.tap * 2, 9);
  });

  it('would have missed half of the same tap when the radius was NDC', () => {
    // The size of what the pixel conversion bought, in the units a thumb is in.
    // An NDC radius buys reach in proportion to each half-extent, so the single
    // threshold that delivers the shipped 47.9 px up a 390x844 phone delivers
    // only 22.1 px across it - barely half the minimum touch target, on the axis
    // a player sweeping between two sheep in a line moves along.
    const { camera, subject } = rigCamera(PHONE.width, PHONE.height);
    const right = new THREE.Vector3();
    camera.matrixWorld.extractBasis(right, new THREE.Vector3(), new THREE.Vector3());
    const tap = pickRadiiPx(PHONE.width / PHONE.height, PHONE.height).tap;

    // Where a sheep at the tap boundary sideways actually is, found through the
    // projection rather than assumed: pixels are linear in the offset, since the
    // camera's right vector holds depth.
    const perMetre = offset(camera, subject.clone().add(right), PHONE.width, PHONE.height).px;
    const boundary = subject.clone().addScaledVector(right, tap / perMetre);
    expect(offset(camera, boundary, PHONE.width, PHONE.height).px).toBeCloseTo(tap, 6);

    // In NDC that sheep sits at tap/halfW, while one the same pixel distance up
    // the screen sits at tap/halfH. One threshold cannot admit both, and the
    // threshold that admits the vertical one stops here:
    const reachAcross = tap * (PHONE.width / PHONE.height);
    expect(reachAcross).toBeLessThan(MIN_TAP_RADIUS_PX * 0.55);
    expect(reachAcross).toBeCloseTo(22.1, 1);
  });
});
