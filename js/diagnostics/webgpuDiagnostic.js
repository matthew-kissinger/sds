import {
    replaceRockMaterialsByTraversal,
    replaceTreeMaterialsByName,
} from './webgpuMaterialReplacement.js';
import { createSkyFogSamplePacket } from '../atmosphere/skyFogSamplePacket.js';
import { createRuntimeGlbMaterialReplacementProof } from './webgpuGlbMaterialProof.js';
import { createRuntimeGlbPreview } from './webgpuRuntimeGlbPreview.js';

const DIAGNOSTIC_WATER_PALETTE_RGB = Object.freeze({
    shallow: [0x6f, 0xd7, 0xd2],
    deep: [0x10, 0x36, 0x62],
    foam: [0xea, 0xf6, 0xff],
});

const DIAGNOSTIC_FOAM_THICKNESS = 2.5;

function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}

function computeDiagnosticShorelineMetrics({
    x,
    z,
    centerX = 0,
    centerZ = 0,
    boundaryRadius,
    boundaryFalloff,
    foamThickness = DIAGNOSTIC_FOAM_THICKNESS,
}) {
    const falloff = Math.max(boundaryFalloff, 0.001);
    const radialDistance = Math.hypot(x - centerX, z - centerZ);
    const distanceFromShore = Math.abs(radialDistance - boundaryRadius);
    const depthT = clamp01(distanceFromShore / falloff);
    const foamMask = distanceFromShore < foamThickness ? 1 : 0;

    return {
        radialDistance,
        distanceFromShore,
        depthT,
        foamMask,
    };
}

function mixDiagnosticWaterBaseColor(depthT) {
    const t = clamp01(depthT);
    return DIAGNOSTIC_WATER_PALETTE_RGB.shallow.map((channel, index) => {
        const deep = DIAGNOSTIC_WATER_PALETTE_RGB.deep[index];
        return Math.round(channel + (deep - channel) * t);
    });
}

async function loadWebGpuThree() {
    const webGpuModulePath = './vendor/three/three.webgpu.min.js';
    return import(/* @vite-ignore */ new URL(webGpuModulePath, import.meta.url).href);
}

function createSunBillboardNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, TSL }) {
    const { float, length, pow, smoothstep, uv, vec2, vec3 } = TSL;
    const d = uv().sub(vec2(0.5, 0.5));
    const r = length(d).mul(2.0);
    const core = float(1.0).sub(smoothstep(0.12, 0.22, r));
    const haloFalloff = float(1.0).sub(smoothstep(0.0, 1.0, r));
    const halo = pow(haloFalloff, 2.5).mul(0.45);
    const intensity = float(1.1);
    const rgb = vec3(1.0, 0.97, 0.88).mul(core)
        .add(vec3(1.0, 0.82, 0.55).mul(halo))
        .mul(intensity);
    const alpha = core.add(halo.mul(0.7)).mul(intensity).mul(haloFalloff);

    const material = new MeshBasicNodeMaterial();
    material.colorNode = rgb;
    material.opacityNode = alpha;
    material.transparent = true;
    material.depthWrite = false;
    material.depthTest = true;
    material.blending = AdditiveBlending;
    return material;
}

function createPortalRingNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, DoubleSide, TSL }) {
    const { abs, float, mix, sin, smoothstep, time, uv, vec3 } = TSL;
    const ringUv = uv();
    const radial = ringUv.y;
    const phase = ringUv.x.mul(6.2831853).add(time.mul(0.9));
    const innerColor = vec3(0.424, 0.949, 1.0);
    const outerColor = vec3(0.608, 0.424, 1.0);
    const base = float(0.55).add(sin(phase).mul(0.35));
    const pulseGlow = float(0.35).mul(float(1.0).sub(smoothstep(0.0, 1.0, abs(radial.sub(0.5)).mul(2.0))));
    const intensity = base.add(pulseGlow.mul(0.9)).mul(0.85);
    const edge = smoothstep(0.0, 0.18, radial)
        .mul(float(1.0).sub(smoothstep(0.82, 1.0, radial)));

    const material = new MeshBasicNodeMaterial();
    material.colorNode = mix(innerColor, outerColor, radial).mul(intensity);
    material.opacityNode = intensity.mul(edge);
    material.transparent = true;
    material.depthWrite = false;
    material.depthTest = true;
    material.side = DoubleSide;
    material.blending = AdditiveBlending;
    return material;
}

