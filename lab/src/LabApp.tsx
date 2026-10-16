// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The lab shell: the game's renderer, the game's input, the game's components,
 * and a panel that is not allowed anywhere near `app/src`.
 *
 * `glFactory` is the game's own memoized WebGPURenderer factory, so the lab
 * exercises the same renderer and the same `?debug=webgl` fallback the player
 * gets. `IntentResolver` is the game's own input, so the dog answers the
 * keyboard here exactly as it does in the field.
 */

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { glFactory } from '@app/scene/glFactory';
import { IntentResolver } from '@app/input/IntentResolver';
import { renderDprForTier } from '@app/quality/autoTier';
import { useLabStore } from './labStore';
import { Counters } from './Counters';
import { LabCamera } from './LabCamera';
import { LabScene } from './LabScene';
import { Panel } from './Panel';
import { Treadmill } from './Treadmill';
import { ViewMode } from './ViewMode';

export function LabApp() {
  const quality = useLabStore((state) => state.quality);
  const view = useLabStore((state) => state.view);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        gl={glFactory as never}
        dpr={renderDprForTier(quality)}
        // `SceneReadySignal` owns the compile window imperatively: it pauses
        // the loop while `compileMountedScene` builds pipelines against the
        // post chain's render target, then resumes. This prop therefore stays
        // constant on purpose - a prop that changed mid-compile would reapply
        // `always` underneath it, and the ordinary loop would render into the
        // target the pipeline is still sampling, which WebGPU rejects as a
        // read and a write of `output` in one synchronisation scope.
        frameloop="always"
        camera={{ position: [-20, 12, -40], fov: 45, near: 0.5, far: 1200 }}
      >
        <IntentResolver />
        <LabCamera />
        <Counters />
        <Treadmill />
        <ViewMode mode={view} />
        <Suspense fallback={null}>
          <LabScene />
        </Suspense>
      </Canvas>
      <Panel />
    </div>
  );
}
