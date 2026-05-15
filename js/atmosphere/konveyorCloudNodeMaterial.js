export function createKonveyorCloudLayerNodeMaterial(
  { MeshBasicNodeMaterial, DoubleSide, TSL },
  { name = 'konveyor-node-cloud-layer', uniforms = null } = {}
) {
  const { dot, float, floor, fract, max, min, mix, normalize, smoothstep, time, uniform, uv, vec2, vec3 } = TSL;
  const hash21 = (p) => {
    const q = fract(p.mul(vec2(123.34, 456.21)));
    const r = q.add(dot(q, q.add(45.32)));
    return fract(r.x.mul(r.y));
  };
  const valueNoise = (p) => {
    const i = floor(p);
    const f = fract(p);
    const a = hash21(i);
    const b = hash21(i.add(vec2(1.0, 0.0)));
    const c = hash21(i.add(vec2(0.0, 1.0)));
    const d = hash21(i.add(vec2(1.0, 1.0)));
    const u = f.mul(f).mul(vec2(3.0, 3.0).sub(f.mul(2.0)));
    return mix(a, b, u.x)
      .add(c.sub(a).mul(u.y).mul(u.x.oneMinus()))
      .add(d.sub(b).mul(u.x).mul(u.y));
  };
  const fbm = (p) => valueNoise(p).mul(0.5)
    .add(valueNoise(p.mul(2.03)).mul(0.25))
    .add(valueNoise(p.mul(4.1209)).mul(0.125))
    .add(valueNoise(p.mul(8.365427)).mul(0.0625))
    .add(valueNoise(p.mul(16.982817)).mul(0.03125));

  const planeUv = uv();
  const coverage = uniform(uniforms?.uCoverage?.value ?? 0.62);
  const edgeFade = uniform(uniforms?.uEdgeFade?.value ?? 1);
  const noiseScale = uniform(uniforms?.uNoiseScale?.value ?? (1 / 900));
  const timeSeconds = uniform(uniforms?.uTimeSeconds?.value ?? 0);
  const windDir = uniforms?.uWindDir?.value
    ? uniform(uniforms.uWindDir.value.clone())
    : vec2(0.7, 0.7);
  const sunDirection = uniforms?.uSunDirection?.value
    ? uniform(uniforms.uSunDirection.value.clone())
    : normalize(vec3(0.42, 0.78, 0.32));
  const sunColor = uniforms?.uSunColor?.value
    ? uniform(uniforms.uSunColor.value.clone())
    : vec3(1.0, 0.86, 0.62);
  const windTime = uniforms ? timeSeconds : time;
  const wind = normalize(windDir).mul(windTime.mul(0.035));
  const noiseUv = planeUv.mul(noiseScale.mul(4050.0)).add(wind);
  const bigField = float(0.5).add(smoothstep(0.2, 0.7, fbm(noiseUv.mul(0.2))).mul(0.5));
  const base = fbm(noiseUv);
  const lowerEdge = mix(1.0, -0.4, coverage);
  const mask = smoothstep(lowerEdge, lowerEdge.add(0.35), base).mul(bigField);
  const e = float(0.18);
  const nx = fbm(noiseUv.add(vec2(e, 0.0))).sub(fbm(noiseUv.sub(vec2(e, 0.0))));
  const nz = fbm(noiseUv.add(vec2(0.0, e))).sub(fbm(noiseUv.sub(vec2(0.0, e))));
  const puffNormal = normalize(vec3(nx.negate(), 0.5, nz.negate()));
  const sunLight = max(0.0, dot(puffNormal, sunDirection));
  const shade = mix(0.55, 1.15, sunLight);
  const cloudColor = vec3(0.95, 0.95, 0.98).mul(mix(sunColor, vec3(1.0, 1.0, 1.0), 0.5)).mul(shade);
  const edgeDist = min(min(planeUv.x, planeUv.x.oneMinus()), min(planeUv.y, planeUv.y.oneMinus()));
  const footprintFade = smoothstep(0.0, 0.08, edgeDist);
  const alpha = mask.mul(mix(0.55, 0.95, coverage)).mul(footprintFade).mul(edgeFade);

  const material = new MeshBasicNodeMaterial();
  material.name = name;
  material.colorNode = cloudColor;
  material.opacityNode = alpha;
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.side = DoubleSide;
  material.userData.konveyorCloudLayerNodeUniforms = {
    coverage,
    edgeFade,
    noiseScale,
    timeSeconds,
    windDir,
    sunDirection,
    sunColor,
  };
  return material;
}

export function createKonveyorCloudLayerNodeMaterialResult(webGpuModules, options = {}) {
  const material = createKonveyorCloudLayerNodeMaterial(webGpuModules, options);
  const controls = createKonveyorCloudLayerNodeMaterialControls(material);
  return { material, controls };
}

export function createKonveyorCloudLayerMaterialFactories(webGpuModules) {
  return {
    createCloudLayerMaterial: (context = {}) =>
      createKonveyorCloudLayerNodeMaterialResult(webGpuModules, {
        uniforms: context.uniforms,
      }),
  };
}

function createKonveyorCloudLayerNodeMaterialControls(material) {
  const nodes = material.userData.konveyorCloudLayerNodeUniforms;
  return {
    nodes,
    update(state = {}) {
      setNodeNumber(nodes.coverage, state.coverage);
      setNodeNumber(nodes.edgeFade, state.edgeFade);
      setNodeNumber(nodes.noiseScale, state.noiseScale);
      setNodeNumber(nodes.timeSeconds, state.timeSeconds);
      copyNodeValue(nodes.windDir, state.windDir);
      copyNodeValue(nodes.sunDirection, state.sunDirection);
      copyNodeValue(nodes.sunColor, state.sunColor);
    },
  };
}

function setNodeNumber(node, value) {
  if (Number.isFinite(value)) {
    node.value = value;
  }
}

function copyNodeValue(node, value) {
  if (!node?.value || !value || typeof node.value.copy !== 'function') return;
  node.value.copy(value);
}
