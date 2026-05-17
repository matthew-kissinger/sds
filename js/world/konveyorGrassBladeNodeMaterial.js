import { Vector2 as ThreeVector2, Vector3 as ThreeVector3 } from 'three';

export function createKonveyorGrassBladeNodeMaterial(
  { MeshBasicNodeMaterial, MeshStandardNodeMaterial, DoubleSide, Vector2 = ThreeVector2, Vector3 = ThreeVector3, TSL },
  grassBlade
) {
  const { abs, cameraPosition, clamp, dot, float, length, max, mix, normalize, positionLocal, positionView, positionWorld, pow, sin, smoothstep, time, uniform, vec2, vec3 } = TSL;
  const linearColor = (color) => color.map((value) => (
    value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4
  ));
  const vector2 = (value) => (
    typeof Vector2 === 'function'
      ? new Vector2(value[0], value[1])
      : value
  );
  const vector3 = (value) => (
    typeof Vector3 === 'function'
      ? new Vector3(value[0], value[1], value[2])
      : value
  );
  const height01 = clamp(positionLocal.y.div(Math.max(grassBlade.bladeHeight, 0.001)), 0.0, 1.0);
  const windDirection = uniform(vector2(grassBlade.windDirection));
  const windStrength = uniform(grassBlade.windStrength);
  const sunDirection = uniform(vector3(grassBlade.sunDirection));
  const maxNodeInteractors = Math.max(1, Math.min(8, grassBlade.maxNodeInteractors ?? 4));
  const interactorPositions = Array.from({ length: maxNodeInteractors }, () => uniform(vector3([0, -10000, 0])));
  const interactorFacings = Array.from({ length: maxNodeInteractors }, () => uniform(vector2([0, 1])));
  const interactorTypes = Array.from({ length: maxNodeInteractors }, () => uniform(0));
  const interactorCount = uniform(0);
  const interactionRadius = uniform(grassBlade.interactionRadius ?? 2.2);
  const interactionStrength = uniform(grassBlade.interactionStrength ?? 0.6);
  const sheepInteractionRadius = uniform(grassBlade.sheepInteractionRadius ?? 2.5);
  const sheepInteractionStrength = uniform(grassBlade.sheepInteractionStrength ?? 0.4);
  const interactionVisualScaleValue = grassBlade.interactionVisualScale ?? 5.2;
  const interactionLaydownStrength = grassBlade.interactionLaydownStrength ?? 1.9;
  const interactionShadowStrength = grassBlade.interactionShadowStrength ?? 0.72;
  const interactionVisualScale = float(interactionVisualScaleValue);
  const windDir = normalize(windDirection);
  const windPerp = vec2(windDir.y.negate(), windDir.x);
  const windPower = height01.mul(height01);
  const worldX = positionWorld.x;
  const worldZ = positionWorld.z;
  const gustFlow = time.mul(grassBlade.windSpeed * 1.5);
  const gustA = sin(worldX.mul(0.045).add(worldZ.mul(0.038)).sub(gustFlow));
  const gustB = sin(worldX.mul(0.022).add(worldZ.mul(0.029)).add(1.7).sub(gustFlow.mul(0.72)));
  const gustEnv = smoothstep(-0.2, 1.0, gustA.mul(0.6).add(gustB.mul(0.4)));
  const swayTime = time.mul(grassBlade.windSpeed);
  const sway1 = sin(worldX.mul(0.13).add(worldZ.mul(0.09)).add(swayTime.mul(0.85)));
  const sway2 = sin(worldX.mul(0.07).sub(worldZ.mul(0.11)).add(swayTime.mul(0.55)).add(1.3));
  const sway = sway1.mul(0.6).add(sway2.mul(0.4));
  const carrier = float(0.45).add(sway.mul(0.5).mul(float(0.4).add(gustEnv.mul(0.8))));
  const tipMask = smoothstep(0.65, 1.0, height01);
  const flutter = sin(worldX.mul(0.7).add(worldZ.mul(0.6)).add(time.mul(4.5)));
  const windDisp = windDir.mul(carrier.mul(windStrength).mul(windPower))
    .add(windPerp.mul(flutter.mul(windStrength).mul(0.06).mul(tipMask)));
  let interactionDisp = vec2(0.0, 0.0);
  let bodyFalloffTotal = float(0.0);
  for (let i = 0; i < maxNodeInteractors; i++) {
    const interactorPosition = interactorPositions[i];
    const entityType = clamp(interactorTypes[i], 0.0, 1.0);
    const interactorDelta = vec2(worldX.sub(interactorPosition.x), worldZ.sub(interactorPosition.z));
    const interactorDistance = max(length(interactorDelta), 0.001);
    const pushDirection = interactorDelta.div(interactorDistance);
    const facing = normalize(interactorFacings[i]);
    const side = vec2(facing.y.negate(), facing.x);
    const along = abs(dot(interactorDelta, facing));
    const across = abs(dot(interactorDelta, side));
    const halfLen = mix(1.65, 0.72, entityType);
    const halfWidth = mix(0.78, 0.56, entityType);
    const bodyDistance = length(vec2(along.div(halfLen), across.div(halfWidth)));
    const activeInteractor = smoothstep(i + 0.5, i + 0.95, interactorCount);
    const radius = mix(interactionRadius, sheepInteractionRadius, entityType);
    const strength = mix(interactionStrength, sheepInteractionStrength, entityType).mul(interactionVisualScale);
    const bodyFalloff = float(1.0).sub(smoothstep(0.15, radius, bodyDistance));
    const proximityFalloff = float(1.0).sub(smoothstep(0.0, radius, interactorDistance));
    const contactFalloff = max(bodyFalloff, proximityFalloff.mul(0.92)).mul(activeInteractor);
    interactionDisp = interactionDisp.add(pushDirection.mul(contactFalloff.mul(strength).mul(windPower)));
    bodyFalloffTotal = max(bodyFalloffTotal, contactFalloff);
  }
  const tipColor = mix(
    vec3(...linearColor(grassBlade.tipColor)),
    vec3(...linearColor(grassBlade.midColor)),
    grassBlade.tipDampen ?? 0.36
  );
  const gradient = mix(
    mix(vec3(...linearColor(grassBlade.baseColor)), vec3(...linearColor(grassBlade.midColor)), smoothstep(0.0, 0.4, height01)),
    tipColor,
    smoothstep(0.4, 1.0, height01)
  );
  const colorVariation = smoothstep(-1.0, 1.0, sin(worldX.mul(0.2).add(worldZ.mul(0.15))));
  const variation = vec3(
    colorVariation.mul(0.08),
    colorVariation.mul(0.05).sub(0.02),
    colorVariation.mul(-0.03)
  );
  const ao = mix(0.7, 1.0, height01);
  const toCamera = normalize(cameraPosition.sub(positionWorld));
  const toSun = normalize(sunDirection);
  const backlitSun = pow(max(dot(toCamera, toSun.mul(-1.0)), 0.0), 4.0);
  const sunTip = tipColor.mul(backlitSun.mul(0.7).mul(tipMask));
  const verticalRim = pow(max(dot(toCamera, vec3(0.0, 1.0, 0.0)), 0.0), 4.0);
  const viewDistance = length(positionView);
  const fogBlend = smoothstep(grassBlade.fogNear, grassBlade.fogFar, viewDistance).mul(0.55);
  const densityFade = float(1.0).sub(
    smoothstep(grassBlade.grassFadeStart, grassBlade.grassFadeEnd, viewDistance)
      .mul(grassBlade.distanceFadeStrength)
  );
  const colorScale = grassBlade.colorScale ?? 1;
  const interactionShadow = float(1.0).sub(bodyFalloffTotal.mul(interactionShadowStrength).mul(smoothstep(0.15, 1.0, height01)));
  const grassColor = gradient.add(variation).mul(ao).mul(interactionShadow)
    .add(sunTip)
    .add(tipColor.mul(verticalRim.mul(0.2).mul(tipMask)))
    .mul(colorScale);

  const MaterialClass = MeshBasicNodeMaterial ?? MeshStandardNodeMaterial;
  const material = new MaterialClass();
  material.name = 'konveyor-node-grass-blade';
  material.colorNode = mix(
    grassColor,
    vec3(...linearColor(grassBlade.fogColor)),
    fogBlend
  );
  material.opacityNode = densityFade;
  const totalDisp = windDisp.add(interactionDisp);
  const laydownMask = smoothstep(0.08, 1.0, height01);
  const interactionLaydown = bodyFalloffTotal.mul(-interactionLaydownStrength).mul(laydownMask);
  material.positionNode = positionLocal.add(vec3(totalDisp.x, interactionLaydown, totalDisp.y));
  if (material.isMeshStandardNodeMaterial) {
    material.roughnessNode = float(0.96);
    material.metalnessNode = float(0.0);
  }
  material.alphaHash = grassBlade.alphaHash;
  material.alphaTest = grassBlade.alphaTest;
  material.side = grassBlade.side ?? DoubleSide;
  material.transparent = grassBlade.transparent ?? false;
  material.depthWrite = grassBlade.depthWrite ?? true;
  material.depthTest = grassBlade.depthTest ?? true;
  material.toneMapped = true;
  material.userData.konveyorGrassBladeFog = {
    color: grassBlade.fogColor,
    near: grassBlade.fogNear,
    far: grassBlade.fogFar,
  };
  material.userData.konveyorGrassColorScale = colorScale;
  material.userData.konveyorGrassLighting = material.isMeshBasicNodeMaterial
    ? 'shader-owned-unlit'
    : 'standard-fallback';
  material.userData.konveyorGrassBladeNodeUniforms = {
    windDirection,
    windStrength,
    sunDirection,
    interactorPositions,
    interactorFacings,
    interactorTypes,
    interactorCount,
    interactionRadius,
    interactionStrength,
    sheepInteractionRadius,
    sheepInteractionStrength,
    maxNodeInteractors,
  };
  material.userData.konveyorGrassBladeInteractors = {
    maxNodeInteractors,
    source: 'dog-plus-nearest-sheep-unrolled',
    displacement: 'world-proximity-laydown-plus-horizontal-push',
    visualScale: interactionVisualScaleValue,
    laydownStrength: interactionLaydownStrength,
    shadowStrength: interactionShadowStrength,
  };
  material.userData.konveyorGrassBladeMaterialControls = createKonveyorGrassBladeNodeMaterialControls(material);
  return material;
}

