// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector3 as ThreeVector3 } from 'three';

export function createWebGpuSheepWoolNodeMaterial({ MeshStandardNodeMaterial, Vector3 = ThreeVector3, TSL }, sheepWool) {
  const { abs, attribute, clamp, cos, dot, float, floor, fract, length, max, mix, mod, normalize, normalLocal, normalView, positionGeometry, positionLocal, positionView, positionWorld, pow, sin, smoothstep, step, time, uniform, vec3, vertexColor } = TSL;
  const vertexId = attribute('vertexId', 'float');
  const instanceData = attribute('instanceData', 'vec4');
  const instanceAnimation = attribute('instanceAnimation', 'vec4');
  const fogColor = uniform(new Vector3(...sheepWool.fogColor));
  const fogNear = uniform(sheepWool.fogNear);
  const fogFar = uniform(sheepWool.fogFar);
  const hash31 = (p) => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
  const noisePos = positionWorld.mul(sheepWool.woolNoiseScale)
    .add(vec3(time.mul(0.2).add(instanceData.w.mul(0.1)), time.mul(0.12), time.mul(0.08).add(instanceData.w.mul(0.2))));
  const woolNoise = hash31(floor(noisePos)).mul(0.5)
    .add(hash31(floor(noisePos.mul(2.2))).mul(0.3))
    .add(hash31(floor(noisePos.mul(4.1))).mul(0.2));
  const normal = normalize(normalView);
  const viewDir = normalize(positionView.negate());
  const lightDir = normalize(vec3(...sheepWool.lightDirection));
  const nDotL = dot(normal, lightDir);
  const toon = floor(smoothstep(-0.15, 0.15, nDotL).mul(0.55).add(0.45).mul(5.0)).div(5.0);
  const woolColor = vec3(...sheepWool.bodyColor)
    .sub(vec3(0.03, 0.03, 0.03).mul(float(1.0).sub(woolNoise)))
    .add(vec3(0.02, 0.02, 0.02).mul(woolNoise));
  const colorShift = mix(vec3(0.96, 0.97, 1.0), vec3(1.02, 1.02, 1.0), toon);
  const fresnel = pow(float(1.0).sub(abs(dot(viewDir, normal))), 2.8);
  const sss = pow(max(dot(lightDir.negate(), viewDir), 0.0), 3.0).mul(0.12);
  const edge = float(1.0).sub(pow(abs(dot(viewDir, normal)), 0.7));
  const viewDistance = length(positionView);
  const rimStrength = sheepWool.rimStrength ?? 0.48;
  const edgeDarkening = sheepWool.edgeDarkening ?? 0.14;
  const fogStrength = sheepWool.fogStrength ?? 0.65;
  const fogBlend = smoothstep(fogNear, fogFar, viewDistance).mul(fogStrength);
  const bodyMask = float(1.0).sub(step(50.0, vertexId));
  const headMask = step(50.0, vertexId).mul(float(1.0).sub(step(100.0, vertexId)));
  const legMask = step(100.0, vertexId).mul(float(1.0).sub(step(140.0, vertexId)));
  const animPhase = instanceData.x;
  const speed = clamp(instanceData.y, 0.0, 1.0);
  const walkCycle = instanceAnimation.x;
  const bounce = instanceAnimation.y;
  const legIndex = floor(vertexId.sub(100.0).div(10.0));
  const legPhase = step(2.0, legIndex).mul(Math.PI);
  const sidePhase = mod(legIndex, 2.0).mul(1.57);
  const legTime = time.mul(sheepWool.animationSpeed).add(animPhase).add(walkCycle);
  const legWave = sin(legTime.mul(3.0).add(legPhase).add(sidePhase));
  const bodyTime = time.mul(sheepWool.animationSpeed).add(animPhase);
  const headTime = bodyTime.add(0.5);
  const lookAngle = instanceAnimation.z;
  const lowerLegMask = float(1.0).sub(clamp(positionGeometry.y.div(0.62), 0.0, 1.0)).mul(legMask);
  const legSwing = legWave.mul(bounce).mul(speed);
  const legOffset = vec3(
    0.0,
    max(legWave, 0.0).mul(bounce).mul(0.24).mul(speed).mul(lowerLegMask),
    legSwing.mul(0.46).mul(lowerLegMask).add(legSwing.mul(0.10).mul(legMask))
  );
  const bodyOffset = vec3(
    sin(bodyTime.mul(2.5)).mul(bounce).mul(0.1).mul(speed).mul(bodyMask),
    sin(bodyTime.mul(2.0)).mul(bounce).mul(0.28).mul(speed).mul(bodyMask),
    0.0
  );
  const headOffset = vec3(
    sin(lookAngle).mul(0.1).mul(headMask),
    sin(headTime.mul(2.0)).mul(bounce).mul(0.16).mul(speed).mul(headMask),
    cos(lookAngle).mul(0.1).mul(headMask)
  );
  const woolDisplacement = woolNoise.mul(sheepWool.woolDisplacementStrength)
    .add(sin(time.mul(1.8).add(animPhase)).mul(sheepWool.breathingStrength))
    .mul(bodyMask);
  const partColor = vertexColor();
  const bodyWoolColor = woolColor.mul(toon).mul(colorShift)
    .add(vec3(...sheepWool.rimColor).mul(fresnel.mul(rimStrength)))
    .add(vec3(...sheepWool.sssColor).mul(sss))
    .mul(float(1.0).sub(edge.mul(edgeDarkening)))
    .sub(vec3(0.045, 0.045, 0.045).mul(woolNoise.mul(1.6)))
    .add(vec3(0.035, 0.035, 0.03).mul(float(1.0).sub(woolNoise)).mul(fresnel));
  const partShade = float(0.66).add(toon.mul(0.34));
  const shaded = mix(partColor.mul(partShade), bodyWoolColor, bodyMask);

  const material = new MeshStandardNodeMaterial();
  material.name = 'webgpu-node-sheep-wool';
  material.colorNode = mix(shaded, fogColor, fogBlend);
  material.positionNode = positionLocal
    .add(legOffset)
    .add(bodyOffset)
    .add(headOffset)
    .add(normalize(normalLocal).mul(woolDisplacement));
  material.roughnessNode = float(0.98);
  material.metalnessNode = float(0.0);
  material.vertexColors = sheepWool.vertexColors ?? false;
  material.fog = sheepWool.fog ?? false;
  material.userData.webgpuSheepAnimation = {
    source: 'vertexId-instanceData-instanceAnimation',
    body: true,
    head: true,
    legs: true,
    wool: true,
    animationSpeed: sheepWool.animationSpeed,
    legMotion: 'lower-leg-weighted-fore-aft-constrained-lift',
  };
  material.userData.webgpuSheepWool = {
    vertexColorSource: 'geometry-color-attribute',
    bodyOnlyWoolShading: true,
    bodyOnlyWoolDisplacement: true,
    silhouetteBreakup: 'normal-offset-plus-rim-color-breakup',
    fog: 'scene-synced-controls',
    rimStrength,
    edgeDarkening,
    fogStrength,
  };
  material.userData.webgpuSheepMaterialControls = createWebGpuSheepWoolNodeMaterialControls({
    fogColor,
    fogNear,
    fogFar,
    Vector3,
  });
  return material;
}

