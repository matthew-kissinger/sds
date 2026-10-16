// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The analysis views: flat-black silhouette and wireframe.
 *
 * "Silhouette first" is a hard rule in spec/05 - every asset must read as
 * itself in flat black - so it needs a view, and this is it.
 *
 * BY CLONING, NOT BY SUBSTITUTING. The first attempt built a fresh
 * `MeshBasicNodeMaterial` per mesh and copied the original's `positionNode`
 * across, to keep the vertex animation that `sheepMaterial` and
 * `grassMaterial` author there. It submitted draw calls and triangles and drew
 * nothing at all: a node graph belongs to the material class it was built for,
 * and handing it to another class leaves a pipeline that runs and produces
 * no pixels. Cloning keeps the class, the graph and the animation, and changes
 * only the colour.
 *
 * `scene.overrideMaterial` is not an option either, for the same reason in a
 * stronger form: one material for the whole scene replaces every author's
 * `positionNode` with the rest pose, and a silhouette of a pose the game never
 * shows is worse than no silhouette.
 *
 * Skeletal animation needs no care here: NodeMaterial applies skinning before
 * `positionNode`, whichever material the mesh is wearing.
 *
 * The swap is re-checked every frame because the scene gains and loses meshes
 * as subjects change. It is a map lookup against a small scene, not a rebuild.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { color } from '@app/tsl/nodes';
import type { LabViewMode } from './labStore';

export interface ViewModeProps {
  readonly mode: LabViewMode;
}

/** The fields we overwrite on the clone, which the base Material type lacks. */
type NodeCarrier = { colorNode?: unknown; wireframe?: boolean; fog?: boolean };

function makeAnalysisMaterial(
  mode: Exclude<LabViewMode, 'lit'>,
  original: THREE.Material,
): THREE.Material {
  const made = original.clone();
  const fields = made as unknown as NodeCarrier;
  if (mode === 'silhouette') {
    // Black base colour reads black under any ramp, so the shape stays flat
    // without this having to know which lighting model it just cloned.
    fields.colorNode = color(0x000000);
  } else {
    fields.wireframe = true;
    fields.colorNode = color(0x8fd8c6);
  }
  fields.fog = false;
  return made;
}

export function ViewMode({ mode }: ViewModeProps) {
  const scene = useThree((state) => state.scene);
  const original = useRef(new Map<THREE.Mesh, THREE.Material>());
  const made = useMemo(() => new Map<string, THREE.Material>(), []);

  const restore = useCallback(() => {
    for (const [mesh, material] of original.current) mesh.material = material;
    original.current.clear();
  }, []);

  // Restore on every mode change, not only on the way back to `lit`: the frame
  // below re-swaps for the new mode, and without this a silhouette-to-wireframe
  // switch would leave every already-swapped mesh wearing the black material.
  useEffect(() => {
    restore();
  }, [mode, restore]);

  useEffect(() => () => {
    restore();
    for (const material of made.values()) material.dispose();
    made.clear();
  }, [made, restore]);

  useFrame(() => {
    if (mode === 'lit') return;
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh !== true) return;
      if (Array.isArray(mesh.material)) return;
      if (original.current.has(mesh)) return;
      const source = mesh.material;
      const key = `${mode}:${source.uuid}`;
      let swap = made.get(key);
      if (swap === undefined) {
        swap = makeAnalysisMaterial(mode, source);
        made.set(key, swap);
      }
      original.current.set(mesh, source);
      mesh.material = swap;
    });
  });

  return null;
}
