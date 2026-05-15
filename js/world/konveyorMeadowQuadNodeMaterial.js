export function createKonveyorMeadowQuadNodeMaterial(
  { MeshLambertNodeMaterial, DoubleSide, TSL },
  meadowQuad
) {
  const { dot, floor, fract, length, mix, positionView, sin, smoothstep, uv, vec2, vec3 } = TSL;
  const baseColor = vec3(...meadowQuad.baseColor);
  const midColor = vec3(...meadowQuad.midColor);
  const tipColor = vec3(...meadowQuad.tipColor);
  const muv = uv().mul(meadowQuad.uvCellsPerChunk);
  const hashVector = vec2(...meadowQuad.noiseHashVector);
  const n1 = fract(sin(dot(floor(muv), hashVector)).mul(43758.5453));
  const n2 = fract(sin(dot(floor(muv.mul(2.0)), hashVector)).mul(43758.5453));
  const blend = mix(n1, n2, 0.5);
  const meadowColor = mix(
    mix(baseColor, midColor, blend),
    tipColor,
    smoothstep(0.6, 0.95, blend)
  );
  const fogBlend = smoothstep(meadowQuad.fogNear, meadowQuad.fogFar, length(positionView))
    .mul(meadowQuad.fogStrength);

  const material = new MeshLambertNodeMaterial();
  material.name = 'konveyor-node-meadow-quad';
  material.colorNode = mix(meadowColor, vec3(...meadowQuad.fogColor), fogBlend);
  material.side = DoubleSide;
  return material;
}
