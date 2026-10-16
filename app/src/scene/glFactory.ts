// SPDX-License-Identifier: AGPL-3.0-or-later
// WebGPURenderer factory (spec/01). Not memoized: @react-three/fiber 9.8 calls
// the `gl` factory once per root and owns the renderer it returns, so a memo
// would hand a remounting root (the asset lab, hot reload) a renderer fiber
// has already disposed, bound to the old canvas. The memo's reason, fiber
// issue #3782, no longer applies.
// The WebGL2 backend is forced via ?debug=webgl (one of the three sanctioned
// URL params); WebGPURenderer otherwise falls back automatically.
import * as THREE from 'three/webgpu';
import { useGameStore } from '@app/state/store';
import {
  chooseAutoTier,
  fallbackAutoTier,
  type AutoTierReceipt,
} from '@app/quality/autoTier';

export type GlProps = ConstructorParameters<typeof THREE.WebGPURenderer>[0];

let rendererInit: Promise<THREE.WebGPURenderer> | null = null;
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

// Synchronous on purpose. @react-three/fiber 9.8 gates a Canvas whose `gl`
// factory returns a promise behind a Suspense boundary until the promise
// settles, and React's fallback throttle then holds the resolved commit back
// until 300 ms have passed since the fallback was shown. Measured on the hub
// against 3.1.0: +300 ms from renderer to capability on WebGL2, +150 ms on
// WebGPU, where the backend's own init absorbed the rest. Returning the
// renderer before `init()` resolves keeps the mount synchronous.
// `rendererReady()` is the promise the capability probe awaits before anything
// is drawn, and nothing renders before then because the frame loop is paused
// until the scene is ready. Three throws on a render before init, so that
// pause is load-bearing.
export function glFactory(props: GlProps): THREE.WebGPURenderer {
  const forceWebGL = debugFlags().has('webgl');
  const created = new THREE.WebGPURenderer({ ...props, forceWebGL, trackTimestamp: true });
  const onDeviceLost = created.onDeviceLost.bind(created);
  created.onDeviceLost = (info) => {
    // Preserve Three's lost-device bookkeeping on both backends, then stop
    // the game even if the renderer's diagnostic callback itself fails.
    try { onDeviceLost(info); }
    finally { useGameStore.getState().reportGraphicsLost(); }
  };
  // Tone mapping is fiber's: its first configure sets ACESFilmicToneMapping
  // when `gl` is a factory and `flat` is false. The factory used to set
  // NeutralToneMapping here and fiber overwrote it, so the approved look has
  // been ACES since 3.1.0; the owner chose on 2026-10-16 to keep that look and
  // have the code say so (docs/history/renderer-boot-review-2026-10-16.md).
  // Nothing sets toneMapping anywhere else; `flat` on the Canvas would switch
  // it off, and a different operator belongs in onCreated, after configure.
  backendName = 'pending';
  activeRenderer = null;
  rendererInit = created.init().then(() => {
    activeRenderer = created;
    // three tags its backends with a boolean brand; the published types
    // describe only the abstract Backend, so this is the narrow read.
    backendName = detectRendererBackend(created);
    return created;
  });
  // The capability probe consumes a rejection. This keeps it from surfacing
  // as an unhandled rejection should the probe never mount.
  rendererInit.catch(() => undefined);
  return created;
}

/**
 * Settles once the backend is initialised and the backend name is published.
 * Rejects when the renderer could not start, which the capability probe turns
 * into the graphics-lost screen.
 */
export function rendererReady(): Promise<THREE.WebGPURenderer> {
  if (rendererInit === null) throw new Error('glFactory has not created the renderer');
  return rendererInit;
}
