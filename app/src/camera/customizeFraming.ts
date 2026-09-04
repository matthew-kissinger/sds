// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Customize framing: the AAA 3D character and flock inspection studio camera.
 * Smoothly frames the dog, individual sheep, or pasture flock with orbit rotation
 * and responsive lateral composition.
 */

import * as THREE from 'three/webgpu';
import type { Dog } from '@sim/types';
import { groundY } from '@app/world/heightfield';
import { approach, positionSmoothing } from './feel';

const CUSTOMIZE_POSITION_TAU = 0.22;

export type DogCameraAngle = 'hero' | 'face' | 'profile' | 'front' | 'rear' | 'top';

export interface DogCameraConfig {
  readonly camDist: number;
  readonly camHeight: number;
  readonly aimHeight: number;
  readonly baseAngle: number;
  readonly lateralOffset: number;
}

export const DOG_CAMERA_CONFIGS: Record<DogCameraAngle, DogCameraConfig> = {
  hero: {
    camDist: 5.0,
    camHeight: 1.65,
    aimHeight: 0.9,
    baseAngle: 0.35,
    lateralOffset: -0.5,
  },
  face: {
    camDist: 3.8,
    camHeight: 1.65,
    aimHeight: 1.18,
    baseAngle: 0.22,
    lateralOffset: -0.44,
  },
  profile: {
    camDist: 5.8,
    camHeight: 1.45,
    aimHeight: 0.9,
    baseAngle: Math.PI / 2,
    lateralOffset: -0.85,
  },
  front: {
    camDist: 4.9,
    camHeight: 1.5,
    aimHeight: 0.95,
    baseAngle: 0.0,
    lateralOffset: -0.48,
  },
  rear: {
    camDist: 4.8,
    camHeight: 1.55,
    aimHeight: 0.85,
    baseAngle: Math.PI * 0.82,
    lateralOffset: -0.42,
  },
  top: {
    camDist: 4.6,
    camHeight: 4.2,
    aimHeight: 0.75,
    baseAngle: 0.25,
    lateralOffset: -0.35,
  },
};

export interface CustomizeFraming {
  readonly position: THREE.Vector3;
  readonly aim: THREE.Vector3;
  update(
    dt: number,
    tab: 'dog' | 'flock' | 'sheep',
    dogAngle: DogCameraAngle,
    orbitAngle: number,
    selectedSheep: number,
    dog: Dog,
    sheepList: readonly { readonly position: { readonly x: number; readonly z: number } }[],
  ): void;
  reset(): void;
}

export function createCustomizeFraming(): CustomizeFraming {
  const position = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const desiredPosition = new THREE.Vector3();
  const desiredAim = new THREE.Vector3();
  let seated = false;

  return {
    position,
    aim,

    reset(): void {
      seated = false;
    },

    update(
      dt: number,
      tab: 'dog' | 'flock' | 'sheep',
      dogAngle: DogCameraAngle,
      orbitAngle: number,
      selectedSheep: number,
      dog: Dog,
      sheepList: readonly { readonly position: { readonly x: number; readonly z: number } }[],
    ): void {
      if (tab === 'dog') {
        const dogX = dog.position.x;
        const dogZ = dog.position.z;
        const ground = groundY(dogX, dogZ);
        const cfg = DOG_CAMERA_CONFIGS[dogAngle] ?? DOG_CAMERA_CONFIGS.hero;
        const totalAngle = cfg.baseAngle + orbitAngle;

        // Orbit around the dog
        const eyeX = dogX + Math.sin(totalAngle) * cfg.camDist;
        const eyeZ = dogZ + Math.cos(totalAngle) * cfg.camDist;
        const eyeY = ground + cfg.camHeight;

        // Shift aim slightly to the left relative to camera direction
        // so the dog appears pleasantly centered in the unobstructed right-hand viewport
        const dirX = dogX - eyeX;
        const dirZ = dogZ - eyeZ;
        const dirLen = Math.hypot(dirX, dirZ) || 1;
        const rightX = -dirZ / dirLen;
        const rightZ = dirX / dirLen;

        desiredAim.set(
          dogX + rightX * cfg.lateralOffset,
          ground + cfg.aimHeight,
          dogZ + rightZ * cfg.lateralOffset,
        );
        desiredPosition.set(
          eyeX + rightX * cfg.lateralOffset,
          eyeY,
          eyeZ + rightZ * cfg.lateralOffset,
        );
      } else if (tab === 'sheep') {
        const sheep = sheepList[selectedSheep] ?? sheepList[0];
        const sheepX = sheep ? sheep.position.x : 0;
        const sheepZ = sheep ? sheep.position.z : -30;
        const ground = groundY(sheepX, sheepZ);
        const aimHeight = 0.62;
        const camDist = 4.6;
        const camHeight = 1.75;
        const totalAngle = 0.42 + orbitAngle;

        const eyeX = sheepX + Math.sin(totalAngle) * camDist;
        const eyeZ = sheepZ + Math.cos(totalAngle) * camDist;
        const eyeGround = groundY(eyeX, eyeZ);
        const eyeY = Math.max(ground + camHeight, eyeGround + 1.25);

        const dirX = sheepX - eyeX;
        const dirZ = sheepZ - eyeZ;
        const dirLen = Math.hypot(dirX, dirZ) || 1;
        const rightX = -dirZ / dirLen;
        const rightZ = dirX / dirLen;

        const lateralOffset = -0.52;

        desiredAim.set(
          sheepX + rightX * lateralOffset,
          ground + aimHeight,
          sheepZ + rightZ * lateralOffset,
        );
        desiredPosition.set(
          eyeX + rightX * lateralOffset,
          eyeY,
          eyeZ + rightZ * lateralOffset,
        );
      } else {
        // 'flock' pasture overview
        let sumX = 0;
        let sumZ = 0;
        const count = sheepList.length;
        if (count > 0) {
          for (let i = 0; i < count; i++) {
            const s = sheepList[i]!;
            sumX += s.position.x;
            sumZ += s.position.z;
          }
          sumX /= count;
          sumZ /= count;
        } else {
          sumX = 0;
          sumZ = -30;
        }

        const ground = groundY(sumX, sumZ);
        const camDist = count > 100 ? 28.0 : count > 50 ? 22.0 : 18.0;
        const camHeight = count > 100 ? 13.0 : count > 50 ? 10.5 : 8.5;

        const eyeX = sumX + Math.sin(orbitAngle * 0.5) * camDist;
        const eyeZ = sumZ + Math.cos(orbitAngle * 0.5) * camDist;
        const eyeY = ground + camHeight;

        desiredAim.set(sumX, ground + 0.8, sumZ);
        desiredPosition.set(eyeX, eyeY, eyeZ);
      }

      if (!seated) {
        position.copy(desiredPosition);
        aim.copy(desiredAim);
        seated = true;
        return;
      }

      const alpha = positionSmoothing(dt, CUSTOMIZE_POSITION_TAU);
      approach(position, desiredPosition, alpha, dt);
      approach(aim, desiredAim, alpha, dt);
    },
  };
}
