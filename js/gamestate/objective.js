// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 34 Phase 2: state machine promoted to `shared/objective.js` so
 * the Worker authoritative sim runs the byte-identical implementation
 * the client predictor runs. This file is a re-export shim — existing
 * `js/` callers keep importing from here unchanged.
 */
export { createObjective, refreshObjective, tickObjective, isCorralOpen } from '../../shared/objective.js';
