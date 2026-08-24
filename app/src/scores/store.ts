// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { create } from 'zustand';
import type { FlockSize } from '@app/state/store';
import type { LeaderboardEntry, ScoreIdentity } from './types';

export type IdentityStatus = 'idle' | 'connecting' | 'ready' | 'offline';
export type SubmissionStatus = 'idle' | 'submitting' | 'ready' | 'offline';
export type BoardStatus = 'idle' | 'loading' | 'ready' | 'offline';

export interface ScoreStore {
  readonly identityStatus: IdentityStatus;
  readonly identity: ScoreIdentity | null;
  readonly identityMessage: string;
  readonly renaming: boolean;
  readonly renameMessage: string;
  readonly submissionStatus: SubmissionStatus;
  readonly submittedFlockSize: FlockSize | null;
  readonly entries: readonly LeaderboardEntry[];
  readonly rank: number | null;
  readonly submissionMessage: string;
  readonly boardStatus: BoardStatus;
  readonly boardFlockSize: FlockSize;
  readonly boardEntries: readonly LeaderboardEntry[];
  readonly boardMessage: string;
  patch(patch: Partial<Omit<ScoreStore, 'patch'>>): void;
}
const INITIAL = {
  identityStatus: 'idle' as const,
  identity: null,
  identityMessage: '',
  renaming: false,
  renameMessage: '',
  submissionStatus: 'idle' as const,
  submittedFlockSize: null,
  entries: [] as readonly LeaderboardEntry[],
  rank: null,
  submissionMessage: '',
  boardStatus: 'idle' as const,
  boardFlockSize: 25 as FlockSize,
  boardEntries: [] as readonly LeaderboardEntry[],
  boardMessage: '',
};

export const useScoreStore = create<ScoreStore>()((set) => ({
  ...INITIAL,
  patch(patch) { set(patch); },
}));

export function resetScoreStore(): void {
  useScoreStore.setState(INITIAL);
}
