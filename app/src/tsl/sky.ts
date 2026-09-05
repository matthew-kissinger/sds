// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Painted golden-hour sky in one opaque dome draw. Six authored cumulus masses
 * use overlapping ellipses in view-direction space: offset scalloped bases, unequal
 * rounded towers, cool undersides and warm sun-facing edges. This is the
 * editable deterministic recipe; no texture, volume marching or extra pass.
 *
 * Direction-space composition keeps clouds readable in the narrow strip above
 * the gameplay horizon. A projected cloud deck would compress them to streaks.
 * Shading by the camera ray also avoids parallax as the player crosses the field.
 */
import * as THREE from 'three/webgpu';
import { PALETTE, SUN_DIRECTION } from './palette';
import {
  cameraPosition, clamp, color, dot, float, Fn, max, mix, normalize,
  positionWorld, sin, smoothstep, time, uniform, vec3, type TSLNode,
} from './nodes';

/** Inside the camera's 1200 m far plane, outside the whole field. */
export const SKY_DOME_RADIUS = 800;

/** Azimuth, base height, half width, tower height, asymmetry. Radians / ray units. */
const CLOUDS = [
  [-0.99, 0.081, 0.155, 0.046, -0.82],
  [-0.15, 0.094, 0.135, 0.052, 1],
  [0.64, 0.073, 0.175, 0.039, -1],
  [1.58, 0.15, 0.18, 0.065, 0.91],
  [2.73, 0.085, 0.21, 0.044, -0.95],
  [-2.18, 0.13, 0.16, 0.055, 0.73],
] as const;

export function makeSkyMaterial(): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  material.side = THREE.BackSide;
  material.fog = false;
  material.depthWrite = false;

  const sun = uniform(SUN_DIRECTION) as TSLNode;
  const ray = normalize(positionWorld.sub(cameraPosition)).toVar();
  const height = ray.y;
  // Match fog exactly at/below the horizon, then open into blue early enough
  // for the Follow camera. Warmth belongs to the horizon and sun, not every pixel.
  const lower = mix(color(PALETTE.skyHorizon), color(PALETTE.skyMid),
    smoothstep(float(0), float(0.085), height));
  const gradient = mix(lower, color(PALETTE.skyZenith),
    smoothstep(float(0.055), float(0.27), height));

  // Ellipse unions share one compact shader function across every cloud. Four
  // overlapping lobes form an offset belly and unequal towers. No full-width
  // base ellipse: it previously joined every mass into the same flat slab.
  const cloudShape = Fn(([x, y, lean]: TSLNode[]) => {
    const ellipse = (cx: TSLNode, cy: number, rx: number, ry: number) => {
      const dx = x.sub(cx).div(float(rx));
      const dy = y.sub(float(cy)).div(float(ry));
      return float(1).sub(dx.mul(dx).add(dy.mul(dy)));
    };
    return max(
      max(ellipse(lean.mul(float(-0.19)), -0.025, 0.64, 0.34), ellipse(lean.mul(float(-0.48)), 0.19, 0.43, 0.60)),
      max(ellipse(lean.mul(float(0.10)), 0.46, 0.38, 0.73), ellipse(lean.mul(float(0.56)), 0.11, 0.40, 0.41)),
    );
  }, { x: 'float', y: 'float', lean: 'float', return: 'float' });

  let clouded = gradient;
  // Bounded, very slow drift; never wrap an authored mass through the camera.
  const drift = sin(time.mul(float(0.012))).mul(float(0.035)).toVar();
  for (const [azimuth, base, width, tower, lean] of CLOUDS) {
    const side = vec3(Math.cos(azimuth), 0, -Math.sin(azimuth));
    const forward = vec3(Math.sin(azimuth), 0, Math.cos(azimuth));
    const x = dot(ray, side).sub(drift).div(float(width)).toVar();
    const y = height.sub(float(base)).div(float(tower)).toVar();
    // Reuse one slow contour bend for both the edge and the painted shade. Its
    // amplitude is deliberately broad and small, with no texture-frequency noise.
    const contour = sin(x.mul(float(4.5)).add(float(lean))).mul(float(0.085)).toVar();
    const density = cloudShape(x, y.add(contour), float(lean)).toVar();
    // Broad brushed bands avoid the polygon-like seams produced by differencing
    // overlapping lobes. A gentle curved boundary breaks up the flat underside;
    // horizontal warmth still follows the same world sun as every surface.
    const brushedHeight = y.add(contour).add(density.mul(float(0.18)));
    const top = smoothstep(float(-0.05), float(0.70), brushedHeight).toVar();
    const sunSide = clamp(x.mul(dot(sun, side)).mul(float(0.5)).add(float(0.5)), float(0), float(1));
    const light = top.mul(float(0.78)).add(sunSide.mul(float(0.10))).add(float(0.12));
    // Tops hold a crisp painted edge; bases dissolve more gently into the air.
    const coverage = smoothstep(mix(float(-0.24), float(-0.05), top), float(0.10), density)
      .mul(smoothstep(float(0.55), float(0.85), dot(ray, forward)))
      .mul(smoothstep(float(0.012), float(0.07), height)).mul(float(0.94));
    const cloudColor = mix(color(PALETTE.cloudShade), color(PALETTE.cloudLit), light);
    const hazed = mix(color(PALETTE.skyHorizon), cloudColor,
      smoothstep(float(0.01), float(0.08), height).mul(float(0.84)).add(float(0.16)));
    clouded = mix(clouded, hazed, coverage);
  }

  // A defined cream disc with a local warm halo; no full-frame orange veil.
  const toSun = clamp(dot(ray, sun), float(0), float(1)).toVar();
  const haze = smoothstep(float(0.80), float(1), toSun).pow(float(2)).mul(float(0.035));
  const halo = smoothstep(float(0.99), float(1), toSun).pow(float(2)).mul(float(0.18));
  const core = smoothstep(float(0.999), float(0.99992), toSun).mul(float(0.5));
  const glow = color(PALETTE.sunGlow).mul(haze.add(halo).add(core));
  const disc = smoothstep(float(0.999877), float(0.999925), toSun);
  material.colorNode = mix(clouded.add(glow), color(PALETTE.sunDisc).mul(float(1.9)), disc);
  return material;
}
