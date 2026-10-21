// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three/webgpu';
import { useGameStore } from '@app/state/store';
import { useHeightfield } from '@app/world/heightfield';
const icons = ['●', '▲', '■', '◆'];
const colours = ['#315f91', '#8b392e', '#58632b', '#734f87'];
/** DOM identifiers sample the actual camera every frame, with subpixel transforms. */
export function PlayerLabels() {
  const sim = useGameStore(s => s.sim);
  const { camera, size, gl } = useThree(); const field = useHeightfield();
  const point = useMemo(() => new Vector3(), []);
  const labels = useMemo(() => sim.authoritative ? [] : [...sim.state.dogs.map(d => ({ slot: d.id, pen: false })), ...(sim.state.field.competition?.pens.map(p => ({ slot: p.slot, pen: true })) ?? [])].map(d => {
    const label = document.createElement('span');
    label.dataset.playerLabel = String(d.slot);
    label.textContent = `Player ${d.slot + 1}`;
    label.dataset.kind = d.pen ? 'pen' : 'dog';
    label.hidden = true;
    label.style.cssText = `position:fixed;left:0;top:0;pointer-events:none;z-index:10;background:${colours[d.slot]};color:white;border:1px solid white;border-radius:6px;padding:3px 6px;font:600 12px sans-serif;white-space:nowrap`;
    return label;
  }), [sim]);
  useEffect(() => { labels.forEach(label => document.body.append(label)); return () => labels.forEach(label => label.remove()); }, [labels]);
  useFrame(() => {
    const rect = gl.domElement.getBoundingClientRect();
    labels.forEach((label, i) => {
      const slot = Number(label.dataset.playerLabel);
      const pen = label.dataset.kind === 'pen' ? sim.state.field.competition?.pens.find(p => p.slot === slot) : null;
      const at = pen?.position ?? sim.state.dogs[i]!.position;
      point.set(at.x, field.groundY(at.x, at.z) + (pen ? 4 : 3), at.z).project(camera);
      label.hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
      label.textContent = `${icons[slot]} ${slot + 1} · ${sim.playerNames?.get(slot) ?? 'Player'}${pen ? ' · pen' : ''}${slot === sim.state.dogs[0]?.id ? ' · you' : ''}`;
      label.style.transform = `translate(${rect.left + (point.x + 1) * size.width / 2}px,${rect.top + (1 - point.y) * size.height / 2}px) translate(-50%,-100%)`;
    });
  });
  return null;
}
