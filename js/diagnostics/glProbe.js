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
 * texture.
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

const GL_ERROR_NAMES = {
    0x0500: 'INVALID_ENUM',
    0x0501: 'INVALID_VALUE',
    0x0502: 'INVALID_OPERATION',
    0x0503: 'STACK_OVERFLOW',
    0x0504: 'STACK_UNDERFLOW',
    0x0505: 'OUT_OF_MEMORY',
    0x0506: 'INVALID_FRAMEBUFFER_OPERATION',
    0x0507: 'CONTEXT_LOST_WEBGL',
};

const FOAM_WHITE_RGB = [0xea, 0xf6, 0xff];

function averageRgb(samples) {
    if (samples.length === 0) return null;
    return samples
        .reduce((acc, s) => [acc[0] + s[0], acc[1] + s[1], acc[2] + s[2]], [0, 0, 0])
        .map((v) => Math.round(v / samples.length));
}

function isNearFoamWhite(rgb, tolerance = 14) {
    return !!rgb && FOAM_WHITE_RGB.every((channel, index) => Math.abs(rgb[index] - channel) <= tolerance);
}

/**
 * Pull any pending WebGL errors. Errors from previous frames are sticky
 * until consumed; calling this once per second is enough. Each unique
 * error code is logged once per session to avoid event-stream spam.
 */
export function drainGlErrors(renderer) {
    if (!installed) return;
    try {
        const gl = renderer?.getContext?.();
        if (!gl) return;
        const seen = window.__sdsDiag.glErrorsSeen = window.__sdsDiag.glErrorsSeen || {};
        let code;
        let pulled = 0;
        // Bound the loop so a runaway driver doesn't lock up the probe.
        while ((code = gl.getError()) !== gl.NO_ERROR && pulled < 8) {
            pulled += 1;
            const name = GL_ERROR_NAMES[code] || `0x${code.toString(16)}`;
            if (!seen[name]) {
                seen[name] = true;
                log('gl.error', { code, name });
            }
        }
    } catch (err) {
        log('gl.error.probe', { error: String(err?.message || err) });
    }
}

/**
 * Sample N points from the canvas after the first frame. If they all read
 * close to white (or close to black), we're in the failure-mode the user
 * reported — flag it.
 *
 * Sample positions are described in *screen coordinates* (top-left origin)
 * and converted to GL coordinates (bottom-left origin) before readPixels.
 * The earlier version skipped the flip and sampled sky pixels instead of
 * ground, producing a misleading `near-white` flag on Field's pastoral-noon
 * sky preset. Each sample is also tagged with a region label so the dump
 * is readable without re-deriving the geometry.
 *
 * `label` lets callers distinguish samples taken at different game-state
 * points (e.g., 'startScreen' vs 'inGame'); the latest sample is also
 * mirrored to `window.__sdsDiag.framebufferSample` for back-compat.
 */
export function captureFramebufferSample(renderer, label = 'default') {
    if (!installed) return;
    try {
        const canvas = renderer.domElement;
        const gl = renderer.getContext();
        if (!gl || !canvas) return;
        const w = canvas.width;
        const h = canvas.height;
        if (!w || !h) return;

        // Screen-coords (0=top, 1=bottom). Picked to land on what *should*
        // be the visible ground / horizon for the bug we're hunting.
        const screenPoints = [
            { region: 'sky-upper',     x: 0.50, y: 0.18 },
            { region: 'horizon',       x: 0.50, y: 0.45 },
            { region: 'mid-ground',    x: 0.50, y: 0.65 },
            { region: 'near-ground',   x: 0.50, y: 0.85 },
            { region: 'left-ground',   x: 0.18, y: 0.80 },
            { region: 'right-ground',  x: 0.82, y: 0.80 },
        ];

        const px = new Uint8Array(4);
        const samples = screenPoints.map(({ region, x, y }) => {
            const pxX = Math.floor(w * x);
            // GL coords: bottom-left origin. Screen y=0 is canvas top, which
            // is GL y = h-1.
            const pxY = Math.floor(h * (1 - y));
            try {
                gl.readPixels(pxX, pxY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
                return { region, x: pxX, y: pxY, rgba: [px[0], px[1], px[2], px[3]] };
            } catch (err) {
                return { region, x: pxX, y: pxY, error: String(err?.message || err) };
            }
        });

        // Aggregate "ground" samples (everything below the horizon row) for
        // the white-ground heuristic; sky pixels are excluded so a bright
        // sky no longer triggers a false `near-white`.
        const groundSamples = samples
            .filter((s) => s.rgba && /ground/.test(s.region))
            .map((s) => s.rgba);
        const avg = groundSamples.length === 0
            ? null
            : averageRgb(groundSamples);
        const isNearWhite = avg && avg.every((c) => c >= 230);
        const isNearBlack = avg && avg.every((c) => c <= 16);
        const flag = isNearWhite ? 'near-white' : isNearBlack ? 'near-black' : 'ok';
        const entry = { label, samples, avg, flag };
        window.__sdsDiag.framebufferSample = entry;
        window.__sdsDiag.framebufferSamples = window.__sdsDiag.framebufferSamples || [];
        window.__sdsDiag.framebufferSamples.push(entry);
        log('framebuffer.sampled', { label, avg, flag });
        return entry;
    } catch (err) {
        log('framebuffer.error', { error: String(err?.message || err) });
        return null;
    }
}

export function captureWaterSample(renderer, label = 'water') {
    if (!installed) return null;
    try {
        const canvas = renderer.domElement;
        const gl = renderer.getContext();
        if (!gl || !canvas) return null;
        const w = canvas.width;
        const h = canvas.height;
        if (!w || !h) return null;

        const screenPoints = [
            { region: 'water-center-lower', x: 0.50, y: 0.70 },
            { region: 'water-center-near', x: 0.50, y: 0.82 },
            { region: 'water-left-near', x: 0.34, y: 0.78 },
            { region: 'water-right-near', x: 0.66, y: 0.78 },
        ];

        const px = new Uint8Array(4);
        const samples = screenPoints.map(({ region, x, y }) => {
            const pxX = Math.floor(w * x);
            const pxY = Math.floor(h * (1 - y));
            try {
                gl.readPixels(pxX, pxY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
                return { region, x: pxX, y: pxY, rgba: [px[0], px[1], px[2], px[3]] };
            } catch (err) {
                return { region, x: pxX, y: pxY, error: String(err?.message || err) };
            }
        });

        const waterPixels = samples
            .filter((s) => s.rgba)
            .map((s) => s.rgba);
        const avg = averageRgb(waterPixels);
        const entry = {
            label,
            samples,
            avg,
            nearFoamWhite: isNearFoamWhite(avg),
            foamWhiteRgb: FOAM_WHITE_RGB,
        };
        window.__sdsDiag.waterSample = entry;
        window.__sdsDiag.waterSamples = window.__sdsDiag.waterSamples || [];
        window.__sdsDiag.waterSamples.push(entry);
        log('water.sampled', { label, avg, nearFoamWhite: entry.nearFoamWhite });
        return entry;
    } catch (err) {
        log('water.error', { error: String(err?.message || err) });
        return null;
    }
}
