// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Vector4 } from 'three/webgpu';
import { HOME_FIELD } from '@sim/field';
import { useGameStore } from '@app/state/store';
import { useHeightfield } from '@app/world/heightfield';
import { projectGate } from '@app/ui/gateProjection';
import { GateOpeningMarker } from './GateOpeningMarker';
import { GATE_OPENING_LIFT } from './gateOpeningGeometry';

/** One bounded projection at 20 Hz. UI consumes the normal store transiently. */
export function GateGuidance() {
  const field = useHeightfield();
  const elapsed = useRef(0);
  const scratch = useMemo(() => ({ clip: new Vector4(), target: new Vector3() }), []);
  useFrame(({ camera, size }, dt) => {
    const state = useGameStore.getState();
    if (state.gamePhase !== 'playing') {
      if (state.gateIndicator !== null) useGameStore.setState({ gateIndicator: null });
      return;
    }
    elapsed.current += dt;
    if (elapsed.current < 0.05) return;
    elapsed.current = 0;
    const { x, z } = HOME_FIELD.gate.position;
    // Project the opening at the marker's ground level, not above a ridge.
    // This remains a bounded terrain-only visibility approximation.
    const target = scratch.target.set(x, field.groundY(x, z) + GATE_OPENING_LIFT, z);
    const dog = state.sim.state.dogs[0];
    if (!dog) return;
    camera.updateMatrixWorld();
    scratch.clip.set(target.x, target.y, target.z, 1)
      .applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    let obscured = false;
    for (let i = 1; i < 12; i++) {
      const t = i / 12;
      const sx = camera.position.x + (x - camera.position.x) * t;
      const sz = camera.position.z + (z - camera.position.z) * t;
      const sy = camera.position.y + (target.y - camera.position.y) * t;
      if (field.groundY(sx, sz) > sy) { obscured = true; break; }
    }
    useGameStore.setState({ gateIndicator: projectGate(scratch.clip, size.width, size.height,
      Math.hypot(dog.position.x - x, dog.position.z - z), obscured) });
  });
  return <GateOpeningMarker />;
}
