export function createKonveyorSheepWoolNodeMaterial({ MeshStandardNodeMaterial, TSL }, sheepWool) {
  const { abs, attribute, cos, dot, float, floor, fract, length, max, mix, mod, normalize, normalLocal, normalView, positionLocal, positionView, positionWorld, pow, sin, smoothstep, step, time, vec3 } = TSL;
  const vertexId = attribute('vertexId', 'float');
  const instanceData = attribute('instanceData', 'vec4');
  const instanceAnimation = attribute('instanceAnimation', 'vec4');
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
  const fogBlend = smoothstep(sheepWool.fogNear, sheepWool.fogFar, viewDistance).mul(0.65);
  const bodyMask = float(1.0).sub(step(50.0, vertexId));
  const headMask = step(50.0, vertexId).mul(float(1.0).sub(step(100.0, vertexId)));
  const legMask = step(100.0, vertexId).mul(float(1.0).sub(step(140.0, vertexId)));
  const animPhase = instanceData.x;
  const speed = instanceData.y;
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
  const legOffset = vec3(
    0.0,
    max(legWave, 0.0).mul(bounce).mul(2.0).mul(speed).mul(legMask),
    legWave.mul(bounce).mul(0.3).mul(speed).mul(legMask)
  );
  const bodyOffset = vec3(
    sin(bodyTime.mul(2.5)).mul(bounce).mul(0.1).mul(speed).mul(bodyMask),
    sin(bodyTime.mul(2.0)).mul(bounce).mul(0.5).mul(speed).mul(bodyMask),
    0.0
  );
  const headOffset = vec3(
    sin(lookAngle).mul(0.1).mul(headMask),
    sin(headTime.mul(2.0)).mul(bounce).mul(0.3).mul(speed).mul(headMask),
    cos(lookAngle).mul(0.1).mul(headMask)
  );
  const woolDisplacement = woolNoise.mul(sheepWool.woolDisplacementStrength)
    .add(sin(time.mul(1.8).add(animPhase)).mul(sheepWool.breathingStrength))
    .mul(bodyMask);
  const shaded = woolColor.mul(toon).mul(colorShift)
    .add(vec3(...sheepWool.rimColor).mul(fresnel.mul(0.35)))
    .add(vec3(...sheepWool.sssColor).mul(sss))
    .mul(float(1.0).sub(edge.mul(0.2)))
    .sub(vec3(0.03, 0.03, 0.03).mul(woolNoise.mul(1.5)));

  const material = new MeshStandardNodeMaterial();
  material.name = 'konveyor-node-sheep-wool';
  material.colorNode = mix(shaded, vec3(...sheepWool.fogColor), fogBlend);
  material.positionNode = positionLocal
    .add(legOffset)
    .add(bodyOffset)
    .add(headOffset)
    .add(normalize(normalLocal).mul(woolDisplacement));
  material.roughnessNode = float(0.98);
  material.metalnessNode = float(0.0);
  material.vertexColors = sheepWool.vertexColors ?? false;
  material.fog = sheepWool.fog ?? false;
  material.userData.konveyorSheepAnimation = {
    source: 'vertexId-instanceData-instanceAnimation',
    body: true,
    head: true,
    legs: true,
    wool: true,
    animationSpeed: sheepWool.animationSpeed,
  };
  return material;
}

export function createKonveyorSheepPartNodeMaterial({ MeshStandardNodeMaterial, TSL }, name, color) {
  const { float, vec3 } = TSL;
  const material = new MeshStandardNodeMaterial();
  material.name = name;
  material.colorNode = vec3(...color);
  material.roughnessNode = float(0.92);
  material.metalnessNode = float(0.0);
  return material;
}
