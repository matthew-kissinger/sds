// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { texture } from 'three/tsl';
import { useGameStore } from '@app/state/store';
import { groundY } from '@app/world/heightfield';
import { getSheepName } from '@app/game/sheepNames';
import { UI_TOKENS } from '@app/ui/tokens';
import { useSheepPicker } from './useSheepPicker';

const CANVAS_WIDTH = 256;
const CANVAS_HEIGHT = 64;

/**
 * 3D Billboard Sheep Label.
 * Displays the hovered or tapped sheep's name with distance-compensated scaling
 * and a tactile paper pill backing matching the Sheepdog Sim UI design system.
 * Works seamlessly across genuine WebGPU and forced WebGL2 backends.
 */
export function SheepHoverLabel() {
  const sim = useGameStore((state) => state.sim);
  const { camera, pointer, gl } = useThree();

  const groupRef = useRef<THREE.Group>(null);
  const pillRef = useRef<THREE.Mesh>(null);
  const lastActiveIndexRef = useRef<number | null>(null);

  // Dedicated off-screen canvas and texture for the billboard label
  const { ctx, canvasTexture } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = CANVAS_WIDTH;
    c.height = CANVAS_HEIGHT;
    const context = c.getContext('2d', { willReadFrequently: false });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return { ctx: context, canvasTexture: tex };
  }, []);

  // Material using TSL texture node
  const pillMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    mat.colorNode = texture(canvasTexture);
    return mat;
  }, [canvasTexture]);

  const pillGeometry = useMemo(() => {
    return new THREE.PlaneGeometry(1, 1);
  }, []);

  // Ensure font is ready in document
  useEffect(() => {
    const fontFace = new FontFace('Alice', 'url(/fonts/Alice-Regular.ttf)');
    fontFace
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
      })
      .catch(() => {
        // Fallback serif available via CSS
      });
  }, []);

  // Hook for picking sheep by cursor/touch
  const { update } = useSheepPicker(sim, camera, pointer, gl.domElement);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    // Pick hovered/tapped sheep
    const hoveredIndex = update();

    if (hoveredIndex === null) {
      group.visible = false;
      return;
    }

    const pos = sim.positions;
    const count = sim.headings.length;
    if (hoveredIndex >= count) {
      group.visible = false;
      return;
    }

    const sx = pos[hoveredIndex * 2]!;
    const sz = pos[hoveredIndex * 2 + 1]!;
    const sy = groundY(sx, sz) + 1.25;

    // Position above the sheep
    group.position.set(sx, sy, sz);

    // Billboard towards camera
    group.quaternion.copy(camera.quaternion);

    // Distance-compensated scaling:
    // Classic camera sits at 54m, Follow camera sits at 15m.
    // Clamped linear distance scaling keeps label ~28px tall across all camera distances.
    const dist = camera.position.distanceTo(group.position);
    const k = THREE.MathUtils.clamp(dist * 0.038, 0.75, 2.1);
    group.scale.set(k, k, k);

    // Update text and dimensions if changed
    if (lastActiveIndexRef.current !== hoveredIndex) {
      lastActiveIndexRef.current = hoveredIndex;
      const name = getSheepName(hoveredIndex);

      if (ctx) {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        ctx.font = '600 28px Alice, Georgia, "Times New Roman", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const metrics = ctx.measureText(name);
        const textWidth = metrics.width;
        const paddingX = 24;
        const pillWidthPx = Math.min(Math.max(textWidth + paddingX * 2, 110), CANVAS_WIDTH - 8);
        const pillHeightPx = 44;
        const radius = pillHeightPx / 2;

        const x0 = (CANVAS_WIDTH - pillWidthPx) / 2;
        const y0 = (CANVAS_HEIGHT - pillHeightPx) / 2;

        // Draw pill background with warm paper tone
        ctx.beginPath();
        ctx.roundRect(x0, y0, pillWidthPx, pillHeightPx, radius);
        ctx.fillStyle = UI_TOKENS.color.paper;
        ctx.fill();

        // Subtle dark line border
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = UI_TOKENS.color.line;
        ctx.stroke();

        // Draw sheep name in dark ink
        ctx.fillStyle = UI_TOKENS.color.ink;
        ctx.fillText(name, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 1);

        canvasTexture.needsUpdate = true;

        if (pillRef.current) {
          const aspect = CANVAS_WIDTH / CANVAS_HEIGHT;
          const height = 0.52;
          const width = height * aspect;
          pillRef.current.scale.set(width, height, 1);
        }
      }
    }

    group.visible = true;
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={pillRef} geometry={pillGeometry} material={pillMaterial} renderOrder={200} />
    </group>
  );
}
