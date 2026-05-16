export function createKonveyorKilnImpostorNodeMaterial(
  { MeshBasicNodeMaterial, DoubleSide, TSL },
  kilnImpostor,
  albedoAtlas,
  normalAtlas,
  depthAtlas
) {
  const { clamp, dot, float, length, max, mix, normalize, smoothstep, texture, uv, positionView, vec2, vec3, vec4 } = TSL;
  const tileScaleX = 1 / kilnImpostor.tilesX;
  const tileScaleY = 1 / kilnImpostor.tilesY;
  const tileScale = vec2(tileScaleX, tileScaleY);
  const tileInset = vec2(
    0.5 / kilnImpostor.atlasSize[0] / tileScaleX,
    0.5 / kilnImpostor.atlasSize[1] / tileScaleY
  );
  const tileLocalUv = clamp(uv(), tileInset, vec2(1.0, 1.0).sub(tileInset));
  const tileUv = ([azIdx, elIdx]) => tileLocalUv.mul(tileScale)
    .add(vec2(azIdx / kilnImpostor.tilesX, (kilnImpostor.tilesY - 1 - elIdx) / kilnImpostor.tilesY));
  const [tile0, tile1, tile2] = kilnImpostor.tileBlendTiles;
  const [w0, w1, w2] = kilnImpostor.tileBlendWeights;
  const albedo0 = texture(albedoAtlas, tileUv(tile0));
  const albedo1 = texture(albedoAtlas, tileUv(tile1));
  const albedo2 = texture(albedoAtlas, tileUv(tile2));
  const alphaBlend = albedo0.a.mul(w0).add(albedo1.a.mul(w1)).add(albedo2.a.mul(w2));
  const albedoPremul = albedo0.rgb.mul(albedo0.a).mul(w0)
    .add(albedo1.rgb.mul(albedo1.a).mul(w1))
    .add(albedo2.rgb.mul(albedo2.a).mul(w2));
  const atlasRgb = albedoPremul.div(max(alphaBlend, 0.0001));
  const normal0 = texture(normalAtlas, tileUv(tile0)).rgb.mul(2.0).sub(vec3(1.0, 1.0, 1.0));
  const normal1 = texture(normalAtlas, tileUv(tile1)).rgb.mul(2.0).sub(vec3(1.0, 1.0, 1.0));
  const normal2 = texture(normalAtlas, tileUv(tile2)).rgb.mul(2.0).sub(vec3(1.0, 1.0, 1.0));
  const depthUnpack = vec4(
    255 / 256 / (256 * 256 * 256),
    255 / 256 / (256 * 256),
    255 / 256 / 256,
    255 / 256
  );
  const depth0 = dot(texture(depthAtlas, tileUv(tile0)).rgba, depthUnpack);
  const depth1 = dot(texture(depthAtlas, tileUv(tile1)).rgba, depthUnpack);
  const depth2 = dot(texture(depthAtlas, tileUv(tile2)).rgba, depthUnpack);
  const depthBlend = depth0.mul(w0).add(depth1.mul(w1)).add(depth2.mul(w2));
  const depthShade = mix(float(0.98), float(1.02), smoothstep(0.05, 0.95, depthBlend));
  const relightNormal = normalize(normal0.mul(w0).add(normal1.mul(w1)).add(normal2.mul(w2)));
  const sunDirection = normalize(vec3(...kilnImpostor.sunDirection));
  const wrappedSun = max(dot(relightNormal, sunDirection), 0.0).mul(0.65).add(0.35);
  const relitColor = atlasRgb.mul(
    vec3(...kilnImpostor.ambientColor).add(vec3(...kilnImpostor.sunColor).mul(wrappedSun.mul(0.42)))
  );
  const viewDistance = length(positionView);
  const fogBlend = smoothstep(kilnImpostor.fogNear, kilnImpostor.fogFar, viewDistance).mul(0.62);

  const material = new MeshBasicNodeMaterial();
  material.name = 'konveyor-node-kiln-impostor';
  material.colorNode = mix(relitColor.mul(depthShade), vec3(...kilnImpostor.fogColor), fogBlend);
  material.opacityNode = alphaBlend;
  material.transparent = kilnImpostor.transparent ?? true;
  material.depthWrite = kilnImpostor.depthWrite ?? true;
  material.depthTest = kilnImpostor.depthTest ?? true;
  material.side = kilnImpostor.side ?? DoubleSide;
  material.alphaHash = kilnImpostor.alphaHash ?? true;
  material.alphaTest = kilnImpostor.alphaTest;
  return material;
}
