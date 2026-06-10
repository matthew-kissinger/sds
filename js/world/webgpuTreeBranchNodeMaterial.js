// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2 as ThreeVector2 } from 'three';

export function createWebGpuTreeBranchNodeMaterial({ MeshStandardNodeMaterial, TSL }, treeBranch = {}) {
  const { clamp, float, length, mix, normalize, positionLocal, positionView, positionWorld, sin, smoothstep, time, uniform, vec3 } = TSL;
  const linearColor = (color) => color.map((value) => (
    value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4
  ));
  const vector2 = (value) => new ThreeVector2(value[0], value[1]);
  const color = treeBranch.baseColorLinear
    ? treeBranch.baseColor
    : linearColor(treeBranch.baseColor ?? [0.20, 0.11, 0.055]);
  const material = new MeshStandardNodeMaterial();
  material.name = 'webgpu-node-branches';
  const windDirection = treeBranch.windDirection ?? [0.7, 0.7];
  const windDirectionNode = uniform(vector2(windDirection));
  const windStrength = uniform(treeBranch.windStrength ?? 0.38);
  const windDir = normalize(windDirectionNode);
  const treeRange = Math.max((treeBranch.treeTopY ?? 0.525) - (treeBranch.treeBaseY ?? -0.525), 0.001);
  const y01 = clamp(positionLocal.y.sub(treeBranch.treeBaseY ?? -0.525).div(treeRange), 0.0, 1.0);
  const branchWeight = smoothstep(0.32, 1.0, y01).mul(smoothstep(0.32, 1.0, y01));
  const gustA = sin(positionWorld.x.mul(0.04).add(positionWorld.z.mul(0.034)).sub(time.mul(0.84)));
  const gustB = sin(positionWorld.x.mul(0.018).add(positionWorld.z.mul(0.022)).add(1.4).sub(time.mul(0.62)));
  const gustEnv = smoothstep(-0.2, 1.0, gustA.mul(0.6).add(gustB.mul(0.4)));
  const sway1 = sin(positionWorld.x.mul(0.15).add(positionWorld.z.mul(0.11)).add(time.mul(0.85)));
  const sway2 = sin(positionWorld.x.mul(0.07).sub(positionWorld.z.mul(0.13)).add(time.mul(0.55)));
  const carrier = sway1.mul(0.6).add(sway2.mul(0.4)).mul(float(0.4).add(gustEnv.mul(0.8)));
  const branchSway = carrier
    .mul(windStrength)
    .mul(0.12)
    .mul(branchWeight);
  const fogColor = vec3(...linearColor(treeBranch.fogColor ?? [0.5651, 0.6333, 0.6665])).mul(treeBranch.fogColorScale ?? 0.62);
  const fogBlend = smoothstep(treeBranch.fogNear ?? 220, treeBranch.fogFar ?? 700, length(positionView))
    .mul(treeBranch.fogStrength ?? 0.72);
  material.colorNode = mix(vec3(...color), fogColor, fogBlend);
  material.positionNode = positionLocal.add(vec3(windDir.x.mul(branchSway), 0.0, windDir.y.mul(branchSway)));
  material.userData.webgpuUsesSourceColor = treeBranch.baseColorLinear === true;
  material.userData.webgpuUsesDistanceFog = true;
  material.userData.webgpuTreeWindNodeUniforms = {
    windDirection: windDirectionNode,
    windStrength,
  };
  material.userData.webgpuTreeNodeMaterialControls = createTreeBranchNodeMaterialControls(material);
  material.roughnessNode = float(treeBranch.roughness ?? 0.94);
  material.metalnessNode = float(treeBranch.metalness ?? 0.0);
  material.side = treeBranch.side ?? material.side;
  material.transparent = treeBranch.transparent ?? material.transparent;
  material.depthWrite = treeBranch.depthWrite ?? material.depthWrite;
  material.depthTest = treeBranch.depthTest ?? material.depthTest;
  return material;
}

function createTreeBranchNodeMaterialControls(material) {
  const wind = material.userData.webgpuTreeWindNodeUniforms;
  return {
    wind,
    setWind(state = {}) {
      if (Number.isFinite(state.strength)) {
        wind.windStrength.value = state.strength;
      }
      const direction = state.direction;
      if (direction && wind.windDirection?.value) {
        wind.windDirection.value.set(direction.x, direction.y);
      }
    },
    dispose() {},
  };
}