function createMeadowQuadNodeMaterial({ MeshLambertNodeMaterial, DoubleSide, TSL }) {
    const { dot, floor, fract, mix, sin, smoothstep, uv, vec2, vec3 } = TSL;
    const baseColor = vec3(0.176, 0.345, 0.118);
    const midColor = vec3(0.318, 0.565, 0.188);
    const tipColor = vec3(0.643, 0.792, 0.337);
    const muv = uv().mul(5.0);
    const hashVector = vec2(127.1, 311.7);
    const n1 = fract(sin(dot(floor(muv), hashVector)).mul(43758.5453));
    const n2 = fract(sin(dot(floor(muv.mul(2.0)), hashVector)).mul(43758.5453));
    const blend = mix(n1, n2, 0.5);

    const material = new MeshLambertNodeMaterial();
    material.colorNode = mix(
        mix(baseColor, midColor, blend),
        tipColor,
        smoothstep(0.6, 0.95, blend)
    );
    material.side = DoubleSide;
    return material;
}

function createCloudPlaneNodeMaterial({ MeshBasicNodeMaterial, DoubleSide, TSL }) {
    const { dot, float, floor, fract, max, min, mix, normalize, smoothstep, time, uv, vec2, vec3 } = TSL;
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
    const coverage = float(0.62);
    const wind = normalize(vec2(0.7, 0.7)).mul(time.mul(0.035));
    const noiseUv = planeUv.mul(4.5).add(wind);
    const bigField = float(0.5).add(smoothstep(0.2, 0.7, fbm(noiseUv.mul(0.2))).mul(0.5));
    const base = fbm(noiseUv);
    const lowerEdge = mix(1.0, -0.4, coverage);
    const mask = smoothstep(lowerEdge, lowerEdge.add(0.35), base).mul(bigField);
    const e = float(0.18);
    const nx = fbm(noiseUv.add(vec2(e, 0.0))).sub(fbm(noiseUv.sub(vec2(e, 0.0))));
    const nz = fbm(noiseUv.add(vec2(0.0, e))).sub(fbm(noiseUv.sub(vec2(0.0, e))));
    const puffNormal = normalize(vec3(nx.negate(), 0.5, nz.negate()));
    const sunDirection = normalize(vec3(0.42, 0.78, 0.32));
    const sunColor = vec3(1.0, 0.86, 0.62);
    const sunLight = max(0.0, dot(puffNormal, sunDirection));
    const shade = mix(0.55, 1.15, sunLight);
    const cloudColor = vec3(0.95, 0.95, 0.98).mul(mix(sunColor, vec3(1.0, 1.0, 1.0), 0.5)).mul(shade);
    const edgeDist = min(min(planeUv.x, planeUv.x.oneMinus()), min(planeUv.y, planeUv.y.oneMinus()));
    const footprintFade = smoothstep(0.0, 0.08, edgeDist);
    const alpha = mask.mul(mix(0.55, 0.95, coverage)).mul(footprintFade);

    const material = new MeshBasicNodeMaterial();
    material.colorNode = cloudColor;
    material.opacityNode = alpha;
    material.transparent = true;
    material.depthWrite = false;
    material.depthTest = true;
    material.side = DoubleSide;
    return material;
}

export function createSkyFogDiagnosticState() {
    return createSkyFogSamplePacket();
}

export function createRockRimDiagnosticState(skyFog = createSkyFogDiagnosticState()) {
    return {
        baseColor: [0.34, 0.32, 0.27],
        rimColor: skyFog.sunColor,
        rimStrength: 0.48,
        rimPower: 2.0,
        sunColorSource: 'skyFog.sunColor',
    };
}

function normalizedRgb(rgb) {
    return rgb.map((channel) => Number((channel / 255).toFixed(4)));
}

