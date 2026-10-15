// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The scene, assembled from the game's own components.
 *
 * This mirrors `FieldScene` deliberately: same frame loop, same components, in
 * the same draw order, with the list shortened to the subject under review. If
 * something looks right here and wrong in the game, the difference is the list,
 * the camera or the light - never a second implementation of the asset.
 *
 * `Atmosphere` is mounted only in the lit view, because it owns the sky dome,
 * the fog and the post chain. The analysis views want a flat field behind the
 * subject and no bloom sitting on top of it.
 */

import { useEffect } from 'react';
import { useGameLoop } from '@app/game/useGameLoop';
import { Atmosphere } from '@app/scene/Atmosphere';
import { preloadFieldSceneAssets } from '@app/scene/FieldScene';
import { useGameStore } from '@app/state/store';
import { useLabStore } from './labStore';
import { GROUND_PARTS, LAB_PARTS, labSubject } from './subjects';

/** Flat backgrounds for the analysis views: black reads on bone, not on sky. */
const SILHOUETTE_BACKGROUND = '#f2ece0';
const ANALYSIS_BACKGROUND = '#14181b';

export function LabScene() {
  const subject = useLabStore((state) => state.subject);
  const view = useLabStore((state) => state.view);
  const quality = useLabStore((state) => state.quality);
  const flockSize = useLabStore((state) => state.flockSize);
  const ground = useLabStore((state) => state.ground);

  preloadFieldSceneAssets();
  useGameLoop();

  // The lab DECLARES its tier rather than measuring one: reviewing at a chosen
  // tier is the point, and a fill measurement taken on a loaded workstation
  // would be a fiction either way. `main.tsx` sets the first one before the
  // first render; this only follows the panel afterwards.
  useEffect(() => {
    useGameStore.getState().setQuality(quality);
  }, [quality]);

  // A run has to be live for the simulation to advance: at the title the field
  // keeps only its presentation motion and the sim holds at tick zero.
  useEffect(() => {
    useGameStore.getState().startGame(flockSize);
  }, [flockSize]);

  const subjectParts = labSubject(subject).parts;
  const parts = ground
    ? subjectParts
    : subjectParts.filter((id) => !GROUND_PARTS.includes(id));

  return (
    <>
      {view === 'lit' ? <Atmosphere /> : (
        <color
          attach="background"
          args={[view === 'silhouette' ? SILHOUETTE_BACKGROUND : ANALYSIS_BACKGROUND]}
        />
      )}
      {parts.map((id) => {
        const Part = LAB_PARTS[id];
        return <Part key={id} />;
      })}
    </>
  );
}
