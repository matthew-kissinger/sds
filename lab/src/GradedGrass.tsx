// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The game's grass, wearing whichever grading the panel has selected.
 *
 * This is the whole of the lab's grading mechanism, and it is deliberately
 * four lines of body. It is NOT a second grass: `GrassField` is the shipped
 * component, mounted as the game mounts it, and the only thing this adds is a
 * prop the game leaves at its default. Anything larger here would be the
 * parallel implementation the lab exists to avoid.
 *
 * Flipping rebuilds the tiers, decode included, which takes a moment on a
 * cold tier. That cost is the lab's alone - a shipped page never changes the
 * grading, so the memo never re-runs there.
 */

import { GrassField } from '@app/scene/GrassField';
import { useLabStore } from './labStore';
import { grading } from './grassGradings';

export function GradedGrass() {
  const id = useLabStore((state) => state.grading);
  return <GrassField style={grading(id).style} />;
}