export function createAnimeWaterDiagnosticState(skyFog = createSkyFogDiagnosticState()) {
    const nearShoreMetrics = computeDiagnosticShorelineMetrics({
        x: 0,
        z: 0,
        boundaryRadius: 0,
        boundaryFalloff: 12,
        foamThickness: DIAGNOSTIC_FOAM_THICKNESS,
    });
    const farWaterMetrics = computeDiagnosticShorelineMetrics({
        x: 12,
        z: 0,
        boundaryRadius: 0,
        boundaryFalloff: 12,
        foamThickness: DIAGNOSTIC_FOAM_THICKNESS,
    });

    return {
        shallowColor: normalizedRgb(DIAGNOSTIC_WATER_PALETTE_RGB.shallow),
        deepColor: normalizedRgb(DIAGNOSTIC_WATER_PALETTE_RGB.deep),
        foamColor: normalizedRgb(DIAGNOSTIC_WATER_PALETTE_RGB.foam),
        nearShoreColor: normalizedRgb(mixDiagnosticWaterBaseColor(nearShoreMetrics.depthT)),
        farWaterColor: normalizedRgb(mixDiagnosticWaterBaseColor(farWaterMetrics.depthT)),
        fogColor: skyFog.fogColor,
        sunColor: skyFog.sunColor,
        sunDirection: skyFog.sunDirection,
        foamThickness: DIAGNOSTIC_FOAM_THICKNESS,
        rippleStrength: 1.0,
        sparkleStrength: 0.7,
        heightfieldSampling: 'deferred',
    };
}

export function createTreeLeafDiagnosticState() {
    return {
        baseColor: [0.18, 0.34, 0.12],
        tipColor: [0.50, 0.68, 0.24],
        windDirection: [0.7, 0.7],
        windStrength: 0.72,
        treeBaseY: -0.525,
        treeTopY: 0.525,
        alphaHash: true,
        alphaTest: 0.08,
        occluderStrength: 0.55,
        occluderPeak: 0.62,
        occluderUv: [0.5, 0.42],
    };
}

function createAnimeWaterNodeMaterial({ MeshBasicNodeMaterial, DoubleSide, TSL }, water) {
    const { dot, float, floor, fract, length, mix, pow, sin, smoothstep, time, uv, vec2, vec3 } = TSL;
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

    const waterUv = uv();
    const depthT = smoothstep(0.18, 0.92, waterUv.y);
    const rippleUv = waterUv.mul(vec2(7.5, 3.8)).add(vec2(time.mul(0.08), time.mul(0.04)));
    const rippleA = valueNoise(rippleUv);
    const rippleB = valueNoise(rippleUv.mul(2.35).add(vec2(time.mul(0.05), time.mul(-0.03))));
    const ripple = smoothstep(0.56, 0.66, rippleA.mul(0.68).add(rippleB.mul(0.32)))
        .mul(water.rippleStrength * 0.08);
    const foamNoise = valueNoise(waterUv.mul(vec2(18.0, 3.0)).add(vec2(time.mul(0.07), 0.0)));
    const foamBand = float(1.0).sub(smoothstep(0.10, 0.22, waterUv.y.add(foamNoise.mul(0.04))));
    const glintDelta = waterUv.sub(vec2(0.72, 0.64));
    const glint = pow(float(1.0).sub(smoothstep(0.0, 0.42, length(glintDelta))), 4.0)
        .mul(water.sparkleStrength);
    const fogBlend = smoothstep(0.56, 1.0, waterUv.y).mul(0.36);
    const baseColor = mix(vec3(...water.shallowColor), vec3(...water.deepColor), depthT)
        .add(vec3(ripple, ripple, ripple))
        .add(vec3(...water.sunColor).mul(glint.mul(0.35)));
    const colorWithFoam = mix(baseColor, vec3(...water.foamColor), foamBand);

    const material = new MeshBasicNodeMaterial();
    material.name = 'konveyor-node-anime-water';
    material.colorNode = mix(colorWithFoam, vec3(...water.fogColor), fogBlend);
    material.side = DoubleSide;
    material.depthWrite = true;
    material.depthTest = true;
    return material;
}

