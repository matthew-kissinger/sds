// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useEffect } from 'react';
import { scoresController } from './controller';

export function ScoresRoot() {
  useEffect(() => scoresController.start(), []);
  return null;
}
