// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The lab shell: the game's renderer, the game's input, the game's components,
 * and a panel that is not allowed anywhere near `app/src`.
 *
 * `glFactory` is the game's own WebGPURenderer factory, so the lab exercises
 * the same renderer and the same `?debug=webgl` fallback the player gets. `IntentResolver` is the game's own input, so the dog answers the
 * keyboard here exactly as it does in the field.
 */

import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { glFactory, rendererReady } from '@app/scene/glFactory';
import { useGameStore } from '@app/state/store';
import { IntentResolver } from '@app/input/IntentResolver';
import { renderDprForTier } from '@app/quality/autoTier';
import { useLabStore } from './labStore';
import { Counters } from './Counters';
import { LabCamera } from './LabCamera';
import { LabScene } from './LabScene';
import { Panel } from './Panel';
import { Treadmill } from './Treadmill';
import { ViewMode } from './ViewMode';

// The lab boots the way the game does (App.tsx). The renderer is handed to
// fiber before `init()` resolves (see glFactory) and three throws on a render
// before init, so nothing mounts until rendererReady(). The loop stays paused
// (`frameloop="never"`) until the scene is ready: `SceneReadySignal`, mounted
// by the post chain, owns the compile window and requires that the host hold
// the loop paused while the field mounts, or the frames the mount queues run
// into the scene target while the compiler reads it (its doc comment has the
// mechanism). The lab used to mount with the loop running and showed exactly
// that WebGPU error once per boot (lab bisect, 2026-10-16,
// `docs/history/status-log.md`).
type LabStage = 'init' | 'scene';

export function LabApp() {
  const quality = useLabStore((state) => state.quality);
  const view = useLabStore((state) => state.view);
  const sceneReady = useGameStore((state) => state.sceneReady);
  const [stage, setStage] = useState<LabStage>('init');

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        gl={glFactory as never}
        dpr={renderDprForTier(quality)}
        // Both gates: the renderer must be initialised AND the scene ready. The
        // store outlives a hot reload of this tree, so sceneReady alone could be
        // true before the new renderer has finished init().
        frameloop={stage === 'scene' && sceneReady ? 'always' : 'never'}
        camera={{ position: [-20, 12, -40], fov: 45, near: 0.5, far: 1200 }}
        onCreated={() => {
          rendererReady().then(
            () => setStage('scene'),
            (error: unknown) => console.error('renderer_init_failed', error),
          );
        }}
      >
        {stage === 'scene' && (
          <>
            <IntentResolver />
            <LabCamera />
            <Counters />
            <Treadmill />
            <ViewMode mode={view} />
            <Suspense fallback={null}>
              <LabScene />
            </Suspense>
          </>
        )}
      </Canvas>
      <Panel />
    </div>
  );
}