function createKonveyorGrassBladeNodeMaterialControls(material) {
  const nodes = material.userData.konveyorGrassBladeNodeUniforms;
  return {
    nodes,
    updateInteractors(state = {}) {
      const count = Math.max(0, Math.min(nodes.maxNodeInteractors, Number.isFinite(state.count) ? state.count : 0));
      nodes.interactorCount.value = count;
      if (count <= 0) return;
      const positions = state.positions;
      const facings = state.facings;
      const data = state.data;
      for (let i = 0; i < count; i++) {
        const pIdx = i * 3;
        const fIdx = i * 2;
        if (nodes.interactorPositions[i]?.value && positions?.length >= pIdx + 3) {
          nodes.interactorPositions[i].value.set(positions[pIdx], positions[pIdx + 1], positions[pIdx + 2]);
        }
        if (nodes.interactorFacings[i]?.value && facings?.length >= fIdx + 2) {
          nodes.interactorFacings[i].value.set(facings[fIdx], facings[fIdx + 1]);
        }
        if (nodes.interactorTypes[i]) {
          nodes.interactorTypes[i].value = data?.[i] ?? 0;
        }
      }
    },
    update() {},
    setWind(state = {}) {
      if (Number.isFinite(state.strength)) {
        nodes.windStrength.value = state.strength;
      }
      const direction = state.direction;
      if (direction && nodes.windDirection?.value) {
        nodes.windDirection.value.set(direction.x, direction.y);
      }
    },
    setSunDirection(state = {}) {
      copyNodeValue(nodes.sunDirection, state.sunDir);
    },
    dispose() {},
  };
}

function copyNodeValue(node, value) {
  if (!node?.value || !value || typeof node.value.copy !== 'function') return;
  node.value.copy(value);
}
