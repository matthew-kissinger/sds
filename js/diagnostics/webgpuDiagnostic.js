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

export async function bootWebGpuDiagnostic() {
    const state = window.__sdsWebGpuDiagnostic = {
        ...(window.__sdsWebGpuDiagnostic || {}),
        requested: true,
        ok: false,
        renderer: 'webgpu',
        islands: ['sun-billboard', 'portal-ring', 'meadow-quad'],
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
        Mesh,
        MeshBasicNodeMaterial,
        MeshLambertNodeMaterial,
        Color,
        AmbientLight,
        DirectionalLight,
        AdditiveBlending,
        DoubleSide,
        TSL,
    } = await loadWebGpuThree();

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    await renderer.init();

    const scene = new Scene();
    scene.background = new Color(0x10202a);
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

    const sun = new Mesh(
        new PlaneGeometry(1.45, 1.45),
        createSunBillboardNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, TSL })
    );
    sun.position.set(-0.85, 0.35, 0.15);
    scene.add(sun);

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
        portal.geometry.dispose();
        portal.material.dispose();
        meadow.geometry.dispose();
        meadow.material.dispose();
        renderer.dispose();
        sun.geometry.dispose();
        sun.material.dispose();
        canvas.remove();
        status.remove();
    };

    requestAnimationFrame(render);
    return state;
}
