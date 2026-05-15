export function createKonveyorSheepWoolNodeMaterial({ MeshStandardNodeMaterial, TSL }, sheepWool) {
  const { abs, dot, float, floor, fract, length, max, mix, normalize, normalView, positionLocal, positionView, positionWorld, pow, sin, smoothstep, time, vec3 } = TSL;
  const hash31 = (p) => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
  const noisePos = positionWorld.mul(sheepWool.woolNoiseScale)
    .add(vec3(time.mul(0.2), time.mul(0.12), time.mul(0.08)));
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
  const woolDisplacement = woolNoise.mul(sheepWool.woolDisplacementStrength)
    .add(sin(time.mul(1.8)).mul(sheepWool.breathingStrength));
  const shaded = woolColor.mul(toon).mul(colorShift)
    .add(vec3(...sheepWool.rimColor).mul(fresnel.mul(0.35)))
    .add(vec3(...sheepWool.sssColor).mul(sss))
    .mul(float(1.0).sub(edge.mul(0.2)))
    .sub(vec3(0.03, 0.03, 0.03).mul(woolNoise.mul(1.5)));

  const material = new MeshStandardNodeMaterial();
  material.name = 'konveyor-node-sheep-wool';
  material.colorNode = mix(shaded, vec3(...sheepWool.fogColor), fogBlend);
  material.positionNode = positionLocal.add(normalize(positionLocal).mul(woolDisplacement));
  material.roughnessNode = float(0.98);
  material.metalnessNode = float(0.0);
  material.vertexColors = sheepWool.vertexColors ?? false;
  material.fog = sheepWool.fog ?? false;
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
