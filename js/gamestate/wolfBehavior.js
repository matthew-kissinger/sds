// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 67 P1: the pure wolf-AI helpers were PROMOTED to
 * `shared/survival/wolfBehavior.js` so the Worker authoritative sim can run the
 * wolf decision math for co-op survival. This file is a re-export shim - existing
 * `js/` callers keep importing from here unchanged.
 */
export { spawnCountForDay, nearestHuntableIndex, stepToward, stepAway } from '../../shared/survival/wolfBehavior.js';
