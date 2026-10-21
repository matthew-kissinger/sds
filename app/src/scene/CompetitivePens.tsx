// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useEffect } from 'react';
import { positionWorld, vec3 } from '@app/tsl/nodes';
import type { ArenaPen, CompetitiveLayout } from '@sim/competitiveLayout';
import { makePenFloorMaterial } from './pen/floorMaterial';
import { buildBoundaryDressing } from './pen/boundaryDressing';
import type { Material } from 'three/webgpu';
export function CompetitivePens({ layout }: { layout: CompetitiveLayout }) {
  return <>{layout.pens.map(p => <Floor key={p.slot} pen={p} />)}</>;
}
function Floor({ pen }: { pen: ArenaPen }) {
  const assets = useMemo(() => {
    const dx = positionWorld.x.sub(pen.position.x), dz = positionWorld.z.sub(pen.position.z);
    const local = vec3(dx.mul(pen.normal.z).sub(dz.mul(pen.normal.x)), 0, dx.mul(pen.normal.x).add(dz.mul(pen.normal.z)));
    const spec = { minX: -28, maxX: 28, minZ: 2, maxZ: 28, mouthX: 0, mouthZ: 0, mouthWidth: pen.width };
    return { material: makePenFloorMaterial(spec, local), dressing: buildBoundaryDressing({ ...spec, corridorMinZ: 0 }, () => 0) };
  }, [pen]);
  useEffect(() => () => { assets.material.dispose(); for (const mesh of assets.dressing) {
    mesh.geometry.dispose(); (mesh.material as Material).dispose(); mesh.dispose();
  } }, [assets]);
  return <group position={[pen.position.x, 0, pen.position.z]} rotation={[0, Math.atan2(pen.normal.x, pen.normal.z), 0]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.055, 15]} material={assets.material}><planeGeometry args={[56, 26]} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.055, 1]} material={assets.material}><planeGeometry args={[pen.width, 2]} /></mesh>
    {assets.dressing.map(m => <primitive key={m.uuid} object={m} />)}
  </group>;
}
