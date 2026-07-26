// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 67 P1: pen containment was PROMOTED to `shared/survival/pen.js` (with
 * the one Cycle 66 `Math.random` settle spot made a seeded draw) so the Worker
 * authoritative sim can run the pen barrier for co-op survival. This file is a
 * re-export shim - existing `js/` callers keep importing from here unchanged.
 *
 * It stays a pure shim. Cycle 116 Phase 4 briefly parked the cue's pen-crossing
 * observer here; Phase 5 moved it to `js/world/gateCue.js`, where the rest of
 * the cue's crossing bookkeeping already lives. It reads `pennedCount` and
 * nothing else, so it was never pen behaviour - and an import from the cue into
 * this shim made the pen module a shared dependency of two lazily loaded graphs
 * for the sake of six lines.
 */
export { PenContainment } from '../../shared/survival/pen.js';
