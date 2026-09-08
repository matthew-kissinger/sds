// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { CpuDeterministicSim } from '@sim/FlockSim';
import { HOME_FIELD } from '@sim/field';
import { FIXED_DT } from '@sim/tuning';
import { createFollowFraming } from '@app/camera/followFraming';
import { worldFromAxis } from '@app/input/axis';
import { groundY } from '@app/world/heightfield';

it('keeps Follow framing usable through sustained camera-relative turns', () => {
  const sim = new CpuDeterministicSim(HOME_FIELD, 200, 20260821);
  const follow = createFollowFraming();
  const camera = new THREE.PerspectiveCamera(45, 1440 / 900, 0.5, 1200);
  const forward = new THREE.Vector3();
  const point = new THREE.Vector3();
  const direction = { x: 0, z: 0 };
  const axes = [{ right: 0, forward: 1 }, { right: 1, forward: 0 },
    { right: 0, forward: -1 }, { right: -1, forward: 0 }];
  const dog = sim.state.dogs[0]!;
  follow.update(FIXED_DT, dog);
  let worst = 0;
  let closest = Infinity;
  for (let tick = 0; tick < 60 / FIXED_DT; tick++) {
    camera.position.copy(follow.position);
    camera.lookAt(follow.aim);
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(forward);
    worldFromAxis(axes[Math.floor(tick * FIXED_DT / 5) % 4]!, forward.x, forward.z, direction);
    sim.step([{ direction, sprint: false, bark: tick % Math.round(15 / FIXED_DT) === 0 }], FIXED_DT);
    follow.update(FIXED_DT, dog);
    camera.position.copy(follow.position);
    camera.lookAt(follow.aim);
    camera.updateMatrixWorld(true);
    point.set(dog.position.x, groundY(dog.position.x, dog.position.z) + 1.1, dog.position.z).project(camera);
    worst = Math.max(worst, Math.abs(point.x), Math.abs(point.y));
    closest = Math.min(closest, Math.hypot(follow.position.x - dog.position.x, follow.position.z - dog.position.z));
  }
  expect(worst).toBeLessThan(0.9);
  expect(closest).toBeGreaterThan(15);
}, 20_000);
