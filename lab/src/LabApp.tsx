// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The lab shell: the game's renderer, the game's input, the game's components,
 * and a panel that is not allowed anywhere near `app/src`.
 *
 * `glFactory` is the game's own WebGPURenderer factory, so the lab exercises
 * the same renderer and the same `?debug=webgl` fallback the player gets. `IntentResolver` is the game's own input, so the dog answers the
 * keyboard here exactly as it does in the field.
 */

import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { glFactory, rendererReady } from '@app/scene/glFactory';
import { IntentResolver } from '@app/input/IntentResolver';
import { renderDprForTier } from '@app/quality/autoTier';
import { useLabStore } from './labStore';
import { Counters } from './Counters';
import { LabCamera } from './LabCamera';
import { LabScene } from './LabScene';
import { Panel } from './Panel';
import { Treadmill } from './Treadmill';
import { ViewMode } from './ViewMode';

// The renderer is handed to fiber before `init()` resolves (see glFactory),
// and three throws on a render before init. The game pauses its loop until the
// scene is ready; the lab has no such gate, so it stages its own:
//   'init'  - loop paused, nothing mounted, waiting on rendererReady()
//   'loop'  - loop running on an initialised renderer, scene not yet mounted
//   'scene' - the scene mounts one commit later
// The extra commit matters. `SceneReadySignal` (mounted by the post chain)
// owns the compile window imperatively: it pauses the loop while
// `compileMountedScene` builds pipelines against the post chain's render
// target, then resumes. The `frameloop` prop must therefore be settled on
// `always` before that signal can mount - a prop change in the same commit
// could reapply `always` underneath its pause, and the ordinary loop would
// render into the target the pipeline is still sampling, which WebGPU rejects
// as a read and a write of `output` in one synchronisation scope.
type LabStage = 'init' | 'loop' | 'scene';

export function LabApp() {
  const quality = useLabStore((state) => state.quality);
  const view = useLabStore((state) => state.view);
  const [stage, setStage] = useState<LabStage>('init');
  useEffect(() => {
    if (stage === 'loop') setStage('scene');
  }, [stage]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        gl={glFactory as never}
        dpr={renderDprForTier(quality)}
        frameloop={stage === 'init' ? 'never' : 'always'}
        camera={{ position: [-20, 12, -40], fov: 45, near: 0.5, far: 1200 }}
        onCreated={() => {
          rendererReady().then(
            () => setStage('loop'),
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
