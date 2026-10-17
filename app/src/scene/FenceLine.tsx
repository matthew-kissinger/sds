// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** The full Kiln perimeter and pen: posts, rails/gate and moving pooled shadow.
 * Three draws including the hull outlines. Collision remains owned by sim/.
 */
import { use, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { useHeightfield } from '@app/world/heightfield';
import { useGameStore } from '@app/state/store';
import { useReducedMotion } from '@app/ui/useReducedMotion';
import { RectFence } from './RectFence';
import { FIELD_FENCE_SECTIONS } from './fence/fieldSections';
import { loadFenceKit, type FenceKit } from './fence/fenceKit';
import { buildFenceField } from './fence/fenceField';
import { advanceCompletion, smoothArrival, COMPLETION_GATE_SECONDS } from './juice/completionMotion';

export function preloadFence(): void {
  void loadFenceKit();
}

export function FenceLine() {
  const closed = useGameStore(state => state.gamePhase === 'complete');
  return <KilnFence closed={closed} />;
}

/** The lab consumes this same builder, controlling only the gate's target pose. */
export function KilnFence({ closed }: { readonly closed: boolean }) {
  const kit = use(loadFenceKit());
  return kit === null ? <RectFence sections={FIELD_FENCE_SECTIONS} /> : <FenceMeshes kit={kit} closed={closed} />;
}

function FenceMeshes({ kit, closed }: { readonly kit: FenceKit; readonly closed: boolean }) {
  const field = useHeightfield();
  const built = useMemo(() => buildFenceField(kit, (x, z) => field.groundY(x, z)), [kit, field]);
  const progress = useRef(0);
  const reducedMotion = useReducedMotion();
  useFrame((_, delta) => {
    progress.current = advanceCompletion(progress.current, closed, delta, COMPLETION_GATE_SECONDS, reducedMotion);
    built.updateGate(smoothArrival(progress.current));
  });
  useEffect(() => () => {
    for (const mesh of built.objects) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
    }
  }, [built]);
  return <>{built.objects.map(mesh => <primitive key={mesh.uuid} object={mesh} />)}</>;
}