function createSkyFogNodeMaterial({ MeshBasicNodeMaterial, TSL }, skyFog) {
    const { float, length, mix, pow, smoothstep, uv, vec2, vec3 } = TSL;
    const skyUv = uv();
    const horizon = vec3(...skyFog.horizonColor);
    const zenith = vec3(...skyFog.zenithColor);
    const sunColor = vec3(...skyFog.sunColor);
    const fogColor = vec3(...skyFog.fogColor);
    const vertical = smoothstep(0.02, 0.92, skyUv.y);
    const sunDelta = skyUv.sub(vec2(...skyFog.sunPositionUv));
    const sunDistance = length(sunDelta);
    const sunDisc = float(1.0).sub(smoothstep(0.018, 0.052, sunDistance));
    const sunGlow = pow(float(1.0).sub(smoothstep(0.0, 0.42, sunDistance)), 2.2);
    const fogBand = float(1.0).sub(smoothstep(0.12, 0.48, skyUv.y));
    const skyColor = mix(horizon, zenith, vertical)
        .add(sunColor.mul(sunGlow.mul(0.42)))
        .add(vec3(1.0, 0.95, 0.82).mul(sunDisc.mul(0.7)));

    const material = new MeshBasicNodeMaterial();
    material.colorNode = mix(skyColor, fogColor, fogBand.mul(0.58));
    material.depthWrite = false;
    material.depthTest = false;
    return material;
}

function createTreeLeafNodeMaterial({ MeshStandardNodeMaterial, DoubleSide, TSL }, treeLeaf) {
    const { abs, clamp, dot, float, floor, fract, length, mix, normalize, positionLocal, positionWorld, screenCoordinate, sin, smoothstep, time, uv, vec2, vec3 } = TSL;
    const leafUv = uv();
    const windDir = normalize(vec2(...treeLeaf.windDirection));
    const windPerp = vec2(-treeLeaf.windDirection[1], treeLeaf.windDirection[0]);
    const treeRange = Math.max(treeLeaf.treeTopY - treeLeaf.treeBaseY, 0.001);
    const posY01 = clamp(positionLocal.y.sub(treeLeaf.treeBaseY).div(treeRange), 0.0, 1.0);
    const windWeightBase = smoothstep(0.25, 1.0, posY01);
    const windWeight = windWeightBase.mul(windWeightBase);
    const worldX = positionWorld.x;
    const worldZ = positionWorld.z;
    const gustA = sin(worldX.mul(0.04).add(worldZ.mul(0.034)).sub(time.mul(0.84)));
    const gustB = sin(worldX.mul(0.018).add(worldZ.mul(0.022)).add(1.4).sub(time.mul(0.62)));
    const gustEnv = smoothstep(-0.2, 1.0, gustA.mul(0.6).add(gustB.mul(0.4)));
    const sway1 = sin(worldX.mul(0.15).add(worldZ.mul(0.11)).add(time.mul(0.85)));
    const sway2 = sin(worldX.mul(0.07).sub(worldZ.mul(0.13)).add(time.mul(0.55)));
    const sway = sway1.mul(0.6).add(sway2.mul(0.4));
    const carrier = sway.mul(float(0.4).add(gustEnv.mul(0.8)));
    const flutter = sin(worldX.mul(0.6).add(worldZ.mul(0.5)).add(time.mul(4.5)));
    const windDisp = windDir.mul(carrier.mul(treeLeaf.windStrength * 0.18).mul(windWeight))
        .add(windPerp.mul(flutter.mul(0.05 * treeLeaf.windStrength).mul(windWeight)));
    const leafCenter = leafUv.sub(vec2(0.5, 0.52));
    const leafRadius = length(vec2(leafCenter.x.mul(1.28), leafCenter.y.mul(0.82)));
    const leafShape = float(1.0).sub(smoothstep(0.42, 0.56, leafRadius));
    const midrib = float(1.0).sub(smoothstep(0.25, 0.85, abs(leafUv.x.sub(0.5)).mul(2.0)));
    const screenHash = fract(sin(dot(floor(screenCoordinate), vec2(17.0, 131.0))).mul(43758.5453));
    const occluderFade = float(1.0)
        .sub(smoothstep(0.16, 0.36, length(leafUv.sub(vec2(...treeLeaf.occluderUv)))))
        .mul(treeLeaf.occluderStrength);
    const alpha = leafShape
        .mul(float(1.0).sub(occluderFade.mul(treeLeaf.occluderPeak).mul(mix(0.65, 1.0, screenHash))));

    const material = new MeshStandardNodeMaterial();
    material.name = 'konveyor-node-leaves';
    material.colorNode = mix(vec3(...treeLeaf.baseColor), vec3(...treeLeaf.tipColor), posY01)
        .mul(mix(0.72, 1.14, midrib));
    material.opacityNode = alpha;
    material.positionNode = positionLocal.add(vec3(windDisp.x, 0.0, windDisp.y));
    material.roughnessNode = float(0.92);
    material.metalnessNode = float(0.0);
    material.alphaHash = treeLeaf.alphaHash;
    material.alphaTest = treeLeaf.alphaTest;
    material.side = DoubleSide;
    return material;
}

