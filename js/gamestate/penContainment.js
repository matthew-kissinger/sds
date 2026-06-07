// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 67 P1: pen containment was PROMOTED to `shared/survival/pen.js` (with
 * the one Cycle 66 `Math.random` settle spot made a seeded draw) so the Worker
 * authoritative sim can run the pen barrier for co-op survival. This file is a
 * re-export shim - existing `js/` callers keep importing from here unchanged.
 */
export { PenContainment } from '../../shared/survival/pen.js';
