/**
 * Cycle 9 Phase 4 — GL diagnostic probe.
 *
 * Behind the `?debug=gl` URL flag, captures a snapshot of the WebGL
 * environment + post-first-frame state into `window.__sdsDiag`. The
 * macOS Safari smoke runner reads this JSON; humans can read it from
 * devtools console.
 *
 * Goals:
 *   - Surface WebGL extension support gaps (esp. on Safari/Metal).
 *   - Detect the "ground rendered white" failure mode by sampling the
 *     terrain's framebuffer post-first-frame and flagging when the
 *     reads look uniform.
 *   - Capture renderer info so we can correlate failures with vendor
 *     (Apple / NVIDIA / Intel) and the underlying driver.
 *
 * This module is no-op unless `?debug=gl` is present; it never affects
 * the rendering path.
 */

const FLAG_PARAM = 'debug';
const FLAG_VALUE = 'gl';

let installed = false;

export function isProbeEnabled() {
    if (typeof location === 'undefined') return false;
    try {
        return new URLSearchParams(location.search).get(FLAG_PARAM) === FLAG_VALUE;
    } catch {
        return false;
    }
}

export function initGlProbe() {
    if (installed || !isProbeEnabled()) return;
    installed = true;
    if (typeof window === 'undefined') return;

    window.__sdsDiag = window.__sdsDiag || {
        startedAt: new Date().toISOString(),
        events: [],
    };
    log('probe.installed', { url: location.href, ua: navigator.userAgent });
}

export function log(event, data = {}) {
    if (!installed || typeof window === 'undefined') return;
    if (!window.__sdsDiag) return;
    window.__sdsDiag.events.push({
        t: Date.now(),
        event,
        ...data,
    });
}

/**
 * Snapshot the WebGL context — vendor, renderer, extension list, key
 * parameters. Call once after the WebGLRenderer is created.
 */
export function captureContext(renderer) {
    if (!installed) return;
    try {
        const gl = renderer?.getContext?.();
        if (!gl) {
            log('context.unavailable');
            return;
        }
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        const snapshot = {
            isWebGL2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
            vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
            renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
            version: gl.getParameter(gl.VERSION),
            shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
            extensions: gl.getSupportedExtensions(),
            maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
            maxVertexUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
            maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS),
            outputColorSpace: renderer.outputColorSpace,
            toneMapping: renderer.toneMapping,
            toneMappingExposure: renderer.toneMappingExposure,
        };
        window.__sdsDiag.context = snapshot;
        log('context.captured', { vendor: snapshot.vendor, renderer: snapshot.renderer });
    } catch (err) {
        log('context.error', { error: String(err?.message || err) });
    }
}

/**
 * Note when a render-target allocation fails or returns an unexpected
 * texture. Called from DepthPrePass / water init paths.
 */
export function reportRenderTarget(name, target, error) {
    if (!installed) return;
    if (error) {
        log(`renderTarget.${name}.error`, { error: String(error?.message || error) });
        return;
    }
    log(`renderTarget.${name}`, {
        width: target?.width,
        height: target?.height,
        depthTexture: !!target?.depthTexture,
    });
}

/**
 * Note shader compile/link results.
 */
export function reportShader(name, ok, info) {
    if (!installed) return;
    log(`shader.${name}`, { ok, info });
}

/**
 * Sample N points from the canvas after the first frame. If they all read
 * close to white (or close to black), we're in the failure-mode the user
 * reported — flag it.
 */
export function captureFramebufferSample(renderer) {
    if (!installed) return;
    try {
        const canvas = renderer.domElement;
        const gl = renderer.getContext();
        if (!gl || !canvas) return;
        const w = canvas.width;
        const h = canvas.height;
        if (!w || !h) return;
        const samplePoints = [
            [Math.floor(w * 0.25), Math.floor(h * 0.25)],
            [Math.floor(w * 0.5),  Math.floor(h * 0.6)],
            [Math.floor(w * 0.75), Math.floor(h * 0.75)],
            [Math.floor(w * 0.5),  Math.floor(h * 0.85)],
        ];
        const px = new Uint8Array(4);
        const samples = samplePoints.map(([x, y]) => {
            try {
                gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
                return [px[0], px[1], px[2], px[3]];
            } catch (err) {
                return { error: String(err?.message || err) };
            }
        });
        const validSamples = samples.filter((s) => Array.isArray(s));
        const avg = validSamples.length === 0
            ? null
            : validSamples.reduce((acc, s) => [acc[0] + s[0], acc[1] + s[1], acc[2] + s[2]], [0, 0, 0])
                .map((v) => Math.round(v / validSamples.length));
        const isNearWhite = avg && avg.every((c) => c >= 230);
        const isNearBlack = avg && avg.every((c) => c <= 16);
        const flag = isNearWhite ? 'near-white' : isNearBlack ? 'near-black' : 'ok';
        window.__sdsDiag.framebufferSample = { samples, avg, flag };
        log('framebuffer.sampled', { avg, flag });
    } catch (err) {
        log('framebuffer.error', { error: String(err?.message || err) });
    }
}
