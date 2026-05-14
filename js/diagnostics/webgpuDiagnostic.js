async function loadWebGpuThree() {
    const webGpuModulePath = './vendor/three/three.webgpu.min.js';
    return import(/* @vite-ignore */ new URL(webGpuModulePath, import.meta.url).href);
}

export async function bootWebGpuDiagnostic() {
    const state = window.__sdsWebGpuDiagnostic = {
        ...(window.__sdsWebGpuDiagnostic || {}),
        requested: true,
        ok: false,
        renderer: 'webgpu',
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
        Mesh,
        MeshBasicNodeMaterial,
        Color,
        TSL,
    } = await loadWebGpuThree();

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    await renderer.init();

    const scene = new Scene();
    scene.background = new Color(0x10202a);

    const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0.2, 3);

    const material = new MeshBasicNodeMaterial();
    material.colorNode = TSL.vec4(0.28, 0.78, 0.92, 1.0);

    const cube = new Mesh(new BoxGeometry(1, 1, 1), material);
    scene.add(cube);

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
        renderer.dispose();
        canvas.remove();
        status.remove();
    };

    requestAnimationFrame(render);
    return state;
}
