// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// /play/25, /play/75 and /play/200 start that flock. Any other path does
// not. This is not a query parameter.

import { FLOCK_SIZES, type FlockSize } from '@app/state/store';

export function flockSizeFromPath(pathname: string): FlockSize | null {
  const match = /^\/play\/(25|75|200)\/?$/.exec(pathname);
  if (!match) return null;
  const size = Number(match[1]);
  return FLOCK_SIZES.includes(size as FlockSize) ? size as FlockSize : null;
}
