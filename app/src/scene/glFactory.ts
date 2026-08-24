// SPDX-License-Identifier: AGPL-3.0-or-later
// Memoized async WebGPURenderer factory (spec/01). Memoization is mandatory:
// R3F issue #3782 - a re-render can invoke the factory twice.
// The WebGL2 backend is forced via ?debug=webgl (one of the three sanctioned
// URL params); WebGPURenderer otherwise falls back automatically.
import * as THREE from 'three/webgpu';
import {
  chooseAutoTier,
  fallbackAutoTier,
  type AutoTierReceipt,
} from '@app/quality/autoTier';

export type GlProps = ConstructorParameters<typeof THREE.WebGPURenderer>[0];

let rendererPromise: Promise<THREE.WebGPURenderer> | null = null;
let activeRenderer: THREE.WebGPURenderer | null = null;

export type BackendName = 'pending' | 'webgpu' | 'webgl2';
export const AUTO_TIER_FILL_TIMEOUT_MS = 750;

let backendName: BackendName = 'pending';

export function debugFlags(): Set<string> {
  const raw = new URLSearchParams(window.location.search).get('debug') ?? '';
  return new Set(raw.split(',').filter(Boolean));
}

/**
 * Which of the two backends WebGPURenderer settled on, once it has. Read by the
 * debug readout so a probe can record the backend it actually exercised rather
 * than the one it asked for: `?debug=webgl` forces WebGL2, and WebGPU can also
 * fall back on its own.
 */
export function rendererBackendName(): BackendName {
  return backendName;
}

/** Read the backend brand directly when the cached debug name is unavailable. */
export function detectRendererBackend(
  renderer: THREE.WebGPURenderer,
): Exclude<BackendName, 'pending'> {
  const backend = renderer.backend as unknown as { isWebGPUBackend?: boolean };
  return backend.isWebGPUBackend === true ? 'webgpu' : 'webgl2';
}

/** Debug receipt only: Three's own draw count for the most recent frame. */
export function rendererDrawCalls(): number {
  return activeRenderer?.info.render.drawCalls ?? -1;
}

export interface RendererDiagnostics {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly lines: number;
  readonly points: number;
  readonly geometries: number;
  readonly textures: number;
}

/** Debug receipt only: a snapshot of Three's most recently completed frame. */
export function rendererDiagnostics(): RendererDiagnostics {
  const info = activeRenderer?.info;
  return {
    drawCalls: info?.render.drawCalls ?? -1,
    triangles: info?.render.triangles ?? -1,
    lines: info?.render.lines ?? -1,
    points: info?.render.points ?? -1,
    geometries: info?.memory.geometries ?? -1,
    textures: info?.memory.textures ?? -1,
  };
}

export async function measureRendererFill(
  renderer: THREE.WebGPURenderer,
  backend: Exclude<BackendName, 'pending'>,
  timeoutMs = AUTO_TIER_FILL_TIMEOUT_MS,
): Promise<AutoTierReceipt> {
  const deviceDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const dpr = Math.max(1, Math.min(3, deviceDpr));
  const side = Math.round(Math.min(1536, 512 * dpr));
  const target = new THREE.RenderTarget(side, side, { depthBuffer: false });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.MeshBasicNodeMaterial({ color: 0xffffff });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const previous = renderer.getRenderTarget();
  const fallback = fallbackAutoTier(backend);
  let timedOut = false;
  let cleaned = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    renderer.setRenderTarget(previous);
    // Timestamp queries exist only for this one boot decision. Leaving them on
    // allocates two queries per render pass and eventually exhausts Three's
    // pool during normal play, adding both overhead and a console warning.
    const rendererBackend = renderer.backend as unknown as { trackTimestamp: boolean };
    rendererBackend.trackTimestamp = false;
    target.dispose();
    geometry.dispose();
    material.dispose();
  };

  const measurement = (async () => {
    try {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      await renderer.resolveTimestampsAsync();
      if (timedOut) return fallback;
      // Submission-only timing made a 2880 x 1800 viewport appear faster than
      // 1440 x 900. Timestamp resolution waits for the pass through Three's
      // supported query pool without mapping the target texture. Direct texture
      // readback during async renderer creation left the later canvas transparent.
      let elapsed = 0;
      for (let pass = 0; pass < 4; pass++) {
        const started = performance.now();
        renderer.render(scene, camera);
        await renderer.resolveTimestampsAsync();
        if (timedOut) return fallback;
        elapsed += performance.now() - started;
      }
      return chooseAutoTier(backend, elapsed / 4, side * side);
    } finally {
      if (!timedOut) cleanup();
    }
  })();

  const timeout = new Promise<AutoTierReceipt>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      // Restore the canvas target before publishing the fallback. The pending
      // timestamp promise may resolve later, but its task sees timedOut and can
      // no longer render, publish a receipt, or touch disposed probe resources.
      try {
        cleanup();
      } catch (error: unknown) {
        console.error('renderer_fill_cleanup_failed', error);
      }
      resolve(fallback);
    }, Math.max(0, timeoutMs));
  });

  try {
    return await Promise.race([measurement, timeout]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

export function glFactory(props: GlProps): Promise<THREE.WebGPURenderer> {
  if (!rendererPromise) {
    const forceWebGL = debugFlags().has('webgl');
    rendererPromise = (async () => {
      const renderer = new THREE.WebGPURenderer({ ...props, forceWebGL, trackTimestamp: true });
      await renderer.init();
      // Authored toon ramps are already the lighting model. Neutral preserves
      // their hue/value relationships on both backends, including the low tier
      // where the optional post chain is intentionally absent.
      renderer.toneMapping = THREE.NeutralToneMapping;
      activeRenderer = renderer;
      // three tags its backends with a boolean brand; the published types
      // describe only the abstract Backend, so this is the narrow read.
      backendName = detectRendererBackend(renderer);
      return renderer;
    })();
  }
  return rendererPromise;
}
