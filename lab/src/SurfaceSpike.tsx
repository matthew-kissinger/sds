// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The atlas spike's subject: one barn wall three ways, side by side.
 *
 *   A   procedural: lab/src/spike/boardSurface.ts evaluated per pixel in TSL
 *   B   atlas: the SAME surface baked into assets/spike/surface-atlas.ktx2,
 *       sampled through a second UV set
 *   B+  atlas with painted extras (knots, nail heads) the shader does not compute
 *
 * Same geometry, same banded base (BARN through the shared toon ramp), same
 * eave shade from the surface channel. `?spike=a`, `?spike=b` or `?spike=bplus`
 * mounts one panel at the subject's target, so a capture tool can put the same
 * camera on each in turn; without the parameter all three stand in a row.
 *
 * Lab only. Nothing here is reachable from app/ (spec/13); the experiment and
 * its reasoning are in docs/history/spike-surface-atlas-2026-10-16.md.
 */

import { use, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { useHeightfield } from '@app/world/heightfield';
import { bandedBase } from '@app/scene/farmhouse/bands';
import { BARN } from '@app/scene/farmhouse/palette';
import { makeToonMaterial } from '@app/tsl/toon';
import { dFdx, dFdy } from 'three/tsl';
import { float, fract, mix, smoothstep, texture, uv, vec2, vec3 } from '@app/tsl/nodes';
import {
  ATLAS_CELLS,
  ATLAS_GAIN,
  ATLAS_TEXELS,
  CELL_METRES,
  CELL_TEXELS,
  barnBoardsNode,
  type AtlasCellId,
} from './spike/boardSurface';

/** Where the panels stand: on the farmhouse pad, which is flat at -0.616. */
export const SPIKE_AT = { x: 62, z: 118 } as const;
const PANEL_WIDTH = 8;
const PANEL_HEIGHT = CELL_METRES;
const PANEL_SPACING = 9;
/** The wall material's eave band: the first 0.46 m under the roof edge, 0.82 gain. */
const EAVE_BAND = 0.46;
const EAVE_EDGE = 0.06;
const EAVE_GAIN = 0.82;

export type SpikeVariant = 'a' | 'b' | 'bplus';
const ALL: readonly SpikeVariant[] = ['a', 'b', 'bplus'];

function requestedVariants(): readonly SpikeVariant[] {
  const asked = new URLSearchParams(window.location.search).get('spike');
  return ALL.includes(asked as SpikeVariant) ? [asked as SpikeVariant] : ALL;
}

/**
 * A wall panel facing +z, origin at the bottom centre. `uv` carries the game's
 * surface channels (kind 0, metres below the eave); `uv1` is the texture
 * coordinate in cells, so the atlas path reads it and the procedural path
 * reads the same numbers as metres.
 */
function panelGeometry(): THREE.BufferGeometry {
  const w = PANEL_WIDTH / 2;
  const h = PANEL_HEIGHT;
  const positions = new Float32Array([-w, 0, 0, w, 0, 0, w, h, 0, -w, 0, 0, w, h, 0, -w, h, 0]);
  const normals = new Float32Array(Array.from({ length: 6 }, () => [0, 0, 1]).flat());
  const channels = new Float32Array([0, h, 0, h, 0, 0, 0, h, 0, 0, 0, 0]);
  const cells = PANEL_WIDTH / CELL_METRES;
  const uv1 = new Float32Array([0, 0, cells, 0, cells, 1, 0, 0, cells, 1, 0, 1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(channels, 2));
  geometry.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  return geometry;
}

/** The eave shade every panel wears, from the surface channel as in the game. */
function eaveShade() {
  const below = uv().y;
  const shade = float(1).sub(smoothstep(float(EAVE_BAND), float(EAVE_BAND + EAVE_EDGE), below));
  return mix(float(1), float(EAVE_GAIN), shade);
}

function proceduralMaterial(): THREE.MeshBasicNodeMaterial {
  const metres = uv(1).mul(float(CELL_METRES));
  const modulation = barnBoardsNode(metres.x, metres.y);
  return makeToonMaterial(bandedBase(BARN).mul(modulation).mul(eaveShade()));
}

/**
 * The atlas sample. The cell repeats along the wall through `fract`, and the
 * lookup is inset half a texel so the bilinear footprint never reaches the
 * neighbouring cell at level 0. Sampling takes explicit gradients of the
 * CONTINUOUS coordinate: the `fract` seam would otherwise spike the derivative
 * once per cell and pull the smallest mip along a line.
 */
function atlasMaterial(atlas: THREE.Texture, cell: AtlasCellId): THREE.MeshBasicNodeMaterial {
  const [column, row] = ATLAS_CELLS[cell];
  const span = CELL_TEXELS / ATLAS_TEXELS;
  const inset = 0.5 / ATLAS_TEXELS;
  const origin = vec2(float(column * span + inset), float(row * span + inset));
  const scale = float(span - 2 * inset);
  const continuous = uv(1).mul(scale);
  const inCell = vec2(fract(uv(1).x), uv(1).y);
  const at = origin.add(inCell.mul(scale));
  const sampled = texture(atlas, at).grad(dFdx(continuous), dFdy(continuous));
  const modulation = vec3(sampled.r, sampled.g, sampled.b).mul(float(ATLAS_GAIN));
  return makeToonMaterial(bandedBase(BARN).mul(modulation).mul(eaveShade()));
}

const ATLAS_URL = new URL('../../assets/spike/surface-atlas.ktx2', import.meta.url).href;
/** Unused on this file's raw path, but the loader insists on having one. */
const TRANSCODER_PATH = new URL('../../node_modules/three/examples/jsm/libs/basis/', import.meta.url).href;

let pendingAtlas: Promise<THREE.Texture> | null = null;

/** Fetch and decode once per page; the raw RGBA8 path needs no transcoder. */
function loadAtlas(renderer: THREE.WebGPURenderer): Promise<THREE.Texture> {
  pendingAtlas ??= new KTX2Loader()
    .setTranscoderPath(TRANSCODER_PATH)
    .detectSupport(renderer)
    .loadAsync(ATLAS_URL)
    .then((loaded) => {
      // The loader hands raw data textures over with nearest filtering. An
      // atlas a wall is judged through wants the ordinary trilinear chain,
      // and a little anisotropy, which is what any shipped atlas would set.
      loaded.minFilter = THREE.LinearMipmapLinearFilter;
      loaded.magFilter = THREE.LinearFilter;
      loaded.wrapS = THREE.ClampToEdgeWrapping;
      loaded.wrapT = THREE.ClampToEdgeWrapping;
      loaded.anisotropy = 4;
      loaded.needsUpdate = true;
      return loaded;
    });
  return pendingAtlas;
}

export function SurfaceSpike() {
  const field = useHeightfield();
  const gl = useThree((state) => state.gl) as unknown as THREE.WebGPURenderer;
  const atlas = use(loadAtlas(gl));
  const variants = useMemo(requestedVariants, []);
  const geometry = useMemo(panelGeometry, []);
  const materials = useMemo(() => ({
    a: proceduralMaterial(),
    b: atlasMaterial(atlas, 'barn'),
    bplus: atlasMaterial(atlas, 'barnPainted'),
  }), [atlas]);

  useEffect(() => () => {
    geometry.dispose();
    for (const material of Object.values(materials)) material.dispose();
  }, [geometry, materials]);

  const level = field.groundY(SPIKE_AT.x, SPIKE_AT.z);
  const spread = (variants.length - 1) / 2;
  return (
    <group position={[SPIKE_AT.x, level, SPIKE_AT.z]}>
      {variants.map((variant, i) => (
        <mesh
          key={variant}
          geometry={geometry}
          material={materials[variant]}
          position={[(i - spread) * PANEL_SPACING, 0, 0]}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
