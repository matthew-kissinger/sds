// SPDX-License-Identifier: AGPL-3.0-or-later
import { createRoot } from 'react-dom/client';
import { useGameStore } from '@app/state/store';
import { LabApp } from './LabApp';
import { useLabStore } from './labStore';

// Settle the tier BEFORE the first render, which is not a detail.
//
// `resolvedRenderTier` returns the preference whenever it is not `auto`, so
// this alone decides which post chain `PostProcessing` mounts. Setting it from
// an effect instead meant the low chain mounted first and the high chain
// replaced it a moment later, which unmounted the first `SceneReadySignal`
// mid-compile: its cleanup cancelled the frames that publish readiness, the
// loop never resumed, and the canvas stayed black with the renderer alive and
// zero draw calls.
useGameStore.getState().setQuality(useLabStore.getState().quality);

const host = document.getElementById('lab');
if (host === null) throw new Error('lab root missing');
createRoot(host).render(<LabApp />);