export function createWebGpuSheepPartNodeMaterial({ MeshStandardNodeMaterial, TSL }, name, color) {
  const { float, vec3 } = TSL;
  const material = new MeshStandardNodeMaterial();
  material.name = name;
  material.colorNode = vec3(...color);
  material.roughnessNode = float(0.92);
  material.metalnessNode = float(0.0);
  return material;
}

function createWebGpuSheepWoolNodeMaterialControls({ fogColor, fogNear, fogFar, Vector3 }) {
  return {
    nodes: {
      fogColor,
      fogNear,
      fogFar,
    },
    update({ sceneFog } = {}) {
      if (!sceneFog) return;
      if (sceneFog.color && fogColor?.value) {
        const rgb = sceneFog.color.toArray();
        if (fogColor.value.copy) {
          fogColor.value.copy(new Vector3(rgb[0], rgb[1], rgb[2]));
        } else {
          fogColor.value = rgb;
        }
      }
      if (sceneFog.isFog && Number.isFinite(sceneFog.near) && Number.isFinite(sceneFog.far)) {
        fogNear.value = sceneFog.near;
        fogFar.value = sceneFog.far;
      } else if (sceneFog.isFogExp2 && Number.isFinite(sceneFog.density) && sceneFog.density > 0) {
        fogNear.value = 18;
        fogFar.value = Math.max(42, Math.min(180, 1.732 / sceneFog.density));
      }
    },
    dispose() {},
  };
}
