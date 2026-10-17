// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { KilnFence as GameFence } from '@app/scene/FenceLine';
import { useLabStore } from './labStore';

export function KilnFence() {
  const closed = useLabStore(state => state.fenceClosed);
  return <GameFence closed={closed} />;
}
