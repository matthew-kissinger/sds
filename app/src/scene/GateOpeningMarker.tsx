// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, color, mix, uniform } from '@app/tsl/nodes';
import { PALETTE } from '@app/tsl/palette';
import { useHeightfield } from '@app/world/heightfield';
import { useGameStore } from '@app/state/store';
import { buildGateOpeningGeometry } from './gateOpeningGeometry';

/** Grounded opening emphasis: one tiny TSL mesh, normal depth testing, no glow
 * or pulse. Camera/phase changes fade it; reduced motion changes it directly. */
export function GateOpeningMarker() {
  const field = useHeightfield();
  const mesh = useRef<Mesh>(null);
  const target = useRef(0);
  const reduced = useRef(false);
  const assets = useMemo(() => {
    const opacity = uniform(0);
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    material.colorNode = mix(color(PALETTE.gatePaint), color(PALETTE.sheepWoolLit), attribute('gateTone', 'float'));
    material.opacityNode = opacity;
    const geometry = buildGateOpeningGeometry((x, z) => field.groundY(x, z));
    return { opacity, material, geometry };
  }, [field]);
  useEffect(() => {
    const update = () => {
      const state = useGameStore.getState();
      const cue = state.gateIndicator;
      target.current = state.gamePhase === 'playing' && cue?.onScreen && !cue.obscured ? 1 : 0;
      reduced.current = state.reduceMotion;
      // Phase changes clear guidance immediately, including while paused.
      if (state.gamePhase !== 'playing') {
        assets.opacity.value = 0;
        if (mesh.current) mesh.current.visible = false;
      }
    };
    update();
    return useGameStore.subscribe(update);
  }, [assets]);
  useFrame((_, dt) => {
    const current = assets.opacity.value as number;
    const next = reduced.current ? target.current : current + (target.current - current) * (1 - Math.exp(-dt / 0.15));
    assets.opacity.value = next;
    if (mesh.current) mesh.current.visible = next > 0.005;
  });
  useEffect(() => () => { assets.geometry.dispose(); assets.material.dispose(); }, [assets]);
  return <mesh ref={mesh} name="gate-opening-marker" geometry={assets.geometry} material={assets.material} visible={false} />;
}
