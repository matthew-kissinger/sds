// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 67 P1: the survival run economy was PROMOTED to
 * `shared/survival/run.js` so the Worker authoritative sim can run it for co-op
 * survival. This file is a re-export shim - existing `js/` callers keep importing
 * from here unchanged.
 */
export { SurvivalRun, SurvivalState } from '../../shared/survival/run.js';
