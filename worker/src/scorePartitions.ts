// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { getRankedCounts } from '../../shared/difficulty.js';
import { getSceneById } from '../../shared/scenes/index.js';

/**
 * Sheepdog Sim 3 reuses the existing score service without adding its clean-room
 * field to the version 2 scene registry. The score-only id keeps every version
 * 3 board disjoint while leaving version 2 simulation and scene definitions
 * untouched.
 */
export const V3_SCORE_SCENE_ID = 'field-v3';
export const V3_RANKED_COUNTS: readonly number[] = [25, 75, 200];

export function isKnownScoreScene(sceneId: string): boolean {
  return sceneId === V3_SCORE_SCENE_ID || getSceneById(sceneId) !== undefined;
}

export function rankedCountsForScoreScene(sceneId?: string | null): readonly number[] {
  if (sceneId === V3_SCORE_SCENE_ID) return V3_RANKED_COUNTS;
  return getRankedCounts(sceneId ? getSceneById(sceneId) : undefined);
}

export function scoreSceneAllowsSoloCount(sceneId: string | null | undefined, sheepCount: number): boolean {
  return rankedCountsForScoreScene(sceneId).includes(sheepCount);
}