function createRockRimNodeMaterial({ MeshStandardNodeMaterial, TSL }, rockRim) {
    const { dot, float, max, normalize, normalView, positionView, pow, vec3 } = TSL;
    const viewDir = normalize(positionView.negate());
    const ndv = max(dot(viewDir, normalView), 0.0);
    const rim = pow(float(1.0).sub(ndv), rockRim.rimPower).mul(rockRim.rimStrength);

    const material = new MeshStandardNodeMaterial();
    material.name = 'konveyor-node-rock-rim';
    material.colorNode = vec3(...rockRim.baseColor);
    material.emissiveNode = vec3(...rockRim.rimColor).mul(rim);
    material.roughnessNode = float(0.86);
    material.metalnessNode = float(0.0);
    return material;
}

function createTreeBranchNodeMaterial({ MeshStandardNodeMaterial, TSL }) {
    const { float, vec3 } = TSL;
    const material = new MeshStandardNodeMaterial();
    material.name = 'konveyor-node-branches';
    material.colorNode = vec3(0.20, 0.11, 0.055);
    material.roughnessNode = float(0.94);
    material.metalnessNode = float(0.0);
    return material;
}

export async function bootWebGpuDiagnostic() {
    const skyFog = createSkyFogDiagnosticState();
    const rockRim = createRockRimDiagnosticState(skyFog);
    const animeWater = createAnimeWaterDiagnosticState(skyFog);
    const treeLeaf = createTreeLeafDiagnosticState();
    const state = window.__sdsG = {
        ...(window.__sdsG || {}),
        r: true,
        requested: true,
        ok: false,
        renderer: 'webgpu',
        islands: ['sun-billboard', 'portal-ring', 'meadow-quad', 'cloud-plane', 'sky-fog', 'rock-rim', 'tree-leaf', 'anime-water', 'glb-material-replacement', 'runtime-glb-material-proof', 'runtime-glb-rendered-clones', 'production-placement-preview', 'production-instanced-tree-preview', 'diagnostic-rock-instancing-preview'],
        skyFog,
        rockRim,
        animeWater,
        treeLeaf,
        materialReplacement: null,
        runtimeGlbReplacement: null,
        runtimeGlbPreview: null,
        productionPlacementPreview: null,
        productionInstancingPreview: null,
        diagnosticRockPlacementPreview: null,
        diagnosticRockInstancingPreview: null,
        frames: 0,
    };

    const container = document.getElementById('canvas-container') || document.body;
    container.replaceChildren();

    const status = document.createElement('div');
    status.style.cssText = 'position:fixed;left:16px;top:16px;z-index:50;padding:10px 12px;background:#111;color:#dff;font:12px system-ui,sans-serif;border:1px solid #355;';
    status.textContent = 'WebGPU diagnostic booting';
    document.body.appendChild(status);

    const fail = (message) => {
        state.ok = false;
        state.error = message;
        status.textContent = `WebGPU diagnostic failed: ${message}`;
        return state;
    };

    if (!navigator.gpu) return fail('navigator.gpu is unavailable');

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return fail('requestAdapter returned null');

    let proofDevice = null;
    try {
        proofDevice = await adapter.requestDevice();
    } catch (err) {
        return fail(`requestDevice failed: ${String(err?.message || err)}`);
    } finally {
        proofDevice?.destroy?.();
    }

    const {
        WebGPURenderer,
        Scene,
        PerspectiveCamera,
        BoxGeometry,
        PlaneGeometry,
        RingGeometry,
        IcosahedronGeometry,
        Mesh,
        MeshBasicNodeMaterial,
        MeshLambertNodeMaterial,
        MeshStandardNodeMaterial,
        Color,
        Fog,
        AmbientLight,
        DirectionalLight,
        AdditiveBlending,
        DoubleSide,
        Group,
        Box3,
        InstancedMesh,
        Matrix4,
        Object3D,
        Vector3,
        TSL,
    } = await loadWebGpuThree();

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    await renderer.init();

    const scene = new Scene();
    const fogColor = new Color().setRGB(...skyFog.fogColor);
    scene.background = fogColor.clone();
    scene.fog = new Fog(fogColor, skyFog.fogNear, skyFog.fogFar);
    scene.add(new AmbientLight(0xffffff, 0.65));
    const keyLight = new DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(1.5, 2.2, 3.0);
    scene.add(keyLight);

    const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0.2, 3);

    const material = new MeshBasicNodeMaterial();
    material.colorNode = TSL.vec4(0.28, 0.78, 0.92, 1.0);

    const cube = new Mesh(new BoxGeometry(1, 1, 1), material);
    cube.position.x = 0.55;
    scene.add(cube);

    const rock = new Mesh(new IcosahedronGeometry(0.42, 2), new MeshStandardNodeMaterial());
    rock.position.set(1.45, 0.25, 0.05);
    rock.rotation.set(0.25, 0.45, 0.1);
    const rockReplacement = replaceRockMaterialsByTraversal(
        rock,
        () => createRockRimNodeMaterial({ MeshStandardNodeMaterial, TSL }, rockRim)
    );
    scene.add(rock);

    const skyFogBackdrop = new Mesh(
        new PlaneGeometry(7.5, 4.25, 1, 1),
        createSkyFogNodeMaterial({ MeshBasicNodeMaterial, TSL }, skyFog)
    );
    skyFogBackdrop.position.set(0, 0.05, -1.65);
    skyFogBackdrop.renderOrder = -10;
    scene.add(skyFogBackdrop);

    const sun = new Mesh(
        new PlaneGeometry(1.45, 1.45),
        createSunBillboardNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, TSL })
    );
    sun.position.set(-0.85, 0.35, 0.15);
    scene.add(sun);

    const treeGroup = new Group();
    const treeBranchSource = new MeshStandardNodeMaterial();
    treeBranchSource.name = 'branches';
    const treeBranchMesh = new Mesh(new BoxGeometry(0.1, 0.78, 0.1), treeBranchSource);
    treeBranchMesh.position.set(0, -0.14, -0.01);
    treeGroup.add(treeBranchMesh);

    const treeLeafSource = new MeshStandardNodeMaterial();
    treeLeafSource.name = 'leaves';
    const treeLeafMesh = new Mesh(new PlaneGeometry(0.72, 1.05, 5, 8), treeLeafSource);
    treeLeafMesh.position.set(0, 0.26, 0.02);
    treeLeafMesh.rotation.set(0.0, -0.18, -0.25);
    treeGroup.add(treeLeafMesh);
    const treeReplacement = replaceTreeMaterialsByName(treeGroup, {
        branches: () => createTreeBranchNodeMaterial({ MeshStandardNodeMaterial, TSL }),
        leaves: () => createTreeLeafNodeMaterial({ MeshStandardNodeMaterial, DoubleSide, TSL }, treeLeaf),
    });
    treeGroup.position.set(-1.55, 0.33, 0.18);
    scene.add(treeGroup);
    state.materialReplacement = {
        rocks: rockReplacement,
        trees: treeReplacement,
    };
    try {
        state.runtimeGlbReplacement = await createRuntimeGlbMaterialReplacementProof();
        if (!state.runtimeGlbReplacement.summary?.ok) {
            return fail('runtime GLB material proof failed');
        }
    } catch (err) {
        state.runtimeGlbReplacement = {
            ok: false,
            error: String(err?.message || err),
        };
        return fail(`runtime GLB material proof failed: ${state.runtimeGlbReplacement.error}`);
    }
    try {
        state.runtimeGlbPreview = await createRuntimeGlbPreview({
            scene,
            three: { Box3, InstancedMesh, Matrix4, Object3D, Vector3 },
            createTreeBranchMaterial: () => createTreeBranchNodeMaterial({ MeshStandardNodeMaterial, TSL }),
            createTreeLeafMaterial: () => createTreeLeafNodeMaterial({ MeshStandardNodeMaterial, DoubleSide, TSL }, treeLeaf),
            createRockMaterial: () => createRockRimNodeMaterial({ MeshStandardNodeMaterial, TSL }, rockRim),
        });
        if (!state.runtimeGlbPreview.ok) {
            return fail('runtime GLB rendered clone proof failed');
        }
        state.productionPlacementPreview = state.runtimeGlbPreview.productionPlacementPreview;
        state.productionInstancingPreview = state.runtimeGlbPreview.productionInstancingPreview;
        state.diagnosticRockPlacementPreview = state.runtimeGlbPreview.diagnosticRockPlacementPreview;
        state.diagnosticRockInstancingPreview = state.runtimeGlbPreview.diagnosticRockInstancingPreview;
    } catch (err) {
        state.runtimeGlbPreview = {
            ok: false,
            error: String(err?.message || err),
        };
        return fail(`runtime GLB rendered clone proof failed: ${state.runtimeGlbPreview.error}`);
    }

    const portal = new Mesh(
        new RingGeometry(0.62, 0.86, 80, 1),
        createPortalRingNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, DoubleSide, TSL })
    );
    portal.position.set(-0.85, -0.75, 0.12);
    scene.add(portal);

    const meadow = new Mesh(
        new PlaneGeometry(1.45, 0.8, 1, 1),
        createMeadowQuadNodeMaterial({ MeshLambertNodeMaterial, DoubleSide, TSL })
    );
    meadow.position.set(0.85, -0.75, 0.1);
    scene.add(meadow);

    const water = new Mesh(
        new PlaneGeometry(2.0, 0.62, 1, 1),
        createAnimeWaterNodeMaterial({ MeshBasicNodeMaterial, DoubleSide, TSL }, animeWater)
    );
    water.position.set(0.0, -1.16, 0.09);
    scene.add(water);

    const cloudPlane = new Mesh(
        new PlaneGeometry(2.4, 0.65, 1, 1),
        createCloudPlaneNodeMaterial({ MeshBasicNodeMaterial, DoubleSide, TSL })
    );
    cloudPlane.position.set(0.15, 1.05, 0.05);
    scene.add(cloudPlane);

    const resize = () => {
        const w = Math.max(1, window.innerWidth);
        const h = Math.max(1, window.innerHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
    };
    window.addEventListener('resize', resize);
    resize();

    let running = true;
    const render = async (t) => {
        if (!running) return;
        cube.rotation.x = t * 0.0006;
        cube.rotation.y = t * 0.0009;
        rock.rotation.y = 0.45 + t * 0.00035;
        treeGroup.rotation.z = Math.sin(t * 0.0012) * 0.035;
        await renderer.renderAsync(scene, camera);
        state.frames += 1;
        if (state.frames === 1) {
            state.ok = true;
            status.textContent = 'WebGPU diagnostic rendering';
        }
        requestAnimationFrame(render);
    };

    state.dispose = () => {
        running = false;
        window.removeEventListener('resize', resize);
        cube.geometry.dispose();
        material.dispose();
        rock.geometry.dispose();
        rock.material.dispose();
        skyFogBackdrop.geometry.dispose();
        skyFogBackdrop.material.dispose();
        portal.geometry.dispose();
        portal.material.dispose();
        meadow.geometry.dispose();
        meadow.material.dispose();
        water.geometry.dispose();
        water.material.dispose();
        cloudPlane.geometry.dispose();
        cloudPlane.material.dispose();
        renderer.dispose();
        sun.geometry.dispose();
        sun.material.dispose();
        treeGroup.traverse((child) => {
            if (!child.isMesh) return;
            child.geometry?.dispose();
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((m) => m?.dispose?.());
        });
        state.runtimeGlbPreview?.dispose?.();
        canvas.remove();
        status.remove();
    };

    requestAnimationFrame(render);
    return state;
}

export { bootWebGpuDiagnostic as boot };
